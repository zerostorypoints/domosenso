# SPEC-022: Component inventory sensor and the Ramka settings' About page (ramka 0.7.0)

- Status: approved 2026-10-30 by the maintainer, in conversation
- Source: the maintainer, in conversation (2026-10-30): "in the Ramka Settings, provide the About
  view, which will list all the components' version and when it was last updated", built in the
  catalog so every home gets it. Two decisions taken in that conversation: the list comes from a
  sensor the `domosenso` command writes (not from Ramka's render), and "last updated" is the
  **catalog release date** of the version the home runs (the date of the commit its tag names).
- Touches: the `domosenso` command (render, add, adopt, update, deploy, status), the lock schema
  (one optional key), the renderer's template globals, `ramka` (a new settings page).
- Decisions this spec adds are marked **Decision**. Inference is marked as such.

## Goal

A home gets:

1. `sensor.domosenso_components`: every component the home runs, with its version, tag, short
   commit and catalog release date, live in Home Assistant, kept current by the `domosenso` command
   whenever the lock changes. Any card or automation can read it, not only the Ramka.
2. An **About** page in the Ramka settings dashboard (every language), last in the page list: a
   table Component · Version · Released, read live from that sensor, so it is right after any
   component's update, with no Ramka render.

The About page is read-only: no helper, no Basic/Advanced split, nothing for "Reset to defaults".

## The inventory

### Lock: `released` (new optional key, ADDITIVE-ONLY)

Per component in `domosenso.lock`: `released: <YYYY-MM-DD>`, the committer date (`git log -1
--format=%cs`) of the commit the tag resolves to. Written whenever the command sets an entry's
version and commit (`add`, `adopt`, `update`, `render`); `render` also fills it in for an entry
locked before this key existed (one lock change, then stable). `schemas/lock.schema.json` gains it as
optional; a lock without it stays valid.

**Decision:** the date is stored, not looked up at deploy, so the inventory is a pure function of the
home's files (`domosenso.lock` and `.domosenso/dev-render.json`) and `deploy`/`status` can check it
without opening the catalog.

A `--catalog-dev` render records `released` in its `dev-render.json` entry: the working tree's HEAD
commit date.

### The package: `<config_dir>/packages/domosenso.yaml` (managed, owned by the command)

Written by `add`, `adopt`, `render` and `update` after the lock (or `dev-render.json`) is saved,
whatever component they touched. Content, sorted by component id:

```yaml
# Rendered by Domosenso from domosenso.lock — do not edit
template:
  - sensor:
      - default_entity_id: sensor.domosenso_components
        unique_id: domosenso_components
        name: Domosenso components
        icon: mdi:package-variant-closed
        state: "3"
        attributes:
          component: domosenso
          components: >-
            {{ [{"id": "audio-sensor", "version": "0.2.0", "tag": "audio-sensor/0.2.0", "commit": "0f1f0a7d060e", "released": "2026-10-30", "dev": false}, ...] }}
```

- `state`: how many components. `components`: a list of `{id, version, tag, commit, released, dev}`
  (`commit` shortened to 12, as in the stamps; `tag` empty for a dev item);
  a dev-rendered component shows the working tree's version, `commit` `<sha>-dirty`, `dev: true`.
- **Decision:** the list is a Jinja literal inside a template, because a template entity's attribute
  is a template; Home Assistant renders it to a native list.
- **Decision:** the first line is not a component stamp (`<id>/<version> (<commit>)`), so nothing
  that parses stamps mistakes it for one; `status` and `deploy` know the path by name.
- A home with no component locked gets no file (and an existing one is removed).

### `status`, `deploy`

- `status` lists the file as `managed` when it equals what the lock and `dev-render.json` give, else
  `managed-modified` (existing STABLE lines; no new line).
- `deploy` carries it like a managed file (record layer `managed`, component none). When it differs
  from what the lock gives: `FAIL inventory out of date: packages/domosenso.yaml: run domosenso
  render` (new FAIL reason). It names Home Assistant's package, so a change to it means `restart: yes`.
- `deploy production` treats a dev entry in it like any dev-render file: refused without
  `--allow-dirty` (SPEC-019).

### Contract surface (`docs/COMPATIBILITY.md`)

| surface | stability |
|---|---|
| `sensor.domosenso_components`: state (count), attributes `component: domosenso`, `components` (`id`, `version`, `tag`, `commit`, `released`, `dev`) | STABLE; new keys in an item ADDITIVE-ONLY |
| `packages/domosenso.yaml` under config_dir, written by the command | STABLE (path) |
| lock key `released` | ADDITIVE-ONLY |
| FAIL reason `inventory out of date: <path>` | STABLE |

## Renderer

Template global `component` (`id`, `version`), today only in ESPHome device templates, goes to every
template (ADDITIVE-ONLY). The Ramka's About page uses it as its fallback.

## ramka 0.7.0

Settings dashboard, new last view `about` (icon `mdi:information-outline`), one section:

- a markdown card: the table from `state_attr('sensor.domosenso_components', 'components')`,
  Component · Version · Released (ISO date: readable the same in every language), `(dev)` after a
  dev version;
- while the sensor is unavailable (a home rendered by an older `domosenso`, or by
  `domosenso_render.py` alone): one line "Ramka <version>" from the `component` global and a note that
  `domosenso render` writes the full list.

New `ui.settings.pages.about`, `ui.settings.about_*` keys in en, de, pl. No new input, helper or
entity of the Ramka's own. `component.yaml` 0.7.0; `UPGRADE.md`: nothing to do in the home but render
(the package appears on the next `render` or `update`, with a restart at its deploy).

**Decision:** the sensor is the command's, not a component's, so it does not go under `consumes`
(which names a component); the Ramka's manifest says in a comment that the About page reads it.

## Compatibility

Additive everywhere. An existing home: the first `render` or `update` with this command adds
`released` to each lock entry and writes `packages/domosenso.yaml`; its deploy adds one template
sensor and restarts. A snapshot `compare` then shows one new entity, `sensor.domosenso_components`
(explain it in `domosenso/equivalence.yaml`, or accept it as the change). No bridge needed.

## Tests

- pytest: lock round-trip with and without `released`; `render` fills `released` and writes the
  package; dev render marks `dev`/`-dirty`; the package parses as YAML and its attribute template
  renders to the list (jinja2); `status` `managed` / `managed-modified`; `deploy --plan` carries it
  and fails `inventory out of date` on a stale file; renderer `component` global in a plain template.
- `test_ramka_render.py`: the settings dashboard has an `about` view in every language, last.
- `npm test`, `catalog_check --strict` (translations), `tools/ha-check.sh ramka` (check_config with
  the dashboard), `tools/check-all.sh`.
- The maintainer's home: `render --catalog-dev` from this branch, review the diff, `deploy production
  --plan` (apply only on the maintainer's go-ahead).

## Website impact

A line in the Ramka's catalog page once 0.7.0 is tagged (draft until the tag); the `domosenso`
command reference gains the inventory sensor.

## Out of scope

- Links from the table to each component's release notes (a home's catalog may be a fork or local
  path; the URL is not known in Home Assistant). Possible later from `domosenso.yaml`'s catalog.
- The date the home itself moved to a version (would need a lock key written only on a version
  change; the maintainer chose the release date).
- Home Assistant's and ESPHome's own versions on the About page.
- An "update available" marker (needs the catalog's newest tags at runtime).
