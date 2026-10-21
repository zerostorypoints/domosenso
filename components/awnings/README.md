# awnings: field notes

What a home needs to know beyond `component.yaml`. Tested with ESPSomfy-RTS 2.4.6 on an Atom Lite
with a CC1101 module.

## The node

- **The firmware prints the Wi-Fi passphrase on the serial console at boot.** Never paste a boot
  log into an issue, a chat or a commit.
- Its own Home Assistant discovery is rejected by Home Assistant ("A device can not be its own via
  device"); the home declares the covers against the node's MQTT topics instead.
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
