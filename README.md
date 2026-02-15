# ProPresenter Kefas Bridge

Automatically send lyrics from ProPresenter slides to Kefas in real-time using the chunked streaming API.

## What It Does

This app connects to ProPresenter via HTTP streaming and automatically sends the current slide lyrics to Kefas whenever you change slides. No polling, no delays—instant synchronization using ProPresenter 7's chunked API.

![Main App Interface](img/main.png)

## Features

✨ **Real-time streaming** — No polling, instant synchronization
🔍 **Auto-discovery** — Automatically find ProPresenter on your network
🔄 **Auto-reconnection** — Automatically reconnects if connection drops
🌐 **Cross-platform** — Works on macOS, Windows, and Linux
🔒 **Secure** — Content Security Policy and proper sandboxing
📝 **Bilingual support** — Use slide notes for translation workflows
🎨 **Native UI** — Clean, native-looking interface with dark mode support  

## Requirements

- **ProPresenter 7+** with API enabled
- **Kefas account** with API token
- **macOS, Windows, or Linux**

## Installation

Download the latest release for your platform:

- **macOS**: Download `.dmg` or `.zip`
- **Windows**: Download `.exe` installer or portable version
- **Linux**: Download `.AppImage` or `.deb`

### macOS Security Note

Since the app is unsigned, macOS Gatekeeper will prevent it from running the first time. After installing the app, you need to remove the quarantine flag:

1. Open Terminal
2. Run the following command:
   ```bash
   xattr -d com.apple.quarantine /Applications/ProPresenter\ Kefas\ Bridge.app
   ```
3. You can now launch the app normally


## Quick Start

### 1. Get Your Kefas API Token

Log into your Kefas account and create an API token.

### 2. Enable ProPresenter API

In ProPresenter:
1. Go to **ProPresenter → Network**
2. Enable **Network** (the API is automatically available)
3. Note the port (default: 55056 for ProPresenter 7+, 50001 for older versions)

### 3. Install & Launch

Download the app for your platform and run it.

### 4. Configure

Enter in the app Settings:
- **Kefas API Token** — Your token from step 1
- **ProPresenter Host** — IP address or hostname (default: 127.0.0.1)
- **ProPresenter Port** — Usually `55056` for ProPresenter 7+, or `50001` for some setups

Or click **Auto-Discover** to automatically find running ProPresenter instances on your network. The app will scan for ProPresenter using mDNS/Bonjour and by probing common ports. Select a discovered instance to fill in the host and port automatically.

Click **Save Settings**.

### 5. Start

1. Open ProPresenter
2. Click **Start Bridge** in this app
3. Watch the connection indicator turn green
4. Change slides in ProPresenter — lyrics sync automatically to Kefas

## Settings

| Setting | Default | Notes |
|---------|---------|-------|
| Kefas Token | — | Required |
| ProPresenter Host | 127.0.0.1 | IP or hostname of ProPresenter machine |
| ProPresenter Port | 55056 | Network API port (55056 for ProPresenter 7+) |
| Auto-Discover | — | Scan the network for running ProPresenter instances |
| Default Lyric Language | nl | Language code for regular lyrics (e.g., nl, en, de, fr) |
| Use Notes Instead | Off | Use slide notes when triggered |
| Notes Trigger | "Current Slide Notes" | Trigger string |
| Alternate Language (Notes) | en | Language code for translations in notes field |
| Max Reconnection Attempts | 3 | Number of times to retry if connection drops |
| Reconnection Delay | 5 seconds | Wait time between reconnection attempts |

### Settings Interface

![Settings Page 1](img/settings1.png)

![Settings Page 2](img/settings2.png)

## Auto-Discovery

The app can automatically find ProPresenter instances running on your network. In Settings, click **Auto-Discover** to scan for available instances. The discovery uses two strategies:

- **mDNS/Bonjour** — Browses for ProPresenter services advertised on the local network
- **HTTP probing** — Checks common ProPresenter API ports on localhost by hitting the `/version` endpoint (ProPresenter 19+) or `/v1/version` (older versions)

Discovered instances are shown as clickable items displaying the machine name, ProPresenter version, and host:port. Click one to fill in the host and port fields automatically.

This is especially useful when the ProPresenter port changes between sessions or when ProPresenter is running on a different machine on the network.

## Using Notes Instead of Text

### What Is This?

By default, the app sends the slide's main text to Kefas. You can enable **Use Notes Instead** to send the slide's notes field instead.

### When to Use This

This is useful when you have **bilingual lyrics** in ProPresenter:
- Main text contains both original language and translation
- Notes field contains only the translation
- You want Kefas to display the translation in a different language

**Example:**
- Slide text: "Geweldige Genade" (Dutch lyrics)
- Slide notes: "Amazing Grace" (English translation)
- With notes enabled, the English translation sends to Kefas with the alternate language code

### How It Works

When you use ProPresenter's slide notes feature with bilingual content:
- ProPresenter displays the slide text with a "Current Slide Notes" label
- This label appears when the notes box is visible on the slide
- The app detects this label and automatically switches to sending the notes instead

### How to Enable

1. Check **Use Notes Instead of Text**
2. The default **Notes Trigger String** is `"Current Slide Notes"`
   - This matches the label ProPresenter displays when using slide notes
   - Change this if you use a custom ProPresenter template with a different label

When the app detects the trigger string in the slide text, it automatically uses the notes field instead of the main text.

## Language Settings

The app supports sending lyrics to Kefas with the appropriate language code based on the Kefas API specification:

- **Default Lyric Language** (default: `nl`) — Language code used for regular slide text
- **Alternate Language for Notes** (default: `en`) — Language code used when notes are displayed (translations)

The language code is automatically included in the API request to Kefas. When you send lyrics:
- Regular slide text uses the **Default Lyric Language** setting
- Slide notes (when enabled) use the **Alternate Language** setting

The activity log will show which language is being sent, for example:
- `Sending (nl): lyrics text...`
- `Sending (en): translation text...`

Supported language codes follow ISO 639-1/639-2 standards (135+ languages supported by Kefas API).

## Connection Status

The app shows a real-time connection indicator:
- **🟢 Green** — Connected to ProPresenter API stream
- **🟠 Orange** — Connecting to stream
- **🔴 Red** — Connection error
- **⚫ Gray** — Disconnected

## Automatic Reconnection

If the ProPresenter connection drops, the app will automatically attempt to reconnect. The reconnection behavior can be configured in Settings:

- **Max Reconnection Attempts** (1-10, default: 3) — Number of reconnection attempts before the bridge stops
- **Reconnection Delay** (1-60 seconds, default: 5) — Wait time between each reconnection attempt

For example, with default settings, if the connection drops:
1. Attempt 1 fails → wait 5 seconds
2. Attempt 2 fails → wait 5 seconds
3. Attempt 3 fails → bridge stops automatically

This ensures the app doesn't consume resources trying to connect to an unavailable ProPresenter instance.

## Troubleshooting

### Bridge won't start
- Verify your Kefas token is correct
- Make sure ProPresenter is running on the configured host and port
- Check that Network is enabled in ProPresenter → Network
- Verify the host/IP address is correct and reachable
- Try using **Auto-Discover** in Settings to find the correct host and port

### Connection errors
- Ensure ProPresenter's Network is enabled
- Verify the port number is correct (default: 55056 for ProPresenter 7+)
- Use **Auto-Discover** in Settings to detect the correct port if it has changed
- Try accessing `http://localhost:55056/v1/status/slide` in your browser to verify the API is working

### Lyrics not syncing
- Check the Activity Log for error messages
- Check ProPresenter has lyrics on the current slide
- Verify the connection indicator is green

### "Bridge API not available"
- Restart the app
- Check browser console for errors (Cmd+Option+I)

## Logging

Detailed logs are automatically saved to disk every time the bridge runs. Each session creates a new timestamped log file:

- **macOS**: `~/Library/Logs/ProPresenter Kefas Bridge/propresenter-kefas-bridge-YYYY-MM-DD-HHmmss.log`
- **Windows**: `%APPDATA%\ProPresenter Kefas Bridge\logs\propresenter-kefas-bridge-YYYY-MM-DD-HHmmss.log`
- **Linux**: `~/.config/ProPresenter Kefas Bridge/logs/propresenter-kefas-bridge-YYYY-MM-DD-HHmmss.log`

To access logs:
- Use the **Help → Open Log Location** menu item to open the logs folder
- Or navigate to the paths above using your file manager

Logs include:
- Connection status and stream events
- API requests and responses
- Slide extraction details
- Error messages and stack traces
- Full activity timeline

## Development

```bash
npm install
npm start              # Run in development
npm run build:mac      # Build for macOS
npm run build:win      # Build for Windows
npm run build:linux    # Build for Linux
```

## How It Works

1. **Connect** — Establishes HTTP streaming connection to ProPresenter
2. **Stream** — Receives real-time slide updates via chunked response
3. **Extract** — Gets slide text or notes from stream data
4. **Send** — Posts to Kefas if content changed
5. **Log** — Shows status in the activity log

## Technical Details

- Uses ProPresenter 7+ chunked streaming API
- Connects to `/v1/status/slide?chunked=true` endpoint
- Receives JSON chunks delimited by `\r\n\r\n`
- Server-push architecture (no polling, no WebSocket)
- Event-driven updates when slides change
- Built with Electron for cross-platform compatibility
- Secure: Context isolation, CSP, proper IPC cleanup

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - See LICENSE file for details

## Version

Current version: **2026.2.0**