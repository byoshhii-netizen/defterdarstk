'use strict';
// Modül kataloğu, hesap türü profilleri ve menü önceliklendirme algoritması.

const HESAP_TURLERI = {
  stk: {
    ad: 'Dernek, vakıf veya STK', kisa: 'STK',
    aciklama: 'Bağış, kurban, üye aidatı, yardım dağıtımı ve proje takibi öne çıkar.',
    faaliyetler: [
      ['kurban', 'Kurban organizasyonu'], ['bagis', 'Bağış toplama ve makbuz'], ['uyelik', 'Üye ve aidat takibi'],
      ['yetim', 'Yetim sponsorluğu'], ['yardim', 'İhtiyaç sahibi ve yardım dağıtımı'], ['su_kuyusu', 'Su kuyusu projeleri'],
      ['kumbara', 'Kumbara takibi'], ['gonullu', 'Gönüllü yönetimi'], ['proje', 'Proje yönetimi'], ['etkinlik', 'Etkinlik organizasyonu'],
      ['personel', 'Maaşlı personel'], ['stok', 'Ayni yardım deposu'], ['fatura', 'Fatura kesme ve alma'],
    ],
    varsayilan: ['kurban', 'bagis', 'uyelik', 'yardim', 'proje'],
  },
  sirket: {
    ad: 'Şirket veya KOBİ', kisa: 'Şirket',
    aciklama: 'Cari hesap, fatura, stok, kasa-banka, çek-senet ve satış takibi öne çıkar.',
    faaliyetler: [
      ['fatura', 'Satış ve alış faturaları'], ['stok', 'Stok ve ürün takibi'], ['teklif', 'Teklif hazırlama'],
      ['cek_senet', 'Çek ve senet'], ['crm', 'Satış fırsatları (CRM)'], ['masraf', 'Masraf yönetimi'],
      ['personel', 'Personel ve maaş'], ['proje', 'Proje bazlı takip'], ['demirbas', 'Demirbaş ve amortisman'],
    ],
    varsayilan: ['fatura', 'stok', 'teklif', 'masraf', 'personel'],
  },
  muhasebe: {
    ad: 'Muhasebe bürosu veya mali müşavir', kisa: 'Muhasebe',
    aciklama: 'Mükellef portföyü, beyanname takvimi, tahsilat ve büro finansı öne çıkar.',
    faaliyetler: [
      ['mukellef', 'Mükellef portföyü'], ['beyanname', 'Beyanname takvimi'], ['fatura', 'Hizmet faturası'],
      ['masraf', 'Büro masrafları'], ['personel', 'Büro personeli'], ['crm', 'Yeni müşteri adayları'], ['evrak', 'Evrak takibi'],
    ],
    varsayilan: ['mukellef', 'beyanname', 'fatura', 'masraf'],
  },
  esnaf: {
    ad: 'Esnaf veya serbest meslek', kisa: 'Esnaf',
    aciklama: 'Veresiye (cari), kasa, basit fatura ve stok öne çıkar; gereksiz ekranlar geri planda kalır.',
    faaliyetler: [
      ['fatura', 'Fatura kesme'], ['stok', 'Ürün ve stok'], ['masraf', 'Masraflar'], ['cek_senet', 'Çek ve senet'], ['personel', 'Çalışan'],
    ],
    varsayilan: ['fatura', 'stok', 'masraf'],
  },
};

const GRUPLAR = {
  genel: { ad: 'Genel', sira: 0 },
  kurban: { ad: 'Kurban', sira: 1 },
  stk: { ad: 'Bağış ve sosyal yardım', sira: 2 },
  satis: { ad: 'Satış ve cari', sira: 3 },
  finans: { ad: 'Finans', sira: 4 },
  stok: { ad: 'Stok', sira: 5 },
  buro: { ad: 'Müşavirlik', sira: 3 },
  ik: { ad: 'İnsan kaynakları', sira: 6 },
  isler: { ad: 'İş takibi', sira: 7 },
  rapor: { ad: 'Raporlar', sira: 8 },
  iletisim: { ad: 'İletişim', sira: 9 },
  sistem: { ad: 'Sistem', sira: 99 },
};

// afinite: hesap türüne göre temel uygunluk (0-1)
const A = (stk, sirket, muhasebe, esnaf) => ({ stk, sirket, muhasebe, esnaf });

const MODULLER = [
  { anahtar: 'panel', ad: 'Genel bakış', grup: 'genel', ikon: 'fa-gauge-high', rota: '/panel', sabit: true },
  { anahtar: 'kurban', ad: 'Kurban organizasyonları', grup: 'kurban', ikon: 'fa-cow', rota: '/kurban', faaliyet: 'kurban', afinite: A(.9, 0, 0, 0) },
  { anahtar: 'bagislar', ad: 'Bağışlar', grup: 'stk', ikon: 'fa-hand-holding-heart', rota: '/bagislar', faaliyet: 'bagis', afinite: A(.95, 0, 0, 0), genel: true },
  { anahtar: 'uyeler', ad: 'Üyeler', grup: 'stk', ikon: 'fa-id-badge', rota: '/uyeler', faaliyet: 'uyelik', afinite: A(.8, 0, 0, 0), genel: true },
  { anahtar: 'aidatlar', ad: 'Aidatlar', grup: 'stk', ikon: 'fa-calendar-check', rota: '/aidatlar', faaliyet: 'uyelik', afinite: A(.7, 0, 0, 0), genel: true },
  { anahtar: 'yetimler', ad: 'Yetim sponsorluğu', grup: 'stk', ikon: 'fa-child-reaching', rota: '/yetimler', faaliyet: 'yetim', afinite: A(.6, 0, 0, 0), genel: true },
  { anahtar: 'ihtiyac_sahipleri', ad: 'İhtiyaç sahipleri', grup: 'stk', ikon: 'fa-people-roof', rota: '/ihtiyac-sahipleri', faaliyet: 'yardim', afinite: A(.7, 0, 0, 0), genel: true },
  { anahtar: 'yardimlar', ad: 'Yardım dağıtımı', grup: 'stk', ikon: 'fa-box-open', rota: '/yardimlar', faaliyet: 'yardim', afinite: A(.65, 0, 0, 0), genel: true },
  { anahtar: 'su_kuyulari', ad: 'Su kuyuları', grup: 'stk', ikon: 'fa-faucet-drip', rota: '/su-kuyulari', faaliyet: 'su_kuyusu', afinite: A(.5, 0, 0, 0), genel: true },
  { anahtar: 'kumbaralar', ad: 'Kumbaralar', grup: 'stk', ikon: 'fa-piggy-bank', rota: '/kumbaralar', faaliyet: 'kumbara', afinite: A(.5, 0, 0, 0), genel: true },
  { anahtar: 'gonulluler', ad: 'Gönüllüler', grup: 'stk', ikon: 'fa-people-group', rota: '/gonulluler', faaliyet: 'gonullu', afinite: A(.6, 0, 0, 0), genel: true },
  { anahtar: 'mukellefler', ad: 'Mükellefler', grup: 'buro', ikon: 'fa-building-user', rota: '/mukellefler', faaliyet: 'mukellef', afinite: A(0, 0, 1, 0), genel: true },
  { anahtar: 'beyannameler', ad: 'Beyanname takvimi', grup: 'buro', ikon: 'fa-calendar-days', rota: '/beyannameler', faaliyet: 'beyanname', afinite: A(0, 0, 1, 0), genel: true },
  { anahtar: 'cariler', ad: 'Cari hesaplar', grup: 'satis', ikon: 'fa-address-book', rota: '/cariler', afinite: A(.5, 1, .8, .95) },
  { anahtar: 'faturalar', ad: 'Faturalar', grup: 'satis', ikon: 'fa-file-invoice', rota: '/faturalar', faaliyet: 'fatura', afinite: A(.3, 1, .7, .9) },
  { anahtar: 'teklifler', ad: 'Teklifler ve siparişler', grup: 'satis', ikon: 'fa-file-signature', rota: '/teklifler', faaliyet: 'teklif', afinite: A(0, .7, .2, .4) },
  { anahtar: 'firsatlar', ad: 'Satış fırsatları', grup: 'satis', ikon: 'fa-bullseye', rota: '/firsatlar', faaliyet: 'crm', afinite: A(0, .5, .4, .1), genel: true },
  { anahtar: 'kasa_banka', ad: 'Kasa ve banka', grup: 'finans', ikon: 'fa-building-columns', rota: '/kasa-banka', afinite: A(.9, 1, .9, 1) },
  { anahtar: 'masraflar', ad: 'Masraflar', grup: 'finans', ikon: 'fa-receipt', rota: '/masraflar', faaliyet: 'masraf', afinite: A(.6, .8, .7, .8), genel: true },
  { anahtar: 'cek_senet', ad: 'Çek ve senet', grup: 'finans', ikon: 'fa-money-check', rota: '/cek-senet', faaliyet: 'cek_senet', afinite: A(.1, .6, .3, .5) },
  { anahtar: 'butce', ad: 'Bütçe planlama', grup: 'finans', ikon: 'fa-scale-balanced', rota: '/butce', afinite: A(.6, .6, .3, .2) },
  { anahtar: 'urunler', ad: 'Ürün ve hizmetler', grup: 'stok', ikon: 'fa-boxes-stacked', rota: '/urunler', faaliyet: 'stok', afinite: A(.3, .85, .3, .85) },
  { anahtar: 'stok', ad: 'Stok hareketleri', grup: 'stok', ikon: 'fa-dolly', rota: '/stok', faaliyet: 'stok', afinite: A(.3, .8, .1, .8) },
  { anahtar: 'demirbaslar', ad: 'Demirbaşlar', grup: 'stok', ikon: 'fa-chair', rota: '/demirbaslar', faaliyet: 'demirbas', afinite: A(.4, .45, .3, .2), genel: true },
  { anahtar: 'personel', ad: 'Personel', grup: 'ik', ikon: 'fa-id-card', rota: '/personel', faaliyet: 'personel', afinite: A(.6, .7, .6, .5) },
  { anahtar: 'projeler', ad: 'Projeler', grup: 'isler', ikon: 'fa-diagram-project', rota: '/projeler', faaliyet: 'proje', afinite: A(.6, .4, .2, .1), genel: true },
  { anahtar: 'etkinlikler', ad: 'Etkinlikler', grup: 'isler', ikon: 'fa-calendar-plus', rota: '/etkinlikler', faaliyet: 'etkinlik', afinite: A(.5, .2, .1, .1), genel: true },
  { anahtar: 'gorevler', ad: 'Görevler', grup: 'isler', ikon: 'fa-list-check', rota: '/gorevler', afinite: A(.5, .5, .6, .3), genel: true },
  { anahtar: 'toplantilar', ad: 'Karar defteri', grup: 'isler', ikon: 'fa-gavel', rota: '/karar-defteri', afinite: A(.55, .25, .1, 0), genel: true },
  { anahtar: 'evrak', ad: 'Gelen-giden evrak', grup: 'isler', ikon: 'fa-envelope-open-text', rota: '/evrak', faaliyet: 'evrak', afinite: A(.5, .3, .5, .1), genel: true },
  { anahtar: 'partnerler', ad: 'Partner kurumlar', grup: 'isler', ikon: 'fa-handshake', rota: '/partnerler', afinite: A(.35, .1, 0, 0), genel: true },
  { anahtar: 'raporlar', ad: 'Raporlar', grup: 'rapor', ikon: 'fa-chart-column', rota: '/raporlar', afinite: A(.9, .95, .9, .8) },
  { anahtar: 'sms', ad: 'Toplu SMS', grup: 'iletisim', ikon: 'fa-comment-sms', rota: '/sms', afinite: A(.7, .3, .4, .3) },
  { anahtar: 'medya', ad: 'Medya deposu', grup: 'iletisim', ikon: 'fa-photo-film', rota: '/medya', afinite: A(.5, .2, .1, .1) },
  { anahtar: 'destek', ad: 'Destek', grup: 'sistem', ikon: 'fa-life-ring', rota: '/destek', sabit: true },
  { anahtar: 'cop', ad: 'Çöp kutusu', grup: 'sistem', ikon: 'fa-trash-can', rota: '/cop-kutusu', sabit: true },
  { anahtar: 'yedek', ad: 'Yedekleme', grup: 'sistem', ikon: 'fa-database', rota: '/yedekleme', sabit: true, minRol: 'yonetici' },
  { anahtar: 'denetim', ad: 'İşlem geçmişi', grup: 'sistem', ikon: 'fa-clock-rotate-left', rota: '/islem-gecmisi', sabit: true, minRol: 'yonetici' },
  { anahtar: 'ayarlar', ad: 'Ayarlar', grup: 'sistem', ikon: 'fa-gear', rota: '/ayarlar', sabit: true },
];

// ─── Genel kayıt motoru alan tanımları ─────────────────────────────────────
const ODEME = ['Nakit', 'Havale/EFT', 'Kredi kartı', 'Online', 'Diğer'];
const KAYIT_MODULLERI = {
  bagislar: {
    tekil: 'Bağış', baslik: 'bagisci', otoNo: { alan: 'makbuz_no', onek: 'MKB' }, yazdir: 'makbuz',
    alanlar: [
      { ad: 'makbuz_no', etiket: 'Makbuz no', tip: 'metin', liste: true, saltOkunur: true },
      { ad: 'tarih', etiket: 'Tarih', tip: 'tarih', zorunlu: true, liste: true, varsayilan: 'bugun' },
      { ad: 'bagisci', etiket: 'Bağışçı', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'telefon', etiket: 'Telefon', tip: 'telefon', liste: true },
      { ad: 'tc_vkn', etiket: 'TC / Vergi no', tip: 'metin' },
      { ad: 'bagis_turu', etiket: 'Bağış türü', tip: 'secim', zorunlu: true, liste: true, filtre: true, secenekler: ['Genel bağış', 'Zekat', 'Fitre', 'Fidye', 'Sadaka', 'Adak', 'Akika', 'Kurban', 'Su kuyusu', 'Yetim', 'Burs', 'Gıda kolisi', 'Ayni bağış'] },
      { ad: 'tutar', etiket: 'Tutar', tip: 'para', zorunlu: true, liste: true },
      { ad: 'odeme_yontemi', etiket: 'Ödeme yöntemi', tip: 'secim', liste: true, filtre: true, secenekler: ODEME },
      { ad: 'finans_hesap_id', etiket: 'İşlenecek kasa/banka', tip: 'iliski', hedef: 'finans_hesap', yardim: 'Seçilirse tutar bu hesaba otomatik giriş olarak işlenir.' },
      { ad: 'proje', etiket: 'Proje / kampanya', tip: 'metin' },
      { ad: 'kimin_adina', etiket: 'Kimin adına', tip: 'metin' },
      { ad: 'aciklama', etiket: 'Açıklama', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Toplam bağış', tip: 'topla', alan: 'tutar' }, { etiket: 'Bu ay', tip: 'topla', alan: 'tutar', donem: 'ay' }, { etiket: 'Bağış adedi', tip: 'say' }],
    kasa: { yon: 'giris', tutar: 'tutar', hesap: 'finans_hesap_id', tarih: 'tarih', kategori: (v) => 'Bağış - ' + (v.bagis_turu || 'Genel'), aciklama: (v) => `${v.bagisci} bağışı (${v.makbuz_no || ''})` },
  },
  uyeler: {
    tekil: 'Üye', baslik: 'ad_soyad', otoNo: { alan: 'uye_no', onek: 'UYE' },
    alanlar: [
      { ad: 'uye_no', etiket: 'Üye no', tip: 'metin', liste: true, saltOkunur: true },
      { ad: 'ad_soyad', etiket: 'Ad soyad', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'tc_no', etiket: 'TC kimlik no', tip: 'metin' },
      { ad: 'telefon', etiket: 'Telefon', tip: 'telefon', liste: true },
      { ad: 'eposta', etiket: 'E-posta', tip: 'eposta' },
      { ad: 'uyelik_tipi', etiket: 'Üyelik tipi', tip: 'secim', liste: true, filtre: true, secenekler: ['Asil üye', 'Fahri üye', 'Kurucu üye', 'Onursal üye'] },
      { ad: 'kayit_tarihi', etiket: 'Kayıt tarihi', tip: 'tarih', liste: true, varsayilan: 'bugun' },
      { ad: 'aylik_aidat', etiket: 'Aylık aidat', tip: 'para', liste: true },
      { ad: 'meslek', etiket: 'Meslek', tip: 'metin' },
      { ad: 'adres', etiket: 'Adres', tip: 'uzun' },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['Aktif', 'Pasif', 'İstifa', 'İhraç'], varsayilan: 'Aktif' },
    ],
    ozet: [{ etiket: 'Toplam üye', tip: 'say' }, { etiket: 'Aktif üye', tip: 'say', filtre: { durum: 'Aktif' } }, { etiket: 'Aylık aidat potansiyeli', tip: 'topla', alan: 'aylik_aidat', filtre: { durum: 'Aktif' } }],
  },
  aidatlar: {
    tekil: 'Aidat', baslik: 'donem',
    alanlar: [
      { ad: 'uye_id', etiket: 'Üye', tip: 'iliski', hedef: 'kayit:uyeler', zorunlu: true, liste: true },
      { ad: 'donem', etiket: 'Dönem', tip: 'metin', zorunlu: true, liste: true, yardim: 'Örnek: 2026-11', varsayilan: 'buay' },
      { ad: 'tutar', etiket: 'Tutar', tip: 'para', zorunlu: true, liste: true },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['Bekliyor', 'Ödendi', 'Muaf'], varsayilan: 'Bekliyor' },
      { ad: 'odeme_tarihi', etiket: 'Ödeme tarihi', tip: 'tarih', liste: true },
      { ad: 'finans_hesap_id', etiket: 'Tahsil edilen kasa/banka', tip: 'iliski', hedef: 'finans_hesap' },
      { ad: 'aciklama', etiket: 'Açıklama', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Tahsil edilen', tip: 'topla', alan: 'tutar', filtre: { durum: 'Ödendi' } }, { etiket: 'Bekleyen', tip: 'topla', alan: 'tutar', filtre: { durum: 'Bekliyor' } }, { etiket: 'Kayıt', tip: 'say' }],
    kasa: { yon: 'giris', tutar: 'tutar', hesap: 'finans_hesap_id', tarih: 'odeme_tarihi', kosul: { durum: 'Ödendi' }, kategori: () => 'Aidat', aciklama: (v) => `${v.donem} dönemi aidat tahsilatı` },
  },
  yetimler: {
    tekil: 'Yetim kaydı', baslik: 'ad_soyad',
    alanlar: [
      { ad: 'ad_soyad', etiket: 'Yetim adı soyadı', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'cinsiyet', etiket: 'Cinsiyet', tip: 'secim', secenekler: ['Kız', 'Erkek'], liste: true },
      { ad: 'dogum_tarihi', etiket: 'Doğum tarihi', tip: 'tarih' },
      { ad: 'ulke', etiket: 'Ülke / şehir', tip: 'metin', liste: true, filtre: true },
      { ad: 'veli', etiket: 'Veli / vasi', tip: 'metin' },
      { ad: 'sponsor', etiket: 'Sponsor', tip: 'metin', liste: true },
      { ad: 'sponsor_telefon', etiket: 'Sponsor telefonu', tip: 'telefon' },
      { ad: 'aylik_tutar', etiket: 'Aylık destek', tip: 'para', liste: true },
      { ad: 'baslangic', etiket: 'Sponsorluk başlangıcı', tip: 'tarih' },
      { ad: 'egitim', etiket: 'Eğitim durumu', tip: 'metin' },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['Sponsor bekliyor', 'Sponsorlu', 'Pasif'], varsayilan: 'Sponsor bekliyor' },
      { ad: 'notlar', etiket: 'Notlar', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Toplam', tip: 'say' }, { etiket: 'Sponsorlu', tip: 'say', filtre: { durum: 'Sponsorlu' } }, { etiket: 'Aylık destek', tip: 'topla', alan: 'aylik_tutar', filtre: { durum: 'Sponsorlu' } }],
  },
  ihtiyac_sahipleri: {
    tekil: 'İhtiyaç sahibi', baslik: 'ad_soyad', otoNo: { alan: 'dosya_no', onek: 'DSY' },
    alanlar: [
      { ad: 'dosya_no', etiket: 'Dosya no', tip: 'metin', liste: true, saltOkunur: true },
      { ad: 'ad_soyad', etiket: 'Ad soyad', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'tc_no', etiket: 'TC kimlik no', tip: 'metin' },
      { ad: 'telefon', etiket: 'Telefon', tip: 'telefon', liste: true },
      { ad: 'adres', etiket: 'Adres', tip: 'uzun' },
      { ad: 'ilce', etiket: 'İlçe / mahalle', tip: 'metin', liste: true, filtre: true },
      { ad: 'hane_kisi', etiket: 'Hanedeki kişi sayısı', tip: 'sayi', liste: true },
      { ad: 'aylik_gelir', etiket: 'Aylık hane geliri', tip: 'para' },
      { ad: 'ihtiyac', etiket: 'İhtiyaç türü', tip: 'secim', filtre: true, liste: true, secenekler: ['Gıda', 'Nakdi', 'Kira', 'Giyim', 'Yakacak', 'Sağlık', 'Eğitim', 'Eşya'] },
      { ad: 'oncelik', etiket: 'Öncelik', tip: 'secim', liste: true, filtre: true, secenekler: ['Acil', 'Yüksek', 'Normal', 'Düşük'], varsayilan: 'Normal' },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['İnceleniyor', 'Onaylandı', 'Reddedildi', 'Pasif'], varsayilan: 'İnceleniyor' },
      { ad: 'notlar', etiket: 'Saha notu', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Kayıtlı dosya', tip: 'say' }, { etiket: 'Onaylı', tip: 'say', filtre: { durum: 'Onaylandı' } }, { etiket: 'Acil', tip: 'say', filtre: { oncelik: 'Acil' } }],
  },
  yardimlar: {
    tekil: 'Yardım', baslik: 'yardim_turu',
    alanlar: [
      { ad: 'tarih', etiket: 'Tarih', tip: 'tarih', zorunlu: true, liste: true, varsayilan: 'bugun' },
      { ad: 'ihtiyac_sahibi_id', etiket: 'İhtiyaç sahibi', tip: 'iliski', hedef: 'kayit:ihtiyac_sahipleri', zorunlu: true, liste: true },
      { ad: 'yardim_turu', etiket: 'Yardım türü', tip: 'secim', zorunlu: true, liste: true, filtre: true, secenekler: ['Gıda kolisi', 'Nakdi yardım', 'Kira yardımı', 'Giyim', 'Yakacak', 'Sağlık', 'Eğitim', 'Eşya'] },
      { ad: 'miktar', etiket: 'Miktar', tip: 'sayi', liste: true },
      { ad: 'tutar', etiket: 'Tutar / değer', tip: 'para', liste: true },
      { ad: 'finans_hesap_id', etiket: 'Ödendiği kasa/banka', tip: 'iliski', hedef: 'finans_hesap', yardim: 'Nakdi yardımlarda seçin; tutar kasadan çıkış olarak işlenir.' },
      { ad: 'teslim_eden', etiket: 'Teslim eden', tip: 'metin' },
      { ad: 'aciklama', etiket: 'Açıklama', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Yardım sayısı', tip: 'say' }, { etiket: 'Toplam değer', tip: 'topla', alan: 'tutar' }, { etiket: 'Bu ay', tip: 'topla', alan: 'tutar', donem: 'ay' }],
    kasa: { yon: 'cikis', tutar: 'tutar', hesap: 'finans_hesap_id', tarih: 'tarih', kategori: () => 'Sosyal yardım', aciklama: (v) => `${v.yardim_turu} yardımı` },
  },
  su_kuyulari: {
    tekil: 'Su kuyusu', baslik: 'proje_adi',
    alanlar: [
      { ad: 'proje_adi', etiket: 'Kuyu / proje adı', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'ulke', etiket: 'Ülke', tip: 'metin', liste: true, filtre: true },
      { ad: 'bolge', etiket: 'Bölge / köy', tip: 'metin', liste: true },
      { ad: 'bagisci', etiket: 'Bağışçı', tip: 'metin', liste: true },
      { ad: 'bagisci_telefon', etiket: 'Bağışçı telefonu', tip: 'telefon' },
      { ad: 'maliyet', etiket: 'Maliyet', tip: 'para', liste: true },
      { ad: 'toplanan', etiket: 'Toplanan', tip: 'para' },
      { ad: 'derinlik', etiket: 'Derinlik (m)', tip: 'sayi' },
      { ad: 'faydalanan', etiket: 'Faydalanan kişi', tip: 'sayi' },
      { ad: 'baslangic', etiket: 'Başlangıç', tip: 'tarih' },
      { ad: 'bitis', etiket: 'Açılış tarihi', tip: 'tarih' },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['Bağış toplanıyor', 'Sondajda', 'Tamamlandı', 'Teslim edildi'], varsayilan: 'Bağış toplanıyor' },
      { ad: 'notlar', etiket: 'Notlar', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Kuyu sayısı', tip: 'say' }, { etiket: 'Tamamlanan', tip: 'say', filtre: { durum: 'Tamamlandı' } }, { etiket: 'Toplam maliyet', tip: 'topla', alan: 'maliyet' }],
  },
  kumbaralar: {
    tekil: 'Kumbara', baslik: 'kumbara_no',
    alanlar: [
      { ad: 'kumbara_no', etiket: 'Kumbara no', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'sorumlu', etiket: 'Sorumlu / yer', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'telefon', etiket: 'Telefon', tip: 'telefon', liste: true },
      { ad: 'adres', etiket: 'Adres', tip: 'uzun' },
      { ad: 'verilis', etiket: 'Veriliş tarihi', tip: 'tarih', liste: true },
      { ad: 'son_acilis', etiket: 'Son açılış', tip: 'tarih', liste: true },
      { ad: 'toplanan', etiket: 'Toplam toplanan', tip: 'para', liste: true },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['Sahada', 'Toplama bekliyor', 'Depoda', 'Kayıp'], varsayilan: 'Sahada' },
    ],
    ozet: [{ etiket: 'Kumbara', tip: 'say' }, { etiket: 'Sahada', tip: 'say', filtre: { durum: 'Sahada' } }, { etiket: 'Toplanan', tip: 'topla', alan: 'toplanan' }],
  },
  gonulluler: {
    tekil: 'Gönüllü', baslik: 'ad_soyad',
    alanlar: [
      { ad: 'ad_soyad', etiket: 'Ad soyad', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'telefon', etiket: 'Telefon', tip: 'telefon', liste: true },
      { ad: 'eposta', etiket: 'E-posta', tip: 'eposta' },
      { ad: 'beceri', etiket: 'Beceri / alan', tip: 'metin', liste: true },
      { ad: 'musaitlik', etiket: 'Müsaitlik', tip: 'secim', liste: true, filtre: true, secenekler: ['Hafta içi', 'Hafta sonu', 'Her zaman', 'Etkinliklerde'] },
      { ad: 'toplam_saat', etiket: 'Toplam gönüllü saat', tip: 'sayi', liste: true },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['Aktif', 'Pasif'], varsayilan: 'Aktif' },
      { ad: 'notlar', etiket: 'Notlar', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Gönüllü', tip: 'say' }, { etiket: 'Aktif', tip: 'say', filtre: { durum: 'Aktif' } }, { etiket: 'Toplam saat', tip: 'topla', alan: 'toplam_saat', bicim: 'sayi' }],
  },
  mukellefler: {
    tekil: 'Mükellef', baslik: 'unvan',
    alanlar: [
      { ad: 'unvan', etiket: 'Unvan', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'vkn', etiket: 'VKN / TCKN', tip: 'metin', liste: true },
      { ad: 'vergi_dairesi', etiket: 'Vergi dairesi', tip: 'metin' },
      { ad: 'tur', etiket: 'Mükellefiyet', tip: 'secim', liste: true, filtre: true, secenekler: ['Bilanço', 'İşletme', 'Serbest meslek', 'Basit usul', 'Dernek/Vakıf'] },
      { ad: 'yetkili', etiket: 'Yetkili', tip: 'metin' },
      { ad: 'telefon', etiket: 'Telefon', tip: 'telefon', liste: true },
      { ad: 'eposta', etiket: 'E-posta', tip: 'eposta' },
      { ad: 'aylik_ucret', etiket: 'Aylık hizmet bedeli', tip: 'para', liste: true },
      { ad: 'beyannameler', etiket: 'Verilen beyannameler', tip: 'metin', yardim: 'Örnek: KDV, Muhtasar, Geçici' },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['Aktif', 'Pasif'], varsayilan: 'Aktif' },
      { ad: 'notlar', etiket: 'Notlar', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Mükellef', tip: 'say' }, { etiket: 'Aktif', tip: 'say', filtre: { durum: 'Aktif' } }, { etiket: 'Aylık gelir', tip: 'topla', alan: 'aylik_ucret', filtre: { durum: 'Aktif' } }],
  },
  beyannameler: {
    tekil: 'Beyanname', baslik: 'beyanname',
    alanlar: [
      { ad: 'mukellef_id', etiket: 'Mükellef', tip: 'iliski', hedef: 'kayit:mukellefler', zorunlu: true, liste: true },
      { ad: 'beyanname', etiket: 'Beyanname', tip: 'secim', zorunlu: true, liste: true, filtre: true, secenekler: ['KDV', 'Muhtasar ve SGK', 'Geçici vergi', 'Kurumlar vergisi', 'Gelir vergisi', 'Ba-Bs', 'Damga vergisi', 'e-Defter berat'] },
      { ad: 'donem', etiket: 'Dönem', tip: 'metin', zorunlu: true, liste: true, varsayilan: 'buay' },
      { ad: 'son_gun', etiket: 'Son gün', tip: 'tarih', zorunlu: true, liste: true },
      { ad: 'tahakkuk', etiket: 'Tahakkuk tutarı', tip: 'para', liste: true },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['Hazırlanıyor', 'Onay bekliyor', 'Gönderildi', 'Ödendi'], varsayilan: 'Hazırlanıyor' },
      { ad: 'notlar', etiket: 'Notlar', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Bu dönem', tip: 'say', donem: 'ay', alanTarih: 'son_gun' }, { etiket: 'Bekleyen', tip: 'say', filtre: { durum: 'Hazırlanıyor' } }, { etiket: 'Gönderilen', tip: 'say', filtre: { durum: 'Gönderildi' } }],
  },
  firsatlar: {
    tekil: 'Fırsat', baslik: 'baslik',
    alanlar: [
      { ad: 'baslik', etiket: 'Fırsat', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'cari_id', etiket: 'Müşteri', tip: 'iliski', hedef: 'cari', liste: true },
      { ad: 'tutar', etiket: 'Tahmini tutar', tip: 'para', liste: true },
      { ad: 'asama', etiket: 'Aşama', tip: 'secim', liste: true, filtre: true, secenekler: ['Aday', 'Görüşme', 'Teklif verildi', 'Pazarlık', 'Kazanıldı', 'Kaybedildi'], varsayilan: 'Aday' },
      { ad: 'olasilik', etiket: 'Olasılık (%)', tip: 'sayi', liste: true },
      { ad: 'kapanis', etiket: 'Tahmini kapanış', tip: 'tarih', liste: true },
      { ad: 'sorumlu', etiket: 'Sorumlu', tip: 'metin' },
      { ad: 'notlar', etiket: 'Notlar', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Açık fırsat değeri', tip: 'topla', alan: 'tutar', haric: { asama: ['Kazanıldı', 'Kaybedildi'] } }, { etiket: 'Kazanılan', tip: 'topla', alan: 'tutar', filtre: { asama: 'Kazanıldı' } }, { etiket: 'Fırsat', tip: 'say' }],
  },
  masraflar: {
    tekil: 'Masraf', baslik: 'aciklama', otoNo: { alan: 'fis_no', onek: 'MSR' },
    alanlar: [
      { ad: 'fis_no', etiket: 'Fiş no', tip: 'metin', liste: true, saltOkunur: true },
      { ad: 'tarih', etiket: 'Tarih', tip: 'tarih', zorunlu: true, liste: true, varsayilan: 'bugun' },
      { ad: 'kategori', etiket: 'Kategori', tip: 'kategori', kategoriTip: 'gider', zorunlu: true, liste: true, filtre: true },
      { ad: 'aciklama', etiket: 'Açıklama', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'tutar', etiket: 'Tutar (KDV dahil)', tip: 'para', zorunlu: true, liste: true },
      { ad: 'kdv_orani', etiket: 'KDV oranı (%)', tip: 'secim', secenekler: ['0', '1', '10', '20'], varsayilan: '20' },
      { ad: 'tedarikci_id', etiket: 'Tedarikçi', tip: 'iliski', hedef: 'cari' },
      { ad: 'finans_hesap_id', etiket: 'Ödendiği kasa/banka', tip: 'iliski', hedef: 'finans_hesap', zorunlu: true },
      { ad: 'odeyen', etiket: 'Ödeyen kişi', tip: 'metin' },
    ],
    ozet: [{ etiket: 'Toplam masraf', tip: 'topla', alan: 'tutar' }, { etiket: 'Bu ay', tip: 'topla', alan: 'tutar', donem: 'ay' }, { etiket: 'Fiş sayısı', tip: 'say' }],
    kasa: { yon: 'cikis', tutar: 'tutar', hesap: 'finans_hesap_id', tarih: 'tarih', kategori: (v) => v.kategori || 'Genel gider', aciklama: (v) => v.aciklama, kdv: true },
  },
  demirbaslar: {
    tekil: 'Demirbaş', baslik: 'ad', otoNo: { alan: 'kod', onek: 'DMB' },
    alanlar: [
      { ad: 'kod', etiket: 'Demirbaş kodu', tip: 'metin', liste: true, saltOkunur: true },
      { ad: 'ad', etiket: 'Demirbaş adı', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'kategori', etiket: 'Kategori', tip: 'secim', liste: true, filtre: true, secenekler: ['Bilgisayar', 'Mobilya', 'Taşıt', 'Makine', 'Elektronik', 'Diğer'] },
      { ad: 'alis_tarihi', etiket: 'Alış tarihi', tip: 'tarih', liste: true },
      { ad: 'bedel', etiket: 'Alış bedeli', tip: 'para', liste: true },
      { ad: 'omur', etiket: 'Faydalı ömür (yıl)', tip: 'sayi', varsayilan: 5 },
      { ad: 'konum', etiket: 'Konum', tip: 'metin' },
      { ad: 'zimmet', etiket: 'Zimmetli kişi', tip: 'metin', liste: true },
      { ad: 'seri_no', etiket: 'Seri no', tip: 'metin' },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['Kullanımda', 'Depoda', 'Arızalı', 'Elden çıkarıldı'], varsayilan: 'Kullanımda' },
    ],
    ozet: [{ etiket: 'Demirbaş', tip: 'say' }, { etiket: 'Toplam bedel', tip: 'topla', alan: 'bedel' }, { etiket: 'Güncel net değer', tip: 'amortisman' }],
  },
  projeler: {
    tekil: 'Proje', baslik: 'ad',
    alanlar: [
      { ad: 'ad', etiket: 'Proje adı', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'sorumlu', etiket: 'Sorumlu', tip: 'metin', liste: true },
      { ad: 'butce', etiket: 'Bütçe', tip: 'para', liste: true },
      { ad: 'harcanan', etiket: 'Harcanan', tip: 'para', liste: true },
      { ad: 'baslangic', etiket: 'Başlangıç', tip: 'tarih' },
      { ad: 'bitis', etiket: 'Bitiş', tip: 'tarih', liste: true },
      { ad: 'ilerleme', etiket: 'İlerleme (%)', tip: 'sayi', liste: true },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['Planlama', 'Devam ediyor', 'Beklemede', 'Tamamlandı', 'İptal'], varsayilan: 'Planlama' },
      { ad: 'aciklama', etiket: 'Açıklama', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Proje', tip: 'say' }, { etiket: 'Devam eden', tip: 'say', filtre: { durum: 'Devam ediyor' } }, { etiket: 'Toplam bütçe', tip: 'topla', alan: 'butce' }],
  },
  etkinlikler: {
    tekil: 'Etkinlik', baslik: 'ad',
    alanlar: [
      { ad: 'ad', etiket: 'Etkinlik', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'tarih', etiket: 'Tarih', tip: 'tarih', zorunlu: true, liste: true },
      { ad: 'yer', etiket: 'Yer', tip: 'metin', liste: true },
      { ad: 'katilimci', etiket: 'Beklenen katılımcı', tip: 'sayi', liste: true },
      { ad: 'butce', etiket: 'Bütçe', tip: 'para', liste: true },
      { ad: 'gelir', etiket: 'Elde edilen gelir', tip: 'para' },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['Planlanıyor', 'Duyuruldu', 'Tamamlandı', 'İptal'], varsayilan: 'Planlanıyor' },
      { ad: 'aciklama', etiket: 'Açıklama', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Etkinlik', tip: 'say' }, { etiket: 'Planlanan', tip: 'say', filtre: { durum: 'Planlanıyor' } }, { etiket: 'Toplam gelir', tip: 'topla', alan: 'gelir' }],
  },
  gorevler: {
    tekil: 'Görev', baslik: 'baslik',
    alanlar: [
      { ad: 'baslik', etiket: 'Görev', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'atanan', etiket: 'Sorumlu', tip: 'kullanici', liste: true },
      { ad: 'son_tarih', etiket: 'Son tarih', tip: 'tarih', liste: true },
      { ad: 'oncelik', etiket: 'Öncelik', tip: 'secim', liste: true, filtre: true, secenekler: ['Yüksek', 'Normal', 'Düşük'], varsayilan: 'Normal' },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['Yapılacak', 'Devam ediyor', 'Tamamlandı'], varsayilan: 'Yapılacak' },
      { ad: 'aciklama', etiket: 'Açıklama', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Açık görev', tip: 'say', haric: { durum: ['Tamamlandı'] } }, { etiket: 'Tamamlanan', tip: 'say', filtre: { durum: 'Tamamlandı' } }, { etiket: 'Toplam', tip: 'say' }],
  },
  toplantilar: {
    tekil: 'Karar', baslik: 'konu', otoNo: { alan: 'karar_no', onek: 'K' },
    alanlar: [
      { ad: 'karar_no', etiket: 'Karar no', tip: 'metin', liste: true, saltOkunur: true },
      { ad: 'tarih', etiket: 'Toplantı tarihi', tip: 'tarih', zorunlu: true, liste: true, varsayilan: 'bugun' },
      { ad: 'kurul', etiket: 'Kurul', tip: 'secim', liste: true, filtre: true, secenekler: ['Yönetim kurulu', 'Denetim kurulu', 'Genel kurul', 'Yönetim toplantısı'] },
      { ad: 'konu', etiket: 'Konu', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'katilanlar', etiket: 'Katılanlar', tip: 'uzun' },
      { ad: 'karar', etiket: 'Alınan karar', tip: 'uzun', zorunlu: true },
      { ad: 'oylama', etiket: 'Oylama', tip: 'secim', secenekler: ['Oy birliği', 'Oy çokluğu'], liste: true },
    ],
    ozet: [{ etiket: 'Karar', tip: 'say' }, { etiket: 'Bu yıl', tip: 'say', donem: 'yil' }],
  },
  evrak: {
    tekil: 'Evrak', baslik: 'konu', otoNo: { alan: 'kayit_no', onek: 'EVR' },
    alanlar: [
      { ad: 'kayit_no', etiket: 'Kayıt no', tip: 'metin', liste: true, saltOkunur: true },
      { ad: 'yon', etiket: 'Yön', tip: 'secim', zorunlu: true, liste: true, filtre: true, secenekler: ['Gelen', 'Giden'] },
      { ad: 'tarih', etiket: 'Tarih', tip: 'tarih', zorunlu: true, liste: true, varsayilan: 'bugun' },
      { ad: 'kurum', etiket: 'Kurum / kişi', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'evrak_no', etiket: 'Evrak sayısı', tip: 'metin' },
      { ad: 'konu', etiket: 'Konu', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['İşlemde', 'Cevaplandı', 'Arşivlendi'], varsayilan: 'İşlemde' },
      { ad: 'aciklama', etiket: 'Açıklama', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Gelen', tip: 'say', filtre: { yon: 'Gelen' } }, { etiket: 'Giden', tip: 'say', filtre: { yon: 'Giden' } }, { etiket: 'İşlemde', tip: 'say', filtre: { durum: 'İşlemde' } }],
  },
  partnerler: {
    tekil: 'Partner kurum', baslik: 'kurum',
    alanlar: [
      { ad: 'kurum', etiket: 'Kurum', tip: 'metin', zorunlu: true, liste: true },
      { ad: 'ulke', etiket: 'Ülke', tip: 'metin', liste: true, filtre: true },
      { ad: 'yetkili', etiket: 'Yetkili', tip: 'metin', liste: true },
      { ad: 'telefon', etiket: 'Telefon', tip: 'telefon', liste: true },
      { ad: 'eposta', etiket: 'E-posta', tip: 'eposta' },
      { ad: 'alan', etiket: 'İşbirliği alanı', tip: 'metin', liste: true },
      { ad: 'durum', etiket: 'Durum', tip: 'secim', liste: true, filtre: true, secenekler: ['Aktif', 'Pasif'], varsayilan: 'Aktif' },
      { ad: 'notlar', etiket: 'Notlar', tip: 'uzun' },
    ],
    ozet: [{ etiket: 'Partner', tip: 'say' }, { etiket: 'Aktif', tip: 'say', filtre: { durum: 'Aktif' } }],
  },
};

const PANEL_BILESENLERI = {
  stk: ['nakit', 'bagis_ay', 'kurban', 'bekleyen_hisse', 'gelir_gider', 'bagis_tur', 'yaklasan', 'son_islemler'],
  sirket: ['nakit', 'alacak', 'borc', 'satis_ay', 'gelir_gider', 'vadesi_gecen', 'kritik_stok', 'yaklasan', 'son_islemler'],
  muhasebe: ['nakit', 'mukellef', 'beyanname', 'alacak', 'gelir_gider', 'yaklasan', 'son_islemler'],
  esnaf: ['nakit', 'alacak', 'satis_ay', 'gelir_gider', 'kritik_stok', 'yaklasan', 'son_islemler'],
};
const BILESEN_FAALIYET = { kurban: 'kurban', bekleyen_hisse: 'kurban', bagis_ay: 'bagis', bagis_tur: 'bagis', kritik_stok: 'stok', mukellef: 'mukellef', beyanname: 'beyanname', satis_ay: 'fatura' };

// ─── Menü önceliklendirme algoritması ──────────────────────────────────────
// skor = 100·afinite(tür) + faaliyet etkisi (+80 seçili / −40 seçilmemiş)
//        + kullanım puanı 60·(1 − e^(−k/6))   (k: 14 günlük yarı ömürle sönümlenen kullanım sayısı)
//        + sabitleme 1000 ; gizlenen modüller menüden kalkar.
// Eşik (55) altında kalanlar "Diğer modüller" altına iner ama erişilebilir kalır.
const ESIK = 55;
function sonumlenmis(sayi, son) {
  if (!sayi || !son) return 0;
  const gun = (Date.now() - son) / 86400000;
  return sayi * Math.pow(0.5, gun / 14);
}

function menuOlustur({ hesap, rol, kullanim = {}, devreDisi = [] }) {
  const tur = HESAP_TURLERI[hesap.tur] ? hesap.tur : 'stk';
  let profil = {}, tercih = {};
  try { profil = JSON.parse(hesap.profil_json || '{}'); } catch (e) { /* */ }
  try { tercih = JSON.parse(hesap.moduller_json || '{}'); } catch (e) { /* */ }
  const faaliyetler = new Set(profil.faaliyetler || HESAP_TURLERI[tur].varsayilan);
  const sabit = new Set(tercih.sabit || []), gizli = new Set(tercih.gizli || []);
  const { ROL_YETKI } = require('./lib/oturum');

  const ogeler = [];
  for (const m of MODULLER) {
    if (devreDisi.includes(m.anahtar)) continue;
    if (m.minRol && (ROL_YETKI[rol] || 0) < ROL_YETKI[m.minRol]) continue;
    if (gizli.has(m.anahtar) && !m.sabit) continue;
    let skor, taban;
    if (m.sabit) skor = taban = 10000;
    else {
      taban = 100 * ((m.afinite && m.afinite[tur]) || 0);
      if (m.faaliyet) taban += faaliyetler.has(m.faaliyet) ? 80 : -40;
      const k = kullanim[m.anahtar] || 0;
      skor = taban + 60 * (1 - Math.exp(-k / 6));
      if (sabit.has(m.anahtar)) { skor += 1000; taban += 1000; }
    }
    ogeler.push({ anahtar: m.anahtar, ad: m.ad, ikon: m.ikon, rota: m.rota, grup: m.grup, skor: Math.round(skor), taban, ana: m.sabit || skor >= ESIK, sabitlendi: sabit.has(m.anahtar), kullanim: Math.round((kullanim[m.anahtar] || 0) * 10) / 10 });
  }

  const gruplar = {};
  for (const o of ogeler.filter(x => x.ana)) {
    (gruplar[o.grup] = gruplar[o.grup] || { anahtar: o.grup, ad: GRUPLAR[o.grup].ad, ogeler: [], skor: 0 }).ogeler.push(o);
  }
  const liste = Object.values(gruplar);
  // Grup sırası yalnızca taban puana göre belirlenir (menü kullanım sırasında zıplamasın);
  // kullanım, grup içi sırayı ve "Diğer modüller"den ana menüye çıkışı etkiler.
  liste.forEach(g => { g.ogeler.sort((a, b) => b.skor - a.skor); g.skor = Math.max(...g.ogeler.map(o => o.taban)); });
  liste.sort((a, b) => {
    if (a.anahtar === 'genel') return -1; if (b.anahtar === 'genel') return 1;
    if (a.anahtar === 'sistem') return 1; if (b.anahtar === 'sistem') return -1;
    return b.skor - a.skor || GRUPLAR[a.anahtar].sira - GRUPLAR[b.anahtar].sira;
  });
  const diger = ogeler.filter(x => !x.ana).sort((a, b) => b.skor - a.skor);
  ogeler.forEach(o => { delete o.taban; });
  const sik = ogeler.filter(x => !['panel', 'ayarlar', 'destek', 'cop', 'yedek', 'denetim'].includes(x.anahtar) && x.kullanim > 0)
    .sort((a, b) => b.kullanim - a.kullanim).slice(0, 6);
  const oneri = ogeler.filter(x => x.ana && !x.sabitlendi && !['panel', 'ayarlar', 'destek', 'cop', 'yedek', 'denetim'].includes(x.anahtar))
    .sort((a, b) => b.skor - a.skor).slice(0, 6);

  const bilesenler = PANEL_BILESENLERI[tur].filter(b => !BILESEN_FAALIYET[b] || faaliyetler.has(BILESEN_FAALIYET[b]));
  return { gruplar: liste, diger, sik: sik.length >= 3 ? sik : oneri, bilesenler, faaliyetler: [...faaliyetler], tur };
}

function modulBul(anahtar) { return MODULLER.find(m => m.anahtar === anahtar); }

module.exports = { HESAP_TURLERI, GRUPLAR, MODULLER, KAYIT_MODULLERI, PANEL_BILESENLERI, menuOlustur, sonumlenmis, modulBul, ESIK };
