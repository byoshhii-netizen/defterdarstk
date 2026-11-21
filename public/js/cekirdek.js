// Defterdar istemci çekirdeği: güvenli şablon, API, biçimlendirme, modal, bildirim, tablo yardımcıları
export const D = { oturum: null, csrf: null, tanimlar: null, sayfaTemizle: [] };

// ─── Güvenli HTML şablonu ───
const HAM = Symbol('ham');
export function ham(s) { return { [HAM]: true, s: String(s ?? '') }; }
export function kac(v) {
  return String(v ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
}
function deger(v) {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(deger).join('');
  if (typeof v === 'object' && v[HAM]) return v.s;
  return kac(v);
}
export function html(parcalar, ...degerler) {
  let s = '';
  parcalar.forEach((p, i) => { s += p; if (i < degerler.length) s += deger(degerler[i]); });
  return ham(s);
}
export function yerlestir(el, sablon) { el.innerHTML = sablon && sablon[HAM] ? sablon.s : kac(sablon); return el; }
export const $ = (s, k = document) => k.querySelector(s);
export const $$ = (s, k = document) => [...k.querySelectorAll(s)];

// ─── Biçimlendirme ───
const paraF = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sayiF = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
export const para = (n, sembol = true) => (n === null || n === undefined || n === '') ? '—' : paraF.format(Number(n) || 0) + (sembol ? ' ₺' : '');
export const sayi = (n) => (n === null || n === undefined || n === '') ? '—' : sayiF.format(Number(n) || 0);
export function tarih(t, saatli = false) {
  if (!t) return '—';
  const s = String(t);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s.includes('T') || s.includes('Z') ? s : s.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return s;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + (saatli ? ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '');
}
export function goreceli(ms) {
  const d = typeof ms === 'number' ? ms : new Date(String(ms).replace(' ', 'T') + (String(ms).includes('Z') ? '' : 'Z')).getTime();
  const fark = (Date.now() - d) / 1000;
  if (fark < 60) return 'az önce'; if (fark < 3600) return Math.floor(fark / 60) + ' dk önce';
  if (fark < 86400) return Math.floor(fark / 3600) + ' saat önce'; if (fark < 86400 * 30) return Math.floor(fark / 86400) + ' gün önce';
  return tarih(new Date(d).toISOString());
}
export function bugun() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
export const buAy = () => bugun().slice(0, 7);
export const boyut = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
export const ayAdi = (a) => { const [y, m] = String(a).split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }); };
export const ayKisa = (a) => { const [y, m] = String(a).split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('tr-TR', { month: 'short' }); };

// ─── API ───
export class ApiHata extends Error { constructor(m, d, j) { super(m); this.durum = d; this.veri = j; } }
export async function api(metod, yol, govde, secenek = {}) {
  const h = { 'X-Requested-With': 'defterdar' };
  if (D.csrf) h['X-CSRF-Token'] = D.csrf;
  if (secenek.basliklar) Object.assign(h, secenek.basliklar);
  let body;
  if (govde instanceof Blob || govde instanceof ArrayBuffer) { body = govde; }
  else if (govde !== undefined && govde !== null) { h['Content-Type'] = 'application/json'; body = JSON.stringify(govde); }
  let r;
  try { r = await fetch((secenek.taban ?? '/api') + yol, { method: metod, headers: h, body, credentials: 'same-origin' }); }
  catch (e) { throw new ApiHata('Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.', 0); }
  if (secenek.dosya && r.ok) return r;
  const tip = r.headers.get('content-type') || '';
  const j = tip.includes('json') ? await r.json() : null;
  if (!r.ok) {
    if (r.status === 401 && !secenek.sessiz && D.yetkisiz) D.yetkisiz();
    if (r.status === 503 && j && j.sistem_modu && D.bakim) D.bakim(j);
    throw new ApiHata((j && j.hata) || 'İşlem tamamlanamadı', r.status, j);
  }
  return j;
}
export async function indir(yol, dosyaAdi) {
  const r = await api('GET', yol, null, { dosya: true });
  const blob = await r.blob();
  const cd = r.headers.get('content-disposition') || '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  dosyaKaydet(blob, m ? decodeURIComponent(m[1]) : dosyaAdi);
}
export function dosyaKaydet(blob, ad) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ad;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export async function excelTablo(baslik, basliklar, satirlar, para = []) {
  const r = await api('POST', '/rapor/excel', { baslik, basliklar, satirlar, para }, { dosya: true });
  dosyaKaydet(await r.blob(), baslik + '.xlsx');
}

// ─── Bildirim (toast) ───
export function bildir(mesaj, tur = 'basari', sure = 3800) {
  let k = $('#bildirimler');
  if (!k) { k = document.createElement('div'); k.id = 'bildirimler'; k.setAttribute('aria-live', 'polite'); document.body.appendChild(k); }
  const el = document.createElement('div');
  el.className = 'bildirim bildirim-' + tur;
  yerlestir(el, html`<i class="fa-solid ${tur === 'hata' ? 'fa-circle-exclamation' : tur === 'uyari' ? 'fa-triangle-exclamation' : tur === 'bilgi' ? 'fa-circle-info' : 'fa-circle-check'}"></i><span>${mesaj}</span>`);
  k.appendChild(el);
  setTimeout(() => { el.classList.add('cikis'); setTimeout(() => el.remove(), 300); }, sure);
}
export function hataGoster(e) { console.error(e); bildir(e.message || 'Beklenmeyen bir hata oluştu', 'hata', 5500); }

// ─── Olay bağlama (satır içi JS yok; CSP uyumlu) ───
export function baglan(kok, eylemler) {
  const tikla = async (ev) => {
    const el = ev.target.closest('[data-eylem]');
    if (!el || !kok.contains(el)) return;
    const fn = eylemler[el.dataset.eylem];
    if (!fn) return;
    if (el.tagName === 'A' || el.type === 'submit') ev.preventDefault();
    ev.stopPropagation();
    if (el.dataset.mesgul) return;
    try { el.dataset.mesgul = '1'; await fn(el, ev); } catch (e) { hataGoster(e); } finally { delete el.dataset.mesgul; }
  };
  kok.addEventListener('click', tikla);
  return () => kok.removeEventListener('click', tikla);
}
export function degisince(kok, secici, fn) {
  const h = (ev) => { const el = ev.target.closest(secici); if (el && kok.contains(el)) fn(el, ev); };
  kok.addEventListener('change', h); return () => kok.removeEventListener('change', h);
}
export function gecikmeli(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ─── Modal ───
let modalSayac = 0;
export function modal({ baslik, icerik, genis = false, altlik, kapaninca, sinif = '' }) {
  const id = 'modal-' + (++modalSayac);
  const kap = document.createElement('div');
  kap.className = 'modal-arka'; kap.id = id;
  yerlestir(kap, html`<div class="modal ${genis ? 'modal-genis' : ''} ${sinif}" role="dialog" aria-modal="true" aria-labelledby="${id}-b">
    <header class="modal-baslik"><h2 id="${id}-b">${baslik}</h2><button class="ikon-dugme" data-kapat aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="modal-icerik">${icerik}</div>${altlik ? html`<footer class="modal-altlik">${altlik}</footer>` : ''}</div>`);
  document.body.appendChild(kap);
  document.body.classList.add('modal-acik');
  const onceki = document.activeElement;
  const kapat = (sonuc) => {
    kap.classList.add('cikis');
    setTimeout(() => { kap.remove(); if (!$('.modal-arka')) document.body.classList.remove('modal-acik'); if (onceki && onceki.focus) onceki.focus(); }, 160);
    document.removeEventListener('keydown', tus);
    if (kapaninca) kapaninca(sonuc);
  };
  const tus = (e) => { if (e.key === 'Escape' && kap === $$('.modal-arka').pop()) kapat(); };
  document.addEventListener('keydown', tus);
  kap.addEventListener('mousedown', (e) => { if (e.target === kap) kap.dataset.dis = '1'; });
  kap.addEventListener('mouseup', (e) => { if (e.target === kap && kap.dataset.dis) kapat(); delete kap.dataset.dis; });
  kap.addEventListener('click', (e) => { if (e.target.closest('[data-kapat]')) kapat(); });
  setTimeout(() => { const ilk = kap.querySelector('[autofocus], input:not([type=hidden]):not([readonly]), select, textarea, button.birincil'); if (ilk) ilk.focus(); }, 30);
  return { el: kap, icerik: kap.querySelector('.modal-icerik'), kapat };
}
export function onayla({ baslik = 'Emin misiniz?', mesaj, dugme = 'Onayla', tehlike = false, yazili = null }) {
  return new Promise((coz) => {
    let sonuc = false;
    const m = modal({
      baslik, icerik: html`<p class="onay-metin">${mesaj}</p>${yazili ? html`<label class="alan"><span>Onaylamak için <strong>${yazili}</strong> yazın</span><input type="text" data-onay autocomplete="off"></label>` : ''}`,
      altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme ${tehlike ? 'tehlike' : 'birincil'}" data-tamam ${yazili ? 'disabled' : ''}>${dugme}</button>`,
      kapaninca: () => coz(sonuc),
    });
    const t = m.el.querySelector('[data-tamam]');
    if (yazili) m.el.querySelector('[data-onay]').addEventListener('input', (e) => { t.disabled = e.target.value.trim() !== yazili; });
    t.addEventListener('click', () => { sonuc = true; m.kapat(true); });
  });
}

// ─── Form yardımcıları ───
export function formVerisi(form) {
  const v = {};
  $$('input, select, textarea', form).forEach(el => {
    if (!el.name || el.disabled) return;
    if (el.type === 'checkbox') {
      if (el.dataset.dizi !== undefined) { v[el.name] = v[el.name] || []; if (el.checked) v[el.name].push(el.value); }
      else v[el.name] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) v[el.name] = el.value; }
    else v[el.name] = el.value;
  });
  return v;
}
export function formGonder(form, fn) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]') || document.querySelector(`[form="${form.id}"][type=submit]`);
    if (btn) { if (btn.disabled) return; btn.disabled = true; btn.classList.add('yukleniyor'); }
    $$('.alan-hata', form).forEach(x => x.remove());
    try { await fn(formVerisi(form), form); } catch (er) { hataGoster(er); } finally { if (btn) { btn.disabled = false; btn.classList.remove('yukleniyor'); } }
  });
}
export function dosyaOku(dosya, tip = 'dataurl') {
  return new Promise((coz, red) => {
    const r = new FileReader();
    r.onload = () => coz(r.result); r.onerror = () => red(new Error('Dosya okunamadı'));
    if (tip === 'metin') r.readAsText(dosya, 'utf-8'); else if (tip === 'buffer') r.readAsArrayBuffer(dosya); else r.readAsDataURL(dosya);
  });
}
// Görseli tarayıcıda küçültür (logo, fotoğraf)
export async function gorselKucult(dosya, maks = 800, kalite = 0.85) {
  if (dosya.type === 'image/svg+xml') return dosyaOku(dosya);
  const url = await dosyaOku(dosya);
  const img = await new Promise((c, r) => { const i = new Image(); i.onload = () => c(i); i.onerror = () => r(new Error('Görsel okunamadı')); i.src = url; });
  const o = Math.min(1, maks / Math.max(img.width, img.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * o); cv.height = Math.round(img.height * o);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL(dosya.type === 'image/png' ? 'image/png' : 'image/jpeg', kalite);
}

// ─── Alan bileşenleri ───
export function alan({ ad, etiket, tip = 'text', deger = '', zorunlu = false, yardim, secenekler, yer, ek = '', tam = false, min, adim, maks }) {
  let girdi;
  const z = zorunlu ? ham(' required') : '';
  if (tip === 'select') {
    girdi = html`<select name="${ad}"${z} ${ham(ek)}>${(secenekler || []).map(s => { const [v, e] = Array.isArray(s) ? s : [s, s]; return html`<option value="${v}" ${String(v) === String(deger ?? '') ? ham('selected') : ''}>${e}</option>`; })}</select>`;
  } else if (tip === 'textarea') {
    girdi = html`<textarea name="${ad}" rows="3"${z} placeholder="${yer || ''}" ${ham(ek)}>${deger ?? ''}</textarea>`;
  } else if (tip === 'checkbox') {
    return html`<label class="onay-kutusu ${tam ? 'tam' : ''}"><input type="checkbox" name="${ad}" ${deger ? ham('checked') : ''} ${ham(ek)}><span>${etiket}</span></label>`;
  } else {
    girdi = html`<input type="${tip}" name="${ad}" value="${deger ?? ''}"${z} placeholder="${yer || ''}" ${min !== undefined ? ham(`min="${kac(min)}"`) : ''} ${maks !== undefined ? ham(`max="${kac(maks)}"`) : ''} ${adim ? ham(`step="${kac(adim)}"`) : ''} ${tip === 'number' && !adim ? ham('step="any"') : ''} ${ham(ek)}>`;
  }
  return html`<label class="alan ${tam ? 'tam' : ''}"><span>${etiket}${zorunlu ? html`<em aria-hidden="true">*</em>` : ''}</span>${girdi}${yardim ? html`<small>${yardim}</small>` : ''}</label>`;
}

// ─── Rozetler ───
export function rozet(metin, tur = 'notr') { return html`<span class="rozet rozet-${tur}">${metin}</span>`; }
const DURUM_RENK = {
  odendi: 'basari', 'Ödendi': 'basari', aktif: 'basari', Aktif: 'basari', 'Tamamlandı': 'basari', 'Onaylandı': 'basari', 'Kazanıldı': 'basari', 'Sponsorlu': 'basari', 'Teslim edildi': 'basari', tahsil: 'basari', 'Gönderildi': 'basari', gonderildi: 'basari', onaylandi: 'basari', faturalandi: 'basari', Kullanımda: 'basari', Sahada: 'basari',
  bekliyor: 'uyari', 'Bekliyor': 'uyari', acik: 'uyari', kismi: 'bilgi', 'Devam ediyor': 'bilgi', 'İnceleniyor': 'uyari', 'Hazırlanıyor': 'uyari', portfoy: 'bilgi', taslak: 'notr', 'Sponsor bekliyor': 'uyari', 'Planlanıyor': 'bilgi', 'Planlama': 'bilgi', 'Yapılacak': 'uyari', 'Toplama bekliyor': 'uyari', 'İşlemde': 'uyari', 'Onay bekliyor': 'uyari', 'Bağış toplanıyor': 'uyari', 'Sondajda': 'bilgi',
  iptal: 'tehlike', 'İptal': 'tehlike', 'Reddedildi': 'tehlike', reddedildi: 'tehlike', karsiliksiz: 'tehlike', 'Kaybedildi': 'tehlike', Pasif: 'notr', pasif: 'notr', askida: 'tehlike', 'Acil': 'tehlike', 'Yüksek': 'uyari', 'Arızalı': 'tehlike', 'Kayıp': 'tehlike',
};
const DURUM_AD = { odendi: 'Ödendi', bekliyor: 'Bekliyor', kismi: 'Kısmi ödendi', iptal: 'İptal', acik: 'Açık', portfoy: 'Portföyde', tahsil: 'Tahsil edildi', ciro: 'Ciro edildi', karsiliksiz: 'Karşılıksız', iade: 'İade', taslak: 'Taslak', gonderildi: 'Gönderildi', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi', faturalandi: 'Faturalandı', aktif: 'Aktif', pasif: 'Pasif', askida: 'Askıda', yanitlandi: 'Yanıtlandı', kapali: 'Kapalı' };
export const durumAd = (d) => DURUM_AD[d] || d;
export function durumRozet(d) { if (!d) return ''; return rozet(durumAd(d), DURUM_RENK[d] || 'notr'); }

// ─── Boş durum ───
export function bos({ ikon = 'fa-folder-open', baslik, metin, eylem }) {
  return html`<div class="bos-durum"><i class="fa-solid ${ikon}"></i><h3>${baslik}</h3>${metin ? html`<p>${metin}</p>` : ''}${eylem || ''}</div>`;
}
export function yukleniyor(metin = 'Yükleniyor') { return html`<div class="yukleniyor-kap" role="status"><span class="donen"></span><span>${metin}</span></div>`; }

// ─── Sayfa başlığı ───
export function sayfaBaslik({ baslik, alt, eylemler, kirinti }) {
  return html`<header class="sayfa-baslik">
    <div class="sb-sol">${kirinti ? html`<nav class="kirinti" aria-label="Konum">${kirinti.map((k, i) => html`${i ? html`<i class="fa-solid fa-chevron-right"></i>` : ''}${k.rota ? html`<a href="${k.rota}">${k.ad}</a>` : html`<span>${k.ad}</span>`}`)}</nav>` : ''}
      <h1>${baslik}</h1>${alt ? html`<p>${alt}</p>` : ''}</div>
    ${eylemler ? html`<div class="sb-eylem">${eylemler}</div>` : ''}</header>`;
}

// ─── KPI kutusu ───
export function kpi({ etiket, deger, alt, tur = 'notr', ikon, rota }) {
  const ic = html`<div class="kpi-ust"><span>${etiket}</span>${ikon ? html`<i class="fa-solid ${ikon}"></i>` : ''}</div><div class="kpi-deger">${deger}</div>${alt ? html`<div class="kpi-alt">${alt}</div>` : ''}`;
  return rota ? html`<a class="kpi kpi-${tur}" href="${rota}">${ic}</a>` : html`<div class="kpi kpi-${tur}">${ic}</div>`;
}

// ─── Yazdırma (CSP uyumlu: gizli iframe) ───
export function yazdir(belgeHtml) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  f.setAttribute('sandbox', 'allow-modals allow-same-origin');
  document.body.appendChild(f);
  f.srcdoc = belgeHtml;
  f.onload = () => {
    const imgs = [...f.contentDocument.images];
    Promise.all(imgs.map(i => i.complete ? 0 : new Promise(c => { i.onload = i.onerror = c; }))).then(() => {
      setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 100);
    });
  };
}

// ─── Telefon ve doğrulama ───
export function telLink(t) { if (!t) return '—'; return html`<a href="tel:${String(t).replace(/[^\d+]/g, '')}" class="tel">${t}</a>`; }

// ─── Basit SVG grafikler (bağımlılıksız) ───
export function cubukGrafik(seri, { yukseklik = 220, genislik = 640, anahtarlar = [['giris', 'Giriş', 'g1'], ['cikis', 'Çıkış', 'g2']], etiket = (x) => x.ay } = {}) {
  if (!seri.length || seri.every(s => anahtarlar.every(a => !s[a[0]]))) return html`<div class="bos-durum" style="padding:36px 10px"><i class="fa-solid fa-chart-column"></i><p>Bu dönemde henüz hareket yok</p></div>`;
  const W = genislik, H = yukseklik, sol = 56, alt = 26, ust = 10;
  const maks = Math.max(1, ...seri.flatMap(s => anahtarlar.map(a => s[a[0]] || 0)));
  const adim = Math.pow(10, Math.floor(Math.log10(maks))); const tavan = Math.max(4, Math.ceil(maks / adim) * adim);
  const gw = (W - sol - 8) / seri.length, bw = Math.max(3, Math.min(18, gw / (anahtarlar.length + 1)));
  const y = (v) => ust + (H - ust - alt) * (1 - v / tavan);
  const kisalt = (v) => v >= 1e6 ? (v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' Mn' : v >= 1e3 ? (v / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' B' : String(Math.round(v));
  const izgara = [0, .25, .5, .75, 1].map(o => html`<line x1="${sol}" x2="${W - 4}" y1="${y(tavan * o)}" y2="${y(tavan * o)}" class="izgara"/><text x="${sol - 8}" y="${y(tavan * o) + 4}" class="eksen" text-anchor="end">${kisalt(tavan * o)}</text>`);
  const cubuklar = seri.map((s, i) => {
    const x0 = sol + i * gw + (gw - bw * anahtarlar.length - 2 * (anahtarlar.length - 1)) / 2;
    return html`<g><title>${etiket(s)} — ${anahtarlar.map(a => `${a[1]}: ${para(s[a[0]] || 0)}`).join(', ')}</title>${anahtarlar.map((a, j) => { const v = s[a[0]] || 0; return html`<rect x="${x0 + j * (bw + 2)}" y="${y(v)}" width="${bw}" height="${Math.max(0, H - alt - y(v))}" rx="2" class="${a[2]}"/>`; })}
      <text x="${sol + i * gw + gw / 2}" y="${H - 8}" class="eksen" text-anchor="middle">${etiket(s)}</text></g>`;
  });
  return html`<div class="grafik"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik">${izgara}${cubuklar}</svg>
    <div class="lejant">${anahtarlar.map(a => html`<span><i class="${a[2]}"></i>${a[1]}</span>`)}</div></div>`;
}
export function yatayCubuk(liste, { deger = 'tutar', ad = 'ad', bicim = para, renk = 'g1' } = {}) {
  if (!liste.length) return html`<p class="soluk">Henüz veri yok</p>`;
  const maks = Math.max(1, ...liste.map(x => x[deger] || 0));
  return html`<ul class="yatay-cubuk">${liste.map(x => html`<li><div class="yc-ust"><span>${x[ad]}</span><strong>${bicim(x[deger])}</strong></div><div class="yc-iz"><i class="${renk}" style="width:${Math.max(1.5, (x[deger] || 0) / maks * 100).toFixed(1)}%"></i></div></li>`)}</ul>`;
}
export function ilerleme(oran, tur = '') { const o = Math.max(0, Math.min(100, oran || 0)); return html`<div class="ilerleme ${tur}" role="progressbar" aria-valuenow="${o}" aria-valuemin="0" aria-valuemax="100"><i style="width:${o}%"></i></div>`; }
