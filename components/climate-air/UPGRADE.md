# climate-air: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.


## 0.3.0 (unreleased): comfort and air thresholds

New helpers, flags and `sensor.climate_attention` (`provides` in `component.yaml`, feature
`thresholds`), plus `script.climate_air_thresholds_reset`. They appear once the home names
`home_inputs`; nothing changes otherwise.

### What a home does

- Nothing, without `home_inputs`. With them, `render` and deploy: the seed automation sets each
  room's range once at start. Change `comfort_defaults` to move the starting range (it applies to
  rooms not yet seeded, or after the reset script).
- Remove or rename any own entities with the same ids (`binary_sensor.<room>_too_hot` and the
  like): if an entity already holds an id, Home Assistant gives the new one `..._2`
  (`default_entity_id` falls back), and anything reading the plain id reads the wrong entity.

## 0.3.0 (unreleased): component-backed assistant answers

Adds the optional version 1 assistant definition and private source bindings (SPEC-029).
Existing entities, helper values, dashboard preferences and automation actions are preserved.
The component's metadata alone does not grant the Frame app access to its data.

### What a home does

Upgrade DomoSenso tooling to a revision supporting assistant metadata **before** updating this
component; old tooling cannot install its bindings template correctly. After this version is
released, run `domosenso update climate-air --to 0.3.0` and review the normal staging/deployment plan.
Deploy the generated `domosenso/assistant/climate-air.yaml` alongside the matching inventory.
With a compatible Frame bridge, reload metadata, choose the frame in **Assistant sources**,
review the proposed sources and save the selection. Existing supported answers do not require
another APK just to change labels or thresholds. New answer types require a compatible app.

No automatic exposure or control is added. Missing metadata, permissions, fresh observations or
assessment rules produce qualified/unavailable answers. Keep old tooling and component versions
together when reverting. See [shared setup and limitations](../../docs/ASSISTANT.md).

## 0.2.0 (2026-10-21): a package with the whole home's figures

New artifact `templates/package.yaml.j2` → `packages/climate_air.yaml`; new optional inputs
`outside_weather`, `bathroom_humidity` and the room keys `indoor`, `bathroom`, `battery`; new
entities (`provides` in `component.yaml`). Nothing that existed changes.

### What a home does

- Nothing, unless it wants the package: then `domosenso add climate-air@0.2.0` (or `update`), set the
  inputs, and remove any own package that defines the same `unique_id`s (`climate_*`): Home
  Assistant refuses the second entity with a given `unique_id` ("ID ... already exists").
