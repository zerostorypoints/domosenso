# bermuda-presence: field notes

What a home needs to know beyond `component.yaml`. Learned in the first home running the component
(2026-09 and 2026-10); the format itself is in [docs/pilot-bermuda-presence.md](../../docs/pilot-bermuda-presence.md).

## Bermuda

- Bermuda is a HACS integration. A home without HACS copies a release into `custom_components`
  by hand ([docs/home-assistant-notes.md](../../docs/home-assistant-notes.md) for a root-owned
  directory).
- **Exclude Bermuda's distance and RSSI sensors from the recorder.** In one home they were 88 % of
  the recorder's rows; excluding and purging them took the database from 1.2 GB to 188 MB.
- **Cover every room before calibrating.** Where a room has no proxy, Bermuda puts a device in the
  nearest room that has one, so a person sitting in an uncovered room shows up next door.

## Phones and tablets: the IRK

Apple devices rotate their Bluetooth address; Bermuda tracks them through the Private BLE Device
integration with each device's identity resolving key (IRK).

- For a device signed in to the same iCloud account as a Mac: Keychain Access → search the
  device's Bluetooth MAC → Show password → the `Remote IRK` value. This works only for that
  account's devices, and an iPad does not pair with a Mac.
- Otherwise a temporary ESPHome node that captures the key while the device pairs with it (a
  third-party package: audit it and pin it). The Heart Sensor profile worked for most iOS devices;
  one iPad paired only under the Keyboard profile.
- "Generate New MAC" on the capture node clears an iOS "Pairing Unsuccessful" cache. When the log
  stream missed a key, the last captured one is still in the node's IRK text sensor.
- Unpairing afterwards does not stop tracking: the IRK is the device's own key.

## What cannot be tracked

- **Garmin watches** do not advertise while connected to their phone (measured).
- **AirTags** cannot be told apart as one person's tag.

## Proxies

- The M5Stack Atom Lite is a classic ESP32 (Bluetooth 4.2): it does not receive extended
  advertising. A sensor that sends some data only that way loses it (the Ruuvi Air's PM1/PM4/PM10,
  see [climate-air](../climate-air/README.md)).
- A proxy's `*_wi_fi_signal` sensor shows weak spots in the Wi-Fi coverage; a proxy at −71 dBm was
  the one that dropped out in the first home.

## Radar (feature `radar`, HLK-LD2410C)

- The module as configured has no still detection within about 1.5 m. A person close to the
  screen keeps it on through movement only.
- Before tuning thresholds, read the gate energies with people where they normally sit. In the
  first home the gates covering the table read still energy far above the threshold, and the
  drop-outs came from the zones without still detection and from beyond the configured range, not
  from those gates.
- A device with a fan next to the module (an air-quality monitor) can show up as motion on the
  nearest gates: check gates 0 and 1 after placing one.

## The instance file (0.2.0)

- `domosenso add bermuda-presence` writes `packages/bermuda_presence.yaml` once; after that it is the
  home's file and the command does not touch it. Adding a room later means adding one more
  `use_blueprint` entry by hand (or rendering the template again into a scratch directory and copying
  the entry).
- Each sensor's `unique_id` is `presence_<id>`, where `<id>` is the area name slugified as Home
  Assistant does it (`Kids' room` → `kids_room`). A home moving from its own presence package keeps
  its ids by setting `room_ids` where they differ.
- Silent automation (for a home's `domosenso/silent.yaml`): `automation.ble_proxy_offline` (`loaded_on`).
