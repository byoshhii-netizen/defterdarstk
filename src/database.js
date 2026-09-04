const path = require('path');
const fs = require('fs');
const { getDb } = require('./database-base');

// Electron paketi içinde __dirname yazılamaz, userData kullan
function getDataDir() {
  try {
    const { app } = require('electron');
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'data');
  } catch (e) {
    return path.join(__dirname, '..', 'data');
  }
}

const dataDir = getDataDir();
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

module.exports = { getDb: () => getDb({ dataDir, sqliteFileName: 'defterdar-stk.db', postgresConfig: null }) };

