# The maintainer's whole home on Domosenso: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a `domosenso` command that renders, installs, updates, deploys and rolls back catalog
components in a home repository against a lock file, plus the snapshot / compare / verify checks that
measure equivalence, then the home's first production run with it (the Ramka alone) and the per-component
migration up to one cut-over.

**Architecture:** a Python package `tools/domosenso_cli/` beside the existing tools, one module per
concern (home config, lock, catalog at a tag, stamps, build, resources, HA API client, targets, deploy,
snapshot, compare, verify), installed as the `domosenso` console script of the framework's `pyproject.toml`
and run from a home repository as `uv run --project <catalog checkout> domosenso <command>`. It reuses
`domosenso_render.render_component`, `catalog_check.install_dir` / `install_files` and the
`check_config` error counting of `tools/ha-check.sh`. Home-repository work (staging `--full`, the home's
`domosenso.yaml`, its `AGENTS.md`) is done in the home repository on its own branch.

**Tech Stack:** Python 3.11+, uv, pytest, PyYAML, Jinja2, jsonschema, `websockets>=13`, git, Docker,
ssh; Home Assistant 2026.9.2 (staging image `homeassistant/home-assistant:2026.9.2`).

**Status:** approved by the maintainer 2026-10-21; executed subagent-driven.

**Coordination** (AGENTS.md, "Plans that span several pull requests"; adopted 2026-10-21): the
coordinator is the session "Domosenso architektura i komponenty" (`local_db9336a6`). The feature branch
is `feature/whole-home`; every sub-session opens its pull request into it, the coordinator reviews it
against this plan and the specs and merges in plan order. Home-repository tasks use a feature branch of
the same name in the home repository. The table below is kept current by the coordinator.

Known hazard: `tools/ha-check.sh` uses one work directory per component under `$TMPDIR`, so two sessions checking the same component at once collide (seen 2026-10-21); run checks one at a time or give the work directory a per-worktree suffix.

| task | state | session (branch) |
|---|---|---|
| 1–9 | done, reviewed, on `feature/whole-home` | executor `local_4a35c383` (`claude/whole-home-spec-e7a681`) |
| 10 Lovelace resources | done, on `feature/whole-home` | executor `local_4a35c383` |
| 11 targets | done, merged (#2) | executor `local_4a35c383` |
| 12 deploy / rollback | in progress | executor `local_4a35c383` |
| 13 staging `--full`, home `domosenso.yaml`, Ramka adopted (home repo) | waiting for 12 | executor `local_4a35c383` |
| 14–16 snapshot / compare / verify | done, merged (#1, #3); 14 Step 5 waits for 13; COMPATIBILITY.md rows go to Task 18 | `local_3bd19b01` (`claude/equivalence-3dd81e`) |
| 17 fidelity comparison (home repo) | waiting for 13–16 | to assign |
| 18 home AGENTS.md + first production deploy (Ramka) | waiting for 17; production go-ahead typed by the maintainer | to assign |
| 19 components, Steps 1–2 (six specs approved) | done, merged (#4) | `local_06cf3620` (`claude/components-batch-0efe9b`) |
| 19 components, Steps 3–5 | waiting for 13 and 19 Steps 1–2 | to assign |
| 20 cut-over | waiting for 17–19; production go-ahead typed by the maintainer | to assign |

**Spec:** `.ai/specs/SPEC-002-2026-10-21-whole-home-on-domosenso.md` (approved 2026-10-21). The home's
inventory: home repository, `docs/superpowers/specs/2026-10-21-whole-home-inventory.md`.

## Global Constraints

- Pinned versions: Home Assistant `2026.9.2`, ESPHome `2026.9.1`. Python `>=3.11`, run through `uv run`.
- Tags: `<component>/<version>` (FROZEN), annotated, created locally; pushing is a human step.
- Remote package URL after Task 1: `github://zerostorypoints/domosenso/components/<id>/<path>@<component>/<version>`.
- Stamp: `# Rendered by Domosenso from <id>/<version> (<short sha>) — do not edit`; the reader also accepts the old `# Rendered by Domosenso from <id>@<sha>[-dirty] — do not edit` for one version.
- Card resources: `/local/domosenso/<id>/<version>/cards/<name>.js`, type `module`, no query; the home's own resources get `?v=<first 8 hex of sha256 of the file>`.
- Every command prints one line per action and ends with `ok` or `FAIL <reason>`, exit 0 / 1; `--json` prints one JSON document instead.
- `check_config` passes only with exit 0 **and** zero `ERROR:` lines (it exits 0 on a broken automation-blueprint instance).
- Files only: no command writes `.storage`, the recorder database, `configuration.yaml`, or a target file outside the declared sets and the target's `deployed.json` record.
- Unit tests touch no network, no Home Assistant and no Docker: fake targets, a fake websocket, temporary git repositories.
- Boundaries (AGENTS.md): staging freely; production writes, deploys, restarts and registry edits only with the maintainer's go-ahead **typed in the session doing them** (a relayed consent is refused by the permission classifier); production reads are allowed (SPEC-002 decision 2). No push, no PR without asking.
- Privacy: nothing from the real home in this repository (`tests/test_catalog_content.py::test_privacy`); examples use the demo home.
- Text in English; commit messages in the style of `git log`; every commit after `tools/check-all.sh` (or at least `uv run pytest -q` and `uv run tools/catalog_check.py --strict` for tasks that touch no component).

## Review Focus

1. **A file a component used to own is left on the target after an update or a replacement** — a reasonable person expects the deploy to remove it, or to stop and ask; never a duplicate `unique_id`. Test: `test_plan_removes_file_dropped_from_record` and `test_orphan_blocks_apply` (Task 12).
2. **The deploy dies between the backup and the restart** (ssh drops mid-copy, `check_config` cannot run) — the target must be restorable from the backup taken before the first byte was written. Test: `test_copy_failure_restores_backup` (Task 12).
3. **Two things claim the same file**: two components shipping `shell/<same name>`, or a home resource with the same file name as a component card — refused with both owners named, never silently overwritten. Tests: `test_shell_collision_between_components` (Task 7), `test_home_resource_clashes_with_component_card` (Task 10).
4. **An automation that fails to load** appears as `unavailable` (or not at all) on one side — compare must report it as `not-loaded`, not as equal because the id exists. Test: `test_unavailable_automation_is_not_loaded` (Task 15).
5. **Production keeps entity ids by `unique_id`, staging derives them from names** — a component that changes a `unique_id` must fail the comparison even when the entity id matches. Test: `test_changed_unique_id_fails` (Task 15).

---

## Phase 0 — framework groundwork

### Task 1: Package URL under the repository's real account

**Files:**
- Modify: `docs/COMPATIBILITY.md` (Distribution row), `AGENTS.md` (ESPHome bullet), `.ai/skills/new-component/SKILL.md:26`, `components/bermuda-presence/component.yaml:55`, `components/bermuda-presence/esphome/{ble-proxy.yaml,ld2410.yaml,ble-proxy.factory.yaml}`, both blueprints' `source_url` (`https://github.com/zerostorypoints/domosenso/blob/main/...`), `examples/demo-home/esphome/ble-proxy-{dining,living-room}.yaml`, `tools/esphome-check.sh:41-43`, `docs/UPGRADE_NOTES.md`
- Test: `tests/test_esphome_check.py`

- [ ] **Step 1:** In `tests/test_esphome_check.py`, change the fixture's device files to `github://zerostorypoints/domosenso/...` and add `test_old_url_form_is_skipped`: a device file with `github://domosenso/domosenso/components/radio/...` is reported `skipped` (no package of the component).
- [ ] **Step 2:** `uv run pytest tests/test_esphome_check.py -v` → the new and changed tests FAIL.
- [ ] **Step 3:** Change the pattern and the membership test in `tools/esphome-check.sh` to `github://zerostorypoints/domosenso/`; replace the old form in every file listed above (SPEC-001 and `docs/research/` keep it as history).
- [ ] **Step 4:** `git grep -n "github://domosenso\|github.com/domosenso"` lists only `.ai/specs/SPEC-001*`, `.ai/specs/SPEC-002*` and `docs/research/`; `uv run pytest -q` passes; `tools/esphome-check.sh bermuda-presence` prints `config ok` for every file (it downloads ESPHome through `uvx`).
- [ ] **Step 5:** Add to `docs/UPGRADE_NOTES.md` a `2026-10-2x: remote package URL` entry: the account changes before any home used the URL, no bridge (COMPATIBILITY.md rule for unreleased components). Run `tools/check-all.sh`; commit `Remote package URL under zerostorypoints/domosenso (SPEC-002 decision 3)`.

### Task 2: `tools/release.py` and the first tags

**Files:**
- Create: `tools/release.py`
- Test: `tests/test_release.py`

**Interfaces:**
- Produces: `release(catalog: Path, component_id: str, skip_checks: bool = False) -> str` (the tag name); raises `ReleaseError(str)`. CLI: `uv run tools/release.py <id> [--skip-checks]`, prints `tag <id>/<version> at <short sha>` / `ok` or `FAIL <reason>`.

- [ ] **Step 1: Write the failing tests** in `tests/test_release.py`, each on a temporary git repository with one component `radio`:
  - `test_creates_annotated_tag` — `release(repo, "radio", skip_checks=True) == "radio/1.0.0"`; `git cat-file -t radio/1.0.0` is `tag`.
  - `test_refuses_existing_version` — a second call raises `ReleaseError` containing `radio/1.0.0 exists`.
  - `test_refuses_dirty_component` — an uncommitted change under `components/radio/` raises, message contains `uncommitted`.
  - `test_needs_upgrade_entry_when_contract_changed` — after tag `radio/1.0.0`, change `provides` and bump to `1.1.0` without a `## 1.1.0` heading in `components/radio/UPGRADE.md` → raises with `UPGRADE.md`; with the heading → tag `radio/1.1.0`.
  - `test_runs_check_all_unless_skipped` — with `skip_checks=False` and a `tools/check-all.sh` stub that exits 1 → raises with `check-all`.
- [ ] **Step 2:** `uv run pytest tests/test_release.py -v` → FAIL (`No module named release`).
- [ ] **Step 3:** Implement `release()` in `tools/release.py`: read `components/<id>/component.yaml`; "contract changed" = `inputs`, `provides` or `artifacts` differ from the manifest at the newest earlier `<id>/*` tag (`git show <tag>:components/<id>/component.yaml`); `git tag -a <id>/<version> -m "<id> <version>"`.
- [ ] **Step 4:** `uv run pytest tests/test_release.py -v` → PASS.
- [ ] **Step 5:** Commit `tools/release.py: tag a component release after its checks`.
- [ ] **Step 6:** Create the first tags at this commit: `uv run tools/release.py <id>` for `ramka` (0.1.1) and `awnings bermuda-presence calendar climate-air lights media plants weather` (0.1.0). `git tag -l` lists nine tags. Do not push.

## Phase 1 — the command

### Task 3: Package skeleton and reporter

**Files:**
- Modify: `pyproject.toml` (build system, `[project.scripts] domosenso = "domosenso_cli.main:main"`, `[tool.setuptools] package-dir = {"" = "tools"}`, `packages = ["domosenso_cli"]`, `py-modules = ["catalog_check", "domosenso_render", "domosenso_install", "check_config_parse"]`, dependency `websockets>=13`)
- Create: `tools/domosenso_cli/__init__.py`, `tools/domosenso_cli/main.py`, `tools/domosenso_cli/report.py`
- Test: `tests/test_cli_main.py`

**Interfaces:**
- Produces: `main(argv: list[str] | None = None) -> int`; subcommands `init add adopt render update status deploy rollback snapshot compare verify`, each `--json`, and a global `--home <path>` (default: cwd). `class Reporter(json_mode: bool)`: `line(kind: str, *fields: str)`, `ok() -> int`, `fail(reason: str) -> int`, `data: list[dict]`. Every command module exposes `run(args, rep: Reporter) -> int`; `DomosensoError(str)` caught in `main` → `rep.fail(str(exc))`.

- [ ] **Step 1:** Tests: `test_help_lists_commands` (`main(["--help"])` output names all eleven); `test_reporter_text` (`line("add", "a.yaml")` then `ok()` prints `add a.yaml\nok`, returns 0); `test_reporter_json` (same in JSON mode prints one document `{"lines": [["add", "a.yaml"]], "result": "ok"}`); `test_error_becomes_fail` (a command raising `DomosensoError("x")` → last line `FAIL x`, exit 1).
- [ ] **Step 2:** `uv run pytest tests/test_cli_main.py -v` → FAIL.
- [ ] **Step 3:** Implement; subcommands not built yet raise `DomosensoError("not implemented")`.
- [ ] **Step 4:** Tests PASS; `uv run domosenso --help` works from the repository root and, with `--project`, from another directory.
- [ ] **Step 5:** Commit `domosenso command: package, subcommands, reporter`.

### Task 4: Home config and lock

**Files:**
- Create: `tools/domosenso_cli/home.py`, `tools/domosenso_cli/lock.py`, `schemas/home.schema.json`, `schemas/lock.schema.json`
- Test: `tests/test_cli_home_lock.py`

**Interfaces:**
- Produces:
  - `@dataclass Target(name, kind: Literal["local-docker","ssh-docker"], container: str, config: str, url: str, token_file: Path, host: str | None = None, docker: str = "docker")`
  - `@dataclass ComponentEntry(id: str, inputs: Path, langs: list[str], outputs: dict[str, str])`
  - `@dataclass HomeConfig(root: Path, catalog: str, config_dir: Path, esphome_dir: Path, targets: dict[str, Target], components: dict[str, ComponentEntry], local: list[str], resources: list[dict], unmanaged_on_target: list[str], kiosk_users: list[str], custom_integrations: dict[str, str])`; `HomeConfig.load(root: Path) -> HomeConfig` (validates against the schema; `DomosensoError` names the key).
  - `@dataclass FileRecord(sha256: str, from_: str, layer: Literal["managed","instance"])`; `@dataclass LockEntry(version, tag, commit, files: dict[str, FileRecord], resources: list[str])`; `Lock.load(root) -> Lock` (empty if absent), `Lock.save(root)` (first line `# Written by domosenso — do not edit`, keys sorted), `lock.components: dict[str, LockEntry]`, `lock.owner(path: str) -> str | None`.
- [ ] **Step 1:** Tests: `test_home_round_trip` (the spec's 1.2 example in demo-home names loads; defaults `outputs` empty, `langs` `[en, de, pl]`); `test_home_unknown_key_rejected` (message names the key); `test_lock_round_trip` (save then load is equal, first line exact); `test_lock_owner` (path → component id, unknown → None).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS (`catalog_check --strict` still passes: schemas are only read by the CLI).
- [ ] **Step 5:** Commit `domosenso command: domosenso.yaml and domosenso.lock`.

### Task 5: Catalog at a tag

**Files:**
- Create: `tools/domosenso_cli/catalog.py`
- Test: `tests/test_cli_catalog.py`

**Interfaces:**
- Produces: `class Catalog(source: str, cache: Path)` with `ensure() -> None` (a local path is used as is; a URL is mirrored into `<cache>/catalog.git` with `git clone --mirror`, later `git fetch --tags --prune`), `tag_commit(cid, version) -> str` (full sha; `DomosensoError("no tag <cid>/<version>")`), `versions(cid) -> list[str]` (sorted semver), `checkout(cid, version, expect_commit: str | None) -> Path` (`git archive <tag> components/<cid>` extracted to `<cache>/components/<cid>/<version>/`, returns the component dir; `TagMoved` — a `DomosensoError` with text `tag <tag> moved: locked <a>, now <b>` — when `expect_commit` differs), `dev_dir(path: Path, cid) -> Path`.
- [ ] **Step 1:** Tests on a temporary catalog repository: `test_checkout_tag_contents` (file content at the tag, not the working tree after a later commit); `test_missing_tag`; `test_versions_sorted` (`0.2.0, 0.10.0` order); `test_moved_tag_refused` (re-tag with `-f` on a new commit → `TagMoved`); `test_mirror_from_url` (a `file://` URL is mirrored and checked out).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `domosenso command: read components from their tag`.

### Task 6: Stamps

**Files:**
- Create: `tools/domosenso_cli/stamps.py`
- Modify: `tools/domosenso_render.py` (`render_component(..., stamp_text: str | None = None)`: when given, it is the first line instead of `stamp_line()`; the command line is unchanged), `docs/COMPATIBILITY.md` (Tools: the stamp row), `docs/UPGRADE_NOTES.md`
- Test: `tests/test_cli_stamps.py`, `tests/test_render.py`

**Interfaces:**
- Produces: `stamp(cid: str, version: str, sha: str, dirty: bool = False) -> str` → `# Rendered by Domosenso from ramka/0.1.1 (a535d00) — do not edit\n` (`(a535d00-dirty)` when dirty); `@dataclass Stamp(cid, version: str | None, sha: str, dirty: bool)`; `parse(first_line: str) -> Stamp | None` (both forms); `body(text: str) -> str` (text without a stamp line, unchanged if none).
- [ ] **Step 1:** Tests: `test_stamp_exact`; `test_parse_new`; `test_parse_old` (`# Rendered by Domosenso from ramka@a535d00 — do not edit` → version None); `test_parse_old_dirty`; `test_parse_other_line_is_none`; `test_body_strips_only_stamp`; in `test_render.py`, `test_stamp_text_overrides`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** COMPATIBILITY.md stamp row: both forms, the old one read until the next minor version; UPGRADE_NOTES line. Commit `Stamps name the tag: <id>/<version> (<sha>)`.

### Task 7: Build: `render` and `adopt`

**Files:**
- Create: `tools/domosenso_cli/build.py`, `tools/domosenso_cli/cmd_render.py`
- Test: `tests/test_cli_build.py` (fixture: a temporary catalog with a component `panel` that has a lang template, a plain template, a card with `lib/` and `translations/`, a shell script, a theme and an automation blueprint, tagged `panel/1.0.0`; a temporary home with `domosenso.yaml`)

**Interfaces:**
- Consumes: `HomeConfig`, `Lock`, `Catalog.checkout`, `stamps.stamp/body`, `render_component(..., stamp_text=)`, `install_dir`, `install_files`.
- Produces: `@dataclass Output(dest: str, content: bytes, from_: str, layer: str)` (`dest` relative to the home root); `plan_outputs(home: HomeConfig, entry: ComponentEntry, component_dir: Path, version: str, sha: str, instance: bool = False) -> list[Output]`; `write_outputs(home, lock, cid, outputs, force: bool = False) -> list[tuple[str, str]]` (`("write"|"same", dest)`; raises `DomosensoError` on `hand-edited: <dest>` or `owned by <other>: <dest>`).
- Mapping: `templates/**/*.j2` except `templates/instance/` → `config_dir/<outputs[name] or default>` (defaults `package.yaml` → `packages/<id>.yaml`, `dashboard.<lang>.yaml` → `dashboards/<id>.<lang>.yaml`, other names → `packages/<id>-<name>`); cards → `config_dir/<install_path><rel>`; `shell` → `config_dir/shell/<name>`, `themes` → `config_dir/themes/<name>`; `ha_blueprints` `ha/blueprints/<domain>/<rest>` → `config_dir/blueprints/<domain>/<rest>`. `templates/instance/**` (new convention, additive) only when `instance=True` (Task 8).
- [ ] **Step 1:** Tests: `test_render_writes_files_and_lock` (every output exists, the lock's sha256s match, stamp first line in YAML outputs only); `test_render_is_idempotent` (second run: all `same`); `test_hand_edit_refused` (edit a managed file → `FAIL hand-edited: <path>`); `test_force_overwrites`; `test_shell_collision_between_components` (second component `other` with `shell/pick.py` → `FAIL owned by panel: home-assistant/shell/pick.py`); `test_adopt_equal` (files written by hand equal to the render apart from an old-form stamp → lock written, no file changed); `test_adopt_unequal` (one differing file → `FAIL` naming it, lock not written); `test_unmanaged_identical_file_adopted_by_render` (an existing identical untracked file becomes managed without a rewrite).
- [ ] **Step 2:** FAIL. **Step 3:** Implement `plan_outputs`, `write_outputs`, and the `render [<id>...] [--force] [--catalog-dev <path>]` and `adopt <id>@<version>` commands (`--catalog-dev`: dirty stamp, lock untouched).
- [ ] **Step 4:** PASS. **Step 5:** Commit `domosenso render and adopt`.

### Task 8: `init`, `add`, `update`, `status`

**Files:**
- Create: `tools/domosenso_cli/cmd_home.py`, `tools/domosenso_cli/upgrade_notes.py`
- Modify: `docs/COMPATIBILITY.md` (manifest: `templates/instance/` rendered once by `add`, ADDITIVE), `AGENTS.md` (renderer paragraph, one line)
- Test: `tests/test_cli_home_cmds.py`

**Interfaces:**
- Produces: `sections_between(upgrade_md: str, old: str, new: str) -> list[str]` (the `## <version> ...` sections with `old < version <= new`, newest first); `classify(home, lock) -> dict[str, Literal["managed","managed-modified","instance","local","unmanaged","unclassified"]]` over every file under `config_dir` and `esphome_dir`.
- `init`: writes `domosenso.yaml` with `targets` keys present and values empty, and an empty lock; refuses if `domosenso.yaml` exists.
- `add <id>@<version>`: entry in `domosenso.yaml`; `domosenso/<id>.inputs.yaml` skeleton (each input as `# <name>: <example or default>  # <type>`, required ones uncommented with `example`); renders `templates/instance/**` once (refuses to overwrite: `FAIL instance file exists: <path>`); records instance files in the lock with `layer: instance`; then `render <id>`.
- `update <id> [--to <version>]`: prints each section of `sections_between` as `note <line>`; moves the lock; renders; deletes managed files of the old version no longer produced.
- `status`: one line per non-local file `<class> <path>`, per component `component <id> <locked> newest <v>`, per custom integration `integration <name> <version> (manual)`; `FAIL <n> unclassified` when any.
- [ ] **Step 1:** Tests: `test_init_refuses_existing`; `test_add_writes_skeleton_and_instance_once`; `test_add_refuses_existing_instance`; `test_update_prints_notes_and_removes_old_version_files` (cards under `.../1.0.0/` gone, `.../1.1.0/` present, lock at 1.1.0); `test_sections_between_order`; `test_status_classifies` (one file each class; exit 1 with `FAIL 1 unclassified`); `test_status_missing_dashboard_entry` (a component dashboard not named under `lovelace:` in the home's `configuration.yaml` → line `missing-dashboard-entry dashboards/<file>` with the YAML to add).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `domosenso init, add, update, status`.

### Task 9: Home Assistant API client

**Files:**
- Create: `tools/domosenso_cli/ha_api.py`, `tests/fakes.py` (`FakeHA`)
- Test: `tests/test_cli_ha_api.py`

**Interfaces:**
- Produces: `class HA(url: str, token: str)` async context manager: `await call(type: str, **fields) -> Any` (result or `DomosensoError("<type>: <error>")`), `await rest_get(path: str) -> Any`, `await http_status(path: str) -> int`; `HA.for_target(t: Target) -> HA` (token from `t.token_file`). `FakeHA(responses: dict[str, Any])` with the same methods and `calls: list[tuple[str, dict]]`, used by Tasks 10, 12, 14, 16.
- [ ] **Step 1:** Tests against a local `websockets.serve` stub (auth_required → auth_ok → result): `test_call_returns_result`, `test_call_error_raises`, `test_auth_failure_message` (names the token file).
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `domosenso command: Home Assistant API client`.

### Task 10: Lovelace resources

**Files:**
- Create: `tools/domosenso_cli/resources.py`
- Test: `tests/test_cli_resources.py`

**Interfaces:**
- Consumes: `Lock`, `HomeConfig.resources`, `HA`/`FakeHA`.
- Produces: `@dataclass Resource(url: str, type: str = "module")`; `wanted(home, lock) -> list[Resource]` (locked cards; home resources with `?v=<sha8>` of `config_dir/www/<path after /local/>`); `@dataclass Action(kind: Literal["update","create","unwanted"], url: str, resource_id: str | None = None, old_url: str | None = None)`; `plan(existing: list[dict], wanted: list[Resource]) -> list[Action]` (match by file name after the last `/`, query ignored; `DomosensoError("duplicate resources for <name>.js: <id1>, <id2>")`); `async apply(ha, actions, prune: bool) -> None` (`lovelace/resources/update` with `resource_id`, `url`, `res_type`; `lovelace/resources/create`; `lovelace/resources/delete` only with `prune`).
- [ ] **Step 1:** Tests: `test_update_in_place_keeps_id` (`/local/agenda-card.js?v=6` id `abc` → update `abc` to `/local/domosenso/ramka/0.1.1/cards/agenda-card.js`); `test_same_url_no_action`; `test_create_missing`; `test_duplicate_refused`; `test_unwanted_listed_not_deleted`; `test_prune_deletes`; `test_home_resource_gets_hash_query` (content change → new `?v=`); `test_home_resource_clashes_with_component_card` (home `resources:` naming `/local/agenda-card.js` while a locked component ships `agenda-card.js` → `DomosensoError` naming both).
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `domosenso command: reconcile Lovelace resources in place`.

### Task 11: Targets

**Files:**
- Create: `tools/domosenso_cli/targets.py`; `FakeTarget` in `tests/fakes.py`
- Test: `tests/test_cli_targets.py`

**Interfaces:**
- Produces: protocol `TargetIO`: `hashes(paths: list[str]) -> dict[str, str | None]`, `glob(patterns: list[str]) -> list[str]`, `read(path) -> bytes | None`, `put(files: dict[str, bytes]) -> None`, `delete(paths: list[str]) -> None`, `exec(argv: list[str]) -> tuple[int, str]` (inside the container), `restart(timeout_s: int = 120) -> None`. Paths are relative to `/config`. `LocalDocker(t: Target)` (files directly in `t.config`, `docker exec`), `SshDocker(t: Target)` (one `ssh <host> "<docker> exec -i <container> sh -c ..."` per batch: `sha256sum`, `find`, `tar -x -C /config` from stdin for `put`, `rm -f` for `delete`). `FakeTarget(root: Path, check_output: str = "{}")`.
- [ ] **Step 1:** Tests on `LocalDocker` with a stub `docker` executable on `PATH` that runs the command locally, and on `SshDocker` with a stub `ssh` that does the same: `test_put_then_hashes`, `test_glob_relative`, `test_delete`, `test_put_creates_parent_dirs`, `test_ssh_argv_quotes_paths_with_spaces`.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `domosenso command: local and ssh Docker targets`.

### Task 12: `deploy` and `rollback`

**Files:**
- Create: `tools/check_config_parse.py` (moved from the inline Python in `tools/ha-check.sh`), `tools/domosenso_cli/deploy.py`
- Modify: `tools/ha-check.sh` (calls `uv run tools/check_config_parse.py <label> <json> <err>`; output lines unchanged)
- Test: `tests/test_cli_deploy.py`, `tests/test_check_config_parse.py`

**Interfaces:**
- Consumes: Tasks 4, 7, 9, 10, 11.
- Produces: `count_errors(stdout: str) -> tuple[int, list[str]]` in `check_config_parse.py` (total_errors + `ERROR: ... generated invalid` lines); `@dataclass Plan(add: list[str], change: list[str], remove: list[str], orphan: list[str], keep: list[str], resources: list[Action], restart: bool, hash: str)`; `make_plan(home, lock, io: TargetIO, existing_resources: list[dict]) -> Plan`; `apply(home, lock, plan, io, ha, remove_orphans: list[str], prune: bool) -> str` (deploy id = UTC timestamp); `rollback(home, io, ha, deploy_id: str | None) -> None`.
- Record: `/config/.domosenso/deployed.json` `{deploy_id, files: {path: {sha256, layer, component}}}`; backup `/config/.domosenso/predeploy-<id>/` (`files.tar`, `resources.json`, `added.json`) and a local copy under `.domosenso/deploys/<target>/<id>/`.
- `apply` order: refuse if orphans not covered by `remove_orphans`; parse each changed dashboard with `yaml.safe_load`; write backup; `put`; `exec(["python3","-m","homeassistant","--script","check_config","-c","/config","--json"])` → `count_errors` > 0 or exit ≠ 0 ⇒ restore backup, `FAIL check_config: <n> errors` (no restart); resources; `restart`; wait until `GET /api/` answers (180 s); write the record. `deploy production` without `--confirm <plan hash>` reads a line from the terminal and continues only on `production`.
- [ ] **Step 1:** Tests with `FakeTarget` and `FakeHA`: `test_plan_lines` (add/change/keep, `restart: yes`); `test_plan_removes_file_dropped_from_record`; `test_unmanaged_on_target_never_touched`; `test_orphan_blocks_apply` (a `packages/old.yaml` on the target, not in repo or record → `FAIL orphan packages/old.yaml`); `test_remove_orphans_flag`; `test_check_config_errors_restore` (fake check output with one `ERROR: ... generated invalid automation` line → files back to the backup, no restart call, exit 1); `test_copy_failure_restores_backup` (`put` raises midway → backup restored, `FAIL`); `test_rollback_round_trip` (apply then rollback: target hashes and resource URLs equal the start); `test_production_needs_confirmation` (non-interactive without `--confirm` → `FAIL`); `test_dashboard_yaml_parse_error_stops_before_copy`. In `test_check_config_parse.py`: the three cases `ha-check.sh` handles today (clean, JSON errors, blueprint log line).
- [ ] **Step 2–4:** FAIL, implement, PASS; `tools/ha-check.sh ramka` still prints `fresh: 0 errors`.
- [ ] **Step 5:** Commit `domosenso deploy and rollback, with check_config error counting shared with ha-check`.

### Task 13: Home repository: staging `--full`, `domosenso.yaml`, Ramka adopted (home repository branch)

**Files (home repository):**
- Modify: `staging/staging.py` (`up --full`), `staging/README.md`
- Create: `domosenso.yaml`, `domosenso.lock` (by `adopt`), `domosenso/ramka.inputs.yaml` (moved from `home-assistant/domosenso/`)
- Modify: `.gitignore` (`.domosenso/`)

- [ ] **Step 1:** `staging.py up --full`: config is a plain directory `staging/.data/config` (no read-only mounts); writes no resources and no card files in this mode; still onboards, stubs services, mirrors states, copies statistics; adds a container `ha-staging-mqtt` (`eclipse-mosquitto:2`, 127.0.0.1:18830, anonymous) and an MQTT config entry for it through the config-flow REST API. The mount-based mode stays the default.
- [ ] **Step 2:** Write `domosenso.yaml` with both targets (production values from `home-assistant/README.md` "Where it runs" and "API token"), the Ramka entry with its current output paths and `langs`, `local` globs for packages, dashboards, `www/*.js`, `www/*.svg`, shell, themes; `resources:` for the home's own cards and third-party resources; `unmanaged_on_target` per the inventory; `kiosk_users`; `custom_integrations` with versions read from each `manifest.json` on production (read-only).
- [ ] **Step 3:** `uv run --project ~/Projects/domosenso domosenso adopt ramka@0.1.1` → `ok`, lock written, no file changed; then `domosenso render ramka` → `git diff` shows only the first line of the Ramka's YAML files (old stamp → `ramka/0.1.1 (<sha>)`); `domosenso status` → only `local`, `instance` and `managed` lines, or the unclassified files listed for Step 2 to fix.
- [ ] **Step 4:** `staging.py up --full`, then `domosenso deploy staging --plan` / `--apply` → `ok`; `domosenso rollback staging` → staging files and resources equal the state before (compare `hashes()` output saved before the apply).
- [ ] **Step 5:** Commit in the home repository `Domosenso lock: the Ramka adopted at ramka/0.1.1; staging --full with a throwaway MQTT broker`.

## Phase 2 — equivalence (may run in parallel with Tasks 7–12 once Task 9 is merged)

### Task 14: `snapshot`

**Files:**
- Create: `tools/domosenso_cli/snapshot.py`, `schemas/snapshot.schema.json`
- Test: `tests/test_cli_snapshot.py`

**Interfaces:**
- Consumes: `HA`/`FakeHA`.
- Produces: `FILE_PLATFORMS = {"template","group","input_boolean","input_number","input_select","input_text","input_datetime","input_button","timer","counter","automation","script","utility_meter","history_stats","statistics","command_line","mqtt","plant","folder","min_max","derivative","integration","threshold","trend","filter"}`; `async take(ha: HA, kiosk_profiles: dict[str, dict] | None = None) -> dict` with keys `taken_at, ha_version, entities` (`{entity_id: {platform, unique_id, state_class: available|unavailable|unknown, from_files: bool}}`), `automations` / `scripts` (`{entity_id: {id, state, loaded: bool, config_sha256}}`), `helpers` (`{entity_id: {options, min, max, step, mode, has_date, has_time, duration}}` present keys only), `dashboards` (`{url_path: {title, icon, require_admin, config_sha256}}`), `resources` (`[{url_no_query, type}]`), `config_entries` (`[{domain, title, state}]`), `errors` (system_log entries of level ERROR), `profiles`. `canonical_sha(obj) -> str` (sha256 of `json.dumps(obj, sort_keys=True, separators=(",",":"))`). `loaded = state != "unavailable"`; `from_files` = registry platform in `FILE_PLATFORMS` or no config entry, or no registry entry at all.
- `snapshot <target> --out <file>` command; for `ssh-docker` targets it also reads each `kiosk_users` profile file (`.storage/frontend.user_data_<id>`, user id from `config/auth/list`) read-only.
- [ ] **Step 1:** Tests with `FakeHA` fixtures (registry list, states, `automation/config`, `script/config`, `get_panels`, `lovelace/config`, `lovelace/resources`, `config_entries/get`, `system_log/list`): `test_integration_entities_not_from_files`; `test_automation_config_hashed`; `test_helper_attributes_kept`; `test_dashboard_hash_ignores_key_order`; `test_resources_without_query`; `test_snapshot_validates_against_schema`.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5:** On the home's staging (Task 13), run `domosenso snapshot staging --out /tmp/s.json` and confirm the inferred websocket commands work: `automation/config` / `script/config` with `entity_id`, and `lovelace/config` with `url_path` for YAML-mode dashboards (SPEC-002 3.1). If one does not, replace it (e.g. `config/automation/config/<id>` over REST) and note it in the spec's 3.1 table as verified.
- [ ] **Step 6:** Commit `domosenso snapshot`.

### Task 15: `compare` and `equivalence.yaml`

**Files:**
- Create: `tools/domosenso_cli/compare.py`, `schemas/equivalence.schema.json`
- Test: `tests/test_cli_compare.py`

**Interfaces:**
- Consumes: snapshot dicts.
- Produces: `@dataclass Diff(part: str, id: str, kind: Literal["only-in-a","only-in-b","config-differs","options-differ","not-loaded","unique-id-differs"], detail: str)`; `diff(a: dict, b: dict) -> list[Diff]` (only `from_files` entities; `(platform, unique_id)` pairs compared as their own part `unique_ids`); `explain(diffs, entries: list[dict], head_commit: str | None) -> tuple[list[Diff], list[dict]]` (unexplained, stale entries); entries `{part, id, kind: renamed|added|removed|config|ignore, to?, reason, reviewed_at?}` — a `config` entry matches only while `reviewed_at` equals the current commit of the file that defines it, or has no `reviewed_at` when `head_commit` is None.
- Output: `ok <part> (<n>)` / `FAIL <part>: <n> differences` and one line per difference; `warning stale explanation <part> <id>`; final `equivalent` (exit 0) or `not equivalent: <n> unexplained` (exit 1).
- [ ] **Step 1:** Tests: `test_identical_snapshots_equivalent`; `test_only_in_a_reported`; `test_unavailable_automation_is_not_loaded`; `test_changed_unique_id_fails` (same entity id, different unique_id); `test_options_order_matters` (input_select options reordered → `options-differ`); `test_explained_difference_passes`; `test_stale_explanation_warned`; `test_config_explanation_invalidated_by_new_commit`.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `domosenso compare with explained differences`.

### Task 16: `verify` and `silent.yaml`

**Files:**
- Create: `tools/domosenso_cli/verify.py`, `schemas/silent.schema.json`
- Test: `tests/test_cli_verify.py`

**Interfaces:**
- Consumes: `snapshot.take`, `HA`, the baseline snapshot, `domosenso/equivalence.yaml` (`after_restart: unknown` entries), `domosenso/silent.yaml` entries `{entity, checks: [loaded_on | {triggered_within: <hours>} | {entity_fresh: {entity, max_age: <hours>}}]}`.
- Produces: `async verify(ha, baseline: dict, home, day_after: bool) -> list[Diff]` with kinds `not-loaded`, `state-changed` (on/off differs from baseline), `newly-unavailable`, `log-error`, `resource-missing` (`http_status != 200`), `resource-duplicate`, `profile-language` (kiosk profile language ≠ the `<lang>` of the dashboard file `configuration.yaml` loads), `silent-failed`. `triggered_within` and `entity_fresh` are evaluated only with `day_after`.
- [ ] **Step 1:** Tests with `FakeHA`: `test_all_good_passes`; `test_newly_unavailable_fails`; `test_after_restart_unknown_allowed`; `test_automation_turned_off_fails`; `test_log_error_fails`; `test_resource_404_fails`; `test_profile_language_mismatch_fails`; `test_triggered_within_only_day_after`; `test_entity_fresh_too_old_fails`.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `domosenso verify with the home's silent automations`.

### Task 17: Fidelity comparison (home repository branch)

**Files (home repository):** `domosenso/equivalence.yaml`, `domosenso/silent.yaml` (from the inventory's table), the inventory (results).

- [ ] **Step 1:** `staging.py up --full` with the home repository **as it is**, `domosenso deploy staging --apply`.
- [ ] **Step 2:** `domosenso snapshot production --out .domosenso/snap/prod.json` (read-only, allowed) and `domosenso snapshot staging --out .domosenso/snap/staging.json`.
- [ ] **Step 3:** `domosenso compare .domosenso/snap/prod.json .domosenso/snap/staging.json --explain domosenso/equivalence.yaml`; for each difference, find its cause; a staging artefact becomes an `ignore` entry with its reason; anything else is a staging bug to fix in Task 13's mode.
- [ ] **Step 4:** Repeat until `equivalent`. Record in the inventory how many `ignore` entries there are and what kinds.
- [ ] **Step 5:** Commit in the home repository `Equivalence: production and staging --full agree on the home as it is`.

## Phase 1b — the first production deploy with the command (home repository)

### Task 18: Home `AGENTS.md`, README, and the Ramka deployed by the command

**Files:**
- Create (framework): `examples/home-template/AGENTS.md`, `examples/home-template/CLAUDE.md` (`@AGENTS.md`); `examples/` is already in the privacy scan
- Modify (framework): `docs/COMPATIBILITY.md` (Tools: the `domosenso` command lines and output lines; formats `domosenso.yaml`, `domosenso.lock`, `equivalence.yaml`, `silent.yaml` with their schemas, all STABLE), `docs/UPGRADE_NOTES.md`
- Create (home): `AGENTS.md` from the template, `CLAUDE.md` (`@AGENTS.md`)
- Modify (home): `README.md`, `home-assistant/README.md` ("Deploying a change", the Ramka deploy checklist, "Files")

- [ ] **Step 1:** Template `AGENTS.md` (under 32,768 bytes): where staging and production are described (placeholders), the commands (`render`, `update`, `deploy staging`, `deploy production --plan`, `verify`), the layers table with "never edit a file whose first line says Rendered by Domosenso", where `silent.yaml` and `equivalence.yaml` live, boundaries: production **reads allowed**, production writes / deploys / restarts / registry edits / flashing need the go-ahead typed in the same session; the classifier note from SPEC-002 decision 2. Run `uv run pytest -q` (privacy).
- [ ] **Step 2:** Home `AGENTS.md` from it with the home's values; README sections rewritten to the commands, keeping what SPEC-002 1.7 keeps manual (custom integrations, profile settings, registry edits, flashing).
- [ ] **Step 3:** `domosenso snapshot production --out cutover/1b/before.json`; `domosenso deploy production --plan`. Expected: the Ramka's YAML files change only in their first line; resource lines `update` with the same URLs or none; orphans listed (for example the twelve old `www/*-card.js` from before 0.1.0). Show the plan to the maintainer; he decides each orphan (remove, add to the repository, or `unmanaged_on_target`).
- [ ] **Step 4:** With his go-ahead typed in this session: `domosenso deploy production --apply --remove-orphans <his list>`; press the Ramka's reload button; `domosenso verify production --baseline cutover/1b/before.json` now and after 10 minutes → `ok`.
- [ ] **Step 5:** Commit in the home repository `First deploy with domosenso: the Ramka at ramka/0.1.1, lock and deploy record`; commit the template and the COMPATIBILITY.md rows in the framework (`tools/check-all.sh` first).

## Phase 3 — components (parallel sessions)

### Task 19 (one session per component): `backup` 0.1.0, `climate-air` 0.2.0, `bermuda-presence` 0.2.0, `plants` 0.2.0, `awnings` 0.2.0, `lights` 0.2.0

Order of start: as listed (what the first outside user also needs first). Each session works in its own framework worktree and touches only `components/<id>/`, `examples/demo-home/inputs/<id>.yaml`, and, merged in sequence, `tests/test_catalog_content.py` (`COMPONENTS`), `README.md` (components table). Home-side changes go on one shared home branch `claude/domosenso-components`, one commit per component, rebased in sequence.

Per component:

- [ ] **Step 1:** Short spec `.ai/specs/SPEC-0NN-<date>-<id>-<version>.md` (skill `write-component-spec`): what it renders, inputs, `provides` = the home's current entity ids **and** `unique_id`s / automation `id`s (inventory), silent automations it carries. The six specs are shown to the maintainer as one batch and approved before Step 2.
- [ ] **Step 2:** Templates (`templates/package.yaml.j2`; instance files under `templates/instance/`; `bermuda-presence` uses its existing blueprints), demo-home inputs, `tools/ha-check.sh <id>` → `fresh: 0 errors`; `uv run tools/catalog_check.py --strict`; translations en/de/pl for any `ui.*` text.
- [ ] **Step 3:** Home branch: `domosenso add <id>@<version> --catalog-dev <worktree>`; fill `domosenso/<id>.inputs.yaml` with the home's values; delete the local package the component replaces (or the part of it, leaving a smaller local file for `climate.yaml` / `lights.yaml` as the inventory says).
- [ ] **Step 4:** `staging.py up --full`, `domosenso deploy staging --apply`, snapshot staging, `compare` with production → `equivalent` with no new entry beyond Task 17's `ignore`s (a `config` entry only after reading both configs, with `reviewed_at`).
- [ ] **Step 5:** `uv run tools/release.py <id>` (tag local), home branch `domosenso add` again from the tag (no `--catalog-dev`), commit both repositories.
- `awnings` additionally ships the frame bridge as a compose service artifact (`services:`); at the cut-over the running container is not replaced (SPEC-002 2.4).
- `bermuda-presence`: `tools/make_plan.py` in the home stops writing the presence package; its phone and tablet maps move to the component's inputs.

## Phase 4 — cut-over

### Task 20: One cut-over (home repository, production)

Preconditions: Task 19 done for all six; `domosenso status` → no unclassified file; migration comparison `equivalent`; rollback rehearsed on staging with the full home (deploy, rollback, snapshot equal to the one before); any repository that still commits to production files merged first; the maintainer's go-ahead typed in the session.

- [ ] **Step 1:** `date`; `domosenso snapshot production --out cutover/<date>/before.json`; confirm the nightly backup is under 24 h old (`sensor.newest_backup_age`) or have the maintainer make one.
- [ ] **Step 2:** `domosenso deploy production --plan` → shown to the maintainer: removals are only the replaced local packages and old managed files; no change to an unmanaged file; no orphan.
- [ ] **Step 3:** `domosenso deploy production --apply` (restart, not reload); press the Ramka's reload button.
- [ ] **Step 4:** `domosenso verify production --baseline cutover/<date>/before.json` now and after 10 minutes → `ok`; any orphaned registry entry is listed for the maintainer and removed with the home's registry tool only with his go-ahead.
- [ ] **Step 5:** Next morning: `domosenso verify production --baseline ... --day-after` → `ok`. Record the result in the inventory; commit in the home repository `Cut-over to Domosenso: <n> components from the catalog, verify passed`.
- [ ] **Step 6:** Done check (SPEC-002 §5): `domosenso status` 0 unclassified; `domosenso deploy production --plan` empty; three verifies passed; home `AGENTS.md` and README describe the commands.

If any step fails: `domosenso rollback production` (files and resources back, restart), then `verify` against `before.json`; the full backup is the last resort.

## Phase 5 — after the cut-over (separate plan)

ESPHome thin device files on `github://zerostorypoints/domosenso/...` once the repository is public; compose files for the six containers. Not part of this plan's done (SPEC-002 decision 3).
