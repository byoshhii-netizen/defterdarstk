'use strict';
// Genel kayıt motoru: tanımı moduller.js içinde olan tüm STK / iş takibi modülleri.
const { db } = require('../lib/db');
const g = require('../lib/guvenlik');
const { hata } = require('../lib/http');
const O = require('../lib/oturum');
const X = require('../lib/xlsx');
const F = require('../lib/finans');
const { KAYIT_MODULLERI } = require('../moduller');
const { bugun, buAy, copeAt, idListesi, siradakiNo, yuvarla } = require('./ortak');

function tanim(modul) {
  const t = KAYIT_MODULLERI[modul];
  if (!t) throw hata(404, 'Modül bulunamadı');
  return t;
}

function iliskiGecerli(hesapId, hedef, id) {
  id = parseInt(id, 10);
  if (!id) return null;
  let r;
  if (hedef.startsWith('kayit:')) r = db().prepare('SELECT id FROM kayitlar WHERE id=? AND hesap_id=? AND modul=?').get(id, hesapId, hedef.slice(6));
  else if (hedef === 'cari') r = db().prepare('SELECT id FROM cariler WHERE id=? AND hesap_id=?').get(id, hesapId);
  else if (hedef === 'finans_hesap') r = db().prepare('SELECT id FROM finans_hesaplari WHERE id=? AND hesap_id=?').get(id, hesapId);
  else if (hedef === 'personel') r = db().prepare('SELECT id FROM personeller WHERE id=? AND hesap_id=?').get(id, hesapId);
  return r ? id : null;
}

function dogrula(req, t, girdi, mevcut = {}) {
  const v = { ...mevcut };
  for (const a of t.alanlar) {
    if (a.saltOkunur) continue;
    let d = girdi[a.ad];
    switch (a.tip) {
      case 'para': case 'sayi': d = (d === '' || d === null || d === undefined) ? null : yuvarla(g.sayi(d)); break;
      case 'tarih': d = g.tarih(d); break;
      case 'evet': d = d ? 1 : 0; break;
      case 'eposta': d = d ? g.eposta(d) : null; if (girdi[a.ad] && !d) throw hata(400, `${a.etiket} geçerli bir e-posta değil`); break;
      case 'telefon': d = g.metin(d, 30); if (d && !/^[0-9+()\s-]{7,20}$/.test(d)) throw hata(400, `${a.etiket} geçerli bir telefon değil`); break;
      case 'secim': d = g.metin(d, 100); if (d && a.secenekler && !a.secenekler.includes(d)) throw hata(400, `${a.etiket} için geçersiz seçim`); break;
      case 'iliski': d = iliskiGecerli(req.hesapId, a.hedef, d); break;
      case 'kullanici': d = parseInt(d, 10) || null; if (d && !db().prepare('SELECT id FROM kullanicilar WHERE id=? AND hesap_id=?').get(d, req.hesapId)) d = null; break;
      case 'uzun': d = g.metin(d, 5000); break;
      default: d = g.metin(d, 300);
    }
    if (a.zorunlu && (d === null || d === undefined || d === '')) throw hata(400, `${a.etiket} alanı zorunlu`);
    v[a.ad] = d;
  }
  return v;
}

function kayitOku(r) {
  let v = {}; try { v = JSON.parse(r.veri); } catch (e) { /* */ }
  return { id: r.id, ...v, _olusturma: r.olusturma, _guncelleme: r.guncelleme, _baslik: r.baslik };
}

function kasaSenkron(req, modul, t, id, v) {
  if (!t.kasa) return;
  const k = t.kasa;
  const kosulTamam = !k.kosul || Object.entries(k.kosul).every(([a, d]) => v[a] === d);
  F.kaynakHareketiYaz(req.hesapId, 'kayit:' + modul, id, kosulTamam ? {
    finans_hesap_id: v[k.hesap], tarih: v[k.tarih] || bugun(), yon: k.yon, tutar: v[k.tutar], kategori: k.kategori(v),
    aciklama: k.aciklama(v), cari_id: v.tedarikci_id || null, belge_no: t.otoNo ? v[t.otoNo.alan] : null, olusturan: req.kullanici.id,
  } : null);
}

// İlişkili alanların görünen adlarını çözer
function etiketCoz(hesapId, t, kayitlar) {
  const iliskiler = t.alanlar.filter(a => a.tip === 'iliski' || a.tip === 'kullanici');
  if (!iliskiler.length || !kayitlar.length) return kayitlar;
  const onbellek = {};
  const coz = (hedef, id) => {
    const k = hedef + ':' + id;
    if (k in onbellek) return onbellek[k];
    let ad = null;
    if (hedef.startsWith('kayit:')) { const r = db().prepare('SELECT baslik FROM kayitlar WHERE id=? AND hesap_id=?').get(id, hesapId); ad = r && r.baslik; }
    else if (hedef === 'cari') { const r = db().prepare('SELECT unvan FROM cariler WHERE id=? AND hesap_id=?').get(id, hesapId); ad = r && r.unvan; }
    else if (hedef === 'finans_hesap') { const r = db().prepare('SELECT ad FROM finans_hesaplari WHERE id=? AND hesap_id=?').get(id, hesapId); ad = r && r.ad; }
    else if (hedef === 'kullanici') { const r = db().prepare('SELECT ad_soyad FROM kullanicilar WHERE id=? AND hesap_id=?').get(id, hesapId); ad = r && r.ad_soyad; }
    return (onbellek[k] = ad);
  };
  return kayitlar.map(r => {
    const e = {};
    iliskiler.forEach(a => { if (r[a.ad]) e[a.ad] = coz(a.tip === 'kullanici' ? 'kullanici' : a.hedef, r[a.ad]); });
    return { ...r, _etiket: e };
  });
}

function filtrele(list, t, sorgu) {
  const q = (sorgu.q || '').toLocaleLowerCase('tr-TR').trim();
  if (q) list = list.filter(r => Object.entries(r).some(([k, v]) => !k.startsWith('_') && v !== null && String(v).toLocaleLowerCase('tr-TR').includes(q)) ||
    Object.values(r._etiket || {}).some(v => v && String(v).toLocaleLowerCase('tr-TR').includes(q)));
  for (const a of t.alanlar) {
    const f = sorgu['f_' + a.ad];
    if (f !== undefined && f !== '') list = list.filter(r => String(r[a.ad] ?? '') === f);
  }
  if (sorgu.bas || sorgu.bit) {
    const tarihAlani = (t.alanlar.find(a => a.tip === 'tarih') || {}).ad;
    list = list.filter(r => {
      const d = (tarihAlani && r[tarihAlani]) || (r._olusturma || '').slice(0, 10);
      return (!sorgu.bas || d >= sorgu.bas) && (!sorgu.bit || d <= sorgu.bit);
    });
  }
  const sirala = sorgu.sirala, yon = sorgu.yon === 'artan' ? 1 : -1;
  if (sirala) {
    const a = t.alanlar.find(x => x.ad === sirala);
    const sayisal = a && (a.tip === 'para' || a.tip === 'sayi');
    list.sort((x, y) => {
      const p = x[sirala], q2 = y[sirala];
      if (p === q2) return 0; if (p === null || p === undefined) return 1; if (q2 === null || q2 === undefined) return -1;
      return (sayisal ? p - q2 : String(p).localeCompare(String(q2), 'tr')) * yon;
    });
  }
  return list;
}

function ozetHesapla(t, list) {
  const tarihAlani = (t.alanlar.find(a => a.tip === 'tarih') || {}).ad;
  return (t.ozet || []).map(o => {
    let l = list;
    if (o.filtre) l = l.filter(r => Object.entries(o.filtre).every(([k, v]) => r[k] === v));
    if (o.haric) l = l.filter(r => !Object.entries(o.haric).some(([k, v]) => v.includes(r[k])));
    if (o.donem) {
      const alan = o.alanTarih || tarihAlani;
      const on = o.donem === 'ay' ? buAy() : bugun().slice(0, 4);
      l = l.filter(r => String((alan && r[alan]) || r._olusturma || '').startsWith(on));
    }
    if (o.tip === 'say') return { etiket: o.etiket, deger: l.length, bicim: 'sayi' };
    if (o.tip === 'topla') return { etiket: o.etiket, deger: yuvarla(l.reduce((s, r) => s + (Number(r[o.alan]) || 0), 0)), bicim: o.bicim || 'para' };
    if (o.tip === 'amortisman') {
      const net = l.reduce((s, r) => {
        const bedel = Number(r.bedel) || 0, omur = Number(r.omur) || 5;
        if (!r.alis_tarihi || r.durum === 'Elden çıkarıldı') return s + (r.durum === 'Elden çıkarıldı' ? 0 : bedel);
        const yil = (Date.now() - new Date(r.alis_tarihi).getTime()) / (365.25 * 86400000);
        return s + Math.max(0, bedel * (1 - yil / omur));
      }, 0);
      return { etiket: o.etiket, deger: yuvarla(net), bicim: 'para' };
    }
    return { etiket: o.etiket, deger: 0 };
  });
}

function hepsi(hesapId, modul) {
  return db().prepare('SELECT * FROM kayitlar WHERE hesap_id=? AND modul=? ORDER BY id DESC').all(hesapId, modul).map(kayitOku);
}

module.exports = function (app) {
  const r = app.yonlendirici('/api/kayit');
  r.use(O.kullaniciGerekli); r.use(O.yazmaYetkisi);

  r.get('/:modul', (req) => {
    const t = tanim(req.params.modul);
    let list = etiketCoz(req.hesapId, t, hepsi(req.hesapId, req.params.modul));
    const ozet = ozetHesapla(t, list);
    list = filtrele(list, t, req.sorgu);
    const limit = Math.min(1000, Math.max(1, parseInt(req.sorgu.limit, 10) || 50));
    const sayfa = Math.max(1, parseInt(req.sorgu.sayfa, 10) || 1);
    return { toplam: list.length, sayfa, limit, kayitlar: list.slice((sayfa - 1) * limit, sayfa * limit), ozet };
  });

  r.get('/:modul/secenekler', (req) => {
    tanim(req.params.modul);
    const q = (req.sorgu.q || '').toLocaleLowerCase('tr-TR');
    return db().prepare('SELECT id, baslik FROM kayitlar WHERE hesap_id=? AND modul=? ORDER BY baslik LIMIT 1000').all(req.hesapId, req.params.modul)
      .filter(x => !q || String(x.baslik || '').toLocaleLowerCase('tr-TR').includes(q)).slice(0, 200);
  });

  r.get('/:modul/excel', (req, res) => {
    const t = tanim(req.params.modul);
    const list = filtrele(etiketCoz(req.hesapId, t, hepsi(req.hesapId, req.params.modul)), t, req.sorgu);
    const alanlar = t.alanlar;
    res.indir(X.olustur([{
      ad: t.tekil, basliklar: alanlar.map(a => a.etiket), para: alanlar.map((a, i) => a.tip === 'para' ? i : -1).filter(i => i >= 0),
      satirlar: list.map(r => alanlar.map(a => (a.tip === 'iliski' || a.tip === 'kullanici') ? ((r._etiket || {})[a.ad] || '') : r[a.ad] ?? '')),
    }]), `${req.params.modul}-${bugun()}.xlsx`, X.XLSX_TIP);
  });

  r.get('/:modul/:id', (req) => {
    const t = tanim(req.params.modul);
    const k = db().prepare('SELECT * FROM kayitlar WHERE id=? AND hesap_id=? AND modul=?').get(+req.params.id || 0, req.hesapId, req.params.modul);
    if (!k) throw hata(404, 'Kayıt bulunamadı');
    const kayit = etiketCoz(req.hesapId, t, [kayitOku(k)])[0];
    // İlişkili alt kayıtlar (ör. üyenin aidatları, ihtiyaç sahibinin yardımları)
    const bagli = [];
    for (const [m, td] of Object.entries(KAYIT_MODULLERI)) {
      const a = td.alanlar.find(x => x.tip === 'iliski' && x.hedef === 'kayit:' + req.params.modul);
      if (!a) continue;
      const alt = hepsi(req.hesapId, m).filter(x => String(x[a.ad]) === String(k.id));
      if (alt.length) bagli.push({ modul: m, alan: a.ad, kayitlar: alt.slice(0, 100), toplam: alt.length });
    }
    const gecmis = db().prepare('SELECT kim, islem, tarih FROM denetim WHERE hesap_id=? AND hedef=? ORDER BY id DESC LIMIT 20').all(req.hesapId, `${req.params.modul}:${k.id}`);
    return { kayit, bagli, gecmis };
  });

  r.post('/:modul', (req) => {
    const { modul } = req.params;
    const t = tanim(modul);
    const v = dogrula(req, t, req.body);
    const id = db().islem(() => {
      if (t.otoNo) v[t.otoNo.alan] = siradakiNo(req.hesapId, t.otoNo.onek);
      const baslik = String(v[t.baslik] ?? '').slice(0, 200) || t.tekil;
      const yeni = db().prepare('INSERT INTO kayitlar (hesap_id, modul, veri, baslik, olusturan) VALUES (?,?,?,?,?)').run(req.hesapId, modul, JSON.stringify(v), baslik, req.kullanici.id).lastInsertRowid;
      kasaSenkron(req, modul, t, yeni, v);
      return yeni;
    });
    O.denetimYaz(req, `${t.tekil} eklendi`, `${modul}:${id}`, { baslik: v[t.baslik] });
    return { ok: true, id, kayit: { id, ...v } };
  });

  r.put('/:modul/:id', (req) => {
    const { modul } = req.params;
    const t = tanim(modul);
    const k = db().prepare('SELECT * FROM kayitlar WHERE id=? AND hesap_id=? AND modul=?').get(+req.params.id || 0, req.hesapId, modul);
    if (!k) throw hata(404, 'Kayıt bulunamadı');
    const eski = JSON.parse(k.veri);
    const v = dogrula(req, t, req.body, eski);
    db().islem(() => {
      db().prepare("UPDATE kayitlar SET veri=?, baslik=?, guncelleme=datetime('now') WHERE id=?").run(JSON.stringify(v), String(v[t.baslik] ?? '').slice(0, 200) || t.tekil, k.id);
      kasaSenkron(req, modul, t, k.id, v);
    });
    const degisen = Object.keys(v).filter(a => String(v[a] ?? '') !== String(eski[a] ?? ''));
    O.denetimYaz(req, `${t.tekil} güncellendi`, `${modul}:${k.id}`, { alanlar: degisen });
    return { ok: true };
  });

  function sil(req, modul, t, k) {
    copeAt(req.hesapId, 'kayit:' + modul, `${t.tekil}: ${k.baslik || k.id}`, { kayit: k }, req.kullanici.ad_soyad);
    F.kaynakHareketiSil(req.hesapId, 'kayit:' + modul, k.id);
    db().prepare('DELETE FROM kayitlar WHERE id=?').run(k.id);
  }
  r.delete('/:modul/:id', (req) => {
    const { modul } = req.params;
    const t = tanim(modul);
    const k = db().prepare('SELECT * FROM kayitlar WHERE id=? AND hesap_id=? AND modul=?').get(+req.params.id || 0, req.hesapId, modul);
    if (!k) throw hata(404, 'Kayıt bulunamadı');
    db().islem(() => sil(req, modul, t, k));
    O.denetimYaz(req, `${t.tekil} silindi`, `${modul}:${k.id}`, { baslik: k.baslik });
    return { ok: true };
  });
  r.post('/:modul/toplu-sil', (req) => {
    const { modul } = req.params;
    const t = tanim(modul);
    const ids = idListesi(req.body.ids);
    let n = 0;
    db().islem(() => ids.forEach(id => {
      const k = db().prepare('SELECT * FROM kayitlar WHERE id=? AND hesap_id=? AND modul=?').get(id, req.hesapId, modul);
      if (k) { sil(req, modul, t, k); n++; }
    }));
    O.denetimYaz(req, `${n} ${t.tekil} silindi`, modul);
    return { ok: true, silinen: n };
  });
  r.post('/:modul/toplu-guncelle', (req) => {
    const { modul } = req.params;
    const t = tanim(modul);
    const ids = idListesi(req.body.ids);
    const alan = t.alanlar.find(a => a.ad === req.body.alan && a.tip === 'secim');
    if (!alan || !alan.secenekler.includes(req.body.deger)) throw hata(400, 'Geçersiz toplu güncelleme');
    let n = 0;
    db().islem(() => ids.forEach(id => {
      const k = db().prepare('SELECT * FROM kayitlar WHERE id=? AND hesap_id=? AND modul=?').get(id, req.hesapId, modul);
      if (!k) return;
      const v = JSON.parse(k.veri); v[alan.ad] = req.body.deger;
      db().prepare("UPDATE kayitlar SET veri=?, guncelleme=datetime('now') WHERE id=?").run(JSON.stringify(v), k.id);
      kasaSenkron(req, modul, t, k.id, v); n++;
    }));
    O.denetimYaz(req, `${n} ${t.tekil}: ${alan.etiket} → ${req.body.deger}`, modul);
    return { ok: true, guncellenen: n };
  });
  // Excel/CSV'den aktarılmış satırlar (istemci ayrıştırır, sunucu doğrular)
  r.post('/:modul/ice-aktar', { limit: 10 * 1024 * 1024 }, (req) => {
    const { modul } = req.params;
    const t = tanim(modul);
    if (!Array.isArray(req.body.satirlar)) throw hata(400, 'Satır listesi gerekli');
    const satirlar = req.body.satirlar.slice(0, 5000);
    const hatalar = []; let n = 0;
    db().islem(() => satirlar.forEach((s, i) => {
      try {
        const v = dogrula(req, t, s || {});
        if (t.otoNo) v[t.otoNo.alan] = siradakiNo(req.hesapId, t.otoNo.onek);
        const id = db().prepare('INSERT INTO kayitlar (hesap_id, modul, veri, baslik, olusturan) VALUES (?,?,?,?,?)').run(req.hesapId, modul, JSON.stringify(v), String(v[t.baslik] ?? '').slice(0, 200), req.kullanici.id).lastInsertRowid;
        kasaSenkron(req, modul, t, id, v); n++;
      } catch (e) { if (hatalar.length < 50) hatalar.push(`Satır ${i + 2}: ${e.message}`); }
    }));
    O.denetimYaz(req, `${n} ${t.tekil} içe aktarıldı`, modul);
    return { ok: true, eklenen: n, hatalar };
  });

  // ─── Kayıtlı görünümler (NetSuite "saved search" benzeri) ───
  const gv = app.yonlendirici('/api/gorunumler');
  gv.use(O.kullaniciGerekli);
  gv.get('/:modul', (req) => db().prepare('SELECT id, ad, filtre_json FROM kayitli_gorunumler WHERE hesap_id=? AND modul=? AND (kullanici_id IS NULL OR kullanici_id=?) ORDER BY ad')
    .all(req.hesapId, req.params.modul, req.kullanici.id).map(x => ({ id: x.id, ad: x.ad, filtre: JSON.parse(x.filtre_json) })));
  gv.post('/:modul', (req) => {
    const ad = g.metin(req.body.ad, 60); if (!ad) throw hata(400, 'Görünüm adı gerekli');
    const filtre = {};
    Object.entries(req.body.filtre || {}).slice(0, 30).forEach(([k, v]) => { if (/^[a-z_]{1,40}$/.test(k)) filtre[k] = String(v).slice(0, 100); });
    return { ok: true, id: db().prepare('INSERT INTO kayitli_gorunumler (hesap_id, kullanici_id, modul, ad, filtre_json) VALUES (?,?,?,?,?)').run(req.hesapId, req.body.paylasimli ? null : req.kullanici.id, g.metin(req.params.modul, 40), ad, JSON.stringify(filtre)).lastInsertRowid };
  });
  gv.delete('/:modul/:id', (req) => {
    db().prepare('DELETE FROM kayitli_gorunumler WHERE id=? AND hesap_id=? AND (kullanici_id IS NULL OR kullanici_id=?)').run(+req.params.id, req.hesapId, req.kullanici.id);
    return { ok: true };
  });
};

module.exports.hepsi = hepsi;
module.exports.kasaSenkron = kasaSenkron;
