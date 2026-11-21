'use strict';
// PostgreSQL işçi iş parçacığı: ana iş parçacığı Atomics.wait ile bekler, sorgu burada asenkron çalışır.
const { workerData } = require('worker_threads');
const { PgIstemci } = require('./pgistemci');

const { port, sinyal, url } = workerData;
const durum = new Int32Array(sinyal);
let istemci = null;

async function hazir() {
  if (istemci && !istemci.kapali) return istemci;
  istemci = new PgIstemci(url);
  await istemci.baglan();
  await istemci.sorgu("SET TIME ZONE 'UTC'");
  return istemci;
}

port.on('message', async (is) => {
  let yanit;
  try {
    const c = await hazir();
    if (is.tip === 'coklu') {
      const sonuclar = [];
      for (const s of is.sorgular) sonuclar.push(await c.sorgu(s.sql, s.params));
      yanit = { sonuclar };
    } else {
      const r = await c.sorgu(is.sql, is.params);
      yanit = { rows: r.rows, rowCount: r.rowCount };
    }
  } catch (e) {
    yanit = { hata: { message: e.message, code: e.code || null, detay: e.detay || null } };
    const sql = e.code && /^[0-9A-Z]{5}$/.test(e.code) && e.code[0] !== 'E';
    if ((!sql || /^(08|57P0)/.test(e.code)) && istemci) { try { istemci.kapat(); } catch (x) { /* */ } istemci = null; }
  }
  port.postMessage(yanit);
  Atomics.store(durum, 0, 1);
  Atomics.notify(durum, 0);
});
