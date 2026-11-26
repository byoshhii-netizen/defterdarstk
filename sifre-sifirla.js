'use strict';
// Yönetici (admin) şifresini sıfırlama aracı — yalnızca yerel SQLite veritabanı için.
// Kullanım:  node sifre-sifirla.js [yeni-sifre]
// Örnek:     node sifre-sifirla.js Defterdar2026
// Şifre verilmezse varsayılan "Defterdar2026" kullanılır. İlk girişte değiştirmeniz istenir.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sifre = process.argv[2] || 'Defterdar2026';

function veriKlasoru() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { if (fs.existsSync('/data')) { fs.accessSync('/data', fs.constants.W_OK); return '/data'; } } catch (e) { /* */ }
  return path.join(__dirname, 'data');
}
const DB_YOLU = path.join(veriKlasoru(), 'defterdar.db');
if (!fs.existsSync(DB_YOLU)) {
  console.error('Veritabanı bulunamadı:', DB_YOLU);
  console.error('Önce uygulamayı bir kez çalıştırın (npm start), sonra bu aracı kullanın.');
  process.exit(1);
}

let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); }
catch (e) { console.error('node:sqlite yok. Node.js 22.13+ gerekir. PostgreSQL kullanıyorsanız bu araç çalışmaz.'); process.exit(1); }

// Pepper gerektirmeyen s1 biçiminde scrypt özeti (sunucu anahtarından bağımsız)
const salt = crypto.randomBytes(16);
const oz = crypto.scryptSync(Buffer.from(String(sifre), 'utf8'), salt, 32, { N: 32768, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
const hash = ['s1', 32768, 8, 1, salt.toString('base64'), oz.toString('base64')].join('$');

const db = new DatabaseSync(DB_YOLU);
const row = db.prepare("SELECT id FROM adminler WHERE kullanici_adi='admin'").get();
if (row) {
  db.prepare("UPDATE adminler SET sifre_hash=?, varsayilan_sifre=1, basarisiz_deneme=0, kilit_bitis=0, durum='aktif' WHERE kullanici_adi='admin'").run(hash);
  console.log("'admin' kullanıcısının şifresi güncellendi.");
} else {
  db.prepare("INSERT INTO adminler (kullanici_adi, ad_soyad, sifre_hash, rol, varsayilan_sifre) VALUES ('admin', 'Sistem Yöneticisi', ?, 'super', 1)").run(hash);
  console.log("'admin' kullanıcısı oluşturuldu.");
}
db.close();
console.log('\n  Adres        : /sadmin');
console.log('  Kullanıcı adı: admin');
console.log('  Şifre        : ' + sifre);
console.log('\nİlk girişte yeni bir şifre belirlemeniz istenecek.');
