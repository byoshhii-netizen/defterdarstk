'use strict';
// Uçtan uca API testi: node test/api-test.js (sunucu localhost:4500'de çalışıyor olmalı)
const TABAN = process.env.TABAN || 'http://localhost:4500';
let hatalar = 0, gecen = 0;
function istemci() {
  const c = { cerez: {}, csrf: null };
  c.istek = async (metod, yol, govde, ek = {}) => {
    const h = { 'Content-Type': 'application/json', Cookie: Object.entries(c.cerez).map(([k, v]) => `${k}=${v}`).join('; ') };
    if (c.csrf && !ek.csrfYok) h['X-CSRF-Token'] = c.csrf;
    Object.assign(h, ek.basliklar || {});
    const r = await fetch(TABAN + yol, { method: metod, headers: h, body: govde ? JSON.stringify(govde) : undefined, redirect: 'manual' });
    (r.headers.getSetCookie() || []).forEach(s => { const [kv] = s.split(';'); const [k, ...v] = kv.split('='); c.cerez[k] = v.join('='); });
    let j = null; const t = r.headers.get('content-type') || '';
    if (t.includes('json')) j = await r.json(); else j = await r.arrayBuffer();
    return { durum: r.status, j };
  };
  return c;
}
function bekle(kosul, ad, ek) { if (kosul) { gecen++; } else { hatalar++; console.log('  BAŞARISIZ:', ad, ek !== undefined ? JSON.stringify(ek).slice(0, 300) : ''); } }

(async () => {
  const e = 'test' + Date.now() + '@ornek.com';
  const A = istemci();
  let r = await A.istek('POST', '/api/hesap/kayit', { hesap_ad: 'Test Derneği', tur: 'stk', ad_soyad: 'Ali Veli', eposta: e, sifre: 'zayif', sozlesme: true });
  bekle(r.durum === 400, 'zayıf şifre reddi', r.j);
  r = await A.istek('POST', '/api/hesap/kayit', { hesap_ad: 'Test Derneği', tur: 'stk', ad_soyad: 'Ali Veli', eposta: e, sifre: 'Guclu1234', sozlesme: true, faaliyetler: ['kurban', 'bagis', 'yardim'] });
  bekle(r.durum === 200, 'kayıt', r.j);
  r = await A.istek('GET', '/api/hesap/oturum'); A.csrf = r.j.csrf;
  bekle(r.durum === 200 && r.j.menu.gruplar.length > 2, 'oturum + menü', r.j.menu && r.j.menu.gruplar.map(g => g.anahtar));
  const menuSira = r.j.menu.gruplar.map(g => g.anahtar);
  bekle(menuSira[1] === 'kurban' || menuSira[1] === 'stk', 'STK menüsünde kurban/bağış öne çıkıyor', menuSira);

  r = await A.istek('POST', '/api/kurban/organizasyonlar', { ad: 'Kurban 2026' }, { csrfYok: true });
  bekle(r.durum === 403, 'CSRF koruması', r.j);
  r = await A.istek('GET', '/api/finans/hesaplar'); const kasa = r.j[0];
  bekle(kasa && kasa.ad === 'Merkez kasa', 'varsayılan kasa', r.j);
  r = await A.istek('POST', '/api/kurban/organizasyonlar', { ad: 'Kurban 2026', yil: 2026, max_kurban: 50, buyukbas_hisse_fiyati: 12000, kucukbas_hisse_fiyati: 9000, finans_hesap_id: kasa.id });
  const orgId = r.j.id; bekle(orgId, 'organizasyon', r.j);
  r = await A.istek('POST', `/api/kurban/organizasyonlar/${orgId}/kurbanlar`, { tur: 'buyukbas', kurban_turu: 'Udhiye', alis_fiyati: 60000, hisseler: [{ bagisci_adi: 'Ahmet Yılmaz', bagisci_telefon: '05321112233', odeme_durumu: 'odendi' }, { bagisci_adi: 'Mehmet Kaya' }] });
  const kurbanId = r.j.id; bekle(kurbanId, 'kurban + hisseler', r.j);
  r = await A.istek('POST', `/api/kurban/organizasyonlar/${orgId}/kurbanlar`, { tur: 'kucukbas', adet: 3 });
  bekle(r.j.ids && r.j.ids.length === 3, 'çoklu küçükbaş', r.j);
  r = await A.istek('GET', `/api/kurban/kurbanlar/${kurbanId}`);
  bekle(r.j.hisseler.length === 7 && r.j.hisseler[0].bagisci_adi === 'Ahmet Yılmaz', 'hisse detay', r.j);
  const h2 = r.j.hisseler[1].id;
  r = await A.istek('PUT', `/api/kurban/hisseler/${h2}`, { bagisci_adi: 'Mehmet Kaya', odeme_durumu: 'odendi', vekalet_onay: 1, kurban_turu: 'Adak' });
  bekle(r.durum === 200, 'hisse güncelle', r.j);
  r = await A.istek('GET', `/api/kurban/organizasyonlar/${orgId}/ozet`);
  bekle(r.j.ozet.tahsil_edilen === 24000 && r.j.ozet.vekalet === 1 && r.j.ozet.toplam_kurban === 4, 'kurban özeti', r.j.ozet);
  r = await A.istek('GET', '/api/finans/hesaplar');
  bekle(r.j[0].bakiye === 24000, 'hisse ödemesi kasaya işlendi', r.j[0]);
  r = await A.istek('POST', '/api/kurban/hisseler/toplu', { ids: [h2], islem: 'odeme', deger: 'bekliyor' });
  r = await A.istek('GET', '/api/finans/hesaplar');
  bekle(r.j[0].bakiye === 12000, 'ödeme geri alınınca kasa düzeldi', r.j[0]);
  r = await A.istek('GET', `/api/kurban/organizasyonlar/${orgId}/excel`);
  bekle(r.durum === 200 && r.j.byteLength > 1000, 'kurban excel', r.durum);
  r = await A.istek('GET', '/api/kurban/bagisci-ara?q=ahm');
  bekle(r.j.length === 1, 'bağışçı otomatik tamamlama', r.j);

  // Genel kayıt motoru
  r = await A.istek('POST', '/api/kayit/bagislar', { tarih: '2026-11-10', bagisci: 'Ayşe Demir', bagis_turu: 'Zekat', tutar: 5000, odeme_yontemi: 'Nakit', finans_hesap_id: kasa.id });
  const bagisId = r.j.id; bekle(bagisId && /^MKB-\d{4}-00001$/.test(r.j.kayit.makbuz_no), 'bağış + makbuz no', r.j);
  r = await A.istek('GET', '/api/kayit/bagislar');
  bekle(r.j.toplam === 1 && r.j.ozet[0].deger === 5000, 'bağış listesi + özet', r.j.ozet);
  r = await A.istek('GET', '/api/finans/hesaplar');
  bekle(r.j[0].bakiye === 17000, 'bağış kasaya işlendi', r.j[0]);
  r = await A.istek('POST', '/api/kayit/ihtiyac_sahipleri', { ad_soyad: 'Fatma Ak', hane_kisi: 5, ihtiyac: 'Gıda' });
  const isId = r.j.id;
  r = await A.istek('POST', '/api/kayit/yardimlar', { tarih: '2026-11-11', ihtiyac_sahibi_id: isId, yardim_turu: 'Nakdi yardım', tutar: 1000, finans_hesap_id: kasa.id });
  bekle(r.durum === 200, 'yardım (ilişkili)', r.j);
  r = await A.istek('GET', `/api/kayit/ihtiyac_sahipleri/${isId}`);
  bekle(r.j.bagli.length === 1 && r.j.bagli[0].modul === 'yardimlar', 'bağlı kayıtlar', r.j.bagli);
  r = await A.istek('POST', '/api/kayit/bagislar', { bagisci: '', tutar: 1 });
  bekle(r.durum === 400, 'zorunlu alan doğrulaması', r.j);
  r = await A.istek('DELETE', `/api/kayit/bagislar/${bagisId}`);
  r = await A.istek('GET', '/api/finans/hesaplar');
  bekle(r.j[0].bakiye === 11000, 'bağış silinince kasa düzeldi', r.j[0]);
  r = await A.istek('GET', '/api/cop-kutusu');
  const cop = r.j.find(x => x.tur === 'kayit:bagislar');
  r = await A.istek('POST', `/api/cop-kutusu/${cop.id}/geri-yukle`);
  r = await A.istek('GET', '/api/finans/hesaplar');
  bekle(r.j[0].bakiye === 16000, 'çöp kutusundan geri yükleme', r.j[0]);

  // Cari / fatura / tahsilat
  r = await A.istek('POST', '/api/cariler', { unvan: 'ABC Gıda Ltd.', tur: 'musteri', vergi_no: '1234567890', vade_gun: 30 });
  const cariId = r.j.id; bekle(cariId, 'cari', r.j);
  r = await A.istek('POST', '/api/urunler', { ad: 'Gıda kolisi', satis_fiyati: 500, alis_fiyati: 350, kdv_orani: 10, acilis_stok: 100, kritik_stok: 10 });
  const urunId = r.j.id;
  r = await A.istek('POST', '/api/belgeler', { tip: 'satis_fatura', cari_id: cariId, tarih: '2026-11-15', kalemler: [{ urun_id: urunId, aciklama: 'Gıda kolisi', miktar: 10, birim_fiyat: 500, kdv_orani: 10 }] });
  const fId = r.j.id; bekle(fId && /^SF-/.test(r.j.no), 'satış faturası', r.j);
  r = await A.istek('GET', `/api/belgeler/${fId}`);
  bekle(r.j.belge.genel_toplam === 5500 && r.j.belge.vade === '2026-12-15', 'fatura toplam + vade', r.j.belge);
  r = await A.istek('GET', `/api/urunler/${urunId}`);
  bekle(r.j.urun.stok === 90, 'stok düştü', r.j.urun);
  r = await A.istek('POST', `/api/cariler/${cariId}/tahsilat`, { tutar: 2000, finans_hesap_id: kasa.id, belge_id: fId });
  r = await A.istek('GET', `/api/cariler/${cariId}`);
  bekle(r.j.bakiye === 3500, 'cari bakiye', r.j.bakiye);
  r = await A.istek('GET', `/api/belgeler/${fId}`);
  bekle(r.j.belge.durum === 'kismi' && r.j.belge.odenen === 2000, 'fatura kısmi ödendi', r.j.belge);
  r = await A.istek('GET', '/api/rapor/kdv?yil=2026');
  bekle(r.j.satirlar[10].hesaplanan === 500, 'KDV raporu', r.j.satirlar[10]);
  r = await A.istek('GET', '/api/rapor/kar-zarar?yil=2026');
  bekle(r.durum === 200 && r.j.gelir.length > 0, 'kâr-zarar', r.j.gelir);
  r = await A.istek('GET', '/api/rapor/yaslandirma');
  bekle(r.j.satirlar[0].toplam === 3500, 'yaşlandırma', r.j.satirlar);
  r = await A.istek('GET', '/api/rapor/nakit-akisi');
  bekle(r.durum === 200 && r.j.haftalar.length > 5, 'nakit akışı', r.durum);
  r = await A.istek('GET', '/api/panel');
  bekle(r.durum === 200 && r.j.kurban && r.j.nakit.toplam === 18000, 'panel', r.j.nakit);
  r = await A.istek('GET', '/api/ara?q=ahmet');
  bekle(r.j.length >= 1, 'genel arama', r.j);
  r = await A.istek('POST', '/api/cek-senet', { tur: 'cek', yon: 'alinan', tutar: 1500, vade: '2026-12-20', cari_id: cariId, no: 'A123' });
  const cekId = r.j.id;
  r = await A.istek('POST', `/api/cek-senet/${cekId}/durum`, { durum: 'tahsil', finans_hesap_id: kasa.id });
  r = await A.istek('GET', `/api/cariler/${cariId}`);
  bekle(r.j.bakiye === 2000, 'çek cariyi düşürdü', r.j.bakiye);

  // Personel
  r = await A.istek('POST', '/api/personel', { ad: 'Zeynep', soyad: 'Kara', maas: 30000, ise_baslama: '2024-01-01' });
  const pId = r.j.id;
  r = await A.istek('POST', '/api/personel/toplu-maas', { ay: '2026-11', ids: [pId], finans_hesap_id: kasa.id });
  bekle(r.j.adet === 1, 'toplu maaş', r.j);
  r = await A.istek('GET', `/api/personel/${pId}`);
  bekle(r.j.kayitlar.length === 1 && r.j.ozet.kidem >= 2, 'personel detay', r.j.ozet);
  r = await A.istek('PUT', '/api/ayarlar/personel-pin', { pin: '4321' });
  r = await A.istek('GET', `/api/personel/${pId}`);
  bekle(r.durum === 403 && r.j.pin_gerekli, 'personel PIN koruması', r.j);
  r = await A.istek('GET', `/api/personel/${pId}`, null, { basliklar: { 'X-Personel-Pin': '4321' } });
  bekle(r.durum === 200, 'PIN ile erişim', r.durum);

  // Yedek al + geri yükle
  r = await A.istek('GET', '/api/yedek/indir');
  const yedek = r.j instanceof ArrayBuffer ? JSON.parse(Buffer.from(r.j).toString()) : r.j;
  bekle(yedek.defterdar_yedek === 2 && yedek.tablolar.hisseler.length === 10, 'yedek indir', yedek.tablolar && yedek.tablolar.hisseler.length);
  r = await A.istek('POST', '/api/yedek/geri-yukle', { onay: 'GERİ YÜKLE', yedek });
  bekle(r.durum === 200, 'yedek geri yükle', r.j);
  r = await A.istek('GET', '/api/finans/hesaplar');
  bekle(r.j[0].bakiye === -10500, 'geri yükleme sonrası bakiye korunuyor', r.j[0]);
  r = await A.istek('GET', '/api/kurban/organizasyonlar');
  bekle(r.j.length === 1 && r.j[0].ozet.dolu_hisse === 2, 'geri yükleme sonrası kurban', r.j[0] && r.j[0].ozet);

  // Kiracı izolasyonu
  const B = istemci();
  await B.istek('POST', '/api/hesap/kayit', { hesap_ad: 'Başka Şirket', tur: 'sirket', ad_soyad: 'Can Er', eposta: 'b' + e, sifre: 'Guclu1234', sozlesme: true });
  r = await B.istek('GET', '/api/hesap/oturum'); B.csrf = r.j.csrf;
  bekle(r.j.menu.gruplar.map(g => g.anahtar).indexOf('satis') === 1, 'şirket menüsünde satış öne çıkıyor', r.j.menu.gruplar.map(g => g.anahtar));
  bekle(!r.j.menu.gruplar.find(g => g.anahtar === 'kurban'), 'şirket menüsünde kurban ana menüde yok', r.j.menu.gruplar.map(g => g.anahtar));
  r = await B.istek('GET', `/api/kurban/organizasyonlar/${orgId}/ozet`);
  bekle(r.durum === 404, 'başka hesabın kurbanına erişim engeli', r.durum);
  r = await B.istek('GET', `/api/cariler/${cariId}`);
  bekle(r.durum === 404, 'başka hesabın carisine erişim engeli', r.durum);

  // Giriş kilidi
  const C = istemci();
  for (let i = 0; i < 5; i++) await C.istek('POST', '/api/hesap/giris', { eposta: e, sifre: 'yanlis' + i });
  r = await C.istek('POST', '/api/hesap/giris', { eposta: e, sifre: 'Guclu1234' });
  bekle(r.durum === 423, 'hatalı denemelerde hesap kilidi', r.j);

  // Yönetim paneli
  const S = istemci();
  r = await S.istek('POST', '/api/sadmin/giris', { kullanici_adi: 'admin', sifre: 'yanlis' });
  bekle(r.durum === 401, 'admin hatalı şifre', r.j);
  r = await S.istek('POST', '/api/sadmin/giris', { kullanici_adi: 'admin', sifre: process.env.ADMIN_SIFRE || process.env.VARSAYILAN_SIFRE });
  bekle(r.durum === 200 && r.j.varsayilan_sifre, 'admin varsayılan şifre girişi', r.j);
  r = await S.istek('GET', '/api/sadmin/oturum'); S.csrf = r.j.csrf;
  r = await S.istek('GET', '/api/sadmin/panel');
  bekle(r.durum === 428, 'varsayılan şifre değişmeden panel kapalı', r.j);
  if (!process.env.ADMIN_SIFRE) {
    r = await S.istek('POST', '/api/sadmin/sifre-degistir', { mevcut: process.env.VARSAYILAN_SIFRE, yeni: 'YeniYonetici2026' });
    bekle(r.durum === 200, 'admin şifre değiştir', r.j);
  }
  r = await S.istek('GET', '/api/sadmin/panel');
  bekle(r.durum === 200 && r.j.hesap >= 2, 'admin panel', r.j.hesap);
  r = await S.istek('GET', '/api/sadmin/hesaplar');
  bekle(r.j.length >= 2, 'admin hesaplar', r.j.length);
  r = await S.istek('GET', '/api/sadmin/moduller');
  bekle(r.j.moduller.length > 30, 'admin modüller', r.j.moduller.length);
  r = await S.istek('PUT', '/api/sadmin/ayarlar', { sistem_modu: 'bakim', sistem_notu: 'Güncelleme' });
  r = await A.istek('GET', '/api/panel');
  bekle(r.durum === 503 && r.j.sistem_modu === 'bakim', 'bakım modu kullanıcıyı durdurur', r.j);
  r = await S.istek('PUT', '/api/sadmin/ayarlar', { sistem_modu: 'acik' });
  r = await S.istek('GET', '/api/sadmin/yedekler/indir');
  const yb = Buffer.from(r.j);
  bekle(r.durum === 200 && (yb.subarray(0, 15).toString() === 'SQLite format 3' || (yb[0] === 0x1f && yb[1] === 0x8b)), 'tam veritabanı yedeği', r.durum);

  console.log(`\nSonuç: ${gecen} geçti, ${hatalar} başarısız`);
  process.exit(hatalar ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
