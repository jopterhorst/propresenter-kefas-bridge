// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridgeAPI', {
  start(token, port, debugMode) {
    return ipcRenderer.invoke('bridge:start', token, port, debugMode);
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
