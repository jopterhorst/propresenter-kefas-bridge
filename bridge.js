// bridge.js
import fetch from 'node-fetch';

const PRO_HOST = '127.0.0.1';
const KEFAS_BASE_URL = 'https://web.kefas.app';
const KEFAS_MEETING_ID = 'live';
const POLL_INTERVAL = 5000;

let lastSentLyric = null;
let timer = null;
let kefasToken = null;
let debugMode = false;
let isRunning = false;
let proPresenterPort = 55056;

async function getProPresenterSlideStatus() {
  const url = `http://${PRO_HOST}:${proPresenterPort}/v1/status/slide`;
  
  // Add 5 second timeout to prevent hanging
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  
  try {
    if (debugMode) console.debug(`[DEBUG] Fetching ProPresenter status from ${url}`);
    
    const startTime = Date.now();
    const res = await fetch(url, { signal: controller.signal });
    const duration = Date.now() - startTime;

    if (debugMode) console.debug(`[DEBUG] Response status: ${res.status} (${duration}ms)`);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ProPresenter API error ${res.status}: ${text || res.statusText}`);
    }

    const json = await res.json();
    if (debugMode) console.debug(`[DEBUG] ProPresenter response:`, json);
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

function extractCurrentLyric(statusJson) {
  if (!statusJson) {
    if (debugMode) console.debug(`[DEBUG] Status JSON is null/undefined`);
    return null;
  }

  // ProPresenter API returns: { current: { text, notes, uuid }, next: { ... } }
  let text = statusJson?.current?.text;
  
  if (debugMode) {
    console.debug(`[DEBUG] statusJson.current exists:`, !!statusJson?.current);
    console.debug(`[DEBUG] statusJson.current.text:`, text);
    console.debug(`[DEBUG] statusJson.current.uuid:`, statusJson?.current?.uuid);
  }
  
  if (!text) {
    if (debugMode) console.debug(`[DEBUG] No text found in current slide`);
    return null;
  }

  // Handle array of strings (each line)
  if (Array.isArray(text)) {
    text = text.join('\n').trim();
    if (debugMode) console.debug(`[DEBUG] Converted array text to string: ${text.substring(0, 100)}...`);
  } else if (typeof text === 'string') {
    text = text.trim();
  } else {
    text = String(text).trim();
  }

  if (debugMode) console.debug(`[DEBUG] Extracted lyric (${text.length} chars): ${text.substring(0, 100)}...`);
  return text || null;
}

async function sendToKefas(content) {
  if (!kefasToken) {
    throw new Error('Kefas token not configured. Please set your token in settings.');
  }

  const url = `${KEFAS_BASE_URL}/api/public/meetings/${KEFAS_MEETING_ID}/messages`;
  
  if (debugMode) {
    console.debug(`[DEBUG] Sending to Kefas: ${url}`);
    console.debug(`[DEBUG] Content length: ${content.length} chars`);
    console.debug(`[DEBUG] Content preview: ${content.substring(0, 100)}...`);
  }

  const startTime = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${kefasToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  const duration = Date.now() - startTime;

  if (debugMode) console.debug(`[DEBUG] Kefas response status: ${res.status} (${duration}ms)`);

  if (!res.ok) {
    const error = await res.text().catch(() => '');
    throw new Error(`Kefas API error ${res.status}: ${error || res.statusText}`);
  }

  const json = await res.json();
  if (debugMode) console.debug(`[DEBUG] Kefas response:`, json);
  return json;
}

async function tick(onStatus) {
  try {
    if (debugMode) console.debug(`[DEBUG] === Polling cycle starting ===`);
    
    const status = await getProPresenterSlideStatus();
    const lyric = extractCurrentLyric(status);

    if (!lyric) {
      if (debugMode) console.debug(`[DEBUG] No lyric found on current slide`);
      onStatus?.('⏸️ No lyric found on current slide.');
      return;
    }

    if (lyric === lastSentLyric) {
      if (debugMode) console.debug(`[DEBUG] Lyric unchanged, skipping send`);
      onStatus?.('➡️ Lyric unchanged, skipping.');
      return;
    }

    if (debugMode) {
      console.debug(`[DEBUG] New lyric detected!`);
      console.debug(`[DEBUG] Previous lyric: ${lastSentLyric?.substring(0, 100) || 'none'}...`);
      console.debug(`[DEBUG] New lyric: ${lyric.substring(0, 100)}...`);
    }

    onStatus?.(`📤 Sending: ${JSON.stringify(lyric.substring(0, 50))}${lyric.length > 50 ? '...' : ''}`);
    await sendToKefas(lyric);
    lastSentLyric = lyric;
    onStatus?.('✅ Sent to Kefas successfully.');
  } catch (err) {
    onStatus?.(`❌ Error: ${err.message}`);
    if (debugMode) console.error(`[DEBUG] Error in tick():`, err);
  }
}

export function startBridge(token, port, debugModeEnabled, onStatus) {
  if (timer) {
    onStatus?.('⚠️ Bridge is already running.');
    return;
  }
  if (!token) {
    onStatus?.('❌ Error: Kefas token is required.');
    return;
  }
  if (!port || port < 1 || port > 65535) {
    onStatus?.('❌ Error: Invalid ProPresenter port.');
    return;
  }
  
  debugMode = debugModeEnabled || false;
  kefasToken = token;
  proPresenterPort = port;
  isRunning = true;
  
  if (debugMode) console.debug(`[DEBUG] Debug mode enabled`);
  console.log(`Bridge starting with debug mode: ${debugMode}, ProPresenter port: ${proPresenterPort}`);
  
  onStatus?.(`▶️ Starting bridge on port ${port}…`);
  tick(onStatus);
  timer = setInterval(() => tick(onStatus), POLL_INTERVAL);
}

export function stopBridge(onStatus) {
  if (timer) {
    clearInterval(timer);
    timer = null;
    lastSentLyric = null; // Reset state
    isRunning = false;
    onStatus?.('⏹️ Bridge stopped.');
  } else {
    onStatus?.('⚠️ Bridge is not running.');
  }
}

export function getBridgeStatus() {
  return { isRunning };
}
