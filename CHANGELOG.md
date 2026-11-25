# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-25

### Added

- LOOKin Remote2 universal infrared remotes on the local network, found
  automatically (mDNS and the LOOKin UDP discovery, through Gladys 5.2) or by
  IP address.
- The temperature and humidity of the LOOKin sensor.
- One device per remote saved in the LOOKin app: on/off and a push button per
  button for TVs, media players, lights, fans, humidifiers, purifiers and
  vacuums; on/off, mode, target temperature, fan speed and swing for air
  conditioners (LOOKin "AC" protocol).
- States changed with the original remotes followed at the refresh interval
  (30 seconds by default).
- Scene actions: press a button of a LOOKin remote, send a raw or Pronto HEX
  IR code.
- Dashboard widget: a LOOKin remote with its state, the room temperature and
  up to four buttons.
- English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-lookin/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-lookin/releases/tag/v1.0.0
