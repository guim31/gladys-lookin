// -----------------------------------------------------------------------------
// What the container writes at the default level (info): the life of the
// LOOKins and of Gladys, never one line per reading, and a repeated failure
// once.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GladysApiError } from '@gladysassistant/integration-sdk';
import { UUIDS, createAll, createWorld, remoteId } from './helpers/world.js';

/** Everything written on stdout and stderr while `fn` runs, at LOG_LEVEL=info. */
async function capture(t, fn) {
  const lines = [];
  const level = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  const write = (chunk) => {
    lines.push(...String(chunk).split('\n').filter(Boolean));
    return true;
  };
  const stdout = t.mock.method(process.stdout, 'write', write);
  const stderr = t.mock.method(process.stderr, 'write', write);
  try {
    await fn();
  } finally {
    stdout.mock.restore();
    stderr.mock.restore();
    process.env.LOG_LEVEL = level;
  }
  return lines;
}

async function createdWorld(t, options) {
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  await createAll(world);
  return world;
}

test('logs: normal readings, with changes, write nothing at the info level', async (t) => {
  const world = await createdWorld(t);
  const [lookin] = world.network.lookins;
  const lines = await capture(t, async () => {
    for (const status of ['0000', '1000', '1000']) {
      lookin.setStatus(UUIDS.TV, status);
      await world.hub.pollAll();
    }
    await world.hub.rediscover();
    await world.hub.heartbeat();
    await world.hub.idle();
  });
  assert.equal(world.fake.lastState(`${remoteId(world.gladys, UUIDS.TV)}:power`), 1);
  assert.deepEqual(lines, []);
});

test('logs: Gladys refusing the states is said once, and its return once', async (t) => {
  const world = await createdWorld(t);
  const [lookin] = world.network.lookins;
  const refusal = t.mock.method(world.gladys, 'publishChangedStates', async () => {
    throw new GladysApiError(503, 'SERVICE_UNAVAILABLE', 'Gladys is restarting');
  });
  const failing = await capture(t, async () => {
    for (const temperature of ['20.1', '20.2', '20.3']) {
      lookin.meteo.Temperature = temperature;
      await world.hub.pollAll();
    }
  });
  assert.equal(failing.length, 1, failing.join('\n'));
  assert.match(failing[0], /Gladys does not take the LOOKin updates: Gladys is restarting/);

  refusal.mock.restore();
  const back = await capture(t, async () => {
    await world.hub.pollAll();
    await world.hub.pollAll();
  });
  assert.equal(back.length, 1, back.join('\n'));
  assert.match(back[0], /Gladys takes the LOOKin updates again/);
});

test('logs: a LOOKin going away and back writes one line each, never its address twice per poll', async (t) => {
  const world = await createdWorld(t);
  const [lookin] = world.network.lookins;
  lookin.online = false;
  const away = await capture(t, async () => {
    for (let poll = 0; poll < 4; poll += 1) {
      await world.hub.pollAll();
    }
  });
  assert.equal(away.length, 1, away.join('\n'));
  assert.match(away[0], /LOOKin 98F3A1B2 no longer answers at 192\.0\.2\.20/);

  lookin.online = true;
  const back = await capture(t, () => world.hub.pollAll());
  assert.equal(back.length, 1, back.join('\n'));
  assert.match(back[0], /LOOKin 98F3A1B2 answers again/);
});

test('logs: a LOOKin refusing a read is said once, and its return once', async (t) => {
  const world = await createdWorld(t);
  const [lookin] = world.network.lookins;
  const handle = lookin.handle.bind(lookin);
  lookin.handle = (path) =>
    path === '/data' ? { status: 500, body: { success: 'false', Message: 'Busy' } } : handle(path);
  const failing = await capture(t, async () => {
    for (let poll = 0; poll < 3; poll += 1) {
      await world.hub.pollAll();
    }
  });
  assert.equal(failing.length, 1, failing.join('\n'));
  assert.match(failing[0], /Cannot read LOOKin 98F3A1B2/);
  lookin.handle = handle;
  const back = await capture(t, () => world.hub.pollAll());
  assert.equal(back.length, 1, back.join('\n'));
  assert.match(back[0], /reads again/);
});
