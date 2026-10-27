# bermuda-presence: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.

## 0.2.1 (2026-10-27): `add` writes the ESPHome device files

New `artifacts.esphome.devices` (SPEC-015): `domosenso add` writes one thin device file per item of
`proxies` into the home's esphome_dir, `ble-proxy-<room>.yaml`, once; the home owns it. New
`artifacts.esphome.secrets`: `domosenso status` prints `esphome-secret <key> missing` for a key the
home's `esphome/secrets.yaml` lacks. The device files no longer repeat `bssid_name`, which is the
package's default. Packages, blueprints, the instance template and every entity id are unchanged.

### What a home does

- Nothing. Device files a home already has stay as they are, on whichever tag they name (the
  packages did not change since 0.1.0). The factory image's `package_import_url` and the demo home's
  device files now name `0.2.1`.

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
