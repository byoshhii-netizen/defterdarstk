'use strict';
const { db } = require('../lib/db');
const g = require('../lib/guvenlik');
const { hata } = require('../lib/http');
const O = require('../lib/oturum');
const X = require('../lib/xlsx');
const F = require('../lib/finans');
const { bugun, buAy, yuvarla } = require('./ortak');
const { hepsi } = require('./kayit');
const { orgOzet } = require('./kurban');
const { urunStoklari, FATURA_TIPLERI } = require('./finans');
const { KAYIT_MODULLERI } = require('../moduller');

const NAKIT_DISI = "(kaynak IS NULL OR kaynak NOT IN ('cari_hareket','cek_senet','transfer')) AND transfer_id IS NULL";
function gunEkle(t, n) { const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function aylar(n) {
  const out = []; const d = new Date(bugun() + 'T00:00:00Z'); d.setUTCDate(1);
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() - i); out.push(x.toISOString().slice(0, 7)); }
  return out;
}

function nakit(hesapId) {
  const h = F.hesapBakiyeleri(hesapId).filter(x => x.aktif);
  return { toplam: yuvarla(h.reduce((s, x) => s + x.bakiye, 0)), kasa: yuvarla(h.filter(x => x.tur === 'kasa').reduce((s, x) => s + x.bakiye, 0)), banka: yuvarla(h.filter(x => x.tur !== 'kasa').reduce((s, x) => s + x.bakiye, 0)), hesaplar: h.map(x => ({ id: x.id, ad: x.ad, tur: x.tur, bakiye: yuvarla(x.bakiye) })) };
}

function gelirGiderSeri(hesapId, n = 12) {
  const ay = aylar(n);
  const r = db().prepare(`SELECT substr(tarih,1,7) AS ay, yon, SUM(tutar) AS t FROM finans_hareketleri WHERE hesap_id=? AND transfer_id IS NULL AND tarih>=? GROUP BY ay, yon`).all(hesapId, ay[0] + '-01');
  return ay.map(a => ({ ay: a, giris: yuvarla((r.find(x => x.ay === a && x.yon === 'giris') || {}).t), cikis: yuvarla((r.find(x => x.ay === a && x.yon === 'cikis') || {}).t) }));
}

function caribakiyeler(hesapId) {
  const r = db().prepare('SELECT cari_id, SUM(borc)-SUM(alacak) AS b FROM cari_hareketleri WHERE hesap_id=? GROUP BY cari_id').all(hesapId);
  return { alacak: yuvarla(r.filter(x => x.b > 0).reduce((s, x) => s + x.b, 0)), borc: yuvarla(-r.filter(x => x.b < 0).reduce((s, x) => s + x.b, 0)) };
}

function yaklasanlar(hesapId, gun = 30) {
  const bas = bugun(), bit = gunEkle(bas, gun), out = [];
  db().prepare(`SELECT b.id, b.tip, b.no, b.vade, b.genel_toplam-b.odenen AS kalan, c.unvan FROM belgeler b LEFT JOIN cariler c ON c.id=b.cari_id
    WHERE b.hesap_id=? AND b.tip IN ('satis_fatura','alis_fatura') AND b.durum IN ('acik','kismi') AND b.vade IS NOT NULL AND b.vade<=? ORDER BY b.vade LIMIT 30`).all(hesapId, bit)
    .forEach(b => out.push({ tarih: b.vade, tur: b.tip === 'satis_fatura' ? 'Tahsilat' : 'Ödeme', baslik: `${b.unvan || ''} — ${b.no}`, tutar: yuvarla(b.kalan), gecikti: b.vade < bas, rota: `/faturalar/${b.id}` }));
  db().prepare("SELECT id, tur, yon, no, vade, tutar FROM cek_senet WHERE hesap_id=? AND durum='portfoy' AND vade<=? ORDER BY vade LIMIT 20").all(hesapId, bit)
    .forEach(c => out.push({ tarih: c.vade, tur: c.yon === 'alinan' ? `Alınan ${c.tur}` : `Verilen ${c.tur}`, baslik: c.no || '', tutar: c.tutar, gecikti: c.vade < bas, rota: '/cek-senet' }));
  const ekle = (modul, alan, turAd, kapali, baslikAlan, rota) => {
    if (!KAYIT_MODULLERI[modul]) return;
    hepsi(hesapId, modul).filter(k => k[alan] && k[alan] <= bit && k[alan] >= gunEkle(bas, -30) && !kapali.includes(k.durum))
      .forEach(k => out.push({ tarih: k[alan], tur: turAd, baslik: k[baslikAlan] || '', gecikti: k[alan] < bas, rota: `${rota}/${k.id}` }));
  };
  ekle('beyannameler', 'son_gun', 'Beyanname', ['Gönderildi', 'Ödendi'], 'beyanname', '/beyannameler');
  ekle('gorevler', 'son_tarih', 'Görev', ['Tamamlandı'], 'baslik', '/gorevler');
  ekle('etkinlikler', 'tarih', 'Etkinlik', ['Tamamlandı', 'İptal'], 'ad', '/etkinlikler');
  return out.sort((a, b) => a.tarih.localeCompare(b.tarih)).slice(0, 25);
}

module.exports = function (app) {
  const r = app.yonlendirici('/api');
  r.use(O.kullaniciGerekli);

  r.get('/panel', (req) => {
    const h = req.hesapId, ay = buAy();
    const onceki = aylar(2)[0];
    const sonuc = { nakit: nakit(h), gelir_gider: gelirGiderSeri(h, 12), yaklasan: yaklasanlar(h) };
    sonuc.son_islemler = db().prepare('SELECT kim, islem, hedef, tarih FROM denetim WHERE hesap_id=? ORDER BY id DESC LIMIT 12').all(h);
    Object.assign(sonuc, caribakiyeler(h));
    sonuc.vadesi_gecen = db().prepare("SELECT COUNT(*) AS adet, COALESCE(SUM(genel_toplam-odenen),0) AS tutar FROM belgeler WHERE hesap_id=? AND tip='satis_fatura' AND durum IN ('acik','kismi') AND vade<?").get(h, bugun());
    const satis = (a) => db().prepare("SELECT COALESCE(SUM(genel_toplam),0) AS t, COUNT(*) AS n FROM belgeler WHERE hesap_id=? AND tip='satis_fatura' AND durum<>'iptal' AND substr(tarih,1,7)=?").get(h, a);
    sonuc.satis_ay = { bu: satis(ay), onceki: satis(onceki) };
    const bagislar = hepsi(h, 'bagislar');
    const bt = (a) => bagislar.filter(b => (b.tarih || '').startsWith(a));
    sonuc.bagis_ay = { bu: yuvarla(bt(ay).reduce((s, b) => s + (b.tutar || 0), 0)), adet: bt(ay).length, onceki: yuvarla(bt(onceki).reduce((s, b) => s + (b.tutar || 0), 0)) };
    const turlar = {};
    bagislar.filter(b => (b.tarih || '').startsWith(ay.slice(0, 4))).forEach(b => { turlar[b.bagis_turu || 'Diğer'] = (turlar[b.bagis_turu || 'Diğer'] || 0) + (b.tutar || 0); });
    sonuc.bagis_tur = Object.entries(turlar).map(([ad, t]) => ({ ad, tutar: yuvarla(t) })).sort((a, b) => b.tutar - a.tutar);
    const org = db().prepare('SELECT * FROM organizasyonlar WHERE hesap_id=? AND aktif=1 ORDER BY yil DESC, id DESC LIMIT 1').get(h);
    sonuc.kurban = org ? { org: { id: org.id, ad: org.ad, yil: org.yil }, ozet: orgOzet(h, org) } : null;
    const st = urunStoklari(h);
    sonuc.kritik_stok = db().prepare('SELECT id, ad, birim, kritik_stok FROM urunler WHERE hesap_id=? AND aktif=1 AND stok_takip=1').all(h)
      .map(u => ({ ...u, stok: st[u.id] || 0 })).filter(u => u.stok <= u.kritik_stok).slice(0, 8);
    const muk = hepsi(h, 'mukellefler');
    sonuc.mukellef = { aktif: muk.filter(m => m.durum === 'Aktif').length, aylik: yuvarla(muk.filter(m => m.durum === 'Aktif').reduce((s, m) => s + (m.aylik_ucret || 0), 0)) };
    const bey = hepsi(h, 'beyannameler').filter(b => !['Gönderildi', 'Ödendi'].includes(b.durum));
    sonuc.beyanname = { bekleyen: bey.length, geciken: bey.filter(b => b.son_gun && b.son_gun < bugun()).length, yedi_gun: bey.filter(b => b.son_gun && b.son_gun >= bugun() && b.son_gun <= gunEkle(bugun(), 7)).length };
    return sonuc;
  });

  r.get('/bildirimler', (req) => {
    const h = req.hesapId, out = [];
    const vg = db().prepare("SELECT COUNT(*) AS n, COALESCE(SUM(genel_toplam-odenen),0) AS t FROM belgeler WHERE hesap_id=? AND tip='satis_fatura' AND durum IN ('acik','kismi') AND vade<?").get(h, bugun());
    if (vg.n) out.push({ seviye: 'uyari', baslik: `${vg.n} faturanın vadesi geçti`, detay: `Tahsil edilmemiş tutar: ${yuvarla(vg.t)}`, rota: '/faturalar?durum=vadesi_gecen' });
    const cek = db().prepare("SELECT COUNT(*) AS n FROM cek_senet WHERE hesap_id=? AND durum='portfoy' AND vade<=?").get(h, gunEkle(bugun(), 3));
    if (cek.n) out.push({ seviye: 'uyari', baslik: `${cek.n} çek/senedin vadesi geldi veya yaklaşıyor`, rota: '/cek-senet' });
    const st = urunStoklari(h);
    const kritik = db().prepare('SELECT id, kritik_stok FROM urunler WHERE hesap_id=? AND aktif=1 AND stok_takip=1').all(h).filter(u => (st[u.id] || 0) <= u.kritik_stok).length;
    if (kritik) out.push({ seviye: 'bilgi', baslik: `${kritik} ürün kritik stok seviyesinde`, rota: '/urunler?kritik=1' });
    const hisse = db().prepare("SELECT COUNT(*) AS n FROM hisseler h JOIN kurbanlar k ON k.id=h.kurban_id JOIN organizasyonlar o ON o.id=k.organizasyon_id WHERE h.hesap_id=? AND o.aktif=1 AND h.bagisci_adi IS NOT NULL AND h.odeme_durumu IN ('bekliyor','kismi')").get(h);
    if (hisse.n) out.push({ seviye: 'bilgi', baslik: `${hisse.n} kurban hissesinin ödemesi bekleniyor`, rota: '/kurban' });
    const bey = hepsi(h, 'beyannameler').filter(b => !['Gönderildi', 'Ödendi'].includes(b.durum) && b.son_gun && b.son_gun <= gunEkle(bugun(), 3));
    if (bey.length) out.push({ seviye: 'kritik', baslik: `${bey.length} beyannamenin son günü yaklaştı`, rota: '/beyannameler' });
    const destek = db().prepare('SELECT COUNT(*) AS n FROM destek_talepleri WHERE hesap_id=? AND kullanici_okundu=0').get(h);
    if (destek.n) out.push({ seviye: 'bilgi', baslik: 'Destek talebinize yanıt geldi', rota: '/destek' });
    return out;
  });

  // Genel arama (Ctrl+K)
  r.get('/ara', (req) => {
    const q = g.metin(req.sorgu.q, 60);
    if (!q || q.length < 2) return [];
    const h = req.hesapId, l = '%' + q.toLocaleLowerCase('tr-TR') + '%', out = [];
    db().prepare('SELECT id, unvan, tur FROM cariler WHERE hesap_id=? AND (LOWER(unvan) LIKE ? OR vergi_no LIKE ? OR telefon LIKE ?) LIMIT 6').all(h, l, l, l)
      .forEach(c => out.push({ tur: 'Cari', baslik: c.unvan, rota: `/cariler/${c.id}` }));
    db().prepare('SELECT b.id, b.tip, b.no, c.unvan FROM belgeler b LEFT JOIN cariler c ON c.id=b.cari_id WHERE b.hesap_id=? AND (LOWER(b.no) LIKE ? OR LOWER(c.unvan) LIKE ?) LIMIT 5').all(h, l, l)
      .forEach(b => out.push({ tur: b.tip.includes('fatura') || b.tip.includes('iade') ? 'Fatura' : 'Teklif', baslik: `${b.no} — ${b.unvan || ''}`, rota: (b.tip === 'teklif' || b.tip === 'siparis') ? `/teklifler/${b.id}` : `/faturalar/${b.id}` }));
    db().prepare(`SELECT h.bagisci_adi, k.id AS kid, k.kurban_no, k.organizasyon_id FROM hisseler h JOIN kurbanlar k ON k.id=h.kurban_id WHERE h.hesap_id=? AND (LOWER(h.bagisci_adi) LIKE ? OR h.bagisci_telefon LIKE ?) LIMIT 6`).all(h, l, l)
      .forEach(x => out.push({ tur: 'Kurban hissedarı', baslik: `${x.bagisci_adi} — Kurban ${x.kurban_no}`, rota: `/kurban/${x.organizasyon_id}/kurban/${x.kid}` }));
    const modRota = {}; require('../moduller').MODULLER.forEach(m => { modRota[m.anahtar] = m.rota; });
    db().prepare('SELECT id, modul, baslik FROM kayitlar WHERE hesap_id=? AND LOWER(baslik) LIKE ? LIMIT 10').all(h, l)
      .forEach(k => out.push({ tur: (KAYIT_MODULLERI[k.modul] || {}).tekil || k.modul, baslik: k.baslik, rota: `${modRota[k.modul]}/${k.id}` }));
    db().prepare("SELECT id, ad, soyad FROM personeller WHERE hesap_id=? AND LOWER(ad || ' ' || soyad) LIKE ? LIMIT 4").all(h, l)
      .forEach(p => out.push({ tur: 'Personel', baslik: `${p.ad} ${p.soyad}`, rota: `/personel/${p.id}` }));
    db().prepare('SELECT id, ad, kod FROM urunler WHERE hesap_id=? AND (LOWER(ad) LIKE ? OR LOWER(kod) LIKE ? OR barkod LIKE ?) LIMIT 4').all(h, l, l, l)
      .forEach(u => out.push({ tur: 'Ürün', baslik: `${u.ad}${u.kod ? ' (' + u.kod + ')' : ''}`, rota: `/urunler/${u.id}` }));
    return out.slice(0, 30);
  });

  // ─── Raporlar ───
  r.get('/rapor/gelir-gider', (req) => {
    const bas = g.tarih(req.sorgu.bas) || bugun().slice(0, 4) + '-01-01', bit = g.tarih(req.sorgu.bit) || bugun();
    const satir = db().prepare(`SELECT yon, COALESCE(kategori,'Kategorisiz') AS kategori, SUM(tutar) AS tutar, COUNT(*) AS adet FROM finans_hareketleri
      WHERE hesap_id=? AND transfer_id IS NULL AND tarih BETWEEN ? AND ? GROUP BY yon, kategori ORDER BY tutar DESC`).all(req.hesapId, bas, bit);
    const aylik = db().prepare(`SELECT substr(tarih,1,7) AS ay, yon, SUM(tutar) AS tutar FROM finans_hareketleri WHERE hesap_id=? AND transfer_id IS NULL AND tarih BETWEEN ? AND ? GROUP BY ay, yon ORDER BY ay`).all(req.hesapId, bas, bit);
    const gelir = satir.filter(s => s.yon === 'giris'), gider = satir.filter(s => s.yon === 'cikis');
    return { bas, bit, gelir, gider, toplam_gelir: yuvarla(gelir.reduce((s, x) => s + x.tutar, 0)), toplam_gider: yuvarla(gider.reduce((s, x) => s + x.tutar, 0)), aylik };
  });

  r.get('/rapor/kar-zarar', (req) => {
    const yil = String(g.tamsayi(req.sorgu.yil) || bugun().slice(0, 4));
    const ay = Array.from({ length: 12 }, (_, i) => `${yil}-${String(i + 1).padStart(2, '0')}`);
    const satirlar = {};
    const ekle = (grup, kalem, a, t) => { const k = grup + '|' + kalem; satirlar[k] = satirlar[k] || { grup, kalem, aylar: Array(12).fill(0) }; satirlar[k].aylar[+a.slice(5, 7) - 1] += t; };
    db().prepare(`SELECT tip, substr(tarih,1,7) AS a, SUM(ara_toplam-iskonto) AS t FROM belgeler WHERE hesap_id=? AND tip IN ('satis_fatura','alis_fatura','satis_iade','alis_iade') AND durum<>'iptal' AND substr(tarih,1,4)=? GROUP BY tip, a`).all(req.hesapId, yil)
      .forEach(b => {
        if (b.tip === 'satis_fatura') ekle('gelir', 'Satışlar (KDV hariç)', b.a, b.t);
        if (b.tip === 'satis_iade') ekle('gelir', 'Satış iadeleri', b.a, -b.t);
        if (b.tip === 'alis_fatura') ekle('gider', 'Alışlar (KDV hariç)', b.a, b.t);
        if (b.tip === 'alis_iade') ekle('gider', 'Alış iadeleri', b.a, -b.t);
      });
    const masrafKdv = {};
    hepsi(req.hesapId, 'masraflar').forEach(m => { const o = +m.kdv_orani || 0; masrafKdv[m.id] = o; });
    db().prepare(`SELECT yon, COALESCE(kategori,'Diğer') AS kategori, substr(tarih,1,7) AS a, tutar, kaynak, kaynak_id FROM finans_hareketleri WHERE hesap_id=? AND ${NAKIT_DISI} AND substr(tarih,1,4)=?`).all(req.hesapId, yil)
      .forEach(h => {
        let t = h.tutar;
        if (h.kaynak === 'kayit:masraflar' && masrafKdv[h.kaynak_id]) t = t / (1 + masrafKdv[h.kaynak_id] / 100);
        ekle(h.yon === 'giris' ? 'gelir' : 'gider', h.kategori, h.a, t);
      });
    const liste = Object.values(satirlar).map(s => ({ ...s, aylar: s.aylar.map(yuvarla), toplam: yuvarla(s.aylar.reduce((a, b) => a + b, 0)) }));
    const top = (grp) => ay.map((_, i) => yuvarla(liste.filter(s => s.grup === grp).reduce((a, s) => a + s.aylar[i], 0)));
    const tg = top('gelir'), tgd = top('gider');
    return { yil, aylar: ay, gelir: liste.filter(s => s.grup === 'gelir').sort((a, b) => b.toplam - a.toplam), gider: liste.filter(s => s.grup === 'gider').sort((a, b) => b.toplam - a.toplam),
      toplam_gelir: tg, toplam_gider: tgd, net: tg.map((x, i) => yuvarla(x - tgd[i])) };
  });

  r.get('/rapor/kdv', (req) => {
    const yil = String(g.tamsayi(req.sorgu.yil) || bugun().slice(0, 4));
    const aylarL = Array.from({ length: 12 }, (_, i) => `${yil}-${String(i + 1).padStart(2, '0')}`);
    const b = db().prepare(`SELECT tip, substr(tarih,1,7) AS a, SUM(kdv_toplam) AS k, SUM(ara_toplam-iskonto) AS m FROM belgeler WHERE hesap_id=? AND durum<>'iptal' AND tip IN ('satis_fatura','alis_fatura','satis_iade','alis_iade') AND substr(tarih,1,4)=? GROUP BY tip, a`).all(req.hesapId, yil);
    const masraflar = hepsi(req.hesapId, 'masraflar').filter(m => (m.tarih || '').startsWith(yil));
    let devreden = 0;
    const satir = aylarL.map(a => {
      const f = (tip, al) => (b.find(x => x.tip === tip && x.a === a) || {})[al] || 0;
      const mk = masraflar.filter(m => m.tarih.startsWith(a)).reduce((s, m) => { const o = +m.kdv_orani || 0; return s + (m.tutar || 0) * o / (100 + o); }, 0);
      const hesaplanan = f('satis_fatura', 'k') - f('satis_iade', 'k');
      const indirilecek = f('alis_fatura', 'k') - f('alis_iade', 'k') + mk;
      const fark = hesaplanan - indirilecek - devreden;
      const odenecek = Math.max(0, fark); const yeniDevreden = Math.max(0, -fark);
      const r2 = { ay: a, matrah_satis: yuvarla(f('satis_fatura', 'm') - f('satis_iade', 'm')), hesaplanan: yuvarla(hesaplanan), indirilecek: yuvarla(indirilecek), masraf_kdv: yuvarla(mk), onceki_devreden: yuvarla(devreden), odenecek: yuvarla(odenecek), devreden: yuvarla(yeniDevreden) };
      devreden = yeniDevreden; return r2;
    });
    return { yil, satirlar: satir };
  });

  r.get('/rapor/yaslandirma', (req) => {
    const tip = req.sorgu.tip === 'borc' ? 'alis_fatura' : 'satis_fatura';
    const b = db().prepare(`SELECT b.cari_id, c.unvan, b.vade, b.tarih, b.genel_toplam-b.odenen AS kalan FROM belgeler b JOIN cariler c ON c.id=b.cari_id
      WHERE b.hesap_id=? AND b.tip=? AND b.durum IN ('acik','kismi')`).all(req.hesapId, tip);
    const bugunT = new Date(bugun()).getTime(); const m = {};
    b.forEach(x => {
      const r2 = m[x.cari_id] = m[x.cari_id] || { cari_id: x.cari_id, unvan: x.unvan, vadesi_gelmemis: 0, g0_30: 0, g31_60: 0, g61_90: 0, g90: 0, toplam: 0 };
      const gun = Math.floor((bugunT - new Date(x.vade || x.tarih).getTime()) / 86400000);
      const k = gun < 0 ? 'vadesi_gelmemis' : gun <= 30 ? 'g0_30' : gun <= 60 ? 'g31_60' : gun <= 90 ? 'g61_90' : 'g90';
      r2[k] += x.kalan; r2.toplam += x.kalan;
    });
    const l = Object.values(m).map(x => { Object.keys(x).forEach(k => { if (typeof x[k] === 'number' && k !== 'cari_id') x[k] = yuvarla(x[k]); }); return x; }).sort((a, c) => c.toplam - a.toplam);
    return { tip: req.sorgu.tip === 'borc' ? 'borc' : 'alacak', satirlar: l };
  });

  r.get('/rapor/nakit-akisi', (req) => {
    const gun = Math.min(365, Math.max(14, g.tamsayi(req.sorgu.gun, 90)));
    const bas = bugun(); let bakiye = nakit(req.hesapId).toplam;
    const haftalar = [];
    for (let i = 0; i < Math.ceil(gun / 7); i++) haftalar.push({ bas: gunEkle(bas, i * 7), bit: gunEkle(bas, i * 7 + 6), giris: 0, cikis: 0 });
    const yerlestir = (tarih, yon, t) => { const h = haftalar.find(x => tarih <= x.bit) || null; if (h) h[yon] += t; };
    db().prepare("SELECT tip, vade, tarih, genel_toplam-odenen AS kalan FROM belgeler WHERE hesap_id=? AND tip IN ('satis_fatura','alis_fatura') AND durum IN ('acik','kismi')").all(req.hesapId)
      .forEach(b => { const t = b.vade || b.tarih; yerlestir(t < bas ? bas : t, b.tip === 'satis_fatura' ? 'giris' : 'cikis', b.kalan); });
    db().prepare("SELECT yon, vade, tutar FROM cek_senet WHERE hesap_id=? AND durum='portfoy'").all(req.hesapId)
      .forEach(c => yerlestir(c.vade < bas ? bas : c.vade, c.yon === 'alinan' ? 'giris' : 'cikis', c.tutar));
    const maas = db().prepare('SELECT COALESCE(SUM(maas),0) AS t FROM personeller WHERE hesap_id=? AND aktif=1').get(req.hesapId).t;
    if (maas) haftalar.forEach(h => { const ayBasi = h.bas.slice(0, 8) + '01'; if (h.bas <= gunEkle(ayBasi, 30) && h.bas.slice(8) <= '07') h.cikis += maas; });
    haftalar.forEach(h => { bakiye += h.giris - h.cikis; h.giris = yuvarla(h.giris); h.cikis = yuvarla(h.cikis); h.bakiye = yuvarla(bakiye); });
    return { baslangic: nakit(req.hesapId).toplam, haftalar, maas_tahmini: yuvarla(maas) };
  });

  r.get('/rapor/bagis', (req) => {
    const yil = String(g.tamsayi(req.sorgu.yil) || bugun().slice(0, 4));
    const l = hepsi(req.hesapId, 'bagislar').filter(b => (b.tarih || '').startsWith(yil));
    const grup = (f) => { const m = {}; l.forEach(b => { const k = f(b) || 'Belirtilmemiş'; m[k] = m[k] || { ad: k, tutar: 0, adet: 0 }; m[k].tutar += b.tutar || 0; m[k].adet++; }); return Object.values(m).map(x => ({ ...x, tutar: yuvarla(x.tutar) })).sort((a, b) => b.tutar - a.tutar); };
    const kurban = db().prepare('SELECT * FROM organizasyonlar WHERE hesap_id=? AND yil=?').all(req.hesapId, +yil).map(o => ({ ad: o.ad, ...orgOzet(req.hesapId, o) }));
    return { yil, toplam: yuvarla(l.reduce((s, b) => s + (b.tutar || 0), 0)), adet: l.length, turler: grup(b => b.bagis_turu), aylar: grup(b => (b.tarih || '').slice(0, 7)).sort((a, b) => a.ad.localeCompare(b.ad)),
      odeme: grup(b => b.odeme_yontemi), bagiscilar: grup(b => b.bagisci).slice(0, 25), kurban };
  });

  r.get('/rapor/stok', (req) => {
    const st = urunStoklari(req.hesapId);
    const l = db().prepare('SELECT id, kod, ad, kategori, birim, alis_fiyati, satis_fiyati, kritik_stok FROM urunler WHERE hesap_id=? AND stok_takip=1 AND aktif=1 ORDER BY ad').all(req.hesapId)
      .map(u => ({ ...u, stok: st[u.id] || 0, deger: yuvarla(Math.max(0, st[u.id] || 0) * (u.alis_fiyati || 0)), satis_degeri: yuvarla(Math.max(0, st[u.id] || 0) * (u.satis_fiyati || 0)) }));
    return { urunler: l, toplam: yuvarla(l.reduce((s, u) => s + u.deger, 0)), satis_toplam: yuvarla(l.reduce((s, u) => s + u.satis_degeri, 0)) };
  });

  // İstemcideki herhangi bir tabloyu Excel'e çevirir
  r.post('/rapor/excel', { limit: 8 * 1024 * 1024 }, (req, res) => {
    const b = req.body;
    if (!Array.isArray(b.basliklar) || !Array.isArray(b.satirlar)) throw hata(400, 'Tablo verisi gerekli');
    const basliklar = b.basliklar.slice(0, 60).map(x => String(x).slice(0, 80));
    const satirlar = b.satirlar.slice(0, 20000).map(s => (Array.isArray(s) ? s : []).slice(0, 60).map(v => typeof v === 'number' ? v : String(v ?? '').slice(0, 1000)));
    res.indir(X.olustur([{ ad: g.metin(b.baslik, 31) || 'Rapor', ust: b.baslik ? [String(b.baslik).slice(0, 120)] : undefined, basliklar, satirlar, para: (b.para || []).filter(Number.isInteger) }]), `${(g.metin(b.baslik, 60) || 'rapor')}.xlsx`, X.XLSX_TIP);
  });
};
