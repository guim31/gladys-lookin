// -----------------------------------------------------------------------------
// The HTTP client: one request at a time per LOOKin, errors told apart (no
// answer, refusal), never a retry of a command.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LookinClient, LookinError } from '../src/lookin/client.js';
import { FakeLookin, createNetwork } from './helpers/fakeLookin.js';

test('requests to the same LOOKin run one at a time, other LOOKins in parallel', async () => {
  let running = 0;
  let most = 0;
  const fetch = async (url) => {
    running += 1;
    most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    return new Response(JSON.stringify({ url }), { status: 200 });
  };
  const client = new LookinClient({ fetch });
  await Promise.all([
    client.get('192.0.2.1', '/a'),
    client.get('192.0.2.1', '/b'),
    client.get('192.0.2.1', '/c'),
  ]);
  assert.equal(most, 1);
  most = 0;
  await Promise.all([client.get('192.0.2.1', '/a'), client.get('192.0.2.2', '/a')]);
  assert.equal(most, 2);
  assert.equal(client.queues.size, 0, 'no queue is kept once idle');
});

test('a failed request does not block the next ones', async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    if (calls === 1) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    return new Response('{"ok":1}', { status: 200 });
  };
  const client = new LookinClient({ fetch });
  const first = client.get('192.0.2.1', '/device');
  const second = client.get('192.0.2.1', '/device');
  await assert.rejects(
    first,
    (err) => err instanceof LookinError && err.unreachable && /ECONNREFUSED/.test(err.message),
  );
  assert.deepEqual(await second, { ok: 1 });
});

test('no answer, timeout, HTTP error and {"success":"false"} are LookinErrors', async () => {
  const lookin = new FakeLookin();
  const network = createNetwork([lookin]);
  const client = new LookinClient({ fetch: network.fetch });

  assert.equal((await client.info('192.0.2.20')).id, '98F3A1B2');
  await assert.rejects(
    client.remote('192.0.2.20', 'FFFF'),
    (err) => err.status === 404 && /Item didn't exists/.test(err.message),
  );
  await assert.rejects(client.info('192.0.2.99'), (err) => err.unreachable === true);

  const slow = new LookinClient({
    fetch: (url, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason)),
      ),
    timings: { timeoutMs: 20 },
  });
  await assert.rejects(slow.info('192.0.2.20'), (err) => err.unreachable === true);

  const refusing = new LookinClient({
    fetch: async () => new Response('{"success":"false","Message":"Busy"}', { status: 200 }),
  });
  await assert.rejects(
    refusing.press('192.0.2.20', '49C2', 'power'),
    (err) => !err.unreachable && /Busy/.test(err.message),
  );

  const notLookin = new LookinClient({
    fetch: async () => new Response('<html></html>', { status: 200 }),
  });
  await assert.rejects(notLookin.info('192.0.2.20'), /not a LOOKin/);
});

test('a command is sent once, even when it fails', async () => {
  let calls = 0;
  const client = new LookinClient({
    fetch: async () => {
      calls += 1;
      throw new TypeError('fetch failed');
    },
  });
  await assert.rejects(client.press('192.0.2.20', '49C2', 'volup'));
  assert.equal(calls, 1);
});
