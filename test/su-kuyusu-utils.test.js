const test = require('node:test');
const assert = require('node:assert/strict');
const { hesaplaSuKuyusuOzet, buildSuKuyusuOrgSummary } = require('../src/su-kuyusu-utils');

test('hesaplaSuKuyusuOzet toplam, tamamlanan, devam eden ve bağış sayısını doğru hesaplar', () => {
  const kuyular = [
    { id: 1, butce: 1000, toplanan: 400, durum: 'tamamlandi' },
    { id: 2, butce: 1500, toplanan: 200, durum: 'devam' },
    { id: 3, butce: 800, toplanan: 100, durum: 'planlama' }
  ];
  const bagislar = [
    { kuyu_id: 1, miktar: 100 },
    { kuyu_id: 1, miktar: 300 },
    { kuyu_id: 2, miktar: 200 }
  ];

  const sonuc = hesaplaSuKuyusuOzet(kuyular, bagislar);

  assert.equal(sonuc.toplam_kuyu, 3);
  assert.equal(sonuc.tamamlanan, 1);
  assert.equal(sonuc.devam_eden, 1);
  assert.equal(sonuc.toplam_butce, 3300);
  assert.equal(sonuc.toplam_toplanan, 700);
  assert.equal(sonuc.toplam_bagis, 3);
});

test('buildSuKuyusuOrgSummary organizasyon özetini doğru üretir', () => {
  const kuyular = [
    { id: 1, butce: 1000, toplanan: 400, durum: 'tamamlandi' },
    { id: 2, butce: 1500, toplanan: 200, durum: 'devam' }
  ];
  const bagislar = [{ kuyu_id: 1, miktar: 300 }, { kuyu_id: 2, miktar: 200 }];

  const sonuc = buildSuKuyusuOrgSummary({ ad: 'Su Kuyusu Derneği', organizasyon_turu: 'Su kuyusu Organizasyonu' }, kuyular, bagislar);

  assert.equal(sonuc.org_adi, 'Su Kuyusu Derneği');
  assert.equal(sonuc.toplam_kuyu, 2);
  assert.equal(sonuc.toplam_maliyet, 2500);
  assert.equal(sonuc.tamamlanan_kuyu, 1);
  assert.equal(sonuc.devam_eden_kuyu, 1);
  assert.equal(sonuc.toplam_bagis, 2);
});
