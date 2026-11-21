// Sayfalar arası ortak yardımcılar: seçenek yükleme, yazıyla tutar, belge başlığı, tablo
import { D, api, html, kac, para, tarih, ham } from '../cekirdek.js';

const onbellek = new Map();
export async function secenekler(hedef, yenile = false) {
  if (!yenile && onbellek.has(hedef) && Date.now() - onbellek.get(hedef).t < 30000) return onbellek.get(hedef).v;
  let v = [];
  if (hedef.startsWith('kayit:')) v = (await api('GET', `/kayit/${hedef.slice(6)}/secenekler`)).map(x => [x.id, x.baslik]);
  else if (hedef === 'cari') v = (await api('GET', '/cariler/secenekler')).map(x => [x.id, x.unvan]);
  else if (hedef === 'finans_hesap') v = (await api('GET', '/finans/hesaplar')).filter(x => x.aktif).map(x => [x.id, x.ad]);
  else if (hedef === 'kullanici') v = (await api('GET', '/kullanicilar/secenekler')).map(x => [x.id, x.ad_soyad]);
  else if (hedef.startsWith('kategori:')) v = (await api('GET', '/kategoriler?tip=' + hedef.slice(9))).map(x => [x.ad, x.ad]);
  onbellek.set(hedef, { t: Date.now(), v });
  return v;
}
export function onbellekTemizle() { onbellek.clear(); }

// Türkçe yazıyla tutar (makbuz/fatura için)
const BIR = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const ON = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
function ucBasamak(n) {
  const y = Math.floor(n / 100), o = Math.floor((n % 100) / 10), b = n % 10;
  return (y ? (y === 1 ? '' : BIR[y]) + 'yüz' : '') + ON[o] + BIR[b];
}
export function yaziyla(tutar) {
  tutar = Math.round((Number(tutar) || 0) * 100) / 100;
  let tl = Math.floor(tutar); const kr = Math.round((tutar - tl) * 100);
  if (!tl && !kr) return 'sıfır Türk lirası';
  const birimler = ['', 'bin', 'milyon', 'milyar', 'trilyon'];
  let s = '', i = 0;
  while (tl > 0) {
    const p = tl % 1000;
    if (p) s = (i === 1 && p === 1 ? '' : ucBasamak(p)) + birimler[i] + s;
    tl = Math.floor(tl / 1000); i++;
  }
  return (s ? s + ' Türk lirası' : '') + (kr ? (s ? ' ' : '') + ucBasamak(kr) + ' kuruş' : '');
}

export function logoUrl() { return D.oturum && D.oturum.hesap.logo_var ? '/api/ayarlar/logo?v=' + Date.now() : null; }
export async function logoVeri() {
  if (!D.oturum.hesap.logo_var) return null;
  try { const r = await fetch('/api/ayarlar/logo'); const b = await r.blob(); return await new Promise(c => { const f = new FileReader(); f.onload = () => c(f.result); f.readAsDataURL(b); }); } catch (e) { return null; }
}

// Yazdırılabilir belge iskeleti
export function belgeSablon({ baslik, icerik, logo, yatay = false }) {
  const h = D.oturum.hesap;
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${kac(baslik)}</title><style>
    @page{size:A4 ${yatay ? 'landscape' : 'portrait'};margin:14mm 14mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:"Segoe UI",Calibri,Arial,sans-serif;color:#1a2232;font-size:12px;margin:0}
    .ust{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #14213d;padding-bottom:12px;margin-bottom:16px}
    .ust img{max-height:64px;max-width:200px;object-fit:contain}.kurum{font-size:11px;color:#4a5568;line-height:1.5}.kurum strong{font-size:14px;color:#14213d;display:block}
    h1{font-size:18px;color:#14213d;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#f1f3f7;text-align:left;font-size:11px;padding:7px 8px;border-bottom:1px solid #c9d0db}
    td{padding:7px 8px;border-bottom:1px solid #e6e9ef;vertical-align:top}.sag{text-align:right;white-space:nowrap}.orta{text-align:center}
    tfoot td{font-weight:700;border-top:1px solid #4a5568;border-bottom:3px double #4a5568}.kutu{border:1px solid #c9d0db;border-radius:6px;padding:10px 12px}
    .izgara{display:grid;grid-template-columns:1fr 1fr;gap:12px}.soluk{color:#6b7587}.imza{display:flex;justify-content:space-between;margin-top:48px}.imza div{width:40%;border-top:1px solid #4a5568;padding-top:6px;text-align:center;font-size:11px}
    .alt{margin-top:24px;font-size:10px;color:#6b7587;text-align:center}
  </style></head><body><div class="ust"><div class="kurum"><strong>${kac(h.ad)}</strong>${kac(h.adres || '')}${h.adres ? '<br>' : ''}${h.telefon ? 'Tel: ' + kac(h.telefon) : ''}${h.eposta ? ' · ' + kac(h.eposta) : ''}${h.vergi_no ? '<br>' + kac(h.vergi_dairesi || '') + ' V.D. ' + kac(h.vergi_no) : ''}</div>${logo ? `<img src="${logo}" alt="">` : ''}</div>
  ${icerik}<div class="alt">Defterdar ile oluşturuldu · ${new Date().toLocaleString('tr-TR')}</div></body></html>`;
}

export function hucreDegeri(a, r) {
  const v = r[a.ad];
  if (a.tip === 'iliski' || a.tip === 'kullanici') return (r._etiket || {})[a.ad] || (v ? '#' + v : '—');
  if (v === null || v === undefined || v === '') return '—';
  if (a.tip === 'para') return para(v);
  if (a.tip === 'tarih') return tarih(v);
  if (a.tip === 'evet') return v ? 'Evet' : 'Hayır';
  return v;
}
export { ham };
