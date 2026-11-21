'use strict';
// Veritabanı katmanı: Node 22.13+ içindeki node:sqlite kullanılır; yoksa sql.js'e düşer.
const fs = require('fs');
const path = require('path');

function veriKlasoru() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try {
    if (fs.existsSync('/data')) { fs.accessSync('/data', fs.constants.W_OK); return '/data'; }
  } catch (e) { /* yok */ }
  return path.join(__dirname, '..', '..', 'data');
}

const VERI_KLASORU = veriKlasoru();
if (!fs.existsSync(VERI_KLASORU)) fs.mkdirSync(VERI_KLASORU, { recursive: true });
const DB_YOLU = path.join(VERI_KLASORU, 'defterdar.db');

function temizle(params) {
  return params.map(p => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p !== null && typeof p === 'object') return JSON.stringify(p);
    return p;
  });
}

function sade(o) { return o ? Object.assign({}, o) : o; }

class NodeSqliteDb {
  constructor(yol) {
    const { DatabaseSync } = require('node:sqlite');
    this.db = new DatabaseSync(yol);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.motor = 'node:sqlite';
    this._cache = new Map();
  }
  _stmt(sql) {
    let s = this._cache.get(sql);
    if (!s) { s = this.db.prepare(sql); if (this._cache.size < 500) this._cache.set(sql, s); }
    return s;
  }
  prepare(sql) {
    const self = this;
    return {
      run: (...p) => { const r = self._stmt(sql).run(...temizle(p)); return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }; },
      get: (...p) => sade(self._stmt(sql).get(...temizle(p))),
      all: (...p) => self._stmt(sql).all(...temizle(p)).map(sade),
    };
  }
  exec(sql) { this.db.exec(sql); }
  kaydet() { /* dosyaya doğrudan yazılıyor */ }
  boyut() { let t = 0; for (const e of ['', '-wal']) { try { t += fs.statSync(DB_YOLU + e).size; } catch (x) { /* */ } } return t; }
  yedekBuffer() {
    try { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (e) { /* */ }
    return fs.readFileSync(DB_YOLU);
  }
  kolonlar(tablo) { return this.prepare(`PRAGMA table_info(${tabloAdi(tablo)})`).all().map(c => c.name); }
  tamYedek() { return { buffer: this.yedekBuffer(), uzanti: 'db' }; }
}

class SqlJsDb {
  constructor(SQL, yol) {
    this.yol = yol;
    this.db = fs.existsSync(yol) ? new SQL.Database(fs.readFileSync(yol)) : new SQL.Database();
    this.db.run('PRAGMA foreign_keys = ON');
    this.motor = 'sql.js';
    this._t = null;
  }
  _planla() {
    if (this._t) return;
    this._t = setTimeout(() => { this._t = null; this.kaydet(); }, 800);
  }
  kaydet() {
    try {
      const tmp = this.yol + '.tmp';
      fs.writeFileSync(tmp, Buffer.from(this.db.export()));
      fs.renameSync(tmp, this.yol);
    } catch (e) { console.error('[DB] Kayıt hatası:', e.message); }
  }
  prepare(sql) {
    const db = this.db, self = this;
    return {
      run: (...p) => {
        db.run(sql, temizle(p));
        const changes = db.getRowsModified();
        const r = db.exec('SELECT last_insert_rowid()');
        self._planla();
        return { changes, lastInsertRowid: r.length ? r[0].values[0][0] : 0 };
      },
      get: (...p) => {
        const s = db.prepare(sql);
        try { s.bind(temizle(p)); return s.step() ? s.getAsObject() : undefined; } finally { s.free(); }
      },
      all: (...p) => {
        const s = db.prepare(sql); const out = [];
        try { s.bind(temizle(p)); while (s.step()) out.push(s.getAsObject()); } finally { s.free(); }
        return out;
      },
    };
  }
  exec(sql) { this.db.exec(sql); this._planla(); }
  boyut() { try { return fs.statSync(this.yol).size; } catch (e) { return 0; } }
  yedekBuffer() { return Buffer.from(this.db.export()); }
  kolonlar(tablo) { return this.prepare(`PRAGMA table_info(${tabloAdi(tablo)})`).all().map(c => c.name); }
  tamYedek() { return { buffer: this.yedekBuffer(), uzanti: 'db' }; }
}

// ─── PostgreSQL (Railway vb.) ───────────────────────────────────────────────
// Uygulama kodu senkron veritabanı API'si kullanır. PostgreSQL sorguları bir işçi iş parçacığında
// çalışır; ana iş parçacığı Atomics.wait ile sonucu bekler (node:sqlite ile aynı çalışma modeli).
const SERIAL_OLMAYAN = new Set(['sistem_ayarlari', 'modul_kullanim', 'sayaclar', 'ip_engelleri']);
function sqlCevir(sql) {
  let s = sql;
  s = s.replace(/datetime\('now'\s*(?:,\s*'([^']+)')?\)/g, (_, m) => `to_char(now()${m ? ` + interval '${m}'` : ''}, 'YYYY-MM-DD HH24:MI:SS')`);
  s = s.replace(/date\('now'\s*(?:,\s*'([^']+)')?\)/g, (_, m) => `to_char(now()${m ? ` + interval '${m}'` : ''}, 'YYYY-MM-DD')`);
  s = s.replace(/\bdate\(([a-z_.]+)\)/g, 'substr($1,1,10)');
  s = s.replace(/GROUP_CONCAT\(/g, 'string_agg(');
  const yoksay = /INSERT\s+OR\s+IGNORE\s+INTO/i.test(s);
  if (yoksay) s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/ig, 'INSERT INTO');
  // DDL
  s = s.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'BIGSERIAL PRIMARY KEY').replace(/\bINTEGER\b/g, 'BIGINT').replace(/\bREAL\b/g, 'DOUBLE PRECISION');
  // Parametreler: ? → $n (tek tırnaklı metinlerin dışında)
  let n = 0, cikti = '', tirnak = false;
  for (const ch of s) {
    if (ch === "'") tirnak = !tirnak;
    cikti += (!tirnak && ch === '?') ? '$' + (++n) : ch;
  }
  s = cikti;
  const ins = /^\s*INSERT\s+INTO\s+([a-z_]+)/i.exec(s);
  if (ins && !/RETURNING/i.test(s)) {
    if (yoksay && !/ON CONFLICT/i.test(s)) s += ' ON CONFLICT DO NOTHING';
    if (!SERIAL_OLMAYAN.has(ins[1].toLowerCase())) s += ' RETURNING id';
  } else if (yoksay && !/ON CONFLICT/i.test(s)) s += ' ON CONFLICT DO NOTHING';
  return s;
}

class PgDb {
  constructor(url) {
    const { Worker, MessageChannel, receiveMessageOnPort } = require('worker_threads');
    this.alici = receiveMessageOnPort;
    this.sinyal = new SharedArrayBuffer(4);
    this.durum = new Int32Array(this.sinyal);
    const { port1, port2 } = new MessageChannel();
    this.port = port1;
    this.isci = new Worker(path.join(__dirname, 'pgisci.js'), { workerData: { port: port2, sinyal: this.sinyal, url }, transferList: [port2] });
    this.isci.unref();
    this.isci.on('error', (e) => console.error('[PG] İşçi hatası:', e.message));
    this.motor = 'postgresql';
    this._cache = new Map();
  }
  _cagir(is) {
    Atomics.store(this.durum, 0, 0);
    this.port.postMessage(is);
    const r = Atomics.wait(this.durum, 0, 0, 60000);
    if (r === 'timed-out') throw new Error('Veritabanı yanıt vermedi (zaman aşımı)');
    const m = this.alici(this.port);
    if (!m) throw new Error('Veritabanı yanıtı alınamadı');
    if (m.message.hata) {
      const h = m.message.hata;
      // SQLSTATE kodu yoksa bağlantı düzeyinde hatadır (sunucu kapalı, ağ kesik): 503 olarak bildir
      if (baglantiHatasi(h.code)) {
        const simdi = Date.now();
        if (!this._sonUyari || simdi - this._sonUyari > 30000) { this._sonUyari = simdi; console.error('[PG] Bağlantı hatası:', h.message); }
        const e = new Error('Veritabanına şu anda ulaşılamıyor. Lütfen biraz sonra tekrar deneyin.'); e.durum = 503; e.code = h.code || 'BAGLANTI'; throw e;
      }
      const e = new Error(h.message); e.code = h.code; e.detay = h.detay; throw e;
    }
    return m.message;
  }
  _sql(sql) { let c = this._cache.get(sql); if (!c) { c = sqlCevir(sql); if (this._cache.size < 2000) this._cache.set(sql, c); } return c; }
  prepare(sql) {
    const c = this._sql(sql), self = this;
    return {
      run: (...p) => { const r = self._cagir({ sql: c, params: temizle(p) }); return { changes: r.rowCount, lastInsertRowid: r.rows[0] && r.rows[0].id !== undefined ? Number(r.rows[0].id) : 0 }; },
      get: (...p) => self._cagir({ sql: c, params: temizle(p) }).rows[0],
      all: (...p) => self._cagir({ sql: c, params: temizle(p) }).rows,
    };
  }
  exec(sql) { this._cagir({ sql: sqlCevir(sql), params: [] }); }
  kaydet() { /* sunucu tarafında */ }
  boyut() { try { return this.prepare('SELECT pg_database_size(current_database()) AS b').get().b; } catch (e) { return 0; } }
  kolonlar(tablo) { return this.prepare('SELECT column_name AS ad FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=? ORDER BY ordinal_position').all(tabloAdi(tablo)).map(x => x.ad); }
  tablolar() { return this.prepare("SELECT table_name AS ad FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name").all().map(x => x.ad); }
  // Tam yedek: tüm tablolar JSON (oturumlar hariç), gzip
  tamYedek() {
    const veri = { defterdar_tam_yedek: 1, motor: 'postgresql', tarih: new Date().toISOString(), tablolar: {} };
    for (const t of this.tablolar()) { if (t === 'oturumlar') continue; veri.tablolar[t] = this.prepare(`SELECT * FROM ${tabloAdi(t)}`).all(); }
    return { buffer: require('zlib').gzipSync(JSON.stringify(veri)), uzanti: 'json.gz' };
  }
  tamGeriYukle(buffer) {
    let veri;
    try { veri = JSON.parse(require('zlib').gunzipSync(buffer).toString('utf8')); } catch (e) { throw new Error('Dosya geçerli bir Defterdar PostgreSQL yedeği değil'); }
    if (!veri.defterdar_tam_yedek || !veri.tablolar) throw new Error('Dosya geçerli bir Defterdar PostgreSQL yedeği değil');
    const mevcut = new Set(this.tablolar());
    const tablolar = Object.keys(veri.tablolar).filter(t => mevcut.has(t) && t !== 'oturumlar');
    this.islem(() => {
      this.exec(`TRUNCATE ${tablolar.map(tabloAdi).join(', ')} RESTART IDENTITY CASCADE`);
      // Yabancı anahtar sırası: önce bağımsız tablolar
      const sira = ['hesaplar', 'adminler', ...tablolar.filter(t => !['hesaplar', 'adminler', 'destek_mesajlari'].includes(t)), 'destek_mesajlari'].filter(t => tablolar.includes(t));
      for (const t of sira) {
        const kol = new Set(this.kolonlar(t));
        for (const satir of veri.tablolar[t]) {
          const k = Object.keys(satir).filter(x => kol.has(x));
          if (!k.length) continue;
          this._cagir({ sql: `INSERT INTO ${tabloAdi(t)} (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')})`, params: temizle(k.map(x => satir[x])) });
        }
        if (kol.has('id') && !SERIAL_OLMAYAN.has(t) && t !== 'oturumlar') {
          this._cagir({ sql: `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${tabloAdi(t)}), 1), (SELECT MAX(id) FROM ${tabloAdi(t)}) IS NOT NULL)`, params: [] });
        }
      }
    });
    return tablolar.length;
  }
}
// SQLSTATE: 5 karakter, 'E' ile başlamaz. Node soket hataları (ECONNREFUSED, EPIPE…) ve 08/57P0x sınıfı bağlantı hatasıdır.
function baglantiHatasi(kod) { const sql = kod && /^[0-9A-Z]{5}$/.test(kod) && kod[0] !== 'E'; return !sql || /^(08|57P0)/.test(kod); }
function tabloAdi(t) { if (!/^[a-z_]+$/.test(String(t))) throw new Error('Geçersiz tablo adı'); return t; }

let _db = null;
let _hazir = null;

async function baslat() {
  if (_db) return _db;
  if (_hazir) return _hazir;
  _hazir = (async () => {
    let db;
    const pgUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_PRIVATE_URL;
    if (pgUrl && /^postgres(ql)?:\/\//.test(pgUrl)) {
      db = new PgDb(pgUrl);
      try { db.prepare('SELECT 1 AS x').get(); } catch (e) { throw new Error('PostgreSQL bağlantısı kurulamadı: ' + e.message); }
      console.log('[DB] PostgreSQL kullanılıyor');
    } else try {
      db = new NodeSqliteDb(DB_YOLU);
    } catch (e) {
      let initSqlJs;
      try { initSqlJs = require('sql.js'); } catch (e2) {
        throw new Error('Veritabanı motoru bulunamadı. Node.js 22.13+ kullanın veya "npm install sql.js" çalıştırın.');
      }
      const SQL = await initSqlJs();
      db = new SqlJsDb(SQL, DB_YOLU);
    }
    // İşlem (transaction) yardımcısı
    // İç içe çağrılabilir işlem: yalnızca en dıştaki BEGIN/COMMIT yapar
    db._derinlik = 0;
    db.islem = (fn) => {
      if (db._derinlik > 0) { db._derinlik++; try { return fn(); } finally { db._derinlik--; } }
      db._derinlik = 1;
      db.exec('BEGIN');
      try { const r = fn(); db.exec('COMMIT'); return r; }
      catch (e) { try { db.exec('ROLLBACK'); } catch (x) { /* */ } throw e; }
      finally { db._derinlik = 0; }
    };
    require('../sema').uygula(db);
    _db = db;
    return db;
  })();
  return _hazir;
}

function db() {
  if (!_db) throw new Error('Veritabanı henüz hazır değil');
  return _db;
}

process.on('exit', () => { try { _db && _db.kaydet(); } catch (e) { /* */ } });

module.exports = { baslat, db, VERI_KLASORU, DB_YOLU, sqlCevir };
