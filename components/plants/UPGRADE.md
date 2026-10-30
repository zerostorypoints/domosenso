# plants: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.

## 0.3.0 (2026-10-30): what the Ramka needs, last watered, water in, a new sensor in a pot

SPEC-022. Additive: new optional plant keys `photo`, and `name` / `label` per language; the
attributes `domosenso_plant`, `domosenso_room`, `domosenso_bands`, `entity_picture`,
`domosenso_names`, `domosenso_rooms` on each plant; the sensors
`sensor.<plant>_{moisture_min_3h,moisture_change_48h,last_watered,water_in_days}` and
`sensor.plants_unplaced_in_soil`; the automation `automation.plant_sensor_new`.

### What a home does

`domosenso update plants`, a deploy and its restart. Optionally a `photo` per plant (files under the
home's `www/`, listed in `local:`), and names or rooms per language. The 48-hour statistics load the
recorder's history at the start, so `water_in_days` has a value at once unless a watering was less
than 48 hours ago. A sensor already in soil that no plant uses shows on
`sensor.plants_unplaced_in_soil` without a push (none at a start); add it to the inputs.

## 0.2.0 (2026-10-21): a package with the plants, their light peak and two alerts

New artifact `templates/package.yaml.j2` → `packages/plants.yaml`: the `plant:` entities with their
thresholds, a 24-hour light peak per plant, the water reminder and the silent-sensor alert. New
inputs: `notify` (required by the package), `notify_from`, `notify_until`, `dry_for`, `silent_hours`
and the plant keys `name`, `sensors`, `min_temperature`, `max_temperature`, `check_days`.

### What a home does

- Nothing, unless it wants the package: then `domosenso add plants@0.2.0` (or `update`), set
  `notify`, and remove any own `plant:` entries and statistics sensors with the same ids: two `plant:`
  keys of the same name do not load, and Home Assistant refuses a second entity with a given
  `unique_id`.
