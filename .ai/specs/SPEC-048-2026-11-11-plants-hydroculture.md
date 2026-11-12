# SPEC-048 — Plants in hydroculture

**Status:** draft, 2026-11-11

**Source:** the first home with six Mi Flora sensors (2026-11-11): four of its plants grow in
hydroculture and read 0 to 9 % moisture and 0 µS/cm conductivity, which the package took for six
thirsty plants. The field notes (`components/plants/README.md`, "Hydroculture") and the
`add-component` skill already explain it and give the workaround (both lower limits 0); this spec
makes it a property of the plant.

## Goal

A home marks a plant as grown in hydroculture (clay pebbles over a water reservoir with a float
gauge, common in Swiss and German homes). Such a plant is judged on light and temperature only; it
gets no watering push and no watering figures; the Ramka and Pocket show it as a hydroculture plant
watered by its float gauge, not as a plant with missing readings.

Placement test: Home Assistant's plant integration takes any subset of sensors, but nothing tells a
dashboard why a plant has no moisture, and the package's watering sensors and reminder assume soil.
A second home needs it (hydroculture is a common way of keeping houseplants): it belongs in the
component.

## Devices and integrations

No change: Mi Flora (HHCCJCY01) through `xiaomi_ble`, any of SPEC-041's sources. Verified on the
first home: light and temperature read sensibly in pebbles; moisture and conductivity read near 0
whatever the reservoir holds. Inference (not measured): a sensor pushed to the bottom of a
hydroculture pot would read the reservoir, but the sensor's head is not made to sit in wet pebbles,
so the catalog does not suggest it.

## Inputs

One new optional key per plant:

| key | type | default | example |
|---|---|---|---|
| `plants[].medium` | `soil \| hydroculture` | `soil` | `{entity: plant.ficus, label: Living room, medium: hydroculture}` |

A hydroculture plant still names a sensor (or `sources`) with all four readings, so a home can
change its mind without rebinding, and the raw readings stay recorded. Its `min_moisture`,
`max_moisture`, `min_conductivity` and `max_conductivity` are refused (`render` fails with the
reason): they would mean nothing.

## Provides

For a hydroculture plant:

- `plant.<plant>`: the `plant:` entry gets only `brightness` and `temperature` sensors and no
  moisture or conductivity band; its state follows light and temperature.
- New attribute `domosenso_medium: hydroculture` on the plant (absent for soil): ADDITIVE-ONLY.
  `domosenso_bands` carries no moisture or conductivity keys for it.
- Not rendered for it: `sensor.<plant>_{moisture_min_3h,moisture_change_48h,last_watered,water_in_days}`;
  it is left out of `automation.plants_need_water`.
- Kept: `sensor.<plant>_illuminance_max_24h`, `sensor.<plant>_reading_*` (SPEC-041) with the raw
  readings, the silent-sensor push (it follows the sensor, not the medium), and its moisture entity
  counts as known for `sensor.plants_unplaced_in_soil`.

Soil plants: unchanged.

## Consumers

- **Ramka `plants-card`**: for `domosenso_medium: hydroculture`, no moisture line, no "water" or
  "watered / water in" text; the tile shows "Hydroculture: water by the gauge" (`card.plants.*`
  key, en/de/pl) and ranks by light and temperature. A list-mode `plants:` input gains the same
  optional `medium` (ADDITIVE-ONLY).
- **Pocket plants page** (`lib/plants.js`): moisture and conductivity left out of the readings and
  of the rank; the detail sheet says why in one line (`card.pocket.plants.hydroculture`); such a
  plant never ranks as "no reading".
- **Assistant bindings**: a hydroculture plant answers no watering question ("qualified": it is
  watered by its gauge).

## Artifacts and ownership

`templates/package.yaml.j2`, `_plant-rows.jinja`, `assistant-bindings.yaml.j2` (managed); Ramka
and Pocket cards (managed); translations; README and UPGRADE (catalog). No instance or local file.

## Compatibility

Additive: a plant without `medium` renders exactly as before (render tests compare). A home on the
workaround (both lower limits 0) moves by replacing the limits with `medium: hydroculture`; its
`plant.*` id and recorder history stay. UPGRADE.md entry under the next plants version, which the
maintainers choose; Ramka and Pocket versions likewise. Older cards ignore the attribute and show
the raw readings without bands: no wrong advice, since the plant entity carries no moisture band.

## Tests

- `tests/test_plants_render.py`: a hydroculture plant renders no moisture sensors in `plant:`, no
  watering sensors, stays out of the reminder, carries `domosenso_medium`; moisture bands with
  `medium: hydroculture` fail render; a plant without `medium` renders byte-identical.
- `plants-card.test.mjs`, `plants.test.mjs`: hydroculture tile and rank; a soil plant unchanged.
- `catalog_check --strict`, `tools/ha-check.sh plants`, `tools/check-all.sh`.
- Staging on the first home (four hydroculture plants, two in soil).

## Out of scope; open questions

- **A water-level reading for hydroculture** (a float switch, a time-of-flight sensor over the
  gauge, a scale under the pot): no off-the-shelf Home Assistant device is known to the catalog
  (inference, not a full market sweep). A later spec may add `water_level: <entity>` per plant once
  a device is tested.
- Semi-hydro mixes (pon, Seramis in a pot with soil below): treated as soil until a home reports
  otherwise.
