// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Seconds between two reads of every LOOKin (`poll_interval` options).
export const POLL_INTERVALS = [15, 30, 60, 120, 300];

export const DEFAULT_CONFIG = {
  hosts: '',
  poll_interval: '30',
  language: 'fr',
};

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const MAX_HOSTS = 32;

/**
 * Parse the manual address list (commas, semicolons, spaces or new lines):
 * IPv4 addresses only, the LOOKin has no other name on the network.
 * @param {unknown} raw
 * @returns {{ hosts: string[], invalid: string[] }}
 */
export function parseHosts(raw) {
  const hosts = [];
  const invalid = [];
  const entries = typeof raw === 'string' ? raw.split(/[\s,;]+/) : [];
  for (const entry of entries) {
    const host = entry.trim();
    if (!host) {
      continue;
    }
    const match = host.match(IPV4);
    if (!match || !match.slice(1).every((part) => Number(part) <= 255)) {
      invalid.push(host);
    } else {
      // Leading zeros would make another string for the same address.
      const normalized = match.slice(1).map(Number).join('.');
      if (!hosts.includes(normalized) && hosts.length < MAX_HOSTS) {
        hosts.push(normalized);
      }
    }
  }
  return { hosts, invalid };
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const { hosts, invalid } = parseHosts(
    typeof source.hosts === 'string' ? source.hosts : DEFAULT_CONFIG.hosts,
  );
  const interval = Number(source.poll_interval ?? DEFAULT_CONFIG.poll_interval);
  return {
    hosts,
    invalidHosts: invalid,
    pollSeconds: POLL_INTERVALS.includes(interval)
      ? interval
      : Number(DEFAULT_CONFIG.poll_interval),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
