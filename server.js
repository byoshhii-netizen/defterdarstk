'use strict';
// Defterdar — STK ve işletmeler için muhasebe ve yönetim sistemi
const fs = require('fs');
const path = require('path');

// node:sqlite deneysel uyarısını sessize al (diğer uyarılar görünür kalır)
const _emit = process.emitWarning;
process.emitWarning = function (w, ...a) { if (String(w && w.message || w).includes('SQLite')) return; return _emit.call(process, w, ...a); };

const { baslat, db, DB_YOLU } = require('./src/lib/db');
const { uygulamaOlustur } = require('./src/lib/http');

const PORT = +process.env.PORT || 4500;
const HOST = process.env.HOST || '0.0.0.0';
const GUVEN_PROXY = process.env.TRUST_PROXY === '1' || !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RENDER;
const PUBLIC = path.join(__dirname, 'public');

// Bekleyen veritabanı geri yüklemesi varsa açılışta uygula
function bekleyenGeriYukleme() {
  const yol = DB_YOLU + '.geri-yukle';
  if (!fs.existsSync(yol)) return;
  try {
    for (const ek of ['-wal', '-shm']) { try { fs.unlinkSync(DB_YOLU + ek); } catch (e) { /* */ } }
    fs.renameSync(yol, DB_YOLU);
    console.log('[DB] Yedekten geri yükleme uygulandı');
  } catch (e) { console.error('[DB] Geri yükleme uygulanamadı:', e.message); }
}

async function olustur() {
  bekleyenGeriYukleme();
  await baslat();
  const app = uygulamaOlustur({ statikKlasor: PUBLIC, guvenProxy: GUVEN_PROXY });
  const O = require('./src/lib/oturum');

  app.onKatman((req, res) => {
    if (process.env.FORCE_HTTPS === '1' && GUVEN_PROXY && req.headers['x-forwarded-proto'] === 'http') {
      res.yonlendir('https://' + req.headers.host + req.url); return false;
    }
    // Eski/hassas dosyalara erişimi engelle
    if (/^\/(data|src|node_modules|\.)/i.test(req.yol) || /\.(db|env|key|pem|md)$/i.test(req.yol)) { res.statusCode = 404; res.end('Bulunamadı'); return false; }
    if (O.ipEngelliMi(req.ip) && !req.yol.startsWith('/css') && !req.yol.startsWith('/fa')) { res.statusCode = 403; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('Erişim engellendi'); return false; }
  });

  require('./src/routes/auth')(app);
  require('./src/routes/kurban')(app);
  require('./src/routes/kayit')(app);
  require('./src/routes/finans')(app);
  require('./src/routes/rapor')(app);
  require('./src/routes/personel')(app);
  require('./src/routes/sistem')(app);
  require('./src/routes/sadmin')(app);

  const sayfa = app.yonlendirici('');
  sayfa.get('/saglik', (req, res) => {
    try { db().prepare('SELECT 1 AS x').get(); return { durum: 'ok', veritabani: db().motor || 'sqlite' }; }
    catch (e) { res.json({ durum: 'hata', veritabani: 'erişilemiyor' }, 503); }
  });
  // Yönetici destek erişimi: tek kullanımlık kod → kullanıcı oturum çerezi
  sayfa.get('/destek-erisimi', (req, res) => {
    const token = require('./src/routes/sadmin').erisimKoduKullan(String(req.sorgu.kod || ''));
    if (!token) { res.statusCode = 410; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('Erişim bağlantısının süresi doldu.'); return; }
    res.cerez(O.CEREZ.kullanici, token, { sameSite: 'Lax' });
    res.yonlendir('/panel');
  });
  const sadminHtml = (req, res) => { res.setHeader('Cache-Control', 'no-store'); app.statikGonder(req, res, '/sadmin.html', false); };
  sayfa.get('/sadmin', sadminHtml);
  sayfa.get('/sadmin/*', sadminHtml);
  // Eski adresler
  sayfa.get('/dypadmin', (req, res) => res.yonlendir('/sadmin'));
  sayfa.get('/admin-giris', (req, res) => res.yonlendir('/sadmin'));
  sayfa.get('/icder-giris', (req, res) => res.yonlendir('/giris'));
  // Uygulama (tek sayfa) — tüm Türkçe rotalar
  sayfa.get('/*', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); app.statikGonder(req, res, '/index.html', false); });

  return app;
}

function zamanlayici() {
  const { db } = require('./src/lib/db');
  const O = require('./src/lib/oturum');
  let sonYedekGunu = null;
  const tik = () => {
    try {
      db().prepare('DELETE FROM oturumlar WHERE bitis<?').run(Date.now());
      db().prepare("DELETE FROM giris_kayitlari WHERE tarih<datetime('now','-180 day')").run();
      db().prepare("DELETE FROM cop_kutusu WHERE silme_tarihi<datetime('now','-180 day')").run();
      const simdi = new Date(Date.now() + 3 * 3600000);
      const gun = simdi.toISOString().slice(0, 10);
      if (O.ayar('oto_yedek_aktif', '1') === '1' && simdi.getUTCHours() === +O.ayar('oto_yedek_saat', '6') && sonYedekGunu !== gun) {
        sonYedekGunu = gun;
        const ad = require('./src/routes/sadmin').otoYedekAl('otomatik');
        console.log('[YEDEK] Otomatik yedek alındı:', ad);
      }
    } catch (e) { console.error('[ZAMANLAYICI]', e.message); }
  };
  setInterval(tik, 10 * 60 * 1000).unref();
  setTimeout(tik, 15000).unref();
}

async function calistir(port = PORT, host = HOST) {
  const app = await olustur();
  const sunucu = app.sunucu();
  await new Promise((ok, red) => { sunucu.once('error', red); sunucu.listen(port, host, ok); });
  zamanlayici();
  console.log(`Defterdar çalışıyor: http://localhost:${port}`);
  const kapat = () => { try { require('./src/lib/db').db().kaydet(); } catch (e) { /* */ } process.exit(0); };
  process.on('SIGINT', kapat); process.on('SIGTERM', kapat);
  return sunucu;
}

module.exports = { olustur, calistir };
if (require.main === module) calistir().catch(e => { console.error('Başlatılamadı:', e.message); process.exit(1); });
