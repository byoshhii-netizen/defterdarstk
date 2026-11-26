'use strict';
// Kullanıcı tarafı abonelik ve ödeme uç noktaları + ödeme sağlayıcı bildirim/dönüş uçları.
const { db } = require('../lib/db');
const g = require('../lib/guvenlik');
const { hata } = require('../lib/http');
const O = require('../lib/oturum');
const AB = require('../lib/abonelik');
const S = require('../lib/odemeSaglayici');
const E = require('../lib/eposta');

function hesapKisa(hesapId) {
  return db().prepare('SELECT id, ad, eposta, vergi_no, adres, il, telefon FROM hesaplar WHERE id=?').get(hesapId);
}

// Başarılı ödeme sonrası ortak işlem: Pro aktifleştir + ödeme kaydını tamamla + makbuz postala
function basariliOdeme({ hesapId, saglayici, islem_no, kart_ozet, ref, periyot, tutar, odemeId }) {
  const a = AB.getir(hesapId);
  const per = periyot || 'aylik';
  const yeni = AB.proAktiflestir(hesapId, { periyot: per, tutar, saglayici, saglayici_ref: ref, odeme_ozet: kart_ozet });
  let odeme;
  if (odemeId) {
    db().prepare("UPDATE odemeler SET durum='basarili', makbuz_no=?, saglayici_islem_no=COALESCE(?, saglayici_islem_no), kart_ozet=COALESCE(?, kart_ozet), hata_mesaji=NULL WHERE id=?")
      .run(AB.makbuzNo(), islem_no, kart_ozet, odemeId);
    odeme = db().prepare('SELECT * FROM odemeler WHERE id=?').get(odemeId);
  } else {
    odeme = AB.odemeKaydet(hesapId, { abonelik_id: a.id, tutar, durum: 'basarili', periyot: per, saglayici, saglayici_islem_no: islem_no, kart_ozet, aciklama: 'Defterdar Pro aboneliği' });
  }
  // Makbuzu e-posta ile gönder (engellemeden)
  makbuzPostala(odeme.id, hesapId);
  return { abonelik: yeni, odeme };
}

function makbuzPostala(odemeId, hesapId) {
  Promise.resolve().then(async () => {
    try {
      const odeme = db().prepare('SELECT * FROM odemeler WHERE id=?').get(odemeId);
      const hesap = hesapKisa(hesapId);
      if (!odeme || !hesap || !E.yapili()) return;
      await E.makbuzGonder(odeme, hesap);
      db().prepare('UPDATE odemeler SET mail_gonderildi=1 WHERE id=?').run(odemeId);
    } catch (e) { console.error('[MAKBUZ-MAIL]', e.message); }
  });
}

// ─── Otomatik aylık/yıllık tahsilat (zamanlayıcıdan çağrılır) ───
// Süresi dolan Pro abonelikleri: otomatik yenileme açıksa tahsil et, değilse demoya düşür.
function otomatikTahsilat() {
  const bugun = AB.BUGUN();
  const bitenler = db().prepare("SELECT * FROM abonelikler WHERE plan='pro' AND donem_bitis IS NOT NULL AND donem_bitis < ?").all(bugun);
  let yenilenen = 0, dusen = 0, basarisiz = 0;
  for (const a of bitenler) {
    try {
      if (!a.otomatik_yenile || a.durum === 'iptal') { AB.demoyaDondur(a.hesap_id, 'bitti'); dusen++; continue; }
      const sag = a.saglayici ? S.saglayiciGetir(a.saglayici) : null;
      if (!sag || !sag.tip || !sag.tip.tahsilEt) { markGecikti(a); basarisiz++; continue; }
      // Senkron bağlamda çalışır; gerçek sağlayıcı çağrısı Promise döndürür — yut ve sonra işle
      Promise.resolve(sag.tip.tahsilEt(sag.cfg, { abonelik: a, tutar: a.tutar, para: a.para_birimi })).then((r) => {
        if (r && r.basarili) basariliOdeme({ hesapId: a.hesap_id, saglayici: a.saglayici, islem_no: r.islem_no, kart_ozet: r.kart_ozet || a.odeme_ozet, ref: a.saglayici_ref, periyot: a.periyot, tutar: a.tutar });
        else markGecikti(a);
      }).catch(() => markGecikti(a));
      yenilenen++;
    } catch (e) { console.error('[TAHSILAT]', e.message); }
  }
  if (bitenler.length) console.log(`[TAHSILAT] ${bitenler.length} dönem sonu: ${yenilenen} tahsilat denendi, ${dusen} demoya düştü`);
  return { denenen: bitenler.length, yenilenen, dusen, basarisiz };
}
function markGecikti(a) {
  // 3 günlük ödemesiz süre sonra demoya düşür
  const gecikme = AB.gunFark(a.donem_bitis);
  db().prepare("UPDATE abonelikler SET durum='gecikti', guncelleme=datetime('now') WHERE hesap_id=?").run(a.hesap_id);
  if (gecikme < -3) AB.demoyaDondur(a.hesap_id, 'gecikti');
}

module.exports = function (app) {
  // ─── Kullanıcı tarafı (oturum gerekli) ───
  const r = app.yonlendirici('/api/abonelik');
  r.use(O.kullaniciGerekli);
  const yonetici = O.rolGerekli('yonetici');

  r.get('/durum', (req) => ({
    ...AB.durum(req.hesapId),
    saglayicilar: S.aktifSaglayicilar(),
    odemeler: AB.odemeler(req.hesapId).map(o => ({ id: o.id, makbuz_no: o.makbuz_no, tarih: o.tarih, donem: o.donem, tutar: o.tutar, para_birimi: o.para_birimi, durum: o.durum, plan: o.plan, periyot: o.periyot, saglayici: o.saglayici, kart_ozet: o.kart_ozet, aciklama: o.aciklama })),
  }));

  r.get('/odemeler', (req) => AB.odemeler(req.hesapId));

  // Makbuz indir / görüntüle (markalı HTML)
  r.get('/odemeler/:id/makbuz', (req, res) => {
    const odeme = AB.odemeGetir(req.hesapId, +req.params.id);
    if (!odeme) throw hata(404, 'Makbuz bulunamadı');
    if (odeme.durum !== 'basarili') throw hata(400, 'Bu ödeme için makbuz düzenlenmemiş');
    const hesap = hesapKisa(req.hesapId);
    const html = E.makbuzHtml(odeme, hesap);
    if (req.sorgu.indir === '1') {
      res.indir(Buffer.from(html, 'utf8'), `Defterdar-Makbuz-${odeme.makbuz_no}.html`, 'text/html; charset=utf-8');
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
      res.akis = true; res.end(html);
    }
  });

  // Aboneliği başlat / Pro'ya geç
  r.post('/baslat', yonetici, async (req) => {
    if (!AB.sistemAcik()) throw hata(400, 'Abonelik sistemi kapalı');
    const periyot = req.body.periyot === 'yillik' ? 'yillik' : 'aylik';
    const anahtar = g.metin(req.body.saglayici, 40);
    const sag = S.saglayiciGetir(anahtar);
    if (!sag || !sag.aktif) throw hata(400, 'Geçerli bir ödeme yöntemi seçin');
    const f = AB.fiyatlar();
    const tutar = periyot === 'yillik' ? f.yillik : f.aylik;
    if (!(tutar > 0)) throw hata(400, 'Ücret tanımlı değil. Yönetici fiyatı belirlemeli.');
    const hesap = hesapKisa(req.hesapId);
    const a = AB.getir(req.hesapId);
    const taban = (req.headers['x-forwarded-proto'] ? req.headers['x-forwarded-proto'] : (req.guvenli ? 'https' : 'http')) + '://' + (req.headers['x-forwarded-host'] || req.headers.host);
    const ctx = { hesap, abonelik: a, tutar, periyot, para: f.para, donem: AB.donem(), donusUrl: taban + '/api/odeme-donus/' + anahtar, ip: req.ip, test: !!sag.test_modu };

    const sonuc = await sag.tip.baslat(sag.cfg, ctx);

    if (sonuc.yontem === 'aninda') {
      if (!sonuc.sonuc.basarili) throw hata(402, 'Ödeme alınamadı');
      const r2 = basariliOdeme({ hesapId: req.hesapId, saglayici: anahtar, islem_no: sonuc.sonuc.islem_no, kart_ozet: sonuc.sonuc.kart_ozet, ref: sonuc.sonuc.ref, periyot, tutar });
      O.denetimYaz(req, 'Pro aboneliği başlatıldı', 'abonelik', { saglayici: anahtar, periyot, tutar });
      return { ok: true, yontem: 'tamam', makbuz_id: r2.odeme.id, durum: AB.durum(req.hesapId) };
    }
    if (sonuc.yontem === 'yonlendirme') {
      // Bekleyen ödeme kaydı oluştur (webhook/dönüşte eşleştirilecek)
      const odeme = AB.odemeKaydet(req.hesapId, { abonelik_id: a.id, tutar, durum: 'bekliyor', periyot, saglayici: anahtar, saglayici_islem_no: sonuc.token || null, aciklama: 'Defterdar Pro aboneliği' });
      O.denetimYaz(req, 'Ödeme başlatıldı (yönlendirme)', 'abonelik', { saglayici: anahtar });
      return { ok: true, yontem: 'yonlendirme', url: sonuc.url, odeme_id: odeme.id };
    }
    if (sonuc.yontem === 'talimat') {
      const odeme = AB.odemeKaydet(req.hesapId, { abonelik_id: a.id, tutar, durum: 'bekliyor', periyot, saglayici: anahtar, aciklama: 'Banka havalesi bekleniyor' });
      db().prepare("UPDATE abonelikler SET durum='odeme_bekliyor', guncelleme=datetime('now') WHERE hesap_id=?").run(req.hesapId);
      return { ok: true, yontem: 'talimat', talimat: sonuc.talimat, odeme_id: odeme.id };
    }
    throw hata(500, 'Bilinmeyen ödeme yöntemi');
  });

  r.post('/iptal', yonetici, (req) => {
    const a = AB.getir(req.hesapId);
    if (a.plan !== 'pro') throw hata(400, 'Aktif bir Pro aboneliğiniz yok');
    if (a.durum === 'iptal') throw hata(400, 'Abonelik zaten iptal edildi');
    AB.iptalEt(req.hesapId, req.kullanici.ad_soyad);
    O.denetimYaz(req, 'Abonelik iptal edildi', 'abonelik');
    return { ok: true, durum: AB.durum(req.hesapId) };
  });

  // İptali geri al (dönem içindeyse otomatik yenilemeyi tekrar aç)
  r.post('/surdur', yonetici, (req) => {
    const a = AB.getir(req.hesapId);
    if (a.durum !== 'iptal' || !AB.proGecerli(a)) throw hata(400, 'Sürdürülecek bir abonelik yok');
    db().prepare("UPDATE abonelikler SET durum='aktif', otomatik_yenile=1, sonraki_odeme=donem_bitis, iptal_tarihi=NULL, guncelleme=datetime('now') WHERE hesap_id=?").run(req.hesapId);
    O.denetimYaz(req, 'Abonelik sürdürüldü', 'abonelik');
    return { ok: true, durum: AB.durum(req.hesapId) };
  });

  // ─── Ödeme sağlayıcı bildirimleri (oturum gerekmez) ───
  const acik = app.yonlendirici('');

  // Webhook (Stripe/PayTR vb. sunucu-sunucu bildirimi)
  acik.post('/api/odeme-bildirim/:saglayici', { ham: true, limit: 1024 * 1024 }, async (req, res) => {
    const sag = S.saglayiciGetir(req.params.saglayici);
    if (!sag || !sag.tip.dogrula) { res.statusCode = 404; res.end('yok'); return; }
    let body = {};
    try { body = req.govdeHam && req.govdeHam.length ? JSON.parse(req.govdeHam.toString('utf8')) : {}; }
    catch (e) { body = Object.fromEntries(new URLSearchParams(req.govdeHam.toString('utf8'))); }
    try {
      const d = await sag.tip.dogrula(sag.cfg, { body, req, ham: req.govdeHam ? req.govdeHam.toString('utf8') : '' });
      if (d.yoksay) { res.statusCode = 200; res.end('ok'); return; }
      const hesapId = d.hesapId || eslesenHesap(req.params.saglayici, d.islem_no);
      if (d.basarili && hesapId) {
        const bekleyen = db().prepare("SELECT * FROM odemeler WHERE hesap_id=? AND durum='bekliyor' AND saglayici=? ORDER BY id DESC LIMIT 1").get(hesapId, req.params.saglayici);
        basariliOdeme({ hesapId, saglayici: req.params.saglayici, islem_no: d.islem_no, kart_ozet: d.kart_ozet, ref: d.ref, periyot: bekleyen ? bekleyen.periyot : 'aylik', tutar: d.tutar || (bekleyen ? bekleyen.tutar : 0), odemeId: bekleyen ? bekleyen.id : null });
      } else if (!d.basarili && hesapId) {
        db().prepare("UPDATE odemeler SET durum='basarisiz', hata_mesaji=? WHERE hesap_id=? AND durum='bekliyor' AND saglayici=?").run('Sağlayıcı ödemeyi onaylamadı', hesapId, req.params.saglayici);
      }
      res.statusCode = 200; res.setHeader('Content-Type', 'text/plain'); res.end(d.yanit || 'OK');
    } catch (e) {
      console.error('[ODEME-WEBHOOK]', req.params.saglayici, e.message);
      res.statusCode = 400; res.end('hata');
    }
  });

  // Kullanıcı yönlendirme dönüşü (iyzico callback POST veya başarı GET'i)
  const donus = async (req, res) => {
    const sag = S.saglayiciGetir(req.params.saglayici);
    if (!sag) { res.yonlendir('/abonelik?durum=hata'); return; }
    try {
      if (sag.tip.dogrula && (req.body && Object.keys(req.body).length || req.sorgu.token)) {
        const d = await sag.tip.dogrula(sag.cfg, { body: { ...req.sorgu, ...req.body }, req });
        const hesapId = d.hesapId || eslesenHesap(req.params.saglayici, d.islem_no);
        if (d.basarili && hesapId) {
          const bekleyen = db().prepare("SELECT * FROM odemeler WHERE hesap_id=? AND durum='bekliyor' AND saglayici=? ORDER BY id DESC LIMIT 1").get(hesapId, req.params.saglayici);
          basariliOdeme({ hesapId, saglayici: req.params.saglayici, islem_no: d.islem_no, kart_ozet: d.kart_ozet, ref: d.ref, periyot: bekleyen ? bekleyen.periyot : 'aylik', tutar: d.tutar || (bekleyen ? bekleyen.tutar : 0), odemeId: bekleyen ? bekleyen.id : null });
          res.yonlendir('/abonelik?durum=basarili'); return;
        }
      }
    } catch (e) { console.error('[ODEME-DONUS]', e.message); }
    res.yonlendir('/abonelik?durum=' + (req.sorgu.durum === 'iptal' ? 'iptal' : 'beklemede'));
  };
  acik.get('/api/odeme-donus/:saglayici', donus);
  acik.post('/api/odeme-donus/:saglayici', { ham: false }, donus);
};

// Sağlayıcı işlem numarasından hesap bulma (bekleyen ödeme üzerinden)
function eslesenHesap(saglayici, islem_no) {
  if (!islem_no) return null;
  const o = db().prepare("SELECT hesap_id FROM odemeler WHERE saglayici=? AND saglayici_islem_no=? ORDER BY id DESC LIMIT 1").get(saglayici, String(islem_no));
  return o ? o.hesap_id : null;
}

module.exports.basariliOdeme = basariliOdeme;
module.exports.makbuzPostala = makbuzPostala;
module.exports.otomatikTahsilat = otomatikTahsilat;
