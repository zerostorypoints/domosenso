# awnings: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.

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
