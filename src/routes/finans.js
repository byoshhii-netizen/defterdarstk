'use strict';
const { db } = require('../lib/db');
const g = require('../lib/guvenlik');
const { hata } = require('../lib/http');
const O = require('../lib/oturum');
const X = require('../lib/xlsx');
const F = require('../lib/finans');
const { sahip, bugun, copeAt, siradakiNo, yuvarla } = require('./ortak');

const BELGE_TIP = { satis_fatura: { onek: 'SF', ad: 'Satış faturası', cari: 'borc', stok: -1 }, alis_fatura: { onek: 'AF', ad: 'Alış faturası', cari: 'alacak', stok: 1 },
  satis_iade: { onek: 'SI', ad: 'Satış iade faturası', cari: 'alacak', stok: 1 }, alis_iade: { onek: 'AI', ad: 'Alış iade faturası', cari: 'borc', stok: -1 },
  teklif: { onek: 'TK', ad: 'Teklif' }, siparis: { onek: 'SP', ad: 'Sipariş' } };
const FATURA_TIPLERI = ['satis_fatura', 'alis_fatura', 'satis_iade', 'alis_iade'];

function belgeHesapla(kalemlerGirdi) {
  if (!Array.isArray(kalemlerGirdi) || !kalemlerGirdi.length) throw hata(400, 'En az bir kalem ekleyin');
  let ara = 0, iskonto = 0, kdv = 0;
  const kalemler = kalemlerGirdi.slice(0, 300).map(k => {
    const miktar = g.sayi(k.miktar, 1), fiyat = g.sayi(k.birim_fiyat), iskOran = Math.min(100, Math.max(0, g.sayi(k.iskonto_orani))), kdvOran = Math.min(100, Math.max(0, g.sayi(k.kdv_orani, 20)));
    const brut = miktar * fiyat, isk = brut * iskOran / 100, net = brut - isk, satirKdv = net * kdvOran / 100;
    ara += brut; iskonto += isk; kdv += satirKdv;
    return { urun_id: parseInt(k.urun_id, 10) || null, aciklama: g.metin(k.aciklama, 300) || '', miktar, birim: g.metin(k.birim, 20) || 'Adet', birim_fiyat: fiyat,
      iskonto_orani: iskOran, kdv_orani: kdvOran, tutar: yuvarla(net), kdv: yuvarla(satirKdv), toplam: yuvarla(net + satirKdv) };
  });
  if (kalemler.some(k => !k.aciklama)) throw hata(400, 'Her kalemin açıklaması olmalı');
  return { kalemler, ara_toplam: yuvarla(ara), iskonto: yuvarla(iskonto), kdv_toplam: yuvarla(kdv), genel_toplam: yuvarla(ara - iskonto + kdv) };
}

function belgeDurum(b) {
  if (!FATURA_TIPLERI.includes(b.tip)) return b.durum;
  if (b.durum === 'iptal') return 'iptal';
  if (b.odenen >= b.genel_toplam - 0.009) return 'odendi';
  if (b.odenen > 0) return 'kismi';
  return 'acik';
}

// Faturanın cari ve stok etkilerini yeniden yazar
function belgeEtkileri(hesapId, b) {
  F.cariKaynakSil(hesapId, 'belge', b.id);
  db().prepare("DELETE FROM stok_hareketleri WHERE hesap_id=? AND kaynak='belge' AND kaynak_id=?").run(hesapId, b.id);
  const t = BELGE_TIP[b.tip];
  if (!t || !t.cari || b.durum === 'iptal') return;
  if (b.cari_id) {
    db().prepare('INSERT INTO cari_hareketleri (hesap_id, cari_id, tarih, vade, tur, borc, alacak, aciklama, belge_no, kaynak, kaynak_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(hesapId, b.cari_id, b.tarih, b.vade, b.tip, t.cari === 'borc' ? b.genel_toplam : 0, t.cari === 'alacak' ? b.genel_toplam : 0, `${t.ad} ${b.no}`, b.no, 'belge', b.id);
  }
  const kalemler = typeof b.kalemler === 'string' ? JSON.parse(b.kalemler) : b.kalemler;
  for (const k of kalemler) {
    if (!k.urun_id) continue;
    const u = db().prepare('SELECT id, stok_takip FROM urunler WHERE id=? AND hesap_id=?').get(k.urun_id, hesapId);
    if (!u || !u.stok_takip) continue;
    db().prepare('INSERT INTO stok_hareketleri (hesap_id, urun_id, tarih, miktar, birim_fiyat, tur, aciklama, kaynak, kaynak_id) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(hesapId, u.id, b.tarih, k.miktar * t.stok, k.birim_fiyat, 'fatura', `${t.ad} ${b.no}`, 'belge', b.id);
  }
}

function belgeOdenenGuncelle(hesapId, belgeId) {
  if (!belgeId) return;
  const b = db().prepare('SELECT * FROM belgeler WHERE id=? AND hesap_id=?').get(belgeId, hesapId);
  if (!b) return;
  const r = db().prepare("SELECT COALESCE(SUM(borc+alacak),0) AS t FROM cari_hareketleri WHERE hesap_id=? AND kaynak='odeme_belge' AND kaynak_id=?").get(hesapId, belgeId);
  b.odenen = yuvarla(r.t);
  db().prepare('UPDATE belgeler SET odenen=?, durum=? WHERE id=?').run(b.odenen, belgeDurum(b), b.id);
}

// Tahsilat / ödeme: cari hareketi + kasa hareketi
function tahsilatOdeme(req, { cari_id, yon, tutar, tarih, finans_hesap_id, aciklama, belge_id }) {
  const cari = sahip('cariler', cari_id, req.hesapId, 'id, unvan');
  tutar = yuvarla(g.sayi(tutar));
  if (!(tutar > 0)) throw hata(400, 'Tutar sıfırdan büyük olmalı');
  const fh = F.finansHesabiGecerli(req.hesapId, finans_hesap_id);
  if (!fh) throw hata(400, 'Kasa veya banka hesabı seçin');
  const tah = yon === 'tahsilat';
  let belge = null;
  if (belge_id) belge = sahip('belgeler', belge_id, req.hesapId);
  tarih = g.tarih(tarih) || bugun();
  aciklama = g.metin(aciklama, 300) || `${tah ? 'Tahsilat' : 'Ödeme'} — ${cari.unvan}${belge ? ' (' + belge.no + ')' : ''}`;
  return db().islem(() => {
    const ch = db().prepare('INSERT INTO cari_hareketleri (hesap_id, cari_id, tarih, tur, borc, alacak, aciklama, belge_no, kaynak, kaynak_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(req.hesapId, cari.id, tarih, tah ? 'tahsilat' : 'odeme', tah ? 0 : tutar, tah ? tutar : 0, aciklama, belge ? belge.no : null, belge ? 'odeme_belge' : 'tahsilat', belge ? belge.id : null).lastInsertRowid;
    db().prepare(`INSERT INTO finans_hareketleri (hesap_id, finans_hesap_id, tarih, yon, tutar, kategori, aciklama, cari_id, belge_no, kaynak, kaynak_id, olusturan) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(req.hesapId, fh, tarih, tah ? 'giris' : 'cikis', tutar, tah ? 'Tahsilat' : 'Ödeme', aciklama, cari.id, belge ? belge.no : null, 'cari_hareket', ch, req.kullanici.id);
    if (belge) belgeOdenenGuncelle(req.hesapId, belge.id);
    O.denetimYaz(req, tah ? 'Tahsilat alındı' : 'Ödeme yapıldı', 'cari:' + cari.id, { tutar });
    return ch;
  });
}

function urunStoklari(hesapId) {
  const m = {};
  db().prepare('SELECT urun_id, SUM(miktar) AS s FROM stok_hareketleri WHERE hesap_id=? GROUP BY urun_id').all(hesapId).forEach(r => { m[r.urun_id] = yuvarla(r.s); });
  return m;
}

module.exports = function (app) {
  const r = app.yonlendirici('/api');
  r.use(O.kullaniciGerekli); r.use(O.yazmaYetkisi);

  // ─── Kategoriler ───
  r.get('/kategoriler', (req) => {
    const tip = g.metin(req.sorgu.tip, 20);
    return tip ? db().prepare('SELECT * FROM kategoriler WHERE hesap_id=? AND tip=? AND aktif=1 ORDER BY sira, ad').all(req.hesapId, tip)
      : db().prepare('SELECT * FROM kategoriler WHERE hesap_id=? AND aktif=1 ORDER BY tip, sira, ad').all(req.hesapId);
  });
  r.post('/kategoriler', (req) => {
    const tip = ['gelir', 'gider', 'bagisci', 'urun', 'cari'].includes(req.body.tip) ? req.body.tip : null;
    const ad = g.metin(req.body.ad, 80);
    if (!tip || !ad) throw hata(400, 'Kategori adı ve tipi gerekli');
    if (db().prepare('SELECT id FROM kategoriler WHERE hesap_id=? AND tip=? AND ad=? AND aktif=1').get(req.hesapId, tip, ad)) throw hata(409, 'Bu kategori zaten var');
    return { ok: true, id: db().prepare('INSERT INTO kategoriler (hesap_id, tip, ad, varsayilan_tutar) VALUES (?,?,?,?)').run(req.hesapId, tip, ad, g.sayi(req.body.varsayilan_tutar)).lastInsertRowid };
  });
  r.put('/kategoriler/:id', (req) => {
    sahip('kategoriler', req.params.id, req.hesapId, 'id');
    const ad = g.metin(req.body.ad, 80); if (!ad) throw hata(400, 'Ad gerekli');
    db().prepare('UPDATE kategoriler SET ad=?, varsayilan_tutar=? WHERE id=?').run(ad, g.sayi(req.body.varsayilan_tutar), +req.params.id);
    return { ok: true };
  });
  r.delete('/kategoriler/:id', (req) => {
    sahip('kategoriler', req.params.id, req.hesapId, 'id');
    db().prepare('UPDATE kategoriler SET aktif=0 WHERE id=?').run(+req.params.id);
    return { ok: true };
  });

  // ─── Kasa / banka hesapları ───
  r.get('/finans/hesaplar', (req) => F.hesapBakiyeleri(req.hesapId));
  function fhVerisi(b) {
    const ad = g.metin(b.ad, 100);
    if (!ad) throw hata(400, 'Hesap adı gerekli');
    const tur = ['kasa', 'banka', 'kredi_karti', 'pos', 'diger'].includes(b.tur) ? b.tur : 'kasa';
    const iban = g.metin(b.iban, 40);
    if (iban && !/^TR\d{2}[0-9A-Z ]{10,30}$/i.test(iban.replace(/\s/g, ''))) throw hata(400, 'IBAN TR ile başlamalı ve geçerli olmalı');
    return [ad, tur, g.metin(b.banka_adi, 80), g.metin(b.sube, 80), iban ? iban.toUpperCase() : null, g.metin(b.para_birimi, 5) || 'TRY', g.sayi(b.acilis_bakiye)];
  }
  r.post('/finans/hesaplar', (req) => {
    const id = db().prepare('INSERT INTO finans_hesaplari (ad, tur, banka_adi, sube, iban, para_birimi, acilis_bakiye, hesap_id) VALUES (?,?,?,?,?,?,?,?)').run(...fhVerisi(req.body), req.hesapId).lastInsertRowid;
    O.denetimYaz(req, 'Kasa/banka hesabı açıldı', 'finans_hesap:' + id, { ad: req.body.ad });
    return { ok: true, id };
  });
  r.put('/finans/hesaplar/:id', (req) => {
    sahip('finans_hesaplari', req.params.id, req.hesapId, 'id');
    db().prepare('UPDATE finans_hesaplari SET ad=?, tur=?, banka_adi=?, sube=?, iban=?, para_birimi=?, acilis_bakiye=?, aktif=? WHERE id=?').run(...fhVerisi(req.body), req.body.aktif === 0 ? 0 : 1, +req.params.id);
    return { ok: true };
  });
  r.delete('/finans/hesaplar/:id', (req) => {
    sahip('finans_hesaplari', req.params.id, req.hesapId, 'id');
    const n = db().prepare('SELECT COUNT(*) AS c FROM finans_hareketleri WHERE finans_hesap_id=?').get(+req.params.id).c;
    if (n) { db().prepare('UPDATE finans_hesaplari SET aktif=0 WHERE id=?').run(+req.params.id); return { ok: true, mesaj: 'Hesapta hareket olduğu için pasife alındı' }; }
    db().prepare('DELETE FROM finans_hesaplari WHERE id=?').run(+req.params.id);
    return { ok: true };
  });

  r.get('/finans/hareketler', (req) => {
    const q = req.sorgu; const p = [req.hesapId];
    let sql = `SELECT h.*, f.ad AS hesap_ad, c.unvan AS cari_unvan FROM finans_hareketleri h JOIN finans_hesaplari f ON f.id=h.finans_hesap_id LEFT JOIN cariler c ON c.id=h.cari_id WHERE h.hesap_id=?`;
    if (q.hesap) { sql += ' AND h.finans_hesap_id=?'; p.push(+q.hesap); }
    if (q.yon) { sql += ' AND h.yon=?'; p.push(q.yon === 'cikis' ? 'cikis' : 'giris'); }
    if (q.kategori) { sql += ' AND h.kategori=?'; p.push(String(q.kategori)); }
    if (g.tarih(q.bas)) { sql += ' AND h.tarih>=?'; p.push(q.bas); }
    if (g.tarih(q.bit)) { sql += ' AND h.tarih<=?'; p.push(q.bit); }
    if (q.q) { sql += ' AND (LOWER(h.aciklama) LIKE ? OR LOWER(c.unvan) LIKE ? OR h.belge_no LIKE ?)'; const l = '%' + String(q.q).toLocaleLowerCase('tr-TR') + '%'; p.push(l, l, l); }
    const tumu = db().prepare(sql + ' ORDER BY h.tarih DESC, h.id DESC LIMIT 5000').all(...p);
    const giris = tumu.filter(x => x.yon === 'giris').reduce((s, x) => s + x.tutar, 0), cikis = tumu.filter(x => x.yon === 'cikis').reduce((s, x) => s + x.tutar, 0);
    const limit = Math.min(500, parseInt(q.limit, 10) || 100), sayfa = Math.max(1, parseInt(q.sayfa, 10) || 1);
    return { toplam: tumu.length, giris: yuvarla(giris), cikis: yuvarla(cikis), net: yuvarla(giris - cikis), hareketler: tumu.slice((sayfa - 1) * limit, sayfa * limit).map(x => ({ ...x, belge_data: undefined, belge_var: !!x.belge_data })) };
  });
  r.get('/finans/hareketler/:id/belge', (req) => {
    const h = sahip('finans_hareketleri', req.params.id, req.hesapId, 'belge_data, belge_adi');
    if (!h.belge_data) throw hata(404, 'Belge yok');
    return h;
  });
  r.post('/finans/hareketler', { limit: 6 * 1024 * 1024 }, (req) => {
    const b = req.body;
    const fh = F.finansHesabiGecerli(req.hesapId, b.finans_hesap_id);
    if (!fh) throw hata(400, 'Kasa veya banka hesabı seçin');
    const yon = b.yon === 'cikis' ? 'cikis' : 'giris';
    const tutar = yuvarla(g.sayi(b.tutar));
    if (!(tutar > 0)) throw hata(400, 'Tutar sıfırdan büyük olmalı');
    const aciklama = g.metin(b.aciklama, 300); if (!aciklama) throw hata(400, 'Açıklama gerekli');
    let belge = null;
    if (b.belge_data) { belge = String(b.belge_data); if (!/^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,/.test(belge) || belge.length > 7e6) throw hata(400, 'Belge PNG, JPG veya PDF olmalı (en fazla 5 MB)'); }
    const cari = b.cari_id ? sahip('cariler', b.cari_id, req.hesapId, 'id').id : null;
    const id = db().prepare(`INSERT INTO finans_hareketleri (hesap_id, finans_hesap_id, tarih, yon, tutar, kategori, aciklama, cari_id, belge_no, belge_data, belge_adi, kaynak, olusturan) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(req.hesapId, fh, g.tarih(b.tarih) || bugun(), yon, tutar, g.metin(b.kategori, 80), aciklama, cari, g.metin(b.belge_no, 50), belge, belge ? g.metin(b.belge_adi, 120) : null, 'manuel', req.kullanici.id).lastInsertRowid;
    O.denetimYaz(req, yon === 'giris' ? 'Gelir kaydı' : 'Gider kaydı', 'finans:' + id, { tutar, aciklama });
    return { ok: true, id };
  });
  r.post('/finans/transfer', (req) => {
    const b = req.body;
    const kaynak = F.finansHesabiGecerli(req.hesapId, b.kaynak_id), hedef = F.finansHesabiGecerli(req.hesapId, b.hedef_id);
    if (!kaynak || !hedef || kaynak === hedef) throw hata(400, 'Farklı iki hesap seçin');
    const tutar = yuvarla(g.sayi(b.tutar)); if (!(tutar > 0)) throw hata(400, 'Tutar geçersiz');
    const tid = g.rastgele(9), tarih = g.tarih(b.tarih) || bugun(), ac = g.metin(b.aciklama, 200) || 'Hesaplar arası virman';
    db().islem(() => {
      const ins = db().prepare('INSERT INTO finans_hareketleri (hesap_id, finans_hesap_id, tarih, yon, tutar, kategori, aciklama, transfer_id, kaynak, olusturan) VALUES (?,?,?,?,?,?,?,?,?,?)');
      ins.run(req.hesapId, kaynak, tarih, 'cikis', tutar, 'Virman', ac, tid, 'transfer', req.kullanici.id);
      ins.run(req.hesapId, hedef, tarih, 'giris', tutar, 'Virman', ac, tid, 'transfer', req.kullanici.id);
    });
    O.denetimYaz(req, 'Virman yapıldı', 'finans', { tutar });
    return { ok: true };
  });
  r.delete('/finans/hareketler/:id', (req) => {
    const h = sahip('finans_hareketleri', req.params.id, req.hesapId);
    if (h.kaynak && !['manuel', 'transfer', 'cari_hareket'].includes(h.kaynak)) throw hata(400, 'Bu hareket başka bir kayıttan (bağış, masraf, hisse vb.) otomatik oluştu. Kaynak kaydı düzenleyin.');
    db().islem(() => {
      copeAt(req.hesapId, 'finans_hareketi', `${h.yon === 'giris' ? 'Giriş' : 'Çıkış'}: ${h.aciklama} (${h.tutar})`, { hareket: h }, req.kullanici.ad_soyad);
      if (h.transfer_id) db().prepare('DELETE FROM finans_hareketleri WHERE hesap_id=? AND transfer_id=?').run(req.hesapId, h.transfer_id);
      else if (h.kaynak === 'cari_hareket') {
        const ch = db().prepare('SELECT * FROM cari_hareketleri WHERE id=? AND hesap_id=?').get(h.kaynak_id, req.hesapId);
        db().prepare('DELETE FROM cari_hareketleri WHERE id=? AND hesap_id=?').run(h.kaynak_id, req.hesapId);
        db().prepare('DELETE FROM finans_hareketleri WHERE id=?').run(h.id);
        if (ch && ch.kaynak === 'odeme_belge') belgeOdenenGuncelle(req.hesapId, ch.kaynak_id);
      } else db().prepare('DELETE FROM finans_hareketleri WHERE id=?').run(h.id);
    });
    O.denetimYaz(req, 'Kasa hareketi silindi', 'finans:' + h.id, { tutar: h.tutar });
    return { ok: true };
  });
  r.get('/finans/hareketler-excel', (req, res) => {
    const p = [req.hesapId]; let sql = 'SELECT h.*, f.ad AS hesap_ad, c.unvan FROM finans_hareketleri h JOIN finans_hesaplari f ON f.id=h.finans_hesap_id LEFT JOIN cariler c ON c.id=h.cari_id WHERE h.hesap_id=?';
    if (req.sorgu.hesap) { sql += ' AND h.finans_hesap_id=?'; p.push(+req.sorgu.hesap); }
    if (g.tarih(req.sorgu.bas)) { sql += ' AND h.tarih>=?'; p.push(req.sorgu.bas); }
    if (g.tarih(req.sorgu.bit)) { sql += ' AND h.tarih<=?'; p.push(req.sorgu.bit); }
    const l = db().prepare(sql + ' ORDER BY h.tarih, h.id').all(...p);
    res.indir(X.olustur([{ ad: 'Kasa hareketleri', basliklar: ['Tarih', 'Hesap', 'Kategori', 'Açıklama', 'Cari', 'Belge no', 'Giriş', 'Çıkış'], para: [6, 7],
      satirlar: l.map(h => [h.tarih, h.hesap_ad, h.kategori || '', h.aciklama || '', h.unvan || '', h.belge_no || '', h.yon === 'giris' ? h.tutar : '', h.yon === 'cikis' ? h.tutar : '']) }]),
    `kasa-hareketleri-${bugun()}.xlsx`, X.XLSX_TIP);
  });

  // ─── Cari hesaplar ───
  r.get('/cariler', (req) => {
    const bak = {};
    db().prepare('SELECT cari_id, SUM(borc) AS b, SUM(alacak) AS a, MAX(tarih) AS son FROM cari_hareketleri WHERE hesap_id=? GROUP BY cari_id').all(req.hesapId)
      .forEach(x => { bak[x.cari_id] = { bakiye: yuvarla(x.b - x.a), son: x.son }; });
    let l = db().prepare('SELECT * FROM cariler WHERE hesap_id=? ORDER BY unvan').all(req.hesapId).map(c => ({ ...c, bakiye: (bak[c.id] || {}).bakiye || 0, son_hareket: (bak[c.id] || {}).son || null }));
    const q = (req.sorgu.q || '').toLocaleLowerCase('tr-TR');
    if (q) l = l.filter(c => [c.unvan, c.yetkili, c.telefon, c.vergi_no, c.kod, c.eposta].some(x => x && String(x).toLocaleLowerCase('tr-TR').includes(q)));
    if (req.sorgu.tur) l = l.filter(c => c.tur === req.sorgu.tur || c.tur === 'her_ikisi');
    if (req.sorgu.bakiye === 'alacak') l = l.filter(c => c.bakiye > 0.009);
    if (req.sorgu.bakiye === 'borc') l = l.filter(c => c.bakiye < -0.009);
    if (req.sorgu.aktif !== 'hepsi') l = l.filter(c => c.aktif);
    return { cariler: l, toplam_alacak: yuvarla(l.filter(c => c.bakiye > 0).reduce((s, c) => s + c.bakiye, 0)), toplam_borc: yuvarla(-l.filter(c => c.bakiye < 0).reduce((s, c) => s + c.bakiye, 0)) };
  });
  r.get('/cariler/secenekler', (req) => db().prepare('SELECT id, unvan, tur, vade_gun FROM cariler WHERE hesap_id=? AND aktif=1 ORDER BY unvan LIMIT 3000').all(req.hesapId));
  function cariVerisi(b) {
    const unvan = g.metin(b.unvan, 200); if (!unvan) throw hata(400, 'Unvan / ad soyad gerekli');
    const vn = g.metin(b.vergi_no, 15);
    if (vn && !/^\d{10,11}$/.test(vn)) throw hata(400, 'Vergi no 10, TC kimlik no 11 haneli olmalı');
    return { tur: ['musteri', 'tedarikci', 'her_ikisi', 'bagisci', 'personel', 'diger'].includes(b.tur) ? b.tur : 'musteri', kod: g.metin(b.kod, 30), unvan, yetkili: g.metin(b.yetkili, 100),
      vergi_no: vn, vergi_dairesi: g.metin(b.vergi_dairesi, 80), telefon: g.metin(b.telefon, 30), eposta: b.eposta ? g.eposta(b.eposta) : null, adres: g.metin(b.adres, 500),
      il: g.metin(b.il, 40), iban: g.metin(b.iban, 40), risk_limiti: g.sayi(b.risk_limiti), vade_gun: g.tamsayi(b.vade_gun), etiketler: g.metin(b.etiketler, 200), notlar: g.metin(b.notlar, 2000) };
  }
  r.post('/cariler', (req) => {
    const v = cariVerisi(req.body);
    const id = db().islem(() => {
      if (!v.kod) v.kod = siradakiNo(req.hesapId, 'CR').replace(/^CR-\d{4}-/, 'CR');
      const k = Object.keys(v);
      const yeni = db().prepare(`INSERT INTO cariler (hesap_id, ${k.join(',')}) VALUES (?, ${k.map(() => '?').join(',')})`).run(req.hesapId, ...Object.values(v)).lastInsertRowid;
      const acilis = yuvarla(g.sayi(req.body.acilis_bakiye));
      if (acilis) db().prepare("INSERT INTO cari_hareketleri (hesap_id, cari_id, tarih, tur, borc, alacak, aciklama, kaynak) VALUES (?,?,?,?,?,?,?, 'acilis')").run(req.hesapId, yeni, bugun(), 'acilis', acilis > 0 ? acilis : 0, acilis < 0 ? -acilis : 0, 'Açılış bakiyesi');
      return yeni;
    });
    O.denetimYaz(req, 'Cari hesap açıldı', 'cari:' + id, { unvan: v.unvan });
    return { ok: true, id };
  });
  r.get('/cariler/:id', (req) => {
    const c = sahip('cariler', req.params.id, req.hesapId);
    const hareketler = db().prepare('SELECT * FROM cari_hareketleri WHERE hesap_id=? AND cari_id=? ORDER BY tarih, id').all(req.hesapId, c.id);
    let bakiye = 0;
    hareketler.forEach(h => { bakiye += h.borc - h.alacak; h.bakiye = yuvarla(bakiye); });
    const acikBelgeler = db().prepare(`SELECT id, tip, no, tarih, vade, genel_toplam, odenen, durum FROM belgeler WHERE hesap_id=? AND cari_id=? AND tip IN ('satis_fatura','alis_fatura') AND durum IN ('acik','kismi') ORDER BY vade`).all(req.hesapId, c.id);
    const cekler = db().prepare("SELECT * FROM cek_senet WHERE hesap_id=? AND cari_id=? AND durum='portfoy'").all(req.hesapId, c.id);
    return { cari: c, hareketler: hareketler.reverse(), bakiye: yuvarla(bakiye), acikBelgeler, cekler, risk_asimi: c.risk_limiti > 0 && bakiye > c.risk_limiti };
  });
  r.put('/cariler/:id', (req) => {
    const c = sahip('cariler', req.params.id, req.hesapId, 'id');
    const v = cariVerisi(req.body);
    db().prepare(`UPDATE cariler SET ${Object.keys(v).map(k => k + '=?').join(',')}, aktif=? WHERE id=?`).run(...Object.values(v), req.body.aktif === 0 ? 0 : 1, c.id);
    O.denetimYaz(req, 'Cari hesap güncellendi', 'cari:' + c.id);
    return { ok: true };
  });
  r.delete('/cariler/:id', (req) => {
    const c = sahip('cariler', req.params.id, req.hesapId);
    const n = db().prepare('SELECT COUNT(*) AS c FROM cari_hareketleri WHERE cari_id=? AND hesap_id=?').get(c.id, req.hesapId).c;
    if (n) { db().prepare('UPDATE cariler SET aktif=0 WHERE id=?').run(c.id); return { ok: true, mesaj: 'Hareketi olan cari silinemez; pasife alındı.' }; }
    copeAt(req.hesapId, 'cari', c.unvan, { cari: c }, req.kullanici.ad_soyad);
    db().prepare('DELETE FROM cariler WHERE id=?').run(c.id);
    return { ok: true };
  });
  r.post('/cariler/:id/tahsilat', (req) => ({ ok: true, id: tahsilatOdeme(req, { ...req.body, cari_id: req.params.id, yon: req.body.yon === 'odeme' ? 'odeme' : 'tahsilat' }) }));
  r.post('/cariler/:id/duzeltme', (req) => {
    const c = sahip('cariler', req.params.id, req.hesapId, 'id');
    const tutar = yuvarla(g.sayi(req.body.tutar)); if (!tutar) throw hata(400, 'Tutar gerekli');
    db().prepare("INSERT INTO cari_hareketleri (hesap_id, cari_id, tarih, tur, borc, alacak, aciklama, kaynak) VALUES (?,?,?,?,?,?,?, 'duzeltme')")
      .run(req.hesapId, c.id, g.tarih(req.body.tarih) || bugun(), 'duzeltme', tutar > 0 ? tutar : 0, tutar < 0 ? -tutar : 0, g.metin(req.body.aciklama, 200) || 'Bakiye düzeltme');
    O.denetimYaz(req, 'Cari bakiye düzeltmesi', 'cari:' + c.id, { tutar });
    return { ok: true };
  });
  r.delete('/cari-hareketleri/:id', (req) => {
    const h = sahip('cari_hareketleri', req.params.id, req.hesapId);
    if (h.kaynak === 'belge') throw hata(400, 'Fatura hareketi faturadan silinir veya iptal edilir');
    db().islem(() => {
      db().prepare("DELETE FROM finans_hareketleri WHERE hesap_id=? AND kaynak='cari_hareket' AND kaynak_id=?").run(req.hesapId, h.id);
      db().prepare('DELETE FROM cari_hareketleri WHERE id=?').run(h.id);
      if (h.kaynak === 'odeme_belge') belgeOdenenGuncelle(req.hesapId, h.kaynak_id);
    });
    O.denetimYaz(req, 'Cari hareket silindi', 'cari:' + h.cari_id, { borc: h.borc, alacak: h.alacak });
    return { ok: true };
  });
  r.get('/cariler/:id/ekstre-excel', (req, res) => {
    const c = sahip('cariler', req.params.id, req.hesapId);
    const hs = db().prepare('SELECT * FROM cari_hareketleri WHERE hesap_id=? AND cari_id=? ORDER BY tarih, id').all(req.hesapId, c.id);
    let b = 0;
    res.indir(X.olustur([{ ad: 'Ekstre', ust: [`${c.unvan} — Cari hesap ekstresi`, `Tarih: ${new Date().toLocaleDateString('tr-TR')}`], basliklar: ['Tarih', 'Vade', 'İşlem', 'Belge no', 'Açıklama', 'Borç', 'Alacak', 'Bakiye'], para: [5, 6, 7],
      satirlar: hs.map(h => { b += h.borc - h.alacak; return [h.tarih, h.vade || '', h.tur, h.belge_no || '', h.aciklama || '', h.borc || '', h.alacak || '', yuvarla(b)]; }) }]),
    `ekstre-${c.unvan}.xlsx`, X.XLSX_TIP);
  });

  // ─── Ürünler ve stok ───
  r.get('/urunler', (req) => {
    const st = urunStoklari(req.hesapId);
    let l = db().prepare('SELECT * FROM urunler WHERE hesap_id=? ORDER BY ad').all(req.hesapId).map(u => ({ ...u, stok: st[u.id] || 0 }));
    const q = (req.sorgu.q || '').toLocaleLowerCase('tr-TR');
    if (q) l = l.filter(u => [u.ad, u.kod, u.barkod, u.kategori].some(x => x && String(x).toLocaleLowerCase('tr-TR').includes(q)));
    if (req.sorgu.kritik === '1') l = l.filter(u => u.stok_takip && u.stok <= u.kritik_stok);
    if (req.sorgu.aktif !== 'hepsi') l = l.filter(u => u.aktif);
    const deger = l.filter(u => u.stok_takip).reduce((s, u) => s + Math.max(0, u.stok) * (u.alis_fiyati || 0), 0);
    return { urunler: l, stok_degeri: yuvarla(deger), kritik: l.filter(u => u.stok_takip && u.stok <= u.kritik_stok).length };
  });
  function urunVerisi(b) {
    const ad = g.metin(b.ad, 200); if (!ad) throw hata(400, 'Ürün adı gerekli');
    return { kod: g.metin(b.kod, 50), barkod: g.metin(b.barkod, 50), ad, kategori: g.metin(b.kategori, 80), tip: b.tip === 'hizmet' ? 'hizmet' : 'urun', birim: g.metin(b.birim, 20) || 'Adet',
      alis_fiyati: g.sayi(b.alis_fiyati), satis_fiyati: g.sayi(b.satis_fiyati), kdv_orani: g.sayi(b.kdv_orani, 20), stok_takip: b.tip === 'hizmet' ? 0 : (b.stok_takip === false || b.stok_takip === 0 ? 0 : 1),
      kritik_stok: g.sayi(b.kritik_stok), depo: g.metin(b.depo, 60), aciklama: g.metin(b.aciklama, 1000) };
  }
  r.post('/urunler', (req) => {
    const v = urunVerisi(req.body);
    const id = db().islem(() => {
      if (!v.kod) v.kod = siradakiNo(req.hesapId, 'UR').replace(/^UR-\d{4}-/, 'UR');
      const k = Object.keys(v);
      const yeni = db().prepare(`INSERT INTO urunler (hesap_id, ${k.join(',')}) VALUES (?, ${k.map(() => '?').join(',')})`).run(req.hesapId, ...Object.values(v)).lastInsertRowid;
      const acilis = g.sayi(req.body.acilis_stok);
      if (acilis && v.stok_takip) db().prepare("INSERT INTO stok_hareketleri (hesap_id, urun_id, tarih, miktar, birim_fiyat, tur, aciklama) VALUES (?,?,?,?,?, 'giris', 'Açılış stoku')").run(req.hesapId, yeni, bugun(), acilis, v.alis_fiyati);
      return yeni;
    });
    return { ok: true, id };
  });
  r.get('/urunler/:id', (req) => {
    const u = sahip('urunler', req.params.id, req.hesapId);
    const hareketler = db().prepare('SELECT * FROM stok_hareketleri WHERE hesap_id=? AND urun_id=? ORDER BY tarih DESC, id DESC LIMIT 300').all(req.hesapId, u.id);
    return { urun: { ...u, stok: urunStoklari(req.hesapId)[u.id] || 0 }, hareketler };
  });
  r.put('/urunler/:id', (req) => {
    const u = sahip('urunler', req.params.id, req.hesapId, 'id');
    const v = urunVerisi(req.body);
    db().prepare(`UPDATE urunler SET ${Object.keys(v).map(k => k + '=?').join(',')}, aktif=? WHERE id=?`).run(...Object.values(v), req.body.aktif === 0 ? 0 : 1, u.id);
    return { ok: true };
  });
  r.delete('/urunler/:id', (req) => {
    const u = sahip('urunler', req.params.id, req.hesapId);
    const n = db().prepare('SELECT COUNT(*) AS c FROM stok_hareketleri WHERE urun_id=?').get(u.id).c;
    if (n) { db().prepare('UPDATE urunler SET aktif=0 WHERE id=?').run(u.id); return { ok: true, mesaj: 'Hareketi olan ürün pasife alındı' }; }
    copeAt(req.hesapId, 'urun', u.ad, { urun: u }, req.kullanici.ad_soyad);
    db().prepare('DELETE FROM urunler WHERE id=?').run(u.id);
    return { ok: true };
  });
  r.get('/stok/hareketler', (req) => {
    const p = [req.hesapId]; let sql = 'SELECT s.*, u.ad AS urun_ad, u.birim FROM stok_hareketleri s JOIN urunler u ON u.id=s.urun_id WHERE s.hesap_id=?';
    if (req.sorgu.urun) { sql += ' AND s.urun_id=?'; p.push(+req.sorgu.urun); }
    if (req.sorgu.tur) { sql += ' AND s.tur=?'; p.push(String(req.sorgu.tur)); }
    return db().prepare(sql + ' ORDER BY s.tarih DESC, s.id DESC LIMIT 1000').all(...p);
  });
  r.post('/stok/hareketler', (req) => {
    const b = req.body;
    const u = sahip('urunler', b.urun_id, req.hesapId, 'id, stok_takip, alis_fiyati');
    if (!u.stok_takip) throw hata(400, 'Bu üründe stok takibi kapalı');
    const tur = ['giris', 'cikis', 'sayim', 'fire'].includes(b.tur) ? b.tur : null;
    if (!tur) throw hata(400, 'Hareket türü seçin');
    let miktar = g.sayi(b.miktar);
    if (tur === 'sayim') { const mevcut = urunStoklari(req.hesapId)[u.id] || 0; miktar = miktar - mevcut; }
    else { if (!(miktar > 0)) throw hata(400, 'Miktar sıfırdan büyük olmalı'); if (tur !== 'giris') miktar = -miktar; }
    if (!miktar) return { ok: true, mesaj: 'Sayım sonucu stokla aynı, fark yok' };
    db().prepare('INSERT INTO stok_hareketleri (hesap_id, urun_id, tarih, miktar, birim_fiyat, tur, aciklama) VALUES (?,?,?,?,?,?,?)')
      .run(req.hesapId, u.id, g.tarih(b.tarih) || bugun(), miktar, g.sayi(b.birim_fiyat, u.alis_fiyati), tur, g.metin(b.aciklama, 300));
    O.denetimYaz(req, 'Stok hareketi', 'urun:' + u.id, { tur, miktar });
    return { ok: true };
  });
  r.delete('/stok/hareketler/:id', (req) => {
    const s = sahip('stok_hareketleri', req.params.id, req.hesapId);
    if (s.kaynak === 'belge') throw hata(400, 'Faturadan gelen stok hareketi faturadan düzenlenir');
    db().prepare('DELETE FROM stok_hareketleri WHERE id=?').run(s.id);
    return { ok: true };
  });

  // ─── Belgeler (fatura, teklif, sipariş) ───
  r.get('/belgeler', (req) => {
    const tipler = String(req.sorgu.tip || 'fatura').split(',');
    const gercek = tipler.flatMap(t => t === 'fatura' ? FATURA_TIPLERI : [t]).filter(t => BELGE_TIP[t]);
    if (!gercek.length) throw hata(400, 'Geçersiz belge tipi');
    const p = [req.hesapId, ...gercek];
    let sql = `SELECT b.id, b.tip, b.no, b.cari_id, b.tarih, b.vade, b.durum, b.ara_toplam, b.kdv_toplam, b.genel_toplam, b.odenen, b.donusen_id, c.unvan
      FROM belgeler b LEFT JOIN cariler c ON c.id=b.cari_id WHERE b.hesap_id=? AND b.tip IN (${gercek.map(() => '?').join(',')})`;
    if (req.sorgu.durum === 'vadesi_gecen') { sql += " AND b.durum IN ('acik','kismi') AND b.vade < ?"; p.push(bugun()); }
    else if (req.sorgu.durum) { sql += ' AND b.durum=?'; p.push(String(req.sorgu.durum)); }
    if (g.tarih(req.sorgu.bas)) { sql += ' AND b.tarih>=?'; p.push(req.sorgu.bas); }
    if (g.tarih(req.sorgu.bit)) { sql += ' AND b.tarih<=?'; p.push(req.sorgu.bit); }
    if (req.sorgu.cari) { sql += ' AND b.cari_id=?'; p.push(+req.sorgu.cari); }
    if (req.sorgu.q) { sql += ' AND (b.no LIKE ? OR LOWER(c.unvan) LIKE ?)'; const l = '%' + String(req.sorgu.q).toLocaleLowerCase('tr-TR') + '%'; p.push(l, l); }
    const l = db().prepare(sql + ' ORDER BY b.tarih DESC, b.id DESC LIMIT 2000').all(...p);
    const aktif = l.filter(x => x.durum !== 'iptal');
    return { belgeler: l, toplam: yuvarla(aktif.reduce((s, x) => s + x.genel_toplam, 0)), acik: yuvarla(aktif.reduce((s, x) => s + Math.max(0, x.genel_toplam - x.odenen), 0)) };
  });
  r.get('/belgeler/:id', (req) => {
    const b = sahip('belgeler', req.params.id, req.hesapId);
    b.kalemler = JSON.parse(b.kalemler);
    const cari = b.cari_id ? db().prepare('SELECT * FROM cariler WHERE id=? AND hesap_id=?').get(b.cari_id, req.hesapId) : null;
    const odemeler = db().prepare("SELECT * FROM cari_hareketleri WHERE hesap_id=? AND kaynak='odeme_belge' AND kaynak_id=? ORDER BY tarih").all(req.hesapId, b.id);
    return { belge: b, cari, odemeler, tip_ad: BELGE_TIP[b.tip].ad };
  });
  function belgeKaydet(req, mevcut) {
    const b = req.body;
    const tip = mevcut ? mevcut.tip : b.tip;
    if (!BELGE_TIP[tip]) throw hata(400, 'Belge tipi geçersiz');
    const cari = b.cari_id ? sahip('cariler', b.cari_id, req.hesapId, 'id, vade_gun') : null;
    if (FATURA_TIPLERI.includes(tip) && !cari) throw hata(400, 'Fatura için cari hesap seçin');
    const hesap = belgeHesapla(b.kalemler);
    hesap.kalemler.forEach(k => { if (k.urun_id && !db().prepare('SELECT id FROM urunler WHERE id=? AND hesap_id=?').get(k.urun_id, req.hesapId)) k.urun_id = null; });
    const tarih = g.tarih(b.tarih) || bugun();
    let vade = g.tarih(b.vade);
    if (!vade && cari && cari.vade_gun) { const d = new Date(tarih); d.setDate(d.getDate() + cari.vade_gun); vade = d.toISOString().slice(0, 10); }
    return db().islem(() => {
      const no = g.metin(b.no, 40) || (mevcut ? mevcut.no : siradakiNo(req.hesapId, BELGE_TIP[tip].onek));
      if (db().prepare('SELECT id FROM belgeler WHERE hesap_id=? AND tip=? AND no=? AND id<>?').get(req.hesapId, tip, no, mevcut ? mevcut.id : 0)) throw hata(409, 'Bu belge numarası zaten kullanılmış');
      const durumGirdi = FATURA_TIPLERI.includes(tip) ? (mevcut && mevcut.durum === 'iptal' ? 'iptal' : 'acik') : (['taslak', 'gonderildi', 'onaylandi', 'reddedildi', 'faturalandi'].includes(b.durum) ? b.durum : (mevcut ? mevcut.durum : 'taslak'));
      let id;
      const vals = [no, cari ? cari.id : null, tarih, vade, durumGirdi, JSON.stringify(hesap.kalemler), hesap.ara_toplam, hesap.iskonto, hesap.kdv_toplam, hesap.genel_toplam, g.metin(b.notlar, 2000)];
      if (mevcut) {
        db().prepare("UPDATE belgeler SET no=?, cari_id=?, tarih=?, vade=?, durum=?, kalemler=?, ara_toplam=?, iskonto=?, kdv_toplam=?, genel_toplam=?, notlar=?, guncelleme=datetime('now') WHERE id=?").run(...vals, mevcut.id);
        id = mevcut.id;
      } else {
        id = db().prepare('INSERT INTO belgeler (no, cari_id, tarih, vade, durum, kalemler, ara_toplam, iskonto, kdv_toplam, genel_toplam, notlar, hesap_id, tip, kaynak_id, olusturan) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(...vals, req.hesapId, tip, parseInt(b.kaynak_id, 10) || null, req.kullanici.id).lastInsertRowid;
      }
      const kayit = db().prepare('SELECT * FROM belgeler WHERE id=?').get(id);
      belgeEtkileri(req.hesapId, kayit);
      belgeOdenenGuncelle(req.hesapId, id);
      if (!mevcut && b.kaynak_id) db().prepare("UPDATE belgeler SET donusen_id=?, durum='faturalandi' WHERE id=? AND hesap_id=?").run(id, +b.kaynak_id, req.hesapId);
      // Peşin tahsilat/ödeme
      if (!mevcut && b.pesin && b.pesin.finans_hesap_id && FATURA_TIPLERI.includes(tip)) {
        const yon = (tip === 'satis_fatura' || tip === 'alis_iade') ? 'tahsilat' : 'odeme';
        tahsilatOdeme(req, { cari_id: cari.id, yon, tutar: g.sayi(b.pesin.tutar) || hesap.genel_toplam, tarih, finans_hesap_id: b.pesin.finans_hesap_id, belge_id: id });
      }
      O.denetimYaz(req, `${BELGE_TIP[tip].ad} ${mevcut ? 'güncellendi' : 'oluşturuldu'}`, 'belge:' + id, { no, toplam: hesap.genel_toplam });
      return { id, no };
    });
  }
  r.post('/belgeler', (req) => ({ ok: true, ...belgeKaydet(req, null) }));
  r.put('/belgeler/:id', (req) => {
    const m = sahip('belgeler', req.params.id, req.hesapId);
    if (m.durum === 'iptal') throw hata(400, 'İptal edilmiş belge düzenlenemez');
    return { ok: true, ...belgeKaydet(req, m) };
  });
  r.post('/belgeler/:id/iptal', (req) => {
    const b = sahip('belgeler', req.params.id, req.hesapId);
    if (b.odenen > 0) throw hata(400, 'Tahsilat/ödeme bağlı fatura iptal edilemez. Önce ödemeleri silin.');
    db().islem(() => { db().prepare("UPDATE belgeler SET durum='iptal' WHERE id=?").run(b.id); b.durum = 'iptal'; belgeEtkileri(req.hesapId, b); });
    O.denetimYaz(req, 'Belge iptal edildi', 'belge:' + b.id, { no: b.no });
    return { ok: true };
  });
  r.delete('/belgeler/:id', (req) => {
    const b = sahip('belgeler', req.params.id, req.hesapId);
    if (b.odenen > 0) throw hata(400, 'Tahsilat/ödeme bağlı belge silinemez');
    db().islem(() => {
      copeAt(req.hesapId, 'belge', `${BELGE_TIP[b.tip].ad} ${b.no}`, { belge: b }, req.kullanici.ad_soyad);
      F.cariKaynakSil(req.hesapId, 'belge', b.id);
      db().prepare("DELETE FROM stok_hareketleri WHERE hesap_id=? AND kaynak='belge' AND kaynak_id=?").run(req.hesapId, b.id);
      db().prepare('DELETE FROM belgeler WHERE id=?').run(b.id);
    });
    O.denetimYaz(req, 'Belge silindi', 'belge:' + b.id, { no: b.no });
    return { ok: true };
  });
  r.post('/belgeler/:id/durum', (req) => {
    const b = sahip('belgeler', req.params.id, req.hesapId);
    if (FATURA_TIPLERI.includes(b.tip)) throw hata(400, 'Fatura durumu ödemelerle belirlenir');
    const d = ['taslak', 'gonderildi', 'onaylandi', 'reddedildi', 'faturalandi'].includes(req.body.durum) ? req.body.durum : null;
    if (!d) throw hata(400, 'Geçersiz durum');
    db().prepare('UPDATE belgeler SET durum=? WHERE id=?').run(d, b.id);
    return { ok: true };
  });

  // ─── Çek / senet ───
  r.get('/cek-senet', (req) => {
    const p = [req.hesapId]; let sql = 'SELECT cs.*, c.unvan FROM cek_senet cs LEFT JOIN cariler c ON c.id=cs.cari_id WHERE cs.hesap_id=?';
    if (req.sorgu.yon) { sql += ' AND cs.yon=?'; p.push(req.sorgu.yon === 'verilen' ? 'verilen' : 'alinan'); }
    if (req.sorgu.durum) { sql += ' AND cs.durum=?'; p.push(String(req.sorgu.durum)); }
    const l = db().prepare(sql + ' ORDER BY cs.vade').all(...p);
    const port = l.filter(x => x.durum === 'portfoy');
    return { kayitlar: l, alinan_portfoy: yuvarla(port.filter(x => x.yon === 'alinan').reduce((s, x) => s + x.tutar, 0)), verilen_portfoy: yuvarla(port.filter(x => x.yon === 'verilen').reduce((s, x) => s + x.tutar, 0)),
      vadesi_gecen: port.filter(x => x.vade < bugun()).length };
  });
  r.post('/cek-senet', (req) => {
    const b = req.body;
    const tur = b.tur === 'senet' ? 'senet' : 'cek', yon = b.yon === 'verilen' ? 'verilen' : 'alinan';
    const tutar = yuvarla(g.sayi(b.tutar)); const vade = g.tarih(b.vade);
    if (!(tutar > 0) || !vade) throw hata(400, 'Tutar ve vade tarihi gerekli');
    const cari = b.cari_id ? sahip('cariler', b.cari_id, req.hesapId, 'id, unvan') : null;
    const id = db().islem(() => {
      const yeni = db().prepare('INSERT INTO cek_senet (hesap_id, tur, yon, no, banka, sube, cari_id, borclu, tutar, duzenleme, vade, aciklama) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(req.hesapId, tur, yon, g.metin(b.no, 40), g.metin(b.banka, 80), g.metin(b.sube, 80), cari ? cari.id : null, g.metin(b.borclu, 120), tutar, g.tarih(b.duzenleme) || bugun(), vade, g.metin(b.aciklama, 300)).lastInsertRowid;
      if (cari) db().prepare('INSERT INTO cari_hareketleri (hesap_id, cari_id, tarih, vade, tur, borc, alacak, aciklama, belge_no, kaynak, kaynak_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(req.hesapId, cari.id, g.tarih(b.duzenleme) || bugun(), vade, tur, yon === 'verilen' ? tutar : 0, yon === 'alinan' ? tutar : 0, `${yon === 'alinan' ? 'Alınan' : 'Verilen'} ${tur} ${b.no || ''}`, g.metin(b.no, 40), 'cek_senet', yeni);
      return yeni;
    });
    O.denetimYaz(req, `${tur === 'cek' ? 'Çek' : 'Senet'} kaydedildi`, 'cek:' + id, { tutar });
    return { ok: true, id };
  });
  r.post('/cek-senet/:id/durum', (req) => {
    const c = sahip('cek_senet', req.params.id, req.hesapId);
    const d = req.body.durum;
    const gecerli = c.yon === 'alinan' ? ['portfoy', 'tahsil', 'ciro', 'karsiliksiz', 'iade'] : ['portfoy', 'odendi', 'karsiliksiz', 'iade'];
    if (!gecerli.includes(d)) throw hata(400, 'Geçersiz durum');
    db().islem(() => {
      F.kaynakHareketiSil(req.hesapId, 'cek_senet', c.id);
      if (d === 'tahsil' || d === 'odendi') {
        const fh = F.finansHesabiGecerli(req.hesapId, req.body.finans_hesap_id);
        if (!fh) throw hata(400, 'Tahsil/ödeme için kasa veya banka hesabı seçin');
        F.kaynakHareketiYaz(req.hesapId, 'cek_senet', c.id, { finans_hesap_id: fh, tarih: g.tarih(req.body.tarih) || bugun(), yon: d === 'tahsil' ? 'giris' : 'cikis', tutar: c.tutar, kategori: c.tur === 'cek' ? 'Çek' : 'Senet', aciklama: `${c.tur === 'cek' ? 'Çek' : 'Senet'} ${c.no || ''} ${d === 'tahsil' ? 'tahsilatı' : 'ödemesi'}`, cari_id: c.cari_id });
      }
      if ((d === 'karsiliksiz' || d === 'iade') && c.cari_id) {
        db().prepare("DELETE FROM cari_hareketleri WHERE hesap_id=? AND kaynak='cek_senet_iade' AND kaynak_id=?").run(req.hesapId, c.id);
        db().prepare("INSERT INTO cari_hareketleri (hesap_id, cari_id, tarih, tur, borc, alacak, aciklama, kaynak, kaynak_id) VALUES (?,?,?,?,?,?,?, 'cek_senet_iade', ?)")
          .run(req.hesapId, c.cari_id, bugun(), 'cek_iade', c.yon === 'alinan' ? c.tutar : 0, c.yon === 'verilen' ? c.tutar : 0, `${c.tur} ${c.no || ''} ${d === 'iade' ? 'iadesi' : 'karşılıksız'}`, c.id);
      }
      db().prepare('UPDATE cek_senet SET durum=?, finans_hesap_id=? WHERE id=?').run(d, F.finansHesabiGecerli(req.hesapId, req.body.finans_hesap_id), c.id);
    });
    O.denetimYaz(req, 'Çek/senet durumu: ' + d, 'cek:' + c.id);
    return { ok: true };
  });
  r.delete('/cek-senet/:id', (req) => {
    const c = sahip('cek_senet', req.params.id, req.hesapId);
    db().islem(() => {
      copeAt(req.hesapId, 'cek_senet', `${c.tur} ${c.no || ''} (${c.tutar})`, { cek: c }, req.kullanici.ad_soyad);
      F.kaynakHareketiSil(req.hesapId, 'cek_senet', c.id);
      db().prepare("DELETE FROM cari_hareketleri WHERE hesap_id=? AND kaynak IN ('cek_senet','cek_senet_iade') AND kaynak_id=?").run(req.hesapId, c.id);
      db().prepare('DELETE FROM cek_senet WHERE id=?').run(c.id);
    });
    return { ok: true };
  });

  // ─── Bütçe ───
  r.get('/butce/:yil', (req) => {
    const yil = g.tamsayi(req.params.yil);
    const plan = db().prepare('SELECT * FROM butce WHERE hesap_id=? AND yil=?').all(req.hesapId, yil);
    const gercek = db().prepare(`SELECT CAST(substr(tarih,6,2) AS INTEGER) AS ay, CASE WHEN yon='giris' THEN 'gelir' ELSE 'gider' END AS tip, COALESCE(kategori,'Diğer') AS kategori, SUM(tutar) AS tutar
      FROM finans_hareketleri WHERE hesap_id=? AND substr(tarih,1,4)=? AND (transfer_id IS NULL) GROUP BY ay, tip, kategori`).all(req.hesapId, String(yil));
    const kategoriler = db().prepare("SELECT tip, ad FROM kategoriler WHERE hesap_id=? AND aktif=1 AND tip IN ('gelir','gider') ORDER BY tip, sira, ad").all(req.hesapId);
    return { yil, plan, gercek, kategoriler };
  });
  r.put('/butce/:yil', (req) => {
    const yil = g.tamsayi(req.params.yil);
    if (!Array.isArray(req.body.satirlar)) throw hata(400, 'Bütçe satırları gerekli');
    db().islem(() => req.body.satirlar.slice(0, 5000).forEach(s => {
      const ay = g.tamsayi(s.ay), tip = s.tip === 'gider' ? 'gider' : 'gelir', kat = g.metin(s.kategori, 80);
      if (ay < 1 || ay > 12 || !kat) return;
      db().prepare('INSERT INTO butce (hesap_id, yil, ay, tip, kategori, tutar) VALUES (?,?,?,?,?,?) ON CONFLICT(hesap_id, yil, ay, tip, kategori) DO UPDATE SET tutar=excluded.tutar').run(req.hesapId, yil, ay, tip, kat, g.sayi(s.tutar));
    }));
    O.denetimYaz(req, `${yil} bütçesi güncellendi`, 'butce');
    return { ok: true };
  });
};

module.exports.BELGE_TIP = BELGE_TIP;
module.exports.FATURA_TIPLERI = FATURA_TIPLERI;
module.exports.urunStoklari = urunStoklari;
