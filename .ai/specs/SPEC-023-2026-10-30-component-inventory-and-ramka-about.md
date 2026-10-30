# SPEC-023: Component inventory sensor and the Ramka settings' About page (ramka, unreleased)

- Status: approved 2026-10-30 by the maintainer, in conversation; amended the same day (Amendment 1)
  after prototypes on the maintainer's test instance, each looked at and accepted before the next
- Source: the maintainer, in conversation (2026-10-30): "in the Ramka Settings, provide the About
  view, which will list all the components' version and when it was last updated", built in the
  catalog so every home gets it. Two decisions taken in that conversation: the list comes from a
  sensor the `domosenso` command writes (not from Ramka's render), and "last updated" is the
  **catalog release date** of the version the home runs (the date of the commit its tag names).
- Touches: the `domosenso` command (render, add, adopt, update, deploy, status), the lock schema
  (one optional key), the renderer's template globals, `ramka` (a new settings page, a discovery
  script and its catalog index), `tools/catalog_index.py`.
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

## ramka (unreleased): the About page

Replaced by Amendment 1 below; kept here: no version bump (the release that carries it is the
maintainer's decision), `UPGRADE.md` gets a `## Unreleased` entry, and the fallback while
`sensor.domosenso_components` is missing (the Ramka alone, from the `component` global).

**Decision:** `sensor.domosenso_components` is the command's, not a component's, so it does not go
under `consumes` (which names a component); the Ramka's manifest says in a comment that the About
page reads it.

## Amendment 1 (2026-10-30): what the components use, links, the page as built

Asked by the maintainer after the first prototype: list the related (third-party) components and
the devices really used, strictly, not every integration Home Assistant has; their versions and
status; a refresh; links to domosenso.org; a header. Each step was deployed as a dev render to the
maintainer's test instance and accepted there.

### Discovery inside Home Assistant

`components/ramka/shell/domosenso_discover.py`, installed to `/config/shell/`, run by
`shell_command.<prefix>_discover`, read-only, prints one JSON document:

- **found**: the components seen in Home Assistant, from the stamps of rendered files and from
  boards whose ESPHome firmware reports manufacturer `domosenso` and a component as model (with
  each board's version: a board that reports another version than the device file pins shows it);
- **uses**: per component, the entities an integration provides that the component's rendered files
  reach: literal entity ids, followed through template entities in `packages/*.yaml` (by
  `unique_id`), and through **rules** for ids a home's own templates build at runtime;
- **integrations**: per domain of those entities, name, kind (`core`, `HACS`, `custom`), version
  (Home Assistant's for core, HACS's installed version) and the HACS update entity;
- **declared_links**: device links Home Assistant does not record;
- **links**: pages for what was found (below).

It reads `.storage` (entity, device, config entry registries; HACS repositories), the integrations'
manifests and `.HA_VERSION`. **Decision:** strict only: an edge is a literal id or a registry link;
anything else is declared by the home, never guessed. Nothing is filtered out by the catalog:
a home's own devices and integrations stay listed.

The home's rules and links: `<config_dir>/domosenso_discovery.yaml`, the home's own file (a `local:`
glob), read if present:

```yaml
rules:                     # a template containing a `when` string uses every id matching `match`
  - when: [audio_resolve]
    match: 'binary_sensor[.]audio_(?!src_)(?P<d>.+)_present$'
    also: ['binary_sensor.audio_{d}_playing']
declared_links:            # device ids from the device registry
  - {device: <ruuvi air>, via: <the bluetooth proxy>}
```

### Catalog index and links

`tools/catalog_index.py` writes `components/ramka/shell/domosenso_catalog.json`: every component and
whether domosenso.org publishes its page (`website/content/publication.json`), every device with its
English name, its page and the match rules of `devices/*.yaml` (SPEC-010). A pytest fails when the
file is stale. **Decision** (the maintainer's): the index ships with the Ramka, so the page works
offline (`local_only`); a device added to the catalog is linked after the next Ramka update.

Links, each as the thing's name, never a bare URL: a component to `domosenso.org/components/<id>/`
(else its folder on GitHub); a device a rule matches to `domosenso.org/devices/<id>/` (a rule the
catalog marks `note: inference` links too); an integration to its manifest's `documentation`.

### Refresh, sensor, recorder

- `script.<prefix>_about_refresh`: runs the discovery, fires `<prefix>_discovery` with its result,
  and updates the HACS update entities it names (versions checked again).
- `sensor.<prefix>_discovery` (trigger-based template, `component: ramka`): state the time of the last
  refresh, attributes `ha_version`, `found`, `uses`, `integrations`, `declared_links`, `links`.
  **Decision:** excluded from the recorder in the Ramka's package (a snapshot for one page, not
  history; a few kB per refresh); no `device_class`: the page shows the date itself.
- `automation.<prefix>_about_discover`: at start (after a minute) and at 04:10.

### The page

A `sections` view like the other settings pages (their margins; one column on a narrow screen):

- **header** (plain text, not a card): the DomoSenso mark (`cards/assets/domosenso-mark.svg`, the
  site's, in its accent so it reads on both themes) and wordmark, the README's tagline; links
  Website · Get started · Components · Devices · GitHub; "Last discovery: <local date and time>";
  the license line (Apache-2.0, © ZeroStoryPoints GmbH, the trademark note, NOTICE, third-party
  notices) and Home Assistant's version; a **Refresh** badge under it;
- first column: **Components** (the lock's, plus any found only in Home Assistant, a board's other
  version noted) and **Related components** (integration, kind, version with `→ newer` when HACS
  has one, used by);
- second column: **Devices** (name, model, firmware, via, status). Status: green `ok`, red
  `offline` when all used entities of the device are unavailable, or when one of its own
  `connectivity` sensors is off (named: an integration may keep its other entities `off`, as the
  Hegel's does).

Every markdown card renders in strict mode (`render_template` with `strict: true`), as the
dashboard renders them.

### Contract surface (additions)

| surface | stability |
|---|---|
| `sensor.<prefix>_discovery`, `script.<prefix>_about_refresh`, `shell_command.<prefix>_discover`, `automation.<prefix>_about_discover` | STABLE (Ramka's `provides`) |
| `<config_dir>/domosenso_discovery.yaml`: `rules` (`when`, `match`, `also`), `declared_links` (`device`, `via`) | STABLE; new keys ADDITIVE-ONLY |
| `components/ramka/shell/domosenso_catalog.json` | not a contract: written by `tools/catalog_index.py` |

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
- `test_ramka_render.py`: the settings dashboard has an `about` view in every language, last,
  read-only but for Refresh; the package's discovery command, sensor, script, automation and recorder
  exclusion; the Components table rendered with Jinja.
- `test_domosenso_discover.py`: the discovery on a config in the 2026.9 storage format (one
  `config_entry_id` per device): uses, components found, device and component links.
- `test_catalog_index.py`: the shipped index equals what the catalog gives.
- `npm test`, `catalog_check --strict` (translations), `tools/ha-check.sh ramka` (check_config with
  the dashboard), `tools/check-all.sh`.
- The maintainer's home: `render --catalog-dev` from this branch, review the diff, `deploy production
  --plan` (apply only on the maintainer's go-ahead).

## Website impact

A line in the Ramka's catalog page once a release carries it (draft until the tag); the `domosenso`
command reference gains the inventory sensor.

## Out of scope

- A fork's own website: links go to domosenso.org and the upstream repository.
- Fetching the index from domosenso.org at a refresh (always current, needs the internet).
- Discovery for a home without a Ramka: it belongs to the framework; a later core component.
- The date the home itself moved to a version (would need a lock key written only on a version
  change; the maintainer chose the release date).
- Home Assistant's and ESPHome's own versions on the About page.
- An "update available" marker for Domosenso components (needs the catalog's newest tags at
  runtime); HACS integrations show theirs.
