// settings.js - Settings window script

// Constants
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = '55056';
const DEFAULT_NOTES_TRIGGER = 'Current Slide Notes';
const DEFAULT_MAX_RECONNECT = '3';
const DEFAULT_RECONNECT_DELAY_SECONDS = '5';
const DEFAULT_LYRIC_LANGUAGE = 'nl';
const DEFAULT_ALTERNATE_LANGUAGE = 'en';
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
const saveBtn = document.getElementById('saveBtn');
const hostInput = document.getElementById('hostInput');
const defaultLyricLanguageInput = document.getElementById('defaultLyricLanguageInput');
const alternateLanguageInput = document.getElementById('alternateLanguageInput');
const discoverBtn = document.getElementById('discoverBtn');
const discoveryResults = document.getElementById('discoveryResults');

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
  
  const maxReconnect = localStorage.getItem('maxReconnectAttempts');
  maxReconnectInput.value = maxReconnect || DEFAULT_MAX_RECONNECT;
  
  const reconnectDelay = localStorage.getItem('reconnectDelayMs');
  reconnectDelayInput.value = (reconnectDelay ? parseInt(reconnectDelay) / 1000 : DEFAULT_RECONNECT_DELAY_SECONDS);
  
  const defaultLyricLanguage = localStorage.getItem('defaultLyricLanguage');
  defaultLyricLanguageInput.value = defaultLyricLanguage || DEFAULT_LYRIC_LANGUAGE;
  
  const alternateLanguage = localStorage.getItem('alternateLanguage');
  alternateLanguageInput.value = alternateLanguage || DEFAULT_ALTERNATE_LANGUAGE;
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
  
  const defaultLyricLanguage = defaultLyricLanguageInput.value.trim();
  if (!defaultLyricLanguage) {
    alert('Default lyric language cannot be empty.');
    return;
  }
  
  const alternateLanguage = alternateLanguageInput.value.trim();
  if (!alternateLanguage) {
    alert('Alternate language cannot be empty.');
    return;
  }
  
  localStorage.setItem('kefasToken', token);
  localStorage.setItem('proPresenterHost', host);
  localStorage.setItem('proPresenterPort', port);
  localStorage.setItem('useNotes', useNotesToggle.checked ? 'true' : 'false');
  localStorage.setItem('notesTrigger', notesTrigger);
  localStorage.setItem('maxReconnectAttempts', maxReconnect);
  localStorage.setItem('reconnectDelayMs', reconnectDelay * 1000);
  localStorage.setItem('defaultLyricLanguage', defaultLyricLanguage);
  localStorage.setItem('alternateLanguage', alternateLanguage);
  
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

// Auto-discover ProPresenter instances
async function runDiscovery() {
  discoverBtn.disabled = true;
  discoverBtn.textContent = 'Scanning...';
  discoveryResults.style.display = 'none';
  discoveryResults.innerHTML = '';

  try {
    const response = await window.discoveryAPI.find();
    if (response.success && response.data.length > 0) {
      discoveryResults.style.display = 'block';
      for (const instance of response.data) {
        const item = document.createElement('div');
        item.className = 'discovery-item';
        const versionText = instance.version ? ` - ${instance.version}` : '';
        item.innerHTML =
          '<div class="discovery-item-info">' +
            '<span class="discovery-item-name">' + escapeHTML(instance.name + versionText) + '</span>' +
            '<span class="discovery-item-detail">' + escapeHTML(instance.host) + ':' + instance.port + '</span>' +
          '</div>' +
          '<span class="discovery-item-select">Select</span>';
        item.addEventListener('click', () => {
          hostInput.value = instance.host;
          portInput.value = instance.port;
          discoveryResults.style.display = 'none';
        });
        discoveryResults.appendChild(item);
      }
    } else {
      discoveryResults.style.display = 'block';
      discoveryResults.innerHTML = '<div class="discovery-empty">No ProPresenter instances found. Make sure ProPresenter is running with networking enabled.</div>';
    }
  } catch (err) {
    discoveryResults.style.display = 'block';
    discoveryResults.innerHTML = '<div class="discovery-empty">Discovery failed: ' + escapeHTML(err.message) + '</div>';
  }

  discoverBtn.disabled = false;
  discoverBtn.textContent = 'Auto-Discover';
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

discoverBtn.addEventListener('click', runDiscovery);
saveBtn.addEventListener('click', saveSettings);

// Initialize
loadSettings();
setupClipboard();
setupPasswordToggles();
