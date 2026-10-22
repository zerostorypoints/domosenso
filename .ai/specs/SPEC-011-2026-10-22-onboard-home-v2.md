# SPEC-011: `onboard-home` v2 — access, install, integrations, hardware advice, the Ramka and its tablet

Status: approved 2026-10-22 by the maintainer, typed in the session that wrote it ("OK dla SPEC-011,
odczytaj model tabletu z mojego HA"; draft 2026-10-22).
Source: the maintainer's flow for onboarding v2 (2026-10-22, seven points, quoted by number below);
SPEC-009 (`onboard-home`, `recommend`), SPEC-010 (`recommend --from-ha`); `components/ramka`
(manifest, README, templates); the first outside home (Home Assistant Container on a Synology NAS)
starts soon.

Facts marked **verified** were read on 2026-10-22 from the Home Assistant 2026.9.2 image's source
(`/usr/src/homeassistant/homeassistant/...`) or from this repository. **Inference** is marked as such.

## Goal

A person who wants Home Assistant and help from Claude Code or Codex runs one skill and comes out
knowing how they will reach their home, with Home Assistant running, the integrations their network
offers proposed, a list of hardware to buy for what they want (each item marked with how tested it
is), and — if they want the Ramka — a tablet whose setup and screen are measured and a Ramka layout
that is tested at that screen size. Reads stay free; every write needs their typed yes (SPEC-009's
rules are unchanged).

## The flow, today and to build

| # | step | exists today | to build in v2 | phase |
|---|---|---|---|---|
| 1 | Who, which host | skill: Container over SSH, HAOS → stop | any Docker host over SSH stated as the same path; HAOS and others named out of scope (§1) | A |
| 2 | How they reach HA | nothing | skill section: web, Companion app, remote access options; the dedicated device (§2); `remote-access` component, own spec | A (text), E (component) |
| 3 | HA running? scan : install | scan (`recommend --from-ha`) | install path for a Docker host: compose file, first-run, token (§3) | D |
| 4 | Integrations on the network | nothing | `domosenso discover` (read-only, HA's own discovery) and the skill's proposals (§4) | A |
| 5 | Hardware they do not have | `recommend` `needs` lines, `devices/*.yaml` descriptions | wishes → components → devices, `tested.homes` on device files (§5) | A |
| 6 | The Ramka explained | nothing in the skill | skill section (§6); ramka 0.2.0: pages optional | A (text), C (component) |
| 7 | The Ramka's tablet | `kinds/android-tablet.yaml` (`maybe` only), README notes, 1100 × 720 layout | tablet profile from scan, history and a probe page (`domosenso probe`); ramka `screen` input with tested layouts; a tablet device file (§7) | A (scan, interview), B (probe), C (layouts) |

## 1. Host (point 1)

- **In scope:** Home Assistant Container on a Docker host reached over SSH with key login — the
  `ssh-docker` target that exists. Synology is the tested host. A mini PC or any Linux box running
  Docker is the same code path (`ssh`, `docker exec`, files under the config path); the skill says
  it is untested and the first such home tests it.
- **Out of scope for v2:** HAOS (no `docker` on the host, add-ons instead of compose services,
  `backup` excludes it; a deploy target for it needs its own spec), Home Assistant Core in a venv,
  Home Assistant Supervised. The skill says so and stops, as today.

## 2. How they will reach Home Assistant (point 2)

### 2.1 What the skill explains

Asked early, because it decides what the install (§3) and the Companion app need:

| way | what it needs | state in Domosenso |
|---|---|---|
| Browser on the local network | the URL, `http://<host>:8123` | works |
| Companion app (Android, iOS) on the local network | the app, the URL as internal URL | works; the Ramka uses the Android app |
| Remote, Nabu Casa cloud | a subscription, set up in HA's UI | works with a Container (inference: not tried here) |
| Remote, Cloudflare Tunnel | a domain on Cloudflare, `cloudflared` as a compose service, HA `http:` with `use_x_forwarded_for` and `trusted_proxies` | runs in the maintainer's home, not in the catalog → `remote-access` component (§2.2) |
| Remote, VPN (Tailscale, WireGuard) | an agent on the host and on each phone | not in the catalog; the skill names it as an option |
| Port forwarding on the router | — | the skill advises against it |

The skill records the choice in the home's `AGENTS.md` (internal and external URL) and, for remote
access, says which component or manual setup follows. It changes nothing on the router, at
Cloudflare or at Nabu Casa.

### 2.2 `remote-access` component (own spec, phase E)

Proposed as a new catalog component, specified separately (spec-first: SPEC-012, written when phase E
starts): `cloudflared` as a compose service (`artifacts.services`), the tunnel token in an env file
outside every repository, a rendered `http:` package for the proxy headers (whether `http:` loads from
a package is **inference**, checked in that spec), `homeassistant: external_url`. Not in v2's skill
beyond naming it. Corrected 2026-10-22 by SPEC-012: on 2026.9 the `http` settings live in
`.storage/http` and YAML is ignored; they are changed over the websocket.

### 2.3 The dedicated always-on device

- **Android tablet:** supported (the Ramka, §6–7).
- **Phone as a dedicated screen: out of scope for v2.** Untested; the Ramka's layout is landscape
  1100 × 720 CSS px and a phone in landscape is roughly half as tall (inference: ~390–430 CSS px);
  a phone layout would be a new tested layout (§7.4) and nobody has asked for one. Phones are access
  devices (Companion app) and notification targets.
- **iPad / iOS:** out of scope. The Ramka drives the screen with Android Companion app notification
  commands (`command_screen_brightness_level`, `command_launch_app`); `kiosk_reload` exists only in
  the iOS app (README).

## 3. Home Assistant present? Scan, or install (point 3)

- **Present:** unchanged — the scan from SPEC-010 (`recommend --from-ha <URL> --token-file`).
- **Not present (phase D):** install on their Docker host:
  1. `examples/home-template/services/home-assistant/compose.yaml`, copied once into the home
     repository (the home owns it, like the `services/` of `awnings`): image
     `homeassistant/home-assistant:2026.9.2` (the pinned version), `network_mode: host`, the config
     volume, `/etc/localtime:ro`, `/run/dbus:/run/dbus:ro`, `restart: unless-stopped`; the rest as
     Home Assistant's own Container installation page says at implementation time. `network_mode:
     host` is needed for zeroconf, SSDP and DHCP discovery (§4) — inference from how multicast and
     a bridge network behave; checked on the first install.
  2. Copy it to the host and start it, after their typed yes: `scp`, then
     `ssh <host> <docker> compose -f <path> up -d`. On Synology the compose command may be
     `docker-compose` or Container Manager's project (inference; checked on the first install).
     `domosenso deploy` does not run compose today (verified: no command handles
     `artifacts.services`; `catalog_check` only checks the paths exist).
  3. Wait until `GET <url>/api/onboarding` answers (verified: the view has `requires_auth = False`
     and returns the onboarding steps and whether each is done).
  4. **The person** opens the URL and completes HA's first-run onboarding (owner account, location,
     units). The agent never creates the owner account and never handles its password.
  5. **The person** creates a long-lived access token (profile → Security) and saves it in a file
     outside every repository, `chmod 600` (SPEC-009's rule). Then the scan as above.
- `init` then gets a `production` target pointing at this host; nothing else changes.
- As built in phase D: the file follows Home Assistant's Container page as read on 2026-10-22
  (`privileged`, `/run/dbus`, `stop_grace_period: 60s`, `network_mode: host`, container
  `homeassistant`), with the image pinned. Tried on Docker Desktop on a Mac with an override that
  publishes the port instead of host networking (a Mac has none to the LAN): the container starts,
  `/api/onboarding` answers within seconds, and after onboarding `discover` and `recommend --from-ha`
  read it. Not tried on a Synology or a Linux host (owed to the first such home).

## 4. Integrations: what Home Assistant discovered, and what it cannot (point 4)

### 4.1 `domosenso discover` (new, read-only)

```
domosenso discover [--from-ha <target or URL> [--token-file <file>]] [--domain <domain>...]
                   [--catalog <path or URL>] [--json]
```

`--catalog` (added in phase A) names the catalog whose components the `catalog` lines link; default
the home's, none without a home. `--from-ha` is required.

`--from-ha` / `--token-file` as in SPEC-010 (a target of `domosenso.yaml`, or a URL with a token
file before `init`). Websocket, the same client as `snapshot`; the two `config_entries/*` reads need an admin
token (verified: `require_admin`), `manifest/get` does not.

| read | verified on 2026.9.2 | used for |
|---|---|---|
| `config_entries/flow/progress` | returns the flows in progress whose `context.source` is not `user` or `reconfigure`: discovered devices waiting for the person (`handler`, `context.source` such as `zeroconf`, `ssdp`, `dhcp`, `bluetooth`, `homekit`, `usb`, `mqtt`; `context.title_placeholders`; `step_id`) | `discovered` |
| `config_entries/get` | every config entry with `domain`, `source`, `state`, `disabled_by` | `configured`, `ignored` (`source: ignore`, a discovery the person dismissed), `failing` |
| `manifest/get` per domain | the integration's manifest from `async_get_integration`, so any built-in integration and any installed custom one, loaded or not | name, `integration_type`, `iot_class`, `config_flow`, `documentation` |

Lines (before `ok`), domains in alphabetical order:

| line | meaning |
|---|---|
| `discovered <domain> <n> via <source>[,<source>...]` | `n` flows waiting in Settings → Devices & services → Discovered |
| `ignored <domain> <n>` | `n` discoveries the person dismissed |
| `configured <domain> <n>` | `n` config entries set up |
| `failing <domain> <n> <state>` | entries in `setup_error`, `setup_retry` or `migration_error` |
| `catalog <domain> <component>[,<component>...]` | a discovered or configured domain that a catalog component names in `integrations` (manifests at their newest tags) |
| `integration <domain> <iot_class> <integration_type> config-flow yes\|no` | for each `--domain`: Home Assistant has it |
| `absent <domain>` | for each `--domain`: Home Assistant 2026.9.x does not have it (a HACS integration not installed, or a wrong name) |

`--json`: `data` holds `flows` (`handler`, `source`, `step_id`, `title_placeholders`), `entries`
(`domain`, `source`, `state`, `disabled_by`, `title`), `manifests`. `title_placeholders` and `title`
can carry device names and addresses; they appear in JSON only (§9).

Limits the skill states: discovery sees only what reaches the container (host networking, §3);
Bluetooth discovery needs an adapter or ESPHome proxies; USB needs the device mapped into the
container; cloud-only integrations (most vendor accounts) are never discovered.

### 4.2 What the skill does with it

1. Run `discover --from-ha ... --json`; show the person each `discovered` domain with the device
   names from `title_placeholders`, each `failing` entry, and each `catalog` link.
2. Ask about brands and services they use that Home Assistant cannot discover (vendor clouds, a
   heat pump, a car, an energy tariff). The agent proposes integration domains **as its suggestion**,
   then checks each with `discover --domain <d>...`: `integration` (exists, with `iot_class`, whether
   it is local or cloud) or `absent` (HACS or wrong). Only checked domains are presented, each with
   its `documentation` link.
3. Proposals are read-only. **The person adds integrations in the UI** (Discovered → Add, or Add
   integration). The agent does not submit config flows in v2: most ask for credentials, a pairing
   code or a button press, and an entry created by mistake is removed only by deleting it.
4. After they add some: run `recommend --from-ha` again, so new devices count.

Not built: a network scan from the person's computer (nmap, mDNS browsing) — Home Assistant's
discovery covers the same protocols from where the devices will be used, and a scan of a home network
from a laptop needs its own consent and privacy rules.

## 5. Hardware they do not have yet (point 5)

- **Today:** `recommend` prints `needs <id>@<version> <kind> [<device id>,...]` per missing device,
  with the catalog's recommended device ids; `devices/<id>.yaml` has names and descriptions in en, de,
  pl. A component carries `tested.homes`; a device does not.
- **v2, catalog data:** an optional `tested: {homes: <n>, note: <text>}` on device files
  (`schemas/device.schema.json`, additive). The value is the number of homes the device runs in under
  a catalog component; absent reads as `unknown`. Filled for the eight device files from the
  maintainer's home (1 each).
- **v2, skill:** the wishes from the interview map to components (manifest `summary`, `provides`,
  `devices.optional[].feature`); for each wish whose component is `missing`, the skill lists the
  `needs` devices with the device file's name, description and "tested in N homes" (`unknown` when
  absent) — and for a kind with no recommended device, says plainly: "the catalog names no tested
  model for <kind>". Optional features (`optional ... lacks`) are listed as "would add <feature>".
  Nothing is bought or ordered by the agent.
- No new command: `recommend` already reads `devices/` at `HEAD` (SPEC-010 §3.4); its `--json`
  `needs[]` gains `tested_homes` per recommended device (additive).

## 6. The Ramka explained (point 6)

### 6.1 What the skill says (from the manifest, README and templates, verified)

A wall tablet showing Home Assistant full-screen through the Companion app. A radar next to it
(`hlk-ld2410c` on a `bermuda-presence` node) wakes the screen when someone is in the room; with
nobody there for `off_delay_s` (300 s by default; the README's field note says why 120 s was too
short) the screen goes off. Brightness follows the tablet's light sensor. Modes
(`input_select.<prefix>_mode`, FROZEN): `off`, `ambient`, `controls`, `calendar`.

- **ambient:** a rotation, 130 s a pass: climate 30 s, air 15 s, plants 20 s, five photos of 10 s,
  status 15 s. While the media player plays, ambient shows what is playing instead; a swipe switches.
- **controls:** a hand near the screen (`near_cm` 100 for 1 s) or a tap: music, awnings, lights.
  Back to ambient after the controls timer.
- **calendar:** a button on the controls opens the agenda.

What each page needs today:

| page | inputs | hardware / components |
|---|---|---|
| climate | `climate` (required), `weather` (required), `outside`, `pressure` | temperature (and humidity) sensors per room → `climate-air`; a `weather` entity |
| air | `air` (required, at least one tile) | an air-quality sensor (`ruuvi-air` recommended) |
| plants | `plants` (required, `plant.*` entities) | plant sensors → `plants` (`mi-flora`) |
| photos | `photo_dir` (required) | a folder under `/config/www`; an empty folder skips the page |
| status | `covers`, `status` (all optional) | awnings, contacts, power, locks |
| now playing | `media_player` (required) and its `media_*` inputs | any `media_player` meeting `media_player_contract` |
| controls | `media_player`, `covers`, `lights` | |
| calendar | `calendar` (required) | a `calendar` entity |

### 6.2 ramka 0.2.0: pages become optional (phase C)

A home without an air sensor or plant sensors cannot render the Ramka today (`air` and `plants` are
required). In 0.2.0 `air`, `plants` and `climate` become optional; a page whose input is absent is
left out of the rotation (its stage in `<prefix>_ambient_loop` is skipped, and its sections are not
rendered). The options of `input_select.<prefix>_ambient` stay as they are (FROZEN). Added during
phase C (the coordinator, 2026-10-22: the photo slideshow may become a `photos` component of its own
that the Ramka consumes): `photo_dir` is optional too, and without it nothing of the photos is
rendered — folder sensor, `input_text`/`image` photo, `shell_command` pick and index, the index
automation, the loop's photo stage. Those pieces depend on nothing else of the Ramka; they are not
extracted yet. Turning a
required input into an optional one is additive (COMPATIBILITY.md: inputs). `recommend` keeps
`ramka`'s requirements as they are (tablet, radar); the skill lists which pages the home's hardware
fills.

## 7. The Ramka's tablet (point 7)

### 7.1 Which tablet

In order, stopping at the first that answers:

1. **The scan.** A `mobile_app` device is `maybe android-tablet` (SPEC-010). Its registry entry gives
   `manufacturer`, `model` and `sw_version` — verified: `mobile_app` sets `sw_version` to the OS
   version from the app's registration. The person confirms which device is the wall tablet.
2. **The catalog.** A device file for a tested tablet model gives `found` instead of `maybe`, and its
   profile (§7.5). Today there is none: only `kinds/android-tablet.yaml`. v2 adds one for the tablet
   tested in the maintainer's home: `mobile_app` device, manufacturer `TCL`, model `9469X` (seen
   2026-10-22 in that home's device registry, read-only; `model_id` empty).
3. **The person names it** (a tablet not set up yet): the agent says what the catalog knows of that
   model (usually nothing) and what to check after setup.

### 7.2 Profile: what is measured, what is asked

| field | why the Ramka cares | how the onboarding gets it |
|---|---|---|
| manufacturer, model, Android version | match to a device file; WebView updates end on old Android (inference) | scan (`manufacturer`, `model`, `sw_version`) |
| Companion app version | 2026.6.5 can get stuck awake (README); 2026.8.4 applies *Keep screen on* live | asked (app → Settings → About); the registry does not carry it (verified: only the config entry's data has `app_version`, and `config_entries/get` returns no `data`) |
| Companion sensors the package reads: `light_sensor`, `battery_level`, `app_importance`, `charger_type`, `battery_temperature`, `is_charging` | brightness, alerts, the watchdog | entity registry: present and not `disabled_by` (scan, read-only); a missing or disabled one → the person enables it in the app |
| notify action `notify.mobile_app_<slug>` | screen commands | `GET /api/services`, domain `notify` |
| CSS viewport (width × height), device pixel ratio, orientation | the layout (§7.4) | probe (§7.3) |
| WebView (Chromium) major version | JSON module imports `with { type: "json" }` need 123+; `dvh` needs 108+ (Chrome release notes; not tried on a device) | probe (user agent), plus a real import attempt |
| kiosk setup: HA user for the tablet, admin or not, `kiosk-mode` (HACS), Android screen pinning | `kiosk_user` input; the header and sidebar hidden | asked; the probe reports whether its user is admin |
| permissions *Modify system settings*, *Display over other apps*, lock screen None, app *Keep screen on* off | brightness and wake commands work; the panel can sleep (README) | asked, as a checklist; verified later by a screen-on/off test with their yes |
| power: on a charger, charge limit | a battery held at 100 % swells (inference, general knowledge) | `charger_type`, and `battery_level` history over the last days (`GET /api/history/period`, read-only): the highest level while charging shows a limit (the tested tablet holds 80 %); without one, the skill suggests the tablet's battery-protection setting or a smart plug schedule |
| mounting: wall, stand; height; room; distance to the radar | radar placement, viewing distance | asked |

The profile is written into the home repository only: as a comment block and the `screen` input in
`domosenso/ramka.inputs.yaml` (§7.4). Nothing of it enters the catalog except, through a pull request
the person agrees to, a device file for a new tablet model (model facts, no household data).

### 7.3 `domosenso probe` (new, phase B)

A page the tablet opens in its Companion app that measures what the person cannot read off a
settings screen.

```
domosenso probe <target or URL> [--token-file <file>] --install | --read [--wait <seconds>] | --remove
```

- `--install` (a write: the skill asks first; it runs without `--confirm`, like `rollback`, because
  it only adds): copies `tools/probe/probe-card.js` to `<config>/www/domosenso/_probe/probe-card.js`
  over the target's `ssh`/`docker` (for a URL without a target: `FAIL needs a target`), creates the
  Lovelace resource `/local/domosenso/_probe/probe-card.js` (module) and a storage dashboard
  `domosenso-probe` (not in the sidebar, `require_admin: false`) with one panel view holding the
  card. Lines: `copied 1`, `resource create <url>`, `dashboard create domosenso-probe`,
  `open /domosenso-probe/0`. `_probe` cannot collide with a component id (ids have no `_`).
- The person opens that path in the tablet's Companion app, signed in as the tablet's user (or the
  agent sends `command_webview` with the path, after a yes). The card shows its measurements large
  on screen and reports them by calling `logbook.log` with name `domosenso-probe` and a JSON message.
  Why `logbook.log`: `fire_event` needs an admin user (verified) and the tablet's user usually is not;
  `logbook.log` is an ordinary service (verified) and fires `logbook_entry` (verified). The cost is
  one logbook line per report; the skill says so.
- `--read` subscribes to `logbook_entry` with the admin token (allowed: verified, a non-allowlisted
  event type needs admin) and prints, per report within `--wait` (default 300):
  `probe viewport <w>x<h> dpr <r> screen <W>x<H> orientation landscape|portrait webview <major> json-modules yes|no dvh yes|no user admin|non-admin`.
  `FAIL no report within <s> s` otherwise.
- `--remove` deletes the dashboard, the resource and the file; it refuses (`FAIL`) any that do not
  match what `--install` creates. The skill always removes the probe after reading it.
- The card measures `innerWidth`, `innerHeight`, `devicePixelRatio`, `screen.width/height`,
  `screen.orientation.type`, `CSS.supports("height", "100dvh")`, the Chromium major version from the
  user agent (`wv` marks a WebView), and does a real `import(..., { with: { type: "json" } })` of a
  small file next to it. Strings through `card.*` keys like every card.

As built in phase B: the card is `tools/probe/probe-card.js` with its strings in `probe.json` (the
file the JSON-module import tries), so `--install` copies two files (`copied 2`); its test is
`tools/probe/probe-card.test.mjs` (`npm test` runs `tools/` too). `--read` ends at the first report;
the browser field reads `webview <major>` in a WebView and `chromium <major>` otherwise. `--install`
prints `warning /local/ is not served ...` when Home Assistant needs a restart to serve a new `www/`.

Creating a dashboard and a resource goes through Home Assistant's own API, as the UI does; no file
under `.storage` is written by Domosenso.

### 7.4 Layouts: how the Ramka adapts (phase C)

**Today (verified in `templates/dashboard.lang.yaml.j2`):** one sections view, `max_columns: 3`,
every section `column_span: 3` (a 36-column grid); side-by-side cards with fixed column counts (16,
18, 20, 36); heights from the screen, `calc(100dvh - 272px)` and `calc(100dvh - 464px)`, where 272
and 464 are the fixed sections above and below (rows of 56 px and 8 px gaps); "rows 6 + 4 fit a 720
CSS px tall screen". The README says to judge it from screenshots at 1100 × 720, DPR 2.

**What breaks elsewhere (inference, to be confirmed by screenshots):** a shorter screen squeezes the
`dvh` cards to nothing; a narrower one makes Home Assistant show fewer than three view columns, so the
36-column widths wrap; a much wider one leaves margins (the sections view caps column width).

**v2:** a new optional input `screen: {width, height}` in CSS px, from the probe. The template holds
a table of **tested layouts**, each with the screen range it fits (minimum and maximum width, minimum
height) and the values it sets (`max_columns`, the card column counts, the row counts and the px
subtractions derived from them). Rendering picks the layout that fits; none fits →
`FAIL ramka: no tested layout for <w>x<h> (tested: 1100x720)`. `screen` absent = 1100 × 720, so
existing homes render byte-identical.

A new layout enters the table only with a home that needs it, and only when tested:

1. screenshots of every page (climate, air, plants, photos, status, now playing, controls, calendar)
   on that home's staging (or the demo home's) at the target CSS size and DPR, in en, de and pl;
2. one look on the real tablet after deploy, with the person;
3. the layout's row in the table names the home count it is tested in.

Portrait and phone layouts are out of scope (§2.3).

As built in phase C: the table has one layout, `1100x720`, fitting 1024–1280 × 720–800 CSS px — every
page shot on a demo staging at both corners (en; controls, climate and status in de as well), in a
desktop Chromium at DPR 2 with the header hidden as kiosk-mode does; not on a device. Its values
(`max_columns`, the px subtractions) stay in the template until a second layout needs other ones.
The renderer gained the global `fail(message)` for the refusal. `ha-check.sh` takes `INPUTS=<file>`,
and `check-all.sh` checks a render without climate, air, plants and photos.

### 7.5 Tablet device files (schema, additive)

Device files whose component is `ramka` may carry `tablet:`:
`{css: [<width>, <height>], dpr: <n>, orientation: landscape, charge_limit: <percent or null>,
companion_app_tested: <version>, webview_tested: <major>}`. The skill compares a probe against it;
`recommend` ignores it. The first file is the tablet tested in the maintainer's home, with a `match:`
rule on `mobile_app` and its model (certainty `found`).

## 8. Changes to SPEC-009, SPEC-010 and COMPATIBILITY.md

- **SPEC-009 / the skill:** the interview grows (access, install branch, wishes before hardware,
  the Ramka and its tablet); steps become: 1 host and access, 2 HA present → scan / absent → install
  (phase D), 3 integrations (`discover`), 4 recommend with hardware advice, 5 the Ramka and its
  tablet (if wanted), 6 start the repository, 7 backup, 8 stop at the plan. "Not ready" is rewritten
  from §10. The rules (reads free, typed yes for writes, token in a file, home outside the catalog)
  are unchanged; the probe's install and remove are writes.
- **SPEC-010:** `--json` `scan.devices[]` gains `sw_version` (additive). No new rule language; the
  tablet device file adds a `found` rule.
- **COMPATIBILITY.md:** new STABLE rows for `discover` (command line, lines, JSON keys) and `probe`
  (command line, lines); the `recommend` row notes `tested_homes` per device in `--json` `needs`;
  device files: optional `tested` and `tablet` (ADDITIVE-ONLY, as device files are); ramka inputs:
  `screen` new, `air`, `plants`, `climate` optional (additive); `www/domosenso/_probe/` and the
  `domosenso-probe` dashboard are not a contract.

## 9. Privacy

The scan, `discover`'s JSON (device names, addresses in `title_placeholders`), the probe report and
the tablet profile stay in the conversation and in the person's home repository. Text lines carry no
names (domains, tokens, counts, numbers). The commands write nothing to the catalog and cache
nothing. The skill never writes any of it into the catalog checkout, a pull request or an issue; a
device file for a new tablet model contains model facts only. Test fixtures use the demo home (Alex
and Sam). The real checks in §11 are reported in the conversation, never committed.

## 10. Out of scope for v2

- HAOS, Core, Supervised hosts (§1); a phone or an iPad as the Ramka; portrait layouts (§2.3).
- The agent submitting config flows, creating the HA owner account, creating tokens, or signing up
  for Nabu Casa or Cloudflare (§3, §4).
- A network scan from the person's computer (§4.2).
- Running compose services through `domosenso deploy` (§3 uses `ssh ... compose up -d` with a yes).
- Buying hardware; prices and shops.
- The `remote-access` component itself (SPEC-012, phase E).
- Filling other components' inputs from the scan (SPEC-010's out of scope stands).

## 11. Tests

- `tests/test_cli_discover.py` with `FakeHA`: discovered flows grouped by domain and source;
  `user` and `reconfigure` flows not shown (HA filters them; the fake returns what HA would);
  `ignored`, `configured`, `failing` from entry `source` and `state`; `catalog` links from a throwaway
  git catalog's newest tags; `--domain` → `integration` / `absent`; `--json` keys; no names in text
  lines; unreachable HA → `FAIL`; nothing written.
- `tests/test_cli_probe.py` with `FakeHA` and a fake target: `--install` copies one file, creates
  one resource and one dashboard; `--read` parses a `logbook_entry` and ignores other entries;
  timeout → `FAIL`; `--remove` refuses a dashboard it did not create.
- `components/ramka/cards/probe-card.test.mjs` (happy-dom): measurements, the `logbook.log` call,
  no literals.
- `tests/test_cli_recommend.py`: `tested_homes` per device in `--json`; `sw_version` in `scan.devices`.
- ramka 0.2.0: render without `air` / `plants` / `climate` leaves the sections and loop stages out;
  `screen` absent renders byte-identical to 0.1.2; an unfitting `screen` → `FAIL`; `ha-check ramka`
  with the demo inputs and with a reduced demo input file.
- `catalog_check --strict`: device files with `tested` and `tablet`.
- Real checks, read-only, once each, from the maintainer's home repository: `discover --from-ha
  production`; the probe on the tested tablet (install and remove need the maintainer's yes) must
  report 1100 × 720 at DPR 2.
- `tools/check-all.sh` green. Not automated: the skill's conversation; its first real run is the first
  outside home.

## 12. Phasing

| phase | content | for the first outside home |
|---|---|---|
| A | skill v2 text (§1, §2.1, §4.2, §5, §6.1, §7.1–7.2 without the probe); `discover`; device `tested`; `sw_version` in the scan; the tested tablet's device file | needed first |
| B | `domosenso probe`, the probe card | needed if they want the Ramka |
| C | ramka 0.2.0: optional pages, `screen` input, layout table; a second layout only if their tablet needs it, tested on staging at its size | needed if they want the Ramka |
| D | HA install path (§3) | not needed (they run HA) |
| E | `remote-access` component, SPEC-012 | later |

Each phase is its own pull request into `main`; C bumps `ramka` to 0.2.0 with an `UPGRADE.md` entry
("nothing to do; new optional inputs").

## 13. Open questions

1. Settled 2026-10-22: the tested tablet registers as manufacturer `TCL`, model `9469X`. Its retail
   name and its Android version (`sw_version`, which the scan does not print yet) are read in phase A;
   the retail name is not inferred from the model number.
2. Whether the Companion app exposes its own version as a sensor (inference: unknown; checked on the
   tested tablet in phase A; until then it is asked).
3. The Companion sensors that are off by default on a fresh install (inference: the light sensor may
   be); the scan reports what is missing either way.
4. Agent-submitted config flows for discoveries that need only a confirm click: left out of v2 (§4.2);
   the maintainer may want them.
5. Whether the probe should also live on as a hidden view of the Ramka dashboard, to re-measure after
   a WebView or Companion update (the now-playing card already prints the viewport in its debug line).
6. The compose command on Synology DSM 7.2 (`docker compose`, `docker-compose`, Container Manager
   project) — inference, settled on the first install (phase D).
