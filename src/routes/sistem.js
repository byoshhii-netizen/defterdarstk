'use strict';
const fs = require('fs');
const path = require('path');
const { db, VERI_KLASORU } = require('../lib/db');
const g = require('../lib/guvenlik');
const { hata } = require('../lib/http');
const O = require('../lib/oturum');
const E = require('../lib/entegrasyon');
const Y = require('../lib/yedek');
const M = require('../moduller');
const { sahip, bugun, idListesi } = require('./ortak');

const MEDYA_KLASOR = path.join(VERI_KLASORU, 'medya');

module.exports = function (app) {
  const r = app.yonlendirici('/api');
  r.use(O.kullaniciGerekli); r.use(O.yazmaYetkisi);
  r.use(require('../lib/abonelik').katman);
  const yonetici = O.rolGerekli('yonetici');

  // ─── Hesap / kurum ayarları ───
  r.get('/ayarlar/hesap', (req) => {
    const h = db().prepare('SELECT id, ad, tur, alt_tur, vergi_no, vergi_dairesi, telefon, eposta, adres, il, web, logo_data, bayrak_data, profil_json, moduller_json, para_birimi, (personel_pin IS NOT NULL) AS pin_var FROM hesaplar WHERE id=?').get(req.hesapId);
    const ent = E.hesapEntegrasyon(req.hesapId);
    return { ...h, profil: JSON.parse(h.profil_json || '{}'), moduller: JSON.parse(h.moduller_json || '{}'),
      sms: { kullanici: (ent.sms || {}).kullanici || '', baslik: (ent.sms || {}).baslik || '', sifre_var: !!(ent.sms || {}).sifre },
      cloudinary: { cloud: (ent.cloudinary || {}).cloud || '', key: (ent.cloudinary || {}).key || '', secret_var: !!(ent.cloudinary || {}).secret, aktif: !!E.cloudinaryAyar(req.hesapId) } };
  });
  r.put('/ayarlar/hesap', yonetici, { limit: 8 * 1024 * 1024 }, (req) => {
    const b = req.body;
    const ad = g.metin(b.ad, 150); if (!ad) throw hata(400, 'Kurum adı gerekli');
    const vn = g.metin(b.vergi_no, 11);
    if (vn && !/^\d{10,11}$/.test(vn)) throw hata(400, 'Vergi numarası 10 veya 11 haneli olmalı');
    const logo = b.logo_data === null ? null : (b.logo_data ? g.veriResmi(b.logo_data) : undefined);
    if (b.logo_data && !logo) throw hata(400, 'Logo PNG, JPG, WEBP veya SVG olmalı (en fazla 3 MB)');
    db().prepare('UPDATE hesaplar SET ad=?, alt_tur=?, vergi_no=?, vergi_dairesi=?, telefon=?, eposta=?, adres=?, il=?, web=? WHERE id=?')
      .run(ad, g.metin(b.alt_tur, 60), vn, g.metin(b.vergi_dairesi, 80), g.metin(b.telefon, 30), b.eposta ? g.eposta(b.eposta) : null, g.metin(b.adres, 500), g.metin(b.il, 40), g.metin(b.web, 120), req.hesapId);
    if (logo !== undefined) db().prepare('UPDATE hesaplar SET logo_data=? WHERE id=?').run(logo, req.hesapId);
    O.denetimYaz(req, 'Kurum bilgileri güncellendi', 'hesap');
    return { ok: true };
  });
  r.get('/ayarlar/logo', (req, res) => {
    const h = db().prepare('SELECT logo_data FROM hesaplar WHERE id=?').get(req.hesapId);
    if (!h || !h.logo_data) { res.statusCode = 404; res.end(); return; }
    const m = /^data:([^;]+);base64,(.+)$/.exec(h.logo_data);
    res.setHeader('Content-Type', m[1]); res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(Buffer.from(m[2], 'base64'));
  });
  // Hesap türü, faaliyetler, sabitlenen/gizlenen modüller (menü algoritması girdileri)
  r.put('/ayarlar/profil', yonetici, (req) => {
    const b = req.body;
    const h = db().prepare('SELECT tur, profil_json FROM hesaplar WHERE id=?').get(req.hesapId);
    const tur = M.HESAP_TURLERI[b.tur] ? b.tur : h.tur;
    const gecerli = new Set(M.HESAP_TURLERI[tur].faaliyetler.map(f => f[0]));
    const profil = JSON.parse(h.profil_json || '{}');
    if (Array.isArray(b.faaliyetler)) profil.faaliyetler = b.faaliyetler.filter(f => gecerli.has(f));
    const modulAnahtarlari = new Set(M.MODULLER.map(m => m.anahtar));
    const moduller = { sabit: (b.sabit || []).filter(x => modulAnahtarlari.has(x)).slice(0, 30), gizli: (b.gizli || []).filter(x => modulAnahtarlari.has(x)).slice(0, 40) };
    db().prepare('UPDATE hesaplar SET tur=?, profil_json=?, moduller_json=? WHERE id=?').run(tur, JSON.stringify(profil), JSON.stringify(moduller), req.hesapId);
    O.denetimYaz(req, 'Modül tercihleri güncellendi', 'hesap', { tur });
    return { ok: true };
  });
  r.post('/ayarlar/modul-sabitle', (req) => {
    const anahtar = g.metin(req.body.modul, 40);
    if (!M.modulBul(anahtar)) throw hata(400, 'Modül bulunamadı');
    const h = db().prepare('SELECT moduller_json FROM hesaplar WHERE id=?').get(req.hesapId);
    const m = JSON.parse(h.moduller_json || '{}'); m.sabit = m.sabit || []; m.gizli = (m.gizli || []).filter(x => x !== anahtar);
    m.sabit = req.body.sabit ? [...new Set([...m.sabit, anahtar])] : m.sabit.filter(x => x !== anahtar);
    db().prepare('UPDATE hesaplar SET moduller_json=? WHERE id=?').run(JSON.stringify(m), req.hesapId);
    return { ok: true };
  });
  r.put('/ayarlar/yazdirma', { limit: 8 * 1024 * 1024 }, (req) => {
    const bayrak = req.body.bayrak_data === null ? null : (req.body.bayrak_data ? g.veriResmi(req.body.bayrak_data) : undefined);
    if (req.body.bayrak_data && !bayrak) throw hata(400, 'Görsel geçersiz');
    if (bayrak !== undefined) db().prepare('UPDATE hesaplar SET bayrak_data=? WHERE id=?').run(bayrak, req.hesapId);
    return { ok: true };
  });
  r.put('/ayarlar/personel-pin', O.rolGerekli('sahip'), (req) => {
    const pin = String(req.body.pin || '');
    if (pin && !/^\d{4,8}$/.test(pin)) throw hata(400, 'PIN 4-8 haneli rakamlardan oluşmalı');
    db().prepare('UPDATE hesaplar SET personel_pin=? WHERE id=?').run(pin ? g.sifreOzetle(pin) : null, req.hesapId);
    O.denetimYaz(req, pin ? 'Personel PIN koruması açıldı' : 'Personel PIN koruması kapatıldı', 'hesap');
    return { ok: true };
  });
  r.put('/ayarlar/entegrasyon', yonetici, (req) => {
    const ent = E.hesapEntegrasyon(req.hesapId);
    if (req.body.sms) {
      const s = req.body.sms;
      ent.sms = { saglayici: 'netgsm', kullanici: g.metin(s.kullanici, 40) || '', baslik: g.metin(s.baslik, 11) || '', sifre: s.sifre ? g.sifrele(String(s.sifre).slice(0, 100)) : (ent.sms || {}).sifre || null };
    }
    if (req.body.cloudinary) {
      const c = req.body.cloudinary;
      if (!c.cloud && !c.key) delete ent.cloudinary;
      else ent.cloudinary = { cloud: g.metin(c.cloud, 60), key: g.metin(c.key, 60), secret: c.secret ? g.sifrele(String(c.secret).slice(0, 100)) : (ent.cloudinary || {}).secret || null };
    }
    E.hesapEntegrasyonYaz(req.hesapId, ent);
    O.denetimYaz(req, 'Entegrasyon ayarları güncellendi', 'hesap');
    return { ok: true };
  });

  // ─── Kullanıcılar ───
  r.get('/kullanicilar', (req) => db().prepare('SELECT id, ad_soyad, eposta, telefon, rol, durum, son_giris, olusturma FROM kullanicilar WHERE hesap_id=? ORDER BY id').all(req.hesapId));
  r.get('/kullanicilar/secenekler', (req) => db().prepare("SELECT id, ad_soyad FROM kullanicilar WHERE hesap_id=? AND durum='aktif' ORDER BY ad_soyad").all(req.hesapId));
  r.post('/kullanicilar', yonetici, (req) => {
    const b = req.body;
    const ad = g.metin(b.ad_soyad, 100), eposta = g.eposta(b.eposta);
    if (!ad || !eposta) throw hata(400, 'Ad soyad ve geçerli e-posta gerekli');
    const ke = require('../lib/abonelik').kullaniciEklenebilir(req.hesapId);
    if (!ke.izin) throw hata(402, ke.neden, { yukseltme: true, demo: true });
    const rol = ['yonetici', 'muhasebe', 'personel', 'izleyici'].includes(b.rol) ? b.rol : 'personel';
    if (rol === 'yonetici' && req.kullanici.rol !== 'sahip') throw hata(403, 'Yönetici rolünü yalnızca hesap sahibi verebilir');
    const lim = db().prepare('SELECT kullanici_limiti FROM hesaplar WHERE id=?').get(req.hesapId).kullanici_limiti;
    if (db().prepare('SELECT COUNT(*) AS c FROM kullanicilar WHERE hesap_id=?').get(req.hesapId).c >= lim) throw hata(400, `Kullanıcı sınırına (${lim}) ulaşıldı`);
    if (db().prepare('SELECT id FROM kullanicilar WHERE eposta=?').get(eposta)) throw hata(409, 'Bu e-posta başka bir kullanıcıda kayıtlı');
    const gecici = g.rastgele(9).replace(/[-_]/g, 'x') + '7';
    const id = db().prepare('INSERT INTO kullanicilar (hesap_id, ad_soyad, eposta, telefon, sifre_hash, rol) VALUES (?,?,?,?,?,?)').run(req.hesapId, ad, eposta, g.metin(b.telefon, 30), g.sifreOzetle(gecici), rol).lastInsertRowid;
    O.denetimYaz(req, 'Kullanıcı eklendi', 'kullanici:' + id, { eposta, rol });
    return { ok: true, id, gecici_sifre: gecici };
  });
  r.put('/kullanicilar/:id', yonetici, (req) => {
    const k = sahip('kullanicilar', req.params.id, req.hesapId, 'id, rol');
    if (k.rol === 'sahip' && req.body.rol && req.body.rol !== 'sahip') throw hata(400, 'Hesap sahibinin rolü değiştirilemez');
    if (k.id === req.kullanici.id && req.body.durum === 'pasif') throw hata(400, 'Kendi hesabınızı pasifleştiremezsiniz');
    const rol = k.rol === 'sahip' ? 'sahip' : (['yonetici', 'muhasebe', 'personel', 'izleyici'].includes(req.body.rol) ? req.body.rol : k.rol);
    if (rol === 'yonetici' && k.rol !== 'yonetici' && req.kullanici.rol !== 'sahip') throw hata(403, 'Yönetici rolünü yalnızca hesap sahibi verebilir');
    db().prepare('UPDATE kullanicilar SET ad_soyad=COALESCE(?, ad_soyad), telefon=?, rol=?, durum=? WHERE id=?').run(g.metin(req.body.ad_soyad, 100), g.metin(req.body.telefon, 30), rol, req.body.durum === 'pasif' ? 'pasif' : 'aktif', k.id);
    if (req.body.durum === 'pasif') db().prepare("DELETE FROM oturumlar WHERE tip='kullanici' AND sahip_id=?").run(k.id);
    O.denetimYaz(req, 'Kullanıcı güncellendi', 'kullanici:' + k.id, { rol, durum: req.body.durum });
    return { ok: true };
  });
  r.post('/kullanicilar/:id/sifre-sifirla', yonetici, (req) => {
    const k = sahip('kullanicilar', req.params.id, req.hesapId, 'id, rol');
    if (k.rol === 'sahip' && req.kullanici.id !== k.id) throw hata(403, 'Hesap sahibinin şifresi sıfırlanamaz');
    const gecici = g.rastgele(9).replace(/[-_]/g, 'x') + '7';
    db().prepare('UPDATE kullanicilar SET sifre_hash=?, basarisiz_deneme=0, kilit_bitis=0 WHERE id=?').run(g.sifreOzetle(gecici), k.id);
    db().prepare("DELETE FROM oturumlar WHERE tip='kullanici' AND sahip_id=?").run(k.id);
    O.denetimYaz(req, 'Kullanıcı şifresi sıfırlandı', 'kullanici:' + k.id);
    return { ok: true, gecici_sifre: gecici };
  });
  r.delete('/kullanicilar/:id', yonetici, (req) => {
    const k = sahip('kullanicilar', req.params.id, req.hesapId, 'id, rol, eposta');
    if (k.rol === 'sahip') throw hata(400, 'Hesap sahibi silinemez');
    db().prepare("DELETE FROM oturumlar WHERE tip='kullanici' AND sahip_id=?").run(k.id);
    db().prepare('DELETE FROM kullanicilar WHERE id=?').run(k.id);
    O.denetimYaz(req, 'Kullanıcı silindi', 'kullanici:' + k.id, { eposta: k.eposta });
    return { ok: true };
  });

  // ─── Çöp kutusu ───
  r.get('/cop-kutusu', (req) => db().prepare('SELECT id, tur, baslik, silen, silme_tarihi, length(veri) AS boyut FROM cop_kutusu WHERE hesap_id=? ORDER BY id DESC LIMIT 1000').all(req.hesapId));
  r.get('/cop-kutusu/:id', (req) => { const c = sahip('cop_kutusu', req.params.id, req.hesapId); return { ...c, veri: JSON.parse(c.veri) }; });
  r.post('/cop-kutusu/:id/geri-yukle', (req) => {
    const c = sahip('cop_kutusu', req.params.id, req.hesapId);
    const v = JSON.parse(c.veri);
    const h = req.hesapId;
    const ekle = (tablo, satir, deg = {}) => {
      const izinli = db().kolonlar(tablo);
      const o = { ...satir, ...deg, hesap_id: h }; delete o.id;
      const k = Object.keys(o).filter(x => izinli.includes(x));
      return db().prepare(`INSERT INTO ${tablo} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...k.map(x => o[x])).lastInsertRowid;
    };
    const kurban = require('./kurban');
    db().islem(() => {
      if (c.tur === 'organizasyon') {
        const orgId = ekle('organizasyonlar', v.org);
        (v.kurbanlar || []).forEach(k => { const kid = ekle('kurbanlar', k, { organizasyon_id: orgId }); ((v.hisselerMap || {})[k.id] || []).forEach(x => { const hid = ekle('hisseler', x, { kurban_id: kid }); kurban.hisseKasaSenkron(h, hid); }); });
      } else if (c.tur === 'kurban') {
        const org = db().prepare('SELECT id FROM organizasyonlar WHERE id=? AND hesap_id=?').get(v.kurban.organizasyon_id, h);
        if (!org) throw hata(400, 'Kurbanın bağlı olduğu organizasyon silinmiş. Önce organizasyonu geri yükleyin.');
        const maxNo = db().prepare('SELECT MAX(kurban_no) AS m FROM kurbanlar WHERE organizasyon_id=? AND tur=?').get(org.id, v.kurban.tur).m || 0;
        const kid = ekle('kurbanlar', v.kurban, { kurban_no: maxNo + 1 });
        (v.hisseler || []).forEach(x => { const hid = ekle('hisseler', x, { kurban_id: kid }); kurban.hisseKasaSenkron(h, hid); });
      } else if (c.tur.startsWith('kayit:')) {
        const modul = c.tur.slice(6); const t = M.KAYIT_MODULLERI[modul];
        const id = ekle('kayitlar', v.kayit);
        if (t) require('./kayit').kasaSenkron(req, modul, t, id, JSON.parse(v.kayit.veri));
      } else if (c.tur === 'cari') ekle('cariler', v.cari);
      else if (c.tur === 'urun') ekle('urunler', v.urun);
      else if (c.tur === 'personel') { const pid = ekle('personeller', v.personel); (v.kayitlar || []).forEach(k => ekle('personel_kayitlari', k, { personel_id: pid })); }
      else if (c.tur === 'finans_hareketi') { if (v.hareket.kaynak === 'cari_hareket') throw hata(400, 'Tahsilat/ödeme hareketleri cari ekranından yeniden girilmelidir'); ekle('finans_hareketleri', v.hareket); }
      else if (c.tur === 'belge') throw hata(400, 'Silinen belgeler geri yüklenemez; aynı numarayla yeniden oluşturabilirsiniz. Belge içeriği detayda görüntülenebilir.');
      else throw hata(400, 'Bu kayıt türü geri yüklenemiyor');
      db().prepare('DELETE FROM cop_kutusu WHERE id=?').run(c.id);
    });
    if (c.tur === 'kurban' || c.tur === 'organizasyon') { const oid = c.tur === 'kurban' ? v.kurban.organizasyon_id : null; if (oid) kurban.kurbanNumaralariniDuzenle(oid); }
    O.denetimYaz(req, 'Çöp kutusundan geri yüklendi', c.tur, { baslik: c.baslik });
    return { ok: true };
  });
  r.delete('/cop-kutusu/:id', yonetici, (req) => { sahip('cop_kutusu', req.params.id, req.hesapId, 'id'); db().prepare('DELETE FROM cop_kutusu WHERE id=?').run(+req.params.id); return { ok: true }; });
  r.delete('/cop-kutusu', yonetici, (req) => { const n = db().prepare('DELETE FROM cop_kutusu WHERE hesap_id=?').run(req.hesapId).changes; O.denetimYaz(req, 'Çöp kutusu boşaltıldı', 'cop', { adet: n }); return { ok: true, silinen: n }; });

  // ─── Yedekleme ───
  r.get('/yedek/indir', yonetici, (req, res) => {
    const y = Y.hesapYedegi(req.hesapId);
    O.denetimYaz(req, 'Yedek indirildi', 'yedek');
    res.indir(Buffer.from(JSON.stringify(y)), `defterdar-yedek-${bugun()}.json`, 'application/json');
  });
  r.post('/yedek/geri-yukle', O.rolGerekli('sahip'), { limit: 200 * 1024 * 1024 }, (req) => {
    if (req.body.onay !== 'GERİ YÜKLE') throw hata(400, 'Onay metni hatalı');
    const say = Y.geriYukle(req.hesapId, req.body.yedek);
    O.denetimYaz(req, 'Yedekten geri yüklendi', 'yedek', say);
    return { ok: true, sayilar: say };
  });
  r.post('/yedek/icder-aktar', yonetici, { limit: 100 * 1024 * 1024 }, (req) => {
    const say = Y.icderAktar(req.hesapId, req.body.yedek);
    O.denetimYaz(req, 'Eski İÇDER yedeği aktarıldı', 'yedek', say);
    return { ok: true, sayilar: say };
  });

  // ─── İşlem geçmişi ───
  r.get('/denetim', yonetici, (req) => {
    const p = [req.hesapId]; let sql = 'SELECT id, kim, islem, hedef, detay, ip, tarih FROM denetim WHERE hesap_id=?';
    if (req.sorgu.q) { sql += ' AND (LOWER(islem) LIKE ? OR LOWER(kim) LIKE ? OR hedef LIKE ?)'; const l = '%' + String(req.sorgu.q).toLocaleLowerCase('tr-TR') + '%'; p.push(l, l, l); }
    if (g.tarih(req.sorgu.bas)) { sql += ' AND tarih>=?'; p.push(req.sorgu.bas); }
    if (g.tarih(req.sorgu.bit)) { sql += ' AND tarih<=?'; p.push(req.sorgu.bit + ' 23:59:59'); }
    return db().prepare(sql + ' ORDER BY id DESC LIMIT 1000').all(...p);
  });

  // ─── Destek ───
  r.get('/destek', (req) => db().prepare(`SELECT t.*, (SELECT COUNT(*) FROM destek_mesajlari m WHERE m.talep_id=t.id) AS mesaj_sayisi FROM destek_talepleri t WHERE hesap_id=? ORDER BY guncelleme DESC`).all(req.hesapId));
  r.post('/destek', (req) => {
    const hs = g.hizSinir('destek:' + req.hesapId, 10, 3600000); if (!hs.izin) throw hata(429, 'Çok fazla talep açtınız, lütfen bekleyin');
    const konu = g.metin(req.body.konu, 150), icerik = g.metin(req.body.icerik, 5000);
    if (!konu || !icerik) throw hata(400, 'Konu ve açıklama gerekli');
    const id = db().islem(() => {
      const t = db().prepare('INSERT INTO destek_talepleri (hesap_id, kullanici_id, konu, kategori, oncelik) VALUES (?,?,?,?,?)').run(req.hesapId, req.kullanici.id, konu,
        ['Genel', 'Teknik sorun', 'Öneri', 'Fatura ve ödeme', 'Veri aktarımı'].includes(req.body.kategori) ? req.body.kategori : 'Genel', ['dusuk', 'normal', 'yuksek', 'acil'].includes(req.body.oncelik) ? req.body.oncelik : 'normal').lastInsertRowid;
      db().prepare("INSERT INTO destek_mesajlari (talep_id, gonderen, gonderen_ad, icerik) VALUES (?, 'kullanici', ?, ?)").run(t, req.kullanici.ad_soyad, icerik);
      return t;
    });
    return { ok: true, id };
  });
  r.get('/destek/:id', (req) => {
    const t = sahip('destek_talepleri', req.params.id, req.hesapId);
    db().prepare('UPDATE destek_talepleri SET kullanici_okundu=1 WHERE id=?').run(t.id);
    return { talep: t, mesajlar: db().prepare('SELECT gonderen, gonderen_ad, icerik, tarih FROM destek_mesajlari WHERE talep_id=? ORDER BY id').all(t.id) };
  });
  r.post('/destek/:id/mesaj', (req) => {
    const t = sahip('destek_talepleri', req.params.id, req.hesapId);
    const icerik = g.metin(req.body.icerik, 5000); if (!icerik) throw hata(400, 'Mesaj boş olamaz');
    db().prepare("INSERT INTO destek_mesajlari (talep_id, gonderen, gonderen_ad, icerik) VALUES (?, 'kullanici', ?, ?)").run(t.id, req.kullanici.ad_soyad, icerik);
    db().prepare("UPDATE destek_talepleri SET durum='acik', admin_okundu=0, guncelleme=datetime('now') WHERE id=?").run(t.id);
    return { ok: true };
  });
  r.post('/destek/:id/kapat', (req) => {
    const t = sahip('destek_talepleri', req.params.id, req.hesapId, 'id');
    db().prepare("UPDATE destek_talepleri SET durum='kapali', guncelleme=datetime('now') WHERE id=?").run(t.id);
    return { ok: true };
  });

  // ─── SMS ───
  r.get('/sms/sablonlar', (req) => db().prepare('SELECT * FROM sms_sablonlar WHERE hesap_id=? ORDER BY ad').all(req.hesapId));
  r.post('/sms/sablonlar', (req) => {
    const ad = g.metin(req.body.ad, 80), icerik = g.metin(req.body.icerik, 900);
    if (!ad || !icerik) throw hata(400, 'Şablon adı ve metni gerekli');
    return { ok: true, id: db().prepare('INSERT INTO sms_sablonlar (hesap_id, ad, icerik) VALUES (?,?,?)').run(req.hesapId, ad, icerik).lastInsertRowid };
  });
  r.put('/sms/sablonlar/:id', (req) => {
    sahip('sms_sablonlar', req.params.id, req.hesapId, 'id');
    const ad = g.metin(req.body.ad, 80), icerik = g.metin(req.body.icerik, 900);
    if (!ad || !icerik) throw hata(400, 'Şablon adı ve metni gerekli');
    db().prepare('UPDATE sms_sablonlar SET ad=?, icerik=? WHERE id=?').run(ad, icerik, +req.params.id);
    return { ok: true };
  });
  r.delete('/sms/sablonlar/:id', (req) => { sahip('sms_sablonlar', req.params.id, req.hesapId, 'id'); db().prepare('DELETE FROM sms_sablonlar WHERE id=?').run(+req.params.id); return { ok: true }; });
  r.get('/sms/loglar', (req) => db().prepare('SELECT * FROM sms_loglar WHERE hesap_id=? ORDER BY id DESC LIMIT 1000').all(req.hesapId));
  r.delete('/sms/loglar', yonetici, (req) => { db().prepare('DELETE FROM sms_loglar WHERE hesap_id=?').run(req.hesapId); return { ok: true }; });
  // Alıcı kaynakları
  r.get('/sms/alicilar', (req) => {
    const kaynak = req.sorgu.kaynak; const h = req.hesapId;
    if (kaynak === 'kurban') {
      const org = +req.sorgu.org || 0;
      return db().prepare(`SELECT h.id, h.bagisci_adi AS ad, h.bagisci_telefon AS telefon, k.kurban_no, h.hisse_no, h.odeme_durumu, h.vekalet_onay, k.tur FROM hisseler h JOIN kurbanlar k ON k.id=h.kurban_id
        WHERE h.hesap_id=? AND k.organizasyon_id=? AND h.bagisci_adi IS NOT NULL AND h.bagisci_telefon IS NOT NULL ORDER BY k.kurban_no, h.hisse_no`).all(h, org);
    }
    if (kaynak === 'cari') return db().prepare("SELECT id, unvan AS ad, telefon, tur FROM cariler WHERE hesap_id=? AND aktif=1 AND telefon IS NOT NULL AND telefon<>'' ORDER BY unvan").all(h);
    if (kaynak === 'personel') return db().prepare("SELECT id, ad || ' ' || soyad AS ad, telefon FROM personeller WHERE hesap_id=? AND aktif=1 AND telefon IS NOT NULL ORDER BY ad").all(h);
    const modul = { bagis: 'bagislar', uye: 'uyeler', gonullu: 'gonulluler', ihtiyac: 'ihtiyac_sahipleri' }[kaynak];
    if (modul) {
      const harita = new Map();
      require('./kayit').hepsi(h, modul).forEach(k => {
        const tel = k.telefon; const ad = k.bagisci || k.ad_soyad;
        if (tel && ad && !harita.has(tel)) harita.set(tel, { id: k.id, ad, telefon: tel, durum: k.durum || k.bagis_turu || '' });
      });
      return [...harita.values()];
    }
    throw hata(400, 'Alıcı kaynağı geçersiz');
  });
  r.post('/sms/gonder', async (req) => {
    const ayar = E.smsAyar(req.hesapId);
    if (!ayar.kullanici || !ayar.sifre || !ayar.baslik) throw hata(400, 'SMS gönderimi için önce Ayarlar > Entegrasyonlar bölümünden Netgsm bilgilerini girin');
    const liste = Array.isArray(req.body.mesajlar) ? req.body.mesajlar.slice(0, 2000) : [];
    if (!liste.length) throw hata(400, 'Alıcı seçin');
    const hs = g.hizSinir('sms:' + req.hesapId, 5000, 3600000);
    if (!hs.izin) throw hata(429, 'Saatlik SMS sınırına ulaşıldı');
    const sonuc = [];
    for (const m of liste) {
      const tel = E.telefonTemizle(m.telefon); const mesaj = g.metin(m.mesaj, 900);
      if (!tel || !mesaj) { sonuc.push({ ad: m.ad, telefon: m.telefon, durum: 'hata', hata: !tel ? 'Geçersiz telefon' : 'Boş mesaj' }); continue; }
      try {
        const r2 = await E.netgsmGonder(ayar, tel, mesaj);
        db().prepare('INSERT INTO sms_loglar (hesap_id, alici_adi, telefon, mesaj, durum, kod) VALUES (?,?,?,?,?,?)').run(req.hesapId, g.metin(m.ad, 120), tel, mesaj, r2.basarili ? 'gonderildi' : 'hata', r2.kod);
        sonuc.push({ ad: m.ad, telefon: tel, durum: r2.basarili ? 'gonderildi' : 'hata', hata: r2.basarili ? null : (E.NETGSM_HATA[r2.kod] || 'Hata kodu ' + r2.kod) });
      } catch (e) {
        db().prepare('INSERT INTO sms_loglar (hesap_id, alici_adi, telefon, mesaj, durum, kod) VALUES (?,?,?,?,?,?)').run(req.hesapId, g.metin(m.ad, 120), tel, mesaj, 'hata', 'baglanti');
        sonuc.push({ ad: m.ad, telefon: tel, durum: 'hata', hata: 'SMS servisine bağlanılamadı' });
      }
    }
    const basarili = sonuc.filter(s => s.durum === 'gonderildi').length;
    O.denetimYaz(req, 'Toplu SMS gönderildi', 'sms', { basarili, hatali: sonuc.length - basarili });
    return { ok: true, basarili, hatali: sonuc.length - basarili, sonuc };
  });

  // ─── Medya deposu ───
  r.get('/medya', (req) => {
    const p = [req.hesapId]; let sql = 'SELECT id, ad, tur, mime, boyut, depolama, url, klasor, bagli_tur, bagli_id, olusturma FROM medya WHERE hesap_id=?';
    if (req.sorgu.tur) { sql += ' AND tur=?'; p.push(String(req.sorgu.tur)); }
    if (req.sorgu.klasor) { sql += ' AND klasor=?'; p.push(String(req.sorgu.klasor)); }
    const l = db().prepare(sql + ' ORDER BY id DESC LIMIT 1000').all(...p);
    const toplam = db().prepare('SELECT COALESCE(SUM(boyut),0) AS b, COUNT(*) AS n FROM medya WHERE hesap_id=?').get(req.hesapId);
    return { dosyalar: l, toplam_boyut: toplam.b, adet: toplam.n, cloudinary: !!E.cloudinaryAyar(req.hesapId) };
  });
  r.post('/medya/yukle', { ham: true, limit: 150 * 1024 * 1024 }, async (req) => {
    const buf = req.govdeHam;
    if (!buf || !buf.length) throw hata(400, 'Dosya boş');
    const mime = E.icerikTuru(buf);
    if (!mime) throw hata(415, 'Desteklenen türler: JPG, PNG, WEBP, GIF, MP4, MOV, WEBM, PDF');
    if (!mime.startsWith('video/') && buf.length > 20 * 1024 * 1024) throw hata(413, 'Görsel ve PDF dosyaları en fazla 20 MB olabilir');
    const ad = g.metin(decodeURIComponent(String(req.headers['x-dosya-adi'] || 'dosya')), 150) || 'dosya';
    const klasor = (g.metin(req.sorgu.klasor, 40) || 'genel').replace(/[^a-z0-9_-]/gi, '');
    const tur = mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'gorsel' : 'belge';
    const cl = E.cloudinaryAyar(req.hesapId);
    let kayit;
    if (cl) {
      const y = await E.cloudinaryYukle(cl, buf, mime, `defterdar/${req.hesapId}/${klasor}`);
      kayit = { depolama: 'cloudinary', public_id: y.public_id, url: y.url, yol: y.tur };
    } else {
      const dizin = path.join(MEDYA_KLASOR, String(req.hesapId));
      fs.mkdirSync(dizin, { recursive: true });
      const dosya = g.rastgele(16) + ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'application/pdf': '.pdf' }[mime]);
      fs.writeFileSync(path.join(dizin, dosya), buf);
      kayit = { depolama: 'yerel', yol: dosya, url: null };
    }
    const id = db().prepare('INSERT INTO medya (hesap_id, ad, tur, mime, boyut, depolama, yol, public_id, url, klasor) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(req.hesapId, ad, tur, mime, buf.length, kayit.depolama, kayit.yol, kayit.public_id || null, kayit.url, klasor).lastInsertRowid;
    if (!kayit.url) db().prepare('UPDATE medya SET url=? WHERE id=?').run(`/api/medya/${id}/dosya`, id);
    O.denetimYaz(req, 'Medya yüklendi', 'medya:' + id, { ad, boyut: buf.length });
    return { ok: true, id, url: kayit.url || `/api/medya/${id}/dosya`, tur };
  });
  r.get('/medya/:id/dosya', (req, res) => {
    const m = sahip('medya', req.params.id, req.hesapId);
    if (m.depolama !== 'yerel') { res.yonlendir(m.url); return; }
    const tam = path.join(MEDYA_KLASOR, String(req.hesapId), path.basename(m.yol));
    let st; try { st = fs.statSync(tam); } catch (e) { throw hata(404, 'Dosya bulunamadı'); }
    res.akis = true;
    res.setHeader('Content-Type', m.mime); res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(m.ad)}`);
    const aralik = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (aralik && m.tur === 'video') {
      const bas = aralik[1] ? +aralik[1] : 0, son = aralik[2] ? Math.min(+aralik[2], st.size - 1) : st.size - 1;
      res.statusCode = 206; res.setHeader('Content-Range', `bytes ${bas}-${son}/${st.size}`); res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Content-Length', son - bas + 1);
      fs.createReadStream(tam, { start: bas, end: son }).pipe(res);
    } else { res.setHeader('Content-Length', st.size); fs.createReadStream(tam).pipe(res); }
  });
  r.delete('/medya/:id', async (req) => {
    const m = sahip('medya', req.params.id, req.hesapId);
    if (m.depolama === 'yerel') { try { fs.unlinkSync(path.join(MEDYA_KLASOR, String(req.hesapId), path.basename(m.yol))); } catch (e) { /* */ } }
    else { const cl = E.cloudinaryAyar(req.hesapId); if (cl) { try { await E.cloudinarySil(cl, m.public_id, m.yol); } catch (e) { /* */ } } }
    db().prepare("UPDATE hisseler SET video_url=NULL, video_public_id=NULL WHERE hesap_id=? AND video_public_id=?").run(req.hesapId, String(m.id));
    db().prepare('DELETE FROM medya WHERE id=?').run(m.id);
    O.denetimYaz(req, 'Medya silindi', 'medya:' + m.id, { ad: m.ad });
    return { ok: true };
  });
  r.post('/medya/toplu-sil', async (req) => {
    const ids = idListesi(req.body.ids, 500);
    for (const id of ids) {
      const m = db().prepare('SELECT * FROM medya WHERE id=? AND hesap_id=?').get(id, req.hesapId);
      if (!m) continue;
      if (m.depolama === 'yerel') { try { fs.unlinkSync(path.join(MEDYA_KLASOR, String(req.hesapId), path.basename(m.yol))); } catch (e) { /* */ } }
      db().prepare('DELETE FROM medya WHERE id=?').run(m.id);
    }
    return { ok: true };
  });
};
