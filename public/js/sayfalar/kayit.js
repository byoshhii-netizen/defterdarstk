// Genel kayıt motoru ekranları: liste, form, detay (bağış, üye, aidat, yetim, yardım, mükellef, görev ...)
import { D, api, html, ham, yerlestir, $, $$, para, sayi, tarih, goreceli, bildir, hataGoster, baglan, degisince, gecikmeli, formGonder, modal, onayla, sayfaBaslik, kpi, bos, rozet, durumRozet, telLink, indir, yazdir, bugun, buAy, dosyaOku } from '../cekirdek.js';
import { secenekler, hucreDegeri, belgeSablon, logoVeri, yaziyla } from './ortak.js';

const tanim = (m) => D.tanimlar.kayit[m];
const modulBilgi = (m) => D.tanimlar.moduller[m];

function hucre(a, r) {
  const v = r[a.ad];
  if (a.tip === 'secim' && a.filtre && v) return durumRozet(v);
  if (a.tip === 'telefon') return telLink(v);
  if (a.tip === 'para') return html`<span class="sayisal">${para(v)}</span>`;
  if (a.tip === 'iliski' && v && a.hedef && a.hedef.startsWith('kayit:')) { const hm = Object.entries(D.tanimlar.moduller).find(([k]) => k === a.hedef.slice(6)); if (hm) return html`<a href="${hm[1].rota}/${v}" data-dur>${(r._etiket || {})[a.ad] || '#' + v}</a>`; }
  if (a.tip === 'iliski' && v && a.hedef === 'cari') return html`<a href="/cariler/${v}" data-dur>${(r._etiket || {})[a.ad] || '#' + v}</a>`;
  return hucreDegeri(a, r);
}

export async function liste(kok, { modul }, sorgu) {
  const t = tanim(modul), mb = modulBilgi(modul);
  const durum = { sayfa: 1, limit: 50, q: sorgu.q || '', sirala: '', yon: 'azalan', filtre: {}, bas: '', bit: '', secili: new Set() };
  t.alanlar.filter(a => a.filtre).forEach(a => { if (sorgu['f_' + a.ad]) durum.filtre[a.ad] = sorgu['f_' + a.ad]; });
  const listeAlan = t.alanlar.filter(a => a.liste);
  const filtreAlan = t.alanlar.filter(a => a.filtre && a.tip === 'secim');
  const tarihAlan = t.alanlar.find(a => a.tip === 'tarih');
  let gorunumler = []; try { gorunumler = await api('GET', '/gorunumler/' + modul); } catch (e) { /* */ }
  const izleyici = D.oturum.kullanici.rol === 'izleyici';

  yerlestir(kok, html`${sayfaBaslik({ baslik: mb.ad, alt: aciklamaMetni(modul), eylemler: html`
      <button class="dugme" data-eylem="excel"><i class="fa-solid fa-file-excel"></i>Excel</button>
      ${izleyici ? '' : html`<button class="dugme" data-eylem="iceAktar"><i class="fa-solid fa-file-import"></i>İçe aktar</button><a class="dugme birincil" href="${mb.rota}/yeni"><i class="fa-solid fa-plus"></i>Yeni ${t.tekil.toLocaleLowerCase('tr-TR')}</a>`}` })}
    <div class="kpi-sira" id="ozet"></div>
    <section class="kart">
      <div class="toplu-cubuk gizli" id="toplu"></div>
      <div class="filtre-cubuk">
        <div class="ara"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="ara" placeholder="${t.tekil} ara" value="${durum.q}" aria-label="Ara"></div>
        ${filtreAlan.map(a => html`<select data-filtre="${a.ad}" aria-label="${a.etiket}" style="width:auto;min-width:140px"><option value="">${a.etiket}: tümü</option>${a.secenekler.map(s => html`<option ${durum.filtre[a.ad] === s ? 'selected' : ''}>${s}</option>`)}</select>`)}
        ${tarihAlan ? html`<input type="date" id="bas" aria-label="Başlangıç" style="width:auto"><input type="date" id="bit" aria-label="Bitiş" style="width:auto">` : ''}
        <span class="bosluk"></span>
        <div class="konum-goreli"><button class="dugme kucuk" data-eylem="gorunumler"><i class="fa-solid fa-bookmark"></i>Görünümler${gorunumler.length ? ` (${gorunumler.length})` : ''}</button></div>
      </div>
      <div class="tablo-kap" id="tablo"></div>
      <div class="sayfalama" id="sayfalama"></div>
    </section>`);

  const yukle = async () => {
    const p = new URLSearchParams({ sayfa: durum.sayfa, limit: durum.limit });
    if (durum.q) p.set('q', durum.q);
    if (durum.sirala) { p.set('sirala', durum.sirala); p.set('yon', durum.yon); }
    Object.entries(durum.filtre).forEach(([k, v]) => v && p.set('f_' + k, v));
    if (durum.bas) p.set('bas', durum.bas); if (durum.bit) p.set('bit', durum.bit);
    const r = await api('GET', `/kayit/${modul}?${p}`);
    durum.son = r;
    yerlestir($('#ozet'), html`${r.ozet.map((o, i) => kpi({ etiket: o.etiket, deger: o.bicim === 'para' ? para(o.deger) : sayi(o.deger), tur: ['bilgi', 'basari', 'muhur', 'uyari'][i % 4] }))}`);
    if (!r.kayitlar.length) {
      const filtreli = durum.q || Object.values(durum.filtre).some(Boolean) || durum.bas || durum.bit;
      yerlestir($('#tablo'), bos({ ikon: mb.ikon, baslik: filtreli ? 'Bu filtrelerle kayıt bulunamadı' : `Henüz ${t.tekil.toLocaleLowerCase('tr-TR')} kaydı yok`, metin: filtreli ? 'Arama metnini veya filtreleri değiştirin.' : 'İlk kaydı oluşturun veya Excel/CSV dosyasından içe aktarın.', eylem: filtreli || izleyici ? '' : html`<a class="dugme birincil" href="${mb.rota}/yeni"><i class="fa-solid fa-plus"></i>Yeni ${t.tekil.toLocaleLowerCase('tr-TR')}</a>` }));
      yerlestir($('#sayfalama'), ''); return;
    }
    const tumSecili = r.kayitlar.every(k => durum.secili.has(k.id));
    const toplamAlan = listeAlan.filter(a => a.tip === 'para');
    yerlestir($('#tablo'), html`<table class="tablo mobil-kart"><thead><tr>${izleyici ? '' : html`<th class="dar"><input type="checkbox" data-tumu ${tumSecili ? 'checked' : ''} aria-label="Tümünü seç"></th>`}
      ${listeAlan.map(a => html`<th class="siralanabilir ${a.tip === 'para' || a.tip === 'sayi' ? 'sag' : ''}" data-sirala="${a.ad}">${a.etiket}${durum.sirala === a.ad ? html`<i class="fa-solid fa-arrow-${durum.yon === 'artan' ? 'up' : 'down'} sira-ok"></i>` : ''}</th>`)}</tr></thead>
      <tbody>${r.kayitlar.map(k => html`<tr class="tiklanir ${durum.secili.has(k.id) ? 'secili' : ''}" data-git="${mb.rota}/${k.id}">${izleyici ? '' : html`<td class="mk-sec"><input type="checkbox" data-sec="${k.id}" ${durum.secili.has(k.id) ? 'checked' : ''} aria-label="Seç"></td>`}
        ${listeAlan.map((a, i) => html`<td data-etiket="${a.etiket}" class="${i === 0 ? 'mk-baslik' : ''} ${a.tip === 'para' || a.tip === 'sayi' ? 'sag' : ''}">${hucre(a, k)}</td>`)}</tr>`)}</tbody>
      ${toplamAlan.length ? html`<tfoot><tr>${izleyici ? '' : html`<td></td>`}${listeAlan.map((a, i) => html`<td class="${a.tip === 'para' ? 'sag' : ''}">${i === 0 ? 'Sayfa toplamı' : a.tip === 'para' ? para(r.kayitlar.reduce((s, k) => s + (Number(k[a.ad]) || 0), 0)) : ''}</td>`)}</tr></tfoot>` : ''}</table>`);
    const sayfaSay = Math.ceil(r.toplam / durum.limit);
    yerlestir($('#sayfalama'), html`<span>${sayi(r.toplam)} kayıttan ${sayi((durum.sayfa - 1) * durum.limit + 1)}–${sayi(Math.min(r.toplam, durum.sayfa * durum.limit))} gösteriliyor</span>
      ${sayfaSay > 1 ? html`<div class="dugme-grup"><button class="dugme" data-eylem="sayfa" data-s="${durum.sayfa - 1}" ${durum.sayfa === 1 ? 'disabled' : ''} aria-label="Önceki"><i class="fa-solid fa-chevron-left"></i></button><button class="dugme secili">${durum.sayfa} / ${sayfaSay}</button><button class="dugme" data-eylem="sayfa" data-s="${durum.sayfa + 1}" ${durum.sayfa >= sayfaSay ? 'disabled' : ''} aria-label="Sonraki"><i class="fa-solid fa-chevron-right"></i></button></div>` : ''}`);
    topluCiz();
  };
  const topluCiz = () => {
    const n = durum.secili.size, el = $('#toplu');
    el.classList.toggle('gizli', !n);
    if (!n) return;
    const secimAlan = t.alanlar.filter(a => a.tip === 'secim' && a.filtre);
    yerlestir(el, html`<strong>${n} kayıt seçildi</strong>${secimAlan.map(a => html`<select data-toplu="${a.ad}" style="width:auto;height:30px;background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.2)"><option value="">${a.etiket} değiştir</option>${a.secenekler.map(s => html`<option>${s}</option>`)}</select>`)}
      <button class="dugme" data-eylem="topluSil"><i class="fa-solid fa-trash"></i>Sil</button><button class="dugme" data-eylem="secimTemizle">Seçimi kaldır</button>`);
  };

  const yeniden = gecikmeli(() => { durum.sayfa = 1; yukle().catch(hataGoster); }, 250);
  $('#ara').addEventListener('input', (e) => { durum.q = e.target.value.trim(); yeniden(); });
  degisince(kok, '[data-filtre]', (el) => { durum.filtre[el.dataset.filtre] = el.value; yeniden(); });
  if (tarihAlan) { $('#bas').addEventListener('change', e => { durum.bas = e.target.value; yeniden(); }); $('#bit').addEventListener('change', e => { durum.bit = e.target.value; yeniden(); }); }
  degisince(kok, '[data-toplu]', async (el) => {
    if (!el.value) return;
    try { const r = await api('POST', `/kayit/${modul}/toplu-guncelle`, { ids: [...durum.secili], alan: el.dataset.toplu, deger: el.value }); bildir(`${r.guncellenen} kayıt güncellendi`); durum.secili.clear(); yukle(); } catch (e) { hataGoster(e); }
  });
  kok.addEventListener('change', (e) => {
    if (e.target.matches('[data-sec]')) { const id = +e.target.dataset.sec; e.target.checked ? durum.secili.add(id) : durum.secili.delete(id); e.target.closest('tr').classList.toggle('secili', e.target.checked); topluCiz(); }
    if (e.target.matches('[data-tumu]')) { durum.son.kayitlar.forEach(k => e.target.checked ? durum.secili.add(k.id) : durum.secili.delete(k.id)); yukle(); }
  });
  kok.addEventListener('click', (e) => {
    const th = e.target.closest('[data-sirala]');
    if (th) { const a = th.dataset.sirala; durum.yon = durum.sirala === a && durum.yon === 'azalan' ? 'artan' : 'azalan'; durum.sirala = a; yukle(); return; }
    const tr = e.target.closest('tr[data-git]');
    if (tr && !e.target.closest('input, a, button, [data-dur]')) D.git(tr.dataset.git);
  });
  baglan(kok, {
    sayfa: (el) => { durum.sayfa = +el.dataset.s; yukle(); },
    secimTemizle: () => { durum.secili.clear(); yukle(); },
    topluSil: async () => {
      if (!await onayla({ baslik: 'Kayıtlar silinsin mi?', mesaj: `${durum.secili.size} kayıt çöp kutusuna taşınacak. Bağlı kasa hareketleri de kaldırılır; çöp kutusundan geri yükleyebilirsiniz.`, dugme: 'Sil', tehlike: true })) return;
      const r = await api('POST', `/kayit/${modul}/toplu-sil`, { ids: [...durum.secili] }); bildir(`${r.silinen} kayıt silindi`); durum.secili.clear(); yukle();
    },
    excel: () => { const p = new URLSearchParams(); if (durum.q) p.set('q', durum.q); Object.entries(durum.filtre).forEach(([k, v]) => v && p.set('f_' + k, v)); if (durum.bas) p.set('bas', durum.bas); if (durum.bit) p.set('bit', durum.bit); return indir(`/kayit/${modul}/excel?${p}`, `${modul}.xlsx`); },
    iceAktar: () => iceAktarModal(modul, yukle),
    gorunumler: (el) => gorunumMenu(el, modul, durum, gorunumler, async () => { gorunumler = await api('GET', '/gorunumler/' + modul); }, () => {
      $('#ara').value = durum.q; $$('[data-filtre]', kok).forEach(s => { s.value = durum.filtre[s.dataset.filtre] || ''; });
      if (tarihAlan) { $('#bas').value = durum.bas; $('#bit').value = durum.bit; } durum.sayfa = 1; yukle();
    }),
  });
  await yukle();
}

function aciklamaMetni(modul) {
  return ({ bagislar: 'Bağışları kaydedin, makbuz yazdırın; seçtiğiniz kasaya otomatik işlensin.', uyeler: 'Üye kayıtları, üyelik tipleri ve aidat bilgileri.', aidatlar: 'Aidat tahakkuk ve tahsilatları. Ödendi olarak işaretlenen aidat kasaya işlenir.',
    yetimler: 'Sponsorluk bekleyen ve sponsorlu yetimlerin takibi.', ihtiyac_sahipleri: 'Başvuru dosyaları, hane bilgileri ve öncelik sıralaması.', yardimlar: 'Dağıtılan yardımların kaydı; nakdi yardımlar kasadan düşülür.',
    su_kuyulari: 'Su kuyusu projeleri, bağışçıları ve sondaj durumu.', kumbaralar: 'Sahadaki kumbaralar ve toplanan tutarlar.', gonulluler: 'Gönüllü havuzu, beceriler ve gönüllü saatleri.',
    mukellefler: 'Mükellef portföyü ve aylık hizmet bedelleri.', beyannameler: 'Beyanname son günleri ve gönderim durumu.', firsatlar: 'Satış hunisi: adaydan kazanılan işe kadar.', masraflar: 'Masraf fişleri; seçilen kasadan otomatik düşülür ve KDV raporuna yansır.',
    demirbaslar: 'Demirbaş kayıtları, zimmet ve doğrusal amortismanla güncel değer.', projeler: 'Proje bütçeleri, harcamalar ve ilerleme.', etkinlikler: 'Etkinlik planlaması ve sonuçları.', gorevler: 'Ekip içi görev takibi.',
    toplantilar: 'Yönetim ve genel kurul kararları için dijital karar defteri.', evrak: 'Gelen ve giden resmi yazışmaların kayıt defteri.', partnerler: 'İşbirliği yapılan kurumlar.' })[modul] || '';
}

function gorunumMenu(el, modul, durum, gorunumler, tazele, uygula) {
  const ac = el.parentElement.querySelector('.acilir'); $$('.acilir').forEach(x => x.remove()); if (ac) return;
  const d = document.createElement('div'); d.className = 'acilir';
  yerlestir(d, html`<div class="acilir-baslik">Kayıtlı görünümler</div>${gorunumler.length ? gorunumler.map(g => html`<button data-uygula="${g.id}"><i class="fa-solid fa-filter"></i><span style="flex:1">${g.ad}</span><i class="fa-solid fa-xmark" data-gsil="${g.id}" title="Sil"></i></button>`) : html`<div class="acilir-baslik">Henüz görünüm yok</div>`}
    <hr><button data-kaydet><i class="fa-solid fa-plus"></i>Mevcut filtreleri kaydet</button><button data-sifirla><i class="fa-solid fa-rotate-left"></i>Filtreleri temizle</button>`);
  el.parentElement.appendChild(d);
  d.addEventListener('click', async (e) => {
    e.stopPropagation();
    const sil = e.target.closest('[data-gsil]');
    if (sil) { await api('DELETE', `/gorunumler/${modul}/${sil.dataset.gsil}`); await tazele(); d.remove(); bildir('Görünüm silindi'); return; }
    const u = e.target.closest('[data-uygula]');
    if (u) { const g = gorunumler.find(x => x.id === +u.dataset.uygula); durum.q = g.filtre.q || ''; durum.bas = g.filtre.bas || ''; durum.bit = g.filtre.bit || ''; durum.filtre = {}; Object.entries(g.filtre).forEach(([k, v]) => { if (k.startsWith('f_')) durum.filtre[k.slice(2)] = v; }); d.remove(); uygula(); return; }
    if (e.target.closest('[data-sifirla]')) { durum.q = ''; durum.bas = ''; durum.bit = ''; durum.filtre = {}; d.remove(); uygula(); return; }
    if (e.target.closest('[data-kaydet]')) {
      d.remove();
      const m = modal({ baslik: 'Görünümü kaydet', icerik: html`<form id="gv-form"><label class="alan"><span>Görünüm adı</span><input name="ad" required maxlength="60" placeholder="Örnek: Bu ayki zekatlar"></label><label class="onay-kutusu"><input type="checkbox" name="paylasimli"><span>Kurumdaki herkesle paylaş</span></label></form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="gv-form">Kaydet</button>` });
      formGonder($('#gv-form', m.el), async (v) => {
        const filtre = { q: durum.q, bas: durum.bas, bit: durum.bit }; Object.entries(durum.filtre).forEach(([k, x]) => { if (x) filtre['f_' + k] = x; });
        await api('POST', '/gorunumler/' + modul, { ad: v.ad, paylasimli: v.paylasimli, filtre }); await tazele(); m.kapat(); bildir('Görünüm kaydedildi');
      });
    }
  });
}

// CSV içe aktarma: ilk satır başlık; sütunlar alan etiketleri veya adlarıyla eşleşir
function csvAyristir(metin) {
  const ayrac = (metin.split('\n')[0].match(/;/g) || []).length > (metin.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const satirlar = []; let satir = [], hucre = '', tirnak = false;
  for (let i = 0; i < metin.length; i++) {
    const c = metin[i];
    if (tirnak) { if (c === '"' && metin[i + 1] === '"') { hucre += '"'; i++; } else if (c === '"') tirnak = false; else hucre += c; }
    else if (c === '"') tirnak = true; else if (c === ayrac) { satir.push(hucre); hucre = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && metin[i + 1] === '\n') i++; satir.push(hucre); if (satir.some(x => x.trim())) satirlar.push(satir); satir = []; hucre = ''; }
    else hucre += c;
  }
  satir.push(hucre); if (satir.some(x => x.trim())) satirlar.push(satir);
  return satirlar;
}
function iceAktarModal(modul, yenile) {
  const t = tanim(modul);
  const yazilabilir = t.alanlar.filter(a => !a.saltOkunur && a.tip !== 'iliski' && a.tip !== 'kullanici');
  const m = modal({ baslik: `${t.tekil} içe aktar`, genis: true, icerik: html`<p class="onay-metin">Excel'de dosyanızı <strong>CSV (UTF-8)</strong> olarak kaydedip yükleyin. İlk satır sütun başlıkları olmalı. Tanınan başlıklar: ${yazilabilir.map(a => a.etiket).join(', ')}.</p>
    <label class="yukleme-alani"><i class="fa-solid fa-file-csv"></i>CSV dosyası seçin<input type="file" accept=".csv,text/csv" hidden id="csv"></label><div id="onizleme" style="margin-top:14px"></div>`,
    altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" id="aktar" disabled>Aktar</button>` });
  let satirlar = [];
  $('#csv', m.el).addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const veri = csvAyristir((await dosyaOku(f, 'metin')).replace(/^﻿/, ''));
    if (veri.length < 2) return bildir('Dosyada veri satırı bulunamadı', 'hata');
    const norm = (s) => String(s).toLocaleLowerCase('tr-TR').replace(/[^a-zçğıöşü0-9]/g, '');
    const eslesme = veri[0].map(b => yazilabilir.find(a => norm(a.etiket) === norm(b) || norm(a.ad) === norm(b)));
    satirlar = veri.slice(1).map(s => { const o = {}; eslesme.forEach((a, i) => { if (a) { let v = (s[i] || '').trim(); if (a.tip === 'para' || a.tip === 'sayi') v = v.replace(/\./g, '').replace(',', '.'); if (a.tip === 'tarih' && /^\d{2}\.\d{2}\.\d{4}$/.test(v)) v = v.split('.').reverse().join('-'); o[a.ad] = v; } }); return o; });
    yerlestir($('#onizleme', m.el), html`<p style="margin-bottom:8px"><strong>${satirlar.length}</strong> satır bulundu. Eşleşen sütunlar: ${eslesme.filter(Boolean).map(a => a.etiket).join(', ') || 'yok'}</p>
      <div class="tablo-kap" style="max-height:240px"><table class="tablo"><thead><tr>${eslesme.filter(Boolean).map(a => html`<th>${a.etiket}</th>`)}</tr></thead><tbody>${satirlar.slice(0, 8).map(s => html`<tr>${eslesme.filter(Boolean).map(a => html`<td>${s[a.ad]}</td>`)}</tr>`)}</tbody></table></div>`);
    $('#aktar', m.el).disabled = !eslesme.some(Boolean);
  });
  $('#aktar', m.el).addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.classList.add('yukleniyor');
    try {
      const r = await api('POST', `/kayit/${modul}/ice-aktar`, { satirlar });
      m.kapat(); bildir(`${r.eklenen} kayıt aktarıldı${r.hatalar.length ? `, ${r.hatalar.length} satır atlandı` : ''}`, r.hatalar.length ? 'uyari' : 'basari', 6000);
      if (r.hatalar.length) console.warn(r.hatalar); yenile();
    } catch (er) { hataGoster(er); e.target.disabled = false; e.target.classList.remove('yukleniyor'); }
  });
}

async function alanGirdisi(a, deger, yeni) {
  if (yeni && (deger === undefined || deger === null || deger === '') && a.varsayilan !== undefined) deger = a.varsayilan === 'bugun' ? bugun() : a.varsayilan === 'buay' ? buAy() : a.varsayilan;
  const z = a.zorunlu ? html`<em aria-hidden="true">*</em>` : '';
  const req = a.zorunlu ? 'required' : '';
  let g;
  if (a.saltOkunur) return yeni ? '' : html`<label class="alan"><span>${a.etiket}</span><input value="${deger ?? ''}" readonly></label>`;
  if (a.tip === 'secim') g = html`<select name="${a.ad}" ${req}><option value="">Seçin</option>${a.secenekler.map(s => html`<option ${String(deger ?? '') === s ? 'selected' : ''}>${s}</option>`)}</select>`;
  else if (a.tip === 'iliski' || a.tip === 'kullanici' || a.tip === 'kategori') {
    const hedef = a.tip === 'kullanici' ? 'kullanici' : a.tip === 'kategori' ? 'kategori:' + a.kategoriTip : a.hedef;
    const sec = await secenekler(hedef);
    if (a.tip === 'kategori' && deger && !sec.find(s => s[0] === deger)) sec.push([deger, deger]);
    g = html`<select name="${a.ad}" ${req}><option value="">${a.tip === 'iliski' && a.hedef === 'finans_hesap' ? 'Kasaya işleme' : 'Seçin'}</option>${sec.map(([v, e]) => html`<option value="${v}" ${String(v) === String(deger ?? '') ? 'selected' : ''}>${e}</option>`)}</select>`;
  } else if (a.tip === 'uzun') g = html`<textarea name="${a.ad}" rows="3" ${req}>${deger ?? ''}</textarea>`;
  else if (a.tip === 'evet') return html`<label class="onay-kutusu"><input type="checkbox" name="${a.ad}" ${deger ? 'checked' : ''}><span>${a.etiket}</span></label>`;
  else {
    const tip = { para: 'number', sayi: 'number', tarih: 'date', telefon: 'tel', eposta: 'email' }[a.tip] || 'text';
    g = html`<input type="${tip}" name="${a.ad}" value="${deger ?? ''}" ${req} ${tip === 'number' ? ham('step="any" inputmode="decimal"') : ''} ${a.tip === 'telefon' ? ham('autocomplete="tel"') : ''}>`;
  }
  return html`<label class="alan ${a.tip === 'uzun' ? 'tam' : ''}"><span>${a.etiket}${z}</span>${g}${a.yardim ? html`<small>${a.yardim}</small>` : ''}</label>`;
}

export async function form(kok, { modul, id }, sorgu) {
  const t = tanim(modul), mb = modulBilgi(modul);
  const yeni = !id;
  let k = {};
  if (!yeni) k = (await api('GET', `/kayit/${modul}/${id}`)).kayit;
  else t.alanlar.forEach(a => { if (sorgu[a.ad]) k[a.ad] = sorgu[a.ad]; });
  const girdiler = await Promise.all(t.alanlar.map(a => alanGirdisi(a, k[a.ad], yeni)));
  yerlestir(kok, html`${sayfaBaslik({ baslik: yeni ? `Yeni ${t.tekil.toLocaleLowerCase('tr-TR')}` : `${t.tekil} düzenle`, kirinti: [{ ad: mb.ad, rota: mb.rota }, { ad: yeni ? 'Yeni' : (k[t.baslik] || '#' + id) }] })}
    <form class="kart" id="kayit-form" novalidate><div class="kart-govde"><div class="form-izgara">${girdiler}</div></div>
      <div class="modal-altlik" style="border-radius:0 0 var(--r-b) var(--r-b)">${!yeni ? html`<button type="button" class="dugme tehlike hayalet" data-eylem="sil" style="margin-right:auto;color:var(--tehlike)"><i class="fa-solid fa-trash"></i>Sil</button>` : ''}
        <a class="dugme" href="${yeni ? mb.rota : mb.rota + '/' + id}">Vazgeç</a>${yeni ? html`<button type="submit" class="dugme" data-devam>Kaydet ve yenisini ekle</button>` : ''}<button type="submit" class="dugme birincil">Kaydet</button></div></form>`);
  const f = $('#kayit-form');
  let devam = false;
  $$('[type=submit]', f).forEach(b => b.addEventListener('click', () => { devam = b.hasAttribute('data-devam'); }));
  formGonder(f, async (v) => {
    for (const a of t.alanlar) if (a.zorunlu && !a.saltOkunur && !v[a.ad]) { const el = f.querySelector(`[name="${a.ad}"]`); el && el.focus(); throw new Error(`${a.etiket} alanı zorunlu`); }
    if (yeni) {
      const r = await api('POST', `/kayit/${modul}`, v);
      bildir(`${t.tekil} kaydedildi`);
      if (devam) { D.git(`${mb.rota}/yeni`, { degistir: true }); } else D.git(`${mb.rota}/${r.id}`, { degistir: true });
    } else { await api('PUT', `/kayit/${modul}/${id}`, v); bildir('Değişiklikler kaydedildi'); D.git(`${mb.rota}/${id}`, { degistir: true }); }
  });
  baglan(kok, { sil: () => silOnay(modul, id, k[t.baslik]) });
}

async function silOnay(modul, id, ad) {
  const t = tanim(modul), mb = modulBilgi(modul);
  if (!await onayla({ baslik: `${t.tekil} silinsin mi?`, mesaj: `"${ad || '#' + id}" çöp kutusuna taşınacak${t.kasa ? ' ve bağlı kasa hareketi kaldırılacak' : ''}. Çöp kutusundan geri yükleyebilirsiniz.`, dugme: 'Sil', tehlike: true })) return;
  await api('DELETE', `/kayit/${modul}/${id}`); bildir('Kayıt silindi'); D.git(mb.rota, { degistir: true });
}

export async function detay(kok, { modul, id }) {
  const t = tanim(modul), mb = modulBilgi(modul);
  const { kayit: k, bagli, gecmis } = await api('GET', `/kayit/${modul}/${id}`);
  const izleyici = D.oturum.kullanici.rol === 'izleyici';
  const ana = t.alanlar.filter(a => a.tip !== 'uzun');
  const uzun = t.alanlar.filter(a => a.tip === 'uzun' && k[a.ad]);
  const durumAlan = t.alanlar.find(a => a.ad === 'durum' || a.ad === 'asama');
  yerlestir(kok, html`${sayfaBaslik({ baslik: k[t.baslik] || t.tekil, alt: html`${durumAlan && k[durumAlan.ad] ? durumRozet(k[durumAlan.ad]) : ''} <span class="soluk">Oluşturma: ${tarih(k._olusturma, true)}</span>`,
      kirinti: [{ ad: mb.ad, rota: mb.rota }, { ad: k[t.baslik] || '#' + id }],
      eylemler: html`${t.yazdir === 'makbuz' ? html`<button class="dugme" data-eylem="makbuz"><i class="fa-solid fa-print"></i>Makbuz yazdır</button>` : html`<button class="dugme" data-eylem="yazdir"><i class="fa-solid fa-print"></i>Yazdır</button>`}
        ${izleyici ? '' : html`<button class="dugme" data-eylem="kopyala"><i class="fa-regular fa-copy"></i>Kopyala</button><a class="dugme birincil" href="${mb.rota}/${id}/duzenle"><i class="fa-solid fa-pen"></i>Düzenle</a>`}` })}
    <div class="izgara izgara-3-1">
      <div><section class="kart"><div class="kart-baslik"><h2>Bilgiler</h2></div><div class="kart-govde"><dl class="tanim-listesi">${ana.map(a => html`<dt>${a.etiket}</dt><dd>${a.tip === 'telefon' ? telLink(k[a.ad]) : a.tip === 'secim' && k[a.ad] && a.filtre ? durumRozet(k[a.ad]) : hucre(a, k)}</dd>`)}</dl>
        ${uzun.map(a => html`<h3 style="font-size:13px;margin:18px 0 6px;color:var(--soluk)">${a.etiket}</h3><p style="white-space:pre-wrap">${k[a.ad]}</p>`)}</div></section>
        ${bagli.map(b => { const bt = tanim(b.modul), bm = modulBilgi(b.modul); const la = bt.alanlar.filter(a => a.liste && a.ad !== b.alan).slice(0, 5);
          return html`<section class="kart"><div class="kart-baslik"><div><h2>${bm.ad}</h2><p>${b.toplam} kayıt</p></div>${izleyici ? '' : html`<a class="dugme kucuk" href="${bm.rota}/yeni?${b.alan}=${id}"><i class="fa-solid fa-plus"></i>Ekle</a>`}</div>
            <div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr>${la.map(a => html`<th class="${a.tip === 'para' ? 'sag' : ''}">${a.etiket}</th>`)}</tr></thead><tbody>${b.kayitlar.map(x => html`<tr class="tiklanir" data-git="${bm.rota}/${x.id}">${la.map((a, i) => html`<td data-etiket="${a.etiket}" class="${i === 0 ? 'mk-baslik' : ''} ${a.tip === 'para' ? 'sag' : ''}">${hucre(a, x)}</td>`)}</tr>`)}</tbody>
            ${la.some(a => a.tip === 'para') ? html`<tfoot><tr>${la.map((a, i) => html`<td class="${a.tip === 'para' ? 'sag' : ''}">${i === 0 ? 'Toplam' : a.tip === 'para' ? para(b.kayitlar.reduce((s, x) => s + (Number(x[a.ad]) || 0), 0)) : ''}</td>`)}</tr></tfoot>` : ''}</table></div></section>`; })}
      </div>
      <aside><section class="kart"><div class="kart-baslik"><h2>Geçmiş</h2></div>${gecmis.length ? html`<ul class="liste">${gecmis.map(g => html`<li><span class="l-orta"><strong>${g.islem}</strong><small>${g.kim} · ${goreceli(g.tarih)}</small></span></li>`)}</ul>` : html`<div class="kart-govde soluk">Kayıt geçmişi yok.</div>`}</section>
        ${izleyici ? '' : html`<button class="dugme tam hayalet" data-eylem="sil" style="margin-top:12px;color:var(--tehlike)"><i class="fa-solid fa-trash"></i>Kaydı sil</button>`}</aside>
    </div>`);
  kok.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-git]'); if (tr && !e.target.closest('a')) D.git(tr.dataset.git); });
  baglan(kok, {
    sil: () => silOnay(modul, id, k[t.baslik]),
    kopyala: () => { const p = new URLSearchParams(); t.alanlar.filter(a => !a.saltOkunur && k[a.ad] !== null && k[a.ad] !== undefined && a.tip !== 'tarih').forEach(a => p.set(a.ad, k[a.ad])); D.git(`${mb.rota}/yeni?${p}`); },
    makbuz: async () => {
      const logo = await logoVeri();
      yazdir(belgeSablon({ baslik: `Makbuz ${k.makbuz_no}`, logo, icerik: `
        <div style="display:flex;justify-content:space-between;align-items:flex-end"><div><h1>Bağış alındı makbuzu</h1><div class="soluk">Makbuz no: <strong>${esc(k.makbuz_no)}</strong></div></div><div class="soluk">Tarih: <strong>${esc(tarih(k.tarih))}</strong></div></div>
        <div class="izgara" style="margin-top:18px"><div class="kutu"><div class="soluk">Bağışçı</div><strong style="font-size:14px">${esc(k.bagisci)}</strong>${k.tc_vkn ? `<div>TC/VKN: ${esc(k.tc_vkn)}</div>` : ''}${k.telefon ? `<div>Tel: ${esc(k.telefon)}</div>` : ''}</div>
        <div class="kutu"><div class="soluk">Bağış türü</div><strong style="font-size:14px">${esc(k.bagis_turu)}</strong><div>Ödeme: ${esc(k.odeme_yontemi || '-')}</div>${k.kimin_adina ? `<div>Adına: ${esc(k.kimin_adina)}</div>` : ''}</div></div>
        <table style="margin-top:18px"><tr><th>Açıklama</th><th class="sag">Tutar</th></tr><tr><td>${esc(k.aciklama || k.bagis_turu)}${k.proje ? ' — ' + esc(k.proje) : ''}</td><td class="sag">${esc(para(k.tutar))}</td></tr><tfoot><tr><td>Toplam</td><td class="sag">${esc(para(k.tutar))}</td></tr></tfoot></table>
        <p style="margin-top:10px">Yalnız: <strong>${esc(yaziyla(k.tutar))}</strong></p>
        <div class="imza"><div>Teslim eden</div><div>Teslim alan</div></div>` }));
    },
    yazdir: async () => {
      const logo = await logoVeri();
      yazdir(belgeSablon({ baslik: `${t.tekil} — ${k[t.baslik] || ''}`, logo, icerik: `<h1>${esc(t.tekil)}: ${esc(k[t.baslik] || '')}</h1><table>${t.alanlar.filter(a => k[a.ad] !== null && k[a.ad] !== undefined && k[a.ad] !== '').map(a => `<tr><th style="width:35%">${esc(a.etiket)}</th><td>${esc(String(hucreDegeri(a, k)))}</td></tr>`).join('')}</table>` }));
    },
  });
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
