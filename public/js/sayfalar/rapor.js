// Raporlar merkezi
import { D, api, html, yerlestir, $, para, sayi, tarih, sayfaBaslik, kpi, bos, cubukGrafik, yatayCubuk, ayKisa, ayAdi, excelTablo, baglan, bugun } from '../cekirdek.js';

const RAPORLAR = [
  { k: 'gelir-gider', ad: 'Gelir-gider', ikon: 'fa-money-bill-trend-up', acik: 'Kategori ve ay bazında kasa-banka giriş çıkışları', herkes: true },
  { k: 'kar-zarar', ad: 'Kâr-zarar', ikon: 'fa-chart-line', acik: 'Aylık gelir tablosu: satışlar, alışlar ve giderler (KDV hariç)', tur: ['sirket', 'muhasebe', 'esnaf', 'stk'] },
  { k: 'kdv', ad: 'KDV raporu', ikon: 'fa-percent', acik: 'Hesaplanan, indirilecek, ödenecek ve devreden KDV', tur: ['sirket', 'muhasebe', 'esnaf'] },
  { k: 'yaslandirma', ad: 'Alacak yaşlandırma', ikon: 'fa-hourglass-half', acik: 'Açık faturaların vadeye göre dağılımı', tur: ['sirket', 'muhasebe', 'esnaf', 'stk'] },
  { k: 'borc-yaslandirma', ad: 'Borç yaşlandırma', ikon: 'fa-hourglass-end', acik: 'Tedarikçi borçlarının vadeye göre dağılımı', tur: ['sirket', 'esnaf'] },
  { k: 'nakit-akisi', ad: 'Nakit akışı tahmini', ikon: 'fa-water', acik: 'Önümüzdeki 90 gün: açık faturalar, çekler ve maaşlar', herkes: true },
  { k: 'bagis', ad: 'Bağış raporu', ikon: 'fa-hand-holding-heart', acik: 'Türe, aya, ödeme yöntemine göre bağışlar ve kurban özeti', tur: ['stk'] },
  { k: 'stok', ad: 'Stok değer raporu', ikon: 'fa-warehouse', acik: 'Ürün bazında stok miktarı ve değeri', tur: ['sirket', 'esnaf', 'stk'] },
];

export async function merkez(kok) {
  const tur = D.oturum.hesap.tur;
  const sirala = [...RAPORLAR].sort((a, b) => (b.herkes || (b.tur || []).indexOf(tur) === 0 ? 1 : 0) - (a.herkes || (a.tur || []).indexOf(tur) === 0 ? 1 : 0));
  const uygun = sirala.filter(r => r.herkes || (r.tur || []).includes(tur));
  const diger = RAPORLAR.filter(r => !uygun.includes(r));
  const kart = (r) => html`<a class="kart" href="/raporlar/${r.k}" style="display:block;color:inherit;text-decoration:none"><div class="kart-govde" style="display:flex;gap:14px;align-items:flex-start"><span class="l-ikon" style="width:40px;height:40px;border-radius:10px;background:var(--birincil-acik);color:var(--birincil);display:grid;place-items:center;flex:none"><i class="fa-solid ${r.ikon}"></i></span><span><strong style="display:block;font-size:14.5px">${r.ad}</strong><span class="soluk" style="font-size:13px">${r.acik}</span></span></div></a>`;
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Raporlar', alt: 'Hesap türünüze uygun raporlar önce gösterilir. Her raporu Excel\'e aktarabilir veya yazdırabilirsiniz.' })}
    <div class="izgara izgara-3">${uygun.map(kart)}</div>${diger.length ? html`<h2 style="font-size:14px;margin:24px 0 10px;color:var(--soluk)">Diğer raporlar</h2><div class="izgara izgara-3">${diger.map(kart)}</div>` : ''}
    ${D.oturum.menu.faaliyetler.includes('kurban') ? html`<p class="soluk" style="margin-top:20px">Kurban organizasyonu raporları için <a href="/kurban">Kurban</a> sayfasındaki organizasyonun Rapor sekmesini kullanın.</p>` : ''}`);
}

function donemSecici(bas, bit) {
  return html`<div class="filtre-cubuk" style="border:0;padding:0 0 14px"><input type="date" id="bas" value="${bas}" style="width:auto" aria-label="Başlangıç"><input type="date" id="bit" value="${bit}" style="width:auto" aria-label="Bitiş">
    <div class="cip-sira">${[['ay', 'Bu ay'], ['ceyrek', 'Son 3 ay'], ['yil', 'Bu yıl'], ['gecen', 'Geçen yıl']].map(([k, a]) => html`<button class="cip" data-eylem="donem" data-k="${k}">${a}</button>`)}</div></div>`;
}
function donemHesapla(k) {
  const b = bugun(), y = +b.slice(0, 4);
  if (k === 'ay') return [b.slice(0, 8) + '01', b];
  if (k === 'ceyrek') { const d = new Date(); d.setMonth(d.getMonth() - 3); return [d.toISOString().slice(0, 10), b]; }
  if (k === 'yil') return [`${y}-01-01`, b];
  return [`${y - 1}-01-01`, `${y - 1}-12-31`];
}

export async function rapor(kok, { rapor: r }, sorgu) {
  const tanim = RAPORLAR.find(x => x.k === r);
  if (!tanim) { yerlestir(kok, bos({ baslik: 'Rapor bulunamadı' })); return; }
  const ust = (eylem) => sayfaBaslik({ baslik: tanim.ad, alt: tanim.acik, kirinti: [{ ad: 'Raporlar', rota: '/raporlar' }, { ad: tanim.ad }], eylemler: html`${eylem || ''}<button class="dugme" data-eylem="excel"><i class="fa-solid fa-file-excel"></i>Excel</button><button class="dugme" data-eylem="yazdir"><i class="fa-solid fa-print"></i>Yazdır</button>` });
  let excel = () => {};
  const yil = +(sorgu.yil || new Date().getFullYear());
  const yilSec = html`<div class="dugme-grup"><a class="dugme" href="/raporlar/${r}?yil=${yil - 1}">${yil - 1}</a><button class="dugme secili">${yil}</button><a class="dugme" href="/raporlar/${r}?yil=${yil + 1}">${yil + 1}</a></div>`;

  if (r === 'gelir-gider') {
    let bas = sorgu.bas || `${new Date().getFullYear()}-01-01`, bit = sorgu.bit || bugun();
    const ciz = async () => {
      const v = await api('GET', `/rapor/gelir-gider?bas=${bas}&bit=${bit}`);
      const seri = {}; v.aylik.forEach(x => { seri[x.ay] = seri[x.ay] || { ay: x.ay, giris: 0, cikis: 0 }; seri[x.ay][x.yon] = x.tutar; });
      const tablo = (l, tip) => html`<table class="tablo"><thead><tr><th>Kategori</th><th class="sag">Adet</th><th class="sag">Tutar</th><th class="sag">Pay</th></tr></thead><tbody>${l.map(x => html`<tr><td>${x.kategori}</td><td class="sag">${x.adet}</td><td class="sag">${para(x.tutar)}</td><td class="sag">%${((x.tutar / (tip === 'g' ? v.toplam_gelir : v.toplam_gider) || 0) * 100).toFixed(1)}</td></tr>`)}</tbody><tfoot><tr><td>Toplam</td><td></td><td class="sag">${para(tip === 'g' ? v.toplam_gelir : v.toplam_gider)}</td><td></td></tr></tfoot></table>`;
      yerlestir(kok, html`${ust()}${donemSecici(bas, bit)}<div class="kpi-sira">${kpi({ etiket: 'Toplam giriş', deger: para(v.toplam_gelir), tur: 'basari' })}${kpi({ etiket: 'Toplam çıkış', deger: para(v.toplam_gider), tur: 'tehlike' })}${kpi({ etiket: 'Net', deger: para(v.toplam_gelir - v.toplam_gider), tur: 'bilgi' })}</div>
        <section class="kart"><div class="kart-baslik"><h2>Aylık dağılım</h2></div><div class="kart-govde">${cubukGrafik(Object.values(seri), { etiket: x => ayKisa(x.ay) })}</div></section>
        <div class="izgara izgara-2 bosluk-ust"><section class="kart"><div class="kart-baslik"><h2>Girişler</h2></div><div class="tablo-kap">${tablo(v.gelir, 'g')}</div></section><section class="kart"><div class="kart-baslik"><h2>Çıkışlar</h2></div><div class="tablo-kap">${tablo(v.gider, 'c')}</div></section></div>`);
      excel = () => excelTablo(`Gelir-gider ${bas} ${bit}`, ['Yön', 'Kategori', 'Adet', 'Tutar'], [...v.gelir.map(x => ['Giriş', x.kategori, x.adet, x.tutar]), ...v.gider.map(x => ['Çıkış', x.kategori, x.adet, x.tutar])], [3]);
      $('#bas').addEventListener('change', e => { bas = e.target.value; ciz(); }); $('#bit').addEventListener('change', e => { bit = e.target.value; ciz(); });
    };
    baglan(kok, { donem: (el) => { [bas, bit] = donemHesapla(el.dataset.k); ciz(); }, excel: () => excel(), yazdir: () => window.print() });
    return ciz();
  }
  if (r === 'kar-zarar') {
    const v = await api('GET', '/rapor/kar-zarar?yil=' + yil);
    const satir = (s) => html`<tr><td style="white-space:nowrap">${s.kalem}</td>${s.aylar.map(x => html`<td class="sag">${x ? para(x, false) : ''}</td>`)}<td class="sag kalin">${para(s.toplam, false)}</td></tr>`;
    const top = (l) => l.reduce((a, b) => a + b, 0);
    yerlestir(kok, html`${ust(yilSec)}<div class="kpi-sira">${kpi({ etiket: 'Toplam gelir', deger: para(top(v.toplam_gelir)), tur: 'basari' })}${kpi({ etiket: 'Toplam gider', deger: para(top(v.toplam_gider)), tur: 'tehlike' })}${kpi({ etiket: top(v.net) >= 0 ? 'Net kâr' : 'Net zarar', deger: para(Math.abs(top(v.net))), tur: top(v.net) >= 0 ? 'bilgi' : 'tehlike' })}</div>
      <section class="kart"><div class="tablo-kap"><table class="tablo"><thead><tr><th>Kalem</th>${v.aylar.map(a => html`<th class="sag">${ayKisa(a)}</th>`)}<th class="sag">Toplam</th></tr></thead><tbody>
        <tr class="ara-toplam"><td colspan="14">Gelirler</td></tr>${v.gelir.map(satir)}<tr class="ara-toplam"><td>Toplam gelir</td>${v.toplam_gelir.map(x => html`<td class="sag">${para(x, false)}</td>`)}<td class="sag">${para(top(v.toplam_gelir), false)}</td></tr>
        <tr class="ara-toplam"><td colspan="14">Giderler</td></tr>${v.gider.map(satir)}<tr class="ara-toplam"><td>Toplam gider</td>${v.toplam_gider.map(x => html`<td class="sag">${para(x, false)}</td>`)}<td class="sag">${para(top(v.toplam_gider), false)}</td></tr></tbody>
        <tfoot><tr><td>Net</td>${v.net.map(x => html`<td class="sag ${x < 0 ? 'para-negatif' : ''}">${para(x, false)}</td>`)}<td class="sag">${para(top(v.net), false)}</td></tr></tfoot></table></div></section>
      <p class="soluk" style="margin-top:10px;font-size:12.5px">Tahsilat, ödeme, virman ve çek hareketleri fatura ile zaten hesaba katıldığı için gelir-gidere tekrar eklenmez. Masraf fişlerinde KDV ayrıştırılır.</p>`);
    excel = () => excelTablo(`Kar-zarar ${yil}`, ['Grup', 'Kalem', ...v.aylar.map(ayKisa), 'Toplam'], [...v.gelir.map(s => ['Gelir', s.kalem, ...s.aylar, s.toplam]), ...v.gider.map(s => ['Gider', s.kalem, ...s.aylar, s.toplam]), ['', 'Net', ...v.net, top(v.net)]], Array.from({ length: 13 }, (_, i) => i + 2));
  } else if (r === 'kdv') {
    const v = await api('GET', '/rapor/kdv?yil=' + yil);
    yerlestir(kok, html`${ust(yilSec)}<section class="kart"><div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Dönem</th><th class="sag">Satış matrahı</th><th class="sag">Hesaplanan KDV</th><th class="sag">İndirilecek KDV</th><th class="sag">Önceki devreden</th><th class="sag">Ödenecek</th><th class="sag">Sonraki aya devreden</th></tr></thead><tbody>
      ${v.satirlar.map(s => html`<tr><td class="mk-baslik">${ayAdi(s.ay)}</td><td class="sag" data-etiket="Matrah">${para(s.matrah_satis)}</td><td class="sag" data-etiket="Hesaplanan">${para(s.hesaplanan)}</td><td class="sag" data-etiket="İndirilecek">${para(s.indirilecek)}${s.masraf_kdv ? html`<span class="ikincil">masraf ${para(s.masraf_kdv)}</span>` : ''}</td><td class="sag" data-etiket="Devreden">${para(s.onceki_devreden)}</td><td class="sag kalin" data-etiket="Ödenecek">${para(s.odenecek)}</td><td class="sag" data-etiket="Sonraki">${para(s.devreden)}</td></tr>`)}</tbody>
      <tfoot><tr><td>Yıl toplamı</td><td class="sag">${para(v.satirlar.reduce((a, s) => a + s.matrah_satis, 0))}</td><td class="sag">${para(v.satirlar.reduce((a, s) => a + s.hesaplanan, 0))}</td><td class="sag">${para(v.satirlar.reduce((a, s) => a + s.indirilecek, 0))}</td><td></td><td class="sag">${para(v.satirlar.reduce((a, s) => a + s.odenecek, 0))}</td><td></td></tr></tfoot></table></div></section>
      <p class="soluk" style="margin-top:10px;font-size:12.5px">Bu rapor ön muhasebe kayıtlarınızdan hazırlanan bir özettir; beyanname öncesi mali müşavirinizle kontrol edin.</p>`);
    excel = () => excelTablo(`KDV ${yil}`, ['Dönem', 'Satış matrahı', 'Hesaplanan', 'İndirilecek', 'Önceki devreden', 'Ödenecek', 'Devreden'], v.satirlar.map(s => [s.ay, s.matrah_satis, s.hesaplanan, s.indirilecek, s.onceki_devreden, s.odenecek, s.devreden]), [1, 2, 3, 4, 5, 6]);
  } else if (r === 'yaslandirma' || r === 'borc-yaslandirma') {
    const v = await api('GET', '/rapor/yaslandirma?tip=' + (r === 'borc-yaslandirma' ? 'borc' : 'alacak'));
    const t = (k) => v.satirlar.reduce((a, s) => a + s[k], 0);
    const K = [['vadesi_gelmemis', 'Vadesi gelmemiş'], ['g0_30', '0-30 gün'], ['g31_60', '31-60 gün'], ['g61_90', '61-90 gün'], ['g90', '90+ gün']];
    yerlestir(kok, html`${ust()}<div class="kpi-sira">${K.map(([k, a], i) => kpi({ etiket: a, deger: para(t(k)), tur: ['notr', 'bilgi', 'uyari', 'uyari', 'tehlike'][i] }))}</div>
      <section class="kart">${v.satirlar.length ? html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Cari</th>${K.map(([, a]) => html`<th class="sag">${a}</th>`)}<th class="sag">Toplam</th></tr></thead><tbody>${v.satirlar.map(s => html`<tr><td class="mk-baslik"><a href="/cariler/${s.cari_id}">${s.unvan}</a></td>${K.map(([k, a]) => html`<td class="sag ${k === 'g90' && s[k] ? 'para-negatif' : ''}" data-etiket="${a}">${s[k] ? para(s[k]) : '—'}</td>`)}<td class="sag kalin" data-etiket="Toplam">${para(s.toplam)}</td></tr>`)}</tbody>
        <tfoot><tr><td>Toplam</td>${K.map(([k]) => html`<td class="sag">${para(t(k))}</td>`)}<td class="sag">${para(t('toplam'))}</td></tr></tfoot></table></div>` : bos({ ikon: 'fa-check', baslik: 'Açık fatura yok' })}</section>`);
    excel = () => excelTablo(tanim.ad, ['Cari', ...K.map(x => x[1]), 'Toplam'], v.satirlar.map(s => [s.unvan, ...K.map(([k]) => s[k]), s.toplam]), [1, 2, 3, 4, 5, 6]);
  } else if (r === 'nakit-akisi') {
    const v = await api('GET', '/rapor/nakit-akisi?gun=' + (sorgu.gun || 90));
    yerlestir(kok, html`${ust()}<div class="kpi-sira">${kpi({ etiket: 'Bugünkü nakit', deger: para(v.baslangic), tur: 'bilgi' })}${kpi({ etiket: 'Beklenen giriş', deger: para(v.haftalar.reduce((a, h) => a + h.giris, 0)), tur: 'basari' })}${kpi({ etiket: 'Beklenen çıkış', deger: para(v.haftalar.reduce((a, h) => a + h.cikis, 0)), tur: 'tehlike', alt: v.maas_tahmini ? `Aylık maaş tahmini ${para(v.maas_tahmini)} dahil` : '' })}${kpi({ etiket: 'Dönem sonu tahmini', deger: para(v.haftalar.length ? v.haftalar[v.haftalar.length - 1].bakiye : v.baslangic), tur: 'muhur' })}</div>
      <section class="kart"><div class="kart-baslik"><h2>Haftalık tahmin</h2></div><div class="kart-govde">${cubukGrafik(v.haftalar, { etiket: h => tarih(h.bas).slice(0, 5) })}</div>
      <div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Hafta</th><th class="sag">Giriş</th><th class="sag">Çıkış</th><th class="sag">Tahmini bakiye</th></tr></thead><tbody>${v.haftalar.map(h => html`<tr><td class="mk-baslik">${tarih(h.bas)} – ${tarih(h.bit)}</td><td class="sag para-pozitif" data-etiket="Giriş">${h.giris ? para(h.giris) : '—'}</td><td class="sag para-negatif" data-etiket="Çıkış">${h.cikis ? para(h.cikis) : '—'}</td><td class="sag kalin ${h.bakiye < 0 ? 'para-negatif' : ''}" data-etiket="Bakiye">${para(h.bakiye)}</td></tr>`)}</tbody></table></div></section>`);
    excel = () => excelTablo('Nakit akışı', ['Başlangıç', 'Bitiş', 'Giriş', 'Çıkış', 'Bakiye'], v.haftalar.map(h => [h.bas, h.bit, h.giris, h.cikis, h.bakiye]), [2, 3, 4]);
  } else if (r === 'bagis') {
    const v = await api('GET', '/rapor/bagis?yil=' + yil);
    yerlestir(kok, html`${ust(yilSec)}<div class="kpi-sira">${kpi({ etiket: 'Toplam bağış', deger: para(v.toplam), tur: 'basari' })}${kpi({ etiket: 'Bağış adedi', deger: sayi(v.adet), tur: 'bilgi' })}${kpi({ etiket: 'Ortalama bağış', deger: para(v.adet ? v.toplam / v.adet : 0), tur: 'notr' })}${v.kurban.map(k => kpi({ etiket: k.ad, deger: para(k.tahsil_edilen), alt: `${k.dolu_hisse} hisse`, tur: 'muhur' }))}</div>
      <div class="izgara izgara-2"><section class="kart"><div class="kart-baslik"><h2>Bağış türlerine göre</h2></div><div class="kart-govde">${yatayCubuk(v.turler)}</div></section>
      <section class="kart"><div class="kart-baslik"><h2>Aylara göre</h2></div><div class="kart-govde">${cubukGrafik(v.aylar.map(a => ({ ay: a.ad, giris: a.tutar })), { anahtarlar: [['giris', 'Bağış', 'g3']], etiket: x => ayKisa(x.ay) })}</div></section>
      <section class="kart"><div class="kart-baslik"><h2>Ödeme yöntemleri</h2></div><div class="kart-govde">${yatayCubuk(v.odeme, { renk: 'g2' })}</div></section>
      <section class="kart"><div class="kart-baslik"><h2>En çok bağış yapanlar</h2></div><div class="tablo-kap"><table class="tablo"><thead><tr><th>Bağışçı</th><th class="sag">Adet</th><th class="sag">Toplam</th></tr></thead><tbody>${v.bagiscilar.map(b => html`<tr><td>${b.ad}</td><td class="sag">${b.adet}</td><td class="sag">${para(b.tutar)}</td></tr>`)}</tbody></table></div></section></div>`);
    excel = () => excelTablo(`Bağış raporu ${yil}`, ['Bağış türü', 'Adet', 'Tutar'], v.turler.map(t => [t.ad, t.adet, t.tutar]), [2]);
  } else if (r === 'stok') {
    const v = await api('GET', '/rapor/stok');
    yerlestir(kok, html`${ust()}<div class="kpi-sira">${kpi({ etiket: 'Stok değeri (alış)', deger: para(v.toplam), tur: 'muhur' })}${kpi({ etiket: 'Stok değeri (satış)', deger: para(v.satis_toplam), tur: 'basari' })}${kpi({ etiket: 'Potansiyel brüt kâr', deger: para(v.satis_toplam - v.toplam), tur: 'bilgi' })}</div>
      <section class="kart"><div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Ürün</th><th>Kod</th><th class="sag">Stok</th><th class="sag">Alış</th><th class="sag">Değer</th><th class="sag">Satış değeri</th></tr></thead><tbody>${v.urunler.map(u => html`<tr><td class="mk-baslik"><a href="/urunler/${u.id}">${u.ad}</a></td><td data-etiket="Kod">${u.kod || '—'}</td><td class="sag ${u.stok <= u.kritik_stok ? 'para-negatif' : ''}" data-etiket="Stok">${sayi(u.stok)} ${u.birim}</td><td class="sag" data-etiket="Alış">${para(u.alis_fiyati)}</td><td class="sag" data-etiket="Değer">${para(u.deger)}</td><td class="sag" data-etiket="Satış değeri">${para(u.satis_degeri)}</td></tr>`)}</tbody>
      <tfoot><tr><td colspan="4">Toplam</td><td class="sag">${para(v.toplam)}</td><td class="sag">${para(v.satis_toplam)}</td></tr></tfoot></table></div></section>`);
    excel = () => excelTablo('Stok değer raporu', ['Kod', 'Ürün', 'Stok', 'Birim', 'Alış', 'Değer', 'Satış değeri'], v.urunler.map(u => [u.kod || '', u.ad, u.stok, u.birim, u.alis_fiyati, u.deger, u.satis_degeri]), [4, 5, 6]);
  }
  baglan(kok, { excel: () => excel(), yazdir: () => window.print() });
}
