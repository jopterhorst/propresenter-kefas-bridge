// settings.js - Settings window script
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
  hostInput.value = savedHost || '127.0.0.1';
  
  const savedPort = localStorage.getItem('proPresenterPort');
  portInput.value = savedPort || '55056';
  
  const useNotes = localStorage.getItem('useNotes') === 'true';
  useNotesToggle.checked = useNotes;
  
  const notesTrigger = localStorage.getItem('notesTrigger');
  notesTriggerInput.value = notesTrigger || 'Current Slide Notes';
  
  const debugMode = localStorage.getItem('debugMode') === 'true';
  debugToggle.checked = debugMode;
  
  const maxReconnect = localStorage.getItem('maxReconnectAttempts');
  maxReconnectInput.value = maxReconnect || '3';
  
  const reconnectDelay = localStorage.getItem('reconnectDelayMs');
  reconnectDelayInput.value = (reconnectDelay ? parseInt(reconnectDelay) / 1000 : '5');
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
  if (!port || port < 1 || port > 65535) {
    alert('Port must be between 1 and 65535.');
    return;
  }
  
  const notesTrigger = notesTriggerInput.value.trim();
  if (!notesTrigger) {
    alert('Notes trigger string cannot be empty.');
    return;
  }
  
  const maxReconnect = parseInt(maxReconnectInput.value);
  if (!maxReconnect || maxReconnect < 1 || maxReconnect > 10) {
    alert('Max reconnection attempts must be between 1 and 10.');
    return;
  }
  
  const reconnectDelay = parseInt(reconnectDelayInput.value);
  if (!reconnectDelay || reconnectDelay < 1 || reconnectDelay > 60) {
    alert('Reconnection delay must be between 1 and 60 seconds.');
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
          const text = await window.clipboard.readText();
          target.value += text;
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
