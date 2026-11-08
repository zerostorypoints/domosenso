# Audio-sensor music strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An addressable LED strip on the audio sensor's Grove port follows the music the board
hears, set entirely from the board's own entities, with optional Home Assistant automations
(follow music, room brightness) and an optional Ramka palette sync.

**Architecture:** A new ESPHome external component `music_strip` next to `audio_spectrum`: a
passive microphone listener with its own 1024-point FFT worker produces `Features`; six
addressable-light effects render them through a pure `Renderer`. The maths (`music_features.h`,
`strip_render.h`) has no ESPHome dependency and is host-tested. A separate remote package
`music-strip.yaml` carries the light and the settings entities; audio-sensor's HA package and the
Ramka build on its entities through declared provides only.

**Tech Stack:** C++17 (ESP-IDF, esp-dsp 1.8.2), ESPHome 2026.9.1 Python codegen and YAML, Jinja
templates rendered by `tools/domosenso_render.py`, pytest, Home Assistant template/automation YAML.

**Spec:** `.ai/specs/SPEC-043-2026-11-08-audio-sensor-music-strip.md` (approved 2026-11-08).

## Global Constraints

- ESPHome `2026.9.1`, framework `esp-idf`, variant `esp32s3`; esp-dsp `1.8.2` (the pin
  `audio_spectrum/__init__.py` already uses).
- Sample rate 48 000 Hz; features FFT 1024 points, hop 512 (10.7 ms); 8 bands log-spaced 40 Hz to
  16 kHz; beat refractory 120 ms; auto gain decays over about 10 s.
- Effects at up to 100 frames a second; a frame only when new features are there.
- Power estimate: 20 mA per colour channel at full, plus 1 mA idle per LED.
- Settings defaults exactly as the spec's entity table (intensity 60, attack 20 ms, release 300 ms,
  beat strength 50, power limit 500 mA, palette spectrum, mounting front, bass centre, auto gain on,
  custom palette `#ff3000,#ffb000,#2050ff`).
- A board without `strip:` renders and builds byte-identically to today.
- `audio_spectrum` is not changed. Its esp-dsp `fft2r` global table stays its own: `music_strip`
  never calls `dsps_fft2r_init_fc32`.
- No version bump in any `component.yaml` (the release is the maintainer's call).
- Catalog text in en, de, pl; no home's names, rooms or entity ids in the catalog (fictional
  examples only, as in `examples/demo-home`).
- Every task ends with `tools/check-all.sh` steps it touches passing; the last task runs all.

## Review Focus

1. **Silence or a quiet room with auto gain on** → the strip stays dark or at its idle glow, never
   noise amplified to full flashes (a gate below −70 dBFS). Test in Task 1.
2. **Clipping, very loud music** → features stay in 0–1, never NaN or inf. Test in Task 1.
3. **LEDs in use + first LED beyond the strip length** → clamped to the strip; LEDs outside the
   window black. Test in Task 2.
4. **A power limit below the idle draw** (100 mA with 120 LEDs) → an all-black frame, no negative
   or wrapped values. Test in Task 2.
5. **A malformed custom palette** (one stop, six stops, `#fff`, `red`, empty) → the last good
   palette stays, `parse_palette` returns false. Test in Task 2.

---

## File structure

| file | responsibility |
|---|---|
| `components/audio-sensor/esphome/components/music_strip/music_features.h` | power spectrum + RMS per hop → `Features` (pure) |
| `components/audio-sensor/esphome/components/music_strip/strip_render.h` | `Features` + `RenderSettings` → RGB frame; palettes; power limiter (pure) |
| `components/audio-sensor/esphome/components/music_strip/music_strip.{h,cpp}` | passive mic listener, ring buffer, FFT worker, feature double buffer, settings setters |
| `components/audio-sensor/esphome/components/music_strip/music_strip_effect.h` | `AddressableLightEffect` subclass, one per style |
| `components/audio-sensor/esphome/components/music_strip/__init__.py`, `light.py`-style effect registration in `__init__.py` | codegen |
| `components/audio-sensor/esphome/music-strip.yaml` | remote package: light, effects, settings entities, reset |
| `tests/fixtures/music_strip/test_features.cpp`, `test_render.cpp`; `tests/test_music_strip.py` | host tests |
| `components/audio-sensor/esphome/device.yaml.j2` | strip package line and substitutions |
| `components/audio-sensor/templates/package.yaml.j2` | follow music, ambient light, aliases, script |
| `components/ramka/templates/{package.yaml.j2,music-tables.j2,ramka-settings.lang.yaml.j2}` | palette sync, sub-view rows |
| `devices/m5stack-led-strip-sk6812.yaml`, `kinds/led-strip.yaml` | the strip in the catalog |

---

### Task 1: Features from a power spectrum (host-tested)

**Files:**
- Create: `components/audio-sensor/esphome/components/music_strip/music_features.h`
- Create: `tests/fixtures/music_strip/test_features.cpp`
- Create: `tests/test_music_strip.py` (same `_build_and_run` as `tests/test_audio_spectrum_bands.py`, `-I` the `music_strip` dir, `FIXTURES = tests/fixtures/music_strip`)

**Interfaces:**
- Produces (namespace `::music_strip`, no ESPHome includes):
  - `constexpr size_t NUM_BANDS = 8;`
  - `struct Features { float envelope; float bands[NUM_BANDS]; float onset; bool beat; float balance; uint32_t seq; };` (all floats 0–1)
  - `struct FeatureSettings { bool auto_gain = true; float sensitivity_db = 0; float attack_ms = 20; float release_ms = 300; };`
  - `class FeatureExtractor { public: void configure(const FeatureSettings &s, float sample_rate, size_t fft_size, size_t hop); Features update(const float *power, float rms); };` — `power` has `fft_size / 2 + 1` bins (|X|² of a Hann-windowed frame); `rms` is the hop's RMS in full-scale units (1.0 = 0 dBFS).

- [ ] **Step 1: Write the failing tests** in `test_features.cpp` (the `check()` / `ok`/`FAIL` style of `tests/fixtures/audio_spectrum/test_publish_policy.cpp`; a naive DFT helper in the fixture makes the power spectra):
  - `silence`: 300 hops of zeros (and of white noise at −80 dBFS) → `envelope == 0`, no `beat`, every band 0 (Review Focus 1).
  - `kick train`: a 60 Hz burst (30 ms, −12 dBFS) every 500 ms over steady −40 dBFS pink noise, 10 s → a `beat` within one hop of each burst after the first 2 s, ≥ 18 of 20 found; none in between.
  - `steady pink`: 10 s pink noise at −20 dBFS → no `beat` after the first 2 s.
  - `refractory`: two bursts 80 ms apart → one beat.
  - `bands order`: a 100 Hz sine lights band 1 most; a 5 kHz sine band 6 or 7; `balance` < 0.3 for 100 Hz, > 0.7 for 5 kHz.
  - `auto gain`: −40 dBFS music-like signal (the kick train scaled) → `envelope` peaks reach ≥ 0.8 within 10 s; with `auto_gain = false, sensitivity_db = 0` they stay ≤ 0.3.
  - `clip`: full-scale square wave → every float in 0–1, `std::isfinite` (Review Focus 2).
  - `attack/release`: a step from silence to −20 dBFS → `envelope` reaches 0.63 of its final value in 20 ms ± one hop; back to silence → falls to 0.37 in 300 ms ± one hop.

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_music_strip.py::test_features -v`
Expected: FAIL (build error: `music_features.h` not found)

- [ ] **Step 3: Implement `FeatureExtractor`** in `music_features.h`. Band edges: 9 log-spaced edges from 40 Hz to 16 kHz, mapped to bins at configure time. Onset: positive spectral flux over the log band energies; beat when flux > mean + 1.5 × std of the last 1 s of flux and 120 ms since the last beat. Auto gain: divide by a running maximum that decays by half every 5 s (about 10 s to settle) with a floor at −50 dBFS so the gate in the silence test holds; a gate at −70 dBFS RMS forces `envelope` and bands to 0. Attack/release: one-pole smoothing with time constants from the settings.

- [ ] **Step 4: Run to verify they pass**

Run: `uv run pytest tests/test_music_strip.py::test_features -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/audio-sensor/esphome/components/music_strip/music_features.h tests/fixtures/music_strip/test_features.cpp tests/test_music_strip.py
git commit -m "audio-sensor: music strip features from a power spectrum (SPEC-043)"
```

### Task 2: Rendering, palettes and the power limiter (host-tested)

**Files:**
- Create: `components/audio-sensor/esphome/components/music_strip/strip_render.h`
- Create: `tests/fixtures/music_strip/test_render.cpp`
- Modify: `tests/test_music_strip.py` (add `test_render`)

**Interfaces:**
- Consumes: `Features`, `NUM_BANDS` (Task 1).
- Produces (namespace `::music_strip`):
  - `struct Rgb { uint8_t r, g, b; };`
  - `enum class Style { PULSE, GLOW, BANDS, CENTRE_METER, SPECTRUM, RIPPLE };`
  - `enum class PaletteKind { SPECTRUM, WARM, COOL, SINGLE, CUSTOM };`
  - `enum class Mounting { FRONT, WALL, FLOOR };` `enum class BassPosition { CENTRE, ENDS };`
  - `struct Palette { Rgb stops[5]; uint8_t count; };` `Rgb palette_at(const Palette &p, float x);` (x 0–1, linear between evenly spaced stops)
  - `bool parse_palette(const char *text, Palette &out);` — 2–5 comma-separated `#rrggbb`, spaces allowed; false leaves `out` untouched.
  - `Palette builtin_palette(PaletteKind kind, Rgb single);` — spectrum `#ff2000,#ffb000,#40d040,#2080ff,#8040ff`; warm `#ff2000,#ff7000,#ffc040`; cool `#2040ff,#20c0ff,#c0f0ff`; single: two stops, black→`single`.
  - `struct RenderSettings { Style style; Palette palette; float intensity; Mounting mounting; float beat_strength; BassPosition bass; uint16_t first; uint16_t count; float power_limit_ma; };` (intensity, beat_strength 0–1)
  - `class Renderer { public: void render(const Features &f, const RenderSettings &s, float dt_s, Rgb *leds, size_t n); };` keeps its own peak, ripple and smoothing state.
  - `float estimate_ma(const Rgb *leds, size_t n);` `float limit_power(Rgb *leds, size_t n, float limit_ma);` returns the estimate after scaling.

- [ ] **Step 1: Write the failing tests** in `test_render.cpp`:
  - `palette parse`: `"#ff3000,#ffb000,#2050ff"` → 3 stops; `" #FF3000 , #00ff00 "` → 2; `"#ff3000"`, six stops, `"#fff,#000"`, `"red,blue"`, `""` → false and `out` unchanged (Review Focus 5).
  - `palette_at`: 0 → first stop, 1 → last, 0.5 of a 3-stop palette → middle stop exactly.
  - `window`: n = 120, first = 110, count = 50 → only LEDs 110–119 may be lit, 0–109 black; count = 0 → all black (Review Focus 3).
  - `pulse`: envelope 0 → all black at intensity 1; envelope 1 → every lit LED the same colour, brightness ≥ 200 on its brightest channel.
  - `centre meter`: envelope 0.5, count 120 → LEDs 30–89 lit, 0–29 and 90–119 dark (± 1 LED), symmetric about 59.5.
  - `spectrum mirror`: only band 0 at 1 → lit LEDs at the centre with `BassPosition::CENTRE`, at both ends with `ENDS`; frame symmetric.
  - `ripple`: a beat then 20 frames of 10 ms → the lit front moves outward each frame, symmetric.
  - `intensity`: the same features at intensity 0.2 → every channel ≤ the intensity-1 frame's.
  - `power limit`: 120 LEDs full white, limit 3000 mA → `estimate_ma` after ≤ 3000; limit 100 mA (below 120 mA idle) → every LED black and returns ≤ 120 (Review Focus 4); limit above the estimate → frame unchanged.
  - `mounting`: GLOW at FLOOR changes colour more slowly than at FRONT for the same step in `balance` (frames to reach 90 %: FLOOR > FRONT).

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_music_strip.py::test_render -v`
Expected: FAIL (`strip_render.h` not found)

- [ ] **Step 3: Implement** `strip_render.h`. Mounting sets a smoothing time constant (front 0 ms, wall 80 ms, floor 200 ms) and a 3-tap blur for wall and floor. Every style draws into `[first, first + count)` clamped to `n`, mirrored about that window's centre; `limit_power` scales all channels by `max(0, (limit − n) / (estimate − n))` when over, and blacks the frame when `limit ≤ n`.

- [ ] **Step 4: Run to verify they pass**

Run: `uv run pytest tests/test_music_strip.py -v`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add components/audio-sensor/esphome/components/music_strip/strip_render.h tests/fixtures/music_strip/test_render.cpp tests/test_music_strip.py
git commit -m "audio-sensor: music strip styles, palettes and power limiter (SPEC-043)"
```

### Task 3: The ESPHome component and the remote package

**Files:**
- Create: `components/audio-sensor/esphome/components/music_strip/{__init__.py,music_strip.h,music_strip.cpp,music_strip_effect.h}`
- Create: `components/audio-sensor/esphome/music-strip.yaml`
- Modify: `examples/demo-home/esphome/audio-sensor-living-room.yaml` (add the strip package and substitutions, so `esphome-check` compiles it)
- Modify: `tools/esphome-check.sh` only if the package is not picked up (it should be: it checks every device file that pulls a package of the component)

**Interfaces:**
- Consumes: `FeatureExtractor`, `Features`, `FeatureSettings` (Task 1); `Renderer`, `RenderSettings`, `Palette`, `parse_palette`, `builtin_palette`, `limit_power`, `estimate_ma`, enums (Task 2).
- Produces:
  - C++ `esphome::music_strip::MusicStripComponent : Component` — `set_microphone_source(microphone::MicrophoneSource *)`, `set_current_sensor(sensor::Sensor *)`; `bool latest(Features &out)` (true when `seq` advanced since the caller's last); settings setters called from YAML lambdas: `set_auto_gain(bool)`, `set_sensitivity_db(float)`, `set_attack_ms(float)`, `set_release_ms(float)`, `set_palette_kind(PaletteKind)`, `bool set_custom_palette(const std::string &)` (logs one warning on the first refusal), `set_single_colour(Rgb)`, `set_intensity(float pct)`, `set_mounting(Mounting)`, `set_beat_strength(float pct)`, `set_bass(BassPosition)`, `set_window(uint16_t first, uint16_t count)`, `set_power_limit_ma(float)`; `RenderSettings render_settings()`.
  - C++ `MusicStripEffect : light::AddressableLightEffect` with `Style`; renders only when `latest()` returns true, at most every 10 ms; copies the light's colour into the Single palette each frame.
  - YAML: effect type `music_strip` with keys `name`, `strip_id`, `style` (`pulse`, `glow`, `bands`, `centre_meter`, `spectrum`, `ripple`), registered with `register_addressable_effect` (`esphome.components.light.effects`).
  - Package `music-strip.yaml`: substitutions `strip_pin`, `strip_leds` (120), `strip_order` (GRB); `music_strip:` (id `music`, microphone `mic`, current sensor "Strip current"); `light: esp32_rmt_led_strip` "Music strip" (`chipset: SK6812`, `rgb_order: ${strip_order}`, `restore_mode: RESTORE_DEFAULT_OFF`) with the six effects named Pulse, Glow, Bands, Centre meter, Spectrum, Ripple; template `select`/`number`/`switch`/`text` entities with names, ranges, defaults and entity categories exactly as the spec's entity table, each `restore_value: true` and a `set_action` lambda calling the setter; button "Strip reset settings" (`entity_category: config`) setting every entity to its default; `on_boot` pushes every restored value into the component.

- [ ] **Step 1: Confirm the explicit-table FFT entry point** — in the esp-dsp 1.8.2 sources ESPHome fetched for `audio_spectrum` (`.esphome/build/*/managed_components/espressif__esp-dsp/modules/fft/include/dsps_fft2r.h`, after `tools/esphome-check.sh audio-sensor compile`), find `dsps_fft2r_fc32_aes3_` / `dsps_fft2r_fc32_ansi_` (`float *data, int N, float *w`) and `dsps_gen_w_r2_fc32(float *w, int N)`. Use the `aes3_` variant on the S3, else `ansi_`. Expected: both found (spec open question 3, settled without the global table). If neither exists, stop and report: the plan's FFT choice changes.

- [ ] **Step 2: Write the codegen and C++** per the Interfaces above. The worker: `xTaskCreatePinnedToCore` on core 1, priority one above `audio_spectrum`'s worker, stack in PSRAM like it; reads hops of 512 samples from its own ring buffer (a passive `MicrophoneSource`, 16-bit, 48 kHz), Hann window, its own 1024 twiddle table from `dsps_gen_w_r2_fc32`, bit reversal, power, then `FeatureExtractor::update`; publishes into a two-slot buffer with a sequence counter (no mutex in the effect's path). "Strip current" publishes the mean estimate every 10 s.

- [ ] **Step 3: Add the strip to the demo device file**

```yaml
substitutions:
  strip_pin: GPIO2        # replaced by the EchoS3R Grove pin read in Step 4
  strip_leds: "60"
packages:
  strip: github://zerostorypoints/domosenso/components/audio-sensor/esphome/music-strip.yaml@audio-sensor/0.4.0
```

- [ ] **Step 4: Read the Grove signal GPIO** of the Atom EchoS3R from M5Stack's docs (docs.m5stack.com, Atom EchoS3R pin map) and set it as the package's default `strip_pin` (spec open question 1). Record the source URL in a comment. Check it is none of GPIO0, 3, 4, 11, 17, 18, 45.

- [ ] **Step 5: Compile both configurations**

Run: `tools/esphome-check.sh audio-sensor compile examples/demo-home/esphome/audio-sensor-living-room.yaml examples/demo-home/esphome/audio-sensor-kids-room.yaml`
Expected: both compile; the log ends `ok`. The kids-room file (no strip) builds as before.

- [ ] **Step 6: Commit**

```bash
git add components/audio-sensor/esphome examples/demo-home/esphome/audio-sensor-living-room.yaml
git commit -m "audio-sensor: the music strip component and its ESPHome package (SPEC-043)"
```

### Task 4: The strip as an input: device file, manifest, catalog device

**Files:**
- Modify: `components/audio-sensor/esphome/device.yaml.j2`
- Modify: `components/audio-sensor/component.yaml` (inputs `sensors[].strip`, devices optional, artifacts list `esphome/music-strip.yaml`)
- Create: `devices/m5stack-led-strip-sk6812.yaml`, `kinds/led-strip.yaml`
- Modify: `components/audio-sensor/translations/{en,de,pl}.json` (`meta.devices.m5stack-led-strip-sk6812.*`, input notes)
- Modify: `examples/demo-home/inputs/audio-sensor.yaml` (a fictional `strip:` on the living-room board)
- Test: `tests/test_audio_sensor_render.py`

**Interfaces:**
- Produces: input `sensors[].strip: {leds?: int = 120, pin?: str, follow?: entity_id, ambient_light?: entity_id, entities?: map}`; `entities` keys `light`, `palette`, `custom_palette`, `intensity`, `mounting`, `power_limit`, `current`, default guess `<domain>.<id_prefix>_<name slug>_<key>` with the firmware names (`music_strip`, `strip_palette`, `strip_custom_palette`, `strip_intensity`, `strip_mounting`, `strip_power_limit`, `strip_current`).

- [ ] **Step 1: Write the failing tests** in `tests/test_audio_sensor_render.py`:
  - `test_device_file_without_strip_is_unchanged`: rendering `device.yaml.j2` for a board without `strip:` equals the committed `examples/demo-home/esphome/audio-sensor-kids-room.yaml`.
  - `test_device_file_with_strip_adds_package_and_substitutions`: with `strip: {leds: 60}` the output has `strip_leds: "60"`, `strip_pin` only when `pin` is given, and `packages.strip` ending `music-strip.yaml@audio-sensor/<version>`.
  - `test_strip_input_validation`: `leds: 0`, `leds: 1000`, `follow: "not an id"` fail with a message naming the field.

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_audio_sensor_render.py -k strip -v`
Expected: FAIL

- [ ] **Step 3: Implement** the template branch, the manifest inputs (types and notes as in the spec's Inputs), validation where the existing `sensors` validation lives, the device and kind files (`kinds/led-strip.yaml` with no `match` rules if `catalog_check` allows, else the narrowest rule it accepts), translations in en/de/pl.

- [ ] **Step 4: Run to verify they pass**

Run: `uv run pytest tests/test_audio_sensor_render.py -v && uv run python tools/catalog_check.py`
Expected: PASS; `catalog_check` ends `ok`

- [ ] **Step 5: Commit**

```bash
git add components/audio-sensor devices/m5stack-led-strip-sk6812.yaml kinds/led-strip.yaml examples/demo-home/inputs/audio-sensor.yaml tests/test_audio_sensor_render.py
git commit -m "audio-sensor: the strip input, device file lines and the SK6812 strip device (SPEC-043)"
```

### Task 5: Follow the music, the aliases and the palette script (HA package, stage A)

**Files:**
- Modify: `components/audio-sensor/templates/package.yaml.j2`
- Modify: `components/audio-sensor/component.yaml` (`provides` rows from the spec's table, stage A)
- Modify: `components/audio-sensor/translations/{en,de,pl}.json`
- Test: `tests/test_audio_sensor_render.py`

**Interfaces:**
- Consumes: `sensors[].strip` and its `entities` (Task 4); `input_select.audio_sensor_music_source` and the SPEC-025 ability pattern (existing).
- Produces: `input_boolean.<id_prefix>_strip_follow_music`, `input_number.<id_prefix>_strip_follow_off_delay` (0–600, step 5, 30), `input_select.<id_prefix>_strip_follow_effect` (`keep`, Pulse, Glow, Bands, Centre meter, Spectrum, Ripple; `keep` first), automation id `<id_prefix>_strip_follow_music`; `light.music_strip` (template light: on/off, brightness, effect, effect list); `binary_sensor.music_source_strip`; `sensor.music_source` capability `strip`; `script.audio_sensor_music_strip_palette` (field `stops`: list of 2–5 `#rrggbb`).

- [ ] **Step 1: Write the failing tests:**
  - `test_no_strip_renders_byte_identical`: the demo inputs with every `strip:` removed render exactly the package committed before this branch (`git show origin/main:` render, or a stored fixture of today's output).
  - `test_follow_helpers_and_automation_only_with_follow`: `strip: {}` → no follow helpers; `strip: {follow: media_player.x}` → the three helpers (no `initial:`) and the automation, which triggers on `media_player.x` to `playing` (on for a non-media-player domain) and, on leaving it, waits `input_number.<p>_strip_follow_off_delay` then turns the light off; it does nothing while the follow entity is `unavailable` or `unknown`, and nothing while the boolean is off.
  - `test_music_strip_alias_follows_the_selected_board`: with two boards, one with a strip, `light.music_strip` forwards to the strip board's light when it is selected and is unavailable for the other; `binary_sensor.music_source_strip` matches; `capabilities` lists `strip` last.
  - `test_palette_script_writes_custom_and_selects_it`: the script sets the selected board's `text` to the joined stops and its palette select to `custom`; with no strip on the selected board it has a condition that stops it; stops outside 2–5 stop it.

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_audio_sensor_render.py -k "strip or palette_script" -v`
Expected: FAIL

- [ ] **Step 3: Implement** in `package.yaml.j2`, following the existing per-board and alias blocks (the spectrum rate forwarding is the model for forwarding to the selected board). Add `provides` rows with the spec's stability levels and translations for every new helper name.

- [ ] **Step 4: Run to verify they pass, and HA validates the render**

Run: `uv run pytest tests/test_audio_sensor_render.py -v && tools/ha-check.sh audio-sensor`
Expected: PASS; `ha-check` ends `ok`

- [ ] **Step 5: Commit**

```bash
git add components/audio-sensor tests/test_audio_sensor_render.py
git commit -m "audio-sensor: the strip follows the music; music strip aliases and palette script (SPEC-043)"
```

### Task 6: Brightness from the room (HA package, stage B)

**Files:**
- Modify: `components/audio-sensor/templates/package.yaml.j2`, `component.yaml` (provides), translations
- Test: `tests/test_audio_sensor_render.py`

**Interfaces:**
- Consumes: `sensors[].strip.ambient_light`, `strip.entities.light` (Task 4).
- Produces: `input_boolean.<id_prefix>_strip_ambient`, `input_number.<id_prefix>_strip_ambient_dark_lux` (5), `_bright_lux` (300), `_min_pct` (20), `_max_pct` (100); automation `<id_prefix>_strip_ambient`.

- [ ] **Step 1: Write the failing tests:**
  - `test_ambient_only_with_ambient_light`: without it, no helpers; with it, the four numbers (no `initial:`) and the boolean.
  - `test_ambient_curve`: render the automation's brightness template with Home Assistant's Jinja (the existing alias-template test helper) at 2, 5, 39, 300 and 1000 lux → 20, 20, 60 ± 1, 100, 100 % (linear in log lux between the ends, clamped).
  - `test_ambient_rate_limit`: the automation runs only while the light is on, on a sensor change of more than 10 %, `mode: single` with a 10 s delay at the end; an `unavailable` sensor changes nothing.

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_audio_sensor_render.py -k ambient -v`
Expected: FAIL

- [ ] **Step 3: Implement** the helpers and automation.

- [ ] **Step 4: Run to verify they pass**

Run: `uv run pytest tests/test_audio_sensor_render.py -v && tools/ha-check.sh audio-sensor`
Expected: PASS; `ok`

- [ ] **Step 5: Commit**

```bash
git add components/audio-sensor tests/test_audio_sensor_render.py
git commit -m "audio-sensor: the strip's brightness follows a room light sensor (SPEC-043)"
```

### Task 7: Ramka: palette sync and the music sensor rows

**Files:**
- Modify: `components/ramka/templates/music-tables.j2` (a `strip_stops` table per palette)
- Modify: `components/ramka/templates/package.yaml.j2` (helper and automation)
- Modify: `components/ramka/templates/ramka-settings.lang.yaml.j2` (music sensor sub-view rows)
- Modify: `components/ramka/component.yaml` (consumes, provides), `translations/{en,de,pl}.json`
- Test: `tests/test_ramka_render.py` (the sub-view tests) and a new `tests/test_ramka_strip_palette.py`

**Interfaces:**
- Consumes: `light.music_strip`, `binary_sensor.music_source_strip`, `script.audio_sensor_music_strip_palette` (Task 5); `input_select.<prefix>_music_palette` (existing; options `zones`, `series`, `calm`).
- Produces: `input_boolean.<prefix>_music_strip_palette_sync` (no `initial:`, off), automation `<prefix>_music_strip_palette_sync`; table `strip_stops: {zones: [5 hex], series: [5 hex], calm: [5 hex]}`.

- [ ] **Step 1: Write the failing tests:**
  - `test_strip_stops_match_the_card_palettes`: each palette's 5 stops equal `PALETTES[name]` of `components/audio-sensor/cards/lib/palette.js` sampled at 0, 0.25, 0.5, 0.75, 1 with the same linear interpolation (parse the JS table with a regex; for `zones` take the literal first stop, not the card's neutral colour), every stop `#rrggbb`.
  - `test_sync_automation`: triggers on `input_select.<prefix>_music_palette` change and on the sync boolean turning on; condition sync on and `binary_sensor.music_source_strip` on; calls `script.audio_sensor_music_strip_palette` with the selected palette's stops.
  - `test_sub_view_strip_rows`: the music sensor sub-view has, visible only while `binary_sensor.music_source_strip` is on, a `light.music_strip` row, the sync toggle and a link row to the device page (the device of the selected board; Home Assistant's `/config/devices/device/<id>` built from `device_id()` of `light.music_strip`'s forwarded entity, or the more-info of `light.music_strip` if no device id resolves); the Reset turns the sync off and touches nothing else.
  - `test_ramka_without_audio_sensor_strip`: a Ramka render whose home has no strip renders no strip rows and no sync automation.

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_ramka_strip_palette.py -v` and `uv run pytest tests/test_ramka_render.py -k strip -v`
Expected: FAIL

- [ ] **Step 3: Implement**; translations for the toggle, its help text and the link in en/de/pl. The Ramka settings rule: Basic gets the light row and the sync; nothing Advanced (those are on the device page).

- [ ] **Step 4: Run to verify they pass**

Run: `uv run pytest tests -k "ramka" -v && tools/ha-check.sh ramka`
Expected: PASS; `ok`

- [ ] **Step 5: Commit**

```bash
git add components/ramka tests/test_ramka_strip_palette.py
git commit -m "ramka: push the music palette to the strip; strip rows on the music sensor page (SPEC-043)"
```

### Task 8: Documentation and the whole check

**Files:**
- Modify: `components/audio-sensor/README.md` (section "Music strip": wiring both ways, the 1 dB noise rule, power limit = supply rating, settings table, follow and ambient, the latency budget, the clap test), `components/audio-sensor/UPGRADE.md` (unreleased entry: what a home adds — `strip:` input, the three device-file lines, one OTA flash), `components/ramka/README.md` and `UPGRADE.md` (palette sync), `components/ramka/DESIGN.md` only if the sub-view's look changed

- [ ] **Step 1: Write the docs** (facts from the spec; no home's data).
- [ ] **Step 2: Run every check**

Run: `tools/check-all.sh`
Expected: every step `ok`, last line `ok`

- [ ] **Step 3: Commit**

```bash
git add components/audio-sensor components/ramka
git commit -m "audio-sensor, ramka: music strip documentation and upgrade notes (SPEC-043)"
```

### Task 9: Prototype on the maintainer's instance (needs typed go-aheads)

Runs in the home repository, not the catalog. Every write to production and the flash wait for the
maintainer's go-ahead typed in that session (home `AGENTS.md`, Boundaries).

- [ ] **Step 1:** In the home repo: add `strip:` (with `follow:` the home's media-playing entity) to `domosenso/audio-sensor.inputs.yaml`; add the strip package line (pointing at this branch's commit) and substitutions to the board's device file.
- [ ] **Step 2:** `uvx esphome@2026.9.1 config` and `compile` the device file. Expected: compiles.
- [ ] **Step 3:** `domosenso render audio-sensor ramka --catalog-dev /Users/docere/Dev/domosenso-led-strip`, `snapshot production`, `deploy production --plan`. Show the plan. **Wait for the go-ahead.**
- [ ] **Step 4:** After the go-ahead: `deploy production --apply --allow-dirty --confirm <hash>`; press the Ramka reload (standing go-ahead). **Ask for the flash go-ahead**, then flash over the air: `uvx esphome@2026.9.1 run <device file> --device <board address>`.
- [ ] **Step 5:** Verify: `verify production --baseline <snapshot>`; Sound level, Spectrum and the Ramka visual unchanged; Spectrum load read before and after; quiet-room Sound level with the strip off vs flashing at full power (≤ 1 dB rise, else own supply required); a 240 fps clap recording for the latency; every style in each mounting with the maintainer. Rollback: flash the previous device file (0.2.0 package) over the air.
