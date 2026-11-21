'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { VERI_KLASORU } = require('./db');

// ─── Sunucu gizli anahtarı (kaynak kodda değil) ────────────────────────────
// Öncelik: DEFTERDAR_ANAHTAR ortam değişkeni → data/.anahtar dosyası →
// (PostgreSQL'de, kalıcı disk yoksa) veritabanında saklanan üretilmiş anahtar.
let _anahtar = null, _pepper = null;
function anahtarKaynagi() {
  if (process.env.DEFTERDAR_ANAHTAR && process.env.DEFTERDAR_ANAHTAR.length >= 32) return { tur: 'ortam', deger: process.env.DEFTERDAR_ANAHTAR };
  const yol = path.join(VERI_KLASORU, '.anahtar');
  if (fs.existsSync(yol)) return { tur: 'dosya', deger: fs.readFileSync(yol, 'utf8').trim() };
  const { db } = require('./db');
  if (db().motor === 'postgresql') {
    const r = db().prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='sunucu_anahtari'").get();
    if (r && r.deger) return { tur: 'veritabani', deger: r.deger };
    const yeni = crypto.randomBytes(48).toString('base64');
    db().prepare("INSERT INTO sistem_ayarlari (anahtar, deger) VALUES ('sunucu_anahtari', ?) ON CONFLICT(anahtar) DO NOTHING").run(yeni);
    console.warn('[GÜVENLİK] DEFTERDAR_ANAHTAR tanımlı değil; üretilen anahtar veritabanında saklandı. Railway Variables bölümüne DEFTERDAR_ANAHTAR ekleyin.');
    return { tur: 'veritabani', deger: db().prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='sunucu_anahtari'").get().deger };
  }
  const deger = crypto.randomBytes(48).toString('base64');
  fs.writeFileSync(yol, deger, { mode: 0o600 });
  return { tur: 'dosya', deger };
}
function ANAHTAR() {
  if (!_anahtar) {
    const k = anahtarKaynagi();
    _anahtar = crypto.createHash('sha256').update(k.deger).digest();
    _pepper = crypto.createHmac('sha256', _anahtar).update('defterdar-pepper').digest();
    anahtarDurumu.kaynak = k.tur;
  }
  return _anahtar;
}
function PEPPER() { ANAHTAR(); return _pepper; }
const anahtarDurumu = { kaynak: null };

// ─── Şifre özetleme (scrypt + pepper) ──────────────────────────────────────
// Biçim: s2$N$r$p$tuz$ozet  (s2 = pepper'lı)   s1 = pepper'sız (yalnızca tohum kaydı)
const VARSAYILAN = { N: 32768, r: 8, p: 1 };

function _scrypt(girdi, tuz, N, r, p) {
  return crypto.scryptSync(girdi, tuz, 32, { N, r, p, maxmem: 256 * 1024 * 1024 });
}

function sifreOzetle(sifre) {
  const tuz = crypto.randomBytes(16);
  const girdi = crypto.createHmac('sha256', PEPPER()).update(String(sifre)).digest();
  const { N, r, p } = VARSAYILAN;
  const oz = _scrypt(girdi, tuz, N, r, p);
  return `s2$${N}$${r}$${p}$${tuz.toString('base64')}$${oz.toString('base64')}`;
}

function sifreDogrula(sifre, kayit) {
  if (!kayit || typeof kayit !== 'string') { _scrypt('x', 'y', 1024, 8, 1); return false; }
  const parca = kayit.split('$');
  if (parca.length !== 6) return false;
  const [tip, N, r, p, tuzB, ozB] = parca;
  const tuz = Buffer.from(tuzB, 'base64');
  const beklenen = Buffer.from(ozB, 'base64');
  let girdi;
  if (tip === 's2') girdi = crypto.createHmac('sha256', PEPPER()).update(String(sifre)).digest();
  else if (tip === 's1') girdi = Buffer.from(String(sifre), 'utf8');
  else return false;
  const oz = _scrypt(girdi, tuz, +N, +r, +p);
  return oz.length === beklenen.length && crypto.timingSafeEqual(oz, beklenen);
}

function sifreGuclu(sifre) {
  const s = String(sifre || '');
  if (s.length < 8) return 'Şifre en az 8 karakter olmalı';
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(s) || !/[0-9]/.test(s)) return 'Şifre en az bir harf ve bir rakam içermeli';
  return null;
}

// ─── Şifreleme (AES-256-GCM) — SMS/Cloudinary gibi gizli bilgiler için ────
function sifrele(metin) {
  if (metin === null || metin === undefined || metin === '') return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', ANAHTAR(), iv);
  const enc = Buffer.concat([c.update(String(metin), 'utf8'), c.final()]);
  return 'g1:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function coz(veri) {
  if (!veri || typeof veri !== 'string' || !veri.startsWith('g1:')) return null;
  try {
    const b = Buffer.from(veri.slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', ANAHTAR(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch (e) { return null; }
}

const rastgele = (n = 32) => crypto.randomBytes(n).toString('base64url');
const tokenOzet = (t) => crypto.createHmac('sha256', ANAHTAR()).update(String(t)).digest('hex');
function esitMi(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ─── Hız sınırlayıcı (bellek içi) ──────────────────────────────────────────
const kovalar = new Map();
function hizSinir(anahtar, limit, pencereMs) {
  const simdi = Date.now();
  let k = kovalar.get(anahtar);
  if (!k || k.bitis < simdi) { k = { sayi: 0, bitis: simdi + pencereMs }; kovalar.set(anahtar, k); }
  k.sayi++;
  return { izin: k.sayi <= limit, kalan: Math.max(0, limit - k.sayi), sifirlanma: k.bitis };
}
setInterval(() => {
  const s = Date.now();
  for (const [a, k] of kovalar) if (k.bitis < s) kovalar.delete(a);
}, 60000).unref();

// ─── TOTP (Google Authenticator uyumlu, RFC 6238) ──────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function base32Coz(s) {
  s = s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0, val = 0; const out = [];
  for (const ch of s) { const i = B32.indexOf(ch); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totpKod(sir, zaman = Date.now(), adim = 0) {
  const sayac = Math.floor(zaman / 30000) + adim;
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(sayac));
  const h = crypto.createHmac('sha1', base32Coz(sir)).update(b).digest();
  const o = h[h.length - 1] & 15;
  const kod = ((h.readUInt32BE(o) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
  return kod;
}
function totpDogrula(sir, kod) {
  kod = String(kod || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(kod)) return false;
  return [-1, 0, 1].some(a => esitMi(totpKod(sir, Date.now(), a), kod));
}
const totpSirUret = () => base32(crypto.randomBytes(20));

// ─── Girdi doğrulama yardımcıları ──────────────────────────────────────────
function metin(v, max = 500) {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  return s ? s.slice(0, max) : null;
}
function sayi(v, varsayilan = 0) {
  if (v === '' || v === null || v === undefined) return varsayilan;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : varsayilan;
}
function tamsayi(v, varsayilan = 0) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : varsayilan; }
function tarih(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function eposta(v) {
  const s = metin(v, 200);
  return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : null;
}
function veriResmi(v, maxBayt = 3 * 1024 * 1024) {
  if (!v) return null;
  const s = String(v);
  if (!/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s)) return null;
  if (s.length > maxBayt * 1.37) return null;
  if (s.startsWith('data:image/svg')) {
    const icerik = Buffer.from(s.split(',')[1], 'base64').toString('utf8');
    if (/<script|on\w+\s*=|javascript:/i.test(icerik)) return null;
  }
  return s;
}

module.exports = {
  sifreOzetle, sifreDogrula, sifreGuclu, sifrele, coz, rastgele, tokenOzet, esitMi,
  hizSinir, totpKod, anahtarDurumu, ANAHTAR, totpDogrula, totpSirUret, metin, sayi, tamsayi, tarih, eposta, veriResmi,
};
