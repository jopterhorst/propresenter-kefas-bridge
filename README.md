# ProPresenter Kefas Bridge

Automatically send lyrics from ProPresenter 7 slides to Kefas in real-time.

## What It Does

This app monitors ProPresenter for slide changes and automatically sends the current slide lyrics to Kefas. No manual copying—it just works.

## Requirements

- **ProPresenter 7** with network API enabled
- **Kefas account** with API token
- **macOS, Windows, or Linux**

## Quick Start

### 1. Get Your Kefas API Token

Log into your Kefas account and create an API token.

### 2. Install & Launch

Download the app for your platform and run it.

### 3. Configure

Enter in the app:
- **Kefas API Token** — Your token from step 1
- **ProPresenter Port** — Usually `55056`
- **Polling Interval** — How often to check (default: 5 seconds)

Click **Save Settings**.

### 4. Start

1. Open ProPresenter
2. Click **Start Bridge** in this app
3. Watch the activity log
4. Change slides in ProPresenter — lyrics sync automatically to Kefas

## Settings

| Setting | Default | Notes |
|---------|---------|-------|
| Kefas Token | — | Required |
| ProPresenter Port | 55056 | Network API port |
| Polling Interval | 5000ms | Min: 100ms |
| Use Notes Instead | Off | Use slide notes when triggered |
| Notes Trigger | "Current Slide Notes" | Trigger string |
| Debug Mode | Off | Verbose logging |

## Using Notes Instead of Text

### What Is This?

By default, the app sends the slide's main text to Kefas. You can enable **Use Notes Instead** to send the slide's notes field instead.

### When to Use This

This is useful when you have **bilingual lyrics** in ProPresenter:
- Main text contains both original language and translation
- Notes field contains only the original language
- You want Kefas to display only the original language

**Example:**
- Slide text: "Amazing Grace (Geweldige Genade)"
- Slide notes: "Amazing Grace"
- With notes enabled, only "Amazing Grace" sends to Kefas

### How It Works

When you use ProPresenter's slide notes feature with bilingual content:
- ProPresenter displays the slide text with a "Current Slide Notes" label
- This label appears when the notes box is visible on the slide
- The app detects this label and automatically switches to sending the notes instead

### How to Enable

1. Check **Use Notes Instead of Text**
2. The default **Notes Trigger String** is `"Current Slide Notes"`
   - This matches the label ProPresenter displays when using slide notes
   - Change this if you use a custom ProPresenter template with a different label (not sure if even possible)

When the app detects the trigger string in the slide text, it automatically uses the notes field instead of the main text.

## Troubleshooting

### Bridge won't start
- Verify your Kefas token is correct
- Make sure ProPresenter is running on port 55056
- Check that network API is enabled in ProPresenter

### Lyrics not syncing
- Enable Debug Mode to see detailed logs
- Check ProPresenter has lyrics on the current slide
- Try adjusting the polling interval

### "Bridge API not available"
- Restart the app
- Check browser console for errors (F12 or Cmd+Option+I)

## Debug Mode

Enable Debug Mode in settings to see:
- API request details
- Response times
- Full error messages

Open DevTools (F12 or Cmd+Option+I) and look for `[DEBUG]` messages in the console.

## Development

```bash
npm install
npm start              # Run in development
npm run build:mac      # Build for macOS
npm run build:win      # Build for Windows
npm run build:linux    # Build for Linux
```

## How It Works

1. **Poll** — Checks ProPresenter API every N seconds
2. **Extract** — Gets slide text or notes
3. **Send** — Posts to Kefas if content changed
4. **Log** — Shows status in the activity log

## License

MIT
