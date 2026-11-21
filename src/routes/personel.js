'use strict';
const { db } = require('../lib/db');
const g = require('../lib/guvenlik');
const { hata } = require('../lib/http');
const O = require('../lib/oturum');
const X = require('../lib/xlsx');
const F = require('../lib/finans');
const { sahip, bugun, copeAt, yuvarla } = require('./ortak');

const KAYIT_TURLERI = { devamsizlik: 'Devamsızlık', izin: 'İzin', avans: 'Avans', maas: 'Maaş', prim: 'Prim / ikramiye', kesinti: 'Kesinti', not: 'Not' };

// Hassas personel bilgileri için isteğe bağlı ikinci PIN
function pinKontrol(req) {
  const h = db().prepare('SELECT personel_pin FROM hesaplar WHERE id=?').get(req.hesapId);
  if (!h || !h.personel_pin) return;
  const hs = g.hizSinir('pin:' + req.kullanici.id, 10, 10 * 60000);
  const pin = req.headers['x-personel-pin'];
  if (!pin) throw hata(403, 'Personel PIN kodu gerekli', { pin_gerekli: true });
  if (!hs.izin) throw hata(429, 'Çok fazla hatalı PIN denemesi. 10 dakika bekleyin.');
  if (!g.sifreDogrula(String(pin), h.personel_pin)) throw hata(403, 'PIN kodu hatalı', { pin_gerekli: true });
}

function personelVerisi(b) {
  const ad = g.metin(b.ad, 60), soyad = g.metin(b.soyad, 60);
  if (!ad || !soyad) throw hata(400, 'Ad ve soyad zorunlu');
  const tc = g.metin(b.tc_no, 11);
  if (tc && !/^[1-9]\d{10}$/.test(tc)) throw hata(400, 'TC kimlik no 11 haneli olmalı');
  return { ad, soyad, tc_no: tc, dogum_tarihi: g.tarih(b.dogum_tarihi), telefon: g.metin(b.telefon, 30), eposta: b.eposta ? g.eposta(b.eposta) : null, adres: g.metin(b.adres, 500),
    pozisyon: g.metin(b.pozisyon, 80), departman: g.metin(b.departman, 80), ise_baslama: g.tarih(b.ise_baslama), isten_cikis: g.tarih(b.isten_cikis), maas: g.sayi(b.maas),
    iban: g.metin(b.iban, 40), banka: g.metin(b.banka, 80), acil_kisi: g.metin(b.acil_kisi, 100), acil_telefon: g.metin(b.acil_telefon, 30), izin_hakki: g.sayi(b.izin_hakki, 14),
    fotograf: b.fotograf ? g.veriResmi(b.fotograf, 1024 * 1024) : null, notlar: g.metin(b.notlar, 2000) };
}

function kayitKasa(req, k, p) {
  const odemeTur = ['maas', 'avans', 'prim'].includes(k.tur);
  F.kaynakHareketiYaz(req.hesapId, 'personel', k.id, odemeTur && k.odendi && k.finans_hesap_id ? {
    finans_hesap_id: k.finans_hesap_id, tarih: k.odeme_tarihi || bugun(), yon: 'cikis', tutar: k.tutar, kategori: k.tur === 'maas' ? 'Maaş' : k.tur === 'avans' ? 'Personel avansı' : 'Prim',
    aciklama: `${p.ad} ${p.soyad} — ${KAYIT_TURLERI[k.tur]}${k.ay ? ' ' + k.ay : ''}`, olusturan: req.kullanici.id,
  } : null);
}

module.exports = function (app) {
  const r = app.yonlendirici('/api/personel');
  r.use(O.kullaniciGerekli); r.use(O.yazmaYetkisi); r.use(O.rolGerekli('muhasebe'));

  r.get('/', (req) => {
    const l = db().prepare('SELECT id, ad, soyad, pozisyon, departman, telefon, aktif, ise_baslama, maas, fotograf FROM personeller WHERE hesap_id=? ORDER BY aktif DESC, ad').all(req.hesapId);
    const pinVar = !!db().prepare('SELECT personel_pin FROM hesaplar WHERE id=?').get(req.hesapId).personel_pin;
    return { personeller: l.map(p => pinVar ? { ...p, maas: null } : p), pin_var: pinVar, toplam_maas: pinVar ? null : yuvarla(l.filter(p => p.aktif).reduce((s, p) => s + (p.maas || 0), 0)) };
  });
  r.post('/', { limit: 3 * 1024 * 1024 }, (req) => {
    const v = personelVerisi(req.body); const k = Object.keys(v);
    const id = db().prepare(`INSERT INTO personeller (hesap_id, ${k.join(',')}) VALUES (?, ${k.map(() => '?').join(',')})`).run(req.hesapId, ...Object.values(v)).lastInsertRowid;
    O.denetimYaz(req, 'Personel eklendi', 'personel:' + id, { ad: v.ad + ' ' + v.soyad });
    return { ok: true, id };
  });
  r.get('/:id', (req) => {
    pinKontrol(req);
    const p = sahip('personeller', req.params.id, req.hesapId);
    const kayitlar = db().prepare('SELECT * FROM personel_kayitlari WHERE hesap_id=? AND personel_id=? ORDER BY COALESCE(tarih, ay) DESC, id DESC').all(req.hesapId, p.id);
    const yil = bugun().slice(0, 4);
    const izinKullanilan = kayitlar.filter(k => k.tur === 'izin' && (k.tarih || '').startsWith(yil) && k.alt_tur !== 'Ücretsiz').reduce((s, k) => s + (k.gun || 0), 0);
    const bekleyenAvans = kayitlar.filter(k => k.tur === 'avans' && !k.odendi).reduce((s, k) => s + k.tutar, 0);
    let kidem = null;
    if (p.ise_baslama) { const y = (Date.now() - new Date(p.ise_baslama).getTime()) / (365.25 * 86400000); kidem = Math.floor(y * 10) / 10; }
    return { personel: p, kayitlar, ozet: { izin_hakki: p.izin_hakki, izin_kullanilan: izinKullanilan, izin_kalan: (p.izin_hakki || 0) - izinKullanilan, bekleyen_avans: yuvarla(bekleyenAvans), devamsizlik: kayitlar.filter(k => k.tur === 'devamsizlik').length, kidem } };
  });
  r.put('/:id', { limit: 3 * 1024 * 1024 }, (req) => {
    pinKontrol(req);
    const p = sahip('personeller', req.params.id, req.hesapId, 'id, fotograf');
    const v = personelVerisi(req.body);
    if (!req.body.fotograf_degisti) v.fotograf = p.fotograf;
    db().prepare(`UPDATE personeller SET ${Object.keys(v).map(k => k + '=?').join(',')}, aktif=? WHERE id=?`).run(...Object.values(v), req.body.aktif === 0 || req.body.aktif === false ? 0 : 1, p.id);
    O.denetimYaz(req, 'Personel güncellendi', 'personel:' + p.id);
    return { ok: true };
  });
  r.delete('/:id', (req) => {
    pinKontrol(req);
    const p = sahip('personeller', req.params.id, req.hesapId);
    const kayitlar = db().prepare('SELECT * FROM personel_kayitlari WHERE personel_id=?').all(p.id);
    db().islem(() => {
      copeAt(req.hesapId, 'personel', `${p.ad} ${p.soyad}`, { personel: p, kayitlar }, req.kullanici.ad_soyad);
      kayitlar.forEach(k => F.kaynakHareketiSil(req.hesapId, 'personel', k.id));
      db().prepare('DELETE FROM personel_kayitlari WHERE personel_id=?').run(p.id);
      db().prepare('DELETE FROM personeller WHERE id=?').run(p.id);
    });
    O.denetimYaz(req, 'Personel silindi', 'personel:' + p.id, { ad: `${p.ad} ${p.soyad}` });
    return { ok: true };
  });

  r.post('/:id/kayit', (req) => {
    pinKontrol(req);
    const p = sahip('personeller', req.params.id, req.hesapId);
    const b = req.body;
    if (!KAYIT_TURLERI[b.tur]) throw hata(400, 'Kayıt türü geçersiz');
    const k = { tur: b.tur, tarih: g.tarih(b.tarih) || (b.tur === 'maas' ? null : bugun()), bitis: g.tarih(b.bitis), ay: b.ay && /^\d{4}-\d{2}$/.test(b.ay) ? b.ay : null,
      tutar: yuvarla(g.sayi(b.tutar)), gun: g.sayi(b.gun), alt_tur: g.metin(b.alt_tur, 60), baslik: g.metin(b.baslik, 150), aciklama: g.metin(b.aciklama, 2000),
      odendi: b.odendi ? 1 : 0, odeme_tarihi: b.odendi ? (g.tarih(b.odeme_tarihi) || bugun()) : null };
    if (['avans', 'maas', 'prim', 'kesinti'].includes(k.tur) && !(k.tutar > 0)) throw hata(400, 'Tutar gerekli');
    if (k.tur === 'maas' && !k.ay) throw hata(400, 'Maaş dönemi (ay) gerekli');
    if (k.tur === 'not' && !k.aciklama) throw hata(400, 'Not içeriği gerekli');
    if (k.tur === 'izin' && k.tarih && k.bitis && !k.gun) k.gun = Math.max(1, Math.round((new Date(k.bitis) - new Date(k.tarih)) / 86400000) + 1);
    const id = db().islem(() => {
      const yeni = db().prepare(`INSERT INTO personel_kayitlari (hesap_id, personel_id, ${Object.keys(k).join(',')}) VALUES (?,?, ${Object.keys(k).map(() => '?').join(',')})`).run(req.hesapId, p.id, ...Object.values(k)).lastInsertRowid;
      kayitKasa(req, { ...k, id: yeni, finans_hesap_id: b.finans_hesap_id }, p);
      return yeni;
    });
    O.denetimYaz(req, `Personel kaydı: ${KAYIT_TURLERI[k.tur]}`, 'personel:' + p.id, { tutar: k.tutar || undefined });
    return { ok: true, id };
  });
  r.post('/kayit/:id/odendi', (req) => {
    pinKontrol(req);
    const k = sahip('personel_kayitlari', req.params.id, req.hesapId);
    const p = sahip('personeller', k.personel_id, req.hesapId);
    const odendi = req.body.odendi ? 1 : 0, tarih = odendi ? (g.tarih(req.body.tarih) || bugun()) : null;
    db().prepare('UPDATE personel_kayitlari SET odendi=?, odeme_tarihi=? WHERE id=?').run(odendi, tarih, k.id);
    kayitKasa(req, { ...k, odendi, odeme_tarihi: tarih, finans_hesap_id: req.body.finans_hesap_id }, p);
    return { ok: true };
  });
  r.delete('/kayit/:id', (req) => {
    pinKontrol(req);
    const k = sahip('personel_kayitlari', req.params.id, req.hesapId);
    db().islem(() => { F.kaynakHareketiSil(req.hesapId, 'personel', k.id); db().prepare('DELETE FROM personel_kayitlari WHERE id=?').run(k.id); });
    return { ok: true };
  });

  // Toplu maaş ödemesi
  r.post('/toplu-maas', (req) => {
    pinKontrol(req);
    const ay = /^\d{4}-\d{2}$/.test(req.body.ay || '') ? req.body.ay : null;
    if (!ay) throw hata(400, 'Dönem seçin');
    const fh = F.finansHesabiGecerli(req.hesapId, req.body.finans_hesap_id);
    if (!fh) throw hata(400, 'Ödemenin yapılacağı kasa/banka hesabını seçin');
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : [];
    let toplam = 0, adet = 0;
    db().islem(() => ids.forEach(id => {
      const p = db().prepare('SELECT * FROM personeller WHERE id=? AND hesap_id=? AND aktif=1').get(id, req.hesapId);
      if (!p || !p.maas) return;
      if (db().prepare("SELECT id FROM personel_kayitlari WHERE personel_id=? AND tur='maas' AND ay=? AND odendi=1").get(p.id, ay)) return;
      const kid = db().prepare("INSERT INTO personel_kayitlari (hesap_id, personel_id, tur, ay, tutar, odendi, odeme_tarihi) VALUES (?,?, 'maas', ?, ?, 1, ?)").run(req.hesapId, p.id, ay, p.maas, bugun()).lastInsertRowid;
      kayitKasa(req, { id: kid, tur: 'maas', ay, tutar: p.maas, odendi: 1, odeme_tarihi: bugun(), finans_hesap_id: fh }, p);
      toplam += p.maas; adet++;
    }));
    O.denetimYaz(req, `${ay} maaşları ödendi`, 'personel', { adet, toplam });
    return { ok: true, adet, toplam: yuvarla(toplam) };
  });

  r.get('/rapor/excel', (req, res) => {
    pinKontrol(req);
    const l = db().prepare('SELECT * FROM personeller WHERE hesap_id=? ORDER BY ad').all(req.hesapId);
    res.indir(X.olustur([{ ad: 'Personel', basliklar: ['Ad', 'Soyad', 'Pozisyon', 'Departman', 'Telefon', 'E-posta', 'İşe başlama', 'Maaş', 'IBAN', 'Durum'], para: [7],
      satirlar: l.map(p => [p.ad, p.soyad, p.pozisyon || '', p.departman || '', p.telefon || '', p.eposta || '', p.ise_baslama || '', p.maas || 0, p.iban || '', p.aktif ? 'Aktif' : 'Ayrıldı']) }]), `personel-${bugun()}.xlsx`, X.XLSX_TIP);
  });
};
