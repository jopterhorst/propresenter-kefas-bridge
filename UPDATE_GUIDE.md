# Auto-Updater Implementation

The app now includes automatic update functionality using `electron-updater` and GitHub releases.

## How It Works

1. **Automatic checks**: The app checks for updates:
   - 3 seconds after startup
   - Every 4 hours while running

2. **Manual check**: Users can check via **Help → Check for Updates**

3. **Update process**:
   - When an update is available, user gets a dialog to download
   - Download progress is shown
   - After download, user can install immediately or on next restart
   - Updates auto-install when app quits

## Publishing Updates

### 1. Update version in `package.json`:
```json
{
  "version": "2025.11.3"
}
```

### 2. Create and push a git tag:
```bash
git add .
git commit -m "Release v2025.11.3"
git tag v2025.11.3
git push origin main --tags
```

### 3. GitHub Actions will automatically:
- Build for macOS, Windows, and Linux
- Create a GitHub release with the tag
- Upload all build artifacts

### 4. Users will be notified of the update automatically

## Build Artifacts Created

**macOS:**
- `.dmg` - Disk image installer
- `.zip` - Portable app

**Windows:**
- `.exe` - NSIS installer
- `-portable.exe` - Portable version

**Linux:**
- `.AppImage` - Portable app
- `.deb` - Debian package

## Configuration

The update configuration is in `package.json`:
```json
"publish": [
  {
    "provider": "github",
    "owner": "jopterhorst",
    "repo": "propresenter-kefas-bridge"
  }
]
```

## Development Mode

Auto-updater is disabled when running `npm start` (development mode). It only works in built/packaged apps.

## Testing Updates

1. Build the app: `npm run build:mac` (or `:win` or `:linux`)
2. Create a GitHub release with a higher version number
3. Run the built app (from `dist/` folder)
4. It will detect and offer to download the update
