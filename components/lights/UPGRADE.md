# lights: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.

## 0.2.0 (2026-10-21): a package with room lights that follow the bulbs

New artifact `templates/package.yaml.j2` → `packages/lights.yaml`; new optional inputs `rooms` and
`battery_sensors`; new entities (`provides` in `component.yaml`). Nothing that existed changes.

### What a home does

- Nothing, unless it wants the package: then `domosenso add lights@0.2.0` (or `update`), list its
  Hue room groups in `rooms` (with `id` where the current `unique_id` is not `room_<group object id>`),
  and remove its own template lights and sensors with the same `unique_id`s: Home Assistant refuses a
  second entity with a given `unique_id`.
