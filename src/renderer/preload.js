// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Store listener cleanup functions
const listeners = new Map();

/**
 * Register a listener with automatic cleanup capability
 */
function registerListener(channel, callback) {
  const wrappedCallback = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, wrappedCallback);
  
  // Store the cleanup function
  const cleanupKey = `${channel}_${Date.now()}`;
  listeners.set(cleanupKey, () => {
    ipcRenderer.removeListener(channel, wrappedCallback);
  });
  
  // Return cleanup function
  return () => {
    const cleanup = listeners.get(cleanupKey);
    if (cleanup) {
      cleanup();
      listeners.delete(cleanupKey);
    }
  };
}

/**
 * Clean up all registered listeners (called on window unload)
 */
function cleanupAllListeners() {
  listeners.forEach(cleanup => cleanup());
  listeners.clear();
}

// Cleanup on window unload
window.addEventListener('beforeunload', cleanupAllListeners);

contextBridge.exposeInMainWorld('bridgeAPI', {
  start(token, host, port, debugMode, pollInterval, useNotes, notesTrigger, password, maxReconnect, reconnectDelay) {
    return ipcRenderer.invoke('bridge:start', token, host, port, debugMode, pollInterval, useNotes, notesTrigger, password, maxReconnect, reconnectDelay);
  },
  stop() {
    return ipcRenderer.invoke('bridge:stop');
  },
  getStatus() {
    return ipcRenderer.invoke('bridge:status');
  },
  getAppInfo() {
    return ipcRenderer.invoke('app:getInfo');
  },
  onLog(callback) {
    return registerListener('bridge:log', callback);
  },
  onStatus(callback) {
    return registerListener('bridge:status', callback);
  },
  onConnection(callback) {
    return registerListener('bridge:connection', callback);
  },
  removeAllListeners() {
    cleanupAllListeners();
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


