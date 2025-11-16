# Testing Guide

## Build Complete! ✅

Your app has been successfully built for macOS ARM64:

### Built Files
- **DMG Installer**: `dist/ProPresenter Kefas Bridge-1.0.0-arm64.dmg` (95 MB)
- **ZIP Archive**: `dist/ProPresenter Kefas Bridge-1.0.0-arm64-mac.zip` (92 MB)
- **App Bundle**: `dist/mac-arm64/ProPresenter Kefas Bridge.app`

## How to Test

### Option 1: Run directly from app bundle
```bash
open dist/mac-arm64/ProPresenter\ Kefas\ Bridge.app
```

### Option 2: Mount and test the DMG
```bash
open dist/ProPresenter\ Kefas\ Bridge-1.0.0-arm64.dmg
```

### Option 3: Extract and run the ZIP
```bash
unzip dist/ProPresenter\ Kefas\ Bridge-1.0.0-arm64-mac.zip
open ProPresenter\ Kefas\ Bridge.app
```

## Testing Steps

1. **Open the app** - Use one of the methods above
2. **Enter Kefas Token** - Paste your API token in the settings
3. **Save Token** - Click "Save Token" button
4. **Start ProPresenter** - Make sure it's running on port 1025 with network API enabled
5. **Start Bridge** - Click "Start Bridge" in the app
6. **Check Logs** - Watch the log display for polling updates

## Troubleshooting

- **"Cannot open app"** - Right-click and select "Open" to bypass Gatekeeper (unsigned app)
- **"Connection refused"** - ProPresenter API not running on port 1025
- **"Kefas API error 401"** - Invalid token
