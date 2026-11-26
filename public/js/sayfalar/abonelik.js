// Abonelik ve Pro sayfası
import { D, api, html, yerlestir, $, $$, bildir, hataGoster, baglan, modal, onayla, para, tarih, sayfaBaslik, kpi, ilerleme, alan } from '../cekirdek.js';

const PRO_OZELLIKLER = [
  ['fa-infinity', 'Sınırsız kayıt', 'Tüm modüllerde dilediğiniz kadar bağış, üye, cari, fatura, kurban kaydı'],
  ['fa-table-cells-large', 'Tüm modüller açık', 'Kurban, bağış, cari, fatura, stok, personel, raporlar ve fazlası'],
  ['fa-file-excel', 'Excel ve PDF dışa aktarma', 'Listeleri ve raporları Excel/PDF olarak indirin'],
  ['fa-comment-sms', 'Toplu SMS', 'Bağışçı, üye ve carilere toplu bilgilendirme SMS\'i'],
  ['fa-users', 'Ekip kullanıcıları', 'Rol bazlı yetkilerle sınırsız ekip üyesi'],
  ['fa-database', 'Yedekleme ve geri yükleme', 'Verilerinizi dilediğiniz an yedekleyin'],
  ['fa-photo-film', 'Geniş medya deposu', 'Belge, fotoğraf ve kesim videoları için bol alan'],
  ['fa-headset', 'Öncelikli destek', 'Taleplerinize öncelikli yanıt'],
];
const OZELLIK_AD = { excel: 'Excel dışa aktarma', pdf: 'PDF çıktı', sms: 'Toplu SMS', yedek: 'Yedekleme', medya: 'Medya yükleme', toplu_islem: 'Toplu işlemler', kayitli_gorunum: 'Kayıtlı görünümler', api: 'API erişimi' };

export async function sayfa(kok, params, sorgu) {
  // Ödeme dönüşü bildirimi
  if (sorgu && sorgu.durum) {
    if (sorgu.durum === 'basarili') bildir('Ödemeniz alındı, Pro aboneliğiniz etkinleştirildi. Makbuz e-postanıza gönderildi.', 'basari', 6000);
    else if (sorgu.durum === 'iptal') bildir('Ödeme iptal edildi.', 'uyari');
    else if (sorgu.durum === 'beklemede') bildir('Ödemeniz işleniyor. Onaylandığında Pro aktifleşecek.', 'bilgi', 5000);
    else if (sorgu.durum === 'hata') bildir('Ödeme sırasında bir sorun oluştu.', 'hata');
    history.replaceState({}, '', '/abonelik');
  }
  yerlestir(kok, html`<div class="yukleniyor-kap"><span class="donen"></span><span>Yükleniyor</span></div>`);
  let d;
  try { d = await api('GET', '/abonelik/durum'); } catch (e) { return hataGoster(e); }
  if (D.oturum) { D.oturum.abonelik = d; if (D.abonelikBandiCiz) D.abonelikBandiCiz(); }
  ciz(kok, d);
}

function durumRozet(d) {
  if (!d.aktif) return html`<span class="rozet rozet-basari">Tam sürüm</span>`;
  if (d.asama === 'pro') return html`<span class="rozet rozet-basari"><i class="fa-solid fa-crown"></i> Pro — Aktif</span>`;
  if (d.asama === 'pro_iptal_bekliyor') return html`<span class="rozet rozet-uyari">Pro — İptal edildi</span>`;
  if (d.asama === 'gecikti') return html`<span class="rozet rozet-tehlike">Ödeme bekliyor</span>`;
  if (d.asama === 'deneme') return html`<span class="rozet rozet-bilgi">Ücretsiz deneme</span>`;
  return html`<span class="rozet rozet-notr">Demo</span>`;
}

function ciz(kok, d) {
  const pro = d.asama === 'pro' || d.asama === 'pro_iptal_bekliyor';
  const f = d.fiyat || { aylik: 0, yillik: 0, para: 'TRY' };
  const yetkili = D.oturum && ['sahip', 'yonetici'].includes(D.oturum.kullanici.rol);

  yerlestir(kok, html`
    ${sayfaBaslik({ baslik: 'Abonelik ve Pro', alt: 'Planınızı, ödeme geçmişinizi ve makbuzlarınızı buradan yönetin' })}

    <div class="kart abonelik-ozet-kart">
      <div class="aok-ust">
        <div>
          <div class="aok-etiket">Mevcut planınız</div>
          <div class="aok-plan">${pro ? 'Defterdar Pro' : d.asama === 'deneme' ? 'Ücretsiz Deneme' : 'Demo'} ${durumRozet(d)}</div>
          ${durumAlt(d)}
        </div>
        <div class="aok-fiyat">
          ${pro ? html`<div><b>${para(d.tutar)}</b><span>/${d.periyot === 'yillik' ? 'yıl' : 'ay'}</span></div>`
            : html`<div><b>${para(f.aylik)}</b><span>/ay</span></div><small>yıllık ${para(f.yillik)}</small>`}
        </div>
      </div>
      ${pro ? proEylemler(d, yetkili) : html`<div class="aok-eylem">${yetkili ? html`<button class="dugme birincil buyuk" data-eylem="yukselt"><i class="fa-solid fa-crown"></i> Pro'ya geç</button>` : html`<p class="soluk">Yükseltme için hesap sahibi veya yöneticinizle görüşün.</p>`}</div>`}
    </div>

    ${d.demo && d.kullanim ? kullanimKart(d) : ''}

    ${!pro ? planKarsilastir(d, f, yetkili) : proOzetKart()}

    <div class="kart">
      <div class="kart-baslik"><h2><i class="fa-solid fa-receipt"></i> Ödeme geçmişi ve makbuzlar</h2></div>
      ${odemeTablo(d.odemeler || [])}
    </div>
  `);

  baglan(kok, {
    yukselt: () => yukseltModal(d),
    iptal: async () => {
      if (!await onayla({ baslik: 'Aboneliği iptal et', mesaj: `Otomatik yenileme durdurulacak. Pro erişiminiz ${tarih(d.donem_bitis)} tarihine kadar devam edecek. İptal etmek istiyor musunuz?`, dugme: 'Aboneliği iptal et', tehlike: true })) return;
      try { const r = await api('POST', '/abonelik/iptal'); bildir('Aboneliğiniz iptal edildi. Dönem sonuna kadar Pro açık kalacak.', 'bilgi', 5000); tazele(kok); } catch (e) { hataGoster(e); }
    },
    surdur: async () => {
      try { await api('POST', '/abonelik/surdur'); bildir('Aboneliğiniz sürdürüldü, otomatik yenileme tekrar açıldı.', 'basari'); tazele(kok); } catch (e) { hataGoster(e); }
    },
    makbuzIndir: (el) => { window.open(`/api/abonelik/odemeler/${el.dataset.id}/makbuz?indir=1`, '_blank'); },
  });
}

async function tazele(kok) { try { const d = await api('GET', '/abonelik/durum'); if (D.oturum) { D.oturum.abonelik = d; if (D.abonelikBandiCiz) D.abonelikBandiCiz(); } ciz(kok, d); } catch (e) { hataGoster(e); } }

function durumAlt(d) {
  if (d.asama === 'pro') return html`<div class="aok-detay"><i class="fa-solid fa-rotate"></i> Sonraki yenileme: <b>${tarih(d.sonraki_odeme || d.donem_bitis)}</b>${d.odeme_ozet ? html` • ${d.odeme_ozet}` : ''}</div>`;
  if (d.asama === 'pro_iptal_bekliyor') return html`<div class="aok-detay"><i class="fa-solid fa-circle-exclamation"></i> İptal edildi — erişim <b>${tarih(d.donem_bitis)}</b> tarihinde sona erecek</div>`;
  if (d.asama === 'deneme') return html`<div class="aok-detay"><i class="fa-solid fa-gift"></i> Deneme bitişi: <b>${tarih(d.deneme_bitis)}</b> (${d.gun_kalan} gün kaldı) — tüm özellikler açık</div>`;
  if (d.asama === 'gecikti') return html`<div class="aok-detay"><i class="fa-solid fa-triangle-exclamation"></i> Son ödeme alınamadı, erişim kısıtlandı</div>`;
  return html`<div class="aok-detay"><i class="fa-solid fa-lock"></i> Kayıt ve özellik kısıtlamaları uygulanıyor</div>`;
}

function proEylemler(d, yetkili) {
  if (!yetkili) return html`<div class="aok-eylem"><p class="soluk">Aboneliği hesap sahibi veya yönetici yönetebilir.</p></div>`;
  if (d.asama === 'pro_iptal_bekliyor') return html`<div class="aok-eylem"><button class="dugme birincil" data-eylem="surdur"><i class="fa-solid fa-rotate-left"></i> Aboneliği sürdür</button></div>`;
  return html`<div class="aok-eylem"><button class="dugme" data-eylem="yukselt"><i class="fa-solid fa-arrow-up"></i> Süre uzat / plan değiştir</button><button class="dugme tehlike-metin" data-eylem="iptal">Aboneliği iptal et</button></div>`;
}

function kullanimKart(d) {
  const k = d.kullanim, l = d.limitler;
  const olcer = (etiket, kullanilan, limit, birim = '') => {
    const sinirsiz = !limit || limit <= 0;
    const oran = sinirsiz ? 0 : Math.min(100, Math.round(kullanilan / limit * 100));
    const dolu = !sinirsiz && kullanilan >= limit;
    return html`<div class="kullanim-olcer ${dolu ? 'dolu' : ''}">
      <div class="ko-ust"><span>${etiket}</span><b>${kullanilan}${birim} ${sinirsiz ? '' : `/ ${limit}${birim}`}</b></div>
      ${sinirsiz ? html`<div class="soluk" style="font-size:12px">Sınırsız</div>` : ilerleme(oran, dolu ? 'tehlike' : oran > 80 ? 'uyari' : '')}</div>`;
  };
  const kapaliOzellikler = Object.entries(l.ozellikler || {}).filter(([, v]) => !v).map(([k2]) => OZELLIK_AD[k2] || k2);
  return html`<div class="kart">
    <div class="kart-baslik"><h2><i class="fa-solid fa-gauge"></i> Demo kullanımınız</h2></div>
    <div class="kullanim-izgara">
      ${olcer('Toplam kayıt', k.toplam_kayit, l.toplam_kayit)}
      ${olcer('Kullanıcı', k.kullanici, l.kullanici)}
      ${olcer('Medya deposu', k.medya_mb, l.medya_mb, ' MB')}
    </div>
    ${l.kapali_moduller && l.kapali_moduller.length ? html`<p class="soluk" style="margin-top:10px"><b>Demoda kapalı modüller:</b> ${l.kapali_moduller.join(', ')}</p>` : ''}
    ${kapaliOzellikler.length ? html`<p class="soluk" style="margin-top:4px"><b>Pro ile açılacak:</b> ${kapaliOzellikler.join(', ')}</p>` : ''}
  </div>`;
}

function planKarsilastir(d, f, yetkili) {
  return html`<div class="kart plan-kart">
    <div class="kart-baslik"><h2><i class="fa-solid fa-crown"></i> Defterdar Pro ile neler açılır?</h2></div>
    <div class="pro-ozellik-izgara">
      ${PRO_OZELLIKLER.map(([ik, ad, ac]) => html`<div class="pro-ozellik"><div class="po-ikon"><i class="fa-solid ${ik}"></i></div><div><b>${ad}</b><small>${ac}</small></div></div>`)}
    </div>
    <div class="plan-fiyat-kutu">
      <div class="pfk-fiyat"><div class="pfk-ana">${para(f.aylik)}<span>/ay</span></div><div class="pfk-alt">veya yıllık ${para(f.yillik)} (2 ay avantajlı)</div></div>
      ${yetkili ? html`<button class="dugme birincil buyuk" data-eylem="yukselt"><i class="fa-solid fa-crown"></i> Pro'ya geç</button>` : html`<span class="soluk">Yükseltme için yöneticinize başvurun</span>`}
    </div>
  </div>`;
}
function proOzetKart() {
  return html`<div class="kart plan-kart">
    <div class="kart-baslik"><h2><i class="fa-solid fa-circle-check" style="color:var(--basari)"></i> Pro özellikleriniz aktif</h2></div>
    <div class="pro-ozellik-izgara">
      ${PRO_OZELLIKLER.map(([ik, ad]) => html`<div class="pro-ozellik aktif"><div class="po-ikon"><i class="fa-solid fa-check"></i></div><div><b>${ad}</b></div></div>`)}
    </div>
  </div>`;
}

function odemeTablo(liste) {
  if (!liste.length) return html`<div class="bos-durum" style="padding:30px"><i class="fa-solid fa-receipt"></i><p>Henüz ödeme kaydınız yok</p></div>`;
  const durumR = { basarili: ['basari', 'Ödendi'], bekliyor: ['uyari', 'Bekliyor'], basarisiz: ['tehlike', 'Başarısız'], iade: ['notr', 'İade'] };
  return html`<div class="tablo-kaydir"><table class="tablo">
    <thead><tr><th>Makbuz No</th><th>Tarih</th><th>Dönem</th><th>Açıklama</th><th class="sag">Tutar</th><th>Durum</th><th></th></tr></thead>
    <tbody>${liste.map(o => { const dr = durumR[o.durum] || ['notr', o.durum]; return html`<tr>
      <td>${o.makbuz_no || '—'}</td><td>${tarih(o.tarih, true)}</td>
      <td>${donemAd(o.donem)}</td><td>${o.aciklama || (o.plan === 'pro' ? 'Defterdar Pro' : '—')}${o.kart_ozet ? html`<br><small class="soluk">${o.kart_ozet}</small>` : ''}</td>
      <td class="sag"><b>${para(o.tutar, false)} ${o.para_birimi === 'TRY' ? '₺' : o.para_birimi}</b></td>
      <td><span class="rozet rozet-${dr[0]}">${dr[1]}</span></td>
      <td class="sag">${o.durum === 'basarili' ? html`<a class="ikon-dugme" href="/api/abonelik/odemeler/${o.id}/makbuz" target="_blank" title="Makbuzu görüntüle"><i class="fa-solid fa-eye"></i></a><button class="ikon-dugme" data-eylem="makbuzIndir" data-id="${o.id}" title="Makbuzu indir"><i class="fa-solid fa-download"></i></button>` : ''}</td>
    </tr>`; })}</tbody>
  </table></div>`;
}
function donemAd(d) { if (!d) return '—'; const [y, m] = String(d).split('-'); if (!m) return d; return new Date(+y, +m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }); }

// ─── Satın alma modalı ───
function yukseltModal(d) {
  const f = d.fiyat;
  const saglayicilar = d.saglayicilar || [];
  let periyot = 'aylik';
  const m = modal({
    baslik: 'Defterdar Pro', genis: true, sinif: 'yukselt-satin',
    icerik: html`
      <div class="satin-periyot" id="periyot-sec">
        <button class="sp-sec aktif" data-p="aylik"><b>Aylık</b><span>${para(f.aylik)}/ay</span></button>
        <button class="sp-sec" data-p="yillik"><b>Yıllık</b><span>${para(f.yillik)}/yıl</span><em>2 ay avantajlı</em></button>
      </div>
      <h4 style="margin:18px 0 8px">Ödeme yöntemi</h4>
      ${saglayicilar.length ? html`<div class="odeme-yontemleri" id="yontem-sec">
        ${saglayicilar.map((s, i) => html`<label class="odeme-yontem"><input type="radio" name="yontem" value="${s.anahtar}" ${i === 0 ? 'checked' : ''}><span class="oy-govde"><b>${s.ad}</b>${s.test_modu ? html`<em class="rozet rozet-uyari" style="margin-left:6px">Test</em>` : ''}<small>${s.aciklama || ''}</small></span></label>`)}
      </div>` : html`<div class="bos-durum" style="padding:20px"><i class="fa-solid fa-credit-card"></i><p>Henüz aktif bir ödeme yöntemi tanımlanmamış. Lütfen yöneticinizle görüşün.</p></div>`}
      <div class="satin-ozet" id="satin-ozet"><span>Ödenecek tutar</span><b id="satin-tutar">${para(f.aylik)}</b></div>`,
    altlik: html`<button class="dugme" data-kapat>Vazgeç</button><button class="dugme birincil" id="satin-btn" ${!saglayicilar.length ? 'disabled' : ''}><i class="fa-solid fa-lock"></i> Güvenli öde</button>`,
  });
  const tutarEl = $('#satin-tutar', m.el);
  $('#periyot-sec', m.el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    periyot = b.dataset.p; $$('.sp-sec', m.el).forEach(x => x.classList.toggle('aktif', x === b));
    tutarEl.textContent = para(periyot === 'yillik' ? f.yillik : f.aylik);
  });
  const btn = $('#satin-btn', m.el);
  if (btn) btn.addEventListener('click', async () => {
    const yontem = (m.el.querySelector('input[name=yontem]:checked') || {}).value;
    if (!yontem) return bildir('Ödeme yöntemi seçin', 'uyari');
    btn.disabled = true; btn.classList.add('yukleniyor');
    try {
      const r = await api('POST', '/abonelik/baslat', { saglayici: yontem, periyot });
      if (r.yontem === 'yonlendirme') { window.location.href = r.url; return; }
      if (r.yontem === 'talimat') { m.kapat(); return havaleModal(r.talimat); }
      m.kapat();
      bildir('Ödemeniz alındı, Pro aboneliğiniz etkinleştirildi. Makbuz e-postanıza gönderildi.', 'basari', 6000);
      const kok = document.getElementById('icerik'); tazele(kok);
    } catch (e) { hataGoster(e); btn.disabled = false; btn.classList.remove('yukleniyor'); }
  });
}

function havaleModal(t) {
  const satir = (e, v) => v ? html`<div class="havale-satir"><span>${e}</span><b>${v}</b></div>` : '';
  modal({
    baslik: 'Banka havalesi ile ödeme',
    icerik: html`<p class="soluk">Aşağıdaki hesaba ödeme yaptıktan sonra aboneliğiniz onaylandığında Pro aktifleşir ve makbuzunuz gönderilir.</p>
      <div class="havale-kutu">
        ${satir('Hesap sahibi', t.hesap_sahibi)}${satir('Banka', t.banka)}${satir('IBAN', t.iban)}
        ${satir('Tutar', para(t.tutar))}${satir('Açıklama', t.referans)}
      </div>
      ${t.aciklama ? html`<p class="soluk" style="margin-top:10px">${t.aciklama}</p>` : ''}`,
    altlik: html`<button class="dugme birincil" data-kapat>Anladım</button>`,
  });
}
