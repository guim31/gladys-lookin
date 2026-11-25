// -----------------------------------------------------------------------------
// The hub against fake LOOKins and the SDK's fake Gladys: discovery (mDNS, UDP,
// typed and known addresses), states, commands, the air conditioner, a LOOKin
// that stops answering and comes back, remotes edited in the LOOKin app.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GladysApiError } from '@gladysassistant/integration-sdk';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FakeLookin,
  LOOKIN_ID,
  UUIDS,
  createAll,
  createWorld,
  created,
  lookinId,
  remoteId,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function createdWorld(t, options) {
  const w = await world(t, options);
  await createAll(w);
  return w;
}

const state = (w, uuid, key) => w.fake.lastState(`${remoteId(w.gladys, uuid)}:${key}`);

/** Run a Gladys command on a feature, as the device box does. */
async function set(w, uuid, key, value) {
  const device = created(w, remoteId(w.gladys, uuid));
  const feature = device.features.find(
    (entry) => entry.external_id === `${device.external_id}:${key}`,
  );
  return w.fake.setValue(device, feature, value);
}

test('discovery: mDNS alone, UDP alone, or a typed address each find the LOOKin', async (t) => {
  for (const [scan, config] of [
    ['mdns', { language: 'en' }],
    ['udp', { language: 'en' }],
    ['none', { language: 'en', hosts: '192.0.2.20, 300.1.1.1' }],
  ]) {
    const w = await world(t, { scan, config });
    const ids = w.fake.discoveredDevices.map((device) => device.external_id);
    assert.equal(ids.length, 5, `${scan}: the LOOKin and its four remotes`);
    assert.ok(ids.includes(lookinId(w.gladys)));
    assert.deepEqual(w.fake.connectionStatus, { connected: true });
  }
});

test('discovery: the UDP request is "LOOK.in:Discover!" on port 61201, then mDNS is browsed', async (t) => {
  const w = await world(t);
  const udp = w.fake.scans.find((scan) => scan.type === 'udp-active-broadcast');
  assert.equal(udp.port, 61201);
  assert.equal(Buffer.from(udp.payload_base64, 'base64').toString(), 'LOOK.in:Discover!');
  assert.ok(w.fake.scans.some((scan) => scan.type === 'mdns'));
});

test('discovery: nothing found says so, and a core without mediated discovery is not fatal', async (t) => {
  const w = await world(t, { lookins: [], scan: 'none' });
  assert.deepEqual(w.fake.discoveredDevices, []);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /Aucune LOOKin Remote trouvée/);

  const ack = await w.fake.action('search', {});
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /Saisissez son adresse IP/);

  const old = await world(t, { scan: 'none', connect: false, config: { hosts: '192.0.2.20' } });
  t.mock.method(old.gladys, 'scanNetwork', async () => {
    throw new GladysApiError(404, 'NOT_FOUND', 'Not found');
  });
  await old.gladys.connect();
  await old.app.ready;
  assert.equal(old.hub.lastScan, 'unavailable');
  assert.equal(old.fake.discoveredDevices.length, 5, 'the typed address still works');
  const report = await old.fake.action('search', {});
  assert.equal(report.success, true);
  assert.match(report.data.message.fr, /1 LOOKin Remote, 4 télécommande\(s\)/);
  assert.match(report.data.message.fr, /indisponible/);
});

test('an older LOOKin without sensor: no LOOKin device, its remotes still are', async (t) => {
  const w = await world(t, { lookins: [new FakeLookin({ meteo: false })] });
  const ids = w.fake.discoveredDevices.map((device) => device.external_id);
  assert.equal(ids.length, 4);
  assert.ok(!ids.includes(lookinId(w.gladys)));
});

test('states: sensor and remote states once created, then only changes', async (t) => {
  const w = await createdWorld(t);
  assert.equal(w.fake.lastState(`${lookinId(w.gladys)}:temperature`), 24.6);
  assert.equal(w.fake.lastState(`${lookinId(w.gladys)}:humidity`), 38.6);
  assert.equal(state(w, UUIDS.TV, 'power'), 1);
  assert.equal(state(w, UUIDS.LIGHT, 'power'), 0);
  assert.equal(state(w, UUIDS.CLIMATE, 'mode'), 2, 'heating');
  assert.equal(state(w, UUIDS.CLIMATE, 'target-temperature'), 23);

  const count = w.fake.states.length;
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, count, 'nothing changed, nothing sent');

  // The TV switched off with its own remote, heard by the LOOKin.
  const [lookin] = w.network.lookins;
  lookin.setStatus(UUIDS.TV, '0000');
  lookin.meteo.Temperature = '25.1';
  await w.hub.pollAll();
  assert.equal(state(w, UUIDS.TV, 'power'), 0);
  assert.equal(w.fake.lastState(`${lookinId(w.gladys)}:temperature`), 25.1);
  assert.equal(w.fake.states.length, count + 2);
});

test('states are not published for devices the user did not add', async (t) => {
  const w = await world(t);
  assert.equal(w.fake.states.length, 0);
  await w.fake.deviceCreated(
    w.fake.discoveredDevices.find((d) => d.external_id === remoteId(w.gladys, UUIDS.TV)),
  );
  await w.hub.idle();
  assert.equal(state(w, UUIDS.TV, 'power'), 1, 'republished on creation');
  assert.equal(w.fake.lastState(`${lookinId(w.gladys)}:temperature`), undefined);
});

test('buttons: a push sends the button of the remote once', async (t) => {
  const w = await createdWorld(t);
  const [lookin] = w.network.lookins;
  const ack = await set(w, UUIDS.TV, 'button-volup', 1);
  assert.equal(ack.success, true);
  assert.deepEqual(lookin.sent, [{ uuid: UUIDS.TV, command: 'volup' }]);
  assert.ok(lookin.requests.includes('/commands/ir/localremote/49C206FF'));
  await set(w, UUIDS.FAN, 'button-swing', 1);
  assert.deepEqual(lookin.sent.at(-1), { uuid: UUIDS.FAN, command: 'swing' });
});

test('power: separate on/off buttons are used, a single toggle only when the state differs', async (t) => {
  const w = await createdWorld(t);
  const [lookin] = w.network.lookins;

  await set(w, UUIDS.LIGHT, 'power', 1);
  assert.deepEqual(lookin.sent.at(-1), { uuid: UUIDS.LIGHT, command: 'poweron' });
  assert.equal(state(w, UUIDS.LIGHT, 'power'), 1);
  await set(w, UUIDS.LIGHT, 'power', 0);
  assert.deepEqual(lookin.sent.at(-1), { uuid: UUIDS.LIGHT, command: 'poweroff' });

  // The TV has only a toggle and is on: "on" sends nothing, "off" toggles.
  const before = lookin.sent.length;
  assert.equal((await set(w, UUIDS.TV, 'power', 1)).success, true);
  assert.equal(lookin.sent.length, before);
  await set(w, UUIDS.TV, 'power', 0);
  assert.deepEqual(lookin.sent.at(-1), { uuid: UUIDS.TV, command: 'power' });
  assert.equal(state(w, UUIDS.TV, 'power'), 0);
  await w.hub.pollAll();
  assert.equal(state(w, UUIDS.TV, 'power'), 0, 'the LOOKin agrees');
});

test('air conditioner: settings, mode, off and on again in the last mode', async (t) => {
  const w = await createdWorld(t);
  const [lookin] = w.network.lookins;
  const sentStatus = () => lookin.sent.at(-1).status;

  await set(w, UUIDS.CLIMATE, 'target-temperature', 21);
  assert.equal(sentStatus(), '3501', 'heat, 21 °C, auto fan, swing');
  await set(w, UUIDS.CLIMATE, 'fan-speed', 5);
  assert.equal(sentStatus(), '3531', 'high');
  assert.equal(state(w, UUIDS.CLIMATE, 'fan-speed'), 5);
  await set(w, UUIDS.CLIMATE, 'swing', 0);
  assert.equal(sentStatus(), '3530');

  await set(w, UUIDS.CLIMATE, 'power', 0);
  assert.equal(sentStatus(), '0530', 'off keeps the settings');
  assert.equal(state(w, UUIDS.CLIMATE, 'power'), 0);
  assert.equal(state(w, UUIDS.CLIMATE, 'mode'), 2, 'the mode shown is the one it will restart in');
  await w.hub.pollAll();
  assert.equal(state(w, UUIDS.CLIMATE, 'power'), 0);

  await set(w, UUIDS.CLIMATE, 'target-temperature', 35.4);
  assert.equal(sentStatus(), '0E30', 'clamped to 30 °C, still off');
  assert.equal(state(w, UUIDS.CLIMATE, 'target-temperature'), 30);

  await set(w, UUIDS.CLIMATE, 'power', 1);
  assert.equal(sentStatus(), '3E30', 'back in heating');
  await set(w, UUIDS.CLIMATE, 'mode', 1);
  assert.equal(sentStatus(), '2E30', 'cooling');
  assert.equal(state(w, UUIDS.CLIMATE, 'mode'), 1);

  // Choosing a mode switches a stopped unit on.
  await set(w, UUIDS.CLIMATE, 'power', 0);
  await set(w, UUIDS.CLIMATE, 'mode', 3);
  assert.equal(sentStatus(), '4E30', 'drying, on');
  assert.equal(state(w, UUIDS.CLIMATE, 'power'), 1);

  const bad = await set(w, UUIDS.CLIMATE, 'mode', 9);
  assert.equal(bad.success, false);
});

test('a command during a poll is not undone by the older reading', async (t) => {
  const w = await createdWorld(t);
  // The poll reads the TV status before the command, answers after it.
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let held = false;
  t.mock.method(w.hub.client, 'remote', async (host, uuid) => {
    const value = await w.hub.client.constructor.prototype.remote.call(w.hub.client, host, uuid);
    if (uuid === UUIDS.TV && !held) {
      held = true;
      await gate;
    }
    return value;
  });
  const poll = w.hub.pollAll();
  await new Promise((resolve) => setTimeout(resolve, 10));
  w.hub.lookins.get(LOOKIN_ID).remotes.get(UUIDS.TV).commandSeq += 1;
  w.hub.lookins.get(LOOKIN_ID).remotes.get(UUIDS.TV).status = '0000';
  release();
  await poll;
  assert.equal(w.hub.lookins.get(LOOKIN_ID).remotes.get(UUIDS.TV).status, '0000');
});

test('a LOOKin that stops answering is unreachable after two polls, then comes back', async (t) => {
  const w = await createdWorld(t);
  const [lookin] = w.network.lookins;
  const transportOf = () =>
    w.fake.transports
      .filter((entry) => entry.device_external_id === remoteId(w.gladys, UUIDS.TV))
      .at(-1)?.transport;
  assert.equal(transportOf(), 'local');

  lookin.online = false;
  await w.hub.pollAll();
  assert.equal(transportOf(), 'local', 'one miss is not enough');
  await w.hub.pollAll();
  assert.equal(transportOf(), 'unreachable');
  assert.match(w.fake.connectionStatus.message.en, /No LOOKin Remote answers/);

  const failed = await set(w, UUIDS.TV, 'button-volup', 1);
  assert.equal(failed.success, false);

  lookin.online = true;
  await w.hub.pollAll();
  assert.equal(transportOf(), 'local');
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a remote added in the LOOKin app becomes a new device at the next poll', async (t) => {
  const w = await createdWorld(t);
  const [lookin] = w.network.lookins;
  lookin.addRemote('5A5A', {
    Type: '02',
    Name: 'Sound bar',
    Updated: '1700000000',
    Status: '0000',
    Functions: [{ Name: 'poweron' }, { Name: 'poweroff' }, { Name: 'volup' }, { Name: 'voldown' }],
  });
  await w.hub.pollAll();
  const bar = w.fake.discoveredDevices.find(
    (device) => device.external_id === remoteId(w.gladys, '5A5A'),
  );
  assert.equal(bar.name, 'Sound bar');
  assert.deepEqual(
    bar.features.map((feature) => feature.external_id.split(':').pop()),
    ['power', 'button-volup', 'button-voldown'],
  );
});

test('a LOOKin that changed address (DHCP) is followed, and kept across restarts', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'gladys-lookin-'));
  const lookin = new FakeLookin();
  const first = await world(t, { lookins: [lookin], dataDir });
  await first.app.stop();

  // Restart without any discovery: the saved address is tried.
  const second = await world(t, { lookins: [lookin], scan: 'none', dataDir });
  assert.equal(second.fake.discoveredDevices.length, 5);
  await second.app.stop();

  lookin.host = '192.0.2.77';
  const third = await world(t, { lookins: [lookin], dataDir });
  assert.equal(third.hub.lookins.get(LOOKIN_ID).host, '192.0.2.77');
  const params = third.fake.discoveredDevices[0].params;
  assert.deepEqual(
    params.find((param) => param.name === 'IP_ADDRESS'),
    {
      name: 'IP_ADDRESS',
      value: '192.0.2.77',
    },
  );
});

test('the hub reads the LOOKins by its own timer, without Gladys polling', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const w = await createdWorld(t, {
    timers: true,
    config: { language: 'en', poll_interval: '15' },
  });
  const [lookin] = w.network.lookins;
  lookin.setStatus(UUIDS.TV, '0000');
  t.mock.timers.tick(15_000);
  await w.hub.idle();
  assert.equal(state(w, UUIDS.TV, 'power'), 0);
  for (const device of w.fake.discoveredDevices) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('heartbeat: every value is published again, changed or not', async (t) => {
  const w = await createdWorld(t);
  const count = w.fake.states.length;
  await w.hub.heartbeat();
  assert.equal(w.fake.states.length, count * 2);
});

test('Gladys reconnecting gets the devices and states again', async (t) => {
  const w = await createdWorld(t);
  const count = w.fake.states.length;
  await w.gladys.disconnect();
  await w.gladys.connect();
  await w.hub.idle();
  assert.equal(w.fake.states.length, count * 2);
});

test('changing the language renames the devices of the Discovery list', async (t) => {
  const w = await world(t);
  await w.fake.configUpdated({ language: 'fr' });
  const fan = w.fake.discoveredDevices.find(
    (device) => device.external_id === remoteId(w.gladys, UUIDS.FAN),
  );
  assert.deepEqual(
    fan.features.map((feature) => feature.name),
    ['Marche/arrêt', 'Vitesse', 'Balayage'],
  );
});

test('Gladys refusing the first publication does not stop the readings', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const w = await world(t, { connect: false, timers: true });
  const publish = t.mock.method(w.gladys, 'publishDiscoveredDevices', async () => {
    throw new GladysApiError(429, 'TOO_MANY_REQUESTS', 'Too many');
  });
  await w.gladys.connect();
  await w.app.ready;
  assert.equal(w.hub.timers.length, 3, 'the timers run anyway');
  publish.mock.restore();
  t.mock.timers.tick(30_000);
  await w.hub.idle();
  assert.equal(w.network.lookins[0].requests.filter((path) => path === '/data').length, 2);
});

test('another LOOKin taking the address (DHCP) is never read nor driven as the first one', async (t) => {
  const first = new FakeLookin();
  const w = await createdWorld(t, { lookins: [first] });
  // The first LOOKin goes away; another one gets its address.
  first.online = false;
  const other = new FakeLookin({ id: '98F3C3D4', host: '192.0.2.20' });
  w.network.lookins.push(other);
  await w.hub.pollAll();
  const record = w.hub.lookins.get(LOOKIN_ID);
  assert.equal(record.reachable, false);
  assert.equal(record.host, null);
  const ack = await set(w, UUIDS.TV, 'button-volup', 1);
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /ne répond pas/);
  assert.deepEqual(other.sent, []);

  // The rediscovery finds the other one as a new LOOKin.
  w.network.lookins.splice(0, 1);
  await w.hub.rediscover();
  assert.ok(w.hub.lookins.has('98F3C3D4'));
  assert.ok(
    w.fake.discoveredDevices.some(
      (d) => d.external_id === remoteId(w.gladys, UUIDS.TV, '98F3C3D4'),
    ),
  );
});

test('a command sent is a success even when Gladys refuses the new state', async (t) => {
  const w = await createdWorld(t);
  t.mock.method(w.gladys, 'publishChangedStates', async () => {
    throw new GladysApiError(429, 'TOO_MANY_REQUESTS', 'Too many');
  });
  const ack = await w.fake.sceneAction('send_command', {
    device: remoteId(w.gladys, UUIDS.TV),
    command: 'power',
  });
  assert.equal(ack.success, true);
  assert.deepEqual(w.network.lookins[0].sent, [{ uuid: UUIDS.TV, command: 'power' }]);
});

test('after a restart with the LOOKin away, its remotes are known and say "not answering"', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'gladys-lookin-'));
  const lookin = new FakeLookin();
  const first = await world(t, { lookins: [lookin], dataDir });
  await first.app.stop();
  lookin.online = false;
  const created = first.fake.discoveredDevices;
  const second = await world(t, { lookins: [lookin], scan: 'none', dataDir, created });
  const ack = await second.fake.sceneAction('send_command', {
    device: remoteId(second.gladys, UUIDS.TV),
    command: 'mute',
  });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /ne répond pas/);
  const transports = second.fake.transports.filter(
    (entry) => entry.device_external_id === remoteId(second.gladys, UUIDS.TV),
  );
  assert.equal(transports.at(-1)?.transport, 'unreachable');
});

test('a single power-on button: switching off is refused, not sent as an absent toggle', async (t) => {
  const lookin = new FakeLookin();
  lookin.remotes.get(UUIDS.LIGHT).Functions = [{ Name: 'poweron', Type: 'single' }];
  const w = await createdWorld(t, { lookins: [lookin] });
  await set(w, UUIDS.LIGHT, 'power', 1);
  const ack = await set(w, UUIDS.LIGHT, 'power', 0);
  assert.equal(ack.success, false);
  assert.match(ack.error.en, /no such button/);
  assert.deepEqual(lookin.sent, [{ uuid: UUIDS.LIGHT, command: 'poweron' }]);
});

test('air conditioner features offer only the speeds and swing LOOKin knows', async (t) => {
  const w = await world(t);
  const ac = w.fake.discoveredDevices.find(
    (d) => d.external_id === remoteId(w.gladys, UUIDS.CLIMATE),
  );
  const option = (key) =>
    ac.features.find((f) => f.external_id.endsWith(`:${key}`)).supported_options;
  // Objects with a label, as the core's Joi schema requires (bare numbers: 400).
  assert.deepEqual(option('fan-speed'), [
    { value: 0, label: 'Auto', sort_order: 0 },
    { value: 1, label: 'Low', sort_order: 1 },
    { value: 3, label: 'Medium', sort_order: 2 },
    { value: 5, label: 'High', sort_order: 3 },
  ]);
  assert.deepEqual(
    option('swing').map((entry) => entry.value),
    [0, 1],
  );
});
