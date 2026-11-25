// -----------------------------------------------------------------------------
// HTTP client of one LOOKin Remote (port 80, no authentication).
//
// The LOOKin answers one request at a time (an ESP32): every request to the
// same address waits for the previous one. Reads have a short timeout; an IR
// command is never retried, a second try could press the button twice.
// -----------------------------------------------------------------------------

import {
  climatePath,
  commandPath,
  irPath,
  parseDevice,
  parseMeteo,
  parseRemote,
  parseRemoteList,
} from './protocol.js';

export const CLIENT_TIMINGS = {
  timeoutMs: 8000,
};

export class LookinError extends Error {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {boolean} [options.unreachable] no HTTP answer at all (timeout, refused...)
   * @param {number} [options.status] the HTTP status of a refusal
   */
  constructor(message, { unreachable = false, status = null, cause } = {}) {
    super(message, { cause });
    this.name = 'LookinError';
    this.unreachable = unreachable;
    this.status = status;
  }
}

/** Requests to LOOKin devices, one queue per address. */
export class LookinClient {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch] injectable for the tests
   * @param {object} [options.timings] CLIENT_TIMINGS overrides
   */
  constructor({ fetch: fetchImpl = globalThis.fetch, timings } = {}) {
    this.fetch = fetchImpl;
    this.timings = { ...CLIENT_TIMINGS, ...timings };
    /** @type {Map<string, Promise>} last request queued, by address */
    this.queues = new Map();
  }

  /** Run `task` after the requests already queued for `host`. */
  enqueue(host, task) {
    const previous = this.queues.get(host) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(task);
    const tail = run.catch(() => {});
    this.queues.set(host, tail);
    tail.then(() => {
      if (this.queues.get(host) === tail) {
        this.queues.delete(host);
      }
    });
    return run;
  }

  /** GET `path` on `host`; resolves with the parsed JSON (or null for an empty body). */
  get(host, path, { timeoutMs = this.timings.timeoutMs } = {}) {
    return this.enqueue(host, async () => {
      let response;
      try {
        response = await this.fetch(`http://${host}${path}`, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { accept: 'application/json' },
        });
      } catch (err) {
        const code = err?.cause?.code ?? err?.name;
        throw new LookinError(`${host} does not answer${code ? ` (${code})` : ''}`, {
          unreachable: true,
          cause: err,
        });
      }
      const text = await response.text().catch(() => '');
      let body = null;
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }
      // An error is a non-2xx status, or `{ "success": "false", "Message": ... }`.
      const refused = body && typeof body === 'object' && String(body.success) === 'false';
      if (!response.ok || refused) {
        const detail = typeof body?.Message === 'string' ? `: ${body.Message}` : '';
        throw new LookinError(
          `${host} refused ${path.split('/').slice(0, 3).join('/')} (HTTP ${response.status})${detail}`,
          {
            status: response.status,
          },
        );
      }
      return body;
    });
  }

  /** `{ id, name, model, firmware }` of the LOOKin at `host`. */
  async info(host, options) {
    const device = parseDevice(await this.get(host, '/device', options));
    if (!device) {
      throw new LookinError(`${host} is not a LOOKin Remote`);
    }
    return device;
  }

  async meteo(host) {
    return parseMeteo(await this.get(host, '/sensors/meteo'));
  }

  async remotes(host) {
    return parseRemoteList(await this.get(host, '/data'));
  }

  async remote(host, uuid) {
    const remote = parseRemote(await this.get(host, `/data/${uuid}`));
    if (!remote) {
      throw new LookinError(`${host} sent an unknown remote ${uuid}`);
    }
    return remote;
  }

  async press(host, uuid, command, signal) {
    await this.get(host, commandPath(uuid, command, signal));
  }

  async setClimate(host, uuid, status) {
    await this.get(host, climatePath(uuid, status));
  }

  async sendIr(host, format, code) {
    await this.get(host, irPath(format, code));
  }
}
