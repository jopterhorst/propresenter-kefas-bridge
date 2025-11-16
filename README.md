# ProPresenter Kefas Bridge# ProPresenter Kefas Bridge



An Electron app that bridges ProPresenter 7 lyrics to Kefas API, automatically sending the current slide lyrics to a Kefas meeting in real-time.An Electron app that bridges ProPresenter 7 lyrics to Kefas API, automatically sending the current slide lyrics to a Kefas meeting in real-time.



## Features## Features



✨ **Modern macOS Design**✨ **Modern macOS Design**

- Apple HIG compliant with liquid glass effects- Apple HIG compliant with liquid glass effects

- ProPresenter orange accent color (#ff9500)- ProPresenter orange accent color (#ff9500)

- Dark mode support- Dark mode support

- Responsive 700x900 window- Responsive 700x900 window



🎵 **Real-Time Lyric Bridging**🎵 **Real-Time Lyric Bridging**

- REST API polling from ProPresenter 7- WebSocket real-time updates from ProPresenter 7

- Instant delivery with configurable poll rates- Instant delivery - no polling delays

- Detects lyric changes automatically- Automatic reconnection with 10 retry attempts

- Only sends when lyrics change (no duplicates)- Detects lyric changes automatically

- Supports multi-line lyrics and notes- Only sends when lyrics change (no duplicates)

- Supports multi-line lyrics

⚙️ **User-Configurable Settings**

- Kefas API token input (stored locally, secure)⚙️ **User-Configurable Settings**

- ProPresenter API port (default: 55056)- Kefas API token input (stored locally, secure)

- Configurable polling interval (minimum 0.1 seconds)- ProPresenter API port (default: 55056)

- Persistent settings using localStorage- Persistent settings using localStorage



🐛 **Debug Mode**🐛 **Debug Mode**

- Verbose logging for troubleshooting- Verbose logging for troubleshooting

- Browser DevTools console output with detailed timing- Browser DevTools console output with detailed timing

- Full request/response logging- Full request/response logging

- Performance metrics- Performance metrics



🎮 **Smart Button States**🎮 **Smart Button States**

- Start button: Only enabled when bridge is stopped- Start button: Only enabled when bridge is stopped

- Stop button: Only enabled when bridge is running- Stop button: Only enabled when bridge is running

- Real-time status synchronization- Real-time status synchronization



## Project Structure## Requirements



```- **Node.js** v16+ - [Download](https://nodejs.org/)

propresenter-kefas-bridge/- **ProPresenter 7** running with network API enabled

├── src/- **Kefas API Token** from your Kefas account

│   ├── main/

│   │   └── main.js              # Electron main process## Quick Start

│   ├── bridge/

│   │   └── bridge.js            # Core bridging logic### Development

│   ├── renderer/```bash

│   │   ├── renderer.html        # UI interfacenpm install

│   │   └── preload.js           # IPC security bridgenpm start

│   └── assets/```

│       ├── icon.png             # App icon

│       └── Kefas.icon/          # Icon assets### Build

├── docs/```bash

│   ├── README.md                # Full user documentationnpm run build           # Current platform

│   └── DEBUG_MODE.md            # Debug mode guidenpm run build:mac      # macOS (DMG + ZIP)

├── dist/                        # Build outputnpm run build:win      # Windows (EXE)

├── package.json                 # Dependencies and build confignpm run build:linux    # Linux (AppImage + DEB)

└── .gitignore```

```

## Usage

## Requirements

1. **Launch the app**

- **Node.js** v16+ - [Download](https://nodejs.org/)   - macOS: Open from Applications or run DMG installer

- **ProPresenter 7** running with network API enabled

- **Kefas API Token** from your Kefas account2. **Configure Settings**

   - Enter your Kefas API token

## Quick Start   - Enter ProPresenter API port (default: 55056)

   - Optionally enable Debug Mode for troubleshooting

### Development   - Click "Save Settings"

```bash

npm install3. **Start the Bridge**

npm start   - Ensure ProPresenter 7 is running with network API enabled

```   - Click "Start Bridge"

   - Watch the Activity Log for status updates

### Build   - Lyrics will automatically sync to Kefas when they change

```bash

npm run build           # Current platform4. **Stop the Bridge**

npm run build:mac      # macOS (DMG + ZIP)   - Click "Stop Bridge" to pause syncing

npm run build:win      # Windows (EXE)

npm run build:linux    # Linux (AppImage + DEB)## Configuration

```

### ProPresenter

## Usage- **Host**: 127.0.0.1 (localhost)

- **Port**: 55056 (default, configurable in app)

1. **Launch the app**- **API Endpoint**: `/v1/status/slide`

   - macOS: Open from Applications or run DMG installer

### Kefas

2. **Configure Settings**- **Token**: Entered in app UI, stored locally

   - Enter your Kefas API token- **Base URL**: https://web.kefas.app

   - Enter ProPresenter API port (default: 55056)- **Meeting ID**: `live`

   - Set polling interval (default: 5000ms / 5 seconds, minimum: 100ms)

   - Optionally enable Debug Mode for troubleshooting### Polling

   - Click "Save Settings"- **Method**: WebSocket real-time subscription (instead of polling)

- **Reconnection**: Automatic retry up to 10 attempts

3. **Start the Bridge**- **Reconnect Interval**: 3 seconds between attempts

   - Ensure ProPresenter 7 is running with network API enabled

   - Click "Start Bridge"## Debug Mode

   - Watch the Activity Log for status updates

   - Lyrics will automatically sync to Kefas when they changeEnable Debug Mode in settings for detailed troubleshooting:



4. **Stop the Bridge**1. Open DevTools: `Cmd + Option + I` (Mac) or `Ctrl + Shift + I` (Windows/Linux)

   - Click "Stop Bridge" to pause syncing2. Go to **Console** tab

3. Look for `[DEBUG]` prefixed messages

## Configuration

See [DEBUG_MODE.md](DEBUG_MODE.md) for detailed debug documentation.

### ProPresenter

- **Host**: 127.0.0.1 (localhost)## Troubleshooting

- **Port**: 55056 (default, configurable in app)

- **API Endpoint**: `/v1/status/slide`### Connection Refused

- ProPresenter not running

### Kefas- Check port (default: 55056)

- **Token**: Entered in app UI, stored locally- Verify network API is enabled in ProPresenter

- **Base URL**: https://web.kefas.app- Enable Debug Mode to see exact WebSocket URL

- **Meeting ID**: `live`- Check bridge status display shows "Disconnected"



### Polling### Connection Dropped

- **Method**: REST API polling on configurable intervals- Bridge will automatically attempt to reconnect (up to 10 times)

- **Default Interval**: 5 seconds- Check ProPresenter is still running

- **Minimum Interval**: 0.1 seconds (100ms)- Monitor Activity Log for reconnection messages

- **Notes Fallback**: If slide text contains "Current Slide Notes", uses notes attribute instead- Manual restart may be needed if reconnect fails



## Debug Mode### Kefas API Error 401

- Invalid or expired token

Enable Debug Mode in settings for detailed troubleshooting:- Verify token in settings

- Re-save with correct token

1. Open DevTools: `Cmd + Option + I` (Mac) or `Ctrl + Shift + I` (Windows/Linux)

2. Go to **Console** tab### No Lyrics Detected

3. Look for `[DEBUG]` prefixed messages- Current slide has no lyrics

- Enable Debug Mode to inspect API response

See [docs/DEBUG_MODE.md](docs/DEBUG_MODE.md) for detailed debug documentation.- Check ProPresenter has lyrics on current slide



## Troubleshooting### "Bridge API not available"

- Preload.js failed to load

### Connection Refused- Check browser console for errors

- ProPresenter not running- Restart the app

- Check port (default: 55056)

- Verify network API is enabled in ProPresenter## Architecture

- Enable Debug Mode to see exact API calls

```

### Kefas API Error 401renderer.html (UI)

- Invalid or expired token    ↓ (IPC)

- Verify token in settingspreload.js (Bridge API)

- Re-save with correct token    ↓ (IPC)

main.js (Electron)

### No Lyrics Detected    ↓

- Current slide has no lyricsbridge.js (Core Logic)

- Enable Debug Mode to inspect API response    ↓ (HTTP)

- Check ProPresenter has lyrics on current slideProPresenter API

Kefas API

### "Bridge API not available"```

- Preload.js failed to load

- Check browser console for errors## Files

- Restart the app

- `bridge.js` - Core logic, API calls

## Architecture- `main.js` - Electron main process, IPC handlers

- `preload.js` - Security bridge, UI API

```- `renderer.html` - User interface

src/renderer/renderer.html (UI)- `package.json` - Dependencies, build config

    ↓ (IPC)- `DEBUG_MODE.md` - Debug documentation

src/renderer/preload.js (Bridge API)

    ↓ (IPC)## License

src/main/main.js (Electron)

    ↓MIT

src/bridge/bridge.js (Core Logic)
    ↓ (HTTP)
ProPresenter API (REST)
Kefas API (REST)
```

## License

MIT
