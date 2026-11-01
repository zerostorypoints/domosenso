# Compatibility: the contract surface of Domosenso

What a home, another component or a tool outside this repository relies on, and how much each may
change. Modelled on Open Mercato's `BACKWARD_COMPATIBILITY.md`
([research](research/2026-10-20-domosenso-architecture.md) §1). A change to anything listed here
needs a spec in `.ai/specs/` first (AGENTS.md, spec-first).

## Levels

| level | what may change |
|---|---|
| **FROZEN** | nothing, short of a new major version with a migration every home runs |
| **STABLE** | nothing that breaks a home without the deprecation protocol below; additions are free |
| **ADDITIVE-ONLY** | new values, keys or fields may be added; none is removed, renamed or given a new meaning |

Versions are per component (`version:` in `component.yaml`, semantic versioning). While a
component is `0.x`, a minor version counts as the "next version" of the protocol.

## Surfaces

### Distribution

| surface | level |
|---|---|
| Tag scheme `<component>/<version>`, e.g. `bermuda-presence/0.1.0` | FROZEN |
| Remote package URL `github://zerostorypoints/domosenso/components/<id>/<path>@<component>/<version>` (ESPHome device files, `dashboard_import`; at most 255 characters) | FROZEN |
| Component ids (the directory name, `^[a-z0-9]+(-[a-z0-9]+)*$`) | FROZEN |
| Device ids (`devices/<id>.yaml`) | STABLE |
| ESPHome `project:` name `domosenso.<component>` (`domosenso.bermuda-presence`, `domosenso.audio-sensor`) | STABLE |
| Card install path `www/domosenso/<id>/<version>/`, served as `/local/domosenso/<id>/<version>/` | FROZEN |

### Manifest (`component.yaml`, `schemas/component.schema.json`)

| surface | level |
|---|---|
| Required fields and their meaning: `id`, `version`, `summary`, `description_key`, `devices`, `host`, `integrations`, `artifacts`, `tested` | STABLE |
| Optional fields (`inputs`, `provides`, `consumes`, `features`, `local_only`, `photo`, artifact kinds) | ADDITIVE-ONLY |
| `inputs`: each input's name, type and default | STABLE; new optional inputs are free, a new required input is a breaking change |
| `media_player_contract` of the Ramka: `required` / `optional` | STABLE; moving a feature from optional to required is a breaking change |
| Scene files (`schemas/scene.schema.json`, `scenes/README.md`) and device files; the device fields `tested` (`homes`, `note`) and `tablet` (`css`, `dpr`, `orientation`, `charge_limit`, `companion_app_tested`, `webview_tested`; only on a device of `ramka`) ([SPEC-011](../.ai/specs/SPEC-011-2026-10-22-onboard-home-v2.md)) | ADDITIVE-ONLY |
| Match rules (`match:` in device files, `kinds/<kind>.yaml`, the `rule` of `schemas/device.schema.json` and `kind.schema.json`): field names and meaning ([SPEC-010](../.ai/specs/SPEC-010-2026-10-22-recommend-from-ha.md)); the rules themselves are data and change freely | ADDITIVE-ONLY |
| `templates/instance/**.j2`: rendered once by `domosenso add` into `config_dir/<path>` with the home's inputs, never overwritten, recorded in the lock as layer `instance`, not stamped | ADDITIVE-ONLY |
| `artifacts.services` items ([SPEC-015](../.ai/specs/SPEC-015-2026-10-27-add-component-end-to-end.md)): `name`, `kind` `container` (`compose`, `files`, `env_example`, `image` or `build: true`) or `firmware` (`repo`, `version`, `asset`, `flash`, `setup`); a container's files copied once by `add` to `services/<name>/`, layer `instance`; a plain path (a tag from before SPEC-015) ignored by the tools | ADDITIVE-ONLY |
| `artifacts.esphome.devices` (`template`, `each`, `file` with `<field>` placeholders) rendered once by `add` per item into `esphome_dir/<file>` with the globals `item` and `component`, layer `instance`; `artifacts.esphome.secrets` ([SPEC-015](../.ai/specs/SPEC-015-2026-10-27-add-component-end-to-end.md)) | ADDITIVE-ONLY |

### Entities a component provides

Each entry in a manifest's `provides.entities` carries its own `stability:` (`frozen`, `stable` or
`additive-only`); the manifest is the source, this page states the rules.

- The **entity id or pattern** (`sensor.presence_<area slug>`, `input_select.<prefix>_mode`) is the
  contract, placeholders included. The slug rule is Home Assistant's: it transliterates
  (`Küche` → `kuche`).
- **Option values of a select or a state set** are part of the entity: `input_select.<prefix>_mode`
  (`off, ambient, controls, calendar`) and `input_select.<prefix>_ambient`
  (`climate, air, plants, photos, status`, in rotation order) are FROZEN.
- **Attributes** a component sets as a marker (`component:`, `area:` on the presence sensors) are
  STABLE.
- **Events** (`esphome.atom_button` with `room`, `click`) carry their own level in the manifest.
- Entity ids Home Assistant builds from a device's area and names
  (`light.<area>_ble_proxy_<room>_led`) are declared, not promised: a Home Assistant release can
  change the rule. Entities under `upstream:` belong to another integration and are not ours to
  freeze.
- An `additive-only` sensor may gain state values (`sensor.<player>_audio_quality`); consumers must
  treat an unknown value as "other".

### Cards (Lovelace resources)

| surface | level |
|---|---|
| Element names `custom:<name>-card` (ramka: agenda, air, clock-weather, corner-taps, line-style, mains, now-playing, photo-frame, plants, rooms, status, tap-button; audio-sensor: ambient-wave, room-meter; floorplan: floorplan) | STABLE |
| Config keys a card's `setConfig` reads, and their meaning | STABLE; new optional keys are free |
| Resource type `module`, ES modules without a build step, JSON imported `with { type: "json" }` | STABLE |

### Translations

| surface | level |
|---|---|
| Layout `translations/<lang>.json`, `en` as source and fallback, languages `en`, `de`, `pl` | FROZEN |
| Namespaces `meta.*` (catalog text), `ui.*` (rendered dashboards), `card.*` (card runtime) | FROZEN |
| Keys a card or template uses | STABLE (renaming one breaks a home's override); new keys ADDITIVE-ONLY |
| The English wording | free; it is text, not a contract |

### Tools

| surface | level |
|---|---|
| Renderer delimiters `[[ ]]`, `[% %]`, `[# #]`; Home Assistant's own `{{ }}` / `{% %}` passed through byte-identical | FROZEN |
| Renderer inputs: globals `t(key)`, `inputs`, `lang`, `fail(message)` (ends the render with that message; SPEC-011), `component` (`id`, `version` from the manifest; [SPEC-023](../.ai/specs/SPEC-023-2026-10-30-component-inventory-and-ramka-about.md)); filter `yaml`; `*.lang.yaml.j2` → `<name>.<lang>.yaml`, which `domosenso render` puts in a home at `dashboards/<id>.<lang>.yaml` for `dashboard` and at `dashboards/<name>.<lang>.yaml` for any other name ([SPEC-021](../.ai/specs/SPEC-021-2026-10-29-ramka-live-settings.md), amended 2026-10-30: the name has no component prefix, so a component names the template after itself; a clash fails `owned by <id>: <path>`); a template whose output is only whitespace writes no file (ramka's preview dashboard, 2026-10-31); an input set to `null` counts as absent | STABLE |
| First line of a rendered file: `# Rendered by Domosenso from <component>/<version> (<commit>) — do not edit` (`<commit>-dirty` when the catalog had uncommitted changes), written by `domosenso render`; the old form `# Rendered by Domosenso from <component>@<commit> — do not edit` (`domosenso_render.py --stamp`) is read as well, until the next minor version | STABLE |
| Command lines of `domosenso_render.py`, `domosenso_install.py`, `catalog_check.py`, `ha-check.sh` (and its `INPUTS=<file>` override), `esphome-check.sh`, `check-all.sh`, `agents_check.py`, `install_skills.py` | STABLE |
| Output lines agents parse: `fresh: N errors`, `config ok` / `config FAIL`, `ok` / `FAIL <step>`, `all checks passed`, `ERROR` / `WARNING` prefixes | STABLE |
| Steps of `check-all.sh` | ADDITIVE-ONLY |

### The `domosenso` command and a home repository

`uv run --project <catalog checkout> domosenso <command>`, run from the home repository's root
(`--home <dir>` otherwise). Every command prints one line per action, then `ok` or `FAIL <reason>`
(exit 0 or 1); `--json` prints the same as one document (`lines`, `data`, `result`, `reason`).
Specified in [SPEC-002](../.ai/specs/SPEC-002-2026-10-21-whole-home-on-domosenso.md).

| surface | level |
|---|---|
| Command lines: `init --catalog`, `add <id>@<version> [--catalog-dev]`, `adopt <id>@<version>`, `render [<id>...] [--force] [--catalog-dev]`, `update <id> [--to <version>] [--force]`, `status`, `deploy <target> (--plan \| --apply) [--remove-orphans <path>...] [--prune-resources] [--confirm <hash>] [--allow-dirty]`, `rollback <target> [<deploy id>]`, `snapshot <target> [--out <file>]`, `compare <a> <b> [--explain <file>]`, `verify <target> --baseline <snapshot> [--day-after]`, `recommend [--catalog <path or URL>] [--from-ha <target or URL> [--token-file <file>]] [--have <device id or kind>...]`, `discover --from-ha <target or URL> [--token-file <file>] [--domain <domain>...] [--catalog <path or URL>]`, `probe <target or URL> [--token-file <file>] (--install | --read [--wait <seconds>] | --remove)`, `http <target or URL> [--token-file <file>] (--plan | --apply --confirm <hash> | --promote) [--trusted-proxy <cidr>...]`, and `--json` on each | STABLE |
| Last line of every command: `ok` or `FAIL <reason>`; exit code 0 or 1 | STABLE |
| `FAIL` reasons agents act on: `hand-edited: <path>`, `dev render: <paths>: production takes only files rendered from a tag`, `dev render needs --confirm <hash>`, `dev render changed: <path>: render again`, `dev render of <id>, not in domosenso.yaml`, `not managed, differs: <path>`, `owned by <id>: <path>`, `tag <tag> moved: locked <sha>, now <sha>`, `inventory out of date: <path>` (SPEC-023), `<n> unclassified`, `check_config: <n> errors`, `orphan <paths>`, `not an orphan: <paths>`, `not confirmed`, `the plan changed: its hash is now <hash>, not <given>`, `not equivalent: <n> unexplained`, `not verified: <n> failed` (the wording after the colon is free text) | STABLE |
| Lines of `render`, `add`, `update`: `write`, `same`, `dev`, `keep`, `instance`, `instance-kept`, `remove`, `stale`, `current <id> <version>`, `note <text>` (an `UPGRADE.md` line), `adopt <path>` | STABLE |
| Lines of `status`: `managed`, `managed-modified`, `managed-dev` (a file of a `--catalog-dev` render, as the inventory recorded it), `instance`, `unmanaged`, `unclassified` (each `<path>`; `local` files are not listed), `component <id> <locked> newest <newest>`, `integration <name> <version> (manual)`, `service <id> <name> image <reference> (manual)` / `service <id> <name> build (manual)`, `firmware <id> <name> <version> (manual)`, `esphome-secret <key> missing` ([SPEC-015](../.ai/specs/SPEC-015-2026-10-27-add-component-end-to-end.md)), `missing-dashboard-entry <path>`, `unchecked <reason>` | STABLE |
| Plan lines of `deploy --plan` / `--apply`: `add`, `change`, `remove`, `orphan`, `keep` (each `<path>`), `dev-render <path>`, `resource create\|update\|unwanted\|delete <url>` (`update` adds `from <old url>`), `restart: yes\|no`, `hash <plan hash>`, `warning target runs a dev render: <n> files (deploy <id>)` | STABLE |
| Apply lines: `backup <deploy id>`, `copied <n> removed <m>`, `check_config 0 errors`, `error ...` / `warning ...` (from `check_config`), `restart <target>`, `deployed <deploy id>` or `nothing to deploy`; `rollback`: `restored <n> removed <m>`, `restart <target>`, `rolled-back <deploy id>` | STABLE |
| `snapshot`: `read <part> <n>` per part, `wrote <file>` | STABLE |
| `recommend` ([SPEC-009](../.ai/specs/SPEC-009-2026-10-22-onboard-home.md)): `fits <id>@<version> tested-homes <n\|unknown>`, `missing <id>@<version> tested-homes <n\|unknown> needs <k>`, `needs <id>@<version> <kind> [<device id>,...]`, `optional <id>@<version> <feature\|-> <kind> have\|lacks [<device id>,...]`, `describes <id>@<version>`, `unknown <token> [did-you-mean <id>,...]` (the suggestion added 2026-10-22, additive); `--json` `data`: one object per component (`id`, `version`, `fits`, `describes`, `tested_homes`, `needs`, `optional`); each `needs` and `optional` item has `recommend` and `tested_homes` (`{device id: n or null}` from the device files at the catalog's HEAD, SPEC-011) | STABLE |
| `recommend --from-ha` ([SPEC-010](../.ai/specs/SPEC-010-2026-10-22-recommend-from-ha.md)), before the lines above: `rules <commit> devices <n> kinds <m>`, `scan devices <n> integrations <m>`, `found <device id or kind> <n> via <domain>,...`, `maybe <device id or kind> <n> via <domain>,...`, `unmatched <domain> <n>`; `found` counts as `--have`; a `maybe` also given with `--have` prints no `maybe` line; `--json` top-level `scan`: `rules_commit`, `found` and `maybe` (`{token: {count, via, devices}}`), `unmatched` (`{domain: [device index]}`), `devices` (`name`, `name_by_user`, `manufacturer`, `model`, `model_id`, `sw_version` (SPEC-011), `integrations`, `matches`) | STABLE |
| `discover` ([SPEC-011](../.ai/specs/SPEC-011-2026-10-22-onboard-home-v2.md) §4): `discovered <domain> <n> via <source>,...`, `ignored <domain> <n>`, `configured <domain> <n>`, `failing <domain> <n> <state>`, `catalog <domain> <component>,...`, `integration <domain> <iot_class or -> <integration_type> config-flow yes\|no`, `absent <domain>`; `--json` `data`: `flows` (`handler`, `source`, `step_id`, `title_placeholders`), `entries` (`domain`, `source`, `state`, `disabled_by`, `title`), `manifests` (`{domain: {name, integration_type, iot_class, config_flow, documentation} or null}`) | STABLE; new line kinds ADDITIVE-ONLY |
| `probe` (SPEC-011 §7.3): `copied <n>`, `resource create\|update <url>` (`update` adds `from <old url>`), `dashboard create\|delete domosenso-probe`, `open /domosenso-probe/0`, `removed <n>`, `warning <text>`, and from `--read` `probe viewport <w>x<h> dpr <r> screen <W>x<H> orientation <o> webview\|chromium <major or -> json-modules yes\|no dvh yes\|no user admin\|non-admin`; `FAIL no report within <s> s`; `--json` `data`: the card's report (`viewport`, `dpr`, `screen`, `orientation`, `chromium`, `webview`, `dvh`, `json_modules`, `admin`). The probe's files under `www/domosenso/_probe/`, its resource and its dashboard are not a contract | STABLE |
| `http` ([SPEC-012](../.ai/specs/SPEC-012-2026-10-22-remote-access.md) §3): `http <key> <old json> -> <new json>`, `restart: yes`, `hash <hash>`, `nothing to change`, `pending waiting revert-at <time>`, `configured restart: yes\|no`, `active <slot>`, `revert-at <time\|->`, `stable`, `nothing to promote`; `FAIL` reasons `the plan changed: its hash is now <hash>, not <given>`, `the pending config failed its trial: <message>` | STABLE |
| `floorplan` ([SPEC-027](../.ai/specs/SPEC-027-2026-11-01-floorplan.md)): `floorplan pull <target> [--out <file>]` prints `read floor <id or -> rooms <n> points <m>` per floor and `wrote <file>` (default `domosenso/floorplan.json`; the file's `source` is kept); `floorplan push <target> (--plan \| --apply) [--confirm <hash>]` prints `dashboard create floorplan` (the dashboard is missing; it is created with `allow_single_word`), `room add\|change\|remove <floor> <area_id>`, `point add\|move\|remove <floor> <device or entity id>`, `area missing <area_id>`, `hash <hash>`, and with `--apply` `backup <file>` (`.domosenso/floorplan/<target>-<timestamp>.json`, only when a plan was there) and `pushed`; `nothing to push` (no `hash`) when the plan equals the target's. `--plan` or `--apply` is required with `push` and refused with `pull`, `--out` goes with `pull`. Only Home Assistant's own not-found answer for the dashboard config means "no plan"; any other failure ends the command. `FAIL` reasons: `no floorplan dashboard on <target>`, `no plan on <target>`, `no plan in domosenso/floorplan.json; pull or write one first`, `schema <n> not supported`, `area missing: <ids>` (after one `area missing <id>` line each), `changed on target since pull: <n> rooms, <m> points` (against `.domosenso/floorplan/<target>.pulled.json`), `the plan changed: its hash is now <hash>, not <given>`, `not confirmed`. `push production --apply` asks for the word `production`, or takes `--confirm <hash>`, as `deploy` does | STABLE; new lines ADDITIVE-ONLY |
| `compare` and `verify`: per part `ok <part> (<n>)` or `FAIL <part>: <n> differences` followed by `<kind> <part> <id> [detail]` for each difference; `explanations <file> (<n>)`; `warning stale explanation <part> <id>`; the last line before `ok` is `equivalent` (`compare`) or `verified` (`verify`). Kinds: `only-in-a`, `only-in-b`, `unique-id-differs`, `not-loaded`, `config-differs`, `options-differ`, `state-changed`, `newly-unavailable`, `log-error`, `resource-missing`, `resource-duplicate`, `profile-language`, `silent-failed` | STABLE; new kinds and parts ADDITIVE-ONLY |
| `deploy production --apply` asks for the word `production`; a non-interactive run needs `--confirm <plan hash>`; with `dev-render` lines it refuses unless `--allow-dirty --confirm <plan hash>` (the word is not enough); `deploy --plan` prints `warning target runs a dev render: <n> files (deploy <id>)` while the target runs one | STABLE |
| `domosenso.yaml` (`schemas/home.schema.json`): `catalog`, `config_dir`, `esphome_dir`, `targets` (`kind` `local-docker` / `ssh-docker`), `components`, `local`, `resources`, `unmanaged_on_target`, `kiosk_users`, `custom_integrations` | STABLE; new optional keys ADDITIVE-ONLY |
| A home's `<config_dir>/domosenso_discovery.yaml`, read by the Ramka's About page discovery: `rules` (`when`, `match`, `also`) and `declared_links` (`device`, `via`) ([SPEC-023](../.ai/specs/SPEC-023-2026-10-30-component-inventory-and-ramka-about.md) Amendment 1) | STABLE; new keys ADDITIVE-ONLY |
| `domosenso.lock` (`schemas/lock.schema.json`): per component `version`, `tag`, `commit`, `files` (`sha256`, `from`, `layer`), `resources`, `released` (optional, the tag commit's date `YYYY-MM-DD`; SPEC-023) | STABLE; new optional keys ADDITIVE-ONLY |
| The inventory `<config_dir>/packages/domosenso.yaml`, written by `add`, `adopt`, `render` and `update` from the lock and `.domosenso/dev-render.json` (first line `# Rendered by Domosenso from domosenso.lock — do not edit`; a `write`, `same` or `remove` line), carried by `deploy` (a stale one fails `inventory out of date`), `managed` / `managed-modified` in `status`; it defines `sensor.domosenso_components`: state the number of components, attributes `component: domosenso` and `components` (`id`, `version`, `tag`, `commit`, `released`, `dev`) ([SPEC-023](../.ai/specs/SPEC-023-2026-10-30-component-inventory-and-ramka-about.md)) | STABLE; new keys in an item ADDITIVE-ONLY |
| `domosenso/equivalence.yaml` (`schemas/equivalence.schema.json`): explained differences between two snapshots, `after_restart: unknown` | STABLE; new optional keys ADDITIVE-ONLY |
| `domosenso/silent.yaml` (`schemas/silent.schema.json`): entry kinds `loaded_on`, `triggered_within`, `entity_fresh` | STABLE; new entry kinds ADDITIVE-ONLY |
| `schemas/floorplan.schema.json`, `schema: 1` ([SPEC-027](../.ai/specs/SPEC-027-2026-11-01-floorplan.md)): `floors` (`floor_id`, `rooms` with `area_id` and `polygon` in metres, `points` with `device_id` or `entity_id`, `x`, `y`, `placed`) and, only in the home repository's file, `source` (`image`, `metres_per_px`, `rotation_deg`, `offset_px`); the `floorplan` storage dashboard (url path `floorplan`, one view, one `custom:floorplan-card` whose `plan` is the document without `source`); a reader refuses an unknown major | STABLE; a breaking change bumps `schema`; new optional keys ADDITIVE-ONLY |
| Snapshot file (`schemas/snapshot.schema.json`), default `.domosenso/snap/<target>.json`: `entities`, `automations`, `scripts`, `helpers`, `dashboards`, `resources`, `config_entries`, `errors`, `profiles` | STABLE; new parts ADDITIVE-ONLY |
| Home repository layout: `domosenso.yaml`, `domosenso.lock`, `domosenso/<id>.inputs.yaml`, `domosenso/equivalence.yaml`, `domosenso/silent.yaml`, `domosenso/floorplan.json`, `domosenso/floorplan/<floor>.<ext>` (the traced drawing; it stays in the repository and never goes to Home Assistant); `.domosenso/` is not committed | STABLE; new files ADDITIVE-ONLY |
| `.domosenso/dev-render.json` ([SPEC-019](../.ai/specs/SPEC-019-2026-10-29-deploy-allow-dirty.md) B): what a `--catalog-dev` render or add wrote, per component (`version`, `commit`, `files` with `sha256` and `layer`, `resources`); `deploy` carries it on every target; a file whose sha256 equals its entry is the component's own, so a second dev render and a render, `add` or `update` from the tag replace it without `--force` (one edited since is `hand-edited`), and the tag removes the component's entry | not a contract: written by `render --catalog-dev` / `add --catalog-dev`, read by `deploy` |
| Per-target deploy record `<config>/.domosenso/deployed.json` and backups `.domosenso/predeploy-<timestamp>/` | not a contract: read through `rollback`, never by hand |
| Home repository template `examples/home-template/AGENTS.md` | free: text a home copies once and then owns |

## Deprecation protocol

For a breaking change to a STABLE surface:

1. **Spec first**, saying what breaks, who is affected and the bridge.
2. **A bridge for one version.** The old name keeps working next to the new one for the next
   minor version:
   - a renamed entity → a template alias entity under the old id that mirrors the new one;
   - a renamed option value → automations and cards accept both, the helper offers the new one;
   - a renamed card config key or input → the old key is read as the new one and a warning is
     logged;
   - a renamed translation key → both keys, the old one marked deprecated.
3. **Notes.** An entry in the component's `UPGRADE.md` (what changed, what a home must do, in
   order) and a line in [UPGRADE_NOTES.md](UPGRADE_NOTES.md).
4. **Removal** of the bridge in the version after, with its own note.

A FROZEN surface does not change inside a major version. Until a component's first release to a
home other than its author's, a breaking change may skip the bridge if the upgrade note says so;
the stage 1 renames were made this way.
