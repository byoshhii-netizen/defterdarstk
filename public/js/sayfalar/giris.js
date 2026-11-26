// Giriş ve hesap açma (hesap türü seçimli)
import { D, api, html, yerlestir, $, $$, alan, formVerisi } from '../cekirdek.js';

const TUR_IKON = { stk: 'fa-hand-holding-heart', sirket: 'fa-building', muhasebe: 'fa-calculator', esnaf: 'fa-store' };

function sag() {
  return html`<aside class="giris-sag">
    <h2>Defteriniz düzenli, kararlarınız sağlam.</h2>
    <p>Bağıştan faturaya, kurban hissesinden personel maaşına kadar kurumunuzun bütün hesabı tek bir defterde. Hesap türünüze göre ekranlar kendini düzenler; kullandıkça menünüz size uyar.</p>
    <div class="defter-ornek">
      <div><span>Kurban hisseleri tahsilatı</span><span>412.000,00 ₺</span></div>
      <div><span>Bağışlar (Kasım)</span><span>86.450,00 ₺</span></div>
      <div><span>Yardım dağıtımı</span><span>−54.200,00 ₺</span></div>
      <div class="toplam"><span>Net kasa</span><span>444.250,00 ₺</span></div>
    </div>
  </aside>`;
}
function iskelet(icerik, genis = false) {
  return html`<div class="giris-sayfa"><section class="giris-sol"><a class="marka" href="/giris"><img class="marka-logo" src="/img/defterdar.png" alt="Defterdar" width="40" height="40"><span class="marka-ad">Defterdar</span></a>
    <div class="giris-form-kap"><div class="giris-form ${genis ? 'genis' : ''}">${icerik}</div></div>
    <p class="soluk" style="font-size:12px">Verileriniz şifreli oturumlarla korunur ve yalnızca kurumunuzun kullanıcılarına açıktır.</p></section>${sag()}</div>`;
}
function hata(kok, mesaj) {
  let k = $('.hata-kutu', kok);
  if (!mesaj) { if (k) k.remove(); return; }
  if (!k) { k = document.createElement('div'); k.className = 'hata-kutu'; k.setAttribute('role', 'alert'); $('form', kok).prepend(k); }
  yerlestir(k, html`<i class="fa-solid fa-circle-exclamation"></i><span>${mesaj}</span>`);
}
function sifreGoster(kok) {
  $$('.goster', kok).forEach(b => b.addEventListener('click', () => {
    const i = b.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password';
    b.querySelector('i').className = 'fa-regular ' + (i.type === 'password' ? 'fa-eye' : 'fa-eye-slash');
  }));
}
function sifreAlani(ad, etiket, otomatik) {
  return html`<label class="alan"><span>${etiket}</span><div class="sifre-kap"><input type="password" name="${ad}" required autocomplete="${otomatik}"><button type="button" class="ikon-dugme goster" aria-label="Şifreyi göster"><i class="fa-regular fa-eye"></i></button></div></label>`;
}

export async function giris(kok, sorgu) {
  let genel = {}; try { genel = await api('GET', '/hesap/genel'); } catch (e) { /* */ }
  document.title = 'Giriş — Defterdar';
  yerlestir(kok, iskelet(html`<h1>Hesabınıza girin</h1><p>Kurumunuzun defterine kaldığınız yerden devam edin.</p>
    ${genel.sistem_modu && genel.sistem_modu !== 'acik' ? html`<div class="duyuru duyuru-uyari"><i class="fa-solid fa-screwdriver-wrench"></i><div><strong>Sistem bakımda</strong><p>${genel.sistem_notu || 'Kısa süre sonra tekrar deneyin.'}</p></div></div>` : ''}
    <form id="giris-form" novalidate>
      ${alan({ ad: 'eposta', etiket: 'E-posta', tip: 'email', zorunlu: true, ek: 'autocomplete="username" autofocus' })}
      ${sifreAlani('sifre', 'Şifre', 'current-password')}
      <div style="display:flex;justify-content:space-between;align-items:center;margin:-4px 0 16px">${alan({ ad: 'beni_hatirla', etiket: 'Bu cihazda oturumu açık tut', tip: 'checkbox' })}</div>
      <button class="dugme birincil tam" type="submit">Giriş yap</button>
    </form>
    ${genel.kayit_acik !== false ? html`<p class="giris-alt">Kurumunuz için hesap yok mu? <a href="/kayit">Ücretsiz hesap açın</a></p>` : ''}
    <p class="giris-alt" style="margin-top:8px;font-size:12.5px">Şifrenizi unuttuysanız kurumunuzdaki yöneticiden sıfırlamasını isteyin.</p>`));
  sifreGoster(kok);
  const f = $('#giris-form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); hata(kok, null);
    const v = formVerisi(f);
    if (!v.eposta || !v.sifre) return hata(kok, 'E-posta ve şifrenizi girin.');
    const b = f.querySelector('[type=submit]'); b.disabled = true; b.classList.add('yukleniyor');
    try {
      await api('POST', '/hesap/giris', v, { sessiz: true });
      const donus = sorgu.donus && sorgu.donus.startsWith('/') && !sorgu.donus.startsWith('//') ? sorgu.donus : '/panel';
      location.href = donus;
    } catch (er) { hata(kok, er.message); b.disabled = false; b.classList.remove('yukleniyor'); }
  });
}

export async function kayit(kok) {
  let genel; try { genel = await api('GET', '/hesap/genel'); } catch (e) { genel = { hesap_turleri: {} }; }
  document.title = 'Hesap aç — Defterdar';
  if (genel.kayit_acik === false) {
    yerlestir(kok, iskelet(html`<h1>Yeni hesap açılışı kapalı</h1><p>Şu anda yeni kurum kaydı alınmıyor. Hesabınız varsa giriş yapabilirsiniz.</p><a class="dugme birincil tam" href="/giris">Giriş sayfasına git</a>`));
    return;
  }
  const T = genel.hesap_turleri;
  const durum = { adim: 1, tur: null, faaliyetler: [], bilgi: {} };

  const ciz = () => {
    const adimlar = html`<div class="adimlar" aria-label="Adım ${durum.adim}/3">${[1, 2, 3].map(i => html`<span class="${i <= durum.adim ? 'tamam' : ''}"></span>`)}</div>`;
    let ic;
    if (durum.adim === 1) {
      ic = html`${adimlar}<h1>Kurumunuzu tanıyalım</h1><p>Seçiminize göre ekranlarınız ve menünüz öncelik sırasıyla düzenlenir. Daha sonra ayarlardan değiştirebilirsiniz.</p>
        <form id="adim-form"><div class="secim-kartlari" role="radiogroup" aria-label="Hesap türü">
          ${Object.entries(T).map(([k, t]) => html`<label class="secim-karti"><input type="radio" name="tur" value="${k}" ${durum.tur === k ? 'checked' : ''} required><span class="sk-ic"><i class="fa-solid ${TUR_IKON[k]}"></i><span><strong>${t.ad}</strong><small>${t.aciklama}</small></span></span></label>`)}
        </div><button class="dugme birincil tam" type="submit" style="margin-top:20px">Devam</button></form>`;
    } else if (durum.adim === 2) {
      const t = T[durum.tur];
      const secili = durum.faaliyetler.length ? durum.faaliyetler : t.varsayilan;
      ic = html`${adimlar}<h1>Neleri yönetiyorsunuz?</h1><p>İşaretledikleriniz menünün en üstüne yerleşir; diğerleri "Diğer modüller" altında her zaman erişilebilir kalır.</p>
        <form id="adim-form"><div class="etiket-sec">${t.faaliyetler.map(([k, ad]) => html`<label><input type="checkbox" name="faaliyetler" value="${k}" data-dizi ${secili.includes(k) ? 'checked' : ''}><span>${ad}</span></label>`)}</div>
        ${durum.tur !== 'stk' ? html`<div style="margin-top:16px">${alan({ ad: 'kdv_mukellefi', etiket: 'KDV mükellefiyim', tip: 'checkbox', deger: durum.bilgi.kdv_mukellefi !== false })}</div>` : ''}
        <div style="display:flex;gap:8px;margin-top:22px"><button type="button" class="dugme" data-geri>Geri</button><button class="dugme birincil" style="flex:1" type="submit">Devam</button></div></form>`;
    } else {
      const b = durum.bilgi;
      ic = html`${adimlar}<h1>Hesap bilgileri</h1><p>Son adım. Hesabın sahibi olarak tüm yetkilere sahip olacaksınız.</p>
        <form id="adim-form" novalidate><div class="form-izgara">
          ${alan({ ad: 'hesap_ad', etiket: durum.tur === 'stk' ? 'Dernek / vakıf adı' : 'Firma / büro adı', zorunlu: true, deger: b.hesap_ad, tam: true, ek: 'autocomplete="organization"' })}
          ${alan({ ad: 'ad_soyad', etiket: 'Adınız soyadınız', zorunlu: true, deger: b.ad_soyad, ek: 'autocomplete="name"' })}
          ${alan({ ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: b.telefon, ek: 'autocomplete="tel"' })}
          ${alan({ ad: 'eposta', etiket: 'E-posta', tip: 'email', zorunlu: true, deger: b.eposta, tam: true, ek: 'autocomplete="email"' })}
          <div class="tam">${sifreAlani('sifre', 'Şifre', 'new-password')}<div class="sifre-gucu"><i></i></div><small class="soluk">En az 8 karakter, harf ve rakam içermeli.</small></div>
          ${alan({ ad: 'il', etiket: 'İl', deger: b.il })}
          ${alan({ ad: 'olcek', etiket: 'Çalışan / gönüllü sayısı', tip: 'select', deger: b.olcek, secenekler: [['', 'Seçin'], ['1-5', '1-5'], ['6-20', '6-20'], ['21-100', '21-100'], ['100+', '100+']] })}
          <label class="onay-kutusu tam"><input type="checkbox" name="sozlesme" required><span>Kullanım koşullarını ve KVKK aydınlatma metnini okudum, kabul ediyorum.</span></label>
        </div>
        <div style="display:flex;gap:8px;margin-top:18px"><button type="button" class="dugme" data-geri>Geri</button><button class="dugme birincil" style="flex:1" type="submit">Hesabı oluştur</button></div></form>`;
    }
    yerlestir(kok, iskelet(html`${ic}<p class="giris-alt">Zaten hesabınız var mı? <a href="/giris">Giriş yapın</a></p>`, durum.adim !== 3 || true));
    sifreGoster(kok);
    const f = $('#adim-form');
    const geri = $('[data-geri]', f); if (geri) geri.addEventListener('click', () => { Object.assign(durum.bilgi, formVerisi(f)); durum.adim--; ciz(); });
    const s = $('input[name=sifre]', f);
    if (s) s.addEventListener('input', () => {
      const v = s.value; let p = 0; if (v.length >= 8) p++; if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(v) && /\d/.test(v)) p++; if (v.length >= 12) p++; if (/[^A-Za-z0-9]/.test(v)) p++;
      const i = $('.sifre-gucu i', f); i.style.width = (p * 25) + '%'; i.style.background = ['var(--tehlike)', 'var(--tehlike)', 'var(--uyari)', 'var(--basari)', 'var(--basari)'][p];
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); hata(kok, null);
      const v = formVerisi(f);
      if (durum.adim === 1) { if (!v.tur) return hata(kok, 'Bir hesap türü seçin.'); if (v.tur !== durum.tur) durum.faaliyetler = []; durum.tur = v.tur; durum.adim = 2; return ciz(); }
      if (durum.adim === 2) { durum.faaliyetler = v.faaliyetler || []; if (!durum.faaliyetler.length) return hata(kok, 'En az bir alan seçin.'); durum.bilgi.kdv_mukellefi = v.kdv_mukellefi; durum.adim = 3; return ciz(); }
      Object.assign(durum.bilgi, v);
      if (!v.hesap_ad || !v.ad_soyad || !v.eposta || !v.sifre) return hata(kok, 'Zorunlu alanları doldurun.');
      if (!v.sozlesme) return hata(kok, 'Devam etmek için koşulları onaylayın.');
      const b = f.querySelector('[type=submit]'); b.disabled = true; b.classList.add('yukleniyor');
      try {
        await api('POST', '/hesap/kayit', { ...durum.bilgi, tur: durum.tur, faaliyetler: durum.faaliyetler }, { sessiz: true });
        location.href = '/panel?hosgeldin=1';
      } catch (er) { hata(kok, er.message); b.disabled = false; b.classList.remove('yukleniyor'); }
    });
  };
  ciz();
}
