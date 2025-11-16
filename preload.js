// preload.js
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('bridgeAPI', {
  start(token) {
    return ipcRenderer.invoke('bridge:start', token);
  },
  stop() {
    return ipcRenderer.invoke('bridge:stop');
  },
  onLog(callback) {
    ipcRenderer.on('bridge:log', (_event, msg) => callback(msg));
  },
});
