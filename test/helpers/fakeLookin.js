// -----------------------------------------------------------------------------
// A fake LOOKin Remote2, faithful to its local API (HTTP answers from
// test/fixtures/lookin), with the state changes a real one makes on a command:
// a button press updates the remote status, an air conditioner state replaces
// its Status (and LastStatus when on). Used in memory by the tests (through
// `createNetwork().fetch`) and over the network by tools/fake-lookin.js (the
// container test).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { COMMAND_CODES } from '../../src/lookin/protocol.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/lookin/${name}.json`, import.meta.url), 'utf8'));

export const LOOKIN_ID = '98F3A1B2';
export const UUIDS = { TV: '49C2', LIGHT: '703A', FAN: '1234', CLIMATE: '460E' };

const CODE_TO_COMMAND = Object.fromEntries(
  Object.entries(COMMAND_CODES).map(([command, code]) => [code, command]),
);

export class FakeLookin {
  /**
   * @param {object} [options]
   * @param {string} [options.id]
   * @param {string} [options.host]
   * @param {boolean} [options.meteo] Remote2 sensor (false: an older model)
   */
  constructor({ id = LOOKIN_ID, host = '192.0.2.20', meteo = true } = {}) {
    this.host = host;
    this.device = { ...fixture('device'), ID: id };
    if (!meteo) {
      this.device.MRDC = '01000105001K17E3';
    }
    this.meteo = meteo ? fixture('meteo') : null;
    this.list = fixture('data');
    this.remotes = new Map(this.list.map((entry) => [entry.UUID, fixture(`remote-${entry.UUID}`)]));
    this.online = true;
    /** @type {string[]} every path requested */
    this.requests = [];
    /** @type {Array<{ uuid: string, command?: string, status?: string, format?: string, code?: string }>} */
    this.sent = [];
  }

  get id() {
    return this.device.ID;
  }

  /** The original remote (or the LOOKin app) changed a state. */
  setStatus(uuid, status) {
    this.remotes.get(uuid).Status = status;
  }

  /** A remote added in the LOOKin app. */
  addRemote(uuid, data) {
    this.list.push({ Type: data.Type, UUID: uuid, Updated: data.Updated });
    this.remotes.set(uuid, data);
  }

  /** `{ status, body }` of a GET on `path`. */
  handle(path) {
    this.requests.push(path);
    const ok = (body) => ({ status: 200, body });
    const notFound = { status: 404, body: { success: 'false', Message: "Item didn't exists" } };
    if (path === '/device') {
      return ok(this.device);
    }
    if (path === '/sensors/meteo') {
      return this.meteo ? ok(this.meteo) : notFound;
    }
    if (path === '/data') {
      return ok(this.list);
    }
    let match = path.match(/^\/data\/([0-9A-F]{4})$/);
    if (match) {
      return this.remotes.has(match[1]) ? ok(this.remotes.get(match[1])) : notFound;
    }
    match = path.match(/^\/commands\/ir\/localremote\/([0-9A-F]{4})([0-9A-F]{4})$/);
    if (match) {
      const [, uuid, rest] = match;
      const remote = this.remotes.get(uuid);
      if (!remote) {
        return notFound;
      }
      if (remote.Type === 'EF') {
        remote.Status = rest;
        if (rest[0] !== '0') {
          remote.LastStatus = rest;
        }
        this.sent.push({ uuid, status: rest });
        return ok({ success: 'true' });
      }
      const command = CODE_TO_COMMAND[rest.slice(0, 2)];
      if (!command || !remote.Functions.some((fn) => fn.Name === command)) {
        return notFound;
      }
      const status = remote.Status ?? '0000';
      const on = { poweron: '1', poweroff: '0', power: status[0] === '1' ? '0' : '1' }[command];
      if (on) {
        remote.Status = `${on}${status.slice(1)}`;
      }
      this.sent.push({ uuid, command });
      return ok({ success: 'true' });
    }
    match = path.match(/^\/commands\/ir\/(raw|prontohex)\/(.+)$/);
    if (match) {
      this.sent.push({ format: match[1], code: decodeURIComponent(match[2]) });
      return ok({ success: 'true' });
    }
    return notFound;
  }
}

/**
 * A network of fake LOOKins: a `fetch` reaching them by address, and the raw
 * results of the core's scans.
 */
export function createNetwork(lookins) {
  const byHost = () => new Map(lookins.map((lookin) => [lookin.host, lookin]));
  return {
    lookins,
    async fetch(url, { signal } = {}) {
      signal?.throwIfAborted();
      const { host, pathname } = new URL(url);
      const lookin = byHost().get(host);
      if (!lookin || !lookin.online) {
        throw new TypeError('fetch failed', { cause: { code: 'EHOSTUNREACH' } });
      }
      const { status, body } = lookin.handle(pathname);
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    },
    mdns() {
      return lookins
        .filter((lookin) => lookin.online)
        .map((lookin) => ({
          name: `${lookin.id}._lookin._tcp.local`,
          host: `${lookin.id}.local`,
          addresses: [lookin.host],
          port: 80,
          txt: [],
        }));
    },
    udp() {
      return lookins
        .filter((lookin) => lookin.online)
        .map((lookin) => ({
          source_ip: lookin.host,
          source_port: 61201,
          payload_base64: Buffer.from(
            `LOOK.in:Alive!${lookin.id}:1:2.38:0:${lookin.host}`,
          ).toString('base64'),
        }));
    },
  };
}
