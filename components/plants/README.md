# plants: field notes

What a home needs to know beyond `component.yaml`.

- **Reach.** Mi Flora sensors talk Bluetooth through the proxies (core `xiaomi_ble`). Sensors heard
  only at −92 to −100 dBm by a proxy two rooms away were unreliable; give the room its own proxy.
  An ESPSomfy-RTS board cannot be that proxy (see [awnings](../awnings/README.md)).
- **Thresholds per species** come from the Flower Care app's plant database; they live in the
  home's YAML (`plant:`), and a change needs a Home Assistant restart.
- The sensors needed no firmware update out of the box.
