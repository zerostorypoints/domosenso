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
| Printable enclosures `devices/enclosures/<id>/` with `README.md`, `stl/`, `3mf/`, `preview/` ([SPEC-036](../.ai/specs/SPEC-036-2026-11-05-printable-enclosures.md)) | ADDITIVE-ONLY |
| Served enclosure previews `/enclosures/<id>/<name>.png` on domosenso.org, from `devices/enclosures/<id>/preview/<name>.png` ([SPEC-036](../.ai/specs/SPEC-036-2026-11-05-printable-enclosures.md)) | STABLE |
| ESPHome `project:` name `domosenso.<component>` (`domosenso.bermuda-presence`, `domosenso.audio-sensor`) | STABLE |
| Card install path `www/domosenso/<id>/<version>/`, served as `/local/domosenso/<id>/<version>/` | FROZEN |

### Manifest (`component.yaml`, `schemas/component.schema.json`)

| surface | level |
|---|---|
| Required fields and their meaning: `id`, `version`, `summary`, `description_key`, `devices`, `host`, `integrations`, `artifacts`, `tested` | STABLE |
| Optional fields (`inputs`, `provides`, `consumes`, `uses_home`, `features`, `local_only`, `photo`, artifact kinds) | ADDITIVE-ONLY |
| `uses_home` (`true` or `"optional"`): the component's templates see `home`, the home inputs file `domosenso.yaml` names under `home_inputs` (`rooms`, each with an optional HA `area` defaulting to its id, the id `outside` reserved; `outside`, with an optional `area`; `weather`), and `room_name(room)`. `true` fails `render` without the file; `"optional"` renders with `home` None. `render` validates the file's shape and does not check its entities against a running Home Assistant | ADDITIVE-ONLY |
| `inputs`: each input's name, type and default | STABLE; new optional inputs are free, a new required input is a breaking change |
| `media_player_contract` of the Ramka: `required` / `optional` | STABLE; moving a feature from optional to required is a breaking change |
| Scene files (`schemas/scene.schema.json`, `scenes/README.md`) and device files; the device fields `tested` (`homes`, `note`) and `tablet` (`css`, `dpr`, `orientation`, `charge_limit`, `companion_app_tested`, `webview_tested`; only on a device of `ramka`) ([SPEC-011](../.ai/specs/SPEC-011-2026-10-22-onboard-home-v2.md)) | ADDITIVE-ONLY |
| Match rules (`match:` in device files, `kinds/<kind>.yaml`, the `rule` of `schemas/device.schema.json` and `kind.schema.json`): field names and meaning ([SPEC-010](../.ai/specs/SPEC-010-2026-10-22-recommend-from-ha.md)); the rules themselves are data and change freely | ADDITIVE-ONLY |
| Device categories (`categories/<id>.yaml`, `schemas/category.schema.json`, [SPEC-028 Amendment 5](../.ai/specs/SPEC-028-2026-11-01-floorplan.md)): the category ids (`plants`, `media`, `mobile`, `radio`, `security`, `climate`, `light`, `shading`, `other`), the fields (`order`, `names`, `colour`, `marker`, `placeable`, `fallback`, `hub`, `extra_role`, `kinds`, `devices`, `match` with SPEC-010's rule fields plus `only_entity_domain`, `marker` and `extra_role: false`), the test (an override, else the first category by `order` whose rules or hub test match, else the fallback; then the device's further roles: every later category marked `extra_role` that matches, by its rules not marked `extra_role: false`) and the CSS variables `--floorplan-<id>`; `tools/domosenso_cli/categories.py` and the floor plan card's `lib/categories.js` implement it, and `components/floorplan/cards/lib/categories.json` is generated (`tools/category_index.py`), not a contract. The rules, colours and names are data and change freely | ADDITIVE-ONLY: a new category or field is additive; renaming or removing an id is breaking (plans store ids) |
| `templates/instance/**.j2`: rendered once by `domosenso add` into `config_dir/<path>` with the home's inputs, never overwritten, recorded in the lock as layer `instance`, not stamped | ADDITIVE-ONLY |
| `artifacts.services` items ([SPEC-015](../.ai/specs/SPEC-015-2026-10-27-add-component-end-to-end.md)): `name`, `kind` `container` (`compose`, `files`, `env_example`, `image` or `build: true`) or `firmware` (`repo`, `version`, `asset`, `flash`, `setup`); a container's files copied once by `add` to `services/<name>/`, layer `instance`; a plain path (a tag from before SPEC-015) ignored by the tools | ADDITIVE-ONLY |
| `artifacts.esphome.devices` (`template`, `each`, `file` with `<field>` placeholders) rendered once by `add` per item into `esphome_dir/<file>` with the globals `item` and `component`, layer `instance`; `artifacts.esphome.secrets` ([SPEC-015](../.ai/specs/SPEC-015-2026-10-27-add-component-end-to-end.md)) | ADDITIVE-ONLY |

### Assistant metadata (SPEC-029; unreleased)

| surface | level |
|---|---|
| Optional manifest `assistant: {version, definition, bindings}`; version 1 | ADDITIVE-ONLY |
| Private managed `<config_dir>/domosenso/assistant/<id>.yaml`, schema 1, pinned component identity, definitions, translations and typed bindings | STABLE |
| Capability id + revision, query/answer type pairs and allowlisted evaluator semantics | STABLE; a meaning change requires a new revision and negotiated dual support |
| `meta.assistant.*` translation keys | ADDITIVE-ONLY; English fallback, en/de/pl catalog coverage |
| Optional canonical capability `client` authoring annotations and private derived `domosenso/assistant-metadata/<id>.yaml`, schema 2 ([SPEC-037](../.ai/specs/SPEC-037-2026-11-05-shared-home-native-metadata.md)); normalized subject/room aliases; generic `measurement.v1` evaluator | Unreleased native surface; schema-1 fields/paths/validators stay STABLE and unchanged. Requires matching future Bridge projection; not compatible with the historical independent-definition schema-2 prototype |

Definitions cannot contain executable prompts, service calls or code. Their fact sources must be
listed in the owning manifest's `provides`, `upstream` or declared `consumes`. Rendered bindings
contain only declared typed roles, never the full input object or live readings. They are not
Home Assistant packages or files under `www`. The normal lock, dirty-render ownership, deployment
plan and rollback cover their bytes. Homes without assistant metadata retain existing output.

The separate Frame HA bridge and app negotiate capabilities, filter endpoint and HA permissions,
and evaluate live evidence. Installing metadata is not permission to read its sources. Legacy
protocol 1 and its three topics remain supported. See [assistant setup](ASSISTANT.md).

### Ramka wake application (SPEC-030; unreleased)

Optional `tablet_wake_package` is STABLE, default `io.homeassistant.companion.android`.
The existing wake script launches a configured alternative app without consulting Companion's
importance sensor. Screen commands, radar policy and all existing entity surfaces are unchanged.

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
| `data-own-tap` (SPEC-028): an element so marked handles its own taps; the Ramka's `corner-taps-card` does not treat a tap through it (its composed path) as a tap on the page. The floor plan card's layer chips and its bar (zoom, fit, maps) carry it with `layer_choice: one` | ADDITIVE-ONLY |
| Config keys a card's `setConfig` reads, and their meaning | STABLE; new optional keys are free |
| Resource type `module`, ES modules without a build step, JSON imported `with { type: "json" }` | STABLE |
| Installed card modules: each relative static import and re-export gets `?v=<hash>` of the whole version directory, and each card's resource URL the same `?v=`; a dynamic `import()` appends its importer's own query (`new URL(import.meta.url).search`) | STABLE |

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
| Command lines of `domosenso_render.py` (`--home-inputs <file>`), `domosenso_install.py`, `catalog_check.py`, `ha-check.sh` (and its `INPUTS=<file>` and `HOME_INPUTS=<file>` overrides), `esphome-check.sh`, `check-all.sh`, `agents_check.py`, `install_skills.py` | STABLE |
| Output lines agents parse: `fresh: N errors`, `config ok` / `config FAIL`, `ok` / `FAIL <step>`, `all checks passed`, `ERROR` / `WARNING` prefixes | STABLE |
| Steps of `check-all.sh` | ADDITIVE-ONLY |

### The `domosenso` command and a home repository

`uv run --project <catalog checkout> domosenso <command>`, run from the home repository's root
(`--home <dir>` otherwise). Every command prints one line per action, then `ok` or `FAIL <reason>`
(exit 0 or 1); `--json` prints the same as one document (`lines`, `data`, `result`, `reason`).
Specified in [SPEC-002](../.ai/specs/SPEC-002-2026-10-21-whole-home-on-domosenso.md).

| surface | level |
|---|---|
| Command lines: `init --catalog [--id <slug>]`, `add <id>@<version> [--catalog-dev]`, `adopt <id>@<version>`, `render [<id>...] [--force] [--catalog-dev]`, `update <id> [--to <version>] [--force]`, `status`, `deploy <target> (--plan \| --apply) [--remove-orphans <path>...] [--prune-resources] [--confirm <hash>] [--allow-dirty]`, `rollback <target> [<deploy id>]`, `snapshot <target> [--out <file>]`, `compare <a> <b> [--explain <file>]`, `verify <target> --baseline <snapshot> [--day-after]`, `recommend [--catalog <path or URL>] [--from-ha <target or URL> [--token-file <file>]] [--have <device id or kind>...]`, `discover --from-ha <target or URL> [--token-file <file>] [--domain <domain>...] [--catalog <path or URL>]`, `probe <target or URL> [--token-file <file>] (--install | --read [--wait <seconds>] | --remove)`, `http <target or URL> [--token-file <file>] (--plan | --apply --confirm <hash> | --promote) [--trusted-proxy <cidr>...]`, `thresholds <target> [--prefix <slug>]` (P3: the Ramka's limits and comfort ranges beside climate-air's; lines `limit <reading> <fair|poor> ramka <v> climate-air <v> equal|conflict`, `comfort <room> <key> ramka <v> climate-air <v> equal|conflict`, `missing <entity>`, `unmatched <widget>`; `FAIL <n> to resolve`), `private link`, `private adopt <path>...` ([SPEC-035](../.ai/specs/SPEC-035-2026-11-05-home-private-folder.md)), `areas <target>` ([SPEC-038](../.ai/specs/SPEC-038-2026-11-06-areas-from-home-assistant.md), draft: lines `area`, `unchecked`, `main`, `candidates`, `quick`, `warn`, `fail`; `FAIL <n> to resolve`), and `--json` on each | STABLE |
| Last line of every command: `ok` or `FAIL <reason>`; exit code 0 or 1 | STABLE |
| `FAIL` reasons agents act on: `hand-edited: <path>`, `home-inputs: <reason>`, `dev render: <paths>: production takes only files rendered from a tag`, `dev render needs --confirm <hash>`, `dev render changed: <path>: render again`, `dev render of <id>, not in domosenso.yaml`, `not managed, differs: <path>`, `owned by <id>: <path>`, `tag <tag> moved: locked <sha>, now <sha>`, `inventory out of date: <path>` (SPEC-023), `<n> unclassified`, `check_config: <n> errors`, `orphan <paths>`, `not an orphan: <paths>`, `not confirmed`, `the plan changed: its hash is now <hash>, not <given>`, `not equivalent: <n> unexplained`, `not verified: <n> failed` (the wording after the colon is free text) | STABLE |
| Lines of `render`, `add`, `update`: `write`, `same`, `dev`, `keep`, `instance`, `instance-kept`, `remove`, `stale`, `current <id> <version>`, `note <text>` (an `UPGRADE.md` line), `adopt <path>` | STABLE |
| Lines of `status`: `managed`, `managed-modified`, `managed-dev` (a file of a `--catalog-dev` render, as the inventory recorded it), `instance`, `unmanaged`, `unclassified` (each `<path>`; `local` files are not listed), `component <id> <locked> newest <newest>`, `integration <name> <version> (manual)`, `service <id> <name> image <reference> (manual)` / `service <id> <name> build (manual)`, `firmware <id> <name> <version> (manual)`, `esphome-secret <key> missing` ([SPEC-015](../.ai/specs/SPEC-015-2026-10-27-add-component-end-to-end.md)), `missing-dashboard-entry <path>`, `unchecked <reason>`, `stale <id> (home inputs changed)` (a component rendered from other home inputs; `status` then ends `FAIL <n> stale render(s)`); with `id` in `domosenso.yaml`: `private <folder>` (written with `~`), `private-link <path> missing`, `private-file <path> in repository` (`<esphome_dir>/secrets.yaml` or `<esphome_dir>/*.code.yaml` as a regular file), `private-mode <path> <octal mode>` ([SPEC-035](../.ai/specs/SPEC-035-2026-11-05-home-private-folder.md)). `<esphome_dir>/secrets.yaml` and `<esphome_dir>/*.code.yaml` are `unmanaged` | STABLE |
| Lines of `private` ([SPEC-035](../.ai/specs/SPEC-035-2026-11-05-home-private-folder.md)): `link`, `linked`, `conflict`, `tracked` (each `<path>`), `refused <path>: inside config_dir` (`link`); `adopt`, `tracked`, `exists` (each `<path>`; `adopt`). `FAIL` reasons: `no id in domosenso.yaml`, `<n> not linked`, `<n> not adopted`, `symlinks unsupported`, `the private folder is inside a git repository: <folder>`, `outside the home: <path>`, `inside config_dir: <path>`, `a link: <path>`, `not a file: <path>` | STABLE |
| Plan lines of `deploy --plan` / `--apply`: `add`, `change`, `remove`, `orphan`, `keep` (each `<path>`), `dev-render <path>`, `resource create\|update\|unwanted\|delete <url>` (`update` adds `from <old url>`), `restart: yes\|no`, `hash <plan hash>`, `warning target runs a dev render: <n> files (deploy <id>)` | STABLE |
| Apply lines: `backup <deploy id>`, `copied <n> removed <m>`, `check_config 0 errors`, `error ...` / `warning ...` (from `check_config`), `restart <target>`, `deployed <deploy id>` or `nothing to deploy`; `rollback`: `restored <n> removed <m>`, `restart <target>`, `rolled-back <deploy id>` | STABLE |
| `snapshot`: `read <part> <n>` per part, `wrote <file>` | STABLE |
| `recommend` ([SPEC-009](../.ai/specs/SPEC-009-2026-10-22-onboard-home.md)): `fits <id>@<version> tested-homes <n\|unknown>`, `missing <id>@<version> tested-homes <n\|unknown> needs <k>`, `needs <id>@<version> <kind> [<device id>,...]`, `optional <id>@<version> <feature\|-> <kind> have\|lacks [<device id>,...]`, `describes <id>@<version>`, `unknown <token> [did-you-mean <id>,...]` (the suggestion added 2026-10-22, additive); `--json` `data`: one object per component (`id`, `version`, `fits`, `describes`, `tested_homes`, `needs`, `optional`); each `needs` and `optional` item has `recommend` and `tested_homes` (`{device id: n or null}` from the device files at the catalog's HEAD, SPEC-011) | STABLE |
| `recommend --from-ha` ([SPEC-010](../.ai/specs/SPEC-010-2026-10-22-recommend-from-ha.md)), before the lines above: `rules <commit> devices <n> kinds <m>`, `scan devices <n> integrations <m>`, `found <device id or kind> <n> via <domain>,...`, `maybe <device id or kind> <n> via <domain>,...`, `unmatched <domain> <n>`; `found` counts as `--have`; a `maybe` also given with `--have` prints no `maybe` line; `--json` top-level `scan`: `rules_commit`, `found` and `maybe` (`{token: {count, via, devices}}`), `unmatched` (`{domain: [device index]}`), `devices` (`name`, `name_by_user`, `manufacturer`, `model`, `model_id`, `sw_version` (SPEC-011), `integrations`, `matches`) | STABLE |
| `discover` ([SPEC-011](../.ai/specs/SPEC-011-2026-10-22-onboard-home-v2.md) §4): `discovered <domain> <n> via <source>,...`, `ignored <domain> <n>`, `configured <domain> <n>`, `failing <domain> <n> <state>`, `catalog <domain> <component>,...`, `integration <domain> <iot_class or -> <integration_type> config-flow yes\|no`, `absent <domain>`; `--json` `data`: `flows` (`handler`, `source`, `step_id`, `title_placeholders`), `entries` (`domain`, `source`, `state`, `disabled_by`, `title`), `manifests` (`{domain: {name, integration_type, iot_class, config_flow, documentation} or null}`) | STABLE; new line kinds ADDITIVE-ONLY |
| `probe` (SPEC-011 §7.3): `copied <n>`, `resource create\|update <url>` (`update` adds `from <old url>`), `dashboard create\|delete domosenso-probe`, `open /domosenso-probe/0`, `removed <n>`, `warning <text>`, and from `--read` `probe viewport <w>x<h> dpr <r> screen <W>x<H> orientation <o> webview\|chromium <major or -> json-modules yes\|no dvh yes\|no user admin\|non-admin`; `FAIL no report within <s> s`; `--json` `data`: the card's report (`viewport`, `dpr`, `screen`, `orientation`, `chromium`, `webview`, `dvh`, `json_modules`, `admin`). The probe's files under `www/domosenso/_probe/`, its resource and its dashboard are not a contract | STABLE |
| `http` ([SPEC-012](../.ai/specs/SPEC-012-2026-10-22-remote-access.md) §3): `http <key> <old json> -> <new json>`, `restart: yes`, `hash <hash>`, `nothing to change`, `pending waiting revert-at <time>`, `configured restart: yes\|no`, `active <slot>`, `revert-at <time\|->`, `stable`, `nothing to promote`; `FAIL` reasons `the plan changed: its hash is now <hash>, not <given>`, `the pending config failed its trial: <message>` | STABLE |
| `floorplan` ([SPEC-028](../.ai/specs/SPEC-028-2026-11-01-floorplan.md)): `floorplan pull <target> [--out <file>]` prints `read floor <id or -> rooms <n> points <m>` per floor and `wrote <file>` (default `domosenso/floorplan.json`; the file's `source` is kept); `floorplan push <target> (--plan \| --apply) [--confirm <hash>]` prints `dashboard create floorplan` (the dashboard is missing; it is created with `allow_single_word`), `room add\|change\|remove <floor> <area_id>`, `point add\|move\|change\|remove <floor> <device or entity id>` (`change`: only the point's `category` override or its joined devices, `also`, changed), `open change <floor>` (the floor's open spaces changed), `openings change <floor>` (the floor's doors, windows and doorways changed, Amendment 9), `area missing <area_id>`, `hash <hash>`, and with `--apply` `backup <file>` (`.domosenso/floorplan/<target>-<timestamp>.json`, when the dashboard had a saved config) and `pushed`; the save replaces the whole `floorplan` dashboard config; `nothing to push` (no `hash`) when the plan equals the target's. `--plan` or `--apply` is required with `push` and refused with `pull`, `--out` goes with `pull`. Only Home Assistant's own not-found answer for the dashboard config means "no plan"; any other failure ends the command. `FAIL` reasons: `push needs --plan or --apply`, `--out goes with pull`, `--plan, --apply and --confirm go with push`, `no floorplan dashboard on <target>`, `no plan on <target>`, `no plan in domosenso/floorplan.json; pull or write one first`, `cannot read <file>: <reason>`, `cannot write <file>: <reason>`, `schema <n> not supported`, `open space on floor <id or ->: <area> is not a room of the floor\|<area> twice`, `duplicate floor_id: <id or ->`, `duplicate area_id on floor <id or ->: <area_id>`, `duplicate point: <device or entity id>`, `plan on <target>: <reason>` (the plan in Home Assistant does not validate), `area missing: <ids>` (after one `area missing <id>` line each), `changed on target since pull: <n> rooms, <m> points` (against `.domosenso/floorplan/<target>.pulled.json`, checked again after the confirm), `the plan changed: its hash is now <hash>, not <given>`, `floorplan production needs --confirm <hash> when it does not run on a terminal`, `not confirmed`. `push production --apply` asks for the word `production`, or takes `--confirm <hash>`, as `deploy` does. `floorplan preview <target> [--port <n>] [--no-open]` (Amendment 6) reads the target read-only, serves the rendered card on 127.0.0.1 behind a random key and prints `read <target>: areas <n> devices <n> entities <n> states <n>`, `preview <url>`, `wrote domosenso/floorplan.json` per save, `refused <type>` per refused call, `stopped`; `FAIL` reasons add `no floorplan card rendered: <path> (render first)` and `port <n> in use` | STABLE; new lines ADDITIVE-ONLY |
| `compare` and `verify`: per part `ok <part> (<n>)` or `FAIL <part>: <n> differences` followed by `<kind> <part> <id> [detail]` for each difference; `explanations <file> (<n>)`; `warning stale explanation <part> <id>`; the last line before `ok` is `equivalent` (`compare`) or `verified` (`verify`). Kinds: `only-in-a`, `only-in-b`, `unique-id-differs`, `not-loaded`, `config-differs`, `options-differ`, `state-changed`, `newly-unavailable`, `log-error`, `resource-missing`, `resource-duplicate`, `profile-language`, `silent-failed` | STABLE; new kinds and parts ADDITIVE-ONLY |
| `deploy production --apply` asks for the word `production`; a non-interactive run needs `--confirm <plan hash>`; with `dev-render` lines it refuses unless `--allow-dirty --confirm <plan hash>` (the word is not enough); `deploy --plan` prints `warning target runs a dev render: <n> files (deploy <id>)` while the target runs one | STABLE |
| `domosenso.yaml` (`schemas/home.schema.json`): `catalog`, `config_dir`, `esphome_dir`, `targets` (`kind` `local-docker` / `ssh-docker`), `components`, `local`, `resources`, `unmanaged_on_target`, `kiosk_users`, `custom_integrations`, `home_inputs` (the path of the shared home inputs, `schemas/home-inputs.schema.json`), `id` (optional slug naming the private folder, [SPEC-035](../.ai/specs/SPEC-035-2026-11-05-home-private-folder.md)) | STABLE; new optional keys ADDITIVE-ONLY |
| A home's `<config_dir>/domosenso_discovery.yaml`, read by the Ramka's About page discovery: `rules` (`when`, `match`, `also`) and `declared_links` (`device`, `via`) ([SPEC-023](../.ai/specs/SPEC-023-2026-10-30-component-inventory-and-ramka-about.md) Amendment 1) | STABLE; new keys ADDITIVE-ONLY |
| `domosenso.lock` (`schemas/lock.schema.json`): per component `version`, `tag`, `commit`, `files` (`sha256`, `from`, `layer`), `resources`, `released` (optional, the tag commit's date `YYYY-MM-DD`; SPEC-023), `home_inputs` (optional, for a component that uses them: the sha256 of the home inputs it was rendered from) | STABLE; new optional keys ADDITIVE-ONLY |
| The inventory `<config_dir>/packages/domosenso.yaml`, written by `add`, `adopt`, `render` and `update` from the lock and `.domosenso/dev-render.json` (first line `# Rendered by Domosenso from domosenso.lock — do not edit`; a `write`, `same` or `remove` line), carried by `deploy` (a stale one fails `inventory out of date`), `managed` / `managed-modified` in `status`; it defines `sensor.domosenso_components`: state the number of components, attributes `component: domosenso` and `components` (`id`, `version`, `tag`, `commit`, `released`, `dev`) ([SPEC-023](../.ai/specs/SPEC-023-2026-10-30-component-inventory-and-ramka-about.md)) | STABLE; new keys in an item ADDITIVE-ONLY |
| `domosenso/equivalence.yaml` (`schemas/equivalence.schema.json`): explained differences between two snapshots, `after_restart: unknown` | STABLE; new optional keys ADDITIVE-ONLY |
| `domosenso/silent.yaml` (`schemas/silent.schema.json`): entry kinds `loaded_on`, `triggered_within`, `entity_fresh` | STABLE; new entry kinds ADDITIVE-ONLY |
| `schemas/floorplan.schema.json`, `schema: 1` ([SPEC-028](../.ai/specs/SPEC-028-2026-11-01-floorplan.md)): `floors` (`floor_id`, `rooms` with `area_id` and `polygon` in metres, `points` with `device_id` or `entity_id`, `x`, `y`, `placed`, optional `category`: a placeable category id overriding what `categories/` give the point, optional `also` on a device point: other device ids that are the same hardware, keys of that point; optional `open_spaces` on a floor: groups of two or more `area_id`s of its rooms open to each other without doors, an area in one group at most, Amendment 7; optional `openings` on a floor: doors, windows, doorways and fixed glass with `rooms`, `at`, optional `kind`, `width`, `state`, `entity`, and on a door `sliding`, `hinge`, `opens`, Amendment 9) and, only in the home repository's file, `source` (`image`, `metres_per_px`, `rotation_deg`, `offset_px`); the `floorplan` storage dashboard (url path `floorplan`, one view, one `custom:floorplan-card` whose `plan` is the document without `source`); a reader refuses an unknown major | STABLE; a breaking change bumps `schema`; new optional keys ADDITIVE-ONLY |
| Snapshot file (`schemas/snapshot.schema.json`), default `.domosenso/snap/<target>.json`: `entities`, `automations`, `scripts`, `helpers`, `dashboards`, `resources`, `config_entries`, `errors`, `profiles` | STABLE; new parts ADDITIVE-ONLY |
| Home repository layout: `domosenso.yaml`, `domosenso.lock`, `domosenso/<id>.inputs.yaml`, `domosenso/equivalence.yaml`, `domosenso/silent.yaml`, `domosenso/floorplan.json`, `domosenso/floorplan/<floor>.<ext>` (the traced drawing; it stays in the repository and never goes to Home Assistant); `.domosenso/` is not committed | STABLE; new files ADDITIVE-ONLY |
| A home's private folder `<config home>/domosenso/homes/<id>/`, `<config home>` = `$XDG_CONFIG_HOME` when absolute, else `~/.config`: files laid out as in the home repository, linked into it by `private link`, folders 700, files 600, never inside a git repository; nothing linked under `config_dir` ([SPEC-035](../.ai/specs/SPEC-035-2026-11-05-home-private-folder.md)) | STABLE; new files ADDITIVE-ONLY |
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


### Future assistant sources (SPEC-032, development)

The Frame bridge may resolve an explicitly granted, versioned future-subject scope against existing
SPEC-029 bundles. This does not change bundle schema 1, entity IDs or component `assistant`
manifests. Component input updates continue to render private bindings through the normal deployment
lifecycle. A scope captures component, subject kind, read capability revisions and fact roles;
it never authorizes arbitrary newly introduced capabilities or actions. Existing exact selections
remain valid. The integration owns its storage migration, exclusions and source-editor API.
## SPEC-031 — optional shared timer commands (development)

Existing assistant v1 `operation: read` remains read-only. New `assistant_actions` manifest metadata
compiles to private managed `domosenso/assistant-actions/<component>.yaml` with schema1, identity,
translations, typed definitions and bindings. SPEC-031 supports fixed timers.start/pause/resume/cancel commands,
revision1, timer-action.v1/timer-result.v1 are supported. Installation is not a write grant.
The bridge additionally requires selected mappings, explicit enablement, valid device proof and
current HA READ+CONTROL permissions. Old clients/bridges never get a generic service fallback.

Read metadata adds `timers.status` (timer-query.v1/timer-status.v1) and `ramka.current_time`
(time-query.v1/time.v1). Only the latter can declare `runtime_source: ha_clock`; no executable
source/template is allowed. Runtime capabilities and their translations are emitted separately under
`domosenso/assistant-runtime/<component>.yaml`, with the same bounded profile envelope and provenance
checks. Older bridges ignore this directory. Existing `domosenso/assistant/` definitions, text and
bindings retain their previous shape and routes, including Ramka reads. A compatible bridge is
needed only to enable the new runtime and command capabilities. Stable timer entities are timer.<prefix>_<id>, with standard
HA states/attributes. Idle does not imply completion. See SPEC-031 for write replay/conflict and
alarm semantics; no global CAS guarantee against direct HA actions is made.

## SPEC-033 — optional room control metadata (development)

`assistant_actions` schema 1 is extended additively using a closed control branch alongside
the unchanged timer branch. The compiler APIs remain `load_actions(component_dir, manifest,
*, strict_translations=False)` and `compile_actions(component_dir, manifest, rendered_bindings,
version, sha, dirty)`. The existing profile envelope, private destination and ownership stay
unchanged. Fixed revision-1 actions: lights.turn_on/off and awnings.extend/retract/stop;
operation write, control-action.v1/control-result.v1, effect equal to the ID suffix,
empty parameters and confirmation none. Required/optional facts name declared source roles.
Bindings retain read subject/source identity. Light action subjects may additionally carry
optional group: {entity}, copied from existing rooms[].group and validated against a
declared upstream light source. The light target remains fields.light.entity; runtime
membership/grant snapshots must reject unknown membership and invalidate scope growth.
This relation does not enter read bundles or change HA package behavior.
Bindings may carry an awning wind guard with wind,
last_heard entity references and positive finite max_age_seconds from existing silence policy.
No instance inputs or default controls/grants change. See [ASSISTANT.md](ASSISTANT.md)
for exact fields, fixture paths, bridge safety requirements and upgrade/downgrade order.

Legacy schema-1 read serialization and timer output/parameter/operation semantics remain
unchanged and supported for at least one minor version. Unsupported optional sidecars are
ignored. A timer-only loader must not interpret new control sidecars as timers. New controls
require separately negotiated bridge/client support and explicit current write grants;
component installation, read exposure and future read scopes authorize no writes.
The canonical assistant-actions-bindings.yaml.j2 template is reserved metadata even when its
optional declaration is absent; it is never an HA package or a recommendation install signal.
Website impact: deferred until the component and compatible bridge/client releases are public.
