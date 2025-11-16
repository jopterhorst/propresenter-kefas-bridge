// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridgeAPI', {
  start(token, host, port, debugMode, pollInterval, useNotes, notesTrigger) {
    return ipcRenderer.invoke('bridge:start', token, host, port, debugMode, pollInterval, useNotes, notesTrigger);
  },
  stop() {
    return ipcRenderer.invoke('bridge:stop');
  },
  getStatus() {
    return ipcRenderer.invoke('bridge:status');
  },
  onLog(callback) {
    ipcRenderer.on('bridge:log', (_event, msg) => callback(msg));
  },
  onStatus(callback) {
    ipcRenderer.on('bridge:status', (_event, status) => callback(status));
  },
});

// Clipboard API
contextBridge.exposeInMainWorld('clipboard', {
  readText() {
    return ipcRenderer.invoke('clipboard:readText');
  },
  writeText(text) {
    return ipcRenderer.invoke('clipboard:writeText', text);
  },
});


