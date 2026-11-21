'use strict';
// Diğer modüllerin kasa/banka ve cari hareketlerini kaynak bazlı senkronlaması için yardımcılar.
const { db } = require('./db');

function kaynakHareketiSil(hesapId, kaynak, kaynakId) {
  db().prepare('DELETE FROM finans_hareketleri WHERE hesap_id=? AND kaynak=? AND kaynak_id=?').run(hesapId, kaynak, kaynakId);
}
function cariKaynakSil(hesapId, kaynak, kaynakId) {
  db().prepare('DELETE FROM cari_hareketleri WHERE hesap_id=? AND kaynak=? AND kaynak_id=?').run(hesapId, kaynak, kaynakId);
}

function finansHesabiGecerli(hesapId, id) {
  if (!id) return null;
  const r = db().prepare('SELECT id FROM finans_hesaplari WHERE id=? AND hesap_id=?').get(+id, hesapId);
  return r ? r.id : null;
}

// Kaynağa bağlı tek bir kasa hareketini yeniden yazar (varsa siler, koşul sağlanırsa ekler)
function kaynakHareketiYaz(hesapId, kaynak, kaynakId, h) {
  kaynakHareketiSil(hesapId, kaynak, kaynakId);
  const fh = finansHesabiGecerli(hesapId, h && h.finans_hesap_id);
  if (!h || !fh || !(Number(h.tutar) > 0)) return null;
  return db().prepare(`INSERT INTO finans_hareketleri (hesap_id, finans_hesap_id, tarih, yon, tutar, kategori, aciklama, cari_id, belge_no, kaynak, kaynak_id, olusturan)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(hesapId, fh, h.tarih, h.yon, Math.round(h.tutar * 100) / 100, h.kategori || null,
    (h.aciklama || '').slice(0, 300), h.cari_id || null, h.belge_no || null, kaynak, kaynakId, h.olusturan || null).lastInsertRowid;
}

function hesapBakiyeleri(hesapId) {
  return db().prepare(`SELECT f.*, f.acilis_bakiye
      + COALESCE((SELECT SUM(CASE WHEN yon='giris' THEN tutar ELSE -tutar END) FROM finans_hareketleri h WHERE h.finans_hesap_id=f.id AND h.hesap_id=f.hesap_id),0) AS bakiye
    FROM finans_hesaplari f WHERE f.hesap_id=? ORDER BY f.aktif DESC, f.tur, f.ad`).all(hesapId);
}

function cariBakiye(hesapId, cariId) {
  const r = db().prepare('SELECT COALESCE(SUM(borc),0) AS b, COALESCE(SUM(alacak),0) AS a FROM cari_hareketleri WHERE hesap_id=? AND cari_id=?').get(hesapId, cariId);
  return Math.round((r.b - r.a) * 100) / 100;
}

module.exports = { kaynakHareketiSil, kaynakHareketiYaz, cariKaynakSil, finansHesabiGecerli, hesapBakiyeleri, cariBakiye };
