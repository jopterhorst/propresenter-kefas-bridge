// discovery.js - Auto-discover ProPresenter instances on the network
//
// Two discovery strategies:
// 1. mDNS/Bonjour: Browse for ProPresenter services advertised on the local network
// 2. HTTP probe: Hit the /v1/version endpoint on localhost across common ports

const http = require('http');

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
const MDNS_BROWSE_TIMEOUT_MS = 4000;
const OVERALL_TIMEOUT_MS = 6000;

/**
 * Probes a single host:port for a ProPresenter /v1/version endpoint
 * @param {string} host - Hostname or IP to probe
 * @param {number} port - Port number to probe
 * @returns {Promise<Object|null>} Discovered instance or null
 */
function probePort(host, port) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://${host}:${port}/v1/version`,
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
    const bonjour = new Bonjour();
    const browsers = [];

    const cleanup = () => {
      browsers.forEach((b) => {
        try { b.stop(); } catch (_) { /* ignore */ }
      });
      try { bonjour.destroy(); } catch (_) { /* ignore */ }
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(discovered);
    }, MDNS_BROWSE_TIMEOUT_MS);

    for (const svcType of MDNS_SERVICE_TYPES) {
      try {
        const browser = bonjour.find(svcType, (service) => {
          // Deduplicate by host+port
          const host = service.host || service.referer?.address;
          const port = service.port;

          if (!host || !port) return;

          const alreadyFound = discovered.some(
            (d) => d.host === host && d.port === port
          );
          if (alreadyFound) return;

          discovered.push({
            host,
            port,
            name: service.name || host,
            version: null,
            source: 'mdns',
          });
        });
        browsers.push(browser);
      } catch (_) {
        // Individual browser failure, continue with others
      }
    }

    // If no mDNS services found after timeout, resolve with empty
    // The timeout above handles this
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
