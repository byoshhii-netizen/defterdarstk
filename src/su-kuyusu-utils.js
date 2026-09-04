function hesaplaSuKuyusuOzet(kuyular, bagislar = []) {
  const toplamKuyu = kuyular.length;
  const tamamlanan = kuyular.filter(k => String(k.durum || '').toLowerCase() === 'tamamlandi').length;
  const devam = kuyular.filter(k => String(k.durum || '').toLowerCase() === 'devam').length;
  const butceToplami = kuyular.reduce((sum, k) => sum + Number(k.butce || 0), 0);
  const toplamToplanan = kuyular.reduce((sum, k) => sum + Number(k.toplanan || 0), 0);
  const toplamBagis = Array.isArray(bagislar) && bagislar.length > 0
    ? bagislar.length
    : kuyular.reduce((sum, k) => sum + Number(k.bagis_sayisi || 0), 0);

  return {
    toplam_kuyu: toplamKuyu,
    tamamlanan,
    devam_eden: devam,
    toplam_butce: butceToplami,
    toplam_toplanan: toplamToplanan,
    toplam_bagis: toplamBagis
  };
}

function buildSuKuyusuOrgSummary(org, kuyular = [], bagislar = []) {
  const ozet = hesaplaSuKuyusuOzet(kuyular, bagislar);
  return {
    org_adi: org?.ad || 'Organizasyon',
    org_turu: org?.organizasyon_turu || 'Su kuyusu Organizasyonu',
    toplam_kuyu: ozet.toplam_kuyu,
    tamamlanan_kuyu: ozet.tamamlanan,
    devam_eden_kuyu: ozet.devam_eden,
    toplam_maliyet: ozet.toplam_butce,
    toplam_bagis: ozet.toplam_bagis,
    toplam_toplanan: ozet.toplam_toplanan,
    planlanan_kuyu: Math.max(0, ozet.toplam_kuyu - ozet.tamamlanan - ozet.devam_eden)
  };
}

module.exports = { hesaplaSuKuyusuOzet, buildSuKuyusuOrgSummary };
