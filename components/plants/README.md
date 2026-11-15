# plants: field notes

Choose among native Bluetooth, a dedicated proxy, or decoded ESPHome
measurements with per-plant `sources` and `active_source`. The stable
measurements and reading age are opt-in. See the
[standalone example](../../examples/standalone-tablet/) and
[history migration](UPGRADE.md).

What a home needs to know beyond `component.yaml`.

- **Reach.** Mi Flora sensors use the host Bluetooth receiver or a proxy (core `xiaomi_ble`). Sensors heard
  only at −92 to −100 dBm were unreliable. Check reception before deciding where a receiver is needed.
  An ESPSomfy-RTS board cannot be that proxy (see [awnings](../awnings/README.md)).
- **Thresholds per species** come from the Flower Care app's plant database, or from how the plant
  is looked after; they go into the inputs (rendered into `plant:`), and a change needs a Home
  Assistant restart.
- The sensors needed no firmware update out of the box.

## Hydroculture: what the sensor can and cannot tell

Many houseplants, in Switzerland and Germany especially, grow in **hydroculture** (*Hydrokultur*):
no soil, clay pebbles (LECA) in an inner pot, a reservoir of water with nutrient solution at the
bottom, and a float gauge (*Wasserstandsanzeiger*) showing the water level. Ask for every plant,
before adding it: soil or hydroculture? The pots look alike from a distance; the pebbles and the
gauge give it away.

| reading | in hydroculture | why |
|---|---|---|
| light | valid | measured by the sensor's head, above the pot; the pot's contents do not matter |
| temperature | valid | the same |
| moisture | **not meaningful** | the prongs (about 5 cm) reach only the pebbles above the reservoir, mostly air: they read 0 to 10 % however much water the pot holds, and do not rise when it is filled |
| conductivity (fertility) | **not meaningful** | it measures the salts in moist soil between the prongs; dry pebbles conduct nothing (0 µS/cm), and its scale is made for soil, not for a nutrient solution |

Pushing the sensor deeper does not help: the head is not made to sit in wet pebbles, and the
reservoir is below the prongs' reach anyway. **The float gauge is the watering signal.**

What a home does: give the plant `medium: hydroculture` (SPEC-048). It is then judged on light and
temperature only: its `plant:` entry gets no moisture or conductivity sensor or band, it has no
"last watered", "water in" or moisture statistics, the watering push leaves it out, and the Ramka
and Pocket show it as "watered by the gauge" instead of a plant with missing readings. A moisture
or conductivity band on such a plant fails the render. The raw readings stay in Home Assistant
(and, with `sources`, in `sensor.<plant>_reading_*`), so switching back to soil needs no new
binding. Before this setting a home set `min_moisture: 0` and `min_conductivity: 0`; replace both
with `medium: hydroculture` (UPGRADE.md).

Tell the owner why, in these words or similar: *"In hydroculture the sensor only sees the dry
pebbles at the top, so its moisture and fertility numbers stay near zero whatever the water level.
We keep its light and temperature, which are real, and you water by the float gauge as before."*

- **A new sensor in a hydroculture pot may never trigger the new-sensor push**: that push waits for
  moisture above 0 %, and the pebbles may read 0. Find the sensor by its discovery name instead.
- Light is where the sensor earns its place in these pots: hydroculture plants are often placed
  deep in a room, and the 24-hour light peak shows whether the spot is bright enough.

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

First ask whether the plant grows in soil or in hydroculture (see above): in hydroculture only light
and temperature mean anything, and step 4 gives it `medium: hydroculture`.

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
   `medium: hydroculture` for a plant in pebbles (above).
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
