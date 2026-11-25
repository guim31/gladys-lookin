# LOOKin

Control your infrared appliances from Gladys through a
[LOOKin Remote2](https://look-in.club) universal remote, over your local
network: TV, media players, lights, fans, purifiers and air conditioners saved
in the LOOKin app, plus the temperature and humidity of its sensor. No account
and no cloud: Gladys talks to the LOOKin directly, on your Wi-Fi.

> **Developed without the hardware: feedback welcome.** This integration was
> built and tested against the answers of the LOOKin local API recorded by the
> aiolookin project, and against a simulated LOOKin, not against a real one. If
> something does not work as described, please say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-lookin/issues).

## What you need

- Gladys Assistant 5.2.0 or later.
- A LOOKin Remote2 set up in the **LOOKin app**, on the same network as Gladys.
- Your appliances saved as remotes in the LOOKin app (that is where the
  infrared codes are learned or chosen).
- Nothing else: no account, no key, no internet access.

## Set up

1. Install the integration from the Gladys catalog.
2. Open its **Configuration**. Nothing is required; the options are:
   - **IP addresses of the LOOKin Remotes**: only if automatic discovery does
     not find one (another network, mDNS blocked). Give it a fixed address in
     your router.
   - **Refresh interval**: how often each LOOKin is read (30 seconds by
     default).
   - **Language of the device names**: names of the new devices and features.
3. Open the **Discovery** tab: the LOOKin and every remote saved in the LOOKin
   app appear. Add the ones you want.
4. The **Search for LOOKin Remotes** action of the configuration screen looks
   for them again and lists what was found.

## The Gladys devices

**The LOOKin itself** (Remote2): **Temperature** and **Humidity** of its
sensor.

**One device per remote** saved in the LOOKin app, named as in the app:

| Remote                                       | Features                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| TV, Media                                    | **On/off**, push buttons: **Volume up**, Volume down, Mute, Channel up, Channel down, **Source**, Menu |
| Light, Fan, Humidifier, Air purifier, Vacuum | **On/off**, and a push button for each other button (Speed, Swing, Mode…)                              |
| Air conditioner (LOOKin "AC" protocol)       | **On/off**, **Mode**, **Target temperature** (16 to 30 °C), **Fan speed**, **Swing**                   |

Only the buttons the remote has in the LOOKin app are created.

- Infrared is one-way: the LOOKin cannot read the appliance back. The on/off
  state is the one the LOOKin remembers, from its own commands and from the
  presses of the original remote it hears.
- With separate "on" and "off" buttons, each is sent as asked. With a single
  power button, it is pressed only when the state the LOOKin knows differs.
- Air conditioner: the whole state is sent at once, like the original remote.
  Choosing a mode switches the unit on; the temperature, fan and swing of a
  stopped unit are kept for when it is switched on, in its last mode.

## Dashboard widget

The **LOOKin remote** widget puts a remote on the dashboard: its state, the
room temperature of the LOOKin, and up to four buttons chosen in its settings
among those the remote has (on/off, volume, mute, channel, mode, menu, speed,
swing; for an air conditioner: on/off and setpoint −1 / +1 °C).

## Scenes

### Action: press a button

**Press a LOOKin remote button** sends one button of a remote saved in the
LOOKin app: power (toggle), power on, power off, mode or source, mute, volume,
channel, swing, speed, cursor, menu. Use it for the buttons that have no
feature of their own, or to chain several presses.

### Action: send an IR code

**Send an IR code with LOOKin** sends a raw code (durations in microseconds,
`9000 -4500 560 -560 …`) or a Pronto HEX code (`0000 006D 0022 0002 …`)
through a LOOKin, for an appliance without a saved remote. Choose the LOOKin
or any of its remotes.

### Scene ideas

- At sunset, switch the fan off and the light on.
- When the temperature of the LOOKin goes above 27 °C, set the air conditioner
  to cooling at 24 °C.
- When you leave home, switch the TV off (power off button, or the toggle).

A failed action (LOOKin not answering, button missing, invalid code) stops with
a message in red.

## Troubleshooting

- **No LOOKin found**: check that it is on the same network as Gladys, then
  enter its IP address in the configuration. Automatic discovery uses the
  network discovery of Gladys 5.2 (mDNS and UDP port 61201).
- **A remote is missing**: save it in the LOOKin app first; it appears at the
  next refresh.
- **The state is wrong**: the appliance was switched with a remote the LOOKin
  did not hear. With separate on and off buttons, send the state again from
  Gladys; with a single power button, press the appliance's own button out of
  the LOOKin's sight, so both agree again.

## Limits

- The LOOKin announces its changes by UDP broadcast, which does not reach the
  integration's container: they are read every refresh interval instead.
- No learning of new codes: learn or choose them in the LOOKin app.
- Air conditioner temperatures in °C, from 16 to 30, as the LOOKin protocol.
- Not affiliated with LOOKin.
