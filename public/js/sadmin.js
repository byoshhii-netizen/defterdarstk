// Defterdar yönetim paneli (/sadmin)
import { D, api as anaApi, html, yerlestir, $, $$, para, sayi, tarih, goreceli, bildir, hataGoster, baglan, degisince, gecikmeli, formGonder, formVerisi, modal, onayla, sayfaBaslik, kpi, bos, rozet, durumRozet, alan, boyut, cubukGrafik, yatayCubuk, indir, dosyaKaydet } from './cekirdek.js';

const api = (m, y, g, s) => anaApi(m, '/sadmin' + y, g, s);
const TUR = { stk: 'STK', sirket: 'Şirket', muhasebe: 'Muhasebe', esnaf: 'Esnaf' };
const ROL = { super: 'Süper yönetici', destek: 'Destek', izleyici: 'İzleyici' };
let A = null;

const ROTALAR = [
  ['/sadmin', 'panel'], ['/sadmin/hesaplar', 'hesaplar'], ['/sadmin/hesaplar/:id', 'hesapDetay'], ['/sadmin/kullanicilar', 'kullanicilar'],
  ['/sadmin/destek', 'destek'], ['/sadmin/destek/:id', 'destekDetay'], ['/sadmin/duyurular', 'duyurular'], ['/sadmin/moduller', 'moduller'],
  ['/sadmin/sistem', 'sistem'], ['/sadmin/guvenlik', 'guvenlik'], ['/sadmin/denetim', 'denetim'], ['/sadmin/yedekler', 'yedekler'],
  ['/sadmin/yoneticiler', 'yoneticiler'], ['/sadmin/hesabim', 'hesabim'],
];
const MENU = [
  ['Genel', [['/sadmin', 'fa-gauge-high', 'Genel bakış']]],
  ['Müşteriler', [['/sadmin/hesaplar', 'fa-building', 'Hesaplar'], ['/sadmin/kullanicilar', 'fa-users', 'Kullanıcılar'], ['/sadmin/destek', 'fa-life-ring', 'Destek talepleri'], ['/sadmin/duyurular', 'fa-bullhorn', 'Duyurular']]],
  ['Platform', [['/sadmin/moduller', 'fa-table-cells-large', 'Modüller ve algoritma'], ['/sadmin/sistem', 'fa-sliders', 'Sistem ayarları'], ['/sadmin/yedekler', 'fa-database', 'Yedekler']]],
  ['Güvenlik', [['/sadmin/guvenlik', 'fa-shield-halved', 'Güvenlik merkezi'], ['/sadmin/denetim', 'fa-clock-rotate-left', 'Denetim kaydı'], ['/sadmin/yoneticiler', 'fa-user-shield', 'Yöneticiler'], ['/sadmin/hesabim', 'fa-key', 'Hesabım ve 2FA']]],
];

function git(url, degistir) { if (degistir) history.replaceState({}, '', url); else history.pushState({}, '', url); isle(); }
D.git = git;
window.addEventListener('popstate', () => isle());
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/sadmin"]');
  if (!a || e.ctrlKey || e.metaKey || a.target) return;
  e.preventDefault(); document.body.classList.remove('menu-acik');
  if (a.getAttribute('href') !== location.pathname + location.search) git(a.getAttribute('href'));
});
D.yetkisiz = () => { A = null; D.csrf = null; girisEkrani(); };

async function isle() {
  if (!A) {
    try { const o = await api('GET', '/oturum', null, { sessiz: true }); A = o.admin; D.csrf = o.csrf; }
    catch (e) { return girisEkrani(); }
  }
  if (A.varsayilan_sifre) return sifreZorunlu();
  if (!$('.iskelet')) kabuk();
  const yol = location.pathname.replace(/\/$/, '') || '/sadmin';
  let eslesen = null, params = {};
  for (const [d, fn] of ROTALAR) {
    const ad = []; const re = new RegExp('^' + d.replace(/:([a-z]+)/g, (_, k) => { ad.push(k); return '([^/]+)'; }) + '$');
    const m = re.exec(yol); if (m) { eslesen = fn; ad.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; }
  }
  $$('#menu a').forEach(a => a.classList.toggle('aktif', a.getAttribute('href') === yol || (a.getAttribute('href') !== '/sadmin' && yol.startsWith(a.getAttribute('href')))));
  const kok = $('#icerik');
  if (!eslesen) return yerlestir(kok, bos({ baslik: 'Sayfa bulunamadı', ikon: 'fa-compass' }));
  yerlestir(kok, html`<div class="yukleniyor-kap"><span class="donen"></span><span>Yükleniyor</span></div>`);
  try { await SAYFA[eslesen](kok, params, Object.fromEntries(new URLSearchParams(location.search))); window.scrollTo(0, 0); }
  catch (e) {
    if (e.durum === 428) { A.varsayilan_sifre = 1; return sifreZorunlu(); }
    yerlestir(kok, html`<div class="kart">${bos({ ikon: 'fa-triangle-exclamation', baslik: 'Sayfa açılamadı', metin: e.message })}</div>`);
  }
}

// ─── Giriş ───
function girisEkrani(adim = 'sifre', bilgiler = {}) {
  document.title = 'Yönetici girişi — Defterdar';
  yerlestir($('#uygulama'), html`<div class="ag-giris"><div class="ag-kutu">
    <div class="ag-ust"><span class="muhur"><b>D</b></span><div><strong>Defterdar</strong><small>Yönetim paneli</small></div></div>
    <div class="ag-govde">${adim === 'sifre' ? html`<h1>Yönetici girişi</h1><p>Bu alan yalnızca yetkili yöneticiler içindir. Tüm denemeler IP adresiyle kayıt altına alınır.</p>
      <form id="ag-form" novalidate autocomplete="on"><div id="hata"></div>
        ${alan({ ad: 'kullanici_adi', etiket: 'Kullanıcı adı', zorunlu: true, deger: bilgiler.kullanici_adi || '', ek: 'autocomplete="username" autocapitalize="none" spellcheck="false" autofocus' })}
        <label class="alan"><span>Şifre</span><div class="sifre-kap"><input type="password" name="sifre" required autocomplete="current-password"><button type="button" class="ikon-dugme goster" aria-label="Şifreyi göster"><i class="fa-regular fa-eye"></i></button></div></label>
        <button class="dugme birincil tam" type="submit"><i class="fa-solid fa-lock"></i>Giriş yap</button></form>`
    : html`<h1>İki adımlı doğrulama</h1><p>Kimlik doğrulama uygulamanızdaki 6 haneli kodu girin.</p><form id="ag-form" novalidate><div id="hata"></div>
        <div class="kod-giris">${[0, 1, 2, 3, 4, 5].map(i => html`<input inputmode="numeric" maxlength="1" data-k="${i}" aria-label="${i + 1}. hane" autocomplete="${i === 0 ? 'one-time-code' : 'off'}">`)}</div>
        <button class="dugme birincil tam" type="submit">Doğrula</button><button class="dugme hayalet tam" type="button" data-geri style="margin-top:8px">Geri dön</button></form>`}</div>
    <div class="ag-alt"><i class="fa-solid fa-shield-halved"></i><span>Oturum hareketsizlikte otomatik kapanır. Yetkisiz erişim girişimleri engellenir.</span></div></div></div>`);
  const f = $('#ag-form');
  const g = $('.goster'); if (g) g.addEventListener('click', () => { const i = $('[name=sifre]'); i.type = i.type === 'password' ? 'text' : 'password'; g.querySelector('i').className = 'fa-regular ' + (i.type === 'password' ? 'fa-eye' : 'fa-eye-slash'); });
  const hataYaz = (m) => yerlestir($('#hata'), m ? html`<div class="hata-kutu" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>${m}</span></div>` : '');
  const kodlar = $$('[data-k]');
  kodlar.forEach((k, i) => {
    k.addEventListener('input', () => { k.value = k.value.replace(/\D/g, '').slice(-1); if (k.value && kodlar[i + 1]) kodlar[i + 1].focus(); if (kodlar.every(x => x.value)) f.requestSubmit(); });
    k.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !k.value && kodlar[i - 1]) kodlar[i - 1].focus(); });
    k.addEventListener('paste', (e) => { const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (t.length === 6) { e.preventDefault(); t.split('').forEach((c, j) => { kodlar[j].value = c; }); f.requestSubmit(); } });
  });
  if (kodlar[0]) setTimeout(() => kodlar[0].focus(), 30);
  const geri = $('[data-geri]'); if (geri) geri.addEventListener('click', () => girisEkrani());
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); hataYaz(null);
    const v = adim === 'sifre' ? formVerisi(f) : { ...bilgiler, kod: kodlar.map(k => k.value).join('') };
    if (adim === 'sifre' && (!v.kullanici_adi || !v.sifre)) return hataYaz('Kullanıcı adı ve şifre gerekli.');
    const b = f.querySelector('[type=submit]'); b.disabled = true; b.classList.add('yukleniyor');
    try {
      const r = await api('POST', '/giris', v, { sessiz: true });
      if (r.totp_gerekli) return girisEkrani('kod', v);
      A = null; isle();
    } catch (er) {
      if (adim === 'kod') { kodlar.forEach(k => { k.value = ''; }); kodlar[0].focus(); }
      hataYaz(er.message); b.disabled = false; b.classList.remove('yukleniyor');
    }
  });
}

function sifreZorunlu() {
  yerlestir($('#uygulama'), html`<div class="ag-giris"><div class="ag-kutu"><div class="ag-ust"><span class="muhur"><b>D</b></span><div><strong>Varsayılan şifreyi değiştirin</strong><small>${A.kullanici_adi}</small></div></div>
    <div class="ag-govde"><p>Güvenliğiniz için ilk girişte varsayılan yönetici şifresini değiştirmeniz gerekiyor. Yeni şifre sunucuya özel gizli anahtarla özetlenerek saklanır; kaynak kodda veya veritabanında açık metin olarak bulunmaz.</p>
      <form id="sz-form" novalidate><div id="hata"></div>${alan({ ad: 'mevcut', etiket: 'Mevcut şifre', tip: 'password', zorunlu: true, ek: 'autocomplete="current-password"' })}
        ${alan({ ad: 'yeni', etiket: 'Yeni şifre', tip: 'password', zorunlu: true, yardim: 'En az 10 karakter; harf ve rakam içermeli', ek: 'autocomplete="new-password"' })}${alan({ ad: 'yeni2', etiket: 'Yeni şifre (tekrar)', tip: 'password', zorunlu: true, ek: 'autocomplete="new-password"' })}
        <button class="dugme birincil tam" type="submit">Şifreyi değiştir ve devam et</button><button class="dugme hayalet tam" type="button" data-cikis style="margin-top:8px">Çıkış yap</button></form></div></div></div>`);
  $('[data-cikis]').addEventListener('click', async () => { await api('POST', '/cikis').catch(() => {}); A = null; girisEkrani(); });
  formGonder($('#sz-form'), async (v) => {
    if (v.yeni !== v.yeni2) throw new Error('Yeni şifreler eşleşmiyor');
    await api('POST', '/sifre-degistir', v); A.varsayilan_sifre = 0; bildir('Şifre değiştirildi'); isle();
  });
}

function kabuk() {
  document.title = 'Yönetim — Defterdar';
  document.documentElement.dataset.tema = localStorage.getItem('dd-tema') || 'acik';
  yerlestir($('#uygulama'), html`<div id="mod-bant"></div><div class="iskelet"><aside class="kenar"><a class="marka" href="/sadmin"><span class="muhur"><b>D</b></span><span class="marka-ad">Defterdar<small><span class="yonetim-rozet"><i class="fa-solid fa-shield-halved"></i>YÖNETİM</span></small></span></a>
    <nav class="menu" id="menu">${MENU.map(([g, l]) => html`<div class="menu-grup"><h3>${g}</h3>${l.map(([h, i, a]) => html`<a href="${h}"><i class="fa-solid ${i}"></i><span>${a}</span></a>`)}</div>`)}</nav>
    <div class="kenar-alt"><span>${ROL[A.rol]}</span><a href="/" target="_blank" rel="noopener">Uygulamayı aç</a></div></aside>
    <div class="ana"><header class="ust-bar"><button class="ikon-dugme menu-ac" data-eylem="menuAc" aria-label="Menü"><i class="fa-solid fa-bars"></i></button><span class="soluk" id="saat" style="font-size:13px"></span>
      <div class="ust-sag"><button class="ikon-dugme" data-eylem="tema" aria-label="Tema"><i class="fa-solid fa-circle-half-stroke"></i></button><span class="avatar">${(A.ad_soyad || A.kullanici_adi).slice(0, 2).toLocaleUpperCase('tr-TR')}</span><span style="font-size:13px;font-weight:600">${A.ad_soyad || A.kullanici_adi}</span>
        <button class="dugme kucuk" data-eylem="cikis"><i class="fa-solid fa-right-from-bracket"></i>Çıkış</button></div></header>
      <main class="icerik"><div id="icerik"></div></main></div></div>`);
  baglan(document.body, {
    menuAc: () => document.body.classList.toggle('menu-acik'),
    tema: () => { const y = document.documentElement.dataset.tema === 'koyu' ? 'acik' : 'koyu'; document.documentElement.dataset.tema = y; localStorage.setItem('dd-tema', y); },
    cikis: async () => { await api('POST', '/cikis').catch(() => {}); A = null; D.csrf = null; location.href = '/sadmin'; },
  });
  const saat = () => { const s = $('#saat'); if (s) s.textContent = new Date().toLocaleString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); };
  saat(); setInterval(saat, 30000);
  modBant();
}
async function modBant() {
  try { const a = await api('GET', '/ayarlar'); const b = $('#mod-bant'); if (!b) return; yerlestir(b, a.sistem_modu !== 'acik' ? html`<div class="mod-bant ${a.sistem_modu}"><i class="fa-solid fa-triangle-exclamation"></i> Sistem şu anda ${a.sistem_modu === 'bakim' ? 'bakım modunda' : 'kapalı'}. Kullanıcılar giriş yapamıyor. <a href="/sadmin/sistem" style="color:#fff;text-decoration:underline">Değiştir</a></div>` : ''); } catch (e) { /* */ }
}
const sure = (s) => { const g = Math.floor(s / 86400), sa = Math.floor(s % 86400 / 3600), d = Math.floor(s % 3600 / 60); return (g ? g + ' gün ' : '') + (sa ? sa + ' sa ' : '') + d + ' dk'; };

const SAYFA = {
  async panel(kok) {
    const p = await api('GET', '/panel');
    yerlestir(kok, html`${sayfaBaslik({ baslik: 'Genel bakış', alt: 'Platformun anlık durumu' })}
      <div class="kpi-sira">${kpi({ etiket: 'Hesaplar', deger: sayi(p.hesap), alt: `${p.aktif_hesap} aktif · ${p.askida} askıda`, tur: 'bilgi', ikon: 'fa-building', rota: '/sadmin/hesaplar' })}${kpi({ etiket: 'Kullanıcılar', deger: sayi(p.kullanici), alt: `${p.aktif_oturum} kişi şu an çevrimiçi`, tur: 'basari', ikon: 'fa-users', rota: '/sadmin/kullanicilar' })}
        ${kpi({ etiket: 'Son 7 gün aktif hesap', deger: sayi(p.son7_aktif), tur: 'muhur', ikon: 'fa-chart-line' })}${kpi({ etiket: 'Bekleyen destek', deger: sayi(p.destek_bekleyen), tur: p.destek_bekleyen ? 'uyari' : 'notr', ikon: 'fa-life-ring', rota: '/sadmin/destek?durum=acik' })}
        ${kpi({ etiket: 'Hatalı giriş (24 saat)', deger: sayi(p.hatali_giris_24s), alt: `${p.engelli_ip} engelli IP`, tur: p.hatali_giris_24s > 20 ? 'tehlike' : 'notr', ikon: 'fa-shield-halved', rota: '/sadmin/guvenlik' })}</div>
      <div class="izgara izgara-3-1"><section class="kart"><div class="kart-baslik"><div><h2>Yeni hesaplar</h2><p>Son 30 gün</p></div></div><div class="kart-govde">${cubukGrafik(p.kayit_seri.map(x => ({ ...x, giris: x.adet })), { anahtarlar: [['giris', 'Yeni hesap', 'g1']], etiket: (x) => x.gun.slice(8) })}</div></section>
        <section class="kart"><div class="kart-baslik"><h2>Hesap türleri</h2></div><div class="kart-govde">${yatayCubuk(p.turler.map(t => ({ ad: t.ad, tutar: t.adet })), { bicim: sayi })}</div></section></div>
      <div class="izgara izgara-3 bosluk-ust"><section class="kart"><div class="kart-baslik"><h2>Giriş denemeleri</h2><a class="dugme kucuk hayalet" href="/sadmin/guvenlik">Ayrıntı</a></div><div class="kart-govde">${cubukGrafik(p.giris_seri.map(x => ({ ...x, giris: x.basarili, cikis: x.hatali })), { anahtarlar: [['giris', 'Başarılı', 'g3'], ['cikis', 'Hatalı', 'g2']], etiket: (x) => x.gun.slice(8), yukseklik: 200, genislik: 380 })}</div></section>
        <section class="kart"><div class="kart-baslik"><h2>Son hesaplar</h2><a class="dugme kucuk hayalet" href="/sadmin/hesaplar">Tümü</a></div><ul class="liste">${p.son_hesaplar.map(h => html`<li><span class="l-orta"><strong><a href="/sadmin/hesaplar/${h.id}">${h.ad}</a></strong><small>${TUR[h.tur]} · ${goreceli(h.olusturma)}</small></span>${durumRozet(h.durum)}</li>`)}</ul></section>
        <section class="kart"><div class="kart-baslik"><h2>Sistem sağlığı</h2></div><ul class="liste saglik">
          <li><span class="l-orta">Durum</span><span class="l-sag">${p.sistem.sistem_modu === 'acik' ? rozet('Açık', 'basari') : rozet(p.sistem.sistem_modu === 'bakim' ? 'Bakımda' : 'Kapalı', 'uyari')}</span></li>
          <li><span class="l-orta">Çalışma süresi</span><span class="l-sag">${sure(p.sistem.calisma_suresi)}</span></li><li><span class="l-orta">Veritabanı</span><span class="l-sag">${boyut(p.sistem.db_boyut)} · ${p.sistem.motor}</span></li>
          <li><span class="l-orta">Bellek</span><span class="l-sag">${p.sistem.bellek} MB / ${p.sistem.sunucu_bellek} MB</span></li><li><span class="l-orta">Node.js</span><span class="l-sag">${p.sistem.node} · v${p.sistem.surum}</span></li>
          <li><span class="l-orta">Sunucu anahtarı</span><span class="l-sag">${p.sistem.anahtar_kaynagi === 'veritabani' ? rozet('Veritabanında — ortam değişkeni ekleyin', 'uyari') : rozet(p.sistem.anahtar_kaynagi === 'ortam' ? 'Ortam değişkeni' : 'Dosya', 'basari')}</span></li>
          <li><span class="l-orta">Son yedek</span><span class="l-sag" style="font-size:12px">${p.sistem.son_yedek ? p.sistem.son_yedek.replace(/^defterdar-|\.(db|json\.gz)$/g, '') : rozet('Yok', 'uyari')}</span></li></ul></section></div>
      <section class="kart bosluk-ust"><div class="kart-baslik"><h2>Son başarısız girişler</h2></div>${p.son_hatali.length ? html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Zaman</th><th>Tür</th><th>Kimlik</th><th>IP</th><th>Neden</th></tr></thead><tbody>${p.son_hatali.map(g => html`<tr><td class="mk-gizle">${tarih(g.tarih, true)}</td><td data-etiket="Tür">${g.tip === 'admin' ? rozet('Yönetim', 'tehlike') : rozet('Kullanıcı', 'notr')}</td><td class="mk-baslik">${g.kimlik}</td><td data-etiket="IP">${g.ip}</td><td data-etiket="Neden">${g.neden}</td></tr>`)}</tbody></table></div>` : html`<div class="kart-govde soluk">Kayıt yok.</div>`}</section>`);
  },

  async hesaplar(kok, p, sorgu) {
    const d = { q: '', tur: sorgu.tur || '', durum: sorgu.durum || '' };
    yerlestir(kok, html`${sayfaBaslik({ baslik: 'Hesaplar', alt: 'Kurum hesapları, kullanım ve durum', eylemler: A.rol === 'super' ? html`<button class="dugme birincil" data-eylem="yeni"><i class="fa-solid fa-plus"></i>Hesap oluştur</button>` : '' })}
      <section class="kart"><div class="filtre-cubuk"><div class="ara"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="ara" placeholder="Kurum, e-posta, sahip, il"></div>
        <select data-f="tur" style="width:auto"><option value="">Tür: tümü</option>${Object.entries(TUR).map(([k, a]) => html`<option value="${k}" ${d.tur === k ? 'selected' : ''}>${a}</option>`)}</select>
        <select data-f="durum" style="width:auto"><option value="">Durum: tümü</option><option value="aktif">Aktif</option><option value="askida">Askıda</option></select></div><div class="tablo-kap" id="tablo"></div></section>`);
    const yukle = async () => {
      const q = new URLSearchParams(); Object.entries(d).forEach(([k, v]) => v && q.set(k, v));
      const l = await api('GET', '/hesaplar?' + q);
      yerlestir($('#tablo'), l.length ? html`<table class="tablo mobil-kart"><thead><tr><th>Kurum</th><th>Tür</th><th>Sahip</th><th class="sag">Kullanıcı</th><th class="sag">Kayıt</th><th>Son aktivite</th><th>Oluşturma</th><th>Durum</th></tr></thead><tbody>
        ${l.map(h => html`<tr class="tiklanir" data-git="/sadmin/hesaplar/${h.id}"><td class="mk-baslik"><strong>${h.ad}</strong><span class="ikincil">#${h.id}${h.il ? ' · ' + h.il : ''} · ${h.eposta || ''}</span></td><td data-etiket="Tür">${TUR[h.tur]}</td><td data-etiket="Sahip">${h.sahip || '—'}</td><td class="sag" data-etiket="Kullanıcı">${h.kullanici_sayisi} / ${h.kullanici_limiti}</td><td class="sag" data-etiket="Kayıt">${sayi(h.kayit_sayisi)}</td><td data-etiket="Son aktivite">${h.son_aktivite ? goreceli(h.son_aktivite) : 'Hiç'}</td><td data-etiket="Oluşturma">${tarih(h.olusturma)}</td><td data-etiket="Durum">${durumRozet(h.durum)}</td></tr>`)}</tbody></table>` : bos({ ikon: 'fa-building', baslik: 'Hesap bulunamadı' }));
    };
    $('#ara').addEventListener('input', gecikmeli(e => { d.q = e.target.value.trim(); yukle(); }));
    degisince(kok, '[data-f]', el => { d[el.dataset.f] = el.value; yukle(); });
    kok.addEventListener('click', e => { const tr = e.target.closest('tr[data-git]'); if (tr) git(tr.dataset.git); });
    baglan(kok, { yeni: () => {
      const m = modal({ baslik: 'Hesap oluştur', icerik: html`<form id="h-form" class="form-izgara">${alan({ ad: 'ad', etiket: 'Kurum adı', zorunlu: true, tam: true })}${alan({ ad: 'tur', etiket: 'Hesap türü', tip: 'select', secenekler: Object.entries(TUR) })}${alan({ ad: 'ad_soyad', etiket: 'Sahip ad soyad', zorunlu: true })}${alan({ ad: 'eposta', etiket: 'Sahip e-posta', tip: 'email', zorunlu: true, tam: true })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="h-form">Oluştur</button>` });
      formGonder($('#h-form', m.el), async (v) => { const r = await api('POST', '/hesaplar', v); m.kapat(); gecSifre(r.gecici_sifre, v.eposta); yukle(); });
    } });
    await yukle();
  },

  async hesapDetay(kok, { id }) {
    const v = await api('GET', '/hesaplar/' + id);
    const h = v.hesap; const s = v.istatistik;
    const sup = A.rol === 'super', yaz = A.rol !== 'izleyici';
    yerlestir(kok, html`${sayfaBaslik({ baslik: h.ad, alt: html`${TUR[h.tur]} · #${h.id} · ${durumRozet(h.durum)} · oluşturma ${tarih(h.olusturma)}`, kirinti: [{ ad: 'Hesaplar', rota: '/sadmin/hesaplar' }, { ad: h.ad }],
      eylemler: html`${sup ? html`<button class="dugme" data-eylem="yedek"><i class="fa-solid fa-download"></i>Yedek</button><button class="dugme" data-eylem="icder"><i class="fa-solid fa-file-import"></i>İÇDER aktar</button><button class="dugme birincil" data-eylem="eris"><i class="fa-solid fa-right-to-bracket"></i>Destek için hesaba gir</button>` : ''}` })}
      <div class="kpi-sira">${[['Kurban org.', s.organizasyon], ['Hissedar', s.hisse], ['Modül kaydı', s.kayit], ['Cari', s.cari], ['Belge', s.belge], ['Kasa hareketi', s.finans_hareketi], ['Personel', s.personel], ['Medya', s.medya]].map(([a, x]) => kpi({ etiket: a, deger: sayi(x), tur: 'notr' }))}</div>
      <div class="izgara izgara-3-1"><div>
        <form class="kart" id="hd-form"><div class="kart-baslik"><h2>Hesap ayarları</h2></div><div class="kart-govde form-izgara">
          ${alan({ ad: 'ad', etiket: 'Kurum adı', deger: h.ad, tam: true })}${alan({ ad: 'tur', etiket: 'Hesap türü', tip: 'select', deger: h.tur, secenekler: Object.entries(TUR) })}${alan({ ad: 'durum', etiket: 'Durum', tip: 'select', deger: h.durum, secenekler: [['aktif', 'Aktif'], ['askida', 'Askıya alınmış (giriş kapalı)']] })}
          ${alan({ ad: 'plan', etiket: 'Plan', tip: 'select', deger: h.plan, secenekler: [['deneme', 'Deneme'], ['standart', 'Standart'], ['profesyonel', 'Profesyonel'], ['kurumsal', 'Kurumsal']] })}${alan({ ad: 'kullanici_limiti', etiket: 'Kullanıcı sınırı', tip: 'number', deger: h.kullanici_limiti })}
          ${alan({ ad: 'admin_notu', etiket: 'Yönetici notu (yalnızca yöneticiler görür)', tip: 'textarea', deger: h.admin_notu, tam: true })}</div>${yaz ? html`<div class="modal-altlik"><button class="dugme birincil" type="submit">Kaydet</button></div>` : ''}</form>
        <section class="kart"><div class="kart-baslik"><h2>Kullanıcılar</h2></div><div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th>Son giriş</th><th>Durum</th><th class="eylemler"></th></tr></thead><tbody>${v.kullanicilar.map(k => html`<tr><td class="mk-baslik">${k.ad_soyad}</td><td data-etiket="E-posta">${k.eposta}</td><td data-etiket="Rol">${k.rol}</td><td data-etiket="Son giriş">${k.son_giris ? goreceli(k.son_giris) : 'Hiç'}</td><td data-etiket="Durum">${k.kilit_bitis > Date.now() ? rozet('Kilitli', 'tehlike') : durumRozet(k.durum)}</td>
          <td class="eylemler">${yaz ? html`<button class="dugme kucuk" data-eylem="kIslem" data-id="${k.id}" data-i="sifre-sifirla">Şifre sıfırla</button>${k.kilit_bitis > Date.now() ? html`<button class="dugme kucuk" data-eylem="kIslem" data-id="${k.id}" data-i="kilit-ac">Kilidi aç</button>` : ''}` : ''}</td></tr>`)}</tbody></table></div></section>
        <section class="kart"><div class="kart-baslik"><h2>Son işlemler</h2></div>${v.denetim.length ? html`<ul class="liste" style="max-height:420px;overflow-y:auto">${v.denetim.map(x => html`<li><span class="l-orta"><strong>${x.islem}</strong><small>${x.kim} · ${x.ip || ''} · ${goreceli(x.tarih)}</small></span></li>`)}</ul>` : html`<div class="kart-govde soluk">İşlem yok.</div>`}</section></div>
        <aside><section class="kart"><div class="kart-baslik"><h2>İletişim</h2></div><div class="kart-govde"><dl class="tanim-listesi"><dt>E-posta</dt><dd>${h.eposta || '—'}</dd><dt>Telefon</dt><dd>${h.telefon || '—'}</dd><dt>İl</dt><dd>${h.il || '—'}</dd><dt>Vergi</dt><dd>${h.vergi_dairesi || ''} ${h.vergi_no || '—'}</dd><dt>Son aktivite</dt><dd>${h.son_aktivite ? goreceli(h.son_aktivite) : 'Hiç'}</dd><dt>Faaliyetler</dt><dd>${(h.profil.faaliyetler || []).join(', ') || '—'}</dd></dl></div></section>
          <section class="kart"><div class="kart-baslik"><div><h2>Algoritmanın menüsü</h2><p>Hesap sahibinin gördüğü sıralama</p></div></div><ul class="liste">${v.menu.gruplar.flatMap(g => g.ogeler).filter(o => o.skor < 10000).slice(0, 12).map(o => html`<li><span class="l-orta">${o.ad}</span><span class="l-sag soluk">${o.skor}</span></li>`)}</ul></section>
          ${sup ? html`<section class="kart" style="border-color:var(--tehlike)"><div class="kart-baslik"><h2 style="color:var(--tehlike)">Tehlikeli bölge</h2></div><div class="kart-govde"><p class="soluk" style="margin-bottom:12px;font-size:13px">Hesap ve tüm verileri kalıcı olarak silinir. Silmeden önce sistem yedeği otomatik alınır.</p><button class="dugme tehlike tam" data-eylem="sil">Hesabı kalıcı olarak sil</button></div></section>` : ''}</aside></div>`);
    formGonder($('#hd-form'), async (x) => { await api('PUT', '/hesaplar/' + id, x); bildir('Hesap güncellendi'); SAYFA.hesapDetay(kok, { id }); });
    baglan(kok, {
      eris: async () => { if (!await onayla({ baslik: 'Hesaba destek erişimi', mesaj: 'Hesap sahibi olarak 30 dakikalık bir oturum açılacak. Bu işlem kayıt altına alınır ve uygulamada üst bantta gösterilir.', dugme: 'Devam et' })) return; const r = await api('POST', `/hesaplar/${id}/eris`); window.open(r.url, '_blank', 'noopener'); },
      yedek: () => anaIndir(`/sadmin/hesaplar/${id}/yedek`, `hesap-${id}.json`),
      icder: () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = async () => { try { const y = JSON.parse(await i.files[0].text()); const r = await api('POST', `/hesaplar/${id}/icder-aktar`, { yedek: y }); bildir(`${r.sayilar.organizasyon} organizasyon, ${r.sayilar.kurban} kurban, ${r.sayilar.hisse} hissedar aktarıldı`, 'basari', 6000); SAYFA.hesapDetay(kok, { id }); } catch (e) { hataGoster(e); } }; i.click(); },
      kIslem: async (el) => { const r = await api('POST', `/kullanicilar/${el.dataset.id}/islem`, { islem: el.dataset.i }); if (r.gecici_sifre) gecSifre(r.gecici_sifre); else bildir('İşlem tamamlandı'); SAYFA.hesapDetay(kok, { id }); },
      sil: () => {
        const m = modal({ baslik: 'Hesabı kalıcı olarak sil', icerik: html`<p class="onay-metin">"${h.ad}" ve tüm verileri silinecek. Bu işlem geri alınamaz.</p><form id="hs-form" class="form-izgara">${alan({ ad: 'onay', etiket: `Onay için hesap adını yazın: ${h.ad}`, zorunlu: true, tam: true, ek: 'autocomplete="off"' })}${alan({ ad: 'sifre', etiket: 'Yönetici şifreniz', tip: 'password', zorunlu: true, tam: true, ek: 'autocomplete="current-password"' })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme tehlike" type="submit" form="hs-form">Kalıcı olarak sil</button>` });
        formGonder($('#hs-form', m.el), async (x) => { await api('DELETE', '/hesaplar/' + id, x); m.kapat(); bildir('Hesap silindi'); git('/sadmin/hesaplar'); });
      },
    });
  },

  async kullanicilar(kok) {
    let q = '';
    yerlestir(kok, html`${sayfaBaslik({ baslik: 'Kullanıcılar', alt: 'Tüm hesaplardaki kullanıcılar' })}<section class="kart"><div class="filtre-cubuk"><div class="ara"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="ara" placeholder="Ad, e-posta, kurum"></div></div><div class="tablo-kap" id="tablo"></div></section>`);
    const yukle = async () => {
      const l = await api('GET', '/kullanicilar' + (q ? '?q=' + encodeURIComponent(q) : ''));
      yerlestir($('#tablo'), l.length ? html`<table class="tablo mobil-kart"><thead><tr><th>Kullanıcı</th><th>Kurum</th><th>Rol</th><th>Son giriş</th><th>Durum</th><th class="eylemler"></th></tr></thead><tbody>${l.map(k => html`<tr><td class="mk-baslik"><strong>${k.ad_soyad}</strong><span class="ikincil">${k.eposta}</span></td><td data-etiket="Kurum"><a href="/sadmin/hesaplar/${k.hesap_id}">${k.hesap_ad}</a></td><td data-etiket="Rol">${k.rol}</td><td data-etiket="Son giriş">${k.son_giris ? goreceli(k.son_giris) : 'Hiç'}</td><td data-etiket="Durum">${k.kilitli ? rozet('Kilitli', 'tehlike') : durumRozet(k.durum)}</td>
        <td class="eylemler">${A.rol === 'izleyici' ? '' : html`<select data-islem="${k.id}" style="width:auto;height:30px;font-size:12.5px"><option value="">İşlem</option>${k.kilitli ? html`<option value="kilit-ac">Kilidi aç</option>` : ''}<option value="sifre-sifirla">Şifre sıfırla</option><option value="oturumlari-kapat">Oturumları kapat</option><option value="${k.durum === 'aktif' ? 'pasif' : 'aktif'}">${k.durum === 'aktif' ? 'Pasifleştir' : 'Aktifleştir'}</option></select>`}</td></tr>`)}</tbody></table>` : bos({ ikon: 'fa-users', baslik: 'Kullanıcı yok' }));
    };
    $('#ara').addEventListener('input', gecikmeli(e => { q = e.target.value.trim(); yukle(); }));
    degisince(kok, '[data-islem]', async (el) => { const islem = el.value; el.value = ''; if (!islem) return; try { const r = await api('POST', `/kullanicilar/${el.dataset.islem}/islem`, { islem }); if (r.gecici_sifre) gecSifre(r.gecici_sifre); else bildir('İşlem tamamlandı'); yukle(); } catch (e) { hataGoster(e); } });
    await yukle();
  },

  async destek(kok, p, sorgu) {
    const durum = sorgu.durum || '';
    const l = await api('GET', '/destek' + (durum ? '?durum=' + durum : ''));
    yerlestir(kok, html`${sayfaBaslik({ baslik: 'Destek talepleri' })}<nav class="sekmeler">${[['', 'Tümü'], ['acik', 'Açık'], ['yanitlandi', 'Yanıtlandı'], ['kapali', 'Kapalı']].map(([k, a]) => html`<a href="/sadmin/destek${k ? '?durum=' + k : ''}" class="${durum === k ? 'aktif' : ''}">${a}</a>`)}</nav>
      <section class="kart">${l.length ? html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Konu</th><th>Kurum</th><th>Kategori</th><th>Öncelik</th><th>Güncelleme</th><th>Durum</th></tr></thead><tbody>${l.map(t => html`<tr class="tiklanir" data-git="/sadmin/destek/${t.id}"><td class="mk-baslik"><strong>${t.konu}</strong>${!t.admin_okundu ? html` ${rozet('Yeni', 'bilgi')}` : ''}<span class="ikincil">${t.ad_soyad || ''} · ${t.mesaj_sayisi} mesaj</span></td><td data-etiket="Kurum">${t.hesap_ad}</td><td data-etiket="Kategori">${t.kategori}</td><td data-etiket="Öncelik">${rozet(t.oncelik, t.oncelik === 'acil' ? 'tehlike' : t.oncelik === 'yuksek' ? 'uyari' : 'notr')}</td><td data-etiket="Güncelleme">${goreceli(t.guncelleme)}</td><td data-etiket="Durum">${durumRozet(t.durum)}</td></tr>`)}</tbody></table></div>` : bos({ ikon: 'fa-life-ring', baslik: 'Talep yok' })}</section>`);
    kok.addEventListener('click', e => { const tr = e.target.closest('tr[data-git]'); if (tr) git(tr.dataset.git); });
  },
  async destekDetay(kok, { id }) {
    const { talep: t, mesajlar } = await api('GET', '/destek/' + id);
    yerlestir(kok, html`${sayfaBaslik({ baslik: t.konu, alt: html`<a href="/sadmin/hesaplar/${t.hesap_id}">${t.hesap_ad}</a> · ${t.ad_soyad || ''} ${t.eposta || ''} · ${durumRozet(t.durum)}`, kirinti: [{ ad: 'Destek', rota: '/sadmin/destek' }, { ad: '#' + t.id }], eylemler: A.rol !== 'izleyici' ? html`<button class="dugme" data-eylem="durum" data-d="${t.durum === 'kapali' ? 'acik' : 'kapali'}">${t.durum === 'kapali' ? 'Yeniden aç' : 'Kapat'}</button>` : '' })}
      <section class="kart"><div class="kart-govde"><div class="mesajlar">${mesajlar.map(m => html`<div class="mesaj ${m.gonderen === 'admin' ? 'ben' : ''}"><div class="m-ust"><strong>${m.gonderen === 'admin' ? 'Destek: ' + (m.gonderen_ad || '') : m.gonderen_ad}</strong><span>${tarih(m.tarih, true)}</span></div><p>${m.icerik}</p></div>`)}</div></div>
      ${A.rol !== 'izleyici' ? html`<form id="y-form" class="kart-govde" style="border-top:1px solid var(--cizgi-2)"><label class="alan"><span>Yanıt</span><textarea name="icerik" rows="4" required></textarea></label><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;align-items:center"><label class="onay-kutusu"><input type="checkbox" name="kapat"><span>Yanıtla ve kapat</span></label><button class="dugme birincil" type="submit">Yanıt gönder</button></div></form>` : ''}</section>`);
    const f = $('#y-form'); if (f) formGonder(f, async (v) => { await api('POST', `/destek/${id}/yanit`, v); bildir('Yanıt gönderildi'); SAYFA.destekDetay(kok, { id }); });
    baglan(kok, { durum: async (el) => { await api('POST', `/destek/${id}/durum`, { durum: el.dataset.d }); SAYFA.destekDetay(kok, { id }); } });
  },

  async duyurular(kok) {
    const l = await api('GET', '/duyurular');
    yerlestir(kok, html`${sayfaBaslik({ baslik: 'Duyurular', alt: 'Kullanıcıların panelinin üstünde görünen bildirimler', eylemler: A.rol !== 'izleyici' ? html`<button class="dugme birincil" data-eylem="yeni"><i class="fa-solid fa-plus"></i>Duyuru</button>` : '' })}
      <section class="kart">${l.length ? html`<ul class="liste">${l.map(d => html`<li><span class="l-ikon"><i class="fa-solid fa-bullhorn"></i></span><span class="l-orta"><strong>${d.baslik}</strong><small>${d.icerik || ''}</small><small>${d.hedef_tur === 'hepsi' ? 'Tüm hesaplar' : TUR[d.hedef_tur]} · ${d.baslangic ? tarih(d.baslangic) : 'hemen'} – ${d.bitis ? tarih(d.bitis) : 'süresiz'}</small></span>${rozet(d.seviye === 'kritik' ? 'Kritik' : d.seviye === 'uyari' ? 'Uyarı' : 'Bilgi', d.seviye === 'kritik' ? 'tehlike' : d.seviye === 'uyari' ? 'uyari' : 'bilgi')} ${d.aktif ? rozet('Yayında', 'basari') : rozet('Taslak', 'notr')}
        ${A.rol !== 'izleyici' ? html`<button class="ikon-dugme" data-eylem="duzenle" data-id="${d.id}" aria-label="Düzenle"><i class="fa-solid fa-pen"></i></button><button class="ikon-dugme" data-eylem="sil" data-id="${d.id}" aria-label="Sil"><i class="fa-solid fa-trash"></i></button>` : ''}</li>`)}</ul>` : bos({ ikon: 'fa-bullhorn', baslik: 'Duyuru yok' })}</section>`);
    const dm = (d) => { const m = modal({ baslik: d ? 'Duyuruyu düzenle' : 'Yeni duyuru', icerik: html`<form id="d-form" class="form-izgara">${alan({ ad: 'baslik', etiket: 'Başlık', zorunlu: true, deger: d && d.baslik, tam: true })}${alan({ ad: 'icerik', etiket: 'Metin', tip: 'textarea', deger: d && d.icerik, tam: true })}${alan({ ad: 'seviye', etiket: 'Seviye', tip: 'select', deger: d ? d.seviye : 'bilgi', secenekler: [['bilgi', 'Bilgi'], ['uyari', 'Uyarı'], ['kritik', 'Kritik']] })}${alan({ ad: 'hedef_tur', etiket: 'Hedef', tip: 'select', deger: d ? d.hedef_tur : 'hepsi', secenekler: [['hepsi', 'Tüm hesaplar'], ...Object.entries(TUR)] })}${alan({ ad: 'baslangic', etiket: 'Başlangıç', tip: 'date', deger: d && d.baslangic })}${alan({ ad: 'bitis', etiket: 'Bitiş', tip: 'date', deger: d && d.bitis })}${alan({ ad: 'aktif', etiket: 'Yayında', tip: 'checkbox', deger: d ? d.aktif : true })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="d-form">Kaydet</button>` });
      formGonder($('#d-form', m.el), async (v) => { if (d) await api('PUT', '/duyurular/' + d.id, v); else await api('POST', '/duyurular', v); m.kapat(); SAYFA.duyurular(kok); }); };
    baglan(kok, { yeni: () => dm(null), duzenle: (el) => dm(l.find(x => x.id === +el.dataset.id)), sil: async (el) => { if (!await onayla({ mesaj: 'Duyuru silinsin mi?', dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/duyurular/' + el.dataset.id); SAYFA.duyurular(kok); } });
  },

  async moduller(kok) {
    const v = await api('GET', '/moduller');
    const turler = Object.keys(v.turler);
    yerlestir(kok, html`${sayfaBaslik({ baslik: 'Modüller ve menü algoritması', alt: `Puan = 100 × tür uyumu + faaliyet etkisi (seçili +80 / seçilmemiş −40) + kullanım 60·(1−e^(−k/6)), k: 14 günlük yarı ömürle sönümlenen kullanım. ${v.esik} puanın altı "Diğer modüller"e iner.`, eylemler: A.rol === 'super' ? html`<button class="dugme birincil" data-eylem="kaydet">Değişiklikleri kaydet</button>` : '' })}
      <section class="kart"><div class="tablo-kap"><table class="tablo"><thead><tr><th>Modül</th><th>Grup</th><th>Faaliyet</th>${turler.map(t => html`<th class="sag">${TUR[t]}</th>`)}<th class="sag">Kullanım</th><th class="sag">Hesap</th><th class="orta">Platformda kapalı</th></tr></thead><tbody>
        ${v.moduller.map(m => html`<tr><td><i class="fa-solid ${m.ikon}" style="width:18px;color:var(--soluk)"></i> ${m.ad}</td><td>${m.grup}</td><td class="soluk">${m.faaliyet || '—'}</td>${turler.map(t => html`<td class="sag sayisal">${m.sabit ? 'sabit' : m.afinite ? Math.round(m.afinite[t] * 100) : '—'}</td>`)}<td class="sag">${sayi(m.kullanim)}</td><td class="sag">${m.hesap}</td>
          <td class="orta">${m.sabit ? '' : html`<input type="checkbox" data-kapali="${m.anahtar}" ${m.kapali ? 'checked' : ''} ${A.rol !== 'super' ? 'disabled' : ''} aria-label="${m.ad} kapalı">`}</td></tr>`)}</tbody></table></div></section>`);
    baglan(kok, { kaydet: async () => { await api('PUT', '/ayarlar', { devre_disi_moduller: $$('[data-kapali]:checked', kok).map(i => i.dataset.kapali) }); bildir('Modül ayarları kaydedildi'); } });
  },

  async sistem(kok) {
    const a = await api('GET', '/ayarlar');
    const sup = A.rol === 'super';
    yerlestir(kok, html`${sayfaBaslik({ baslik: 'Sistem ayarları' })}<form id="s-form">
      <section class="kart"><div class="kart-baslik"><div><h2>Sistem modu</h2><p>Bakım veya kapalı modda yalnızca izinli IP'ler ve yönetici destek erişimi çalışır</p></div></div><div class="kart-govde">
        <div class="sistem-mod">${[['acik', 'Açık', 'Tüm kullanıcılar erişebilir', 'fa-circle-check'], ['bakim', 'Bakım', 'Kullanıcılara bakım ekranı gösterilir', 'fa-screwdriver-wrench'], ['kapali', 'Kapalı', 'Sistem tamamen kapalı', 'fa-lock']].map(([k, ad, ac, i]) => html`<label><input type="radio" name="sistem_modu" value="${k}" ${a.sistem_modu === k ? 'checked' : ''}><span class="${k}"><i class="fa-solid ${i}"></i><strong>${ad}</strong><small>${ac}</small></span></label>`)}</div>
        <div class="form-izgara" style="margin-top:16px">${alan({ ad: 'sistem_notu', etiket: 'Kullanıcılara gösterilecek not', tip: 'textarea', deger: a.sistem_notu, tam: true })}${alan({ ad: 'izinli_ipler', etiket: 'Bakımda erişebilecek IP adresleri', deger: a.izinli_ipler, tam: true, yer: 'Virgülle ayırın', yardim: 'Örnek: 85.105.10.20, 212.1.2.3' })}</div></div></section>
      <div class="izgara izgara-2 bosluk-ust"><section class="kart"><div class="kart-baslik"><h2>Genel</h2></div><div class="kart-govde form-izgara">${alan({ ad: 'site_adi', etiket: 'Site adı', deger: a.site_adi, tam: true })}${alan({ ad: 'kayit_acik', etiket: 'Yeni hesap açılışına izin ver', tip: 'checkbox', deger: a.kayit_acik === '1', tam: true })}
          ${alan({ ad: 'oturum_suresi_saat', etiket: 'Kullanıcı oturum süresi (saat)', tip: 'number', deger: a.oturum_suresi_saat })}${alan({ ad: 'admin_oturum_dakika', etiket: 'Yönetici hareketsizlik süresi (dk)', tip: 'number', deger: a.admin_oturum_dakika })}
          ${alan({ ad: 'admin_izinli_ipler', etiket: 'Yönetim paneline yalnızca bu IP\'lerden eriş', deger: a.admin_izinli_ipler, tam: true, yer: 'Boş: her yerden', yardim: 'Kendi IP\'nizi eklemeyi unutmayın; aksi halde kaydedilmez' })}</div></section>
        <section class="kart"><div class="kart-baslik"><h2>Otomatik yedek</h2></div><div class="kart-govde form-izgara">${alan({ ad: 'oto_yedek_aktif', etiket: 'Günlük otomatik veritabanı yedeği', tip: 'checkbox', deger: a.oto_yedek_aktif === '1', tam: true })}${alan({ ad: 'oto_yedek_saat', etiket: 'Yedek saati (0-23)', tip: 'number', deger: a.oto_yedek_saat })}${alan({ ad: 'oto_yedek_sakla', etiket: 'Saklanacak yedek sayısı', tip: 'number', deger: a.oto_yedek_sakla })}</div>
          <div class="kart-baslik" style="border-top:1px solid var(--cizgi-2)"><div><h2>Ortak Cloudinary hesabı</h2><p>${a.cloudinary.ortam ? 'CLOUDINARY_URL ortam değişkeni tanımlı.' : 'Kendi Cloudinary bilgisi olmayan hesaplar bunu kullanır.'}</p></div></div><div class="kart-govde form-izgara">${alan({ ad: 'cl_cloud', etiket: 'Cloud name', deger: a.cloudinary.cloud })}${alan({ ad: 'cl_key', etiket: 'API key', deger: a.cloudinary.key })}${alan({ ad: 'cl_secret', etiket: 'API secret', tip: 'password', yer: a.cloudinary.secret_var ? 'Kayıtlı' : '', tam: true, ek: 'autocomplete="new-password"' })}</div></section></div>
      ${sup ? html`<div class="sb-eylem" style="justify-content:flex-end;margin-top:16px"><button class="dugme birincil" type="submit">Ayarları kaydet</button></div>` : ''}</form>`);
    formGonder($('#s-form'), async (v) => {
      const g = { ...v, cloudinary: { cloud: v.cl_cloud, key: v.cl_key, secret: v.cl_secret } };
      if (v.sistem_modu !== 'acik' && a.sistem_modu === 'acik' && !await onayla({ baslik: 'Sistem modu değişiyor', mesaj: `Sistem "${v.sistem_modu === 'bakim' ? 'bakım' : 'kapalı'}" moduna alınacak. Açık oturumlardaki kullanıcılar işlem yapamaz hale gelir.`, dugme: 'Devam', tehlike: true })) return;
      await api('PUT', '/ayarlar', g); bildir('Ayarlar kaydedildi'); modBant(); SAYFA.sistem(kok);
    });
  },

  async guvenlik(kok, p, sorgu) {
    const sekme = sorgu.sekme || 'girisler';
    const ust = html`${sayfaBaslik({ baslik: 'Güvenlik merkezi', alt: 'Giriş denemeleri, aktif oturumlar ve IP engelleri' })}<nav class="sekmeler">${[['girisler', 'Giriş kayıtları'], ['oturumlar', 'Aktif oturumlar'], ['ip', 'IP engelleri']].map(([k, a]) => html`<a href="/sadmin/guvenlik?sekme=${k}" class="${sekme === k ? 'aktif' : ''}">${a}</a>`)}</nav>`;
    if (sekme === 'girisler') {
      const d = { q: '', basarili: '', tip: '' };
      yerlestir(kok, html`${ust}<section class="kart"><div class="filtre-cubuk"><div class="ara"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="ara" placeholder="Kimlik veya IP"></div><select data-f="tip" style="width:auto"><option value="">Tür: tümü</option><option value="admin">Yönetim</option><option value="kullanici">Kullanıcı</option></select><select data-f="basarili" style="width:auto"><option value="">Sonuç: tümü</option><option value="0">Başarısız</option><option value="1">Başarılı</option></select></div><div class="tablo-kap" id="tablo"></div></section>`);
      const yukle = async () => { const q = new URLSearchParams(); Object.entries(d).forEach(([k, v]) => v && q.set(k, v)); const l = await api('GET', '/guvenlik/girisler?' + q);
        yerlestir($('#tablo'), html`<table class="tablo mobil-kart"><thead><tr><th>Zaman</th><th>Tür</th><th>Kimlik</th><th>IP</th><th>Sonuç</th><th>Cihaz</th><th class="eylemler"></th></tr></thead><tbody>${l.map(g => html`<tr><td class="mk-gizle">${tarih(g.tarih, true)}</td><td data-etiket="Tür">${g.tip === 'admin' ? 'Yönetim' : 'Kullanıcı'}</td><td class="mk-baslik">${g.kimlik}</td><td data-etiket="IP">${g.ip}</td><td data-etiket="Sonuç">${g.basarili ? rozet('Başarılı', 'basari') : rozet(g.neden || 'Başarısız', 'tehlike')}</td><td data-etiket="Cihaz" class="soluk" style="max-width:260px;font-size:12px">${(g.tarayici || '').slice(0, 70)}</td><td class="eylemler">${!g.basarili && A.rol !== 'izleyici' ? html`<button class="dugme kucuk" data-eylem="engelle" data-ip="${g.ip}">IP engelle</button>` : ''}</td></tr>`)}</tbody></table>`); };
      $('#ara').addEventListener('input', gecikmeli(e => { d.q = e.target.value.trim(); yukle(); })); degisince(kok, '[data-f]', el => { d[el.dataset.f] = el.value; yukle(); });
      baglan(kok, { engelle: (el) => ipEngelModal(el.dataset.ip, yukle) });
      return yukle();
    }
    if (sekme === 'oturumlar') {
      const l = await api('GET', '/guvenlik/oturumlar');
      yerlestir(kok, html`${ust}<section class="kart"><div class="kart-baslik"><div><h2>${l.length} aktif oturum</h2></div>${A.rol === 'super' ? html`<button class="dugme kucuk tehlike" data-eylem="hepsi">Tüm kullanıcı oturumlarını kapat</button>` : ''}</div><div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Kim</th><th>Kurum</th><th>Tür</th><th>IP</th><th>Son erişim</th><th class="eylemler"></th></tr></thead><tbody>${l.map(o => html`<tr><td class="mk-baslik">${o.kim || '—'}${o.taklit_admin_id ? html` ${rozet('Destek erişimi', 'uyari')}` : ''}</td><td data-etiket="Kurum">${o.hesap_ad || '—'}</td><td data-etiket="Tür">${o.tip === 'admin' ? rozet('Yönetim', 'muhur') : 'Kullanıcı'}</td><td data-etiket="IP">${o.ip}</td><td data-etiket="Son erişim">${goreceli(o.son_erisim)}</td><td class="eylemler">${A.rol !== 'izleyici' ? html`<button class="dugme kucuk" data-eylem="kapat" data-id="${o.id}">Sonlandır</button>` : ''}</td></tr>`)}</tbody></table></div></section>`);
      baglan(kok, { kapat: async (el) => { await api('POST', '/guvenlik/oturum-kapat', { id: el.dataset.id }); bildir('Oturum sonlandırıldı'); SAYFA.guvenlik(kok, p, sorgu); }, hepsi: async () => { if (!await onayla({ mesaj: 'Tüm kullanıcılar sistemden çıkarılacak. Emin misiniz?', dugme: 'Hepsini kapat', tehlike: true })) return; const r = await api('POST', '/guvenlik/tum-oturumlar'); bildir(`${r.kapatilan} oturum kapatıldı`); SAYFA.guvenlik(kok, p, sorgu); } });
      return;
    }
    const l = await api('GET', '/guvenlik/ip');
    yerlestir(kok, html`${ust}<section class="kart"><div class="kart-baslik"><div><h2>Engelli IP adresleri</h2><p>Yönetim paneline art arda hatalı giriş yapan IP'ler 24 saat otomatik engellenir</p></div>${A.rol !== 'izleyici' ? html`<button class="dugme kucuk birincil" data-eylem="yeni"><i class="fa-solid fa-plus"></i>IP engelle</button>` : ''}</div>
      ${l.length ? html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>IP</th><th>Neden</th><th>Bitiş</th><th>Eklenme</th><th class="eylemler"></th></tr></thead><tbody>${l.map(x => html`<tr><td class="mk-baslik">${x.ip}</td><td data-etiket="Neden">${x.neden}</td><td data-etiket="Bitiş">${x.bitis ? tarih(new Date(x.bitis).toISOString(), true) : 'Süresiz'}</td><td data-etiket="Eklenme">${tarih(x.olusturma, true)}</td><td class="eylemler">${A.rol !== 'izleyici' ? html`<button class="dugme kucuk" data-eylem="kaldir" data-ip="${x.ip}">Kaldır</button>` : ''}</td></tr>`)}</tbody></table></div>` : html`<div class="kart-govde soluk">Engelli IP yok.</div>`}</section>`);
    baglan(kok, { yeni: () => ipEngelModal('', () => SAYFA.guvenlik(kok, p, sorgu)), kaldir: async (el) => { await api('DELETE', '/guvenlik/ip/' + encodeURIComponent(el.dataset.ip)); SAYFA.guvenlik(kok, p, sorgu); } });
  },

  async denetim(kok) {
    let q = '', admin = '';
    yerlestir(kok, html`${sayfaBaslik({ baslik: 'Denetim kaydı', alt: 'Platformdaki tüm önemli işlemler — değiştirilemez' })}<section class="kart"><div class="filtre-cubuk"><div class="ara"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="ara" placeholder="İşlem, kişi, IP, kurum"></div><label class="onay-kutusu"><input type="checkbox" id="adm"><span>Yalnızca yönetici işlemleri</span></label><button class="dugme kucuk" data-eylem="excel"><i class="fa-solid fa-file-excel"></i>Excel</button></div><div class="tablo-kap" id="tablo"></div></section>`);
    let son = [];
    const yukle = async () => { const p = new URLSearchParams(); if (q) p.set('q', q); if (admin) p.set('admin', '1'); son = await api('GET', '/denetim?' + p);
      yerlestir($('#tablo'), html`<table class="tablo mobil-kart"><thead><tr><th>Zaman</th><th>Kim</th><th>Kurum</th><th>İşlem</th><th>Hedef</th><th>IP</th></tr></thead><tbody>${son.map(x => html`<tr><td class="mk-gizle">${tarih(x.tarih, true)}</td><td data-etiket="Kim">${x.kim}</td><td data-etiket="Kurum">${x.hesap_ad ? html`<a href="/sadmin/hesaplar/${x.hesap_id}">${x.hesap_ad}</a>` : '—'}</td><td class="mk-baslik">${x.islem}</td><td data-etiket="Hedef" class="soluk">${x.hedef || ''}</td><td data-etiket="IP" class="soluk">${x.ip || ''}</td></tr>`)}</tbody></table>`); };
    $('#ara').addEventListener('input', gecikmeli(e => { q = e.target.value.trim(); yukle(); })); $('#adm').addEventListener('change', e => { admin = e.target.checked ? '1' : ''; yukle(); });
    baglan(kok, { excel: () => { csvIndir('denetim.csv', ['Zaman', 'Kim', 'Kurum', 'İşlem', 'Hedef', 'IP', 'Detay'], son.map(x => [x.tarih, x.kim, x.hesap_ad || '', x.islem, x.hedef || '', x.ip || '', x.detay || ''])); } });
    await yukle();
  },

  async yedekler(kok) {
    const v = await api('GET', '/yedekler');
    yerlestir(kok, html`${sayfaBaslik({ baslik: 'Sistem yedekleri', alt: 'Tam veritabanı yedekleri sunucuda saklanır', eylemler: html`<button class="dugme" data-eylem="indirTam"><i class="fa-solid fa-download"></i>Şu anki veritabanını indir</button><button class="dugme birincil" data-eylem="al"><i class="fa-solid fa-plus"></i>Yedek al</button>` })}
      ${v.bekleyen_geri_yukleme ? html`<div class="duyuru duyuru-uyari"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>Bekleyen geri yükleme var</strong><p>Hazırlanan yedek sunucu yeniden başlatıldığında devreye girecek.</p></div></div>` : ''}
      <section class="kart">${v.yedekler.length ? html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Dosya</th><th>Tarih</th><th class="sag">Boyut</th><th class="eylemler"></th></tr></thead><tbody>${v.yedekler.map(y => html`<tr><td class="mk-baslik">${y.ad}</td><td data-etiket="Tarih">${tarih(y.tarih, true)}</td><td class="sag" data-etiket="Boyut">${boyut(y.boyut)}</td><td class="eylemler"><button class="dugme kucuk" data-eylem="indir" data-ad="${y.ad}">İndir</button><button class="ikon-dugme" data-eylem="sil" data-ad="${y.ad}" aria-label="Sil"><i class="fa-solid fa-trash"></i></button></td></tr>`)}</tbody></table></div>` : bos({ ikon: 'fa-database', baslik: 'Henüz yedek yok' })}</section>
      <section class="kart bosluk-ust" style="border-color:var(--tehlike)"><div class="kart-baslik"><div><h2 style="color:var(--tehlike)">Veritabanını geri yükle</h2><p>${v.motor === 'postgresql' ? 'PostgreSQL: seçilen .json.gz tam yedeği hemen yüklenir ve mevcut tüm verinin yerine geçer.' : 'Seçilen .db dosyası, sunucu yeniden başlatıldığında mevcut veritabanının yerine geçer.'} Öncesinde otomatik yedek alınır.</p></div><label class="dugme tehlike"><i class="fa-solid fa-upload"></i>Dosya seç<input type="file" accept="${v.motor === 'postgresql' ? '.gz' : '.db'}" hidden id="gy"></label></div></section>`);
    $('#gy').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const m = modal({ baslik: 'Geri yüklemeyi onayla', icerik: html`<p class="onay-metin">"${f.name}" (${boyut(f.size)}) hazırlanacak.</p><form id="gy-form">${alan({ ad: 'sifre', etiket: 'Yönetici şifreniz', tip: 'password', zorunlu: true, ek: 'autocomplete="current-password"' })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme tehlike" type="submit" form="gy-form">Hazırla</button>` });
      formGonder($('#gy-form', m.el), async (v2) => { const r = await api('POST', '/yedekler/geri-yukle', await f.arrayBuffer(), { basliklar: { 'X-Yonetici-Sifre': v2.sifre, 'Content-Type': 'application/octet-stream' } }); m.kapat(); bildir(r.mesaj, 'uyari', 8000); SAYFA.yedekler(kok); });
    });
    baglan(kok, {
      al: async () => { const r = await api('POST', '/yedekler'); bildir('Yedek alındı: ' + r.ad); SAYFA.yedekler(kok); },
      indirTam: () => anaIndir('/sadmin/yedekler/indir', v.motor === 'postgresql' ? 'defterdar.json.gz' : 'defterdar.db'),
      indir: (el) => anaIndir('/sadmin/yedekler/' + encodeURIComponent(el.dataset.ad), el.dataset.ad),
      sil: async (el) => { if (!await onayla({ mesaj: 'Yedek dosyası silinsin mi?', dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/yedekler/' + encodeURIComponent(el.dataset.ad)); SAYFA.yedekler(kok); },
    });
  },

  async yoneticiler(kok) {
    if (A.rol !== 'super') return yerlestir(kok, bos({ ikon: 'fa-lock', baslik: 'Bu sayfa yalnızca süper yöneticilere açık' }));
    const l = await api('GET', '/adminler');
    yerlestir(kok, html`${sayfaBaslik({ baslik: 'Yöneticiler', alt: 'Yönetim paneline erişebilen kişiler ve rolleri', eylemler: html`<button class="dugme birincil" data-eylem="yeni"><i class="fa-solid fa-user-plus"></i>Yönetici ekle</button>` })}
      <section class="kart"><div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Kullanıcı adı</th><th>Ad soyad</th><th>Rol</th><th>2FA</th><th>Son giriş</th><th>Durum</th><th class="eylemler"></th></tr></thead><tbody>${l.map(a => html`<tr><td class="mk-baslik">${a.kullanici_adi}${a.id === A.id ? html` ${rozet('Siz', 'bilgi')}` : ''}${a.varsayilan_sifre ? html` ${rozet('Varsayılan şifre', 'tehlike')}` : ''}</td><td data-etiket="Ad">${a.ad_soyad || '—'}</td><td data-etiket="Rol">${ROL[a.rol]}</td><td data-etiket="2FA">${a.totp_aktif ? rozet('Açık', 'basari') : rozet('Kapalı', 'uyari')}</td><td data-etiket="Son giriş">${a.son_giris ? goreceli(a.son_giris) + ' · ' + (a.son_ip || '') : 'Hiç'}</td><td data-etiket="Durum">${durumRozet(a.durum)}</td>
        <td class="eylemler"><button class="dugme kucuk" data-eylem="duzenle" data-id="${a.id}">Düzenle</button>${a.id !== A.id ? html`<button class="ikon-dugme" data-eylem="sil" data-id="${a.id}" aria-label="Sil"><i class="fa-solid fa-trash"></i></button>` : ''}</td></tr>`)}</tbody></table></div></section>
      <section class="kart bosluk-ust"><div class="kart-govde soluk" style="font-size:13px"><strong style="color:var(--metin)">Roller:</strong> Süper yönetici her şeyi yapabilir. Destek; hesap, kullanıcı, destek talebi ve duyuruları yönetir ama hesap silemez, sisteme erişemez. İzleyici yalnızca görüntüler.</div></section>`);
    const am = (a) => { const m = modal({ baslik: a ? a.kullanici_adi : 'Yönetici ekle', icerik: html`<form id="a-form" class="form-izgara">${a ? '' : alan({ ad: 'kullanici_adi', etiket: 'Kullanıcı adı', zorunlu: true, ek: 'autocomplete="off" autocapitalize="none"' })}${alan({ ad: 'ad_soyad', etiket: 'Ad soyad', deger: a && a.ad_soyad })}${a ? '' : alan({ ad: 'eposta', etiket: 'E-posta', tip: 'email' })}
      ${alan({ ad: 'rol', etiket: 'Rol', tip: 'select', deger: a ? a.rol : 'destek', secenekler: Object.entries(ROL) })}${a ? alan({ ad: 'durum', etiket: 'Durum', tip: 'select', deger: a.durum, secenekler: [['aktif', 'Aktif'], ['pasif', 'Pasif']] }) : ''}
      ${alan({ ad: 'sifre', etiket: a ? 'Yeni şifre (değiştirmek için)' : 'Şifre', tip: 'password', zorunlu: !a, tam: true, yardim: 'En az 10 karakter, harf ve rakam', ek: 'autocomplete="new-password"' })}${a && a.totp_aktif ? alan({ ad: 'totp_sifirla', etiket: 'İki adımlı doğrulamayı sıfırla', tip: 'checkbox', tam: true }) : ''}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="a-form">Kaydet</button>` });
      formGonder($('#a-form', m.el), async (v) => { if (a) await api('PUT', '/adminler/' + a.id, v); else await api('POST', '/adminler', v); m.kapat(); bildir('Kaydedildi'); SAYFA.yoneticiler(kok); }); };
    baglan(kok, { yeni: () => am(null), duzenle: (el) => am(l.find(x => x.id === +el.dataset.id)), sil: async (el) => { if (!await onayla({ mesaj: 'Yönetici silinsin mi?', dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/adminler/' + el.dataset.id); SAYFA.yoneticiler(kok); } });
  },

  async hesabim(kok) {
    yerlestir(kok, html`${sayfaBaslik({ baslik: 'Hesabım ve iki adımlı doğrulama', alt: A.kullanici_adi })}<div class="izgara izgara-2">
      <form class="kart" id="sf-form"><div class="kart-baslik"><h2>Şifre değiştir</h2></div><div class="kart-govde form-izgara">${alan({ ad: 'mevcut', etiket: 'Mevcut şifre', tip: 'password', zorunlu: true, tam: true, ek: 'autocomplete="current-password"' })}${alan({ ad: 'yeni', etiket: 'Yeni şifre', tip: 'password', zorunlu: true, ek: 'autocomplete="new-password"', yardim: 'En az 10 karakter, harf ve rakam' })}${alan({ ad: 'yeni2', etiket: 'Yeni şifre (tekrar)', tip: 'password', zorunlu: true, ek: 'autocomplete="new-password"' })}</div><div class="modal-altlik"><button class="dugme birincil" type="submit">Şifreyi değiştir</button></div></form>
      <section class="kart"><div class="kart-baslik"><div><h2>İki adımlı doğrulama</h2><p>Google Authenticator, Microsoft Authenticator veya benzeri bir uygulamayla</p></div>${A.totp_aktif ? rozet('Açık', 'basari') : rozet('Kapalı', 'uyari')}</div><div class="kart-govde" id="tfa">
        ${A.totp_aktif ? html`<p class="soluk" style="margin-bottom:14px">Girişlerde şifrenize ek olarak 6 haneli kod istenir.</p><button class="dugme tehlike" data-eylem="kapat">Devre dışı bırak</button>` : html`<p class="soluk" style="margin-bottom:14px">Şifreniz ele geçirilse bile panelinize kimse giremez. Önerilir.</p><button class="dugme birincil" data-eylem="baslat">Kurulumu başlat</button>`}</div></section></div>`);
    formGonder($('#sf-form'), async (v, f) => { if (v.yeni !== v.yeni2) throw new Error('Yeni şifreler eşleşmiyor'); await api('POST', '/sifre-degistir', v); bildir('Şifre değiştirildi. Diğer oturumlarınız kapatıldı.'); f.reset(); });
    baglan(kok, {
      baslat: async () => {
        const r = await api('POST', '/2fa/baslat');
        yerlestir($('#tfa'), html`<ol style="padding-left:18px;line-height:1.8;margin:0 0 12px"><li>Doğrulama uygulamasında "Kurulum anahtarı gir" seçeneğini açın.</li><li>Hesap adına <strong>Defterdar</strong> yazın ve aşağıdaki anahtarı girin (zaman tabanlı).</li><li>Uygulamanın ürettiği 6 haneli kodu girin.</li></ol>
          <div class="gizli-anahtar">${r.sir.match(/.{1,4}/g).join(' ')}</div><p style="margin:8px 0 14px;font-size:12.5px"><a href="${r.uri}">Telefonda: doğrulama uygulamasında aç</a></p>
          <form id="tf-form" style="display:flex;gap:8px"><input name="kod" inputmode="numeric" maxlength="6" placeholder="6 haneli kod" required autocomplete="one-time-code" style="max-width:180px"><button class="dugme birincil" type="submit">Doğrula ve aç</button></form>`);
        formGonder($('#tf-form'), async (v) => { await api('POST', '/2fa/onayla', v); A.totp_aktif = 1; bildir('İki adımlı doğrulama açıldı'); SAYFA.hesabim(kok); });
      },
      kapat: () => { const m = modal({ baslik: 'İki adımlı doğrulamayı kapat', icerik: html`<form id="tk-form">${alan({ ad: 'sifre', etiket: 'Yönetici şifreniz', tip: 'password', zorunlu: true })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme tehlike" type="submit" form="tk-form">Kapat</button>` });
        formGonder($('#tk-form', m.el), async (v) => { await api('POST', '/2fa/kapat', v); A.totp_aktif = 0; m.kapat(); bildir('İki adımlı doğrulama kapatıldı', 'uyari'); SAYFA.hesabim(kok); }); },
    });
  },
};

function ipEngelModal(ip, sonra) {
  const m = modal({ baslik: 'IP engelle', icerik: html`<form id="ip-form" class="form-izgara">${alan({ ad: 'ip', etiket: 'IP adresi', zorunlu: true, deger: ip })}${alan({ ad: 'saat', etiket: 'Süre (saat, 0 = süresiz)', tip: 'number', deger: 24 })}${alan({ ad: 'neden', etiket: 'Neden', tam: true })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme tehlike" type="submit" form="ip-form">Engelle</button>` });
  formGonder($('#ip-form', m.el), async (v) => { await api('POST', '/guvenlik/ip', v); m.kapat(); bildir('IP engellendi'); sonra(); });
}
function gecSifre(s, eposta) {
  const m = modal({ baslik: 'Geçici şifre', icerik: html`<p class="onay-metin">${eposta ? eposta + ' için ' : ''}geçici şifre oluşturuldu. Kişiye güvenli bir kanaldan iletin; bir daha gösterilmeyecek.</p><input value="${s}" readonly style="font-family:monospace;font-size:16px;text-align:center">`, altlik: html`<button class="dugme" data-kopya>Kopyala</button><button class="dugme birincil" data-kapat>Tamam</button>` });
  $('[data-kopya]', m.el).addEventListener('click', () => { navigator.clipboard.writeText(s); bildir('Kopyalandı'); });
}
async function anaIndir(yol, ad) { const r = await anaApi('GET', yol, null, { dosya: true }); const b = await r.blob(); dosyaKaydet(b, ad); }
function csvIndir(ad, basliklar, satirlar) {
  const k = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  dosyaKaydet(new Blob(['﻿' + [basliklar, ...satirlar].map(r => r.map(k).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), ad);
}

isle();
