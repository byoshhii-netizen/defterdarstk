const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { createDbManager } = require('./database-core');
const { UHREVI_SCHEMA } = require('./uhrevi-schema');

class DbWrapper {
  constructor(manager) {
    this._manager = manager;
    this._db = manager.wrapper;
    this._dialect = manager.dialect;
  }

  prepare(sql) {
    return this._db.prepare(sql);
  }

  exec(sql) {
    return this._db.exec(sql);
  }

  pragma(str) {
    return this._db.pragma(str);
  }

  export() {
    return this._db.export();
  }
}

function getPostgresConfig() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PG_CONNECTION_STRING;
  if (connectionString) {
    return { connectionString };
  }

  if (process.env.PGHOST || process.env.PGUSER || process.env.PGPASSWORD || process.env.PGDATABASE) {
    return {
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432', 10),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE || 'defterdar',
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    };
  }

  return null;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kullanicilar (
    id BIGSERIAL PRIMARY KEY,
    kullanici_adi TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    sifre_hash TEXT NOT NULL,
    kurulus_tipi TEXT,
    sistem_modu TEXT DEFAULT 'dernek',
    sektor_sablonu TEXT DEFAULT 'dernek',
    aktif_moduller TEXT DEFAULT '{}',
    plan TEXT DEFAULT 'demo',
    kayit_ip TEXT,
    son_ip TEXT,
    son_giris TEXT,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS aktivasyon_kodlar (
    id BIGSERIAL PRIMARY KEY,
    kod TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL DEFAULT 'demo',
    kullanildi INTEGER DEFAULT 0,
    kullanici_id INTEGER,
    kullanim_tarihi TEXT,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS organizasyonlar (
    id BIGSERIAL PRIMARY KEY,
    ad TEXT NOT NULL,
    yil INTEGER NOT NULL,
    organizasyon_turu TEXT NOT NULL DEFAULT 'Kurban',
    max_kurban INTEGER NOT NULL,
    buyukbas_hisse_fiyati REAL NOT NULL DEFAULT 0,
    kucukbas_hisse_fiyati REAL NOT NULL DEFAULT 0,
    aciklama TEXT,
    aktif INTEGER DEFAULT 1,
    kullanici_id INTEGER DEFAULT 1,
    su_kuyusu_konum TEXT,
    su_kuyusu_fiyat REAL DEFAULT 0,
    su_kuyusu_durum TEXT DEFAULT 'devam_ediyor',
    su_kuyusu_renk TEXT DEFAULT '#f59e0b',
    yardim_turu TEXT,
    yardim_bolgeler TEXT,
    yardim_adi TEXT,
    etkinlik_adi TEXT,
    etkinlik_turu TEXT,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS su_kuyusu_organizasyonlari (
    id BIGSERIAL PRIMARY KEY,
    organizasyon_id INTEGER UNIQUE NOT NULL,
    konum TEXT,
    fiyat REAL DEFAULT 0,
    durum TEXT DEFAULT 'devam_ediyor',
    renk TEXT DEFAULT '#f59e0b',
    aciklama TEXT,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS su_kuyulari (
    id BIGSERIAL PRIMARY KEY,
    organizasyon_id INTEGER NOT NULL,
    ad TEXT NOT NULL,
    konum TEXT,
    butce REAL DEFAULT 0,
    toplanan REAL DEFAULT 0,
    durum TEXT DEFAULT 'devam',
    renk TEXT DEFAULT '#0ea5e9',
    aciklama TEXT,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS su_kuyu_bagislari (
    id BIGSERIAL PRIMARY KEY,
    organizasyon_id INTEGER NOT NULL,
    kuyu_id INTEGER NOT NULL,
    bagisci_adi TEXT NOT NULL,
    bagisci_telefon TEXT,
    miktar REAL DEFAULT 0,
    aciklama TEXT,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS yardim_bagislari (
    id BIGSERIAL PRIMARY KEY,
    organizasyon_id INTEGER NOT NULL,
    bagis_adi TEXT NOT NULL,
    bagis_turu TEXT,
    bolge TEXT,
    aciklama TEXT,
    tutar REAL DEFAULT 0,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS etkinlik_katilimcilari (
    id BIGSERIAL PRIMARY KEY,
    organizasyon_id INTEGER NOT NULL,
    ad TEXT NOT NULL,
    tip TEXT DEFAULT 'bagisci',
    telefon TEXT,
    notlar TEXT,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS genel_bagiscilar (
    id BIGSERIAL PRIMARY KEY,
    organizasyon_id INTEGER NOT NULL,
    ad TEXT NOT NULL,
    telefon TEXT,
    kategori TEXT DEFAULT 'Dernek Bağışçısı',
    aciklama TEXT,
    tutar REAL DEFAULT 0,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS kurbanlar (
    id BIGSERIAL PRIMARY KEY,
    organizasyon_id INTEGER NOT NULL,
    kurban_no INTEGER NOT NULL,
    tur TEXT NOT NULL,
    kurban_turu TEXT DEFAULT 'Udhiye',
    kesen_kisi TEXT,
    kucukbas_sayi INTEGER DEFAULT 1,
    kupe_no TEXT,
    alis_fiyati REAL DEFAULT 0,
    toplam_hisse INTEGER NOT NULL,
    kesildi INTEGER DEFAULT 0,
    kesim_tarihi TEXT,
    aciklama TEXT,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS hisseler (
    id BIGSERIAL PRIMARY KEY,
    kurban_id INTEGER NOT NULL,
    hisse_no INTEGER NOT NULL,
    bagisci_adi TEXT,
    bagisci_telefon TEXT,
    bagisci_kategori TEXT DEFAULT 'Genel Bağışçı',
    kimin_adina TEXT,
    kimin_adina_telefon TEXT,
    odeme_durumu TEXT DEFAULT 'bekliyor',
    video_ister INTEGER DEFAULT 0,
    aciklama TEXT,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS cop_kutusu (
    id BIGSERIAL PRIMARY KEY,
    tur TEXT NOT NULL,
    veri TEXT NOT NULL,
    silme_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS ayarlar (
    id BIGSERIAL PRIMARY KEY,
    kullanici_id INTEGER DEFAULT 1,
    logo_data TEXT,
    bayrak_data TEXT,
    kurulum_tamamlandi INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sistem_ayarlari (
    id BIGSERIAL PRIMARY KEY,
    anahtar TEXT UNIQUE NOT NULL,
    deger TEXT
  );
  CREATE TABLE IF NOT EXISTS destek_talepleri (
    id BIGSERIAL PRIMARY KEY,
    kullanici_id INTEGER DEFAULT 1,
    baslik TEXT,
    icerik TEXT,
    konu TEXT,
    mesaj TEXT,
    ad TEXT,
    email TEXT,
    admin_cevap TEXT,
    durum TEXT DEFAULT 'bekliyor',
    okundu INTEGER DEFAULT 0,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    guncelleme TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS ozel_kategoriler (
    id BIGSERIAL PRIMARY KEY,
    kategori_adi TEXT UNIQUE NOT NULL,
    kategori_tipi TEXT DEFAULT 'bagisci',
    aktif INTEGER DEFAULT 1,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS ozel_filtreler (
    id BIGSERIAL PRIMARY KEY,
    filtre_adi TEXT NOT NULL,
    filtre_tipi TEXT NOT NULL,
    filtre_degeri TEXT,
    aktif INTEGER DEFAULT 1,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS giris_logosu (
    id BIGSERIAL PRIMARY KEY,
    logo_data TEXT,
    aktif INTEGER DEFAULT 1,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS personeller (
    id BIGSERIAL PRIMARY KEY,
    ad TEXT NOT NULL,
    soyad TEXT NOT NULL,
    tc_no TEXT,
    dogum_tarihi TEXT,
    telefon TEXT,
    email TEXT,
    adres TEXT,
    pozisyon TEXT,
    departman TEXT,
    ise_baslama TEXT,
    maas REAL DEFAULT 0,
    iban TEXT,
    banka TEXT,
    acil_kisi TEXT,
    acil_telefon TEXT,
    fotograf TEXT,
    notlar TEXT,
    aktif INTEGER DEFAULT 1,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS personel_devamsizlik (
    id BIGSERIAL PRIMARY KEY,
    personel_id INTEGER NOT NULL,
    tarih TEXT NOT NULL,
    tur TEXT DEFAULT 'gelmedi',
    aciklama TEXT,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS personel_avans (
    id BIGSERIAL PRIMARY KEY,
    personel_id INTEGER NOT NULL,
    miktar REAL NOT NULL,
    tarih TEXT NOT NULL,
    aciklama TEXT,
    odendi INTEGER DEFAULT 0,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS personel_maas (
    id BIGSERIAL PRIMARY KEY,
    personel_id INTEGER NOT NULL,
    ay TEXT NOT NULL,
    maas REAL NOT NULL,
    odendi INTEGER DEFAULT 0,
    odeme_tarihi TEXT,
    aciklama TEXT,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS personel_notlar (
    id BIGSERIAL PRIMARY KEY,
    personel_id INTEGER NOT NULL,
    tur TEXT DEFAULT 'genel',
    baslik TEXT,
    icerik TEXT NOT NULL,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS kasa_hareketleri (
    id BIGSERIAL PRIMARY KEY,
    tarih TEXT NOT NULL,
    tur TEXT NOT NULL DEFAULT 'giris',
    kategori TEXT,
    aciklama TEXT NOT NULL,
    tutar REAL NOT NULL,
    belge_data TEXT,
    belge_adi TEXT,
    personel_id INTEGER,
    organizasyon_id INTEGER,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS kasa_gider_kalemleri (
    id BIGSERIAL PRIMARY KEY,
    ad TEXT NOT NULL,
    kategori TEXT,
    varsayilan_tutar REAL DEFAULT 0,
    aktif INTEGER DEFAULT 1,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS kasa_gelir_kalemleri (
    id BIGSERIAL PRIMARY KEY,
    ad TEXT NOT NULL,
    kategori TEXT,
    varsayilan_tutar REAL DEFAULT 0,
    aktif INTEGER DEFAULT 1,
    olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS oto_yedek_loglar (
    id BIGSERIAL PRIMARY KEY,
    dosya_adi TEXT NOT NULL,
    boyut INTEGER DEFAULT 0,
    tarih TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    durum TEXT DEFAULT 'basarili'
  );
`;

const MIGRATIONS = [
  "ALTER TABLE kurbanlar ADD COLUMN IF NOT EXISTS kurban_turu TEXT DEFAULT 'Udhiye'",
  "ALTER TABLE kurbanlar ADD COLUMN IF NOT EXISTS kesen_kisi TEXT",
  "ALTER TABLE kurbanlar ADD COLUMN IF NOT EXISTS kucukbas_sayi INTEGER DEFAULT 1",
  "ALTER TABLE organizasyonlar ADD COLUMN IF NOT EXISTS kullanici_id INTEGER DEFAULT 1",
  "ALTER TABLE organizasyonlar ADD COLUMN IF NOT EXISTS organizasyon_turu TEXT DEFAULT 'Kurban'",
  "ALTER TABLE hisseler ADD COLUMN IF NOT EXISTS bagisci_kategori TEXT DEFAULT 'Genel Bağışçı'",
  "ALTER TABLE kurbanlar ADD COLUMN IF NOT EXISTS fiyat REAL DEFAULT 0",
  "UPDATE kurbanlar SET fiyat = alis_fiyati WHERE fiyat IS NULL OR fiyat = 0",
  "ALTER TABLE hisseler ADD COLUMN IF NOT EXISTS kurban_turu TEXT DEFAULT 'Udhiye'",
  "ALTER TABLE hisseler ADD COLUMN IF NOT EXISTS vekalet_onay INTEGER DEFAULT 0",
  "ALTER TABLE hisseler ADD COLUMN IF NOT EXISTS vekalet_tarihi TIMESTAMP",
  "ALTER TABLE hisseler ADD COLUMN IF NOT EXISTS video_url TEXT",
  "ALTER TABLE hisseler ADD COLUMN IF NOT EXISTS video_public_id TEXT",
  "ALTER TABLE organizasyonlar ADD COLUMN IF NOT EXISTS su_kuyusu_konum TEXT",
  "ALTER TABLE organizasyonlar ADD COLUMN IF NOT EXISTS su_kuyusu_fiyat REAL DEFAULT 0",
  "ALTER TABLE organizasyonlar ADD COLUMN IF NOT EXISTS su_kuyusu_durum TEXT DEFAULT 'devam_ediyor'",
  "ALTER TABLE organizasyonlar ADD COLUMN IF NOT EXISTS su_kuyusu_renk TEXT DEFAULT '#f59e0b'",
  "ALTER TABLE organizasyonlar ADD COLUMN IF NOT EXISTS yardim_turu TEXT",
  "ALTER TABLE organizasyonlar ADD COLUMN IF NOT EXISTS yardim_bolgeler TEXT",
  "ALTER TABLE organizasyonlar ADD COLUMN IF NOT EXISTS yardim_adi TEXT",
  "ALTER TABLE organizasyonlar ADD COLUMN IF NOT EXISTS etkinlik_adi TEXT",
  "ALTER TABLE organizasyonlar ADD COLUMN IF NOT EXISTS etkinlik_turu TEXT",
  "ALTER TABLE destek_talepleri ADD COLUMN IF NOT EXISTS kullanici_id INTEGER DEFAULT 1",
  "ALTER TABLE destek_talepleri ADD COLUMN IF NOT EXISTS baslik TEXT",
  "ALTER TABLE destek_talepleri ADD COLUMN IF NOT EXISTS icerik TEXT",
  "ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS kurulus_tipi TEXT",
  "ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS sistem_modu TEXT DEFAULT 'dernek'",
  "ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS sektor_sablonu TEXT DEFAULT 'dernek'",
  "ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS aktif_moduller TEXT DEFAULT '{}'",
  "ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'demo'",
  "ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS kayit_ip TEXT",
  "ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS son_ip TEXT",
  "ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS son_giris TEXT",
];

function ensureColumn(wrapper, tableName, columnName, definition) {
  try {
    const columns = wrapper.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some(col => col.name === columnName)) {
      wrapper.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  } catch (e) {}
}

function getBaseDir(config) {
  return config.dataDir;
}

let _db = null;
let _manager = null;

async function getDb(config = {}) {
  if (_db && (!config.forceRefresh || _manager?.dialect === config.forceRefresh)) return _db;

  const dataDir = config.dataDir || getBaseDir(config);
  const dbPath = config.dbPath || path.join(dataDir, config.sqliteFileName || 'defterdar-stk.db');
  const manager = await createDbManager({
    dataDir,
    dbPath,
    sqliteFileName: config.sqliteFileName || 'defterdar-stk.db',
    postgresConfig: config.postgresConfig || getPostgresConfig(),
  });

  _manager = manager;
  const wrapper = new DbWrapper(manager);

  SCHEMA.split(';').map(s => s.trim()).filter(Boolean).forEach(stmt => {
    try {
      wrapper.exec(stmt);
    } catch (e) {
      // ignore schema errors during bootstrap
    }
  });

  UHREVI_SCHEMA.split(';').map(s => s.trim()).filter(Boolean).forEach(stmt => {
    try { wrapper.exec(stmt); } catch (e) {}
  });

  MIGRATIONS.forEach(stmt => {
    try {
      wrapper.exec(stmt);
    } catch (e) {}
  });

  if (manager.dialect === 'sqlite') {
    try {
      ensureColumn(wrapper, 'ayarlar', 'icder_sifre', "TEXT DEFAULT '571571'");
    } catch (e) {}
    try {
      ensureColumn(wrapper, 'kurbanlar', 'fiyat', 'REAL DEFAULT 0');
    } catch (e) {}
  }

  if (manager.dialect === 'sqlite' && fs.existsSync(dbPath)) {
    try {
      const { export: exportDb } = wrapper;
      exportDb();
    } catch (e) {}
  }

  try {
    const defaultPassword = 'defterdar123';
    const userCheck = wrapper.prepare('SELECT id, sifre_hash FROM kullanicilar WHERE id=1').get();
    if (!userCheck) {
      const hash = bcrypt.hashSync(defaultPassword, 10);
      wrapper.prepare("INSERT INTO kullanicilar (id, kullanici_adi, email, sifre_hash, plan) VALUES (1, 'defterdar', 'defterdar@kurban.com', ?, 'demo')").run(hash);
    } else if (!userCheck.sifre_hash || userCheck.sifre_hash === 'dummy' || userCheck.sifre_hash === 'defterdar') {
      const hash = bcrypt.hashSync(defaultPassword, 10);
      wrapper.prepare('UPDATE kullanicilar SET kullanici_adi=?, email=?, sifre_hash=? WHERE id=1').run('defterdar', 'defterdar@kurban.com', hash);
    }
  } catch (e) {}

  try {
    const ayarCheck = wrapper.prepare('SELECT id FROM ayarlar WHERE kullanici_id=1').get();
    if (!ayarCheck) {
      wrapper.prepare("INSERT INTO ayarlar (kullanici_id, kurulum_tamamlandi) VALUES (1, 0)").run();
    }
  } catch (e) {}

  try {
    const sistemCheck = wrapper.prepare("SELECT id FROM sistem_ayarlari WHERE anahtar='sistem_modu'").get();
    if (!sistemCheck) {
      wrapper.prepare("INSERT INTO sistem_ayarlari (anahtar, deger) VALUES ('admin_sifre', 'BeYA0411')").run();
      wrapper.prepare("INSERT INTO sistem_ayarlari (anahtar, deger) VALUES ('sistem_modu', 'acik')").run();
      wrapper.prepare("INSERT INTO sistem_ayarlari (anahtar, deger) VALUES ('sistem_notu', '')").run();
      wrapper.prepare("INSERT INTO sistem_ayarlari (anahtar, deger) VALUES ('oto_yedek_aktif', '1')").run();
      wrapper.prepare("INSERT INTO sistem_ayarlari (anahtar, deger) VALUES ('oto_yedek_dakima', '10')").run();
    }
  } catch (e) {}

  try {
    const giderSayisi = wrapper.prepare('SELECT COUNT(*) as c FROM kasa_gider_kalemleri WHERE aktif=1').get();
    if (!giderSayisi || Number(giderSayisi.c) === 0) {
      const giderler = [
        ['Ofis Kirası','kira',0],['Elektrik Faturası','fatura',0],['Su Faturası','fatura',0],
        ['İnternet Faturası','fatura',0],['Yakıt','yakıt',0],['Kırtasiye','kırtasiye',0],
        ['Temizlik Malzemesi','temizlik',0],['Yemek / İkram','yemek',0],['Ulaşım','ulaşım',0],
        ['Bakım / Onarım','diger',0],['Diğer Gider','diger',0]
      ];
      giderler.forEach(([ad, kat, tutar]) => {
        try { wrapper.prepare('INSERT INTO kasa_gider_kalemleri (ad,kategori,varsayilan_tutar) VALUES (?,?,?)').run(ad, kat, tutar); } catch(e) {}
      });
    }
  } catch (e) {}

  try {
    const gelirSayisi = wrapper.prepare('SELECT COUNT(*) as c FROM kasa_gelir_kalemleri WHERE aktif=1').get();
    if (!gelirSayisi || Number(gelirSayisi.c) === 0) {
      const gelirler = [
        ['Bağış Geliri','bagis',0],['Kurban Organizasyonu','organizasyon',0],['Su Kuyusu Organizasyonu','organizasyon',0],
        ['Kira Geliri','kira_geliri',0],['Hibe / Destek','hibe',0],['Proje Geliri','diger',0],['Diğer Gelir','diger',0]
      ];
      gelirler.forEach(([ad, kat, tutar]) => {
        try { wrapper.prepare('INSERT INTO kasa_gelir_kalemleri (ad,kategori,varsayilan_tutar) VALUES (?,?,?)').run(ad, kat, tutar); } catch(e) {}
      });
    }
  } catch (e) {}

  _db = wrapper;
  return wrapper;
}

module.exports = { getDb, getPostgresConfig, getBaseDir };
