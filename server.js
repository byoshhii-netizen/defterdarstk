const express = require('express');
const session = require('express-session');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 4500;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// index.html hariç statik dosyalar (CSS, JS, resimler vs.)
app.use(express.static(path.join(__dirname, 'public'), {
  index: false // index.html'i otomatik servis etme, middleware'den geçsin
}));

app.set('trust proxy', 1);

// Session store ayarı
let sessionStore = new session.MemoryStore(); // Default memory store
let pgPool = null;

// Railway'de PostgreSQL varsa kullan
if (process.env.DATABASE_URL || process.env.RAILWAY_ENVIRONMENT) {
  try {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL
    });
    const pgSession = require('connect-pg-simple')(session);
    sessionStore = new pgSession({
      pool: pgPool,
      tableName: 'session',
      createTableIfMissing: true
    });
    console.log('[SESSION] PostgreSQL store kullanılıyor');
  } catch (e) {
    console.warn('[SESSION] PostgreSQL store hatası, memory store kullanılıyor:', e.message);
    sessionStore = new session.MemoryStore();
  }
}

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'defterdar-cms-2024',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

app.use('/api/auth', require('./src/auth'));
app.use('/api/admin', require('./src/admin-routes'));

// ─── SİSTEM MODU API BLOKAJI ────────────────────────────────────────────────
// Bakım/Kapalı modda admin dışındaki kullanıcıların TÜM /api/* isteklerini engelle
// (sadece sistem-modu sorgulama ve auth endpoints geçer)
async function sistemModuApiBlokaj(req, res, next) {
  // Admin oturumu varsa geçir
  if (req.session.adminGiris) return next();
  // İstisnalar: sistem modu sorgulama (frontend polling), auth (giriş/çıkış)
  if (req.path.startsWith('/admin/sistem-modu') ||
      req.path.startsWith('/auth/')) {
    return next();
  }
  try {
    const { getDb } = process.env.RAILWAY_ENVIRONMENT || process.env.PORT
      ? require('./src/database-web')
      : require('./src/database');
    const db = await getDb();
    const modRow = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='sistem_modu'").get();
    const notRow = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='sistem_notu'").get();
    const mod = modRow?.deger || 'acik';
    if (mod === 'bakim' || mod === 'kapali') {
      // İçder oturumu da silinsin → sonraki sayfa yüklemesinde bakım ekranına atılsın
      delete req.session.icderGiris;
      return res.status(503).json({
        hata: mod === 'bakim' ? 'Sistem bakım modunda' : 'Sistem kapalı',
        sistem_modu: mod,
        sistem_notu: notRow?.deger || '',
        bloke: true,
      });
    }
  } catch(e) { /* DB hatası olursa devam et */ }
  next();
}
app.use('/api', sistemModuApiBlokaj);

app.use('/api', require('./src/routes'));
app.use('/api/medya', require('./src/cloudinary'));
app.use('/api/destek', require('./src/destek-routes'));
app.use('/api', require('./src/sms-routes'));

app.get('/', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/giris', (req, res) => res.redirect('/'));
app.get('/kayit', (req, res) => res.redirect('/'));
app.get('/icder-giris', (req, res) => res.redirect('/'));
app.get('/admin-giris', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-giris.html')));
app.get('/dypadmin', (req, res) => {
  if (!req.session.adminGiris) return res.redirect('/admin-giris?returnUrl=/dypadmin');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Giriş koruması: yeni landing page'den sonra hesaplı kullanıcılar app shell'e erişir.
async function icderGirisKontrol(req, res, next) {
  if (req.path.startsWith('/api') ||
      req.path.startsWith('/fa') ||
      req.path === '/icder-giris' ||
      req.path === '/icder-giris.html' ||
      req.path === '/admin' ||
      req.path === '/dypadmin' ||
      req.path === '/admin-giris' ||
      req.path === '/admin-giris.html' ||
      req.path === '/giris' ||
      req.path === '/kayit' ||
      req.path === '/' ||
      req.path.includes('.css') ||
      req.path.includes('.js') ||
      req.path.includes('.png') ||
      req.path.includes('.jpg') ||
      req.path.includes('.ico')) {
    return next();
  }

  return next();
}

app.use(icderGirisKontrol);

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ ok: false });
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;

// ─── OTOMATİK YEDEK SİSTEMİ ─────────────────────────────────────────────────
let _otoYedekTimer = null;

async function otoYedekCalistir() {
  try {
    const dbMod = process.env.RAILWAY_ENVIRONMENT || process.env.PORT
      ? require('./src/database-web')
      : require('./src/database');
    const { getDb } = dbMod;
    const db = await getDb();

    // Ayarları oku
    const aktifRow = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='oto_yedek_aktif'").get();
    if (aktifRow?.deger === '0') return; // Kapalıysa çalışma

    // Yedek verisini oluştur
    const orglar = db.prepare('SELECT * FROM organizasyonlar').all();
    const yedekData = { tarih: new Date().toISOString(), organizasyonlar: [] };
    for (const org of orglar) {
      const kurbanlar = db.prepare('SELECT * FROM kurbanlar WHERE organizasyon_id=?').all(org.id);
      const orgObj = { ...org, kurbanlar: [] };
      for (const k of kurbanlar) {
        const hisseler = db.prepare('SELECT * FROM hisseler WHERE kurban_id=?').all(k.id);
        orgObj.kurbanlar.push({ ...k, hisseler });
      }
      yedekData.organizasyonlar.push(orgObj);
    }
    const ayarlar = db.prepare('SELECT * FROM ayarlar WHERE kullanici_id=1').get();
    if (ayarlar) yedekData.yazdirma_ayarlari = { logo_data: ayarlar.logo_data, bayrak_data: ayarlar.bayrak_data };

    const json = JSON.stringify(yedekData);
    const tarihStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dosyaAdi = `oto-yedek-${tarihStr}.json`;

    // Kaydet
    const fs = require('fs');
    const pathMod = require('path');
    let dir;
    try {
      const { app: electronApp } = require('electron');
      dir = pathMod.join(electronApp.getPath('userData'), 'otomatik-yedek');
    } catch (e) {
      dir = pathMod.join(__dirname, 'otomatik-yedek');
    }
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(pathMod.join(dir, dosyaAdi), json, 'utf8');

    // Eski yedekleri temizle (son 50 tane tut)
    const dosyalar = fs.readdirSync(dir)
      .filter(f => f.startsWith('oto-yedek-') && f.endsWith('.json'))
      .sort();
    if (dosyalar.length > 50) {
      dosyalar.slice(0, dosyalar.length - 50).forEach(f => {
        try { fs.unlinkSync(pathMod.join(dir, f)); } catch(e) {}
      });
    }

    // Log tablosuna kaydet
    try {
      db.prepare("CREATE TABLE IF NOT EXISTS oto_yedek_loglar (id INTEGER PRIMARY KEY AUTOINCREMENT, dosya_adi TEXT NOT NULL, boyut INTEGER DEFAULT 0, tarih DATETIME DEFAULT CURRENT_TIMESTAMP, durum TEXT DEFAULT 'basarili')").run ? 
        db.prepare("CREATE TABLE IF NOT EXISTS oto_yedek_loglar (id INTEGER PRIMARY KEY AUTOINCREMENT, dosya_adi TEXT NOT NULL, boyut INTEGER DEFAULT 0, tarih DATETIME DEFAULT CURRENT_TIMESTAMP, durum TEXT DEFAULT 'basarili')").run() :
        db.exec("CREATE TABLE IF NOT EXISTS oto_yedek_loglar (id INTEGER PRIMARY KEY AUTOINCREMENT, dosya_adi TEXT NOT NULL, boyut INTEGER DEFAULT 0, tarih DATETIME DEFAULT CURRENT_TIMESTAMP, durum TEXT DEFAULT 'basarili')");
    } catch(e) {}
    try {
      db.prepare("INSERT INTO oto_yedek_loglar (dosya_adi, boyut, durum) VALUES (?,?,?)").run(dosyaAdi, json.length, 'basarili');
      // Son 200 logu tut
      db.prepare("DELETE FROM oto_yedek_loglar WHERE id NOT IN (SELECT id FROM oto_yedek_loglar ORDER BY id DESC LIMIT 200)").run();
    } catch(e) {}

    console.log(`[OTO-YEDEK] ${dosyaAdi} kaydedildi (${Math.round(json.length/1024)} KB)`);
  } catch (e) {
    console.error('[OTO-YEDEK] Hata:', e.message);
  }
}

async function otoYedekBaslat() {
  if (_otoYedekTimer) { clearInterval(_otoYedekTimer); _otoYedekTimer = null; }
  try {
    const dbMod = process.env.RAILWAY_ENVIRONMENT || process.env.PORT
      ? require('./src/database-web')
      : require('./src/database');
    const { getDb } = dbMod;
    const db = await getDb();
    const dakikaRow = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='oto_yedek_dakika'").get();
    const dakika = Math.max(1, parseInt(dakikaRow?.deger || '10'));
    const ms = dakika * 60 * 1000;
    _otoYedekTimer = setInterval(otoYedekCalistir, ms);
    console.log(`[OTO-YEDEK] Her ${dakika} dakikada bir çalışacak`);
  } catch(e) {
    // DB henüz hazır değilse 30 sn sonra tekrar dene
    setTimeout(otoYedekBaslat, 30000);
  }
}

// Dışarıdan timer'ı yeniden başlatmak için export
module.exports.otoYedekBaslat = otoYedekBaslat;
module.exports.otoYedekCalistir = otoYedekCalistir;

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`İÇDER Dernek Yönetim Programı: http://localhost:${PORT}`);
    // Sunucu başlayınca otomatik yedek başlat
    setTimeout(otoYedekBaslat, 5000);
  });
}
