// bridge.js
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

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
let proPresenterPassword = '';
let debugMode = false;
let isRunning = false;
let onStatusCallback = null;
let onConnectionStatusCallback = null;
let useNotes = false;
let notesTrigger = DEFAULT_NOTES_TRIGGER;
let ws = null;
let wsConnected = false;
let wsFailureCount = 0;
let wsReconnectTimeout = null;
let MAX_RECONNECT_ATTEMPTS = 3;
let RECONNECT_DELAY_MS = 5000; // 5 seconds between reconnect attempts

function updateStatus(message) {
  if (debugMode) console.debug(`[DEBUG] Status: ${message}`);
  onStatusCallback?.(message);
}

function updateConnectionStatus(status, details = '') {
  if (debugMode) console.debug(`[DEBUG] Connection Status: ${status} - ${details}`);
  onConnectionStatusCallback?.({ status, details, wsConnected });
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

async function getProPresenterSlideStatus() {
  const url = `http://${PRO_API_HOST}:${PRO_API_PORT}/v1/status/slide`;
  
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
      writeDebugLog(`[CHECK] Lyric unchanged, not sending`);
      return;
    }

    if (debugMode) {
      console.debug(`[DEBUG] New lyric detected!`);
      console.debug(`[DEBUG] Previous lyric: ${lastSentLyric?.substring(0, 100) || 'none'}...`);
      console.debug(`[DEBUG] New lyric: ${lyric.substring(0, 100)}...`);
    }

    writeDebugLog(`[CHECK] New lyric detected - length: ${lyric.length} chars`);
    writeDebugLog(`[CHECK] Content: "${lyric.substring(0, 200)}${lyric.length > 200 ? '...' : ''}"`);
    updateStatus(`Sending: ${JSON.stringify(lyric.substring(0, 50))}${lyric.length > 50 ? '...' : ''}`);
    await sendToKefas(lyric);
    lastSentLyric = lyric;
    writeDebugLog(`[CHECK] Successfully sent to Kefas`);
    updateStatus('Sent to Kefas successfully.');
  } catch (err) {
    updateStatus(`Error: ${err.message}`);
    writeDebugLog(`[CHECK] Error: ${err.message}`);
    if (debugMode) console.error(`[DEBUG] Error in tick:`, err);
  }
}



function connectWebSocket(host, port, password = '') {
  // ProPresenter 7 uses /remote endpoint with required authentication
  const wsUrl = `ws://${host}:${port}/remote`;
  
  writeDebugLog(`[WS] Attempting WebSocket connection to ${wsUrl}`);
  if (debugMode) console.debug(`[DEBUG] Connecting to WebSocket: ${wsUrl}`);
  
  try {
    ws = new WebSocket(wsUrl);
    
    // Set timeout for connection
    const timeout = setTimeout(() => {
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        writeDebugLog(`[WS] WebSocket connection timeout`);
        if (ws) ws.close();
        ws = null;
        wsConnected = false;
        handleWebSocketFailure('Connection timeout - check ProPresenter settings');
      }
    }, 5000);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      writeDebugLog(`[WS] WebSocket connected successfully to ${wsUrl}`);
      if (debugMode) console.debug(`[DEBUG] WebSocket connected`);
      updateConnectionStatus('connecting', 'Authenticating with ProPresenter...');
      
      // Authenticate immediately after connection
      const authMessage = {
        action: 'authenticate',
        protocol: 701,  // ProPresenter 7.4.2+ uses protocol 701
        password: password
      };
      ws.send(JSON.stringify(authMessage));
      writeDebugLog(`[WS] Sent authentication message (protocol 701) with password: ${password}`);
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        writeDebugLog(`[WS] Received message: ${JSON.stringify(message)}`);
        if (debugMode) {
          console.debug(`[DEBUG] Full WebSocket message:`, message);
        }
        
        // Handle authentication response
        if (message.action === 'authenticate') {
          writeDebugLog(`[WS] Auth response - authenticated: ${message.authenticated}, error: ${message.error || 'none'}`);
          
          if (message.authenticated === true || message.authenticated === 1) {
            writeDebugLog(`[WS] Successfully authenticated with ProPresenter`);
            if (debugMode) console.debug(`[DEBUG] WebSocket authenticated`);
            wsConnected = true;
            updateConnectionStatus('connected', `Connected to ${PRO_API_HOST}:${PRO_API_PORT}`);
            updateStatus('WebSocket connected and authenticated - listening for slide changes...');
          } else {
            const errorMsg = message.error || message.message || 'Unknown error';
            writeDebugLog(`[WS] Authentication failed: ${errorMsg}`);
            if (debugMode) console.debug(`[DEBUG] Auth failed:`, message);
            wsConnected = false;
            updateConnectionStatus('error', `Auth failed: ${errorMsg}`);
            updateStatus(`WebSocket authentication failed: ${errorMsg}`);
          }
          return;
        }
        
        // Listen for all presentation trigger events (these indicate slide changes)
        // Based on ProPresenter 7 API documentation
        if (message.action === 'presentationTriggerIndex' ||      // Slide triggered by index
            message.action === 'presentationTriggerNext' ||        // Next slide triggered
            message.action === 'presentationTriggerPrevious' ||    // Previous slide triggered
            message.action === 'presentationSlideIndex' ||         // Current slide index update
            message.action === 'presentationCurrent') {            // Current presentation changed
          
          writeDebugLog(`[WS] Slide change detected via ${message.action}`);
          if (debugMode) {
            console.debug(`[DEBUG] WebSocket slide change event:`, message);
          }
          
          // Trigger immediate API call to get the new slide content
          tick();
        }
      } catch (err) {
        writeDebugLog(`[WS] Message parse error: ${err.message}`);
        if (debugMode) console.debug(`[DEBUG] WebSocket message parse error:`, err);
      }
    });
    
    ws.on('error', (err) => {
      clearTimeout(timeout);
      writeDebugLog(`[WS] WebSocket error: ${err.message}`);
      if (debugMode) console.error(`[DEBUG] WebSocket error:`, err);
      if (ws) ws.close();
      ws = null;
      wsConnected = false;
      handleWebSocketFailure(err.message);
    });
    
    ws.on('close', () => {
      clearTimeout(timeout);
      writeDebugLog(`[WS] WebSocket disconnected`);
      if (debugMode) console.debug(`[DEBUG] WebSocket disconnected`);
      ws = null;
      wsConnected = false;
      
      if (isRunning) {
        // Connection closed unexpectedly while bridge is running
        handleWebSocketFailure('Connection closed unexpectedly');
      } else {
        // Bridge was explicitly stopped
        updateConnectionStatus('disconnected', 'Bridge stopped');
      }
    });
  } catch (err) {
    writeDebugLog(`[WS] Failed to create WebSocket: ${err.message}`);
    if (debugMode) console.error(`[DEBUG] WebSocket creation error:`, err);
    wsConnected = false;
    handleWebSocketFailure(err.message);
  }
}

function disconnectWebSocket() {
  if (ws) {
    writeDebugLog(`[WS] Closing WebSocket connection`);
    ws.close();
    ws = null;
    wsConnected = false;
    updateConnectionStatus('disconnected', 'Bridge stopped');
  }
}

function clearReconnectTimeout() {
  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout);
    wsReconnectTimeout = null;
  }
}

function handleWebSocketFailure(errorMsg) {
  wsFailureCount++;
  const failureMsg = `WebSocket connection failed (${wsFailureCount}/${MAX_RECONNECT_ATTEMPTS}): ${errorMsg}`;
  writeDebugLog(`[WS] ${failureMsg}`);
  if (debugMode) console.debug(`[DEBUG] ${failureMsg}`);
  
  if (wsFailureCount >= MAX_RECONNECT_ATTEMPTS) {
    writeDebugLog(`[WS] Max reconnection attempts reached. Stopping bridge.`);
    if (debugMode) console.debug(`[DEBUG] Max reconnection attempts reached`);
    updateStatus(`Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts. Bridge stopped.`);
    updateConnectionStatus('error', `Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
    
    // Automatically stop the bridge
    stopBridge(() => {});
  } else if (!wsReconnectTimeout) {
    // Only schedule a reconnect if one isn't already scheduled
    updateStatus(`Connection failed. Retrying in ${RECONNECT_DELAY_MS / 1000}s (attempt ${wsFailureCount}/${MAX_RECONNECT_ATTEMPTS})...`);
    updateConnectionStatus('error', `Connection failed, will retry (${wsFailureCount}/${MAX_RECONNECT_ATTEMPTS})`);
    
    // Schedule reconnection attempt
    wsReconnectTimeout = setTimeout(() => {
      wsReconnectTimeout = null; // Clear the timeout reference
      if (isRunning) {
        writeDebugLog(`[WS] Attempting reconnection (attempt ${wsFailureCount + 1}/${MAX_RECONNECT_ATTEMPTS})`);
        connectWebSocket(PRO_API_HOST, PRO_API_PORT, proPresenterPassword);
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
  proPresenterPassword = password || '';
  wsFailureCount = 0; // Reset failure counter on start
  clearReconnectTimeout(); // Clear any pending reconnect attempts
  
  // Set reconnection parameters from settings
  MAX_RECONNECT_ATTEMPTS = maxReconnectParam || 3;
  RECONNECT_DELAY_MS = reconnectDelayParam || 5000;
  
  if (debugMode) console.debug(`[DEBUG] Debug mode enabled`);
  console.log(`Bridge starting with WebSocket trigger to ProPresenter API on port ${PRO_API_PORT}`);
  writeDebugLog(`Bridge starting - WebSocket will trigger API calls on slide changes`);
  
  onStatus?.(`Starting bridge - connecting to ProPresenter WebSocket...`);
  updateConnectionStatus('connecting', 'Connecting to ProPresenter...');
  
  // Connect WebSocket - wait for slide change events to trigger API calls
  connectWebSocket(PRO_API_HOST, PRO_API_PORT, password);
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
  wsFailureCount = 0;
  proPresenterPassword = '';
  clearReconnectTimeout();
  
  // Disconnect WebSocket
  disconnectWebSocket();

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

