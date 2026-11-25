// -----------------------------------------------------------------------------
// The LOOKin hub: finds the LOOKin Remotes, reads them at the configured pace,
// publishes their devices and states to Gladys and runs the commands.
//
// Polling only. A LOOKin announces its changes ("LOOK.in:Updated!...") in UDP
// broadcast on port 61201: the integration container sits on a Docker bridge,
// which LAN broadcasts never reach, and the core only relays them during a
// bounded scan. So the hub reads every LOOKin itself (every 30 s by default);
// Gladys never polls these devices (should_poll: false). The UDP port still
// serves the discovery, through the core ("LOOK.in:Discover!").
// -----------------------------------------------------------------------------

import { GladysApiError, createLogger } from '@gladysassistant/integration-sdk';
import {
  FEATURE_KEYS,
  BUTTON_PREFIX,
  KINDS,
  buildLookinDevice,
  buildRemoteDevice,
  deviceIds,
  hasPower,
  lookinName,
  lookinValues,
  remoteName,
  remotePlatformId,
  remoteValues,
  toLookinFan,
  toLookinMode,
} from './devices.js';
import { LookinError } from './lookin/client.js';
import {
  CLIMATE_MODES,
  DISCOVER_PAYLOAD,
  UDP_PORT,
  COMMANDS,
  REMOTE_TYPES,
  decodeClimate,
  encodeClimate,
  normalizeId,
  normalizeUuid,
  normalizeIrCode,
  parseUdpMessage,
  powerOf,
} from './lookin/protocol.js';
import { ProblemLog } from './problems.js';
import { ActionFailure, CONNECTION_TEXT, FAILURE } from './texts.js';

const logger = createLogger({ name: 'lookin-hub' });

export const WIDGET_KEY = 'remote';

export const HUB_TIMINGS = {
  // New scan, to follow DHCP changes and find new LOOKins.
  rediscoveryMs: 30 * 60_000,
  // Every state is published again at least this often, so Gladys never
  // shows "no recent value" for a value that does not change.
  heartbeatMs: 6 * 3600_000,
  // Polls in a row without answer before a LOOKin is "unreachable".
  unreachableAfter: 2,
  // Duration of each mediated scan (mDNS, then UDP), in seconds.
  scanSeconds: 3,
  // Timeout of the identity request of a candidate address.
  probeTimeoutMs: 4000,
};

const isGladysFailure = (err) =>
  err instanceof GladysApiError ||
  err?.name === 'TimeoutError' ||
  err?.name === 'AbortError' ||
  (err instanceof TypeError && err.message === 'fetch failed');

const describe = (err) => {
  const code = err?.cause?.code;
  return code && !err.message.includes(code) ? `${err.message} (${code})` : err.message;
};

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** A LookinError of a command, as the multi-language failure Gladys shows in red. */
function commandFailure(err) {
  if (err instanceof ActionFailure) {
    return err;
  }
  if (err instanceof LookinError) {
    return new ActionFailure(err.unreachable ? FAILURE.unreachable : FAILURE.refused);
  }
  logger.error('Command failed', err);
  return new ActionFailure(FAILURE.failed);
}

export class LookinHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake)
   * @param {object} options.store persistence (src/store.js)
   * @param {import('./lookin/client.js').LookinClient} options.client
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   */
  constructor({ gladys, store, client, timers = true, timings }) {
    this.gladys = gladys;
    this.store = store;
    this.client = client;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.config = null;
    /** @type {Map<string, object>} LOOKin records, by LOOKin id */
    this.lookins = new Map();
    this.pending = new Set();
    this.timers = [];
    this.polling = null;
    this.discovering = null;
    this.lastScan = 'not-run';
    this.stopped = false;
    this.problems = new ProblemLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    try {
      await this.restore();
      await this.discover();
      await this.publishDevices();
      await this.publishAllStates();
      await this.publishTransports();
      await this.publishConnectionStatus();
      this.requestWidgetRefresh();
    } finally {
      // Gladys refusing one of the first publications must not stop the
      // readings: the next ones (and resync) publish again.
      this.startTimers();
    }
  }

  /** Gladys came back (restart, network): it may have lost what was published. */
  async resync(config) {
    this.config = config;
    if (this.timers.length === 0) {
      this.startTimers();
    }
    this.gladys.forgetPublishedStates();
    await this.publishDevices();
    await this.publishAllStates();
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.gladysRecovered();
    this.requestWidgetRefresh();
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    if (!previous || previous.hosts.join(',') !== config.hosts.join(',')) {
      await this.discover();
    }
    if (previous && previous.pollSeconds !== config.pollSeconds) {
      this.startTimers();
    }
    // New LOOKins, or names in another language for the Discovery list.
    await this.publishDevices();
    await this.publishAllStates();
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.requestWidgetRefresh();
  }

  startTimers() {
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    this.timers.forEach((timer) => clearInterval(timer));
    this.timers = [
      setInterval(() => this.track(this.pollAll()), this.config.pollSeconds * 1000),
      setInterval(() => this.track(this.rediscover()), this.timings.rediscoveryMs),
      setInterval(() => this.track(this.heartbeat()), this.timings.heartbeatMs),
    ];
  }

  async stop() {
    this.stopped = true;
    this.timers.forEach((timer) => clearInterval(timer));
    this.timers = [];
    await this.idle();
    await this.store.flush();
  }

  /** Keep track of background work, so the tests (and stop) can wait for it. */
  track(promise) {
    const tracked = Promise.resolve(promise)
      .catch((err) => this.backgroundFailed(err))
      .finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
    return tracked;
  }

  backgroundFailed(err) {
    if (isGladysFailure(err)) {
      this.problems.fail('gladys', `Gladys does not take the LOOKin updates: ${describe(err)}`);
    } else {
      this.problems.fail(`bug:${err?.message}`, 'Background task failed', 'error', err);
    }
  }

  gladysRecovered() {
    this.problems.recover('gladys', 'Gladys takes the LOOKin updates again');
  }

  async idle() {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }

  // --- Persistence -----------------------------------------------------------

  async restore() {
    const data = await this.store.load();
    for (const [key, saved] of Object.entries(data.lookins ?? {})) {
      const id = normalizeId(key);
      if (!id || (saved?.host !== null && !IPV4.test(String(saved?.host)))) {
        continue;
      }
      const record = this.createRecord({
        id,
        host: saved.host,
        name: typeof saved.name === 'string' ? saved.name : null,
        model: Number.isFinite(saved.model) ? saved.model : null,
        hasMeteo: saved.hasMeteo === true,
      });
      // The remotes as last read: commands and widgets know them (and say
      // "not answering") while the LOOKin is away.
      for (const remote of Array.isArray(saved.remotes) ? saved.remotes : []) {
        const uuid = normalizeUuid(remote?.uuid);
        if (uuid && Object.values(REMOTE_TYPES).includes(remote.type)) {
          record.remotes.set(uuid, {
            uuid,
            type: remote.type,
            name: typeof remote.name === 'string' ? remote.name : null,
            updated: String(remote.updated ?? ''),
            status: typeof remote.status === 'string' ? remote.status : null,
            lastStatus: typeof remote.lastStatus === 'string' ? remote.lastStatus : null,
            functions: (Array.isArray(remote.functions) ? remote.functions : []).filter((name) =>
              COMMANDS.includes(name),
            ),
            commandSeq: 0,
          });
        }
      }
      this.lookins.set(id, record);
    }
  }

  save() {
    const lookins = {};
    for (const record of this.lookins.values()) {
      lookins[record.id] = {
        host: record.host,
        name: record.name,
        model: record.model,
        hasMeteo: record.hasMeteo,
        remotes: [...record.remotes.values()].map(
          ({ uuid, type, name, updated, status, lastStatus, functions }) => ({
            uuid,
            type,
            name,
            updated,
            status,
            lastStatus,
            functions,
          }),
        ),
      };
    }
    return this.store.save({ lookins });
  }

  // --- Discovery -------------------------------------------------------------

  createRecord({ id, host, name = null, model = null, hasMeteo = false }) {
    return {
      id,
      host,
      name,
      model,
      hasMeteo,
      meteo: null,
      /** @type {Map<string, object>} remotes saved in the LOOKin app, by UUID */
      remotes: new Map(),
      // null until the first answer or the first scan without one.
      reachable: null,
      failures: 0,
      // Remote list as last read ("UUID:Updated,..."): a change is new devices.
      signature: null,
    };
  }

  /** Scan, probe the typed, found and known addresses. Resolves with the LOOKins answering. */
  discover() {
    this.discovering ??= this.runDiscovery().finally(() => {
      this.discovering = null;
    });
    return this.discovering;
  }

  async runDiscovery() {
    const hosts = [];
    const add = (host) => {
      if (IPV4.test(host) && !hosts.includes(host)) {
        hosts.push(host);
      }
    };
    this.config.hosts.forEach(add);
    (await this.scan()).forEach(add);
    [...this.lookins.values()].forEach((record) => record.host && add(record.host));

    const answered = new Set();
    for (const host of hosts) {
      let info;
      try {
        info = await this.client.info(host, { timeoutMs: this.timings.probeTimeoutMs });
      } catch (err) {
        logger.debug(`No LOOKin answer from ${host}: ${err.message}`);
        continue;
      }
      if (answered.has(info.id)) {
        continue;
      }
      answered.add(info.id);
      try {
        // Another LOOKin known at this address has moved (or is gone).
        for (const other of this.lookins.values()) {
          if (other.id !== info.id && other.host === host) {
            other.host = null;
          }
        }
        const record = await this.adopt(host, info);
        await this.refresh(record, { checked: true });
      } catch (err) {
        this.backgroundFailed(err);
      }
    }
    for (const record of this.lookins.values()) {
      if (!answered.has(record.id) && record.reachable === null) {
        // Known from /data, silent since the start: unreachable, no event.
        record.reachable = false;
      }
    }
    await this.save();
    return answered.size;
  }

  /**
   * The addresses the core finds: mDNS (`_lookin._tcp`), then a UDP
   * "Discover" broadcast on port 61201, answered by every LOOKin. Never throws.
   */
  async scan() {
    const hosts = [];
    let failure = null;
    try {
      const services = await this.gladys.scanNetwork('mdns', {
        timeoutSeconds: this.timings.scanSeconds,
      });
      for (const service of services ?? []) {
        (service.addresses ?? [])
          .filter((address) => IPV4.test(address))
          .forEach((address) => hosts.push(address));
      }
    } catch (err) {
      failure = err;
    }
    try {
      const replies = await this.gladys.scanNetwork('udp-active-broadcast', {
        port: UDP_PORT,
        payload: Buffer.from(DISCOVER_PAYLOAD),
        timeoutSeconds: this.timings.scanSeconds,
      });
      for (const reply of replies ?? []) {
        const text = Buffer.from(reply.payload_base64 ?? '', 'base64').toString('utf8');
        if (parseUdpMessage(text) && IPV4.test(reply.source_ip)) {
          hosts.push(reply.source_ip);
        }
      }
    } catch (err) {
      failure ??= err;
    }
    if (failure && hosts.length === 0) {
      // 403/404: a core without mediated discovery; 409/429: a scan is running
      // or ran less than 10 s ago. The typed and known addresses still work.
      const busy = failure.status === 409 || failure.status === 429;
      this.lastScan = busy ? 'busy' : 'unavailable';
      const message = `LOOKin discovery through Gladys failed: ${describe(failure)}`;
      if (busy) {
        logger.debug(message);
      } else {
        this.problems.fail('scan', message);
      }
    } else {
      this.lastScan = 'ok';
      this.problems.recover('scan', 'LOOKin discovery through Gladys works again');
    }
    return hosts;
  }

  /** A LOOKin answered at `host`: a new one is added, a known one may have moved. */
  async adopt(host, info) {
    let record = this.lookins.get(info.id);
    if (!record) {
      record = this.createRecord({ id: info.id, host });
      this.lookins.set(info.id, record);
      logger.info(`LOOKin ${info.id} found at ${host}`);
    } else if (record.host !== host) {
      logger.info(`LOOKin ${info.id} moved from ${record.host} to ${host}`);
    }
    Object.assign(record, { host, name: info.name, model: info.model });
    if (!record.hasMeteo && (info.model === null || info.model >= 2)) {
      // The Remote2 has the sensor; ask once, an older model answers an error.
      try {
        record.meteo = await this.client.meteo(host);
        record.hasMeteo = record.meteo.temperature !== null;
      } catch (err) {
        logger.debug(`LOOKin ${info.id} has no sensor: ${err.message}`);
      }
    }
    return record;
  }

  async rediscover() {
    await this.discover();
    await this.publishDevices();
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.gladysRecovered();
  }

  // --- Devices ---------------------------------------------------------------

  /** Every Gladys device of the known LOOKins. */
  buildDevices() {
    const devices = [];
    for (const record of this.lookins.values()) {
      const lookin = buildLookinDevice(this.gladys, record, this.config.language);
      if (lookin) {
        devices.push(lookin);
      }
      for (const remote of record.remotes.values()) {
        const device = buildRemoteDevice(this.gladys, record, remote, this.config.language);
        if (device) {
          devices.push(device);
        }
      }
    }
    return devices;
  }

  async publishDevices() {
    await this.gladys.publishDiscoveredDevices(this.buildDevices());
  }

  /**
   * The LOOKin, and the remote (or null), behind a Gladys device external id.
   * @returns {{ lookin: object, remote: object|null } | null}
   */
  resolve(externalId) {
    if (typeof externalId !== 'string') {
      return null;
    }
    const lookinPrefix = deviceIds(this.gladys, KINDS.LOOKIN, '').device;
    const remotePrefix = deviceIds(this.gladys, KINDS.REMOTE, '').device;
    if (externalId.startsWith(lookinPrefix)) {
      const lookin = this.lookins.get(externalId.slice(lookinPrefix.length));
      return lookin ? { lookin, remote: null } : null;
    }
    if (externalId.startsWith(remotePrefix)) {
      const [id, uuid] = externalId.slice(remotePrefix.length).split('-');
      const lookin = this.lookins.get(id);
      const remote = lookin?.remotes.get(uuid);
      return remote ? { lookin, remote } : null;
    }
    return null;
  }

  externalId(lookin, remote = null) {
    return remote
      ? deviceIds(this.gladys, KINDS.REMOTE, remotePlatformId(lookin.id, remote.uuid)).device
      : deviceIds(this.gladys, KINDS.LOOKIN, lookin.id).device;
  }

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  /** The name the user gave in Gladys, or the LOOKin one. */
  displayName(lookin, remote, language) {
    const id = this.externalId(lookin, remote);
    const created = (this.gladys.devices ?? []).find((device) => device.external_id === id);
    return created?.name || (remote ? remoteName(remote, language) : lookinName(lookin));
  }

  // --- States ----------------------------------------------------------------

  /** Publish what changed for one LOOKin and its remotes (created devices only). */
  async publishStates(record) {
    const states = [];
    const collect = (externalId, values) => {
      if (!this.isCreated(externalId)) {
        return;
      }
      for (const [key, value] of Object.entries(values)) {
        states.push({ device_feature_external_id: `${externalId}:${key}`, state: value });
      }
    };
    if (record.hasMeteo) {
      collect(this.externalId(record), lookinValues(record));
    }
    for (const remote of record.remotes.values()) {
      collect(this.externalId(record, remote), remoteValues(remote));
    }
    // The SDK only sends the values that changed since its last publication.
    await this.gladys.publishChangedStates(states);
  }

  async publishAllStates() {
    for (const record of this.lookins.values()) {
      try {
        await this.publishStates(record);
      } catch (err) {
        this.backgroundFailed(err);
      }
    }
  }

  /** Republish every value, changed or not (Gladys forgets a silent one after 48 h). */
  async heartbeat() {
    this.gladys.forgetPublishedStates();
    await this.publishAllStates();
  }

  /** The user added a device: the states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const found = this.resolve(device?.external_id);
    if (!found) {
      return;
    }
    this.gladys.forgetPublishedStates(device.external_id);
    await this.publishStates(found.lookin);
    await this.publishTransports([found.lookin]);
    this.requestWidgetRefresh();
  }

  async publishTransports(records = [...this.lookins.values()]) {
    const entries = [];
    for (const record of records) {
      const transport = record.reachable === true ? 'local' : 'unreachable';
      for (const remote of [null, ...record.remotes.values()]) {
        const id = this.externalId(record, remote);
        if (this.isCreated(id)) {
          entries.push({ external_id: id, transport });
        }
      }
    }
    for (let at = 0; at < entries.length; at += 100) {
      await this.gladys.publishTransports(entries.slice(at, at + 100));
    }
  }

  async publishConnectionStatus() {
    const records = [...this.lookins.values()];
    if (records.length === 0) {
      await this.gladys.setConnectionStatus(false, CONNECTION_TEXT.noDevice);
    } else if (!records.some((record) => record.reachable === true)) {
      await this.gladys.setConnectionStatus(false, CONNECTION_TEXT.noAnswer);
    } else {
      await this.gladys.setConnectionStatus(true);
    }
  }

  requestWidgetRefresh() {
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  // --- Polling ---------------------------------------------------------------

  /** Read every LOOKin once (the timer's job). */
  pollAll() {
    this.polling ??= (async () => {
      let failed = false;
      for (const record of this.lookins.values()) {
        try {
          await this.refresh(record);
        } catch (err) {
          failed = true;
          this.backgroundFailed(err);
        }
      }
      if (!failed) {
        this.gladysRecovered();
      }
    })().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  /** Read one LOOKin (sensor, remotes and their states) and publish what changed. */
  async refresh(record, { checked = false } = {}) {
    if (!record.host) {
      await this.failed(record);
      return;
    }
    let meteo = null;
    let list;
    const details = new Map();
    // Commands bumped meanwhile: those remotes' readings may predate them.
    const seqs = new Map(
      [...record.remotes.values()].map((remote) => [remote.uuid, remote.commandSeq]),
    );
    try {
      if (!checked) {
        // DHCP may have given the address to another LOOKin: never read (nor
        // drive) its remotes as ours.
        const info = await this.client.info(record.host);
        if (info.id !== record.id) {
          logger.info(`LOOKin ${record.id}: ${record.host} is now LOOKin ${info.id}`);
          record.host = null;
          record.failures = this.timings.unreachableAfter;
          await this.failed(record);
          return;
        }
      }
      if (record.hasMeteo) {
        meteo = await this.client.meteo(record.host);
      }
      list = await this.client.remotes(record.host);
      for (const entry of list) {
        details.set(entry.uuid, await this.client.remote(record.host, entry.uuid));
      }
    } catch (err) {
      if (err instanceof LookinError && err.unreachable) {
        await this.failed(record);
      } else {
        this.problems.fail(`read:${record.id}`, `Cannot read LOOKin ${record.id}: ${err.message}`);
      }
      return;
    }
    this.problems.recover(`read:${record.id}`, `LOOKin ${record.id} reads again`);
    if (meteo) {
      record.meteo = meteo;
    }
    const signature = list.map((entry) => `${entry.uuid}:${entry.updated}`).join(',');
    // The first reading counts as a change: the remotes become devices.
    const structureChanged = record.signature !== signature;
    record.signature = signature;
    const remotes = new Map();
    for (const entry of list) {
      const detail = details.get(entry.uuid);
      if (detail.type !== entry.type) {
        continue;
      }
      const previous = record.remotes.get(entry.uuid);
      if (previous && seqs.has(entry.uuid) && seqs.get(entry.uuid) !== previous.commandSeq) {
        // A Gladys command ran meanwhile: keep the state it set.
        Object.assign(previous, {
          name: detail.name,
          functions: detail.functions,
          updated: detail.updated,
        });
        remotes.set(entry.uuid, previous);
      } else {
        remotes.set(entry.uuid, {
          uuid: entry.uuid,
          commandSeq: previous?.commandSeq ?? 0,
          ...detail,
        });
      }
    }
    record.remotes = remotes;
    record.failures = 0;
    if (record.reachable !== true) {
      if (record.reachable === false) {
        logger.info(`LOOKin ${record.id} answers again at ${record.host}`);
      }
      record.reachable = true;
      await this.publishTransports([record]);
      await this.publishConnectionStatus();
      this.requestWidgetRefresh();
    }
    if (structureChanged) {
      // A remote added, removed or edited in the LOOKin app.
      logger.debug(`LOOKin ${record.id}: new list of remotes`);
      await this.save();
      await this.publishDevices();
    }
    await this.publishStates(record);
  }

  /** A poll without answer; after a few in a row the LOOKin is unreachable. */
  async failed(record) {
    if (this.stopped) {
      return;
    }
    record.failures += 1;
    if (record.failures < this.timings.unreachableAfter || record.reachable === false) {
      return;
    }
    record.reachable = false;
    logger.info(`LOOKin ${record.id} no longer answers at ${record.host}`);
    await this.publishTransports([record]);
    await this.publishConnectionStatus();
    this.requestWidgetRefresh();
  }

  // --- Commands --------------------------------------------------------------

  require(externalId) {
    const found = this.resolve(externalId);
    if (!found) {
      throw new ActionFailure(FAILURE.unknownDevice);
    }
    return found;
  }

  /** A LOOKin whose address was taken by another one cannot be driven. */
  requireHost(lookin) {
    if (!lookin.host) {
      throw new ActionFailure(FAILURE.unreachable);
    }
  }

  /** A Gladys command on a feature of one of the devices. */
  async setValue(device, feature, value) {
    const { lookin, remote } = this.require(device?.external_id);
    const prefix = `${device.external_id}:`;
    const key = feature?.external_id?.startsWith(prefix)
      ? feature.external_id.slice(prefix.length)
      : null;
    if (!remote || !key) {
      throw new Error(`${feature?.external_id} cannot be set`);
    }
    logger.info(`LOOKin ${lookin.id}: ${key} = ${value} on ${remote.uuid}`);
    try {
      if (remote.type === 'climate') {
        await this.setClimate(lookin, remote, key, value);
      } else if (key === FEATURE_KEYS.POWER) {
        await this.setPower(lookin, remote, Number(value) === 1);
      } else if (
        key.startsWith(BUTTON_PREFIX) &&
        remote.functions.includes(key.slice(BUTTON_PREFIX.length))
      ) {
        if (Number(value) !== 0) {
          await this.press(lookin, remote, key.slice(BUTTON_PREFIX.length));
        }
      } else {
        throw new Error(`${feature.external_id} cannot be set`);
      }
    } catch (err) {
      throw commandFailure(err);
    }
  }

  /** Press a button of a remote, keeping the on/off state the LOOKin would. */
  async press(lookin, remote, command) {
    this.requireHost(lookin);
    remote.commandSeq += 1;
    await this.client.press(lookin.host, remote.uuid, command);
    logger.debug(`LOOKin ${lookin.id}: ${command} sent to ${remote.uuid}`);
    const on = powerOf(remote.status);
    const next =
      command === 'poweron'
        ? true
        : command === 'poweroff'
          ? false
          : command === 'power' && on !== null
            ? !on
            : null;
    if (next !== null) {
      remote.status = `${next ? '1' : '0'}${(remote.status ?? '0000').slice(1)}`;
      await this.publishAfterCommand(lookin);
    }
  }

  /**
   * On or off. A remote with separate on and off buttons gets the right one;
   * with a single power button (a toggle), it is pressed only when the state
   * the LOOKin knows differs.
   */
  async setPower(lookin, remote, on) {
    if (!hasPower(remote)) {
      throw new Error(`${remote.uuid} has no power button`);
    }
    const wanted = on ? 'poweron' : 'poweroff';
    if (remote.functions.includes(wanted)) {
      await this.press(lookin, remote, wanted);
      return;
    }
    if (powerOf(remote.status) === on) {
      // Already in that state: a toggle would invert it.
      this.gladys.forgetPublishedStates(`${this.externalId(lookin, remote)}:${FEATURE_KEYS.POWER}`);
      await this.publishAfterCommand(lookin);
      return;
    }
    if (!remote.functions.includes('power')) {
      throw new ActionFailure(FAILURE.noButton);
    }
    await this.press(lookin, remote, 'power');
    if (powerOf(remote.status) === null) {
      remote.status = `${on ? '1' : '0'}000`;
      await this.publishAfterCommand(lookin);
    }
  }

  /**
   * One air conditioner setting: the whole state is sent, as the original
   * remote does. Choosing a mode switches it on; the temperature, fan and
   * swing of a switched-off unit are kept for when it is switched on.
   */
  async setClimate(lookin, remote, key, value) {
    const current = decodeClimate(remote.status, remote.lastStatus);
    const next = { ...current };
    const number = Number(value);
    if (key === FEATURE_KEYS.POWER) {
      next.mode = number === 1 ? current.lastMode : CLIMATE_MODES.OFF;
    } else if (key === FEATURE_KEYS.MODE) {
      const mode = toLookinMode(value);
      if (mode === null) {
        throw new Error(`Unknown air conditioner mode ${value}`);
      }
      next.mode = mode;
    } else if (key === FEATURE_KEYS.TARGET_TEMPERATURE) {
      if (!Number.isFinite(number)) {
        throw new Error(`Invalid temperature ${value}`);
      }
      next.temperature = number;
    } else if (key === FEATURE_KEYS.FAN_SPEED) {
      const fan = toLookinFan(value);
      if (fan === null) {
        throw new Error(`Unknown fan speed ${value}`);
      }
      next.fan = fan;
    } else if (key === FEATURE_KEYS.SWING) {
      next.swing = number > 0 ? 1 : 0;
    } else {
      throw new Error(`Unknown air conditioner feature ${key}`);
    }
    const status = encodeClimate(next);
    this.requireHost(lookin);
    remote.commandSeq += 1;
    await this.client.setClimate(lookin.host, remote.uuid, status);
    logger.debug(`LOOKin ${lookin.id}: air conditioner ${remote.uuid} set to ${status}`);
    remote.status = status;
    if (next.mode !== CLIMATE_MODES.OFF) {
      remote.lastStatus = status;
    }
    // The values the user did not touch are republished too (a rounded or
    // clamped temperature shows what was really sent).
    this.gladys.forgetPublishedStates(this.externalId(lookin, remote));
    await this.publishAfterCommand(lookin);
  }

  /**
   * The infrared is sent: Gladys refusing the new state must not make the
   * command look failed (a retry would press a toggle twice).
   */
  async publishAfterCommand(lookin) {
    try {
      await this.publishStates(lookin);
    } catch (err) {
      this.backgroundFailed(err);
    }
    this.requestWidgetRefresh();
  }

  /** Scene action: press a button of a remote. */
  async sendCommand(deviceExternalId, command) {
    if (!deviceExternalId) {
      throw new ActionFailure(FAILURE.noDevice);
    }
    const { lookin, remote } = this.require(deviceExternalId);
    if (!remote) {
      throw new ActionFailure(FAILURE.notRemote);
    }
    if (remote.type === 'climate') {
      throw new ActionFailure(FAILURE.climate);
    }
    if (!remote.functions.includes(command)) {
      throw new ActionFailure(FAILURE.noButton);
    }
    try {
      await this.press(lookin, remote, command);
    } catch (err) {
      throw commandFailure(err);
    }
    logger.info(`LOOKin ${lookin.id}: scene sent ${command} to ${remote.uuid}`);
    return { lookin, remote };
  }

  /** Scene action: send a raw or Pronto HEX code through a LOOKin. */
  async sendIr(deviceExternalId, format, code) {
    if (!deviceExternalId) {
      throw new ActionFailure(FAILURE.noDevice);
    }
    const { lookin } = this.require(deviceExternalId);
    const normalized = normalizeIrCode(format, code);
    if (!normalized) {
      throw new ActionFailure(FAILURE.badCode);
    }
    this.requireHost(lookin);
    try {
      await this.client.sendIr(lookin.host, format, normalized);
    } catch (err) {
      throw commandFailure(err);
    }
    logger.info(`LOOKin ${lookin.id}: scene sent a ${format} IR code`);
  }

  /** Widget button: run a command and say what was done. */
  async widgetCommand(deviceExternalId, command) {
    if (!deviceExternalId) {
      throw new ActionFailure(FAILURE.noDevice);
    }
    const { lookin, remote } = this.require(deviceExternalId);
    logger.info(`LOOKin ${lookin.id}: widget ${command}`);
    if (!remote) {
      throw new ActionFailure(FAILURE.notRemote);
    }
    try {
      if (remote.type === 'climate') {
        const current = decodeClimate(remote.status, remote.lastStatus);
        if (command === 'power') {
          await this.setClimate(
            lookin,
            remote,
            FEATURE_KEYS.POWER,
            current.mode === CLIMATE_MODES.OFF ? 1 : 0,
          );
        } else if (command === 'temp_up' || command === 'temp_down') {
          await this.setClimate(
            lookin,
            remote,
            FEATURE_KEYS.TARGET_TEMPERATURE,
            current.temperature + (command === 'temp_up' ? 1 : -1),
          );
        } else {
          throw new ActionFailure(FAILURE.noButton);
        }
      } else if (command === 'power' && hasPower(remote)) {
        await this.setPower(lookin, remote, powerOf(remote.status) !== true);
      } else if (remote.functions.includes(command)) {
        await this.press(lookin, remote, command);
      } else {
        throw new ActionFailure(FAILURE.noButton);
      }
    } catch (err) {
      throw commandFailure(err);
    }
    return { lookin, remote };
  }

  /** What the Configuration screen's "Search" action reports. */
  summary() {
    return {
      scan: this.lastScan,
      invalidHosts: this.config.invalidHosts,
      lookins: [...this.lookins.values()].map((record) => ({
        name: lookinName(record),
        host: record.host,
        remotes: record.remotes.size,
        reachable: record.reachable === true,
      })),
    };
  }
}
