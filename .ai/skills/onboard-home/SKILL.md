---
name: onboard-home
description: Start a new home on Domosenso from an empty directory - interview the owner about their Home Assistant host, hardware and wishes, recommend catalog components that fit (and the hardware missing), create the home repository with domosenso init and the home template, add backup with inputs read from their Home Assistant, and stop at deploy production --plan. Use when someone starts a new home, onboards, or asks where to begin.
---

# onboard-home

The entry point for a new home (SPEC-009). The person running it owns the home and its Home
Assistant. Talk to them in their language; files in the catalog stay English.

## Rules for the whole session

- **Reads are free, writes need a typed yes.** Reading their Home Assistant (REST/websocket GETs,
  `domosenso snapshot`, `deploy --plan`, `ssh ... cat`, `docker ps`) needs no go-ahead. Anything
  that writes to it — `deploy --apply`, `rollback`, a service call, a restart, a file copy, a UI or
  registry change — needs their go-ahead typed in this session, each time.
- **The token never shows.** They create a long-lived access token in their HA profile and save it
  in a file outside every repository (`chmod 600`). Never ask them to paste it into the chat; read
  it only as `$(cat <token file>)` inside a command, never print it.
- **The home is not the catalog.** The home repository is a directory outside this catalog checkout
  (refuse a path inside it). Nothing of the household — names, rooms, entity ids, hosts, the token
  path — goes into the catalog checkout, a pull request or an issue on it.
- **Say what is not ready**, once, before they decide (section "Not ready").
- Commands: `uv run --project <catalog> domosenso --home <home> <command>`, written below as
  `domosenso <command>`. Every one ends with `ok` or `FAIL <reason>`; read that line.

## 0. Before starting

- This catalog checkout has its tags: `git -C <catalog> tag -l '*/*'` lists `backup/0.1.0` and the
  others; if not, `git -C <catalog> fetch --tags`.
- `git`, `uv` and `ssh` are installed; Docker on their computer is not needed for onboarding.

## 1. Interview

One short question at a time, with a default where there is one. Collect:

1. **Home Assistant host.** Container on a Synology NAS or another Docker host. HAOS is not tried
   with any component (`backup` excludes it): say so and stop if that is what they run.
2. **SSH login** `user@host`, key-based (the command runs ssh with `BatchMode=yes`: a password
   prompt fails). **Docker command** on the host: `docker`, or on a Synology often
   `sudo /usr/local/bin/docker` (inference; step 3 checks it). **Container name**, **config path on
   the host** (the directory mounted as `/config`), **HA URL** as seen from their computer,
   **token file** path.
3. **Hardware is read, not asked** (step 2 scans their Home Assistant). Ask only what it cannot
   know: hardware they have or plan that is not in Home Assistant yet (a tablet not set up, awnings
   with no controller), in their words.
4. **What they want**: wall tablet, climate overview, backups, plants, lights, presence, awnings,
   music on the tablet, anything else.
5. **Home name** (one word for the directory and `AGENTS.md`, not a person's name), **where** the
   home repository goes (default `~/<name>-home`), **language** of the home repository's text.

## 2. Recommend

Read every `components/*/component.yaml` (summary, devices, integrations with `setup`, `tested`,
`host.installs`) and `devices/*.yaml`.

**Scan first** (SPEC-010; read-only, the token stays in its file):

```bash
uv run --project <catalog> domosenso recommend --catalog <catalog> --from-ha <HA URL> --token-file <token file> --json
```

The `scan` object of the JSON document says what their Home Assistant has and how it matched:

- `found` (`{token: {count, via, devices}}`): matched for certain, already counted. Show each with
  their own device names (`scan.devices[i].name_by_user` or `name`, manufacturer, model), e.g.
  "5 × TP-Link T315 (Living room, …) → tapo-t315".
- `maybe`: a likely match, not counted. Ask about each token, one question at a time, naming the
  devices ("Is the Lenovo tablet the wall tablet?", "Which of these players should the tablet show?").
- `unmatched` (`{integration: [device indexes]}`): devices no rule knows. Mention the integrations
  that might matter for what they want; skip the rest (bulbs, phones, network clients).

The scan holds their device names: show it in the conversation, never write it into the catalog
checkout, a pull request or an issue. A `FAIL` (URL, token): fix it with them before going on.

**Then run again** with what they confirmed and what Home Assistant does not know (interview item 3)
as `--have`, without `--json` unless you need it:

```bash
uv run --project <catalog> domosenso recommend --catalog <catalog> --from-ha <HA URL> --token-file <token file> --have <confirmed maybes, device ids and kinds>
```

Without a running Home Assistant, the same command without `--from-ha`/`--token-file`, with
everything as `--have`.

Lines: `fits <id>@<version> tested-homes <n|unknown>`, `missing <id>@<version> tested-homes … needs <k>`
with a `needs <id>@<version> <kind> [<device ids>]` per missing device, `optional <id>@<version>
<feature> <kind> have|lacks [<device ids>]`, `describes <id>@<version>`, `unknown <token> [did-you-mean <ids>]` (a
`--have` value no manifest names: pass the catalog's device ids from `devices/*.yaml`, such as
`tapo-t315`, not a description such as `tapo-sensor`; take the suggestion or ask, then run again).

Present, in this order:

- the components that fit and serve what they want, each with "tested in N homes" as printed
  (`unknown`: the manifest does not record it), the integrations a human sets up for it (`core`,
  `hacs` named as such, the `setup` text), and any `note` / `via` in its requirements (the Tapo
  sensors report through a Tapo hub, for example);
- for each wish that no fitting component covers: the missing devices with the catalog's
  recommended model and its `devices/<id>.yaml` description;
- `describes` components install nothing (they say what the Ramka reads).

Confirm with them which components they want eventually. Only `backup` is added today.

## 3. Start the home repository

```bash
mkdir -p <home> && git -C <home> init
uv run --project <catalog> domosenso --home <home> init --catalog <absolute catalog path>
```

`init` writes `domosenso.yaml` and `domosenso.lock`. (A local catalog path reads tags from this
clone: new versions arrive with `git -C <catalog> fetch --tags`. The git URL works too and mirrors
into `<home>/.domosenso/cache`.)

1. **Target.** Replace `targets: {}` in `domosenso.yaml` with a `production` target from the
   interview (the commented block in the file shows the fields): `kind: ssh-docker`, `host`,
   `docker`, `container`, `config`, `url`, `token_file`. No staging target unless they have one.
2. **Check it, read-only:**
   - `ssh <host> <docker> ps --format '{{.Names}}'` lists the container. A permission error on
     docker: fix the `docker` field (sudo, or their login in the host's docker group — their
     decision, on their host); stop until it works.
   - `domosenso snapshot production --out .domosenso/snap/before-onboarding.json` ends in `ok`
     (URL and token work). The file is not committed; it holds the HA version, entities,
     automations, config entries and resources — use it below instead of further API calls.
3. **Agent instructions.** Copy `<catalog>/examples/home-template/AGENTS.md` and `CLAUDE.md` into
   the home. Replace these placeholders: `<home name>`, `<catalog checkout or git remote>`, the two
   `<version>` (HA from the snapshot's `ha_version`; ESPHome: "not used" if they have none),
   `<production host>`, `<container>`, `<config path on the host>`, `<production URL>`,
   `<language>`. Without staging, replace the staging bullet with: "Staging: none yet. A change
   goes to production after `deploy production --plan`, with `snapshot` before and `verify` after;
   `rollback` restores." `<config_dir>`, `<esphome_dir>`, `<id>`, `<version>` in command syntax are
   not placeholders. Afterwards grep the file for each placeholder above; none may remain.
4. **configuration.yaml.** Read it from the target (`mkdir -p <home>/home-assistant` first):
   `ssh <host> <docker> exec <container> cat /config/configuration.yaml > <home>/home-assistant/configuration.yaml`.
   A rendered package is loaded only through `homeassistant: packages: !include_dir_named packages`.
   If that is missing, add it (merge into an existing `homeassistant:` key); if they include
   packages another way (`!include_dir_merge_named`, another directory), stop and ask. This file
   is the home's from now on and the deploy carries it. Never copy `secrets.yaml`, `.storage/` or
   the database.
5. `.gitignore` with `.domosenso/`. Commit: "Start the home on Domosenso".

## 4. First component: backup

No hardware, Container only. Before adding it:

- its provided ids (`sensor.newest_backup_age`, `sensor.backup_count`, `sensor.backup_folder_size`,
  `shell_command.prune_old_backups`, `automation.nightly_home_assistant_backup`,
  `automation.alert_when_backups_stop`) must not exist in the snapshot already; if one does, stop
  and explain;
- Home Assistant's own automatic backup schedule must be off (Settings → System → Backups); the
  component replaces it. They turn it off; you do not.

```bash
uv run --project <catalog> domosenso --home <home> add backup@<newest version>
```

Fill `domosenso/backup.inputs.yaml`. `add` writes required inputs with the catalog's fictional
example (`notify: notify.mobile_app_alex_phone`) and optional ones commented out with their
default; replace every example:

- `notify`: list the notify actions read-only,
  `curl -sf -H "Authorization: Bearer $(cat <token file>)" <url>/api/services`, domain `notify`,
  `mobile_app_*` first; let them pick whose phone hears that backups stopped;
- the rest keeps its default unless they want otherwise (`time` 03:30:00, `keep_daily` 7,
  `keep_weekly` 4, `catch_up_hours` 20, `stale_hours` 30).

Show each value and where it came from. Then `domosenso render`, `domosenso status` (no
`unclassified` line; `configuration.yaml` is `unmanaged` by design), commit.

## 5. Stop at the plan

```bash
uv run --project <catalog> domosenso --home <home> deploy production --plan
```

Explain every line:

- `add <path>` / `change <path>`: files the deploy writes (`packages/backup.yaml`, the shell
  script, `configuration.yaml` when the packages line was added); `keep <path>`: equal already;
- `orphan <path>`: a file on their HA that matches a `local:` glob but this repository does not
  know. It blocks `--apply` until settled: bring it into the repository, list it under
  `unmanaged_on_target`, or delete it with `--remove-orphans <path>` (deleting is their decision).
  With no `local:` globs, onboarding has none;
- `resource unwanted <url>`: a Lovelace resource of theirs that the home does not list; harmless,
  nothing deletes it unless `--prune-resources` is given (never at onboarding);
- `restart: yes`: Home Assistant restarts (a minute or two); `hash <h>`: the plan's identity.

What `--apply` does: backs up every file it replaces, copies, runs `check_config` on their HA,
restarts, and puts the backup back by itself if `check_config` fails; `domosenso rollback
production` restores the last deploy later.

Then ask whether to apply. Only after they type yes in this session:

```bash
domosenso snapshot production --out .domosenso/snap/before-backup.json
domosenso deploy production --apply --confirm <hash>
domosenso verify production --baseline .domosenso/snap/before-backup.json
```

`verify` ends in `verified`: everything loaded before is still loaded, nothing that had a value
went unavailable, no new configuration error in the log. The next morning, `verify ... --day-after`
and `sensor.newest_backup_age` below 24 show the first nightly backup ran.

## Not ready (as of 2026-10-22)

- Every component is tested in one home, the maintainer's; `ramka`'s manifest does not record it
  (`tested-homes unknown`). Their home would be the second.
- No staging for a new home yet (an installable staging Home Assistant with scene simulation is
  planned): changes go to production after `--plan`, with `snapshot`, `verify` and `rollback`.
- The Ramka's player contract is not written: tested with a Hegel through `hegel_streaming`; another
  `media_player` (a Naim through `cast` or `dlna_dmr`) should work and has not been tried.
- HAOS is not tried; `calendar`, `media` and `weather` install nothing.

## After onboarding

Their home repository's `AGENTS.md` takes over: open the agent in the home repository for
everyday work. A next component: `domosenso add <id>@<version>`, inputs from their HA, `render`,
`--plan`, their yes. A fix to a component goes to the catalog as a pull request (spec first for
anything new), without their household in it.
