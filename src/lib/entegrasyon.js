'use strict';
// Netgsm SMS ve Cloudinary entegrasyonları — kimlik bilgileri kaynak kodda değil, şifreli olarak veritabanında tutulur.
const crypto = require('crypto');
const { db } = require('./db');
const g = require('./guvenlik');
const O = require('./oturum');

function hesapEntegrasyon(hesapId) {
  const r = db().prepare('SELECT entegrasyon_json FROM hesaplar WHERE id=?').get(hesapId);
  try { return JSON.parse((r && r.entegrasyon_json) || '{}'); } catch (e) { return {}; }
}
function hesapEntegrasyonYaz(hesapId, veri) {
  db().prepare('UPDATE hesaplar SET entegrasyon_json=? WHERE id=?').run(JSON.stringify(veri), hesapId);
}

const xmlKac = (s) => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

function telefonTemizle(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('0090')) d = d.slice(2);
  if (d.startsWith('0')) d = '9' + d;
  else if (d.length === 10) d = '90' + d;
  return /^90?\d{10,11}$/.test(d) && d.length === 12 ? d : null;
}

function smsAyar(hesapId) {
  const e = hesapEntegrasyon(hesapId).sms || {};
  return { kullanici: e.kullanici || '', sifre: g.coz(e.sifre) || '', baslik: e.baslik || '', saglayici: e.saglayici || 'netgsm' };
}

async function netgsmGonder(ayar, telefon, mesaj) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><mainbody><header><company dil="TR">Netgsm</company><usercode>${xmlKac(ayar.kullanici)}</usercode><password>${xmlKac(ayar.sifre)}</password>` +
    `<type>1:n</type><msgheader>${xmlKac(ayar.baslik)}</msgheader></header><body><msg><![CDATA[${String(mesaj).replace(/]]>/g, ']] >')}]]></msg><no>${telefon}</no></body></mainbody>`;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch('https://api.netgsm.com.tr/sms/send/xml', { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8' }, body: xml, signal: ctrl.signal });
    const metin = (await r.text()).trim();
    const kod = metin.split(/\s+/)[0];
    return { basarili: kod === '00' || kod === '01' || kod === '02', kod };
  } finally { clearTimeout(t); }
}
const NETGSM_HATA = { '20': 'Mesaj metni hatalı veya çok uzun', '30': 'Kullanıcı adı veya şifre hatalı ya da API erişimi kapalı', '40': 'Gönderici başlığı onaylı değil', '50': 'Abone hesabı İYS kontrollü değil', '51': 'İYS kaydı yok', '70': 'Hatalı sorgu', '80': 'Gönderim sınırı aşıldı', '85': 'Mükerrer gönderim sınırı' };

// ─── Cloudinary ───
function cloudinaryAyar(hesapId) {
  const e = hesapEntegrasyon(hesapId).cloudinary;
  if (e && e.cloud && e.key && e.secret) return { cloud: e.cloud, key: e.key, secret: g.coz(e.secret) };
  const url = process.env.CLOUDINARY_URL; // cloudinary://key:secret@cloud
  if (url) { const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url); if (m) return { cloud: m[3], key: m[1], secret: m[2] }; }
  const genel = O.ayar('cloudinary', '');
  if (genel) { try { const x = JSON.parse(genel); if (x.cloud && x.key && x.secret) return { cloud: x.cloud, key: x.key, secret: g.coz(x.secret) }; } catch (e2) { /* */ } }
  return null;
}
function imza(params, secret) {
  const s = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(s + secret).digest('hex');
}
async function cloudinaryYukle(ayar, buffer, mime, klasor) {
  const tur = mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : 'raw';
  const params = { folder: klasor, timestamp: Math.floor(Date.now() / 1000) };
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: mime }));
  Object.entries(params).forEach(([k, v]) => fd.append(k, String(v)));
  fd.append('api_key', ayar.key);
  fd.append('signature', imza(params, ayar.secret));
  const r = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(ayar.cloud)}/${tur}/upload`, { method: 'POST', body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || 'Cloudinary yükleme hatası');
  return { url: j.secure_url, public_id: j.public_id, tur };
}
async function cloudinarySil(ayar, publicId, tur) {
  const params = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000) };
  const fd = new FormData();
  Object.entries(params).forEach(([k, v]) => fd.append(k, String(v)));
  fd.append('api_key', ayar.key); fd.append('signature', imza(params, ayar.secret));
  await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(ayar.cloud)}/${tur || 'image'}/destroy`, { method: 'POST', body: fd });
}

// Dosya türünü uzantıya değil içeriğe bakarak belirler
function icerikTuru(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (b.subarray(0, 4).toString() === 'GIF8') return 'image/gif';
  if (b.subarray(4, 8).toString() === 'ftyp') return b.subarray(8, 10).toString() === 'qt' ? 'video/quicktime' : 'video/mp4';
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return 'video/webm';
  if (b.subarray(0, 4).toString() === '%PDF') return 'application/pdf';
  return null;
}

module.exports = { hesapEntegrasyon, hesapEntegrasyonYaz, telefonTemizle, smsAyar, netgsmGonder, NETGSM_HATA, cloudinaryAyar, cloudinaryYukle, cloudinarySil, icerikTuru };
