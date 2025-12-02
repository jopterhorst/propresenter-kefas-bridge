// bridge.js
const fs = require('fs');
const path = require('path');

// Maximum buffer size for stream processing (10MB)
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

let DEBUG_LOG_DIR = null;
let DEBUG_LOG_FILE = null;

/**
 * Initializes the debug log directory path
 * @param {string} logPath - Path to the log directory
 */
function initializeLogPath(logPath) {
  DEBUG_LOG_DIR = logPath;
}

/**
 * Creates a new timestamped log file for the current session
 * Format: propresenter-kefas-bridge-YYYY-MM-DD-HHmmss.log
 */
function createSessionLogFile() {
  if (!DEBUG_LOG_DIR) return null;
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const filename = `propresenter-kefas-bridge-${year}-${month}-${day}-${hours}${minutes}${seconds}.log`;
  return path.join(DEBUG_LOG_DIR, filename);
}

/**
 * Writes a debug message to the log file and console
 * @param {string} message - The message to log
 */
function writeDebugLog(message) {
  try {
    if (DEBUG_LOG_FILE) {
      const timestamp = new Date().toISOString();
      const line = `[${timestamp}] ${message}\n`;
      fs.appendFileSync(DEBUG_LOG_FILE, line);
    }
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

let lastSentLyric = null;
let kefasToken = null;
let isRunning = false;
let onStatusCallback = null;
let onConnectionStatusCallback = null;
let useNotes = false;
let notesTrigger = 'Current Slide Notes';
let defaultLyricLanguage = 'nl';
let alternateLanguage = 'en';
let streamAbortController = null;
let streamFailureCount = 0;
let streamReconnectTimeout = null;
let MAX_RECONNECT_ATTEMPTS = 3;
let RECONNECT_DELAY_MS = 5000; // 5 seconds between reconnect attempts

/**
 * Updates the bridge status and sends it to the callback
 * @param {string} message - Status message to send
 */
function updateStatus(message) {
  writeDebugLog(`[STATUS] ${message}`);
  onStatusCallback?.(message);
}

/**
 * Updates the connection status with details and logs it
 * @param {string} status - Connection status (connected, connecting, error, disconnected)
 * @param {string} [details=''] - Additional details about the connection status
 */
function updateConnectionStatus(status, details = '') {
  writeDebugLog(`[CONNECTION] Status: ${status} - ${details}`);
  onConnectionStatusCallback?.({ status, details });
}

/**
 * Sends lyric content to the Kefas API
 * @param {string} content - The lyric content to send
 * @param {boolean} isFromNotes - Whether the content is from notes (uses alternate language)
 * @returns {Promise<Object>} The JSON response from Kefas API
 * @throws {Error} If token is not configured or API request fails
 */
async function sendToKefas(content, isFromNotes = false) {
  if (!kefasToken) {
    throw new Error('Kefas token not configured. Please set your token in settings.');
  }

  const url = `${KEFAS_BASE_URL}/api/public/meetings/${KEFAS_MEETING_ID}/messages`;
  
  // Use alternate language when content is from notes, otherwise use default lyric language
  const language = isFromNotes ? alternateLanguage : defaultLyricLanguage;
  
  writeDebugLog(`[SEND] Sending to Kefas - length: ${content.length} chars, language: ${language}, from notes: ${isFromNotes}`);
  writeDebugLog(`[SEND] Content: "${content.substring(0, 200)}${content.length > 200 ? '...' : ''}"`);
  const startTime = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${kefasToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content, language }),
  });
  const duration = Date.now() - startTime;

  writeDebugLog(`[SEND] Kefas response: ${res.status} (${duration}ms)`);

  if (!res.ok) {
    const error = await res.text().catch(() => '');
    throw new Error(`Kefas API error ${res.status}: ${error || res.statusText}`);
  }

  const json = await res.json();
  writeDebugLog(`[SEND] Kefas response: ${JSON.stringify(json).substring(0, 200)}...`);
  writeDebugLog(`[SEND] Successfully sent to Kefas`);
  return json;
}

/**
 * Extracts the current lyric text from ProPresenter status JSON
 * Checks multiple possible locations and optionally uses notes instead of text
 * @param {Object} statusJson - The status JSON object from ProPresenter
 * @returns {{content: string|null, isFromNotes: boolean}} Object with extracted lyric text and whether it's from notes
 */
function extractCurrentLyric(statusJson) {
  if (!statusJson) {
    writeDebugLog(`[EXTRACT] Status JSON is null/undefined`);
    return { content: null, isFromNotes: false };
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
    return { content: null, isFromNotes: false };
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
    return { content: null, isFromNotes: false };
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
        writeDebugLog(`[EXTRACT] Using notes instead of text: "${text.substring(0, 150)}${text.length > 150 ? '...' : ''}"}`);
        writeDebugLog(`[EXTRACT] Final extracted text: ${text ? `"${text.substring(0, 150)}${text.length > 150 ? '...' : ''}"` : 'NULL'}`);
        return { content: text, isFromNotes: true };
      }
    }
  }

  writeDebugLog(`[EXTRACT] Final extracted text: ${text ? `"${text.substring(0, 150)}${text.length > 150 ? '...' : ''}"` : 'NULL'}`);
  return { content: text || null, isFromNotes: false };
}

/**
 * Processes a slide update from the ProPresenter stream
 * Extracts lyrics and sends to Kefas if changed
 * @param {Object} slideData - The slide data from ProPresenter stream
 * @returns {Promise<void>}
 */
async function processSlideUpdate(slideData) {
  try {
    writeDebugLog(`[STREAM] Received slide update`);
    
    const { content: lyric, isFromNotes } = extractCurrentLyric(slideData);

    if (!lyric) {
      writeDebugLog(`[STREAM] No lyric found on current slide`);
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
      writeDebugLog(`[STREAM] Lyric unchanged, not sending`);
      return;
    }

    writeDebugLog(`[STREAM] New lyric detected - length: ${lyric.length} chars`);
    writeDebugLog(`[STREAM] Previous lyric: "${lastSentLyric?.substring(0, 100) || 'none'}..."`);
    writeDebugLog(`[STREAM] New lyric: "${lyric.substring(0, 100)}..."`);
    writeDebugLog(`[STREAM] Content: "${lyric.substring(0, 200)}${lyric.length > 200 ? '...' : ''}"`);
    
    const language = isFromNotes ? alternateLanguage : defaultLyricLanguage;
    updateStatus(`Sending (${language}): ${lyric.substring(0, 50)}${lyric.length > 50 ? '...' : ''}`);
    await sendToKefas(lyric, isFromNotes);
    lastSentLyric = lyric;
    writeDebugLog(`[STREAM] Successfully sent to Kefas`);
    updateStatus(`Sent (${language}) to Kefas successfully.`);
  } catch (err) {
    updateStatus(`Error: ${err.message}`);
    writeDebugLog(`[STREAM] Error processing slide: ${err.message}`);
    writeDebugLog(`[STREAM] Error stack: ${err.stack}`);
  }
}

/**
 * Connects to ProPresenter's chunked streaming API for real-time slide updates
 * @param {string} host - The ProPresenter API host
 * @param {number} port - The ProPresenter API port
 * @returns {Promise<void>}
 */
async function connectChunkedStream(host, port) {
  const url = `http://${host}:${port}/v1/status/slide?chunked=true`;
  
  writeDebugLog(`[STREAM] Connecting to chunked stream: ${url}`);
  updateConnectionStatus('connecting', 'Connecting to ProPresenter API...');
  
  try {
    streamAbortController = new AbortController();
    
    const response = await fetch(url, {
      signal: streamAbortController.signal
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Reset failure count on successful connection
    streamFailureCount = 0;
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
      
      // Prevent buffer overflow - reset if too large
      if (buffer.length > MAX_BUFFER_SIZE) {
        writeDebugLog(`[STREAM] Buffer size exceeded ${MAX_BUFFER_SIZE} bytes, resetting`);
        buffer = '';
        updateStatus('Buffer overflow - waiting for next valid chunk...');
        continue;
      }
      
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
          writeDebugLog(`[STREAM] Failed to parse chunk: ${e.message} - First 100 chars: ${chunk.substring(0, 100)}`);
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
      writeDebugLog(`[STREAM] Error stack: ${err.stack}`);
      handleStreamFailure(err.message);
    }
  }
}

/**
 * Disconnects from the ProPresenter stream and clears reconnection timeout
 */
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

/**
 * Handles stream connection failures and manages reconnection attempts
 * @param {string} errorMsg - The error message describing the failure
 */
function handleStreamFailure(errorMsg) {
  streamFailureCount++;
  const failureMsg = `Stream connection failed (${streamFailureCount}/${MAX_RECONNECT_ATTEMPTS}): ${errorMsg}`;
  writeDebugLog(`[STREAM] ${failureMsg}`);
  
  if (streamFailureCount >= MAX_RECONNECT_ATTEMPTS) {
    writeDebugLog(`[STREAM] Max reconnection attempts reached. Stopping bridge.`);
    updateStatus(`Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts. Bridge stopped.`);
    updateConnectionStatus('error', `Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
    
    // Stop the bridge
    isRunning = false;
    lastSentLyric = null;
    streamFailureCount = 0;
    disconnectStream();
    
    // Notify that bridge has stopped - use the current callbacks
    onStatusCallback?.('Bridge stopped after max reconnection attempts.');
    onConnectionStatusCallback?.({ status: 'disconnected', details: 'Bridge stopped' });
    
    writeDebugLog(`===== BRIDGE STOPPED (AUTO) =====`);
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


/**
 * Starts the bridge to sync ProPresenter slides with Kefas
 * @param {string} token - Kefas API token
 * @param {string} host - ProPresenter API host
 * @param {number} port - ProPresenter API port
 * @param {Function} onStatus - Callback for status updates
 * @param {boolean} [useNotesParam=false] - Use slide notes instead of text
 * @param {string} [notesTriggerParam='Current Slide Notes'] - Trigger string to detect when to use notes
 * @param {Function|null} [onConnectionStatus=null] - Callback for connection status updates
 * @param {number} [maxReconnectParam=3] - Maximum reconnection attempts
 * @param {number} [reconnectDelayParam=5000] - Delay in milliseconds between reconnection attempts
 * @param {string} [defaultLyricLanguageParam='nl'] - Default language code for lyrics
 * @param {string} [alternateLanguageParam='en'] - Language code to use when notes are displayed
 */
function startBridge(token, host, port, onStatus, useNotesParam = false, notesTriggerParam = 'Current Slide Notes', onConnectionStatus = null, maxReconnectParam = 3, reconnectDelayParam = 5000, defaultLyricLanguageParam = 'nl', alternateLanguageParam = 'en') {
  // Create a new timestamped log file for this session
  DEBUG_LOG_FILE = createSessionLogFile();
  
  writeDebugLog(`===== BRIDGE START =====`);
  
  if (isRunning) {
    onStatus?.('Bridge is already running.');
    return;
  }
  
  // Validate required parameters
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    onStatus?.('Error: Kefas token is required and must be a non-empty string.');
    return;
  }
  
  // Validate host
  if (!host || typeof host !== 'string' || host.trim().length === 0) {
    onStatus?.('Error: ProPresenter host is required.');
    return;
  }
  
  // Validate port
  const portNum = parseInt(port);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    onStatus?.('Error: Port must be a number between 1 and 65535.');
    return;
  }
  
  // Validate reconnection parameters
  const maxReconnect = parseInt(maxReconnectParam);
  if (isNaN(maxReconnect) || maxReconnect < 1 || maxReconnect > 10) {
    onStatus?.('Error: Max reconnection attempts must be between 1 and 10.');
    return;
  }
  
  const reconnectDelay = parseInt(reconnectDelayParam);
  if (isNaN(reconnectDelay) || reconnectDelay < 1000 || reconnectDelay > 60000) {
    onStatus?.('Error: Reconnect delay must be between 1000 and 60000 milliseconds.');
    return;
  }
  
  writeDebugLog(`Token: ${token.substring(0, 5)}...`);
  writeDebugLog(`Host: ${host}`);
  writeDebugLog(`Port: ${portNum}`);
  writeDebugLog(`Use Notes: ${useNotesParam}, Trigger: "${notesTriggerParam}"`);
  writeDebugLog(`Max Reconnect Attempts: ${maxReconnect}`);
  writeDebugLog(`Reconnect Delay: ${reconnectDelay}ms`);
  writeDebugLog(`Default Lyric Language: ${defaultLyricLanguageParam || 'nl'}, Alternate Language: ${alternateLanguageParam || 'en'}`);
  
  // Set the ProPresenter API host and port from settings
  PRO_API_HOST = host.trim();
  PRO_API_PORT = portNum;
  
  kefasToken = token.trim();
  useNotes = useNotesParam || false;
  notesTrigger = notesTriggerParam || 'Current Slide Notes';
  defaultLyricLanguage = defaultLyricLanguageParam || 'nl';
  alternateLanguage = alternateLanguageParam || 'en';
  isRunning = true;
  onStatusCallback = onStatus;
  onConnectionStatusCallback = onConnectionStatus;
  lastSentLyric = null;
  streamFailureCount = 0; // Reset failure counter on start
  
  // Set reconnection parameters from settings
  MAX_RECONNECT_ATTEMPTS = maxReconnect;
  RECONNECT_DELAY_MS = reconnectDelay;
  
  console.log(`Bridge starting with chunked streaming to ProPresenter API on port ${PRO_API_PORT}`);
  writeDebugLog(`Bridge starting - using chunked stream for real-time slide updates`);
  
  onStatus?.(`Starting bridge - connecting to ProPresenter API...`);
  updateConnectionStatus('connecting', 'Connecting to ProPresenter...');
  
  // Connect to chunked stream - will receive real-time slide updates
  connectChunkedStream(PRO_API_HOST, PRO_API_PORT);
}

/**
 * Stops the bridge and disconnects from ProPresenter
 * @param {Function} onStatus - Callback for status updates
 */
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

/**
 * Gets the current bridge running status
 * @returns {{isRunning: boolean}} Object containing the running status
 */
function getBridgeStatus() {
  return { isRunning };
}

module.exports = { initializeLogPath, startBridge, stopBridge, getBridgeStatus };

// Handle EPIPE errors globally but log other errors
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE') {
    // Silently ignore EPIPE errors (broken pipe)
    return;
  }
  // Log other uncaught exceptions
  console.error('Uncaught error:', err);
  writeDebugLog(`[ERROR] Uncaught exception: ${err.message}`);
});

process.on('unhandledRejection', (err) => {
  if (err && err.code === 'EPIPE') {
    // Silently ignore EPIPE errors
    return;
  }
  // Log other unhandled rejections
  console.error('Unhandled rejection:', err);
  writeDebugLog(`[ERROR] Unhandled rejection: ${err?.message || err}`);
});

