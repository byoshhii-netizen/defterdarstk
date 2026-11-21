'use strict';
const { db } = require('../lib/db');
const g = require('../lib/guvenlik');
const { hata } = require('../lib/http');
const O = require('../lib/oturum');
const M = require('../moduller');
const { hesapVarsayilanlari } = require('./ortak');

function tanimlar() {
  // Fonksiyonlar istemciye gönderilmez
  const kayit = {};
  for (const [k, v] of Object.entries(M.KAYIT_MODULLERI)) {
    kayit[k] = { tekil: v.tekil, baslik: v.baslik, alanlar: v.alanlar, ozet: v.ozet, otoNo: v.otoNo, yazdir: v.yazdir, kasa: !!v.kasa };
  }
  const moduller = {};
  M.MODULLER.forEach(m => { moduller[m.anahtar] = { ad: m.ad, ikon: m.ikon, rota: m.rota, grup: m.grup, genel: !!m.genel }; });
  return { kayit, moduller, hesapTurleri: M.HESAP_TURLERI };
}

function kullanimHaritasi(hesapId, kullaniciId) {
  const satirlar = db().prepare('SELECT modul, sayi, son FROM modul_kullanim WHERE hesap_id=? AND kullanici_id=?').all(hesapId, kullaniciId);
  const h = {};
  satirlar.forEach(s => { h[s.modul] = M.sonumlenmis(s.sayi, s.son); });
  return h;
}

function menuHesapla(req) {
  const hesap = db().prepare('SELECT * FROM hesaplar WHERE id=?').get(req.hesapId);
  let devreDisi = [];
  try { devreDisi = JSON.parse(O.ayar('devre_disi_moduller', '[]')); } catch (e) { /* */ }
  return M.menuOlustur({ hesap, rol: req.kullanici.rol, kullanim: kullanimHaritasi(req.hesapId, req.kullanici.id), devreDisi });
}

module.exports = function (app) {
  const r = app.yonlendirici('/api/hesap');

  r.get('/genel', () => ({
    kayit_acik: O.ayar('kayit_acik', '1') === '1',
    site_adi: O.ayar('site_adi', 'Defterdar'),
    sistem_modu: O.ayar('sistem_modu', 'acik'),
    sistem_notu: O.ayar('sistem_modu', 'acik') !== 'acik' ? O.ayar('sistem_notu', '') : '',
    hesap_turleri: M.HESAP_TURLERI,
  }));

  r.post('/kayit', (req, res) => {
    if (O.ayar('kayit_acik', '1') !== '1') throw hata(403, 'Yeni hesap açılışı şu anda kapalı');
    if (O.ayar('sistem_modu', 'acik') !== 'acik') throw hata(503, 'Sistem bakımda, kısa süre sonra tekrar deneyin');
    const hs = g.hizSinir('kayit:' + req.ip, 5, 3600000);
    if (!hs.izin) throw hata(429, 'Çok fazla kayıt denemesi. Bir saat sonra tekrar deneyin.');
    const b = req.body;
    const hesapAd = g.metin(b.hesap_ad, 150);
    const tur = M.HESAP_TURLERI[b.tur] ? b.tur : null;
    const adSoyad = g.metin(b.ad_soyad, 100);
    const eposta = g.eposta(b.eposta);
    if (!hesapAd || !tur || !adSoyad || !eposta) throw hata(400, 'Kurum adı, hesap türü, ad soyad ve geçerli bir e-posta zorunlu');
    const zayif = g.sifreGuclu(b.sifre);
    if (zayif) throw hata(400, zayif);
    if (!b.sozlesme) throw hata(400, 'Kullanım koşullarını ve KVKK aydınlatma metnini onaylamanız gerekiyor');
    if (db().prepare('SELECT id FROM kullanicilar WHERE eposta=?').get(eposta)) throw hata(409, 'Bu e-posta ile kayıtlı bir hesap var. Giriş yapmayı deneyin.');

    const gecerli = new Set(M.HESAP_TURLERI[tur].faaliyetler.map(f => f[0]));
    let faaliyetler = Array.isArray(b.faaliyetler) ? b.faaliyetler.filter(f => gecerli.has(f)) : [];
    if (!faaliyetler.length) faaliyetler = M.HESAP_TURLERI[tur].varsayilan;
    const profil = { faaliyetler, olcek: g.metin(b.olcek, 30), kdv_mukellefi: !!b.kdv_mukellefi };

    const hash = g.sifreOzetle(b.sifre);
    const sonuc = db().islem(() => {
      const h = db().prepare('INSERT INTO hesaplar (ad, tur, alt_tur, telefon, eposta, il, profil_json) VALUES (?,?,?,?,?,?,?)')
        .run(hesapAd, tur, g.metin(b.alt_tur, 60), g.metin(b.telefon, 30), eposta, g.metin(b.il, 40), JSON.stringify(profil));
      const k = db().prepare("INSERT INTO kullanicilar (hesap_id, ad_soyad, eposta, telefon, sifre_hash, rol, sifre_degisim) VALUES (?,?,?,?,?, 'sahip', datetime('now'))")
        .run(h.lastInsertRowid, adSoyad, eposta, g.metin(b.telefon, 30), hash);
      hesapVarsayilanlari(h.lastInsertRowid, tur);
      return { hesapId: h.lastInsertRowid, kullaniciId: k.lastInsertRowid };
    });
    req.hesapId = sonuc.hesapId;
    req.kullanici = { id: sonuc.kullaniciId, ad_soyad: adSoyad };
    O.denetimYaz(req, 'Hesap oluşturuldu', 'hesap', { tur, faaliyetler });
    O.girisKaydi(req, 'kullanici', eposta, true, 'kayıt');
    O.oturumAc(req, res, { tip: 'kullanici', sahipId: sonuc.kullaniciId, hesapId: sonuc.hesapId });
    return { ok: true };
  });

  r.post('/giris', (req, res) => {
    if (O.ipEngelliMi(req.ip)) throw hata(403, 'Bu IP adresinden giriş engellendi');
    const hs = g.hizSinir('giris:' + req.ip, 20, 15 * 60000);
    if (!hs.izin) throw hata(429, 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.');
    const eposta = g.eposta(req.body.eposta);
    const sifre = String(req.body.sifre || '');
    if (!eposta || !sifre) throw hata(400, 'E-posta ve şifre gerekli');
    const k = db().prepare('SELECT * FROM kullanicilar WHERE eposta=?').get(eposta);
    if (k && k.kilit_bitis > Date.now()) {
      O.girisKaydi(req, 'kullanici', eposta, false, 'kilitli');
      const dk = Math.ceil((k.kilit_bitis - Date.now()) / 60000);
      throw hata(423, `Çok sayıda hatalı deneme nedeniyle hesap ${dk} dakika kilitlendi`);
    }
    const dogru = g.sifreDogrula(sifre, k ? k.sifre_hash : null);
    if (!k || !dogru) {
      if (k) {
        const n = (k.basarisiz_deneme || 0) + 1;
        db().prepare('UPDATE kullanicilar SET basarisiz_deneme=?, kilit_bitis=? WHERE id=?').run(n >= 5 ? 0 : n, n >= 5 ? Date.now() + 15 * 60000 : 0, k.id);
      }
      O.girisKaydi(req, 'kullanici', eposta, false, 'hatalı şifre');
      throw hata(401, 'E-posta veya şifre hatalı');
    }
    if (k.durum !== 'aktif') { O.girisKaydi(req, 'kullanici', eposta, false, 'pasif'); throw hata(403, 'Kullanıcı hesabınız pasif durumda'); }
    const hesap = db().prepare('SELECT durum FROM hesaplar WHERE id=?').get(k.hesap_id);
    if (!hesap || hesap.durum !== 'aktif') throw hata(403, 'Kurum hesabınız askıya alınmış. Destek için yöneticiyle iletişime geçin.');
    db().prepare("UPDATE kullanicilar SET basarisiz_deneme=0, kilit_bitis=0, son_giris=datetime('now') WHERE id=?").run(k.id);
    O.girisKaydi(req, 'kullanici', eposta, true);
    req.hesapId = k.hesap_id; req.kullanici = k;
    O.denetimYaz(req, 'Giriş yapıldı', 'oturum');
    O.oturumAc(req, res, { tip: 'kullanici', sahipId: k.id, hesapId: k.hesap_id, beniHatirla: !!req.body.beni_hatirla });
    return { ok: true };
  });

  r.post('/cikis', (req, res) => { O.oturumKapat(req, res, 'kullanici'); return { ok: true }; });

  // Uygulama açılış verisi
  r.get('/oturum', (req) => {
    O.kullaniciGerekli(req);
    const hesap = db().prepare('SELECT id, ad, tur, alt_tur, vergi_no, vergi_dairesi, telefon, eposta, adres, il, web, para_birimi, profil_json, moduller_json, (logo_data IS NOT NULL) AS logo_var FROM hesaplar WHERE id=?').get(req.hesapId);
    const duyurular = db().prepare(`SELECT id, baslik, icerik, seviye FROM duyurular WHERE aktif=1
      AND (hedef_tur='hepsi' OR hedef_tur=?) AND (baslangic IS NULL OR baslangic<=date('now')) AND (bitis IS NULL OR bitis>=date('now'))
      ORDER BY id DESC LIMIT 5`).all(hesap.tur);
    const destekYeni = db().prepare('SELECT COUNT(*) AS c FROM destek_talepleri WHERE hesap_id=? AND kullanici_okundu=0').get(req.hesapId).c;
    let profil = {}; try { profil = JSON.parse(hesap.profil_json || '{}'); } catch (e) { /* */ }
    delete hesap.profil_json;
    return {
      csrf: req.oturum.csrf,
      kullanici: { id: req.kullanici.id, ad_soyad: req.kullanici.ad_soyad, eposta: req.kullanici.eposta, rol: req.kullanici.rol, telefon: req.kullanici.telefon },
      taklit: !!req.oturum.taklit_admin_id,
      hesap: { ...hesap, profil },
      menu: menuHesapla(req),
      tanimlar: tanimlar(),
      duyurular, destekYeni,
      site_adi: O.ayar('site_adi', 'Defterdar'),
    };
  });

  r.get('/menu', (req) => { O.kullaniciGerekli(req); return menuHesapla(req); });

  // Modül kullanım sayacı (menü algoritması için)
  r.post('/kullanim', (req) => {
    O.kullaniciGerekli(req);
    const modul = g.metin(req.body.modul, 40);
    if (!modul || !M.modulBul(modul)) return { ok: true };
    const hs = g.hizSinir(`kul:${req.kullanici.id}:${modul}`, 1, 30000);
    if (!hs.izin) return { ok: true };
    const mevcut = db().prepare('SELECT sayi, son FROM modul_kullanim WHERE hesap_id=? AND kullanici_id=? AND modul=?').get(req.hesapId, req.kullanici.id, modul);
    const yeni = (mevcut ? M.sonumlenmis(mevcut.sayi, mevcut.son) : 0) + 1;
    db().prepare(`INSERT INTO modul_kullanim (hesap_id, kullanici_id, modul, sayi, son) VALUES (?,?,?,?,?)
      ON CONFLICT(hesap_id, kullanici_id, modul) DO UPDATE SET sayi=excluded.sayi, son=excluded.son`).run(req.hesapId, req.kullanici.id, modul, yeni, Date.now());
    return { ok: true };
  });

  r.post('/sifre-degistir', (req) => {
    O.kullaniciGerekli(req);
    const k = db().prepare('SELECT sifre_hash FROM kullanicilar WHERE id=?').get(req.kullanici.id);
    if (!g.sifreDogrula(String(req.body.mevcut || ''), k.sifre_hash)) throw hata(400, 'Mevcut şifre hatalı');
    const zayif = g.sifreGuclu(req.body.yeni); if (zayif) throw hata(400, zayif);
    db().prepare("UPDATE kullanicilar SET sifre_hash=?, sifre_degisim=datetime('now') WHERE id=?").run(g.sifreOzetle(req.body.yeni), req.kullanici.id);
    db().prepare("DELETE FROM oturumlar WHERE tip='kullanici' AND sahip_id=? AND id<>?").run(req.kullanici.id, req.oturum.id);
    O.denetimYaz(req, 'Şifre değiştirildi', 'kullanici');
    return { ok: true, mesaj: 'Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.' };
  });

  r.get('/oturumlarim', (req) => {
    O.kullaniciGerekli(req);
    return db().prepare("SELECT id, ip, tarayici, olusturma, son_erisim FROM oturumlar WHERE tip='kullanici' AND sahip_id=? ORDER BY son_erisim DESC")
      .all(req.kullanici.id).map(o => ({ ...o, id: o.id.slice(0, 12), bu: o.id === req.oturum.id }));
  });
  r.post('/oturumlari-kapat', (req) => {
    O.kullaniciGerekli(req);
    const n = db().prepare("DELETE FROM oturumlar WHERE tip='kullanici' AND sahip_id=? AND id<>?").run(req.kullanici.id, req.oturum.id).changes;
    return { ok: true, kapatilan: n };
  });

  r.put('/profil', (req) => {
    O.kullaniciGerekli(req);
    const ad = g.metin(req.body.ad_soyad, 100);
    if (!ad) throw hata(400, 'Ad soyad gerekli');
    db().prepare('UPDATE kullanicilar SET ad_soyad=?, telefon=? WHERE id=?').run(ad, g.metin(req.body.telefon, 30), req.kullanici.id);
    return { ok: true };
  });
};

module.exports.tanimlar = tanimlar;
module.exports.menuHesapla = menuHesapla;
