// main.js
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { startBridge, stopBridge, getBridgeStatus } from './bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 900,
    minWidth: 600,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile('renderer.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
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
ipcMain.handle('bridge:start', (event, token, port, debugMode) => {
  startBridge(token, port, debugMode, (msg) => {
    // send log messages back to renderer
    mainWindow?.webContents.send('bridge:log', msg);
    // also send status update
    mainWindow?.webContents.send('bridge:status', getBridgeStatus());
  });
  return { success: true };
});

ipcMain.handle('bridge:stop', (event) => {
  stopBridge((msg) => {
    mainWindow?.webContents.send('bridge:log', msg);
    // also send status update
    mainWindow?.webContents.send('bridge:status', getBridgeStatus());
  });
  return { success: true };
});

ipcMain.handle('bridge:status', (event) => {
  return getBridgeStatus();
});
