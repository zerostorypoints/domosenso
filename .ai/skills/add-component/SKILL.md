---
name: add-component
description: Add one catalog component to a home that is already on Domosenso and take it all the way to working - the Home Assistant integrations it needs (built in or from HACS on a Container install), the containers next to Home Assistant (an MQTT broker, a bridge, a connector), the ESPHome device files and secrets, the firmware a board needs, then render, plan, deploy with the owner's yes and verify. Use after onboarding, when a home wants a next component such as bermuda-presence, awnings, plants, climate-air, lights or the ramka.
---

# add-component

One component into one home (SPEC-015), in the order of "What runs where" in
`<catalog>/docs/getting-started.md`: inside Home Assistant, next to it on the Docker host, on the
owner's computer, on the devices. Work from the home repository; its `AGENTS.md` names the catalog,
the targets and the token file. Talk to the owner in their language.

## Rules

- The rules of `onboard-home` hold: reads are free; anything that writes to their Home Assistant,
  their Docker host or a device needs their go-ahead typed in this session, each time; the token
  never shows; nothing of the household goes into the catalog.
- **Their hands, not yours:** HACS and the Settings UI (adding an integration, a pairing, a
  discovery confirmation), every password (broker logins, Wi-Fi, the router), and every flash. You
  prepare the exact steps and commands and check the result.
- Commands: `uv run --project <catalog> domosenso --home <home> <command>`, written `domosenso
  <command>`. Read the last line: `ok` or `FAIL <reason>`.

## 1. Read before touching anything

- `domosenso recommend --from-ha production --have <their devices>`: the component `fits`, or
  `missing ... needs <kind>` (hardware to get first: stop there and say what).
- At the tag they will add (`git -C <catalog> show <id>/<version>:components/<id>/component.yaml`):
  `devices`, `integrations` (`source`: `core`, `hacs`, `firmware`; `setup`), `inputs`,
  `artifacts.services` and `artifacts.esphome`, `consumes` (another component this one reads: add
  that one first), `tested`. Then the component's `README.md` and `UPGRADE.md` at that tag.
- `domosenso discover --from-ha production --domain <each integration>`: which are discovered,
  configured, failing or absent.
- Their snapshot (`domosenso snapshot production --out .domosenso/snap/before-<id>.json`): none of
  the ids under `provides` may exist already; if one does, stop and explain (`adopt` or `update`
  may be the path, not `add`).

Tell them, in one short list, everything this component will need from them (integrations to add,
containers, boards to flash, secrets), before the first write.

## 2. Add and fill the inputs

```bash
domosenso add <id>@<version>
```

`add` writes `domosenso/<id>.inputs.yaml` (required inputs with the catalog's fictional example,
optional ones commented) and, once, the home's own files: `instance <path>` lines, among them the
ESPHome device files (`<esphome_dir>/<file>`, one per item of the list input the manifest names) and
the files of each container service (`services/<name>/`). `instance-kept` means the home had that
file: it stays as it is. Replace every example with a value read from their Home Assistant (areas,
entity ids, notify actions: read-only API calls) or asked; say where each came from. A device file
is generated from the inputs: fix an input and `add` again only before the first commit, else edit
the file, which is the home's.

## 3. Inside Home Assistant: integrations

For each entry of `integrations`, by `discover`'s answer:

- `configured`: nothing to do. `failing`: show its state, stop until they fixed it.
- `core`, `discovered`: they confirm it in Settings → Devices & services. `core`, `absent`: they
  add it there; the `setup` text says what it asks for (an account, a button on a bridge).
- `hacs`: a Container has no add-on store, but HACS works: if `discover` shows no `hacs` entry,
  they install HACS (hacs.xyz, "Download" for a Container: a script run inside the container, then
  the integration in the UI and a GitHub login on the device page). Then HACS → the `repo` → the
  `tested` version → restart (their yes) → Settings → Add integration. Without HACS: the release
  of `repo` copied into `/config/custom_components/<name>/` through the container (root-owned),
  then the restart and the UI. Record the version under `custom_integrations` in `domosenso.yaml`.
- A frontend plugin from HACS (the Ramka's optional `kiosk-mode`): HACS → Frontend.

Done when `discover --domain <name>` prints `configured <name> 1` (or more).

## 4. Next to Home Assistant: containers

`domosenso status` lists them: `service <id> <name> image <ref> (manual)` or `... build (manual)`.

- **A broker first**, when the component requires kind `mqtt-broker` and `discover --domain mqtt`
  shows no `configured mqtt`: if they already run one elsewhere, use it. Otherwise copy
  `<catalog>/examples/home-template/services/mosquitto/` into the home at `services/mosquitto/` and
  follow its compose file's header on the host. They type each login's password in
  `mosquitto_passwd`; one login per client. Then they add the MQTT integration (Settings → Add
  integration → MQTT, host = the Docker host, the `homeassistant` login).
- **Each service:** `add` copied its files to `services/<name>/`. Read its compose file and the
  component's README for the env file (`env_example` → `.env` or the name the compose file uses,
  filled with addresses and logins; passwords by them, on the host, never in the repository). Then,
  with their yes: copy the directory to the host next to their other services, and
  `ssh <host> "cd <dir> && <docker> compose up -d"` (`--build` for a `build` service; on a Synology
  the compose command may be `docker-compose`). Check `<docker> ps` and the container's log for the
  line the README names. Commit the home's copy (never the filled env file: list it in
  `.gitignore` if its name is not covered).

## 5. On the devices: ESPHome and firmware

**ESPHome** (`artifacts.esphome`): there is no ESPHome container or dashboard; the CLI runs on their
computer through `uvx`, at the version the catalog pins.

1. Secrets: `domosenso status` prints `esphome-secret <key> missing` for each key the device files
   read that `<esphome_dir>/secrets.yaml` lacks. They create that file (git-ignored by the home's
   `.gitignore`): the Wi-Fi name and password (2.4 GHz: an ESP32 has no 5 GHz) typed by them; an API
   key from `openssl rand -base64 32`, which you may generate into the file without printing it.
2. Check, from `<esphome_dir>`: `uvx esphome@<tested esphome version> config <file>` then `compile
   <file>`, for every device file. Both are yours to run; they write nothing to a device.
3. Flash, by them: the board on USB, `uvx esphome@<version> run <file>` and pick the serial port
   (if none shows, hold the board's button while plugging in). Later updates the same command over
   Wi-Fi. A board on the factory image (`artifacts.esphome.factory`) is adopted instead (the
   component's README).
4. Each board then appears in Home Assistant as a discovered ESPHome device: they confirm it with
   the API key. Reserve its address in their router.

**Firmware** (`status`: `firmware <id> <name> <version> (manual)`): the release file `asset` of
`repo` at `version`, from the project's GitHub releases page. Give them the `flash` command with
`<port>` and `<asset>` filled in and the `setup` steps (the component's README has them in full). A
flash that erases a board in use erases its pairings: ask first.

## 5.1 The audio-sensor (only for `audio-sensor`)

An M5Stack Atom EchoS3R per room (SPEC-018). Ask, per sensor: the room and the Home Assistant area,
and whether it is the music source (`music: true`; at most one sensor).

- **`entities:` ids from Home Assistant, read-only.** HA builds the ids from the device and area
  names when the board is adopted, so the default guess is wrong for a renamed or adopted board.
  Read `GET /api/states` for each key of `entities:` (spectrum, level, peak, ...). An adopted board
  can have both id styles, and ESPHome text sensors show as `sensor.*`: take the id that exists and
  has a state.
- **The first flash and the factory image, by them.** Name both: download mode (hold the button
  while plugging in USB-C), `uvx esphome@<tested version> run <device file>`; a board nobody
  configured yet takes `esphome/audio-sensor.factory.yaml` (Improv, then adoption). Then they
  confirm the discovered ESPHome device with the API key.
- **When `ramka` is installed**, ask: "Show this sensor's music on the Ramka: Spectrum, Level, or
  keep Classic?" Then:
  1. set `music_visual: spectrum` or `level` in `domosenso/ramka.inputs.yaml` (Classic: leave it
     absent); `music_visual_options` is optional, the look is tuned live;
  2. `domosenso render audio-sensor ramka` (ramka at 0.4.0 or newer; it reads the music sensor's
     aliases);
  3. add the Ramka settings dashboard to `configuration.yaml`, one entry for the home's language
     (`ramka/README.md`, "Settings page": `lovelace: dashboards: ramka-settings:` with
     `mode: yaml`, `filename: dashboards/ramka-settings.<lang>.yaml`, `require_admin: true`);
     a restart is theirs;
  4. tell them: the visual type and the palette (Basic) and every parameter (Advanced) are tuned
     live in Home Assistant, **Ramka settings, Music**, and show on the tablet at once.
- **Calibration:** the offset starts at 0, so `sensor.music_level` is dBFS plus 0 until measured.
  The Music page's Advanced block (measured offset, note, Apply) sets it against a reference meter
  (`audio-sensor/README.md`, "The music source and calibration").

## 6. Render, plan, apply, verify

```bash
domosenso render <id>
domosenso status                      # no unclassified line; the manual lines are what is still open
domosenso deploy production --plan    # (staging first if the home has one)
```

Explain the plan as `onboard-home` section 8 does, then only on their typed yes:

```bash
domosenso snapshot production --out .domosenso/snap/before-<id>.json   # if not taken in step 1
domosenso deploy production --apply --confirm <hash>
domosenso verify production --baseline .domosenso/snap/before-<id>.json
```

Then check what the component provides, read-only: each entity of `provides` exists and has a
state, a container's state comes through (the bridge's first frame, the broker's clients). A
component with cards on the Ramka: press its reload button (`input_button.<prefix>_reload`).
Commit the home with what was done and what is still open (a board not flashed yet, a login not
made).

## Done means

`status` shows the component locked and no `unclassified` line; every `integration`, `service`,
`firmware` and `esphome-secret` line it printed has been dealt with or is written down as open in
the commit; `verify` ended in `verified`.
