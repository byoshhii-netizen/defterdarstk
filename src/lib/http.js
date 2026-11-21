'use strict';
// Küçük, bağımlılıksız HTTP yönlendirici.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

class HataYanit extends Error {
  constructor(durum, mesaj, ek) { super(mesaj); this.durum = durum; this.ek = ek; }
}
const hata = (durum, mesaj, ek) => new HataYanit(durum, mesaj, ek);

function yolDesen(yol) {
  const anahtarlar = [];
  const re = yol.replace(/\/:([a-zA-Z_]+)/g, (_, a) => { anahtarlar.push(a); return '/([^/]+)'; }).replace(/\*$/, '(.*)');
  return { re: new RegExp('^' + re + '/?$'), anahtarlar };
}

class Yonlendirici {
  constructor(onek = '') { this.onek = onek; this.rotalar = []; this.araKatmanlar = []; }
  use(fn) { this.araKatmanlar.push(fn); return this; }
  _ekle(metod, yol, args) {
    const secenek = Object.assign({}, ...args.filter(a => a && typeof a === 'object'));
    args = args.filter(a => typeof a === 'function');
    const { re, anahtarlar } = yolDesen((this.onek + yol).replace(/(.)\/$/, '$1'));
    this.rotalar.push({ metod, re, anahtarlar, isleyiciler: args, secenek, katman: this.araKatmanlar.slice() });
  }
  get(y, ...a) { this._ekle('GET', y, a); }
  post(y, ...a) { this._ekle('POST', y, a); }
  put(y, ...a) { this._ekle('PUT', y, a); }
  delete(y, ...a) { this._ekle('DELETE', y, a); }
  bul(metod, yol) {
    let yolEslesti = false;
    for (const r of this.rotalar) {
      const m = r.re.exec(yol);
      if (!m) continue;
      yolEslesti = true;
      if (r.metod !== metod && !(metod === 'HEAD' && r.metod === 'GET')) continue;
      const params = {};
      r.anahtarlar.forEach((a, i) => { try { params[a] = decodeURIComponent(m[i + 1]); } catch (e) { params[a] = m[i + 1]; } });
      return { rota: r, params };
    }
    return yolEslesti ? { metodYok: true } : null;
  }
}

function cerezleriAyristir(baslik) {
  const out = {};
  (baslik || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) { const k = p.slice(0, i).trim(); try { out[k] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* */ } }
  });
  return out;
}

function govdeOku(req, limit) {
  return new Promise((resolve, reject) => {
    let boyut = 0; const parcalar = [];
    req.on('data', c => {
      boyut += c.length;
      if (boyut > limit) { reject(hata(413, 'İstek çok büyük')); req.destroy(); return; }
      parcalar.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parcalar)));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
};

function guvenlikBasliklari(res, guvenli) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://res.cloudinary.com; " +
    "media-src 'self' blob: https://res.cloudinary.com; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; " +
    "base-uri 'self'; form-action 'self'; object-src 'none'");
  if (guvenli) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

function uygulamaOlustur({ statikKlasor, guvenProxy }) {
  const yonlendiriciler = [];
  const onKatmanlar = [];
  const statikKok = path.resolve(statikKlasor);

  function istemciIp(req) {
    if (guvenProxy) {
      const x = req.headers['x-forwarded-for'];
      if (x) return String(x).split(',')[0].trim();
    }
    return (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  }

  function yanitYardimcilari(req, res) {
    res.json = (veri, durum = 200) => {
      if (res.headersSent) return;
      const govde = JSON.stringify(veri);
      res.statusCode = durum;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      const kabul = req.headers['accept-encoding'] || '';
      if (govde.length > 4096 && /\bgzip\b/.test(kabul)) {
        res.setHeader('Content-Encoding', 'gzip');
        res.end(zlib.gzipSync(govde));
      } else res.end(govde);
    };
    res.cerez = (ad, deger, s = {}) => {
      const p = [`${ad}=${encodeURIComponent(deger)}`, `Path=${s.yol || '/'}`, 'HttpOnly', `SameSite=${s.sameSite || 'Lax'}`];
      if (s.maxAge !== undefined) p.push(`Max-Age=${Math.floor(s.maxAge)}`);
      if (req.guvenli) p.push('Secure');
      const onceki = res.getHeader('Set-Cookie');
      res.setHeader('Set-Cookie', [].concat(onceki || [], p.join('; ')));
    };
    res.indir = (buffer, dosyaAdi, tip) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', tip || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi.replace(/[^\w.\-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(dosyaAdi)}`);
      res.setHeader('Cache-Control', 'no-store');
      res.end(buffer);
    };
    res.yonlendir = (url) => { res.statusCode = 302; res.setHeader('Location', url); res.end(); };
  }

  function statikGonder(req, res, yol, onbellek = true) {
    const tam = path.resolve(statikKok, '.' + yol);
    if (!tam.startsWith(statikKok + path.sep)) return false;
    let st;
    try { st = fs.statSync(tam); } catch (e) { return false; }
    if (!st.isFile()) return false;
    const uzanti = path.extname(tam).toLowerCase();
    res.akis = true;
    res.setHeader('Content-Type', MIME[uzanti] || 'application/octet-stream');
    const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', onbellek && uzanti !== '.html' ? 'public, max-age=3600' : 'no-cache');
    if (req.headers['if-none-match'] === etag) { res.statusCode = 304; res.end(); return true; }
    const sikistir = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && ['.js', '.css', '.html', '.svg', '.json'].includes(uzanti);
    if (sikistir) { res.setHeader('Content-Encoding', 'gzip'); fs.createReadStream(tam).pipe(zlib.createGzip()).pipe(res); }
    else { res.setHeader('Content-Length', st.size); fs.createReadStream(tam).pipe(res); }
    return true;
  }

  async function isle(req, res) {
    const url = new URL(req.url, 'http://yerel');
    req.yol = decodeURIComponent(url.pathname).replace(/\/{2,}/g, '/');
    req.sorgu = Object.fromEntries(url.searchParams);
    req.ip = istemciIp(req);
    req.cerezler = cerezleriAyristir(req.headers.cookie);
    req.guvenli = guvenProxy ? (req.headers['x-forwarded-proto'] === 'https') : !!req.socket.encrypted;
    yanitYardimcilari(req, res);
    guvenlikBasliklari(res, req.guvenli);

    try {
      for (const k of onKatmanlar) { if (await k(req, res) === false || res.writableEnded) return; }

      // Statik dosya
      if ((req.method === 'GET' || req.method === 'HEAD') && !req.yol.startsWith('/api/') && path.extname(req.yol)) {
        if (statikGonder(req, res, req.yol)) return;
        res.statusCode = 404; res.end('Bulunamadı'); return;
      }

      let bulunan = null, metodYok = false;
      for (const y of yonlendiriciler) {
        const b = y.bul(req.method, req.yol);
        if (b && b.metodYok) { metodYok = true; continue; }
        if (b) { bulunan = b; break; }
      }
      if (!bulunan) {
        if (req.yol.startsWith('/api/')) throw hata(metodYok ? 405 : 404, metodYok ? 'Yöntem desteklenmiyor' : 'Uç nokta bulunamadı');
        throw hata(404, 'Sayfa bulunamadı');
      }
      req.params = bulunan.params;
      const { rota } = bulunan;

      if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        const limit = rota.secenek.limit || 2 * 1024 * 1024;
        const ham = await govdeOku(req, limit);
        if (rota.secenek.ham) req.govdeHam = ham;
        else if (ham.length) {
          const tip = req.headers['content-type'] || '';
          if (!tip.includes('application/json')) throw hata(415, 'JSON bekleniyor');
          try { req.body = JSON.parse(ham.toString('utf8')); } catch (e) { throw hata(400, 'Geçersiz JSON'); }
          if (req.body === null || typeof req.body !== 'object') throw hata(400, 'Geçersiz istek gövdesi');
        }
      }
      req.body = req.body || {};

      for (const fn of [...rota.katman, ...rota.isleyiciler]) {
        const r = await fn(req, res);
        if (res.writableEnded || res.headersSent || res.akis) return;
        if (r !== undefined && r !== null && r !== false) { res.json(r); return; }
      }
      if (!res.writableEnded && !res.akis) res.json({ ok: true });
    } catch (e) {
      if (res.headersSent) { try { res.end(); } catch (x) { /* */ } return; }
      const durum = e.durum || 500;
      if (!e.durum) {
        console.error('[HATA]', req.method, req.yol, e.stack || e.message);
        require('./hatalar').ekle({
          metod: req.method, yol: req.yol, mesaj: e.message, kod: e.code || null,
          ip: req.ip, satir: (String(e.stack || '').split('\n')[1] || '').trim().slice(0, 160),
        });
      }
      if (req.yol.startsWith('/api/')) res.json({ hata: durum >= 500 && !e.durum ? 'Sunucu hatası oluştu' : e.message, ...(e.ek || {}) }, durum);
      else { res.statusCode = durum; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(durum === 404 ? 'Bulunamadı' : durum === 503 ? 'Hizmet geçici olarak kullanılamıyor. Lütfen biraz sonra tekrar deneyin.' : 'Hata'); }
    }
  }

  return {
    yonlendirici: (onek) => { const y = new Yonlendirici(onek); yonlendiriciler.push(y); return y; },
    onKatman: (fn) => onKatmanlar.push(fn),
    statikGonder,
    sunucu: () => http.createServer({ requestTimeout: 120000, headersTimeout: 30000 }, isle),
    isle,
  };
}

module.exports = { uygulamaOlustur, hata, HataYanit };
