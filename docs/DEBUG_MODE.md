# Debug Mode Documentation

## Overview
Debug Mode provides verbose logging for developers and troubleshooting. When enabled, the app logs detailed information to the browser console (DevTools) and to the activity log in the UI.

## Enabling Debug Mode

1. Open the ProPresenter Kefas Bridge app
2. In the "API Settings" section, check the **🐛 Debug Mode** checkbox
3. Click **Save Settings**
4. The app will log "🐛 Debug mode enabled."

## What Gets Logged

### Network Requests
- ProPresenter API endpoint and response times
- Kefas API endpoint and response times
- HTTP status codes
- Response payloads (for debugging)

### Data Processing
- Raw JSON from ProPresenter API
- Extracted lyric text (first 100 characters shown)
- Lyric UUID and notes
- Comparison with previous lyric
- Full vs. partial updates

### State Changes
- Bridge start/stop events
- Mode transitions
- Token validation
- Error stack traces

### Performance Metrics
- API call duration in milliseconds
- Polling cycle timing
- Request/response sizes

## Accessing Console Logs

To view full debug output in the browser console:

1. **macOS**: Press `Cmd + Option + I` to open DevTools
2. **Windows/Linux**: Press `Ctrl + Shift + I`
3. Navigate to the **Console** tab
4. Look for messages prefixed with `[DEBUG]`

## Example Debug Output

```
[DEBUG] === Polling cycle starting ===
[DEBUG] Fetching ProPresenter status from http://127.0.0.1:1025/v1/status/slide
[DEBUG] Response status: 200 (45ms)
[DEBUG] ProPresenter response: { current: { text: "Amazing Grace...", notes: "...", uuid: "..." }, next: {...} }
[DEBUG] statusJson.current exists: true
[DEBUG] statusJson.current.text: Amazing Grace, how sweet the sound
[DEBUG] statusJson.current.uuid: 1C43092A-B254-45F0-8F8A-9A8FEE26F4DE
[DEBUG] Extracted lyric (120 chars): Amazing Grace, how sweet the sound...
[DEBUG] New lyric detected!
[DEBUG] Previous lyric: none
[DEBUG] New lyric: Amazing Grace, how sweet the sound...
[DEBUG] Sending to Kefas: https://web.kefas.app/api/public/meetings/live/messages
[DEBUG] Content length: 120 chars
[DEBUG] Content preview: Amazing Grace, how sweet the sound...
[DEBUG] Kefas response status: 200 (234ms)
[DEBUG] Kefas response: { id: "...", created_at: "...", ... }
```

## Common Debug Patterns

### Problem: No lyrics being detected
**What to look for in debug logs:**
- `No text found in current slide` - No lyrics on current slide
- `statusJson.current exists: false` - API structure issue
- Check the full `ProPresenter response` payload

### Problem: Lyrics not sending to Kefas
**What to look for in debug logs:**
- `Lyric unchanged, skipping` - Lyric hasn't changed
- `Kefas API error 401` - Invalid token
- Check Kefas response payload for errors

### Problem: Bridge freezing/hanging
**What to look for in debug logs:**
- Missing response logs (fetch timeout)
- Check ProPresenter is running on port 1025
- Look for timeout errors in console

## Performance Optimization

Debug logs show response times - use this to identify bottlenecks:
- ProPresenter API slow? (> 100ms?) - Check ProPresenter performance
- Kefas API slow? (> 500ms?) - Check network/Kefas service
- Polling frequency too high? - Increase POLL_INTERVAL

## Disabling Debug Mode

1. Uncheck the 🐛 Debug Mode checkbox
2. Click **Save Settings**
3. Console logs will stop appearing

## Privacy Note

Debug mode does NOT log API tokens or sensitive data in the UI log, only in browser console. The browser console is local to your machine and not transmitted anywhere.
