# SPEC-022: Plants display and onboarding (plants 0.3.0, ramka 0.7.0)

- Status: approved 2026-10-30 by the maintainer
- Source: the maintainer's design for a home going from 4 to 15 plant sensors (brainstorming and a
  trial on 2026-10-29/30; the design and its plan live in that home's repository). This spec
  restates the contract for any home; the examples are the demo home's.
- Decisions this spec adds to the design are marked **Decision**; inference is marked as such.

## Goal

A home with 1 to 50 plants gets:

1. a Ramka plants page readable from across the room at any count: up to `plants_per_page` plants
   (default 6) on one page with tiles growing to fill it; above that, pages that rotate, the plants
   needing something first, with a strip of one dot per plant;
2. a photo of each plant on its tile;
3. three soft states per plant (good, neutral, needs something) and never a red or alarm colour;
4. "watered N days ago" and "water in ~N days" per plant, from the moisture history;
5. a push when a new Mi Flora sensor is pushed into a pot, naming the sensor;
6. one list of plants: the Ramka finds the plants the `plants` component defines instead of
   listing them again.

**Amendment 1 (2026-10-30, the maintainer's request during the build):** plant names and rooms
in every Ramka language. A `name` or `label` may be a map per language; the first value is the
friendly name, `domosenso_room` and the derived sensors' names; the maps go on the plant as
`domosenso_names` / `domosenso_rooms`, and the card shows the dashboard's language, falling back to
the friendly name and the room. The card's actions, gauges and lines were already in en, de and pl.
The plants package's notifications stay in English (the renderer gives non-dashboard templates `en`).

**Amendment 2 (2026-10-31, approved by the maintainer from mockups; ramka 0.8.0):** after a day on
the tablet, with five plants the tiles had lost their bars and nothing showed every plant's sun,
fertiliser and water; and the initial on a plant without a photo ("P", "C") read as a code.

- A plant without a photo shows a leaf in its state's colour on a dim square, instead of its initial.
- **A list page** follows the tile pages: one row per plant, in the tiles' order, with its photo (or
  the leaf), its name, one line (the room, then the action or else the watered / water-in line; 2026-10-31: the room always), the
  three bars and the moisture line. Above it a header row: plant, sun, fertiliser, water, "last
  N days". At most `list_rows` rows a page (default 7); more plants make more list pages, the rows
  shared evenly between them (15 → 5, 5, 5). The list comes only with more than four plants: up to
  four, every tile already shows its bars.
- Card config: `list` (default `true`; `false` drops the list pages), `list_rows` (default 7).
  The Ramka's dashboard keeps the defaults; no new helper.
- **Decision:** the ambient stage counts the list pages: `pages = ceil(n / per_page) + (n > 4 ?
  ceil(n / list_rows) : 0)`, the stage still `min(pages, 2) × page_s`. With five plants that is the
  tiles and then the list, 20 s; with more, the pages continue on the next pass as before.

## Devices

Unchanged: Mi Flora (HHCCJCY01) through Bluetooth proxies. Verified on 2026-10-30 on one home with a
fresh sensor: an unplaced sensor reads 0 % moisture; pushed into soil it jumped 0 → 11 % in one
reading; a watering showed as 11 → 58 % within 18 s, draining to a settled 37–38 % within about
10 minutes. Readings change about every 1.3 minutes. A slow soak (a rise spread over ~2.5 h) was
seen once on another plant.

## Integrations

Unchanged: core `xiaomi_ble`, core `plant`, core `statistics`; `template` (core) for the derived
sensors. No HACS integration (the HACS plant integration was tried and its adoption deferred).

## Inputs

**plants 0.3.0**

| input | change |
|---|---|
| `plants[].photo` | new, optional: a URL path the browser loads, e.g. `/local/plants/monstera.jpg` (a file under the home's `www/`) |
| `plants[].name`, `plants[].label` | may also be a map per language, `{en: Basil, de: Basilikum, pl: Bazylia}` (amendment 1, below) |
| everything else | unchanged; `label` stays the room text shown on the tile |

**ramka 0.7.0**

| input | change |
|---|---|
| `plants` | type becomes `"list[{...as 0.6.0...}] \| discover"`: the list works as before; `discover` makes the card find every `plant.*` entity with the attribute `domosenso_plant: true` |
| `plant_defaults` | unchanged; used by the list form only (discover reads the bands from the plant) |
| `plants[].label` | may be a map per language, as in plants (amendment 1); each dashboard shows its language |

## Provides

**plants 0.3.0**, `<plant>` = object id of the plant's `entity`:

| id | level | note |
|---|---|---|
| attributes on `plant.<plant>` (via `homeassistant: customize:`): `domosenso_plant: true`, `domosenso_room` (the `label`), `domosenso_bands` (map: `min_moisture`, `max_moisture`, `min_conductivity`, `max_conductivity`, `min_brightness`, and `min_temperature`/`max_temperature` when set), `entity_picture` (when `photo` is given); `domosenso_names`, `domosenso_rooms` (the maps, when `name` or `label` is given per language) | stable | marker attributes, read by the Ramka |
| `sensor.<plant>_moisture_min_3h` | stable | statistics `value_min`, 3 h |
| `sensor.<plant>_moisture_change_48h` | stable | statistics `change_second` over 48 h (% per second; review fix: a history shorter than 48 h gives the true rate) |
| `sensor.<plant>_last_watered` | stable | timestamp; a rise of ≥ 10 points between two readings, or ≥ 10 points above the 3-hour minimum (at most once per 3 h); the first reading after a start is never a watering |
| `sensor.<plant>_water_in_days` | stable | whole days ≥ 0 until moisture reaches `min_moisture` at the last 48 h's rate; unknown when watered less than 48 h ago or not drying; unavailable when the moisture sensor is |
| `sensor.plants_unplaced_in_soil` | stable | count of Xiaomi BLE moisture sensors not used by a plant reading > 0 %; attribute `sensors`: list of `{entity, device, value}`; rebuilt every minute and at a start (`integration_entities()` registers no listener) |
| `automation.plant_sensor_new` (unique_id `plants_sensor_new`) | stable | push to `notify` and a persistent notification when a sensor joins that list |

**ramka 0.7.0**, `<prefix>` = the `prefix` input, only when `plants` is given:

| id | level | note |
|---|---|---|
| `input_number.<prefix>_plants_per_page` | stable | 1–12, default 6; Plants settings page, Advanced; in the page's and the global reset |
| `input_number.<prefix>_plants_page_s` | stable | 5–30 s, default 10; same place |
| `custom:plants-card` config `discover`, `per_page`, `page_s` (entity id or number) | stable | |
| `custom:plants-card` config `list` (boolean), `list_rows` (number) | stable | ramka 0.8.0, amendment 2 |

**Decision:** the plants stage of the ambient loop lasts `min(pages, 2) × page_s`, with `pages =
ceil(plants / per_page)`; the card advances its own page every `page_s` while shown and keeps the
index in the browser (`localStorage`), so the next pass continues where the last stopped and wraps to
page 1. With no plants found the stage lasts 1 s (review fix: 0 s would spin a rotation of plants alone).

**Decision:** state colours good `#5be37a`, neutral `#9aa0a6`, needs something `#f5b942`; the card's
red `#ff6b5c` for "water" goes. Neutral = in range but `water_in_days` ≤ 3, or no reading.

Consumes (ramka, discover): the plants component's attributes and `sensor.<plant>_last_watered` /
`_water_in_days` when they exist (a hand-made plant with the same attributes works too).

## Artifacts and ownership

Unchanged files, both components: managed (rendered `packages/plants.yaml`, `packages/<prefix>.yaml`,
the dashboards, the cards under `www/domosenso/ramka/<version>/`). Photos are the home's own files
(local layer); the catalog ships none.

## Compatibility

- plants 0.2.0 → 0.3.0: additive. New entities and attributes appear after the restart; nothing to
  change. Statistics sensors start empty: `water_in_days` stays unknown for 48 h.
- ramka 0.6.0 → 0.7.0: a home keeping its `plants` list sees the new tiles, states and paging with
  no inputs change. Switching to `plants: discover` needs plants 0.3.0 deployed first (else the page
  shows "no plants"); the home then drops its Ramka plant list. The two new helpers are created and
  seeded at the restart.
- `UPGRADE.md` entries in both components.

## Tests

- pytest: `tests/test_plants_render.py` (attributes, derived sensors, start guard, unplaced list),
  `tests/test_ramka_render.py` (discover rendering, helpers, stage length, list form unchanged).
- `node --test`: `plants-card.test.mjs` (discover, photo and placeholder, states and colours, 1/≤4/≤6
  layouts, paging and strip for 15 and 50, timer and stored index, clamp, derived lines, no plants,
  unavailable sensor), `no-literals.test.mjs`.
- `catalog_check --strict`; `ha-check plants`, `ha-check ramka`, and `ha-check ramka` with
  `tests/fixtures/ramka-plants-discover.yaml`.
- Staging of the home that asked: a simulated watering (posted states), a restart, 15 plants paged.

## Out of scope

Onboarding from the phone without a deploy (plants stay in YAML); limits by species
(OpenPlantbook); the HACS plant integration; photo upload; species recognition.

## Open questions

- The 48-hour window for "water in" and the ≥ 10-point rule come from one home's histories
  (four plants, 14 days, plus one sensor on 2026-10-30): verified there, inference elsewhere.
- Whether `integration_entities('xiaomi_ble')` lists the moisture sensors of every Mi Flora model
  (verified for HHCCJCY01 only).
