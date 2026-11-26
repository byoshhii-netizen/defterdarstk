'use strict';
// Takılabilir ödeme sağlayıcı altyapısı.
// Yönetici panelden bir sağlayıcı ekleyip anahtarlarını girer; anahtarlar şifreli saklanır.
// Her sağlayıcı tipi aynı arayüzü uygular: baslat(), tahsilEt(), webhookDogrula().
const crypto = require('crypto');
const { db } = require('./db');
const g = require('./guvenlik');

// ─── Sağlayıcı tipleri (katalog) ───
// alanlar: yöneticinin gireceği yapılandırma alanları (sifre tipi şifreli saklanır)
const TIPLER = {
  test: {
    ad: 'Test / Sanal (anında onay)', turu: 'aninda', gercek: false,
    aciklama: 'Gerçek para çekmeden tüm abonelik akışını test etmek için. Her ödeme başarılı sayılır.',
    alanlar: [],
    async baslat() { return { yontem: 'aninda', sonuc: { basarili: true, islem_no: 'TEST-' + g.rastgele(10), kart_ozet: 'Test kartı •••• 4242', ref: 'test_' + g.rastgele(8) } }; },
    async tahsilEt() { return { basarili: true, islem_no: 'TEST-' + g.rastgele(10), kart_ozet: 'Test kartı •••• 4242' }; },
  },

  manuel: {
    ad: 'Banka havalesi / EFT (manuel onay)', turu: 'manuel', gercek: true,
    aciklama: 'Kullanıcı IBAN\'a havale yapar; yönetici ödemeyi panelden onaylar.',
    alanlar: [
      { ad: 'iban', etiket: 'IBAN', tip: 'metin', zorunlu: true },
      { ad: 'hesap_sahibi', etiket: 'Hesap sahibi / unvan', tip: 'metin', zorunlu: true },
      { ad: 'banka', etiket: 'Banka', tip: 'metin' },
      { ad: 'aciklama', etiket: 'Açıklama / talimat', tip: 'uzun' },
    ],
    async baslat(cfg, ctx) {
      return { yontem: 'talimat', talimat: {
        iban: cfg.iban, hesap_sahibi: cfg.hesap_sahibi, banka: cfg.banka || '',
        aciklama: cfg.aciklama || '', referans: `DP-${ctx.hesap.id}-${ctx.donem}`,
        tutar: ctx.tutar, para: ctx.para,
      } };
    },
    async tahsilEt() { return { basarili: false, beklemede: true, mesaj: 'Havale ödemeleri otomatik yenilenemez; kullanıcı yeniden havale yapmalıdır.' }; },
  },

  iyzico: {
    ad: 'iyzico', turu: 'yonlendirme', gercek: true,
    aciklama: 'iyzico Checkout Form ile kredi kartı tahsilatı (Türkiye). API anahtarlarını iyzico panelinden alın.',
    alanlar: [
      { ad: 'api_key', etiket: 'API Key', tip: 'metin', zorunlu: true },
      { ad: 'secret', etiket: 'Secret Key', tip: 'sifre', zorunlu: true },
      { ad: 'taban', etiket: 'Taban URL', tip: 'metin', yardim: 'Canlı: https://api.iyzipay.com — Test: https://sandbox-api.iyzipay.com', zorunlu: true },
    ],
    async baslat(cfg, ctx) {
      const govde = {
        locale: 'tr', conversationId: String(ctx.odemeId || ctx.hesap.id),
        price: ctx.tutar.toFixed(2), paidPrice: ctx.tutar.toFixed(2), currency: ctx.para || 'TRY',
        basketId: 'DP-' + ctx.hesap.id, paymentGroup: 'SUBSCRIPTION', callbackUrl: ctx.donusUrl,
        buyer: { id: 'H' + ctx.hesap.id, name: ctx.hesap.ad || 'Abone', surname: '-', email: ctx.hesap.eposta || 'abone@defterdar', identityNumber: '11111111111', registrationAddress: ctx.hesap.adres || 'Türkiye', city: ctx.hesap.il || 'İstanbul', country: 'Turkey', ip: ctx.ip || '85.34.78.112' },
        billingAddress: { contactName: ctx.hesap.ad || 'Abone', city: ctx.hesap.il || 'İstanbul', country: 'Turkey', address: ctx.hesap.adres || 'Türkiye' },
        basketItems: [{ id: 'PRO', name: 'Defterdar Pro', category1: 'Yazılım', itemType: 'VIRTUAL', price: ctx.tutar.toFixed(2) }],
      };
      const j = await iyzicoIstek(cfg, '/payment/iyzipos/checkoutform/initialize/auth/ecom', govde);
      if (j.status !== 'success') throw new Error('iyzico: ' + (j.errorMessage || 'başlatılamadı'));
      return { yontem: 'yonlendirme', url: j.paymentPageUrl, token: j.token };
    },
    async dogrula(cfg, { body }) {
      const token = body.token; if (!token) throw new Error('iyzico token yok');
      const j = await iyzicoIstek(cfg, '/payment/iyzipos/checkoutform/auth/ecom/detail', { locale: 'tr', token });
      const basarili = j.status === 'success' && j.paymentStatus === 'SUCCESS';
      return { basarili, islem_no: j.paymentId || token, kart_ozet: j.cardAssociation ? `${j.cardAssociation} •••• ${j.lastFourDigits || ''}` : null, ref: j.cardUserKey || token, tutar: Number(j.paidPrice) || null, conversationId: j.conversationId };
    },
    async tahsilEt() { return { basarili: false, beklemede: true, mesaj: 'Kayıtlı kartla otomatik tahsilat için iyzico abonelik (subscription) ürünü gerekir.' }; },
  },

  stripe: {
    ad: 'Stripe', turu: 'yonlendirme', gercek: true,
    aciklama: 'Stripe Checkout ile kartlı ödeme (uluslararası). Gizli anahtarı Stripe panelinden alın.',
    alanlar: [
      { ad: 'secret', etiket: 'Secret Key (sk_...)', tip: 'sifre', zorunlu: true },
      { ad: 'webhook_sir', etiket: 'Webhook imza sırrı (whsec_...)', tip: 'sifre' },
    ],
    async baslat(cfg, ctx) {
      const alanlar = {
        mode: 'payment', success_url: ctx.donusUrl + '?durum=basarili', cancel_url: ctx.donusUrl + '?durum=iptal',
        'client_reference_id': String(ctx.hesap.id), 'customer_email': ctx.hesap.eposta || '',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': (ctx.para || 'try').toLowerCase(),
        'line_items[0][price_data][unit_amount]': String(Math.round(ctx.tutar * 100)),
        'line_items[0][price_data][product_data][name]': 'Defterdar Pro (' + (ctx.periyot === 'yillik' ? 'Yıllık' : 'Aylık') + ')',
        'metadata[hesap_id]': String(ctx.hesap.id), 'metadata[donem]': ctx.donem || '',
      };
      const j = await stripeIstek(cfg, '/v1/checkout/sessions', alanlar);
      if (!j.url) throw new Error('Stripe: ' + ((j.error && j.error.message) || 'oturum oluşturulamadı'));
      return { yontem: 'yonlendirme', url: j.url, token: j.id };
    },
    async dogrula(cfg, { body, req, ham }) {
      // Webhook: checkout.session.completed
      if (cfg.webhook_sir && req) stripeWebhookDogrula(cfg.webhook_sir, ham, req.headers['stripe-signature']);
      const olay = body;
      const obj = olay && olay.data && olay.data.object;
      if (!obj || olay.type !== 'checkout.session.completed') return { basarili: false, yoksay: true };
      return { basarili: obj.payment_status === 'paid', hesapId: +(obj.metadata && obj.metadata.hesap_id || obj.client_reference_id), islem_no: obj.payment_intent || obj.id, ref: obj.customer || null, tutar: obj.amount_total ? obj.amount_total / 100 : null, kart_ozet: 'Stripe' };
    },
    async tahsilEt() { return { basarili: false, beklemede: true, mesaj: 'Stripe otomatik yenileme için Subscription/Price yapısı gerekir.' }; },
  },

  paytr: {
    ad: 'PayTR', turu: 'yonlendirme', gercek: true,
    aciklama: 'PayTR iFrame API ile kartlı ödeme (Türkiye).',
    alanlar: [
      { ad: 'merchant_id', etiket: 'Mağaza No', tip: 'metin', zorunlu: true },
      { ad: 'merchant_key', etiket: 'Mağaza Key', tip: 'sifre', zorunlu: true },
      { ad: 'merchant_salt', etiket: 'Mağaza Salt', tip: 'sifre', zorunlu: true },
    ],
    async baslat(cfg, ctx) {
      const tutarKr = Math.round(ctx.tutar * 100);
      const sepet = Buffer.from(JSON.stringify([['Defterdar Pro', String(tutarKr), 1]])).toString('base64');
      const merchant_oid = 'DP' + ctx.hesap.id + 'D' + (ctx.donem || '').replace('-', '') + 'X' + Date.now().toString(36);
      const email = ctx.hesap.eposta || 'abone@defterdar.com';
      const user_ip = ctx.ip || '85.34.78.112';
      const birlesim = cfg.merchant_id + user_ip + merchant_oid + email + String(tutarKr) + sepet + '0' + '1' + 'TL' + (ctx.test ? '1' : '0');
      const token = crypto.createHmac('sha256', cfg.merchant_key).update(birlesim + cfg.merchant_salt).digest('base64');
      const alanlar = { merchant_id: cfg.merchant_id, user_ip, merchant_oid, email, payment_amount: String(tutarKr), paytr_token: token, user_basket: sepet, debug_on: '0', no_installment: '1', max_installment: '0', currency: 'TL', test_mode: ctx.test ? '1' : '0', merchant_ok_url: ctx.donusUrl + '?durum=basarili', merchant_fail_url: ctx.donusUrl + '?durum=iptal', user_name: ctx.hesap.ad || 'Abone', user_address: ctx.hesap.adres || 'Türkiye', user_phone: ctx.hesap.telefon || '05000000000' };
      const j = await formIstek('https://www.paytr.com/odeme/api/get-token', alanlar);
      if (j.status !== 'success') throw new Error('PayTR: ' + (j.reason || 'token alınamadı'));
      return { yontem: 'yonlendirme', url: 'https://www.paytr.com/odeme/guvenli/' + j.token, token: merchant_oid };
    },
    async dogrula(cfg, { body }) {
      const { merchant_oid, status, total_amount, hash } = body;
      const beklenen = crypto.createHmac('sha256', cfg.merchant_key).update(merchant_oid + cfg.merchant_salt + status + total_amount).digest('base64');
      if (hash !== beklenen) throw new Error('PayTR hash doğrulanamadı');
      const hesapId = +(String(merchant_oid).match(/^DP(\d+)D/) || [])[1] || null;
      return { basarili: status === 'success', hesapId, islem_no: merchant_oid, tutar: total_amount ? total_amount / 100 : null, kart_ozet: 'PayTR', yanit: 'OK' };
    },
    async tahsilEt() { return { basarili: false, beklemede: true, mesaj: 'PayTR tekrarlayan ödeme için ek entegrasyon gerekir.' }; },
  },
};

// ─── HTTP yardımcıları ───
async function jsonIstek(url, secenek) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { ...secenek, signal: ctrl.signal });
    const metin = await r.text();
    try { return JSON.parse(metin); } catch (e) { return { _ham: metin, _durum: r.status }; }
  } finally { clearTimeout(t); }
}
async function formIstek(url, alanlar) {
  const govde = new URLSearchParams(alanlar).toString();
  return jsonIstek(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: govde });
}
// iyzico IYZWSv2 kimlik doğrulama
async function iyzicoIstek(cfg, yol, govde) {
  const randomKey = Date.now() + g.rastgele(8);
  const payload = randomKey + yol + JSON.stringify(govde);
  const imza = crypto.createHmac('sha256', cfg.secret).update(payload).digest('hex');
  const yetki = 'apiKey:' + cfg.api_key + '&randomKey:' + randomKey + '&signature:' + imza;
  const auth = 'IYZWSv2 ' + Buffer.from(yetki).toString('base64');
  return jsonIstek((cfg.taban || 'https://sandbox-api.iyzipay.com') + yol, { method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' }, body: JSON.stringify(govde) });
}
async function stripeIstek(cfg, yol, alanlar) {
  return jsonIstek('https://api.stripe.com' + yol, { method: 'POST', headers: { 'Authorization': 'Bearer ' + cfg.secret, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(alanlar).toString() });
}
function stripeWebhookDogrula(sir, ham, imzaBaslik) {
  if (!imzaBaslik) throw new Error('Stripe imzası yok');
  const parcalar = Object.fromEntries(String(imzaBaslik).split(',').map(p => p.split('=')));
  const beklenen = crypto.createHmac('sha256', sir).update(parcalar.t + '.' + ham).digest('hex');
  if (!g.esitMi(beklenen, parcalar.v1)) throw new Error('Stripe imza doğrulanamadı');
}

// ─── Veritabanı: sağlayıcı örnekleri ───
function tipTanim(anahtar) { return TIPLER[anahtar] || null; }
function tipListesi() {
  return Object.entries(TIPLER).map(([anahtar, t]) => ({ anahtar, ad: t.ad, turu: t.turu, gercek: t.gercek, aciklama: t.aciklama, alanlar: t.alanlar }));
}
function cozYapilandirma(satir) {
  let ham = {}; try { ham = JSON.parse(satir.yapilandirma || '{}'); } catch (e) { /* */ }
  const t = TIPLER[satir.anahtar]; const out = {};
  if (t) for (const a of t.alanlar) out[a.ad] = a.tip === 'sifre' ? (g.coz(ham[a.ad]) || '') : (ham[a.ad] || '');
  return out;
}
function saglayiciGetir(anahtar) {
  const s = db().prepare('SELECT * FROM odeme_saglayicilar WHERE anahtar=?').get(anahtar);
  if (!s) return null;
  return { ...s, cfg: cozYapilandirma(s), tip: TIPLER[s.anahtar] };
}
function aktifSaglayicilar() {
  return db().prepare('SELECT * FROM odeme_saglayicilar WHERE aktif=1 ORDER BY sira, id').all()
    .filter(s => TIPLER[s.anahtar])
    .map(s => ({ anahtar: s.anahtar, ad: s.ad || TIPLER[s.anahtar].ad, turu: TIPLER[s.anahtar].turu, test_modu: !!s.test_modu, aciklama: s.aciklama || TIPLER[s.anahtar].aciklama }));
}
// Kaydederken sifre alanlarını şifrele, boş bırakılanlarda eskisini koru
function yapilandirmaSifrele(anahtar, yeni, eskiSatir) {
  const t = TIPLER[anahtar]; if (!t) throw new Error('Geçersiz sağlayıcı tipi');
  let eski = {}; try { eski = JSON.parse((eskiSatir && eskiSatir.yapilandirma) || '{}'); } catch (e) { /* */ }
  const out = {};
  for (const a of t.alanlar) {
    const deger = yeni[a.ad];
    if (a.tip === 'sifre') out[a.ad] = deger ? g.sifrele(String(deger).slice(0, 300)) : (eski[a.ad] || null);
    else out[a.ad] = deger != null ? String(deger).slice(0, 500) : (eski[a.ad] || '');
  }
  return JSON.stringify(out);
}

module.exports = { TIPLER, tipTanim, tipListesi, saglayiciGetir, aktifSaglayicilar, cozYapilandirma, yapilandirmaSifrele };
