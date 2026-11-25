// -----------------------------------------------------------------------------
// Configuration normalization: addresses, refresh interval, language.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseHosts } from '../src/config.js';

test('addresses: IPv4 only, deduplicated, leading zeros dropped, the rest reported', () => {
  assert.deepEqual(parseHosts('192.0.2.20, 192.0.2.020;192.0.2.21\nlookin.local 300.1.1.1'), {
    hosts: ['192.0.2.20', '192.0.2.21'],
    invalid: ['lookin.local', '300.1.1.1'],
  });
  assert.deepEqual(parseHosts(undefined), { hosts: [], invalid: [] });
});

test('defaults, and values outside the lists fall back to them', () => {
  assert.deepEqual(normalizeConfig(), {
    hosts: [],
    invalidHosts: [],
    pollSeconds: Number(DEFAULT_CONFIG.poll_interval),
    language: 'fr',
  });
  const config = normalizeConfig({ hosts: '192.0.2.5', poll_interval: '7', language: 'it' });
  assert.equal(config.pollSeconds, 30);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ poll_interval: '120', language: 'de' }).pollSeconds, 120);
  assert.equal(normalizeConfig(null).language, 'fr');
});
