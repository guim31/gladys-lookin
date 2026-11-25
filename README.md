# LOOKin for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for the
[LOOKin Remote2](https://look-in.club) universal infrared remote: the
appliances saved in the LOOKin app (TV, media, light, fan, purifier, air
conditioner…) become Gladys devices, driven over the local network with the
LOOKin HTTP API, plus the temperature and humidity of its sensor. No account,
no cloud.

> **Developed without the hardware: feedback welcome.** Everything was built
> and tested against answers of the LOOKin local API (recorded by the aiolookin
> project) and against a simulated LOOKin, not against a real one. Please
> report what works and what does not on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-lookin/issues).

## Features

- **Automatic discovery** through the Gladys core: mDNS (`_lookin._tcp`) and
  the LOOKin UDP request (`LOOK.in:Discover!`, port 61201). IP addresses can
  be typed for the LOOKins on another network.
- **The LOOKin itself**: temperature and humidity (Remote2).
- **One Gladys device per remote** saved in the LOOKin app, with only the
  buttons it has:
  - TV, media, light, fan, humidifier, purifier, vacuum: on/off (separate on
    and off buttons, or a single toggle pressed only when needed) and a push
    button for every other button (volume, mute, channel, source, menu,
    speed, swing…);
  - air conditioner (LOOKin "AC" protocol): on/off, mode, target temperature
    (16-30 °C), fan speed, swing, sent as one state like the original remote.
- **Follows the original remotes** the LOOKin hears, at the refresh interval
  (30 seconds by default).
- **Scene actions** _Press a LOOKin remote button_ and _Send an IR code with
  LOOKin_ (raw or Pronto HEX).
- **Dashboard widget** _LOOKin remote_: state, room temperature, up to four
  buttons.
- English, French, German and Spanish, in the interface, the device names and
  the [documentation](docs/en.md) ([fr](docs/fr.md), [de](docs/de.md),
  [es](docs/es.md)).

## Requirements

- Gladys Assistant **5.2.0** or later.
- A LOOKin Remote2 set up in the LOOKin app, on the network of Gladys, with
  the appliances saved as remotes.

## Installation

In Gladys, open **Integrations**, then **Install from GitHub**, and enter the
address of this repository:

```
https://github.com/guim31/gladys-lookin
```

Then open the **Discover** tab of the integration and add the devices. The
[documentation](docs/en.md) details the options, the widget and the scenes.

## How it works

- LOOKin local API, plain HTTP on port 80: `/device` (id, name, model),
  `/sensors/meteo`, `/data` (remotes) and `/data/{UUID}` (name, buttons,
  status), `/commands/ir/localremote/{UUID}{button}FF` (press a button),
  `/commands/ir/localremote/{UUID}{state}` (air conditioner),
  `/commands/ir/raw|prontohex/{code}`. One request at a time per LOOKin; a
  command is never retried.
- **Polling, not push**: the LOOKin announces its changes by UDP broadcast on
  port 61201, which never reaches the integration's container on its Docker
  bridge. The integration reads each LOOKin itself at the configured interval
  (`should_poll: false` for Gladys).
- A LOOKin that misses two readings is _unreachable_ (badge on its devices).
  Each LOOKin is identified by its id: a new IP address (DHCP) keeps its
  devices. The LOOKins seen are kept in `/data/lookin-state.json`.

## Checked, and what was not

Checked: the protocol, the devices of the fixtures against the rules of the
Gladys core in the four languages, the whole integration against the fake
Gladys of the SDK, and the Docker image in the Gladys sandbox constraints
against a simulated LOOKin (`tools/fake-lookin.mjs`) on a Docker bridge.

Not checked, for want of hardware or of a Gladys instance: a real LOOKin (the
exact answers of each firmware, in particular to the UDP discovery request),
mDNS and UDP discovery through a real Gladys core, the rendering of the widget
and of the scene cards.

## Limitations

- Changes made with the original remotes are seen at the next reading.
- Infrared is one-way: the states are the ones the LOOKin remembers.
- No learning of new codes (use the LOOKin app); no media source list.
- Air conditioner temperatures in °C only, 16 to 30.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

## Credits

- [aiolookin](https://github.com/ANMalko/aiolookin) (MIT License, © Anton
  Malko): the LOOKin protocol and the API answers used as test fixtures.
- The [Home Assistant LOOKin integration](https://github.com/home-assistant/core/tree/dev/homeassistant/components/lookin)
  (Apache License 2.0): the air conditioner mapping, discovery and polling
  choices.
- [gladys-broadlink](https://github.com/prohand/gladys-broadlink) by prohand,
  the neighbour integration for Broadlink IR remotes: one push button per
  code.
- Cover: the LOOKin logo from [look-in.club](https://look-in.club).
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js).

## Disclaimer

This project is not affiliated with, endorsed by or connected to LOOKin.
LOOKin is a trademark of its owner.

## License

[Apache License 2.0](LICENSE).
