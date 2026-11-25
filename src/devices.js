// -----------------------------------------------------------------------------
// Gladys devices built from what the LOOKin says:
//
// - the LOOKin itself (`lookin:<ID>`): its temperature and humidity sensor
//   (Remote2 only);
// - one device per remote saved in the LOOKin app (`remote:<ID>-<UUID>`):
//     TV, media, light, humidifier, purifier, vacuum, fan: an on/off switch
//     (when the remote has a power button) and one push button per other
//     button (volume, channel, mute, mode, speed, swing...);
//     air conditioner: on/off, mode, target temperature, fan speed, swing,
//     sent as one state through the LOOKin "AC" protocol.
//
// The LOOKin cannot read the appliance back (infrared is one-way): the states
// are the ones the LOOKin remembers, from its own commands and from the
// presses of the original remote it hears. Hence `has_feedback: false`.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import {
  CLIMATE_FAN_MAX,
  CLIMATE_MODES,
  CLIMATE_TEMP_MAX,
  CLIMATE_TEMP_MIN,
  decodeClimate,
  powerOf,
} from './lookin/protocol.js';

export const KINDS = { LOOKIN: 'lookin', REMOTE: 'remote' };

export const FEATURE_KEYS = {
  TEMPERATURE: 'temperature',
  HUMIDITY: 'humidity',
  POWER: 'power',
  MODE: 'mode',
  TARGET_TEMPERATURE: 'target-temperature',
  FAN_SPEED: 'fan-speed',
  SWING: 'swing',
};
// Push buttons: `button-<command>` (src/lookin/protocol.js COMMAND_CODES).
export const BUTTON_PREFIX = 'button-';
// The power buttons make the on/off switch, not push buttons.
const POWER_COMMANDS = ['power', 'poweron', 'poweroff'];
const MEDIA_TYPES = ['tv', 'media'];

// Gladys AC_MODE (0 auto, 1 cooling, 2 heating, 3 drying, 4 fan) is the
// LOOKin mode minus one (LOOKin 0 is "off", the switch).
export const toGladysMode = (mode) => Math.max(0, mode - 1);
export const toLookinMode = (value) => {
  const mode = Math.round(Number(value));
  return Number.isFinite(mode) && mode >= 0 && mode <= 4 ? mode + 1 : null;
};
// Gladys AC_FAN_SPEED (0 auto, 1 low, 2 low-mid, 3 mid, 4 mid-high, 5 high,
// 6 quiet, 7 turbo) <-> LOOKin (0 auto, 1 low, 2 middle, 3 high).
const FAN_TO_GLADYS = [0, 1, 3, 5];
const FAN_TO_LOOKIN = [0, 1, 1, 2, 3, 3, 1, 3];
export const toGladysFan = (fan) => FAN_TO_GLADYS[fan] ?? 0;
export const toLookinFan = (value) => {
  const speed = Math.round(Number(value));
  return Number.isFinite(speed) && FAN_TO_LOOKIN[speed] !== undefined ? FAN_TO_LOOKIN[speed] : null;
};

// Device and feature names, in the language of the integration settings
// (Gladys does not give it to a device integration).
export const NAMES = {
  en: {
    tv: 'TV',
    media: 'Media',
    light: 'Light',
    humidifier: 'Humidifier',
    purifier: 'Air purifier',
    vacuum: 'Vacuum',
    fan: 'Fan',
    climate: 'Air conditioner',
    temperature: 'Temperature',
    humidity: 'Humidity',
    power: 'On/off',
    mode: 'Mode',
    'target-temperature': 'Target temperature',
    'fan-speed': 'Fan speed',
    swing: 'Swing',
    'button-mode': 'Mode',
    'button-source': 'Source',
    'button-mute': 'Mute',
    'button-volup': 'Volume up',
    'button-voldown': 'Volume down',
    'button-chup': 'Channel up',
    'button-chdown': 'Channel down',
    'button-swing': 'Swing',
    'button-speed': 'Speed',
    'button-cursor': 'Cursor',
    'button-menu': 'Menu',
  },
  fr: {
    tv: 'TV',
    media: 'Multimédia',
    light: 'Lumière',
    humidifier: 'Humidificateur',
    purifier: "Purificateur d'air",
    vacuum: 'Aspirateur',
    fan: 'Ventilateur',
    climate: 'Climatiseur',
    temperature: 'Température',
    humidity: 'Humidité',
    power: 'Marche/arrêt',
    mode: 'Mode',
    'target-temperature': 'Température de consigne',
    'fan-speed': 'Vitesse de ventilation',
    swing: 'Balayage',
    'button-mode': 'Mode',
    'button-source': 'Source',
    'button-mute': 'Muet',
    'button-volup': 'Volume +',
    'button-voldown': 'Volume -',
    'button-chup': 'Chaîne suivante',
    'button-chdown': 'Chaîne précédente',
    'button-swing': 'Balayage',
    'button-speed': 'Vitesse',
    'button-cursor': 'Curseur',
    'button-menu': 'Menu',
  },
  de: {
    tv: 'Fernseher',
    media: 'Medien',
    light: 'Licht',
    humidifier: 'Luftbefeuchter',
    purifier: 'Luftreiniger',
    vacuum: 'Staubsauger',
    fan: 'Ventilator',
    climate: 'Klimaanlage',
    temperature: 'Temperatur',
    humidity: 'Luftfeuchtigkeit',
    power: 'Ein/Aus',
    mode: 'Modus',
    'target-temperature': 'Solltemperatur',
    'fan-speed': 'Lüfterstufe',
    swing: 'Schwenken',
    'button-mode': 'Modus',
    'button-source': 'Quelle',
    'button-mute': 'Stumm',
    'button-volup': 'Lauter',
    'button-voldown': 'Leiser',
    'button-chup': 'Nächster Sender',
    'button-chdown': 'Vorheriger Sender',
    'button-swing': 'Schwenken',
    'button-speed': 'Stufe',
    'button-cursor': 'Cursor',
    'button-menu': 'Menü',
  },
  es: {
    tv: 'TV',
    media: 'Multimedia',
    light: 'Luz',
    humidifier: 'Humidificador',
    purifier: 'Purificador de aire',
    vacuum: 'Aspiradora',
    fan: 'Ventilador',
    climate: 'Aire acondicionado',
    temperature: 'Temperatura',
    humidity: 'Humedad',
    power: 'Encendido/apagado',
    mode: 'Modo',
    'target-temperature': 'Temperatura objetivo',
    'fan-speed': 'Velocidad del ventilador',
    swing: 'Oscilación',
    'button-mode': 'Modo',
    'button-source': 'Fuente',
    'button-mute': 'Silencio',
    'button-volup': 'Subir volumen',
    'button-voldown': 'Bajar volumen',
    'button-chup': 'Canal siguiente',
    'button-chdown': 'Canal anterior',
    'button-swing': 'Oscilación',
    'button-speed': 'Velocidad',
    'button-cursor': 'Cursor',
    'button-menu': 'Menú',
  },
};

export const namesFor = (language) => NAMES[language] ?? NAMES.en;

/** External ids of a LOOKin or of one of its remotes. */
export function deviceIds(gladys, kind, platformId) {
  return gladys.externalIds(kind, platformId);
}

export const remotePlatformId = (lookinId, uuid) => `${lookinId}-${uuid}`;

/** Name of the LOOKin device: the one given in the LOOKin app, or its id. */
export function lookinName(lookin) {
  return lookin.name ? `LOOKin ${lookin.name}` : `LOOKin ${lookin.id}`;
}

/** Name of a remote: the one given in the LOOKin app, or its type and UUID. */
export function remoteName(remote, language) {
  return remote.name ?? `${namesFor(language)[remote.type]} ${remote.uuid}`;
}

/** The button commands of a remote that become push buttons. */
export function buttonCommands(remote) {
  return remote.type === 'climate'
    ? []
    : remote.functions.filter((command) => !POWER_COMMANDS.includes(command));
}

export const hasPower = (remote) =>
  remote.type !== 'climate' && remote.functions.some((command) => POWER_COMMANDS.includes(command));

const base = { read_only: false, has_feedback: false, keep_history: true };

/** Feature specs of the LOOKin itself (its sensor), or [] without one. */
export function lookinFeatures(lookin, language) {
  if (!lookin.hasMeteo) {
    return [];
  }
  const names = namesFor(language);
  return [
    {
      key: FEATURE_KEYS.TEMPERATURE,
      name: names.temperature,
      category: C.TEMPERATURE_SENSOR,
      type: T.SENSOR.DECIMAL,
      unit: U.CELSIUS,
      min: -20,
      max: 60,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    },
    {
      key: FEATURE_KEYS.HUMIDITY,
      name: names.humidity,
      category: C.HUMIDITY_SENSOR,
      type: T.SENSOR.DECIMAL,
      unit: U.PERCENT,
      min: 0,
      max: 100,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    },
  ];
}

function powerCategory(type) {
  if (MEDIA_TYPES.includes(type)) {
    return { category: C.TELEVISION, type: T.TELEVISION.BINARY };
  }
  if (type === 'light') {
    return { category: C.LIGHT, type: T.LIGHT.BINARY };
  }
  return { category: C.SWITCH, type: T.SWITCH.BINARY };
}

/** Feature specs of one remote. */
export function remoteFeatures(remote, language) {
  const names = namesFor(language);
  if (remote.type === 'climate') {
    const ac = C.AIR_CONDITIONING;
    return [
      {
        key: FEATURE_KEYS.POWER,
        name: names.power,
        category: ac,
        type: T.AIR_CONDITIONING.BINARY,
        min: 0,
        max: 1,
        ...base,
      },
      {
        key: FEATURE_KEYS.MODE,
        name: names.mode,
        category: ac,
        type: T.AIR_CONDITIONING.MODE,
        min: 0,
        max: 4,
        ...base,
      },
      {
        key: FEATURE_KEYS.TARGET_TEMPERATURE,
        name: names['target-temperature'],
        category: ac,
        type: T.AIR_CONDITIONING.TARGET_TEMPERATURE,
        unit: U.CELSIUS,
        min: CLIMATE_TEMP_MIN,
        max: CLIMATE_TEMP_MAX,
        ...base,
      },
      {
        key: FEATURE_KEYS.FAN_SPEED,
        name: names['fan-speed'],
        category: ac,
        type: T.AIR_CONDITIONING.FAN_SPEED,
        min: 0,
        max: 5,
        supported_options: [0, 1, 3, 5],
        ...base,
      },
      {
        key: FEATURE_KEYS.SWING,
        name: names.swing,
        category: ac,
        type: T.AIR_CONDITIONING.SWING_VERTICAL,
        min: 0,
        max: 1,
        supported_options: [0, 1],
        ...base,
      },
    ];
  }
  const specs = [];
  if (hasPower(remote)) {
    specs.push({
      key: FEATURE_KEYS.POWER,
      name: names.power,
      ...powerCategory(remote.type),
      min: 0,
      max: 1,
      ...base,
    });
  }
  for (const command of buttonCommands(remote)) {
    const label =
      command === 'mode' && MEDIA_TYPES.includes(remote.type)
        ? 'button-source'
        : `${BUTTON_PREFIX}${command}`;
    specs.push({
      key: `${BUTTON_PREFIX}${command}`,
      name: names[label],
      category: C.BUTTON,
      type: T.BUTTON.PUSH,
      min: 0,
      max: 1,
      read_only: false,
      has_feedback: false,
      keep_history: false,
    });
  }
  return specs;
}

function toFeatures(ids, specs) {
  return specs.map(({ key, ...spec }) => ({ ...spec, external_id: ids.feature(key) }));
}

/** The Gladys device of a LOOKin (null when it has no feature to offer). */
export function buildLookinDevice(gladys, lookin, language) {
  const specs = lookinFeatures(lookin, language);
  if (specs.length === 0) {
    return null;
  }
  const ids = deviceIds(gladys, KINDS.LOOKIN, lookin.id);
  return {
    name: lookinName(lookin),
    external_id: ids.device,
    model: 'LOOKin Remote2',
    // Read by the integration's own timer, at the configured pace.
    should_poll: false,
    params: lookin.host ? [{ name: 'IP_ADDRESS', value: lookin.host }] : [],
    features: toFeatures(ids, specs),
  };
}

/** The Gladys device of a remote saved in the LOOKin app (null without features). */
export function buildRemoteDevice(gladys, lookin, remote, language) {
  const specs = remoteFeatures(remote, language);
  if (specs.length === 0) {
    return null;
  }
  const ids = deviceIds(gladys, KINDS.REMOTE, remotePlatformId(lookin.id, remote.uuid));
  return {
    name: remoteName(remote, language),
    external_id: ids.device,
    model: `LOOKin ${namesFor('en')[remote.type]}`,
    should_poll: false,
    params: [
      ...(lookin.host ? [{ name: 'IP_ADDRESS', value: lookin.host }] : []),
      { name: 'LOOKIN_ID', value: lookin.id },
      { name: 'REMOTE_UUID', value: remote.uuid },
    ],
    features: toFeatures(ids, specs),
  };
}

/** The values to publish for a LOOKin: `{ key: number }`. */
export function lookinValues(lookin) {
  const values = {};
  if (lookin.meteo?.temperature !== null && lookin.meteo?.temperature !== undefined) {
    values[FEATURE_KEYS.TEMPERATURE] = lookin.meteo.temperature;
  }
  if (lookin.meteo?.humidity !== null && lookin.meteo?.humidity !== undefined) {
    values[FEATURE_KEYS.HUMIDITY] = lookin.meteo.humidity;
  }
  return values;
}

/** The values to publish for a remote: `{ key: number }` (push buttons have none). */
export function remoteValues(remote) {
  if (remote.type === 'climate') {
    const climate = decodeClimate(remote.status, remote.lastStatus);
    return {
      [FEATURE_KEYS.POWER]: climate.mode === CLIMATE_MODES.OFF ? 0 : 1,
      [FEATURE_KEYS.MODE]: toGladysMode(
        climate.mode === CLIMATE_MODES.OFF ? climate.lastMode : climate.mode,
      ),
      [FEATURE_KEYS.TARGET_TEMPERATURE]: climate.temperature,
      [FEATURE_KEYS.FAN_SPEED]: toGladysFan(Math.min(climate.fan, CLIMATE_FAN_MAX)),
      [FEATURE_KEYS.SWING]: climate.swing,
    };
  }
  const on = powerOf(remote.status);
  return hasPower(remote) && on !== null ? { [FEATURE_KEYS.POWER]: on ? 1 : 0 } : {};
}
