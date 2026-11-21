// Finans: cari, fatura, teklif, ürün-stok, kasa-banka, çek-senet, bütçe
import { D, api, html, ham, yerlestir, $, $$, para, sayi, tarih, bildir, hataGoster, baglan, degisince, gecikmeli, formGonder, modal, onayla, sayfaBaslik, kpi, bos, rozet, durumRozet, durumAd, telLink, indir, yazdir, alan, bugun, buAy, excelTablo, ayKisa, kac, dosyaOku } from '../cekirdek.js';
import { secenekler, onbellekTemizle, belgeSablon, logoVeri, yaziyla } from './ortak.js';

const izleyici = () => D.oturum.kullanici.rol === 'izleyici';
const CARI_TUR = [['musteri', 'Müşteri'], ['tedarikci', 'Tedarikçi'], ['her_ikisi', 'Müşteri ve tedarikçi'], ['bagisci', 'Bağışçı / destekçi'], ['personel', 'Personel'], ['diger', 'Diğer']];
const cariTurAd = (t) => (CARI_TUR.find(x => x[0] === t) || [, t])[1];
const BELGE_AD = { satis_fatura: 'Satış faturası', alis_fatura: 'Alış faturası', satis_iade: 'Satış iade faturası', alis_iade: 'Alış iade faturası', teklif: 'Teklif', siparis: 'Sipariş' };
const FH_TUR = [['kasa', 'Nakit kasa'], ['banka', 'Banka hesabı'], ['kredi_karti', 'Kredi kartı'], ['pos', 'POS / sanal POS'], ['diger', 'Diğer']];
const bakiyeHucre = (b) => html`<span class="sayisal ${b > 0.009 ? 'para-pozitif' : b < -0.009 ? 'para-negatif' : ''}">${para(Math.abs(b))}</span> <small class="soluk">${b > 0.009 ? '(A)' : b < -0.009 ? '(B)' : ''}</small>`;

// ─── Cariler ───
export async function cariler(kok, p, sorgu) {
  const d = { q: '', tur: sorgu.tur || '', bakiye: sorgu.bakiye || '' };
  const stk = D.oturum.hesap.tur === 'stk';
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Cari hesaplar', alt: stk ? 'Destekçi, tedarikçi ve kurum carileri; borç-alacak takibi ve ekstre.' : 'Müşteri ve tedarikçi bakiyeleri, tahsilat-ödeme ve ekstre.',
    eylemler: html`<button class="dugme" data-eylem="excel"><i class="fa-solid fa-file-excel"></i>Excel</button>${izleyici() ? '' : html`<button class="dugme birincil" data-eylem="yeni"><i class="fa-solid fa-plus"></i>Yeni cari</button>`}` })}
    <div class="kpi-sira" id="ozet"></div>
    <section class="kart"><div class="filtre-cubuk"><div class="ara"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="ara" placeholder="Unvan, vergi no, telefon" aria-label="Ara"></div>
      <select data-f="tur" style="width:auto"><option value="">Tür: tümü</option>${CARI_TUR.map(([v, e]) => html`<option value="${v}" ${d.tur === v ? 'selected' : ''}>${e}</option>`)}</select>
      <select data-f="bakiye" style="width:auto"><option value="">Bakiye: tümü</option><option value="alacak" ${d.bakiye === 'alacak' ? 'selected' : ''}>Alacaklı olduklarımız</option><option value="borc" ${d.bakiye === 'borc' ? 'selected' : ''}>Borçlu olduklarımız</option></select></div>
      <div class="tablo-kap" id="tablo"></div></section>`);
  let son = null;
  const yukle = async () => {
    const q = new URLSearchParams(); Object.entries(d).forEach(([k, v]) => v && q.set(k, v));
    son = await api('GET', '/cariler?' + q);
    yerlestir($('#ozet'), html`${kpi({ etiket: 'Toplam alacak', deger: para(son.toplam_alacak), tur: 'basari', ikon: 'fa-arrow-trend-up', alt: 'Bize borçlu cariler' })}${kpi({ etiket: 'Toplam borç', deger: para(son.toplam_borc), tur: 'tehlike', ikon: 'fa-arrow-trend-down', alt: 'Bizim borçlu olduklarımız' })}${kpi({ etiket: 'Net', deger: para(son.toplam_alacak - son.toplam_borc), tur: 'bilgi', ikon: 'fa-scale-balanced' })}${kpi({ etiket: 'Cari sayısı', deger: sayi(son.cariler.length), tur: 'notr', ikon: 'fa-address-book' })}`);
    if (!son.cariler.length) return yerlestir($('#tablo'), bos({ ikon: 'fa-address-book', baslik: d.q || d.tur || d.bakiye ? 'Bu filtreyle cari bulunamadı' : 'Henüz cari hesap yok', metin: 'Müşteri, tedarikçi veya destekçilerinizi ekleyin; faturalar ve tahsilatlar otomatik olarak bakiyeye yansır.', eylem: izleyici() ? '' : html`<button class="dugme birincil" data-eylem="yeni"><i class="fa-solid fa-plus"></i>Yeni cari</button>` }));
    yerlestir($('#tablo'), html`<table class="tablo mobil-kart"><thead><tr><th>Unvan</th><th>Tür</th><th>Telefon</th><th>Vergi no</th><th>Son hareket</th><th class="sag">Bakiye</th></tr></thead><tbody>
      ${son.cariler.map(c => html`<tr class="tiklanir" data-git="/cariler/${c.id}"><td class="mk-baslik"><strong>${c.unvan}</strong><span class="ikincil">${c.kod || ''}${c.yetkili ? ' · ' + c.yetkili : ''}</span></td><td data-etiket="Tür">${cariTurAd(c.tur)}</td><td data-etiket="Telefon">${telLink(c.telefon)}</td><td data-etiket="Vergi no">${c.vergi_no || '—'}</td><td data-etiket="Son hareket">${tarih(c.son_hareket)}</td><td class="sag" data-etiket="Bakiye">${bakiyeHucre(c.bakiye)}</td></tr>`)}</tbody></table>
      <p class="soluk" style="padding:10px 14px;font-size:12px">(A) alacaklıyız — cari bize borçlu · (B) borçluyuz — biz cariye borçluyuz</p>`);
  };
  $('#ara').addEventListener('input', gecikmeli(e => { d.q = e.target.value.trim(); yukle(); }));
  degisince(kok, '[data-f]', el => { d[el.dataset.f] = el.value; yukle(); });
  kok.addEventListener('click', e => { const tr = e.target.closest('tr[data-git]'); if (tr && !e.target.closest('a')) D.git(tr.dataset.git); });
  baglan(kok, {
    yeni: () => cariModal(null, (id) => D.git('/cariler/' + id)),
    excel: () => excelTablo('Cari hesaplar', ['Kod', 'Unvan', 'Tür', 'Yetkili', 'Telefon', 'E-posta', 'Vergi dairesi', 'Vergi no', 'Bakiye'], son.cariler.map(c => [c.kod || '', c.unvan, cariTurAd(c.tur), c.yetkili || '', c.telefon || '', c.eposta || '', c.vergi_dairesi || '', c.vergi_no || '', c.bakiye]), [8]),
  });
  await yukle();
  if (sorgu.yeni) { history.replaceState({}, '', '/cariler'); cariModal(null, (id) => D.git('/cariler/' + id)); }
}

function cariModal(c, sonra) {
  const stk = D.oturum.hesap.tur === 'stk';
  const m = modal({ baslik: c ? 'Cari bilgilerini düzenle' : 'Yeni cari hesap', genis: true, icerik: html`<form id="cari-form" class="form-izgara uclu">
    ${alan({ ad: 'unvan', etiket: 'Unvan / ad soyad', zorunlu: true, deger: c && c.unvan, tam: true })}
    ${alan({ ad: 'tur', etiket: 'Cari türü', tip: 'select', deger: c ? c.tur : (stk ? 'bagisci' : 'musteri'), secenekler: CARI_TUR })}${alan({ ad: 'kod', etiket: 'Cari kodu', deger: c && c.kod, yer: 'Otomatik' })}${alan({ ad: 'yetkili', etiket: 'Yetkili kişi', deger: c && c.yetkili })}
    ${alan({ ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: c && c.telefon })}${alan({ ad: 'eposta', etiket: 'E-posta', tip: 'email', deger: c && c.eposta })}${alan({ ad: 'il', etiket: 'İl', deger: c && c.il })}
    ${alan({ ad: 'vergi_dairesi', etiket: 'Vergi dairesi', deger: c && c.vergi_dairesi })}${alan({ ad: 'vergi_no', etiket: 'Vergi / TC kimlik no', deger: c && c.vergi_no, ek: 'inputmode="numeric" maxlength="11"' })}${alan({ ad: 'iban', etiket: 'IBAN', deger: c && c.iban })}
    ${alan({ ad: 'adres', etiket: 'Adres', tip: 'textarea', deger: c && c.adres, tam: true })}
    ${alan({ ad: 'vade_gun', etiket: 'Varsayılan vade (gün)', tip: 'number', deger: c ? c.vade_gun : 0 })}${alan({ ad: 'risk_limiti', etiket: 'Risk limiti', tip: 'number', deger: c ? c.risk_limiti : '', yardim: 'Aşılınca uyarı verilir' })}
    ${c ? '' : alan({ ad: 'acilis_bakiye', etiket: 'Açılış bakiyesi', tip: 'number', yardim: 'Pozitif: cari bize borçlu, negatif: biz borçluyuz' })}
    ${alan({ ad: 'etiketler', etiket: 'Etiketler', deger: c && c.etiketler, tam: true, yer: 'Virgülle ayırın' })}${alan({ ad: 'notlar', etiket: 'Notlar', tip: 'textarea', deger: c && c.notlar, tam: true })}</form>`,
    altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="cari-form">Kaydet</button>` });
  formGonder($('#cari-form', m.el), async (v) => {
    if (c) { await api('PUT', '/cariler/' + c.id, { ...v, aktif: c.aktif }); bildir('Cari güncellendi'); m.kapat(); onbellekTemizle(); sonra(c.id); }
    else { const r = await api('POST', '/cariler', v); bildir('Cari hesap açıldı'); m.kapat(); onbellekTemizle(); sonra(r.id); }
  });
}

async function tahsilatModal({ cari, yon = 'tahsilat', belge, sonra }) {
  const hesaplar = await secenekler('finans_hesap', true);
  if (!hesaplar.length) return bildir('Önce bir kasa veya banka hesabı tanımlayın', 'uyari');
  const kalan = belge ? Math.max(0, belge.genel_toplam - belge.odenen) : '';
  const m = modal({ baslik: yon === 'tahsilat' ? 'Tahsilat al' : 'Ödeme yap', icerik: html`<p class="onay-metin"><strong>${cari.unvan}</strong>${belge ? html` · ${belge.no} için kalan ${para(kalan)}` : ''}</p>
    <form id="th-form" class="form-izgara">${alan({ ad: 'tutar', etiket: 'Tutar', tip: 'number', zorunlu: true, deger: kalan || '', ek: 'inputmode="decimal" autofocus' })}${alan({ ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: bugun() })}
    ${alan({ ad: 'finans_hesap_id', etiket: yon === 'tahsilat' ? 'Paranın girdiği hesap' : 'Ödemenin yapıldığı hesap', tip: 'select', zorunlu: true, secenekler: hesaplar, tam: true })}
    ${alan({ ad: 'aciklama', etiket: 'Açıklama', tam: true, yer: 'İsteğe bağlı' })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="th-form">${yon === 'tahsilat' ? 'Tahsilatı kaydet' : 'Ödemeyi kaydet'}</button>` });
  formGonder($('#th-form', m.el), async (v) => { await api('POST', `/cariler/${cari.id}/tahsilat`, { ...v, yon, belge_id: belge ? belge.id : null }); bildir(yon === 'tahsilat' ? 'Tahsilat kaydedildi' : 'Ödeme kaydedildi'); m.kapat(); sonra(); });
}

export async function cariDetay(kok, { id }) {
  const v = await api('GET', '/cariler/' + id);
  const c = v.cari;
  const islemAd = { satis_fatura: 'Satış faturası', alis_fatura: 'Alış faturası', satis_iade: 'Satış iadesi', alis_iade: 'Alış iadesi', tahsilat: 'Tahsilat', odeme: 'Ödeme', acilis: 'Açılış', duzeltme: 'Düzeltme', cek: 'Çek', senet: 'Senet', cek_iade: 'Çek/senet iadesi' };
  yerlestir(kok, html`${sayfaBaslik({ baslik: c.unvan, alt: html`${cariTurAd(c.tur)}${c.kod ? ' · ' + c.kod : ''}${!c.aktif ? html` · ${rozet('Pasif', 'notr')}` : ''}${v.risk_asimi ? html` · ${rozet('Risk limiti aşıldı', 'tehlike')}` : ''}`, kirinti: [{ ad: 'Cari hesaplar', rota: '/cariler' }, { ad: c.unvan }],
    eylemler: izleyici() ? html`<button class="dugme" data-eylem="ekstre"><i class="fa-solid fa-file-excel"></i>Ekstre</button>` : html`<button class="dugme" data-eylem="ekstre"><i class="fa-solid fa-file-excel"></i>Ekstre</button><button class="dugme" data-eylem="ekstreYazdir"><i class="fa-solid fa-print"></i>Yazdır</button><button class="dugme" data-eylem="duzenle"><i class="fa-solid fa-pen"></i>Düzenle</button>
      <button class="dugme" data-eylem="odeme"><i class="fa-solid fa-arrow-up"></i>Ödeme yap</button><button class="dugme birincil" data-eylem="tahsilat"><i class="fa-solid fa-arrow-down"></i>Tahsilat al</button>` })}
    <div class="kpi-sira">${kpi({ etiket: 'Bakiye', deger: para(Math.abs(v.bakiye)), alt: v.bakiye > 0.009 ? 'Cari bize borçlu' : v.bakiye < -0.009 ? 'Biz cariye borçluyuz' : 'Hesap kapalı', tur: v.bakiye > 0 ? 'basari' : v.bakiye < 0 ? 'tehlike' : 'notr', ikon: 'fa-scale-balanced' })}
      ${kpi({ etiket: 'Açık faturalar', deger: sayi(v.acikBelgeler.length), alt: para(v.acikBelgeler.reduce((s, b) => s + b.genel_toplam - b.odenen, 0)), tur: 'uyari', ikon: 'fa-file-invoice' })}
      ${kpi({ etiket: 'Portföydeki çek/senet', deger: sayi(v.cekler.length), alt: para(v.cekler.reduce((s, x) => s + x.tutar, 0)), tur: 'bilgi', ikon: 'fa-money-check' })}
      ${c.risk_limiti ? kpi({ etiket: 'Risk limiti', deger: para(c.risk_limiti), alt: `Kullanım %${Math.round(Math.max(0, v.bakiye) / c.risk_limiti * 100)}`, tur: v.risk_asimi ? 'tehlike' : 'notr', ikon: 'fa-shield-halved' }) : ''}</div>
    <div class="izgara izgara-3-1">
      <section class="kart"><div class="kart-baslik"><div><h2>Hesap ekstresi</h2><p>${v.hareketler.length} hareket</p></div>${izleyici() ? '' : html`<div style="display:flex;gap:6px"><a class="dugme kucuk" href="/faturalar/yeni?tip=satis_fatura&cari=${c.id}"><i class="fa-solid fa-plus"></i>Fatura</a><button class="dugme kucuk" data-eylem="duzeltme">Düzeltme</button></div>`}</div>
        ${v.hareketler.length ? html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Tarih</th><th>İşlem</th><th>Açıklama</th><th>Vade</th><th class="sag">Borç</th><th class="sag">Alacak</th><th class="sag">Bakiye</th><th class="eylemler"></th></tr></thead><tbody>
          ${v.hareketler.map(h => html`<tr><td class="mk-baslik">${tarih(h.tarih)}</td><td data-etiket="İşlem">${islemAd[h.tur] || h.tur}</td><td data-etiket="Açıklama" class="metin-hucre">${h.kaynak === 'belge' || h.kaynak === 'odeme_belge' ? html`<a href="/faturalar/${h.kaynak_id}">${h.aciklama}</a>` : h.aciklama}</td><td data-etiket="Vade">${h.vade ? tarih(h.vade) : '—'}</td>
            <td class="sag" data-etiket="Borç">${h.borc ? para(h.borc) : ''}</td><td class="sag" data-etiket="Alacak">${h.alacak ? para(h.alacak) : ''}</td><td class="sag" data-etiket="Bakiye">${bakiyeHucre(h.bakiye)}</td>
            <td class="eylemler">${!izleyici() && !['belge', 'cek_senet', 'cek_senet_iade'].includes(h.kaynak) ? html`<button class="ikon-dugme" data-eylem="hareketSil" data-id="${h.id}" aria-label="Sil"><i class="fa-solid fa-trash"></i></button>` : ''}</td></tr>`)}</tbody>
          <tfoot><tr><td colspan="4">Toplam</td><td class="sag">${para(v.hareketler.reduce((s, h) => s + h.borc, 0))}</td><td class="sag">${para(v.hareketler.reduce((s, h) => s + h.alacak, 0))}</td><td class="sag">${bakiyeHucre(v.bakiye)}</td><td></td></tr></tfoot></table></div>` : bos({ ikon: 'fa-receipt', baslik: 'Hareket yok', metin: 'Fatura, tahsilat veya ödeme kaydedildiğinde burada listelenir.' })}</section>
      <aside><section class="kart"><div class="kart-baslik"><h2>İletişim ve vergi</h2></div><div class="kart-govde"><dl class="tanim-listesi">
        <dt>Yetkili</dt><dd>${c.yetkili || '—'}</dd><dt>Telefon</dt><dd>${telLink(c.telefon)}</dd><dt>E-posta</dt><dd>${c.eposta ? html`<a href="mailto:${c.eposta}">${c.eposta}</a>` : '—'}</dd>
        <dt>Vergi</dt><dd>${c.vergi_dairesi || ''} ${c.vergi_no || '—'}</dd><dt>IBAN</dt><dd>${c.iban || '—'}</dd><dt>Adres</dt><dd>${c.adres || '—'} ${c.il || ''}</dd><dt>Vade</dt><dd>${c.vade_gun ? c.vade_gun + ' gün' : 'Peşin'}</dd>
        ${c.etiketler ? html`<dt>Etiketler</dt><dd>${c.etiketler.split(',').map(e => rozet(e.trim(), 'notr'))}</dd>` : ''}${c.notlar ? html`<dt>Not</dt><dd style="white-space:pre-wrap">${c.notlar}</dd>` : ''}</dl></div></section>
        ${v.acikBelgeler.length ? html`<section class="kart"><div class="kart-baslik"><h2>Açık faturalar</h2></div><ul class="liste">${v.acikBelgeler.map(b => html`<li><span class="l-orta"><strong><a href="/faturalar/${b.id}">${b.no}</a></strong><small>Vade ${tarih(b.vade)}${b.vade && b.vade < bugun() ? ' · gecikti' : ''}</small></span><span class="l-sag">${para(b.genel_toplam - b.odenen)}</span></li>`)}</ul></section>` : ''}
        ${izleyici() ? '' : html`<button class="dugme tam hayalet" data-eylem="sil" style="margin-top:12px;color:var(--tehlike)"><i class="fa-solid fa-trash"></i>${v.hareketler.length ? 'Pasife al' : 'Cariyi sil'}</button>`}</aside></div>`);
  const yenile = () => cariDetay(kok, { id });
  baglan(kok, {
    tahsilat: () => tahsilatModal({ cari: c, yon: 'tahsilat', sonra: yenile }),
    odeme: () => tahsilatModal({ cari: c, yon: 'odeme', sonra: yenile }),
    duzenle: () => cariModal(c, yenile),
    ekstre: () => indir(`/cariler/${c.id}/ekstre-excel`, 'ekstre.xlsx'),
    ekstreYazdir: async () => {
      const logo = await logoVeri(); let b = 0;
      const satir = [...v.hareketler].reverse().map(h => { b += h.borc - h.alacak; return `<tr><td>${tarih(h.tarih)}</td><td>${kac(islemAd[h.tur] || h.tur)}</td><td>${kac(h.aciklama || '')}</td><td class="sag">${h.borc ? para(h.borc) : ''}</td><td class="sag">${h.alacak ? para(h.alacak) : ''}</td><td class="sag">${para(Math.abs(b))} ${b > 0 ? '(A)' : b < 0 ? '(B)' : ''}</td></tr>`; }).join('');
      yazdir(belgeSablon({ baslik: `${c.unvan} ekstre`, logo, icerik: `<h1>Cari hesap ekstresi</h1><p><strong>${kac(c.unvan)}</strong>${c.vergi_no ? ' · VKN ' + kac(c.vergi_no) : ''}</p><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Açıklama</th><th class="sag">Borç</th><th class="sag">Alacak</th><th class="sag">Bakiye</th></tr></thead><tbody>${satir}</tbody><tfoot><tr><td colspan="5">Son bakiye</td><td class="sag">${para(Math.abs(v.bakiye))}</td></tr></tfoot></table><div class="imza"><div>${kac(D.oturum.hesap.ad)}</div><div>${kac(c.unvan)}</div></div>` }));
    },
    duzeltme: () => {
      const m = modal({ baslik: 'Bakiye düzeltme', icerik: html`<form id="dz-form" class="form-izgara">${alan({ ad: 'tutar', etiket: 'Tutar', tip: 'number', zorunlu: true, yardim: 'Pozitif: cari borçlandırılır, negatif: cari alacaklandırılır' })}${alan({ ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: bugun() })}${alan({ ad: 'aciklama', etiket: 'Açıklama', tam: true, deger: 'Bakiye düzeltme' })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="dz-form">Kaydet</button>` });
      formGonder($('#dz-form', m.el), async (x) => { await api('POST', `/cariler/${c.id}/duzeltme`, x); bildir('Düzeltme kaydedildi'); m.kapat(); yenile(); });
    },
    hareketSil: async (el) => { if (!await onayla({ baslik: 'Hareket silinsin mi?', mesaj: 'Tahsilat/ödeme ise bağlı kasa hareketi de silinir.', dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/cari-hareketleri/' + el.dataset.id); bildir('Hareket silindi'); yenile(); },
    sil: async () => { if (!await onayla({ baslik: v.hareketler.length ? 'Cari pasife alınsın mı?' : 'Cari silinsin mi?', mesaj: v.hareketler.length ? 'Hareketi olan cari silinemez; pasife alınır ve listelerde gizlenir.' : 'Cari çöp kutusuna taşınacak.', dugme: 'Onayla', tehlike: true })) return; const r = await api('DELETE', '/cariler/' + c.id); bildir(r.mesaj || 'Cari silindi'); D.git('/cariler', { degistir: true }); },
  });
}

// ─── Faturalar / teklifler ───
export async function faturalar(kok, p, sorgu) { return belgeListe(kok, sorgu, 'fatura'); }
export async function teklifler(kok, p, sorgu) { return belgeListe(kok, sorgu, 'teklif'); }
async function belgeListe(kok, sorgu, grup) {
  const fatura = grup === 'fatura';
  const sekmeler = fatura ? [['fatura', 'Tümü'], ['satis_fatura', 'Satış'], ['alis_fatura', 'Alış'], ['satis_iade,alis_iade', 'İadeler']] : [['teklif,siparis', 'Tümü'], ['teklif', 'Teklifler'], ['siparis', 'Siparişler']];
  const d = { tip: sorgu.tip || sekmeler[0][0], durum: sorgu.durum || '', q: '', bas: '', bit: '' };
  const durumlar = fatura ? [['', 'Durum: tümü'], ['acik', 'Açık'], ['kismi', 'Kısmi ödendi'], ['odendi', 'Ödendi'], ['vadesi_gecen', 'Vadesi geçen'], ['iptal', 'İptal']] : [['', 'Durum: tümü'], ['taslak', 'Taslak'], ['gonderildi', 'Gönderildi'], ['onaylandi', 'Onaylandı'], ['reddedildi', 'Reddedildi'], ['faturalandi', 'Faturalandı']];
  const kok2 = fatura ? '/faturalar' : '/teklifler';
  yerlestir(kok, html`${sayfaBaslik({ baslik: fatura ? 'Faturalar' : 'Teklifler ve siparişler', alt: fatura ? 'Satış ve alış faturaları; cari bakiye ve stok otomatik güncellenir.' : 'Müşteriye teklif hazırlayın, onaylananı tek tıkla faturaya dönüştürün.',
    eylemler: html`<button class="dugme" data-eylem="excel"><i class="fa-solid fa-file-excel"></i>Excel</button>${izleyici() ? '' : fatura ? html`<a class="dugme" href="/faturalar/yeni?tip=alis_fatura"><i class="fa-solid fa-file-import"></i>Alış faturası</a><a class="dugme birincil" href="/faturalar/yeni?tip=satis_fatura"><i class="fa-solid fa-plus"></i>Satış faturası</a>` : html`<a class="dugme" href="/teklifler/yeni?tip=siparis">Sipariş</a><a class="dugme birincil" href="/teklifler/yeni?tip=teklif"><i class="fa-solid fa-plus"></i>Yeni teklif</a>`}` })}
    <nav class="sekmeler" id="sekmeler">${sekmeler.map(([k, ad]) => html`<button data-eylem="sekme" data-k="${k}" class="${d.tip === k ? 'aktif' : ''}">${ad}</button>`)}</nav>
    <div class="kpi-sira" id="ozet"></div>
    <section class="kart"><div class="filtre-cubuk"><div class="ara"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="ara" placeholder="Belge no veya cari" aria-label="Ara"></div>
      <select id="durum" style="width:auto">${durumlar.map(([v, e]) => html`<option value="${v}" ${d.durum === v ? 'selected' : ''}>${e}</option>`)}</select>
      <input type="date" id="bas" style="width:auto" aria-label="Başlangıç"><input type="date" id="bit" style="width:auto" aria-label="Bitiş"></div><div class="tablo-kap" id="tablo"></div></section>`);
  let son;
  const yukle = async () => {
    const q = new URLSearchParams({ tip: d.tip }); ['durum', 'q', 'bas', 'bit'].forEach(k => d[k] && q.set(k, d[k]));
    son = await api('GET', '/belgeler?' + q);
    yerlestir($('#ozet'), html`${kpi({ etiket: 'Toplam', deger: para(son.toplam), alt: `${son.belgeler.filter(b => b.durum !== 'iptal').length} belge`, tur: 'bilgi', ikon: 'fa-file-invoice' })}${fatura ? kpi({ etiket: 'Açık bakiye', deger: para(son.acik), tur: 'uyari', ikon: 'fa-hourglass-half' }) : ''}${fatura ? kpi({ etiket: 'Tahsil / ödenen', deger: para(son.toplam - son.acik), tur: 'basari', ikon: 'fa-check' }) : ''}`);
    if (!son.belgeler.length) return yerlestir($('#tablo'), bos({ ikon: 'fa-file-invoice', baslik: 'Belge bulunamadı', metin: fatura ? 'İlk faturanızı oluşturun. Ürün seçerseniz stok, cari seçtiğiniz için bakiye otomatik güncellenir.' : 'İlk teklifinizi hazırlayın.' }));
    yerlestir($('#tablo'), html`<table class="tablo mobil-kart"><thead><tr><th>Belge no</th><th>Tür</th><th>Cari</th><th>Tarih</th><th>Vade</th><th>Durum</th><th class="sag">Tutar</th>${fatura ? html`<th class="sag">Kalan</th>` : ''}</tr></thead><tbody>
      ${son.belgeler.map(b => html`<tr class="tiklanir" data-git="${kok2}/${b.id}"><td class="mk-baslik kalin">${b.no}</td><td data-etiket="Tür">${BELGE_AD[b.tip]}</td><td data-etiket="Cari">${b.unvan || '—'}</td><td data-etiket="Tarih">${tarih(b.tarih)}</td>
        <td data-etiket="Vade" class="${fatura && b.vade && b.vade < bugun() && ['acik', 'kismi'].includes(b.durum) ? 'para-negatif' : ''}">${tarih(b.vade)}</td><td data-etiket="Durum">${durumRozet(b.durum)}</td><td class="sag" data-etiket="Tutar">${para(b.genel_toplam)}</td>${fatura ? html`<td class="sag" data-etiket="Kalan">${b.durum === 'iptal' ? '—' : para(b.genel_toplam - b.odenen)}</td>` : ''}</tr>`)}</tbody></table>`);
  };
  $('#ara').addEventListener('input', gecikmeli(e => { d.q = e.target.value.trim(); yukle(); }));
  $('#durum').addEventListener('change', e => { d.durum = e.target.value; yukle(); });
  $('#bas').addEventListener('change', e => { d.bas = e.target.value; yukle(); }); $('#bit').addEventListener('change', e => { d.bit = e.target.value; yukle(); });
  kok.addEventListener('click', e => { const tr = e.target.closest('tr[data-git]'); if (tr) D.git(tr.dataset.git); });
  baglan(kok, {
    sekme: (el) => { d.tip = el.dataset.k; $$('#sekmeler button').forEach(b => b.classList.toggle('aktif', b === el)); yukle(); },
    excel: () => excelTablo(fatura ? 'Faturalar' : 'Teklifler', ['Belge no', 'Tür', 'Cari', 'Tarih', 'Vade', 'Durum', 'Ara toplam', 'KDV', 'Genel toplam', 'Ödenen'], son.belgeler.map(b => [b.no, BELGE_AD[b.tip], b.unvan || '', b.tarih, b.vade || '', durumAd(b.durum), b.ara_toplam, b.kdv_toplam, b.genel_toplam, b.odenen]), [6, 7, 8, 9]),
  });
  await yukle();
}

export async function belgeDuzenle(kok, { id }, sorgu) {
  const fatura = location.pathname.startsWith('/faturalar');
  let b = null, kaynak = null;
  if (id) b = (await api('GET', '/belgeler/' + id)).belge;
  if (!b && sorgu.kaynak) kaynak = (await api('GET', '/belgeler/' + sorgu.kaynak)).belge;
  const tip = b ? b.tip : (sorgu.tip || (fatura ? 'satis_fatura' : 'teklif'));
  const [cariler, urunler, hesaplar] = await Promise.all([api('GET', '/cariler/secenekler'), api('GET', '/urunler'), secenekler('finans_hesap', true)]);
  const alis = tip === 'alis_fatura' || tip === 'satis_iade';
  const kdvVars = D.oturum.hesap.tur === 'stk' && !D.oturum.hesap.profil.kdv_mukellefi ? 0 : 20;
  const kalemler = (b || kaynak) ? (b || kaynak).kalemler : [{ aciklama: '', miktar: 1, birim: 'Adet', birim_fiyat: '', kdv_orani: kdvVars, iskonto_orani: 0 }];
  const tipSec = fatura ? [['satis_fatura', 'Satış faturası'], ['alis_fatura', 'Alış faturası'], ['satis_iade', 'Satış iade'], ['alis_iade', 'Alış iade']] : [['teklif', 'Teklif'], ['siparis', 'Sipariş']];
  const kokRota = fatura ? '/faturalar' : '/teklifler';
  yerlestir(kok, html`${sayfaBaslik({ baslik: b ? `${BELGE_AD[tip]} ${b.no} düzenle` : kaynak ? `${kaynak.no} → fatura` : `Yeni ${BELGE_AD[tip].toLocaleLowerCase('tr-TR')}`, kirinti: [{ ad: fatura ? 'Faturalar' : 'Teklifler', rota: kokRota }, { ad: b ? b.no : 'Yeni' }] })}
    <form id="belge-form" novalidate><section class="kart"><div class="kart-govde"><div class="form-izgara uclu">
      ${b ? html`<label class="alan"><span>Belge türü</span><input value="${BELGE_AD[tip]}" readonly></label>` : alan({ ad: 'tip', etiket: 'Belge türü', tip: 'select', deger: tip, secenekler: tipSec })}
      <label class="alan"><span>Cari${fatura ? html`<em>*</em>` : ''}</span><div style="display:flex;gap:6px"><select name="cari_id" ${fatura ? 'required' : ''} style="flex:1"><option value="">Cari seçin</option>${cariler.map(c => html`<option value="${c.id}" data-vade="${c.vade_gun}" ${String((b || kaynak || {}).cari_id || sorgu.cari || '') === String(c.id) ? 'selected' : ''}>${c.unvan}</option>`)}</select><button type="button" class="dugme" data-eylem="yeniCari" aria-label="Yeni cari"><i class="fa-solid fa-plus"></i></button></div></label>
      ${alan({ ad: 'no', etiket: 'Belge no', deger: b && b.no, yer: 'Otomatik verilir' })}
      ${alan({ ad: 'tarih', etiket: 'Tarih', tip: 'date', zorunlu: true, deger: b ? b.tarih : bugun() })}${alan({ ad: 'vade', etiket: fatura ? 'Vade tarihi' : 'Geçerlilik tarihi', tip: 'date', deger: b && b.vade, yardim: 'Boşsa carinin vade gününe göre hesaplanır' })}
      ${!fatura ? alan({ ad: 'durum', etiket: 'Durum', tip: 'select', deger: b ? b.durum : 'taslak', secenekler: [['taslak', 'Taslak'], ['gonderildi', 'Gönderildi'], ['onaylandi', 'Onaylandı'], ['reddedildi', 'Reddedildi']] }) : html`<span></span>`}
    </div></div></section>
    <section class="kart"><div class="kart-baslik"><h2>Kalemler</h2><button type="button" class="dugme kucuk" data-eylem="kalemEkle"><i class="fa-solid fa-plus"></i>Satır ekle</button></div>
      <div class="tablo-kap"><table class="tablo kalem-tablo"><thead><tr><th>Ürün / hizmet</th><th class="k-aciklama">Açıklama</th><th class="k-sayi">Miktar</th><th style="width:84px">Birim</th><th class="k-sayi">Birim fiyat</th><th class="k-kdv">İsk. %</th><th class="k-kdv">KDV %</th><th class="sag" style="width:120px">Tutar</th><th style="width:44px"></th></tr></thead><tbody id="kalemler"></tbody></table></div>
      <datalist id="urun-liste">${urunler.urunler.filter(u => u.aktif).map(u => html`<option value="${u.ad}">${u.kod || ''} · ${para(alis ? u.alis_fiyati : u.satis_fiyati)}</option>`)}</datalist>
      <div class="kart-govde" style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:260px">${alan({ ad: 'notlar', etiket: 'Notlar / açıklama', tip: 'textarea', deger: (b || kaynak || {}).notlar })}
        ${!b && fatura && hesaplar.length ? html`<div style="margin-top:14px">${alan({ ad: 'pesin', etiket: alis ? 'Ödemesi peşin yapıldı' : 'Tahsilatı peşin alındı', tip: 'checkbox' })}<div id="pesin-hesap" class="gizli" style="margin-top:8px">${alan({ ad: 'pesin_hesap', etiket: 'Kasa / banka', tip: 'select', secenekler: hesaplar })}</div></div>` : ''}</div>
        <div class="belge-toplam" id="toplam"></div></div></section>
    <div class="sb-eylem" style="justify-content:flex-end;margin-top:16px"><a class="dugme" href="${b ? kokRota + '/' + b.id : kokRota}">Vazgeç</a><button class="dugme birincil" type="submit">${b ? 'Değişiklikleri kaydet' : 'Belgeyi kaydet'}</button></div></form>`);
  const tb = $('#kalemler');
  const satir = (k = {}) => {
    const tr = document.createElement('tr');
    yerlestir(tr, html`<td><input list="urun-liste" data-k="urun" value="${(urunler.urunler.find(u => u.id === k.urun_id) || {}).ad || ''}" placeholder="Seçin veya yazın"><input type="hidden" data-k="urun_id" value="${k.urun_id || ''}"></td>
      <td><input data-k="aciklama" value="${k.aciklama || ''}" required></td><td><input type="number" step="any" data-k="miktar" value="${k.miktar ?? 1}" inputmode="decimal"></td><td><input data-k="birim" value="${k.birim || 'Adet'}"></td>
      <td><input type="number" step="any" data-k="birim_fiyat" value="${k.birim_fiyat ?? ''}" inputmode="decimal"></td><td><input type="number" step="any" data-k="iskonto_orani" value="${k.iskonto_orani || 0}"></td>
      <td><select data-k="kdv_orani">${[0, 1, 10, 20].map(o => html`<option value="${o}" ${+(k.kdv_orani ?? kdvVars) === o ? 'selected' : ''}>${o}</option>`)}</select></td><td class="sag sayisal" data-k="tutar"></td>
      <td><button type="button" class="ikon-dugme" data-eylem="kalemSil" aria-label="Satırı sil"><i class="fa-solid fa-xmark"></i></button></td>`);
    tb.appendChild(tr);
  };
  kalemler.forEach(satir);
  const oku = () => $$('tr', tb).map(tr => { const o = {}; $$('[data-k]', tr).forEach(i => { if (i.tagName !== 'TD') o[i.dataset.k] = i.value; }); return o; });
  const hesapla = () => {
    let ara = 0, isk = 0, kdv = 0; const kdvGrup = {};
    $$('tr', tb).forEach(tr => {
      const g = (k) => +(($(`[data-k="${k}"]`, tr) || {}).value || 0);
      const brut = g('miktar') * g('birim_fiyat'), i = brut * g('iskonto_orani') / 100, net = brut - i, k = net * g('kdv_orani') / 100;
      ara += brut; isk += i; kdv += k; kdvGrup[g('kdv_orani')] = (kdvGrup[g('kdv_orani')] || 0) + k;
      $('[data-k="tutar"]', tr).textContent = para(net + k);
    });
    yerlestir($('#toplam'), html`<div><span>Ara toplam</span><span>${para(ara)}</span></div>${isk ? html`<div><span>İskonto</span><span>−${para(isk)}</span></div>` : ''}
      ${Object.entries(kdvGrup).filter(([o, t]) => +o && t).map(([o, t]) => html`<div><span>KDV %${o}</span><span>${para(t)}</span></div>`)}<div class="genel"><span>Genel toplam</span><span>${para(ara - isk + kdv)}</span></div><div class="soluk" style="font-size:12px;justify-content:flex-end">${yaziyla(ara - isk + kdv)}</div>`);
  };
  tb.addEventListener('input', (e) => {
    if (e.target.dataset.k === 'urun') {
      const u = urunler.urunler.find(x => x.ad === e.target.value); const tr = e.target.closest('tr');
      $('[data-k="urun_id"]', tr).value = u ? u.id : '';
      if (u) { const ac = $('[data-k="aciklama"]', tr); if (!ac.value) ac.value = u.ad; $('[data-k="birim"]', tr).value = u.birim; $('[data-k="birim_fiyat"]', tr).value = alis ? u.alis_fiyati : u.satis_fiyati; $('[data-k="kdv_orani"]', tr).value = String(u.kdv_orani); }
    }
    hesapla();
  });
  tb.addEventListener('change', hesapla);
  hesapla();
  const pesin = $('[name="pesin"]'); if (pesin) pesin.addEventListener('change', () => $('#pesin-hesap').classList.toggle('gizli', !pesin.checked));
  baglan(kok, {
    kalemEkle: () => { satir({ kdv_orani: kdvVars }); hesapla(); $$('tr', tb).pop().querySelector('[data-k="urun"]').focus(); },
    kalemSil: (el) => { if ($$('tr', tb).length > 1) { el.closest('tr').remove(); hesapla(); } },
    yeniCari: () => cariModal(null, async (cid) => { const l = await api('GET', '/cariler/secenekler'); const s = $('[name="cari_id"]'); yerlestir(s, html`<option value="">Cari seçin</option>${l.map(c => html`<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${c.unvan}</option>`)}`); }),
  });
  formGonder($('#belge-form'), async (v) => {
    const govde = { tip: v.tip || tip, cari_id: v.cari_id, no: v.no, tarih: v.tarih, vade: v.vade, durum: v.durum, notlar: v.notlar, kalemler: oku().map(k => ({ ...k, urun_id: k.urun_id || null })), kaynak_id: kaynak ? kaynak.id : undefined };
    if (v.pesin) govde.pesin = { finans_hesap_id: v.pesin_hesap };
    if (fatura && !govde.cari_id) throw new Error('Cari seçin');
    const r = b ? await api('PUT', '/belgeler/' + b.id, govde) : await api('POST', '/belgeler', govde);
    bildir(b ? 'Belge güncellendi' : `${r.no} kaydedildi`);
    D.git(`${fatura || kaynak ? '/faturalar' : '/teklifler'}/${r.id}`, { degistir: true });
  });
}

export async function belgeDetay(kok, { id }) {
  const { belge: b, cari, odemeler, tip_ad } = await api('GET', '/belgeler/' + id);
  const fatura = ['satis_fatura', 'alis_fatura', 'satis_iade', 'alis_iade'].includes(b.tip);
  const kokRota = fatura ? '/faturalar' : '/teklifler';
  const kalan = Math.max(0, b.genel_toplam - b.odenen);
  const tahsilatYon = (b.tip === 'satis_fatura' || b.tip === 'alis_iade') ? 'tahsilat' : 'odeme';
  yerlestir(kok, html`${sayfaBaslik({ baslik: `${tip_ad} ${b.no}`, alt: html`${durumRozet(b.durum)} <span class="soluk">${cari ? cari.unvan : ''}</span>`, kirinti: [{ ad: fatura ? 'Faturalar' : 'Teklifler', rota: kokRota }, { ad: b.no }],
    eylemler: html`<button class="dugme" data-eylem="yazdir"><i class="fa-solid fa-print"></i>Yazdır / PDF</button>
      ${izleyici() || b.durum === 'iptal' ? '' : html`<a class="dugme" href="${kokRota}/${b.id}/duzenle"><i class="fa-solid fa-pen"></i>Düzenle</a>
        ${!fatura && b.durum !== 'faturalandi' ? html`<a class="dugme birincil" href="/faturalar/yeni?tip=satis_fatura&kaynak=${b.id}"><i class="fa-solid fa-file-invoice"></i>Faturaya dönüştür</a>` : ''}
        ${fatura && kalan > 0.009 && cari ? html`<button class="dugme birincil" data-eylem="tahsilat"><i class="fa-solid fa-${tahsilatYon === 'tahsilat' ? 'arrow-down' : 'arrow-up'}"></i>${tahsilatYon === 'tahsilat' ? 'Tahsilat al' : 'Ödeme yap'}</button>` : ''}`}` })}
    <div class="izgara izgara-3-1"><section class="kart"><div class="kart-govde"><div class="belge-onizleme" id="onizleme">${belgeIcerik(b, cari, tip_ad)}</div></div></section>
      <aside><section class="kart"><div class="kart-baslik"><h2>Özet</h2></div><div class="kart-govde"><dl class="tanim-listesi"><dt>Genel toplam</dt><dd class="kalin">${para(b.genel_toplam)}</dd>
        ${fatura ? html`<dt>Ödenen</dt><dd>${para(b.odenen)}</dd><dt>Kalan</dt><dd class="${kalan > 0.009 ? 'para-negatif' : ''}">${para(kalan)}</dd>` : ''}<dt>Tarih</dt><dd>${tarih(b.tarih)}</dd><dt>Vade</dt><dd>${tarih(b.vade)}</dd>${b.donusen_id ? html`<dt>Fatura</dt><dd><a href="/faturalar/${b.donusen_id}">Görüntüle</a></dd>` : ''}</dl></div></section>
        ${fatura && odemeler.length ? html`<section class="kart"><div class="kart-baslik"><h2>Ödemeler</h2></div><ul class="liste">${odemeler.map(o => html`<li><span class="l-orta"><strong>${tarih(o.tarih)}</strong><small>${o.aciklama}</small></span><span class="l-sag">${para(o.borc + o.alacak)}</span></li>`)}</ul></section>` : ''}
        ${!fatura && !izleyici() ? html`<section class="kart"><div class="kart-baslik"><h2>Durum</h2></div><div class="kart-govde" style="display:flex;flex-wrap:wrap;gap:6px">${[['gonderildi', 'Gönderildi'], ['onaylandi', 'Onaylandı'], ['reddedildi', 'Reddedildi']].map(([k, a]) => html`<button class="dugme kucuk" data-eylem="durum" data-d="${k}" ${b.durum === k ? 'disabled' : ''}>${a}</button>`)}</div></section>` : ''}
        ${izleyici() || b.durum === 'iptal' ? '' : html`<div style="display:flex;flex-direction:column;gap:6px;margin-top:12px">${fatura ? html`<button class="dugme hayalet tam" data-eylem="iptal">Faturayı iptal et</button>` : ''}<button class="dugme hayalet tam" data-eylem="sil" style="color:var(--tehlike)"><i class="fa-solid fa-trash"></i>Belgeyi sil</button></div>`}</aside></div>`);
  const yenile = () => belgeDetay(kok, { id });
  baglan(kok, {
    tahsilat: () => tahsilatModal({ cari, yon: tahsilatYon, belge: b, sonra: yenile }),
    durum: async (el) => { await api('POST', `/belgeler/${b.id}/durum`, { durum: el.dataset.d }); bildir('Durum güncellendi'); yenile(); },
    iptal: async () => { if (!await onayla({ baslik: 'Fatura iptal edilsin mi?', mesaj: 'Cari ve stok etkileri geri alınır. Belge numarası kayıtlarda iptal olarak kalır.', dugme: 'İptal et', tehlike: true })) return; await api('POST', `/belgeler/${b.id}/iptal`); bildir('Fatura iptal edildi'); yenile(); },
    sil: async () => { if (!await onayla({ baslik: 'Belge silinsin mi?', mesaj: 'Belge ve cari/stok etkileri silinecek.', dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/belgeler/' + b.id); bildir('Belge silindi'); D.git(kokRota, { degistir: true }); },
    yazdir: async () => { const logo = await logoVeri(); yazdir(belgeSablon({ baslik: `${tip_ad} ${b.no}`, logo, icerik: belgeIcerik(b, cari, tip_ad, true).s })); },
  });
}
function belgeIcerik(b, cari, tipAd, yazdirma = false) {
  const kdvGrup = {}; b.kalemler.forEach(k => { kdvGrup[k.kdv_orani] = (kdvGrup[k.kdv_orani] || 0) + k.kdv; });
  return html`<div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px"><div><h1 style="font-size:20px;color:#14213d">${tipAd}</h1><div style="color:#6b7587">No: <strong style="color:#1a2232">${b.no}</strong></div></div>
    <div style="text-align:right;color:#4a5568;font-size:12.5px">Tarih: <strong>${tarih(b.tarih)}</strong><br>${b.vade ? html`Vade: <strong>${tarih(b.vade)}</strong>` : ''}</div></div>
    ${cari ? html`<div class="kutu" style="border:1px solid #dfe3ea;border-radius:8px;padding:12px 14px;margin-bottom:16px;max-width:420px"><div style="font-size:11px;color:#6b7587">${['alis_fatura', 'satis_iade'].includes(b.tip) ? 'Satıcı' : 'Alıcı'}</div><strong>${cari.unvan}</strong><div style="font-size:12px;color:#4a5568">${cari.adres || ''} ${cari.il || ''}${cari.vergi_no ? html`<br>${cari.vergi_dairesi || ''} V.D. ${cari.vergi_no}` : ''}</div></div>` : ''}
    <table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="background:#f1f3f7"><th style="text-align:left;padding:8px">Açıklama</th><th style="text-align:right;padding:8px">Miktar</th><th style="text-align:right;padding:8px">Birim fiyat</th><th style="text-align:right;padding:8px">İsk.</th><th style="text-align:right;padding:8px">KDV</th><th style="text-align:right;padding:8px">Tutar</th></tr></thead>
    <tbody>${b.kalemler.map(k => html`<tr style="border-bottom:1px solid #e6e9ef"><td style="padding:8px">${k.aciklama}</td><td style="text-align:right;padding:8px;white-space:nowrap">${sayi(k.miktar)} ${k.birim}</td><td style="text-align:right;padding:8px;white-space:nowrap">${para(k.birim_fiyat)}</td><td style="text-align:right;padding:8px">${k.iskonto_orani ? '%' + k.iskonto_orani : ''}</td><td style="text-align:right;padding:8px">%${k.kdv_orani}</td><td style="text-align:right;padding:8px;white-space:nowrap">${para(k.tutar)}</td></tr>`)}</tbody></table>
    <div style="display:flex;justify-content:flex-end;margin-top:12px"><div style="width:300px;font-size:13px">
      <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Ara toplam</span><span>${para(b.ara_toplam)}</span></div>${b.iskonto ? html`<div style="display:flex;justify-content:space-between;padding:4px 0"><span>İskonto</span><span>−${para(b.iskonto)}</span></div>` : ''}
      ${Object.entries(kdvGrup).filter(([o, t]) => +o && t).map(([o, t]) => html`<div style="display:flex;justify-content:space-between;padding:4px 0"><span>KDV %${o}</span><span>${para(t)}</span></div>`)}
      <div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700;font-size:15px;border-top:1px solid #4a5568;border-bottom:3px double #4a5568;margin-top:4px"><span>Genel toplam</span><span>${para(b.genel_toplam)}</span></div></div></div>
    <p style="margin-top:10px;font-size:12px;color:#4a5568">Yalnız: <strong>${yaziyla(b.genel_toplam)}</strong></p>${b.notlar ? html`<p style="margin-top:12px;white-space:pre-wrap;font-size:12.5px">${b.notlar}</p>` : ''}
    ${yazdirma ? html`<div class="imza"><div>Teslim eden</div><div>Teslim alan</div></div>` : ''}`;
}

// ─── Ürünler ───
export async function urunler(kok, p, sorgu) {
  const d = { q: '', kritik: sorgu.kritik || '' };
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Ürün ve hizmetler', alt: 'Stok kartları, fiyatlar ve KDV oranları. Faturalardan stok otomatik düşer.', eylemler: html`<button class="dugme" data-eylem="excel"><i class="fa-solid fa-file-excel"></i>Excel</button><a class="dugme" href="/stok"><i class="fa-solid fa-dolly"></i>Stok hareketleri</a>${izleyici() ? '' : html`<button class="dugme birincil" data-eylem="yeni"><i class="fa-solid fa-plus"></i>Yeni ürün</button>`}` })}
    <div class="kpi-sira" id="ozet"></div><section class="kart"><div class="filtre-cubuk"><div class="ara"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="ara" placeholder="Ad, kod, barkod" aria-label="Ara"></div><label class="onay-kutusu"><input type="checkbox" id="kritik" ${d.kritik ? 'checked' : ''}><span>Yalnızca kritik stok</span></label></div><div class="tablo-kap" id="tablo"></div></section>`);
  let son;
  const yukle = async () => {
    const q = new URLSearchParams(); if (d.q) q.set('q', d.q); if (d.kritik) q.set('kritik', '1');
    son = await api('GET', '/urunler?' + q);
    yerlestir($('#ozet'), html`${kpi({ etiket: 'Ürün sayısı', deger: sayi(son.urunler.length), tur: 'bilgi', ikon: 'fa-boxes-stacked' })}${kpi({ etiket: 'Stok değeri (alış)', deger: para(son.stok_degeri), tur: 'muhur', ikon: 'fa-warehouse' })}${kpi({ etiket: 'Kritik stok', deger: sayi(son.kritik), tur: son.kritik ? 'tehlike' : 'basari', ikon: 'fa-triangle-exclamation' })}`);
    if (!son.urunler.length) return yerlestir($('#tablo'), bos({ ikon: 'fa-boxes-stacked', baslik: 'Ürün bulunamadı', metin: 'Sattığınız veya dağıttığınız ürün ve hizmetleri ekleyin.' }));
    yerlestir($('#tablo'), html`<table class="tablo mobil-kart"><thead><tr><th>Ürün</th><th>Kod</th><th>Kategori</th><th class="sag">Alış</th><th class="sag">Satış</th><th class="sag">KDV</th><th class="sag">Stok</th></tr></thead><tbody>
      ${son.urunler.map(u => html`<tr class="tiklanir" data-git="/urunler/${u.id}"><td class="mk-baslik"><strong>${u.ad}</strong>${u.tip === 'hizmet' ? html` ${rozet('Hizmet', 'notr')}` : ''}</td><td data-etiket="Kod">${u.kod || '—'}</td><td data-etiket="Kategori">${u.kategori || '—'}</td><td class="sag" data-etiket="Alış">${para(u.alis_fiyati)}</td><td class="sag" data-etiket="Satış">${para(u.satis_fiyati)}</td><td class="sag" data-etiket="KDV">%${u.kdv_orani}</td>
        <td class="sag" data-etiket="Stok">${u.stok_takip ? html`<span class="${u.stok <= u.kritik_stok ? 'para-negatif kalin' : ''}">${sayi(u.stok)} ${u.birim}</span>` : '—'}</td></tr>`)}</tbody></table>`);
  };
  $('#ara').addEventListener('input', gecikmeli(e => { d.q = e.target.value.trim(); yukle(); }));
  $('#kritik').addEventListener('change', e => { d.kritik = e.target.checked ? '1' : ''; yukle(); });
  kok.addEventListener('click', e => { const tr = e.target.closest('tr[data-git]'); if (tr) D.git(tr.dataset.git); });
  baglan(kok, { yeni: () => urunModal(null, (id) => D.git('/urunler/' + id)), excel: () => excelTablo('Ürünler', ['Kod', 'Ad', 'Kategori', 'Birim', 'Alış', 'Satış', 'KDV', 'Stok', 'Kritik'], son.urunler.map(u => [u.kod || '', u.ad, u.kategori || '', u.birim, u.alis_fiyati, u.satis_fiyati, u.kdv_orani, u.stok, u.kritik_stok]), [4, 5]) });
  await yukle();
}
function urunModal(u, sonra) {
  const m = modal({ baslik: u ? 'Ürünü düzenle' : 'Yeni ürün / hizmet', genis: true, icerik: html`<form id="urun-form" class="form-izgara uclu">
    ${alan({ ad: 'ad', etiket: 'Ürün / hizmet adı', zorunlu: true, deger: u && u.ad, tam: true })}${alan({ ad: 'tip', etiket: 'Tür', tip: 'select', deger: u ? u.tip : 'urun', secenekler: [['urun', 'Stoklu ürün'], ['hizmet', 'Hizmet']] })}
    ${alan({ ad: 'kod', etiket: 'Stok kodu', deger: u && u.kod, yer: 'Otomatik' })}${alan({ ad: 'barkod', etiket: 'Barkod', deger: u && u.barkod })}${alan({ ad: 'kategori', etiket: 'Kategori', deger: u && u.kategori })}${alan({ ad: 'birim', etiket: 'Birim', deger: u ? u.birim : 'Adet' })}
    ${alan({ ad: 'kdv_orani', etiket: 'KDV oranı', tip: 'select', deger: u ? u.kdv_orani : 20, secenekler: [0, 1, 10, 20] })}${alan({ ad: 'alis_fiyati', etiket: 'Alış fiyatı (KDV hariç)', tip: 'number', deger: u && u.alis_fiyati })}${alan({ ad: 'satis_fiyati', etiket: 'Satış fiyatı (KDV hariç)', tip: 'number', deger: u && u.satis_fiyati })}
    ${alan({ ad: 'kritik_stok', etiket: 'Kritik stok seviyesi', tip: 'number', deger: u && u.kritik_stok })}${alan({ ad: 'depo', etiket: 'Depo / raf', deger: u && u.depo })}${u ? '' : alan({ ad: 'acilis_stok', etiket: 'Açılış stoku', tip: 'number' })}
    ${alan({ ad: 'aciklama', etiket: 'Açıklama', tip: 'textarea', deger: u && u.aciklama, tam: true })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="urun-form">Kaydet</button>` });
  formGonder($('#urun-form', m.el), async (v) => { if (u) { await api('PUT', '/urunler/' + u.id, { ...v, aktif: u.aktif }); m.kapat(); bildir('Ürün güncellendi'); sonra(u.id); } else { const r = await api('POST', '/urunler', v); m.kapat(); bildir('Ürün eklendi'); sonra(r.id); } });
}
const STOK_TUR = { giris: 'Giriş', cikis: 'Çıkış', sayim: 'Sayım farkı', fire: 'Fire', fatura: 'Fatura' };
export async function urunDetay(kok, { id }) {
  const { urun: u, hareketler } = await api('GET', '/urunler/' + id);
  yerlestir(kok, html`${sayfaBaslik({ baslik: u.ad, alt: `${u.kod || ''} · ${u.kategori || 'Kategorisiz'}`, kirinti: [{ ad: 'Ürünler', rota: '/urunler' }, { ad: u.ad }], eylemler: izleyici() ? '' : html`<button class="dugme" data-eylem="duzenle"><i class="fa-solid fa-pen"></i>Düzenle</button>${u.stok_takip ? html`<button class="dugme birincil" data-eylem="hareket"><i class="fa-solid fa-plus"></i>Stok hareketi</button>` : ''}` })}
    <div class="kpi-sira">${kpi({ etiket: 'Mevcut stok', deger: u.stok_takip ? `${sayi(u.stok)} ${u.birim}` : 'Takip yok', tur: u.stok <= u.kritik_stok ? 'tehlike' : 'basari', ikon: 'fa-warehouse' })}${kpi({ etiket: 'Alış / satış', deger: `${para(u.alis_fiyati, false)} / ${para(u.satis_fiyati, false)}`, alt: `KDV %${u.kdv_orani}`, tur: 'bilgi', ikon: 'fa-tag' })}${kpi({ etiket: 'Stok değeri', deger: para(Math.max(0, u.stok) * u.alis_fiyati), tur: 'muhur', ikon: 'fa-coins' })}${kpi({ etiket: 'Brüt kâr marjı', deger: u.satis_fiyati ? `%${Math.round((u.satis_fiyati - u.alis_fiyati) / u.satis_fiyati * 100)}` : '—', tur: 'notr', ikon: 'fa-percent' })}</div>
    <section class="kart"><div class="kart-baslik"><h2>Stok hareketleri</h2></div>${hareketler.length ? html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Tarih</th><th>Tür</th><th>Açıklama</th><th class="sag">Miktar</th><th class="sag">Birim fiyat</th><th class="eylemler"></th></tr></thead><tbody>${hareketler.map(h => html`<tr><td class="mk-baslik">${tarih(h.tarih)}</td><td data-etiket="Tür">${STOK_TUR[h.tur] || h.tur}</td><td data-etiket="Açıklama">${h.kaynak === 'belge' ? html`<a href="/faturalar/${h.kaynak_id}">${h.aciklama}</a>` : h.aciklama || '—'}</td><td class="sag ${h.miktar < 0 ? 'para-negatif' : 'para-pozitif'}" data-etiket="Miktar">${h.miktar > 0 ? '+' : ''}${sayi(h.miktar)}</td><td class="sag" data-etiket="Fiyat">${para(h.birim_fiyat)}</td><td class="eylemler">${!izleyici() && h.kaynak !== 'belge' ? html`<button class="ikon-dugme" data-eylem="sil" data-id="${h.id}" aria-label="Sil"><i class="fa-solid fa-trash"></i></button>` : ''}</td></tr>`)}</tbody></table></div>` : bos({ ikon: 'fa-dolly', baslik: 'Hareket yok' })}</section>`);
  const yenile = () => urunDetay(kok, { id });
  baglan(kok, { duzenle: () => urunModal(u, yenile), hareket: () => stokHareketModal(u.id, yenile), sil: async (el) => { if (!await onayla({ mesaj: 'Stok hareketi silinsin mi?', dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/stok/hareketler/' + el.dataset.id); yenile(); } });
}
async function stokHareketModal(urunId, sonra) {
  const ur = urunId ? null : (await api('GET', '/urunler')).urunler.filter(u => u.stok_takip && u.aktif);
  const m = modal({ baslik: 'Stok hareketi', icerik: html`<form id="sh-form" class="form-izgara">${ur ? alan({ ad: 'urun_id', etiket: 'Ürün', tip: 'select', zorunlu: true, secenekler: ur.map(u => [u.id, `${u.ad} (stok ${sayi(u.stok)})`]), tam: true }) : ''}
    ${alan({ ad: 'tur', etiket: 'Hareket', tip: 'select', secenekler: [['giris', 'Giriş (alım, bağış)'], ['cikis', 'Çıkış (dağıtım, kullanım)'], ['fire', 'Fire / zayi'], ['sayim', 'Sayım (gerçek miktarı girin)']] })}${alan({ ad: 'miktar', etiket: 'Miktar', tip: 'number', zorunlu: true })}
    ${alan({ ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: bugun() })}${alan({ ad: 'birim_fiyat', etiket: 'Birim fiyat', tip: 'number' })}${alan({ ad: 'aciklama', etiket: 'Açıklama', tam: true })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="sh-form">Kaydet</button>` });
  formGonder($('#sh-form', m.el), async (v) => { const r = await api('POST', '/stok/hareketler', { ...v, urun_id: urunId || v.urun_id }); bildir(r.mesaj || 'Stok hareketi kaydedildi'); m.kapat(); sonra(); });
}
export async function stok(kok) {
  const l = await api('GET', '/stok/hareketler');
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Stok hareketleri', alt: 'Giriş, çıkış, fire ve sayım kayıtları', kirinti: [{ ad: 'Ürünler', rota: '/urunler' }, { ad: 'Stok hareketleri' }], eylemler: izleyici() ? '' : html`<button class="dugme birincil" data-eylem="yeni"><i class="fa-solid fa-plus"></i>Hareket ekle</button>` })}
    <section class="kart">${l.length ? html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Tarih</th><th>Ürün</th><th>Tür</th><th>Açıklama</th><th class="sag">Miktar</th></tr></thead><tbody>${l.map(h => html`<tr><td class="mk-gizle">${tarih(h.tarih)}</td><td class="mk-baslik"><a href="/urunler/${h.urun_id}">${h.urun_ad}</a></td><td data-etiket="Tür">${STOK_TUR[h.tur] || h.tur}</td><td data-etiket="Açıklama">${h.aciklama || '—'}</td><td class="sag ${h.miktar < 0 ? 'para-negatif' : 'para-pozitif'}" data-etiket="Miktar">${h.miktar > 0 ? '+' : ''}${sayi(h.miktar)} ${h.birim}</td></tr>`)}</tbody></table></div>` : bos({ ikon: 'fa-dolly', baslik: 'Henüz stok hareketi yok' })}</section>`);
  baglan(kok, { yeni: () => stokHareketModal(null, () => stok(kok)) });
}

// ─── Kasa ve banka ───
export async function kasaBanka(kok, { id }, sorgu) {
  const hesaplar = await api('GET', '/finans/hesaplar');
  const secili = id ? hesaplar.find(h => h.id === +id) : null;
  const d = { hesap: secili ? secili.id : '', yon: '', kategori: '', q: '', bas: '', bit: '', sayfa: 1 };
  const toplam = hesaplar.filter(h => h.aktif).reduce((s, h) => s + h.bakiye, 0);
  const ikon = (t) => t === 'kasa' ? 'fa-cash-register' : t === 'kredi_karti' ? 'fa-credit-card' : t === 'pos' ? 'fa-mobile-screen' : 'fa-building-columns';
  yerlestir(kok, html`${sayfaBaslik({ baslik: secili ? secili.ad : 'Kasa ve banka', alt: secili ? `${(FH_TUR.find(x => x[0] === secili.tur) || [])[1] || ''}${secili.iban ? ' · ' + secili.iban : ''}` : 'Tüm nakit hesaplarınız, gelir-gider kayıtları ve virmanlar.', kirinti: secili ? [{ ad: 'Kasa ve banka', rota: '/kasa-banka' }, { ad: secili.ad }] : null,
    eylemler: izleyici() ? '' : html`<button class="dugme" data-eylem="virman"><i class="fa-solid fa-right-left"></i>Virman</button><button class="dugme" data-eylem="islem" data-y="cikis"><i class="fa-solid fa-arrow-up"></i>Gider</button><button class="dugme birincil" data-eylem="islem" data-y="giris"><i class="fa-solid fa-arrow-down"></i>Gelir</button>` })}
    <div class="kpi-sira">${!secili ? kpi({ etiket: 'Toplam nakit', deger: para(toplam), tur: 'muhur', ikon: 'fa-sack-dollar' }) : ''}${hesaplar.filter(h => h.aktif || h.id === +id).map(h => kpi({ etiket: h.ad, deger: para(h.bakiye), alt: (FH_TUR.find(x => x[0] === h.tur) || [])[1], tur: h.id === +id ? 'bilgi' : h.bakiye < 0 ? 'tehlike' : 'notr', ikon: ikon(h.tur), rota: `/kasa-banka/${h.id}` }))}
      ${izleyici() ? '' : html`<button class="kpi" data-eylem="hesapEkle" style="cursor:pointer;text-align:left;border-style:dashed"><div class="kpi-ust"><span>Yeni hesap</span><i class="fa-solid fa-plus"></i></div><div class="kpi-deger" style="font-size:15px;color:var(--birincil)">Kasa / banka ekle</div></button>`}</div>
    <section class="kart"><div class="kart-baslik"><div><h2>Hareketler</h2><p id="ozet-metin"></p></div><div style="display:flex;gap:6px">${secili && !izleyici() ? html`<button class="dugme kucuk" data-eylem="hesapDuzenle"><i class="fa-solid fa-pen"></i>Hesabı düzenle</button>` : ''}<button class="dugme kucuk" data-eylem="excel"><i class="fa-solid fa-file-excel"></i>Excel</button></div></div>
      <div class="filtre-cubuk"><div class="ara"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="ara" placeholder="Açıklama, cari, belge no" aria-label="Ara"></div>
        ${secili ? '' : html`<select data-f="hesap" style="width:auto"><option value="">Hesap: tümü</option>${hesaplar.map(h => html`<option value="${h.id}">${h.ad}</option>`)}</select>`}
        <select data-f="yon" style="width:auto"><option value="">Giriş ve çıkış</option><option value="giris">Yalnız giriş</option><option value="cikis">Yalnız çıkış</option></select>
        <input type="date" data-f="bas" style="width:auto" aria-label="Başlangıç"><input type="date" data-f="bit" style="width:auto" aria-label="Bitiş"></div>
      <div class="tablo-kap" id="tablo"></div><div class="sayfalama" id="sayfalama"></div></section>`);
  const KAYNAK = { manuel: 'Elle', transfer: 'Virman', cari_hareket: 'Cari', hisse: 'Kurban', cek_senet: 'Çek/senet', personel: 'Personel' };
  const yukle = async () => {
    const q = new URLSearchParams({ sayfa: d.sayfa, limit: 100 }); ['hesap', 'yon', 'kategori', 'q', 'bas', 'bit'].forEach(k => d[k] && q.set(k, d[k]));
    const r = await api('GET', '/finans/hareketler?' + q);
    $('#ozet-metin').textContent = `${r.toplam} hareket · giriş ${para(r.giris)} · çıkış ${para(r.cikis)} · net ${para(r.net)}`;
    if (!r.hareketler.length) { yerlestir($('#tablo'), bos({ ikon: 'fa-receipt', baslik: 'Hareket bulunamadı', metin: 'Gelir veya gider kaydı ekleyin. Bağış, masraf, kurban hissesi ve tahsilatlar da buraya otomatik düşer.' })); yerlestir($('#sayfalama'), ''); return; }
    yerlestir($('#tablo'), html`<table class="tablo mobil-kart"><thead><tr><th>Tarih</th><th>Açıklama</th><th>Kategori</th>${secili ? '' : html`<th>Hesap</th>`}<th>Kaynak</th><th class="sag">Giriş</th><th class="sag">Çıkış</th><th class="eylemler"></th></tr></thead><tbody>
      ${r.hareketler.map(h => html`<tr><td class="mk-gizle">${tarih(h.tarih)}</td><td class="mk-baslik">${h.aciklama}${h.cari_unvan ? html`<span class="ikincil"><a href="/cariler/${h.cari_id}">${h.cari_unvan}</a></span>` : ''}</td><td data-etiket="Kategori">${h.kategori || '—'}</td>${secili ? '' : html`<td data-etiket="Hesap">${h.hesap_ad}</td>`}
        <td data-etiket="Kaynak">${rozet(h.kaynak && h.kaynak.startsWith('kayit:') ? D.tanimlar.kayit[h.kaynak.slice(6)].tekil : KAYNAK[h.kaynak] || 'Elle', 'notr')}</td>
        <td class="sag para-pozitif" data-etiket="Giriş">${h.yon === 'giris' ? para(h.tutar) : ''}</td><td class="sag para-negatif" data-etiket="Çıkış">${h.yon === 'cikis' ? para(h.tutar) : ''}</td>
        <td class="eylemler">${h.belge_var ? html`<button class="ikon-dugme" data-eylem="belge" data-id="${h.id}" aria-label="Belgeyi gör"><i class="fa-solid fa-paperclip"></i></button>` : ''}${!izleyici() && ['manuel', 'transfer', 'cari_hareket', null].includes(h.kaynak) ? html`<button class="ikon-dugme" data-eylem="sil" data-id="${h.id}" aria-label="Sil"><i class="fa-solid fa-trash"></i></button>` : ''}</td></tr>`)}</tbody>
      <tfoot><tr><td colspan="${secili ? 4 : 5}">Filtre toplamı</td><td class="sag">${para(r.giris)}</td><td class="sag">${para(r.cikis)}</td><td></td></tr></tfoot></table>`);
    const ss = Math.ceil(r.toplam / 100);
    yerlestir($('#sayfalama'), ss > 1 ? html`<span>Sayfa ${d.sayfa} / ${ss}</span><div class="dugme-grup"><button class="dugme" data-eylem="sayfa" data-s="${d.sayfa - 1}" ${d.sayfa === 1 ? 'disabled' : ''}>Önceki</button><button class="dugme" data-eylem="sayfa" data-s="${d.sayfa + 1}" ${d.sayfa >= ss ? 'disabled' : ''}>Sonraki</button></div>` : '');
  };
  $('#ara').addEventListener('input', gecikmeli(e => { d.q = e.target.value.trim(); d.sayfa = 1; yukle(); }));
  degisince(kok, '[data-f]', el => { d[el.dataset.f] = el.value; d.sayfa = 1; yukle(); });
  const yenile = () => kasaBanka(kok, { id }, {});
  baglan(kok, {
    sayfa: (el) => { d.sayfa = +el.dataset.s; yukle(); },
    islem: (el) => islemModal(el.dataset.y, secili, yenile),
    virman: () => virmanModal(hesaplar, yenile),
    hesapEkle: () => hesapModal(null, yenile),
    hesapDuzenle: () => hesapModal(secili, yenile),
    excel: () => { const q = new URLSearchParams(); ['hesap', 'bas', 'bit'].forEach(k => d[k] && q.set(k, d[k])); return indir('/finans/hareketler-excel?' + q, 'kasa.xlsx'); },
    belge: async (el) => { const b = await api('GET', `/finans/hareketler/${el.dataset.id}/belge`); modal({ baslik: b.belge_adi || 'Belge', genis: true, icerik: b.belge_data.startsWith('data:application/pdf') ? html`<iframe src="${b.belge_data}" style="width:100%;height:70vh;border:0"></iframe>` : html`<img src="${b.belge_data}" alt="" style="max-width:100%">` }); },
    sil: async (el) => { if (!await onayla({ baslik: 'Hareket silinsin mi?', mesaj: 'Virman ise iki taraf da silinir; tahsilat/ödeme ise cari hareketi de kaldırılır.', dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/finans/hareketler/' + el.dataset.id); bildir('Hareket silindi'); yenile(); },
  });
  await yukle();
  if (sorgu.islem) { history.replaceState({}, '', location.pathname); islemModal(sorgu.islem, secili, yenile); }
}
async function islemModal(yon, secili, sonra) {
  const [hesaplar, kat, cariler] = await Promise.all([secenekler('finans_hesap', true), secenekler('kategori:' + (yon === 'giris' ? 'gelir' : 'gider'), true), secenekler('cari')]);
  if (!hesaplar.length) return bildir('Önce bir kasa veya banka hesabı ekleyin', 'uyari');
  const m = modal({ baslik: yon === 'giris' ? 'Gelir kaydı' : 'Gider kaydı', genis: true, icerik: html`<form id="is-form" class="form-izgara">
    ${alan({ ad: 'tutar', etiket: 'Tutar', tip: 'number', zorunlu: true, ek: 'inputmode="decimal" autofocus' })}${alan({ ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: bugun() })}
    ${alan({ ad: 'finans_hesap_id', etiket: 'Kasa / banka', tip: 'select', zorunlu: true, deger: secili ? secili.id : '', secenekler: hesaplar })}
    ${alan({ ad: 'kategori', etiket: 'Kategori', tip: 'select', secenekler: [['', 'Seçin'], ...kat], yardim: 'Kategorileri Ayarlar > Kategoriler bölümünden yönetebilirsiniz' })}
    ${alan({ ad: 'aciklama', etiket: 'Açıklama', zorunlu: true, tam: true })}${alan({ ad: 'cari_id', etiket: 'İlgili cari (isteğe bağlı)', tip: 'select', secenekler: [['', 'Yok'], ...cariler] })}${alan({ ad: 'belge_no', etiket: 'Belge / fiş no' })}
    <label class="alan tam"><span>Belge (fiş, dekont)</span><input type="file" name="belge" accept="image/*,application/pdf"><small>PNG, JPG veya PDF — en fazla 5 MB</small></label></form>`,
    altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="is-form">Kaydet</button>` });
  const kategoriSec = $('[name="kategori"]', m.el);
  kategoriSec.addEventListener('change', async () => { const k = (await api('GET', '/kategoriler?tip=' + (yon === 'giris' ? 'gelir' : 'gider'))).find(x => x.ad === kategoriSec.value); const t = $('[name="tutar"]', m.el); if (k && k.varsayilan_tutar && !t.value) t.value = k.varsayilan_tutar; });
  formGonder($('#is-form', m.el), async (v) => {
    const f = $('[name="belge"]', m.el).files[0];
    if (f) { if (f.size > 5 * 1024 * 1024) throw new Error('Belge en fazla 5 MB olabilir'); v.belge_data = await dosyaOku(f); v.belge_adi = f.name; }
    delete v.belge;
    await api('POST', '/finans/hareketler', { ...v, yon }); bildir(yon === 'giris' ? 'Gelir kaydedildi' : 'Gider kaydedildi'); m.kapat(); sonra();
  });
}
function virmanModal(hesaplar, sonra) {
  const s = hesaplar.filter(h => h.aktif).map(h => [h.id, `${h.ad} (${para(h.bakiye)})`]);
  if (s.length < 2) return bildir('Virman için en az iki hesap gerekli', 'uyari');
  const m = modal({ baslik: 'Hesaplar arası virman', icerik: html`<form id="vr-form" class="form-izgara">${alan({ ad: 'kaynak_id', etiket: 'Çıkan hesap', tip: 'select', secenekler: s })}${alan({ ad: 'hedef_id', etiket: 'Giren hesap', tip: 'select', secenekler: s, deger: s[1][0] })}${alan({ ad: 'tutar', etiket: 'Tutar', tip: 'number', zorunlu: true })}${alan({ ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: bugun() })}${alan({ ad: 'aciklama', etiket: 'Açıklama', tam: true, yer: 'Örnek: Bankaya nakit yatırma' })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="vr-form">Virmanı kaydet</button>` });
  formGonder($('#vr-form', m.el), async (v) => { await api('POST', '/finans/transfer', v); bildir('Virman kaydedildi'); m.kapat(); sonra(); });
}
function hesapModal(h, sonra) {
  const m = modal({ baslik: h ? 'Hesabı düzenle' : 'Yeni kasa / banka hesabı', icerik: html`<form id="fh-form" class="form-izgara">${alan({ ad: 'ad', etiket: 'Hesap adı', zorunlu: true, deger: h && h.ad, tam: true, yer: 'Örnek: Ziraat Bankası TL' })}${alan({ ad: 'tur', etiket: 'Tür', tip: 'select', deger: h ? h.tur : 'banka', secenekler: FH_TUR })}${alan({ ad: 'para_birimi', etiket: 'Para birimi', tip: 'select', deger: h ? h.para_birimi : 'TRY', secenekler: ['TRY', 'USD', 'EUR', 'GBP'] })}
    ${alan({ ad: 'banka_adi', etiket: 'Banka', deger: h && h.banka_adi })}${alan({ ad: 'sube', etiket: 'Şube', deger: h && h.sube })}${alan({ ad: 'iban', etiket: 'IBAN', deger: h && h.iban, tam: true, yer: 'TR00 0000 ...' })}${alan({ ad: 'acilis_bakiye', etiket: 'Açılış bakiyesi', tip: 'number', deger: h ? h.acilis_bakiye : 0 })}
    ${h ? alan({ ad: 'aktif', etiket: 'Aktif', tip: 'checkbox', deger: h.aktif }) : ''}</form>`, altlik: html`${h ? html`<button class="dugme hayalet" data-sil style="margin-right:auto;color:var(--tehlike)">Sil</button>` : ''}<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="fh-form">Kaydet</button>` });
  formGonder($('#fh-form', m.el), async (v) => { if (h) { v.aktif = v.aktif ? 1 : 0; await api('PUT', '/finans/hesaplar/' + h.id, v); } else await api('POST', '/finans/hesaplar', v); onbellekTemizle(); bildir('Hesap kaydedildi'); m.kapat(); sonra(); });
  const s = $('[data-sil]', m.el); if (s) s.addEventListener('click', async () => { if (!await onayla({ mesaj: 'Hesap silinsin mi? Hareketi varsa pasife alınır.', dugme: 'Sil', tehlike: true })) return; const r = await api('DELETE', '/finans/hesaplar/' + h.id); onbellekTemizle(); bildir(r.mesaj || 'Hesap silindi'); m.kapat(); D.git('/kasa-banka'); });
}

// ─── Çek / senet ───
export async function cekSenet(kok) {
  const d = { yon: '', durum: 'portfoy' };
  const DURUM = { portfoy: 'Portföyde', tahsil: 'Tahsil edildi', odendi: 'Ödendi', ciro: 'Ciro edildi', karsiliksiz: 'Karşılıksız', iade: 'İade' };
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Çek ve senet', alt: 'Alınan ve verilen çek-senetlerin vade ve durum takibi', eylemler: izleyici() ? '' : html`<button class="dugme" data-eylem="yeni" data-y="verilen"><i class="fa-solid fa-arrow-up"></i>Verilen</button><button class="dugme birincil" data-eylem="yeni" data-y="alinan"><i class="fa-solid fa-arrow-down"></i>Alınan çek/senet</button>` })}
    <div class="kpi-sira" id="ozet"></div><section class="kart"><div class="filtre-cubuk"><div class="cip-sira">${[['', 'Tümü'], ['alinan', 'Alınan'], ['verilen', 'Verilen']].map(([k, a]) => html`<button class="cip ${d.yon === k ? 'secili' : ''}" data-eylem="yon" data-k="${k}">${a}</button>`)}</div>
      <select id="durum" style="width:auto"><option value="">Durum: tümü</option>${Object.entries(DURUM).map(([k, a]) => html`<option value="${k}" ${d.durum === k ? 'selected' : ''}>${a}</option>`)}</select></div><div class="tablo-kap" id="tablo"></div></section>`);
  const yukle = async () => {
    const q = new URLSearchParams(); if (d.yon) q.set('yon', d.yon); if (d.durum) q.set('durum', d.durum);
    const r = await api('GET', '/cek-senet?' + q);
    yerlestir($('#ozet'), html`${kpi({ etiket: 'Alınan (portföy)', deger: para(r.alinan_portfoy), tur: 'basari', ikon: 'fa-arrow-down' })}${kpi({ etiket: 'Verilen (ödenecek)', deger: para(r.verilen_portfoy), tur: 'tehlike', ikon: 'fa-arrow-up' })}${kpi({ etiket: 'Vadesi geçen', deger: sayi(r.vadesi_gecen), tur: r.vadesi_gecen ? 'uyari' : 'notr', ikon: 'fa-clock' })}`);
    if (!r.kayitlar.length) return yerlestir($('#tablo'), bos({ ikon: 'fa-money-check', baslik: 'Kayıt yok' }));
    yerlestir($('#tablo'), html`<table class="tablo mobil-kart"><thead><tr><th>Vade</th><th>Tür</th><th>No</th><th>Cari / borçlu</th><th>Banka</th><th>Durum</th><th class="sag">Tutar</th><th class="eylemler"></th></tr></thead><tbody>${r.kayitlar.map(c => html`<tr>
      <td class="mk-baslik ${c.durum === 'portfoy' && c.vade < bugun() ? 'para-negatif' : ''}">${tarih(c.vade)}</td><td data-etiket="Tür">${c.yon === 'alinan' ? 'Alınan' : 'Verilen'} ${c.tur === 'cek' ? 'çek' : 'senet'}</td><td data-etiket="No">${c.no || '—'}</td>
      <td data-etiket="Cari">${c.cari_id ? html`<a href="/cariler/${c.cari_id}">${c.unvan}</a>` : c.borclu || '—'}</td><td data-etiket="Banka">${c.banka || '—'}</td><td data-etiket="Durum">${rozet(DURUM[c.durum], c.durum === 'portfoy' ? 'bilgi' : ['tahsil', 'odendi'].includes(c.durum) ? 'basari' : c.durum === 'karsiliksiz' ? 'tehlike' : 'notr')}</td>
      <td class="sag" data-etiket="Tutar">${para(c.tutar)}</td><td class="eylemler">${izleyici() ? '' : html`<button class="dugme kucuk" data-eylem="durumDegis" data-id="${c.id}">Durum</button><button class="ikon-dugme" data-eylem="sil" data-id="${c.id}" aria-label="Sil"><i class="fa-solid fa-trash"></i></button>`}</td></tr>`)}</tbody></table>`);
    d.son = r;
  };
  $('#durum').addEventListener('change', e => { d.durum = e.target.value; yukle(); });
  baglan(kok, {
    yon: (el) => { d.yon = el.dataset.k; $$('.cip', kok).forEach(b => b.classList.toggle('secili', b === el)); yukle(); },
    yeni: async (el) => {
      const yon = el.dataset.y; const cariler = await secenekler('cari', true);
      const m = modal({ baslik: yon === 'alinan' ? 'Alınan çek / senet' : 'Verilen çek / senet', genis: true, icerik: html`<form id="cs-form" class="form-izgara uclu">${alan({ ad: 'tur', etiket: 'Tür', tip: 'select', secenekler: [['cek', 'Çek'], ['senet', 'Senet']] })}${alan({ ad: 'no', etiket: 'Çek / senet no' })}${alan({ ad: 'tutar', etiket: 'Tutar', tip: 'number', zorunlu: true })}
        ${alan({ ad: 'cari_id', etiket: 'Cari', tip: 'select', secenekler: [['', 'Seçin'], ...cariler], yardim: 'Seçilirse cari bakiyesine işlenir' })}${alan({ ad: 'borclu', etiket: 'Keşideci / borçlu' })}${alan({ ad: 'banka', etiket: 'Banka' })}
        ${alan({ ad: 'duzenleme', etiket: 'Düzenleme tarihi', tip: 'date', deger: bugun() })}${alan({ ad: 'vade', etiket: 'Vade', tip: 'date', zorunlu: true })}${alan({ ad: 'sube', etiket: 'Şube' })}${alan({ ad: 'aciklama', etiket: 'Açıklama', tam: true })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="cs-form">Kaydet</button>` });
      formGonder($('#cs-form', m.el), async (v) => { await api('POST', '/cek-senet', { ...v, yon }); bildir('Kaydedildi'); m.kapat(); yukle(); });
    },
    durumDegis: async (el) => {
      const c = d.son.kayitlar.find(x => x.id === +el.dataset.id); const hesaplar = await secenekler('finans_hesap', true);
      const sec = c.yon === 'alinan' ? [['portfoy', 'Portföyde'], ['tahsil', 'Tahsil edildi'], ['ciro', 'Ciro edildi'], ['karsiliksiz', 'Karşılıksız'], ['iade', 'İade edildi']] : [['portfoy', 'Portföyde'], ['odendi', 'Ödendi'], ['karsiliksiz', 'Karşılıksız'], ['iade', 'İade alındı']];
      const m = modal({ baslik: 'Çek / senet durumu', icerik: html`<form id="csd-form" class="form-izgara">${alan({ ad: 'durum', etiket: 'Yeni durum', tip: 'select', deger: c.durum, secenekler: sec, tam: true })}${alan({ ad: 'finans_hesap_id', etiket: 'Tahsil / ödeme hesabı', tip: 'select', secenekler: hesaplar, tam: true, yardim: 'Tahsil edildi veya ödendi seçilirse tutar bu hesaba işlenir' })}${alan({ ad: 'tarih', etiket: 'İşlem tarihi', tip: 'date', deger: bugun() })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="csd-form">Kaydet</button>` });
      formGonder($('#csd-form', m.el), async (v) => { await api('POST', `/cek-senet/${c.id}/durum`, v); bildir('Durum güncellendi'); m.kapat(); yukle(); });
    },
    sil: async (el) => { if (!await onayla({ mesaj: 'Kayıt ve bağlı cari/kasa hareketleri silinsin mi?', dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/cek-senet/' + el.dataset.id); bildir('Silindi'); yukle(); },
  });
  await yukle();
}

// ─── Bütçe ───
export async function butce(kok, p, sorgu) {
  const yil = +(sorgu.yil || new Date().getFullYear());
  const v = await api('GET', '/butce/' + yil);
  const plan = {}; v.plan.forEach(x => { plan[`${x.tip}|${x.kategori}|${x.ay}`] = x.tutar; });
  const gercek = {}; v.gercek.forEach(x => { gercek[`${x.tip}|${x.kategori}|${x.ay}`] = (gercek[`${x.tip}|${x.kategori}|${x.ay}`] || 0) + x.tutar; });
  const kats = { gelir: [...new Set([...v.kategoriler.filter(k => k.tip === 'gelir').map(k => k.ad), ...v.gercek.filter(x => x.tip === 'gelir').map(x => x.kategori)])], gider: [...new Set([...v.kategoriler.filter(k => k.tip === 'gider').map(k => k.ad), ...v.gercek.filter(x => x.tip === 'gider').map(x => x.kategori)])] };
  const aylar = Array.from({ length: 12 }, (_, i) => i + 1);
  const toplamP = (tip, k) => aylar.reduce((s, a) => s + (plan[`${tip}|${k}|${a}`] || 0), 0);
  const toplamG = (tip, k) => aylar.reduce((s, a) => s + (gercek[`${tip}|${k}|${a}`] || 0), 0);
  const blok = (tip) => html`<tr class="ara-toplam"><td colspan="15">${tip === 'gelir' ? 'Gelirler' : 'Giderler'}</td></tr>${kats[tip].map(k => html`<tr><td style="white-space:nowrap">${k}</td>${aylar.map(a => html`<td><input type="number" step="any" data-b="${tip}|${k}|${a}" value="${plan[`${tip}|${k}|${a}`] || ''}" style="height:30px;min-width:84px;padding:0 6px;font-size:12.5px" ${izleyici() ? 'readonly' : ''} title="Gerçekleşen: ${para(gercek[`${tip}|${k}|${a}`] || 0)}"></td>`)}
    <td class="sag kalin">${para(toplamP(tip, k), false)}</td><td class="sag ${tip === 'gider' ? (toplamG(tip, k) > toplamP(tip, k) && toplamP(tip, k) ? 'para-negatif' : '') : (toplamG(tip, k) >= toplamP(tip, k) ? 'para-pozitif' : '')}">${para(toplamG(tip, k), false)}</td></tr>`)}`;
  yerlestir(kok, html`${sayfaBaslik({ baslik: `${yil} bütçesi`, alt: 'Kategori bazında aylık plan; gerçekleşen tutarlar kasa-banka hareketlerinden hesaplanır. Hücrenin üzerine gelince gerçekleşeni görürsünüz.',
    eylemler: html`<div class="dugme-grup"><a class="dugme" href="/butce?yil=${yil - 1}">${yil - 1}</a><button class="dugme secili">${yil}</button><a class="dugme" href="/butce?yil=${yil + 1}">${yil + 1}</a></div>${izleyici() ? '' : html`<button class="dugme" data-eylem="kopyala">Ocak değerini tüm yıla yay</button><button class="dugme birincil" data-eylem="kaydet"><i class="fa-solid fa-floppy-disk"></i>Kaydet</button>`}` })}
    <div class="kpi-sira">${kpi({ etiket: 'Planlanan gelir', deger: para(kats.gelir.reduce((s, k) => s + toplamP('gelir', k), 0)), tur: 'basari' })}${kpi({ etiket: 'Gerçekleşen gelir', deger: para(kats.gelir.reduce((s, k) => s + toplamG('gelir', k), 0)), tur: 'basari' })}${kpi({ etiket: 'Planlanan gider', deger: para(kats.gider.reduce((s, k) => s + toplamP('gider', k), 0)), tur: 'tehlike' })}${kpi({ etiket: 'Gerçekleşen gider', deger: para(kats.gider.reduce((s, k) => s + toplamG('gider', k), 0)), tur: 'tehlike' })}</div>
    <section class="kart"><div class="tablo-kap"><table class="tablo"><thead><tr><th>Kategori</th>${aylar.map(a => html`<th>${ayKisa(`${yil}-${String(a).padStart(2, '0')}`)}</th>`)}<th class="sag">Plan</th><th class="sag">Gerçek</th></tr></thead><tbody>${blok('gelir')}${blok('gider')}</tbody></table></div></section>`);
  baglan(kok, {
    kopyala: () => { $$('[data-b$="|1"]', kok).forEach(i => { if (!i.value) return; const on = i.dataset.b.slice(0, -2); aylar.slice(1).forEach(a => { const h = $(`[data-b="${on}|${a}"]`, kok); if (h && !h.value) h.value = i.value; }); }); bildir('Boş aylar ocak değeriyle dolduruldu. Kaydetmeyi unutmayın.', 'bilgi'); },
    kaydet: async () => { const satirlar = $$('[data-b]', kok).map(i => { const [tip, kategori, ay] = i.dataset.b.split('|'); return { tip, kategori, ay: +ay, tutar: +i.value || 0 }; }); await api('PUT', '/butce/' + yil, { satirlar }); bildir('Bütçe kaydedildi'); butce(kok, p, sorgu); },
  });
}
