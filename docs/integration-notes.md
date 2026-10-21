# Integration notes: devices with no component yet

Gotchas met while adding these to a Home Assistant 2026.9 home. None is a catalog component; they
are material for one, and any home with the same device saves the time.

## Midea air conditioners (`midea_ac_lan`, custom)

- The login dialog's server defaults to 美的美居 (Meiju). An account from the MSmartHome app needs
  the server **SmartHome**; the wrong server answers "account or password was wrong" with correct
  credentials. The login is the e-mail under Profile → Account and Security in the app, not the
  user name or SmartHome ID on the profile screen.
- The entity id comes from the appliance code (`climate.<code>_climate`); rename it in the
  registry.
- The appliance confirms a command about a minute later; the service call itself reports nothing
  changed.
- On a portable split unit, `outdoor_ambient_temperature` is the air on the exhaust side, warmed by
  the unit itself: never an outside temperature.

## Nuki lock without a bridge

- Without a Nuki Bridge the core `nuki` integration does not apply; the lock speaks MQTT with Home
  Assistant discovery. That needs a broker: a Mosquitto container (host network, no anonymous
  login, one login per client), then the MQTT integration in the UI and MQTT switched on in the Nuki
  app.
- The lock goes offline while its battery pack charges (no power, no Wi-Fi).

## Tapo C225 camera

- The `tplink` integration cannot add it: the camera's TLS takes only ECDHE-RSA-AES-GCM ciphers and
  python-kasa 0.10.2 offers static RSA only (fixed on python-kasa master, #1654, still unreleased in
  2026-09). Use core ONVIF on port 2020 with the camera account set in the Tapo app.
- After a Home Assistant update, `pip show python-kasa` in the container tells whether the fix has
  arrived and the camera can move to `tplink`.

## TP-Link Deco mesh (`tplink_deco`, custom)

- The router's web API allows one admin session: every login ends the others (the integration, the
  app's web view, a script). Log in with the owner account; manager accounts are refused. It
  throttles after failed logins, so never retry in a loop, and never log in from parallel calls.
- The integration creates a tracker for every client ever seen (over a hundred in one home);
  disable all but the ones needed.
- Its client data has no signal strength, so it cannot place a device in a room; use Bluetooth
  presence ([bermuda-presence](../components/bermuda-presence/README.md)).
- The firmware offers an isolated guest network but no VLANs between local networks: isolating
  IoT devices that way cuts every local Home Assistant path. Real segmentation needs a
  VLAN-capable router with the mesh in access-point mode.

## Dreame vacuums (`dreame_vacuum`, custom)

- Login with a Dreamehome account needs the 2.x prerelease line; 1.x supports only a Xiaomi Home
  account.
- Every cleaning run leaves a persistent notification with a new id that nothing clears; see
  [home-assistant-notes.md](home-assistant-notes.md) for dismissing old ones.

## Miele (core `miele`)

- Discovered by zeroconf; the flow links the Miele account through Nabu Casa's account linking, no
  developer credentials needed.

## Shelly relays and meters

- Mains wiring in Switzerland: an owner-occupier may wire it under NIV Art. 16, and an inspection
  with a Sicherheitsnachweis follows once the installation is done.
- Shelly firmware can post its own alarms (voltage, power) to a Home Assistant webhook, which keeps
  them working without polling.
