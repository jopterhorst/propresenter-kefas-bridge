// updater.js - Auto-update functionality
const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let updateCheckInProgress = false;

function setupAutoUpdater(mainWindow) {
  // Check for updates on app start (after 3 seconds delay)
  setTimeout(() => {
    checkForUpdates(false);
  }, 3000);

  // Check for updates every 4 hours
  setInterval(() => {
    checkForUpdates(false);
  }, 4 * 60 * 60 * 1000);

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available!`,
      detail: 'Would you like to download it now?',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
        
        // Show downloading notification
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:downloading');
        }
      }
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available. Current version:', info.version);
    updateCheckInProgress = false;
  });

  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater:', err);
    updateCheckInProgress = false;
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const message = `Downloaded ${Math.round(progressObj.percent)}%`;
    console.log(message);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:progress', {
        percent: Math.round(progressObj.percent),
        transferred: progressObj.transferred,
        total: progressObj.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    updateCheckInProgress = false;
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded successfully!',
      detail: 'The update will be installed when you quit and restart the application.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });
}

function checkForUpdates(showNoUpdateDialog = false) {
  if (updateCheckInProgress) {
    console.log('Update check already in progress');
    return;
  }
  
  updateCheckInProgress = true;
  
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Failed to check for updates:', err);
    updateCheckInProgress = false;
  });
}

module.exports = { setupAutoUpdater, checkForUpdates };
