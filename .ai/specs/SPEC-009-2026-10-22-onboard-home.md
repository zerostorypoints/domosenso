# SPEC-009: `onboard-home` skill and `domosenso recommend`

Status: approved 2026-10-22 by the maintainer, typed in the session that wrote it ("i go with your
recommendations, and preferred development method, go"), recommend helper included (draft 2026-10-22).
Source: the maintainer's request for an entry point for the first outside home (a Synology NAS
running Home Assistant in Docker, Tapo sensors, a Naim Uniti Star; `docs/2026-10-20-domosenso-validation-notes.md`);
Open Mercato's `create-mercato-app --agents` and its `/om-help` entry skill
(`docs/research/2026-10-20-domosenso-architecture.md` §1); SPEC-001 (skills), SPEC-002 (the command).

## Goal

Someone with a running Home Assistant Container and an agent (Claude Code or Codex) starts a home
repository from an empty directory by invoking one skill, `onboard-home`. The agent asks what it
needs, reads the catalog and the person's Home Assistant, recommends components that fit the
hardware (and the hardware missing for what they want), creates the home repository, adds `backup`
with inputs read from their Home Assistant, and stops at `deploy production --plan`. Nothing is
written to their Home Assistant without their go-ahead, and nothing of their household enters this
repository.

## 1. The skill `.ai/skills/onboard-home/SKILL.md`

Front matter `name: onboard-home`, a `description` that names the trigger ("start a new home",
"onboard", "first time"). Linked by `tools/install_skills.py` for Claude Code (`/onboard-home`) and
Codex/Cursor (`.agents/skills/`).

**Where it runs.** The person opens the agent in their clone of this repository (that is where the
skill is) and invokes it; the home repository is a separate directory **outside** the catalog
checkout, and every home file is written there (`--home <dir>` or a `cd`). From an empty directory
the person can instead tell the agent "read `<catalog>/.ai/skills/onboard-home/SKILL.md` and follow
it". The skill refuses a home path inside the catalog checkout (the privacy rule and
`test_privacy` cover the catalog).

Steps, each ending in something the person sees:

1. **Interview** (one short question at a time, defaults offered):
   - Home Assistant host: Container on a Synology NAS or another Docker host (HAOS is out: no
     component's `host.installs` is tried there); the SSH login (`user@host`, key-based; the
     command uses `BatchMode=yes`, so a password prompt fails); the docker command on the host
     (`docker`, or e.g. `sudo /usr/local/bin/docker` on Synology — inference, checked in step 3);
     the container name; the config path on the host; the Home Assistant URL; where the long-lived
     token file is (outside every repository, `chmod 600`; the person creates the token in their
     HA profile — the agent never asks them to paste it into the chat).
   - The hardware in the home, in their words; the agent maps it to catalog device ids and kinds.
   - What they want (wall tablet, climate overview, backups, plants, lights, presence, awnings,
     music on the tablet).
   - The home's name (a word for the repository and `AGENTS.md`, not a person's name), the language
     of the home repository's text.
2. **Recommend.** Read every `components/*/component.yaml` and `devices/*.yaml`, run
   `domosenso recommend --catalog <catalog> --have <ids and kinds>` (section 2) and present:
   components that fit, each with "tested in N homes" exactly as the command prints it (`unknown`
   when the manifest does not say), the hardware missing for each wanted feature (with the catalog's
   recommended device and the `devices/<id>.yaml` description), the integrations a human sets up
   (`integrations[].setup`, HACS ones named as such). It says plainly what is not ready (section 1.1).
3. **Start the repository.** `git init` in the chosen directory, `domosenso init --catalog <catalog>`,
   fill the `production` target in `domosenso.yaml` from step 1, then check it read-only:
   `ssh <host> <docker> ps` (container listed), `domosenso snapshot production --out
   .domosenso/snap/before-onboarding.json` (URL and token work). Copy `examples/home-template/AGENTS.md`
   and `CLAUDE.md` into the home, replace every `<placeholder>`; staging lines say "none yet" where
   the home has no staging. Read `configuration.yaml` from the target (read-only `ssh ... cat`) into
   `home-assistant/configuration.yaml` and add `homeassistant: packages: !include_dir_named packages`
   if no packages include is there (a rendered package is otherwise never loaded); `secrets.yaml`,
   `.storage/` and the database are never copied. `.gitignore` gets `.domosenso/`. First commit.
4. **First component.** `domosenso add backup@<newest>` (no hardware; `host.installs: [container]`).
   Fill `domosenso/backup.inputs.yaml` by reading their Home Assistant: `notify` from the notify
   actions (`GET /api/services`, domain `notify`, `mobile_app_*` first), the rest from the defaults,
   each value shown with where it came from. Before that, check that HA's own automatic backup
   schedule is off (the component replaces it; the person turns it off in the UI — the agent does
   not). `domosenso render`, `domosenso status` (no `unclassified`), commit.
5. **Stop at the plan.** `domosenso deploy production --plan`; explain every line (`add`, `change`
   of `configuration.yaml`, `orphan`, `keep`, `resource`, `restart: yes`, `hash`), what an orphan is
   and the three ways to settle it, and what `--apply` does (backup, copy, `check_config`, restart,
   automatic restore on failure, `rollback`). Then ask; `--apply --confirm <hash>` only after the
   person types yes in this session, preceded by `snapshot production --out <file>` and followed
   by `verify production --baseline <file>`.

Rules in the skill: reads of their Home Assistant (REST/websocket GETs, `snapshot`, `deploy --plan`,
`ssh` reads) are free; every write (`deploy --apply`, `rollback`, a service call, a restart, a file
copy, a UI or registry change) needs their go-ahead typed in the session; the token never appears in
output, a command line or a file in a repository; nothing of the household (names, entity ids,
hosts, the token path) is written into the catalog checkout, a pull request or an issue in it.

### 1.1 What the skill says is not ready (2026-10-22)

- Every component is tested in one home (the maintainer's); `ramka`'s manifest does not record it,
  so `recommend` prints `tested-homes unknown` for it.
- No staging for a new home: an installable staging Home Assistant with scene simulation is stage 2;
  until then a change goes to production after `deploy --plan`, with `snapshot`/`verify` and `rollback`.
- The Ramka's player contract is not written: it is tested with a Hegel through `hegel_streaming`;
  another `media_player` (a Naim through `cast` or `dlna_dmr`, for example) should work and has not
  been tried.
- `calendar`, `media`, `weather` only describe what the Ramka reads; adding them installs nothing.
- HAOS is not tried (`backup` excludes it).

## 2. `domosenso recommend` (read-only helper)

```
domosenso recommend [--catalog <path or URL>] [--have <device id or kind>...] [--json]
```

Reads the catalog the same way as `add`: every component that has a `<id>/<semver>` tag, at its
newest tag (`git show refs/tags/<tag>:components/<id>/component.yaml`), never a working tree.
`--catalog` defaults to the catalog in the home's `domosenso.yaml`; one of the two is needed, so it
also runs before `init`. A URL catalog is mirrored into `<home>/.domosenso/` when there is a home,
otherwise into a temporary directory that is removed afterwards. Writes nothing in the home.

A requirement (`devices.requires[]` or `optional[]`) is met when `--have` contains its `kind` or one
of its `recommend` device ids. Lines, components in id order:

| line | meaning |
|---|---|
| `fits <id>@<version> tested-homes <n\|unknown>` | every required device is there |
| `missing <id>@<version> tested-homes <n\|unknown> needs <k>` | `k` required devices are not |
| `needs <id>@<version> <kind> [<device id>,...]` | one unmet requirement, with the recommended devices |
| `optional <id>@<version> <feature> <kind> have\|lacks [<device id>,...]` | an optional device and the feature it enables (`-` when none is named) |
| `describes <id>@<version>` | a component whose artifacts install nothing (`calendar`, `media`, `weather`); no fits/missing line |
| `unknown <token>` | a `--have` value that is no kind and no device id in any manifest read |

Ends with `ok` (an unknown token is a line, not a failure; a catalog that cannot be read is
`FAIL <reason>`). `--json`: `data` holds one object per component (`id`, `version`, `fits`,
`describes`, `tested_homes`, `needs`, `optional`). The device ids accepted are those named in
manifests; `devices/` is not read, because it is not tagged.

Example, the first outside home (`--have tapo-t315 network-audio-player`): `fits backup`,
`fits climate-air` with `optional ... air air-quality-sensor lacks ruuvi-air`, `missing ramka ...
needs 2` (`android-tablet`, `mmwave-radar hlk-ld2410c`), `describes media`.

Implementation: `tools/domosenso_cli/recommend.py` (`run`, `add_arguments`), `COMMANDS` and
`SUMMARIES` in `main.py`, `Catalog.component_ids()` and `Catalog.show(cid, version, path)` in
`catalog.py`.

## Compatibility

Additive only. New: the command line `recommend [--catalog] [--have ...]` and its output lines, both
STABLE from now on (rows in `docs/COMPATIBILITY.md`). No manifest, schema, entity or existing
command changes; no `UPGRADE.md` entry.

## Docs

- `docs/getting-started.md`: the first step becomes "open the catalog clone in Claude Code and type
  `/onboard-home`" (Codex: `$onboard-home` or "use the onboard-home skill"); the manual steps stay as
  the reference.
- `README.md` and `AGENTS.md`: the skills table gets `onboard-home`; AGENTS.md's command list gets
  `recommend`.

## Tests

- `tests/test_cli_recommend.py` against a throwaway git catalog: fits / missing / needs by kind and
  by device id, optional have/lacks, describes, newest tag wins over older and over the working tree,
  `tested-homes unknown`, unknown token, `--json` document, no catalog → `FAIL`, URL catalog without a
  home leaves no cache behind.
- `tests/test_cli_main.py` keeps listing every command (the new one included).
- `tools/agents_check.py` (front matter, links), `tools/check-all.sh` green.
- Not automated: the skill's conversation. Tried by reading it against the first outside home's
  facts; the first real run is that home.

## Out of scope

- Copying the skills into a home repository (`init --agents`, Open Mercato's way); the home's own
  `AGENTS.md` covers everyday work once onboarding is done.
- Staging for a new home, a Naim player contract, `tested.homes` in `ramka`'s manifest (a release
  of ramka 0.1.2), host filtering in `recommend` (every component supports `container`).

## Open questions

- Synology's docker needs root unless the login is in a `docker` group; whether
  `sudo /usr/local/bin/docker` with a sudoers rule or the group is the better advice is **inference**,
  to settle on the first home and write into `docs/home-assistant-notes.md`.
- The home template's `AGENTS.md` refers to the human as "his" in one place; a neutral word is a
  separate fix.
