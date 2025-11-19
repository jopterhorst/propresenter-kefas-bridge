// main.js
const { app, BrowserWindow, ipcMain, Menu, clipboard, screen, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const { initializeLogPath, startBridge, stopBridge, getBridgeStatus } = require('../bridge/bridge.js');

// Constants
const WINDOW_STATE_SAVE_DEBOUNCE_MS = 500;
const MAIN_WINDOW_WIDTH = 480;
const MAIN_WINDOW_HEIGHT = 720;
const SETTINGS_WINDOW_WIDTH = 600;
const SETTINGS_WINDOW_HEIGHT = 700;
const SETTINGS_WINDOW_MIN_WIDTH = 500;
const SETTINGS_WINDOW_MIN_HEIGHT = 600;

let mainWindow = null;
let settingsWindow = null;
let isQuitting = false;

/**
 * Debounces a function call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Broadcasts a message to all open windows
 * @param {string} channel - IPC channel name
 * @param {...any} args - Arguments to send
 */
function broadcastToWindows(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send(channel, ...args);
  }
}

// Window state management
const stateFilePath = path.join(app.getPath('userData'), 'window-state.json');

/**
 * Loads saved window state (position and size) from file
 * Validates the window is within screen bounds before returning
 * @param {string} windowName - Name of the window ('main' or 'settings')
 * @returns {Object|null} Window state object with x, y, width, height or null if not found/invalid
 */
function loadWindowState(windowName) {
  try {
    if (fs.existsSync(stateFilePath)) {
      const state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
      const windowState = state[windowName];
      
      if (windowState) {
        // Validate the window is within screen bounds
        const displays = screen.getAllDisplays();
        const isWithinBounds = displays.some(display => {
          const { x, y, width, height } = display.bounds;
          return windowState.x >= x && windowState.y >= y &&
                 windowState.x + windowState.width <= x + width &&
                 windowState.y + windowState.height <= y + height;
        });
        
        if (isWithinBounds) {
          return windowState;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load window state:', err);
  }
  return null;
}

/**
 * Saves window state (position and size) to file
 * @param {string} windowName - Name of the window ('main' or 'settings')
 * @param {Object} bounds - Window bounds object with x, y, width, height
 */
function saveWindowState(windowName, bounds) {
  try {
    let state = {};
    if (fs.existsSync(stateFilePath)) {
      state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    }
    
    state[windowName] = bounds;
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('Failed to save window state:', err);
  }
}

/**
 * Creates and configures the main application window
 * Loads previous window state if available and sets up event handlers
 */
function createMainWindow() {
  try {
    const savedState = loadWindowState('main');
  
  const windowOptions = {
    width: savedState?.width || MAIN_WINDOW_WIDTH,
    height: savedState?.height || MAIN_WINDOW_HEIGHT,
    resizable: false,
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  
  // Only set position if we have saved state
  if (savedState) {
    windowOptions.x = savedState.x;
    windowOptions.y = savedState.y;
  }
  
  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, '../renderer/main.html'));
  
  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  
  // Debounce window position saves to reduce I/O
  const debouncedSave = debounce(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      saveWindowState('main', bounds);
    }
  }, WINDOW_STATE_SAVE_DEBOUNCE_MS);
  
  mainWindow.on('moved', () => {
    debouncedSave();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      // Save window state before closing
      if (mainWindow && !mainWindow.isDestroyed()) {
        const bounds = mainWindow.getBounds();
        saveWindowState('main', bounds);
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  } catch (err) {
    console.error('Failed to create main window:', err);
    dialog.showErrorBox('Window Creation Error', `Failed to create main window: ${err.message}`);
  }
}

/**
 * Creates and configures the settings window
 * Only creates one instance at a time and focuses existing if already open
 */
function createSettingsWindow() {
  try {
    if (settingsWindow) {
      settingsWindow.focus();
      return;
    }

  const savedState = loadWindowState('settings');
  
  const windowOptions = {
    width: savedState?.width || SETTINGS_WINDOW_WIDTH,
    height: savedState?.height || SETTINGS_WINDOW_HEIGHT,
    minWidth: SETTINGS_WINDOW_MIN_WIDTH,
    minHeight: SETTINGS_WINDOW_MIN_HEIGHT,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  
  // Set parent window if main window exists and is valid
  if (mainWindow && !mainWindow.isDestroyed()) {
    windowOptions.parent = mainWindow;
  }
  
  // Only set position if we have saved state
  if (savedState) {
    windowOptions.x = savedState.x;
    windowOptions.y = savedState.y;
  }

  settingsWindow = new BrowserWindow(windowOptions);

  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));
  
  // Show window when ready
  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });
  
  // Debounce window state saves to reduce I/O
  const debouncedSave = debounce(() => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      const bounds = settingsWindow.getBounds();
      saveWindowState('settings', bounds);
    }
  }, WINDOW_STATE_SAVE_DEBOUNCE_MS);
  
  settingsWindow.on('moved', debouncedSave);
  settingsWindow.on('resize', debouncedSave);

  settingsWindow.on('close', () => {
    // Save final state before closing
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      const bounds = settingsWindow.getBounds();
      saveWindowState('settings', bounds);
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  } catch (err) {
    console.error('Failed to create settings window:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Settings Error',
        message: 'Failed to open settings window',
        detail: err.message
      });
    }
  }
}

/**
 * Creates and sets the application menu with platform-specific options
 * Includes File, Edit, View, Window, and Help menus
 */
function createMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: createSettingsWindow,
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    // File menu
    {
      label: 'File',
      submenu: [
        ...(isMac ? [] : [
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: createSettingsWindow,
          },
          { type: 'separator' },
        ]),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' },
              { role: 'stopSpeaking' },
            ],
          },
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' },
        ]),
      ],
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' },
        ] : [
          { role: 'close' },
        ]),
      ],
    },
    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://github.com/jopterhorst/propresenter-kefas-bridge');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App lifecycle handlers
app.on('before-quit', (event) => {
  isQuitting = true;
  
  // Stop the bridge if it's running
  const status = getBridgeStatus();
  if (status.isRunning) {
    console.log('Stopping bridge before quit...');
    stopBridge(() => {});
  }
  
  // Save window states one final time
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    saveWindowState('main', bounds);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    const bounds = settingsWindow.getBounds();
    saveWindowState('settings', bounds);
  }
});

app.on('will-quit', (event) => {
  // Clean up any remaining resources
  console.log('App will quit - cleaning up...');
});

app.on('window-all-closed', () => {
  // On Mac, apps typically stay open without windows
  // But for this utility app, we quit when all windows close
  if (process.platform !== 'darwin') {
    app.quit();
  } else {
    // Even on Mac, quit when all windows closed for this type of app
    app.quit();
  }
});

app.whenReady().then(() => {
  // Initialize log file path for bridge
  initializeLogPath(app.getPath('logs'));
  
  createMainWindow();
  createMenu();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// IPC: handle start/stop from renderer
ipcMain.handle('bridge:start', (event, token, host, port, debugMode, useNotes, notesTrigger, maxReconnect, reconnectDelay) => {
  try {
    startBridge(token, host, port, debugMode, (msg) => {
      // send log messages back to both windows
      broadcastToWindows('bridge:log', msg);
      // also send status update
      const status = getBridgeStatus();
      broadcastToWindows('bridge:status', status);
    }, useNotes, notesTrigger, (connectionStatus) => {
      // send connection status updates
      broadcastToWindows('bridge:connection', connectionStatus);
    }, maxReconnect, reconnectDelay);
    return { success: true, data: null };
  } catch (err) {
    console.error('Failed to start bridge:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('bridge:stop', (event) => {
  try {
    stopBridge((msg) => {
      broadcastToWindows('bridge:log', msg);
      // also send status update
      const status = getBridgeStatus();
      broadcastToWindows('bridge:status', status);
    });
    return { success: true, data: null };
  } catch (err) {
    console.error('Failed to stop bridge:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('bridge:status', (event) => {
  try {
    const status = getBridgeStatus();
    return { success: true, data: status };
  } catch (err) {
    console.error('Failed to get bridge status:', err);
    return { success: false, error: err.message };
  }
});

// Get app info (version, author, etc.)
ipcMain.handle('app:getInfo', () => {
  try {
    const packageJson = require('../../package.json');
    return {
      success: true,
      data: {
        version: packageJson.version,
        author: packageJson.author,
        name: packageJson.productName || packageJson.name,
      }
    };
  } catch (err) {
    console.error('Failed to get app info:', err);
    return {
      success: false,
      error: err.message
    };
  }
});

// Clipboard handlers
ipcMain.handle('clipboard:readText', () => {
  try {
    return { success: true, data: clipboard.readText() };
  } catch (err) {
    console.error('Failed to read clipboard:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('clipboard:writeText', (event, text) => {
  try {
    clipboard.writeText(text);
    return { success: true, data: null };
  } catch (err) {
    console.error('Failed to write clipboard:', err);
    return { success: false, error: err.message };
  }
});

