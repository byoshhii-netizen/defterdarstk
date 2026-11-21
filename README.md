# Defterdar

Dernek, vakıf, şirket, muhasebe bürosu ve esnaf için çok kullanıcılı, çok kurumlu muhasebe ve yönetim sistemi. İÇDER Kurban Programı'nın tüm özelliklerini içerir ve üzerine ön muhasebe, STK ve yönetim modülleri ekler.

## Çalıştırma

Gereksinim: **Node.js 22.13 veya üstü** (yerleşik SQLite kullanılır, `npm install` gerekmez). PostgreSQL için yalnızca `DATABASE_URL` tanımlayın.

```bash
npm start            # http://localhost:4500
```

Node 20 veya Electron kullanacaksanız yedek veritabanı motoru için bir kez `npm install sql.js` çalıştırın.

- Uygulama: `http://localhost:4500` → `/kayit` ile kurum hesabı açın
- Yönetim paneli: `http://localhost:4500/sadmin` — kullanıcı adı `admin`, ilk şifre size iletilen varsayılan şifredir; ilk girişte değiştirmeniz istenir.

## Railway ve PostgreSQL

Defterdar iki veritabanı motoruyla çalışır: ortam değişkeninde `DATABASE_URL` varsa **PostgreSQL**, yoksa yerleşik **SQLite**. Ek paket gerekmez; PostgreSQL istemcisi uygulamanın içindedir (SCRAM-SHA-256, SSL destekli). Tablolar ilk açılışta otomatik oluşturulur.

Railway'e kurulum:

1. Projeyi GitHub'a yükleyin ve Railway'de **New Project → Deploy from GitHub repo** ile seçin. `railway.json` başlatma komutunu ve `/saglik` sağlık kontrolünü tanımlar.
2. Aynı projeye **New → Database → PostgreSQL** ekleyin.
3. Defterdar servisinin **Variables** bölümüne şunları girin:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `DEFTERDAR_ANAHTAR` = en az 32 karakterlik rastgele bir değer (`.env.ornek` içinde üretme komutu var). Tanımlamazsanız uygulama bir anahtar üretip veritabanında saklar ve yönetim panelinde uyarı gösterir.
   - İsteğe bağlı `CLOUDINARY_URL`: Railway diski kalıcı değildir; yüklenen logo/belge/fotoğrafların kaybolmaması için Cloudinary kullanın ya da servise bir **Volume** bağlayıp `DATA_DIR=/data` verin.
4. **Settings → Networking → Generate Domain** ile adres alın. `https://adresiniz/sadmin` ile yönetim paneline girip varsayılan şifreyi değiştirin.

Yedekleme PostgreSQL'de `.json.gz` biçimindedir: `/sadmin → Yedekler` bölümünden tam yedek indirilip aynı ekrandan anında geri yüklenebilir. Kurum bazlı yedekler iki motorda da aynı biçimdedir, yani SQLite'tan PostgreSQL'e taşınırken her kurumun yedeği yeni sunucuya yüklenebilir.

## Hesap türleri ve akıllı menü

Kayıtta hesap türü (STK, şirket, muhasebe bürosu, esnaf) ve faaliyet alanları seçilir. Her modülün puanı:

```
puan = 100 × tür uyumu + (seçili faaliyet ise +80, seçilmemişse −40) + 60 × (1 − e^(−k/6))
```

`k`, kullanıcının o modülü kullanma sayısının 14 günlük yarı ömürle sönümlenmiş hâlidir. Grup sırası yalnızca taban puana göre belirlenir (menü kullanırken zıplamaz); kullanım, grup içi sırayı ve "Diğer modüller"den ana menüye çıkışı belirler. Kullanıcı modülleri sabitleyebilir veya gizleyebilir (Ayarlar → Modüller ve menü). Panel bileşenleri de hesap türüne göre seçilir.

## Modüller

- **Kurban:** organizasyon, büyükbaş/küçükbaş, 7 hisse, hissedar otomatik tamamlama, vekalet ekranı, kesim videosu, toplu işlemler, İÇDER düzeninde yazdırma (Türk bayrağı, logo, ülke bayrağı), Excel, tahsilatın kasaya otomatik işlenmesi
- **Bağış ve sosyal yardım:** bağış + makbuz (yazıyla tutar), üye, aidat, yetim sponsorluğu, ihtiyaç sahibi, yardım dağıtımı, su kuyusu, kumbara, gönüllü
- **Satış ve cari:** cari hesap + ekstre, satış/alış/iade faturası (KDV, iskonto, stok düşümü), teklif → fatura, satış fırsatları
- **Finans:** kasa/banka/kredi kartı, gelir-gider, virman, belge ekleme, çek-senet, masraf, bütçe
- **Stok:** ürün/hizmet, stok hareketi, sayım, kritik stok, demirbaş (amortisman)
- **Müşavirlik:** mükellefler, beyanname takvimi
- **İK ve iş takibi:** personel (izin, devamsızlık, avans, maaş, toplu maaş, PIN koruması), proje, etkinlik, görev, karar defteri, evrak, partner
- **Raporlar:** gelir-gider, kâr-zarar, KDV, alacak/borç yaşlandırma, nakit akışı tahmini, bağış, stok
- **Sistem:** toplu SMS (Netgsm), medya deposu (Cloudinary veya sunucu), destek talepleri, çöp kutusu (geri yükleme), işlem geçmişi, kullanıcı ve rol yönetimi, kayıtlı görünümler, Ctrl+K genel arama, JSON yedek/geri yükleme, eski İÇDER yedeğini içe aktarma

## Türkçe adresler

`/panel`, `/kurban/:org/kurban/:id`, `/bagislar/yeni`, `/cariler/:id`, `/faturalar/yeni?tip=satis_fatura`, `/kasa-banka`, `/raporlar/kar-zarar`, `/personel/:id`, `/ayarlar/kullanicilar` … Yönetim: `/sadmin/hesaplar`, `/sadmin/guvenlik`, `/sadmin/sistem` …

## Güvenlik

- Kaynak kodda hiçbir şifre veya API anahtarı yok. Varsayılan yönetici şifresi yalnızca geri çevrilemez, yüksek maliyetli scrypt özeti olarak bulunur; ilk değişiklikte sunucuya özel gizli anahtarla (pepper) yeniden özetlenir ve değiştirilmeden panel açılmaz.
- Tüm şifreler scrypt + pepper; SMS ve Cloudinary sırları AES-256-GCM ile şifreli saklanır.
- Her kayıt `hesap_id` ile ayrılır; başka kurumun kaydına erişim 404 döner.
- Oturum çerezleri HttpOnly + SameSite (yönetimde Strict); tüm değişikliklerde CSRF jetonu ve köken kontrolü.
- Giriş kilidi (5 hatalı deneme), IP hız sınırı, yönetim paneline art arda hatalı girişte otomatik IP engeli, yönetici için TOTP iki adımlı doğrulama, yönetici IP kısıtlaması.
- Sıkı CSP (satır içi betik yok), X-Frame-Options, nosniff, HSTS (HTTPS'te); tüm çıktı kaçışlı şablonla üretilir.
- Yüklenen dosyaların türü içerikten doğrulanır; Excel çıktısında formül enjeksiyonu engellenir.
- Rol tabanlı yetki (sahip, yönetici, muhasebe, personel, salt okunur) ve değiştirilemez işlem geçmişi.

## Test

```bash
VARSAYILAN_SIFRE=<ilk yönetici şifresi> node test/api-test.js   # sunucu çalışırken, boş veritabanında
```
