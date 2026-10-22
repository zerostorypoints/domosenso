# plants: field notes

What a home needs to know beyond `component.yaml`.

- **Reach.** Mi Flora sensors talk Bluetooth through the proxies (core `xiaomi_ble`). Sensors heard
  only at −92 to −100 dBm by a proxy two rooms away were unreliable; give the room its own proxy.
  An ESPSomfy-RTS board cannot be that proxy (see [awnings](../awnings/README.md)).
- **Thresholds per species** come from the Flower Care app's plant database; they go into the inputs
  (rendered into `plant:`), and a change needs a Home Assistant restart.
- The sensors needed no firmware update out of the box.

## The package (0.2.0)

- **Sensor ids.** The package expects `sensor.<plant>_{moisture,conductivity,illuminance,temperature}`,
  `<plant>` being the object id of the plant's `entity`. Rename the discovered entities to that
  scheme (entity settings or the websocket API), or give the plant its own `sensors`.
- **Brightness is judged on a peak.** The plant integration compares `min_brightness` with the
  brightest reading of the last `check_days`, not the current one. Indoors, Flower Care's values
  (several thousand lx) leave nearly every plant on "brightness low" for good; peaks of 400-800 lx are
  normal in a living room, so a lower `min_brightness` makes the flag mean something.
- **No battery level.** Through the proxies the sensors report none, so the silent-sensor push is
  how a flat CR2032 or a pot out of range shows up.
- **One push a day per dry plant:** once when it dries out inside the notify window, and every
  morning at `notify_from` while it stays dry.
- **Silent automations** (for a home's `domosenso/silent.yaml`): `automation.plants_need_water` and
  `automation.plant_sensor_silent` (`loaded_on`).
