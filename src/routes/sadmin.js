'use strict';
// /sadmin yönetim paneli API'si
const fs = require('fs');
const path = require('path');
const os = require('os');
const { db, VERI_KLASORU, DB_YOLU } = require('../lib/db');
const g = require('../lib/guvenlik');
const { hata } = require('../lib/http');
const O = require('../lib/oturum');
const Y = require('../lib/yedek');
const M = require('../moduller');

const YEDEK_KLASOR = path.join(VERI_KLASORU, 'yedekler');
const BASLANGIC = Date.now();
const YEDEK_DOSYA = /^defterdar-[\w-]+\.(db|json\.gz)$/;

function otoYedekAl(neden = 'otomatik') {
  fs.mkdirSync(YEDEK_KLASOR, { recursive: true });
  const y = db().tamYedek();
  const ad = `defterdar-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${neden}.${y.uzanti}`;
  fs.writeFileSync(path.join(YEDEK_KLASOR, ad), y.buffer);
  const sakla = Math.max(3, +O.ayar('oto_yedek_sakla', '30'));
  const dosyalar = fs.readdirSync(YEDEK_KLASOR).filter(YEDEK_DOSYA.test.bind(YEDEK_DOSYA)).sort();
  dosyalar.slice(0, Math.max(0, dosyalar.length - sakla)).forEach(f => { try { fs.unlinkSync(path.join(YEDEK_KLASOR, f)); } catch (e) { /* */ } });
  return ad;
}

function hesapSil(hesapId) {
  db().islem(() => {
    for (const t of [...Y.SIRA, 'cop_kutusu', 'kayitli_gorunumler', 'modul_kullanim', 'sms_loglar', 'medya', 'destek_talepleri']) db().prepare(`DELETE FROM ${t} WHERE hesap_id=?`).run(hesapId);
    db().prepare("DELETE FROM oturumlar WHERE tip='kullanici' AND hesap_id=?").run(hesapId);
    db().prepare('DELETE FROM kullanicilar WHERE hesap_id=?').run(hesapId);
    db().prepare('DELETE FROM hesaplar WHERE id=?').run(hesapId);
  });
  try { fs.rmSync(path.join(VERI_KLASORU, 'medya', String(hesapId)), { recursive: true, force: true }); } catch (e) { /* */ }
}

module.exports = function (app) {
  const acik = app.yonlendirici('/api/sadmin');

  acik.post('/giris', (req, res) => {
    const izinli = O.ayar('admin_izinli_ipler', '').split(',').map(s => s.trim()).filter(Boolean);
    if (izinli.length && !izinli.includes(req.ip)) throw hata(403, 'Bu IP adresinden yönetim paneline erişim kapalı');
    if (O.ipEngelliMi(req.ip)) throw hata(403, 'IP adresiniz engellendi');
    const hs = g.hizSinir('sadmin:' + req.ip, 10, 15 * 60000);
    if (!hs.izin) {
      const toplam = db().prepare("SELECT COUNT(*) AS c FROM giris_kayitlari WHERE tip='admin' AND ip=? AND basarili=0 AND tarih>=datetime('now','-1 hour')").get(req.ip).c;
      if (toplam >= 25) db().prepare('INSERT INTO ip_engelleri (ip, neden, bitis) VALUES (?,?,?) ON CONFLICT(ip) DO UPDATE SET neden=excluded.neden, bitis=excluded.bitis').run(req.ip, 'Yönetim paneline art arda hatalı giriş', Date.now() + 24 * 3600000);
      throw hata(429, 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.');
    }
    const kadi = g.metin(req.body.kullanici_adi, 60), sifre = String(req.body.sifre || '').slice(0, 200);
    if (!kadi || !sifre) throw hata(400, 'Kullanıcı adı ve şifre gerekli');
    const a = db().prepare('SELECT * FROM adminler WHERE kullanici_adi=?').get(kadi.toLowerCase());
    if (a && a.kilit_bitis > Date.now()) {
      O.girisKaydi(req, 'admin', kadi, false, 'kilitli');
      throw hata(423, `Hesap güvenlik nedeniyle ${Math.ceil((a.kilit_bitis - Date.now()) / 60000)} dakika kilitli`);
    }
    const dogru = g.sifreDogrula(sifre, a ? a.sifre_hash : null);
    if (!a || !dogru || a.durum !== 'aktif') {
      if (a) {
        const n = (a.basarisiz_deneme || 0) + 1;
        db().prepare('UPDATE adminler SET basarisiz_deneme=?, kilit_bitis=? WHERE id=?').run(n >= 5 ? 0 : n, n >= 5 ? Date.now() + 30 * 60000 : 0, a.id);
      }
      O.girisKaydi(req, 'admin', kadi, false, 'hatalı bilgi');
      throw hata(401, 'Kullanıcı adı veya şifre hatalı');
    }
    if (a.totp_aktif) {
      const sir = g.coz(a.totp_sir);
      if (!req.body.kod) return { ok: false, totp_gerekli: true };
      if (!sir || !g.totpDogrula(sir, req.body.kod)) { O.girisKaydi(req, 'admin', kadi, false, 'hatalı doğrulama kodu'); throw hata(401, 'Doğrulama kodu hatalı', { totp_gerekli: true }); }
    }
    db().prepare("UPDATE adminler SET basarisiz_deneme=0, kilit_bitis=0, son_giris=datetime('now'), son_ip=? WHERE id=?").run(req.ip, a.id);
    O.girisKaydi(req, 'admin', kadi, true);
    req.admin = a;
    O.denetimYaz(req, 'Yönetim paneline giriş', 'sadmin');
    O.oturumAc(req, res, { tip: 'admin', sahipId: a.id });
    return { ok: true, varsayilan_sifre: !!a.varsayilan_sifre };
  });

  const r = app.yonlendirici('/api/sadmin');
  r.use(O.adminGerekli);
  const super_ = O.adminRol('super');
  const yazabilir = O.adminRol('super', 'destek');

  r.get('/oturum', (req) => ({ csrf: req.oturum.csrf, admin: req.admin, site_adi: O.ayar('site_adi', 'Defterdar') }));
  r.post('/cikis', (req, res) => { O.oturumKapat(req, res, 'admin'); return { ok: true }; });
  r.post('/sifre-degistir', (req) => {
    const a = db().prepare('SELECT * FROM adminler WHERE id=?').get(req.admin.id);
    if (!g.sifreDogrula(String(req.body.mevcut || ''), a.sifre_hash)) throw hata(400, 'Mevcut şifre hatalı');
    const yeni = String(req.body.yeni || '');
    if (yeni.length < 10 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(yeni) || !/\d/.test(yeni)) throw hata(400, 'Yönetici şifresi en az 10 karakter olmalı, harf ve rakam içermeli');
    if (g.sifreDogrula(yeni, a.sifre_hash)) throw hata(400, 'Yeni şifre eskisiyle aynı olamaz');
    db().prepare('UPDATE adminler SET sifre_hash=?, varsayilan_sifre=0 WHERE id=?').run(g.sifreOzetle(yeni), a.id);
    db().prepare("DELETE FROM oturumlar WHERE tip='admin' AND sahip_id=? AND id<>?").run(a.id, req.oturum.id);
    O.denetimYaz(req, 'Yönetici şifresi değiştirildi', 'sadmin');
    return { ok: true };
  });
  r.post('/2fa/baslat', (req) => {
    const sir = g.totpSirUret();
    db().prepare('UPDATE adminler SET totp_sir=?, totp_aktif=0 WHERE id=?').run(g.sifrele(sir), req.admin.id);
    const site = O.ayar('site_adi', 'Defterdar');
    return { sir, uri: `otpauth://totp/${encodeURIComponent(site)}:${encodeURIComponent(req.admin.kullanici_adi)}?secret=${sir}&issuer=${encodeURIComponent(site)}&digits=6&period=30` };
  });
  r.post('/2fa/onayla', (req) => {
    const a = db().prepare('SELECT totp_sir FROM adminler WHERE id=?').get(req.admin.id);
    const sir = g.coz(a.totp_sir);
    if (!sir || !g.totpDogrula(sir, req.body.kod)) throw hata(400, 'Kod doğrulanamadı. Telefonunuzun saatinin doğru olduğundan emin olun.');
    db().prepare('UPDATE adminler SET totp_aktif=1 WHERE id=?').run(req.admin.id);
    O.denetimYaz(req, 'İki adımlı doğrulama açıldı', 'sadmin');
    return { ok: true };
  });
  r.post('/2fa/kapat', (req) => {
    const a = db().prepare('SELECT sifre_hash FROM adminler WHERE id=?').get(req.admin.id);
    if (!g.sifreDogrula(String(req.body.sifre || ''), a.sifre_hash)) throw hata(400, 'Şifre hatalı');
    db().prepare('UPDATE adminler SET totp_aktif=0, totp_sir=NULL WHERE id=?').run(req.admin.id);
    O.denetimYaz(req, 'İki adımlı doğrulama kapatıldı', 'sadmin');
    return { ok: true };
  });

  // ─── Genel bakış ───
  r.get('/panel', () => {
    const d = db();
    const say = (sql, ...p) => d.prepare(sql).get(...p).c;
    const turler = d.prepare('SELECT tur, COUNT(*) AS c FROM hesaplar GROUP BY tur').all();
    const kayitSeri = d.prepare("SELECT date(olusturma) AS gun, COUNT(*) AS c FROM hesaplar WHERE olusturma>=date('now','-29 day') GROUP BY gun").all();
    const girisSeri = d.prepare("SELECT date(tarih) AS gun, SUM(basarili) AS basarili, SUM(1-basarili) AS hatali FROM giris_kayitlari WHERE tip='kullanici' AND tarih>=date('now','-13 day') GROUP BY gun").all();
    const gunler = (n) => Array.from({ length: n }, (_, i) => { const x = new Date(Date.now() - (n - 1 - i) * 86400000); return x.toISOString().slice(0, 10); });
    return {
      hesap: say('SELECT COUNT(*) AS c FROM hesaplar'), aktif_hesap: say("SELECT COUNT(*) AS c FROM hesaplar WHERE durum='aktif'"),
      askida: say("SELECT COUNT(*) AS c FROM hesaplar WHERE durum<>'aktif'"), kullanici: say('SELECT COUNT(*) AS c FROM kullanicilar'),
      aktif_oturum: say("SELECT COUNT(*) AS c FROM oturumlar WHERE tip='kullanici' AND bitis>? AND son_erisim>?", Date.now(), Date.now() - 30 * 60000),
      son7_aktif: say("SELECT COUNT(*) AS c FROM hesaplar WHERE son_aktivite>=datetime('now','-7 day')"),
      destek_bekleyen: say("SELECT COUNT(*) AS c FROM destek_talepleri WHERE durum='acik'"),
      hatali_giris_24s: say("SELECT COUNT(*) AS c FROM giris_kayitlari WHERE basarili=0 AND tarih>=datetime('now','-1 day')"),
      engelli_ip: say('SELECT COUNT(*) AS c FROM ip_engelleri'),
      turler: Object.keys(M.HESAP_TURLERI).map(t => ({ tur: t, ad: M.HESAP_TURLERI[t].kisa, adet: (turler.find(x => x.tur === t) || {}).c || 0 })),
      kayit_seri: gunler(30).map(gn => ({ gun: gn, adet: (kayitSeri.find(x => x.gun === gn) || {}).c || 0 })),
      giris_seri: gunler(14).map(gn => { const x = girisSeri.find(y => y.gun === gn) || {}; return { gun: gn, basarili: x.basarili || 0, hatali: x.hatali || 0 }; }),
      son_hesaplar: d.prepare('SELECT id, ad, tur, durum, olusturma FROM hesaplar ORDER BY id DESC LIMIT 8').all(),
      son_hatali: d.prepare("SELECT tip, kimlik, ip, neden, tarih FROM giris_kayitlari WHERE basarili=0 ORDER BY id DESC LIMIT 8").all(),
      sistem: { surum: require('../../package.json').version, node: process.version, motor: d.motor, db_boyut: d.boyut(), calisma_suresi: Math.round((Date.now() - BASLANGIC) / 1000),
        bellek: Math.round(process.memoryUsage().rss / 1048576), sunucu_bellek: Math.round(os.totalmem() / 1048576), bos_bellek: Math.round(os.freemem() / 1048576), platform: `${os.platform()} ${os.arch()}`,
        sistem_modu: O.ayar('sistem_modu', 'acik'), son_yedek: (() => { try { return fs.readdirSync(YEDEK_KLASOR).filter(f => YEDEK_DOSYA.test(f)).sort().pop() || null; } catch (e) { return null; } })(),
        anahtar_kaynagi: (g.ANAHTAR(), g.anahtarDurumu.kaynak), kalici_disk: !!process.env.DATA_DIR || fs.existsSync('/data') },
    };
  });

  // ─── Hesaplar ───
  r.get('/hesaplar', (req) => {
    let l = db().prepare(`SELECT h.id, h.ad, h.tur, h.durum, h.plan, h.il, h.eposta, h.telefon, h.olusturma, h.son_aktivite, h.kullanici_limiti,
      (SELECT COUNT(*) FROM kullanicilar k WHERE k.hesap_id=h.id) AS kullanici_sayisi,
      (SELECT ad_soyad FROM kullanicilar k WHERE k.hesap_id=h.id AND k.rol='sahip' LIMIT 1) AS sahip,
      (SELECT COUNT(*) FROM kayitlar x WHERE x.hesap_id=h.id) + (SELECT COUNT(*) FROM hisseler x WHERE x.hesap_id=h.id AND x.bagisci_adi IS NOT NULL) + (SELECT COUNT(*) FROM belgeler x WHERE x.hesap_id=h.id) AS kayit_sayisi
      FROM hesaplar h ORDER BY h.id DESC`).all();
    const q = (req.sorgu.q || '').toLocaleLowerCase('tr-TR');
    if (q) l = l.filter(h => [h.ad, h.eposta, h.sahip, h.il, String(h.id)].some(x => x && String(x).toLocaleLowerCase('tr-TR').includes(q)));
    if (req.sorgu.tur) l = l.filter(h => h.tur === req.sorgu.tur);
    if (req.sorgu.durum) l = l.filter(h => h.durum === req.sorgu.durum);
    return l;
  });
  r.get('/hesaplar/:id', (req) => {
    const h = db().prepare('SELECT id, ad, tur, alt_tur, vergi_no, vergi_dairesi, telefon, eposta, adres, il, web, profil_json, moduller_json, durum, plan, kullanici_limiti, admin_notu, olusturma, son_aktivite FROM hesaplar WHERE id=?').get(+req.params.id);
    if (!h) throw hata(404, 'Hesap bulunamadı');
    const say = (t, ek = '') => db().prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE hesap_id=? ${ek}`).get(h.id).c;
    return { hesap: { ...h, profil: JSON.parse(h.profil_json || '{}') },
      kullanicilar: db().prepare('SELECT id, ad_soyad, eposta, rol, durum, son_giris, olusturma, kilit_bitis FROM kullanicilar WHERE hesap_id=?').all(h.id),
      istatistik: { organizasyon: say('organizasyonlar'), hisse: say('hisseler', 'AND bagisci_adi IS NOT NULL'), kayit: say('kayitlar'), cari: say('cariler'), belge: say('belgeler'), finans_hareketi: say('finans_hareketleri'), personel: say('personeller'), medya: say('medya') },
      denetim: db().prepare('SELECT kim, islem, hedef, ip, tarih FROM denetim WHERE hesap_id=? ORDER BY id DESC LIMIT 40').all(h.id),
      menu: M.menuOlustur({ hesap: db().prepare('SELECT * FROM hesaplar WHERE id=?').get(h.id), rol: 'sahip' }) };
  });
  r.put('/hesaplar/:id', yazabilir, (req) => {
    const h = db().prepare('SELECT id FROM hesaplar WHERE id=?').get(+req.params.id); if (!h) throw hata(404, 'Hesap bulunamadı');
    const b = req.body;
    db().prepare('UPDATE hesaplar SET ad=COALESCE(?, ad), tur=?, durum=?, plan=?, kullanici_limiti=?, admin_notu=? WHERE id=?')
      .run(g.metin(b.ad, 150), M.HESAP_TURLERI[b.tur] ? b.tur : 'stk', ['aktif', 'askida'].includes(b.durum) ? b.durum : 'aktif', g.metin(b.plan, 30) || 'standart', Math.max(1, g.tamsayi(b.kullanici_limiti, 25)), g.metin(b.admin_notu, 2000), h.id);
    if (b.durum === 'askida') db().prepare("DELETE FROM oturumlar WHERE tip='kullanici' AND hesap_id=?").run(h.id);
    O.denetimYaz(req, 'Hesap güncellendi (yönetici)', 'hesap:' + h.id, { hesap_id: h.id, durum: b.durum });
    return { ok: true };
  });
  r.post('/hesaplar/:id/eris', super_, (req) => {
    const k = db().prepare("SELECT id, hesap_id FROM kullanicilar WHERE hesap_id=? AND rol='sahip' AND durum='aktif' LIMIT 1").get(+req.params.id);
    if (!k) throw hata(404, 'Hesabın aktif sahibi bulunamadı');
    O.denetimYaz(req, 'Yönetici hesaba destek amaçlı erişti', 'hesap:' + k.hesap_id, { hesap_id: k.hesap_id });
    // Kullanıcı çerezi admin çerezinden ayrı tutulur; erişim süresi kısa tutulur
    const token = g.rastgele(32), csrf = g.rastgele(24), simdi = Date.now();
    db().prepare('INSERT INTO oturumlar (id, tip, sahip_id, hesap_id, csrf, ip, tarayici, gecici, taklit_admin_id, olusturma, son_erisim, bitis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(g.tokenOzet(token), 'kullanici', k.id, k.hesap_id, csrf, req.ip, 'yönetici erişimi', 1, req.admin.id, simdi, simdi, simdi + 30 * 60000);
    const giris = g.rastgele(24);
    _erisimKodlari.set(giris, { token, bitis: simdi + 60000 });
    return { ok: true, url: `/destek-erisimi?kod=${encodeURIComponent(giris)}` };
  });
  r.get('/hesaplar/:id/yedek', super_, (req, res) => {
    const h = db().prepare('SELECT id, ad FROM hesaplar WHERE id=?').get(+req.params.id); if (!h) throw hata(404, 'Hesap bulunamadı');
    O.denetimYaz(req, 'Hesap yedeği indirildi (yönetici)', 'hesap:' + h.id, { hesap_id: h.id });
    res.indir(Buffer.from(JSON.stringify(Y.hesapYedegi(h.id))), `hesap-${h.id}-yedek.json`, 'application/json');
  });
  r.post('/hesaplar/:id/icder-aktar', super_, { limit: 100 * 1024 * 1024 }, (req) => {
    const h = db().prepare('SELECT id FROM hesaplar WHERE id=?').get(+req.params.id); if (!h) throw hata(404, 'Hesap bulunamadı');
    const say = Y.icderAktar(h.id, req.body.yedek);
    O.denetimYaz(req, 'Eski İÇDER verisi aktarıldı (yönetici)', 'hesap:' + h.id, { hesap_id: h.id, ...say });
    return { ok: true, sayilar: say };
  });
  r.delete('/hesaplar/:id', super_, (req) => {
    const h = db().prepare('SELECT id, ad FROM hesaplar WHERE id=?').get(+req.params.id); if (!h) throw hata(404, 'Hesap bulunamadı');
    if (req.body.onay !== h.ad) throw hata(400, 'Onay için hesap adını birebir yazın');
    const a = db().prepare('SELECT sifre_hash FROM adminler WHERE id=?').get(req.admin.id);
    if (!g.sifreDogrula(String(req.body.sifre || ''), a.sifre_hash)) throw hata(400, 'Yönetici şifresi hatalı');
    otoYedekAl('hesap-silme-oncesi');
    hesapSil(h.id);
    O.denetimYaz(req, 'Hesap kalıcı olarak silindi', 'hesap:' + h.id, { ad: h.ad });
    return { ok: true };
  });
  r.post('/hesaplar', super_, (req) => {
    const b = req.body;
    const ad = g.metin(b.ad, 150), eposta = g.eposta(b.eposta), adSoyad = g.metin(b.ad_soyad, 100);
    if (!ad || !eposta || !adSoyad || !M.HESAP_TURLERI[b.tur]) throw hata(400, 'Kurum adı, tür, sahip adı ve e-posta gerekli');
    if (db().prepare('SELECT id FROM kullanicilar WHERE eposta=?').get(eposta)) throw hata(409, 'Bu e-posta zaten kayıtlı');
    const gecici = g.rastgele(9).replace(/[-_]/g, 'x') + '7';
    const id = db().islem(() => {
      const h = db().prepare('INSERT INTO hesaplar (ad, tur, eposta, profil_json) VALUES (?,?,?,?)').run(ad, b.tur, eposta, JSON.stringify({ faaliyetler: M.HESAP_TURLERI[b.tur].varsayilan })).lastInsertRowid;
      db().prepare("INSERT INTO kullanicilar (hesap_id, ad_soyad, eposta, sifre_hash, rol) VALUES (?,?,?,?, 'sahip')").run(h, adSoyad, eposta, g.sifreOzetle(gecici));
      require('./ortak').hesapVarsayilanlari(h, b.tur);
      return h;
    });
    O.denetimYaz(req, 'Hesap oluşturuldu (yönetici)', 'hesap:' + id, { ad });
    return { ok: true, id, gecici_sifre: gecici };
  });

  // ─── Kullanıcılar ───
  r.get('/kullanicilar', (req) => {
    let l = db().prepare('SELECT k.id, k.ad_soyad, k.eposta, k.rol, k.durum, k.son_giris, k.olusturma, k.kilit_bitis, k.hesap_id, h.ad AS hesap_ad FROM kullanicilar k JOIN hesaplar h ON h.id=k.hesap_id ORDER BY k.id DESC').all();
    const q = (req.sorgu.q || '').toLocaleLowerCase('tr-TR');
    if (q) l = l.filter(k => [k.ad_soyad, k.eposta, k.hesap_ad].some(x => x && x.toLocaleLowerCase('tr-TR').includes(q)));
    return l.map(k => ({ ...k, kilitli: k.kilit_bitis > Date.now() }));
  });
  r.post('/kullanicilar/:id/islem', yazabilir, (req) => {
    const k = db().prepare('SELECT id, eposta, hesap_id FROM kullanicilar WHERE id=?').get(+req.params.id); if (!k) throw hata(404, 'Kullanıcı bulunamadı');
    const islem = req.body.islem; let ek = {};
    if (islem === 'kilit-ac') db().prepare('UPDATE kullanicilar SET basarisiz_deneme=0, kilit_bitis=0 WHERE id=?').run(k.id);
    else if (islem === 'pasif' || islem === 'aktif') { db().prepare('UPDATE kullanicilar SET durum=? WHERE id=?').run(islem, k.id); if (islem === 'pasif') db().prepare("DELETE FROM oturumlar WHERE tip='kullanici' AND sahip_id=?").run(k.id); }
    else if (islem === 'oturumlari-kapat') ek.kapatilan = db().prepare("DELETE FROM oturumlar WHERE tip='kullanici' AND sahip_id=?").run(k.id).changes;
    else if (islem === 'sifre-sifirla') {
      const gecici = g.rastgele(9).replace(/[-_]/g, 'x') + '7';
      db().prepare('UPDATE kullanicilar SET sifre_hash=?, basarisiz_deneme=0, kilit_bitis=0 WHERE id=?').run(g.sifreOzetle(gecici), k.id);
      db().prepare("DELETE FROM oturumlar WHERE tip='kullanici' AND sahip_id=?").run(k.id);
      ek.gecici_sifre = gecici;
    } else throw hata(400, 'Geçersiz işlem');
    O.denetimYaz(req, `Kullanıcı işlemi: ${islem}`, 'kullanici:' + k.id, { hesap_id: k.hesap_id, eposta: k.eposta });
    return { ok: true, ...ek };
  });

  // ─── Destek talepleri ───
  r.get('/destek', (req) => {
    let sql = `SELECT t.*, h.ad AS hesap_ad, k.ad_soyad, (SELECT COUNT(*) FROM destek_mesajlari m WHERE m.talep_id=t.id) AS mesaj_sayisi
      FROM destek_talepleri t JOIN hesaplar h ON h.id=t.hesap_id LEFT JOIN kullanicilar k ON k.id=t.kullanici_id`;
    const p = [];
    if (req.sorgu.durum) { sql += ' WHERE t.durum=?'; p.push(String(req.sorgu.durum)); }
    return db().prepare(sql + " ORDER BY CASE t.durum WHEN 'acik' THEN 0 WHEN 'yanitlandi' THEN 1 ELSE 2 END, t.guncelleme DESC LIMIT 1000").all(...p);
  });
  r.get('/destek/:id', (req) => {
    const t = db().prepare('SELECT t.*, h.ad AS hesap_ad, h.tur AS hesap_tur, k.ad_soyad, k.eposta FROM destek_talepleri t JOIN hesaplar h ON h.id=t.hesap_id LEFT JOIN kullanicilar k ON k.id=t.kullanici_id WHERE t.id=?').get(+req.params.id);
    if (!t) throw hata(404, 'Talep bulunamadı');
    db().prepare('UPDATE destek_talepleri SET admin_okundu=1 WHERE id=?').run(t.id);
    return { talep: t, mesajlar: db().prepare('SELECT * FROM destek_mesajlari WHERE talep_id=? ORDER BY id').all(t.id) };
  });
  r.post('/destek/:id/yanit', yazabilir, (req) => {
    const t = db().prepare('SELECT id FROM destek_talepleri WHERE id=?').get(+req.params.id); if (!t) throw hata(404, 'Talep bulunamadı');
    const icerik = g.metin(req.body.icerik, 5000); if (!icerik) throw hata(400, 'Yanıt boş olamaz');
    db().prepare("INSERT INTO destek_mesajlari (talep_id, gonderen, gonderen_ad, icerik) VALUES (?, 'admin', ?, ?)").run(t.id, req.admin.ad_soyad || 'Destek ekibi', icerik);
    db().prepare("UPDATE destek_talepleri SET durum=?, admin_okundu=1, kullanici_okundu=0, guncelleme=datetime('now') WHERE id=?").run(req.body.kapat ? 'kapali' : 'yanitlandi', t.id);
    return { ok: true };
  });
  r.post('/destek/:id/durum', yazabilir, (req) => {
    const d = ['acik', 'yanitlandi', 'kapali'].includes(req.body.durum) ? req.body.durum : null; if (!d) throw hata(400, 'Geçersiz durum');
    db().prepare("UPDATE destek_talepleri SET durum=?, guncelleme=datetime('now') WHERE id=?").run(d, +req.params.id);
    return { ok: true };
  });
  r.delete('/destek/:id', super_, (req) => { db().prepare('DELETE FROM destek_talepleri WHERE id=?').run(+req.params.id); return { ok: true }; });

  // ─── Duyurular ───
  r.get('/duyurular', () => db().prepare('SELECT * FROM duyurular ORDER BY id DESC').all());
  function duyuruVerisi(b) {
    const baslik = g.metin(b.baslik, 150); if (!baslik) throw hata(400, 'Başlık gerekli');
    return [baslik, g.metin(b.icerik, 2000), ['bilgi', 'uyari', 'kritik'].includes(b.seviye) ? b.seviye : 'bilgi', ['hepsi', ...Object.keys(M.HESAP_TURLERI)].includes(b.hedef_tur) ? b.hedef_tur : 'hepsi', b.aktif === false || b.aktif === 0 ? 0 : 1, g.tarih(b.baslangic), g.tarih(b.bitis)];
  }
  r.post('/duyurular', yazabilir, (req) => ({ ok: true, id: db().prepare('INSERT INTO duyurular (baslik, icerik, seviye, hedef_tur, aktif, baslangic, bitis) VALUES (?,?,?,?,?,?,?)').run(...duyuruVerisi(req.body)).lastInsertRowid }));
  r.put('/duyurular/:id', yazabilir, (req) => { db().prepare('UPDATE duyurular SET baslik=?, icerik=?, seviye=?, hedef_tur=?, aktif=?, baslangic=?, bitis=? WHERE id=?').run(...duyuruVerisi(req.body), +req.params.id); return { ok: true }; });
  r.delete('/duyurular/:id', yazabilir, (req) => { db().prepare('DELETE FROM duyurular WHERE id=?').run(+req.params.id); return { ok: true }; });

  // ─── Sistem ayarları ───
  const AYARLAR = ['sistem_modu', 'sistem_notu', 'izinli_ipler', 'kayit_acik', 'site_adi', 'oturum_suresi_saat', 'admin_oturum_dakika', 'admin_izinli_ipler', 'devre_disi_moduller', 'oto_yedek_aktif', 'oto_yedek_saat', 'oto_yedek_sakla'];
  r.get('/ayarlar', () => {
    const o = {}; AYARLAR.forEach(a => { o[a] = O.ayar(a, ''); });
    let cl = {}; try { cl = JSON.parse(O.ayar('cloudinary', '{}') || '{}'); } catch (e) { /* */ }
    o.cloudinary = { cloud: cl.cloud || '', key: cl.key || '', secret_var: !!cl.secret, ortam: !!process.env.CLOUDINARY_URL };
    o.istemci_ip = null;
    return o;
  });
  r.put('/ayarlar', super_, (req) => {
    const b = req.body;
    const ipListe = (s) => String(s || '').split(',').map(x => x.trim()).filter(x => /^[0-9a-fA-F:.]{3,45}$/.test(x)).join(',');
    if (b.admin_izinli_ipler !== undefined) {
      const l = ipListe(b.admin_izinli_ipler).split(',').filter(Boolean);
      if (l.length && !l.includes(req.ip)) throw hata(400, `Kendi IP adresinizi (${req.ip}) listeye eklemeden yönetici IP kısıtlaması açamazsınız`);
    }
    const temiz = {
      sistem_modu: ['acik', 'bakim', 'kapali'].includes(b.sistem_modu) ? b.sistem_modu : undefined, sistem_notu: b.sistem_notu !== undefined ? (g.metin(b.sistem_notu, 1000) || '') : undefined,
      izinli_ipler: b.izinli_ipler !== undefined ? ipListe(b.izinli_ipler) : undefined, kayit_acik: b.kayit_acik !== undefined ? (b.kayit_acik ? '1' : '0') : undefined,
      site_adi: b.site_adi !== undefined ? (g.metin(b.site_adi, 60) || 'Defterdar') : undefined,
      oturum_suresi_saat: b.oturum_suresi_saat !== undefined ? String(Math.min(720, Math.max(1, g.tamsayi(b.oturum_suresi_saat, 12)))) : undefined,
      admin_oturum_dakika: b.admin_oturum_dakika !== undefined ? String(Math.min(480, Math.max(10, g.tamsayi(b.admin_oturum_dakika, 60)))) : undefined,
      admin_izinli_ipler: b.admin_izinli_ipler !== undefined ? ipListe(b.admin_izinli_ipler) : undefined,
      devre_disi_moduller: Array.isArray(b.devre_disi_moduller) ? JSON.stringify(b.devre_disi_moduller.filter(m => M.modulBul(m) && !M.modulBul(m).sabit)) : undefined,
      oto_yedek_aktif: b.oto_yedek_aktif !== undefined ? (b.oto_yedek_aktif ? '1' : '0') : undefined,
      oto_yedek_saat: b.oto_yedek_saat !== undefined ? String(Math.min(23, Math.max(0, g.tamsayi(b.oto_yedek_saat, 6)))) : undefined,
      oto_yedek_sakla: b.oto_yedek_sakla !== undefined ? String(Math.min(365, Math.max(3, g.tamsayi(b.oto_yedek_sakla, 30)))) : undefined,
    };
    Object.entries(temiz).forEach(([k, v]) => { if (v !== undefined) O.ayarYaz(k, v); });
    if (b.cloudinary) {
      const c = b.cloudinary; let eski = {}; try { eski = JSON.parse(O.ayar('cloudinary', '{}') || '{}'); } catch (e) { /* */ }
      O.ayarYaz('cloudinary', (!c.cloud && !c.key) ? '' : JSON.stringify({ cloud: g.metin(c.cloud, 60), key: g.metin(c.key, 60), secret: c.secret ? g.sifrele(String(c.secret)) : eski.secret || null }));
    }
    O.denetimYaz(req, 'Sistem ayarları güncellendi', 'sadmin', { degisen: Object.keys(temiz).filter(k => temiz[k] !== undefined) });
    return { ok: true };
  });

  // ─── Modüller ve algoritma istatistiği ───
  r.get('/moduller', () => {
    const kul = db().prepare('SELECT modul, SUM(sayi) AS toplam, COUNT(DISTINCT hesap_id) AS hesap FROM modul_kullanim GROUP BY modul').all();
    let kapali = []; try { kapali = JSON.parse(O.ayar('devre_disi_moduller', '[]')); } catch (e) { /* */ }
    return { moduller: M.MODULLER.map(m => ({ anahtar: m.anahtar, ad: m.ad, grup: M.GRUPLAR[m.grup].ad, ikon: m.ikon, sabit: !!m.sabit, afinite: m.afinite || null, faaliyet: m.faaliyet || null,
      kullanim: Math.round(((kul.find(k => k.modul === m.anahtar) || {}).toplam || 0) * 10) / 10, hesap: (kul.find(k => k.modul === m.anahtar) || {}).hesap || 0, kapali: kapali.includes(m.anahtar) })),
      turler: M.HESAP_TURLERI, esik: M.ESIK };
  });

  // ─── Güvenlik ───
  r.get('/guvenlik/girisler', (req) => {
    const p = []; let sql = 'SELECT * FROM giris_kayitlari WHERE 1=1';
    if (req.sorgu.tip) { sql += ' AND tip=?'; p.push(String(req.sorgu.tip)); }
    if (req.sorgu.basarili === '0' || req.sorgu.basarili === '1') { sql += ' AND basarili=?'; p.push(+req.sorgu.basarili); }
    if (req.sorgu.q) { sql += ' AND (kimlik LIKE ? OR ip LIKE ?)'; p.push('%' + req.sorgu.q + '%', '%' + req.sorgu.q + '%'); }
    return db().prepare(sql + ' ORDER BY id DESC LIMIT 1000').all(...p);
  });
  r.get('/guvenlik/oturumlar', () => db().prepare(`SELECT o.id, o.tip, o.ip, o.tarayici, o.olusturma, o.son_erisim, o.bitis, o.taklit_admin_id,
      CASE o.tip WHEN 'admin' THEN (SELECT kullanici_adi FROM adminler WHERE id=o.sahip_id) ELSE (SELECT ad_soyad || ' — ' || eposta FROM kullanicilar WHERE id=o.sahip_id) END AS kim,
      (SELECT ad FROM hesaplar WHERE id=o.hesap_id) AS hesap_ad
    FROM oturumlar o WHERE o.bitis>? ORDER BY o.son_erisim DESC LIMIT 500`).all(Date.now()).map(o => ({ ...o, id: o.id.slice(0, 16) })));
  r.post('/guvenlik/oturum-kapat', yazabilir, (req) => {
    const onek = String(req.body.id || ''); if (onek.length !== 16) throw hata(400, 'Geçersiz oturum');
    const n = db().prepare('DELETE FROM oturumlar WHERE substr(id,1,16)=? AND id<>?').run(onek, req.oturum.id).changes;
    O.denetimYaz(req, 'Oturum sonlandırıldı', 'oturum');
    return { ok: true, kapatilan: n };
  });
  r.post('/guvenlik/tum-oturumlar', super_, (req) => {
    const n = db().prepare("DELETE FROM oturumlar WHERE tip='kullanici'").run().changes;
    O.denetimYaz(req, 'Tüm kullanıcı oturumları kapatıldı', 'oturum', { adet: n });
    return { ok: true, kapatilan: n };
  });
  // Son sunucu hataları (bellekte, 60 kayıt)
  r.get('/guvenlik/hatalar', () => require('../lib/hatalar').son());
  r.delete('/guvenlik/hatalar', yazabilir, (req) => {
    const n = require('../lib/hatalar').temizle();
    O.denetimYaz(req, 'Sunucu hata kaydı temizlendi', 'sistem', { adet: n });
    return { ok: true, silinen: n };
  });

  r.get('/guvenlik/ip', () => db().prepare('SELECT * FROM ip_engelleri ORDER BY olusturma DESC').all());
  r.post('/guvenlik/ip', yazabilir, (req) => {
    const ip = String(req.body.ip || '').trim(); if (!/^[0-9a-fA-F:.]{3,45}$/.test(ip)) throw hata(400, 'Geçersiz IP adresi');
    if (ip === req.ip) throw hata(400, 'Kendi IP adresinizi engelleyemezsiniz');
    const saat = g.tamsayi(req.body.saat, 0);
    db().prepare('INSERT INTO ip_engelleri (ip, neden, bitis) VALUES (?,?,?) ON CONFLICT(ip) DO UPDATE SET neden=excluded.neden, bitis=excluded.bitis').run(ip, g.metin(req.body.neden, 200) || 'Yönetici tarafından', saat > 0 ? Date.now() + saat * 3600000 : null);
    db().prepare('DELETE FROM oturumlar WHERE ip=? AND id<>?').run(ip, req.oturum.id);
    O.denetimYaz(req, 'IP engellendi', 'ip', { ip });
    return { ok: true };
  });
  r.delete('/guvenlik/ip/:ip', yazabilir, (req) => { db().prepare('DELETE FROM ip_engelleri WHERE ip=?').run(req.params.ip); O.denetimYaz(req, 'IP engeli kaldırıldı', 'ip', { ip: req.params.ip }); return { ok: true }; });

  // ─── Denetim ───
  r.get('/denetim', (req) => {
    const p = []; let sql = 'SELECT d.*, h.ad AS hesap_ad FROM denetim d LEFT JOIN hesaplar h ON h.id=d.hesap_id WHERE 1=1';
    if (req.sorgu.hesap) { sql += ' AND d.hesap_id=?'; p.push(+req.sorgu.hesap); }
    if (req.sorgu.admin === '1') sql += ' AND d.admin_id IS NOT NULL';
    if (req.sorgu.q) { const l = '%' + String(req.sorgu.q).toLocaleLowerCase('tr-TR') + '%'; sql += ' AND (LOWER(d.islem) LIKE ? OR LOWER(d.kim) LIKE ? OR d.ip LIKE ? OR LOWER(h.ad) LIKE ?)'; p.push(l, l, l, l); }
    return db().prepare(sql + ' ORDER BY d.id DESC LIMIT 1500').all(...p);
  });

  // ─── Yöneticiler ───
  r.get('/adminler', super_, () => db().prepare('SELECT id, kullanici_adi, ad_soyad, eposta, rol, durum, totp_aktif, varsayilan_sifre, son_giris, son_ip, olusturma FROM adminler ORDER BY id').all());
  r.post('/adminler', super_, (req) => {
    const kadi = (g.metin(req.body.kullanici_adi, 40) || '').toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(kadi)) throw hata(400, 'Kullanıcı adı 3-40 karakter; harf, rakam, nokta, tire içerebilir');
    const sifre = String(req.body.sifre || '');
    if (sifre.length < 10 || !/\d/.test(sifre) || !/[A-Za-z]/.test(sifre)) throw hata(400, 'Şifre en az 10 karakter olmalı, harf ve rakam içermeli');
    if (db().prepare('SELECT id FROM adminler WHERE kullanici_adi=?').get(kadi)) throw hata(409, 'Bu kullanıcı adı alınmış');
    const id = db().prepare('INSERT INTO adminler (kullanici_adi, ad_soyad, eposta, sifre_hash, rol) VALUES (?,?,?,?,?)').run(kadi, g.metin(req.body.ad_soyad, 100), req.body.eposta ? g.eposta(req.body.eposta) : null, g.sifreOzetle(sifre), ['super', 'destek', 'izleyici'].includes(req.body.rol) ? req.body.rol : 'destek').lastInsertRowid;
    O.denetimYaz(req, 'Yönetici eklendi', 'admin:' + id, { kadi });
    return { ok: true, id };
  });
  r.put('/adminler/:id', super_, (req) => {
    const a = db().prepare('SELECT id FROM adminler WHERE id=?').get(+req.params.id); if (!a) throw hata(404, 'Yönetici bulunamadı');
    if (a.id === req.admin.id && (req.body.durum === 'pasif' || (req.body.rol && req.body.rol !== 'super'))) throw hata(400, 'Kendi yetkinizi düşüremez veya hesabınızı kapatamazsınız');
    db().prepare('UPDATE adminler SET ad_soyad=?, rol=?, durum=? WHERE id=?').run(g.metin(req.body.ad_soyad, 100), ['super', 'destek', 'izleyici'].includes(req.body.rol) ? req.body.rol : 'destek', req.body.durum === 'pasif' ? 'pasif' : 'aktif', a.id);
    if (req.body.durum === 'pasif') db().prepare("DELETE FROM oturumlar WHERE tip='admin' AND sahip_id=?").run(a.id);
    if (req.body.sifre) {
      const s = String(req.body.sifre); if (s.length < 10 || !/\d/.test(s)) throw hata(400, 'Şifre en az 10 karakter ve rakam içermeli');
      db().prepare('UPDATE adminler SET sifre_hash=?, varsayilan_sifre=0, kilit_bitis=0, basarisiz_deneme=0 WHERE id=?').run(g.sifreOzetle(s), a.id);
    }
    if (req.body.totp_sifirla) db().prepare('UPDATE adminler SET totp_aktif=0, totp_sir=NULL WHERE id=?').run(a.id);
    O.denetimYaz(req, 'Yönetici güncellendi', 'admin:' + a.id);
    return { ok: true };
  });
  r.delete('/adminler/:id', super_, (req) => {
    if (+req.params.id === req.admin.id) throw hata(400, 'Kendinizi silemezsiniz');
    if (db().prepare("SELECT COUNT(*) AS c FROM adminler WHERE rol='super' AND durum='aktif' AND id<>?").get(+req.params.id).c < 1) throw hata(400, 'En az bir aktif süper yönetici kalmalı');
    db().prepare("DELETE FROM oturumlar WHERE tip='admin' AND sahip_id=?").run(+req.params.id);
    db().prepare('DELETE FROM adminler WHERE id=?').run(+req.params.id);
    O.denetimYaz(req, 'Yönetici silindi', 'admin:' + req.params.id);
    return { ok: true };
  });

  // ─── Sistem yedekleri ───
  r.get('/yedekler', super_, () => {
    let l = []; try { l = fs.readdirSync(YEDEK_KLASOR).filter(f => YEDEK_DOSYA.test(f)).sort().reverse().map(f => ({ ad: f, boyut: fs.statSync(path.join(YEDEK_KLASOR, f)).size, tarih: fs.statSync(path.join(YEDEK_KLASOR, f)).mtime })); } catch (e) { /* */ }
    return { yedekler: l, bekleyen_geri_yukleme: fs.existsSync(DB_YOLU + '.geri-yukle'), motor: db().motor };
  });
  r.post('/yedekler', super_, (req) => { const ad = otoYedekAl('manuel'); O.denetimYaz(req, 'Sistem yedeği alındı', 'yedek', { ad }); return { ok: true, ad }; });
  r.get('/yedekler/indir', super_, (req, res) => {
    O.denetimYaz(req, 'Tam veritabanı yedeği indirildi', 'yedek');
    const y = db().tamYedek();
    res.indir(y.buffer, `defterdar-tam-${new Date().toISOString().slice(0, 10)}.${y.uzanti}`, 'application/octet-stream');
  });
  r.get('/yedekler/:ad', super_, (req, res) => {
    const ad = path.basename(req.params.ad);
    if (!YEDEK_DOSYA.test(ad)) throw hata(400, 'Geçersiz dosya');
    const tam = path.join(YEDEK_KLASOR, ad); if (!fs.existsSync(tam)) throw hata(404, 'Yedek bulunamadı');
    res.indir(fs.readFileSync(tam), ad, 'application/octet-stream');
  });
  r.delete('/yedekler/:ad', super_, (req) => {
    const ad = path.basename(req.params.ad); if (!YEDEK_DOSYA.test(ad)) throw hata(400, 'Geçersiz dosya');
    try { fs.unlinkSync(path.join(YEDEK_KLASOR, ad)); } catch (e) { /* */ }
    return { ok: true };
  });
  // Geri yükleme: dosya hazırlanır, sunucu yeniden başlatılınca devreye girer
  r.post('/yedekler/geri-yukle', super_, { ham: true, limit: 1024 * 1024 * 1024 }, (req) => {
    const buf = req.govdeHam;
    const a = db().prepare('SELECT sifre_hash FROM adminler WHERE id=?').get(req.admin.id);
    if (!g.sifreDogrula(String(req.headers['x-yonetici-sifre'] || ''), a.sifre_hash)) throw hata(400, 'Yönetici şifresi hatalı');
    if (db().motor === 'postgresql') {
      if (!buf || buf[0] !== 0x1f || buf[1] !== 0x8b) throw hata(400, 'PostgreSQL için .json.gz uzantılı Defterdar tam yedeği seçin');
      otoYedekAl('geri-yukleme-oncesi');
      const n = db().tamGeriYukle(buf);
      O.girisKaydi(req, 'admin', req.admin.kullanici_adi, true, 'veritabanı geri yüklendi');
      return { ok: true, mesaj: `${n} tablo geri yüklendi. Oturumunuz geçerliliğini koruyor; gerekirse yeniden giriş yapın.`, hemen: true };
    }
    if (!buf || buf.subarray(0, 16).toString() !== 'SQLite format 3\u0000') throw hata(400, 'Dosya geçerli bir SQLite veritabanı değil');
    otoYedekAl('geri-yukleme-oncesi');
    fs.writeFileSync(DB_YOLU + '.geri-yukle', buf);
    O.denetimYaz(req, 'Veritabanı geri yükleme hazırlandı', 'yedek', { boyut: buf.length });
    return { ok: true, mesaj: 'Yedek hazırlandı. Sunucu yeniden başlatıldığında devreye girecek.' };
  });
};

const _erisimKodlari = new Map();
module.exports.erisimKoduKullan = (kod) => {
  const e = _erisimKodlari.get(kod); _erisimKodlari.delete(kod);
  return e && e.bitis > Date.now() ? e.token : null;
};
module.exports.otoYedekAl = otoYedekAl;
