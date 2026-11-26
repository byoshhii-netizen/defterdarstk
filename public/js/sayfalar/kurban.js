// Kurban organizasyonu: kurban programının tüm özellikleri, yeni tasarımla
import { D, api, html, ham, yerlestir, $, $$, para, sayi, tarih, bildir, hataGoster, baglan, degisince, gecikmeli, formGonder, modal, onayla, sayfaBaslik, kpi, bos, rozet, durumRozet, telLink, indir, yazdir, alan, ilerleme, gorselKucult, boyut, excelTablo, kac } from '../cekirdek.js';
import { secenekler, logoVeri } from './ortak.js';

const TUR_AD = { buyukbas: 'Büyükbaş', kucukbas: 'Küçükbaş' };
const KURBAN_TURLERI = ['Udhiye', 'Adak', 'Akika', 'Şükür', 'Nafile', 'Vacip', 'Hedy', 'Diğer'];
const ODEME = [['bekliyor', 'Bekliyor'], ['odendi', 'Ödendi'], ['kismi', 'Kısmi ödendi'], ['iptal', 'İptal']];
const izleyici = () => D.oturum.kullanici.rol === 'izleyici';

function sekmeler(org, aktif) {
  const s = [['', 'Kurbanlar'], ['/hissedarlar', 'Hissedarlar'], ['/videolar', 'Videolar'], ['/rapor', 'Rapor']];
  return html`<nav class="sekmeler">${s.map(([y, ad]) => html`<a href="/kurban/${org.id}${y}" class="${aktif === y ? 'aktif' : ''}">${ad}</a>`)}</nav>`;
}

// ─── Organizasyonlar ───
export async function organizasyonlar(kok) {
  const liste = await api('GET', '/kurban/organizasyonlar');
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Kurban organizasyonları', alt: 'Her yıl veya kampanya için ayrı organizasyon açın; kurbanlar, hissedarlar ve tahsilatlar ayrı takip edilir.',
    eylemler: izleyici() ? '' : html`<button class="dugme birincil" data-eylem="yeni"><i class="fa-solid fa-plus"></i>Yeni organizasyon</button>` })}
    ${liste.length ? html`<div class="izgara izgara-3">${liste.map(o => html`<article class="kart">
      <div class="kart-baslik"><div><h2><a href="/kurban/${o.id}">${o.ad}</a></h2><p>${o.yil} · ${o.aktif ? 'Aktif' : 'Arşiv'}</p></div>
        ${izleyici() ? '' : html`<div style="display:flex;gap:2px"><button class="ikon-dugme" data-eylem="duzenle" data-id="${o.id}" aria-label="Düzenle"><i class="fa-solid fa-pen"></i></button><button class="ikon-dugme" data-eylem="sil" data-id="${o.id}" aria-label="Sil"><i class="fa-solid fa-trash"></i></button></div>`}</div>
      <div class="kart-govde">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>Hisse doluluğu</span><strong>%${o.ozet.doluluk}</strong></div>${ilerleme(o.ozet.doluluk)}
        <dl class="tanim-listesi" style="margin-top:14px"><dt>Kurban</dt><dd>${o.ozet.toplam_kurban} / ${o.max_kurban} (${o.ozet.buyukbas} BB, ${o.ozet.kucukbas} KB)</dd>
          <dt>Hissedar</dt><dd>${sayi(o.ozet.dolu_hisse)}</dd><dt>Tahsil edilen</dt><dd>${para(o.ozet.tahsil_edilen)}</dd><dt>Bekleyen</dt><dd>${para(o.ozet.bekleyen_tahsilat)}</dd>
          <dt>Hisse fiyatı</dt><dd>BB ${para(o.buyukbas_hisse_fiyati)} · KB ${para(o.kucukbas_hisse_fiyati)}</dd></dl>
        <a class="dugme tam" href="/kurban/${o.id}" style="margin-top:14px">Organizasyonu aç</a></div></article>`)}</div>`
      : html`<div class="kart">${bos({ ikon: 'fa-cow', baslik: 'Henüz kurban organizasyonu yok', metin: 'Bu yılın kurban organizasyonunu oluşturarak başlayın. Eski eski kurban programından yedeğiniz varsa Yedekleme sayfasından içe aktarabilirsiniz.', eylem: izleyici() ? '' : html`<button class="dugme birincil" data-eylem="yeni"><i class="fa-solid fa-plus"></i>Organizasyon oluştur</button> <a class="dugme" href="/yedekleme">Kurban yedeğini aktar</a>` })}</div>`}`);
  baglan(kok, {
    yeni: () => orgModal(null, () => organizasyonlar(kok)),
    duzenle: (el) => orgModal(liste.find(o => o.id === +el.dataset.id), () => organizasyonlar(kok)),
    sil: async (el) => {
      const o = liste.find(x => x.id === +el.dataset.id);
      if (!await onayla({ baslik: 'Organizasyon silinsin mi?', mesaj: `"${o.ad}" ve içindeki ${o.ozet.toplam_kurban} kurban, ${o.ozet.dolu_hisse} hissedar çöp kutusuna taşınacak. Kasaya işlenmiş hisse tahsilatları da kaldırılır.`, dugme: 'Sil', tehlike: true, yazili: o.ad })) return;
      await api('DELETE', '/kurban/organizasyonlar/' + o.id); bildir('Organizasyon çöp kutusuna taşındı'); organizasyonlar(kok);
    },
  });
}

async function orgModal(o, sonra) {
  const hesaplar = await secenekler('finans_hesap', true);
  const m = modal({ baslik: o ? 'Organizasyonu düzenle' : 'Yeni kurban organizasyonu', icerik: html`<form id="org-form" class="form-izgara">
    ${alan({ ad: 'ad', etiket: 'Organizasyon adı', zorunlu: true, deger: o ? o.ad : `Kurban ${new Date().getFullYear()}`, tam: true })}
    ${alan({ ad: 'yil', etiket: 'Yıl', tip: 'number', zorunlu: true, deger: o ? o.yil : new Date().getFullYear() })}
    ${alan({ ad: 'max_kurban', etiket: 'Kurban kapasitesi', tip: 'number', zorunlu: true, deger: o ? o.max_kurban : 100 })}
    ${alan({ ad: 'buyukbas_hisse_fiyati', etiket: 'Büyükbaş hisse fiyatı', tip: 'number', deger: o ? o.buyukbas_hisse_fiyati : '' })}
    ${alan({ ad: 'kucukbas_hisse_fiyati', etiket: 'Küçükbaş fiyatı', tip: 'number', deger: o ? o.kucukbas_hisse_fiyati : '' })}
    ${alan({ ad: 'finans_hesap_id', etiket: 'Tahsilatların işleneceği kasa/banka', tip: 'select', deger: o ? o.finans_hesap_id : (hesaplar[0] || [])[0], secenekler: [['', 'Kasaya işleme'], ...hesaplar], tam: true, yardim: 'Ödendi olarak işaretlenen her hisse bu hesaba gelir olarak yazılır.' })}
    ${alan({ ad: 'aciklama', etiket: 'Açıklama', tip: 'textarea', deger: o ? o.aciklama : '', tam: true })}
    ${o ? alan({ ad: 'aktif', etiket: 'Aktif organizasyon (panelde gösterilir)', tip: 'checkbox', deger: o.aktif, tam: true }) : ''}</form>`,
    altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="org-form">${o ? 'Kaydet' : 'Oluştur'}</button>` });
  formGonder($('#org-form', m.el), async (v) => {
    if (o) { v.aktif = v.aktif ? 1 : 0; await api('PUT', '/kurban/organizasyonlar/' + o.id, v); bildir('Organizasyon güncellendi'); m.kapat(); sonra(); }
    else { const r = await api('POST', '/kurban/organizasyonlar', v); bildir('Organizasyon oluşturuldu'); m.kapat(); D.git('/kurban/' + r.id); }
  });
}

// ─── Organizasyon: kurbanlar ───
export async function organizasyon(kok, { org: orgId }, sorgu) {
  const { org, ozet } = await api('GET', `/kurban/organizasyonlar/${orgId}/ozet`);
  const durum = { filtre: sorgu.durum || '', tur: sorgu.tur || '', q: '', gorunum: localStorage.getItem('dd-kurban-gorunum') || 'izgara', secili: new Set(), liste: [] };
  yerlestir(kok, html`${sayfaBaslik({ baslik: org.ad, alt: `${org.yil} kurban organizasyonu`, kirinti: [{ ad: 'Kurban', rota: '/kurban' }, { ad: org.ad }],
    eylemler: html`<button class="dugme" data-eylem="tumYazdir"><i class="fa-solid fa-print"></i>Yazdır</button><button class="dugme" data-eylem="excel"><i class="fa-solid fa-file-excel"></i>Excel</button>${izleyici() ? '' : html`<button class="dugme birincil" data-eylem="yeniKurban"><i class="fa-solid fa-plus"></i>Kurban ekle</button>`}` })}
    ${sekmeler(org, '')}
    <div class="kpi-sira">
      ${kpi({ etiket: 'Kurban', deger: `${ozet.toplam_kurban} / ${org.max_kurban}`, alt: `${ozet.buyukbas} büyükbaş · ${ozet.kucukbas} küçükbaş`, tur: 'bilgi', ikon: 'fa-cow' })}
      ${kpi({ etiket: 'Hisse doluluğu', deger: `%${ozet.doluluk}`, alt: `${ozet.dolu_hisse} dolu · ${ozet.bos_hisse} boş`, tur: 'muhur', ikon: 'fa-chart-pie' })}
      ${kpi({ etiket: 'Tahsil edilen', deger: para(ozet.tahsil_edilen), alt: `${ozet.odendi} hisse ödendi`, tur: 'basari', ikon: 'fa-sack-dollar' })}
      ${kpi({ etiket: 'Bekleyen tahsilat', deger: para(ozet.bekleyen_tahsilat), alt: `${ozet.bekliyor + ozet.kismi} hisse`, tur: 'uyari', ikon: 'fa-hourglass-half', rota: `/kurban/${org.id}/hissedarlar?odeme=bekliyor` })}
      ${kpi({ etiket: 'Vekalet', deger: `${ozet.vekalet} / ${ozet.dolu_hisse}`, alt: `${ozet.kesildi} kurban kesildi`, tur: 'notr', ikon: 'fa-handshake' })}
    </div>
    <section class="kart">
      <div class="toplu-cubuk gizli" id="toplu"></div>
      <div class="filtre-cubuk">
        <div class="ara"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="ara" placeholder="Kurban no, küpe veya hissedar ara" aria-label="Ara"></div>
        <div class="cip-sira" id="cipler"></div><span class="bosluk"></span>
        <div class="dugme-grup" role="group" aria-label="Görünüm"><button class="dugme kucuk ${durum.gorunum === 'izgara' ? 'secili' : ''}" data-eylem="gorunum" data-g="izgara" aria-label="Kart görünümü"><i class="fa-solid fa-grip"></i></button><button class="dugme kucuk ${durum.gorunum === 'liste' ? 'secili' : ''}" data-eylem="gorunum" data-g="liste" aria-label="Liste görünümü"><i class="fa-solid fa-list"></i></button></div>
      </div>
      <div id="kurbanlar"></div>
    </section>`);

  const CIPLER = [['', 'Tümü'], ['t:buyukbas', 'Büyükbaş'], ['t:kucukbas', 'Küçükbaş'], ['bos', 'Boş yer var'], ['doldu', 'Doldu'], ['kesildi', 'Kesildi'], ['odeme_bekleyen', 'Ödeme bekleyen']];
  const cipCiz = () => yerlestir($('#cipler'), html`${CIPLER.map(([k, ad]) => { const sec = k.startsWith('t:') ? durum.tur === k.slice(2) : (k === '' ? !durum.filtre && !durum.tur : durum.filtre === k); return html`<button class="cip ${sec ? 'secili' : ''}" data-eylem="cip" data-k="${k}">${ad}</button>`; })}`);
  const yukle = async () => {
    const p = new URLSearchParams(); if (durum.tur) p.set('tur', durum.tur); if (durum.filtre) p.set('durum', durum.filtre);
    durum.liste = await api('GET', `/kurban/organizasyonlar/${org.id}/kurbanlar?${p}`);
    ciz();
  };
  const ciz = () => {
    cipCiz();
    const q = durum.q.toLocaleLowerCase('tr-TR');
    const l = q ? durum.liste.filter(k => String(k.kurban_no) === q || (k.kupe_no || '').toLocaleLowerCase('tr-TR').includes(q) || (k.bagiscilar || '').toLocaleLowerCase('tr-TR').includes(q)) : durum.liste;
    const el = $('#kurbanlar');
    if (!l.length) { yerlestir(el, bos({ ikon: 'fa-cow', baslik: durum.liste.length ? 'Bu filtreyle kurban yok' : 'Henüz kurban eklenmedi', metin: durum.liste.length ? '' : 'Büyükbaş (7 hisse) veya küçükbaş (tek hisse) kurban ekleyin. İsterseniz hissedarları da aynı anda girebilirsiniz.', eylem: durum.liste.length || izleyici() ? '' : html`<button class="dugme birincil" data-eylem="yeniKurban"><i class="fa-solid fa-plus"></i>Kurban ekle</button>` })); topluCiz(); return; }
    if (durum.gorunum === 'izgara') {
      yerlestir(el, html`<div class="kurban-izgara">${l.map(k => html`<a class="kurban-kart ${k.kesildi ? 'kesildi' : ''} ${durum.secili.has(k.id) ? 'secili' : ''}" href="/kurban/${org.id}/kurban/${k.id}">
        ${izleyici() ? '' : html`<input type="checkbox" class="kk-sec" data-sec="${k.id}" ${durum.secili.has(k.id) ? 'checked' : ''} aria-label="Kurban ${k.kurban_no} seç">`}
        <div class="kk-ust"><span><span class="kk-no">${k.tur === 'buyukbas' ? 'BB' : 'KB'} ${k.kurban_no}</span></span></div>
        <div class="kk-tur">${k.kurban_turu}${k.kupe_no ? ' · ' + k.kupe_no : ''}</div>
        <div class="hisse-noktalar" aria-label="${k.dolu_hisse}/${k.toplam_hisse} hisse dolu">${Array.from({ length: k.toplam_hisse }, (_, i) => html`<i class="${i < k.odendi_sayi ? 'odendi' : i < k.dolu_hisse ? 'dolu' : ''}"></i>`)}</div>
        <div class="kk-alt"><span>${k.dolu_hisse}/${k.toplam_hisse} dolu</span>${k.kesildi ? rozet('Kesildi', 'notr') : k.bekliyor_sayi ? rozet(`${k.bekliyor_sayi} ödeme`, 'uyari') : k.dolu_hisse >= k.toplam_hisse ? rozet('Doldu', 'basari') : ''}</div></a>`)}</div>`);
    } else {
      yerlestir(el, html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr>${izleyici() ? '' : html`<th class="dar"><input type="checkbox" data-tumu aria-label="Tümünü seç"></th>`}<th>Kurban</th><th>Tür</th><th>Küpe no</th><th>Hissedarlar</th><th class="orta">Doluluk</th><th class="orta">Ödeme</th><th class="orta">Vekalet</th><th>Durum</th><th class="sag">Alış</th></tr></thead>
        <tbody>${l.map(k => html`<tr class="tiklanir ${durum.secili.has(k.id) ? 'secili' : ''}" data-git="/kurban/${org.id}/kurban/${k.id}">${izleyici() ? '' : html`<td class="mk-sec"><input type="checkbox" data-sec="${k.id}" ${durum.secili.has(k.id) ? 'checked' : ''}></td>`}
          <td class="mk-baslik kalin" data-etiket="Kurban">${TUR_AD[k.tur]} ${k.kurban_no}</td><td data-etiket="Tür">${k.kurban_turu}</td><td data-etiket="Küpe">${k.kupe_no || '—'}</td>
          <td data-etiket="Hissedarlar" style="max-width:320px"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${k.bagiscilar || '—'}</span></td>
          <td class="orta" data-etiket="Doluluk">${k.dolu_hisse}/${k.toplam_hisse}</td><td class="orta" data-etiket="Ödenen">${k.odendi_sayi}/${k.dolu_hisse}</td><td class="orta" data-etiket="Vekalet">${k.vekalet_sayi}/${k.dolu_hisse}</td>
          <td data-etiket="Durum">${k.kesildi ? rozet('Kesildi ' + tarih(k.kesim_tarihi), 'notr') : k.dolu_hisse >= k.toplam_hisse ? rozet('Doldu', 'basari') : rozet('Boş yer var', 'uyari')}</td><td class="sag" data-etiket="Alış">${para(k.alis_fiyati)}</td></tr>`)}</tbody></table></div>`);
    }
    topluCiz();
  };
  const topluCiz = () => {
    const n = durum.secili.size; const el = $('#toplu'); el.classList.toggle('gizli', !n); if (!n) return;
    yerlestir(el, html`<strong>${n} kurban seçildi</strong><button class="dugme" data-eylem="toplu" data-i="kesildi" data-d="1"><i class="fa-solid fa-check"></i>Kesildi</button><button class="dugme" data-eylem="toplu" data-i="kesildi" data-d="0">Kesilmedi</button>
      <button class="dugme" data-eylem="toplu" data-i="vekalet" data-d="1"><i class="fa-solid fa-handshake"></i>Vekalet alındı</button><button class="dugme" data-eylem="toplu" data-i="odeme" data-d="1"><i class="fa-solid fa-sack-dollar"></i>Ödendi</button>
      <button class="dugme" data-eylem="seciliYazdir"><i class="fa-solid fa-print"></i>Yazdır</button><button class="dugme" data-eylem="toplu" data-i="sil"><i class="fa-solid fa-trash"></i>Sil</button><button class="dugme" data-eylem="secimTemizle">Seçimi kaldır</button>`);
  };
  $('#ara').addEventListener('input', gecikmeli((e) => { durum.q = e.target.value.trim(); ciz(); }, 150));
  kok.addEventListener('change', (e) => {
    if (e.target.matches('[data-sec]')) { const id = +e.target.dataset.sec; e.target.checked ? durum.secili.add(id) : durum.secili.delete(id); const k = e.target.closest('.kurban-kart, tr'); k && k.classList.toggle('secili', e.target.checked); topluCiz(); }
    if (e.target.matches('[data-tumu]')) { durum.liste.forEach(k => e.target.checked ? durum.secili.add(k.id) : durum.secili.delete(k.id)); ciz(); }
  });
  kok.addEventListener('click', (e) => {
    if (e.target.matches('[data-sec]')) { e.stopPropagation(); return; }
    const tr = e.target.closest('tr[data-git]'); if (tr && !e.target.closest('input')) D.git(tr.dataset.git);
  }, true);
  baglan(kok, {
    cip: (el) => { const k = el.dataset.k; if (k.startsWith('t:')) { durum.tur = durum.tur === k.slice(2) ? '' : k.slice(2); } else if (k === '') { durum.tur = ''; durum.filtre = ''; } else durum.filtre = durum.filtre === k ? '' : k; yukle(); },
    gorunum: (el) => { durum.gorunum = el.dataset.g; localStorage.setItem('dd-kurban-gorunum', durum.gorunum); $$('[data-eylem="gorunum"]', kok).forEach(b => b.classList.toggle('secili', b === el)); ciz(); },
    secimTemizle: () => { durum.secili.clear(); ciz(); },
    yeniKurban: () => yeniKurbanModal(org, () => organizasyon(kok, { org: orgId }, sorgu)),
    excel: () => indir(`/kurban/organizasyonlar/${org.id}/excel`, 'kurban.xlsx'),
    tumYazdir: () => yazdirSecimModal(org, durum.liste.map(k => k.id)),
    seciliYazdir: () => yazdirSecimModal(org, [...durum.secili]),
    toplu: async (el) => {
      const islem = el.dataset.i, deger = el.dataset.d === '1';
      const mesaj = { kesildi: deger ? 'kesildi olarak işaretlenecek' : 'kesilmedi olarak işaretlenecek', vekalet: 'tüm hissedarları için vekalet alındı olarak işaretlenecek', odeme: 'tüm hisseleri ödendi olarak işaretlenecek ve kasaya işlenecek', sil: 'çöp kutusuna taşınacak' }[islem];
      if (!await onayla({ baslik: 'Toplu işlem', mesaj: `Seçili ${durum.secili.size} kurban ${mesaj}.`, dugme: islem === 'sil' ? 'Sil' : 'Uygula', tehlike: islem === 'sil' })) return;
      const r = await api('POST', '/kurban/kurbanlar/toplu', { ids: [...durum.secili], islem, deger });
      bildir(`${r.etkilenen} kurban güncellendi`); durum.secili.clear(); organizasyon(kok, { org: orgId }, sorgu);
    },
  });
  await yukle();
}

async function yeniKurbanModal(org, sonra) {
  const kategoriler = (await secenekler('kategori:bagisci')).map(x => x[0]);
  const hisseSatir = (i) => html`<tr><td class="orta kalin">${i + 1}</td><td><input name="h${i}_bagisci_adi" placeholder="Ad soyad" autocomplete="off" data-oneri="${i}"></td><td><input name="h${i}_bagisci_telefon" type="tel" placeholder="05xx"></td>
    <td><select name="h${i}_kurban_turu"><option value="">Kurbanla aynı</option>${KURBAN_TURLERI.map(t => html`<option>${t}</option>`)}</select></td><td><select name="h${i}_odeme_durumu">${ODEME.map(([v, e]) => html`<option value="${v}">${e}</option>`)}</select></td></tr>`;
  const m = modal({ baslik: 'Kurban ekle', genis: true, icerik: html`<form id="kurban-form"><div class="form-izgara uclu">
      ${alan({ ad: 'tur', etiket: 'Hayvan', tip: 'select', zorunlu: true, secenekler: [['buyukbas', 'Büyükbaş (7 hisse)'], ['kucukbas', 'Küçükbaş (tek hisse)']] })}
      ${alan({ ad: 'kurban_turu', etiket: 'Kurban türü', tip: 'select', secenekler: KURBAN_TURLERI })}
      ${alan({ ad: 'adet', etiket: 'Adet', tip: 'number', deger: 1, min: 1, maks: 200, yardim: 'Birden fazla eklerseniz hissedarları sonra girersiniz.' })}
      ${alan({ ad: 'kupe_no', etiket: 'Küpe no', yer: 'TR...' })}${alan({ ad: 'alis_fiyati', etiket: 'Alış fiyatı (maliyet)', tip: 'number' })}${alan({ ad: 'kesen_kisi', etiket: 'Kesen kişi' })}
      ${alan({ ad: 'kucukbas_sayi', etiket: 'Küçükbaş hayvan sayısı', tip: 'number', deger: 1, min: 1, ek: 'data-kb' })}
      ${alan({ ad: 'aciklama', etiket: 'Açıklama', tam: true })}</div>
      <div id="hisse-giris" style="margin-top:18px"><h3 style="font-size:14px;margin-bottom:8px">Hissedarlar <span class="soluk" style="font-weight:400;font-size:12.5px">— isteğe bağlı, boş bırakılan hisseler boş kalır</span></h3>
      <div class="tablo-kap"><table class="tablo kalem-tablo"><thead><tr><th class="dar">No</th><th>Bağışçı</th><th>Telefon</th><th>Kurban türü</th><th>Ödeme</th></tr></thead><tbody id="hisse-satirlar">${Array.from({ length: 7 }, (_, i) => hisseSatir(i))}</tbody></table></div></div></form>`,
    altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="kurban-form">Kurbanı ekle</button>` });
  const f = $('#kurban-form', m.el);
  const guncelle = () => {
    const tur = f.tur.value, adet = +f.adet.value || 1;
    $('#hisse-giris', m.el).classList.toggle('gizli', adet > 1);
    $$('#hisse-satirlar tr', m.el).forEach((tr, i) => tr.classList.toggle('gizli', tur === 'kucukbas' && i > 0));
    f.querySelector('[data-kb]').closest('.alan').classList.toggle('gizli', tur !== 'kucukbas');
    f.kupe_no.disabled = adet > 1;
  };
  f.addEventListener('change', guncelle); f.adet.addEventListener('input', guncelle); guncelle();
  oneriBagla(f, (i, o) => { f[`h${i}_bagisci_telefon`].value = o.bagisci_telefon || ''; });
  formGonder(f, async (v) => {
    const hisseler = Array.from({ length: 7 }, (_, i) => ({ bagisci_adi: v[`h${i}_bagisci_adi`], bagisci_telefon: v[`h${i}_bagisci_telefon`], kurban_turu: v[`h${i}_kurban_turu`] || v.kurban_turu, odeme_durumu: v[`h${i}_odeme_durumu`], bagisci_kategori: kategoriler[0] }));
    const r = await api('POST', `/kurban/organizasyonlar/${org.id}/kurbanlar`, { ...v, hisseler });
    bildir(r.ids.length > 1 ? `${r.ids.length} kurban eklendi` : 'Kurban eklendi'); m.kapat();
    if (r.ids.length === 1) D.git(`/kurban/${org.id}/kurban/${r.id}`); else sonra();
  });
}

// Önceki bağışçılardan otomatik tamamlama
function oneriBagla(kap, sec) {
  let acik = null;
  const kapat = () => { if (acik) { acik.remove(); acik = null; } };
  kap.addEventListener('input', gecikmeli(async (e) => {
    const inp = e.target; if (!inp.matches('[data-oneri]')) return;
    kapat(); const q = inp.value.trim(); if (q.length < 2) return;
    let l = []; try { l = await api('GET', '/kurban/bagisci-ara?q=' + encodeURIComponent(q)); } catch (er) { return; }
    if (!l.length || document.activeElement !== inp) return;
    const d = document.createElement('div'); d.className = 'otomatik-oneri';
    yerlestir(d, html`${l.map((o, j) => html`<button type="button" data-j="${j}"><span>${o.bagisci_adi}</span><small>${o.bagisci_telefon || ''} · ${o.adet} kez</small></button>`)}`);
    const sar = inp.parentElement; sar.style.position = 'relative'; sar.appendChild(d); acik = d;
    d.addEventListener('mousedown', (ev) => { const b = ev.target.closest('button'); if (!b) return; ev.preventDefault(); const o = l[+b.dataset.j]; inp.value = o.bagisci_adi; sec(inp.dataset.oneri, o); kapat(); });
  }, 250));
  kap.addEventListener('focusout', () => setTimeout(kapat, 150));
}

// ─── Kurban detay (7 hisse) ───
export async function kurbanDetay(kok, { org: orgId, id }) {
  const v = await api('GET', `/kurban/kurbanlar/${id}`);
  const { kurban: k, org, hisseler, hisse_fiyati } = v;
  const dolu = hisseler.filter(h => h.bagisci_adi);
  yerlestir(kok, html`${sayfaBaslik({ baslik: `${TUR_AD[k.tur]} kurban ${k.kurban_no}`, alt: html`${k.kurban_turu}${k.kupe_no ? ' · Küpe ' + k.kupe_no : ''} · ${k.kesildi ? rozet('Kesildi ' + tarih(k.kesim_tarihi), 'notr') : dolu.length >= k.toplam_hisse ? rozet('Doldu', 'basari') : rozet(`${k.toplam_hisse - dolu.length} boş hisse`, 'uyari')}`,
    kirinti: [{ ad: 'Kurban', rota: '/kurban' }, { ad: org.ad, rota: `/kurban/${org.id}` }, { ad: `Kurban ${k.kurban_no}` }],
    eylemler: html`<div class="dugme-grup">${v.onceki ? html`<a class="dugme" href="/kurban/${org.id}/kurban/${v.onceki.id}" aria-label="Önceki kurban"><i class="fa-solid fa-chevron-left"></i></a>` : html`<button class="dugme" disabled aria-label="Önceki"><i class="fa-solid fa-chevron-left"></i></button>`}${v.sonraki ? html`<a class="dugme" href="/kurban/${org.id}/kurban/${v.sonraki.id}" aria-label="Sonraki kurban"><i class="fa-solid fa-chevron-right"></i></a>` : html`<button class="dugme" disabled aria-label="Sonraki"><i class="fa-solid fa-chevron-right"></i></button>`}</div>
      <button class="dugme" data-eylem="yazdir"><i class="fa-solid fa-print"></i>Yazdır</button><button class="dugme" data-eylem="excel"><i class="fa-solid fa-file-excel"></i>Excel</button>
      ${izleyici() ? '' : html`<button class="dugme ${k.kesildi ? '' : 'birincil'}" data-eylem="kesildi"><i class="fa-solid ${k.kesildi ? 'fa-rotate-left' : 'fa-check'}"></i>${k.kesildi ? 'Kesimi geri al' : 'Kesildi işaretle'}</button>`}` })}
    <div class="izgara izgara-3-1">
      <section class="kart"><div class="kart-baslik"><div><h2>Hissedarlar</h2><p>${dolu.length}/${k.toplam_hisse} dolu · hisse fiyatı ${para(hisse_fiyati)}</p></div></div>
        <div class="tablo-kap"><table class="tablo hisse-tablo mobil-kart"><thead><tr><th class="dar">Hisse</th><th>Bağışçı</th><th>Kimin adına</th><th>Kurban türü</th><th>Ödeme</th><th class="orta">Vekalet</th><th class="orta">Video</th><th class="eylemler"></th></tr></thead>
        <tbody>${hisseler.map(h => h.bagisci_adi ? html`<tr>
          <td class="mk-gizle"><span class="hisse-no">${h.hisse_no}</span></td>
          <td class="mk-baslik" data-etiket="Bağışçı"><strong>${h.bagisci_adi}</strong><span class="ikincil">${h.bagisci_telefon ? telLink(h.bagisci_telefon) : ''}${h.bagisci_kategori && h.bagisci_kategori !== 'Genel Bağışçı' ? ' · ' + h.bagisci_kategori : ''}</span></td>
          <td data-etiket="Kimin adına">${h.kimin_adina || '—'}</td><td data-etiket="Kurban türü">${h.kurban_turu}</td>
          <td data-etiket="Ödeme">${durumRozet(h.odeme_durumu)}${h.odeme_durumu === 'kismi' ? html`<span class="ikincil">${para(h.odenen_tutar)}</span>` : ''}</td>
          <td class="orta" data-etiket="Vekalet"><button class="dugme kucuk vekalet-dugme ${h.vekalet_onay ? 'alindi' : ''}" data-eylem="vekalet" data-id="${h.id}" ${izleyici() ? 'disabled' : ''}><i class="fa-solid ${h.vekalet_onay ? 'fa-circle-check' : 'fa-handshake'}"></i>${h.vekalet_onay ? 'Alındı' : 'Al'}</button></td>
          <td class="orta" data-etiket="Video">${h.video_url ? html`<button class="ikon-dugme" data-eylem="videoIzle" data-id="${h.id}" aria-label="Videoyu izle" style="color:var(--basari)"><i class="fa-solid fa-circle-play"></i></button>` : h.video_ister ? html`<button class="dugme kucuk" data-eylem="videoYukle" data-id="${h.id}" ${izleyici() ? 'disabled' : ''}><i class="fa-solid fa-upload"></i>Yükle</button>` : html`<span class="soluk">—</span>`}</td>
          <td class="eylemler">${izleyici() ? '' : html`<button class="ikon-dugme" data-eylem="hisse" data-id="${h.id}" aria-label="Düzenle"><i class="fa-solid fa-pen"></i></button><button class="ikon-dugme" data-eylem="temizle" data-id="${h.id}" aria-label="Boşalt"><i class="fa-solid fa-eraser"></i></button>`}</td></tr>`
          : html`<tr class="hisse-bos"><td class="mk-gizle"><span class="hisse-no">${h.hisse_no}</span></td><td class="mk-baslik" colspan="6">Boş hisse</td><td class="eylemler">${izleyici() ? '' : html`<button class="dugme kucuk birincil" data-eylem="hisse" data-id="${h.id}"><i class="fa-solid fa-plus"></i>Hissedar ekle</button>`}</td></tr>`)}</tbody></table></div></section>
      <aside><section class="kart"><div class="kart-baslik"><h2>Kurban bilgileri</h2>${izleyici() ? '' : html`<button class="dugme kucuk" data-eylem="duzenle"><i class="fa-solid fa-pen"></i>Düzenle</button>`}</div><div class="kart-govde">
        <dl class="tanim-listesi"><dt>Hayvan</dt><dd>${TUR_AD[k.tur]}${k.tur === 'kucukbas' && k.kucukbas_sayi > 1 ? ` (${k.kucukbas_sayi} adet)` : ''}</dd><dt>Kurban türü</dt><dd>${k.kurban_turu}</dd><dt>Küpe no</dt><dd>${k.kupe_no || '—'}</dd>
        <dt>Alış fiyatı</dt><dd>${para(k.alis_fiyati)}</dd><dt>Kesen kişi</dt><dd>${k.kesen_kisi || '—'}</dd><dt>Kesim tarihi</dt><dd>${tarih(k.kesim_tarihi)}</dd>${k.aciklama ? html`<dt>Açıklama</dt><dd>${k.aciklama}</dd>` : ''}</dl></div></section>
        <section class="kart"><div class="kart-govde"><dl class="tanim-listesi"><dt>Beklenen</dt><dd>${para(dolu.filter(h => h.odeme_durumu !== 'iptal').length * hisse_fiyati)}</dd><dt>Tahsil edilen</dt><dd>${para(dolu.reduce((s, h) => s + (h.odeme_durumu === 'odendi' ? (h.odenen_tutar || hisse_fiyati) : h.odeme_durumu === 'kismi' ? h.odenen_tutar : 0), 0))}</dd></dl></div></section>
        ${izleyici() ? '' : html`<button class="dugme tam hayalet" data-eylem="sil" style="margin-top:12px;color:var(--tehlike)"><i class="fa-solid fa-trash"></i>Kurbanı sil</button>`}</aside></div>`);
  const yenile = () => kurbanDetay(kok, { org: orgId, id });
  baglan(kok, {
    hisse: (el) => hisseModal(hisseler.find(h => h.id === +el.dataset.id), k, hisse_fiyati, yenile),
    vekalet: (el) => vekaletModal(hisseler.find(h => h.id === +el.dataset.id), k, yenile),
    temizle: async (el) => { const h = hisseler.find(x => x.id === +el.dataset.id); if (!await onayla({ baslik: 'Hisse boşaltılsın mı?', mesaj: `${h.hisse_no}. hissedeki "${h.bagisci_adi}" bilgileri silinecek ve varsa kasaya işlenmiş tahsilat kaldırılacak.`, dugme: 'Boşalt', tehlike: true })) return; await api('DELETE', '/kurban/hisseler/' + h.id); bildir('Hisse boşaltıldı'); yenile(); },
    videoYukle: (el) => videoYukleModal(hisseler.find(h => h.id === +el.dataset.id), yenile),
    videoIzle: (el) => videoIzle(hisseler.find(h => h.id === +el.dataset.id), yenile),
    duzenle: () => kurbanDuzenleModal(k, yenile),
    kesildi: async () => { await api('PUT', '/kurban/kurbanlar/' + k.id, { ...k, kesildi: !k.kesildi, kesim_tarihi: null }); bildir(k.kesildi ? 'Kesim geri alındı' : 'Kurban kesildi olarak işaretlendi'); yenile(); },
    yazdir: () => yazdirSecimModal(org, [k.id]),
    excel: () => indir(`/kurban/kurbanlar/${k.id}/excel`, `kurban-${k.kurban_no}.xlsx`),
    sil: async () => { if (!await onayla({ baslik: 'Kurban silinsin mi?', mesaj: `Kurban ${k.kurban_no} ve ${dolu.length} hissedar çöp kutusuna taşınacak. Aynı türdeki kurbanların numaraları yeniden sıralanır.`, dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/kurban/kurbanlar/' + k.id); bildir('Kurban silindi'); D.git(`/kurban/${org.id}`, { degistir: true }); },
  });
}

async function hisseModal(h, k, fiyat, sonra) {
  const kategoriler = await secenekler('kategori:bagisci');
  const m = modal({ baslik: `${h.hisse_no}. hisse ${h.bagisci_adi ? '— ' + h.bagisci_adi : ''}`, genis: true, icerik: html`<form id="hisse-form" class="form-izgara">
    <label class="alan"><span>Bağışçı adı soyadı<em>*</em></span><input name="bagisci_adi" value="${h.bagisci_adi || ''}" required autocomplete="off" data-oneri="0"></label>
    ${alan({ ad: 'bagisci_telefon', etiket: 'Telefon', tip: 'tel', deger: h.bagisci_telefon })}
    ${alan({ ad: 'bagisci_kategori', etiket: 'Bağışçı kategorisi', tip: 'select', deger: h.bagisci_kategori, secenekler: kategoriler.length ? kategoriler : ['Genel Bağışçı'] })}
    ${alan({ ad: 'kurban_turu', etiket: 'Kurban türü', tip: 'select', deger: h.bagisci_adi ? h.kurban_turu : k.kurban_turu, secenekler: KURBAN_TURLERI })}
    ${alan({ ad: 'kimin_adina', etiket: 'Kimin adına', deger: h.kimin_adina, yardim: 'Vekaleten kesilecekse kişinin adı' })}
    ${alan({ ad: 'kimin_adina_telefon', etiket: 'Kimin adına telefon', tip: 'tel', deger: h.kimin_adina_telefon })}
    ${alan({ ad: 'odeme_durumu', etiket: 'Ödeme durumu', tip: 'select', deger: h.odeme_durumu, secenekler: ODEME })}
    ${alan({ ad: 'odenen_tutar', etiket: 'Ödenen tutar', tip: 'number', deger: h.odenen_tutar || '', yer: para(fiyat), yardim: 'Boş bırakılırsa hisse fiyatı esas alınır', ek: 'data-odenen' })}
    ${alan({ ad: 'video_ister', etiket: 'Kesim videosu istiyor', tip: 'checkbox', deger: h.video_ister })}
    ${alan({ ad: 'vekalet_onay', etiket: 'Vekalet alındı', tip: 'checkbox', deger: h.vekalet_onay })}
    ${alan({ ad: 'aciklama', etiket: 'Not', tip: 'textarea', deger: h.aciklama, tam: true })}</form>`,
    altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="hisse-form">Kaydet</button>` });
  const f = $('#hisse-form', m.el);
  oneriBagla(f, (i, o) => { f.bagisci_telefon.value = o.bagisci_telefon || ''; if (o.bagisci_kategori) f.bagisci_kategori.value = o.bagisci_kategori; });
  formGonder(f, async (v) => { await api('PUT', '/kurban/hisseler/' + h.id, v); bildir('Hissedar kaydedildi'); m.kapat(); sonra(); });
}

// standart vekalet onay ekranı: büyük iki seçenek + sonuç animasyonu
function vekaletModal(h, k, sonra) {
  const m = modal({ baslik: 'Vekalet durumu', icerik: html`<div class="vekalet-sonuc"><div class="halka ${h.vekalet_onay ? 'evet' : 'hayir'}" style="background:var(--birincil-acik);color:var(--birincil)"><i class="fa-solid fa-handshake"></i></div>
    <h3 style="font-size:17px">${h.bagisci_adi}</h3><p class="soluk">Kurban ${k.kurban_no} · ${h.hisse_no}. hisse${h.vekalet_tarihi ? html` · Son işlem ${tarih(h.vekalet_tarihi, true)}` : ''}</p></div>
    <div class="vekalet-secim"><button class="evet ${h.vekalet_onay ? 'aktif' : ''}" data-v="1"><i class="fa-solid fa-circle-check"></i>Vekalet alındı</button><button class="hayir ${!h.vekalet_onay ? 'aktif' : ''}" data-v="0"><i class="fa-solid fa-circle-xmark"></i>Vekalet alınmadı</button></div>` });
  $$('.vekalet-secim button', m.el).forEach(b => b.addEventListener('click', async () => {
    try {
      const v = b.dataset.v === '1';
      await api('PUT', `/kurban/hisseler/${h.id}/vekalet`, { vekalet_onay: v });
      yerlestir(m.icerik, html`<div class="vekalet-sonuc" style="padding:22px 0"><div class="halka ${v ? 'evet' : 'hayir'}"><i class="fa-solid ${v ? 'fa-check' : 'fa-xmark'}"></i></div><h3 style="font-size:18px">${v ? 'Vekalet alındı' : 'Vekalet alınmadı olarak işaretlendi'}</h3><p class="soluk">${h.bagisci_adi}</p></div>`);
      setTimeout(() => { m.kapat(); sonra(); }, 1100);
    } catch (e) { hataGoster(e); }
  }));
}

async function kurbanDuzenleModal(k, sonra) {
  const m = modal({ baslik: `Kurban ${k.kurban_no} bilgileri`, icerik: html`<form id="kd-form" class="form-izgara">
    ${alan({ ad: 'kurban_turu', etiket: 'Kurban türü', tip: 'select', deger: k.kurban_turu, secenekler: KURBAN_TURLERI })}${alan({ ad: 'kupe_no', etiket: 'Küpe no', deger: k.kupe_no })}
    ${alan({ ad: 'alis_fiyati', etiket: 'Alış fiyatı', tip: 'number', deger: k.alis_fiyati })}${alan({ ad: 'kesen_kisi', etiket: 'Kesen kişi', deger: k.kesen_kisi })}
    ${k.tur === 'kucukbas' ? alan({ ad: 'kucukbas_sayi', etiket: 'Hayvan sayısı', tip: 'number', deger: k.kucukbas_sayi }) : ''}
    ${alan({ ad: 'kesim_tarihi', etiket: 'Kesim tarihi', tip: 'date', deger: k.kesim_tarihi })}${alan({ ad: 'kesildi', etiket: 'Kesildi', tip: 'checkbox', deger: k.kesildi })}
    ${alan({ ad: 'aciklama', etiket: 'Açıklama', tip: 'textarea', deger: k.aciklama, tam: true })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="kd-form">Kaydet</button>` });
  formGonder($('#kd-form', m.el), async (v) => { await api('PUT', '/kurban/kurbanlar/' + k.id, v); bildir('Kurban güncellendi'); m.kapat(); sonra(); });
}

// ─── Video ───
async function dosyaYukle(dosya, klasor, ilerle) {
  return new Promise((coz, red) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/medya/yukle?klasor=' + encodeURIComponent(klasor));
    x.setRequestHeader('X-CSRF-Token', D.csrf); x.setRequestHeader('X-Dosya-Adi', encodeURIComponent(dosya.name)); x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.upload.onprogress = (e) => e.lengthComputable && ilerle && ilerle(e.loaded / e.total * 100);
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch (e) { /* */ } x.status < 300 ? coz(j) : red(new Error(j.hata || 'Yükleme başarısız')); };
    x.onerror = () => red(new Error('Bağlantı hatası'));
    x.send(dosya);
  });
}
export { dosyaYukle };
function videoYukleModal(h, sonra) {
  const m = modal({ baslik: `Kesim videosu — ${h.bagisci_adi}`, icerik: html`<label class="yukleme-alani" id="alan"><i class="fa-solid fa-cloud-arrow-up"></i>Videoyu seçin veya buraya sürükleyin<br><small>MP4, MOV, WEBM — en fazla 150 MB</small><input type="file" accept="video/*" hidden id="vd"></label><div id="ilerle" class="gizli" style="margin-top:14px">${ilerleme(0)}<p class="soluk" style="margin-top:6px;font-size:12.5px" id="yuzde">Yükleniyor</p></div>` });
  const yukle = async (f) => {
    if (!f) return;
    $('#ilerle', m.el).classList.remove('gizli');
    try {
      const r = await dosyaYukle(f, 'kurban-video', (p) => { $('#ilerle i', m.el).style.width = p + '%'; $('#yuzde', m.el).textContent = `%${p.toFixed(0)} yüklendi (${boyut(f.size)})`; });
      await api('PUT', `/kurban/hisseler/${h.id}/video`, { medya_id: r.id });
      bildir('Video yüklendi'); m.kapat(); sonra();
    } catch (e) { hataGoster(e); $('#ilerle', m.el).classList.add('gizli'); }
  };
  $('#vd', m.el).addEventListener('change', e => yukle(e.target.files[0]));
  const a = $('#alan', m.el);
  a.addEventListener('dragover', e => { e.preventDefault(); a.classList.add('uzerinde'); });
  a.addEventListener('dragleave', () => a.classList.remove('uzerinde'));
  a.addEventListener('drop', e => { e.preventDefault(); a.classList.remove('uzerinde'); yukle(e.dataTransfer.files[0]); });
}
function videoIzle(h, sonra) {
  const m = modal({ baslik: `Kesim videosu — ${h.bagisci_adi}`, genis: true, icerik: html`<video src="${h.video_url}" controls playsinline style="width:100%;border-radius:8px;background:#000;max-height:70vh"></video>`,
    altlik: html`${izleyici() ? '' : html`<button class="dugme tehlike hayalet" data-sil style="margin-right:auto;color:var(--tehlike)">Videoyu kaldır</button>`}<a class="dugme" href="${h.video_url}" download>İndir</a><button class="dugme birincil" data-kapat>Kapat</button>` });
  const s = $('[data-sil]', m.el);
  if (s) s.addEventListener('click', async () => { await api('DELETE', `/kurban/hisseler/${h.id}/video`); bildir('Video bağlantısı kaldırıldı'); m.kapat(); sonra(); });
}

// ─── Hissedarlar (tüm bağışçılar) ───
export async function hissedarlar(kok, { org: orgId }, sorgu) {
  const { org } = await api('GET', `/kurban/organizasyonlar/${orgId}/ozet`);
  const kategoriler = await secenekler('kategori:bagisci');
  const d = { q: '', odeme: sorgu.odeme || '', vekalet: '', tur: '', kategori: '', secili: new Set(), liste: [] };
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Hissedarlar', alt: org.ad, kirinti: [{ ad: 'Kurban', rota: '/kurban' }, { ad: org.ad, rota: `/kurban/${org.id}` }, { ad: 'Hissedarlar' }],
    eylemler: html`<button class="dugme" data-eylem="yazdirListe"><i class="fa-solid fa-print"></i>Listeyi yazdır</button><button class="dugme" data-eylem="excel"><i class="fa-solid fa-file-excel"></i>Excel</button><a class="dugme" href="/sms?kaynak=kurban&org=${org.id}"><i class="fa-solid fa-comment-sms"></i>SMS gönder</a>` })}
    ${sekmeler(org, '/hissedarlar')}
    <section class="kart"><div class="toplu-cubuk gizli" id="toplu"></div>
      <div class="filtre-cubuk"><div class="ara"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="ara" placeholder="Ad, telefon, kurban no" aria-label="Ara"></div>
        <select data-f="odeme" style="width:auto"><option value="">Ödeme: tümü</option>${ODEME.map(([v, e]) => html`<option value="${v}" ${d.odeme === v ? 'selected' : ''}>${e}</option>`)}</select>
        <select data-f="vekalet" style="width:auto"><option value="">Vekalet: tümü</option><option value="1">Alındı</option><option value="0">Alınmadı</option></select>
        <select data-f="tur" style="width:auto"><option value="">Hayvan: tümü</option><option value="buyukbas">Büyükbaş</option><option value="kucukbas">Küçükbaş</option></select>
        <select data-f="kategori" style="width:auto"><option value="">Kategori: tümü</option>${kategoriler.map(([v]) => html`<option>${v}</option>`)}</select></div>
      <div class="tablo-kap" id="tablo"></div></section>`);
  const yukle = async () => {
    const p = new URLSearchParams(); ['q', 'odeme', 'vekalet', 'tur', 'kategori'].forEach(k => d[k] && p.set(k, d[k]));
    d.liste = await api('GET', `/kurban/organizasyonlar/${org.id}/hisseler?${p}`); ciz();
  };
  const ciz = () => {
    if (!d.liste.length) { yerlestir($('#tablo'), bos({ ikon: 'fa-users', baslik: 'Hissedar bulunamadı' })); topluCiz(); return; }
    const toplam = d.liste.filter(h => h.odeme_durumu !== 'iptal').reduce((s, h) => s + h.hisse_fiyati, 0);
    yerlestir($('#tablo'), html`<table class="tablo mobil-kart"><thead><tr>${izleyici() ? '' : html`<th class="dar"><input type="checkbox" data-tumu aria-label="Tümünü seç"></th>`}<th>Bağışçı</th><th>Telefon</th><th>Kurban</th><th>Kimin adına</th><th>Tür</th><th>Ödeme</th><th class="orta">Vekalet</th><th class="sag">Hisse bedeli</th></tr></thead>
      <tbody>${d.liste.map(h => html`<tr class="${d.secili.has(h.id) ? 'secili' : ''}">${izleyici() ? '' : html`<td class="mk-sec"><input type="checkbox" data-sec="${h.id}" ${d.secili.has(h.id) ? 'checked' : ''}></td>`}
        <td class="mk-baslik"><a href="/kurban/${org.id}/kurban/${h.kurban_id}">${h.bagisci_adi}</a><span class="ikincil">${h.bagisci_kategori || ''}</span></td><td data-etiket="Telefon">${telLink(h.bagisci_telefon)}</td>
        <td data-etiket="Kurban">${h.tur === 'buyukbas' ? 'BB' : 'KB'} ${h.kurban_no} / ${h.hisse_no}</td><td data-etiket="Kimin adına">${h.kimin_adina || '—'}</td><td data-etiket="Kurban türü">${h.kurban_turu}</td>
        <td data-etiket="Ödeme">${durumRozet(h.odeme_durumu)}</td><td class="orta" data-etiket="Vekalet">${h.vekalet_onay ? html`<i class="fa-solid fa-circle-check" style="color:var(--basari)" title="Alındı"></i>` : html`<i class="fa-regular fa-circle" style="color:var(--soluk)" title="Alınmadı"></i>`}</td>
        <td class="sag" data-etiket="Bedel">${para(h.hisse_fiyati)}</td></tr>`)}</tbody>
      <tfoot><tr>${izleyici() ? '' : html`<td></td>`}<td colspan="7">${d.liste.length} hissedar</td><td class="sag">${para(toplam)}</td></tr></tfoot></table>`);
    topluCiz();
  };
  const topluCiz = () => {
    const n = d.secili.size, el = $('#toplu'); el.classList.toggle('gizli', !n); if (!n) return;
    yerlestir(el, html`<strong>${n} hissedar seçildi</strong><button class="dugme" data-eylem="toplu" data-i="odeme" data-d="odendi">Ödendi</button><button class="dugme" data-eylem="toplu" data-i="odeme" data-d="bekliyor">Bekliyor</button>
      <button class="dugme" data-eylem="toplu" data-i="vekalet" data-d="1">Vekalet alındı</button><button class="dugme" data-eylem="toplu" data-i="vekalet" data-d="0">Vekalet yok</button><button class="dugme" data-eylem="toplu" data-i="temizle"><i class="fa-solid fa-eraser"></i>Hisseleri boşalt</button><button class="dugme" data-eylem="secimTemizle">Seçimi kaldır</button>`);
  };
  $('#ara').addEventListener('input', gecikmeli(e => { d.q = e.target.value.trim(); yukle(); }, 250));
  degisince(kok, '[data-f]', el => { d[el.dataset.f] = el.value; yukle(); });
  kok.addEventListener('change', (e) => {
    if (e.target.matches('[data-sec]')) { const id = +e.target.dataset.sec; e.target.checked ? d.secili.add(id) : d.secili.delete(id); e.target.closest('tr').classList.toggle('secili', e.target.checked); topluCiz(); }
    if (e.target.matches('[data-tumu]')) { d.liste.forEach(h => e.target.checked ? d.secili.add(h.id) : d.secili.delete(h.id)); ciz(); }
  });
  baglan(kok, {
    secimTemizle: () => { d.secili.clear(); ciz(); },
    toplu: async (el) => {
      const islem = el.dataset.i;
      if (islem === 'temizle' && !await onayla({ baslik: 'Hisseler boşaltılsın mı?', mesaj: `${d.secili.size} hissedeki bağışçı bilgileri silinecek.`, dugme: 'Boşalt', tehlike: true })) return;
      const r = await api('POST', '/kurban/hisseler/toplu', { ids: [...d.secili], islem, deger: islem === 'vekalet' ? el.dataset.d === '1' : el.dataset.d });
      bildir(`${r.etkilenen} hisse güncellendi`); d.secili.clear(); yukle();
    },
    excel: () => excelTablo(`${org.ad} hissedarlar`, ['Kurban', 'Hisse', 'Bağışçı', 'Telefon', 'Kategori', 'Kimin adına', 'Kurban türü', 'Ödeme', 'Vekalet', 'Hisse bedeli'],
      d.liste.map(h => [`${TUR_AD[h.tur]} ${h.kurban_no}`, h.hisse_no, h.bagisci_adi, h.bagisci_telefon || '', h.bagisci_kategori || '', h.kimin_adina || '', h.kurban_turu, h.odeme_durumu, h.vekalet_onay ? 'Alındı' : '', h.hisse_fiyati]), [9]),
    yazdirListe: async () => {
      const logo = await logoVeri();
      const { belgeSablon } = await import('./ortak.js');
      yazdir(belgeSablon({ baslik: `${org.ad} hissedar listesi`, logo, yatay: true, icerik: `<h1>${kac(org.ad)} — hissedar listesi</h1><p class="soluk">${d.liste.length} hissedar</p><table><thead><tr><th>Kurban</th><th>Hisse</th><th>Bağışçı</th><th>Telefon</th><th>Kimin adına</th><th>Kurban türü</th><th>Ödeme</th><th>Vekalet</th></tr></thead><tbody>${d.liste.map(h => `<tr><td>${TUR_AD[h.tur]} ${h.kurban_no}</td><td class="orta">${h.hisse_no}</td><td>${kac(h.bagisci_adi)}</td><td>${kac(h.bagisci_telefon || '')}</td><td>${kac(h.kimin_adina || '')}</td><td>${kac(h.kurban_turu)}</td><td>${{ odendi: 'Ödendi', bekliyor: 'Bekliyor', kismi: 'Kısmi', iptal: 'İptal' }[h.odeme_durumu]}</td><td class="orta">${h.vekalet_onay ? '✓' : ''}</td></tr>`).join('')}</tbody></table>` }));
    },
  });
  await yukle();
}

// ─── Videolar ───
export async function videolar(kok, { org: orgId }) {
  const { org } = await api('GET', `/kurban/organizasyonlar/${orgId}/ozet`);
  const l = await api('GET', `/kurban/organizasyonlar/${orgId}/videolar`);
  const yuklenen = l.filter(x => x.video_url).length;
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Kesim videoları', alt: `${yuklenen} / ${l.length} video yüklendi`, kirinti: [{ ad: 'Kurban', rota: '/kurban' }, { ad: org.ad, rota: `/kurban/${org.id}` }, { ad: 'Videolar' }] })}
    ${sekmeler(org, '/videolar')}
    <section class="kart">${l.length ? html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Bağışçı</th><th>Telefon</th><th>Kurban</th><th>Durum</th><th class="eylemler"></th></tr></thead><tbody>${l.map(x => html`<tr>
      <td class="mk-baslik">${x.bagisci_adi}</td><td data-etiket="Telefon">${telLink(x.bagisci_telefon)}</td><td data-etiket="Kurban"><a href="/kurban/${org.id}/kurban/${x.kurban_id}">${TUR_AD[x.tur]} ${x.kurban_no} / ${x.hisse_no}</a></td>
      <td data-etiket="Durum">${x.video_url ? rozet('Yüklendi', 'basari') : rozet('Bekliyor', 'uyari')}</td>
      <td class="eylemler">${x.video_url ? html`<a class="dugme kucuk" href="${x.video_url}" target="_blank" rel="noopener"><i class="fa-solid fa-circle-play"></i>İzle</a>` : izleyici() ? '' : html`<button class="dugme kucuk birincil" data-eylem="yukle" data-id="${x.id}"><i class="fa-solid fa-upload"></i>Yükle</button>`}</td></tr>`)}</tbody></table></div>`
      : bos({ ikon: 'fa-video', baslik: 'Video isteyen hissedar yok', metin: 'Hissedar formunda "Kesim videosu istiyor" işaretlenen bağışçılar burada listelenir.' })}</section>`);
  baglan(kok, { yukle: (el) => videoYukleModal(l.find(x => x.id === +el.dataset.id), () => videolar(kok, { org: orgId })) });
}

// ─── Rapor ───
export async function rapor(kok, { org: orgId }) {
  const { org, ozet } = await api('GET', `/kurban/organizasyonlar/${orgId}/ozet`);
  const hs = await api('GET', `/kurban/organizasyonlar/${orgId}/hisseler`);
  const grup = (f) => { const m = {}; hs.forEach(h => { const k = f(h); m[k] = m[k] || { ad: k, adet: 0, tutar: 0 }; m[k].adet++; m[k].tutar += h.odeme_durumu === 'iptal' ? 0 : h.hisse_fiyati; }); return Object.values(m).sort((a, b) => b.adet - a.adet); };
  const turler = grup(h => h.kurban_turu), kategoriler = grup(h => h.bagisci_kategori || 'Genel Bağışçı');
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Organizasyon raporu', alt: org.ad, kirinti: [{ ad: 'Kurban', rota: '/kurban' }, { ad: org.ad, rota: `/kurban/${org.id}` }, { ad: 'Rapor' }], eylemler: html`<button class="dugme" data-eylem="excel"><i class="fa-solid fa-file-excel"></i>Excel</button><button class="dugme" data-eylem="yazdir"><i class="fa-solid fa-print"></i>Yazdır</button>` })}
    ${sekmeler(org, '/rapor')}
    <div class="izgara izgara-2">
      <section class="kart"><div class="kart-baslik"><h2>Mali özet</h2></div><div class="tablo-kap"><table class="tablo"><tbody>
        <tr><td>Beklenen hisse geliri</td><td class="sag">${para(ozet.beklenen_gelir)}</td></tr><tr><td>Tahsil edilen</td><td class="sag para-pozitif">${para(ozet.tahsil_edilen)}</td></tr>
        <tr><td>Bekleyen tahsilat</td><td class="sag">${para(ozet.bekleyen_tahsilat)}</td></tr><tr><td>Hayvan alış maliyeti</td><td class="sag para-negatif">−${para(ozet.maliyet)}</td></tr></tbody>
        <tfoot><tr><td>Net (tahsilat − maliyet)</td><td class="sag">${para(ozet.net)}</td></tr></tfoot></table></div></section>
      <section class="kart"><div class="kart-baslik"><h2>Operasyon</h2></div><div class="tablo-kap"><table class="tablo"><tbody>
        <tr><td>Kurban (büyükbaş / küçükbaş)</td><td class="sag">${ozet.buyukbas} / ${ozet.kucukbas}</td></tr><tr><td>Kesilen</td><td class="sag">${ozet.kesildi}</td></tr>
        <tr><td>Dolu / toplam hisse</td><td class="sag">${ozet.dolu_hisse} / ${ozet.toplam_hisse}</td></tr><tr><td>Ödendi / bekliyor / kısmi / iptal</td><td class="sag">${ozet.odendi} / ${ozet.bekliyor} / ${ozet.kismi} / ${ozet.iptal}</td></tr>
        <tr><td>Vekalet alınan</td><td class="sag">${ozet.vekalet}</td></tr><tr><td>Video isteyen / yüklenen</td><td class="sag">${ozet.video_isteyen} / ${ozet.video_yuklenen}</td></tr></tbody></table></div></section>
      <section class="kart"><div class="kart-baslik"><h2>Kurban türüne göre</h2></div><div class="tablo-kap"><table class="tablo"><thead><tr><th>Tür</th><th class="sag">Hisse</th><th class="sag">Tutar</th></tr></thead><tbody>${turler.map(t => html`<tr><td>${t.ad}</td><td class="sag">${t.adet}</td><td class="sag">${para(t.tutar)}</td></tr>`)}</tbody></table></div></section>
      <section class="kart"><div class="kart-baslik"><h2>Bağışçı kategorisine göre</h2></div><div class="tablo-kap"><table class="tablo"><thead><tr><th>Kategori</th><th class="sag">Hisse</th><th class="sag">Tutar</th></tr></thead><tbody>${kategoriler.map(t => html`<tr><td>${t.ad}</td><td class="sag">${t.adet}</td><td class="sag">${para(t.tutar)}</td></tr>`)}</tbody></table></div></section>
    </div>`);
  baglan(kok, { excel: () => indir(`/kurban/organizasyonlar/${org.id}/excel`, 'kurban.xlsx'), yazdir: () => window.print() });
}

// ─── Yazdırma (Kurban düzeni: sol Türk bayrağı, orta logo, sağ destekçi bayrağı) ───
async function yazdirSecimModal(org, kurbanIdleri) {
  if (!kurbanIdleri.length) return bildir('Yazdırılacak kurban yok', 'uyari');
  const bayraklar = await api('GET', '/kurban/bayraklar');
  const m = modal({ baslik: kurbanIdleri.length > 1 ? `${kurbanIdleri.length} kurbanı yazdır` : 'Kurbanı yazdır', icerik: html`<form id="yz-form" class="form-izgara">
    ${alan({ ad: 'yon', etiket: 'Sayfa yönü', tip: 'select', secenekler: [['portrait', 'Dikey'], ['landscape', 'Yatay']] })}
    ${alan({ ad: 'bayrak', etiket: 'Sağ üst bayrak', tip: 'select', secenekler: [['', 'Bayrak yok'], ...bayraklar.map(b => [b.id, b.ad])], yardim: bayraklar.length ? '' : 'Ayarlar > Yazdırma bölümünden ülke bayrakları ekleyebilirsiniz.' })}
    ${alan({ ad: 'bos_atla', etiket: 'Hiç hissedarı olmayan kurbanları atla', tip: 'checkbox', deger: true, tam: true })}</form>`,
    altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="yz-form"><i class="fa-solid fa-print"></i>Yazdır</button>` });
  formGonder($('#yz-form', m.el), async (v) => {
    let bayrak = null, bayrakAdi = '';
    if (v.bayrak) { bayrak = (await api('GET', `/kurban/bayraklar/${v.bayrak}/resim`)).resim_data; bayrakAdi = (bayraklar.find(b => b.id === +v.bayrak) || {}).ad || ''; }
    const logo = await logoVeri();
    const sayfalar = [];
    for (const id of kurbanIdleri.slice(0, 500)) {
      const d = await api('GET', `/kurban/kurbanlar/${id}`);
      if (v.bos_atla && !d.hisseler.some(h => h.bagisci_adi)) continue;
      sayfalar.push(kurbanSayfasi(d.kurban, d.hisseler, org, v.yon, logo, bayrak, bayrakAdi));
    }
    if (!sayfalar.length) throw new Error('Yazdırılacak dolu kurban bulunamadı');
    m.kapat();
    yazdir(`<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Kurban yazdır</title><style>${yazdirStil(v.yon)}</style></head><body>${sayfalar.join('')}</body></html>`);
  });
}
const TURK_BAYRAK = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="${w}" height="${h}"><rect width="1200" height="800" fill="#E30A17"/><circle cx="425" cy="400" r="200" fill="#fff"/><circle cx="475" cy="400" r="160" fill="#E30A17"/><polygon points="583.334,400 764.235,458.779 652.431,304.894 652.431,495.106 764.235,341.221" fill="#fff"/></svg>`;
function yazdirStil(yon) {
  const yatay = yon === 'landscape';
  return `@page{margin:12mm 15mm;size:A4 ${yon}}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{font-family:"Segoe UI",Calibri,Arial,sans-serif;margin:0;padding:0;color:#000;background:#fff}
  .sayfa{display:flex;flex-direction:column;height:calc(${yatay ? '210mm' : '297mm'} - 24mm);overflow:hidden;page-break-after:always;break-after:page}.sayfa:last-child{page-break-after:auto;break-after:auto}
  .ust{display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:3px solid #14213d;margin-bottom:8px}.ust-sol,.ust-sag{width:${yatay ? 180 : 150}px;display:flex}.ust-sag{justify-content:flex-end;flex-direction:column;align-items:flex-end}
  .ust-orta{flex:1;text-align:center;padding:0 10px}.ust-orta img{height:${yatay ? 100 : 120}px;max-width:400px;object-fit:contain}.ust-sag img{height:${yatay ? 120 : 100}px;width:${yatay ? 180 : 150}px;object-fit:contain}
  .bayrak-ad{font-size:11px;font-weight:700;color:#14213d;margin-top:3px;text-align:center;width:100%}
  .baslik{font-size:${yatay ? 28 : 32}px;font-weight:700;color:#14213d;text-align:center;margin:6px 0 8px}
  .tablo-kap{flex:1;min-height:0;display:flex}table{width:100%;border-collapse:collapse;border:2px solid #000;height:100%;table-layout:fixed}tr{height:calc(100%/7)}
  td{border:2px solid #000;vertical-align:middle;text-align:center}td.no{width:50px;font-size:22px;font-weight:800}td.ad{font-weight:800;padding:2px 10px;white-space:nowrap;overflow:hidden}td.tur{width:140px;font-size:19px;font-weight:700}
  .kb{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:${yatay ? 12 : 10}%}.kb-tur{font-size:${yatay ? 38 : 48}px;font-weight:900;color:#14213d;letter-spacing:5px;text-transform:uppercase}
  .kb-cizgi{width:60%;height:3px;background:#a8741a;margin:8px auto}.kb-ad{font-weight:900;color:#14213d;letter-spacing:2px;line-height:1.1;margin:14px 0}.kb-kesik{border-top:2px dashed #999;width:80%;margin:10px auto}
  .kb-ulke{font-size:${yatay ? 42 : 56}px;font-weight:900;color:#a8741a;letter-spacing:6px}.alt{border-top:3px solid #14213d;padding-top:10px;text-align:center;font-size:${yatay ? 22 : 28}px;font-weight:800;color:#14213d}`;
}
function kurbanSayfasi(k, hisseler, org, yon, logo, bayrak, bayrakAdi) {
  const yatay = yon === 'landscape', bw = yatay ? 180 : 150, bh = yatay ? 120 : 100;
  const ust = `<div class="ust"><div class="ust-sol">${TURK_BAYRAK(bw, bh)}</div><div class="ust-orta">${logo ? `<img src="${logo}" alt="">` : `<strong style="font-size:22px;color:#14213d">${kac(D.oturum.hesap.ad)}</strong>`}</div><div class="ust-sag">${bayrak ? `<img src="${bayrak}" alt=""><div class="bayrak-ad">${kac(bayrakAdi)} - ${org.yil}</div>` : ''}</div></div>`;
  const no = `${k.kurban_no}`;
  if (k.tur === 'kucukbas') {
    const h = hisseler[0] || {};
    const ad = (h.bagisci_adi || '').toLocaleUpperCase('tr-TR');
    const fs = ad.length > 30 ? 36 : ad.length > 22 ? 44 : ad.length > 16 ? 52 : ad.length > 10 ? 60 : 68;
    const ulke = bayrakAdi ? bayrakAdi.replace(/bayrağı|bayrak|flag/gi, '').trim().toLocaleUpperCase('tr-TR') : '';
    return `<div class="sayfa">${ust}<div class="kb"><div class="kb-tur">${kac(h.kurban_turu || k.kurban_turu)}</div><div class="kb-cizgi"></div><div class="kb-ad" style="font-size:${fs}px">${kac(ad)}</div>${ulke ? `<div class="kb-kesik"></div><div class="kb-ulke">${kac(ulke)} - ${org.yil}</div>` : ''}</div><div class="alt">No : ${kac(no)}</div></div>`;
  }
  const satir = Array.from({ length: 7 }, (_, i) => {
    const h = hisseler[i] || {};
    const ad = h.bagisci_adi ? h.bagisci_adi.toLocaleUpperCase('tr-TR') : '';
    const fs = ad.length > 32 ? 12 : ad.length > 26 ? 14 : ad.length > 20 ? 17 : ad.length > 14 ? 19 : 21;
    return `<tr><td class="no">${i + 1}</td><td class="ad" style="font-size:${fs}px">${kac(ad)}</td><td class="tur">${h.bagisci_adi ? kac(h.kurban_turu || k.kurban_turu) : ''}</td></tr>`;
  }).join('');
  return `<div class="sayfa">${ust}<div class="baslik">Kurban : ${kac(no)}</div><div class="tablo-kap"><table><tbody>${satir}</tbody></table></div></div>`;
}
