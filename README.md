# ProPresenter Kefas Bridge

An Electron app that bridges ProPresenter 7 lyrics to Kefas API, automatically sending the current slide lyrics to a Kefas meeting.

## Setup

### Prerequisites
- **Node.js** (v16+) - [Download](https://nodejs.org/)
- **ProPresenter 7** running with network API enabled on port 1025
- **Kefas API Token** - Get from your Kefas account

### Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the app:
   ```bash
   npm start
   ```

3. In the app:
   - Enter your Kefas API token in the settings and save
   - Click "Start Bridge" to begin polling ProPresenter
   - Check the log for status messages

## Building

### Build for your platform
```bash
npm run build
```

### Build for specific platforms
- **macOS**: `npm run build:mac` (creates .dmg and .zip)
- **Windows**: `npm run build:win` (creates .exe installer and portable)
- **Linux**: `npm run build:linux` (creates .AppImage and .deb)

Built packages will be in the `dist/` folder.

## How It Works

1. Polls ProPresenter API every 5 seconds for current slide lyrics
2. Detects when lyrics change
3. Automatically sends new lyrics to Kefas meeting API
4. All logs are displayed in the app UI

## Configuration

- **ProPresenter Port**: 1025 (default)
- **Kefas Meeting ID**: `live` (configurable in bridge.js)
- **Poll Interval**: 5 seconds (configurable in bridge.js)
- **Kefas Token**: Set via UI, stored in browser localStorage

## Troubleshooting

- **"Error: No lyric found"** - ProPresenter may not have lyrics on current slide
- **"Kefas API error 401"** - Invalid token, check your Kefas API token
- **Connection refused** - ProPresenter API not running or port 1025 not accessible
