// settings.js - Settings window script

// Constants
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = '55056';
const DEFAULT_NOTES_TRIGGER = 'Current Slide Notes';
const DEFAULT_MAX_RECONNECT = '3';
const DEFAULT_RECONNECT_DELAY_SECONDS = '5';
const MIN_PORT = 1;
const MAX_PORT = 65535;
const MIN_RECONNECT_ATTEMPTS = 1;
const MAX_RECONNECT_ATTEMPTS = 10;
const MIN_RECONNECT_DELAY_SECONDS = 1;
const MAX_RECONNECT_DELAY_SECONDS = 60;

const tokenInput = document.getElementById('tokenInput');
const portInput = document.getElementById('portInput');
const useNotesToggle = document.getElementById('useNotesToggle');
const notesTriggerInput = document.getElementById('notesTriggerInput');
const maxReconnectInput = document.getElementById('maxReconnectInput');
const reconnectDelayInput = document.getElementById('reconnectDelayInput');
const debugToggle = document.getElementById('debugToggle');
const saveBtn = document.getElementById('saveBtn');
const hostInput = document.getElementById('hostInput');

// Load settings from localStorage on startup
function loadSettings() {
  const savedToken = localStorage.getItem('kefasToken');
  if (savedToken) {
    tokenInput.value = savedToken;
  }
  
  const savedHost = localStorage.getItem('proPresenterHost');
  hostInput.value = savedHost || DEFAULT_HOST;
  
  const savedPort = localStorage.getItem('proPresenterPort');
  portInput.value = savedPort || DEFAULT_PORT;
  
  const useNotes = localStorage.getItem('useNotes') === 'true';
  useNotesToggle.checked = useNotes;
  
  const notesTrigger = localStorage.getItem('notesTrigger');
  notesTriggerInput.value = notesTrigger || DEFAULT_NOTES_TRIGGER;
  
  const debugMode = localStorage.getItem('debugMode') === 'true';
  debugToggle.checked = debugMode;
  
  const maxReconnect = localStorage.getItem('maxReconnectAttempts');
  maxReconnectInput.value = maxReconnect || DEFAULT_MAX_RECONNECT;
  
  const reconnectDelay = localStorage.getItem('reconnectDelayMs');
  reconnectDelayInput.value = (reconnectDelay ? parseInt(reconnectDelay) / 1000 : DEFAULT_RECONNECT_DELAY_SECONDS);
}

// Save settings to localStorage
function saveSettings() {
  const token = tokenInput.value.trim();
  if (!token) {
    alert('Kefas token cannot be empty.');
    return;
  }
  
  const host = hostInput.value.trim();
  if (!host) {
    alert('ProPresenter host cannot be empty.');
    return;
  }
  
  const port = parseInt(portInput.value);
  if (!port || port < MIN_PORT || port > MAX_PORT) {
    alert(`Port must be between ${MIN_PORT} and ${MAX_PORT}.`);
    return;
  }
  
  const notesTrigger = notesTriggerInput.value.trim();
  if (!notesTrigger) {
    alert('Notes trigger string cannot be empty.');
    return;
  }
  
  const maxReconnect = parseInt(maxReconnectInput.value);
  if (!maxReconnect || maxReconnect < MIN_RECONNECT_ATTEMPTS || maxReconnect > MAX_RECONNECT_ATTEMPTS) {
    alert(`Max reconnection attempts must be between ${MIN_RECONNECT_ATTEMPTS} and ${MAX_RECONNECT_ATTEMPTS}.`);
    return;
  }
  
  const reconnectDelay = parseInt(reconnectDelayInput.value);
  if (!reconnectDelay || reconnectDelay < MIN_RECONNECT_DELAY_SECONDS || reconnectDelay > MAX_RECONNECT_DELAY_SECONDS) {
    alert(`Reconnection delay must be between ${MIN_RECONNECT_DELAY_SECONDS} and ${MAX_RECONNECT_DELAY_SECONDS} seconds.`);
    return;
  }
  
  localStorage.setItem('kefasToken', token);
  localStorage.setItem('proPresenterHost', host);
  localStorage.setItem('proPresenterPort', port);
  localStorage.setItem('useNotes', useNotesToggle.checked ? 'true' : 'false');
  localStorage.setItem('notesTrigger', notesTrigger);
  localStorage.setItem('maxReconnectAttempts', maxReconnect);
  localStorage.setItem('reconnectDelayMs', reconnectDelay * 1000);
  localStorage.setItem('debugMode', debugToggle.checked ? 'true' : 'false');
  
  window.close();
}

// Add keyboard paste support
function setupClipboard() {
  document.addEventListener('keydown', async (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
      const target = document.activeElement;
      if (target.matches('input[type="text"], input[type="password"], input[type="number"]')) {
        e.preventDefault();
        try {
          const response = await window.clipboard.readText();
          if (response.success && response.data) {
            target.value += response.data;
          }
        } catch (err) {
          console.error('Paste failed:', err);
        }
      }
    }
  });
}

// Toggle token visibility
function setupPasswordToggles() {
  const tokenToggle = document.getElementById('tokenToggle');

  tokenToggle.addEventListener('click', (e) => {
    e.preventDefault();
    const input = document.getElementById('tokenInput');
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    tokenToggle.textContent = isPassword ? 'Hide' : 'Show';
  });
}

saveBtn.addEventListener('click', saveSettings);

// Initialize
loadSettings();
setupClipboard();
setupPasswordToggles();
