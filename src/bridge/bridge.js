// bridge.js
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEBUG_LOG_FILE = path.join(process.env.HOME || '/tmp', 'propresenter-kefas-bridge.log');

function writeDebugLog(message) {
  try {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(DEBUG_LOG_FILE, line);
    console.log(`[LOG] ${message}`);
  } catch (err) {
    console.error('Failed to write debug log:', err.message);
  }
}

const PRO_HOST = '127.0.0.1';
const PRO_API_PORT = 55056; // ProPresenter API port
const KEFAS_BASE_URL = 'https://web.kefas.app';
const KEFAS_MEETING_ID = 'live';
const DEFAULT_POLL_INTERVAL = 5000; // Default: Poll every 5 seconds
const MIN_POLL_INTERVAL = 100; // Minimum: 0.1 seconds
const DEFAULT_NOTES_TRIGGER = 'Current Slide Notes';

let lastSentLyric = null;
let pollTimer = null;
let pollInterval = DEFAULT_POLL_INTERVAL;
let kefasToken = null;
let debugMode = false;
let isRunning = false;
let onStatusCallback = null;
let useNotes = false;
let notesTrigger = DEFAULT_NOTES_TRIGGER;

function updateStatus(message) {
  if (debugMode) console.debug(`[DEBUG] Status: ${message}`);
  onStatusCallback?.(message);
}

async function sendToKefas(content) {
  if (!kefasToken) {
    throw new Error('Kefas token not configured. Please set your token in settings.');
  }

  const url = `${KEFAS_BASE_URL}/api/public/meetings/${KEFAS_MEETING_ID}/messages`;
  
  writeDebugLog(`[SEND] Sending to Kefas - length: ${content.length} chars`);
  writeDebugLog(`[SEND] Content: "${content.substring(0, 200)}${content.length > 200 ? '...' : ''}"`);
  
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
  writeDebugLog(`[SEND] Kefas response: ${res.status} (${duration}ms)`);

  if (!res.ok) {
    const error = await res.text().catch(() => '');
    throw new Error(`Kefas API error ${res.status}: ${error || res.statusText}`);
  }

  const json = await res.json();
  if (debugMode) console.debug(`[DEBUG] Kefas response:`, json);
  writeDebugLog(`[SEND] Successfully sent to Kefas`);
  return json;
}

function extractCurrentLyric(statusJson) {
  if (!statusJson) {
    writeDebugLog(`[EXTRACT] Status JSON is null/undefined`);
    if (debugMode) console.debug(`[DEBUG] Status JSON is null/undefined`);
    return null;
  }

  // Check multiple possible locations where ProPresenter might put the slide text
  const candidates = [
    statusJson?.data?.current?.text,
    statusJson?.data?.slide?.current?.text,
    statusJson?.current?.text,
    statusJson?.slide?.text,
  ];

  let text = candidates.find((v) => !!v);
  
  if (!text) {
    writeDebugLog(`[EXTRACT] No text found in any candidate field`);
    if (debugMode) console.debug(`[DEBUG] No text found in status:`, statusJson);
    return null;
  }

  if (Array.isArray(text)) {
    text = text.join('\n').trim();
    writeDebugLog(`[EXTRACT] Text was array, joined into single string`);
  } else if (typeof text === 'string') {
    text = text.trim();
  } else {
    text = String(text).trim();
  }

  // Check if text contains the configured trigger string and useNotes is enabled
  if (useNotes && text.includes(notesTrigger)) {
    writeDebugLog(`[EXTRACT] Text contains trigger string "${notesTrigger}", attempting to use notes attribute instead`);
    
    // Check for notes in the same candidate locations
    const notesCandidates = [
      statusJson?.data?.current?.notes,
      statusJson?.data?.slide?.current?.notes,
      statusJson?.current?.notes,
      statusJson?.slide?.notes,
    ];
    
    let notes = notesCandidates.find((v) => !!v);
    
    if (notes) {
      if (Array.isArray(notes)) {
        notes = notes.join('\n').trim();
        writeDebugLog(`[EXTRACT] Notes was array, joined into single string`);
      } else if (typeof notes === 'string') {
        notes = notes.trim();
      } else {
        notes = String(notes).trim();
      }
      
      if (notes) {
        text = notes;
        writeDebugLog(`[EXTRACT] Using notes instead of text: "${text.substring(0, 150)}${text.length > 150 ? '...' : ''}"`);
      }
    }
  }

  if (debugMode) {
    console.debug(`[DEBUG] Extracted text:`, text);
  }

  writeDebugLog(`[EXTRACT] Final extracted text: ${text ? `"${text.substring(0, 150)}${text.length > 150 ? '...' : ''}"` : 'NULL'}`);
  return text || null;
}

async function getProPresenterSlideStatus() {
  const url = `http://${PRO_HOST}:${PRO_API_PORT}/v1/status/slide`;
  
  if (debugMode) console.debug(`[DEBUG] Fetching from: ${url}`);
  writeDebugLog(`[API] Fetching ProPresenter slide status from ${url}`);
  
  try {
    const res = await fetch(url);
    
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      writeDebugLog(`[API] Error: ${res.status} - ${text || res.statusText}`);
      throw new Error(`ProPresenter API error ${res.status}: ${text || res.statusText}`);
    }

    const json = await res.json();
    if (debugMode) console.debug(`[DEBUG] ProPresenter API response:`, json);
    writeDebugLog(`[API] Got response from ProPresenter API`);
    return json;
  } catch (err) {
    writeDebugLog(`[API] Fetch error: ${err.message}`);
    throw err;
  }
}

async function tick() {
  try {
    const status = await getProPresenterSlideStatus();
    const lyric = extractCurrentLyric(status);

    if (!lyric) {
      if (debugMode) console.debug(`[DEBUG] No lyric found on current slide`);
      updateStatus('No lyric found on current slide.');
      return;
    }

    if (lyric === lastSentLyric) {
      if (debugMode) console.debug(`[DEBUG] Lyric unchanged, skipping send`);
      writeDebugLog(`[POLL] Lyric unchanged, not sending`);
      return;
    }

    if (debugMode) {
      console.debug(`[DEBUG] New lyric detected!`);
      console.debug(`[DEBUG] Previous lyric: ${lastSentLyric?.substring(0, 100) || 'none'}...`);
      console.debug(`[DEBUG] New lyric: ${lyric.substring(0, 100)}...`);
    }

    writeDebugLog(`[POLL] New lyric detected - length: ${lyric.length} chars`);
    writeDebugLog(`[POLL] Content: "${lyric.substring(0, 200)}${lyric.length > 200 ? '...' : ''}"`);
    updateStatus(`Sending: ${JSON.stringify(lyric.substring(0, 50))}${lyric.length > 50 ? '...' : ''}`);
    await sendToKefas(lyric);
    lastSentLyric = lyric;
    writeDebugLog(`[POLL] Successfully sent to Kefas`);
    updateStatus('Sent to Kefas successfully.');
  } catch (err) {
    updateStatus(`Error: ${err.message}`);
    writeDebugLog(`[POLL] Error: ${err.message}`);
    if (debugMode) console.error(`[DEBUG] Error in tick:`, err);
  }
}



export function startBridge(token, port, debugModeEnabled, onStatus, intervalMs = DEFAULT_POLL_INTERVAL, useNotesParam = false, notesTriggerParam = DEFAULT_NOTES_TRIGGER) {
  writeDebugLog(`===== BRIDGE START =====`);
  writeDebugLog(`Token: ${token.substring(0, 5)}...`);
  writeDebugLog(`Port: ${port}`);
  writeDebugLog(`Debug mode: ${debugModeEnabled}`);
  writeDebugLog(`Use Notes: ${useNotesParam}, Trigger: "${notesTriggerParam}"`);
  
  if (isRunning) {
    onStatus?.('Bridge is already running.');
    return;
  }
  if (!token) {
    onStatus?.('Error: Kefas token is required.');
    return;
  }
  
  // Validate and clamp polling interval
  let validInterval = parseInt(intervalMs) || DEFAULT_POLL_INTERVAL;
  if (validInterval < MIN_POLL_INTERVAL) {
    validInterval = MIN_POLL_INTERVAL;
    writeDebugLog(`Polling interval too low, clamped to minimum: ${MIN_POLL_INTERVAL}ms`);
  }
  pollInterval = validInterval;
  
  debugMode = debugModeEnabled || false;
  kefasToken = token;
  useNotes = useNotesParam || false;
  notesTrigger = notesTriggerParam || DEFAULT_NOTES_TRIGGER;
  isRunning = true;
  onStatusCallback = onStatus;
  lastSentLyric = null;
  
  if (debugMode) console.debug(`[DEBUG] Debug mode enabled`);
  console.log(`Bridge starting with polling on port ${PRO_API_PORT}, interval: ${pollInterval}ms, debug mode: ${debugMode}`);
  writeDebugLog(`Bridge starting - polling ProPresenter API on port ${PRO_API_PORT} with interval ${pollInterval}ms`);
  
  onStatus?.(`Starting bridge - polling ProPresenter API every ${pollInterval/1000}s...`);
  
  // Start polling
  pollTimer = setInterval(() => {
    tick();
  }, pollInterval);
  
  // Do initial check immediately
  tick();
}

export function stopBridge(onStatus) {
  if (!isRunning) {
    onStatus?.('Bridge is not running.');
    return;
  }

  isRunning = false;
  lastSentLyric = null;
  onStatusCallback = null;

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  writeDebugLog(`===== BRIDGE STOPPED =====`);
  onStatus?.('Bridge stopped.');
}

export function getBridgeStatus() {
  return { isRunning };
}
