# Upgrade notes

Newest first. One entry per change to a surface in [COMPATIBILITY.md](COMPATIBILITY.md) that a home
has to act on; the steps are in the component's own `UPGRADE.md`.

## 2026-10-27: ramka 0.3.0, an optional status page

New optional input `status_page`; `false` leaves the status page out of the dashboard and the
rotation. Additive: a home needs no action ([components/ramka/UPGRADE.md](../components/ramka/UPGRADE.md)).

## 2026-10-27: services, firmware and ESPHome device files as data

`artifacts.services` items are typed (`container`, `firmware`) and `artifacts.esphome` gains `devices`
and `secrets` ([SPEC-015](../.ai/specs/SPEC-015-2026-10-27-add-component-end-to-end.md)). `add` writes
the ESPHome device files and copies a container service's files into the home once; `status` prints
`service`, `firmware` and `esphome-secret` lines. `bermuda-presence` 0.2.1 and `awnings` 0.2.1 use
them. Additive: a home needs no action ([bermuda-presence](../components/bermuda-presence/UPGRADE.md),
[awnings](../components/awnings/UPGRADE.md)).

## 2026-10-22: ramka 0.2.0, optional pages and a screen size

`climate`, `air`, `plants` and `photo_dir` become optional inputs, and a new optional input `screen` names the
tablet's CSS viewport; the renderer gains the global `fail(message)`. Additive: a home needs no
action ([components/ramka/UPGRADE.md](../components/ramka/UPGRADE.md)).

## 2026-10-21: the `domosenso` command and the home formats

New STABLE surfaces, no change to an existing one: the `domosenso` command lines and the output
lines agents parse, and the formats `domosenso.yaml`, `domosenso.lock`, `domosenso/equivalence.yaml`,
`domosenso/silent.yaml` and the snapshot file, each with a schema in `schemas/`
([COMPATIBILITY.md](COMPATIBILITY.md), "The `domosenso` command and a home repository").
`examples/home-template/AGENTS.md` is the `AGENTS.md` a home repository starts from. Homes need no
action; a home that renders by hand adopts the command with `domosenso adopt <id>@<version>`.

## 2026-10-21: stamp line names the tag

The first line of a rendered file changes from `# Rendered by Domosenso from <id>@<commit> — do not
edit` to `# Rendered by Domosenso from <id>/<version> (<commit>) — do not edit`, so it names the
tag the file was rendered from (`<commit>-dirty` inside the parentheses when the catalog had
uncommitted changes). The `domosenso` command reads both forms and writes the new one; the old tool
`tools/domosenso_render.py --stamp` still writes the old form. Homes need no action: the next
`domosenso render` rewrites the first line. The old form is read until the next minor version.

## 2026-10-21: remote package URL

The account in the remote package URL changes from `domosenso` to `zerostorypoints`, the account the
repository lives under: `github://domosenso/domosenso/components/<id>/<path>@<component>/<version>`
becomes `github://zerostorypoints/domosenso/components/<id>/<path>@<component>/<version>`, in device
files, `package_import_url` and blueprint `source_url`. The change comes before any home used the
URL, so no bridge is kept (the rule for components not yet used by another home, in
[COMPATIBILITY.md](COMPATIBILITY.md)). A device file that still uses the old form must be changed
to the new one.

## 2026-10-22: ramka 0.1.2

- **ramka 0.1.2** ([components/ramka/UPGRADE.md](../components/ramka/UPGRADE.md)): metadata only
  (`tested.homes`); nothing to do, a home may stay on 0.1.1.

## 2026-10-21: ramka 0.1.1

- **ramka 0.1.1** ([components/ramka/UPGRADE.md](../components/ramka/UPGRADE.md)): "Tomorrow" capitalised
  in en and de; the cards move to `www/domosenso/ramka/0.1.1/` and the twelve resource URLs change in
  place to `/local/domosenso/ramka/0.1.1/cards/<name>.js`.

## 2026-10-20: stage 1, the catalog

The first versions of the components, moved out of one home's configuration. No home ran a released
version before, so no bridge was kept: each rename below breaks a home that used the old name until
it follows the steps.

- **ramka 0.1.0** ([components/ramka/UPGRADE.md](../components/ramka/UPGRADE.md)):
  - helper option values are English: `input_select.<prefix>_mode` `kalendarz → calendar`;
    `input_select.<prefix>_ambient` `temperatury → climate`, `powietrze → air`, `rosliny → plants`,
    `zdjecia → photos` (`off`, `ambient`, `controls`, `status` unchanged);
  - the entity prefix is an input; entities renamed so that none names a player or a language
    (`binary_sensor.<prefix>_hegel_playing → binary_sensor.<prefix>_media_playing`,
    `input_text.ramka_zdjecie → input_text.<prefix>_photo`, `image.ramka → image.<prefix>_photo`,
    the shell commands `<prefix>_index` / `<prefix>_pick`);
  - package and dashboard are rendered from templates, one dashboard per language;
  - the cards install under `www/domosenso/ramka/0.1.0/` and each Lovelace resource's URL changes in
    place to `/local/domosenso/ramka/0.1.0/cards/<name>.js`;
  - restart Home Assistant rather than reloading the input_selects (a reload keeps a state that is
    no longer an option).
- **bermuda-presence 0.1.0** ([docs/pilot-bermuda-presence.md](pilot-bermuda-presence.md)): from the
  pilot. Device files pull the packages at the tag `bermuda-presence/0.1.0`; the room sensors and the
  offline alert are blueprint instances in the home's instance layer, with the entity ids
  `sensor.presence_<area slug>` and `automation.ble_proxy_offline` a home had before.
- **Every other component 0.1.0** (awnings, calendar, climate-air, lights, media, plants, weather):
  catalog entries describing what the Ramka reads; nothing for a home to change.
