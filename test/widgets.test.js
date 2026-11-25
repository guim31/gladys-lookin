// -----------------------------------------------------------------------------
// The `remote` widget: its content passes the SDK validator, offers only the
// buttons the remote has, and its buttons drive the remote.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { UUIDS, createAll, createWorld, lookinId, remoteId } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  await createAll(w);
  return w;
}

async function content(w, settings, language = 'en') {
  const ack = await w.fake.widgetGet(WIDGET_KEY, { settings, language, units: 'metric' });
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  const { content: data } = ack.data;
  assert.deepEqual(validateWidgetContent(data), []);
  assert.ok(data.components.length <= 8);
  assert.ok(data.components.filter((c) => c.type === 'text').length <= 2);
  return data;
}

const labels = (data) => data.components.filter((c) => c.type === 'button').map((c) => c.label);

test('a TV: its state, the room temperature and the default buttons it has', async (t) => {
  const w = await world(t);
  const data = await content(w, { device: remoteId(w.gladys, UUIDS.TV) });
  assert.equal(data.components[0].text, 'Living room TV · LOOKin living_room');
  const status = data.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => item.value),
    ['On', '24.6 °C'],
  );
  assert.deepEqual(labels(data), ['Turn off', 'Volume up', 'Volume down', 'Mute']);
});

test('the buttons follow the settings and the remote; the name is the one given in Gladys', async (t) => {
  const w = await world(t);
  const fanId = remoteId(w.gladys, UUIDS.FAN);
  await w.fake.deviceUpdated({
    ...w.fake.devices.find((d) => d.external_id === fanId),
    name: 'Bedroom fan',
  });
  const data = await content(w, { device: fanId, buttons: ['speed', 'swing', 'volup'] }, 'fr');
  assert.deepEqual(labels(data), ['Vitesse', 'Balayage']);
  assert.match(data.components[0].text, /^Bedroom fan/);
});

test('an air conditioner: mode and setpoint, on/off and ±1 °C', async (t) => {
  const w = await world(t);
  const settings = { device: remoteId(w.gladys, UUIDS.CLIMATE) };
  const data = await content(w, settings, 'fr');
  const status = data.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => item.value),
    ['Chaud', '23 °C', '24.6 °C'],
  );
  assert.deepEqual(labels(data), ['Éteindre', '−1 °C', '+1 °C']);

  const [lookin] = w.network.lookins;
  const up = await w.fake.widgetAction(WIDGET_KEY, 'temp_up', {}, { settings });
  assert.equal(up.success, true);
  assert.equal(lookin.sent.at(-1).status, '3801');
  const off = await w.fake.widgetAction(WIDGET_KEY, 'power', {}, { settings });
  assert.equal(off.success, true);
  assert.equal(off.data.message.fr, 'Éteint');
  assert.equal(lookin.sent.at(-1).status, '0801');
});

test('a widget button presses the remote button and says so', async (t) => {
  const w = await world(t);
  const settings = { device: remoteId(w.gladys, UUIDS.TV) };
  const ack = await w.fake.widgetAction(WIDGET_KEY, 'volup', {}, { settings });
  assert.equal(ack.success, true);
  assert.equal(ack.data.message.de, 'Gesendet: Lauter');
  assert.deepEqual(w.network.lookins[0].sent, [{ uuid: UUIDS.TV, command: 'volup' }]);

  const missing = await w.fake.widgetAction(WIDGET_KEY, 'speed', {}, { settings });
  assert.equal(missing.success, false);
  assert.match(missing.error.fr, /n'a pas ce bouton/);
});

test('messages: no device chosen, unknown device, the LOOKin itself', async (t) => {
  const w = await world(t);
  for (const [settings, text] of [
    [{}, /Choose a LOOKin remote/],
    [{ device: remoteId(w.gladys, 'FFFF') }, /not known yet/],
    [{ device: lookinId(w.gladys) }, /not the LOOKin itself/],
  ]) {
    const data = await content(w, settings);
    assert.match(data.components[0].text, text);
  }
});
