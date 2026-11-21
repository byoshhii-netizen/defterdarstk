'use strict';
const { db } = require('../lib/db');
const { hata } = require('../lib/http');

// Kaydın bu hesaba ait olduğunu doğrular, değilse 404
function sahip(tablo, id, hesapId, kolonlar = '*') {
  const r = db().prepare(`SELECT ${kolonlar} FROM ${tablo} WHERE id=? AND hesap_id=?`).get(+id || 0, hesapId);
  if (!r) throw hata(404, 'Kayıt bulunamadı');
  return r;
}

function bugun() {
  const d = new Date(Date.now() + 3 * 3600000);
  return d.toISOString().slice(0, 10);
}
function buAy() { return bugun().slice(0, 7); }
const yuvarla = (n) => Math.round((Number(n) || 0) * 100) / 100;

function copeAt(hesapId, tur, baslik, veri, silen) {
  db().prepare('INSERT INTO cop_kutusu (hesap_id, tur, baslik, veri, silen) VALUES (?,?,?,?,?)')
    .run(hesapId, tur, String(baslik || '').slice(0, 200), JSON.stringify(veri), silen || null);
}

function idListesi(v, max = 2000) {
  if (!Array.isArray(v)) throw hata(400, 'Kayıt listesi gerekli');
  const ids = [...new Set(v.map(x => parseInt(x, 10)).filter(x => x > 0))].slice(0, max);
  if (!ids.length) throw hata(400, 'Kayıt seçilmedi');
  return ids;
}

function sayfalama(req, varsayilan = 50, maks = 500) {
  const limit = Math.min(maks, Math.max(1, parseInt(req.sorgu.limit, 10) || varsayilan));
  const sayfa = Math.max(1, parseInt(req.sorgu.sayfa, 10) || 1);
  return { limit, offset: (sayfa - 1) * limit, sayfa };
}

// Varsayılan kurulum: kategoriler + kasa
function hesapVarsayilanlari(hesapId, tur) {
  const d = db();
  const kat = d.prepare('INSERT INTO kategoriler (hesap_id, tip, ad, sira) VALUES (?,?,?,?)');
  const gelir = tur === 'stk'
    ? ['Bağış', 'Aidat', 'Kurban', 'Zekat', 'Fitre', 'Etkinlik geliri', 'Kira geliri', 'Diğer gelir']
    : tur === 'muhasebe' ? ['Müşavirlik hizmeti', 'Danışmanlık', 'Diğer gelir'] : ['Satış', 'Hizmet geliri', 'Faiz geliri', 'Diğer gelir'];
  const gider = ['Kira', 'Elektrik', 'Su', 'Doğalgaz', 'İnternet ve telefon', 'Maaş', 'SGK primi', 'Vergi', 'Kırtasiye', 'Ulaşım', 'Yemek', 'Bakım onarım', 'Banka masrafı', 'Reklam', 'Diğer gider'];
  if (tur === 'stk') gider.push('Sosyal yardım', 'Kurban alımı', 'Proje gideri');
  gelir.forEach((a, i) => kat.run(hesapId, 'gelir', a, i));
  gider.forEach((a, i) => kat.run(hesapId, 'gider', a, i));
  if (tur === 'stk') ['Genel Bağışçı', 'Düzenli Bağışçı', 'Kurumsal Bağışçı', 'Gönüllü', 'Üye'].forEach((a, i) => kat.run(hesapId, 'bagisci', a, i));
  d.prepare("INSERT INTO finans_hesaplari (hesap_id, ad, tur) VALUES (?, 'Merkez kasa', 'kasa')").run(hesapId);
}

module.exports = { sahip, bugun, buAy, yuvarla, copeAt, idListesi, sayfalama, hesapVarsayilanlari };

// Hesap bazlı sıralı belge numarası: ONEK-YIL-00001
function siradakiNo(hesapId, onek) {
  const yil = bugun().slice(0, 4);
  const anahtar = `${onek}-${yil}`;
  db().prepare('INSERT INTO sayaclar (hesap_id, anahtar, deger) VALUES (?,?,1) ON CONFLICT(hesap_id, anahtar) DO UPDATE SET deger=sayaclar.deger+1').run(hesapId, anahtar);
  const d = db().prepare('SELECT deger FROM sayaclar WHERE hesap_id=? AND anahtar=?').get(hesapId, anahtar).deger;
  return `${onek}-${yil}-${String(d).padStart(5, '0')}`;
}
module.exports.siradakiNo = siradakiNo;
