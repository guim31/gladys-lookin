// -----------------------------------------------------------------------------
// The LOOKin Remote local protocol: constants and pure encoders/decoders, no
// I/O. Sources: the LOOKin local API (HTTP on port 80, UDP on port 61201) as
// used by aiolookin (MIT, Anton Malko) and the Home Assistant `lookin`
// integration (Apache 2.0).
//
//   GET /device                                  identity (ID, Name, MRDC, Firmware...)
//   GET /sensors/meteo                           { Temperature, Humidity, Pressure, Updated }
//   GET /data                                    [{ Type, UUID, Updated }] the saved remotes
//   GET /data/{UUID}                             { Type, Name, Updated, Status, LastStatus, Functions }
//   GET /commands/ir/localremote/{UUID}{CC}{SS}  press a button of a saved remote
//   GET /commands/ir/localremote/{UUID}{STATUS}  air conditioner: send a full state
//   GET /commands/ir/raw/{codes}                 send a raw IR code
//   GET /commands/ir/prontohex/{codes}           send a Pronto HEX IR code
// -----------------------------------------------------------------------------

export const UDP_PORT = 61201;
export const MDNS_SERVICE = '_lookin._tcp';
// The request every LOOKin of the network answers with its "Alive" message.
export const DISCOVER_PAYLOAD = 'LOOK.in:Discover!';

// Remote types of /data ("Type"), as the LOOKin app saves them.
export const REMOTE_TYPES = {
  '01': 'tv',
  '02': 'media',
  '03': 'light',
  '04': 'humidifier',
  '05': 'purifier',
  '06': 'vacuum',
  '07': 'fan',
  EF: 'climate',
};

// Button codes of /commands/ir/localremote/{UUID}{code}{signal}.
export const COMMAND_CODES = {
  power: '01',
  poweron: '02',
  poweroff: '03',
  mode: '04',
  mute: '05',
  volup: '06',
  voldown: '07',
  chup: '08',
  chdown: '09',
  swing: '0A',
  speed: '0B',
  cursor: '0C',
  menu: '0D',
};
export const COMMANDS = Object.keys(COMMAND_CODES);
// "Default signal" of a button: the one saved in the app.
export const DEFAULT_SIGNAL = 'FF';

// Air conditioner (LOOKin "AC" protocol): a state of four hexadecimal digits,
// mode / target temperature - 16 / fan speed / swing.
export const CLIMATE_MODES = { OFF: 0, AUTO: 1, COOL: 2, HEAT: 3, DRY: 4, FAN: 5 };
export const CLIMATE_TEMP_MIN = 16;
export const CLIMATE_TEMP_MAX = 30;
// Fan: 0 auto, 1 low, 2 middle, 3 high. Swing: 0 off, 1 on.
export const CLIMATE_FAN_MAX = 3;

const HEX4 = /^[0-9A-F]{4}$/;
const DEVICE_ID = /^[0-9A-F]{4,16}$/;

/** A LOOKin id (`ID` of /device) as the integration keys it: upper case hex, or null. */
export function normalizeId(raw) {
  const id = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return DEVICE_ID.test(id) ? id : null;
}

/** A remote UUID of /data, upper case, or null. */
export function normalizeUuid(raw) {
  const uuid = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return HEX4.test(uuid) ? uuid : null;
}

/**
 * /device: `{ id, name, model, firmware }`, or null when the answer is not a
 * LOOKin's. `model` is the first byte of MRDC: 2 for the Remote2, the one with
 * the temperature and humidity sensor.
 */
export function parseDevice(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const id = normalizeId(data.ID);
  if (!id) {
    return null;
  }
  const model = parseInt(String(data.MRDC ?? '').slice(0, 2), 16);
  return {
    id,
    name: typeof data.Name === 'string' && data.Name.trim() ? data.Name.trim() : null,
    model: Number.isFinite(model) ? model : null,
    firmware: data.Firmware === undefined ? null : String(data.Firmware),
  };
}

const finiteOrNull = (value) => {
  const number = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(number) ? number : null;
};

/** /sensors/meteo: `{ temperature, humidity }` in °C and %, null when absent. */
export function parseMeteo(data) {
  const temperature = finiteOrNull(data?.Temperature);
  const humidity = finiteOrNull(data?.Humidity);
  return {
    temperature:
      temperature !== null && temperature > -50 && temperature < 100 ? temperature : null,
    humidity: humidity !== null && humidity >= 0 && humidity <= 100 ? humidity : null,
  };
}

/** /data: `[{ uuid, type, updated }]`, known types only, no duplicate. */
export function parseRemoteList(data) {
  const remotes = [];
  for (const entry of Array.isArray(data) ? data : []) {
    const uuid = normalizeUuid(entry?.UUID);
    const type = REMOTE_TYPES[String(entry?.Type ?? '').toUpperCase()];
    if (uuid && type && !remotes.some((remote) => remote.uuid === uuid)) {
      remotes.push({ uuid, type, updated: String(entry.Updated ?? '') });
    }
  }
  return remotes;
}

/**
 * /data/{UUID}: `{ type, name, updated, status, lastStatus, functions }`.
 * `functions` are the button names of COMMAND_CODES the remote has.
 */
export function parseRemote(data) {
  const type = REMOTE_TYPES[String(data?.Type ?? '').toUpperCase()];
  if (!type) {
    return null;
  }
  const functions = [];
  for (const fn of Array.isArray(data.Functions) ? data.Functions : []) {
    const name = typeof fn?.Name === 'string' ? fn.Name.trim().toLowerCase() : '';
    if (COMMAND_CODES[name] && !functions.includes(name)) {
      functions.push(name);
    }
  }
  const status = (value) => {
    const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return HEX4.test(text) ? text : null;
  };
  return {
    type,
    name: typeof data.Name === 'string' && data.Name.trim() ? data.Name.trim() : null,
    updated: String(data.Updated ?? ''),
    status: status(data.Status),
    lastStatus: status(data.LastStatus),
    functions,
  };
}

/** On/off of a TV, media, light, fan... remote: first digit of its status, or null. */
export function powerOf(status) {
  if (!status) {
    return null;
  }
  if (status[0] === '1') {
    return true;
  }
  return status[0] === '0' ? false : null;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * An air conditioner state: `{ mode, temperature, fan, swing, lastMode }`.
 * When it is off, LOOKin keeps the last settings in LastStatus: they are the
 * ones shown (and sent again when it is switched on).
 */
export function decodeClimate(status, lastStatus) {
  const digits = (text) => (text ? [...text].map((char) => parseInt(char, 16)) : null);
  const current = digits(status);
  const last = digits(lastStatus);
  const mode = current && current[0] <= CLIMATE_MODES.FAN ? current[0] : CLIMATE_MODES.OFF;
  // "0000" is off with no settings: the last ones, or none at all.
  const blank = status === '0000';
  const settings = blank ? last : (current ?? last);
  const lastMode = [current?.[0], last?.[0]].find(
    (value) => value > CLIMATE_MODES.OFF && value <= CLIMATE_MODES.FAN,
  );
  return {
    mode,
    temperature: settings
      ? clamp(settings[1] + CLIMATE_TEMP_MIN, CLIMATE_TEMP_MIN, CLIMATE_TEMP_MAX)
      : 24,
    fan: settings ? clamp(settings[2], 0, CLIMATE_FAN_MAX) : 0,
    swing: settings && settings[3] > 0 ? 1 : 0,
    lastMode: lastMode ?? CLIMATE_MODES.AUTO,
  };
}

/** The four digits LOOKin sends for an air conditioner state. */
export function encodeClimate({ mode, temperature, fan, swing }) {
  const digit = (value) => value.toString(16).toUpperCase();
  return [
    digit(clamp(Math.round(mode), 0, CLIMATE_MODES.FAN)),
    digit(clamp(Math.round(temperature), CLIMATE_TEMP_MIN, CLIMATE_TEMP_MAX) - CLIMATE_TEMP_MIN),
    digit(clamp(Math.round(fan), 0, CLIMATE_FAN_MAX)),
    digit(swing ? 1 : 0),
  ].join('');
}

/** Path of a button press. */
export function commandPath(uuid, command, signal = DEFAULT_SIGNAL) {
  return `/commands/ir/localremote/${uuid}${COMMAND_CODES[command]}${signal}`;
}

/** Path of an air conditioner state. */
export function climatePath(uuid, status) {
  return `/commands/ir/localremote/${uuid}${status}`;
}

export const IR_FORMATS = ['raw', 'prontohex'];
const MAX_CODE_LENGTH = 1500;

/**
 * A raw (signed microsecond durations) or Pronto HEX code, as typed by the
 * user: normalized to single spaces, or null when it is not one.
 */
export function normalizeIrCode(format, code) {
  if (typeof code !== 'string') {
    return null;
  }
  const parts = code
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (parts.length < 4) {
    return null;
  }
  const valid =
    format === 'raw'
      ? parts.every((part) => /^[+-]?\d{1,6}$/.test(part))
      : format === 'prontohex' && parts.every((part) => /^[0-9A-Fa-f]{4}$/.test(part));
  const text = parts.join(' ');
  return valid && text.length <= MAX_CODE_LENGTH
    ? format === 'raw'
      ? text
      : text.toUpperCase()
    : null;
}

/** Path of a raw or Pronto HEX code (spaces encoded). */
export function irPath(format, code) {
  return `/commands/ir/${format}/${encodeURIComponent(code)}`;
}

const UDP_MESSAGE = /^LOOK\.?in:([A-Za-z]+)!([0-9A-Fa-f]+)(?::|$)/;

/**
 * A LOOKin UDP message ("LOOK.in:Alive!98F33011:..."): `{ command, id }`, or
 * null. Only the id is read: the address is the one the datagram came from,
 * and /device tells the rest.
 */
export function parseUdpMessage(text) {
  const match = typeof text === 'string' ? text.trim().match(UDP_MESSAGE) : null;
  const id = match ? normalizeId(match[2]) : null;
  return id ? { command: match[1].toLowerCase(), id } : null;
}
