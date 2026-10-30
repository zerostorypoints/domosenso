# plants: field notes

What a home needs to know beyond `component.yaml`.

- **Reach.** Mi Flora sensors talk Bluetooth through the proxies (core `xiaomi_ble`). Sensors heard
  only at −92 to −100 dBm by a proxy two rooms away were unreliable; give the room its own proxy.
  An ESPSomfy-RTS board cannot be that proxy (see [awnings](../awnings/README.md)).
- **Thresholds per species** come from the Flower Care app's plant database, or from how the plant
  is looked after; they go into the inputs (rendered into `plant:`), and a change needs a Home
  Assistant restart.
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

## Adding a plant (0.3.0)

No app is needed: Home Assistant tells which sensor went into which pot.

1. **Pull the battery tab and keep the sensor in the hand.** Within about a minute Home Assistant
   shows a Xiaomi BLE discovery, "Plant Sensor XXXX (HHCCJCY01)", under Settings → Devices &
   services. Confirm it. Out of soil it reads 0 % moisture.
2. **Push it into the pot.** The first reading above 0 % puts it on `sensor.plants_unplaced_in_soil`,
   and `automation.plant_sensor_new` pushes "New plant sensor in a pot: Plant Sensor XXXX: 11 %" to
   `notify`. With several sensors waiting, push them in one at a time. Take a photo of the plant.
3. **Rename** the device to the plant's name, set its area, and rename its entities to
   `sensor.<plant>_{moisture,conductivity,illuminance,temperature,battery}`. The conductivity entity
   appears a few minutes after the others: rename once it is there.
4. **Add the plant to the inputs**: `entity`, `label` (the room), `name`, `photo` (a file under the
   home's `www/`, about 800 px on the long side, served as `/local/...`) and any band of its own.
   `name` and `label` may be given per language, `{en: Basil, de: Basilikum, pl: Bazylia}`: the
   first is Home Assistant's name, and each Ramka dashboard shows its own language. Render, deploy,
   restart; the push stops for that sensor because it is no longer unplaced.

## What the Ramka reads (0.3.0)

- **On each plant** (`homeassistant: customize:`): `domosenso_plant: true`, `domosenso_room`,
  `domosenso_bands` (the limits the plant integration does not expose), `entity_picture` with a
  photo, and `domosenso_names` / `domosenso_rooms` when given per language. The Ramka's
  `plants: discover` finds the plants by the first.
- **Last watered** (`sensor.<plant>_last_watered`): a rise of 10 points between two readings, or 10
  above the lowest of the last 3 hours (a watering that soaks in slowly). A watering shows within a
  minute; the first reading after a start never counts.
- **Water in** (`sensor.<plant>_water_in_days`): whole days until `min_moisture` at the last 48
  hours' rate. Unknown for 48 hours after a watering (the rate would include it; the first reading
  after one also overshoots, free water draining for about 10 minutes) and while the soil is not
  drying. The rate is the change per second over the readings of the last 48 hours, loaded from the
  recorder at a start.
- **Silent automations** add `automation.plant_sensor_new` (`loaded_on`): it fires only when a new
  sensor goes into soil.
