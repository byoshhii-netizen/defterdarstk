const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { getDb } = process.env.RAILWAY_ENVIRONMENT || process.env.PORT
  ? require('./database-web')
  : require('./database');
const { normalizeUserKurulusTipi } = require('./org-type-utils');

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress || req.ip || '';
}

// ─── KAYIT ─────────────────────────────────────────────────────────────────
router.post('/kayit', async (req, res) => {
  try {
    const { kullanici_adi, email, sifre, kurulus_tipi, aktivasyon_kodu } = req.body;
    if (!kullanici_adi || !email || !sifre)
      return res.status(400).json({ hata: 'Tum alanlar zorunlu' });
    if (sifre.length < 6)
      return res.status(400).json({ hata: 'Sifre en az 6 karakter olmali' });
    if (!kurulus_tipi || (Array.isArray(kurulus_tipi) ? kurulus_tipi.length === 0 : !kurulus_tipi))
      return res.status(400).json({ hata: 'Kuruluş tipi seçimi zorunlu' });

    const db = await getDb();
    const mevcut = db.prepare('SELECT id FROM kullanicilar WHERE kullanici_adi=? OR email=?').get(kullanici_adi, email);
    if (mevcut) return res.status(400).json({ hata: 'Bu kullanici adi veya email zaten kayitli' });

    const hash = bcrypt.hashSync(sifre, 10);
    const kurulasStr = Array.isArray(kurulus_tipi) ? kurulus_tipi.join(',') : kurulus_tipi;
    const normalizedKurulusTipi = normalizeUserKurulusTipi(kurulus_tipi);
    const ip = getClientIp(req);

    let plan = 'demo';
    if (aktivasyon_kodu && aktivasyon_kodu.trim()) {
      const kod = db.prepare('SELECT * FROM aktivasyon_kodlar WHERE kod=? AND kullanildi=0').get(aktivasyon_kodu.trim().toUpperCase());
      if (!kod) return res.status(400).json({ hata: 'Aktivasyon kodu geçersiz veya kullanılmış' });
      plan = kod.plan;
    }

    const tipler = Array.isArray(kurulus_tipi) ? kurulus_tipi : [kurulus_tipi];
    let mod = 'dernek', sablon = 'dernek';
    if (tipler.includes('sirket') || tipler.includes('kurumsal') || normalizedKurulusTipi === 'sirket') { mod = 'ticari'; sablon = 'ticari'; }
    else if (tipler.includes('stk') || normalizedKurulusTipi === 'stk') { mod = 'dernek'; sablon = 'dernek'; }
    else if (tipler.includes('ekip') || tipler.includes('kisisel') || normalizedKurulusTipi === 'kisisel') { mod = 'temel'; sablon = 'temel'; }

    const dernekAktif = tipler.includes('stk');
    const varsayilanModuller = {
      dernek: { kurban: true, bagis: true, yardim: true, personel: true, kasa: true, sms: true, dernek: dernekAktif },
      ticari: { cari: true, stok: true, satis: true, fatura: true, personel: true, kasa: true, sms: true },
      temel:  { personel: true, kasa: true, stok: true }
    };
    const moduller = JSON.stringify(varsayilanModuller[sablon] || {});

    const r = db.prepare(
      'INSERT INTO kullanicilar (kullanici_adi, email, sifre_hash, kurulus_tipi, sistem_modu, sektor_sablonu, aktif_moduller, plan, kayit_ip, son_ip, son_giris) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).run(kullanici_adi, email, hash, normalizedKurulusTipi, mod, sablon, moduller, plan, ip, ip, new Date().toISOString());

    const userId = r.lastInsertRowid;
    if (plan !== 'demo' && aktivasyon_kodu) {
      db.prepare('UPDATE aktivasyon_kodlar SET kullanildi=1, kullanici_id=?, kullanim_tarihi=? WHERE kod=?')
        .run(userId, new Date().toISOString(), aktivasyon_kodu.trim().toUpperCase());
    }

    req.session.userId = userId;
    req.session.kullaniciAdi = kullanici_adi;
    req.session.save((err) => {
      if (err) return res.status(500).json({ hata: 'Session hatası: ' + err.message });
      res.json({ ok: true, userId, kullanici_adi, mod, sablon, plan });
    });
  } catch (e) {
    console.error('[KAYIT] Hata:', e.message);
    return res.status(500).json({ hata: 'Kayıt işlemi başarısız: ' + e.message });
  }
});

// ─── GİRİŞ ─────────────────────────────────────────────────────────────────
router.post('/giris', async (req, res) => {
  try {
    const { kullanici_adi, sifre } = req.body;
    if (!kullanici_adi || !sifre)
      return res.status(400).json({ hata: 'Kullanici adi ve sifre zorunlu' });

    const db = await getDb();
    const user = db.prepare('SELECT * FROM kullanicilar WHERE kullanici_adi=?').get(kullanici_adi);
    if (!user) return res.status(401).json({ hata: 'Kullanici adi veya sifre yanlis' });

    const legacyHash = !user.sifre_hash || user.sifre_hash === 'dummy' || user.sifre_hash === 'defterdar';
    const eslesme = legacyHash
      ? (sifre === 'defterdar123')
      : bcrypt.compareSync(sifre, user.sifre_hash);
    if (!eslesme) return res.status(401).json({ hata: 'Kullanici adi veya sifre yanlis' });

    if (legacyHash) {
      const yeniHash = bcrypt.hashSync(sifre, 10);
      db.prepare('UPDATE kullanicilar SET sifre_hash=? WHERE id=?').run(yeniHash, user.id);
    }

    const ip = getClientIp(req);
    try {
      db.prepare('UPDATE kullanicilar SET son_ip=?, son_giris=? WHERE id=?').run(ip, new Date().toISOString(), user.id);
    } catch(e) {}

    req.session.userId = user.id;
    req.session.kullaniciAdi = user.kullanici_adi;
    req.session.save((err) => {
      if (err) return res.status(500).json({ hata: 'Session hatası: ' + err.message });
      res.json({ ok: true, userId: user.id, kullanici_adi: user.kullanici_adi });
    });
  } catch (e) {
    console.error('[GİRİŞ] Hata:', e.message);
    return res.status(500).json({ hata: 'Giriş işlemi başarısız: ' + e.message });
  }
});

// ─── ÇIKIŞ ─────────────────────────────────────────────────────────────────
router.post('/cikis', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// ─── DURUM ─────────────────────────────────────────────────────────────────
router.get('/durum', async (req, res) => {
  if (req.session.userId) {
    try {
      const db = await getDb();
      const user = db.prepare('SELECT kullanici_adi, email, plan, kurulus_tipi, sistem_modu, aktif_moduller FROM kullanicilar WHERE id=?').get(req.session.userId);
      if (!user) { req.session.destroy(); return res.json({ girisYapildi: false }); }
      let moduller = {};
      try { moduller = JSON.parse(user.aktif_moduller || '{}'); } catch(e) {}
      return res.json({
        girisYapildi: true,
        kullanici_adi: user.kullanici_adi,
        userId: req.session.userId,
        email: user.email,
        plan: user.plan || 'demo',
        kurulus_tipi: user.kurulus_tipi || '',
        sistem_modu: user.sistem_modu || 'dernek',
        moduller
      });
    } catch(e) {
      return res.json({ girisYapildi: true, kullanici_adi: req.session.kullaniciAdi, userId: req.session.userId });
    }
  }
  res.json({ girisYapildi: false });
});

// ─── İÇDER KURBAN ŞİFRE KONTROLÜ ───────────────────────────────────────────
router.post('/icder-sifre-kontrol', async (req, res) => {
  const { sifre } = req.body;
  if (!sifre) return res.status(400).json({ hata: 'Şifre gerekli' });

  const db = await getDb();
  const ayar = db.prepare('SELECT icder_sifre FROM ayarlar WHERE kullanici_id=1').get();
  const dogruSifre = ayar?.icder_sifre || '571571';

  if (sifre === dogruSifre) {
    req.session.icderGiris = Date.now();
    res.json({ ok: true });
  } else {
    res.status(401).json({ hata: 'Şifre yanlış' });
  }
});

// ─── İÇDER ŞİFRE DEĞİŞTİRME ────────────────────────────────────────────────
router.post('/icder-sifre-degistir', async (req, res) => {
  const { mevcut_sifre, yeni_sifre } = req.body;
  if (!mevcut_sifre || !yeni_sifre) {
    return res.status(400).json({ hata: 'Mevcut şifre ve yeni şifre gerekli' });
  }

  const db = await getDb();
  const ayar = db.prepare('SELECT icder_sifre FROM ayarlar WHERE kullanici_id=1').get();
  const mevcutSifre = ayar?.icder_sifre || '571571';

  if (mevcut_sifre !== mevcutSifre) {
    return res.status(401).json({ hata: 'Mevcut şifre yanlış' });
  }

  const mevcut = db.prepare('SELECT id FROM ayarlar WHERE kullanici_id=1').get();
  if (mevcut) {
    db.prepare('UPDATE ayarlar SET icder_sifre=? WHERE kullanici_id=1').run(yeni_sifre);
  } else {
    db.prepare('INSERT INTO ayarlar (kullanici_id, icder_sifre) VALUES (1, ?)').run(yeni_sifre);
  }

  res.json({ ok: true });
});

// ─── İÇDER GİRİŞ DURUMU ────────────────────────────────────────────────────
router.get('/icder-giris-durumu', (req, res) => {
  if (req.session.icderGiris) {
    const gecenSure = Date.now() - req.session.icderGiris;
    const birGun = 24 * 60 * 60 * 1000;
    if (gecenSure < birGun) {
      return res.json({ girisYapildi: true });
    }
  }
  res.json({ girisYapildi: false });
});

// ─── ŞİFRE DEĞİŞTİR ────────────────────────────────────────────────────────
router.post('/sifre-degistir', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ hata: 'Giriş yapmanız gerekiyor' });
  const { mevcut_sifre, yeni_sifre } = req.body;
  if (!mevcut_sifre || !yeni_sifre) return res.status(400).json({ hata: 'Mevcut ve yeni şifre zorunlu' });
  if (yeni_sifre.length < 6) return res.status(400).json({ hata: 'Şifre en az 6 karakter olmalı' });

  const db = await getDb();
  const user = db.prepare('SELECT * FROM kullanicilar WHERE id=?').get(req.session.userId);
  if (!user) return res.status(404).json({ hata: 'Kullanıcı bulunamadı' });

  const eslesme = bcrypt.compareSync(mevcut_sifre, user.sifre_hash);
  if (!eslesme) return res.status(401).json({ hata: 'Mevcut şifre yanlış' });

  const yeniHash = bcrypt.hashSync(yeni_sifre, 10);
  db.prepare('UPDATE kullanicilar SET sifre_hash=? WHERE id=?').run(yeniHash, req.session.userId);
  res.json({ ok: true });
});

// ─── DEBUG ─────────────────────────────────────────────────────────────────
router.get('/debug', async (req, res) => {
  try {
    const db = await getDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const kullanicilar = db.prepare('SELECT COUNT(*) as count FROM kullanicilar').get();
    const sessionInfo = {
      sessionId: req.sessionID,
      userId: req.session.userId,
      kullaniciAdi: req.session.kullaniciAdi,
      cookie: req.headers.cookie || 'Yok'
    };
    res.json({
      ok: true,
      database: {
        tables: tables.map(t => t.name),
        kullanicilar: kullanicilar.count
      },
      session: sessionInfo,
      env: {
        railway: !!process.env.RAILWAY_ENVIRONMENT,
        port: process.env.PORT
      }
    });
  } catch (e) {
    console.error('[DEBUG] Hata:', e.message);
    res.status(500).json({ hata: 'Debug hatası: ' + e.message, stack: e.stack });
  }
});

module.exports = router;
