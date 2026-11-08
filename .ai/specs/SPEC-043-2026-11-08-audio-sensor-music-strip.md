# SPEC-043: A music-reactive LED strip on the audio sensor (audio-sensor, ramka, unreleased)

- Status: approved 2026-11-08 (the maintainer, in the session that designed it).
- Source: the maintainer, designed in conversation section by section (approach, layers, styles,
  settings, wiring, trial). The research behind it: Hue's own sync, third-party apps, LedFx, WLED,
  Hyperion and a direct Hue Entertainment client were compared for "light that follows the music in
  front of the listener"; an addressable strip driven by the board that already hears the room was
  the lowest-latency path with no server in between.
- Builds on: SPEC-018 (audio-sensor), SPEC-021 (live settings, seed and reset), SPEC-024 (music
  looks and palettes), SPEC-025 (the music source contract).
- No version bump: the release that carries it is the maintainer's call.
- Decisions are marked **Decision**. Inference is marked as such.

## Goal

A home with an audio-sensor board (M5Stack Atom EchoS3R) plugs an addressable LED strip into the
board's Grove port and gets a light that follows the music the board hears, with no server in the
path: microphone, analysis and LED output on one ESP32-S3, about 25–35 ms from sound to light
(inference, budget below).

1. **The firmware is the complete interface.** The strip and every setting of its visualisation
   are entities on the board's ESPHome device in Home Assistant. A home without the Ramka, or
   without any Domosenso dashboard, uses the strip from the device page and its own automations.
2. **audio-sensor's Home Assistant package adds the generic higher-level logic**, still without the
   Ramka: the strip follows any "music is playing" entity the home names, and (stage B) its
   brightness follows any light-level sensor the home names.
3. **The Ramka, when present, parametrises the strip** through audio-sensor's provides only: it
   pushes its music palette to the strip and shows the strip's switches on its music sensor page.

Placement test: Home Assistant has no audio-reactive light for an ESPHome microphone (1: no); any
home with this board and a strip wants it (2: a component). It extends audio-sensor, the component
that owns the board's firmware, rather than a new component: the strip is driven by the same
microphone stream, in the same firmware.

## Devices

- Required: the board audio-sensor already requires (`m5stack-atom-echos3r`).
- Required for the feature: one addressable 5 V strip, SK6812 or WS2812B (GRB), data on a Grove
  signal pin. Recommended and the one tried: **M5Stack Digital RGB LED Strip SK6812, A093-C**
  (120 LEDs over 2 m, 60/m, RGB, no white channel, Grove conversion cable). The A093 family's other
  lengths work the same. A new `devices/m5stack-led-strip-sk6812.yaml` (kind `led-strip`, no
  `match`: a strip is not a Home Assistant device of its own).
- Optional: a separate 5 V supply, 3–5 A, for strips longer than about 30 LEDs.
- Tested: none yet; the prototype is one board with one A093-C in one home.

### Wiring and power (README section)

- Data: the Grove port's signal pin to the strip's DIN; the exact GPIO from M5Stack's EchoS3R pin
  map at implementation (open question 1). 3.3 V data first; a 74AHCT125 level shifter if the first
  LED flickers.
- **Decision:** two wirings, both documented, both handled by the firmware:
  - *From the board:* the strip cut to 20–30 LEDs, powered from the Grove 5 V, power limit 500 mA.
  - *Own supply:* 5 V and ground from the supply, ground shared with the board, 5 V injected at both
    ends of a 2 m strip; power limit set to the supply's rating.
- Microphone noise: the README already notes that Wi-Fi pulses on the shared 5 V rail show up in
  the microphone. The trial measures the quiet-room Sound level with the strip flashing at full
  power; if it rises by more than 1 dB, the README makes the own-supply wiring a requirement.

## Integrations

- ESPHome (firmware), the version audio-sensor already pins (2026.9.1); `esp32_rmt_led_strip`
  (ESP-IDF) for the output. A human connects the strip; the first strip firmware goes over the air
  from the home's device file (flashing is the owner's go-ahead).
- Home Assistant core: `template` (the `light.music_strip` alias), automations, scripts, helpers.
  No HACS.

## Firmware (audio-sensor's ESPHome package)

### Approach

**Decision (approach A of three):** the analysis and the effects live in this component's own
external components, next to `audio_spectrum`; not the community `music_leds` component (its own
FFT, Arduino-oriented, unproven on ESP-IDF) and not WLED (it replaces the sensor firmware).

```
mic (ES8311, 48 kHz) ─► audio_spectrum (unchanged): 4096 FFT ─► Spectrum, Octaves, levels ─► HA
                    └─► music_features (new, passive source): 1024 FFT, hop 512 (10.7 ms)
                          features: envelope, 8 bands, onset/beat, spectral balance
                          ▼ double buffer, written by the worker, read without a lock
                        music_strip effects (new) on an esp32_rmt_led_strip light ─► Grove ─► strip
```

Units, each with one job and tested on its own:

1. `music_features` (C++, host-tested like `publish_policy.h`): samples in, a `Features` struct
   out every hop: `envelope` (0–1, attack/release smoothed), `bands[8]` (0–1, log-spaced 40 Hz to
   16 kHz), `onset` (0–1 strength of a new hit this hop), `beat` (true on a detected beat, onset
   above an adaptive threshold with a 120 ms refractory time), `balance` (0 = bass-heavy to 1 =
   treble-heavy). Auto gain normalises to a slowly decaying running maximum (about 10 s); without
   it a fixed sensitivity in dB applies.
2. `strip_render` (C++, host-tested): `Features` + `Settings` + LED count → a frame of RGB values.
   Every style, the palette, mounting smoothing, mirroring and the power limiter live here.
3. ESPHome glue: a worker task (core 1, a priority above `audio_spectrum`'s, so a light frame never
   waits for a 4096 FFT; inference that both fit, the trial reads Spectrum load) and the effects
   registered on the light; the settings entities below.

**Decision:** a separate remote package, `esphome/music-strip.yaml`. A board without a strip does
not load it and its firmware is unchanged; the device file adds it when the home's input has
`strip:`.

### Styles (the light's effects)

| effect | what it draws | suits |
|---|---|---|
| Pulse | whole strip one colour; brightness from the envelope, a short flash on a beat | all |
| Glow | colour from the balance (warm bass to cool treble), slow; gentle brightness | wall, floor |
| Bands | three soft zones (low, mid, high) blending into each other, each its band's level | wall, floor |
| Centre meter | level meter from the centre to both ends, a falling peak dot | front |
| Spectrum | 8 bands mirrored from the centre; bass at the centre or the ends (setting) | front |
| Ripple | a beat sends a wave from the centre to both ends, coloured by the band that carried it | front, wall |

Mounting (front / wall / floor) sets the smoothing and the blur between neighbouring LEDs; every
style stays selectable. Effects run at up to 100 frames a second; a frame is drawn only when new
features are there.

### Entities (on the board's device)

Names as ESPHome publishes them; Home Assistant derives the ids at adoption, so the home's inputs
name them (`strip.entities`, below). Everyday controls have no entity category; Advanced ones are
`config`, so the device page groups them under Configuration.

| entity | type | values, default | group |
|---|---|---|---|
| Music strip | light (RGB) | on/off, brightness, colour (the Single palette), effect; restore off | basic |
| Strip palette | select | spectrum, warm, cool, single, custom; spectrum | basic |
| Strip custom palette | text | 2–5 stops `#rrggbb` comma-separated; `#ff3000,#ffb000,#2050ff` | basic |
| Strip intensity | number | 0–100, 60 | basic |
| Strip mounting | select | front, wall, floor; front | basic |
| Strip auto gain | switch | on | advanced |
| Strip sensitivity | number | −20 to +20 dB, 0 (used with auto gain off) | advanced |
| Strip attack | number | 0–200 ms, 20 | advanced |
| Strip release | number | 50–2000 ms, 300 | advanced |
| Strip beat strength | number | 0–100, 50 | advanced |
| Strip bass position | select | centre, ends; centre | advanced |
| Strip LEDs in use | number | 1 to `strip_leds`, `strip_leds` | advanced |
| Strip first LED | number | 0 to `strip_leds` − 1, 0 | advanced |
| Strip power limit | number | 100–5000 mA, 500 | advanced |
| Strip current | sensor | estimated mA of the last frames, every 10 s | diagnostic |
| Strip reset settings | button | the defaults above; the light's state stays | advanced |

All values are restored on the board after a reboot (`restore_value: true`), so the strip behaves
the same while Home Assistant is down. A custom palette that does not parse keeps the last good one
and the board logs a warning once.

Substitutions in the device file: `strip_pin` (the Grove GPIO), `strip_leds` (default 120),
`strip_order` (default GRB).

**Power limiter (decision):** each frame's current is estimated (per channel, 20 mA at full,
SK6812 figures in the README, plus 1 mA idle per LED) and the whole frame scaled down to the power
limit before it is sent. A wrong limit can still overdraw a supply; the README says to set it to the
supply's rating.

### Latency budget (inference; the trial measures it)

Codec and I2S DMA about 5 ms; the 1024 window adds about 11 ms on average; frame cadence up to 10 ms;
120 LEDs about 4 ms on the wire. About 25–35 ms from sound to light, inside the ~45 ms at which a
light after the sound starts to be noticed (ITU-R BT.1359). The trial records a hand clap with a
phone camera at 240 fps (sound and the strip in one frame sequence).

## Home Assistant package (audio-sensor, no Ramka needed)

### Inputs

`sensors[]` items gain an optional `strip:` map. Without it nothing below is rendered for that
board.

```yaml
sensors:
  - room: living-room
    area: Living room
    music: true
    strip:
      leds: 120                        # strip_leds; default 120
      pin: GPIO2                       # strip_pin; default the EchoS3R's Grove signal pin
      follow: media_player.living_room_speaker   # optional; any entity, see below
      ambient_light: sensor.living_room_illuminance   # optional, stage B
      entities:                        # the firmware entities; default a guess the skill corrects
        light: light.living_room_audio_sensor_music_strip
        palette: select.living_room_audio_sensor_strip_palette
        custom_palette: text.living_room_audio_sensor_strip_custom_palette
```

`entities` keys: `light`, `palette`, `custom_palette`, `intensity`, `mounting`, `power_limit`,
`current` (the rest are reached from the device page; nothing in the package writes them).

### Follow the music (stage A)

With `strip.follow` set, per board:

- `input_boolean.<id_prefix>_strip_follow_music`: on, the strip light turns on when the follow
  entity becomes *playing* (`playing` for a media player, `on` for anything else) and off after the
  delay once it stops; off, nothing touches the light. No `initial:`; a new helper starts off.
- `input_number.<id_prefix>_strip_follow_off_delay`: 0–600 s, step 5, default 30 (the fade-out
  after a pause, so a track change does not blink the strip).
- `input_select.<id_prefix>_strip_follow_effect`: the effect it turns on with; the six styles plus
  `keep` (the light's last effect); default `keep`.
- automation `<id_prefix>_strip_follow_music`.

**Decision:** the follow entity is a render-time input, not a runtime picker: Home Assistant has no
entity-picker helper, and the home chooses it once. A home with the Ramka names the Ramka's
`binary_sensor.<prefix>_media_playing` there (its own inputs; the catalog does not couple them).

### Brightness from the room (stage B)

With `strip.ambient_light` set (any illuminance sensor in Home Assistant, on this board or another):

- `input_boolean.<id_prefix>_strip_ambient`, on by default once rendered (no `initial:`; the
  README says to turn it on);
- `input_number.<id_prefix>_strip_ambient_{dark_lux,bright_lux,min_pct,max_pct}`: the curve,
  defaults 5 lux → 20 %, 300 lux → 100 %, linear in log lux between;
- an automation that sets the light's brightness while it is on, on a change of the sensor of more
  than 10 % and at most once every 10 s.

The firmware knows only "brightness": no light sensor is built into it. A light sensor on the same
board is open question 2.

### The music strip aliases (for consumers)

For the selected music source (`input_select.audio_sensor_music_source`, SPEC-021), when that board
has `strip:`:

- `light.music_strip`: a template light forwarding on/off, brightness and effect to that board's
  strip light; unavailable while the board has no strip.
- `binary_sensor.music_source_strip`: on while the selected board has a strip (the SPEC-025 ability
  pattern; never unavailable). `sensor.music_source`'s `capabilities` gains `strip` (additive).
- `script.audio_sensor_music_strip_palette`: field `stops` (2–5 `#rrggbb`); writes them to that
  board's custom palette and selects `custom`. Does nothing without a strip.

## Ramka (only when present)

On the music sensor sub-view (SPEC-025), shown while `binary_sensor.music_source_strip` is on:

- Basic: the `light.music_strip` row (on/off, brightness, effect, Home Assistant's own more-info);
  **Strip uses the Ramka palette** (`input_boolean.<prefix>_music_strip_palette_sync`, default off);
  a link to the board's device page for every other strip setting (principle 4: the device page is
  Home Assistant's editor for them; the Ramka does not rebuild it).
- With the sync on, an automation calls `script.audio_sensor_music_strip_palette` with the stops of
  the selected `input_select.<prefix>_music_palette` on every change of the palette and when the
  sync is turned on. **Decision:** the Ramka's palettes get a `stops` list each in the card library's
  palette table, generated into the rendered package; the strip never reads a card.
- Reset to defaults turns the sync off; it does not touch the board's own settings (they have their
  own reset button).

## Provides and consumes

audio-sensor `provides` (new):

| id | stability |
|---|---|
| `light.music_strip` | stable |
| `binary_sensor.music_source_strip` | stable |
| `script.audio_sensor_music_strip_palette` (field `stops`) | stable |
| `sensor.music_source` attribute `capabilities` value `strip` | additive-only (existing entity) |
| `input_boolean.<id_prefix>_strip_follow_music`, `input_number.<id_prefix>_strip_follow_off_delay`, `input_select.<id_prefix>_strip_follow_effect` | stable; options additive-only |
| `input_boolean.<id_prefix>_strip_ambient`, `input_number.<id_prefix>_strip_ambient_{dark_lux,bright_lux,min_pct,max_pct}` | stable (stage B) |
| firmware entity names in the table above, the effect names, the palette and mounting options | stable; options additive-only |

ramka `consumes` (new): `light.music_strip`, `binary_sensor.music_source_strip`,
`script.audio_sensor_music_strip_palette`. ramka `provides` (new):
`input_boolean.<prefix>_music_strip_palette_sync` (stable).

## Artifacts and ownership

| artifact | layer |
|---|---|
| `components/audio-sensor/esphome/music-strip.yaml` (remote package) and `esphome/components/music_strip/` (features, render, glue) | catalog, pulled by ESPHome at the tag |
| `esphome/device.yaml.j2`: the strip package line and substitutions when `strip:` is set | instance (written once by `add`; an existing home adds the lines by hand, UPGRADE.md) |
| `templates/package.yaml.j2`: follow, ambient, aliases, script | managed |
| ramka: the sub-view rows, the sync helper and automation, palette stops | managed |
| `devices/m5stack-led-strip-sk6812.yaml`, README "Music strip" section, translations en/de/pl | catalog |

## Compatibility

- Additive. A board without `strip:` renders and builds exactly as before (byte-identical
  package for a home without strips: a test). No existing entity changes.
- An existing home that adds a strip: adds `strip:` to its inputs, renders, adds the package line
  and substitutions to its device file (the README gives the three lines), and flashes once over
  the air. `UPGRADE.md`, unreleased entry.
- Firmware: the device file moves to the release that carries this (the maintainer's call); a board
  on an older firmware keeps working with the new Home Assistant package (no `strip:` = nothing).

## Tests

- Host tests (`tests/fixtures/music_strip/*.cpp`, run by pytest like `test_audio_spectrum_bands.py`):
  features from synthetic signals (silence, a sine sweep, a 120 BPM kick train: beats found within
  one hop, no beat in steady pink noise, auto gain converges in 10 s); render (every style, both
  bass positions, LEDs in use and first LED, mirroring, the power limiter never above the limit,
  palette parsing and the last-good fallback).
- `esphome-check audio-sensor`: compiles the package with and without `music-strip.yaml`.
- `test_audio_sensor_render.py`: no `strip:` renders byte-identical; `follow`, `ambient_light`,
  aliases and script render; `catalog_check` passes; `ha-check` on the rendered package.
- Ramka: render with and without a strip; the palette table's stops all parse.
- Prototype on the maintainer's instance: an OTA flash of the dev build after the go-ahead; then
  Sound level, Spectrum and the Ramka visual unchanged, Spectrum load reported, the quiet-room noise
  check above, the clap latency recording, every style on the strip in each mounting.

## Out of scope

- Driving Philips Hue lights (an Entertainment client on the ESP32, Zigbee, Bluetooth); a slow
  colour echo to a Hue light is a home automation, not this spec.
- A line-level input (the board has one analogue microphone; a second board with an I2S ADC on an
  amplifier's line output is a later spec).
- Following the Ramka's music looks (rise, fall, EQ) on the strip; only the palette is pushed.
- Automatic music detection on the board (the maintainer chose: on only when switched on).
- RGBW strips (SK6812 RGBW): additive later, a `strip_type` substitution.

## Open questions

1. The Grove signal GPIOs of the Atom EchoS3R (G1/G2 by M5Stack's labels; their GPIO numbers are
   not yet read from M5Stack's pin map). Verified: the current firmware does not use the Grove pins
   (it uses GPIO0, 3, 4, 11, 17, 18, 45).
2. A light sensor on the same board: the Grove port has two pins, the strip takes one, an I2C
   sensor needs two. Whether the EchoS3R exposes other free pins is not known; until then stage B
   uses a sensor elsewhere through Home Assistant.
3. esp-dsp's `fft2r` twiddle table is global (audio_spectrum initialises it for 4096). Inference:
   a 1024-point transform can use the same 4096 table (radix-2 tables serve smaller sizes); to be
   proven by a host or board test before the strip component relies on it, else a separate FFT
   routine.
4. CPU: both workers on core 1 (audio_spectrum ~23 % of a core today, measured). Inference that a
   1024 FFT every 10.7 ms adds under 10 %; the trial reads Spectrum load and the loop time.
5. Inference that RMT and I2S run side by side on the S3 without glitches in the microphone stream
   (separate peripherals and DMA); the trial checks the noise floor and a gap counter.
6. Inference that a template light can forward `effect` and `effect_list` (Home Assistant's template
   light supports both); verified at implementation in the dev home.
7. 3.3 V data to a 5 V SK6812 over a 10 cm Grove lead: usually works (inference); the level shifter
   is the fallback.
