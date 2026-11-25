// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, fake LOOKins on a fake
// network, and a temporary /data, with the integration wired on top through
// registerHandlers. No timer runs unless asked: the tests read the LOOKins
// with `world.hub.pollAll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FakeLookin, LOOKIN_ID, UUIDS, createNetwork } from './fakeLookin.js';

// Keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

/**
 * @param {object} [options]
 * @param {FakeLookin[]} [options.lookins] the fake LOOKins of the network
 * @param {'all'|'mdns'|'udp'|'none'} [options.scan] what the core's discovery finds
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.created] devices already created in Gladys
 */
export async function createWorld({
  lookins = [new FakeLookin()],
  scan = 'all',
  config = { language: 'en' },
  created = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-lookin-')),
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork(lookins);
  const gladys = createFakeGladys({
    config,
    devices: created,
    scanResults: {
      mdns: ['all', 'mdns'].includes(scan) ? network.mdns() : [],
      'udp-active-broadcast': ['all', 'udp'].includes(scan) ? network.udp() : [],
    },
  });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    fetch: network.fetch,
    timers,
    timings,
    clientTimings: { timeoutMs: 200 },
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, app, hub: app.hub, dataDir };
}

export const lookinId = (gladys, id = LOOKIN_ID) => gladys.externalIds('lookin', id).device;
export const remoteId = (gladys, uuid, id = LOOKIN_ID) =>
  gladys.externalIds('remote', `${id}-${uuid}`).device;

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
  await world.hub.idle();
}

/** The created device (as Gladys sends it back) behind an external id. */
export const created = (world, externalId) =>
  world.fake.devices.find((device) => device.external_id === externalId);

export { FakeLookin, LOOKIN_ID, UUIDS };
