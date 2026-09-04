const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOrgType, normalizeUserKurulusTipi } = require('../src/org-type-utils');

test('normalizeOrgType maps common organization labels to the canonical values', () => {
  assert.equal(normalizeOrgType('su kuyusu organizasyonu'), 'Su kuyusu Organizasyonu');
  assert.equal(normalizeOrgType('yardım faaliyeti organizasyonu'), 'Yardım Faaliyeti Organizasyonu');
  assert.equal(normalizeOrgType('sosyal ve kültürel etkinlik'), 'Sosyal ve kültürel etkinlik organizasyonu');
  assert.equal(normalizeOrgType('kurban organizasyonu'), 'Kurban Organizasyonu');
});

test('normalizeUserKurulusTipi produces consistent account type values', () => {
  assert.equal(normalizeUserKurulusTipi('hayirsever'), 'stk');
  assert.equal(normalizeUserKurulusTipi('bagis-dernegi'), 'stk');
  assert.equal(normalizeUserKurulusTipi('sosyal-kuruluslar'), 'stk');
  assert.equal(normalizeUserKurulusTipi('sirket'), 'sirket');
  assert.equal(normalizeUserKurulusTipi('kisisel'), 'kisisel');
  assert.equal(normalizeUserKurulusTipi('diger'), 'diger');
});
