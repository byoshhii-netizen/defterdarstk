'use strict';
// Son sunucu hatalarını bellekte tutar: yönetim panelinden görülür, hiçbir yere yazılmaz.
const SINIR = 60;
const liste = [];

function ekle(kayit) {
  liste.unshift({ zaman: new Date().toISOString(), ...kayit });
  if (liste.length > SINIR) liste.length = SINIR;
}
function son(n = SINIR) { return liste.slice(0, n); }
function temizle() { const n = liste.length; liste.length = 0; return n; }

module.exports = { ekle, son, temizle };
