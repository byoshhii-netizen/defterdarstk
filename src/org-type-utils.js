function normalizeOrgType(value) {
  const text = value !== undefined && value !== null ? value.toString().trim() : '';
  if (!text) return '';
  const key = text.toLowerCase().replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
  if (key.includes('kurban')) return 'Kurban Organizasyonu';
  if (key.includes('su kuyusu')) return 'Su kuyusu Organizasyonu';
  if (key.includes('yardim') || key.includes('yardim ve saha')) return 'Yardım Faaliyeti Organizasyonu';
  if (key.includes('sosyal') || key.includes('kulturel') || key.includes('etkinlik')) return 'Sosyal ve kültürel etkinlik organizasyonu';
  if (key.includes('hayirsever') || key.includes('bagis') || key.includes('dernegi') || key.includes('sosyal-kurulus') || key.includes('stk')) return 'stk';
  if (key.includes('sirket') || key.includes('ticari') || key.includes('kurumsal')) return 'sirket';
  if (key.includes('kisisel') || key.includes('bireysel')) return 'kisisel';
  return text;
}

function normalizeUserKurulusTipi(value) {
  const normalized = normalizeOrgType(value);
  if (normalized === 'stk') return 'stk';
  if (normalized === 'sirket') return 'sirket';
  if (normalized === 'kisisel') return 'kisisel';
  if (normalized === 'diger') return 'diger';
  return 'stk';
}

module.exports = { normalizeOrgType, normalizeUserKurulusTipi };
