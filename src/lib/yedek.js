'use strict';
// Hesap bazlı yedek alma / geri yükleme (kimlik eşlemeli) ve eski İÇDER yedeklerini içe aktarma.
const { db } = require('./db');
const { hata } = require('./http');
const { KAYIT_MODULLERI } = require('../moduller');

const SIRA = ['finans_hesaplari', 'cariler', 'urunler', 'organizasyonlar', 'kurbanlar', 'hisseler', 'bayraklar', 'kayitlar', 'belgeler', 'cek_senet',
  'personeller', 'personel_kayitlari', 'cari_hareketleri', 'finans_hareketleri', 'stok_hareketleri', 'kategoriler', 'butce', 'sms_sablonlar', 'sayaclar'];

function hesapYedegi(hesapId) {
  const hesap = db().prepare('SELECT ad, tur, alt_tur, vergi_no, vergi_dairesi, telefon, eposta, adres, il, web, logo_data, bayrak_data, profil_json, moduller_json, para_birimi FROM hesaplar WHERE id=?').get(hesapId);
  const tablolar = {};
  for (const t of SIRA) tablolar[t] = db().prepare(`SELECT * FROM ${t} WHERE hesap_id=?`).all(hesapId);
  return { defterdar_yedek: 2, tarih: new Date().toISOString(), hesap, tablolar };
}

function kolonlar(tablo) {
  return db().kolonlar(tablo);
}

function ekle(tablo, satir, hesapId) {
  const izinli = kolonlar(tablo);
  const v = { ...satir, hesap_id: hesapId }; delete v.id;
  const k = Object.keys(v).filter(x => izinli.includes(x));
  return db().prepare(`INSERT INTO ${tablo} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...k.map(x => v[x])).lastInsertRowid;
}

function geriYukle(hesapId, yedek) {
  if (!yedek || yedek.defterdar_yedek !== 2 || !yedek.tablolar) throw hata(400, 'Bu dosya bir Defterdar yedeği değil');
  const T = yedek.tablolar;
  const harita = {}; SIRA.forEach(t => { harita[t] = {}; });
  const m = (t, id) => (id === null || id === undefined) ? null : (harita[t][id] ?? null);
  const say = {};
  db().islem(() => {
    // Mevcut verileri temizle
    for (const t of [...SIRA].reverse()) db().prepare(`DELETE FROM ${t} WHERE hesap_id=?`).run(hesapId);
    const ins = (t, satir, deg = {}) => { const yeni = ekle(t, { ...satir, ...deg }, hesapId); if (satir.id !== undefined) harita[t][satir.id] = yeni; say[t] = (say[t] || 0) + 1; return yeni; };
    (T.finans_hesaplari || []).forEach(s => ins('finans_hesaplari', s));
    (T.cariler || []).forEach(s => ins('cariler', s));
    (T.urunler || []).forEach(s => ins('urunler', s));
    (T.organizasyonlar || []).forEach(s => ins('organizasyonlar', s, { finans_hesap_id: m('finans_hesaplari', s.finans_hesap_id) }));
    (T.kurbanlar || []).forEach(s => { if (m('organizasyonlar', s.organizasyon_id)) ins('kurbanlar', s, { organizasyon_id: m('organizasyonlar', s.organizasyon_id) }); });
    (T.hisseler || []).forEach(s => { if (m('kurbanlar', s.kurban_id)) ins('hisseler', s, { kurban_id: m('kurbanlar', s.kurban_id) }); });
    (T.bayraklar || []).forEach(s => ins('bayraklar', s));
    (T.kayitlar || []).forEach(s => ins('kayitlar', s, { olusturan: null }));
    // Kayıt içi ilişkileri eşle
    (T.kayitlar || []).forEach(s => {
      const t = KAYIT_MODULLERI[s.modul]; if (!t) return;
      let v; try { v = JSON.parse(s.veri); } catch (e) { return; }
      t.alanlar.forEach(a => {
        if (a.tip === 'iliski' && v[a.ad]) v[a.ad] = a.hedef.startsWith('kayit:') ? m('kayitlar', v[a.ad]) : a.hedef === 'cari' ? m('cariler', v[a.ad]) : a.hedef === 'finans_hesap' ? m('finans_hesaplari', v[a.ad]) : a.hedef === 'personel' ? m('personeller', v[a.ad]) : null;
        if (a.tip === 'kullanici') v[a.ad] = null;
      });
      db().prepare('UPDATE kayitlar SET veri=? WHERE id=?').run(JSON.stringify(v), m('kayitlar', s.id));
    });
    (T.belgeler || []).forEach(s => {
      let k = []; try { k = JSON.parse(s.kalemler); } catch (e) { /* */ }
      k.forEach(x => { x.urun_id = m('urunler', x.urun_id); });
      ins('belgeler', s, { cari_id: m('cariler', s.cari_id), kalemler: JSON.stringify(k), donusen_id: null, kaynak_id: null, olusturan: null });
    });
    (T.belgeler || []).forEach(s => { if (s.donusen_id || s.kaynak_id) db().prepare('UPDATE belgeler SET donusen_id=?, kaynak_id=? WHERE id=?').run(m('belgeler', s.donusen_id), m('belgeler', s.kaynak_id), m('belgeler', s.id)); });
    (T.cek_senet || []).forEach(s => ins('cek_senet', s, { cari_id: m('cariler', s.cari_id), finans_hesap_id: m('finans_hesaplari', s.finans_hesap_id) }));
    (T.personeller || []).forEach(s => ins('personeller', s));
    (T.personel_kayitlari || []).forEach(s => { if (m('personeller', s.personel_id)) ins('personel_kayitlari', s, { personel_id: m('personeller', s.personel_id) }); });
    const chKaynak = (k, id) => ({ belge: 'belgeler', odeme_belge: 'belgeler', cek_senet: 'cek_senet', cek_senet_iade: 'cek_senet' }[k] ? m({ belge: 'belgeler', odeme_belge: 'belgeler', cek_senet: 'cek_senet', cek_senet_iade: 'cek_senet' }[k], id) : null);
    (T.cari_hareketleri || []).forEach(s => { if (m('cariler', s.cari_id)) ins('cari_hareketleri', s, { cari_id: m('cariler', s.cari_id), kaynak_id: chKaynak(s.kaynak, s.kaynak_id) }); });
    const fhKaynak = (k, id) => {
      if (!k) return null;
      if (k === 'hisse') return m('hisseler', id); if (k.startsWith('kayit:')) return m('kayitlar', id);
      if (k === 'cari_hareket') return m('cari_hareketleri', id); if (k === 'cek_senet') return m('cek_senet', id); if (k === 'personel') return m('personel_kayitlari', id);
      return null;
    };
    (T.finans_hareketleri || []).forEach(s => { if (m('finans_hesaplari', s.finans_hesap_id)) ins('finans_hareketleri', s, { finans_hesap_id: m('finans_hesaplari', s.finans_hesap_id), cari_id: m('cariler', s.cari_id), kaynak_id: fhKaynak(s.kaynak, s.kaynak_id), olusturan: null }); });
    (T.stok_hareketleri || []).forEach(s => { if (m('urunler', s.urun_id)) ins('stok_hareketleri', s, { urun_id: m('urunler', s.urun_id), kaynak_id: s.kaynak === 'belge' ? m('belgeler', s.kaynak_id) : null }); });
    (T.kategoriler || []).forEach(s => ins('kategoriler', s));
    (T.butce || []).forEach(s => ins('butce', s));
    (T.sms_sablonlar || []).forEach(s => ins('sms_sablonlar', s));
    (T.sayaclar || []).forEach(s => db().prepare('INSERT INTO sayaclar (hesap_id, anahtar, deger) VALUES (?,?,?) ON CONFLICT(hesap_id, anahtar) DO UPDATE SET deger=excluded.deger').run(hesapId, s.anahtar, s.deger));
    if (yedek.hesap) {
      const h = yedek.hesap;
      db().prepare('UPDATE hesaplar SET logo_data=COALESCE(?, logo_data), bayrak_data=COALESCE(?, bayrak_data), moduller_json=COALESCE(?, moduller_json) WHERE id=?').run(h.logo_data || null, h.bayrak_data || null, h.moduller_json || null, hesapId);
    }
  });
  return say;
}

// Eski İÇDER Kurban Programı JSON yedeği (versiyon 1.0 / 2.0) → mevcut hesaba ekleme
function icderAktar(hesapId, yedek) {
  if (!yedek || !Array.isArray(yedek.organizasyonlar)) throw hata(400, 'Bu dosya İÇDER Kurban Programı yedeği değil');
  const say = { organizasyon: 0, kurban: 0, hisse: 0 };
  const turler = ['Udhiye', 'Adak', 'Akika', 'Şükür', 'Nafile', 'Vacip', 'Hedy', 'Diğer'];
  db().islem(() => {
    for (const o of yedek.organizasyonlar) {
      const ad = String(o.ad || 'Organizasyon').slice(0, 150), yil = parseInt(o.yil, 10) || new Date().getFullYear();
      const orgId = db().prepare('INSERT INTO organizasyonlar (hesap_id, ad, yil, max_kurban, buyukbas_hisse_fiyati, kucukbas_hisse_fiyati, aciklama, aktif) VALUES (?,?,?,?,?,?,?,?)')
        .run(hesapId, ad, yil, Math.max(1, parseInt(o.max_kurban, 10) || 100), +o.buyukbas_hisse_fiyati || 0, +o.kucukbas_hisse_fiyati || 0, o.aciklama ? String(o.aciklama).slice(0, 1000) : null, o.aktif === 0 ? 0 : 1).lastInsertRowid;
      say.organizasyon++;
      for (const k of (o.kurbanlar || [])) {
        const tur = k.tur === 'kucukbas' ? 'kucukbas' : 'buyukbas';
        const kt = turler.includes(k.kurban_turu) ? k.kurban_turu : 'Udhiye';
        const kid = db().prepare('INSERT INTO kurbanlar (hesap_id, organizasyon_id, kurban_no, tur, kurban_turu, kesen_kisi, kucukbas_sayi, kupe_no, alis_fiyati, fiyat, toplam_hisse, kesildi, kesim_tarihi, aciklama) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(hesapId, orgId, parseInt(k.kurban_no, 10) || 1, tur, kt, k.kesen_kisi || null, parseInt(k.kucukbas_sayi, 10) || 1, k.kupe_no || null, +k.alis_fiyati || 0, +k.alis_fiyati || 0, tur === 'buyukbas' ? 7 : 1, k.kesildi ? 1 : 0, k.kesim_tarihi || null, k.aciklama || null).lastInsertRowid;
        say.kurban++;
        const hs = k.hisseler || [];
        for (let i = 1; i <= (tur === 'buyukbas' ? 7 : 1); i++) {
          const h = hs.find(x => +x.hisse_no === i) || {};
          db().prepare(`INSERT INTO hisseler (hesap_id, kurban_id, hisse_no, bagisci_adi, bagisci_telefon, bagisci_kategori, kimin_adina, kimin_adina_telefon, odeme_durumu, video_ister, aciklama, kurban_turu, vekalet_onay, vekalet_tarihi)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(hesapId, kid, i, h.bagisci_adi || null, h.bagisci_telefon || null, h.bagisci_kategori || 'Genel Bağışçı', h.kimin_adina || null, h.kimin_adina_telefon || null,
            ['bekliyor', 'odendi', 'iptal'].includes(h.odeme_durumu) ? h.odeme_durumu : 'bekliyor', h.video_ister ? 1 : 0, h.aciklama || null, turler.includes(h.kurban_turu) ? h.kurban_turu : kt, h.vekalet_onay ? 1 : 0, h.vekalet_tarihi || null);
          if (h.bagisci_adi) say.hisse++;
        }
      }
    }
    const ya = yedek.yazdirma_ayarlari || {};
    const logo = /^data:image\//.test(ya.logo_data || '') ? ya.logo_data : null;
    if (logo) db().prepare('UPDATE hesaplar SET logo_data=? WHERE id=?').run(logo, hesapId);
  });
  return say;
}

module.exports = { hesapYedegi, geriYukle, icderAktar, SIRA };
