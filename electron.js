'use strict';
// Defterdar masaüstü sürümü (Windows .exe). Sunucuyu yerelde başlatır ve uygulama penceresinde açar.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

process.env.DATA_DIR = process.env.DATA_DIR || path.join(app.getPath('userData'), 'veri');
const PORT = +process.env.PORT || 4500;
let pencere = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (pencere) { if (pencere.isMinimized()) pencere.restore(); pencere.focus(); } });

async function baslat() {
  // Yerel ağdaki diğer cihazlar da erişebilsin diye 0.0.0.0 dinlenir
  await require('./server').calistir(PORT, process.env.HOST || '0.0.0.0');
  Menu.setApplicationMenu(null);
  pencere = new BrowserWindow({
    width: 1400, height: 900, minWidth: 380, minHeight: 600, title: 'Defterdar', backgroundColor: '#f4f5f7',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  pencere.loadURL(`http://127.0.0.1:${PORT}/panel`);
  // Dış bağlantılar varsayılan tarayıcıda açılır
  pencere.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${PORT}`)) return { action: 'allow' };
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  pencere.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${PORT}`)) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
}

app.whenReady().then(baslat).catch((e) => { console.error(e); app.quit(); });
app.on('window-all-closed', () => app.quit());
