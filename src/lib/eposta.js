'use strict';
// Bağımlılıksız SMTP istemcisi (STARTTLS veya SSL) ve markalı Defterdar makbuz/e-posta tasarımı.
const net = require('net');
const tls = require('tls');
const g = require('./guvenlik');
const O = require('./oturum');

function smtpAyar() {
  return {
    host: O.ayar('smtp_host', ''),
    port: parseInt(O.ayar('smtp_port', '587'), 10) || 587,
    guvenli: O.ayar('smtp_guvenli', 'starttls'), // ssl | starttls | yok
    kullanici: O.ayar('smtp_kullanici', ''),
    sifre: g.coz(O.ayar('smtp_sifre', '')) || '',
    gonderen: O.ayar('smtp_gonderen', '') || O.ayar('smtp_kullanici', ''),
    gonderenAd: O.ayar('smtp_gonderen_ad', 'Defterdar') || 'Defterdar',
  };
}
function yapili() { const a = smtpAyar(); return !!(a.host && a.gonderen); }

const kac = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ─── Düşük seviye SMTP ───
function smtpKonus(soket, komut, beklenen) {
  return new Promise((coz, red) => {
    let tampon = '';
    const temizle = () => { soket.removeListener('data', veri); clearTimeout(zaman); };
    const zaman = setTimeout(() => { temizle(); red(new Error('SMTP zaman aşımı')); }, 20000);
    const veri = (p) => {
      tampon += p.toString('utf8');
      // Çok satırlı yanıt: son satır "250 " gibi boşluklu kod ile biter
      const satirlar = tampon.split(/\r?\n/).filter(Boolean);
      const son = satirlar[satirlar.length - 1];
      if (!son || !/^\d{3}[ ]/.test(son)) return;
      temizle();
      const kod = parseInt(son.slice(0, 3), 10);
      if (beklenen && !beklenen.includes(kod)) return red(new Error(`SMTP ${kod}: ${son.slice(4)}`));
      coz({ kod, metin: tampon });
    };
    soket.on('data', veri);
    if (komut !== null) soket.write(komut + '\r\n');
  });
}

async function gonder({ to, konu, html, metin }) {
  const a = smtpAyar();
  if (!a.host || !a.gonderen) throw new Error('SMTP yapılandırılmamış. Yönetim panelinden SMTP ayarlarını girin.');
  const alicilar = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!alicilar.length) throw new Error('Alıcı yok');
  const ssl = a.guvenli === 'ssl' || a.port === 465;

  let soket = ssl
    ? tls.connect({ host: a.host, port: a.port, servername: a.host })
    : net.connect({ host: a.host, port: a.port });
  soket.setTimeout(20000);

  await new Promise((coz, red) => { soket.once(ssl ? 'secureConnect' : 'connect', coz); soket.once('error', red); soket.once('timeout', () => red(new Error('SMTP bağlantı zaman aşımı'))); });

  try {
    await smtpKonus(soket, null, [220]);
    await smtpKonus(soket, 'EHLO defterdar', [250]);
    if (!ssl && a.guvenli !== 'yok') {
      await smtpKonus(soket, 'STARTTLS', [220]);
      soket = tls.connect({ socket: soket, host: a.host, servername: a.host });
      await new Promise((coz, red) => { soket.once('secureConnect', coz); soket.once('error', red); });
      await smtpKonus(soket, 'EHLO defterdar', [250]);
    }
    if (a.kullanici && a.sifre) {
      await smtpKonus(soket, 'AUTH LOGIN', [334]);
      await smtpKonus(soket, Buffer.from(a.kullanici).toString('base64'), [334]);
      await smtpKonus(soket, Buffer.from(a.sifre).toString('base64'), [235]);
    }
    await smtpKonus(soket, `MAIL FROM:<${a.gonderen}>`, [250]);
    for (const alc of alicilar) await smtpKonus(soket, `RCPT TO:<${alc}>`, [250, 251]);
    await smtpKonus(soket, 'DATA', [354]);

    const sinir = 'dd_' + g.rastgele(12);
    const basliklar = [
      `From: =?UTF-8?B?${Buffer.from(a.gonderenAd).toString('base64')}?= <${a.gonderen}>`,
      `To: ${alicilar.join(', ')}`,
      `Subject: =?UTF-8?B?${Buffer.from(String(konu || '')).toString('base64')}?=`,
      'MIME-Version: 1.0', `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${g.rastgele(16)}@defterdar>`,
      `Content-Type: multipart/alternative; boundary="${sinir}"`,
    ].join('\r\n');
    const govde = [
      '', `--${sinir}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
      Buffer.from(metin || String(html).replace(/<[^>]+>/g, ' ')).toString('base64').replace(/(.{76})/g, '$1\r\n'),
      `--${sinir}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
      Buffer.from(String(html || '')).toString('base64').replace(/(.{76})/g, '$1\r\n'),
      `--${sinir}--`, '',
    ].join('\r\n');
    // Nokta kaçışı (satır başındaki tek nokta)
    const mesaj = (basliklar + '\r\n' + govde).replace(/\r?\n\./g, '\r\n..');
    await smtpKonus(soket, mesaj + '\r\n.', [250]);
    await smtpKonus(soket, 'QUIT', [221]).catch(() => {});
    return { ok: true };
  } finally {
    try { soket.end(); soket.destroy(); } catch (e) { /* */ }
  }
}

// ─── Tutarı yazıyla (makbuz için) ───
const BIRLER = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const ONLAR = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
function ucBasamak(n) {
  let s = '';
  const y = Math.floor(n / 100), o = Math.floor((n % 100) / 10), b = n % 10;
  if (y) s += (y > 1 ? BIRLER[y] : '') + 'yüz';
  s += ONLAR[o] + BIRLER[b];
  return s;
}
function yaziyla(tutar) {
  let n = Math.floor(Math.abs(tutar));
  const kurus = Math.round((Math.abs(tutar) - n) * 100);
  if (n === 0 && !kurus) return 'sıfır TL';
  const gruplar = [];
  const birimler = ['', 'bin', 'milyon', 'milyar'];
  let i = 0;
  while (n > 0) {
    const parca = n % 1000;
    if (parca) {
      let p = ucBasamak(parca);
      if (i === 1 && parca === 1) p = ''; // "bin" (bir bin değil)
      gruplar.unshift(p + birimler[i]);
    }
    n = Math.floor(n / 1000); i++;
  }
  let s = gruplar.join('') || 'sıfır';
  s = s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
  return s + ' TL' + (kurus ? ' ' + ucBasamak(kurus) + ' Kuruş' : '');
}

const paraF = (n, para = 'TRY') => {
  const sembol = { TRY: '₺', USD: '$', EUR: '€' }[para] || para + ' ';
  const s = (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return para === 'TRY' ? s + ' ' + sembol : sembol + s;
};
const tarihF = (t) => { const d = new Date(String(t).includes('T') || String(t).includes(' ') ? String(t).replace(' ', 'T') + (String(t).includes('Z') ? '' : 'Z') : t); return isNaN(d) ? String(t) : d.toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

// ─── Markalı makbuz HTML (e-posta + indirme + yazdırma) ───
function kurumBilgi() {
  return {
    ad: O.ayar('fatura_kurum_ad', 'Defterdar') || 'Defterdar',
    adres: O.ayar('fatura_kurum_adres', ''),
    vergi: O.ayar('fatura_kurum_vergi', ''),
    iban: O.ayar('fatura_kurum_iban', ''),
    telefon: O.ayar('fatura_kurum_telefon', ''),
    eposta: O.ayar('fatura_kurum_eposta', '') || smtpAyar().gonderen,
    site: O.ayar('site_adi', 'Defterdar'),
  };
}

function makbuzHtml(odeme, hesap, { gomulu = false } = {}) {
  const k = kurumBilgi();
  const durumRozet = odeme.durum === 'basarili'
    ? '<span style="background:#dcfce7;color:#166534;padding:4px 12px;border-radius:999px;font-size:13px;font-weight:600">Ödendi</span>'
    : odeme.durum === 'iade' ? '<span style="background:#fef9c3;color:#854d0e;padding:4px 12px;border-radius:999px;font-size:13px;font-weight:600">İade edildi</span>'
      : '<span style="background:#fee2e2;color:#991b1b;padding:4px 12px;border-radius:999px;font-size:13px;font-weight:600">Başarısız</span>';
  const planAd = (odeme.plan === 'pro' ? 'Defterdar Pro' : 'Defterdar') + ' — ' + (odeme.periyot === 'yillik' ? 'Yıllık abonelik' : 'Aylık abonelik');
  const donemAd = (() => { const [y, m] = String(odeme.donem || '').split('-'); if (!y) return '—'; return new Date(+y, +m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }); })();
  const kdvOrani = Number(O.ayar('fatura_kdv_orani', '20')) || 0;
  const toplam = Number(odeme.tutar) || 0;
  const matrah = kdvOrani ? toplam / (1 + kdvOrani / 100) : toplam;
  const kdv = toplam - matrah;

  const govde = `
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(2,6,23,.08);font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a">
    <div style="background:linear-gradient(135deg,#0d9488 0%,#0f766e 45%,#115e59 100%);padding:34px 36px;color:#fff">
      <table width="100%" style="border-collapse:collapse"><tr>
        <td style="vertical-align:middle">
          <div style="display:inline-flex;align-items:center;gap:12px">
            <div style="width:46px;height:46px;border-radius:12px;background:rgba(255,255,255,.18);display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;line-height:46px;text-align:center">D</div>
            <div><div style="font-size:21px;font-weight:800;letter-spacing:.3px">${kac(k.ad)}</div><div style="opacity:.85;font-size:13px">Tahsilat Makbuzu</div></div>
          </div>
        </td>
        <td style="text-align:right;vertical-align:middle">
          <div style="font-size:12px;opacity:.85">Makbuz No</div>
          <div style="font-size:17px;font-weight:700">${kac(odeme.makbuz_no || '—')}</div>
        </td>
      </tr></table>
    </div>
    <div style="padding:28px 36px">
      <table width="100%" style="border-collapse:collapse;font-size:14px">
        <tr>
          <td style="vertical-align:top;padding-bottom:18px">
            <div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Aboneye</div>
            <div style="font-weight:700;font-size:15px">${kac(hesap && hesap.ad || '—')}</div>
            ${hesap && hesap.eposta ? `<div style="color:#475569">${kac(hesap.eposta)}</div>` : ''}
            ${hesap && hesap.vergi_no ? `<div style="color:#475569">VKN/TCKN: ${kac(hesap.vergi_no)}</div>` : ''}
          </td>
          <td style="vertical-align:top;text-align:right;padding-bottom:18px">
            <div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Tarih</div>
            <div style="font-weight:600">${tarihF(odeme.tarih)}</div>
            <div style="margin-top:8px">${durumRozet}</div>
          </td>
        </tr>
      </table>

      <table width="100%" style="border-collapse:collapse;margin-top:8px;font-size:14px">
        <thead><tr style="background:#f1f5f9;color:#334155">
          <th align="left" style="padding:11px 14px;border-radius:8px 0 0 8px;font-weight:600">Açıklama</th>
          <th align="center" style="padding:11px 14px;font-weight:600">Dönem</th>
          <th align="right" style="padding:11px 14px;border-radius:0 8px 8px 0;font-weight:600">Tutar</th>
        </tr></thead>
        <tbody>
          <tr>
            <td style="padding:14px;border-bottom:1px solid #e2e8f0">
              <div style="font-weight:600">${kac(planAd)}</div>
              ${odeme.kart_ozet ? `<div style="color:#64748b;font-size:12.5px;margin-top:3px">${kac(odeme.kart_ozet)}</div>` : ''}
              ${odeme.aciklama ? `<div style="color:#64748b;font-size:12.5px;margin-top:3px">${kac(odeme.aciklama)}</div>` : ''}
            </td>
            <td align="center" style="padding:14px;border-bottom:1px solid #e2e8f0;color:#475569">${kac(donemAd)}</td>
            <td align="right" style="padding:14px;border-bottom:1px solid #e2e8f0;font-weight:600">${paraF(matrah, odeme.para_birimi)}</td>
          </tr>
        </tbody>
      </table>

      <table width="100%" style="border-collapse:collapse;margin-top:14px;font-size:14px">
        <tr><td></td><td style="width:230px">
          <table width="100%" style="border-collapse:collapse">
            <tr><td style="padding:5px 0;color:#64748b">Ara toplam</td><td align="right" style="padding:5px 0">${paraF(matrah, odeme.para_birimi)}</td></tr>
            ${kdvOrani ? `<tr><td style="padding:5px 0;color:#64748b">KDV (%${kdvOrani})</td><td align="right" style="padding:5px 0">${paraF(kdv, odeme.para_birimi)}</td></tr>` : ''}
            <tr><td style="padding:10px 0;border-top:2px solid #0f172a;font-weight:800;font-size:16px">Genel Toplam</td><td align="right" style="padding:10px 0;border-top:2px solid #0f172a;font-weight:800;font-size:16px;color:#0f766e">${paraF(toplam, odeme.para_birimi)}</td></tr>
          </table>
        </td></tr>
      </table>
      <div style="margin-top:6px;color:#475569;font-size:12.5px;font-style:italic">Yalnız: ${kac(yaziyla(toplam))}</div>

      <div style="margin-top:26px;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;font-size:12.5px;color:#475569;line-height:1.7">
        ${k.adres ? `<div><strong style="color:#334155">${kac(k.ad)}</strong> — ${kac(k.adres)}</div>` : `<div><strong style="color:#334155">${kac(k.ad)}</strong></div>`}
        <div>${[k.vergi ? 'Vergi No: ' + kac(k.vergi) : '', k.telefon ? 'Tel: ' + kac(k.telefon) : '', k.eposta ? kac(k.eposta) : ''].filter(Boolean).join(' &nbsp;•&nbsp; ')}</div>
        ${k.iban ? `<div>IBAN: ${kac(k.iban)}</div>` : ''}
        ${odeme.saglayici_islem_no ? `<div>İşlem No: ${kac(odeme.saglayici_islem_no)}</div>` : ''}
      </div>
      <div style="margin-top:18px;text-align:center;color:#94a3b8;font-size:12px">Bu makbuz ${kac(k.site)} tarafından elektronik olarak düzenlenmiştir.</div>
    </div>
  </div>`;

  if (gomulu) return govde;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Makbuz ${kac(odeme.makbuz_no || '')}</title></head><body style="margin:0;padding:28px 14px;background:#f1f5f9">${govde}</body></html>`;
}

// E-posta gövdesi (makbuz + kısa selam)
function makbuzEpostaHtml(odeme, hesap) {
  const k = kurumBilgi();
  return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
    <div style="max-width:640px;margin:0 auto 16px;text-align:center;color:#334155;font-size:14px">
      Merhaba, <strong>${kac(hesap && hesap.ad || '')}</strong> aboneliğiniz için ödemeniz alınmıştır. Makbuzunuz aşağıdadır.
    </div>
    ${makbuzHtml(odeme, hesap, { gomulu: true })}
    <div style="max-width:640px;margin:14px auto 0;text-align:center;color:#94a3b8;font-size:12px">
      Aboneliğinizi dilediğiniz zaman uygulamadan yönetebilirsiniz. Bu e-posta ${kac(k.site)} tarafından gönderildi.
    </div>
  </body></html>`;
}

async function makbuzGonder(odeme, hesap) {
  const alici = (hesap && hesap.eposta) || null;
  if (!alici) return { ok: false, neden: 'Hesapta e-posta yok' };
  if (!yapili()) return { ok: false, neden: 'SMTP yapılandırılmamış' };
  const konu = `Defterdar • Ödeme makbuzu ${odeme.makbuz_no || ''}`;
  await gonder({ to: alici, konu, html: makbuzEpostaHtml(odeme, hesap) });
  return { ok: true };
}

module.exports = { smtpAyar, yapili, gonder, makbuzHtml, makbuzEpostaHtml, makbuzGonder, yaziyla, kurumBilgi };
