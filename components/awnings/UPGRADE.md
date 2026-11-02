# awnings: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.


## 0.3.0 (unreleased): component-backed assistant answers

Adds the optional version 1 assistant definition and private source bindings (SPEC-029).
Existing entities, helper values, dashboard preferences and automation actions are preserved.
The component's metadata alone does not grant the Frame app access to its data.

### What a home does

Upgrade DomoSenso tooling to a revision supporting assistant metadata **before** updating this
component; old tooling cannot install its bindings template correctly. After this version is
released, run `domosenso update awnings --to 0.3.0` and review the normal staging/deployment plan.
Deploy the generated `domosenso/assistant/awnings.yaml` alongside the matching inventory.
With a compatible Frame bridge, reload metadata, choose the frame in **Assistant sources**,
review the proposed sources and save the selection. Existing supported answers do not require
another APK just to change labels or thresholds. New answer types require a compatible app.

No automatic exposure or control is added. Missing metadata, permissions, fresh observations or
assessment rules produce qualified/unavailable answers. Keep old tooling and component versions
together when reverting. See [shared setup and limitations](../../docs/ASSISTANT.md).

## 0.2.1 (2026-10-27): the services say what they are

`artifacts.services` is typed (SPEC-015): the node's firmware with its release file and flash
command, the frame bridge as a container built on the host. `domosenso add` copies the bridge's
files into the home at `services/frame-bridge/`; `domosenso status` lists the firmware and the
bridge as manual. The README has the flashing steps. No package, input or entity changed.

### What a home does

- Nothing. A home that runs the bridge from its own copy keeps it.

## 0.2.0 (2026-10-21): the package and the frame bridge

New artifact `templates/package.yaml.j2` → `packages/awnings.yaml` (MQTT covers, the wind sensor,
the sunset retract, the wind sensor watch) and the frame bridge under `services/frame-bridge/`
(compose). `artifacts.home_provides` is gone: the component declares the covers now. New inputs:
`node_id` (required by the package), `node`, `wind_name`, `wind_off_delay`, `wind_last_heard`,
`wind_silent_hours`, `wind_check_time`, `retract_at_sunset`, `notify`, and `entity_id` on a cover.
`wind_sensor` now names the entity the package declares.

### What a home does

- A home with its own awnings package: set `node_id` to the prefix of its covers' `unique_id`s, pin
  any cover or wind sensor id the names would not give (`entity_id`, `wind_sensor`), set
  `wind_last_heard` to its own helper, then remove the own package; Home Assistant refuses a second
  entity with a given `unique_id`.
- A running bridge built from an earlier copy keeps working. To move it to the catalog's: write
  `bridge.env` (the root topic is no longer fixed, `NODE_WS` and `MQTT_HOST` have no defaults, `TZ`
  moves from the image to the env file) and `docker compose up -d --build` in place of the old
  container.
