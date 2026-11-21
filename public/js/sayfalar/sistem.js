// Sistem sayfaları: SMS, medya, destek, çöp kutusu, yedek, işlem geçmişi, ayarlar, profil
import { D, api, html, yerlestir, $, $$, para, sayi, tarih, goreceli, bildir, hataGoster, baglan, degisince, gecikmeli, formGonder, formVerisi, modal, onayla, sayfaBaslik, kpi, bos, rozet, durumRozet, durumAd, telLink, indir, alan, bugun, boyut, gorselKucult, dosyaOku, ilerleme } from '../cekirdek.js';
import { secenekler, onbellekTemizle } from './ortak.js';

const izleyici = () => D.oturum.kullanici.rol === 'izleyici';
const yonetici = () => ['sahip', 'yonetici'].includes(D.oturum.kullanici.rol);

// ─── SMS ───
export async function sms(kok, p, sorgu) {
  const sekme = sorgu.sekme || 'gonder';
  const ust = html`${sayfaBaslik({ baslik: 'Toplu SMS', alt: 'Hissedar, bağışçı, üye ve carilere Netgsm üzerinden toplu SMS. Kişiye özel alanlar: {ad}, {kurban_no}, {hisse_no}.' })}
    <nav class="sekmeler">${[['gonder', 'Gönder'], ['sablonlar', 'Şablonlar'], ['gecmis', 'Gönderim geçmişi']].map(([k, a]) => html`<a href="/sms?sekme=${k}" class="${sekme === k ? 'aktif' : ''}">${a}</a>`)}</nav>`;
  if (sekme === 'sablonlar') {
    const l = await api('GET', '/sms/sablonlar');
    yerlestir(kok, html`${ust}<section class="kart"><div class="kart-baslik"><h2>Mesaj şablonları</h2>${izleyici() ? '' : html`<button class="dugme birincil kucuk" data-eylem="yeni"><i class="fa-solid fa-plus"></i>Şablon</button>`}</div>
      ${l.length ? html`<ul class="liste">${l.map(s => html`<li><span class="l-orta"><strong>${s.ad}</strong><small>${s.icerik}</small></span>${izleyici() ? '' : html`<button class="ikon-dugme" data-eylem="duzenle" data-id="${s.id}" aria-label="Düzenle"><i class="fa-solid fa-pen"></i></button><button class="ikon-dugme" data-eylem="sil" data-id="${s.id}" aria-label="Sil"><i class="fa-solid fa-trash"></i></button>`}</li>`)}</ul>` : bos({ ikon: 'fa-message', baslik: 'Şablon yok', metin: 'Sık gönderdiğiniz mesajları şablon olarak kaydedin.' })}</section>`);
    const sablonModal = (s) => { const m = modal({ baslik: s ? 'Şablonu düzenle' : 'Yeni şablon', icerik: html`<form id="sb-form">${alan({ ad: 'ad', etiket: 'Şablon adı', zorunlu: true, deger: s && s.ad })}<div style="height:12px"></div>${alan({ ad: 'icerik', etiket: 'Mesaj', tip: 'textarea', zorunlu: true, deger: s && s.icerik, yardim: 'Örnek: Sayın {ad}, {kurban_no} numaralı kurbanınız kesilmiştir. Allah kabul etsin.' })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="sb-form">Kaydet</button>` });
      formGonder($('#sb-form', m.el), async (v) => { if (s) await api('PUT', '/sms/sablonlar/' + s.id, v); else await api('POST', '/sms/sablonlar', v); bildir('Şablon kaydedildi'); m.kapat(); sms(kok, p, sorgu); }); };
    baglan(kok, { yeni: () => sablonModal(null), duzenle: (el) => sablonModal(l.find(s => s.id === +el.dataset.id)), sil: async (el) => { if (!await onayla({ mesaj: 'Şablon silinsin mi?', dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/sms/sablonlar/' + el.dataset.id); sms(kok, p, sorgu); } });
    return;
  }
  if (sekme === 'gecmis') {
    const l = await api('GET', '/sms/loglar');
    yerlestir(kok, html`${ust}<section class="kart"><div class="kart-baslik"><div><h2>Gönderim geçmişi</h2><p>${l.filter(x => x.durum === 'gonderildi').length} başarılı, ${l.filter(x => x.durum !== 'gonderildi').length} hatalı</p></div>${yonetici() && l.length ? html`<button class="dugme kucuk" data-eylem="temizle">Geçmişi temizle</button>` : ''}</div>
      ${l.length ? html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Tarih</th><th>Alıcı</th><th>Telefon</th><th>Mesaj</th><th>Durum</th></tr></thead><tbody>${l.map(x => html`<tr><td class="mk-gizle">${tarih(x.tarih, true)}</td><td class="mk-baslik">${x.alici_adi || '—'}</td><td data-etiket="Telefon">${x.telefon}</td><td data-etiket="Mesaj" style="max-width:380px">${x.mesaj}</td><td data-etiket="Durum">${x.durum === 'gonderildi' ? rozet('Gönderildi', 'basari') : rozet('Hata ' + (x.kod || ''), 'tehlike')}</td></tr>`)}</tbody></table></div>` : bos({ ikon: 'fa-clock-rotate-left', baslik: 'Henüz gönderim yok' })}</section>`);
    baglan(kok, { temizle: async () => { if (!await onayla({ mesaj: 'Tüm SMS geçmişi silinsin mi?', dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/sms/loglar'); sms(kok, p, sorgu); } });
    return;
  }
  const [orglar, sablonlar, ayar] = await Promise.all([api('GET', '/kurban/organizasyonlar').catch(() => []), api('GET', '/sms/sablonlar'), api('GET', '/ayarlar/hesap')]);
  const kaynaklar = [['kurban', 'Kurban hissedarları'], ['bagis', 'Bağışçılar'], ['uye', 'Üyeler'], ['gonullu', 'Gönüllüler'], ['ihtiyac', 'İhtiyaç sahipleri'], ['cari', 'Cari hesaplar'], ['personel', 'Personel']];
  const d = { kaynak: sorgu.kaynak || (orglar.length ? 'kurban' : 'bagis'), org: sorgu.org || (orglar[0] || {}).id, alicilar: [], secili: new Set(), q: '' };
  yerlestir(kok, html`${ust}${!ayar.sms.kullanici || !ayar.sms.sifre_var ? html`<div class="duyuru duyuru-uyari"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>SMS hesabı bağlı değil</strong><p>Gönderim için Netgsm kullanıcı bilgilerinizi <a href="/ayarlar/entegrasyonlar">Ayarlar > Entegrasyonlar</a> bölümüne girin.</p></div></div>` : ''}
    <div class="izgara izgara-3-1"><section class="kart"><div class="kart-baslik"><div><h2>Alıcılar</h2><p id="alici-sayi"></p></div></div>
      <div class="filtre-cubuk"><select id="kaynak" style="width:auto">${kaynaklar.map(([k, a]) => html`<option value="${k}" ${d.kaynak === k ? 'selected' : ''}>${a}</option>`)}</select>
        <select id="org" style="width:auto" class="${d.kaynak === 'kurban' ? '' : 'gizli'}">${orglar.map(o => html`<option value="${o.id}" ${String(d.org) === String(o.id) ? 'selected' : ''}>${o.ad}</option>`)}</select>
        <div class="ara"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="ara" placeholder="Ara"></div><button class="dugme kucuk" data-eylem="tumu">Tümünü seç</button><button class="dugme kucuk" data-eylem="hicbiri">Temizle</button></div>
      <div class="tablo-kap" id="alicilar" style="max-height:520px;overflow-y:auto"></div></section>
      <aside><section class="kart"><div class="kart-baslik"><h2>Mesaj</h2></div><div class="kart-govde">
        ${sablonlar.length ? html`<label class="alan" style="margin-bottom:12px"><span>Şablon</span><select id="sablon"><option value="">Şablon seçin</option>${sablonlar.map(s => html`<option value="${s.id}">${s.ad}</option>`)}</select></label>` : ''}
        <label class="alan"><span>Mesaj metni</span><textarea id="mesaj" rows="7" maxlength="900" placeholder="Sayın {ad}, ..."></textarea><small id="karakter">0 karakter · 1 SMS</small></label>
        <p class="soluk" style="font-size:12px;margin:8px 0 14px">Gönderici başlığı: <strong>${ayar.sms.baslik || 'tanımlı değil'}</strong></p>
        <button class="dugme birincil tam" data-eylem="gonder" ${izleyici() ? 'disabled' : ''}><i class="fa-solid fa-paper-plane"></i>Seçili kişilere gönder</button></div></section></aside></div>`);
  const ciz = () => {
    const q = d.q.toLocaleLowerCase('tr-TR');
    const l = q ? d.alicilar.filter(a => (a.ad + ' ' + a.telefon).toLocaleLowerCase('tr-TR').includes(q)) : d.alicilar;
    $('#alici-sayi').textContent = `${d.secili.size} / ${d.alicilar.length} kişi seçili`;
    yerlestir($('#alicilar'), l.length ? html`<table class="tablo"><tbody>${l.map((a, i) => html`<tr><td class="dar"><input type="checkbox" data-a="${d.alicilar.indexOf(a)}" ${d.secili.has(d.alicilar.indexOf(a)) ? 'checked' : ''} aria-label="Seç"></td><td>${a.ad}${a.kurban_no ? html`<span class="ikincil">Kurban ${a.kurban_no} / ${a.hisse_no} · ${durumAd(a.odeme_durumu)}</span>` : a.durum ? html`<span class="ikincil">${a.durum}</span>` : ''}</td><td class="sag">${a.telefon}</td></tr>`)}</tbody></table>` : bos({ ikon: 'fa-users', baslik: 'Telefonu kayıtlı kişi yok' }));
  };
  const yukle = async () => { const q = new URLSearchParams({ kaynak: d.kaynak }); if (d.kaynak === 'kurban') q.set('org', d.org || 0); d.alicilar = await api('GET', '/sms/alicilar?' + q); d.secili = new Set(d.alicilar.map((_, i) => i)); ciz(); };
  const sayac = () => { const n = $('#mesaj').value.length; $('#karakter').textContent = `${n} karakter · ${n <= 155 ? 1 : Math.ceil(n / 150)} SMS`; };
  $('#kaynak').addEventListener('change', e => { d.kaynak = e.target.value; $('#org').classList.toggle('gizli', d.kaynak !== 'kurban'); yukle(); });
  $('#org').addEventListener('change', e => { d.org = e.target.value; yukle(); });
  $('#ara').addEventListener('input', gecikmeli(e => { d.q = e.target.value.trim(); ciz(); }, 150));
  $('#mesaj').addEventListener('input', sayac);
  const sb = $('#sablon'); if (sb) sb.addEventListener('change', () => { const s = sablonlar.find(x => x.id === +sb.value); if (s) { $('#mesaj').value = s.icerik; sayac(); } });
  kok.addEventListener('change', e => { if (e.target.matches('[data-a]')) { const i = +e.target.dataset.a; e.target.checked ? d.secili.add(i) : d.secili.delete(i); $('#alici-sayi').textContent = `${d.secili.size} / ${d.alicilar.length} kişi seçili`; } });
  baglan(kok, {
    tumu: () => { d.secili = new Set(d.alicilar.map((_, i) => i)); ciz(); }, hicbiri: () => { d.secili.clear(); ciz(); },
    gonder: async () => {
      const metin = $('#mesaj').value.trim(); if (!metin) throw new Error('Mesaj metni yazın');
      const secili = [...d.secili].map(i => d.alicilar[i]); if (!secili.length) throw new Error('Alıcı seçin');
      if (!await onayla({ baslik: 'SMS gönderilsin mi?', mesaj: `${secili.length} kişiye mesaj gönderilecek. Bu işlem geri alınamaz ve SMS paketinizden düşer.`, dugme: 'Gönder' })) return;
      const mesajlar = secili.map(a => ({ ad: a.ad, telefon: a.telefon, mesaj: metin.replace(/\{ad\}/g, a.ad || '').replace(/\{kurban_no\}/g, a.kurban_no || '').replace(/\{hisse_no\}/g, a.hisse_no || '') }));
      const r = await api('POST', '/sms/gonder', { mesajlar });
      bildir(`${r.basarili} SMS gönderildi${r.hatali ? `, ${r.hatali} hatalı` : ''}`, r.hatali ? 'uyari' : 'basari', 6000);
      if (r.hatali) { const ilk = r.sonuc.find(s => s.durum === 'hata'); if (ilk) bildir(`İlk hata: ${ilk.hata}`, 'hata', 7000); }
    },
  });
  await yukle();
}

// ─── Medya ───
export async function medya(kok, p, sorgu) {
  const d = { tur: sorgu.tur || '', secili: new Set() };
  const yukle = async () => {
    const v = await api('GET', '/medya' + (d.tur ? '?tur=' + d.tur : ''));
    yerlestir(kok, html`${sayfaBaslik({ baslik: 'Medya deposu', alt: `${sayi(v.adet)} dosya · ${boyut(v.toplam_boyut)} · ${v.cloudinary ? 'Cloudinary bulut depolama' : 'Sunucu depolaması'}`, eylemler: izleyici() ? '' : html`<label class="dugme birincil"><i class="fa-solid fa-upload"></i>Dosya yükle<input type="file" multiple accept="image/*,video/*,application/pdf" hidden id="yukle"></label>` })}
      <nav class="sekmeler">${[['', 'Tümü'], ['gorsel', 'Görseller'], ['video', 'Videolar'], ['belge', 'Belgeler']].map(([k, a]) => html`<a href="/medya${k ? '?tur=' + k : ''}" class="${d.tur === k ? 'aktif' : ''}">${a}</a>`)}</nav>
      <div id="ilerleme"></div>
      <section class="kart"><div class="toplu-cubuk gizli" id="toplu"></div>${v.dosyalar.length ? html`<div class="medya-izgara">${v.dosyalar.map(m => html`<div class="medya-kart">${izleyici() ? '' : html`<input type="checkbox" class="mk-sec" data-sec="${m.id}" aria-label="Seç">`}
        <div class="mk-onizleme" data-eylem="ac" data-id="${m.id}">${m.tur === 'gorsel' ? html`<img src="${m.url}" alt="" loading="lazy">` : m.tur === 'video' ? html`<i class="fa-solid fa-circle-play"></i>` : html`<i class="fa-solid fa-file-pdf"></i>`}</div>
        <div class="mk-bilgi"><strong title="${m.ad}">${m.ad}</strong><span class="soluk">${boyut(m.boyut)} · ${tarih(m.olusturma)}${m.bagli_tur === 'hisse' ? ' · kurban videosu' : ''}</span></div></div>`)}</div>`
        : html`<label class="yukleme-alani" style="margin:16px;display:block" id="birak"><i class="fa-solid fa-cloud-arrow-up"></i>Dosyaları sürükleyip bırakın veya tıklayın<br><small>Görsel, video, PDF</small><input type="file" multiple accept="image/*,video/*,application/pdf" hidden id="yukle2"></label>`}</section>`);
    const yukleyici = async (dosyalar) => {
      const { dosyaYukle } = await import('./kurban.js');
      for (const f of dosyalar) {
        const id = 'i' + Math.random().toString(36).slice(2);
        const el = document.createElement('div'); el.className = 'kart'; el.style.marginBottom = '10px';
        yerlestir(el, html`<div class="kart-govde"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>${f.name}</span><span id="${id}">%0</span></div>${ilerleme(0)}</div>`);
        $('#ilerleme').appendChild(el);
        try { await dosyaYukle(f, 'genel', (p) => { $('.ilerleme i', el).style.width = p + '%'; $('#' + id).textContent = '%' + p.toFixed(0); }); el.remove(); }
        catch (e) { hataGoster(e); el.remove(); }
      }
      bildir('Yükleme tamamlandı'); yukle();
    };
    ['#yukle', '#yukle2'].forEach(s => { const i = $(s); if (i) i.addEventListener('change', e => yukleyici([...e.target.files])); });
    const b = $('#birak'); if (b) { b.addEventListener('dragover', e => { e.preventDefault(); b.classList.add('uzerinde'); }); b.addEventListener('dragleave', () => b.classList.remove('uzerinde')); b.addEventListener('drop', e => { e.preventDefault(); yukleyici([...e.dataTransfer.files]); }); }
    d.v = v;
  };
  kok.addEventListener('change', e => {
    if (!e.target.matches('[data-sec]')) return;
    const id = +e.target.dataset.sec; e.target.checked ? d.secili.add(id) : d.secili.delete(id);
    const t = $('#toplu'); t.classList.toggle('gizli', !d.secili.size);
    yerlestir(t, html`<strong>${d.secili.size} dosya seçildi</strong><button class="dugme" data-eylem="topluSil"><i class="fa-solid fa-trash"></i>Sil</button>`);
  });
  baglan(kok, {
    ac: (el) => {
      const m = d.v.dosyalar.find(x => x.id === +el.dataset.id);
      const md = modal({ baslik: m.ad, genis: true, icerik: m.tur === 'gorsel' ? html`<img src="${m.url}" alt="" style="max-width:100%;border-radius:8px">` : m.tur === 'video' ? html`<video src="${m.url}" controls playsinline style="width:100%;max-height:70vh;background:#000;border-radius:8px"></video>` : html`<iframe src="${m.url}" style="width:100%;height:70vh;border:0"></iframe>`,
        altlik: html`${izleyici() ? '' : html`<button class="dugme hayalet" data-sil style="margin-right:auto;color:var(--tehlike)"><i class="fa-solid fa-trash"></i>Sil</button>`}<a class="dugme" href="${m.url}" download="${m.ad}">İndir</a><button class="dugme birincil" data-kapat>Kapat</button>` });
      const s = $('[data-sil]', md.el); if (s) s.addEventListener('click', async () => { if (!await onayla({ mesaj: `"${m.ad}" kalıcı olarak silinsin mi?`, dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/medya/' + m.id); md.kapat(); bildir('Dosya silindi'); yukle(); });
    },
    topluSil: async () => { if (!await onayla({ mesaj: `${d.secili.size} dosya kalıcı olarak silinsin mi?`, dugme: 'Sil', tehlike: true })) return; await api('POST', '/medya/toplu-sil', { ids: [...d.secili] }); d.secili.clear(); bildir('Dosyalar silindi'); yukle(); },
  });
  await yukle();
}

// ─── Destek ───
export async function destek(kok) {
  const l = await api('GET', '/destek');
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Destek', alt: 'Sorularınızı ve önerilerinizi Defterdar ekibine iletin; yanıtlar burada görünür.', eylemler: html`<button class="dugme birincil" data-eylem="yeni"><i class="fa-solid fa-plus"></i>Yeni talep</button>` })}
    <section class="kart">${l.length ? html`<ul class="liste">${l.map(t => html`<li><span class="l-ikon"><i class="fa-solid fa-${t.durum === 'kapali' ? 'circle-check' : 'comments'}"></i></span><span class="l-orta"><strong><a href="/destek/${t.id}">${t.konu}</a>${!t.kullanici_okundu ? html` ${rozet('Yeni yanıt', 'bilgi')}` : ''}</strong><small>${t.kategori} · ${t.mesaj_sayisi} mesaj · ${goreceli(t.guncelleme)}</small></span><span class="l-sag">${durumRozet(t.durum === 'yanitlandi' ? 'yanitlandi' : t.durum)}</span></li>`)}</ul>`
      : bos({ ikon: 'fa-life-ring', baslik: 'Henüz destek talebiniz yok', metin: 'Bir sorun yaşarsanız veya yeni bir özellik isterseniz talep oluşturun.' })}</section>`);
  baglan(kok, { yeni: () => {
    const m = modal({ baslik: 'Yeni destek talebi', icerik: html`<form id="dt-form" class="form-izgara">${alan({ ad: 'konu', etiket: 'Konu', zorunlu: true, tam: true })}${alan({ ad: 'kategori', etiket: 'Kategori', tip: 'select', secenekler: ['Genel', 'Teknik sorun', 'Öneri', 'Fatura ve ödeme', 'Veri aktarımı'] })}${alan({ ad: 'oncelik', etiket: 'Öncelik', tip: 'select', deger: 'normal', secenekler: [['dusuk', 'Düşük'], ['normal', 'Normal'], ['yuksek', 'Yüksek'], ['acil', 'Acil']] })}${alan({ ad: 'icerik', etiket: 'Açıklama', tip: 'textarea', zorunlu: true, tam: true, yer: 'Sorunu, hangi sayfada yaşadığınızı ve adımları yazın' })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="dt-form">Gönder</button>` });
    formGonder($('#dt-form', m.el), async (v) => { const r = await api('POST', '/destek', v); bildir('Talebiniz iletildi'); m.kapat(); D.git('/destek/' + r.id); });
  } });
}
export async function destekDetay(kok, { id }) {
  const { talep: t, mesajlar } = await api('GET', '/destek/' + id);
  yerlestir(kok, html`${sayfaBaslik({ baslik: t.konu, alt: html`${durumRozet(t.durum)} <span class="soluk">${t.kategori} · ${tarih(t.olusturma, true)}</span>`, kirinti: [{ ad: 'Destek', rota: '/destek' }, { ad: '#' + t.id }], eylemler: t.durum !== 'kapali' ? html`<button class="dugme" data-eylem="kapat">Talebi kapat</button>` : '' })}
    <section class="kart"><div class="kart-govde"><div class="mesajlar">${mesajlar.map(m => html`<div class="mesaj ${m.gonderen === 'kullanici' ? 'ben' : ''}"><div class="m-ust"><strong>${m.gonderen === 'admin' ? 'Defterdar destek' : m.gonderen_ad}</strong><span>${tarih(m.tarih, true)}</span></div><p>${m.icerik}</p></div>`)}</div></div>
      <form id="ms-form" class="kart-govde" style="border-top:1px solid var(--cizgi-2)"><label class="alan"><span>Yanıtınız</span><textarea name="icerik" rows="3" required></textarea></label><div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="dugme birincil" type="submit">Gönder</button></div></form></section>`);
  formGonder($('#ms-form'), async (v) => { await api('POST', `/destek/${id}/mesaj`, v); destekDetay(kok, { id }); });
  baglan(kok, { kapat: async () => { await api('POST', `/destek/${id}/kapat`); bildir('Talep kapatıldı'); destekDetay(kok, { id }); } });
}

// ─── Çöp kutusu ───
const COP_TUR = { organizasyon: 'Kurban organizasyonu', kurban: 'Kurban', cari: 'Cari', urun: 'Ürün', personel: 'Personel', belge: 'Belge', finans_hareketi: 'Kasa hareketi', cek_senet: 'Çek/senet' };
export async function cop(kok) {
  const l = await api('GET', '/cop-kutusu');
  const turAd = (t) => t.startsWith('kayit:') ? (D.tanimlar.kayit[t.slice(6)] || {}).tekil || t : COP_TUR[t] || t;
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Çöp kutusu', alt: 'Silinen kayıtlar 180 gün saklanır. Geri yüklediğinizde bağlı kasa hareketleri de yeniden oluşturulur.', eylemler: yonetici() && l.length ? html`<button class="dugme tehlike" data-eylem="bosalt"><i class="fa-solid fa-trash"></i>Çöp kutusunu boşalt</button>` : '' })}
    <section class="kart">${l.length ? html`<div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Kayıt</th><th>Tür</th><th>Silen</th><th>Silinme</th><th class="eylemler"></th></tr></thead><tbody>${l.map(c => html`<tr><td class="mk-baslik">${c.baslik}</td><td data-etiket="Tür">${turAd(c.tur)}</td><td data-etiket="Silen">${c.silen || '—'}</td><td data-etiket="Tarih">${goreceli(c.silme_tarihi)}</td>
      <td class="eylemler"><button class="dugme kucuk" data-eylem="detay" data-id="${c.id}">İncele</button>${izleyici() ? '' : html`<button class="dugme kucuk birincil" data-eylem="geri" data-id="${c.id}"><i class="fa-solid fa-rotate-left"></i>Geri yükle</button>`}${yonetici() ? html`<button class="ikon-dugme" data-eylem="sil" data-id="${c.id}" aria-label="Kalıcı sil"><i class="fa-solid fa-xmark"></i></button>` : ''}</td></tr>`)}</tbody></table></div>`
      : bos({ ikon: 'fa-trash-can', baslik: 'Çöp kutusu boş' })}</section>`);
  baglan(kok, {
    geri: async (el) => { await api('POST', `/cop-kutusu/${el.dataset.id}/geri-yukle`); bildir('Kayıt geri yüklendi'); cop(kok); },
    sil: async (el) => { if (!await onayla({ mesaj: 'Kayıt kalıcı olarak silinsin mi? Bu işlem geri alınamaz.', dugme: 'Kalıcı sil', tehlike: true })) return; await api('DELETE', '/cop-kutusu/' + el.dataset.id); cop(kok); },
    bosalt: async () => { if (!await onayla({ baslik: 'Çöp kutusu boşaltılsın mı?', mesaj: `${l.length} kayıt kalıcı olarak silinecek.`, dugme: 'Boşalt', tehlike: true, yazili: 'BOŞALT' })) return; await api('DELETE', '/cop-kutusu'); bildir('Çöp kutusu boşaltıldı'); cop(kok); },
    detay: async (el) => {
      const c = await api('GET', '/cop-kutusu/' + el.dataset.id);
      const ozet = (o) => Object.entries(o || {}).filter(([k, v]) => v !== null && v !== '' && typeof v !== 'object' && !/(_data|hesap_id|^id$)/.test(k)).slice(0, 30);
      const ana = c.veri.kayit ? { ...JSON.parse(c.veri.kayit.veri || '{}') } : c.veri.org || c.veri.kurban || c.veri.cari || c.veri.urun || c.veri.personel || c.veri.belge || c.veri.hareket || c.veri.cek || {};
      const alt = c.veri.hisseler ? c.veri.hisseler.filter(h => h.bagisci_adi) : c.veri.hisselerMap ? Object.values(c.veri.hisselerMap).flat().filter(h => h.bagisci_adi) : [];
      modal({ baslik: c.baslik, genis: true, icerik: html`<dl class="tanim-listesi">${ozet(ana).map(([k, v]) => html`<dt>${k.replace(/_/g, ' ')}</dt><dd>${v}</dd>`)}</dl>${alt.length ? html`<h3 style="font-size:14px;margin:18px 0 8px">Hissedarlar (${alt.length})</h3><div class="tablo-kap"><table class="tablo"><tbody>${alt.map(h => html`<tr><td>${h.hisse_no}</td><td>${h.bagisci_adi}</td><td>${h.bagisci_telefon || ''}</td><td>${durumAd(h.odeme_durumu)}</td></tr>`)}</tbody></table></div>` : ''}` });
    },
  });
}

// ─── Yedekleme ───
export async function yedek(kok) {
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Yedekleme', alt: 'Kurumunuzun tüm verisini indirin, gerektiğinde geri yükleyin veya eski İÇDER Kurban Programı yedeğinizi aktarın.' })}
    <div class="izgara izgara-3">
      <section class="kart"><div class="kart-baslik"><h2>Yedek indir</h2></div><div class="kart-govde"><p class="soluk" style="margin-bottom:14px">Tüm modüllerdeki kayıtlar tek bir JSON dosyasına aktarılır. Düzenli olarak indirip güvenli bir yerde saklayın.</p><button class="dugme birincil tam" data-eylem="indir"><i class="fa-solid fa-download"></i>Yedeği indir</button></div></section>
      <section class="kart"><div class="kart-baslik"><h2>Yedekten geri yükle</h2></div><div class="kart-govde"><p class="soluk" style="margin-bottom:14px">Mevcut verilerin <strong>tamamı silinir</strong> ve yedekteki verilerle değiştirilir. Yalnızca hesap sahibi yapabilir.</p><label class="dugme tam ${D.oturum.kullanici.rol !== 'sahip' ? 'gizli' : ''}"><i class="fa-solid fa-upload"></i>Defterdar yedeği seç<input type="file" accept=".json,application/json" hidden id="geri"></label></div></section>
      <section class="kart"><div class="kart-baslik"><h2>İÇDER verisini aktar</h2></div><div class="kart-govde"><p class="soluk" style="margin-bottom:14px">Eski İÇDER Kurban Programı'nın "Tam yedek" JSON dosyasını seçin. Organizasyonlar, kurbanlar, hissedarlar ve logonuz mevcut verilere <strong>eklenir</strong>.</p><label class="dugme tam"><i class="fa-solid fa-file-import"></i>İÇDER yedeği seç<input type="file" accept=".json,application/json" hidden id="icder"></label></div></section>
    </div>
    <section class="kart bosluk-ust"><div class="kart-govde"><p class="soluk"><i class="fa-solid fa-shield-halved"></i> Sunucu tarafında her gün otomatik veritabanı yedeği de alınır. Yedek dosyanız kişisel veriler içerir; paylaşırken dikkat edin.</p></div></section>`);
  const oku = async (f) => { try { return JSON.parse(await dosyaOku(f, 'metin')); } catch (e) { throw new Error('Dosya okunamadı veya geçerli bir JSON değil'); } };
  $('#geri').addEventListener('change', async (e) => {
    try {
      const f = e.target.files[0]; if (!f) return; const y = await oku(f);
      if (y.defterdar_yedek !== 2) throw new Error('Bu dosya bir Defterdar yedeği değil. İÇDER yedeği ise sağdaki "İÇDER verisini aktar" bölümünü kullanın.');
      if (!await onayla({ baslik: 'Geri yükleme', mesaj: `${tarih(y.tarih, true)} tarihli yedek yüklenecek. Şu anki tüm veriler silinecek.`, dugme: 'Geri yükle', tehlike: true, yazili: 'GERİ YÜKLE' })) return;
      const r = await api('POST', '/yedek/geri-yukle', { onay: 'GERİ YÜKLE', yedek: y });
      bildir(`Geri yükleme tamamlandı: ${Object.values(r.sayilar).reduce((a, b) => a + b, 0)} kayıt`, 'basari', 6000); setTimeout(() => location.reload(), 1200);
    } catch (er) { hataGoster(er); } finally { e.target.value = ''; }
  });
  $('#icder').addEventListener('change', async (e) => {
    try {
      const f = e.target.files[0]; if (!f) return; const y = await oku(f);
      if (!Array.isArray(y.organizasyonlar)) throw new Error('Bu dosya İÇDER Kurban Programı yedeği değil');
      const k = y.organizasyonlar.reduce((a, o) => a + (o.kurbanlar || []).length, 0);
      if (!await onayla({ baslik: 'İÇDER verisi aktarılsın mı?', mesaj: `${y.organizasyonlar.length} organizasyon ve ${k} kurban mevcut verilere eklenecek.`, dugme: 'Aktar' })) return;
      const r = await api('POST', '/yedek/icder-aktar', { yedek: y });
      bildir(`${r.sayilar.organizasyon} organizasyon, ${r.sayilar.kurban} kurban, ${r.sayilar.hisse} hissedar aktarıldı`, 'basari', 7000); D.git('/kurban');
    } catch (er) { hataGoster(er); } finally { e.target.value = ''; }
  });
  baglan(kok, { indir: () => indir('/yedek/indir', 'defterdar-yedek.json') });
}

// ─── İşlem geçmişi ───
export async function denetim(kok) {
  const d = { q: '', bas: '', bit: '' };
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'İşlem geçmişi', alt: 'Kurumunuzda kim, ne zaman, ne yaptı. Kayıtlar değiştirilemez.' })}
    <section class="kart"><div class="filtre-cubuk"><div class="ara"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="ara" placeholder="İşlem veya kişi ara"></div><input type="date" id="bas" style="width:auto"><input type="date" id="bit" style="width:auto"></div><div class="tablo-kap" id="tablo"></div></section>`);
  const yukle = async () => {
    const q = new URLSearchParams(); Object.entries(d).forEach(([k, v]) => v && q.set(k, v));
    const l = await api('GET', '/denetim?' + q);
    yerlestir($('#tablo'), l.length ? html`<table class="tablo mobil-kart"><thead><tr><th>Zaman</th><th>Kişi</th><th>İşlem</th><th>Detay</th><th>IP</th></tr></thead><tbody>${l.map(x => html`<tr><td class="mk-gizle" title="${tarih(x.tarih, true)}">${tarih(x.tarih, true)}</td><td data-etiket="Kişi">${x.kim}</td><td class="mk-baslik">${x.islem}</td><td data-etiket="Detay" style="max-width:340px;font-size:12px;color:var(--soluk);word-break:break-word">${x.detay ? Object.entries(JSON.parse(x.detay)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ') : ''}</td><td data-etiket="IP" class="soluk">${x.ip || ''}</td></tr>`)}</tbody></table>` : bos({ ikon: 'fa-clock-rotate-left', baslik: 'Kayıt bulunamadı' }));
  };
  $('#ara').addEventListener('input', gecikmeli(e => { d.q = e.target.value.trim(); yukle(); }));
  $('#bas').addEventListener('change', e => { d.bas = e.target.value; yukle(); }); $('#bit').addEventListener('change', e => { d.bit = e.target.value; yukle(); });
  await yukle();
}

// ─── Ayarlar ───
export async function ayarlar(kok, { sekme = 'kurum' }) {
  const sekmeler = [['kurum', 'Kurum bilgileri'], ['moduller', 'Modüller ve menü'], ['kullanicilar', 'Kullanıcılar'], ['kategoriler', 'Kategoriler'], ['yazdirma', 'Logo ve yazdırma'], ['entegrasyonlar', 'Entegrasyonlar'], ['guvenlik', 'Güvenlik']];
  const h = await api('GET', '/ayarlar/hesap');
  const ust = html`${sayfaBaslik({ baslik: 'Ayarlar', alt: h.ad })}<nav class="sekmeler">${sekmeler.map(([k, a]) => html`<a href="/ayarlar/${k}" class="${sekme === k ? 'aktif' : ''}">${a}</a>`)}</nav>`;
  const yon = yonetici();
  if (sekme === 'kurum') {
    yerlestir(kok, html`${ust}<form class="kart" id="kurum-form"><div class="kart-govde"><div class="form-izgara uclu">
      ${alan({ ad: 'ad', etiket: 'Kurum adı', zorunlu: true, deger: h.ad, tam: true })}${alan({ ad: 'alt_tur', etiket: 'Kurum tipi', deger: h.alt_tur, yer: 'Örnek: Dernek, Limited şirket' })}${alan({ ad: 'vergi_dairesi', etiket: 'Vergi dairesi', deger: h.vergi_dairesi })}${alan({ ad: 'vergi_no', etiket: 'Vergi no', deger: h.vergi_no, ek: 'inputmode="numeric" maxlength="11"' })}
      ${alan({ ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: h.telefon })}${alan({ ad: 'eposta', etiket: 'E-posta', tip: 'email', deger: h.eposta })}${alan({ ad: 'web', etiket: 'Web sitesi', deger: h.web })}${alan({ ad: 'il', etiket: 'İl', deger: h.il })}
      ${alan({ ad: 'adres', etiket: 'Adres', tip: 'textarea', deger: h.adres, tam: true, yardim: 'Fatura, makbuz ve ekstrelerin başlığında görünür' })}</div></div>
      ${yon ? html`<div class="modal-altlik" style="border-radius:0 0 var(--r-b) var(--r-b)"><button class="dugme birincil" type="submit">Kaydet</button></div>` : ''}</form>`);
    formGonder($('#kurum-form'), async (v) => { await api('PUT', '/ayarlar/hesap', v); D.oturum.hesap = { ...D.oturum.hesap, ...v }; bildir('Kurum bilgileri kaydedildi'); });
  } else if (sekme === 'moduller') {
    const T = D.tanimlar.hesapTurleri; const menu = D.oturum.menu;
    const tum = [...menu.gruplar.flatMap(g => g.ogeler), ...menu.diger];
    const gizli = new Set(h.moduller.gizli || []), sabit = new Set(h.moduller.sabit || []);
    const tumModul = Object.entries(D.tanimlar.moduller).filter(([k]) => !['panel', 'ayarlar', 'destek', 'cop', 'yedek', 'denetim'].includes(k));
    yerlestir(kok, html`${ust}<form id="modul-form"><div class="izgara izgara-2">
      <section class="kart"><div class="kart-baslik"><div><h2>Hesap türü ve faaliyetler</h2><p>Menü sıralaması bu seçimlere göre hesaplanır</p></div></div><div class="kart-govde">
        <div class="secim-kartlari" style="grid-template-columns:1fr 1fr">${Object.entries(T).map(([k, t]) => html`<label class="secim-karti"><input type="radio" name="tur" value="${k}" ${h.tur === k ? 'checked' : ''}><span class="sk-ic" style="padding:10px 12px"><span><strong style="font-size:13px">${t.ad}</strong></span></span></label>`)}</div>
        <h3 style="font-size:13px;margin:18px 0 8px">Faaliyet alanları</h3><div class="etiket-sec" id="faaliyetler"></div></div></section>
      <section class="kart"><div class="kart-baslik"><div><h2>Akıllı menü</h2><p>Her modül için puan: hesap türü uyumu + seçtiğiniz faaliyetler + son kullanım sıklığınız (14 günlük yarı ömür). Eşik altındakiler "Diğer modüller"e iner.</p></div></div>
        <div class="tablo-kap" style="max-height:460px;overflow-y:auto"><table class="tablo"><thead><tr><th>Modül</th><th class="sag">Puan</th><th class="orta">Sabitle</th><th class="orta">Gizle</th></tr></thead><tbody>
        ${tumModul.map(([k, m]) => { const o = tum.find(x => x.anahtar === k); return html`<tr><td><i class="fa-solid ${m.ikon}" style="width:18px;color:var(--soluk)"></i> ${m.ad}${o && !o.ana ? html` <span class="soluk" style="font-size:12px">(diğer)</span>` : ''}</td><td class="sag sayisal">${o ? o.skor : '—'}</td>
          <td class="orta"><input type="checkbox" name="sabit" value="${k}" data-dizi ${sabit.has(k) ? 'checked' : ''} aria-label="${m.ad} sabitle"></td><td class="orta"><input type="checkbox" name="gizli" value="${k}" data-dizi ${gizli.has(k) ? 'checked' : ''} aria-label="${m.ad} gizle"></td></tr>`; })}</tbody></table></div></section></div>
      ${yon ? html`<div class="sb-eylem" style="justify-content:flex-end;margin-top:16px"><button class="dugme birincil" type="submit">Menüyü güncelle</button></div>` : ''}</form>`);
    const fCiz = () => { const t = $('[name=tur]:checked').value; const secili = new Set(h.tur === t ? (h.profil.faaliyetler || T[t].varsayilan) : T[t].varsayilan); yerlestir($('#faaliyetler'), html`${T[t].faaliyetler.map(([k, a]) => html`<label><input type="checkbox" name="faaliyetler" value="${k}" data-dizi ${secili.has(k) ? 'checked' : ''}><span>${a}</span></label>`)}`); };
    $$('[name=tur]').forEach(r => r.addEventListener('change', fCiz)); fCiz();
    formGonder($('#modul-form'), async (v) => { await api('PUT', '/ayarlar/profil', v); bildir('Menü güncellendi'); location.reload(); });
  } else if (sekme === 'kullanicilar') {
    const l = await api('GET', '/kullanicilar');
    const ROL = [['yonetici', 'Yönetici — her şey (sahiplik hariç)'], ['muhasebe', 'Muhasebe — finans, personel, raporlar'], ['personel', 'Personel — kayıt girişi'], ['izleyici', 'Salt okunur — yalnızca görüntüleme']];
    const rolAd = { sahip: 'Hesap sahibi', yonetici: 'Yönetici', muhasebe: 'Muhasebe', personel: 'Personel', izleyici: 'Salt okunur' };
    yerlestir(kok, html`${ust}<section class="kart"><div class="kart-baslik"><div><h2>Kullanıcılar</h2><p>Ekibinize rol bazlı erişim verin</p></div>${yon ? html`<button class="dugme birincil kucuk" data-eylem="yeni"><i class="fa-solid fa-user-plus"></i>Kullanıcı ekle</button>` : ''}</div>
      <div class="tablo-kap"><table class="tablo mobil-kart"><thead><tr><th>Ad soyad</th><th>E-posta</th><th>Rol</th><th>Durum</th><th>Son giriş</th><th class="eylemler"></th></tr></thead><tbody>${l.map(k => html`<tr><td class="mk-baslik">${k.ad_soyad}${k.id === D.oturum.kullanici.id ? html` ${rozet('Siz', 'bilgi')}` : ''}</td><td data-etiket="E-posta">${k.eposta}</td><td data-etiket="Rol">${rolAd[k.rol]}</td><td data-etiket="Durum">${durumRozet(k.durum)}</td><td data-etiket="Son giriş">${k.son_giris ? goreceli(k.son_giris) : 'Hiç'}</td>
        <td class="eylemler">${yon && k.rol !== 'sahip' ? html`<button class="dugme kucuk" data-eylem="duzenle" data-id="${k.id}">Düzenle</button><button class="ikon-dugme" data-eylem="sifre" data-id="${k.id}" aria-label="Şifre sıfırla" title="Şifre sıfırla"><i class="fa-solid fa-key"></i></button><button class="ikon-dugme" data-eylem="sil" data-id="${k.id}" aria-label="Sil"><i class="fa-solid fa-trash"></i></button>` : ''}</td></tr>`)}</tbody></table></div></section>`);
    const sifreGoster = (s, eposta) => modal({ baslik: 'Geçici şifre', icerik: html`<p class="onay-metin">${eposta} için geçici şifre oluşturuldu. Bu şifreyi kişiye güvenli bir kanaldan iletin; ilk girişte değiştirmesini isteyin. Şifre bir daha gösterilmeyecek.</p><input value="${s}" readonly style="font-family:monospace;font-size:16px;text-align:center" id="gs">`, altlik: html`<button class="dugme" data-kopya>Kopyala</button><button class="dugme birincil" data-kapat>Tamam</button>` }).el.querySelector('[data-kopya]').addEventListener('click', () => { navigator.clipboard.writeText(s); bildir('Kopyalandı'); });
    baglan(kok, {
      yeni: () => { const m = modal({ baslik: 'Kullanıcı ekle', icerik: html`<form id="ku-form" class="form-izgara">${alan({ ad: 'ad_soyad', etiket: 'Ad soyad', zorunlu: true, tam: true })}${alan({ ad: 'eposta', etiket: 'E-posta', tip: 'email', zorunlu: true })}${alan({ ad: 'telefon', etiket: 'Telefon', tip: 'tel' })}${alan({ ad: 'rol', etiket: 'Rol', tip: 'select', secenekler: ROL, deger: 'personel', tam: true })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="ku-form">Ekle</button>` });
        formGonder($('#ku-form', m.el), async (v) => { const r = await api('POST', '/kullanicilar', v); m.kapat(); sifreGoster(r.gecici_sifre, v.eposta); ayarlar(kok, { sekme }); }); },
      duzenle: (el) => { const k = l.find(x => x.id === +el.dataset.id); const m = modal({ baslik: k.ad_soyad, icerik: html`<form id="ke-form" class="form-izgara">${alan({ ad: 'ad_soyad', etiket: 'Ad soyad', deger: k.ad_soyad, tam: true })}${alan({ ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: k.telefon })}${alan({ ad: 'rol', etiket: 'Rol', tip: 'select', secenekler: ROL, deger: k.rol })}${alan({ ad: 'durum', etiket: 'Durum', tip: 'select', secenekler: [['aktif', 'Aktif'], ['pasif', 'Pasif (giriş yapamaz)']], deger: k.durum })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="ke-form">Kaydet</button>` });
        formGonder($('#ke-form', m.el), async (v) => { await api('PUT', '/kullanicilar/' + k.id, v); bildir('Kullanıcı güncellendi'); m.kapat(); ayarlar(kok, { sekme }); }); },
      sifre: async (el) => { const k = l.find(x => x.id === +el.dataset.id); if (!await onayla({ mesaj: `${k.ad_soyad} için yeni geçici şifre oluşturulsun mu? Açık oturumları kapatılır.`, dugme: 'Sıfırla' })) return; const r = await api('POST', `/kullanicilar/${k.id}/sifre-sifirla`); sifreGoster(r.gecici_sifre, k.eposta); },
      sil: async (el) => { const k = l.find(x => x.id === +el.dataset.id); if (!await onayla({ mesaj: `${k.ad_soyad} silinsin mi?`, dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/kullanicilar/' + k.id); bildir('Kullanıcı silindi'); ayarlar(kok, { sekme }); },
    });
  } else if (sekme === 'kategoriler') {
    const l = await api('GET', '/kategoriler');
    const blok = (tip, ad, aciklama) => html`<section class="kart"><div class="kart-baslik"><div><h2>${ad}</h2><p>${aciklama}</p></div>${izleyici() ? '' : html`<button class="dugme kucuk" data-eylem="ekle" data-tip="${tip}"><i class="fa-solid fa-plus"></i>Ekle</button>`}</div>
      <ul class="liste">${l.filter(k => k.tip === tip).map(k => html`<li><span class="l-orta"><strong>${k.ad}</strong>${k.varsayilan_tutar ? html`<small>Varsayılan ${para(k.varsayilan_tutar)}</small>` : ''}</span>${izleyici() ? '' : html`<button class="ikon-dugme" data-eylem="duzenle" data-id="${k.id}" aria-label="Düzenle"><i class="fa-solid fa-pen"></i></button><button class="ikon-dugme" data-eylem="sil" data-id="${k.id}" aria-label="Sil"><i class="fa-solid fa-trash"></i></button>`}</li>`)}</ul></section>`;
    yerlestir(kok, html`${ust}<div class="izgara izgara-3">${blok('gelir', 'Gelir kategorileri', 'Kasa girişlerinde kullanılır')}${blok('gider', 'Gider kategorileri', 'Kasa çıkışı ve masraflarda kullanılır')}${blok('bagisci', 'Bağışçı kategorileri', 'Kurban hissedarı sınıflandırması')}</div>`);
    const kmodal = (k, tip) => { const m = modal({ baslik: k ? 'Kategori düzenle' : 'Yeni kategori', icerik: html`<form id="kt-form" class="form-izgara">${alan({ ad: 'ad', etiket: 'Ad', zorunlu: true, deger: k && k.ad, tam: true })}${alan({ ad: 'varsayilan_tutar', etiket: 'Varsayılan tutar', tip: 'number', deger: k && k.varsayilan_tutar, tam: true, yardim: 'Seçildiğinde tutar alanını otomatik doldurur' })}</form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="kt-form">Kaydet</button>` });
      formGonder($('#kt-form', m.el), async (v) => { if (k) await api('PUT', '/kategoriler/' + k.id, v); else await api('POST', '/kategoriler', { ...v, tip }); onbellekTemizle(); m.kapat(); ayarlar(kok, { sekme }); }); };
    baglan(kok, { ekle: (el) => kmodal(null, el.dataset.tip), duzenle: (el) => kmodal(l.find(k => k.id === +el.dataset.id)), sil: async (el) => { if (!await onayla({ mesaj: 'Kategori kaldırılsın mı? Geçmiş kayıtlar etkilenmez.', dugme: 'Kaldır', tehlike: true })) return; await api('DELETE', '/kategoriler/' + el.dataset.id); onbellekTemizle(); ayarlar(kok, { sekme }); } });
  } else if (sekme === 'yazdirma') {
    const bayraklar = await api('GET', '/kurban/bayraklar');
    yerlestir(kok, html`${ust}<div class="izgara izgara-2"><section class="kart"><div class="kart-baslik"><div><h2>Kurum logosu</h2><p>Menüde, faturalarda, makbuzlarda ve kurban çıktılarında kullanılır</p></div></div><div class="kart-govde" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        <div style="width:150px;height:110px;border:1px dashed var(--cizgi);border-radius:10px;display:grid;place-items:center;background:var(--yuzey-2)">${h.logo_data ? html`<img src="${h.logo_data}" alt="Logo" style="max-width:130px;max-height:90px;object-fit:contain">` : html`<span class="soluk">Logo yok</span>`}</div>
        ${yon ? html`<div style="display:flex;flex-direction:column;gap:8px"><label class="dugme birincil"><i class="fa-solid fa-upload"></i>Logo yükle<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden id="logo"></label>${h.logo_data ? html`<button class="dugme hayalet" data-eylem="logoSil" style="color:var(--tehlike)">Logoyu kaldır</button>` : ''}<small class="soluk">PNG, JPG, WEBP veya SVG. Şeffaf arka plan önerilir.</small></div>` : ''}</div></section>
      <section class="kart"><div class="kart-baslik"><div><h2>Destekçi / ülke bayrakları</h2><p>Kurban çıktısında sağ üst köşede gösterilir</p></div>${izleyici() ? '' : html`<button class="dugme kucuk" data-eylem="bayrakEkle"><i class="fa-solid fa-plus"></i>Bayrak</button>`}</div>
        ${bayraklar.length ? html`<ul class="liste">${bayraklar.map(b => html`<li><span class="l-orta"><strong>${b.ad}</strong></span>${izleyici() ? '' : html`<button class="ikon-dugme" data-eylem="bayrakSil" data-id="${b.id}" aria-label="Sil"><i class="fa-solid fa-trash"></i></button>`}</li>`)}</ul>` : html`<div class="kart-govde soluk">Henüz bayrak eklenmedi. Örnek: "Tanzanya Bayrağı" — çıktıda "TANZANYA - ${new Date().getFullYear()}" yazar.</div>`}</section></div>`);
    const logo = $('#logo'); if (logo) logo.addEventListener('change', async (e) => { try { const f = e.target.files[0]; if (!f) return; const v = await gorselKucult(f, 600, .9); await api('PUT', '/ayarlar/hesap', { ...h, logo_data: v }); D.oturum.hesap.logo_var = 1; bildir('Logo kaydedildi'); ayarlar(kok, { sekme }); } catch (er) { hataGoster(er); } });
    baglan(kok, {
      logoSil: async () => { await api('PUT', '/ayarlar/hesap', { ...h, logo_data: null }); D.oturum.hesap.logo_var = 0; bildir('Logo kaldırıldı'); ayarlar(kok, { sekme }); },
      bayrakEkle: () => { const m = modal({ baslik: 'Bayrak ekle', icerik: html`<form id="by-form" class="form-izgara">${alan({ ad: 'ad', etiket: 'Bayrak adı', zorunlu: true, tam: true, yer: 'Örnek: Tanzanya Bayrağı' })}<label class="alan tam"><span>Görsel<em>*</em></span><input type="file" name="resim" accept="image/*" required></label></form>`, altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" type="submit" form="by-form">Kaydet</button>` });
        formGonder($('#by-form', m.el), async (v) => { const f = $('[name=resim]', m.el).files[0]; if (!f) throw new Error('Görsel seçin'); await api('POST', '/kurban/bayraklar', { ad: v.ad, resim_data: await gorselKucult(f, 600, .9) }); bildir('Bayrak eklendi'); m.kapat(); ayarlar(kok, { sekme }); }); },
      bayrakSil: async (el) => { if (!await onayla({ mesaj: 'Bayrak silinsin mi?', dugme: 'Sil', tehlike: true })) return; await api('DELETE', '/kurban/bayraklar/' + el.dataset.id); ayarlar(kok, { sekme }); },
    });
  } else if (sekme === 'entegrasyonlar') {
    yerlestir(kok, html`${ust}<div class="izgara izgara-2"><form class="kart" id="sms-form"><div class="kart-baslik"><div><h2>Netgsm SMS</h2><p>Bilgiler sunucuda şifrelenerek saklanır; şifre hiçbir ekranda gösterilmez.</p></div>${h.sms.sifre_var ? rozet('Bağlı', 'basari') : rozet('Bağlı değil', 'notr')}</div><div class="kart-govde form-izgara">
        ${alan({ ad: 'kullanici', etiket: 'Kullanıcı kodu', deger: h.sms.kullanici })}${alan({ ad: 'baslik', etiket: 'Gönderici başlığı', deger: h.sms.baslik, yardim: 'Netgsm\'de onaylı başlık (en fazla 11 karakter)' })}
        ${alan({ ad: 'sifre', etiket: 'API şifresi', tip: 'password', yer: h.sms.sifre_var ? 'Değiştirmek için yeni şifre girin' : '', ek: 'autocomplete="new-password"', tam: true })}</div>${yon ? html`<div class="modal-altlik"><button class="dugme birincil" type="submit">Kaydet</button></div>` : ''}</form>
      <form class="kart" id="cl-form"><div class="kart-baslik"><div><h2>Cloudinary medya depolama</h2><p>Boş bırakırsanız dosyalar sunucuda saklanır. Kurban videoları için bulut önerilir.</p></div>${h.cloudinary.aktif ? rozet('Aktif', 'basari') : rozet('Sunucu depolaması', 'notr')}</div><div class="kart-govde form-izgara">
        ${alan({ ad: 'cloud', etiket: 'Cloud name', deger: h.cloudinary.cloud })}${alan({ ad: 'key', etiket: 'API key', deger: h.cloudinary.key })}${alan({ ad: 'secret', etiket: 'API secret', tip: 'password', yer: h.cloudinary.secret_var ? 'Kayıtlı — değiştirmek için girin' : '', ek: 'autocomplete="new-password"', tam: true })}</div>${yon ? html`<div class="modal-altlik"><button class="dugme birincil" type="submit">Kaydet</button></div>` : ''}</form></div>`);
    formGonder($('#sms-form'), async (v) => { await api('PUT', '/ayarlar/entegrasyon', { sms: v }); bildir('SMS ayarları kaydedildi'); ayarlar(kok, { sekme }); });
    formGonder($('#cl-form'), async (v) => { await api('PUT', '/ayarlar/entegrasyon', { cloudinary: v }); bildir('Cloudinary ayarları kaydedildi'); ayarlar(kok, { sekme }); });
  } else if (sekme === 'guvenlik') {
    const sahip = D.oturum.kullanici.rol === 'sahip';
    yerlestir(kok, html`${ust}<div class="izgara izgara-2"><section class="kart"><div class="kart-baslik"><div><h2>Personel PIN koruması</h2><p>Personel maaş ve kişisel bilgilerini ek bir PIN ile korur</p></div>${h.pin_var ? rozet('Açık', 'basari') : rozet('Kapalı', 'notr')}</div>
      <form class="kart-govde" id="pin-form">${sahip ? html`${alan({ ad: 'pin', etiket: h.pin_var ? 'Yeni PIN (boş bırakıp kaydederseniz koruma kapanır)' : 'PIN (4-8 rakam)', tip: 'password', ek: 'inputmode="numeric" maxlength="8" autocomplete="new-password"' })}<button class="dugme birincil" type="submit" style="margin-top:12px">Kaydet</button>` : html`<p class="soluk">Bu ayarı yalnızca hesap sahibi değiştirebilir.</p>`}</form></section>
      <section class="kart"><div class="kart-baslik"><h2>Hesabınızın güvenliği</h2></div><div class="kart-govde"><p class="soluk" style="margin-bottom:12px">Şifrenizi değiştirmek ve açık oturumlarınızı yönetmek için profil sayfasını kullanın.</p><a class="dugme" href="/profil">Profil ve güvenlik</a></div></section></div>`);
    if (sahip) formGonder($('#pin-form'), async (v) => { await api('PUT', '/ayarlar/personel-pin', v); sessionStorage.removeItem('dd-pin'); bildir(v.pin ? 'PIN koruması açıldı' : 'PIN koruması kapatıldı'); ayarlar(kok, { sekme }); });
  }
}

// ─── Profil ───
export async function profil(kok) {
  const k = D.oturum.kullanici;
  const oturumlar = await api('GET', '/hesap/oturumlarim');
  yerlestir(kok, html`${sayfaBaslik({ baslik: 'Profil ve güvenlik', alt: k.eposta })}
    <div class="izgara izgara-2"><form class="kart" id="pr-form"><div class="kart-baslik"><h2>Kişisel bilgiler</h2></div><div class="kart-govde form-izgara">${alan({ ad: 'ad_soyad', etiket: 'Ad soyad', zorunlu: true, deger: k.ad_soyad, tam: true })}${alan({ ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: k.telefon })}<label class="alan"><span>E-posta</span><input value="${k.eposta}" readonly></label></div><div class="modal-altlik"><button class="dugme birincil" type="submit">Kaydet</button></div></form>
    <form class="kart" id="sf-form"><div class="kart-baslik"><h2>Şifre değiştir</h2></div><div class="kart-govde form-izgara">${alan({ ad: 'mevcut', etiket: 'Mevcut şifre', tip: 'password', zorunlu: true, tam: true, ek: 'autocomplete="current-password"' })}${alan({ ad: 'yeni', etiket: 'Yeni şifre', tip: 'password', zorunlu: true, ek: 'autocomplete="new-password"', yardim: 'En az 8 karakter, harf ve rakam' })}${alan({ ad: 'yeni2', etiket: 'Yeni şifre (tekrar)', tip: 'password', zorunlu: true, ek: 'autocomplete="new-password"' })}</div><div class="modal-altlik"><button class="dugme birincil" type="submit">Şifreyi değiştir</button></div></form></div>
    <section class="kart bosluk-ust"><div class="kart-baslik"><div><h2>Açık oturumlar</h2><p>Tanımadığınız bir oturum görürseniz kapatın ve şifrenizi değiştirin</p></div>${oturumlar.length > 1 ? html`<button class="dugme kucuk" data-eylem="kapat">Diğer oturumları kapat</button>` : ''}</div>
      <ul class="liste">${oturumlar.map(o => html`<li><span class="l-ikon"><i class="fa-solid fa-${/Mobile|Android|iPhone/.test(o.tarayici || '') ? 'mobile-screen' : 'desktop'}"></i></span><span class="l-orta"><strong>${(o.tarayici || 'Bilinmeyen cihaz').slice(0, 80)}</strong><small>${o.ip} · son erişim ${goreceli(o.son_erisim)}</small></span>${o.bu ? rozet('Bu cihaz', 'bilgi') : ''}</li>`)}</ul></section>`);
  formGonder($('#pr-form'), async (v) => { await api('PUT', '/hesap/profil', v); D.oturum.kullanici.ad_soyad = v.ad_soyad; bildir('Profil güncellendi'); });
  formGonder($('#sf-form'), async (v, f) => { if (v.yeni !== v.yeni2) throw new Error('Yeni şifreler eşleşmiyor'); const r = await api('POST', '/hesap/sifre-degistir', v); bildir(r.mesaj); f.reset(); profil(kok); });
  baglan(kok, { kapat: async () => { const r = await api('POST', '/hesap/oturumlari-kapat'); bildir(`${r.kapatilan} oturum kapatıldı`); profil(kok); } });
}
