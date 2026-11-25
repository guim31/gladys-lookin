# LOOKin

Pilotez vos appareils infrarouges depuis Gladys avec une télécommande
universelle [LOOKin Remote2](https://look-in.club), en réseau local : TV,
lecteurs multimédias, lumières, ventilateurs, purificateurs et climatiseurs
enregistrés dans l'application LOOKin, ainsi que la température et l'humidité
de son capteur. Pas de compte, pas de cloud : Gladys parle directement à la
LOOKin, sur votre Wi-Fi.

> **Développée sans le matériel : vos retours sont les bienvenus.** Cette
> intégration a été construite et testée avec les réponses de l'API locale
> LOOKin enregistrées par le projet aiolookin, et avec une LOOKin simulée, pas
> avec une vraie. Si quelque chose ne fonctionne pas comme décrit, dites-le sur
> le [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-lookin/issues).

## Ce qu'il faut

- Gladys Assistant 5.2.0 ou plus récent.
- Une LOOKin Remote2 configurée dans l'**application LOOKin**, sur le même
  réseau que Gladys.
- Vos appareils enregistrés comme télécommandes dans l'application LOOKin
  (c'est là que les codes infrarouges sont appris ou choisis).
- Rien d'autre : ni compte, ni clé, ni accès à Internet.

## Installation

1. Installez l'intégration depuis le catalogue de Gladys.
2. Ouvrez sa **Configuration**. Rien n'est obligatoire ; les options sont :
   - **Adresses IP des LOOKin Remote** : seulement si la découverte automatique
     n'en trouve pas une (autre réseau, mDNS bloqué). Donnez-lui une adresse
     fixe dans votre box.
   - **Intervalle d'actualisation** : fréquence de lecture de chaque LOOKin (30
     secondes par défaut).
   - **Langue des noms des appareils** : noms des nouveaux appareils et
     fonctionnalités.
3. Ouvrez l'onglet **Découverte** : la LOOKin et chaque télécommande
   enregistrée dans l'application LOOKin apparaissent. Ajoutez celles que vous
   voulez.
4. L'action **Rechercher les LOOKin Remote** de l'écran de configuration les
   recherche à nouveau et liste ce qui est trouvé.

## Les appareils dans Gladys

**La LOOKin elle-même** (Remote2) : **Température** et **Humidité** de son
capteur.

**Un appareil par télécommande** enregistrée dans l'application LOOKin, nommé
comme dans l'application :

| Télécommande                                                         | Fonctionnalités                                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| TV, Multimédia                                                       | **Marche/arrêt**, boutons poussoirs : **Volume +**, Volume -, Muet, Chaîne suivante, Chaîne précédente, **Source**, Menu |
| Lumière, Ventilateur, Humidificateur, Purificateur d'air, Aspirateur | **Marche/arrêt**, et un bouton poussoir pour chaque autre bouton (Vitesse, Balayage, Mode…)                              |
| Climatiseur (protocole « AC » de LOOKin)                             | **Marche/arrêt**, **Mode**, **Température de consigne** (16 à 30 °C), **Vitesse de ventilation**, **Balayage**           |

Seuls les boutons que la télécommande a dans l'application LOOKin sont créés.

- L'infrarouge est à sens unique : la LOOKin ne peut pas relire l'appareil.
  L'état marche/arrêt est celui dont la LOOKin se souvient, d'après ses propres
  commandes et les appuis de la télécommande d'origine qu'elle entend.
- Avec des boutons « marche » et « arrêt » séparés, chacun est envoyé comme
  demandé. Avec un seul bouton d'alimentation, il n'est appuyé que si l'état
  connu de la LOOKin est différent.
- Climatiseur : tout l'état est envoyé d'un coup, comme la télécommande
  d'origine. Choisir un mode allume l'appareil ; la température, la ventilation
  et le balayage d'un appareil arrêté sont gardés pour son rallumage, dans son
  dernier mode.

## Widget de tableau de bord

Le widget **Télécommande LOOKin** place une télécommande sur le tableau de
bord : son état, la température de la pièce mesurée par la LOOKin, et jusqu'à
quatre boutons choisis dans ses réglages parmi ceux de la télécommande
(marche/arrêt, volume, muet, chaîne, mode, menu, vitesse, balayage ; pour un
climatiseur : marche/arrêt et consigne −1 / +1 °C).

## Scènes

### Action : appuyer sur un bouton

**Appuyer sur un bouton de télécommande LOOKin** envoie un bouton d'une
télécommande enregistrée dans l'application LOOKin : marche/arrêt (bascule),
marche, arrêt, mode ou source, muet, volume, chaîne, balayage, vitesse, curseur,
menu. Utile pour les boutons sans fonctionnalité propre, ou pour enchaîner
plusieurs appuis.

### Action : envoyer un code IR

**Envoyer un code IR avec LOOKin** envoie un code brut (durées en
microsecondes, `9000 -4500 560 -560 …`) ou un code Pronto HEX
(`0000 006D 0022 0002 …`) par une LOOKin, pour un appareil sans télécommande
enregistrée. Choisissez la LOOKin ou l'une de ses télécommandes.

### Idées de scènes

- Au coucher du soleil, éteindre le ventilateur et allumer la lumière.
- Quand la température de la LOOKin dépasse 27 °C, passer le climatiseur en
  froid à 24 °C.
- En quittant la maison, éteindre la TV (bouton arrêt, ou la bascule).

Une action qui échoue (LOOKin qui ne répond pas, bouton absent, code invalide)
s'arrête avec un message en rouge.

## Dépannage

- **Aucune LOOKin trouvée** : vérifiez qu'elle est sur le même réseau que
  Gladys, puis saisissez son adresse IP dans la configuration. La découverte
  automatique passe par la découverte réseau de Gladys 5.2 (mDNS et port UDP
  61201).
- **Une télécommande manque** : enregistrez-la d'abord dans l'application
  LOOKin ; elle apparaît à l'actualisation suivante.
- **L'état est faux** : l'appareil a été commandé avec une télécommande que la
  LOOKin n'a pas entendue. Renvoyez l'état depuis Gladys.

## Limites

- La LOOKin annonce ses changements en diffusion UDP, qui n'atteint pas le
  conteneur de l'intégration : ils sont lus à chaque intervalle
  d'actualisation.
- Pas d'apprentissage de nouveaux codes : apprenez-les ou choisissez-les dans
  l'application LOOKin.
- Températures du climatiseur en °C, de 16 à 30, comme le protocole LOOKin.
- Sans lien avec LOOKin.
