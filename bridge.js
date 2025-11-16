// bridge.js
import fetch from 'node-fetch';

const PRO_HOST = '127.0.0.1';
const PRO_PORT = 1025; // set to your ProPresenter API port
const KEFAS_BASE_URL = 'https://web.kefas.app';
const KEFAS_MEETING_ID = 'live';
const POLL_INTERVAL = 5000;

let lastSentLyric = null;
let timer = null;
let kefasToken = null;

async function getProPresenterSlideStatus() {
  const url = `http://${PRO_HOST}:${PRO_PORT}/v1/status/slide`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ProPresenter API error ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

function extractCurrentLyric(statusJson) {
  if (!statusJson) return null;

  const candidates = [
    statusJson?.data?.current?.text,
    statusJson?.data?.slide?.current?.text,
    statusJson?.current?.text,
  ];

  let text = candidates.find((v) => !!v);
  if (!text) return null;

  if (Array.isArray(text)) {
    text = text.join('\n').trim();
  } else if (typeof text === 'string') {
    text = text.trim();
  } else {
    text = String(text).trim();
  }

  return text || null;
}

async function sendToKefas(content) {
  if (!kefasToken) {
    throw new Error('Kefas token not configured. Please set your token in settings.');
  }

  const url = `${KEFAS_BASE_URL}/api/public/meetings/${KEFAS_MEETING_ID}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${kefasToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const error = await res.text().catch(() => '');
    throw new Error(`Kefas API error ${res.status}: ${error || res.statusText}`);
  }

  const json = await res.json();
  return json;
}

async function tick(onStatus) {
  try {
    const status = await getProPresenterSlideStatus();
    const lyric = extractCurrentLyric(status);

    if (!lyric) {
      onStatus?.('No lyric found in ProPresenter status.');
      return;
    }

    if (lyric === lastSentLyric) {
      onStatus?.('Lyric unchanged, not sending.');
      return;
    }

    onStatus?.(`New lyric: ${JSON.stringify(lyric)} – sending to Kefas…`);
    await sendToKefas(lyric);
    lastSentLyric = lyric;
    onStatus?.('Sent to Kefas successfully.');
  } catch (err) {
    onStatus?.(`Error: ${err.message}`);
  }
}

export function startBridge(token, onStatus) {
  if (timer) return;
  if (!token) {
    onStatus?.('Error: Kefas token is required.');
    return;
  }
  kefasToken = token;
  onStatus?.('Starting bridge…');
  tick(onStatus);
  timer = setInterval(() => tick(onStatus), POLL_INTERVAL);
}

export function stopBridge(onStatus) {
  if (timer) {
    clearInterval(timer);
    timer = null;
    onStatus?.('Bridge stopped.');
  }
}
