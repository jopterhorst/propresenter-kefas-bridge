// main.js - Main window script

// Constants
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = '55056';
const DEFAULT_NOTES_TRIGGER = 'Current Slide Notes';
const DEFAULT_MAX_RECONNECT = '3';
const DEFAULT_RECONNECT_DELAY = '5000';
const DEFAULT_LYRIC_LANGUAGE = 'nl';
const DEFAULT_ALTERNATE_LANGUAGE = 'en';

const logEl = document.getElementById('log');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const connectionDot = document.getElementById('connectionDot');
const connectionText = document.getElementById('connectionText');
const connectionDetails = document.getElementById('connectionDetails');

let bridgeRunning = false;
let connectionStatus = { status: 'disconnected', details: '' };

// Store cleanup functions for listeners
let cleanupListeners = [];

function appendLog(msg) {
  const time = new Date().toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });
  const logLine = `[${time}] ${msg}`;
  const isError = msg.toLowerCase().includes('error') || msg.toLowerCase().includes('failed');
  
  const line = document.createElement('div');
  line.textContent = logLine;
  if (isError) {
    line.className = 'log-error';
  }
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function downloadLog() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `bridge-log-${timestamp}.txt`;
  const logText = Array.from(logEl.children).map(line => line.textContent).join('\n');
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(logText));
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

function updateConnectionStatus() {
  if (bridgeRunning) {
    // Update connection indicator
    const statusMap = {
      'connected': {
        dotClass: 'connected',
        text: 'Stream Connected',
        details: connectionStatus.details || 'Real-time slide changes'
      },
      'connecting': {
        dotClass: 'connecting',
        text: 'Connecting...',
        details: connectionStatus.details || 'Establishing stream connection'
      },
      'error': {
        dotClass: 'error',
        text: 'Connection Error',
        details: connectionStatus.details || 'Check ProPresenter settings'
      },
      'disconnected': {
        dotClass: 'disconnected',
        text: 'Disconnected',
        details: connectionStatus.details || 'No connection to ProPresenter'
      }
    };
    
    const statusInfo = statusMap[connectionStatus.status] || statusMap['disconnected'];
    connectionDot.className = 'connection-dot ' + statusInfo.dotClass;
    connectionText.textContent = statusInfo.text;
    connectionDetails.textContent = statusInfo.details;
  } else {
    connectionDot.className = 'connection-dot disconnected';
    connectionText.textContent = 'Not connected';
    const host = localStorage.getItem('proPresenterHost') || DEFAULT_HOST;
    const port = localStorage.getItem('proPresenterPort') || DEFAULT_PORT;
    connectionDetails.textContent = `Will connect to ${host}:${port}`;
  }
}

function updateButtonStates() {
  console.log(`[BUTTON] Updating button states - bridgeRunning: ${bridgeRunning}`);
  console.log(`[BUTTON] Start button disabled: ${bridgeRunning}, Stop button disabled: ${!bridgeRunning}`);
  startBtn.disabled = bridgeRunning;
  stopBtn.disabled = !bridgeRunning;
}

async function syncBridgeStatus() {
  if (!window.bridgeAPI) return;
  try {
    const response = await window.bridgeAPI.getStatus();
    if (response.success && response.data) {
      bridgeRunning = response.data.isRunning;
      updateConnectionStatus();
      updateButtonStates();
    }
  } catch (err) {
    console.error('Failed to get bridge status:', err);
  }
}

function setupListeners() {
  // Clean up any existing listeners
  cleanupListeners.forEach(cleanup => cleanup());
  cleanupListeners = [];

  if (!window.bridgeAPI) {
    const msg = 'Error: Bridge API not available. Check DevTools (Ctrl+Shift+I or Cmd+Option+I on macOS) for errors.';
    appendLog(msg);
    console.error('window.bridgeAPI is undefined - preload.js may not be loaded');
    console.error('Available APIs:', Object.keys(window).filter(k => k.includes('API') || k.includes('bridge')));
    return;
  }

  console.log('Bridge API loaded successfully');
  
  // Set up IPC listeners and store cleanup functions
  cleanupListeners.push(window.bridgeAPI.onLog(appendLog));
  cleanupListeners.push(window.bridgeAPI.onStatus((status) => {
    console.log(`[STATUS] Received status update:`, status);
    bridgeRunning = status.isRunning;
    updateConnectionStatus();
    updateButtonStates();
  }));
  cleanupListeners.push(window.bridgeAPI.onConnection((connStatus) => {
    console.log(`[CONNECTION] Received connection status:`, connStatus);
    connectionStatus = connStatus;
    updateConnectionStatus();
  }));
}

function cleanup() {
  // Clean up IPC listeners
  cleanupListeners.forEach(cleanup => cleanup());
  cleanupListeners = [];
  
  if (window.bridgeAPI && window.bridgeAPI.removeAllListeners) {
    window.bridgeAPI.removeAllListeners();
  }
}

// Set up button listeners
startBtn.addEventListener('click', () => {
  if (!window.bridgeAPI) {
    appendLog('Error: Bridge API not available.');
    return;
  }
  
  const token = localStorage.getItem('kefasToken');
  if (!token) {
    appendLog('Error: Please set your Kefas token first in Settings.');
    return;
  }
  
  const host = localStorage.getItem('proPresenterHost') || DEFAULT_HOST;
  const port = parseInt(localStorage.getItem('proPresenterPort') || DEFAULT_PORT);
  const useNotes = localStorage.getItem('useNotes') === 'true';
  const notesTrigger = localStorage.getItem('notesTrigger') || DEFAULT_NOTES_TRIGGER;
  const maxReconnect = parseInt(localStorage.getItem('maxReconnectAttempts') || DEFAULT_MAX_RECONNECT);
  const reconnectDelay = parseInt(localStorage.getItem('reconnectDelayMs') || DEFAULT_RECONNECT_DELAY);
  const defaultLyricLanguage = localStorage.getItem('defaultLyricLanguage') || DEFAULT_LYRIC_LANGUAGE;
  const alternateLanguage = localStorage.getItem('alternateLanguage') || DEFAULT_ALTERNATE_LANGUAGE;
  appendLog('Start requested.');
  window.bridgeAPI.start(token, host, port, useNotes, notesTrigger, maxReconnect, reconnectDelay, defaultLyricLanguage, alternateLanguage);
});

stopBtn.addEventListener('click', () => {
  if (!window.bridgeAPI) {
    appendLog('Error: Bridge API not available.');
    return;
  }
  
  appendLog('Stop requested.');
  window.bridgeAPI.stop();
});

document.getElementById('downloadLogBtn').addEventListener('click', downloadLog);

document.getElementById('openSettings').addEventListener('click', () => {
  if (window.bridgeAPI) {
    window.bridgeAPI.openSettings();
  }
});

// Cleanup on window unload
window.addEventListener('beforeunload', cleanup);

// Load and display app info
async function loadAppInfo() {
  try {
    const response = await window.bridgeAPI.getAppInfo();
    if (response.success && response.data) {
      const appInfo = response.data;
      const versionEl = document.getElementById('appVersion');
      const copyrightEl = document.getElementById('appCopyright');
      
      if (versionEl) {
        versionEl.textContent = `Version ${appInfo.version}`;
      }
      if (copyrightEl) {
        const year = new Date().getFullYear();
        copyrightEl.textContent = `© ${year} ${appInfo.author}`;
      }
    }
  } catch (err) {
    console.error('Failed to load app info:', err);
  }
}

// Initialize
setupListeners();
syncBridgeStatus();
updateConnectionStatus();
loadAppInfo();

// Note: Status updates are now event-driven via IPC listeners
// No need for constant polling as status changes are pushed to renderer
