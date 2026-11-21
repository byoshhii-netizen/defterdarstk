// Personel takibi: kartlar, izin, devamsızlık, avans, maaş, prim, notlar
import { D, api, html, yerlestir, $, $$, para, sayi, tarih, bildir, baglan, formGonder, modal, onayla, sayfaBaslik, kpi, bos, rozet, telLink, indir, alan, bugun, buAy, ayAdi, gorselKucult } from '../cekirdek.js';
import { secenekler } from './ortak.js';

// PIN korumalı istek: gerekirse PIN sorar ve tekrar dener
async function papi(metod, yol, govde, secenek = {}) {
  const pin = sessionStorage.getItem('dd-pin');
  try { return await api(metod, yol, govde, { ...secenek, basliklar: pin ? { 'X-Personel-Pin': pin } : {} }); }
  catch (e) {
    if (e.durum === 403 && e.veri && e.veri.pin_gerekli) {
      if (pin) { sessionStorage.removeItem('dd-pin'); if (e.message.includes('hatalı')) bildir('PIN kodu hatalı', 'hata'); }
      const yeni = await D.pinIste(); if (!yeni) throw e;
      return papi(metod, yol, govde, secenek);
    }
    throw e;
  }
}
const izleyici = () => D.oturum.kullanici.rol === 'izleyici';
const bas = (p) => (p.ad[0] + p.soyad[0]).toLocaleUpperCase('tr-TR');

export async function liste(kok) {
  const v = await api('GET', '/personel');
  const aktif = v.personeller.filter(p => p.aktif);
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Personel', alt: v.pin_var ? 'Maaş ve kişisel bilgiler PIN ile korunuyor.' : 'Personel kartları, izin, avans ve maaş takibi.',
    eylemler: html`<button class="dugme" data-eylem="excel"><i class="fa-solid fa-file-excel"></i>Excel</button>${izleyici() ? '' : html`<button class="dugme" data-eylem="maas"><i class="fa-solid fa-money-bill-wave"></i>Toplu maaş öde</button><button class="dugme birincil" data-eylem="yeni"><i class="fa-solid fa-user-plus"></i>Personel ekle</button>`}` })}
    <div class="kpi-sira">${kpi({ etiket: 'Aktif personel', deger: sayi(aktif.length), tur: 'bilgi', ikon: 'fa-id-card' })}${kpi({ etiket: 'Aylık maaş yükü', deger: v.toplam_maas === null ? 'PIN korumalı' : para(v.toplam_maas), tur: 'muhur', ikon: 'fa-wallet' })}${kpi({ etiket: 'Ayrılan', deger: sayi(v.personeller.length - aktif.length), tur: 'notr', ikon: 'fa-user-minus' })}</div>
    <section class="kart">${v.personeller.length ? html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Personel</th><th>Pozisyon</th><th>Departman</th><th>Telefon</th><th>İşe başlama</th><th>Durum</th><th class="sag">Maaş</th></tr></thead><tbody>
      ${v.personeller.map(p => html`<tr class="tiklanir" data-git="/personel/${p.id}"><td class="mk-baslik"><span style="display:inline-flex;align-items:center;gap:10px">${p.fotograf ? html`<img src="${p.fotograf}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover">` : html`<span class="avatar">${bas(p)}</span>`}<strong>${p.ad} ${p.soyad}</strong></span></td>
        <td data-etiket="Pozisyon">${p.pozisyon || '—'}</td><td data-etiket="Departman">${p.departman || '—'}</td><td data-etiket="Telefon">${telLink(p.telefon)}</td><td data-etiket="Başlama">${tarih(p.ise_baslama)}</td><td data-etiket="Durum">${p.aktif ? rozet('Aktif', 'basari') : rozet('Ayrıldı', 'notr')}</td><td class="sag" data-etiket="Maaş">${p.maas === null ? '••••' : para(p.maas)}</td></tr>`)}</tbody></table></div>`
      : bos({ ikon: 'fa-id-card', baslik: 'Henüz personel eklenmedi', eylem: izleyici() ? '' : html`<button class="dugme birincil" data-eylem="yeni"><i class="fa-solid fa-user-plus"></i>Personel ekle</button>` })}</section>`);
  kok.addEventListener('click', e => { const tr = e.target.closest('tr[data-git]'); if (tr && !e.target.closest('a')) D.git(tr.dataset.git); });
  baglan(kok, {
    yeni: () => personelModal(null, (id) => D.git('/personel/' + id)),
    excel: async () => { await papi('GET', '/personel/rapor/excel', null, { dosya: true }).then(async r => { const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'personel.xlsx'; a.click(); }); },
    maas: async () => {
      const hesaplar = await secenekler('finans_hesap', true);
      const detay = await papi('GET', '/personel');
      const m = modal({ baslik: 'Toplu maaş ödemesi', genis: true, icerik: html`<form id="tm-form"><div class="form-izgara">${alan({ ad: 'ay', etiket: 'Dönem', tip: 'month', deger: buAy(), zorunlu: true })}${alan({ ad: 'finans_hesap_id', etiket: 'Ödeme hesabı', tip: 'select', zorunlu: true, secenekler: hesaplar })}</div>
        <p class="soluk" style="margin:14px 0 8px;font-size:12.5px">Seçilen dönem için daha önce ödenmiş personel atlanır. Ödeme kasadan "Maaş" gideri olarak düşülür.</p>
        <div class="tablo-kap"><table class="tablo"><thead><tr><th class="dar"><input type="checkbox" checked data-tumu></th><th>Personel</th><th class="sag">Maaş</th></tr></thead><tbody>${detay.personeller.filter(p => p.aktif && p.maas).map(p => html`<tr><td><input type="checkbox" name="ids" value="${p.id}" data-dizi checked></td><td>${p.ad} ${p.soyad}</td><td class="sag">${para(p.maas)}</td></tr>`)}</tbody></table></div></form>`,
        altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="tm-form">Ödemeyi kaydet</button>` });
      $('[data-tumu]', m.el).addEventListener('change', e => $$('[name=ids]', m.el).forEach(c => { c.checked = e.target.checked; }));
      formGonder($('#tm-form', m.el), async (x) => { const r = await papi('POST', '/personel/toplu-maas', x); bildir(`${r.adet} personele toplam ${para(r.toplam)} maaş ödendi`); m.kapat(); liste(kok); });
    },
  });
}

function personelModal(p, sonra) {
  const m = modal({ baslik: p ? 'Personel bilgileri' : 'Yeni personel', genis: true, icerik: html`<form id="p-form" class="form-izgara uclu">
    <div class="tam" style="display:flex;align-items:center;gap:14px"><span id="foto">${p && p.fotograf ? html`<img src="${p.fotograf}" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover">` : html`<span class="avatar" style="width:56px;height:56px;font-size:18px"><i class="fa-solid fa-user"></i></span>`}</span><label class="dugme kucuk">Fotoğraf seç<input type="file" accept="image/*" hidden id="foto-sec"></label></div>
    ${alan({ ad: 'ad', etiket: 'Ad', zorunlu: true, deger: p && p.ad })}${alan({ ad: 'soyad', etiket: 'Soyad', zorunlu: true, deger: p && p.soyad })}${alan({ ad: 'tc_no', etiket: 'TC kimlik no', deger: p && p.tc_no, ek: 'inputmode="numeric" maxlength="11"' })}
    ${alan({ ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: p && p.telefon })}${alan({ ad: 'eposta', etiket: 'E-posta', tip: 'email', deger: p && p.eposta })}${alan({ ad: 'dogum_tarihi', etiket: 'Doğum tarihi', tip: 'date', deger: p && p.dogum_tarihi })}
    ${alan({ ad: 'pozisyon', etiket: 'Pozisyon', deger: p && p.pozisyon })}${alan({ ad: 'departman', etiket: 'Departman', deger: p && p.departman })}${alan({ ad: 'ise_baslama', etiket: 'İşe başlama', tip: 'date', deger: p && p.ise_baslama })}
    ${alan({ ad: 'maas', etiket: 'Net maaş', tip: 'number', deger: p && p.maas })}${alan({ ad: 'izin_hakki', etiket: 'Yıllık izin hakkı (gün)', tip: 'number', deger: p ? p.izin_hakki : 14 })}${alan({ ad: 'isten_cikis', etiket: 'İşten çıkış', tip: 'date', deger: p && p.isten_cikis })}
    ${alan({ ad: 'banka', etiket: 'Banka', deger: p && p.banka })}${alan({ ad: 'iban', etiket: 'IBAN', deger: p && p.iban })}<span></span>
    ${alan({ ad: 'acil_kisi', etiket: 'Acil durumda aranacak', deger: p && p.acil_kisi })}${alan({ ad: 'acil_telefon', etiket: 'Acil telefon', tip: 'tel', deger: p && p.acil_telefon })}${p ? alan({ ad: 'aktif', etiket: 'Çalışıyor', tip: 'checkbox', deger: p.aktif }) : html`<span></span>`}
    ${alan({ ad: 'adres', etiket: 'Adres', tip: 'textarea', deger: p && p.adres, tam: true })}${alan({ ad: 'notlar', etiket: 'Notlar', tip: 'textarea', deger: p && p.notlar, tam: true })}</form>`,
    altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="p-form">Kaydet</button>` });
  let foto = p ? p.fotograf : null, degisti = false;
  $('#foto-sec', m.el).addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; foto = await gorselKucult(f, 320, .82); degisti = true; yerlestir($('#foto', m.el), html`<img src="${foto}" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover">`); });
  formGonder($('#p-form', m.el), async (v) => {
    v.fotograf = foto; v.fotograf_degisti = degisti || !p;
    if (p) { await papi('PUT', '/personel/' + p.id, v); bildir('Personel güncellendi'); m.kapat(); sonra(p.id); }
    else { const r = await papi('POST', '/personel', v); bildir('Personel eklendi'); m.kapat(); sonra(r.id); }
  });
}

const TUR = { devamsizlik: 'Devamsızlık', izin: 'İzin', avans: 'Avans', maas: 'Maaş', prim: 'Prim / ikramiye', kesinti: 'Kesinti', not: 'Not' };
export async function detay(kok, { id }, sorgu) {
  const v = await papi('GET', '/personel/' + id);
  const { personel: p, kayitlar, ozet } = v;
  const sekme = sorgu.sekme || 'genel';
  const filtre = { genel: null, izin: ['izin', 'devamsizlik'], odeme: ['maas', 'avans', 'prim', 'kesinti'], not: ['not'] }[sekme];
  const l = filtre ? kayitlar.filter(k => filtre.includes(k.tur)) : kayitlar;
  yerlestir(kok, html`${sayfaBaslik({ baslik: `${p.ad} ${p.soyad}`, alt: html`${p.pozisyon || ''}${p.departman ? ' · ' + p.departman : ''} ${p.aktif ? rozet('Aktif', 'basari') : rozet('Ayrıldı', 'notr')}`, kirinti: [{ ad: 'Personel', rota: '/personel' }, { ad: `${p.ad} ${p.soyad}` }],
    eylemler: izleyici() ? '' : html`<button class="dugme" data-eylem="duzenle"><i class="fa-solid fa-pen"></i>Düzenle</button><button class="dugme birincil" data-eylem="kayit"><i class="fa-solid fa-plus"></i>Kayıt ekle</button>` })}
    <div class="kpi-sira">${kpi({ etiket: 'Net maaş', deger: para(p.maas), tur: 'muhur', ikon: 'fa-wallet' })}${kpi({ etiket: 'Kalan izin', deger: `${sayi(ozet.izin_kalan)} gün`, alt: `${sayi(ozet.izin_kullanilan)} / ${sayi(ozet.izin_hakki)} gün kullanıldı (bu yıl)`, tur: 'bilgi', ikon: 'fa-umbrella-beach' })}${kpi({ etiket: 'Bekleyen avans', deger: para(ozet.bekleyen_avans), tur: ozet.bekleyen_avans ? 'uyari' : 'notr', ikon: 'fa-hand-holding-dollar' })}${kpi({ etiket: 'Kıdem', deger: ozet.kidem !== null ? `${sayi(ozet.kidem)} yıl` : '—', alt: `${ozet.devamsizlik} devamsızlık kaydı`, tur: 'notr', ikon: 'fa-award' })}</div>
    <nav class="sekmeler">${[['genel', 'Tüm kayıtlar'], ['izin', 'İzin ve devamsızlık'], ['odeme', 'Maaş ve avans'], ['not', 'Notlar'], ['bilgi', 'Kişisel bilgiler']].map(([k, a]) => html`<a href="/personel/${id}?sekme=${k}" class="${sekme === k ? 'aktif' : ''}">${a}</a>`)}</nav>
    ${sekme === 'bilgi' ? html`<section class="kart"><div class="kart-govde"><dl class="tanim-listesi"><dt>TC kimlik no</dt><dd>${p.tc_no || '—'}</dd><dt>Doğum tarihi</dt><dd>${tarih(p.dogum_tarihi)}</dd><dt>Telefon</dt><dd>${telLink(p.telefon)}</dd><dt>E-posta</dt><dd>${p.eposta || '—'}</dd><dt>Adres</dt><dd>${p.adres || '—'}</dd>
      <dt>İşe başlama</dt><dd>${tarih(p.ise_baslama)}</dd><dt>İşten çıkış</dt><dd>${tarih(p.isten_cikis)}</dd><dt>Banka / IBAN</dt><dd>${p.banka || ''} ${p.iban || '—'}</dd><dt>Acil durum</dt><dd>${p.acil_kisi || '—'} ${p.acil_telefon ? telLink(p.acil_telefon) : ''}</dd>${p.notlar ? html`<dt>Notlar</dt><dd style="white-space:pre-wrap">${p.notlar}</dd>` : ''}</dl></div></section>
      ${izleyici() ? '' : html`<button class="dugme hayalet" data-eylem="sil" style="margin-top:12px;color:var(--tehlike)"><i class="fa-solid fa-trash"></i>Personel kaydını sil</button>`}`
    : html`<section class="kart">${l.length ? html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Tarih / dönem</th><th>Tür</th><th>Detay</th><th>Durum</th><th class="sag">Tutar / gün</th><th class="eylemler"></th></tr></thead><tbody>${l.map(k => html`<tr>
      <td class="mk-baslik">${k.ay ? ayAdi(k.ay) : tarih(k.tarih)}${k.bitis ? ' – ' + tarih(k.bitis) : ''}</td><td data-etiket="Tür">${TUR[k.tur]}${k.alt_tur ? html` <span class="soluk">(${k.alt_tur})</span>` : ''}</td><td data-etiket="Detay" style="white-space:pre-wrap">${k.baslik ? html`<strong>${k.baslik}</strong> ` : ''}${k.aciklama || ''}</td>
      <td data-etiket="Durum">${['maas', 'avans', 'prim'].includes(k.tur) ? (k.odendi ? rozet('Ödendi ' + tarih(k.odeme_tarihi), 'basari') : rozet('Ödenmedi', 'uyari')) : ''}</td>
      <td class="sag" data-etiket="Tutar">${k.tutar ? para(k.tutar) : k.gun ? sayi(k.gun) + ' gün' : ''}</td>
      <td class="eylemler">${izleyici() ? '' : html`${['maas', 'avans', 'prim'].includes(k.tur) && !k.odendi ? html`<button class="dugme kucuk" data-eylem="ode" data-id="${k.id}">Ödendi</button>` : ''}<button class="ikon-dugme" data-eylem="kayitSil" data-id="${k.id}" aria-label="Sil"><i class="fa-solid fa-trash"></i></button>`}</td></tr>`)}</tbody></table></div>` : bos({ ikon: 'fa-folder-open', baslik: 'Kayıt yok' })}</section>`}`);
  const yenile = () => detay(kok, { id }, sorgu);
  baglan(kok, {
    duzenle: () => personelModal(p, yenile),
    kayit: () => kayitModal(p, sekme === 'izin' ? 'izin' : sekme === 'odeme' ? 'maas' : sekme === 'not' ? 'not' : 'izin', yenile),
    ode: async (el) => { const hesaplar = await secenekler('finans_hesap', true); const m = modal({ baslik: 'Ödemeyi kaydet', icerik: html`<form id="od-form" class="form-izgara">${alan({ ad: 'finans_hesap_id', etiket: 'Ödeme hesabı', tip: 'select', secenekler: [['', 'Kasaya işleme'], ...hesaplar], tam: true })}${alan({ ad: 'tarih', etiket: 'Ödeme tarihi', tip: 'date', deger: bugun() })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="od-form">Kaydet</button>` });
      formGonder($('#od-form', m.el), async (x) => { await papi('POST', `/personel/kayit/${el.dataset.id}/odendi`, { ...x, odendi: true }); bildir('Ödeme kaydedildi'); m.kapat(); yenile(); }); },
    kayitSil: async (el) => { if (!await onayla({ mesaj: 'Kayıt silinsin mi? Bağlı kasa hareketi de silinir.', dugme: 'Sil', tehlike: true })) return; await papi('DELETE', '/personel/kayit/' + el.dataset.id); bildir('Kayıt silindi'); yenile(); },
    sil: async () => { if (!await onayla({ baslik: 'Personel silinsin mi?', mesaj: 'Personel ve tüm kayıtları çöp kutusuna taşınır.', dugme: 'Sil', tehlike: true, yazili: p.ad })) return; await papi('DELETE', '/personel/' + p.id); bildir('Personel silindi'); D.git('/personel', { degistir: true }); },
  });
}

async function kayitModal(p, varsayilanTur, sonra) {
  const hesaplar = await secenekler('finans_hesap', true);
  const m = modal({ baslik: 'Personel kaydı ekle', genis: true, icerik: html`<form id="k-form" class="form-izgara">${alan({ ad: 'tur', etiket: 'Kayıt türü', tip: 'select', deger: varsayilanTur, secenekler: Object.entries(TUR), tam: true })}
    <div class="tam form-izgara" id="alanlar"></div></form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="k-form">Kaydet</button>` });
  const ciz = () => {
    const t = $('[name=tur]', m.el).value;
    const a = [];
    if (t === 'izin') a.push(alan({ ad: 'alt_tur', etiket: 'İzin türü', tip: 'select', secenekler: ['Yıllık', 'Mazeret', 'Rapor', 'Ücretsiz', 'Doğum', 'Evlilik', 'Ölüm'] }), alan({ ad: 'tarih', etiket: 'Başlangıç', tip: 'date', deger: bugun() }), alan({ ad: 'bitis', etiket: 'Bitiş', tip: 'date', deger: bugun() }), alan({ ad: 'gun', etiket: 'Gün sayısı', tip: 'number', yardim: 'Boşsa tarihlerden hesaplanır' }));
    if (t === 'devamsizlik') a.push(alan({ ad: 'alt_tur', etiket: 'Tür', tip: 'select', secenekler: ['Gelmedi', 'Geç geldi', 'Erken çıktı', 'Habersiz'] }), alan({ ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: bugun() }));
    if (['avans', 'prim', 'kesinti'].includes(t)) a.push(alan({ ad: 'tutar', etiket: 'Tutar', tip: 'number', zorunlu: true }), alan({ ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: bugun() }));
    if (t === 'maas') a.push(alan({ ad: 'ay', etiket: 'Dönem', tip: 'month', deger: buAy(), zorunlu: true }), alan({ ad: 'tutar', etiket: 'Tutar', tip: 'number', deger: p.maas, zorunlu: true }));
    if (['avans', 'prim', 'maas'].includes(t)) a.push(alan({ ad: 'odendi', etiket: 'Ödendi', tip: 'checkbox', deger: true }), alan({ ad: 'finans_hesap_id', etiket: 'Ödeme hesabı', tip: 'select', secenekler: [['', 'Kasaya işleme'], ...hesaplar] }));
    if (t === 'not') a.push(alan({ ad: 'alt_tur', etiket: 'Not türü', tip: 'select', secenekler: ['Genel', 'Performans', 'Uyarı', 'Takdir', 'Görüşme'] }), alan({ ad: 'baslik', etiket: 'Başlık' }));
    a.push(alan({ ad: 'aciklama', etiket: t === 'not' ? 'Not' : 'Açıklama', tip: 'textarea', zorunlu: t === 'not', tam: true }));
    yerlestir($('#alanlar', m.el), html`${a}`);
  };
  $('[name=tur]', m.el).addEventListener('change', ciz); ciz();
  formGonder($('#k-form', m.el), async (v) => { await papi('POST', `/personel/${p.id}/kayit`, v); bildir('Kayıt eklendi'); m.kapat(); sonra(); });
}
