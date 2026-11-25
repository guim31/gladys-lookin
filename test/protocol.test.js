// -----------------------------------------------------------------------------
// The LOOKin local protocol: answers of the API (fixtures from aiolookin), the
// air conditioner state of four digits, button paths, IR codes, UDP messages.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  climatePath,
  commandPath,
  decodeClimate,
  encodeClimate,
  irPath,
  normalizeIrCode,
  parseDevice,
  parseMeteo,
  parseRemote,
  parseRemoteList,
  parseUdpMessage,
  powerOf,
} from '../src/lookin/protocol.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/lookin/${name}.json`, import.meta.url), 'utf8'));

test('/device: id, name, model (Remote2 = 2) and firmware', () => {
  assert.deepEqual(parseDevice(fixture('device')), {
    id: '98F3A1B2',
    name: 'living_room',
    model: 2,
    firmware: '2.38',
  });
  assert.equal(parseDevice({ ID: 'not hex!' }), null);
  assert.equal(parseDevice(null), null);
  assert.equal(parseDevice({ ID: '98f3a1b2', Name: ' ' }).name, null);
});

test('/sensors/meteo: temperature and humidity, null when absurd or missing', () => {
  assert.deepEqual(parseMeteo(fixture('meteo')), { temperature: 24.6, humidity: 38.6 });
  assert.deepEqual(parseMeteo({ Temperature: '', Humidity: '120' }), {
    temperature: null,
    humidity: null,
  });
});

test('/data: known types only, upper-case UUIDs, no duplicate', () => {
  const list = parseRemoteList([
    ...fixture('data'),
    { Type: '99', UUID: 'AAAA', Updated: '1' },
    { Type: '01', UUID: '49c2', Updated: '2' },
    { Type: '06', UUID: 'zz', Updated: '3' },
  ]);
  assert.deepEqual(
    list.map((remote) => `${remote.uuid}:${remote.type}`),
    ['49C2:tv', '703A:light', '1234:fan', '460E:climate'],
  );
});

test('/data/{UUID}: name, statuses and the known buttons only', () => {
  const tv = parseRemote(fixture('remote-49C2'));
  assert.equal(tv.type, 'tv');
  assert.equal(tv.status, '1000');
  assert.deepEqual(tv.functions, [
    'power',
    'mode',
    'mute',
    'volup',
    'voldown',
    'chup',
    'chdown',
    'menu',
  ]);
  const odd = parseRemote({
    Type: '07',
    Name: 'x',
    Functions: [{ Name: 'Turbo' }, { Name: 'SPEED' }],
  });
  assert.deepEqual(odd.functions, ['speed']);
  assert.equal(odd.status, null);
  assert.equal(parseRemote({ Type: 'ZZ' }), null);
});

test('power of a remote status: first digit', () => {
  assert.equal(powerOf('1000'), true);
  assert.equal(powerOf('0F00'), false);
  assert.equal(powerOf(null), null);
  assert.equal(powerOf('2000'), null);
});

test('air conditioner: decode the state, the last settings when off', () => {
  // Heat, 23 °C, fan auto, swing (the aiolookin fixture).
  assert.deepEqual(decodeClimate('3701', '1100'), {
    mode: 3,
    temperature: 23,
    fan: 0,
    swing: 1,
    lastMode: 3,
  });
  // Off with no settings: those of LastStatus (auto, 17 °C, low).
  assert.deepEqual(decodeClimate('0000', '1110'), {
    mode: 0,
    temperature: 17,
    fan: 1,
    swing: 0,
    lastMode: 1,
  });
  // Off with settings kept.
  assert.deepEqual(decodeClimate('0A20', '2A20'), {
    mode: 0,
    temperature: 26,
    fan: 2,
    swing: 0,
    lastMode: 2,
  });
  // Nothing known: auto, 24 °C.
  assert.deepEqual(decodeClimate(null, null), {
    mode: 0,
    temperature: 24,
    fan: 0,
    swing: 0,
    lastMode: 1,
  });
  // Out of range digits are clamped.
  assert.equal(decodeClimate('2F91', null).temperature, 30);
  assert.equal(decodeClimate('2F91', null).fan, 3);
});

test('air conditioner: encode, clamped, round trip', () => {
  assert.equal(encodeClimate({ mode: 2, temperature: 22, fan: 3, swing: 1 }), '2631');
  assert.equal(encodeClimate({ mode: 0, temperature: 40, fan: 9, swing: 0 }), '0E30');
  assert.equal(encodeClimate({ mode: 5, temperature: 10.4, fan: 0, swing: 0 }), '5000');
  for (const status of ['1000', '2631', '3E21', '5A10']) {
    assert.equal(encodeClimate(decodeClimate(status, null)), status);
  }
});

test('paths: button press, air conditioner state, IR codes', () => {
  assert.equal(commandPath('49C2', 'volup'), '/commands/ir/localremote/49C206FF');
  assert.equal(commandPath('1234', 'swing'), '/commands/ir/localremote/12340AFF');
  assert.equal(climatePath('460E', '2631'), '/commands/ir/localremote/460E2631');
  assert.equal(irPath('raw', '9000 -4500 560 -560'), '/commands/ir/raw/9000%20-4500%20560%20-560');
});

test('IR codes: raw durations and Pronto HEX, normalized; anything else refused', () => {
  assert.equal(normalizeIrCode('raw', ' 9000, -4500  560 -560 '), '9000 -4500 560 -560');
  assert.equal(normalizeIrCode('prontohex', '0000 006d 0022 0002'), '0000 006D 0022 0002');
  assert.equal(normalizeIrCode('raw', '9000 -4500 abc 1'), null);
  assert.equal(normalizeIrCode('raw', '1 2 3'), null);
  assert.equal(normalizeIrCode('prontohex', '0000 006D 22 0002'), null);
  assert.equal(normalizeIrCode('nec', '0000 006D 0022 0002'), null);
  assert.equal(normalizeIrCode('raw', `${'560 -560 '.repeat(200)}`), null);
  assert.equal(normalizeIrCode('raw', undefined), null);
});

test('UDP: Alive and Updated messages, by their id', () => {
  assert.deepEqual(parseUdpMessage('LOOK.in:Alive!98F3A1B2:1:2.38:0:192.0.2.20'), {
    command: 'alive',
    id: '98F3A1B2',
  });
  assert.deepEqual(parseUdpMessage('LOOKin:Updated!98f3a1b2:FE:00:00E201A8'), {
    command: 'updated',
    id: '98F3A1B2',
  });
  assert.equal(parseUdpMessage('LOOK.in:Discover!'), null);
  assert.equal(parseUdpMessage('HTTP/1.1 200 OK'), null);
  assert.equal(parseUdpMessage(undefined), null);
});
