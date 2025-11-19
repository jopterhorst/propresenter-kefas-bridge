// bridge.js
const fs = require('fs');
const path = require('path');

const DEBUG_LOG_FILE = path.join(process.env.HOME || '/tmp', 'propresenter-kefas-bridge.log');

function writeDebugLog(message) {
  try {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(DEBUG_LOG_FILE, line);
    // Safely log to console, ignore EPIPE errors
    try {
      console.log(`[LOG] ${message}`);
    } catch (err) {
      // Ignore console write errors
    }
  } catch (err) {
    // Silently fail if log file write fails
  }
}

const PRO_HOST = '127.0.0.1';
let PRO_API_HOST = PRO_HOST; // ProPresenter API host (can be overridden)
let PRO_API_PORT = 55056; // ProPresenter API port (can be overridden)
const KEFAS_BASE_URL = 'https://web.kefas.app';
const KEFAS_MEETING_ID = 'live';

const DEFAULT_NOTES_TRIGGER = 'Current Slide Notes';

let lastSentLyric = null;
let kefasToken = null;
let debugMode = false;
let isRunning = false;
let onStatusCallback = null;
let onConnectionStatusCallback = null;
let useNotes = false;
let notesTrigger = DEFAULT_NOTES_TRIGGER;
let streamAbortController = null;
let streamFailureCount = 0;
let streamReconnectTimeout = null;
let MAX_RECONNECT_ATTEMPTS = 3;
let RECONNECT_DELAY_MS = 5000; // 5 seconds between reconnect attempts

function updateStatus(message) {
  if (debugMode) console.debug(`[DEBUG] Status: ${message}`);
  onStatusCallback?.(message);
}

function updateConnectionStatus(status, details = '') {
  if (debugMode) console.debug(`[DEBUG] Connection Status: ${status} - ${details}`);
  onConnectionStatusCallback?.({ status, details });
  writeDebugLog(`[CONNECTION] Status: ${status} - ${details}`);
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

  // If text is exactly the trigger string, treat as empty
  if (useNotes && text === notesTrigger) {
    writeDebugLog(`[EXTRACT] Text is exactly the notes trigger, treating as empty slide`);
    return null;
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

async function processSlideUpdate(slideData) {
  try {
    writeDebugLog(`[STREAM] Received slide update`);
    
    const lyric = extractCurrentLyric(slideData);

    if (!lyric) {
      if (debugMode) console.debug(`[DEBUG] No lyric on slide`);
      updateStatus('No lyric found on current slide.');
      return;
    }

    // On first connection, just record the current slide without sending
    if (lastSentLyric === null) {
      lastSentLyric = lyric;
      writeDebugLog(`[STREAM] Initial slide recorded, not sending (waiting for slide change)`);
      updateStatus('Connected - waiting for slide change...');
      return;
    }

    if (lyric === lastSentLyric) {
      if (debugMode) console.debug(`[DEBUG] Lyric unchanged`);
      writeDebugLog(`[STREAM] Lyric unchanged, not sending`);
      return;
    }

    if (debugMode) {
      console.debug(`[DEBUG] New lyric detected!`);
      console.debug(`[DEBUG] Previous lyric: ${lastSentLyric?.substring(0, 100) || 'none'}...`);
      console.debug(`[DEBUG] New lyric: ${lyric.substring(0, 100)}...`);
    }

    writeDebugLog(`[STREAM] New lyric detected - length: ${lyric.length} chars`);
    writeDebugLog(`[STREAM] Content: "${lyric.substring(0, 200)}${lyric.length > 200 ? '...' : ''}"`);
    updateStatus(`Sending: ${lyric.substring(0, 50)}${lyric.length > 50 ? '...' : ''}`);
    await sendToKefas(lyric);
    lastSentLyric = lyric;
    writeDebugLog(`[STREAM] Successfully sent to Kefas`);
    updateStatus('Sent to Kefas successfully.');
  } catch (err) {
    updateStatus(`Error: ${err.message}`);
    writeDebugLog(`[STREAM] Error processing slide: ${err.message}`);
    if (debugMode) console.error('[DEBUG] Processing error:', err);
  }
}

async function connectChunkedStream(host, port) {
  const url = `http://${host}:${port}/v1/status/slide?chunked=true`;
  
  writeDebugLog(`[STREAM] Connecting to chunked stream: ${url}`);
  if (debugMode) console.debug(`[DEBUG] Connecting to chunked stream: ${url}`);
  updateConnectionStatus('connecting', 'Connecting to ProPresenter API...');
  
  try {
    streamAbortController = new AbortController();
    
    const response = await fetch(url, {
      signal: streamAbortController.signal
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    updateConnectionStatus('connected', `Streaming from ${host}:${port}`);
    updateStatus('Connected - listening for slide changes...');
    writeDebugLog(`[STREAM] Connected successfully, reading stream...`);
    
    // Read the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    
    while (isRunning) {
      const { done, value } = await reader.read();
      
      if (done) {
        writeDebugLog(`[STREAM] Stream ended`);
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete chunks (delimited by \r\n\r\n)
      let endOfChunkPosition;
      while ((endOfChunkPosition = buffer.indexOf('\r\n\r\n')) !== -1) {
        const chunk = buffer.slice(0, endOfChunkPosition);
        buffer = buffer.slice(endOfChunkPosition + 4); // Remove processed chunk
        
        // Parse chunk as JSON
        try {
          const slideData = JSON.parse(chunk);
          await processSlideUpdate(slideData);
        } catch (e) {
          writeDebugLog(`[STREAM] Failed to parse chunk: ${e.message}`);
          if (debugMode) console.error('[DEBUG] Parse error:', e);
        }
      }
    }
    
    // Stream ended or was stopped
    if (isRunning) {
      // Stream ended unexpectedly
      handleStreamFailure('Stream ended unexpectedly');
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      writeDebugLog(`[STREAM] Stream connection aborted`);
      updateConnectionStatus('disconnected', 'Connection closed');
    } else {
      writeDebugLog(`[STREAM] Connection error: ${err.message}`);
      if (debugMode) console.error(`[DEBUG] Stream error:`, err);
      handleStreamFailure(err.message);
    }
  }
}

function disconnectStream() {
  if (streamReconnectTimeout) {
    clearTimeout(streamReconnectTimeout);
    streamReconnectTimeout = null;
  }
  
  if (streamAbortController) {
    writeDebugLog(`[STREAM] Aborting stream connection`);
    streamAbortController.abort();
    streamAbortController = null;
  }
  
  updateConnectionStatus('disconnected', 'Bridge stopped');
}

function handleStreamFailure(errorMsg) {
  streamFailureCount++;
  const failureMsg = `Stream connection failed (${streamFailureCount}/${MAX_RECONNECT_ATTEMPTS}): ${errorMsg}`;
  writeDebugLog(`[STREAM] ${failureMsg}`);
  if (debugMode) console.debug(`[DEBUG] ${failureMsg}`);
  
  if (streamFailureCount >= MAX_RECONNECT_ATTEMPTS) {
    writeDebugLog(`[STREAM] Max reconnection attempts reached. Stopping bridge.`);
    if (debugMode) console.debug(`[DEBUG] Max reconnection attempts reached`);
    updateStatus(`Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts. Bridge stopped.`);
    updateConnectionStatus('error', `Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
    
    // Automatically stop the bridge
    stopBridge(() => {});
  } else if (!streamReconnectTimeout) {
    // Only schedule a reconnect if one isn't already scheduled
    updateStatus(`Connection failed. Retrying in ${RECONNECT_DELAY_MS / 1000}s (attempt ${streamFailureCount}/${MAX_RECONNECT_ATTEMPTS})...`);
    updateConnectionStatus('error', `Connection failed, will retry (${streamFailureCount}/${MAX_RECONNECT_ATTEMPTS})`);
    
    // Schedule reconnection attempt
    streamReconnectTimeout = setTimeout(() => {
      streamReconnectTimeout = null;
      if (isRunning) {
        writeDebugLog(`[STREAM] Attempting reconnection (attempt ${streamFailureCount + 1}/${MAX_RECONNECT_ATTEMPTS})`);
        connectChunkedStream(PRO_API_HOST, PRO_API_PORT);
      }
    }, RECONNECT_DELAY_MS);
  }
}



function startBridge(token, host, port, debugModeEnabled, onStatus, intervalMs = 0, useNotesParam = false, notesTriggerParam = DEFAULT_NOTES_TRIGGER, onConnectionStatus = null, password = '', maxReconnectParam = 3, reconnectDelayParam = 5000) {
  writeDebugLog(`===== BRIDGE START =====`);
  writeDebugLog(`Token: ${token.substring(0, 5)}...`);
  writeDebugLog(`Host: ${host}`);
  writeDebugLog(`Port: ${port}`);
  writeDebugLog(`Debug mode: ${debugModeEnabled}`);
  writeDebugLog(`Use Notes: ${useNotesParam}, Trigger: "${notesTriggerParam}"`);
  writeDebugLog(`Max Reconnect Attempts: ${maxReconnectParam}`);
  writeDebugLog(`Reconnect Delay: ${reconnectDelayParam}ms`);
  
  if (isRunning) {
    onStatus?.('Bridge is already running.');
    return;
  }
  if (!token) {
    onStatus?.('Error: Kefas token is required.');
    return;
  }
  
  // Set the ProPresenter API host and port from settings
  PRO_API_HOST = host || '127.0.0.1';
  PRO_API_PORT = parseInt(port) || 55056;
  
  debugMode = debugModeEnabled || false;
  kefasToken = token;
  useNotes = useNotesParam || false;
  notesTrigger = notesTriggerParam || DEFAULT_NOTES_TRIGGER;
  isRunning = true;
  onStatusCallback = onStatus;
  onConnectionStatusCallback = onConnectionStatus;
  lastSentLyric = null;
  streamFailureCount = 0; // Reset failure counter on start
  
  // Set reconnection parameters from settings
  MAX_RECONNECT_ATTEMPTS = maxReconnectParam || 3;
  RECONNECT_DELAY_MS = reconnectDelayParam || 5000;
  
  if (debugMode) console.debug(`[DEBUG] Debug mode enabled`);
  console.log(`Bridge starting with chunked streaming to ProPresenter API on port ${PRO_API_PORT}`);
  writeDebugLog(`Bridge starting - using chunked stream for real-time slide updates`);
  
  onStatus?.(`Starting bridge - connecting to ProPresenter API...`);
  updateConnectionStatus('connecting', 'Connecting to ProPresenter...');
  
  // Connect to chunked stream - will receive real-time slide updates
  connectChunkedStream(PRO_API_HOST, PRO_API_PORT);
}

function stopBridge(onStatus) {
  if (!isRunning) {
    onStatus?.('Bridge is not running.');
    return;
  }

  isRunning = false;
  lastSentLyric = null;
  onStatusCallback = null;
  onConnectionStatusCallback = null;
  streamFailureCount = 0;
  
  // Disconnect stream
  disconnectStream();

  writeDebugLog(`===== BRIDGE STOPPED =====`);
  onStatus?.('Bridge stopped.');
}

function getBridgeStatus() {
  return { isRunning };
}

module.exports = { startBridge, stopBridge, getBridgeStatus };

// Handle EPIPE errors globally
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE') {
    // Silently ignore EPIPE errors
    return;
  }
  console.error('Uncaught error:', err);
});

process.on('unhandledRejection', (err) => {
  if (err && err.code === 'EPIPE') {
    // Silently ignore EPIPE errors
    return;
  }
  console.error('Unhandled rejection:', err);
});

