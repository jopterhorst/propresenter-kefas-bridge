// main.js
const { app, BrowserWindow, ipcMain, Menu, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const { startBridge, stopBridge, getBridgeStatus } = require('../bridge/bridge.js');
const { setupAutoUpdater, checkForUpdates } = require('./updater.js');

let mainWindow = null;
let settingsWindow = null;
let isQuitting = false;

// Window state management
const stateFilePath = path.join(app.getPath('userData'), 'window-state.json');

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

function createMainWindow() {
  const savedState = loadWindowState('main');
  
  const windowOptions = {
    width: savedState?.width || 480,
    height: savedState?.height || 720,
    resizable: false,
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:main',
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
  
  // Save window position when moved
  mainWindow.on('moved', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      saveWindowState('main', bounds);
    }
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
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  const savedState = loadWindowState('settings');
  
  const windowOptions = {
    width: savedState?.width || 600,
    height: savedState?.height || 700,
    minWidth: 500,
    minHeight: 600,
    show: false,
    parent: mainWindow, // Make it a child of main window (stays on top)
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:main',
    },
  };
  
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
  
  // Save window position and size when changed
  const saveSettingsState = () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      const bounds = settingsWindow.getBounds();
      saveWindowState('settings', bounds);
    }
  };
  
  settingsWindow.on('moved', saveSettingsState);
  settingsWindow.on('resize', saveSettingsState);

  settingsWindow.on('close', () => {
    saveSettingsState();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createMenu() {
  const isMac = process.platform === 'darwin';
  const { dialog } = require('electron');
  
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
          label: 'Check for Updates',
          click: () => {
            if (app.isPackaged) {
              checkForUpdates(true);
            } else {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Development Mode',
                message: 'Auto-update is disabled in development mode.',
              });
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Learn More',
          click: async () => {
            const { shell } = require('electron');
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
  createMainWindow();
  createMenu();
  
  // Setup auto-updater (only in production)
  if (!app.isPackaged) {
    console.log('Running in development mode - auto-updater disabled');
  } else {
    setupAutoUpdater(mainWindow);
  }

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// IPC: handle start/stop from renderer
ipcMain.handle('bridge:start', (event, token, host, port, debugMode, pollInterval, useNotes, notesTrigger, password, maxReconnect, reconnectDelay) => {
  startBridge(token, host, port, debugMode, (msg) => {
    // send log messages back to both windows
    mainWindow?.webContents.send('bridge:log', msg);
    settingsWindow?.webContents.send('bridge:log', msg);
    // also send status update
    const status = getBridgeStatus();
    mainWindow?.webContents.send('bridge:status', status);
    settingsWindow?.webContents.send('bridge:status', status);
  }, pollInterval, useNotes, notesTrigger, (connectionStatus) => {
    // send connection status updates
    mainWindow?.webContents.send('bridge:connection', connectionStatus);
    settingsWindow?.webContents.send('bridge:connection', connectionStatus);
  }, password, maxReconnect, reconnectDelay);
  return { success: true };
});

ipcMain.handle('bridge:stop', (event) => {
  stopBridge((msg) => {
    mainWindow?.webContents.send('bridge:log', msg);
    settingsWindow?.webContents.send('bridge:log', msg);
    // also send status update
    const status = getBridgeStatus();
    mainWindow?.webContents.send('bridge:status', status);
    settingsWindow?.webContents.send('bridge:status', status);
  });
  return { success: true };
});

ipcMain.handle('bridge:status', (event) => {
  return getBridgeStatus();
});

// Get app info (version, author, etc.)
ipcMain.handle('app:getInfo', () => {
  const packageJson = require('../../package.json');
  return {
    version: packageJson.version,
    author: packageJson.author,
    name: packageJson.productName || packageJson.name,
  };
});

// Clipboard handlers
ipcMain.handle('clipboard:readText', () => {
  return clipboard.readText();
});

ipcMain.handle('clipboard:writeText', (event, text) => {
  clipboard.writeText(text);
});

