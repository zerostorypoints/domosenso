# SPEC-004: `climate-air` 0.2.0 — derived climate sensors

Status: approved 2026-10-21 by the maintainer, as one batch (draft 2026-10-21).
Source: SPEC-002 §2.3 (row `climate-air`), plan Task 19; the maintainer's home climate package (read
2026-10-21).

## Goal

0.1.0 describes the room sensors and gives no artifacts. 0.2.0 adds a managed package with the
whole-home figures the maintainer's dashboards and the Ramka read: indoor mean / min / max
temperature, indoor mean / max humidity, outside temperature and humidity from a weather entity,
indoor-outdoor difference, the most humid room, the lowest sensor battery, and a "bathroom humidity
high" flag.

Stays local in that home: the air conditioner's condenser sensors, its heat-buildup flag and alert
(one home's device).

## Devices, integrations

Unchanged from 0.1.0 (Tapo sensors through a hub, optional Ruuvi Air). New core platforms used:
`group` (sensor), `template`. Optionally reads a `weather` entity (component `weather`).

## Inputs

Existing, unchanged in name, type and default: `climate`, `air`, `outside`. New, all optional:

| input | type | default | note |
|---|---|---|---|
| `climate[].indoor` | bool | `true` | key on each room: counts in the indoor figures (a glazed porch with open windows: `false`) |
| `climate[].bathroom` | bool | `false` | counts for the bathroom flag |
| `climate[].battery` | entity_id | absent | counts for the lowest battery |
| `outside_weather` | entity_id | absent | example `weather.forecast_home`; gives the two outside sensors |
| `bathroom_humidity` | int | `65` | % for 10 minutes turns the flag on, 5 minutes below turns it off |

The most humid room's state is the room's `label`, so a home sets the labels it wants to read.

## Provides (additive-only to the manifest; every id equals the maintainer's home today)

| entity | `unique_id` | stability |
|---|---|---|
| `sensor.indoor_temperature_average` | `climate_indoor_temperature_mean` | stable |
| `sensor.indoor_temperature_max` | `climate_indoor_temperature_max` | stable |
| `sensor.indoor_temperature_min` | `climate_indoor_temperature_min` | stable |
| `sensor.indoor_humidity_average` | `climate_indoor_humidity_mean` | stable |
| `sensor.indoor_humidity_max` | `climate_indoor_humidity_max` | stable |
| `sensor.outside_temperature` (with `outside_weather`) | `climate_outside_temperature` | stable |
| `sensor.outside_humidity` (with `outside_weather`) | `climate_outside_humidity` | stable |
| `sensor.indoor_outdoor_difference` | `climate_indoor_outdoor_difference` | stable |
| `sensor.most_humid_room` (a room label, `—` when none has a value) | `climate_most_humid_room` | additive-only |
| `sensor.lowest_sensor_battery` (with a `battery` on any room) | `climate_lowest_sensor_battery` | stable |
| `binary_sensor.bathroom_humidity_high` (with a bathroom) | `climate_bathroom_humidity_high` | stable |

Template entities carry `component: climate-air`; group sensors take no attributes. Ids come from the
fixed English names, so a fresh registry derives the same ids.

Consumes: `weather.<home>` from `weather` (only through the `outside_weather` input).
Silent automations: none (no automations).

## Artifacts and layers

- `templates/package.yaml.j2` → `packages/climate_air.yaml` (managed).
- `translations/*`: `meta.description` updated. No `ui.*` text.
- `README.md`: why a glazed room is left out of the indoor figures; long-term statistics come with
  `state_class: measurement`.

## Compatibility

Additive: new artifact, new optional inputs, new entities. 0.1.0 had no artifacts, so no home
renders anything today. The maintainer's home splits its local climate package: these sensors move to
the component, the condenser sensors and their alert stay in a smaller local file (Task 19 Step 3).
No `UPGRADE.md` entry needed (nothing breaks).

## Tests

`catalog_check --strict`; `tools/ha-check.sh climate-air` → `fresh: 0 errors` with demo-home inputs
(the demo home's rooms, one marked `bathroom`, one `indoor: false`, batteries on some); the staging
comparison of Task 19.

## Out of scope

Air-quality derived sensors, comfort indices, a climate dashboard.

## Open questions

None.
