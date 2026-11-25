// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `remote`.
//
// A remote control on the dashboard: the buttons chosen in its settings,
// among those the remote saved in the LOOKin app has, plus what the LOOKin
// knows (on/off, air conditioner mode and target temperature, the room
// temperature of its sensor). The Gladys device box only has one control per
// feature and no way to see them together.
//
// Budget (8 components, 2 texts, 4 buttons): a caption, a status list, up to
// four buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { hasPower, namesFor, toGladysMode } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { CLIMATE_MODES, decodeClimate, powerOf } from './lookin/protocol.js';
import { ActionFailure, FAILURE } from './texts.js';

// The core keeps four buttons per widget.
const MAX_BUTTONS = 4;

// Widget buttons, in display order: a remote button, the on/off toggle, or
// the target temperature of an air conditioner.
export const WIDGET_BUTTONS = [
  'power',
  'volup',
  'voldown',
  'mute',
  'chup',
  'chdown',
  'mode',
  'menu',
  'speed',
  'swing',
  'temp_down',
  'temp_up',
];
export const DEFAULT_WIDGET_BUTTONS = ['power', 'volup', 'voldown', 'mute', 'temp_down', 'temp_up'];

const ICONS = {
  power: 'power',
  volup: 'volume-2',
  voldown: 'volume-1',
  mute: 'volume-x',
  chup: 'chevron-up',
  chdown: 'chevron-down',
  mode: 'sliders',
  menu: 'menu',
  speed: 'wind',
  swing: 'refresh-cw',
  temp_down: 'minus',
  temp_up: 'plus',
};

export const TEXT = {
  pick: {
    en: 'Choose a LOOKin remote in the settings of this widget.',
    fr: 'Choisissez une télécommande LOOKin dans les réglages de ce widget.',
    de: 'Wähle in den Einstellungen dieses Widgets eine LOOKin-Fernbedienung aus.',
    es: 'Elija un mando LOOKin en la configuración de este widget.',
  },
  unknown: {
    en: 'This remote is not known yet: run a search in the LOOKin integration.',
    fr: "Cette télécommande est inconnue : lancez une recherche dans l'intégration LOOKin.",
    de: 'Diese Fernbedienung ist noch unbekannt: Starte eine Suche in der LOOKin-Integration.',
    es: 'Este mando aún no es conocido: inicie una búsqueda en la integración LOOKin.',
  },
  notRemote: {
    en: 'This widget drives a remote saved in the LOOKin app, not the LOOKin itself.',
    fr: "Ce widget pilote une télécommande de l'application LOOKin, pas la LOOKin elle-même.",
    de: 'Dieses Widget steuert eine Fernbedienung aus der LOOKin-App, nicht die LOOKin selbst.',
    es: 'Este widget controla un mando de la aplicación LOOKin, no la propia LOOKin.',
  },
  state: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
  on: { en: 'On', fr: 'Allumé', de: 'Ein', es: 'Encendido' },
  off: { en: 'Off', fr: 'Éteint', de: 'Aus', es: 'Apagado' },
  turnOn: { en: 'Turn on', fr: 'Allumer', de: 'Einschalten', es: 'Encender' },
  turnOff: { en: 'Turn off', fr: 'Éteindre', de: 'Ausschalten', es: 'Apagar' },
  setpoint: { en: 'Setpoint', fr: 'Consigne', de: 'Sollwert', es: 'Consigna' },
  room: { en: 'Room', fr: 'Pièce', de: 'Raum', es: 'Estancia' },
  unreachable: {
    en: 'not answering',
    fr: 'ne répond pas',
    de: 'antwortet nicht',
    es: 'no responde',
  },
  sent: { en: 'Sent: ', fr: 'Envoyé : ', de: 'Gesendet: ', es: 'Enviado: ' },
};

// Air conditioner modes, Gladys AC_MODE order.
export const MODE_TEXT = [
  { en: 'Auto', fr: 'Auto', de: 'Auto', es: 'Auto' },
  { en: 'Cooling', fr: 'Froid', de: 'Kühlen', es: 'Frío' },
  { en: 'Heating', fr: 'Chaud', de: 'Heizen', es: 'Calor' },
  { en: 'Drying', fr: 'Déshumidification', de: 'Entfeuchten', es: 'Deshumidificar' },
  { en: 'Fan', fr: 'Ventilation', de: 'Lüften', es: 'Ventilación' },
];

const t = (text, language) => text[language] ?? text.en;

/** Label of a button, in a language. */
export function buttonLabel(button, remote, language, on) {
  if (button === 'power') {
    return t(on ? TEXT.turnOff : TEXT.turnOn, language);
  }
  if (button === 'temp_down' || button === 'temp_up') {
    return button === 'temp_up' ? '+1 °C' : '−1 °C';
  }
  const names = namesFor(language);
  return button === 'mode' && ['tv', 'media'].includes(remote.type)
    ? names['button-source']
    : names[`button-${button}`];
}

/** Can this remote run this widget button? */
export function supports(remote, button) {
  if (remote.type === 'climate') {
    return ['power', 'temp_down', 'temp_up'].includes(button);
  }
  return button === 'power' ? hasPower(remote) : remote.functions.includes(button);
}

/** The buttons of the widget settings the remote has, in order (defaults if never set). */
export function widgetButtons(remote, settings) {
  const raw = settings?.buttons;
  const chosen = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',').map((entry) => entry.trim())
      : DEFAULT_WIDGET_BUTTONS;
  return WIDGET_BUTTONS.filter(
    (button) => chosen.includes(button) && supports(remote, button),
  ).slice(0, MAX_BUTTONS);
}

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

async function get(hub, { settings, language = 'en' }) {
  if (!settings?.device) {
    return message(TEXT.pick, language);
  }
  const found = hub.resolve(settings.device);
  if (!found) {
    return message(TEXT.unknown, language);
  }
  const { lookin, remote } = found;
  if (!remote) {
    return message(TEXT.notRemote, language);
  }
  const caption = [
    hub.displayName(lookin, remote, language),
    hub.displayName(lookin, null, language),
  ];
  if (lookin.reachable !== true) {
    caption.push(t(TEXT.unreachable, language));
  }
  const components = [{ type: 'text', variant: 'caption', text: caption.join(' · ') }];

  const items = [];
  let on = powerOf(remote.status) === true;
  if (remote.type === 'climate') {
    const climate = decodeClimate(remote.status, remote.lastStatus);
    on = climate.mode !== CLIMATE_MODES.OFF;
    items.push({
      label: t(TEXT.state, language),
      icon: 'power',
      value: on ? t(MODE_TEXT[toGladysMode(climate.mode)], language) : t(TEXT.off, language),
      color: on ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    });
    items.push({
      label: t(TEXT.setpoint, language),
      icon: 'thermometer',
      value: `${climate.temperature} °C`,
      color: WIDGET_COLORS.NEUTRAL,
    });
  } else if (hasPower(remote) && powerOf(remote.status) !== null) {
    items.push({
      label: t(TEXT.state, language),
      icon: 'power',
      value: t(on ? TEXT.on : TEXT.off, language),
      color: on ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    });
  }
  const room = lookin.meteo?.temperature;
  if (lookin.hasMeteo && typeof room === 'number') {
    items.push({
      label: t(TEXT.room, language),
      icon: 'home',
      value: `${Math.round(room * 10) / 10} °C`,
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }
  for (const button of widgetButtons(remote, settings)) {
    components.push({
      type: 'button',
      label: buttonLabel(button, remote, language, on),
      icon: ICONS[button],
      style: 'secondary',
      action: { key: button },
    });
  }
  return { ttl_seconds: 60, components };
}

async function action(hub, { actionKey, settings }) {
  if (!WIDGET_BUTTONS.includes(actionKey)) {
    throw new ActionFailure(FAILURE.noButton);
  }
  const { remote } = await hub.widgetCommand(settings?.device, actionKey);
  const on =
    remote.type === 'climate'
      ? decodeClimate(remote.status, remote.lastStatus).mode !== 0
      : powerOf(remote.status) === true;
  return {
    message: Object.fromEntries(
      Object.keys(TEXT.sent).map((language) => [
        language,
        actionKey === 'power'
          ? t(on ? TEXT.on : TEXT.off, language)
          : `${TEXT.sent[language]}${buttonLabel(actionKey, remote, language, on)}`,
      ]),
    ),
  };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
