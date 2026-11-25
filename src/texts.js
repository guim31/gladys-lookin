// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, the "Search" report and the action errors. Four
// languages, the four of the Gladys interface; German says "du", Spanish
// "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

/**
 * An action that did not do what was asked: Gladys shows its message in red
 * (what a handler returns is shown in green).
 */
export class ActionFailure extends Error {
  /** @param {{ en: string, fr: string, de: string, es: string }} text */
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Shown by Gladys under the integration name when it is not connected.
export const CONNECTION_TEXT = {
  noDevice: {
    en: 'No LOOKin Remote found. Check that it is on the same network as Gladys, or enter its IP address.',
    fr: "Aucune LOOKin Remote trouvée. Vérifiez qu'elle est sur le même réseau que Gladys, ou saisissez son adresse IP.",
    de: 'Keine LOOKin Remote gefunden. Prüfe, ob sie im selben Netzwerk wie Gladys ist, oder gib ihre IP-Adresse ein.',
    es: 'No se ha encontrado ninguna LOOKin Remote. Compruebe que está en la misma red que Gladys o introduzca su dirección IP.',
  },
  noAnswer: {
    en: 'No LOOKin Remote answers.',
    fr: 'Aucune LOOKin Remote ne répond.',
    de: 'Keine LOOKin Remote antwortet.',
    es: 'Ninguna LOOKin Remote responde.',
  },
};

// Action and scene action failures.
export const FAILURE = {
  noDevice: {
    en: 'Choose a LOOKin device.',
    fr: 'Choisissez un appareil LOOKin.',
    de: 'Wähle ein LOOKin-Gerät aus.',
    es: 'Elija un dispositivo LOOKin.',
  },
  unknownDevice: {
    en: 'This device is not known: run a search in the LOOKin integration.',
    fr: "Cet appareil est inconnu : lancez une recherche dans l'intégration LOOKin.",
    de: 'Dieses Gerät ist unbekannt: Starte eine Suche in der LOOKin-Integration.',
    es: 'Este dispositivo no es conocido: inicie una búsqueda en la integración LOOKin.',
  },
  notRemote: {
    en: 'Choose a remote saved in the LOOKin app, not the LOOKin itself.',
    fr: "Choisissez une télécommande enregistrée dans l'application LOOKin, pas la LOOKin elle-même.",
    de: 'Wähle eine in der LOOKin-App gespeicherte Fernbedienung, nicht die LOOKin selbst.',
    es: 'Elija un mando guardado en la aplicación LOOKin, no la propia LOOKin.',
  },
  noButton: {
    en: 'This remote has no such button in the LOOKin app.',
    fr: "Cette télécommande n'a pas ce bouton dans l'application LOOKin.",
    de: 'Diese Fernbedienung hat diese Taste in der LOOKin-App nicht.',
    es: 'Este mando no tiene ese botón en la aplicación LOOKin.',
  },
  climate: {
    en: 'An air conditioner is driven by its device in Gladys (on/off, mode, temperature).',
    fr: 'Un climatiseur se pilote par son appareil dans Gladys (marche, mode, température).',
    de: 'Eine Klimaanlage steuerst du über ihr Gerät in Gladys (Ein/Aus, Modus, Temperatur).',
    es: 'Un aire acondicionado se controla con su dispositivo en Gladys (encendido, modo, temperatura).',
  },
  badCode: {
    en: 'The IR code is not valid for the chosen format.',
    fr: "Le code IR n'est pas valide pour le format choisi.",
    de: 'Der IR-Code ist für das gewählte Format ungültig.',
    es: 'El código IR no es válido para el formato elegido.',
  },
  unreachable: {
    en: 'The LOOKin Remote does not answer.',
    fr: 'La LOOKin Remote ne répond pas.',
    de: 'Die LOOKin Remote antwortet nicht.',
    es: 'La LOOKin Remote no responde.',
  },
  refused: {
    en: 'The LOOKin Remote refused the command.',
    fr: 'La LOOKin Remote a refusé la commande.',
    de: 'Die LOOKin Remote hat den Befehl abgelehnt.',
    es: 'La LOOKin Remote ha rechazado el comando.',
  },
  failed: {
    en: 'The command failed, check the integration logs.',
    fr: "La commande a échoué, consultez les logs de l'intégration.",
    de: 'Der Befehl ist fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'El comando ha fallado, consulte los registros de la integración.',
  },
  nothingFound: {
    en: 'No LOOKin Remote found. Enter its IP address in the configuration.',
    fr: 'Aucune LOOKin Remote trouvée. Saisissez son adresse IP dans la configuration.',
    de: 'Keine LOOKin Remote gefunden. Gib ihre IP-Adresse in der Konfiguration ein.',
    es: 'No se ha encontrado ninguna LOOKin Remote. Introduzca su dirección IP en la configuración.',
  },
  noneAnswers: {
    en: 'LOOKin Remotes are known, but none answers.',
    fr: 'Des LOOKin Remote sont connues, mais aucune ne répond.',
    de: 'LOOKin Remotes sind bekannt, aber keine antwortet.',
    es: 'Hay LOOKin Remote conocidas, pero ninguna responde.',
  },
};

const MAX_LISTED = 6;

// The pieces of the "Search" report, one table per language.
export const SEARCH_TEXT = {
  en: {
    count: (total, remotes) => `${total} LOOKin Remote(s), ${remotes} remote(s):`,
    unreachable: 'not answering',
    unavailable: 'Automatic discovery through Gladys is unavailable (Gladys 5.2 or later).',
    ignored: (list) => `Ignored addresses: ${list}.`,
  },
  fr: {
    count: (total, remotes) => `${total} LOOKin Remote, ${remotes} télécommande(s) :`,
    unreachable: 'ne répond pas',
    unavailable:
      'La découverte automatique par Gladys est indisponible (Gladys 5.2 ou plus récent).',
    ignored: (list) => `Adresses ignorées : ${list}.`,
  },
  de: {
    count: (total, remotes) => `${total} LOOKin Remote(s), ${remotes} Fernbedienung(en):`,
    unreachable: 'antwortet nicht',
    unavailable:
      'Die automatische Erkennung über Gladys ist nicht verfügbar (Gladys 5.2 oder neuer).',
    ignored: (list) => `Ignorierte Adressen: ${list}.`,
  },
  es: {
    count: (total, remotes) => `${total} LOOKin Remote, ${remotes} mando(s):`,
    unreachable: 'no responde',
    unavailable:
      'El descubrimiento automático a través de Gladys no está disponible (Gladys 5.2 o posterior).',
    ignored: (list) => `Direcciones ignoradas: ${list}.`,
  },
};

/**
 * The "Search" report: a success message when a LOOKin answers, an
 * ActionFailure otherwise.
 * @param {{ lookins: Array<{ name: string, host: string, remotes: number, reachable: boolean }>, scan: string, invalidHosts: string[] }} summary
 */
export function searchMessage(summary) {
  const { lookins, scan, invalidHosts } = summary;
  if (!lookins.some((lookin) => lookin.reachable)) {
    throw new ActionFailure(lookins.length === 0 ? FAILURE.nothingFound : FAILURE.noneAnswers);
  }
  const message = {};
  for (const [language, text] of Object.entries(SEARCH_TEXT)) {
    const remotes = lookins.reduce((total, lookin) => total + lookin.remotes, 0);
    const listed = lookins
      .slice(0, MAX_LISTED)
      .map(
        (lookin) =>
          `${lookin.name} (${lookin.host}${lookin.reachable ? '' : `, ${text.unreachable}`})`,
      );
    const parts = [`${text.count(lookins.length, remotes)} ${listed.join(', ')}.`];
    if (scan === 'unavailable') {
      parts.push(text.unavailable);
    }
    if (invalidHosts.length > 0) {
      parts.push(text.ignored(invalidHosts.join(', ')));
    }
    message[language] = parts.join(' ');
  }
  return message;
}
