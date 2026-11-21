'use strict';
const { db } = require('./db');
const g = require('./guvenlik');
const { hata } = require('./http');

const CEREZ = { kullanici: 'dd_oturum', admin: 'dd_yonetim' };

function ayar(anahtar, varsayilan = '') {
  const r = db().prepare('SELECT deger FROM sistem_ayarlari WHERE anahtar=?').get(anahtar);
  return r ? r.deger : varsayilan;
}
function ayarYaz(anahtar, deger) {
  db().prepare('INSERT INTO sistem_ayarlari (anahtar, deger) VALUES (?, ?) ON CONFLICT(anahtar) DO UPDATE SET deger=excluded.deger').run(anahtar, String(deger));
}

function oturumAc(req, res, { tip, sahipId, hesapId = null, beniHatirla = false, taklitAdminId = null }) {
  const token = g.rastgele(32);
  const csrf = g.rastgele(24);
  const simdi = Date.now();
  let sure;
  if (tip === 'admin') sure = Math.max(10, +ayar('admin_oturum_dakika', '60')) * 60 * 1000;
  else sure = (beniHatirla ? 24 * 30 : Math.max(1, +ayar('oturum_suresi_saat', '12'))) * 3600 * 1000;
  db().prepare(`INSERT INTO oturumlar (id, tip, sahip_id, hesap_id, csrf, ip, tarayici, gecici, taklit_admin_id, olusturma, son_erisim, bitis)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(g.tokenOzet(token), tip, sahipId, hesapId, csrf, req.ip,
    String(req.headers['user-agent'] || '').slice(0, 200), beniHatirla ? 0 : 1, taklitAdminId, simdi, simdi, simdi + sure);
  res.cerez(CEREZ[tip], token, { sameSite: tip === 'admin' ? 'Strict' : 'Lax', maxAge: beniHatirla || tip === 'admin' ? sure / 1000 : undefined });
  return { csrf };
}

function oturumKapat(req, res, tip) {
  const t = req.cerezler[CEREZ[tip]];
  if (t) db().prepare('DELETE FROM oturumlar WHERE id=?').run(g.tokenOzet(t));
  res.cerez(CEREZ[tip], '', { maxAge: 0, sameSite: tip === 'admin' ? 'Strict' : 'Lax' });
}

function oturumBul(req, tip) {
  const t = req.cerezler[CEREZ[tip]];
  if (!t || t.length > 100) return null;
  const o = db().prepare('SELECT * FROM oturumlar WHERE id=? AND tip=?').get(g.tokenOzet(t), tip);
  if (!o) return null;
  const simdi = Date.now();
  if (o.bitis < simdi) { db().prepare('DELETE FROM oturumlar WHERE id=?').run(o.id); return null; }
  // Kayan süre: yönetici oturumu hareketsizlikte biter
  if (simdi - o.son_erisim > 60000) {
    let yeniBitis = o.bitis;
    if (tip === 'admin') yeniBitis = simdi + Math.max(10, +ayar('admin_oturum_dakika', '60')) * 60000;
    db().prepare('UPDATE oturumlar SET son_erisim=?, bitis=? WHERE id=?').run(simdi, yeniBitis, o.id);
  }
  return o;
}

// Durum değiştiren isteklerde CSRF + köken kontrolü
function csrfKontrol(req, o) {
  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return;
  const kaynak = req.headers.origin;
  if (kaynak) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    try { if (new URL(kaynak).host !== host) throw hata(403, 'Geçersiz istek kaynağı'); }
    catch (e) { if (e.durum) throw e; throw hata(403, 'Geçersiz istek kaynağı'); }
  }
  if (!g.esitMi(req.headers['x-csrf-token'], o.csrf)) throw hata(403, 'Güvenlik doğrulaması başarısız. Sayfayı yenileyin.');
}

const ROL_YETKI = {
  sahip: 100, yonetici: 80, muhasebe: 60, personel: 40, izleyici: 10,
};

// Kullanıcı oturumu gerektirir
function kullaniciGerekli(req) {
  const o = oturumBul(req, 'kullanici');
  if (!o) throw hata(401, 'Oturum açmanız gerekiyor');
  csrfKontrol(req, o);
  const k = db().prepare(`SELECT k.id, k.hesap_id, k.ad_soyad, k.eposta, k.rol, k.durum, k.tercih_json, k.telefon,
      h.ad AS hesap_ad, h.tur AS hesap_tur, h.durum AS hesap_durum
    FROM kullanicilar k JOIN hesaplar h ON h.id=k.hesap_id WHERE k.id=?`).get(o.sahip_id);
  if (!k || k.durum !== 'aktif') throw hata(401, 'Hesabınız kullanıma kapalı');
  if (k.hesap_durum !== 'aktif' && !o.taklit_admin_id) throw hata(403, 'Kurum hesabı askıya alınmış. Destek için yöneticinize başvurun.');
  // Sistem modu (yönetici taklidi hariç)
  const mod = ayar('sistem_modu', 'acik');
  if (mod !== 'acik' && !o.taklit_admin_id) {
    const izinli = ayar('izinli_ipler', '').split(',').map(s => s.trim()).filter(Boolean);
    if (!izinli.includes(req.ip)) throw hata(503, mod === 'bakim' ? 'Sistem bakımda' : 'Sistem geçici olarak kapalı', { sistem_modu: mod, sistem_notu: ayar('sistem_notu', '') });
  }
  req.oturum = o;
  req.kullanici = k;
  req.hesapId = k.hesap_id;
  if (!o._akt || Date.now() - o.son_erisim > 300000) {
    db().prepare("UPDATE hesaplar SET son_aktivite=datetime('now') WHERE id=?").run(k.hesap_id);
  }
}

function rolGerekli(minRol) {
  return (req) => {
    if ((ROL_YETKI[req.kullanici.rol] || 0) < (ROL_YETKI[minRol] || 0)) throw hata(403, 'Bu işlem için yetkiniz yok');
  };
}
// İzleyici rolü yazamaz
function yazmaYetkisi(req) {
  if (req.method !== 'GET' && req.kullanici && req.kullanici.rol === 'izleyici') throw hata(403, 'Salt okunur kullanıcılar değişiklik yapamaz');
}

function adminGerekli(req) {
  const izinli = ayar('admin_izinli_ipler', '').split(',').map(s => s.trim()).filter(Boolean);
  if (izinli.length && !izinli.includes(req.ip)) throw hata(403, 'Bu IP adresinden yönetim paneline erişim kapalı');
  const o = oturumBul(req, 'admin');
  if (!o) throw hata(401, 'Yönetici girişi gerekli');
  csrfKontrol(req, o);
  const a = db().prepare('SELECT id, kullanici_adi, ad_soyad, rol, durum, varsayilan_sifre, totp_aktif FROM adminler WHERE id=?').get(o.sahip_id);
  if (!a || a.durum !== 'aktif') throw hata(401, 'Yönetici hesabı devre dışı');
  req.oturum = o;
  req.admin = a;
  // Varsayılan şifre değiştirilmeden yalnızca şifre değiştirme ve oturum uç noktaları kullanılabilir
  if (a.varsayilan_sifre && !/\/api\/sadmin\/(oturum|cikis|sifre-degistir)$/.test(req.yol)) {
    throw hata(428, 'Devam etmek için varsayılan şifreyi değiştirmeniz gerekiyor', { sifre_degistir: true });
  }
}
function adminRol(...roller) {
  return (req) => { if (!roller.includes(req.admin.rol)) throw hata(403, 'Bu işlem için yönetici yetkiniz yok'); };
}

function denetimYaz(req, islem, hedef = null, detay = null) {
  try {
    const kim = req.admin ? `Yönetici: ${req.admin.kullanici_adi}`
      : req.kullanici ? (req.oturum && req.oturum.taklit_admin_id ? `${req.kullanici.ad_soyad} (yönetici erişimi)` : req.kullanici.ad_soyad) : 'Sistem';
    db().prepare('INSERT INTO denetim (hesap_id, kullanici_id, admin_id, kim, islem, hedef, detay, ip) VALUES (?,?,?,?,?,?,?,?)')
      .run(req.hesapId || (detay && detay.hesap_id) || null, req.kullanici ? req.kullanici.id : null,
        req.admin ? req.admin.id : (req.oturum && req.oturum.taklit_admin_id) || null, kim, islem, hedef,
        detay ? JSON.stringify(detay).slice(0, 4000) : null, req.ip);
  } catch (e) { console.error('[DENETİM]', e.message); }
}

function girisKaydi(req, tip, kimlik, basarili, neden) {
  db().prepare('INSERT INTO giris_kayitlari (tip, kimlik, ip, tarayici, basarili, neden) VALUES (?,?,?,?,?,?)')
    .run(tip, String(kimlik || '').slice(0, 120), req.ip, String(req.headers['user-agent'] || '').slice(0, 200), basarili ? 1 : 0, neden || null);
}

function ipEngelliMi(ip) {
  const r = db().prepare('SELECT bitis FROM ip_engelleri WHERE ip=?').get(ip);
  if (!r) return false;
  if (r.bitis && r.bitis < Date.now()) { db().prepare('DELETE FROM ip_engelleri WHERE ip=?').run(ip); return false; }
  return true;
}

module.exports = {
  ayar, ayarYaz, oturumAc, oturumKapat, oturumBul, kullaniciGerekli, rolGerekli, yazmaYetkisi,
  adminGerekli, adminRol, denetimYaz, girisKaydi, ipEngelliMi, ROL_YETKI, CEREZ,
};
