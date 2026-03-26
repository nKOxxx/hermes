const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('ares', {
  platform: process.platform,
  version: '3.0.0',
});
