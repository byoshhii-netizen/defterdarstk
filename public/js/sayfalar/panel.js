import { D, api, html, yerlestir, para, sayi, tarih, goreceli, kpi, sayfaBaslik, cubukGrafik, yatayCubuk, ilerleme, ayKisa, bos, baglan, $ } from '../cekirdek.js';

function selam() { const s = new Date().getHours(); return s < 6 ? 'İyi geceler' : s < 12 ? 'Günaydın' : s < 18 ? 'İyi günler' : 'İyi akşamlar'; }
function degisim(bu, onceki) {
  if (!onceki) return bu ? 'Geçen ay kayıt yok' : '';
  const o = ((bu - onceki) / Math.abs(onceki)) * 100;
  return html`<span class="${o >= 0 ? 'artis' : 'azalis'}">${o >= 0 ? '+' : ''}${o.toFixed(0)}%</span> geçen aya göre`;
}

export async function panel(kok, params, sorgu) {
  const p = await api('GET', '/panel');
  const o = D.oturum, b = new Set(o.menu.bilesenler);
  const ad = o.kullanici.ad_soyad.split(' ')[0];
  const kpiler = [];
  kpiler.push(kpi({ etiket: 'Nakit varlık', deger: para(p.nakit.toplam), alt: `Kasa ${para(p.nakit.kasa)} · Banka ${para(p.nakit.banka)}`, tur: 'bilgi', ikon: 'fa-building-columns', rota: '/kasa-banka' }));
  if (b.has('bagis_ay')) kpiler.push(kpi({ etiket: 'Bu ay bağış', deger: para(p.bagis_ay.bu), alt: degisim(p.bagis_ay.bu, p.bagis_ay.onceki), tur: 'basari', ikon: 'fa-hand-holding-heart', rota: '/bagislar' }));
  if (b.has('kurban') && p.kurban) kpiler.push(kpi({ etiket: `Kurban ${p.kurban.org.yil}`, deger: `%${p.kurban.ozet.doluluk} dolu`, alt: `${sayi(p.kurban.ozet.dolu_hisse)} / ${sayi(p.kurban.ozet.toplam_hisse)} hisse`, tur: 'muhur', ikon: 'fa-cow', rota: `/kurban/${p.kurban.org.id}` }));
  if (b.has('bekleyen_hisse') && p.kurban) kpiler.push(kpi({ etiket: 'Bekleyen hisse tahsilatı', deger: para(p.kurban.ozet.bekleyen_tahsilat), alt: `${p.kurban.ozet.bekliyor + p.kurban.ozet.kismi} hisse ödeme bekliyor`, tur: 'uyari', ikon: 'fa-hourglass-half', rota: `/kurban/${p.kurban.org.id}/hissedarlar?odeme=bekliyor` }));
  if (b.has('alacak')) kpiler.push(kpi({ etiket: 'Toplam alacak', deger: para(p.alacak), alt: p.vadesi_gecen.adet ? html`<span class="azalis">${p.vadesi_gecen.adet} fatura vadesi geçti</span>` : 'Vadesi geçen yok', tur: 'basari', ikon: 'fa-arrow-trend-up', rota: '/raporlar/yaslandirma' }));
  if (b.has('borc')) kpiler.push(kpi({ etiket: 'Toplam borç', deger: para(p.borc), alt: 'Tedarikçilere', tur: 'tehlike', ikon: 'fa-arrow-trend-down', rota: '/cariler?bakiye=borc' }));
  if (b.has('satis_ay')) kpiler.push(kpi({ etiket: 'Bu ay satış', deger: para(p.satis_ay.bu.t), alt: degisim(p.satis_ay.bu.t, p.satis_ay.onceki.t), tur: 'bilgi', ikon: 'fa-file-invoice', rota: '/faturalar' }));
  if (b.has('mukellef')) kpiler.push(kpi({ etiket: 'Aktif mükellef', deger: sayi(p.mukellef.aktif), alt: `Aylık ${para(p.mukellef.aylik)} hizmet bedeli`, tur: 'bilgi', ikon: 'fa-building-user', rota: '/mukellefler' }));
  if (b.has('beyanname')) kpiler.push(kpi({ etiket: 'Bekleyen beyanname', deger: sayi(p.beyanname.bekleyen), alt: p.beyanname.geciken ? html`<span class="azalis">${p.beyanname.geciken} gecikmiş</span>` : `${p.beyanname.yedi_gun} tanesi 7 gün içinde`, tur: p.beyanname.geciken ? 'tehlike' : 'uyari', ikon: 'fa-calendar-days', rota: '/beyannameler' }));

  const gg = p.gelir_gider.map(x => ({ ...x }));
  const sik = o.menu.sik || [];
  const hosgeldin = sorgu.hosgeldin === '1';

  yerlestir(kok, html`
    ${sayfaBaslik({ baslik: `${selam()}, ${ad}`, alt: `${o.hesap.ad} · ${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}` })}
    ${hosgeldin ? html`<div class="kart" style="margin-bottom:16px;border-color:var(--birincil)"><div class="kart-govde" style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:240px"><h2 style="font-size:17px;margin-bottom:6px">Defterdar'a hoş geldiniz</h2><p class="soluk">Menünüz ve ekranlarınız ${D.tanimlar.hesapTurleri[o.hesap.tur].kisa} hesabına ve seçtiğiniz faaliyetlere göre düzenlendi. Birkaç adımda kullanıma hazır hale getirin:</p></div>
      <ol style="margin:0;padding-left:20px;line-height:2;flex:1;min-width:240px">
        <li><a href="/ayarlar/kurum">Kurum bilgilerini ve logoyu ekleyin</a></li><li><a href="/kasa-banka">Kasa ve banka hesaplarınızı tanımlayın</a></li>
        <li><a href="/ayarlar/kullanicilar">Ekip arkadaşlarınızı davet edin</a></li><li><a href="/yedekleme">Eski kurban yedeğiniz varsa içe aktarın</a></li></ol></div></div>` : ''}
    <div class="kpi-sira">${kpiler}</div>
    ${sik.length ? html`<section class="kart" style="margin-bottom:16px"><div class="kart-baslik"><div><h2>${o.menu.sik[0] && o.menu.sik[0].kullanim > 0 ? 'Sık kullandıklarınız' : 'Sizin için önerilenler'}</h2><p>Kullanım alışkanlığınıza ve hesap türünüze göre sıralanır</p></div></div><div class="kart-govde"><div class="karo-sira">${sik.map(m => html`<a class="karo" href="${m.rota}"><i class="fa-solid ${m.ikon}"></i>${m.ad}</a>`)}</div></div></section>` : ''}
    <div class="izgara izgara-3-1">
      <section class="kart"><div class="kart-baslik"><div><h2>Nakit akışı</h2><p>Son 12 ay kasa ve banka giriş-çıkışları</p></div><a class="dugme kucuk" href="/raporlar/gelir-gider">Rapor</a></div>
        <div class="kart-govde">${cubukGrafik(gg, { etiket: (x) => ayKisa(x.ay) })}</div></section>
      <section class="kart"><div class="kart-baslik"><h2>Hesap bakiyeleri</h2><a class="dugme kucuk hayalet" href="/kasa-banka">Tümü</a></div>
        ${p.nakit.hesaplar.length ? html`<ul class="liste">${p.nakit.hesaplar.slice(0, 6).map(h => html`<li><span class="l-ikon"><i class="fa-solid ${h.tur === 'kasa' ? 'fa-cash-register' : h.tur === 'kredi_karti' ? 'fa-credit-card' : 'fa-building-columns'}"></i></span><span class="l-orta"><strong><a href="/kasa-banka/${h.id}">${h.ad}</a></strong></span><span class="l-sag ${h.bakiye < 0 ? 'para-negatif' : ''}">${para(h.bakiye)}</span></li>`)}</ul>` : bos({ baslik: 'Hesap yok', ikon: 'fa-building-columns' })}
      </section>
    </div>
    <div class="izgara izgara-2 bosluk-ust">
      ${b.has('kurban') && p.kurban ? html`<section class="kart"><div class="kart-baslik"><div><h2>${p.kurban.org.ad}</h2><p>Kurban organizasyonu durumu</p></div><a class="dugme kucuk" href="/kurban/${p.kurban.org.id}">Aç</a></div><div class="kart-govde">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>Hisse doluluğu</span><strong>%${p.kurban.ozet.doluluk}</strong></div>${ilerleme(p.kurban.ozet.doluluk)}
        <dl class="tanim-listesi" style="margin-top:16px"><dt>Kurban</dt><dd>${sayi(p.kurban.ozet.toplam_kurban)} (${p.kurban.ozet.buyukbas} büyükbaş, ${p.kurban.ozet.kucukbas} küçükbaş)</dd>
        <dt>Kesilen</dt><dd>${sayi(p.kurban.ozet.kesildi)}</dd><dt>Vekalet alınan</dt><dd>${sayi(p.kurban.ozet.vekalet)} / ${sayi(p.kurban.ozet.dolu_hisse)}</dd>
        <dt>Tahsil edilen</dt><dd>${para(p.kurban.ozet.tahsil_edilen)}</dd><dt>Bekleyen</dt><dd>${para(p.kurban.ozet.bekleyen_tahsilat)}</dd></dl></div></section>` : ''}
      ${b.has('bagis_tur') ? html`<section class="kart"><div class="kart-baslik"><div><h2>Bağış dağılımı</h2><p>Bu yıl, bağış türüne göre</p></div><a class="dugme kucuk hayalet" href="/raporlar/bagis">Rapor</a></div><div class="kart-govde">${p.bagis_tur.length ? yatayCubuk(p.bagis_tur.slice(0, 7)) : bos({ ikon: 'fa-hand-holding-heart', baslik: 'Henüz bağış yok', eylem: html`<a class="dugme birincil kucuk" href="/bagislar/yeni">Bağış kaydet</a>` })}</div></section>` : ''}
      ${b.has('kritik_stok') ? html`<section class="kart"><div class="kart-baslik"><h2>Kritik stok</h2><a class="dugme kucuk hayalet" href="/urunler?kritik=1">Tümü</a></div>${p.kritik_stok.length ? html`<ul class="liste">${p.kritik_stok.map(u => html`<li><span class="l-ikon"><i class="fa-solid fa-box"></i></span><span class="l-orta"><strong><a href="/urunler/${u.id}">${u.ad}</a></strong><small>Kritik seviye ${sayi(u.kritik_stok)} ${u.birim}</small></span><span class="l-sag para-negatif">${sayi(u.stok)} ${u.birim}</span></li>`)}</ul>` : html`<div class="kart-govde soluk">Tüm ürünler yeterli stokta.</div>`}</section>` : ''}
      <section class="kart"><div class="kart-baslik"><div><h2>Yaklaşan işler</h2><p>Vadeler, çekler, beyannameler ve görevler</p></div></div>
        ${p.yaklasan.length ? html`<ul class="liste">${p.yaklasan.slice(0, 8).map(y => html`<li><span class="l-ikon" style="${y.gecikti ? 'background:var(--tehlike-acik);color:var(--tehlike)' : ''}"><i class="fa-regular fa-calendar"></i></span><span class="l-orta"><strong><a href="${y.rota}">${y.baslik || y.tur}</a></strong><small>${y.tur} · ${tarih(y.tarih)}${y.gecikti ? ' · gecikti' : ''}</small></span>${y.tutar ? html`<span class="l-sag">${para(y.tutar)}</span>` : ''}</li>`)}</ul>` : html`<div class="kart-govde soluk">Önümüzdeki 30 günde bekleyen iş yok.</div>`}</section>
      <section class="kart"><div class="kart-baslik"><h2>Son işlemler</h2>${['sahip', 'yonetici'].includes(o.kullanici.rol) ? html`<a class="dugme kucuk hayalet" href="/islem-gecmisi">Tümü</a>` : ''}</div>
        ${p.son_islemler.length ? html`<ul class="liste">${p.son_islemler.slice(0, 8).map(s => html`<li><span class="l-ikon"><i class="fa-solid fa-pen"></i></span><span class="l-orta"><strong>${s.islem}</strong><small>${s.kim} · ${goreceli(s.tarih)}</small></span></li>`)}</ul>` : html`<div class="kart-govde soluk">Henüz işlem yok.</div>`}</section>
    </div>`);
  if (hosgeldin) history.replaceState({}, '', '/panel');
}
