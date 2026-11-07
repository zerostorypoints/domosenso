# plants: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.


## 0.5.0 (unreleased): choose a source and retain plant history

The existing `sensors` binding still works. To opt in, add named `sources`
with all four entity IDs and set `active_source`. Keep the same `plant.*` ID
and remove the old `sensors` key for that plant. Back up HA and render with
the updated catalog. Each new `sensor.<plant>_reading_*` ID must be free
before adoption. Verify the sensors use those IDs after the HA restart.
Leave those IDs in place when changing providers or reverting a selection.

For an existing Ramka chart, record the original moisture statistics ID
and the time the stable series takes over. Add this optional input to the
plant, with the timestamp quoted and an explicit zone:

```yaml
legacy_moisture_history:
  statistic_id: sensor.fern_soil_moisture
  before: "2026-11-07T18:00:00Z"
```

Ramka 0.18.0 includes the older hourly points before the cutoff and the
stable series after it. The old raw histories stay in Recorder under their
original IDs and retention. Do not purge the original entities' history.
The derived watering statistics use the new stable series, so their
initial adoption needs new samples. Subsequent source changes keep the
same series. Check freshness, units and the plant's watering limits after
a source switch. To revert a switch, select the previous source and render
again. To revert the opt-in entirely, restore the old input and retain the
stable series in Recorder for later use.

See the [standalone tablet example](../../examples/standalone-tablet/).

## 0.4.0 (unreleased): component-backed assistant answers

Adds the optional version 1 assistant definition and private source bindings (SPEC-029).
Existing entities, helper values, dashboard preferences and automation actions are preserved.
The component's metadata alone does not grant the Frame app access to its data.

### What a home does

Upgrade DomoSenso tooling to a revision supporting assistant metadata **before** updating this
component; old tooling cannot install its bindings template correctly. After this version is
released, run `domosenso update plants --to 0.4.0` and review the normal staging/deployment plan.
Deploy the generated `domosenso/assistant/plants.yaml` alongside the matching inventory.
With a compatible Frame bridge, reload metadata, choose the frame in **Assistant sources**,
review the proposed sources and save the selection. Existing supported answers do not require
another APK just to change labels or thresholds. New answer types require a compatible app.

No automatic exposure or control is added. Missing metadata, permissions, fresh observations or
assessment rules produce qualified/unavailable answers. Keep old tooling and component versions
together when reverting. See [shared setup and limitations](../../docs/ASSISTANT.md).

## 0.3.1 (2026-10-30): water in and the new-sensor push work

Two fixes found on the first production home. `sensor.<plant>_moisture_change_48h` kept the
statistics default of 2 decimals, which rounded every drying rate (about -1e-5 %/s) to 0, so
`water_in_days` was never known; it now keeps 10. `automation.plant_sensor_new` used a `zip` filter
Home Assistant does not have and was disabled at the start; its message is now built with a loop.

### What a home does

`domosenso update plants` and a deploy.

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
