'use strict';
// /sadmin — abonelik, ödeme, demo lisanslama yönetimi
const { db } = require('../lib/db');
const g = require('../lib/guvenlik');
const { hata } = require('../lib/http');
const O = require('../lib/oturum');
const AB = require('../lib/abonelik');
const S = require('../lib/odemeSaglayici');
const E = require('../lib/eposta');
const AR = require('./abonelik');
const M = require('../moduller');

module.exports = function (app) {
  const r = app.yonlendirici('/api/sadmin');
  r.use(O.adminGerekli);
  const super_ = O.adminRol('super');
  const yazabilir = O.adminRol('super', 'destek');

  // ─── Abonelik / demo ayarları ───
  r.get('/abonelik-ayarlari', () => {
    let demo = {}; try { demo = JSON.parse(O.ayar('demo_limitleri', '{}') || '{}'); } catch (e) { /* */ }
    return {
      abonelik_aktif: O.ayar('abonelik_aktif', '1') === '1',
      abonelik_zorla: O.ayar('abonelik_zorla', '1') === '1',
      deneme_gun: +O.ayar('deneme_gun', '14'),
      pro_fiyat_aylik: +O.ayar('pro_fiyat_aylik', '499'),
      pro_fiyat_yillik: +O.ayar('pro_fiyat_yillik', '4990'),
      pro_para_birimi: O.ayar('pro_para_birimi', 'TRY'),
      demo_limitleri: AB.demoLimitleri(),
      moduller: M.MODULLER.filter(m => !m.sabit).map(m => ({ anahtar: m.anahtar, ad: m.ad })),
      smtp: {
        host: O.ayar('smtp_host', ''), port: O.ayar('smtp_port', '587'), guvenli: O.ayar('smtp_guvenli', 'starttls'),
        kullanici: O.ayar('smtp_kullanici', ''), sifre_var: !!O.ayar('smtp_sifre', ''),
        gonderen: O.ayar('smtp_gonderen', ''), gonderen_ad: O.ayar('smtp_gonderen_ad', 'Defterdar'),
      },
      fatura: {
        kurum_ad: O.ayar('fatura_kurum_ad', 'Defterdar'), adres: O.ayar('fatura_kurum_adres', ''),
        vergi: O.ayar('fatura_kurum_vergi', ''), iban: O.ayar('fatura_kurum_iban', ''),
        telefon: O.ayar('fatura_kurum_telefon', ''), eposta: O.ayar('fatura_kurum_eposta', ''), kdv_orani: +O.ayar('fatura_kdv_orani', '20'),
      },
    };
  });
  r.put('/abonelik-ayarlari', super_, (req) => {
    const b = req.body;
    const set = (k, v) => { if (v !== undefined) O.ayarYaz(k, String(v)); };
    if (b.abonelik_aktif !== undefined) set('abonelik_aktif', b.abonelik_aktif ? '1' : '0');
    if (b.abonelik_zorla !== undefined) set('abonelik_zorla', b.abonelik_zorla ? '1' : '0');
    if (b.deneme_gun !== undefined) set('deneme_gun', Math.max(0, Math.min(365, g.tamsayi(b.deneme_gun, 14))));
    if (b.pro_fiyat_aylik !== undefined) set('pro_fiyat_aylik', Math.max(0, g.sayi(b.pro_fiyat_aylik, 0)));
    if (b.pro_fiyat_yillik !== undefined) set('pro_fiyat_yillik', Math.max(0, g.sayi(b.pro_fiyat_yillik, 0)));
    if (b.pro_para_birimi !== undefined) set('pro_para_birimi', ['TRY', 'USD', 'EUR'].includes(b.pro_para_birimi) ? b.pro_para_birimi : 'TRY');
    if (b.demo_limitleri && typeof b.demo_limitleri === 'object') {
      const d = b.demo_limitleri;
      const temiz = {
        toplam_kayit: Math.max(0, g.tamsayi(d.toplam_kayit, 25)),
        kullanici: Math.max(1, g.tamsayi(d.kullanici, 1)),
        medya_mb: Math.max(0, g.tamsayi(d.medya_mb, 20)),
        moduller: {}, kapali_moduller: Array.isArray(d.kapali_moduller) ? d.kapali_moduller.filter(x => M.modulBul(x)).slice(0, 60) : [],
        ozellikler: {},
      };
      if (d.moduller && typeof d.moduller === 'object') for (const [k, v] of Object.entries(d.moduller)) { if (M.modulBul(k) && v !== '' && v != null) temiz.moduller[k] = Math.max(0, g.tamsayi(v, 0)); }
      const ozAnahtar = ['excel', 'pdf', 'sms', 'yedek', 'medya', 'toplu_islem', 'kayitli_gorunum', 'api'];
      for (const o of ozAnahtar) temiz.ozellikler[o] = !!(d.ozellikler && d.ozellikler[o]);
      O.ayarYaz('demo_limitleri', JSON.stringify(temiz));
    }
    if (b.fatura && typeof b.fatura === 'object') {
      const f = b.fatura;
      set('fatura_kurum_ad', g.metin(f.kurum_ad, 120) || 'Defterdar'); set('fatura_kurum_adres', g.metin(f.adres, 300) || '');
      set('fatura_kurum_vergi', g.metin(f.vergi, 40) || ''); set('fatura_kurum_iban', g.metin(f.iban, 40) || '');
      set('fatura_kurum_telefon', g.metin(f.telefon, 30) || ''); set('fatura_kurum_eposta', f.eposta ? (g.eposta(f.eposta) || '') : '');
      if (f.kdv_orani !== undefined) set('fatura_kdv_orani', Math.max(0, Math.min(100, g.sayi(f.kdv_orani, 20))));
    }
    if (b.smtp && typeof b.smtp === 'object') {
      const s = b.smtp;
      set('smtp_host', g.metin(s.host, 120) || ''); set('smtp_port', String(Math.max(1, Math.min(65535, g.tamsayi(s.port, 587)))));
      set('smtp_guvenli', ['ssl', 'starttls', 'yok'].includes(s.guvenli) ? s.guvenli : 'starttls');
      set('smtp_kullanici', g.metin(s.kullanici, 150) || ''); set('smtp_gonderen', s.gonderen ? (g.eposta(s.gonderen) || '') : '');
      set('smtp_gonderen_ad', g.metin(s.gonderen_ad, 80) || 'Defterdar');
      if (s.sifre) O.ayarYaz('smtp_sifre', g.sifrele(String(s.sifre).slice(0, 300)));
      if (s.sifre_sil) O.ayarYaz('smtp_sifre', '');
    }
    O.denetimYaz(req, 'Abonelik/ödeme ayarları güncellendi', 'sadmin');
    return { ok: true };
  });
  r.post('/smtp-test', super_, async (req) => {
    const alici = g.eposta(req.body.eposta); if (!alici) throw hata(400, 'Geçerli bir test e-postası girin');
    if (!E.yapili()) throw hata(400, 'Önce SMTP ayarlarını kaydedin');
    try {
      await E.gonder({ to: alici, konu: 'Defterdar SMTP test', html: '<div style="font-family:sans-serif;padding:20px"><h2 style="color:#0f766e">Defterdar SMTP testi başarılı ✓</h2><p>Bu e-postayı görüyorsanız makbuz gönderimi çalışıyor demektir.</p></div>' });
      O.denetimYaz(req, 'SMTP test e-postası gönderildi', 'sadmin', { alici });
      return { ok: true, mesaj: 'Test e-postası gönderildi: ' + alici };
    } catch (e) { throw hata(400, 'Gönderilemedi: ' + e.message); }
  });

  // ─── Ödeme sağlayıcıları ───
  r.get('/odeme-saglayicilar', () => {
    const kayitli = db().prepare('SELECT id, anahtar, ad, aktif, test_modu, sira, aciklama, guncelleme FROM odeme_saglayicilar ORDER BY sira, id').all();
    return { tipler: S.tipListesi(), saglayicilar: kayitli.map(x => ({ ...x, aktif: !!x.aktif, test_modu: !!x.test_modu, cfg: maskeli(x.anahtar) })) };
  });
  function maskeli(anahtar) {
    const s = db().prepare('SELECT yapilandirma FROM odeme_saglayicilar WHERE anahtar=?').get(anahtar);
    const cfg = s ? S.cozYapilandirma({ anahtar, yapilandirma: s.yapilandirma }) : {};
    const t = S.tipTanim(anahtar); const out = {};
    if (t) for (const a of t.alanlar) out[a.ad] = a.tip === 'sifre' ? (cfg[a.ad] ? '••••••' : '') : (cfg[a.ad] || '');
    return out;
  }
  r.post('/odeme-saglayicilar', super_, (req) => {
    const anahtar = g.metin(req.body.anahtar, 40);
    if (!S.tipTanim(anahtar)) throw hata(400, 'Geçersiz sağlayıcı tipi');
    const mevcut = db().prepare('SELECT * FROM odeme_saglayicilar WHERE anahtar=?').get(anahtar);
    const yap = S.yapilandirmaSifrele(anahtar, req.body.cfg || {}, mevcut);
    const ad = g.metin(req.body.ad, 80) || S.tipTanim(anahtar).ad;
    const aktif = req.body.aktif ? 1 : 0, test = req.body.test_modu ? 1 : 0;
    const aciklama = g.metin(req.body.aciklama, 300);
    if (mevcut) db().prepare("UPDATE odeme_saglayicilar SET ad=?, aktif=?, test_modu=?, yapilandirma=?, aciklama=?, guncelleme=datetime('now') WHERE anahtar=?").run(ad, aktif, test, yap, aciklama, anahtar);
    else db().prepare('INSERT INTO odeme_saglayicilar (anahtar, ad, aktif, test_modu, yapilandirma, aciklama) VALUES (?,?,?,?,?,?)').run(anahtar, ad, aktif, test, yap, aciklama);
    O.denetimYaz(req, 'Ödeme sağlayıcı kaydedildi', 'saglayici:' + anahtar, { aktif: !!aktif });
    return { ok: true };
  });
  r.delete('/odeme-saglayicilar/:anahtar', super_, (req) => {
    db().prepare('DELETE FROM odeme_saglayicilar WHERE anahtar=?').run(req.params.anahtar);
    O.denetimYaz(req, 'Ödeme sağlayıcı silindi', 'saglayici:' + req.params.anahtar);
    return { ok: true };
  });

  // ─── Abonelikler ───
  r.get('/abonelik-ozet', () => {
    const d = db();
    const say = (sql, ...p) => d.prepare(sql).get(...p).c;
    const ay = AB.donem();
    return {
      pro: say("SELECT COUNT(*) AS c FROM abonelikler WHERE plan='pro' AND durum IN ('aktif','iptal')"),
      deneme: say("SELECT COUNT(*) AS c FROM abonelikler WHERE plan='demo' AND durum='deneme'"),
      demo: say("SELECT COUNT(*) AS c FROM abonelikler WHERE plan='demo' AND durum<>'deneme'"),
      iptal: say("SELECT COUNT(*) AS c FROM abonelikler WHERE durum='iptal'"),
      gelir_ay: d.prepare("SELECT COALESCE(SUM(tutar),0) AS c FROM odemeler WHERE durum='basarili' AND donem=?").get(ay).c,
      gelir_toplam: d.prepare("SELECT COALESCE(SUM(tutar),0) AS c FROM odemeler WHERE durum='basarili'").get().c,
      bekleyen_odeme: say("SELECT COUNT(*) AS c FROM odemeler WHERE durum='bekliyor'"),
      aylik_seri: d.prepare("SELECT donem, COALESCE(SUM(tutar),0) AS tutar, COUNT(*) AS adet FROM odemeler WHERE durum='basarili' GROUP BY donem ORDER BY donem DESC LIMIT 12").all(),
    };
  });
  r.get('/abonelikler', (req) => {
    let l = db().prepare(`SELECT a.*, h.ad AS hesap_ad, h.tur AS hesap_tur, h.eposta AS hesap_eposta,
        (SELECT COALESCE(SUM(tutar),0) FROM odemeler o WHERE o.hesap_id=a.hesap_id AND o.durum='basarili') AS odenen_toplam,
        (SELECT COUNT(*) FROM odemeler o WHERE o.hesap_id=a.hesap_id AND o.durum='basarili') AS odeme_sayisi
      FROM abonelikler a JOIN hesaplar h ON h.id=a.hesap_id ORDER BY a.guncelleme DESC`).all();
    const q = (req.sorgu.q || '').toLocaleLowerCase('tr-TR');
    if (q) l = l.filter(a => [a.hesap_ad, a.hesap_eposta, String(a.hesap_id)].some(x => x && String(x).toLocaleLowerCase('tr-TR').includes(q)));
    if (req.sorgu.plan) l = l.filter(a => a.plan === req.sorgu.plan);
    if (req.sorgu.durum) l = l.filter(a => a.durum === req.sorgu.durum);
    return l;
  });
  r.get('/abonelikler/:hesapId', (req) => {
    const hid = +req.params.hesapId;
    const a = db().prepare('SELECT a.*, h.ad AS hesap_ad, h.eposta AS hesap_eposta FROM abonelikler a JOIN hesaplar h ON h.id=a.hesap_id WHERE a.hesap_id=?').get(hid);
    if (!a) throw hata(404, 'Abonelik bulunamadı');
    return { abonelik: a, odemeler: AB.odemeler(hid) };
  });
  r.post('/abonelikler/:hesapId/pro-yap', super_, (req) => {
    const hid = +req.params.hesapId;
    if (!db().prepare('SELECT id FROM hesaplar WHERE id=?').get(hid)) throw hata(404, 'Hesap bulunamadı');
    const periyot = req.body.periyot === 'yillik' ? 'yillik' : 'aylik';
    const ay = Math.max(1, g.tamsayi(req.body.ay, periyot === 'yillik' ? 12 : 1));
    AB.getir(hid);
    // Elle Pro: belirtilen süre kadar ileri al (ücretsiz/manuel)
    for (let i = 0; i < (periyot === 'yillik' ? ay / 12 : ay); i++) AB.proAktiflestir(hid, { periyot, tutar: 0, saglayici: 'manuel', otomatik_yenile: req.body.otomatik_yenile ? 1 : 0 });
    if (req.body.odeme_kaydi) AB.odemeKaydet(hid, { tutar: g.sayi(req.body.tutar, 0), durum: 'basarili', periyot, saglayici: 'manuel', aciklama: 'Yönetici tarafından tanımlandı' });
    O.denetimYaz(req, 'Hesaba Pro tanımlandı (yönetici)', 'hesap:' + hid, { hesap_id: hid, periyot, ay });
    return { ok: true };
  });
  r.post('/abonelikler/:hesapId/iptal', yazabilir, (req) => {
    const hid = +req.params.hesapId;
    AB.iptalEt(hid, 'Yönetici: ' + (req.admin.kullanici_adi || ''));
    O.denetimYaz(req, 'Abonelik iptal edildi (yönetici)', 'hesap:' + hid, { hesap_id: hid });
    return { ok: true };
  });
  r.post('/abonelikler/:hesapId/demo', super_, (req) => {
    const hid = +req.params.hesapId;
    AB.demoyaDondur(hid, 'bitti');
    O.denetimYaz(req, 'Hesap demoya alındı (yönetici)', 'hesap:' + hid, { hesap_id: hid });
    return { ok: true };
  });

  // ─── Ödemeler ───
  r.get('/odemeler', (req) => {
    let l = db().prepare(`SELECT o.*, h.ad AS hesap_ad FROM odemeler o JOIN hesaplar h ON h.id=o.hesap_id ORDER BY o.id DESC LIMIT 2000`).all();
    const q = (req.sorgu.q || '').toLocaleLowerCase('tr-TR');
    if (q) l = l.filter(o => [o.hesap_ad, o.makbuz_no, String(o.hesap_id)].some(x => x && String(x).toLocaleLowerCase('tr-TR').includes(q)));
    if (req.sorgu.durum) l = l.filter(o => o.durum === req.sorgu.durum);
    if (req.sorgu.saglayici) l = l.filter(o => o.saglayici === req.sorgu.saglayici);
    return l;
  });
  // Bekleyen (manuel/havale) ödemeyi onayla → Pro aktif + makbuz
  r.post('/odemeler/:id/onayla', yazabilir, (req) => {
    const o = db().prepare('SELECT * FROM odemeler WHERE id=?').get(+req.params.id); if (!o) throw hata(404, 'Ödeme bulunamadı');
    if (o.durum === 'basarili') throw hata(400, 'Bu ödeme zaten onaylı');
    AR.basariliOdeme({ hesapId: o.hesap_id, saglayici: o.saglayici || 'manuel', islem_no: o.saglayici_islem_no, kart_ozet: o.kart_ozet || 'Banka havalesi', ref: null, periyot: o.periyot, tutar: o.tutar, odemeId: o.id });
    O.denetimYaz(req, 'Ödeme onaylandı (yönetici)', 'odeme:' + o.id, { hesap_id: o.hesap_id, tutar: o.tutar });
    return { ok: true };
  });
  r.post('/odemeler/:id/iade', super_, (req) => {
    const o = db().prepare('SELECT * FROM odemeler WHERE id=?').get(+req.params.id); if (!o) throw hata(404, 'Ödeme bulunamadı');
    db().prepare("UPDATE odemeler SET durum='iade', hata_mesaji=? WHERE id=?").run(g.metin(req.body.neden, 200) || 'İade edildi', o.id);
    O.denetimYaz(req, 'Ödeme iade olarak işaretlendi', 'odeme:' + o.id, { hesap_id: o.hesap_id });
    return { ok: true };
  });
  r.post('/odemeler/:id/makbuz-gonder', yazabilir, async (req) => {
    const o = db().prepare('SELECT * FROM odemeler WHERE id=?').get(+req.params.id); if (!o) throw hata(404, 'Ödeme bulunamadı');
    if (o.durum !== 'basarili') throw hata(400, 'Yalnızca başarılı ödemeler için makbuz gönderilir');
    const hesap = db().prepare('SELECT id, ad, eposta, vergi_no, adres, il, telefon FROM hesaplar WHERE id=?').get(o.hesap_id);
    if (!E.yapili()) throw hata(400, 'Önce SMTP ayarlarını girin');
    await E.makbuzGonder(o, hesap);
    db().prepare('UPDATE odemeler SET mail_gonderildi=1 WHERE id=?').run(o.id);
    O.denetimYaz(req, 'Makbuz yeniden gönderildi', 'odeme:' + o.id, { hesap_id: o.hesap_id });
    return { ok: true, mesaj: 'Makbuz gönderildi: ' + (hesap.eposta || '') };
  });
  r.get('/odemeler/:id/makbuz', (req, res) => {
    const o = db().prepare('SELECT * FROM odemeler WHERE id=?').get(+req.params.id); if (!o) throw hata(404, 'Ödeme bulunamadı');
    const hesap = db().prepare('SELECT id, ad, eposta, vergi_no, adres, il, telefon FROM hesaplar WHERE id=?').get(o.hesap_id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.akis = true;
    res.end(E.makbuzHtml(o, hesap));
  });
};
