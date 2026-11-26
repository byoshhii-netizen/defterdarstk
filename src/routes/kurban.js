'use strict';
const { db } = require('../lib/db');
const g = require('../lib/guvenlik');
const { hata } = require('../lib/http');
const O = require('../lib/oturum');
const X = require('../lib/xlsx');
const F = require('../lib/finans');
const { sahip, bugun, copeAt, idListesi, yuvarla } = require('./ortak');

const TUR_AD = { buyukbas: 'Büyükbaş', kucukbas: 'Küçükbaş' };
const KURBAN_TURLERI = ['Udhiye', 'Adak', 'Akika', 'Şükür', 'Nafile', 'Vacip', 'Hedy', 'Diğer'];
const ODEME = ['bekliyor', 'odendi', 'kismi', 'iptal'];

function hisseFiyati(org, tur) { return tur === 'buyukbas' ? (org.buyukbas_hisse_fiyati || 0) : (org.kucukbas_hisse_fiyati || 0); }

// Ödenen hisseyi organizasyonun kasa hesabına gelir olarak işler
function hisseKasaSenkron(hesapId, hisseId) {
  const h = db().prepare(`SELECT h.*, k.tur, k.kurban_no, k.organizasyon_id, o.ad AS org_ad, o.finans_hesap_id, o.buyukbas_hisse_fiyati, o.kucukbas_hisse_fiyati
    FROM hisseler h JOIN kurbanlar k ON k.id=h.kurban_id JOIN organizasyonlar o ON o.id=k.organizasyon_id WHERE h.id=? AND h.hesap_id=?`).get(hisseId, hesapId);
  if (!h) return;
  const odendi = h.bagisci_adi && (h.odeme_durumu === 'odendi' || h.odeme_durumu === 'kismi');
  const tutar = h.odeme_durumu === 'kismi' ? (h.odenen_tutar || 0) : (h.odenen_tutar > 0 ? h.odenen_tutar : hisseFiyati(h, h.tur));
  F.kaynakHareketiYaz(hesapId, 'hisse', h.id, odendi ? {
    finans_hesap_id: h.finans_hesap_id, tarih: bugun(), yon: 'giris', tutar, kategori: 'Kurban',
    aciklama: `${h.org_ad} — Kurban ${h.kurban_no} hisse ${h.hisse_no}: ${h.bagisci_adi}`,
  } : null);
}

function hisseVerisi(b) {
  const odeme = ODEME.includes(b.odeme_durumu) ? b.odeme_durumu : 'bekliyor';
  return {
    bagisci_adi: g.metin(b.bagisci_adi, 120), bagisci_telefon: g.metin(b.bagisci_telefon, 30),
    bagisci_kategori: g.metin(b.bagisci_kategori, 60) || 'Genel Bağışçı', kimin_adina: g.metin(b.kimin_adina, 200),
    kimin_adina_telefon: g.metin(b.kimin_adina_telefon, 30), odeme_durumu: odeme, odenen_tutar: g.sayi(b.odenen_tutar),
    video_ister: b.video_ister ? 1 : 0, aciklama: g.metin(b.aciklama, 1000),
    kurban_turu: KURBAN_TURLERI.includes(b.kurban_turu) ? b.kurban_turu : 'Udhiye',
  };
}

function kurbanNumaralariniDuzenle(orgId) {
  ['buyukbas', 'kucukbas'].forEach(tur => {
    db().prepare('SELECT id FROM kurbanlar WHERE organizasyon_id=? AND tur=? ORDER BY kurban_no, id').all(orgId, tur)
      .forEach((r, i) => db().prepare('UPDATE kurbanlar SET kurban_no=? WHERE id=?').run(i + 1, r.id));
  });
}

function kurbanSil(req, k) {
  const hisseler = db().prepare('SELECT * FROM hisseler WHERE kurban_id=?').all(k.id);
  copeAt(req.hesapId, 'kurban', `Kurban ${k.kurban_no} (${TUR_AD[k.tur]})`, { kurban: k, hisseler }, req.kullanici.ad_soyad);
  hisseler.forEach(h => F.kaynakHareketiSil(req.hesapId, 'hisse', h.id));
  db().prepare('DELETE FROM hisseler WHERE kurban_id=?').run(k.id);
  db().prepare('DELETE FROM kurbanlar WHERE id=?').run(k.id);
}

function orgOzet(hesapId, org) {
  const kurbanlar = db().prepare(`SELECT k.*, (SELECT COUNT(*) FROM hisseler h WHERE h.kurban_id=k.id AND h.bagisci_adi IS NOT NULL) AS dolu
    FROM kurbanlar k WHERE k.organizasyon_id=? AND k.hesap_id=?`).all(org.id, hesapId);
  const hs = db().prepare(`SELECT h.odeme_durumu, h.odenen_tutar, h.vekalet_onay, h.video_ister, h.video_url, k.tur FROM hisseler h JOIN kurbanlar k ON k.id=h.kurban_id
    WHERE k.organizasyon_id=? AND h.bagisci_adi IS NOT NULL`).all(org.id);
  const o = {
    toplam_kurban: kurbanlar.length, buyukbas: kurbanlar.filter(k => k.tur === 'buyukbas').length, kucukbas: kurbanlar.filter(k => k.tur === 'kucukbas').length,
    kesildi: kurbanlar.filter(k => k.kesildi).length,
    doldu: kurbanlar.filter(k => !k.kesildi && k.dolu >= k.toplam_hisse).length,
    bos_kurban: kurbanlar.filter(k => !k.kesildi && k.dolu < k.toplam_hisse).length,
    toplam_hisse: kurbanlar.reduce((s, k) => s + k.toplam_hisse, 0), dolu_hisse: hs.length,
    odendi: hs.filter(h => h.odeme_durumu === 'odendi').length, bekliyor: hs.filter(h => h.odeme_durumu === 'bekliyor').length,
    kismi: hs.filter(h => h.odeme_durumu === 'kismi').length, iptal: hs.filter(h => h.odeme_durumu === 'iptal').length,
    vekalet: hs.filter(h => h.vekalet_onay).length, video_isteyen: hs.filter(h => h.video_ister).length, video_yuklenen: hs.filter(h => h.video_url).length,
    maliyet: kurbanlar.reduce((s, k) => s + (k.alis_fiyati || 0), 0),
  };
  o.bos_hisse = o.toplam_hisse - o.dolu_hisse;
  let beklenen = 0, tahsil = 0, bekleyen = 0;
  hs.forEach(h => {
    if (h.odeme_durumu === 'iptal') return;
    const f = hisseFiyati(org, h.tur); beklenen += f;
    if (h.odeme_durumu === 'odendi') tahsil += h.odenen_tutar > 0 ? h.odenen_tutar : f;
    else if (h.odeme_durumu === 'kismi') { tahsil += h.odenen_tutar || 0; bekleyen += Math.max(0, f - (h.odenen_tutar || 0)); }
    else bekleyen += f;
  });
  Object.assign(o, { beklenen_gelir: yuvarla(beklenen), tahsil_edilen: yuvarla(tahsil), bekleyen_tahsilat: yuvarla(bekleyen), net: yuvarla(tahsil - o.maliyet) });
  o.doluluk = o.toplam_hisse ? Math.round(o.dolu_hisse / o.toplam_hisse * 100) : 0;
  return o;
}

module.exports = function (app) {
  const r = app.yonlendirici('/api/kurban');
  r.use(O.kullaniciGerekli); r.use(O.yazmaYetkisi);
  r.use(require('../lib/abonelik').katman);

  r.get('/sabitler', () => ({ kurban_turleri: KURBAN_TURLERI }));

  // ─── Organizasyonlar ───
  r.get('/organizasyonlar', (req) => {
    const orglar = db().prepare('SELECT * FROM organizasyonlar WHERE hesap_id=? ORDER BY yil DESC, id DESC').all(req.hesapId);
    return orglar.map(o => ({ ...o, ozet: orgOzet(req.hesapId, o) }));
  });
  function orgVerisi(b) {
    const ad = g.metin(b.ad, 150), yil = g.tamsayi(b.yil), max = g.tamsayi(b.max_kurban, 100);
    if (!ad || yil < 2000 || yil > 2100 || max < 1 || max > 100000) throw hata(400, 'Ad, yıl ve kurban kapasitesi geçerli olmalı');
    return [ad, yil, max, g.sayi(b.buyukbas_hisse_fiyati), g.sayi(b.kucukbas_hisse_fiyati), g.metin(b.aciklama, 1000)];
  }
  r.post('/organizasyonlar', (req) => {
    const v = orgVerisi(req.body);
    const fh = F.finansHesabiGecerli(req.hesapId, req.body.finans_hesap_id);
    const id = db().prepare('INSERT INTO organizasyonlar (ad, yil, max_kurban, buyukbas_hisse_fiyati, kucukbas_hisse_fiyati, aciklama, finans_hesap_id, hesap_id) VALUES (?,?,?,?,?,?,?,?)')
      .run(...v, fh, req.hesapId).lastInsertRowid;
    O.denetimYaz(req, 'Kurban organizasyonu oluşturuldu', 'organizasyon:' + id, { ad: v[0] });
    return { ok: true, id };
  });
  r.put('/organizasyonlar/:id', (req) => {
    sahip('organizasyonlar', req.params.id, req.hesapId);
    const v = orgVerisi(req.body);
    const fh = F.finansHesabiGecerli(req.hesapId, req.body.finans_hesap_id);
    db().prepare('UPDATE organizasyonlar SET ad=?, yil=?, max_kurban=?, buyukbas_hisse_fiyati=?, kucukbas_hisse_fiyati=?, aciklama=?, finans_hesap_id=?, aktif=? WHERE id=? AND hesap_id=?')
      .run(...v, fh, req.body.aktif === 0 ? 0 : 1, +req.params.id, req.hesapId);
    O.denetimYaz(req, 'Kurban organizasyonu güncellendi', 'organizasyon:' + req.params.id);
    return { ok: true };
  });
  r.delete('/organizasyonlar/:id', (req) => {
    const org = sahip('organizasyonlar', req.params.id, req.hesapId);
    db().islem(() => {
      const kurbanlar = db().prepare('SELECT * FROM kurbanlar WHERE organizasyon_id=?').all(org.id);
      const hisselerMap = {};
      kurbanlar.forEach(k => { hisselerMap[k.id] = db().prepare('SELECT * FROM hisseler WHERE kurban_id=?').all(k.id); });
      copeAt(req.hesapId, 'organizasyon', `${org.ad} (${org.yil})`, { org, kurbanlar, hisselerMap }, req.kullanici.ad_soyad);
      Object.values(hisselerMap).flat().forEach(h => F.kaynakHareketiSil(req.hesapId, 'hisse', h.id));
      kurbanlar.forEach(k => db().prepare('DELETE FROM hisseler WHERE kurban_id=?').run(k.id));
      db().prepare('DELETE FROM kurbanlar WHERE organizasyon_id=?').run(org.id);
      db().prepare('DELETE FROM organizasyonlar WHERE id=?').run(org.id);
    });
    O.denetimYaz(req, 'Kurban organizasyonu silindi', 'organizasyon:' + org.id, { ad: org.ad });
    return { ok: true };
  });
  r.get('/organizasyonlar/:id/ozet', (req) => {
    const org = sahip('organizasyonlar', req.params.id, req.hesapId);
    return { org, ozet: orgOzet(req.hesapId, org) };
  });

  // ─── Kurbanlar ───
  r.get('/organizasyonlar/:id/kurbanlar', (req) => {
    const org = sahip('organizasyonlar', req.params.id, req.hesapId);
    let list = db().prepare(`SELECT k.*,
      (SELECT COUNT(*) FROM hisseler h WHERE h.kurban_id=k.id AND h.bagisci_adi IS NOT NULL) AS dolu_hisse,
      (SELECT COUNT(*) FROM hisseler h WHERE h.kurban_id=k.id AND h.odeme_durumu='odendi' AND h.bagisci_adi IS NOT NULL) AS odendi_sayi,
      (SELECT COUNT(*) FROM hisseler h WHERE h.kurban_id=k.id AND h.odeme_durumu IN ('bekliyor','kismi') AND h.bagisci_adi IS NOT NULL) AS bekliyor_sayi,
      (SELECT COUNT(*) FROM hisseler h WHERE h.kurban_id=k.id AND h.vekalet_onay=1 AND h.bagisci_adi IS NOT NULL) AS vekalet_sayi,
      (SELECT COUNT(*) FROM hisseler h WHERE h.kurban_id=k.id AND h.video_ister=1) AS video_sayi,
      (SELECT GROUP_CONCAT(bagisci_adi, ', ') FROM hisseler h WHERE h.kurban_id=k.id AND h.bagisci_adi IS NOT NULL) AS bagiscilar
      FROM kurbanlar k WHERE k.organizasyon_id=? AND k.hesap_id=? ORDER BY k.tur, k.kurban_no`).all(org.id, req.hesapId);
    const { tur, durum } = req.sorgu;
    if (tur) list = list.filter(k => k.tur === tur);
    if (durum === 'bos') list = list.filter(k => !k.kesildi && k.dolu_hisse < k.toplam_hisse);
    if (durum === 'doldu') list = list.filter(k => !k.kesildi && k.dolu_hisse >= k.toplam_hisse);
    if (durum === 'kesildi') list = list.filter(k => k.kesildi);
    if (durum === 'odeme_bekleyen') list = list.filter(k => k.bekliyor_sayi > 0);
    return list;
  });

  // Yeni kurban (+ isteğe bağlı hissedar listesiyle)
  r.post('/organizasyonlar/:id/kurbanlar', (req) => {
    const org = sahip('organizasyonlar', req.params.id, req.hesapId);
    const b = req.body;
    const tur = b.tur === 'kucukbas' ? 'kucukbas' : b.tur === 'buyukbas' ? 'buyukbas' : null;
    if (!tur) throw hata(400, 'Hayvan türü seçin');
    const adet = Math.min(200, Math.max(1, g.tamsayi(b.adet, 1)));
    const mevcut = db().prepare('SELECT COUNT(*) AS c FROM kurbanlar WHERE organizasyon_id=?').get(org.id).c;
    if (mevcut + adet > org.max_kurban) throw hata(400, `Kapasite aşılıyor. Bu organizasyonda en fazla ${org.max_kurban} kurban olabilir (mevcut ${mevcut}).`);
    const toplamHisse = tur === 'buyukbas' ? 7 : 1;
    const kurbanTuru = KURBAN_TURLERI.includes(b.kurban_turu) ? b.kurban_turu : 'Udhiye';
    const olusan = db().islem(() => {
      const ids = [];
      for (let n = 0; n < adet; n++) {
        const maxNo = db().prepare('SELECT MAX(kurban_no) AS m FROM kurbanlar WHERE organizasyon_id=? AND tur=?').get(org.id, tur).m || 0;
        const kid = db().prepare(`INSERT INTO kurbanlar (hesap_id, organizasyon_id, kurban_no, tur, kurban_turu, kesen_kisi, kucukbas_sayi, kupe_no, alis_fiyati, fiyat, toplam_hisse, aciklama)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.hesapId, org.id, maxNo + 1, tur, kurbanTuru, g.metin(b.kesen_kisi, 100), Math.max(1, g.tamsayi(b.kucukbas_sayi, 1)),
          adet === 1 ? g.metin(b.kupe_no, 50) : null, g.sayi(b.alis_fiyati), g.sayi(b.alis_fiyati), toplamHisse, g.metin(b.aciklama, 1000)).lastInsertRowid;
        for (let i = 1; i <= toplamHisse; i++) {
          const hv = (n === 0 && Array.isArray(b.hisseler) && b.hisseler[i - 1] && g.metin(b.hisseler[i - 1].bagisci_adi)) ? hisseVerisi({ kurban_turu: kurbanTuru, ...b.hisseler[i - 1] }) : null;
          const hid = db().prepare('INSERT INTO hisseler (hesap_id, kurban_id, hisse_no, kurban_turu) VALUES (?,?,?,?)').run(req.hesapId, kid, i, kurbanTuru).lastInsertRowid;
          if (hv) {
            db().prepare(`UPDATE hisseler SET bagisci_adi=?, bagisci_telefon=?, bagisci_kategori=?, kimin_adina=?, kimin_adina_telefon=?, odeme_durumu=?, odenen_tutar=?, video_ister=?, aciklama=?, kurban_turu=?, guncelleme=datetime('now') WHERE id=?`)
              .run(hv.bagisci_adi, hv.bagisci_telefon, hv.bagisci_kategori, hv.kimin_adina, hv.kimin_adina_telefon, hv.odeme_durumu, hv.odenen_tutar, hv.video_ister, hv.aciklama, hv.kurban_turu, hid);
            hisseKasaSenkron(req.hesapId, hid);
          }
        }
        ids.push(kid);
      }
      return ids;
    });
    O.denetimYaz(req, `${adet} kurban eklendi`, 'organizasyon:' + org.id, { tur });
    return { ok: true, id: olusan[0], ids: olusan };
  });

  r.get('/kurbanlar/:id', (req) => {
    const k = sahip('kurbanlar', req.params.id, req.hesapId);
    const org = sahip('organizasyonlar', k.organizasyon_id, req.hesapId);
    const hisseler = db().prepare('SELECT * FROM hisseler WHERE kurban_id=? ORDER BY hisse_no').all(k.id);
    const komsu = db().prepare('SELECT id, kurban_no, tur FROM kurbanlar WHERE organizasyon_id=? ORDER BY tur, kurban_no').all(org.id);
    const i = komsu.findIndex(x => x.id === k.id);
    return { kurban: k, org, hisseler, hisse_fiyati: hisseFiyati(org, k.tur), onceki: komsu[i - 1] || null, sonraki: komsu[i + 1] || null };
  });
  r.put('/kurbanlar/:id', (req) => {
    const k = sahip('kurbanlar', req.params.id, req.hesapId);
    const b = req.body;
    const kesildi = b.kesildi ? 1 : 0;
    db().prepare('UPDATE kurbanlar SET kupe_no=?, alis_fiyati=?, fiyat=?, kesildi=?, kesim_tarihi=?, aciklama=?, kurban_turu=?, kesen_kisi=?, kucukbas_sayi=? WHERE id=?')
      .run(g.metin(b.kupe_no, 50), g.sayi(b.alis_fiyati), g.sayi(b.alis_fiyati), kesildi, kesildi ? (g.tarih(b.kesim_tarihi) || k.kesim_tarihi || bugun()) : null,
        g.metin(b.aciklama, 1000), KURBAN_TURLERI.includes(b.kurban_turu) ? b.kurban_turu : k.kurban_turu, g.metin(b.kesen_kisi, 100), Math.max(1, g.tamsayi(b.kucukbas_sayi, 1)), k.id);
    O.denetimYaz(req, 'Kurban güncellendi', 'kurban:' + k.id, { kurban_no: k.kurban_no });
    return { ok: true };
  });
  r.delete('/kurbanlar/:id', (req) => {
    const k = sahip('kurbanlar', req.params.id, req.hesapId);
    db().islem(() => { kurbanSil(req, k); kurbanNumaralariniDuzenle(k.organizasyon_id); });
    O.denetimYaz(req, 'Kurban silindi', 'kurban:' + k.id, { kurban_no: k.kurban_no });
    return { ok: true };
  });
  r.post('/kurbanlar/toplu', (req) => {
    const ids = idListesi(req.body.ids);
    const islem = req.body.islem, deger = !!req.body.deger;
    if (!['kesildi', 'vekalet', 'odeme', 'sil'].includes(islem)) throw hata(400, 'Geçersiz işlem');
    let etkilenen = 0; const orglar = new Set();
    db().islem(() => {
      for (const id of ids) {
        const k = db().prepare('SELECT * FROM kurbanlar WHERE id=? AND hesap_id=?').get(id, req.hesapId);
        if (!k) continue;
        if (islem === 'kesildi') db().prepare('UPDATE kurbanlar SET kesildi=?, kesim_tarihi=? WHERE id=?').run(deger ? 1 : 0, deger ? bugun() : null, id);
        else if (islem === 'vekalet') db().prepare("UPDATE hisseler SET vekalet_onay=?, vekalet_tarihi=? WHERE kurban_id=? AND bagisci_adi IS NOT NULL").run(deger ? 1 : 0, deger ? new Date().toISOString() : null, id);
        else if (islem === 'odeme') {
          db().prepare("UPDATE hisseler SET odeme_durumu=? WHERE kurban_id=? AND bagisci_adi IS NOT NULL").run(deger ? 'odendi' : 'bekliyor', id);
          db().prepare('SELECT id FROM hisseler WHERE kurban_id=?').all(id).forEach(h => hisseKasaSenkron(req.hesapId, h.id));
        } else if (islem === 'sil') { kurbanSil(req, k); orglar.add(k.organizasyon_id); }
        etkilenen++;
      }
      orglar.forEach(kurbanNumaralariniDuzenle);
    });
    O.denetimYaz(req, `Toplu kurban işlemi: ${islem}`, 'kurban', { adet: etkilenen, deger });
    return { ok: true, etkilenen };
  });

  // ─── Hisseler ───
  r.put('/hisseler/:id', (req) => {
    const h = sahip('hisseler', req.params.id, req.hesapId);
    const v = hisseVerisi(req.body);
    if (!v.bagisci_adi) throw hata(400, 'Bağışçı adı gerekli');
    const vekalet = req.body.vekalet_onay === undefined ? h.vekalet_onay : (req.body.vekalet_onay ? 1 : 0);
    const vTarih = vekalet ? (h.vekalet_onay ? h.vekalet_tarihi : new Date().toISOString()) : null;
    db().prepare(`UPDATE hisseler SET bagisci_adi=?, bagisci_telefon=?, bagisci_kategori=?, kimin_adina=?, kimin_adina_telefon=?, odeme_durumu=?, odenen_tutar=?,
      video_ister=?, aciklama=?, kurban_turu=?, vekalet_onay=?, vekalet_tarihi=?, guncelleme=datetime('now') WHERE id=?`)
      .run(v.bagisci_adi, v.bagisci_telefon, v.bagisci_kategori, v.kimin_adina, v.kimin_adina_telefon, v.odeme_durumu, v.odenen_tutar, v.video_ister, v.aciklama, v.kurban_turu, vekalet, vTarih, h.id);
    hisseKasaSenkron(req.hesapId, h.id);
    O.denetimYaz(req, 'Hisse güncellendi', 'hisse:' + h.id, { bagisci: v.bagisci_adi, odeme: v.odeme_durumu });
    return { ok: true };
  });
  r.delete('/hisseler/:id', (req) => {
    const h = sahip('hisseler', req.params.id, req.hesapId);
    db().prepare(`UPDATE hisseler SET bagisci_adi=NULL, bagisci_telefon=NULL, bagisci_kategori='Genel Bağışçı', kimin_adina=NULL, kimin_adina_telefon=NULL,
      odeme_durumu='bekliyor', odenen_tutar=0, video_ister=0, aciklama=NULL, vekalet_onay=0, vekalet_tarihi=NULL, guncelleme=datetime('now') WHERE id=?`).run(h.id);
    F.kaynakHareketiSil(req.hesapId, 'hisse', h.id);
    O.denetimYaz(req, 'Hisse boşaltıldı', 'hisse:' + h.id, { bagisci: h.bagisci_adi });
    return { ok: true };
  });
  r.put('/hisseler/:id/vekalet', (req) => {
    const h = sahip('hisseler', req.params.id, req.hesapId);
    const v = req.body.vekalet_onay ? 1 : 0;
    db().prepare('UPDATE hisseler SET vekalet_onay=?, vekalet_tarihi=? WHERE id=?').run(v, v ? new Date().toISOString() : null, h.id);
    O.denetimYaz(req, v ? 'Vekalet alındı' : 'Vekalet kaldırıldı', 'hisse:' + h.id, { bagisci: h.bagisci_adi });
    return { ok: true, vekalet_tarihi: v ? new Date().toISOString() : null };
  });
  r.put('/hisseler/:id/video', (req) => {
    const h = sahip('hisseler', req.params.id, req.hesapId);
    const medyaId = g.tamsayi(req.body.medya_id);
    const m = db().prepare('SELECT * FROM medya WHERE id=? AND hesap_id=?').get(medyaId, req.hesapId);
    if (!m) throw hata(400, 'Önce videoyu yükleyin');
    db().prepare('UPDATE hisseler SET video_url=?, video_public_id=? WHERE id=?').run(m.url, String(m.id), h.id);
    db().prepare("UPDATE medya SET bagli_tur='hisse', bagli_id=? WHERE id=?").run(h.id, m.id);
    return { ok: true, url: m.url };
  });
  r.delete('/hisseler/:id/video', (req) => {
    const h = sahip('hisseler', req.params.id, req.hesapId);
    db().prepare('UPDATE hisseler SET video_url=NULL, video_public_id=NULL WHERE id=?').run(h.id);
    return { ok: true };
  });
  r.post('/hisseler/toplu', (req) => {
    const ids = idListesi(req.body.ids);
    const { islem } = req.body;
    if (!['odeme', 'vekalet', 'temizle'].includes(islem)) throw hata(400, 'Geçersiz işlem');
    const ph = ids.map(() => '?').join(',');
    let n = 0;
    db().islem(() => {
      if (islem === 'odeme') {
        const d = ODEME.includes(req.body.deger) ? req.body.deger : 'bekliyor';
        n = db().prepare(`UPDATE hisseler SET odeme_durumu=? WHERE hesap_id=? AND id IN (${ph}) AND bagisci_adi IS NOT NULL`).run(d, req.hesapId, ...ids).changes;
        ids.forEach(id => hisseKasaSenkron(req.hesapId, id));
      } else if (islem === 'vekalet') {
        const v = req.body.deger ? 1 : 0;
        n = db().prepare(`UPDATE hisseler SET vekalet_onay=?, vekalet_tarihi=? WHERE hesap_id=? AND id IN (${ph}) AND bagisci_adi IS NOT NULL`).run(v, v ? new Date().toISOString() : null, req.hesapId, ...ids).changes;
      } else {
        n = db().prepare(`UPDATE hisseler SET bagisci_adi=NULL, bagisci_telefon=NULL, bagisci_kategori='Genel Bağışçı', kimin_adina=NULL, kimin_adina_telefon=NULL,
          odeme_durumu='bekliyor', odenen_tutar=0, video_ister=0, aciklama=NULL, vekalet_onay=0, vekalet_tarihi=NULL WHERE hesap_id=? AND id IN (${ph})`).run(req.hesapId, ...ids).changes;
        ids.forEach(id => F.kaynakHareketiSil(req.hesapId, 'hisse', id));
      }
    });
    O.denetimYaz(req, `Toplu hisse işlemi: ${islem}`, 'hisse', { adet: n });
    return { ok: true, etkilenen: n };
  });

  // Organizasyonun tüm hissedarları
  r.get('/organizasyonlar/:id/hisseler', (req) => {
    const org = sahip('organizasyonlar', req.params.id, req.hesapId);
    let list = db().prepare(`SELECT h.*, k.kurban_no, k.tur, k.kesildi, k.id AS kurban_id FROM hisseler h JOIN kurbanlar k ON k.id=h.kurban_id
      WHERE k.organizasyon_id=? AND h.hesap_id=? AND h.bagisci_adi IS NOT NULL ORDER BY k.tur, k.kurban_no, h.hisse_no`).all(org.id, req.hesapId);
    list = list.map(h => ({ ...h, hisse_fiyati: hisseFiyati(org, h.tur) }));
    const q = (req.sorgu.q || '').toLocaleLowerCase('tr-TR').trim();
    if (q) list = list.filter(h => [h.bagisci_adi, h.bagisci_telefon, h.kimin_adina, String(h.kurban_no)].some(x => x && String(x).toLocaleLowerCase('tr-TR').includes(q)));
    if (req.sorgu.odeme) list = list.filter(h => h.odeme_durumu === req.sorgu.odeme);
    if (req.sorgu.vekalet === '1') list = list.filter(h => h.vekalet_onay);
    if (req.sorgu.vekalet === '0') list = list.filter(h => !h.vekalet_onay);
    if (req.sorgu.tur) list = list.filter(h => h.tur === req.sorgu.tur);
    if (req.sorgu.kategori) list = list.filter(h => h.bagisci_kategori === req.sorgu.kategori);
    if (req.sorgu.video === '1') list = list.filter(h => h.video_ister);
    return list;
  });

  // Önceki yıllardan bağışçı önerisi (otomatik tamamlama)
  r.get('/bagisci-ara', (req) => {
    const q = g.metin(req.sorgu.q, 60);
    if (!q || q.length < 2) return [];
    const like = '%' + q.toLocaleLowerCase('tr-TR') + '%';
    return db().prepare(`SELECT bagisci_adi, bagisci_telefon, MAX(bagisci_kategori) AS bagisci_kategori, MAX(olusturma) AS son, COUNT(*) AS adet FROM hisseler
      WHERE hesap_id=? AND bagisci_adi IS NOT NULL AND (LOWER(bagisci_adi) LIKE ? OR bagisci_telefon LIKE ?)
      GROUP BY bagisci_adi, bagisci_telefon ORDER BY adet DESC, son DESC LIMIT 10`).all(req.hesapId, like, '%' + q.replace(/\D/g, '') + '%');
  });

  r.get('/organizasyonlar/:id/videolar', (req) => {
    const org = sahip('organizasyonlar', req.params.id, req.hesapId);
    return db().prepare(`SELECT h.id, h.hisse_no, h.bagisci_adi, h.bagisci_telefon, h.video_ister, h.video_url, k.kurban_no, k.tur, k.id AS kurban_id
      FROM hisseler h JOIN kurbanlar k ON k.id=h.kurban_id WHERE k.organizasyon_id=? AND h.bagisci_adi IS NOT NULL AND (h.video_ister=1 OR h.video_url IS NOT NULL)
      ORDER BY k.tur, k.kurban_no, h.hisse_no`).all(org.id);
  });

  // ─── Excel ───
  r.get('/organizasyonlar/:id/excel', (req, res) => {
    const org = sahip('organizasyonlar', req.params.id, req.hesapId);
    const kurbanlar = db().prepare(`SELECT k.*, (SELECT COUNT(*) FROM hisseler h WHERE h.kurban_id=k.id AND h.bagisci_adi IS NOT NULL) AS dolu
      FROM kurbanlar k WHERE k.organizasyon_id=? ORDER BY k.tur, k.kurban_no`).all(org.id);
    const hisseler = db().prepare(`SELECT h.*, k.kurban_no, k.tur FROM hisseler h JOIN kurbanlar k ON k.id=h.kurban_id
      WHERE k.organizasyon_id=? AND h.bagisci_adi IS NOT NULL ORDER BY k.tur, k.kurban_no, h.hisse_no`).all(org.id);
    const oz = orgOzet(req.hesapId, org);
    const odemeAd = { odendi: 'Ödendi', bekliyor: 'Bekliyor', kismi: 'Kısmi', iptal: 'İptal' };
    const buf = X.olustur([
      { ad: 'Özet', basliklar: ['Kalem', 'Değer'], ust: [`${org.ad} (${org.yil})`, `Rapor tarihi: ${new Date().toLocaleDateString('tr-TR')}`], para: [1],
        satirlar: [['Toplam kurban', oz.toplam_kurban], ['Büyükbaş', oz.buyukbas], ['Küçükbaş', oz.kucukbas], ['Kesilen', oz.kesildi], ['Toplam hisse', oz.toplam_hisse],
          ['Dolu hisse', oz.dolu_hisse], ['Boş hisse', oz.bos_hisse], ['Ödenen hisse', oz.odendi], ['Ödeme bekleyen', oz.bekliyor], ['Vekalet alınan', oz.vekalet],
          ['Beklenen gelir', oz.beklenen_gelir], ['Tahsil edilen', oz.tahsil_edilen], ['Bekleyen tahsilat', oz.bekleyen_tahsilat], ['Hayvan maliyeti', oz.maliyet], ['Net', oz.net]], genislik: [28, 20] },
      { ad: 'Kurbanlar', basliklar: ['Kurban no', 'Hayvan', 'Kurban türü', 'Küpe no', 'Alış fiyatı', 'Kesen kişi', 'Hisse', 'Dolu', 'Durum', 'Kesim tarihi'], para: [4],
        satirlar: kurbanlar.map(k => [k.kurban_no, TUR_AD[k.tur], k.kurban_turu, k.kupe_no || '', k.alis_fiyati || 0, k.kesen_kisi || '', k.toplam_hisse, k.dolu, k.kesildi ? 'Kesildi' : k.dolu >= k.toplam_hisse ? 'Doldu' : 'Boş yer var', k.kesim_tarihi || '']) },
      { ad: 'Hissedarlar', basliklar: ['Kurban no', 'Hayvan', 'Hisse', 'Bağışçı', 'Telefon', 'Kategori', 'Kimin adına', 'Kurban türü', 'Ödeme', 'Vekalet', 'Video'], genislik: [10, 11, 7, 28, 16, 18, 28, 12, 11, 9, 8],
        satirlar: hisseler.map(h => [h.kurban_no, TUR_AD[h.tur], h.hisse_no, h.bagisci_adi, h.bagisci_telefon || '', h.bagisci_kategori || '', h.kimin_adina || '', h.kurban_turu, odemeAd[h.odeme_durumu] || h.odeme_durumu, h.vekalet_onay ? 'Alındı' : 'Yok', h.video_ister ? 'İstiyor' : '']) },
    ]);
    res.indir(buf, `kurban-${org.yil}-${org.ad}.xlsx`, X.XLSX_TIP);
  });
  r.get('/kurbanlar/:id/excel', (req, res) => {
    const k = sahip('kurbanlar', req.params.id, req.hesapId);
    const org = sahip('organizasyonlar', k.organizasyon_id, req.hesapId);
    const hs = db().prepare('SELECT * FROM hisseler WHERE kurban_id=? ORDER BY hisse_no').all(k.id);
    res.indir(X.olustur([{ ad: 'Kurban ' + k.kurban_no, ust: [`${org.ad} — Kurban ${k.kurban_no} (${TUR_AD[k.tur]})`, `Küpe: ${k.kupe_no || '-'}  Kesen: ${k.kesen_kisi || '-'}`],
      basliklar: ['Hisse', 'Bağışçı', 'Telefon', 'Kimin adına', 'Kurban türü', 'Ödeme', 'Vekalet', 'Not'],
      satirlar: hs.map(h => [h.hisse_no, h.bagisci_adi || '', h.bagisci_telefon || '', h.kimin_adina || '', h.bagisci_adi ? h.kurban_turu : '', h.bagisci_adi ? h.odeme_durumu : '', h.vekalet_onay ? 'Alındı' : '', h.aciklama || '']) }]),
    `kurban-${k.kurban_no}.xlsx`, X.XLSX_TIP);
  });

  // ─── Bayraklar (yazdırmada sağ üst destekçi bayrağı) ───
  r.get('/bayraklar', (req) => db().prepare('SELECT id, ad, olusturma FROM bayraklar WHERE hesap_id=? ORDER BY ad').all(req.hesapId));
  r.get('/bayraklar/:id/resim', (req) => ({ resim_data: sahip('bayraklar', req.params.id, req.hesapId, 'resim_data').resim_data }));
  r.post('/bayraklar', { limit: 5 * 1024 * 1024 }, (req) => {
    const ad = g.metin(req.body.ad, 80), resim = g.veriResmi(req.body.resim_data);
    if (!ad || !resim) throw hata(400, 'Bayrak adı ve geçerli bir görsel (PNG, JPG, WEBP, SVG — en fazla 3 MB) gerekli');
    return { ok: true, id: db().prepare('INSERT INTO bayraklar (hesap_id, ad, resim_data) VALUES (?,?,?)').run(req.hesapId, ad, resim).lastInsertRowid };
  });
  r.put('/bayraklar/:id', { limit: 5 * 1024 * 1024 }, (req) => {
    sahip('bayraklar', req.params.id, req.hesapId, 'id');
    const ad = g.metin(req.body.ad, 80); if (!ad) throw hata(400, 'Ad gerekli');
    const resim = req.body.resim_data ? g.veriResmi(req.body.resim_data) : null;
    if (req.body.resim_data && !resim) throw hata(400, 'Görsel geçersiz');
    if (resim) db().prepare('UPDATE bayraklar SET ad=?, resim_data=? WHERE id=?').run(ad, resim, +req.params.id);
    else db().prepare('UPDATE bayraklar SET ad=? WHERE id=?').run(ad, +req.params.id);
    return { ok: true };
  });
  r.delete('/bayraklar/:id', (req) => {
    sahip('bayraklar', req.params.id, req.hesapId, 'id');
    db().prepare('DELETE FROM bayraklar WHERE id=?').run(+req.params.id);
    return { ok: true };
  });
};

module.exports.orgOzet = orgOzet;
module.exports.hisseKasaSenkron = hisseKasaSenkron;
module.exports.kurbanNumaralariniDuzenle = kurbanNumaralariniDuzenle;
