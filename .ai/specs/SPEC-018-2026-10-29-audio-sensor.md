# SPEC-018: `audio-sensor` 0.1.0, and the Ramka's music visual (ramka 0.4.0)

- Status: approved 2026-10-29 by the maintainer; issues #70, #71, #73
- Source: the maintainer's request (2026-10-29): bring a room sound sensor that one home built and
  runs (firmware with a third-octave spectrum, a wave card, a room-acoustics dashboard) into the
  catalog as one component, and let the Ramka show its music. Builds on issues #56 (the Atom EchoS3R
  as a sound-level meter) and #57 (room acoustics), which this component covers together.
- Amended before drafting by the plan's rulings: the sensor's entity ids are inputs, not derived;
  the visual's defaults live in the card, not in this component's inputs; the Ramka switches the
  visual at runtime; one music sensor is checked when the package renders.
- Amended 2026-10-29 (dropped by the maintainer): live settings (SPEC-021) cover the tuning; room
  acoustics figures and dashboard are not part of audio-sensor. Struck through and marked below
  (goal 4, the `apexcharts-card`, `playing`, `room_acoustics` and `sensors[].acoustics` inputs, the
  room-acoustics provides, the dashboard artifact, the questions, tests and the open question about
  the dashboard); the text stays readable as history. The website task is dropped too. Issue #70's
  acceptance criteria follow.
- Deploy of an unreleased render for the pre-merge look on a wall tablet: SPEC-019.
- Amended by SPEC-021 (Ramka live settings): `input_select.audio_sensor_music_source` picks the
  music board live and the music board's calibration is applied from the Ramka's settings
  (Provides); the visual's options bind Ramka helpers, `music_visual_options` gives their starting
  values, the Controls tile is removed, and 0.4.0 without `music_visual` is no longer
  byte-identical to 0.3.0.
- Amended 2026-10-30 by issues #99 (the visual lags fast bass) and #110 (eco / normal / fast), plan
  `docs/superpowers/plans/2026-10-30-spectrum-latency.md`: the spectrum's publish interval is set at
  runtime by a `Spectrum rate` select on the board (Firmware), the package forwards a choice and a
  watching flag to the music board (Provides), and the card's rise never runs shorter than the gap
  between pushes (Cards). The intervals are provisional until the wall measurement records them in
  the README.

## Goal

A home gets:

1. a room sound sensor on an M5Stack Atom EchoS3R: a thin ESPHome device file per board, firmware
   from a remote package at the component's tag, nothing secret in the package;
2. per sensor a calibration offset (dB SPL = dBFS + offset) and, from the one sensor marked
   `music: true`, four alias entities any component can read;
3. two cards: `ambient-wave-card` (a live wave drawn from the spectrum or the level, with a classic
   fallback when the sensor sends nothing) and `room-meter-card` (an analogue-style meter);
4. ~~opt-in (`room_acoustics: true`): derived figures per sensor (Leq, percentiles, peaks, sessions)
   and one Room acoustics dashboard;~~ *(dropped 2026-10-29)*;
5. with `ramka` 0.4.0 and its `music_visual` input: the now-playing view draws the music (spectrum
   or level) in place of the decorative wave, switchable on the tablet back to the classic wave.

## Devices

| role | kind | recommend | count | tested |
|---|---|---|---|---|
| required | `sound-sensor` (new kind) | `m5stack-atom-echos3r` (new device) | 1 or more | one board in one home, since 2026-10-29 |

- `devices/m5stack-atom-echos3r.yaml`: ESP32-S3-PICO-1-N8R8 (8 MB flash, 8 MB PSRAM), ES8311 codec,
  analog MEMS microphone through the codec (not PDM), NS4150B amplifier (the package keeps it off);
  names and description in en, de, pl; match rules for `recommend --from-ha`.
- `kinds/sound-sensor.yaml`: a microphone that reports sound levels to Home Assistant. Other boards
  can join the kind later; the firmware here is for this board only.
- Measured on the one board (2026-10): 31 third-octave bands five times a second, the spectrum worker
  at about 19 % of one core. Bands below about 50 Hz hold one or two FFT bins: approximate, adequate
  for the visual, not for measurement.
- Assumed, not tested: a second board in the same home (the inputs and the render allow it; only
  the single-music rule is tested).

## Integrations

| name | source | version | setup a human does |
|---|---|---|---|
| `esphome` | core | HA 2026.9.2 | adopt the board in Home Assistant once flashed (discovery confirmation), with the API key from the home's secrets |
| ESPHome (firmware) | firmware | 2026.9.1 | flash the first time over USB (download mode: hold the button while plugging in); then OTA |
| `template` | core | | none |
| ~~`apexcharts-card`~~ | ~~hacs, frontend~~ | | ~~only with `room_acoustics: true`; `status` lists it `(manual)`~~ *(dropped 2026-10-29)* |

## Firmware

- `esphome/audio-sensor.yaml`, a remote package: board, PSRAM, I2C, ES8311, I2S, the microphone with
  DC offset correction; the 1 s `sound_level` meter (Sound level, Sound peak); the 100 ms passive
  meter (Fast sound level, Fast sound peak) behind the Live tracking switch with a one-hour
  timeout; the spectrum block (Spectrum as 31 comma-separated dBFS values, ten 1-minute octave Leq
  sensors, Spectrum load); Wi-Fi signal, Uptime, Connected AP (BSSID), Mic gain; Restart and Safe
  mode buttons; the amplifier pin forced off. `project: domosenso.audio-sensor`.
- Substitutions with defaults, so the package validates alone: `room`, `area`,
  `name` (`audio-sensor-${room}`), `friendly_name` (`Audio sensor ${area}`), `mic_gain` (`24DB`).
  No `!secret`: a remote package cannot read the home's secrets.
- `esphome/components/audio_spectrum/` (`__init__.py`, `audio_spectrum.h/.cpp`, `spectrum_bands.h`):
  8192-point real FFT, Hann window, 50 % overlap at 48 kHz; energy per ISO 266 third-octave band,
  normalised so the band sum matches Sound level within about 1 dB; the band maths in
  `spectrum_bands.h` with no ESPHome dependency, tested on the host. The package loads it with
  `external_components: [{source: {type: git, url: https://github.com/zerostorypoints/domosenso,
  ref: audio-sensor/0.1.0, path: components/audio-sensor/esphome/components}}]`. The `ref` is a
  literal; `catalog_check` fails when it differs from the manifest's version.
- `esphome/device.yaml.j2` (`artifacts.esphome.devices`, one per `sensors` item): the thin device
  file `audio-sensor-<room>.yaml`: substitutions, `esphome: area:`, the remote package at the tag,
  `wifi` and `api` from `!secret wifi_ssid`, `wifi_password`, `api_encryption_key`
  (`artifacts.esphome.secrets`), and `ota` encrypted with the API key, as `bermuda-presence`'s
  device files do.
- `esphome/audio-sensor.factory.yaml`: Improv and `dashboard_import`, for a board flashed over USB.
- Spectrum rate (amended 2026-10-30, #99, #110): a template `select` `Spectrum rate`
  (`eco`, `normal`, `fast`) sets the spectrum's profile at runtime. **eco**: every 500 ms, the mean
  of the frames since the last publish; **normal**: every 200 ms, the mean (the behaviour before);
  **fast**: every 85 ms (the frame hop), the newest frame alone, since averaging blurs a hit. A
  publish happens when a new frame has landed and the interval has passed (10 ms slack, so an
  85 ms profile never skips a frame), never on a clock of its own, and never without a new frame.
  `normal` after a boot; a board left on `fast` returns to `normal` after 60 min (the
  `live_tracking_timeout` pattern). The publish rule lives in `publish_policy.h`, host-tested like
  the band maths. Measured 2026-10-30 (README): 499 / 200 / 87 ms. The firmware sets
  `api: batch_delay: 10ms`: the API keeps one state per entity in a batch, and its default 100 ms
  let `fast` through only every other frame.
- Not in the package: `bluetooth_proxy` (#56 proposes it). A home adds it in its own device file;
  see Open questions.

## Inputs

| name | type | default | example (demo home) |
|---|---|---|---|
| `sensors` | `list[{room, area, music?, ~~acoustics?~~, id_prefix?, name?, friendly_name?, mic_gain?, entities?}]`, required | | below |
| `sensors[].room` | slug with `-`, the board's hostname part | | `living-room` |
| `sensors[].area` | string, the Home Assistant area | | `Living room` |
| `sensors[].music` | bool: this board is the music source; at most one item | `false` | `true` |
| ~~`sensors[].acoustics`~~ | ~~bool: with `room_acoustics: true`, this board gets the derived figures~~ *(dropped 2026-10-29)* | | |
| `sensors[].id_prefix` | slug with `_`, prefix of the ids this component creates for the board | the room slug with `_` | `living_room` |
| `sensors[].name`, `friendly_name` | ESPHome substitutions | `audio-sensor-<room>`, `Audio sensor <area>` | |
| `sensors[].mic_gain` | ES8311 gain, `0DB` … `42DB` | `24DB` | |
| `sensors[].entities` | map of the board's entity ids, keys below | `<domain>.<area slug>_<name slug>_<entity slug>` | filled from Home Assistant by the `add-component` skill |
| ~~`playing`~~ | ~~entity id (`binary_sensor` or `media_player`): music plays~~ *(dropped 2026-10-29)* | | |
| ~~`room_acoustics`~~ | ~~bool: the derived figures and the dashboard~~ *(dropped 2026-10-29)* | | |

The `entities` keys, their domain and the entity-name slug of the default:

| key | domain | slug | key | domain | slug |
|---|---|---|---|---|---|
| `spectrum` | sensor | `spectrum` | `mic_gain` | sensor | `mic_gain` |
| `level` | sensor | `sound_level` | `wifi_signal` | sensor | `wi_fi_signal` |
| `peak` | sensor | `sound_peak` | `uptime` | sensor | `uptime` |
| `fast_level` | sensor | `fast_sound_level` | `bssid` | sensor | `connected_ap_bssid` |
| `fast_peak` | sensor | `fast_sound_peak` | `restart` | button | `restart` |
| `live_tracking` | switch | `live_tracking` | `load` | sensor | `spectrum_load` |
| `spectrum_rate` | select | `spectrum_rate` | | | |

Why the ids are inputs: Home Assistant builds an ESPHome entity's id from the device's names and
area when the board is adopted, and a renamed device keeps its old ids, so they cannot be derived
from `room` and `area` reliably (verified in one home, where one board's ids follow two different
rules). The default is a guess the skill corrects from the running Home Assistant.

Demo home (`examples/demo-home/inputs/audio-sensor.yaml`):

```yaml
sensors:
  - {room: living-room, area: Living room, music: true}
  - {room: kids-room, area: "Kids' room"}
```

(Until 2026-10-29 the demo also set `acoustics: true` on the second board, `playing:` and
`room_acoustics: true`; all three were dropped.) A home whose inputs still carry one of them gets a
render error that names it: 0.1.0 is unreleased, so there is no bridge.

There is no `music_visual_options` input here: the visual's look is the card's own defaults
(Cards), and the Ramka takes the overrides (ramka 0.4.0).

Render-time rules (the package template's `fail()`, tested by rendering):

- two items with `music: true` → `two music sensors: <room>, <room>`;
- two items with the same `room` or `id_prefix` → `duplicate room: <room>` / `duplicate id_prefix: <id_prefix>`;
- `entities` with a key not in the table → `unknown entity key: <key>`.

No item with `music: true` is valid: no aliases are created, and a Ramka with `music_visual` shows
its classic wave (below).

## Provides

| entity | stability | note |
|---|---|---|
| `input_number.<id_prefix>_spl_offset` | stable | 0–140 dB, step 0.1, restored, no `initial:`; a fresh helper starts at 0 and the README's calibration sets it |
| `sensor.<id_prefix>_spl_offset` | stable | the offset as a sensor, `component: audio-sensor`, `area:`, `calibrated:` (the board's flag; added 2026-10-30, for room-meter-card) |
| `sensor.music_spectrum` | stable | the music sensor's Spectrum CSV, dBFS, unchanged; excluded from the recorder |
| `sensor.music_spl_offset` | stable | that sensor's offset, dB; `calibrated:` from its flag (added 2026-10-30) |
| `sensor.music_level` | stable | its 1 s Sound level plus the offset, dB SPL; `none` while the source has no number |
| `binary_sensor.music_sensor_online` | stable | `on` while the Spectrum sensor is neither `unavailable` nor `unknown` |
| `input_select.audio_sensor_music_source` | stable | with a `music: true` board; options: the boards' areas, that board first; the four aliases above follow it (SPEC-021) |
| `sensor.music_mic_gain`, `sensor.music_spl_calibration` (`calibrated` \| `estimate`, attribute `note`) | stable | aliases of the selected music board (SPEC-021) |
| `input_boolean.<id_prefix>_spl_calibrated`, `input_text.<id_prefix>_spl_note` | stable | per board: offset calibrated or an estimate, and a note (SPEC-021) |
| `input_select.audio_sensor_music_spectrum_rate` | stable | with a `music: true` board; options `eco`, `normal`, `fast` (additive-only); no `initial:`; a state that is no option reads as `normal` (#110) |
| `input_boolean.audio_sensor_music_watching` | stable | with a `music: true` board; on while a view shows the music visual (the Ramka sets it); no `initial:` (#99) |
| automation `audio_sensor_music_spectrum_rate` | additive-only | sets the selected music board's `Spectrum rate` to the choice, `fast` only while watching is on (else `normal`; 10 s after watching turns off); re-applies on HA start, a source change and the board's select becoming available; the board left by a source change goes back to `normal` |
| `input_number.audio_sensor_measured_offset`, `input_text.audio_sensor_calibration_note`, `script.audio_sensor_apply_calibration` | stable | with a music board: apply a measured offset and a note to the selected board (SPEC-021) |
| ~~`<domain>.<id_prefix>_<figure>` with `room_acoustics: true` and `acoustics: true`~~ | | ~~the room-acoustics figures below~~ *(dropped 2026-10-29)* |
| ~~`input_select.room_acoustics_room`~~ | | ~~with `room_acoustics: true` and two or more acoustics sensors; options: the areas, the music sensor first~~ *(dropped 2026-10-29)* |
| ~~`event` `audio_sensor_spike` (`room`, `level`)~~ | | ~~with `room_acoustics: true`~~ *(dropped 2026-10-29)* |

~~Room-acoustics figures, ported from the home that built them, without anything specific to an~~
~~amplifier: level and peak in dB SPL, energy, Leq 1 min / 15 min / 1 h, min / max, L10 / L50 / L90,~~
~~crest factor, headroom, peak and Lmax today, clipped seconds, a spikes counter and its event; with~~
~~`playing` also the listening session (session Leq, a logbook summary when it ends). The exact list~~
~~of `<figure>` names is fixed by the package task and written into the manifest; additions later are~~
~~free, renames are not. Numeric template sensors return `none`, never the string `unknown`.~~ *(dropped 2026-10-29)*

The recorder exclusion of every board's Spectrum sensor (31 values five times a second) is part of
the package.

Entity ids Home Assistant builds for the boards (`entities`) are declared, not promised, as
`docs/COMPATIBILITY.md` says for ids from a device's names; they are listed under `upstream:`.

Every template entity carries `component: audio-sensor`; the per-board ones also `area:`.

**Consumes:** nothing from another component. (`playing` was dropped 2026-10-29.)

## Cards

Installed under `www/domosenso/audio-sensor/0.1.0/` (the card has no version of its own; "card
0.2.0" in the home's notes means the fallback feature set below), resources of type `module`:

- `ambient-wave-card.js` with its `lib/` (config, sources, engine, palette, geometry, 14 flavours,
  console) and `translations/`; tests beside it as `*.test.mjs`, moved in with the card.
- `room-meter-card.js`: the analogue meter (needle, zones, clip mark).

`ambient-wave-card`, configuration keys that are the contract from this release (STABLE; new
optional keys free): `source` (`kind: spectrum | scalar`, `entity`, `attribute`, `offset`, `axis:
third_octave`, `show`, `history`, `demo`, `scenario`), `flavour`, `flavour_options`, `colour`
(`palette`, `neutral`, `hot`, `neutral_color`), `dynamics` (`rise`, `fall`, `hold`, `tilt`),
`style.line_width`, `active`, `fallback`, `controls`, `fps`, `height`. Any number, boolean or choice
may name an `input_*`, `number`, `select` or `sensor` entity read on every update; an unusable
state gives that option's default. `fallback` is a literal (`none` or `classic`); letting it name an entity
later is an addition (amended 2026-10-30, final review).

Defaults, so every use looks as the reference home tuned it without configuration:

| | spectrum | scalar (level) |
|---|---|---|
| `flavour` | `dune` | `centre` |
| `colour.neutral` / `hot` | 30 / 70 | 30 / 70 |
| `colour.palette` | `series` | `series` |
| `dynamics.rise` / `fall` | 200 ms / 4 s | 200 ms / 4 s |
| `style.line_width` | 4 px | 4 px |
| `dynamics.tilt` | `true` | (spectrum only) |

Fallback (`fallback: classic`, default `none`, which keeps today's calm behaviour):

- When the source entity is `unavailable` or `unknown`, has never been seen since Home Assistant
  started, or a spectrum is stale for 5 s, the card draws the classic wave: the three sines,
  primary colour and line of the Ramka's now-playing wave. Never an empty strip.
- While it falls back, `mdi:information-outline` sits in the top right corner; its tooltip and
  `aria-label` say that the sound sensor sends no data, so the classic wave shows (`card.ambient_wave.*`
  keys, en, de, pl).
- When data returns, the live visual comes back and the icon goes, without a page reload.

Rise and the push rate (amended 2026-10-30, #99): the engine applies `dynamics.rise` as at least the
gap between the last two pushes (clamped to 1 s). A rise shorter than that gap reaches the target
and stands still until the next push, so the picture moves in steps; at the gap it glides. Fall and
hold are unchanged.

## Ramka 0.4.0: the music visual

### Inputs (ramka)

| name | type | default | example |
|---|---|---|---|
| `music_visual` | `spectrum \| level` | `null` | `spectrum` |
| `music_visual_options` | `{spectrum?: {flavour?, neutral?, hot?}, level?: {flavour?, neutral?, hot?}, palette?, rise?, fall?, line_width?, tilt?}` | `null` | `{level: {flavour: tide}}` |

`music_visual` absent: the package and the dashboards render byte-identical to 0.3.0 apart from the
version in the stamp and the resource URLs. `music_visual_options` overrides the card's defaults
key by key; absent keys are left out of the card config, so the card's defaults apply.

### Provides (ramka, additions)

| entity | stability | note |
|---|---|---|
| `input_select.<prefix>_music_visual` | stable; options `spectrum`, `level`, `classic` | with `music_visual`; the input's choice is the first option, so a fresh helper starts there; no `initial:` |

### Consumes (ramka, new)

From `audio-sensor`: `sensor.music_spectrum`, `sensor.music_spl_offset`, `sensor.music_level`,
`binary_sensor.music_sensor_online`, and the `ambient-wave-card` element. Ramka's render cannot read
another component's inputs; the home's lock loads the card's resource.

### Now-playing card: the `visual:` option

```yaml
type: custom:now-playing-card
wave: true
visual:
  select: input_select.ramka_music_visual
  spectrum:
    type: custom:ambient-wave-card
    source: {kind: spectrum, entity: sensor.music_spectrum, offset: sensor.music_spl_offset}
    active: binary_sensor.ramka_media_playing
    fallback: classic
  level:
    type: custom:ambient-wave-card
    source: {kind: scalar, entity: sensor.music_level}
    active: binary_sensor.ramka_media_playing
    fallback: classic
```

- A new optional key of the card (STABLE surface, additive). Without `visual:` the card is
  unchanged; the existing wave code is untouched.
- The select reads `spectrum` or `level`: the card creates that card config (Home Assistant's
  `createCardElement`) in the wave strip, about 63 px high on the 1100 × 720 tablet, and draws no
  wave of its own. Only the selected config is instantiated; a switch removes the previous one.
- The select reads `classic`, `unavailable`, `unknown` or anything else: the card draws its own wave
  and instantiates no visual.
- `ambient-wave-card` not defined (no `audio-sensor` in the home): the card draws its own wave and
  creates the visual once the element is defined (`customElements.whenDefined`).
- The strip shows while `binary_sensor.<prefix>_media_playing` is on, as the wave does today.
- The template merges `music_visual_options` into both configs (`colour`, `dynamics`, `style`,
  `flavour` mapped to the card's keys).

### Controls tile

> Removed by SPEC-021 before release: settings live only in Home Assistant; the visual is chosen
> on the Ramka settings dashboard's Music page.

A `tap-button-card` on the Controls page, only with `music_visual`: its label is the current option
(`ui.music_visual.spectrum|level|classic`), a tap calls `input_select.select_next` with
`cycle: true` on `input_select.<prefix>_music_visual`.

### Docs

`components/ramka/README.md` gains "Music visual"; `components/ramka/UPGRADE.md` gains:

> ## 0.4.0: the now-playing view can draw the room's music
> New optional inputs `music_visual` and `music_visual_options`. Nothing is required: without them
> the dashboards render as in 0.3.0. To use it, install `audio-sensor` with one sensor marked
> `music: true`, set `music_visual: spectrum` or `level`, render both and deploy. Updating moves the
> cards to `www/domosenso/ramka/0.4.0/` and the twelve resource URLs with them.

## Artifacts and ownership

| artifact (audio-sensor) | in the home | layer |
|---|---|---|
| `component.yaml`, `README.md`, `UPGRADE.md`, `translations/{en,de,pl}.json` | (catalog only) | |
| `esphome/audio-sensor.yaml`, `esphome/components/audio_spectrum/**` | pulled by ESPHome from the tag | managed (remote) |
| `esphome/audio-sensor.factory.yaml` | (catalog only; `dashboard_import`) | |
| `esphome/device.yaml.j2` | `esphome_dir/audio-sensor-<room>.yaml`, written once by `add` | instance |
| `templates/package.yaml.j2` | `packages/audio_sensor.yaml` | managed |
| ~~`templates/room-acoustics.lang.yaml.j2`~~ | ~~`dashboards/room-acoustics.<lang>.yaml`~~ | ~~managed~~ *(dropped 2026-10-29)* |
| `cards/ambient-wave-card.js`, `cards/room-meter-card.js`, `cards/lib/**` | `www/domosenso/audio-sensor/0.1.0/` | managed |
| `domosenso/audio-sensor.inputs.yaml` | written once by `add` | instance |

Ramka 0.4.0 changes only its own managed files (package, dashboards, cards).

~~Room Acoustics dashboard: views Live, History, Events, Sensor and Wave (the card with its session~~
~~console, for trying flavours; values worth keeping go into Ramka's `music_visual_options`). With two~~
~~or more acoustics sensors each view starts with the room picker and renders the cards per board~~
~~behind a visibility condition on it.~~ *(dropped 2026-10-29)*

Demo home: `examples/demo-home/inputs/audio-sensor.yaml` (above), its device files under
`examples/demo-home/esphome/`, `music_visual: spectrum` in its Ramka inputs, and spectrum and level
states in the music scene, which the website's previews render from (the website task was dropped
2026-10-29, and the scene states are not added).

## How a home learns about it

- `domosenso add audio-sensor@0.1.0` writes the inputs skeleton and does not prompt. The questions
  are the manifest's input comments plus the `add-component` skill's steps: the boards (room,
  area); which one feeds the Ramka's music view; then each board's `entities` from the
  running Home Assistant.
- `add-component`, when `ramka` is installed: "Show this sensor's music on the Ramka: Spectrum,
  Level, or keep Classic?", with links to the website previews; sets Ramka's `music_visual` and
  renders `ramka` too. `onboard-home` names the component when a sound sensor is found.
- Docs: `components/audio-sensor/README.md` (hardware and first flash, calibration against a
  reference microphone, the opt-in dashboard, several boards and `music`, the limits); the README
  components table; the website component page with animated previews of the spectrum and level
  flavours; the device page. (The README's opt-in dashboard section and the dashboard previews were
  dropped 2026-10-29.)

## Compatibility

- New component, new device, new kind: nothing existing changes. `audio-sensor` joins
  `COMPONENTS`, `m5stack-atom-echos3r` joins `DEVICES` in `tests/test_catalog_content.py`.
- `docs/COMPATIBILITY.md`: `ambient-wave-card` and `room-meter-card` join the STABLE element names;
  the ESPHome project name `domosenso.audio-sensor` is STABLE.
- Ramka 0.4.0: two new optional inputs, a new optional card key, one helper that exists only with
  the input; `media_player_contract` unchanged. The `UPGRADE.md` entry above and a line in
  `docs/UPGRADE_NOTES.md`. No bridge needed.
- A home moving from its own local copy of these files to the component keeps its entity ids by
  setting `name`, `friendly_name`, `id_prefix` and `entities` to what it runs; the component's
  README says how.

## Tests

- `catalog_check --strict`: manifests, device, kind, every path, the firmware `ref` equals
  `audio-sensor/<version>`, the demo inputs render through the package template.
- pytest: `spectrum_bands.h` built on the host with the system compiler (band edges, energy
  normalisation, octave sums); `tests/test_audio_sensor_render.py`: aliases from the music board;
  `two music sensors: living-room, kids-room`; duplicate room; unknown entity key; no music board,
  no aliases; `Kids' room` gives the slug `kids_room` and the picker option `Kids' room`; ids
  default per the table and follow `entities`; no `initial:` on any helper; a render with the removed
  inputs `room_acoustics`, `playing` or `sensors[].acoustics` fails and names the input (added
  2026-10-29, replacing "room acoustics absent with `room_acoustics: false`").
  `tests/test_ramka_render.py`: without `music_visual` output equal to
  0.3.0's apart from stamp and version; `test_music_visual_card_uses_aliases` (the rendered visual
  reads `sensor.music_*` with `fallback: classic`); options merged key by key; the select's first
  option follows the input; the Controls tile only with the input.
- npm, beside the cards: the moved `ambient-wave-card` tests; defaults equal the table; fallback for
  a source never seen since start (alias `unknown`) shows the classic wave and the icon at once;
  unavailable → fallback; stale 5 s → fallback; data back → live visual, icon gone, no reload;
  translations en, de, pl for the icon. `now-playing-card`: select `classic` or unavailable → own
  wave, no visual instantiated; `spectrum` → only that config created; switch removes the previous;
  element not yet defined → own wave, then the visual.
- `tools/ha-check.sh audio-sensor` and `tools/ha-check.sh ramka` on the demo home: `check_config`
  0 errors.
- `tools/esphome-check.sh audio-sensor compile`: the demo device files at ESPHome 2026.9.1.
- `test_privacy`, `tests/test_docs.py`.
- Before the catalog merges: the look on a real wall tablet through a dev render (SPEC-019),
  including the fallback icon with the board unplugged.

## Out of scope

- Further analyzer figures (A/C-weighted levels, dominant frequency, mains hum, spectral centroid
  and flatness, a distortion probe): later `audio-sensor` versions, each with its own spec.
- A service on the home's server that analyses audio.
- A frequency correction curve per board; the single SPL offset is the calibration.
- Settings changed on the tablet beyond the three-way switch: the look is an inputs change and a
  render.
- Several music sources in one home (Open questions).

## Open questions

1. **Several Ramkas, several audio systems.** A home with a main stereo and its Ramka, plus a
   second system (for example a Sonos speaker in an office or bedroom) with its own tablet, needs
   one music source per Ramka. The aliases here are one source per home. Path kept open: `music:`
   may later take a zone name (`music: office`), giving `sensor.music_office_spectrum` and a Ramka
   input `music_source: office`; `music: true` stays the unnamed zone. Not built now; filed as an
   enhancement issue.
2. ~~**The Room acoustics dashboard with `room_acoustics: false`.** The renderer writes every
   template, and `status` then reports `missing-dashboard-entry` for a dashboard the home does not
   want. Proposed: the renderer skips a template whose output is empty after rendering (an
   additive renderer rule, recorded in `docs/COMPATIBILITY.md`). Alternative: always render it, as a
   one-view dashboard that says how to turn the feature on, and let `status` keep its line. To
   settle in the HA-side task.~~ *(dropped 2026-10-29)*: no dashboard.
3. **Bluetooth proxy.** #56 proposes the board as a Bluetooth proxy too. Not in this package (not
   tested together with the spectrum worker here); a home can add `bluetooth_proxy:` to its device
   file. Inference: the S3 has headroom at about 19 % load; unmeasured with both running.
4. **Default entity ids.** The default pattern is a guess (Inputs); whether Home Assistant 2026.9
   builds exactly it for a fresh board with an area set is not verified. The skill reads the real
   ids either way.
5. **#56 and #57.** This spec covers both; proposed to close them in favour of the new issue once
   it is filed.
