---
name: onboard-home
description: Start a new home on Domosenso from an empty directory - interview the owner about their Home Assistant host and how they will reach it, scan their Home Assistant for hardware and discovered integrations, recommend catalog components and the hardware still missing, explain the Ramka wall tablet and check their tablet, create the home repository with domosenso init and the home template, add backup with inputs read from their Home Assistant, and stop at deploy production --plan. Use when someone starts a new home, onboards, or asks where to begin.
---

# onboard-home

The entry point for a new home (SPEC-009, SPEC-010, SPEC-011). The person running it owns the home
and its Home Assistant. Talk to them in their language; files in the catalog stay English.

## Rules for the whole session

- **Reads are free, writes need a typed yes.** Reading their Home Assistant (REST/websocket GETs,
  `domosenso recommend`, `discover`, `snapshot`, `deploy --plan`, `ssh ... cat`, `docker ps`) needs
  no go-ahead. Anything that writes to it — `deploy --apply`, `rollback`, a service call, a restart,
  a file copy, a config flow, a UI or registry change — needs their go-ahead typed in this session,
  each time.
- **The token never shows.** They create a long-lived access token in their HA profile and save it
  in a file outside every repository (`chmod 600`). Never ask them to paste it into the chat; read
  it only as `$(cat <token file>)` inside a command, never print it.
- **The home is not the catalog.** The home repository is a directory outside this catalog checkout
  (refuse a path inside it). Nothing of the household — names, rooms, entity ids, hosts, device names
  from a scan, the token path — goes into the catalog checkout, a pull request or an issue on it.
- **Their accounts are theirs.** Never create their Home Assistant owner account, a token, a
  Nabu Casa or Cloudflare account, and never type a password or a pairing code for them.
- **Say what is not ready**, once, before they decide (section "Not ready").
- Commands: `uv run --project <catalog> domosenso --home <home> <command>`, written below as
  `domosenso <command>`. Every one ends with `ok` or `FAIL <reason>`; read that line. Before `init`
  there is no home: pass `--from-ha <HA URL> --token-file <token file>` (and `--catalog <catalog>` to
  `recommend`); after `init`, `--from-ha production`.

## 0. Before starting

- This catalog checkout has its tags: `git -C <catalog> tag -l '*/*'` lists `backup/0.1.0` and the
  others; if not, `git -C <catalog> fetch --tags`.
- `git`, `uv` and `ssh` are installed; Docker on their computer is not needed for onboarding.

## 1. Interview: host and access

One short question at a time, with a default where there is one.

1. **Home Assistant host.** Home Assistant Container on a Docker host reached over SSH: a Synology
   NAS is tested; a mini PC or any Linux box with Docker takes the same path and is untested (their
   home would test it — say so). HAOS, Home Assistant Core and Supervised are not supported: no
   component's deploy is tried there (`backup` excludes HAOS). Say so and stop if that is what they
   run.
2. **Does Home Assistant run already?** If not, install it on their Docker host (section 1.1),
   then go on.
3. **SSH login** `user@host`, key-based (the command runs ssh with `BatchMode=yes`: a password
   prompt fails). **Docker command** on the host: `docker`, or on a Synology often
   `sudo /usr/local/bin/docker` (inference; step 6 checks it). **Container name**, **config path on
   the host** (the directory mounted as `/config`), **HA URL** as seen from their computer,
   **token file** path.
4. **How they will reach Home Assistant.** Explain the ways and record their choice (step 6 writes
   it into the home's `AGENTS.md`):

   | way | what it needs | in Domosenso |
   |---|---|---|
   | browser at home | `http://<host>:8123` | works |
   | Companion app (Android, iOS) at home | the app, the URL as its internal URL | works; the Ramka runs on the Android app |
   | remote: Nabu Casa cloud | a subscription, set up in HA's UI | should work with a Container; not tried here |
   | remote: Cloudflare Tunnel | a domain on Cloudflare, `cloudflared` as a compose service, HA `http:` trusting the proxy | runs in the maintainer's home; a catalog component (`remote-access`) is planned, not ready |
   | remote: VPN (Tailscale, WireGuard) | an agent on the host and on every phone | not in the catalog |
   | port forwarding on the router | — | advise against it |

   Change nothing on their router, at Cloudflare or at Nabu Casa.
5. **A dedicated always-on screen?** An Android tablet on the wall is the Ramka (section 5). A phone
   or an iPad as that screen is not supported: the Ramka's layout is tested on one landscape tablet
   size, and it drives the screen with Android Companion app commands.
6. **What they want**: wall tablet, climate overview, backups, plants, lights, presence, awnings,
   music on the tablet, anything else.
7. **Home name** (one word for the directory and `AGENTS.md`, not a person's name), **where** the
   home repository goes (default `~/<name>-home`), **language** of the home repository's text.

## 1.1 Installing Home Assistant (only when they have none)

Ask the SSH login and the docker command first (item 3), and the directory on the host for the
config (Synology: under `/volume1/docker/`). Then:

1. Check read-only: `ssh <host> <docker> ps` works, nothing listens on port 8123
   (`curl -s -o /dev/null -w '%{http_code}' http://<host>:8123/` gives `000`), and the compose
   command exists: `ssh <host> <docker> compose version` (on a Synology it may be `docker-compose`
   or Container Manager's "Project"; inference — use what answers).
2. Show them `<catalog>/examples/home-template/services/home-assistant/compose.yaml` and what it
   does: the pinned image, host networking (discovery), `privileged` and `/run/dbus` (Bluetooth,
   USB — drop them if the host has neither), restart unless stopped. After their **yes**: copy it to
   the host (`scp` into the config directory's parent) and start it:
   `ssh <host> "cd <dir> && HA_CONFIG=<config dir> TZ=<their time zone> <docker> compose -f compose.yaml up -d"`.
   The file goes into the home repository too (`services/home-assistant/compose.yaml`, step 6).
3. Wait until `curl -s http://<host>:8123/api/onboarding` answers (no login needed; it lists the
   first-run steps and whether each is done). The first start takes a minute or two.
4. **They** open `http://<host>:8123` and finish Home Assistant's first-run onboarding: their owner
   account, location, units. You never create the account and never see its password.
5. **They** create a long-lived access token (profile → Security) and save it in a file outside every
   repository, `chmod 600` (the rules above). Then the scan (step 2) — it finds nothing yet, which is
   right — and integrations (step 3), where Home Assistant's discoveries now show up.

The container is named `homeassistant`: that is the target's `container` in step 6.

## 2. Scan their hardware

Read every `components/*/component.yaml` (summary, devices, integrations with `setup`, `tested`,
`host.installs`) and `devices/*.yaml` (names, description, `tested.homes`, `tablet`).

```bash
uv run --project <catalog> domosenso recommend --catalog <catalog> --from-ha <HA URL> --token-file <token file> --json
```

The `scan` object says what their Home Assistant has and how it matched:

- `found` (`{token: {count, via, devices}}`): matched for certain, already counted. Show each with
  their own device names (`scan.devices[i].name_by_user` or `name`, manufacturer, model), e.g.
  "5 × TP-Link T315 (Living room, …) → tapo-t315".
- `maybe`: a likely match, not counted. Ask about each token, one question at a time, naming the
  devices ("Is the Lenovo tablet the wall tablet?", "Which of these players should the tablet show?").
- `unmatched` (`{integration: [device indexes]}`): devices no rule knows. Mention the integrations
  that might matter for what they want; skip the rest (bulbs, phones, network clients).

The scan holds their device names: show it in the conversation, never write it into the catalog
checkout, a pull request or an issue. A `FAIL` (URL, token): fix it with them before going on.

## 3. Integrations: discovered and not discovered

```bash
uv run --project <catalog> domosenso discover --catalog <catalog> --from-ha <HA URL> --token-file <token file> --json
```

Lines: `discovered <domain> <n> via <source>` (found on the network, waiting in Settings → Devices &
services → Discovered), `ignored <domain> <n>` (discoveries they dismissed), `configured <domain> <n>`,
`failing <domain> <n> <state>` (set up but not working), `catalog <domain> <components>` (a catalog
component uses it). `data.flows[].title_placeholders` names the devices (and sometimes addresses):
show them in the conversation only.

1. Show each `discovered` domain with its devices, each `failing` entry, and the `catalog` links that
   matter for what they want.
2. Ask which brands and services they use that Home Assistant cannot discover (vendor clouds, a heat
   pump, a car, an energy tariff, a vacuum). Propose integration domains **as your suggestion**, then
   check them all at once:
   `domosenso discover ... --domain <d1> <d2> ...` → `integration <d> <iot_class> <type> config-flow
   yes|no` (Home Assistant has it; `local_*` works without the vendor's cloud) or `absent <d>` (a HACS
   integration not installed, or a wrong name). Present only checked domains, each with its
   `documentation` link from `data.manifests`.
3. **They add integrations in the UI** (Discovered → Add, or Add integration); you do not submit
   config flows. Most ask for an account, a pairing code or a button press.
4. Limits to say once: discovery sees only what reaches the container (host networking); Bluetooth
   needs an adapter or ESPHome proxies; cloud-only integrations are never discovered.
5. After they add some, run step 2 again so the new devices count.

## 4. Recommend components and hardware

Run again with what they confirmed and what Home Assistant does not know yet (a tablet not set up,
awnings with no controller) as `--have`, without `--json` unless you need it:

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
- **hardware to buy**, per wish that no fitting component covers: each `needs` device with its
  `devices/<id>.yaml` name and description and "tested in N homes" (`tested.homes` of the device file;
  `--json` gives it as `needs[].tested_homes`; absent = unknown). For a kind with no recommended
  device, say plainly: "the catalog names no tested model for <kind>". `optional ... lacks` lines are
  "would add <feature>". Never order or buy anything;
- `describes` components install nothing (they say what the Ramka reads).

Confirm with them which components they want eventually. Only `backup` is added today.

## 5. The Ramka and its tablet (only if they want the wall tablet)

**What it is.** A wall tablet showing Home Assistant full-screen through the Companion app. A radar
next to it (`hlk-ld2410c` on a `bermuda-presence` node) wakes the screen when someone is in the
room; with nobody there for `off_delay_s` (300 s by default) the screen goes off. Brightness follows
the tablet's light sensor. Modes: `off`, `ambient`, `controls`, `calendar`.

- ambient: a rotation of 130 s — climate 30 s, air 15 s, plants 20 s, five photos of 10 s, status
  15 s; while the music player plays, it shows what is playing instead (a swipe switches);
- controls: a hand near the screen (100 cm for 1 s) or a tap — music, awnings, lights;
- calendar: a button on the controls opens the agenda.

**What each page needs** (show which of them their hardware fills; from ramka 0.2.0 climate, air,
plants and photos are optional — a page whose input is absent is left out of the rotation):

| page | needs |
|---|---|
| climate | temperature (and humidity) sensors per room (`climate-air`); the `weather` entity is required anyway |
| air | an air-quality sensor (`ruuvi-air` recommended) |
| plants | plant sensors (`plants`, `mi-flora`) |
| photos | a folder under `/config/www` (`photo_dir`); an empty folder skips the page |
| status | awnings, contacts, power, locks — all optional |
| now playing, controls | a `media_player` meeting the Ramka's `media_player_contract`; covers and lights optional |
| calendar | a `calendar` entity — required |

In 0.1.2 `air`, `plants`, `climate` and `photo_dir` are required; take 0.2.0 or newer for a home
without them.

**Which tablet.** Stop at the first that answers:

1. The scan: a `found` tablet device id (e.g. `tcl-9469x`) is a tested model — read its device file's
   `tablet` profile; a `maybe android-tablet` is a Companion app device they confirm. The device gives
   `manufacturer`, `model` and `sw_version` (on Android the API level: 35 = Android 15, 36 = Android 16).
2. Not in Home Assistant yet: they name it; tell them what the catalog knows of it (usually nothing)
   and what to check once it is set up.

**Its setup**, measured where you can, asked where you cannot (read-only except the probe; the slug is the part
after `notify.mobile_app_` of its notify action):

| what | how |
|---|---|
| notify action `notify.mobile_app_<slug>` | `GET /api/services`, domain `notify` |
| Companion sensors the Ramka reads: `sensor.<slug>_light_sensor`, `_battery_level`, `_app_importance`, `_charger_type`, `_battery_temperature`, `binary_sensor.<slug>_is_charging` | each present in `GET /api/states` (a disabled one is absent): a missing one they enable in the app's sensor settings |
| charge limit | `GET /api/history/period/<3 days ago, ISO>?filter_entity_id=sensor.<slug>_battery_level,binary_sensor.<slug>_is_charging&minimal_response&no_attributes`: the highest level while charging; near 100 % means no limit — suggest the tablet's battery-protection setting or a smart-plug schedule |
| Companion app version | ask (app → Settings → About); 2026.6.5 can get stuck awake (ramka README), 2026.8.4 or newer is better |
| kiosk: a Home Assistant user of its own, `kiosk-mode` (HACS) or Android screen pinning | ask |
| permissions: *Modify system settings*, *Display over other apps*, lock screen None, the app's *Keep screen on* **off** | ask, as a checklist |
| screen: CSS width × height, pixel ratio, WebView version, JSON modules | the probe (below); a tested model's device file says what to expect |
| mounting: wall or stand, room, height, where the radar goes | ask |

**The probe** (after `init`, step 6, because it needs the `production` target; it writes to their
Home Assistant, so ask first and say it adds one logbook line):

```bash
domosenso probe production --install     # copies the probe card, adds a resource and the dashboard domosenso-probe
domosenso probe production --read        # waits up to 300 s; run it, then have them open the page
```

They open `<HA URL>/domosenso-probe/0` in the tablet's Companion app, signed in as the tablet's own
user, in the orientation it will hang. `--install` may print `warning /local/ is not served ...`:
Home Assistant needs a restart first (their yes). `--read` prints `probe viewport <w>x<h> dpr <r>
screen ... webview <major> json-modules yes|no dvh yes|no user admin|non-admin`. Read it against
what the Ramka needs: its one tested layout fits 1024–1280 × 720–800 CSS px (ramka 0.2.0: put the
viewport into the `screen` input; rendering fails for a size no tested layout fits — a new layout is
catalog work, tested on staging at that size first); `webview` below 123 or `json-modules no` means the cards will not load (the
Android System WebView needs an update, which old Android versions no longer get); `user admin`
means the tablet is signed in as an admin — suggest a user of its own. Then always:

```bash
domosenso probe production --remove
```

Write the profile into the home repository only (a comment block in `domosenso/ramka.inputs.yaml`
when the Ramka is added), never into the catalog. A tablet model the catalog does not know can become
a device file through a pull request they agree to — model facts only.

## 6. Start the home repository

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
   Add one line after the production bullet with how they reach Home Assistant (step 1.4): the
   internal URL and the remote way, or "remote: none".
4. **configuration.yaml.** Read it from the target (`mkdir -p <home>/home-assistant` first):
   `ssh <host> <docker> exec <container> cat /config/configuration.yaml > <home>/home-assistant/configuration.yaml`.
   A rendered package is loaded only through `homeassistant: packages: !include_dir_named packages`.
   If that is missing, add it (merge into an existing `homeassistant:` key); if they include
   packages another way (`!include_dir_merge_named`, another directory), stop and ask. This file
   is the home's from now on and the deploy carries it. Never copy `secrets.yaml`, `.storage/` or
   the database.
5. `.gitignore` with `.domosenso/`. Commit: "Start the home on Domosenso".

## 7. First component: backup

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

## 8. Stop at the plan

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

- Every component and device is tested in one home, the maintainer's; `ramka`'s manifest does not
  record it (`tested-homes unknown`). Their home would be the second.
- No staging for a new home yet (an installable staging Home Assistant with scene simulation is
  planned): changes go to production after `--plan`, with `snapshot`, `verify` and `rollback`.
- Installing Home Assistant (section 1.1) is tried on a local container, not yet on a Synology or a
  mini PC. Remote access is not a catalog component yet (`remote-access`, SPEC-011 phase E).
- The Ramka: one tested layout (1024–1280 × 720–800 CSS px, landscape); portrait or a phone needs
  a new one. The probe is tried on a local Home Assistant, not yet on a real tablet. ramka 0.2.0
  (optional pages, `screen`) reaches `recommend` once it is tagged. Its music player
  contract is tested with a Hegel through `hegel_streaming`; another `media_player` (a Naim through
  `cast` or `dlna_dmr`) should work and has not been tried.
- `calendar`, `media` and `weather` install nothing.

## After onboarding

Their home repository's `AGENTS.md` takes over: open the agent in the home repository for
everyday work. A next component: `domosenso add <id>@<version>`, inputs from their HA, `render`,
`--plan`, their yes. A fix to a component goes to the catalog as a pull request (spec first for
anything new), without their household in it.
