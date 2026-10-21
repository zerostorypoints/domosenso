# bermuda-presence: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.

## 0.2.0 (2026-10-21): the instance file comes from a template

New artifact `templates/instance/packages/bermuda_presence.yaml.j2`: `domosenso add` writes
`packages/bermuda_presence.yaml` once from the inputs (one presence sensor per room, the
proxy-offline automation, both blueprint instances). New optional input `room_ids`. Blueprints,
ESPHome packages and every entity id are unchanged.

### What a home does

- A home that wrote its instance file by hand from 0.1.0 keeps it: it is the home's file.
- ESPHome device files may stay on `@bermuda-presence/0.1.0`: the packages did not change. The
  factory image's `package_import_url` and the demo home's device files now name `0.2.0`.
- A home that has its own presence or proxy-offline package: let `domosenso add` write the instance,
  set `room_ids` for any room whose current `unique_id` is not `presence_<area slugified>`, then
  remove the own package. Its `unique_id`s and the automation id `ble_proxy_offline_alert` must be
  the ones the instance writes, or the registry gives the entities new ids.
