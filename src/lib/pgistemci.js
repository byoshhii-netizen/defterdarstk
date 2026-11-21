'use strict';
// Bağımlılıksız, minimal PostgreSQL istemcisi (protokol 3.0).
// Kimlik doğrulama: SCRAM-SHA-256, MD5, düz şifre. İsteğe bağlı SSL.
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

function baglantiAyristir(url) {
  const u = new URL(url);
  const s = {
    host: decodeURIComponent(u.hostname) || 'localhost', port: +u.port || 5432,
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)) || decodeURIComponent(u.username),
    sslmode: u.searchParams.get('sslmode') || process.env.PGSSLMODE || 'disable',
  };
  if (process.env.PGSSL === '1' && s.sslmode === 'disable') s.sslmode = 'require';
  return s;
}

const TAMSAYI = new Set([20, 21, 23, 26]);
const ONDALIK = new Set([700, 701, 1700]);
function degerCoz(v, oid) {
  if (v === null) return null;
  if (TAMSAYI.has(oid)) { const n = Number(v); return Number.isSafeInteger(n) ? n : v; }
  if (ONDALIK.has(oid)) return parseFloat(v);
  if (oid === 16) return v === 't';
  return v;
}

class PgHata extends Error {
  constructor(alanlar) { super(alanlar.M || 'PostgreSQL hatası'); this.code = alanlar.C; this.detay = alanlar.D; this.alanlar = alanlar; }
}

class PgIstemci {
  constructor(url) { this.ayar = baglantiAyristir(url); this.tampon = Buffer.alloc(0); this.bekleyen = null; this.kuyruk = []; this.kapali = true; }

  async baglan() {
    const a = this.ayar;
    let soket = net.connect(a.port, a.host);
    soket.setNoDelay(true);
    await new Promise((ok, red) => { soket.once('connect', ok); soket.once('error', red); });
    if (a.sslmode !== 'disable') {
      const istek = Buffer.alloc(8); istek.writeInt32BE(8, 0); istek.writeInt32BE(80877103, 4);
      soket.write(istek);
      const yanit = await new Promise((ok, red) => { soket.once('data', ok); soket.once('error', red); });
      if (yanit[0] === 0x53) {
        soket = tls.connect({ socket: soket, servername: net.isIP(a.host) ? undefined : a.host, rejectUnauthorized: a.sslmode === 'verify-full' });
        await new Promise((ok, red) => { soket.once('secureConnect', ok); soket.once('error', red); });
      } else if (a.sslmode === 'require' || a.sslmode.startsWith('verify')) throw new Error('Sunucu SSL desteklemiyor');
    }
    this.soket = soket;
    this.kapali = false;
    soket.on('data', (d) => this._veri(d));
    soket.on('error', (e) => this._kopus(e));
    soket.on('close', () => this._kopus(new Error('PostgreSQL bağlantısı kapandı')));

    const params = Buffer.from(`user\0${a.user}\0database\0${a.database}\0client_encoding\0UTF8\0application_name\0defterdar\0\0`);
    const baslangic = Buffer.alloc(8 + params.length);
    baslangic.writeInt32BE(baslangic.length, 0); baslangic.writeInt32BE(196608, 4); params.copy(baslangic, 8);
    soket.write(baslangic);
    await this._yetkilendir();
  }

  _kopus(e) {
    if (this.kapali) return;
    this.kapali = true;
    const b = this.bekleyen; this.bekleyen = null;
    if (b) b.red(e);
    this.kuyruk.forEach(k => k.red(e)); this.kuyruk = [];
  }

  _veri(d) {
    this.tampon = this.tampon.length ? Buffer.concat([this.tampon, d]) : d;
    while (this.tampon.length >= 5) {
      const uzunluk = this.tampon.readInt32BE(1);
      if (this.tampon.length < uzunluk + 1) break;
      const tip = String.fromCharCode(this.tampon[0]);
      const govde = this.tampon.subarray(5, uzunluk + 1);
      this.tampon = this.tampon.subarray(uzunluk + 1);
      this._mesaj(tip, govde);
    }
  }

  _mesaj(tip, g) {
    if (tip === 'N' || tip === 'S' || tip === 'K' || tip === 'A') {
      if (this.bekleyen && this.bekleyen.ham) this.bekleyen.ham(tip, g);
      return;
    }
    const b = this.bekleyen;
    if (!b) return;
    if (b.ham) { b.ham(tip, g); return; }
    switch (tip) {
      case 'T': { // RowDescription
        const n = g.readInt16BE(0); let o = 2; b.alanlar = [];
        for (let i = 0; i < n; i++) {
          const son = g.indexOf(0, o); const ad = g.toString('utf8', o, son); o = son + 1;
          const oid = g.readInt32BE(o + 6); o += 18;
          b.alanlar.push({ ad, oid });
        }
        break;
      }
      case 'D': { // DataRow
        const n = g.readInt16BE(0); let o = 2; const satir = {};
        for (let i = 0; i < n; i++) {
          const l = g.readInt32BE(o); o += 4;
          const alan = b.alanlar[i];
          if (l === -1) satir[alan.ad] = null; else { satir[alan.ad] = degerCoz(g.toString('utf8', o, o + l), alan.oid); o += l; }
        }
        b.satirlar.push(satir);
        break;
      }
      case 'C': { const m = /(\d+)$/.exec(g.toString('utf8', 0, g.length - 1)); b.etkilenen += m ? +m[1] : 0; break; }
      case 'E': b.hata = new PgHata(this._alanlar(g)); break;
      case 'Z': {
        this.bekleyen = null;
        if (b.hata) b.red(b.hata); else b.ok({ rows: b.satirlar, rowCount: b.etkilenen });
        const s = this.kuyruk.shift(); if (s) this._calistir(s);
        break;
      }
      default: break; // '1','2','3','n','s','I' vb.
    }
  }

  _alanlar(g) {
    const a = {}; let o = 0;
    while (o < g.length && g[o] !== 0) { const k = String.fromCharCode(g[o]); const son = g.indexOf(0, o + 1); a[k] = g.toString('utf8', o + 1, son); o = son + 1; }
    return a;
  }

  _yaz(tip, govde) {
    const b = Buffer.alloc(5 + govde.length);
    b[0] = tip.charCodeAt(0); b.writeInt32BE(4 + govde.length, 1); govde.copy(b, 5);
    return b;
  }

  async _yetkilendir() {
    const a = this.ayar;
    await new Promise((ok, red) => {
      let scram = null;
      this.bekleyen = {
        red,
        ham: (tip, g) => {
          if (tip === 'E') { this.bekleyen = null; return red(new PgHata(this._alanlar(g))); }
          if (tip === 'Z') { this.bekleyen = null; return ok(); }
          if (tip !== 'R') return;
          const kod = g.readInt32BE(0);
          if (kod === 0) return;
          if (kod === 3) return this.soket.write(this._yaz('p', Buffer.from(a.password + '\0')));
          if (kod === 5) {
            const tuz = g.subarray(4, 8);
            const ic = crypto.createHash('md5').update(a.password + a.user).digest('hex');
            const dis = 'md5' + crypto.createHash('md5').update(Buffer.concat([Buffer.from(ic), tuz])).digest('hex');
            return this.soket.write(this._yaz('p', Buffer.from(dis + '\0')));
          }
          if (kod === 10) {
            const mek = g.toString('utf8', 4).split('\0');
            if (!mek.includes('SCRAM-SHA-256')) return red(new Error('Desteklenmeyen SASL yöntemi'));
            const nonce = crypto.randomBytes(18).toString('base64');
            scram = { nonce, ilkCiplak: `n=*,r=${nonce}` };
            const ilk = Buffer.from('n,,' + scram.ilkCiplak);
            const ad = Buffer.from('SCRAM-SHA-256\0');
            const uz = Buffer.alloc(4); uz.writeInt32BE(ilk.length, 0);
            return this.soket.write(this._yaz('p', Buffer.concat([ad, uz, ilk])));
          }
          if (kod === 11) {
            const sunucuIlk = g.toString('utf8', 4);
            const p = Object.fromEntries(sunucuIlk.split(',').map(x => [x[0], x.slice(2)]));
            if (!p.r.startsWith(scram.nonce)) return red(new Error('SCRAM nonce uyuşmuyor'));
            const tuzlu = crypto.pbkdf2Sync(a.password.normalize('NFKC'), Buffer.from(p.s, 'base64'), +p.i, 32, 'sha256');
            const istemciAnahtar = crypto.createHmac('sha256', tuzlu).update('Client Key').digest();
            const saklanan = crypto.createHash('sha256').update(istemciAnahtar).digest();
            const sonCiplak = `c=biws,r=${p.r}`;
            const mesaj = `${scram.ilkCiplak},${sunucuIlk},${sonCiplak}`;
            const imza = crypto.createHmac('sha256', saklanan).update(mesaj).digest();
            const kanit = Buffer.from(istemciAnahtar.map((x, i) => x ^ imza[i]));
            const sunucuAnahtar = crypto.createHmac('sha256', tuzlu).update('Server Key').digest();
            scram.sunucuImza = crypto.createHmac('sha256', sunucuAnahtar).update(mesaj).digest('base64');
            return this.soket.write(this._yaz('p', Buffer.from(`${sonCiplak},p=${kanit.toString('base64')}`)));
          }
          if (kod === 12) {
            const v = g.toString('utf8', 4);
            if (!scram || v.slice(2) !== scram.sunucuImza) return red(new Error('Sunucu SCRAM imzası doğrulanamadı'));
            return;
          }
          return red(new Error('Desteklenmeyen kimlik doğrulama yöntemi: ' + kod));
        },
      };
    });
  }

  _calistir(is) {
    if (this.kapali) return is.red(new Error('PostgreSQL bağlantısı yok'));
    this.bekleyen = is;
    this.soket.write(is.paket);
  }

  sorgu(sql, params) {
    let paket;
    if (!params || !params.length) {
      paket = this._yaz('Q', Buffer.from(sql + '\0'));
    } else {
      const parse = this._yaz('P', Buffer.concat([Buffer.from('\0' + sql + '\0'), Buffer.from([0, 0])]));
      const parcalar = [Buffer.from('\0\0'), Buffer.from([0, 0])];
      const say = Buffer.alloc(2); say.writeInt16BE(params.length, 0); parcalar.push(say);
      for (const p of params) {
        const uz = Buffer.alloc(4);
        if (p === null || p === undefined) { uz.writeInt32BE(-1, 0); parcalar.push(uz); continue; }
        const v = Buffer.from(typeof p === 'object' ? JSON.stringify(p) : String(p), 'utf8');
        uz.writeInt32BE(v.length, 0); parcalar.push(uz, v);
      }
      parcalar.push(Buffer.from([0, 0]));
      const bind = this._yaz('B', Buffer.concat(parcalar));
      const describe = this._yaz('D', Buffer.from('P\0'));
      const execute = this._yaz('E', Buffer.from([0, 0, 0, 0, 0]));
      const sync = this._yaz('S', Buffer.alloc(0));
      paket = Buffer.concat([parse, bind, describe, execute, sync]);
    }
    return new Promise((ok, red) => {
      const is = { paket, ok, red, satirlar: [], alanlar: [], etkilenen: 0, hata: null };
      if (this.bekleyen) this.kuyruk.push(is); else this._calistir(is);
    });
  }

  async kapat() {
    if (this.kapali) return;
    try { this.soket.write(this._yaz('X', Buffer.alloc(0))); } catch (e) { /* */ }
    this.kapali = true; this.soket.end();
  }
}

module.exports = { PgIstemci, PgHata, baglantiAyristir };
