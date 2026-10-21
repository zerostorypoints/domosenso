# SPEC-002: The maintainer's whole home on Domosenso

Status: draft 2026-10-21.
Source: the maintainer, through the session that ran the first catalog deploy (ramka 0.1.1, live
2026-10-21); `docs/2026-10-20-domosenso-validation-notes.md` §2 (cut-over requirements) and §5
(operations log); `docs/COMPATIBILITY.md`; the stage 1 plan; the home repository's data audit of
2026-10-21 (entity layout after 184 renames). The home-specific inventory (every file of that home,
by name) lives in the home repository, `docs/superpowers/specs/2026-10-21-whole-home-inventory.md`,
because it names household things; this spec gives the rules and the counts only.

Statements marked **(inference)** are not verified against a running system; each names how to
verify it. Everything else was read from the repositories on 2026-10-21.

## Goal

Today one component (the Ramka) runs from the catalog, and getting it there took a dozen manual
steps: render, copy package and dashboards, install cards into `www/domosenso/<id>/<version>/`,
update twelve Lovelace resources by hand, stamp files with a commit that a later history squash
removed. Everything else in the home is the home's own YAML.

After this spec:

1. a `domosenso` command replaces those steps, with a lock file in the home repository that pins
   each component to a tag of the catalog;
2. every file of the home's Home Assistant config, ESPHome config and services is assigned to one
   of the three layers (managed by a catalog component, the home's instance, the home's local
   layer), and nothing runs only from files that exist on the server but not in the repository;
3. a script measures "100 % equivalent" between production and the home repository running on
   staging, and a second one checks production after the switch, both with a machine-readable pass
   or fail;
4. one cut-over moves production to the home repository as Domosenso renders it, files only, with
   a rollback that takes minutes;
5. the work is phased so that parallel sessions do not collide, and "done" is measurable.

Order agreed with the maintainer: his home first, then the first outside user, then the public demo.
Nothing reaches the first outside user before the maintainer has run it at home.

## 1. The `domosenso` command

### 1.1 Where it lives and how it runs

- Framework code, one entry point `domosenso` with subcommands, built on the existing
  `domosenso_render.py`, `domosenso_install.py` and `catalog_check.py` functions (their command
  lines stay as they are: STABLE in COMPATIBILITY.md).
- Run from a home repository's root: `uv run --project <catalog checkout> domosenso <command>`.
  Packaging (a `[project.scripts]` entry or a module) is the builder's choice.
- Every command prints one line per action and ends with `ok` or `FAIL <reason>`; exit 0 or 1;
  `--json` gives the same as one JSON document. Agents parse the lines, so they become STABLE
  surfaces when released (COMPATIBILITY.md, Tools).

### 1.2 Files in the home repository

| file | layer | written by |
|---|---|---|
| `domosenso.yaml` | instance | the home (once by `domosenso init`, then by hand or `add`) |
| `domosenso.lock` | managed | `domosenso` only; committed |
| `domosenso/<id>.inputs.yaml` | instance | `add` writes a skeleton once (inputs with their `example` commented), the home fills it |
| `domosenso/equivalence.yaml` | instance | the home: explained differences (section 3) |
| `domosenso/silent.yaml` | instance | the home: its silent automations and how each proves it is alive (section 3.4) |
| `.domosenso/` | not committed | cache of catalog tags, deploy backups, snapshots |

`domosenso.yaml`, the home's declaration (example in demo-home names):

```yaml
catalog: <catalog git remote or local path>
config_dir: home-assistant          # the HA config tree inside this repository
esphome_dir: esphome
targets:
  staging:    {kind: local-docker, container: ha-staging, config: staging/.data/config, url: http://127.0.0.1:8124, token_file: <path>}
  production: {kind: ssh-docker, host: <user@host>, docker: <docker command>, container: home-assistant,
               config: <config path on the host>, url: <http://host:8123>, token_file: <path outside the repo>}
components:
  ramka:
    inputs: domosenso/ramka.inputs.yaml
    langs: [en, de, pl]
    outputs:                        # optional; defaults: packages/<id>.yaml, dashboards/<id>.<lang>.yaml
      package.yaml: packages/ramka.yaml
      dashboard.<lang>.yaml: dashboards/ramka.<lang>.yaml
local:                              # the home's own files the deploy carries; globs under config_dir
  - packages/*.yaml
  - dashboards/*.yaml
  - www/*.js
resources:                          # Lovelace resources that are not a component's cards
  - {url: /local/radar-card.js, type: module}           # ?v= is added by the tool (1.5)
unmanaged_on_target:                # files on the target that the repository does not hold and the deploy must never touch
  - automations.yaml
  - scripts.yaml
  - scenes.yaml
```

`domosenso.lock`, written by the tool, one entry per component:

```yaml
# Written by domosenso — do not edit
components:
  ramka:
    version: 0.1.1
    tag: ramka/0.1.1
    commit: <full sha the tag pointed to when locked>
    files:                          # every managed file, path under the repo root, sha256 of what was written
      home-assistant/packages/ramka.yaml: {sha256: <hex>, from: templates/package.yaml.j2}
      home-assistant/www/domosenso/ramka/0.1.1/cards/agenda-card.js: {sha256: <hex>, from: cards/agenda-card.js}
    resources:
      - /local/domosenso/ramka/0.1.1/cards/agenda-card.js
```

### 1.3 Catalog at a tag, never the working tree

- The tag scheme `<component>/<version>` is FROZEN already. The tool reads a component only from
  its tag: `git archive <tag> components/<id>` (or a worktree) into
  `.domosenso/cache/<id>/<version>/`. A component that has no tag cannot be added or updated.
- The lock records the commit the tag resolved to. If the tag later resolves to another commit,
  every command fails with `FAIL tag <tag> moved: locked <sha>, now <sha>`. Tags are not moved and
  tagged history is never rewritten (the squash that removed the stamped commit on 2026-10-21
  would have been refused by this check).
- `--catalog-dev <path>` renders from a working tree instead, for developing a component against a
  real home: stamps get `-dirty`, the lock is not written, and `deploy production` refuses such
  files.
- Releasing is framework-side: `tools/release.py <id>` checks that `version` is new, that
  `UPGRADE.md` / `docs/UPGRADE_NOTES.md` have an entry when the manifest's contract surface changed,
  that `tools/check-all.sh` passes, and creates the annotated tag `<id>/<version>` locally. Pushing
  the tag stays a human step (AGENTS.md boundaries).
- First tags, created locally by this work at the current catalog commit: `ramka/0.1.1` and
  `<id>/0.1.0` for every other component. `ramka/0.1.0` cannot be tagged: its commit is gone; the
  home already runs 0.1.1.

### 1.4 Commands

| command | does | writes |
|---|---|---|
| `init` | writes `domosenso.yaml` with the targets left to fill and an empty lock | instance |
| `add <id>@<version>` | adds the component to `domosenso.yaml` and the lock, writes the inputs skeleton and the instance artifacts (`ha_instance`, ESPHome device files) once; refuses to overwrite an existing instance file | instance, lock |
| `adopt <id>@<version>` | for files a home already has from a manual render (the Ramka today): renders, compares with the files in place ignoring the first (stamp) line, and writes the lock only if every file is equal; otherwise lists the differing files | lock |
| `render [<id>...]` | renders templates, copies cards (with `lib/` and `translations/`), shell, themes and blueprints of the locked versions into `config_dir`; refuses if a managed file's sha256 differs from the lock (someone edited it): `FAIL hand-edited: <path>`; `--force` overwrites | managed, lock |
| `update <id> [--to <version>]` | moves the lock to a newer tag (default: the newest), prints every `UPGRADE.md` entry between the two versions, renders, removes the old version's managed files from the repository | managed, lock |
| `status` | per file under `config_dir` and `esphome_dir`: managed (and whether it matches the lock), instance, local, or **unclassified**; per component: locked version and newest tag | nothing |
| `deploy <target> --plan` / `--apply` | section 1.6 | target |
| `rollback <target> [<deploy id>]` | section 4.3 | target |
| `snapshot`, `compare`, `verify` | section 3 | `.domosenso/` |

`status` is the measure for "every file has a layer" (section 5, done).

### 1.5 Stamps and Lovelace resources

- New stamp: `# Rendered by Domosenso from <id>/<version> (<short sha>) — do not edit`, the tag
  first, so the stamp stays meaningful if a branch is squashed. The `--stamp` line is a STABLE
  surface: for one version the tool reads both forms (`<id>@<sha>` and the new one); the change gets
  a line in `docs/UPGRADE_NOTES.md`. The old form disappears from a home at its next `render`.
- Resources are reconciled by the tool, never by hand. The wanted set is every locked component's
  `dashboard_cards` (`/local/domosenso/<id>/<version>/cards/<name>.js`, no query string: the path
  carries the version) plus the home's `resources:` list (a `?v=<first 8 hex of the file's sha256>`
  query, so a changed file always gets a new URL and the 31-day `/local/` cache cannot serve the
  old one).
- Matching is by file name: an existing resource whose URL ends in `/<name>.js` (any directory, any
  query) is the same card. It is updated in place with `lovelace/resources/update`, keeping its
  `resource_id`; a wanted card with no match is created; two existing resources with the same file
  name fail the deploy (`customElements.define` would throw for the second). Resources nobody wants
  are listed, and removed only with `--prune-resources`.
- Resource ids differ between staging and production, so the lock holds URLs, not ids.

### 1.6 `deploy`

- Target kinds: `ssh-docker` (files go in as `tar | ssh <host> "<docker> exec -i <container> tar
  -x -C /config"`, which also handles files owned by another uid, a known trap of the current
  production host) and `local-docker` (a staging container whose config is a local directory).
- Each target keeps a record of what the last deploy wrote: `<config>/.domosenso/deployed.json`
  (path, sha256, layer, component). **(Builder-check call.)**
- `--plan` compares the repository's managed, instance and local files with the target and prints
  `add <path>`, `change <path>`, `remove <path>` (a file in the last deploy's record that the
  repository no longer has: a managed file of an old version, or a local package a component
  replaced, such as a generated presence package), `orphan <path>` (on the target, matching a
  `local:` glob, in neither the repository nor the record: a file copied by hand before the command
  existed), `keep <path>` (in no list, or under `unmanaged_on_target`: never touched), resource lines
  as in 1.5, and `restart: yes|no`.
- An `orphan` blocks `--apply` until it is decided: removed with `--remove-orphans <path>...`, added
  to the repository, or listed under `unmanaged_on_target`. A replaced package left on the target
  would load beside its replacement with the same `unique_id`s, so the first deploy to production
  (phase 1b) lists every orphan and the maintainer decides each one. Nothing outside the declared sets
  and the record is ever written or deleted.
- `--apply`: tar of every file it will replace or remove, plus the resource list as JSON, into
  `<config>/.domosenso/predeploy-<timestamp>/` on the target and `.domosenso/deploys/<target>/<timestamp>/`
  locally; copy; `check_config` inside the container, counting the `ERROR:` lines as well as the exit
  code (`check_config` exits 0 on a broken automation-blueprint instance); on any error put the old
  files back and stop before the restart; then resources; then `docker restart -t 120`; then wait for
  the API. YAML dashboards are parsed with `yaml.safe_load` before the copy (check_config does not
  read them).
- `deploy production` prints the plan and asks for the word `production` on the terminal; a
  non-interactive run needs `--confirm <plan hash>` from a plan made in the same minute. Agents still
  need the human's go-ahead in the conversation (AGENTS.md); the prompt is a second lock, not the
  permission.
- After the restart: `verify <target>` (3.4) runs on its own when a baseline snapshot exists.

### 1.7 What stays manual, and why

| step | why it stays with a human |
|---|---|
| Adding integrations, entering credentials, OAuth, discovery confirmations | they live in `.storage`; the switch never touches it (validation notes §2.1) |
| Installing custom integrations into `custom_components/` | no HACS in a Container install, root-owned directory, versions chosen per integration; the manifests' `integrations.setup` lists them; `status` prints them with the version the home declares |
| A user's profile settings (language, time format, default dashboard) | stored in `.storage/frontend.user_data_<user id>`, readable over the API only by that user; changed in the profile or, for a kiosk user, in the file with HA stopped. `verify` reads it (4.4); nothing writes it |
| Entity and device registry edits (renames, areas, orphans) | `.storage` again; the home's registry tool applies a reviewed plan |
| Flashing an ESPHome device | AGENTS.md boundary; `esphome config` proves the config, a human flashes |
| Pushing tags, opening pull requests | AGENTS.md boundary |
| Changing how a container runs | outside the switch; section 2.4 |
| Restoring a full backup | last-resort rollback (4.3), never automatic |

## 2. Inventory: every file gets a layer

### 2.1 The rule

A thing enters the catalog only if it would work in a second home **unchanged**, with everything
home-specific moved into typed inputs. When in doubt it stays local: promoting a local package later
costs a spec and a render; demoting a catalog component costs a deprecation. Things that only one
home has the hardware for are local until a second home has it ("catalog candidate").

### 2.2 The maintainer's home, in counts (details in the home repository's inventory)

| kind | count | managed (catalog) | instance | local |
|---|---|---|---|---|
| HA packages | 13 | 1 now (Ramka); 5 more after phase 3 | `configuration.yaml`, inputs files, blueprint instances | 7 |
| YAML dashboards | 14 files (12 dashboards) | 3 (the Ramka in three languages) | — | 11 |
| Cards and frontend files under `www/` | 12 catalog cards, 2 own cards, 2 third-party, 2 generated SVGs | the 12 | — | 6, of which one third-party card exists **only on the server** |
| Shell scripts | 4 | 2 now, 3 after phase 3 | — | 1 |
| Themes | 1 | 1 | — | — |
| Blueprints | 0 today | 2 after phase 3 (presence, proxy offline) | — | — |
| ESPHome | 10 device files, 3 shared files, 1 capture tool | 2 shared files become the catalog's remote packages | 10 thin device files | 1 shared file (optional IR), the capture tool |
| Containers | 6 (HA, MQTT broker, tunnel, the awning radio's frame bridge, two vacuum-agent containers) | the frame bridge after phase 3 (`awnings`) | — | the other 5; all 6 are started with `docker run` today, no compose file |
| Custom integrations | 5 | — | listed in `domosenso.yaml` with versions | — |

### 2.3 Catalog work this implies

Packages that would work unchanged elsewhere, with their inputs, each the next minor version of a
component that exists today as a description only (stage 1 gave them no artifacts):

| component | gets | inputs (in demo-home terms) | silent automations it carries |
|---|---|---|---|
| `bermuda-presence` 0.2.0 | the pilot's blueprints become the live path: `presence_room` template blueprint (replaces a generated presence package), `ble_proxy_offline` automation blueprint; `ha_instance` written once from inputs | rooms, phones, tablets, proxies, offline_notify, minutes (manifest has them) | proxy offline |
| `backup` 0.1.0 (new) | nightly `backup.create`, catch-up after start, rolling retention script, age / count / size sensors, stale alert | time, keep_daily, keep_weekly, stale_hours, notify | backup itself, stale alert |
| `plants` 0.2.0 | plant entities from sensor sets, water reminder, silent-sensor alert | plants (sensors, bands; the Ramka's `plants` input shape), notify, silent_hours | water reminder, sensor silent |
| `awnings` 0.2.0 | MQTT covers for ESPSomfy-RTS shades (discovery is broken in firmware 2.4.6, see its README), retract at sunset, wind sensor heard / silent, and the frame bridge as a compose service (the wind sensor's state and the retained cover positions come from it, not from the node) | shades (id, name), wind sensor id, retract offset, notify; bridge: node host, broker credentials file | wind sensor silent |
| `climate-air` 0.2.0 | indoor mean / min / max, outside, indoor-outdoor difference, most humid room, lowest battery, bathroom humidity flag | rooms (temperature, humidity, battery), outside, bathrooms | — |
| `lights` 0.2.0 | per-room template lights that count a room as on only while a bulb is reachable and on (wall switches cut bulb power; the bridge's group keeps a stale state), lights-on count, lowest battery | rooms (Hue group), battery sensors | — |

The entity ids these packages create must equal what the home has today (the audit fixed the
naming), and so must the `unique_id` of every entity and the `id` of every automation: on
production the entity registry maps `(platform, unique_id)` to the entity id, so a changed
`unique_id` gives a new entity (`_2` suffix, history left behind) even when the id looks the same on
a fresh staging registry. Where a template cannot produce the home's ids, the input carries them
(`unique_id`, `default_entity_id`), as the presence pilot's instance file already does. A rename in
this work is a failure of the equivalence check, not a migration step.

Each row is a component change with its own short spec (skill `write-component-spec`), written in
phase 3 and approved by the maintainer as one batch; this spec approves the list and the rule.

Stays local in this home (catalog candidates later, when a second home has the device): the
amplifier's listening statistics, the desk log from the office radar and its card, the lock's MQTT
extras, the vacuum's statistics and its notification clean-up, the recorder purge list, the
condenser-heat alert, the corridor motion light, the button that turns every light off, the floor
plan and its generator, every dashboard except the Ramka's.

### 2.4 Containers

- At the cut-over no container changes: the switch is Home Assistant files.
- Done includes one compose file per service in the home repository (instance layer), generated
  from `docker inspect` of the running container and checked by diffing the inspect output of a
  container created from it on staging. Switching production containers to compose is a separate,
  later step with its own go-ahead.
- Catalog candidate: an `mqtt-broker` component (compose service plus config) that `awnings` and a
  lock component would require; AGENTS.md says a component's services ship as compose services, and
  `awnings` 0.2.0 needs a broker. Until it exists, `awnings` lists the broker under `devices` as a
  requirement the home provides.

## 3. Equivalence

### 3.1 What is compared

`domosenso snapshot <target> --out <file>` reads, over the REST and websocket APIs, read-only:

| part | source | compared |
|---|---|---|
| entities from files | entity registry (`config/entity_registry/list`: platform, unique_id, disabled_by) and `GET /api/states` | entity ids of every file-defined platform: template, group, input_*, timer, counter, automation, script, utility_meter, history_stats, statistics, command_line, mqtt, plant, folder and any other platform with no config entry; plus state entities with no registry entry; and the set of `(platform, unique_id)` pairs, because staging's registry is fresh and derives ids from names while production's keeps them by `unique_id` |
| automations, scripts | states (`id` attribute, `on` / `off` / `unavailable`), `automation/config` and `script/config` **(inference: websocket commands taking `entity_id`; verify on staging)** | id, entity id, loaded, enabled, sha256 of the config as canonical JSON |
| helpers | state attributes | options in order, min, max, step, mode, has_date, has_time, duration |
| dashboards | `get_panels`, `lovelace/config` per url_path **(inference: also returns YAML-mode dashboards; verify)** | url_path, title, icon, require_admin, sha256 of the config as canonical JSON |
| Lovelace resources | `lovelace/resources` | URL without query, type |
| config entries | `config_entries/get` | domain, title, state; informational only (staging has none) |
| health | `system_log/list` | ERROR entries; for `verify` |

Entities owned by an integration (Hue, Tapo, ESPHome devices…) are not compared: staging has no
integrations and gets their states copied from production.

`domosenso compare <a> <b> --explain domosenso/equivalence.yaml` prints per part `ok <part> (<n>)` or
`FAIL <part>: <n> differences` with one line per difference (`only-in-a`, `only-in-b`,
`config-differs`, `options-differ`), and ends with `equivalent` or `not equivalent: <n> unexplained`.
Exit 0 only when every difference matches an explanation; an explanation that matches nothing is a
warning (`stale explanation`).

`equivalence.yaml` entries: `{part, id, kind: renamed|added|removed|config|ignore, to?, reason}`. A
`config` entry says the maintainer or the reviewing session read both configs and they behave the
same; it names the commit it was reviewed at, so a later change of either side invalidates it.

### 3.2 Staging must run the whole home

Today staging loads one package (the Ramka's). For the check it needs the whole home:

- a `--full` mode of the home's staging tool: every package, dashboard, blueprint, card, shell
  script and theme from the repository, `configuration.yaml` as the home has it, minus `default_config`
  and discovery (as now);
- a throwaway MQTT broker container on staging and an MQTT config entry pointing at it, so `mqtt:`
  entities load (nothing connects to the house);
- the state mirror and the service stubs as today.

This is home-repository work (its staging tool), listed in the plan. Division of work
**(builder-check call)**: in `--full` mode staging's config is a plain directory with no read-only
mounts from the repository; `domosenso deploy staging` writes the files into it and reconciles the
resources exactly as on production; the staging tool keeps the container's lifecycle, the
onboarding, the MQTT broker, the state mirror, the statistics copy and the stubs, and stops writing
resource URLs or card files in that mode. The Ramka-only mode with mounts stays as it is for quick
card work.

### 3.3 Two comparisons, in order

1. **Fidelity:** production against staging running the home repository **as it is today**, before
   any component changes. Every difference here is a staging artefact (an integration-owned helper,
   a missing directory) and goes into `equivalence.yaml` as `ignore` with its reason. This proves the
   check before it is trusted.
2. **Migration:** production against staging running the branch with the catalog components
   rendered. A difference that is not an `ignore` from step 1 must be zero, or explained one by one.

### 3.4 After the switch: `domosenso verify <target> --baseline <snapshot>`

Runs right after the restart, again after 10 minutes, and with `--day-after` the next morning:

- every automation and script in the baseline is loaded, with the same on / off state;
- no entity that had a value in the baseline is `unavailable` or `unknown`, except those listed in
  `equivalence.yaml` with `after_restart: unknown` (values that only come with the next event, such
  as a wind sensor's next report or a player's next stream);
- 0 ERROR entries in the system log from configuration, templates or automations;
- every Lovelace resource URL answers 200, and no two resources share a file name;
- every user profile the home lists (kiosk users) has the language its dashboard is rendered in
  (4.4);
- every entry of `domosenso/silent.yaml` passes. Entry kinds: `loaded_on` (automation loaded and
  enabled), `triggered_within: <hours>` (its `last_triggered` is newer; checked with `--day-after`),
  `entity_fresh: {entity, max_age}` (a sensor such as the newest backup's age). The home's list
  starts from validation notes §2.4: backups, sensor-silence and device-offline alerts, logbook
  writers, purges, notification clean-ups.

Output and exit code as `compare`.

## 4. Cut-over and rollback

### 4.1 Before

- Phase 3 merged in the home repository; `domosenso status` shows no unclassified file; migration
  comparison `equivalent`; a rollback rehearsed on staging (deploy, rollback, snapshot equals the
  one before).
- Any repository that still commits to production files (the home's pre-split repository) is
  merged first, or production would lose its commits.
- The maintainer's go-ahead in the conversation, for this deploy.

### 4.2 The switch

1. Read the clock. `domosenso snapshot production --out cutover/<date>/before.json`.
2. Full backup as a fallback: the home's nightly backup has run within 24 h, or one is made now.
3. `domosenso deploy production --plan`, read by the maintainer: no `remove` outside managed files
   the old lock owned, no `change` to an unmanaged file.
4. `domosenso deploy production --apply` (copy, `check_config` with ERROR count, resources in place,
   restart; HA restarts rather than reloads, because a reloaded `input_select` keeps a state that is
   no longer an option).
5. Wake the kiosk page (the Ramka's reload button) so the tablet loads the new resources.
6. `domosenso verify production --baseline before.json` now, after 10 minutes, and the next morning.
7. Registry orphans: none expected (no id changes). Any the verify lists are removed with the home's
   registry tool, with the go-ahead.

Downtime: one restart, a few minutes; the maintainer accepted living without automations meanwhile.

### 4.3 Rollback

- **Files (minutes):** `domosenso rollback production` puts back the files from
  `predeploy-<timestamp>`, removes the files the deploy added, restores the resource URLs by
  `resource_id`, restarts. `.storage` and the recorder were never touched, so nothing else needs
  restoring. Rehearsed on staging before the cut-over.
- **Last resort:** restore the full backup from step 2 (loses the history recorded since).
- **ESPHome** (phase 5 only): reflash the previous firmware from the old device files, one device at
  a time.

### 4.4 The Ramka's profile settings

Nothing changes for them: the language and time format of the kiosk user stay in `.storage` and the
switch does not touch it. What must hold is that the dashboard file `configuration.yaml` loads is the
language in that profile (the cards and Home Assistant's state names follow the profile, the
rendered labels follow the file). `verify` reads `.storage/frontend.user_data_<id>` of each kiosk user
the home lists, read-only over the target's shell, and fails on a mismatch. Changing the language
stays a profile edit (with HA stopped for a kiosk user). **(Follow-up, not in this spec:** a Ramka
input that fixes the cards' language regardless of the profile would remove this coupling.)

### 4.5 The home repository afterwards

- `AGENTS.md` (from a template this work adds to the framework; `CLAUDE.md` = `@AGENTS.md`): where
  staging and production are, the commands (`render`, `update`, `deploy staging`, `deploy production
  --plan`, `verify`), the layers table with "never edit a file whose first line says Rendered by
  Domosenso", the silent list's place, the boundaries.
- `README` "Deploying a change" becomes the commands; the hand-copy recipes (ssh `cat >`, manual
  resource updates, the ten-step Ramka checklist) go, except what 1.7 keeps manual. The "Files"
  list is split into managed (the lock), instance and local.
- The deploy history is the lock's git history plus `.domosenso/deploys/` (validation notes §5:
  component, version, date, what changed).

## 5. Phases

| phase | what | where | parallel | ends when |
|---|---|---|---|---|
| 0 | this spec approved; first tags created locally; `tools/release.py` | framework | — | tags exist; `release.py` tested |
| 1 | the command: config, lock, catalog at tag, `init` / `add` / `adopt` / `render` / `update` / `status`, stamps, resources, `deploy` to staging, `rollback` | framework | with phase 2 once the snapshot format is fixed | `adopt ramka@0.1.1` succeeds on the home as it is (the Ramka's rendered files equal what the home has); a staging deploy and a rollback round-trip leave staging as before |
| 2 | `snapshot` / `compare` / `verify`; staging `--full` with an MQTT broker (home repository) | framework + home | with phase 1 | the fidelity comparison (3.3 step 1) is `equivalent` with every `ignore` explained |
| 1b | first production use of the command: `deploy production` of the adopted Ramka (no content change: only the stamp line and resource URLs' form) | home | after 1 | production unchanged in behaviour, the lock in the home repository, `verify` passes |
| 3 | one session per component of 2.3 (spec, templates, demo-home inputs, `ha-check`, home inputs, migration comparison of its own entities) | framework + home branch | yes: one session per component directory; shared files (`tests/test_catalog_content.py`, `README.md` table, demo-home inputs) merge in sequence | each component tagged; the home branch with all of them is `equivalent` on staging |
| 4 | cut-over (section 4) | home, production | — | `verify` passes three times (now, 10 min, next morning) |
| 5 | ESPHome thin device files on the catalog's packages; compose files for the containers | home (+ framework if the package needs changes) | ESPHome and compose in parallel | `esphome config` of every device file equals the running firmware's config except `project:`; one device flashed and a day without problems, then the rest (each flash with the go-ahead); compose inspect diff empty |

Order inside phase 3, by what the first outside user also needs (Synology host, Tapo sensors, a
network player, the Ramka): `backup`, `climate-air`, then `bermuda-presence` (already proven in the
pilot), `plants`, `awnings`, `lights`.

**Done** means all of:

1. `domosenso status` in the home repository: 0 unclassified files, every managed file matches the
   lock;
2. `domosenso deploy production --plan`: nothing to add, change, remove, and no orphan (production
   runs exactly the repository);
3. the migration comparison `equivalent`, `verify` passed three times after the cut-over;
4. the home's `AGENTS.md` and README describe the commands, not the hand steps;
5. phase 5 done or explicitly deferred by the maintainer.

## Compatibility

- New STABLE surfaces when released: the `domosenso` command lines and their output lines,
  `domosenso.yaml`, `domosenso.lock`, `equivalence.yaml`, `silent.yaml` formats (each gets a row in
  COMPATIBILITY.md and a schema in `schemas/`).
- Changed STABLE surface: the `--stamp` line (1.5), with the one-version bridge in the reader and a
  line in `docs/UPGRADE_NOTES.md`.
- No existing component's entities change. The six component versions of 2.3 add artifacts; their
  `provides` are the home's current ids, ADDITIVE-ONLY additions to the manifests.

## Tests

- pytest for every command against a temporary home repository and a temporary catalog repository
  with tags: lock written and read, moved tag refused, hand-edited managed file refused, `adopt`
  equal and unequal, `update` printing UPGRADE entries and removing the old version, `status`
  classifying, `deploy --plan` against a fake target directory, resource reconciliation against a
  fake websocket (update in place, create, duplicate refused, prune only with the flag), stamp reader
  accepting both forms, `compare` with and without explanations, stale explanation warned.
- `tools/check-all.sh` gains a step for the command's tests if they do not run under `pytest` already.
- Staging: fidelity comparison (phase 2), rollback rehearsal (phase 1, 4.1).
- Production: `verify` (phase 1b, phase 4).

## Out of scope

- The first outside user's home and any component only that home needs.
- A framework-side staging command; staging stays the home's tool (a later spec, once a second home
  needs one).
- Switching containers to compose on production.
- A check that diffs `provides` between tags mechanically (SPEC-001 out of scope, still).
- The operations-log component (validation notes §5, later).

## Open questions

1. **One cut-over or component by component?** The maintainer decided on 2026-10-20 to switch once
   when the home repository is 100 % equivalent. The Ramka has since gone live on its own, and phase 3
   produces components that each could be deployed alone. This spec keeps one cut-over, preceded by
   phase 1b (the command's first production run on the already-live Ramka). The maintainer confirms.
2. **ESPHome packages from a private repository.** The FROZEN remote package URL is
   `github://domosenso/domosenso/...`; the repository is private and under another account
   (verified: `git remote -v`). ESPHome fetches `github://` over HTTPS without credentials
   **(inference: a private repository fails; verify with one `esphome config`)**. Options: make the
   repository public at that path before phase 5; or a vendored mode where the command copies the
   package files from the tag into `esphome/domosenso/<id>/<version>/` (managed) and device files
   `!include` them. Recommendation: vendored mode until the repository is public; it is additive.
3. **The local-versus-catalog calls of 2.3** (amplifier statistics, desk log, lock extras, vacuum
   statistics stay local). The maintainer confirms or moves one.
4. **Compose files in "done"**, or deferred.
5. **Reading production without asking.** Phase 2 and every phase 3 session need production
   snapshots (REST and websocket reads with the token; `verify` also reads a kiosk user's profile
   file over ssh). AGENTS.md requires a go-ahead for deploys, not for reads. Proposal: read-only
   calls to production are allowed without asking, in the framework's and the home's AGENTS.md;
   otherwise the maintainer takes one baseline snapshot and the sessions share the file.
6. **The ESPHome URL is under another account.** Open question 2 continued: making the repository
   public is not enough for the FROZEN `github://domosenso/domosenso/...` form; it would also have to
   move to that account and name. Vendored mode is phase 5 work and only matters if phase 5 is in
   "done".
7. **Packages and `lovelace:`.** **(inference)** Home Assistant packages cannot declare `lovelace:`
   dashboards, so a component's dashboard needs an entry in the home's `configuration.yaml`, which is
   instance. The command then checks the entry exists (`status`) and prints the lines to add; it never
   edits `configuration.yaml`. Verify on staging in phase 1.
