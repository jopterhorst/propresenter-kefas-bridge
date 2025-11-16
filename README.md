# ProPresenter Kefas Bridge

An Electron app that bridges ProPresenter 7 lyrics to Kefas API, automatically sending the current slide lyrics to a Kefas meeting in real-time.

## Features

✨ **Modern macOS Design**
- Apple HIG compliant with liquid glass effects
- ProPresenter orange accent color (#ff9500)
- Dark mode support
- Responsive 700x900 window

🎵 **Real-Time Lyric Bridging**
- Polls ProPresenter API every 5 seconds
- Detects lyric changes automatically
- Only sends when lyrics change (no duplicates)
- Supports multi-line lyrics

⚙️ **User-Configurable Settings**
- Kefas API token input (stored locally, secure)
- ProPresenter API port (default: 55056)
- Persistent settings using localStorage

🐛 **Debug Mode**
- Verbose logging for troubleshooting
- Browser DevTools console output with detailed timing
- Full request/response logging
- Performance metrics

🎮 **Smart Button States**
- Start button: Only enabled when bridge is stopped
- Stop button: Only enabled when bridge is running
- Real-time status synchronization

## Requirements

- **Node.js** v16+ - [Download](https://nodejs.org/)
- **ProPresenter 7** running with network API enabled
- **Kefas API Token** from your Kefas account

## Quick Start

### Development
```bash
npm install
npm start
```

### Build
```bash
npm run build           # Current platform
npm run build:mac      # macOS (DMG + ZIP)
npm run build:win      # Windows (EXE)
npm run build:linux    # Linux (AppImage + DEB)
```

## Usage

1. **Launch the app**
   - macOS: Open from Applications or run DMG installer

2. **Configure Settings**
   - Enter your Kefas API token
   - Enter ProPresenter API port (default: 55056)
   - Optionally enable Debug Mode for troubleshooting
   - Click "Save Settings"

3. **Start the Bridge**
   - Ensure ProPresenter 7 is running with network API enabled
   - Click "Start Bridge"
   - Watch the Activity Log for status updates
   - Lyrics will automatically sync to Kefas when they change

4. **Stop the Bridge**
   - Click "Stop Bridge" to pause syncing

## Configuration

### ProPresenter
- **Host**: 127.0.0.1 (localhost)
- **Port**: 55056 (default, configurable in app)
- **API Endpoint**: `/v1/status/slide`

### Kefas
- **Token**: Entered in app UI, stored locally
- **Base URL**: https://web.kefas.app
- **Meeting ID**: `live`

### Polling
- **Interval**: 5 seconds
- **Timeout**: 5 seconds per request

## Debug Mode

Enable Debug Mode in settings for detailed troubleshooting:

1. Open DevTools: `Cmd + Option + I` (Mac) or `Ctrl + Shift + I` (Windows/Linux)
2. Go to **Console** tab
3. Look for `[DEBUG]` prefixed messages

See [DEBUG_MODE.md](DEBUG_MODE.md) for detailed debug documentation.

## Troubleshooting

### Connection Refused
- ProPresenter not running
- Check port (default: 55056)
- Verify network API is enabled in ProPresenter
- Enable Debug Mode to see exact URL

### Kefas API Error 401
- Invalid or expired token
- Verify token in settings
- Re-save with correct token

### No Lyrics Detected
- Current slide has no lyrics
- Enable Debug Mode to inspect API response
- Check ProPresenter has lyrics on current slide

### "Bridge API not available"
- Preload.js failed to load
- Check browser console for errors
- Restart the app

## Architecture

```
renderer.html (UI)
    ↓ (IPC)
preload.js (Bridge API)
    ↓ (IPC)
main.js (Electron)
    ↓
bridge.js (Core Logic)
    ↓ (HTTP)
ProPresenter API
Kefas API
```

## Files

- `bridge.js` - Core logic, API calls
- `main.js` - Electron main process, IPC handlers
- `preload.js` - Security bridge, UI API
- `renderer.html` - User interface
- `package.json` - Dependencies, build config
- `DEBUG_MODE.md` - Debug documentation

## License

MIT
