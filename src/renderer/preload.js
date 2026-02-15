// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Store listener cleanup functions
const listeners = new Map();

/**
 * Registers a listener with automatic cleanup capability
 * @param {string} channel - The IPC channel to listen on
 * @param {Function} callback - The callback function to invoke when message is received
 * @returns {Function} Cleanup function to remove the listener
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
 * Cleans up all registered IPC listeners
 * Called automatically on window unload to prevent memory leaks
 */
function cleanupAllListeners() {
  listeners.forEach(cleanup => cleanup());
  listeners.clear();
}

// Cleanup on window unload
window.addEventListener('beforeunload', cleanupAllListeners);

contextBridge.exposeInMainWorld('bridgeAPI', {
  start(token, host, port, useNotes, notesTrigger, maxReconnect, reconnectDelay) {
    return ipcRenderer.invoke('bridge:start', token, host, port, useNotes, notesTrigger, maxReconnect, reconnectDelay);
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
  openSettings() {
    return ipcRenderer.invoke('window:openSettings');
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

// Discovery API
contextBridge.exposeInMainWorld('discoveryAPI', {
  find() {
    return ipcRenderer.invoke('discovery:find');
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


