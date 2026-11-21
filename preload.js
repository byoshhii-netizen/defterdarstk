'use strict';
// Sayfaya hiçbir Node.js yeteneği açılmaz; yalnızca platform bilgisi verilir.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('defterdarMasaustu', { platform: process.platform });
