'use strict';
// Abonelik, demo/pro lisanslama ve demo kısıtlama mantığı.
// Her kurum hesabının tek bir abonelik satırı vardır; kayıt olunca 'demo/deneme' ile başlar.
const { db } = require('./db');
const { hata } = require('./http');
const O = require('./oturum');

const BUGUN = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); // TR saati
function gunEkle(tarih, gun) {
  const d = new Date((tarih || BUGUN()) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}
function ayEkle(tarih, ay) {
  const d = new Date((tarih || BUGUN()) + 'T00:00:00Z');
  const g = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + ay);
  if (d.getUTCDate() < g) d.setUTCDate(0); // ay sonu taşmasını düzelt
  return d.toISOString().slice(0, 10);
}
function gunFark(hedef) {
  if (!hedef) return 0;
  const a = new Date(BUGUN() + 'T00:00:00Z'), b = new Date(String(hedef).slice(0, 10) + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}
function donem() { return BUGUN().slice(0, 7); }

// ─── Ayarlar ───
function sistemAcik() { return O.ayar('abonelik_aktif', '1') === '1'; }
function denemeGun() { return Math.max(0, parseInt(O.ayar('deneme_gun', '14'), 10) || 0); }
function fiyatlar() {
  return {
    aylik: Number(O.ayar('pro_fiyat_aylik', '499')) || 0,
    yillik: Number(O.ayar('pro_fiyat_yillik', '4990')) || 0,
    para: O.ayar('pro_para_birimi', 'TRY') || 'TRY',
  };
}
const VARSAYILAN_LIMIT = {
  toplam_kayit: 25, kullanici: 1, medya_mb: 20, moduller: {}, kapali_moduller: [],
  ozellikler: { excel: false, pdf: true, sms: false, yedek: false, medya: true, toplu_islem: false, kayitli_gorunum: true, api: false },
};
function demoLimitleri() {
  let v = {};
  try { v = JSON.parse(O.ayar('demo_limitleri', '{}') || '{}'); } catch (e) { /* */ }
  return {
    toplam_kayit: v.toplam_kayit ?? VARSAYILAN_LIMIT.toplam_kayit,
    kullanici: v.kullanici ?? VARSAYILAN_LIMIT.kullanici,
    medya_mb: v.medya_mb ?? VARSAYILAN_LIMIT.medya_mb,
    moduller: v.moduller || {},
    kapali_moduller: Array.isArray(v.kapali_moduller) ? v.kapali_moduller : [],
    ozellikler: Object.assign({}, VARSAYILAN_LIMIT.ozellikler, v.ozellikler || {}),
  };
}

// ─── Abonelik satırı ───
function getir(hesapId) {
  let a = db().prepare('SELECT * FROM abonelikler WHERE hesap_id=?').get(hesapId);
  if (!a) a = yeniDemo(hesapId);
  return a;
}
function yeniDemo(hesapId) {
  const bas = BUGUN();
  const denemeBitis = denemeGun() > 0 ? gunEkle(bas, denemeGun()) : bas;
  try {
    db().prepare(`INSERT INTO abonelikler (hesap_id, plan, durum, baslangic, deneme_bitis, otomatik_yenile)
      VALUES (?, 'demo', 'deneme', ?, ?, 1) ON CONFLICT(hesap_id) DO NOTHING`).run(hesapId, bas, denemeBitis);
  } catch (e) { /* yarış durumu */ }
  return db().prepare('SELECT * FROM abonelikler WHERE hesap_id=?').get(hesapId);
}

// Pro erişimi geçerli mi (dönem bitmemiş)
function proGecerli(a) {
  if (a.plan !== 'pro') return false;
  if (['aktif', 'iptal', 'gecikti'].includes(a.durum) && a.donem_bitis) return gunFark(a.donem_bitis) >= 0;
  return a.durum === 'aktif';
}
// Deneme (tam erişim) süresi devam ediyor mu
function denemeGecerli(a) {
  return a.plan === 'demo' && a.durum === 'deneme' && denemeGun() > 0 && a.deneme_bitis && gunFark(a.deneme_bitis) >= 0;
}

// ─── Kullanım sayıları (demo sınırı için) ───
const SAYIM_TABLOLARI = [
  ['kayitlar', ''], ['hisseler', "AND bagisci_adi IS NOT NULL"], ['belgeler', ''], ['cariler', ''],
  ['finans_hareketleri', "AND (kaynak IS NULL OR kaynak NOT IN ('cari_hareket'))"], ['personeller', ''],
  ['organizasyonlar', ''], ['kurbanlar', ''], ['urunler', ''], ['cek_senet', ''],
];
function toplamKayit(hesapId) {
  let t = 0;
  for (const [tablo, ek] of SAYIM_TABLOLARI) {
    try { t += db().prepare(`SELECT COUNT(*) AS c FROM ${tablo} WHERE hesap_id=? ${ek}`).get(hesapId).c; } catch (e) { /* tablo yoksa atla */ }
  }
  return t;
}
function modulKayit(hesapId, modul) {
  try {
    if (modul === 'kurban') return db().prepare("SELECT COUNT(*) AS c FROM hisseler WHERE hesap_id=? AND bagisci_adi IS NOT NULL").get(hesapId).c;
    if (modul === 'faturalar' || modul === 'teklifler') return db().prepare('SELECT COUNT(*) AS c FROM belgeler WHERE hesap_id=?').get(hesapId).c;
    if (modul === 'cariler') return db().prepare('SELECT COUNT(*) AS c FROM cariler WHERE hesap_id=?').get(hesapId).c;
    if (modul === 'personel') return db().prepare('SELECT COUNT(*) AS c FROM personeller WHERE hesap_id=?').get(hesapId).c;
    if (modul === 'urunler') return db().prepare('SELECT COUNT(*) AS c FROM urunler WHERE hesap_id=?').get(hesapId).c;
    return db().prepare('SELECT COUNT(*) AS c FROM kayitlar WHERE hesap_id=? AND modul=?').get(hesapId, modul).c;
  } catch (e) { return 0; }
}
function medyaMb(hesapId) {
  try { return Math.round((db().prepare('SELECT COALESCE(SUM(boyut),0) AS b FROM medya WHERE hesap_id=?').get(hesapId).b || 0) / 1048576 * 10) / 10; }
  catch (e) { return 0; }
}
function kullaniciSayisi(hesapId) {
  try { return db().prepare('SELECT COUNT(*) AS c FROM kullanicilar WHERE hesap_id=?').get(hesapId).c; } catch (e) { return 1; }
}

// ─── Hesaplanmış durum (oturum verisi + abonelik sayfası) ───
function durum(hesapId) {
  const acik = sistemAcik();
  const a = getir(hesapId);
  const f = fiyatlar();
  const pro = !acik || proGecerli(a) || denemeGecerli(a);
  const demo = acik && !pro;
  const lim = demoLimitleri();
  let gunKalan = null, asama;
  if (!acik) asama = 'kapali';
  else if (proGecerli(a)) { asama = a.durum === 'iptal' ? 'pro_iptal_bekliyor' : 'pro'; gunKalan = gunFark(a.donem_bitis); }
  else if (denemeGecerli(a)) { asama = 'deneme'; gunKalan = gunFark(a.deneme_bitis); }
  else asama = 'demo';
  return {
    aktif: acik, plan: a.plan, durum: a.durum, asama, pro, demo,
    deneme_bitis: a.deneme_bitis, donem_bitis: a.donem_bitis, sonraki_odeme: a.sonraki_odeme,
    gun_kalan: gunKalan, otomatik_yenile: !!a.otomatik_yenile,
    tutar: a.tutar || 0, para_birimi: a.para_birimi || f.para, periyot: a.periyot || 'aylik',
    odeme_ozet: a.odeme_ozet || null, saglayici: a.saglayici || null,
    fiyat: f,
    limitler: lim,
    kullanim: demo ? { toplam_kayit: toplamKayit(hesapId), kullanici: kullaniciSayisi(hesapId), medya_mb: medyaMb(hesapId) } : null,
  };
}
// Oturum yükü için hafif özet (her istekte ağır sayım yapmamak için kullanım dahil değil)
function ozet(hesapId) {
  const acik = sistemAcik();
  const a = getir(hesapId);
  const pro = !acik || proGecerli(a) || denemeGecerli(a);
  let asama, gunKalan = null;
  if (!acik) asama = 'kapali';
  else if (proGecerli(a)) { asama = a.durum === 'iptal' ? 'pro_iptal_bekliyor' : 'pro'; gunKalan = gunFark(a.donem_bitis); }
  else if (denemeGecerli(a)) { asama = 'deneme'; gunKalan = gunFark(a.deneme_bitis); }
  else asama = 'demo';
  return {
    aktif: acik, plan: a.plan, durum: a.durum, asama, pro, demo: acik && !pro, gun_kalan: gunKalan,
    deneme_bitis: a.deneme_bitis, donem_bitis: a.donem_bitis, sonraki_odeme: a.sonraki_odeme,
    otomatik_yenile: !!a.otomatik_yenile, odeme_ozet: a.odeme_ozet || null,
    limitler: acik && !pro ? demoLimitleri() : null,
    fiyat: fiyatlar(),
  };
}

// ─── Demo kısıtlama denetimleri ───
function ozellikAcik(hesapId, ozellik) {
  const d = ozet(hesapId);
  if (d.pro) return true;
  return !!(d.limitler && d.limitler.ozellikler && d.limitler.ozellikler[ozellik]);
}
// Belirli bir modüle kayıt eklenebilir mi (demo sınırı)
function kayitEklenebilir(hesapId, modul) {
  const d = ozet(hesapId);
  if (d.pro) return { izin: true };
  const lim = d.limitler;
  if (modul && lim.kapali_moduller.includes(modul)) return { izin: false, neden: 'Bu modül demo sürümde kapalıdır. Tüm özellikler için Pro\'ya geçin.' };
  if (modul && lim.moduller && lim.moduller[modul] != null) {
    const s = modulKayit(hesapId, modul);
    if (s >= lim.moduller[modul]) return { izin: false, neden: `Demo sürümde bu modülde en fazla ${lim.moduller[modul]} kayıt girebilirsiniz. Sınırsız kayıt için Pro'ya geçin.` };
  }
  if (lim.toplam_kayit > 0) {
    const t = toplamKayit(hesapId);
    if (t >= lim.toplam_kayit) return { izin: false, neden: `Demo sürümde toplam ${lim.toplam_kayit} kayıt girebilirsiniz (${t} doldu). Sınırsız kullanım için Pro'ya geçin.` };
  }
  return { izin: true };
}

// ─── Merkezi ara katman: demo kısıtlamalarını zorlar ───
// kullaniciGerekli'den SONRA çalışır (req.hesapId / req.kullanici hazırdır).
const OLUSTURMA_YOLLARI = [
  /^\/api\/kayit\/[a-z_]+$/,
  /^\/api\/kurban\/organizasyonlar$/,
  /^\/api\/kurban\/organizasyonlar\/\d+\/kurbanlar$/,
  /^\/api\/personel$/,
  /^\/api\/personel\/\d+\/kayit$/,
  /^\/api\/finans\/hesaplar$/,
  /^\/api\/finans\/hareketler$/,
  /^\/api\/cariler$/,
  /^\/api\/urunler$/,
  /^\/api\/belgeler$/,
  /^\/api\/cek-senet$/,
  /^\/api\/stok\/hareketler$/,
];
// [regex, metod, ozellik, mesaj]
const OZELLIK_YOLLARI = [
  [/^\/api\/rapor\/excel/, 'POST', 'excel', 'Excel dışa aktarma Pro sürümde kullanılabilir.'],
  [/\/excel$/, 'GET', 'excel', 'Excel dışa aktarma Pro sürümde kullanılabilir.'],
  [/^\/api\/sms\/gonder$/, 'POST', 'sms', 'Toplu SMS gönderimi Pro sürümde kullanılabilir.'],
  [/^\/api\/yedek\//, null, 'yedek', 'Yedek alma/geri yükleme Pro sürümde kullanılabilir.'],
  [/\/toplu(-\w+)?$/, 'POST', 'toplu_islem', 'Toplu işlemler Pro sürümde kullanılabilir.'],
  [/\/ice-aktar$/, 'POST', 'toplu_islem', 'Toplu içe aktarma Pro sürümde kullanılabilir.'],
  [/^\/api\/gorunumler\//, 'POST', 'kayitli_gorunum', 'Kayıtlı görünümler Pro sürümde kullanılabilir.'],
];
function katman(req) {
  if (!sistemAcik()) return;                 // sistem kapalıysa herkes tam erişime sahip
  if (req.method === 'GET' && !/\/excel/.test(req.yol)) return; // çoğu okuma serbest
  const hesapId = req.hesapId;
  if (!hesapId) return;
  const d = ozet(hesapId);
  if (d.pro) return;                          // Pro / deneme: kısıt yok
  // Özellik kapıları
  for (const [re, metod, ozellik, mesaj] of OZELLIK_YOLLARI) {
    if ((!metod || req.method === metod) && re.test(req.yol)) {
      if (!d.limitler.ozellikler[ozellik]) throw hata(402, mesaj, { yukseltme: true, demo: true });
    }
  }
  // Medya yükleme boyut sınırı
  if (req.method === 'POST' && /^\/api\/medya\/yukle$/.test(req.yol)) {
    if (!d.limitler.ozellikler.medya) throw hata(402, 'Medya yükleme Pro sürümde kullanılabilir.', { yukseltme: true, demo: true });
    const mb = d.limitler.medya_mb || 0;
    if (mb > 0 && medyaMb(hesapId) >= mb) throw hata(402, `Demo medya deposu ${mb} MB ile sınırlıdır. Daha fazlası için Pro'ya geçin.`, { yukseltme: true, demo: true });
  }
  // Kayıt sınırı
  if (req.method === 'POST') {
    for (const re of OLUSTURMA_YOLLARI) {
      if (re.test(req.yol)) {
        const modul = /^\/api\/kayit\/([a-z_]+)$/.test(req.yol) ? req.yol.split('/')[3]
          : /kurban/.test(req.yol) ? 'kurban' : /cariler/.test(req.yol) ? 'cariler'
          : /belgeler/.test(req.yol) ? 'faturalar' : /personel/.test(req.yol) ? 'personel'
          : /urunler/.test(req.yol) ? 'urunler' : null;
        const k = kayitEklenebilir(hesapId, modul);
        if (!k.izin) throw hata(402, k.neden, { yukseltme: true, demo: true });
        break;
      }
    }
  }
}
// Ek kullanıcı eklenebilir mi (sistem.js kullanıcı ekleme için)
function kullaniciEklenebilir(hesapId) {
  const d = ozet(hesapId);
  if (d.pro) return { izin: true };
  const lim = d.limitler.kullanici || 1;
  const s = kullaniciSayisi(hesapId);
  if (s >= lim) return { izin: false, neden: `Demo sürümde en fazla ${lim} kullanıcı olabilir. Ekip için Pro'ya geçin.` };
  return { izin: true };
}

// ─── Makbuz numarası ───
function makbuzNo() {
  const yil = new Date().getFullYear();
  const r = db().prepare("SELECT COUNT(*) AS c FROM odemeler WHERE makbuz_no LIKE ?").get('DP-' + yil + '-%');
  return `DP-${yil}-${String((r.c || 0) + 1).padStart(5, '0')}`;
}

// ─── Pro'yu etkinleştir / abonelik güncelle ───
function proAktiflestir(hesapId, { periyot = 'aylik', tutar, para_birimi, saglayici = null, saglayici_ref = null, odeme_ozet = null, otomatik_yenile = 1 } = {}) {
  const a = getir(hesapId);
  const f = fiyatlar();
  const bas = BUGUN();
  // Dönem bitişi: mevcut dönem bitmemişse üstüne ekle, yoksa bugünden
  const temelBas = (proGecerli(a) && a.donem_bitis) ? a.donem_bitis : bas;
  const donemBitis = periyot === 'yillik' ? ayEkle(temelBas, 12) : ayEkle(temelBas, 1);
  const otoTutar = tutar != null ? tutar : (periyot === 'yillik' ? f.yillik : f.aylik);
  db().prepare(`UPDATE abonelikler SET plan='pro', durum='aktif', periyot=?, tutar=?, para_birimi=?, donem_bitis=?,
      sonraki_odeme=?, saglayici=COALESCE(?, saglayici), saglayici_ref=COALESCE(?, saglayici_ref), odeme_ozet=COALESCE(?, odeme_ozet),
      otomatik_yenile=?, iptal_tarihi=NULL, iptal_eden=NULL, guncelleme=datetime('now') WHERE hesap_id=?`)
    .run(periyot, otoTutar, para_birimi || f.para, donemBitis, otomatik_yenile ? donemBitis : null, saglayici, saglayici_ref, odeme_ozet, otomatik_yenile ? 1 : 0, hesapId);
  db().prepare("UPDATE hesaplar SET plan='pro' WHERE id=?").run(hesapId);
  return db().prepare('SELECT * FROM abonelikler WHERE hesap_id=?').get(hesapId);
}
function demoyaDondur(hesapId, neden = 'demo') {
  db().prepare("UPDATE abonelikler SET plan='demo', durum=?, otomatik_yenile=0, sonraki_odeme=NULL, guncelleme=datetime('now') WHERE hesap_id=?")
    .run(neden === 'gecikti' ? 'gecikti' : 'bitti', hesapId);
  db().prepare("UPDATE hesaplar SET plan='demo' WHERE id=?").run(hesapId);
}
function iptalEt(hesapId, eden = 'kullanıcı') {
  const a = getir(hesapId);
  // Dönem sonuna kadar erişim korunur; otomatik yenileme kapatılır.
  db().prepare("UPDATE abonelikler SET durum='iptal', otomatik_yenile=0, sonraki_odeme=NULL, iptal_tarihi=datetime('now'), iptal_eden=?, guncelleme=datetime('now') WHERE hesap_id=?")
    .run(String(eden).slice(0, 80), hesapId);
  return db().prepare('SELECT * FROM abonelikler WHERE hesap_id=?').get(hesapId);
}

// ─── Ödeme kaydı ───
function odemeKaydet(hesapId, { abonelik_id = null, tutar, para_birimi, durum = 'basarili', plan = 'pro', periyot = 'aylik', saglayici = null, saglayici_islem_no = null, kart_ozet = null, aciklama = null, hata_mesaji = null, donem: d = null } = {}) {
  const no = (durum === 'basarili') ? makbuzNo() : null;
  const id = db().prepare(`INSERT INTO odemeler (hesap_id, abonelik_id, makbuz_no, donem, tutar, para_birimi, durum, plan, periyot, saglayici, saglayici_islem_no, kart_ozet, aciklama, hata_mesaji)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(hesapId, abonelik_id, no, d || donem(), tutar, para_birimi || fiyatlar().para, durum, plan, periyot, saglayici, saglayici_islem_no, kart_ozet, aciklama, hata_mesaji).lastInsertRowid;
  return db().prepare('SELECT * FROM odemeler WHERE id=?').get(id);
}
function odemeGetir(hesapId, id) { return db().prepare('SELECT * FROM odemeler WHERE id=? AND hesap_id=?').get(id, hesapId); }
function odemeler(hesapId) { return db().prepare('SELECT * FROM odemeler WHERE hesap_id=? ORDER BY id DESC').all(hesapId); }

module.exports = {
  BUGUN, gunEkle, ayEkle, gunFark, donem,
  sistemAcik, denemeGun, fiyatlar, demoLimitleri,
  getir, yeniDemo, durum, ozet, proGecerli, denemeGecerli,
  toplamKayit, modulKayit, medyaMb, kullaniciSayisi,
  ozellikAcik, kayitEklenebilir, kullaniciEklenebilir, katman,
  makbuzNo, proAktiflestir, demoyaDondur, iptalEt,
  odemeKaydet, odemeGetir, odemeler,
};
