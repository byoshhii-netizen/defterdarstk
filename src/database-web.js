const path = require('path');
const fs = require('fs');
const { getDb } = require('./database-base');

function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try {
    if (fs.existsSync('/data')) {
      fs.accessSync('/data', fs.constants.W_OK);
      return '/data';
    }
  } catch (e) {}
  return path.join(__dirname, '..', 'data');
}

const dataDir = getDataDir();
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

module.exports = { getDb: () => getDb({ dataDir, sqliteFileName: 'defterdar-stk.db', postgresConfig: null }) };

