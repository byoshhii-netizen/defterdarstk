'use strict';
// Defterdar veritabanı şeması. Tüm kiracı tabloları hesap_id ile ayrılır.

const TABLOLAR = `
CREATE TABLE IF NOT EXISTS sistem_ayarlari (anahtar TEXT PRIMARY KEY, deger TEXT);

CREATE TABLE IF NOT EXISTS hesaplar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad TEXT NOT NULL, tur TEXT NOT NULL DEFAULT 'stk', alt_tur TEXT,
  vergi_no TEXT, vergi_dairesi TEXT, telefon TEXT, eposta TEXT, adres TEXT, il TEXT, web TEXT,
  logo_data TEXT, bayrak_data TEXT,
  profil_json TEXT DEFAULT '{}', moduller_json TEXT DEFAULT '{}',
  para_birimi TEXT DEFAULT 'TRY', durum TEXT DEFAULT 'aktif', plan TEXT DEFAULT 'standart',
  kullanici_limiti INTEGER DEFAULT 25, admin_notu TEXT, personel_pin TEXT, entegrasyon_json TEXT DEFAULT '{}',
  olusturma TEXT DEFAULT (datetime('now')), son_aktivite TEXT
);

CREATE TABLE IF NOT EXISTS kullanicilar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hesap_id INTEGER NOT NULL REFERENCES hesaplar(id) ON DELETE CASCADE,
  ad_soyad TEXT NOT NULL, eposta TEXT NOT NULL UNIQUE, telefon TEXT,
  sifre_hash TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'sahip', durum TEXT DEFAULT 'aktif',
  son_giris TEXT, basarisiz_deneme INTEGER DEFAULT 0, kilit_bitis INTEGER DEFAULT 0,
  sifre_degisim TEXT, tercih_json TEXT DEFAULT '{}', hassas_pin TEXT,
  olusturma TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_kul_hesap ON kullanicilar(hesap_id);

CREATE TABLE IF NOT EXISTS adminler (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_adi TEXT NOT NULL UNIQUE, ad_soyad TEXT, eposta TEXT,
  sifre_hash TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'super', durum TEXT DEFAULT 'aktif',
  totp_sir TEXT, totp_aktif INTEGER DEFAULT 0, varsayilan_sifre INTEGER DEFAULT 0,
  son_giris TEXT, son_ip TEXT, basarisiz_deneme INTEGER DEFAULT 0, kilit_bitis INTEGER DEFAULT 0,
  olusturma TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oturumlar (
  id TEXT PRIMARY KEY, tip TEXT NOT NULL, sahip_id INTEGER NOT NULL, hesap_id INTEGER,
  csrf TEXT NOT NULL, ip TEXT, tarayici TEXT, gecici INTEGER DEFAULT 0, taklit_admin_id INTEGER,
  olusturma INTEGER NOT NULL, son_erisim INTEGER NOT NULL, bitis INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_otr_sahip ON oturumlar(tip, sahip_id);

CREATE TABLE IF NOT EXISTS giris_kayitlari (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tip TEXT, kimlik TEXT, ip TEXT, tarayici TEXT,
  basarili INTEGER, neden TEXT, tarih TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ip_engelleri (
  ip TEXT PRIMARY KEY, neden TEXT, bitis INTEGER, olusturma TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS denetim (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER, kullanici_id INTEGER, admin_id INTEGER,
  kim TEXT, islem TEXT NOT NULL, hedef TEXT, detay TEXT, ip TEXT, tarih TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_den_hesap ON denetim(hesap_id, id);

CREATE TABLE IF NOT EXISTS modul_kullanim (
  hesap_id INTEGER, kullanici_id INTEGER, modul TEXT, sayi REAL DEFAULT 0, son INTEGER,
  PRIMARY KEY (hesap_id, kullanici_id, modul)
);

CREATE TABLE IF NOT EXISTS duyurular (
  id INTEGER PRIMARY KEY AUTOINCREMENT, baslik TEXT NOT NULL, icerik TEXT, seviye TEXT DEFAULT 'bilgi',
  hedef_tur TEXT DEFAULT 'hepsi', aktif INTEGER DEFAULT 1, baslangic TEXT, bitis TEXT,
  olusturma TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS destek_talepleri (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, kullanici_id INTEGER,
  konu TEXT NOT NULL, kategori TEXT DEFAULT 'Genel', oncelik TEXT DEFAULT 'normal', durum TEXT DEFAULT 'acik',
  admin_okundu INTEGER DEFAULT 0, kullanici_okundu INTEGER DEFAULT 1,
  olusturma TEXT DEFAULT (datetime('now')), guncelleme TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS destek_mesajlari (
  id INTEGER PRIMARY KEY AUTOINCREMENT, talep_id INTEGER NOT NULL REFERENCES destek_talepleri(id) ON DELETE CASCADE,
  gonderen TEXT NOT NULL, gonderen_ad TEXT, icerik TEXT NOT NULL, tarih TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cop_kutusu (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, tur TEXT NOT NULL, baslik TEXT,
  veri TEXT NOT NULL, silen TEXT, silme_tarihi TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_cop_hesap ON cop_kutusu(hesap_id);

CREATE TABLE IF NOT EXISTS sayaclar (
  hesap_id INTEGER NOT NULL, anahtar TEXT NOT NULL, deger INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (hesap_id, anahtar)
);

CREATE TABLE IF NOT EXISTS kategoriler (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, tip TEXT NOT NULL, ad TEXT NOT NULL,
  varsayilan_tutar REAL DEFAULT 0, aktif INTEGER DEFAULT 1, sira INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_kat_hesap ON kategoriler(hesap_id, tip);

-- ─── KURBAN ───
CREATE TABLE IF NOT EXISTS organizasyonlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL,
  ad TEXT NOT NULL, yil INTEGER NOT NULL, max_kurban INTEGER NOT NULL DEFAULT 100,
  buyukbas_hisse_fiyati REAL DEFAULT 0, kucukbas_hisse_fiyati REAL DEFAULT 0,
  finans_hesap_id INTEGER, aciklama TEXT, aktif INTEGER DEFAULT 1, olusturma TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_org_hesap ON organizasyonlar(hesap_id);
CREATE TABLE IF NOT EXISTS kurbanlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, organizasyon_id INTEGER NOT NULL,
  kurban_no INTEGER NOT NULL, tur TEXT NOT NULL, kurban_turu TEXT DEFAULT 'Udhiye', kesen_kisi TEXT,
  kucukbas_sayi INTEGER DEFAULT 1, kupe_no TEXT, alis_fiyati REAL DEFAULT 0, fiyat REAL DEFAULT 0,
  toplam_hisse INTEGER NOT NULL, kesildi INTEGER DEFAULT 0, kesim_tarihi TEXT, aciklama TEXT,
  olusturma TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_kurban_org ON kurbanlar(organizasyon_id);
CREATE TABLE IF NOT EXISTS hisseler (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, kurban_id INTEGER NOT NULL,
  hisse_no INTEGER NOT NULL, bagisci_adi TEXT, bagisci_telefon TEXT, bagisci_kategori TEXT DEFAULT 'Genel Bağışçı',
  kimin_adina TEXT, kimin_adina_telefon TEXT, odeme_durumu TEXT DEFAULT 'bekliyor', odenen_tutar REAL DEFAULT 0,
  video_ister INTEGER DEFAULT 0, aciklama TEXT, kurban_turu TEXT DEFAULT 'Udhiye',
  vekalet_onay INTEGER DEFAULT 0, vekalet_tarihi TEXT, video_url TEXT, video_public_id TEXT,
  olusturma TEXT DEFAULT (datetime('now')), guncelleme TEXT
);
CREATE INDEX IF NOT EXISTS ix_hisse_kurban ON hisseler(kurban_id);
CREATE TABLE IF NOT EXISTS bayraklar (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, ad TEXT NOT NULL, resim_data TEXT NOT NULL,
  olusturma TEXT DEFAULT (datetime('now'))
);

-- ─── GENEL KAYIT MOTORU ───
CREATE TABLE IF NOT EXISTS kayitlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, modul TEXT NOT NULL,
  veri TEXT NOT NULL DEFAULT '{}', baslik TEXT, olusturan INTEGER,
  olusturma TEXT DEFAULT (datetime('now')), guncelleme TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_kayit ON kayitlar(hesap_id, modul, id);

CREATE TABLE IF NOT EXISTS kayitli_gorunumler (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, kullanici_id INTEGER, modul TEXT NOT NULL,
  ad TEXT NOT NULL, filtre_json TEXT NOT NULL, olusturma TEXT DEFAULT (datetime('now'))
);

-- ─── FİNANS ───
CREATE TABLE IF NOT EXISTS finans_hesaplari (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, ad TEXT NOT NULL, tur TEXT NOT NULL DEFAULT 'kasa',
  banka_adi TEXT, sube TEXT, iban TEXT, para_birimi TEXT DEFAULT 'TRY', acilis_bakiye REAL DEFAULT 0,
  aktif INTEGER DEFAULT 1, olusturma TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS finans_hareketleri (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, finans_hesap_id INTEGER NOT NULL,
  tarih TEXT NOT NULL, yon TEXT NOT NULL, tutar REAL NOT NULL, kategori TEXT, aciklama TEXT,
  cari_id INTEGER, belge_no TEXT, kaynak TEXT, kaynak_id INTEGER, transfer_id TEXT,
  belge_data TEXT, belge_adi TEXT, olusturan INTEGER, olusturma TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_fh_hesap ON finans_hareketleri(hesap_id, finans_hesap_id, tarih);
CREATE INDEX IF NOT EXISTS ix_fh_kaynak ON finans_hareketleri(hesap_id, kaynak, kaynak_id);

CREATE TABLE IF NOT EXISTS cariler (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, tur TEXT DEFAULT 'musteri', kod TEXT,
  unvan TEXT NOT NULL, yetkili TEXT, vergi_no TEXT, vergi_dairesi TEXT, tc_no TEXT,
  telefon TEXT, eposta TEXT, adres TEXT, il TEXT, iban TEXT, risk_limiti REAL DEFAULT 0,
  vade_gun INTEGER DEFAULT 0, etiketler TEXT, notlar TEXT, aktif INTEGER DEFAULT 1,
  olusturma TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_cari_hesap ON cariler(hesap_id);
CREATE TABLE IF NOT EXISTS cari_hareketleri (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, cari_id INTEGER NOT NULL,
  tarih TEXT NOT NULL, vade TEXT, tur TEXT NOT NULL, borc REAL DEFAULT 0, alacak REAL DEFAULT 0,
  aciklama TEXT, belge_no TEXT, kaynak TEXT, kaynak_id INTEGER, olusturma TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_ch ON cari_hareketleri(hesap_id, cari_id, tarih);
CREATE INDEX IF NOT EXISTS ix_ch_kaynak ON cari_hareketleri(hesap_id, kaynak, kaynak_id);

CREATE TABLE IF NOT EXISTS urunler (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, kod TEXT, barkod TEXT, ad TEXT NOT NULL,
  kategori TEXT, tip TEXT DEFAULT 'urun', birim TEXT DEFAULT 'Adet', alis_fiyati REAL DEFAULT 0, satis_fiyati REAL DEFAULT 0,
  kdv_orani REAL DEFAULT 20, stok_takip INTEGER DEFAULT 1, kritik_stok REAL DEFAULT 0, depo TEXT,
  aciklama TEXT, aktif INTEGER DEFAULT 1, olusturma TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS stok_hareketleri (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, urun_id INTEGER NOT NULL,
  tarih TEXT NOT NULL, miktar REAL NOT NULL, birim_fiyat REAL DEFAULT 0, tur TEXT NOT NULL,
  aciklama TEXT, kaynak TEXT, kaynak_id INTEGER, olusturma TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_sh ON stok_hareketleri(hesap_id, urun_id);

CREATE TABLE IF NOT EXISTS belgeler (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, tip TEXT NOT NULL, no TEXT,
  cari_id INTEGER, tarih TEXT NOT NULL, vade TEXT, para_birimi TEXT DEFAULT 'TRY', durum TEXT DEFAULT 'acik',
  kalemler TEXT NOT NULL DEFAULT '[]', ara_toplam REAL DEFAULT 0, iskonto REAL DEFAULT 0,
  kdv_toplam REAL DEFAULT 0, tevkifat REAL DEFAULT 0, genel_toplam REAL DEFAULT 0, odenen REAL DEFAULT 0,
  notlar TEXT, donusen_id INTEGER, kaynak_id INTEGER, olusturan INTEGER,
  olusturma TEXT DEFAULT (datetime('now')), guncelleme TEXT
);
CREATE INDEX IF NOT EXISTS ix_belge ON belgeler(hesap_id, tip, tarih);

CREATE TABLE IF NOT EXISTS cek_senet (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, tur TEXT NOT NULL DEFAULT 'cek', yon TEXT NOT NULL DEFAULT 'alinan',
  no TEXT, banka TEXT, sube TEXT, cari_id INTEGER, borclu TEXT, tutar REAL NOT NULL, duzenleme TEXT, vade TEXT NOT NULL,
  durum TEXT DEFAULT 'portfoy', finans_hesap_id INTEGER, aciklama TEXT, olusturma TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS butce (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, yil INTEGER NOT NULL, ay INTEGER NOT NULL,
  tip TEXT NOT NULL, kategori TEXT NOT NULL, tutar REAL NOT NULL DEFAULT 0,
  UNIQUE(hesap_id, yil, ay, tip, kategori)
);

-- ─── PERSONEL ───
CREATE TABLE IF NOT EXISTS personeller (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, ad TEXT NOT NULL, soyad TEXT NOT NULL,
  tc_no TEXT, dogum_tarihi TEXT, telefon TEXT, eposta TEXT, adres TEXT, pozisyon TEXT, departman TEXT,
  ise_baslama TEXT, isten_cikis TEXT, maas REAL DEFAULT 0, iban TEXT, banka TEXT, acil_kisi TEXT, acil_telefon TEXT,
  izin_hakki REAL DEFAULT 14, fotograf TEXT, notlar TEXT, aktif INTEGER DEFAULT 1, olusturma TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS personel_kayitlari (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, personel_id INTEGER NOT NULL,
  tur TEXT NOT NULL, tarih TEXT, bitis TEXT, ay TEXT, tutar REAL DEFAULT 0, gun REAL DEFAULT 0,
  alt_tur TEXT, baslik TEXT, aciklama TEXT, odendi INTEGER DEFAULT 0, odeme_tarihi TEXT,
  olusturma TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_pk ON personel_kayitlari(hesap_id, personel_id, tur);

-- ─── İLETİŞİM / MEDYA ───
CREATE TABLE IF NOT EXISTS sms_sablonlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, ad TEXT NOT NULL, icerik TEXT NOT NULL,
  olusturma TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sms_loglar (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, alici_adi TEXT, telefon TEXT NOT NULL,
  mesaj TEXT NOT NULL, durum TEXT, kod TEXT, tarih TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS medya (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hesap_id INTEGER NOT NULL, ad TEXT, tur TEXT, mime TEXT, boyut INTEGER,
  depolama TEXT DEFAULT 'yerel', yol TEXT, public_id TEXT, url TEXT, klasor TEXT DEFAULT 'genel',
  bagli_tur TEXT, bagli_id INTEGER, olusturma TEXT DEFAULT (datetime('now'))
);
`;

// ─── Şema uygulama ve onarım ───────────────────────────────────────────────
// İfadeler tek tek çalıştırılır: bir hata olursa hangi tablo olduğu anlaşılır ve
// başarılı olanlar geri alınmaz. Tablolar oluşturulduktan sonra eski kurulumlardan
// kalmış olabilecek eksik kolonlar tamamlanır, indeksler en son eklenir.
function ifadeleriAyir(sema) {
  const parcalar = [];
  let derinlik = 0, tirnak = false, buf = '';
  for (const ch of sema.replace(/--[^\n]*/g, '')) {
    if (ch === "'") tirnak = !tirnak;
    if (!tirnak) { if (ch === '(') derinlik++; else if (ch === ')') derinlik--; }
    if (ch === ';' && !tirnak && derinlik === 0) { if (buf.trim()) parcalar.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) parcalar.push(buf.trim());
  return parcalar;
}

function ustSeviyeAyir(govde) {
  const parcalar = [];
  let derinlik = 0, tirnak = false, buf = '';
  for (const ch of govde) {
    if (ch === "'") tirnak = !tirnak;
    if (!tirnak) { if (ch === '(') derinlik++; else if (ch === ')') derinlik--; }
    if (ch === ',' && !tirnak && derinlik === 0) { parcalar.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) parcalar.push(buf.trim());
  return parcalar;
}

const KISIT = /^(unique|primary|foreign|check|constraint)$/i;
function kolonListesi(metin) { return metin.replace(/\s+/g, '').split(',').filter(Boolean).sort().join(','); }
function tabloTanimi(ifade) {
  const bas = ifade.match(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)\s*\(/i);
  if (!bas) return null;
  const govde = ifade.slice(bas[0].length, ifade.lastIndexOf(')'));
  const kolonlar = [];
  for (const parca of ustSeviyeAyir(govde)) {
    const ad = (parca.split(/\s+/)[0] || '').trim();
    if (!/^[a-z_]+$/.test(ad) || KISIT.test(ad)) continue;
    kolonlar.push({ ad, tanim: parca.replace(/\s+/g, ' ').trim() });
  }
  // Benzersizlik kısıtları: ON CONFLICT ifadelerinin çalışması bunlara bağlıdır
  const benzersiz = [];
  for (const parca of ustSeviyeAyir(govde)) {
    const cok = parca.match(/^(?:UNIQUE|PRIMARY KEY)\s*\(([^)]+)\)/i);
    if (cok) { benzersiz.push(kolonListesi(cok[1])); continue; }
    const tek = parca.match(/^([a-z_]+)\s+[^(]*\b(?:UNIQUE|PRIMARY KEY)\b/i);
    if (tek && !KISIT.test(tek[1])) benzersiz.push(tek[1]);
  }
  return { ad: bas[1], kolonlar, benzersiz };
}

// Var olan bir tabloya sonradan eklenecek kolon tanımı: NOT NULL kaldırılır (eski
// satırlar için değer yoktur), SQLite sabit olmayan varsayılanı kabul etmez.
function eklemeTanimi(tanim, motor) {
  let t = tanim.replace(/\bNOT NULL\b/ig, ' ').replace(/\bUNIQUE\b/ig, ' ');
  if (motor !== 'postgresql') t = t.replace(/DEFAULT\s*\(datetime\('now'\)\)/ig, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

// Tabloda hâlihazırda bulunan benzersiz indekslerin kolon listeleri
function benzersizIndeksler(db, tablo) {
  try {
    if (db.motor === 'postgresql') {
      return db.prepare('SELECT indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename=?').all(tablo)
        .filter(x => /CREATE UNIQUE/i.test(x.indexdef))
        .map(x => kolonListesi(x.indexdef.slice(x.indexdef.lastIndexOf('(') + 1, x.indexdef.lastIndexOf(')'))));
    }
    return db.prepare(`PRAGMA index_list(${tablo})`).all().filter(i => i.unique)
      .map(i => kolonListesi(db.prepare(`PRAGMA index_info(${i.name})`).all().map(c => c.name).join(',')));
  } catch (e) { return []; }
}

function kisitlariTamamla(db, t) {
  const var_ = benzersizIndeksler(db, t.ad);
  for (const kolonlar of t.benzersiz || []) {
    if (var_.includes(kolonlar)) continue;
    const ad = `uq_${t.ad}_${kolonlar.replace(/,/g, '_')}`.slice(0, 60);
    try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${ad} ON ${t.ad}(${kolonlar})`); console.log(`[ŞEMA] Benzersizlik kısıtı eklendi: ${t.ad}(${kolonlar})`); }
    catch (e) { console.error(`[ŞEMA] ${t.ad}(${kolonlar}) benzersizlik kısıtı eklenemedi: ${e.message}`); }
  }
}

function kolonlariTamamla(db, tablolar) {
  const eklenen = [];
  for (const t of tablolar) {
    let mevcut;
    try { mevcut = db.kolonlar(t.ad); } catch (e) { continue; }
    if (!mevcut || !mevcut.length) continue;
    let onarildi = false;
    for (const k of t.kolonlar) {
      if (mevcut.includes(k.ad) || /PRIMARY KEY/i.test(k.tanim)) continue;
      try { db.exec(`ALTER TABLE ${t.ad} ADD COLUMN ${eklemeTanimi(k.tanim, db.motor)}`); eklenen.push(`${t.ad}.${k.ad}`); onarildi = true; }
      catch (e) { console.error(`[ŞEMA] ${t.ad}.${k.ad} eklenemedi: ${e.message}`); }
    }
    // Yalnızca onarılan (eski sürümden kalan) tablolarda kısıtları da denetle
    if (onarildi) kisitlariTamamla(db, t);
  }
  if (eklenen.length) console.log('[ŞEMA] Eksik kolonlar tamamlandı:', eklenen.join(', '));
}

// Eski sürümden kalan, artık kullanılmayan zorunlu kolonlar yeni kayıtları engeller:
// bunları isteğe bağlı hale getiririz (veri silinmez).
const AD = /^[a-z_][a-z0-9_]*$/i;
function zorunluluklariGevset(db, tablolar) {
  if (db.motor !== 'postgresql') return;
  let satirlar;
  try {
    satirlar = db.prepare("SELECT table_name AS tablo, column_name AS kolon FROM information_schema.columns WHERE table_schema=current_schema() AND is_nullable='NO' AND column_default IS NULL AND is_identity='NO'").all();
  } catch (e) { return; }
  const bilinen = new Map(tablolar.map(t => [t.ad, new Set(t.kolonlar.map(k => k.ad))]));
  const gevsek = [];
  for (const s of satirlar) {
    const kolonlar = bilinen.get(s.tablo);
    if (!kolonlar || kolonlar.has(s.kolon) || !AD.test(s.tablo) || !AD.test(s.kolon)) continue;
    try { db.exec(`ALTER TABLE ${s.tablo} ALTER COLUMN ${s.kolon} DROP NOT NULL`); gevsek.push(`${s.tablo}.${s.kolon}`); }
    catch (e) { console.error(`[ŞEMA] ${s.tablo}.${s.kolon} isteğe bağlı yapılamadı: ${e.message}`); }
  }
  if (gevsek.length) console.log('[ŞEMA] Eski sürümden kalan zorunlu kolonlar isteğe bağlı yapıldı:', gevsek.join(', '));
}

function calistir(db, ifade) {
  try { db.exec(ifade); } catch (e) {
    const ad = (ifade.match(/CREATE (?:TABLE|INDEX)(?: IF NOT EXISTS)?\s+([a-z_]+)/i) || [, 'bilinmeyen'])[1];
    const hata = new Error(`Şema uygulanamadı (${ad}): ${e.message}`);
    hata.sql = ifade.slice(0, 200);
    throw hata;
  }
}

function uygula(db) {
  const ifadeler = ifadeleriAyir(TABLOLAR);
  const tablolar = [];
  // 1) Tablolar
  for (const ifade of ifadeler) {
    if (!/^CREATE TABLE/i.test(ifade)) continue;
    calistir(db, ifade);
    const t = tabloTanimi(ifade);
    if (t) tablolar.push(t);
  }
  // 2) Eski kurulumlardan kalan eksik kolonlar ve kullanılmayan zorunluluklar
  kolonlariTamamla(db, tablolar);
  zorunluluklariGevset(db, tablolar);
  // 3) İndeksler: yalnızca hız içindir, biri oluşmazsa uygulama yine de açılır
  for (const ifade of ifadeler) {
    if (/^CREATE TABLE/i.test(ifade)) continue;
    try { db.exec(ifade); } catch (e) { console.error('[ŞEMA] İndeks atlandı:', e.message); }
  }

  // Varsayılan sistem ayarları
  const ayar = db.prepare('INSERT OR IGNORE INTO sistem_ayarlari (anahtar, deger) VALUES (?, ?)');
  [
    ['sistem_modu', 'acik'], ['sistem_notu', ''], ['kayit_acik', '1'], ['site_adi', 'Defterdar'],
    ['oturum_suresi_saat', '12'], ['admin_oturum_dakika', '60'], ['oto_yedek_aktif', '1'], ['oto_yedek_saat', '6'],
    ['oto_yedek_sakla', '30'], ['izinli_ipler', ''], ['admin_izinli_ipler', ''], ['devre_disi_moduller', '[]'],
  ].forEach(([a, d]) => ayar.run(a, d));

  // İlk yönetici: şifre kaynak kodda açık metin olarak tutulmaz.
  // Aşağıdaki değer, varsayılan şifrenin yüksek maliyetli scrypt özetidir (geri çevrilemez).
  // Panelden ilk değişiklikte sunucuya özel gizli anahtarla yeniden özetlenir.
  const var_ = db.prepare('SELECT COUNT(*) AS c FROM adminler').get();
  if (!var_ || !var_.c) {
    const TOHUM = ['s1', '131072', '8', '1', 'I329e8+XUKt5JETQ1o1SHg==', 'qgK92V+HT8w8wTyGR51Z5w7AckvKB+odr8z1XkWB3o8='].join('$');
    db.prepare("INSERT INTO adminler (kullanici_adi, ad_soyad, sifre_hash, rol, varsayilan_sifre) VALUES ('admin', 'Sistem Yöneticisi', ?, 'super', 1)").run(TOHUM);
  }
}

module.exports = { uygula };
