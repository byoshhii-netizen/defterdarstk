// Defterdar uygulama kabuğu: Türkçe rotalar, menü, oturum, komut paleti
import { D, api, html, yerlestir, $, $$, kac, bildir, hataGoster, baglan, formGonder, alan, modal, gecikmeli, goreceli } from './cekirdek.js';

const SAYFA_MODULLERI = {
  panel: () => import('./sayfalar/panel.js'),
  kurban: () => import('./sayfalar/kurban.js'),
  kayit: () => import('./sayfalar/kayit.js'),
  finans: () => import('./sayfalar/finans.js'),
  rapor: () => import('./sayfalar/rapor.js'),
  personel: () => import('./sayfalar/personel.js'),
  sistem: () => import('./sayfalar/sistem.js'),
  giris: () => import('./sayfalar/giris.js'),
};

// [desen, modül, fonksiyon, menü anahtarı]
const ROTALAR = [
  ['/panel', 'panel', 'panel', 'panel'],
  ['/kurban', 'kurban', 'organizasyonlar', 'kurban'],
  ['/kurban/:org', 'kurban', 'organizasyon', 'kurban'],
  ['/kurban/:org/hissedarlar', 'kurban', 'hissedarlar', 'kurban'],
  ['/kurban/:org/videolar', 'kurban', 'videolar', 'kurban'],
  ['/kurban/:org/rapor', 'kurban', 'rapor', 'kurban'],
  ['/kurban/:org/kurban/:id', 'kurban', 'kurbanDetay', 'kurban'],
  ['/cariler', 'finans', 'cariler', 'cariler'],
  ['/cariler/:id', 'finans', 'cariDetay', 'cariler'],
  ['/faturalar', 'finans', 'faturalar', 'faturalar'],
  ['/faturalar/yeni', 'finans', 'belgeDuzenle', 'faturalar'],
  ['/faturalar/:id', 'finans', 'belgeDetay', 'faturalar'],
  ['/faturalar/:id/duzenle', 'finans', 'belgeDuzenle', 'faturalar'],
  ['/teklifler', 'finans', 'teklifler', 'teklifler'],
  ['/teklifler/yeni', 'finans', 'belgeDuzenle', 'teklifler'],
  ['/teklifler/:id', 'finans', 'belgeDetay', 'teklifler'],
  ['/teklifler/:id/duzenle', 'finans', 'belgeDuzenle', 'teklifler'],
  ['/urunler', 'finans', 'urunler', 'urunler'],
  ['/urunler/:id', 'finans', 'urunDetay', 'urunler'],
  ['/stok', 'finans', 'stok', 'stok'],
  ['/kasa-banka', 'finans', 'kasaBanka', 'kasa_banka'],
  ['/kasa-banka/:id', 'finans', 'kasaBanka', 'kasa_banka'],
  ['/cek-senet', 'finans', 'cekSenet', 'cek_senet'],
  ['/butce', 'finans', 'butce', 'butce'],
  ['/raporlar', 'rapor', 'merkez', 'raporlar'],
  ['/raporlar/:rapor', 'rapor', 'rapor', 'raporlar'],
  ['/personel', 'personel', 'liste', 'personel'],
  ['/personel/:id', 'personel', 'detay', 'personel'],
  ['/sms', 'sistem', 'sms', 'sms'],
  ['/medya', 'sistem', 'medya', 'medya'],
  ['/destek', 'sistem', 'destek', 'destek'],
  ['/destek/:id', 'sistem', 'destekDetay', 'destek'],
  ['/cop-kutusu', 'sistem', 'cop', 'cop'],
  ['/yedekleme', 'sistem', 'yedek', 'yedek'],
  ['/islem-gecmisi', 'sistem', 'denetim', 'denetim'],
  ['/ayarlar', 'sistem', 'ayarlar', 'ayarlar'],
  ['/ayarlar/:sekme', 'sistem', 'ayarlar', 'ayarlar'],
  ['/profil', 'sistem', 'profil', null],
];
const ACIK_ROTALAR = { '/giris': 'giris', '/kayit': 'kayit' };

function rotaEslestir(yol) {
  // Genel kayıt motoru rotaları oturum tanımından üretilir
  const liste = [...ROTALAR];
  if (D.tanimlar) {
    for (const [anahtar, m] of Object.entries(D.tanimlar.moduller)) {
      if (!m.genel) continue;
      liste.push([m.rota, 'kayit', 'liste', anahtar, anahtar], [m.rota + '/yeni', 'kayit', 'form', anahtar, anahtar], [m.rota + '/:id', 'kayit', 'detay', anahtar, anahtar], [m.rota + '/:id/duzenle', 'kayit', 'form', anahtar, anahtar]);
    }
  }
  for (const [desen, mod, fn, menu, modul] of liste) {
    const anahtarlar = [];
    const re = new RegExp('^' + desen.replace(/:([a-z]+)/g, (_, a) => { anahtarlar.push(a); return '([^/]+)'; }) + '/?$');
    const m = re.exec(yol);
    if (m) {
      const params = {}; anahtarlar.forEach((a, i) => { params[a] = decodeURIComponent(m[i + 1]); });
      if (modul) params.modul = modul;
      if (params.id === 'yeni' && fn === 'detay') continue;
      return { mod, fn, menu, params };
    }
  }
  return null;
}

// ─── Gezinme ───
export function git(url, { degistir = false } = {}) {
  if (degistir) history.replaceState({}, '', url); else history.pushState({}, '', url);
  isle();
}
window.addEventListener('popstate', () => isle());
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/sadmin')) return;
  e.preventDefault();
  document.body.classList.remove('menu-acik');
  if (url.pathname + url.search !== location.pathname + location.search) git(url.pathname + url.search + url.hash);
});
D.git = git;

let sonModul = null;
async function isle() {
  D.sayfaTemizle.forEach(f => { try { f(); } catch (e) { /* */ } }); D.sayfaTemizle = [];
  const yol = location.pathname === '/' ? (D.oturum ? '/panel' : '/giris') : location.pathname;
  const sorgu = Object.fromEntries(new URLSearchParams(location.search));
  if (ACIK_ROTALAR[yol]) {
    if (D.oturum) return git('/panel', { degistir: true });
    const m = await SAYFA_MODULLERI.giris();
    return m[ACIK_ROTALAR[yol]]($('#uygulama'), sorgu);
  }
  if (!D.oturum) { const ok = await oturumYukle(); if (!ok) return git('/giris' + (yol !== '/panel' ? '?donus=' + encodeURIComponent(yol + location.search) : ''), { degistir: true }); }
  if (yol !== location.pathname) history.replaceState({}, '', yol);
  if (!$('.iskelet')) kabukCiz();
  const r = rotaEslestir(yol);
  const kok = $('#icerik');
  menuIsaretle(r ? r.menu : null, yol);
  window.scrollTo(0, 0);
  if (!r) { yerlestir(kok, html`<div class="kart"><div class="bos-durum"><i class="fa-solid fa-compass"></i><h3>Sayfa bulunamadı</h3><p>Aradığınız sayfa taşınmış veya kaldırılmış olabilir.</p><a class="dugme birincil" href="/panel">Genel bakışa dön</a></div></div>`); return; }
  yerlestir(kok, html`<div class="yukleniyor-kap"><span class="donen"></span><span>Yükleniyor</span></div>`);
  try {
    const m = await SAYFA_MODULLERI[r.mod]();
    const temizle = await m[r.fn](kok, r.params, sorgu);
    if (typeof temizle === 'function') D.sayfaTemizle.push(temizle);
    if (r.menu && r.menu !== sonModul) { sonModul = r.menu; api('POST', '/hesap/kullanim', { modul: r.menu }).catch(() => {}); }
  } catch (e) {
    if (e.durum === 403 && e.veri && e.veri.pin_gerekli) return;
    yerlestir(kok, html`<div class="kart"><div class="bos-durum"><i class="fa-solid fa-triangle-exclamation"></i><h3>Sayfa açılamadı</h3><p>${e.message}</p><a class="dugme" href="${location.pathname}">Tekrar dene</a></div></div>`);
    if (!e.durum) console.error(e);
  }
}

async function oturumYukle() {
  try {
    const o = await api('GET', '/hesap/oturum', null, { sessiz: true });
    D.oturum = o; D.csrf = o.csrf; D.tanimlar = o.tanimlar;
    document.title = o.hesap.ad + ' — ' + (o.site_adi || 'Defterdar');
    return true;
  } catch (e) {
    if (e.durum === 503 && e.veri) { bakimEkrani(e.veri); throw e; }
    return false;
  }
}
export async function menuYenile() {
  try { D.oturum.menu = await api('GET', '/hesap/menu'); menuCiz(); menuIsaretle(D.aktifMenu, location.pathname); } catch (e) { /* */ }
}
D.menuYenile = menuYenile;
D.yetkisiz = () => { D.oturum = null; D.csrf = null; git('/giris?donus=' + encodeURIComponent(location.pathname), { degistir: true }); };
D.bakim = (v) => bakimEkrani(v);

function bakimEkrani(v) {
  yerlestir($('#uygulama'), html`<div class="bakim-ekran"><div class="kart"><i class="fa-solid ${v.sistem_modu === 'bakim' ? 'fa-screwdriver-wrench' : 'fa-lock'} buyuk"></i>
    <h1>${v.sistem_modu === 'bakim' ? 'Sistem bakımda' : 'Sistem geçici olarak kapalı'}</h1>
    <p class="soluk">${v.sistem_notu || 'Kısa süre içinde tekrar hizmet vereceğiz. Verileriniz güvende.'}</p>
    <p class="soluk" style="margin-top:16px;font-size:12.5px">Sayfa 30 saniyede bir otomatik olarak yenilenir.</p></div></div>`);
  D.oturum = null; $('.iskelet') && $('.iskelet').remove();
  setTimeout(() => location.reload(), 30000);
}

// ─── Kabuk ───
function bas(ad) { return String(ad || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toLocaleUpperCase('tr-TR'); }
const ROL_AD = { sahip: 'Hesap sahibi', yonetici: 'Yönetici', muhasebe: 'Muhasebe', personel: 'Personel', izleyici: 'Salt okunur' };

function kabukCiz() {
  const o = D.oturum;
  const tema = localStorage.getItem('dd-tema') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'koyu' : 'acik');
  document.documentElement.dataset.tema = tema;
  const kapaliDuyurular = JSON.parse(sessionStorage.getItem('dd-duyuru') || '[]');
  yerlestir($('#uygulama'), html`
    ${o.taklit ? html`<div class="taklit-bant"><i class="fa-solid fa-user-shield"></i> Bu hesaba yönetici olarak destek amaçlı erişiyorsunuz. Yaptığınız işlemler kayıt altına alınır. <a href="#" data-eylem="cikis">Erişimi sonlandır</a></div>` : ''}
    <div class="iskelet">
      <aside class="kenar" id="kenar" aria-label="Ana menü">
        <a class="marka" href="/panel"><span class="muhur"><b>D</b></span><span class="marka-ad">Defterdar<small>${o.hesap.ad}</small></span></a>
        <nav class="menu" id="menu"></nav>
        <div class="kenar-alt"><span>${D.tanimlar.hesapTurleri[o.hesap.tur] ? D.tanimlar.hesapTurleri[o.hesap.tur].kisa : ''} hesabı</span><a href="/ayarlar/moduller">Menüyü düzenle</a></div>
      </aside>
      <div class="ana">
        <header class="ust-bar">
          <button class="ikon-dugme menu-ac" data-eylem="menuAc" aria-label="Menüyü aç"><i class="fa-solid fa-bars"></i></button>
          <div class="arama-kutu"><button class="arama-tetik" data-eylem="palet" aria-label="Ara"><i class="fa-solid fa-magnifying-glass"></i><span class="arama-metin">Kayıt, cari, fatura, bağışçı ara veya sayfaya git</span><kbd>Ctrl K</kbd></button></div>
          <div class="ust-sag">
            <a class="dugme birincil kucuk yeni-kisayol" href="#" data-eylem="hizliEkle"><i class="fa-solid fa-plus"></i><span>Yeni</span></a>
            <div class="konum-goreli"><button class="ikon-dugme" data-eylem="bildirimler" aria-label="Bildirimler"><i class="fa-regular fa-bell"></i><span class="nokta gizli" id="bildirim-sayac"></span></button></div>
            <button class="ikon-dugme" data-eylem="tema" aria-label="Tema değiştir"><i class="fa-solid ${tema === 'koyu' ? 'fa-sun' : 'fa-moon'}"></i></button>
            <div class="konum-goreli"><button class="kullanici-dugme" data-eylem="kullaniciMenu" aria-haspopup="true"><span class="avatar">${bas(o.kullanici.ad_soyad)}</span><span class="kd-ad">${o.kullanici.ad_soyad}<small>${ROL_AD[o.kullanici.rol]}</small></span></button></div>
          </div>
        </header>
        <main class="icerik">
          ${(o.duyurular || []).filter(d => !kapaliDuyurular.includes(d.id)).map(d => html`<div class="duyuru duyuru-${d.seviye}" data-duyuru="${d.id}"><i class="fa-solid ${d.seviye === 'kritik' ? 'fa-circle-exclamation' : d.seviye === 'uyari' ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i><div><strong>${d.baslik}</strong>${d.icerik ? html`<p>${d.icerik}</p>` : ''}</div><button class="ikon-dugme" data-eylem="duyuruKapat" data-id="${d.id}" aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button></div>`)}
          <div id="icerik"></div>
        </main>
      </div>
    </div>
    <nav class="alt-gezinme" id="alt-gezinme" aria-label="Hızlı gezinme"></nav>`);
  menuCiz();
  baglan(document.body, kabukEylemleri);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); paletAc(); }
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('.modal-arka')) { e.preventDefault(); paletAc(); }
  });
  bildirimleriYukle();
  setInterval(bildirimleriYukle, 5 * 60000);
}

function menuCiz() {
  const m = D.oturum.menu;
  yerlestir($('#menu'), html`${m.gruplar.map(g => html`<div class="menu-grup"><h3>${g.ad}</h3>${g.ogeler.map(o => html`<a href="${o.rota}" data-menu="${o.anahtar}"><i class="fa-solid ${o.ikon}"></i><span>${o.ad}</span>${o.sabitlendi ? html`<i class="fa-solid fa-thumbtack sabit-isaret" title="Sabitlendi"></i>` : ''}</a>`)}</div>`)}
    ${m.diger.length ? html`<details class="menu-diger menu-grup"><summary><i class="fa-solid fa-chevron-right"></i>Diğer modüller (${m.diger.length})</summary>${m.diger.map(o => html`<a href="${o.rota}" data-menu="${o.anahtar}"><i class="fa-solid ${o.ikon}"></i><span>${o.ad}</span></a>`)}</details>` : ''}`);
  // Mobil alt gezinme: algoritmanın en üst 3 modülü + menü
  const ust = m.gruplar.flatMap(g => g.ogeler).filter(o => !['panel', 'ayarlar', 'destek', 'cop', 'yedek', 'denetim'].includes(o.anahtar)).sort((a, b) => b.skor - a.skor).slice(0, 3);
  yerlestir($('#alt-gezinme'), html`<a href="/panel" data-menu="panel"><i class="fa-solid fa-gauge-high"></i>Genel</a>${ust.map(o => html`<a href="${o.rota}" data-menu="${o.anahtar}"><i class="fa-solid ${o.ikon}"></i>${o.ad.split(' ')[0]}</a>`)}<button data-eylem="menuAc"><i class="fa-solid fa-bars"></i>Menü</button>`);
}
function menuIsaretle(anahtar, yol) {
  D.aktifMenu = anahtar;
  $$('[data-menu]').forEach(a => a.classList.toggle('aktif', a.dataset.menu === anahtar));
  const aktif = $(`#menu [data-menu="${anahtar}"]`);
  if (aktif && aktif.closest('details')) aktif.closest('details').open = true;
}

async function bildirimleriYukle() {
  try {
    const b = await api('GET', '/bildirimler');
    D.bildirimler = b;
    const s = $('#bildirim-sayac'); if (!s) return;
    s.textContent = b.length > 9 ? '9+' : String(b.length); s.classList.toggle('gizli', !b.length);
  } catch (e) { /* */ }
}

function acilirKapat() { $$('.acilir').forEach(x => x.remove()); }
document.addEventListener('click', (e) => { if (!e.target.closest('.acilir') && !e.target.closest('[data-eylem="kullaniciMenu"],[data-eylem="bildirimler"],[data-eylem="hizliEkle"]')) acilirKapat(); });

function acilir(tetik, sablon) {
  const var_ = tetik.parentElement.querySelector('.acilir');
  acilirKapat(); if (var_) return;
  const d = document.createElement('div'); d.className = 'acilir'; yerlestir(d, sablon);
  tetik.parentElement.appendChild(d);
  d.addEventListener('click', (e) => { if (e.target.closest('a')) acilirKapat(); });
  return d;
}

const kabukEylemleri = {
  menuAc: () => document.body.classList.toggle('menu-acik'),
  palet: () => paletAc(),
  tema: (el) => {
    const yeni = document.documentElement.dataset.tema === 'koyu' ? 'acik' : 'koyu';
    document.documentElement.dataset.tema = yeni; localStorage.setItem('dd-tema', yeni);
    el.querySelector('i').className = 'fa-solid ' + (yeni === 'koyu' ? 'fa-sun' : 'fa-moon');
  },
  duyuruKapat: (el) => {
    const l = JSON.parse(sessionStorage.getItem('dd-duyuru') || '[]'); l.push(+el.dataset.id);
    sessionStorage.setItem('dd-duyuru', JSON.stringify(l)); el.closest('.duyuru').remove();
  },
  kullaniciMenu: (el) => {
    const k = D.oturum.kullanici;
    acilir(el, html`<div class="acilir-baslik"><strong style="color:var(--metin)">${k.ad_soyad}</strong><br>${k.eposta}</div><hr>
      <a href="/profil"><i class="fa-solid fa-user"></i>Profil ve güvenlik</a><a href="/ayarlar"><i class="fa-solid fa-gear"></i>Ayarlar</a>
      <a href="/ayarlar/moduller"><i class="fa-solid fa-table-cells-large"></i>Modüller ve menü</a><a href="/destek"><i class="fa-solid fa-life-ring"></i>Destek</a><hr>
      <button data-eylem="cikis"><i class="fa-solid fa-right-from-bracket"></i>Çıkış yap</button>`);
  },
  bildirimler: (el) => {
    const b = D.bildirimler || [];
    acilir(el, html`<div class="acilir-baslik">Bildirimler</div>${b.length ? b.map(x => html`<a href="${x.rota}"><i class="fa-solid ${x.seviye === 'kritik' ? 'fa-circle-exclamation' : x.seviye === 'uyari' ? 'fa-triangle-exclamation' : 'fa-circle-info'}" style="color:var(--${x.seviye === 'kritik' ? 'tehlike' : x.seviye === 'uyari' ? 'uyari' : 'bilgi'})"></i><span>${x.baslik}${x.detay ? html`<br><small class="soluk">${x.detay}</small>` : ''}</span></a>`) : html`<div class="acilir-baslik" style="padding:18px 10px">Şu an dikkat gerektiren bir şey yok.</div>`}`);
    const d = el.parentElement.querySelector('.acilir'); if (d) d.style.minWidth = '320px';
  },
  hizliEkle: (el) => {
    const m = D.oturum.menu, ana = new Set(m.gruplar.flatMap(g => g.ogeler.map(o => o.anahtar)));
    const sec = [
      ['kurban', '/kurban', 'fa-cow', 'Kurban hissedarı'], ['bagislar', '/bagislar/yeni', 'fa-hand-holding-heart', 'Bağış'], ['faturalar', '/faturalar/yeni?tip=satis_fatura', 'fa-file-invoice', 'Satış faturası'],
      ['faturalar', '/faturalar/yeni?tip=alis_fatura', 'fa-file-import', 'Alış faturası'], ['teklifler', '/teklifler/yeni?tip=teklif', 'fa-file-signature', 'Teklif'], ['cariler', '/cariler?yeni=1', 'fa-address-book', 'Cari hesap'],
      ['kasa_banka', '/kasa-banka?islem=giris', 'fa-arrow-down', 'Gelir kaydı'], ['kasa_banka', '/kasa-banka?islem=cikis', 'fa-arrow-up', 'Gider kaydı'], ['masraflar', '/masraflar/yeni', 'fa-receipt', 'Masraf fişi'],
      ['uyeler', '/uyeler/yeni', 'fa-id-badge', 'Üye'], ['yardimlar', '/yardimlar/yeni', 'fa-box-open', 'Yardım'], ['mukellefler', '/mukellefler/yeni', 'fa-building-user', 'Mükellef'], ['gorevler', '/gorevler/yeni', 'fa-list-check', 'Görev'],
    ].filter(s => ana.has(s[0])).slice(0, 9);
    acilir(el, html`<div class="acilir-baslik">Hızlı oluştur</div>${sec.map(s => html`<a href="${s[1]}"><i class="fa-solid ${s[2]}"></i>${s[3]}</a>`)}`);
  },
  cikis: async () => { try { await api('POST', '/hesap/cikis'); } catch (e) { /* */ } D.oturum = null; D.csrf = null; location.href = '/giris'; },
};

// ─── Komut paleti ───
function paletAc() {
  if ($('.palet')) return;
  const p = document.createElement('div'); p.className = 'palet';
  yerlestir(p, html`<div class="palet-kutu" role="dialog" aria-label="Ara"><div class="palet-giris"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Ne arıyorsunuz?" autocomplete="off" aria-label="Arama"></div><div class="palet-sonuc"></div><div class="palet-ipucu"><span>↑↓ gezin</span><span>Enter aç</span><span>Esc kapat</span></div></div>`);
  document.body.appendChild(p);
  const inp = $('input', p), sonuc = $('.palet-sonuc', p);
  let secili = 0;
  const kapat = () => p.remove();
  const sayfalar = () => [...D.oturum.menu.gruplar.flatMap(g => g.ogeler), ...D.oturum.menu.diger].map(o => ({ tur: 'Sayfa', baslik: o.ad, rota: o.rota, ikon: o.ikon }))
    .concat([{ tur: 'Rapor', baslik: 'Kâr-zarar raporu', rota: '/raporlar/kar-zarar', ikon: 'fa-chart-line' }, { tur: 'Rapor', baslik: 'KDV raporu', rota: '/raporlar/kdv', ikon: 'fa-percent' }, { tur: 'Rapor', baslik: 'Nakit akışı', rota: '/raporlar/nakit-akisi', ikon: 'fa-water' }, { tur: 'Sayfa', baslik: 'Profil ve güvenlik', rota: '/profil', ikon: 'fa-user' }]);
  const ciz = (liste) => {
    secili = 0;
    const gruplar = {}; liste.forEach(x => { (gruplar[x.tur] = gruplar[x.tur] || []).push(x); });
    yerlestir(sonuc, liste.length ? html`${Object.entries(gruplar).map(([t, l]) => html`<h4>${t}</h4>${l.map(x => html`<a href="${x.rota}"><i class="fa-solid ${x.ikon || 'fa-file-lines'}"></i><span>${x.baslik}</span><small>${x.tur}</small></a>`)}`)}` : html`<div class="acilir-baslik" style="padding:20px">Sonuç bulunamadı</div>`);
    isaretle();
  };
  const isaretle = () => { const a = $$('a', sonuc); a.forEach((x, i) => x.classList.toggle('secili', i === secili)); if (a[secili]) a[secili].scrollIntoView({ block: 'nearest' }); };
  const ara = gecikmeli(async (q) => {
    const s = sayfalar().filter(x => x.baslik.toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR')));
    if (q.length < 2) return ciz(s.slice(0, 12));
    let k = []; try { k = await api('GET', '/ara?q=' + encodeURIComponent(q)); } catch (e) { /* */ }
    ciz([...s.slice(0, 5), ...k]);
  }, 200);
  ciz(sayfalar().slice(0, 12));
  inp.addEventListener('input', () => ara(inp.value.trim()));
  p.addEventListener('keydown', (e) => {
    const a = $$('a', sonuc);
    if (e.key === 'Escape') kapat();
    else if (e.key === 'ArrowDown') { e.preventDefault(); secili = Math.min(a.length - 1, secili + 1); isaretle(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); secili = Math.max(0, secili - 1); isaretle(); }
    else if (e.key === 'Enter' && a[secili]) { e.preventDefault(); kapat(); git(a[secili].getAttribute('href')); }
  });
  p.addEventListener('click', (e) => { if (e.target === p) kapat(); if (e.target.closest('a')) kapat(); });
  setTimeout(() => inp.focus(), 10);
}

// PIN gerektiren personel sayfaları için ortak istek
export async function pinIste() {
  return new Promise((coz) => {
    let deger = null;
    const m = modal({ baslik: 'Personel PIN kodu', icerik: html`<p class="onay-metin">Personel bilgileri ek bir PIN ile korunuyor.</p><form id="pin-form">${alan({ ad: 'pin', etiket: 'PIN kodu', tip: 'password', zorunlu: true, ek: 'inputmode="numeric" autocomplete="off" maxlength="8"' })}</form>`,
      altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="pin-form">Devam</button>`, kapaninca: () => coz(deger) });
    $('#pin-form', m.el).addEventListener('submit', (e) => { e.preventDefault(); deger = new FormData(e.target).get('pin'); sessionStorage.setItem('dd-pin', deger); m.kapat(); });
  });
}
D.pinIste = pinIste;

isle().catch(e => { if (e.durum !== 503) hataGoster(e); });
