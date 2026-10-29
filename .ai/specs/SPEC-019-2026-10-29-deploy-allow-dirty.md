# SPEC-019: `deploy production --allow-dirty`, a typed exception for an unreleased render

- Status: approved 2026-10-29 (docere-priv); issue #72
- Source: the maintainer's request (2026-10-29), for SPEC-018: a new card has to be seen on a real
  wall tablet before the catalog merges it. A home without a staging instance that its tablet can
  reach has no other place to look: local home staging (SPEC-016, `tools/home-staging.py`) serves
  on loopback only, so the tablet cannot open it.
- Touches: the `domosenso deploy` command line and its `FAIL` reasons (STABLE surfaces in
  `docs/COMPATIBILITY.md`), and how a `--catalog-dev` render reaches a deploy (SPEC-002).

## Goal

A maintainer can put a `--catalog-dev` render on production for a look, deliberately and visibly:

1. `deploy production --apply` still refuses dev-rendered files by default, as today;
2. with `--allow-dirty` and `--confirm <hash>` of a plan whose `dev-render` lines the human has read,
   it deploys them;
3. the target's deploy record names the dev-rendered files, so the next plan says production runs
   an unreleased render until a clean deploy replaces it;
4. a dev render of a component the lock does not have yet, or of a new version with new files and
   resource URLs, is carried complete (part B), on every target.

Rollback, backups, `check_config` and the restart are unchanged.

## Today (read from the code, 2026-10-29)

- `tools/domosenso_cli/deploy.py`, `_carried()`: carries the lock's files under `config_dir` and the
  home's `local:` files. A managed file whose sha256 differs from the lock is accepted only when its
  first line is this component's `-dirty` stamp, and goes into `plan.dirty`; a local file with a
  `-dirty` stamp goes there too.
- `plan_lines()` prints `dev-render <path>` per dirty file, in `--plan` and `--apply` alike.
- `apply()`: `if target == PRODUCTION and plan.dirty` → `FAIL dev render: <paths>: production takes
  only files rendered from a tag`. Other targets take dirty files.
- `cmd_deploy.py`: `_confirm()` asks for the word `production` on a terminal, or takes `--confirm
  <hash>`; it runs before `apply()`.
- The plan hash covers `add`, `change`, `remove`, `orphan`, `keep`, resources, `prune`, `restart`
  and the content of `add + change`; not the dirty list.
- `render --catalog-dev` writes files and leaves the lock alone. Cards (no stamp line) and files of
  a component or version the lock does not know are therefore not carried at all; resource URLs come
  from the lock only (`resources.wanted()`). `docs/HOME_STAGING.md` records this gap for staging.

## A. The flag and the guard

### Command line

```
domosenso deploy <target> (--plan | --apply) [--remove-orphans <path>...] [--prune-resources]
                          [--confirm <hash>] [--allow-dirty]
```

| case | result |
|---|---|
| production, plan has `dev-render` lines, no `--allow-dirty` | unchanged: `FAIL dev render: <paths>: production takes only files rendered from a tag` (the text after the colon may add "(--allow-dirty with --confirm deploys them)") |
| production, `--allow-dirty`, no `--confirm` (terminal or not) | `FAIL dev render needs --confirm <hash>`; typing `production` is not enough |
| production, `--allow-dirty --confirm <hash>`, hash current | deploys, dirty files included |
| production, `--allow-dirty --confirm <old hash>` | unchanged: `FAIL the plan changed: its hash is now <hash>, not <old hash>` |
| production, `--allow-dirty`, plan has no `dev-render` line | a normal deploy; the flag changes nothing |
| any other target, with or without the flag | unchanged: dev-rendered files are deployed |
| `--allow-dirty` with `--plan` | `FAIL --allow-dirty goes with --apply` |

### Where the guard sits

- The refusal stays in `deploy.apply()` (`tools/domosenso_cli/deploy.py`), which gains a keyword
  `allow_dirty: bool = False`: `if target == PRODUCTION and plan.dirty and not allow_dirty: raise`.
  Keeping it in `apply()` means every caller, not only the command line, meets it.
- `cmd_deploy._deploy()` parses `--allow-dirty` and, before `_confirm()`, raises
  `dev render needs --confirm <hash>` when the target is production, the plan has dirty files,
  `--allow-dirty` is given and `--confirm` is not. The hash binds the exact files the human read.
- `make_plan()` adds the dirty list to the hash input **only when it is not empty**, so a plan
  without dev renders keeps the hash it has today, and a dirty file that is already on the target
  (`keep`) still changes the hash a human confirms.

### What the record notes

- `.domosenso/deployed.json` on the target gains, when the deploy carried dev-rendered files (any
  target): `"dev_render": {"paths": [<config-relative paths>], "allowed": true|false}`, where
  `allowed` is `true` when `--allow-dirty` let it through on production. A clean deploy writes no
  `dev_render` key, so the next clean deploy clears it.
- The backup's `plan.json` (target and home copy) carries the same `dev_render` and `allow_dirty`.
- `deploy --plan` on a target whose record has `dev_render` prints, before `restart:`, one line
  `warning target runs a dev render: <n> files (deploy <deploy id>)`, until a deploy without dev
  renders replaces it. `deployed.json` stays "not a contract" (`docs/COMPATIBILITY.md`); the line is a
  `warning` like the others.

## B. Files a dev render adds

Without this, the flag can deploy a changed package but not a new card version or a new component.

- `render --catalog-dev` and `add --catalog-dev` write `.domosenso/dev-render.json` in the home
  (git-ignored with the rest of `.domosenso/`): per component, `version`, `commit` (the working
  tree's short head with `-dirty`), `files` (`dest` → `sha256`, `layer`) and `resources` (URLs). The
  lock is not touched, as SPEC-002 promises.
- A render, `add` or `update` of that component from a tag removes its entry.
- `deploy` (every target), for a component with an entry: carries the entry's files in place of the
  lock's managed files (instance files still from the lock), lists all of them as `dev-render`, and
  wants the entry's resource URLs in place of the locked ones (`resource update … from …`). A locked
  file the entry does not produce is not carried, so the record removes it from the target, as an
  `update` would.
- A file in the entry whose content has changed since the render: `FAIL dev render changed:
  <path>: render again`.
- A component with an entry and not in `domosenso.yaml`: `FAIL dev render of <id>, not in
  domosenso.yaml`.

## Compatibility

- Additive: a new optional flag, two new `FAIL` reasons (`dev render needs --confirm <hash>`,
  `dev render changed: <path>`), one new `warning` line, a new home-local file. Every invocation
  without `--allow-dirty` and without a dev render behaves exactly as today, hashes included.
- `docs/COMPATIBILITY.md`: the `deploy` command line gains `[--allow-dirty]`; the two `FAIL` reasons
  join the list agents act on.
- `docs/UPGRADE_NOTES.md`: one line, no home action.
- `docs/HOME_STAGING.md`: the "A development render does not currently update the deploy
  inventory" paragraph is replaced by part B.
- `examples/home-template/AGENTS.md`: its line "`deploy production` refuses such files" gains
  "unless `--allow-dirty --confirm <hash>`, a production write that needs the human's go-ahead like
  any other; a clean deploy from a tag follows".

## Tests

`tests/test_cli_deploy.py`, with the fakes in `tests/fakes.py`; each fails before the change:

- `test_production_refuses_dirty_without_flag`: unchanged message.
- `test_allow_dirty_needs_confirm`: `--allow-dirty` without `--confirm` on production fails with
  `dev render needs --confirm`, also when stdin is a terminal.
- `test_allow_dirty_with_confirm_deploys`: files copied, record `dev_render.paths` and `allowed: true`,
  backup `plan.json` has them.
- `test_allow_dirty_stale_hash`: `the plan changed`.
- `test_clean_plan_hash_unchanged`: the hash of a plan without dirty files equals the one from
  before the change (a recorded value).
- `test_dirty_keep_changes_hash`: a dirty file already on the target changes the hash.
- `test_plan_warns_target_runs_dev_render` and `test_clean_deploy_clears_dev_render`.
- `test_allow_dirty_with_plan_fails`; `test_staging_takes_dirty_without_flag` (unchanged).

`tests/test_cli_build.py` / `tests/test_cli_home_cmds.py` (part B):

- `test_dev_render_writes_inventory`, `test_tag_render_drops_inventory_entry`;
- `test_deploy_carries_new_component_from_inventory` (component not in the lock: files and
  resources in the plan, all `dev-render`);
- `test_deploy_new_version_moves_resources` (ramka-like: `resource update … from …`, old version's
  files removed through the record);
- `test_inventory_file_changed_fails`.

`tools/check-all.sh` green; `test_privacy`.

## Out of scope

- A release candidate tag, a staging instance the tablet can reach, or any route from a loopback
  staging to the LAN.
- Any change to `rollback`, `verify` or `snapshot`.
- Deploying a dev render of an ESPHome package (ESPHome pulls the tag; flashing stays manual).

## Open questions

1. Should `--allow-dirty` also be required on a non-production target when its record says it runs
   a clean deploy? Proposed: no; staging exists to take dev renders.
2. Part B could be its own spec and pull request. It is kept here because without it the flag
   cannot deploy what SPEC-018 needs (a new component and ramka's new card directory); a reviewer
   may split it, in which case part A lands first and part B depends on it.
3. Should `verify` report the `dev_render` record as a difference? Proposed: no; the plan's warning
   is enough.
