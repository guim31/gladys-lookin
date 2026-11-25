// -----------------------------------------------------------------------------
// Scene actions: a success is returned (green in Gladys), every failure is
// thrown with its message in the four languages (red).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UUIDS, createAll, createWorld, lookinId, remoteId } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  await createAll(w);
  return w;
}

test('send_command presses a button of a remote', async (t) => {
  const w = await world(t);
  const [lookin] = w.network.lookins;
  const ack = await w.fake.sceneAction('send_command', {
    device: remoteId(w.gladys, UUIDS.LIGHT),
    command: 'poweron',
  });
  assert.equal(ack.success, true);
  assert.deepEqual(lookin.sent, [{ uuid: UUIDS.LIGHT, command: 'poweron' }]);
  assert.equal(w.fake.lastState(`${remoteId(w.gladys, UUIDS.LIGHT)}:power`), 1);
});

test('send_command failures: no device, unknown, the LOOKin itself, missing button, air conditioner, offline', async (t) => {
  const w = await world(t);
  const cases = [
    [{ command: 'power' }, /Choisissez un appareil LOOKin/],
    [{ device: remoteId(w.gladys, 'FFFF'), command: 'power' }, /inconnu/],
    [{ device: lookinId(w.gladys), command: 'power' }, /pas la LOOKin elle-même/],
    [{ device: remoteId(w.gladys, UUIDS.FAN), command: 'volup' }, /n'a pas ce bouton/],
    [{ device: remoteId(w.gladys, UUIDS.CLIMATE), command: 'power' }, /climatiseur/],
  ];
  for (const [fields, message] of cases) {
    const ack = await w.fake.sceneAction('send_command', fields);
    assert.equal(ack.success, false, JSON.stringify(fields));
    assert.match(ack.error.fr, message);
    assert.ok(ack.error.en && ack.error.de && ack.error.es);
  }
  w.network.lookins[0].online = false;
  const offline = await w.fake.sceneAction('send_command', {
    device: remoteId(w.gladys, UUIDS.TV),
    command: 'mute',
  });
  assert.equal(offline.success, false);
  assert.match(offline.error.fr, /ne répond pas/);
});

test('send_ir_code sends a raw or Pronto HEX code through the LOOKin of any of its devices', async (t) => {
  const w = await world(t);
  const [lookin] = w.network.lookins;
  const raw = await w.fake.sceneAction('send_ir_code', {
    device: lookinId(w.gladys),
    format: 'raw',
    code: '9000 -4500 560 -560 560 -1690',
  });
  assert.equal(raw.success, true);
  const pronto = await w.fake.sceneAction('send_ir_code', {
    device: remoteId(w.gladys, UUIDS.TV),
    format: 'prontohex',
    code: '0000 006d 0022 0002',
  });
  assert.equal(pronto.success, true);
  assert.deepEqual(lookin.sent, [
    { format: 'raw', code: '9000 -4500 560 -560 560 -1690' },
    { format: 'prontohex', code: '0000 006D 0022 0002' },
  ]);

  const bad = await w.fake.sceneAction('send_ir_code', {
    device: lookinId(w.gladys),
    format: 'raw',
    code: 'hello',
  });
  assert.equal(bad.success, false);
  assert.match(bad.error.fr, /code IR n'est pas valide/);
});
