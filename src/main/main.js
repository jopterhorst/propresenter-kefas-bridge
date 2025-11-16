// main.js
const { app, BrowserWindow, ipcMain, Menu, clipboard } = require('electron');
const path = require('path');

const { startBridge, stopBridge, getBridgeStatus } = require('../bridge/bridge.js');

let mainWindow = null;
let settingsWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 680,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      sandbox: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/main.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 700,
    minWidth: 500,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      sandbox: false,
      contextIsolation: true,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { role: 'close' },
      ],
    },
    {
      label: 'Application',
      submenu: [
        {
          label: 'Settings',
          accelerator: 'Cmd+,',
          click: createSettingsWindow,
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Developer Tools',
          accelerator: 'Cmd+Option+I',
          click: () => mainWindow?.webContents.openDevTools(),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createMainWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On Mac you usually keep apps running, but for a helper
  // app it’s fine to quit when window closes:
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC: handle start/stop from renderer
ipcMain.handle('bridge:start', (event, token, host, port, debugMode, pollInterval, useNotes, notesTrigger, password) => {
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
  }, password);
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

// Clipboard handlers
ipcMain.handle('clipboard:readText', () => {
  return clipboard.readText();
});

ipcMain.handle('clipboard:writeText', (event, text) => {
  clipboard.writeText(text);
});

