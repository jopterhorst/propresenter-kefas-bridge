// discovery.js - Auto-discover ProPresenter instances on the network
//
// Two discovery strategies:
// 1. mDNS/Bonjour: Browse for ProPresenter services advertised on the local network
// 2. HTTP probe: Hit the version endpoint on localhost across common ports
//    (tries /version for ProPresenter 19+ and /v1/version for older versions)

const http = require('http');
const os = require('os');

// Common ProPresenter API ports to probe
const PROBE_PORTS = [
  1025, 1026, 1027, 1028, 1029, 1030,
  50001, 50002, 50003, 50004, 50005,
  51000, 51001, 51002, 51003,
  55056, 55057, 55058, 55059, 55060,
  59999, 60000, 60001,
];

// ProPresenter Bonjour service types to browse
const MDNS_SERVICE_TYPES = [
  { type: 'pro7', protocol: 'tcp' },
  { type: 'propresenter7', protocol: 'tcp' },
  { type: 'propresenter', protocol: 'tcp' },
];

const HTTP_PROBE_TIMEOUT_MS = 1500;
const MDNS_BROWSE_TIMEOUT_MS = 6000;
const OVERALL_TIMEOUT_MS = 8000;

// Version endpoint paths to try (ProPresenter 19+ uses /version, older uses /v1/version)
const VERSION_PATHS = ['/version', '/v1/version'];

function isIPv4Address(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function getLocalIPv4Interfaces() {
  const interfaces = os.networkInterfaces();
  const addresses = new Set();

  for (const iface of Object.values(interfaces)) {
    if (!Array.isArray(iface)) continue;
    for (const entry of iface) {
      const isIPv4 = entry?.family === 'IPv4' || entry?.family === 4;
      const address = entry?.address;
      if (!isIPv4 || !address) continue;
      if (entry.internal) continue;
      if (address.startsWith('127.')) continue;
      if (address.startsWith('169.254.')) continue;
      addresses.add(address);
    }
  }

  return Array.from(addresses);
}

function getPreferredServiceHost(service) {
  if (Array.isArray(service?.addresses)) {
    const address = service.addresses.find((addr) => isIPv4Address(addr));
    if (address) return address;
  }

  const refererAddress = service?.referer?.address;
  if (isIPv4Address(refererAddress)) return refererAddress;

  return service?.host || null;
}

/**
 * Probes a single host:port/path for a ProPresenter version endpoint
 * @param {string} host - Hostname or IP to probe
 * @param {number} port - Port number to probe
 * @param {string} versionPath - The path to probe (e.g. '/version' or '/v1/version')
 * @returns {Promise<Object|null>} Discovered instance or null
 */
function probePath(host, port, versionPath) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://${host}:${port}${versionPath}`,
      { timeout: HTTP_PROBE_TIMEOUT_MS },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            // Validate it looks like a ProPresenter response
            const name = json?.name || json?.data?.name;
            const hostDescription = json?.host_description || json?.data?.host_description;
            if (hostDescription && hostDescription.toLowerCase().includes('propresenter')) {
              resolve({
                host,
                port,
                name: name || host,
                version: hostDescription,
                source: 'http',
              });
              return;
            }
          } catch (_) {
            // Not valid JSON or not ProPresenter
          }
          resolve(null);
        });
      }
    );

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Probes a single host:port for a ProPresenter version endpoint,
 * trying multiple paths (/version and /v1/version)
 * @param {string} host - Hostname or IP to probe
 * @param {number} port - Port number to probe
 * @returns {Promise<Object|null>} Discovered instance or null
 */
async function probePort(host, port) {
  for (const versionPath of VERSION_PATHS) {
    const result = await probePath(host, port, versionPath);
    if (result) return result;
  }
  return null;
}

/**
 * Discovers ProPresenter instances by probing common ports on localhost
 * @returns {Promise<Array>} Array of discovered instances
 */
async function discoverViaHTTP() {
  const hosts = ['127.0.0.1'];
  const probes = [];

  for (const host of hosts) {
    for (const port of PROBE_PORTS) {
      probes.push(probePort(host, port));
    }
  }

  const results = await Promise.all(probes);
  return results.filter(Boolean);
}

/**
 * Discovers ProPresenter instances via mDNS/Bonjour service browsing
 * @returns {Promise<Array>} Array of discovered instances
 */
async function discoverViaMDNS() {
  let Bonjour;
  try {
    Bonjour = require('bonjour-service').Bonjour;
  } catch (_) {
    // bonjour-service not available, skip mDNS discovery
    return [];
  }

  return new Promise((resolve) => {
    const discovered = [];
    const discoveredKeys = new Set();
    const sessions = [];
    const interfaceAddresses = getLocalIPv4Interfaces();
    const browseInterfaces = interfaceAddresses.length > 0 ? interfaceAddresses : [null];

    for (const ifaceAddress of browseInterfaces) {
      try {
        const bonjour = ifaceAddress ? new Bonjour({ interface: ifaceAddress }) : new Bonjour();
        sessions.push({ bonjour, browsers: [] });
      } catch (_) {
        // Individual interface init failure, continue with others
      }
    }

    if (sessions.length === 0) {
      return resolve([]);
    }

    const cleanup = () => {
      sessions.forEach(({ bonjour, browsers }) => {
        browsers.forEach((browser) => {
          try { browser.stop(); } catch (_) { /* ignore */ }
        });
        try { bonjour.destroy(); } catch (_) { /* ignore */ }
      });
    };

    setTimeout(() => {
      cleanup();
      resolve(discovered);
    }, MDNS_BROWSE_TIMEOUT_MS);

    for (const session of sessions) {
      for (const svcType of MDNS_SERVICE_TYPES) {
        try {
          const browser = session.bonjour.find(svcType, (service) => {
            const host = getPreferredServiceHost(service);
            const port = service.port;

            if (!host || !port) return;

            const key = `${host}:${port}`;
            if (discoveredKeys.has(key)) return;

            discoveredKeys.add(key);
            discovered.push({
              host,
              port,
              name: service.name || host,
              version: null,
              source: 'mdns',
            });
          });
          session.browsers.push(browser);
        } catch (_) {
          // Individual browser failure, continue with others
        }
      }
    }
  });
}

/**
 * Runs all discovery strategies in parallel and returns combined results
 * @returns {Promise<Array>} Array of discovered ProPresenter instances
 *   Each instance has: { host, port, name, version, source }
 */
async function discoverProPresenter() {
  return new Promise(async (resolve) => {
    // Overall timeout safety net
    const overallTimeout = setTimeout(() => {
      resolve([]);
    }, OVERALL_TIMEOUT_MS);

    try {
      const [httpResults, mdnsResults] = await Promise.all([
        discoverViaHTTP(),
        discoverViaMDNS(),
      ]);

      clearTimeout(overallTimeout);

      // Combine and deduplicate (prefer HTTP results since they have version info)
      const combined = [...httpResults];

      for (const mdnsResult of mdnsResults) {
        const alreadyFound = combined.some(
          (r) => r.host === mdnsResult.host && r.port === mdnsResult.port
        );
        if (!alreadyFound) {
          combined.push(mdnsResult);
        }
      }

      resolve(combined);
    } catch (err) {
      clearTimeout(overallTimeout);
      console.error('Discovery error:', err);
      resolve([]);
    }
  });
}

module.exports = { discoverProPresenter, probePort };
