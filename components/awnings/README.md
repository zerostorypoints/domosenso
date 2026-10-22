# awnings: field notes

What a home needs to know beyond `component.yaml`. Tested with ESPSomfy-RTS 2.4.6 on an Atom Lite
with a CC1101 module.

## The node

- **The firmware prints the Wi-Fi passphrase on the serial console at boot.** Never paste a boot
  log into an issue, a chat or a commit.
- Its own Home Assistant discovery is rejected by Home Assistant ("A device can not be its own via
  device"); switch it off on the node. The component's package declares the covers against the
  node's MQTT topics instead.
- Somfy RTS is one-way: the awnings report nothing, and positions are computed from travel times.
  The default is 10 s; measure each awning's extend and retract time and set it on the node, or
  the positions are wrong. The node listens to the Telis handsets, so Home Assistant follows manual
  use.
- The board runs ESPSomfy-RTS, not ESPHome, so it is no Bluetooth proxy.

## The wind sensor

- It reports about every 19.5 minutes, day and night (60 reports in 7 days in one home), plus an
  alarm on wind. The awnings retract on the alarm by themselves; Home Assistant only watches.
- **Reception decides how often the node hears it.** At −83 to −86 dBm, with corrupted frames
  carrying random addresses, the node heard only part of the reports: gaps of 4 to 36 hours with the
  sensor working. An alert "sensor silent" therefore needs a long window (the first home uses
  72 hours) or better reception (the node or its antenna closer to the sensor).
- To tell radio from software when it goes quiet: a websocket listener of your own on the node
  that receives no frame means the node hears nothing. A client that keeps the node's websocket
  open should send pings; without them it can sit on a dead connection.

## The frame bridge (`services/frame-bridge/`)

- **Why it exists.** The node offers received RTS frames only on its websocket. Over MQTT it publishes
  a shade's wind flag only when the flag changes, so a missed all-clear leaves it set for good, and
  it retains shade positions only at boot, so after a Home Assistant restart the covers came back
  with the boot-time position. The bridge republishes every frame, the wind sensor's state per frame
  and each position retained (topics in `component.yaml`).
- **Start it** next to the broker: copy `bridge.env.example` to `bridge.env`, fill in the node's
  websocket, the broker and the wind sensor's RTS address, then `docker compose up -d --build`. The
  frames also go to `./data/frames.jsonl`, the first place to look when the sensor seems silent.
- The wind sensor's state is `unknown` after a Home Assistant restart until its next frame.
- The bridge pings the websocket every 20 s; without pings it sat on a dead connection after the
  node rebooted.

## The package (0.2.0)

- **Cover ids** come from the names (`Awning Living room` → `cover.awning_living_room`); set
  `entity_id` on a cover to keep an id the name would not give. Every `unique_id` starts with
  `node_id`, so keep the one a home already has.
- **Sunset:** each awning that is not reported closed retracts, one radio command every 3 s. A start
  between sunset and sunrise does the same after a minute, because a restart over sunset loses the
  sun trigger.
- **Silent automations** (for a home's `domosenso/silent.yaml`): `automation.awnings_wind_sensor_heard`
  (`loaded_on`, `triggered_within` longer than the longest gap the node shows, 48 h in the first
  home) and `automation.awnings_wind_sensor_silent` (`loaded_on`).
