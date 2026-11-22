# SPEC-055: the target's state in the plan — `check-target`, `missing-entity`, a `verify` that waits

Status: draft 2026-11-22.
Source: issues #49, #58 and #59, all from the first install outside the maintainer's home
(Synology, Home Assistant Container, no add-ons, no staging target), and an architecture review of
the CLI on main 61c970d. #50 (reload instead of restart) is a later spec; this one prepares it.

## Goal

A home without staging finds a wrong target, a wrong entity id and a restart that is still settling
**before** a production write, or at least without a false `FAIL`, each with one line that names the
fix. An agent then reaches a working first deploy without a debugging session, and every `FAIL` it
reads means that something broke.

Placement test (`docs/PRINCIPLES.md`): Home Assistant does not check a deploy's inputs against its
own registry, and has no notion of a deploy plan; every home that deploys with `domosenso` needs it,
so it belongs in the catalog's tools. Nothing here adds a place to configure what Home Assistant
configures (principle 4): the checks only read Home Assistant.

## What the outside install measured

| Issue | What happened | What it cost |
| --- | --- | --- |
| #59 | The URL was given as `http://http://<host>:8123/`; the Docker command `sudo docker` asked for a password, so a non-interactive deploy could not use it | several turns until `sudo -n /usr/local/bin/docker` and a sudoers rule naming the full path |
| #58 | Home Assistant put the area in front of renamed entity ids; the inputs named ids that did not exist | the deploy passed, the Ramka failed after the restart; 3 redeploys plus a missed notify action |
| #49 | The first `verify` after a restart judged integrations that had not come back yet | a false `FAIL` after 6 of 7 production deploys; the agent wrote its own wait loop each time |

## Today (read in the code, main 61c970d)

| Piece | Where | What it does now |
| --- | --- | --- |
| HA client | `tools/domosenso_cli/ha_api.py` (`HA`) | one WebSocket connection (`call`, `subscribe`) plus `rest_get` and `http_status`; `HA.for_target(t)` |
| Reading a target | `snapshot.py` (`read_raw`, `build`) | `get_config`, the entity registry, `/api/states`, automation and script config hashes, dashboards, Lovelace resources, config entries, `system_log`; used by `snapshot` and `verify` |
| The plan | `deploy.py` `make_plan`, `cmd_deploy.py` `_deploy` | opens the HA connection but reads only `lovelace/resources`; the rest is file hashes on the target. No states, no services, no registry |
| Waiting after a restart | `deploy.py` `wait_for_api` | polls `GET /api/` until HTTP 200 (`API_WAIT_S = 180`); does not wait for `state: RUNNING` or for entities |
| `verify` | `verify.py` `check` | one `read_raw` right away, diffed against a baseline; the only allowances are `equivalence.yaml` (`after_restart: unknown`) and `silent.yaml` |
| SSH | `targets.py` | already `BatchMode=yes`: a password prompt fails, but with ssh's own message |
| `--json` | `report.py` | one document `lines`, `data`, `result`, `reason`, STABLE in `docs/COMPATIBILITY.md`; no schema in `schemas/` |
| Typed inputs | `component.yaml` | 18 inputs declare `type: entity_id`; `home.inputs.yaml` entity ids are typed by `home-inputs.schema.json` |

The shared client and a full read of the target exist already. What is missing is that the plan uses
them, and that the waits and the checks are explicit and named in the output.

## What changes

### Removed

- **"HTTP 200 on `/api/` means Home Assistant is ready."** `wait_for_api` stops treating it so. Home
  Assistant answers `/api/` while it is still `NOT_RUNNING`; that is one of the false failures in
  #49.
- **The need for an agent's own wait loop after a deploy.** The skills `add-component` and
  `onboard-home` run `verify` once after `--apply`; they keep doing so, and the loop agents wrote by
  hand has no place left to go. No skill text tells agents to loop today; this removes the reason
  they did.

Nothing on a STABLE surface is removed or renamed.

### Changed

- **`deploy --plan` reads the target's state**, through the existing `snapshot.read_raw` plus
  `/api/services` and `config/area_registry/list`, instead of only `lovelace/resources`. Why: it
  is the last point before a production write, and the only one that has both the inputs and the
  target. `render` stays offline.
- **The plan hash covers the new lines.** Why: a plan read before an entity was renamed must not be
  applied after it.
- **`--apply` refuses a plan with a missing required input**, before any copy, with
  `FAIL missing entities: <n>`. Why: today this is found by `verify` or by the owner after the
  restart, on production.
- **`wait_for_api` waits for `get_config` → `state: RUNNING`**, still within `API_WAIT_S`, and
  `verify` uses the same wait. Why: #49.
- **`verify` gives restart-affected entities a settle window** before it reports them. Why: an
  entity that comes back on its own within minutes is not a failure, and reporting it as one teaches
  agents to explain `FAIL` away.

### Added

- **Plan lines** `missing-entity <input path> <entity id>`, `missing-action <input path> <action>`,
  and `did-you-mean <entity id>` after either when exactly one id on the target shares the suffix (the
  area-prefix rename is the common case). An optional input only prints the line.
- **`check-target <target>`**, also run by `init` when it writes a target:
  - normalises the URL (doubled scheme, trailing slash, missing scheme) and prints
    `normalised url <from> -> <to>`;
  - `GET /api/` with the token;
  - `ssh -o BatchMode=yes` and `test -f <config>/configuration.yaml`;
  - `<docker> ps` without a TTY; a sudo prompt gives `FAIL docker needs a password`, the line
    `sudoers <user> ALL=(root) NOPASSWD: <path>` with the full path resolved by
    `ssh <host> command -v docker`, and `docker: sudo -n <path>` as the value to put in
    `domosenso.yaml`;
  - one `ok <check>` line per check, then `ok` or `FAIL <reason>`.
- **`verify --settle <seconds>`** (default 180 when the target's last deploy record is younger than
  the window, else 0) and **`verify --no-wait`**. Within the window an entity that was available in
  the baseline and is `unknown` or `unavailable` now is re-read every few seconds: one that recovers
  counts as ok, one that does not ends in `FAIL` as today. `--no-wait` prints `pending <part> <id>`
  instead of waiting and ends `FAIL <n> pending`, for an agent that wants to come back later.
  `wait running <seconds>` and `settled <n> after <seconds>` say what the wait did.
- **`schemas/report.schema.json`**, the schema of the `--json` document that `docs/COMPATIBILITY.md`
  already makes STABLE, with tests that validate real output of `check-target`, `deploy --plan`,
  `verify` and `status`. Why: the skills parse it, and #59 shows an agent guessing its shape
  (`AttributeError: 'list' object has no attribute 'get'`).

## Alternatives considered

- **Check entity ids in `render`.** Render has no target and must stay offline.
- **Leave it to `verify` after the restart.** Too late for a home without staging; that is what cost
  three redeploys.
- **A separate state reader for the plan.** `snapshot.read_raw` already reads what is needed; it
  gains services and the area registry, and `snapshot`, `verify` and the plan read the same way.
- **Let agents wait in their own loops.** That is what happened; it hides real failures behind "it's
  the restart".
- **Reload instead of restart in this spec (#50).** It changes what `--apply` writes and needs its own
  decisions; this spec only gives the plan the state a later `reload:` line will be decided from.

## Compatibility

| Surface (`docs/COMPATIBILITY.md`) | Change | Level |
| --- | --- | --- |
| Plan lines of `deploy --plan` / `--apply` | new kinds `missing-entity`, `missing-action`, `did-you-mean` | additive |
| `FAIL` reasons agents act on | new `missing entities: <n>`, `docker needs a password`, `<n> pending` | additive |
| `compare` and `verify` lines | new `wait running <s>`, `settled <n> after <s>`, `pending <part> <id>` | additive |
| Command lines | new `check-target <target>`; `verify` gains `--settle <s>` and `--no-wait` | additive |
| `--json` document | unchanged; `schemas/report.schema.json` describes it | none |

Behaviour that existing homes notice:

- A plan with a missing **required** input that deploys today is refused. That is the point, but it
  stops a home that relies on it: a `docs/UPGRADE_NOTES.md` entry names the line and the fix.
- The plan hash changes only for a home with a missing entity.
- The first `verify` after a deploy takes up to the settle window longer.

No component manifest, input or entity changes, so no component `UPGRADE.md` entry.

## Tests

- `tests/test_cli_deploy.py` with a fake target's `/api/states` and `/api/services`: a missing
  required input (plan line, `did-you-mean` when unique, `--apply` refuses before any copy), a
  missing optional input (line only), all present (plan output and hash unchanged). They fail
  before the change.
- `tests/test_cli_targets.py`: URL normalisation; with a fake ssh runner a sudo password prompt,
  `docker` not on PATH, a socket permission error, success.
- `tests/test_verify.py` (or the existing verify tests): a target that reports `NOT_RUNNING` first;
  an entity that recovers inside the window (`verified`); one that does not (`FAIL`); `--no-wait`
  (`pending`).
- A schema test that validates real `--json` output of the four commands against
  `schemas/report.schema.json`.
- `tools/check-all.sh` green.

## Out of scope

- Reload instead of restart (#50).
- Writing to Home Assistant's registries (`registry plan/apply`); SPEC-038 covers reading areas.
- The notes of #62 that are documentation only.

## Open questions

- Which input values count as entity ids beyond `type: entity_id` and the home-inputs schema, for
  example ids derived from a slug input (`sensor.<slug>_battery_level` in #58)? Needs a resolver per
  component; not designed here.
- Should `check-target` also read the Home Assistant version and fail below the lowest version the
  catalog has tested? (Inference: it would have to read `tested` from every manifest the home locks.)
- Is 180 s the right default settle window? The outside install saw recovery in 1 to 5 minutes, so
  300 s may be safer at the cost of slower verifies. Not measured on a second home.
