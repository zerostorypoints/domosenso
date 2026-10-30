# Spectrum latency and publish profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the music visual's delay from a bass hit to the peak on screen under 300 ms (issue #99) and let the user pick how often the audio sensor publishes, eco / normal / fast, from Ramka settings (issue #110).

**Architecture:** The board's spectrum interval becomes a runtime value set by a new ESPHome select (`Spectrum rate`); **fast** publishes every new FFT frame (85 ms hop) as that frame alone, without averaging. Home Assistant holds the user's choice and a "someone is watching" flag in the audio-sensor package; an automation there sets the board, applying **fast** only while the flag is on. Ramka turns that flag on while its music view is shown and puts the choice on Music, Advanced. The card's engine stops stepping by never rising faster than the gap between pushes.

**Tech Stack:** ESPHome 2026.9.1 C++ external component and YAML, Home Assistant 2026.9.2 YAML packages (Jinja `[[ ]]` templates), card JavaScript with node tests, pytest.

**Spec:** issues #99 and #110 (zerostorypoints/domosenso), amending `.ai/specs/SPEC-018-2026-10-29-audio-sensor.md` and `.ai/specs/SPEC-021-2026-10-29-ramka-live-settings.md` (Task 1).

## Where the delay comes from (read from the code; times are inference until Task 7 measures them)

| stage | today | after this plan, profile fast |
|---|---|---|
| FFT window 8192 @ 48 kHz, Hann | hit reaches full weight ~85 ms after it starts | same (window size out of scope) |
| wait for the publish | 0–200 ms, `loop()` polls on its own clock | 0–~5 ms: published when the frame lands |
| averaging the frames since the last publish | a kick in 1 of ~2.4 frames: about −4 dB, smeared | none: newest frame |
| ESPHome API → HA → template alias → websocket | not timed; tens of ms (inference) | same |
| card `rise` 200 ms (time constant 87 ms) | ~90 % after 200 ms; a short rise steps every 200 ms | rise never shorter than the push gap, so it glides |

Sum today: about 300–600 ms plus the dilution, which matches "up to about 1 s by eye". Not in this plan but noted for Task 7: the default `fall` of 4 s at two kicks a second keeps the low bands high between kicks, which also reads as "not following".

## Global Constraints

- Components are unreleased (no `audio-sensor/*` tag; `ramka/0.4.0` untagged): amend audio-sensor 0.1.0 and ramka 0.4.0 without a bridge. If either is tagged before this merges, bump it instead (audio-sensor 0.1.1 / ramka 0.4.1) and add `UPGRADE.md` and `docs/UPGRADE_NOTES.md` entries.
- Profiles and their intervals (provisional, Task 7 confirms or changes them and records why): **eco 500 ms** (mean of frames), **normal 200 ms** (mean of frames, today's behaviour), **fast 85 ms** (newest frame only).
- After a boot the board is **normal**. A board left on **fast** returns to **normal** after **60 min** (the `live_tracking_timeout` pattern).
- **fast** is applied only while `input_boolean.audio_sensor_music_watching` is on; it goes back to normal **10 s** after the flag turns off.
- The recorder keeps excluding every spectrum entity and `sensor.music_spectrum` in every profile.
- The fps helper keeps id, range 1–60 and default 30; only its label changes: en "Redraw rate", de "Neuzeichnungsrate", pl "Częstotliwość rysowania".
- Nothing from a real home in the catalog (`tests/test_catalog_content.py::test_privacy`); examples use the demo home.
- `tools/check-all.sh` green before every PR.

## Review Focus

- The board's select is set while the board is offline (HA restart, board reboot): the automation must re-apply the wanted profile when the board's select becomes available again — test in Task 4.
- Two Ramkas or two tabs showing the music view: one flag, any watcher keeps it on; the last one leaving starts the 10 s — the flag is per home, Task 5 turns it on/off from `music_view` only, never toggles.
- The music source select moves to another board while fast: the old board must go back to normal, the new one gets the profile — test in Task 4.
- A home without a `music: true` board, or without audio-sensor at all: no helper, no automation, Ramka hides the row and its reset skips the helper — tests in Tasks 4 and 5.
- `fast` with no frame since the last publish (microphone stopped): nothing published, no stale repeat — host test in Task 2.

---

## Task status (coordinator keeps this current)

| task | branch | session | state |
|---|---|---|---|
| 1 spec amendments | `feature/spectrum-latency` | coordinator | done |
| 2 firmware: settable interval, frame-timed publish | `task/spectrum-firmware` | spectrum-firmware | merged (#118) |
| 3 card engine: no stepping | `task/spectrum-engine` | spectrum-engine | merged (#115) |
| 4 audio-sensor package: choice, watching flag, forwarding | `task/spectrum-package` | spectrum-package | merged (#117) |
| 5 ramka: Music Advanced row, reset, watching, fps label | `task/spectrum-ramka` | spectrum-ramka | merged (#116) |
| 6 docs: README, manifests, check-all | `feature/spectrum-latency` | coordinator | done |
| 7 measurement on the wall (human) | — | coordinator records | publish rates measured 2026-10-30 (pass, after `api: batch_delay: 10ms`); load, sound to screen, fallbacks waiting for the human |

Order of merging into the feature branch: 1, then 2 and 3 (independent, parallel), then 4, then 5, then 6. Task 7 runs after a human flashes a board from the feature branch.

---

### Task 1: Spec amendments (coordinator, before any code)

**Files:**
- Modify: `.ai/specs/SPEC-018-2026-10-29-audio-sensor.md` (Firmware, Inputs table, Provides, Cards, Tests)
- Modify: `.ai/specs/SPEC-021-2026-10-29-ramka-live-settings.md` (helpers table, Music page row, seeding and reset)

- [ ] **Step 1:** SPEC-018: add an "Amended by issues #99 and #110 (2026-10-30)" line under the header; in Firmware replace the fixed 200 ms with the three profiles and their publish rule (Global Constraints), the select `Spectrum rate` and its timeout; add `spectrum_rate` (select) to the entity-key table; add `input_select.audio_sensor_music_spectrum_rate` and `input_boolean.audio_sensor_music_watching` to Provides; in Cards add the engine rule "rise is applied as at least the gap between the last two pushes".
- [ ] **Step 2:** SPEC-021: Music, Advanced gains "spectrum rate" (`input_select.audio_sensor_music_spectrum_rate`, consumed, default `normal`, covered by the Music and global reset when available); the fps row's label becomes "Redraw rate" with the note that it does not make the data newer; Ramka turns `input_boolean.audio_sensor_music_watching` on while `binary_sensor.<prefix>_music_view` is on.
- [ ] **Step 3:** `uv run tools/agents_check.py` and `tools/check-all.sh` green; commit "Amend SPEC-018 and SPEC-021 for spectrum profiles and latency (#99, #110)".

### Task 2: Firmware — settable interval, frame-timed publish, newest frame on fast

**Files:**
- Create: `components/audio-sensor/esphome/components/audio_spectrum/publish_policy.h` (no ESPHome includes, namespace `::audio_spectrum`, like `spectrum_bands.h`)
- Modify: `components/audio-sensor/esphome/components/audio_spectrum/audio_spectrum.h`, `audio_spectrum.cpp`
- Modify: `components/audio-sensor/esphome/audio-sensor.yaml` (select, timeout script, comment at `audio_spectrum:`)
- Create: `tests/fixtures/audio_spectrum/test_publish_policy.cpp`
- Modify: `tests/test_audio_spectrum_bands.py` (add `test_publish_policy`, same build pattern as `test_band_maths`)

**Interfaces:**
- Produces (C++): in `publish_policy.h`
  - `enum class Mix { MEAN, LATEST };`
  - `struct Profile { uint32_t interval_ms; Mix mix; };`
  - `inline constexpr Profile ECO{500, Mix::MEAN}, NORMAL{200, Mix::MEAN}, FAST{85, Mix::LATEST};`
  - `inline bool publish_due(uint32_t now_ms, uint32_t last_ms, uint32_t interval_ms, uint32_t frames)` — true when `frames > 0` and `now_ms - last_ms >= interval_ms - HOP_SLACK_MS` with `HOP_SLACK_MS = 10` (so an 85 ms profile never skips a frame that lands at 85.3 ms); wrap-safe unsigned subtraction.
- Produces (component): `void AudioSpectrumComponent::set_profile(const bands::Profile &p)` — callable from a lambda, thread-safe against the worker.
- Produces (board entity): ESPHome `select` named `Spectrum rate`, id `spectrum_rate`, options `eco`, `normal`, `fast`, `entity_key: spectrum_rate`.

- [ ] **Step 1: Write the failing host test** `test_publish_policy.cpp` asserting: `publish_due(1000, 900, 200, 3) == false`; `publish_due(1100, 900, 200, 3) == true`; `publish_due(1100, 900, 200, 0) == false`; `publish_due(985, 900, 85, 1) == true` (85 ms profile, frame at +85); `publish_due(5, 0xFFFFFFF0u, 85, 1) == false` and `publish_due(80, 0xFFFFFFF0u, 85, 1) == true` (millis wrap); `FAST.mix == Mix::LATEST`, `NORMAL.interval_ms == 200`.
- [ ] **Step 2:** `uv run pytest tests/test_audio_spectrum_bands.py -v` — `test_publish_policy` FAILS (header missing).
- [ ] **Step 3: Implement.** `publish_policy.h` as in Interfaces. In the component: replace `FAST_INTERVAL_MS` with a `Profile profile_` member (default `NORMAL`) guarded by `mutex_`; the worker also keeps `latest_ms_[NUM_BANDS]` (the last frame's band powers) beside `fast_ms_`; `loop()` reads `fast_frames_` under the lock and calls `publish_due`; `publish_fast_()` uses `latest_ms_` for `Mix::LATEST` and the mean for `Mix::MEAN`, and sets `last_fast_ms_` only when it published. `dump_config` prints the profile's interval. `set_profile` takes the lock, sets `profile_`, and resets `fast_ms_`/`fast_frames_` so the first publish after a change is not a mix of both rates.
- [ ] **Step 4:** In `audio-sensor.yaml` add, after `live_tracking`:
  - `select: - platform: template, id: spectrum_rate, name: Spectrum rate, icon: mdi:timer-cog-outline, options: [eco, normal, fast], initial_option: normal, optimistic: true, restore_value: false`, `set_action` → lambda mapping the option to `ECO`/`NORMAL`/`FAST` via `id(spectrum).set_profile(...)` (give `audio_spectrum:` an `id: spectrum`), then `script.execute: spectrum_rate_timeout` when `fast`, else `script.stop`.
  - `script: - id: spectrum_rate_timeout, mode: restart, then: delay 60min, select.set_option normal` — comment why, as at `live_tracking`.
  - Update the comment above `audio_spectrum:` ("Always on: the spectrum goes out every 200 ms") to the profiles.
- [ ] **Step 5:** `uv run pytest tests/test_audio_spectrum_bands.py -v` PASS; `tools/esphome-check.sh audio-sensor` ends ok (compiles).
- [ ] **Step 6:** Commit "audio-sensor: a Spectrum rate select; fast publishes each new frame (#99, #110)".

### Task 3: Card engine — no stepping between pushes

**Files:**
- Modify: `components/audio-sensor/cards/lib/engine.js` (`push`, `step`)
- Test: `components/audio-sensor/cards/lib/engine.test.mjs`

**Interfaces:**
- Produces: `Engine` keeps `this._gapMs` — the gap between the last two pushes, clamped to [0, 1000] ms, `0` before two pushes. In `step`, the rise used for both `smooth` and `smoothValue` is `max(opts.rise, this._gapMs) / 1000` s. Fall, hold and scalar staleness unchanged. No public API change.

- [ ] **Step 1: Write the failing tests** in `engine.test.mjs`:
  - `"a short rise does not stand still between pushes"`: spectrum engine, `rise: 50`, pushes of a step from neutral to hot at t = 0, 200, 400 ms… with `step(1/30)`; between the push at 400 and the next at 600, every frame's `smooth[i]` for a pushed band is strictly greater than the previous frame's (until within 0.5 dB of the target).
  - `"rise of 200 ms at 5 pushes a second is unchanged"`: same with `rise: 200`, the values equal those of `approach(..., riseS = 0.2)`.
  - `"a gap over 1 s is clamped"`: pushes 3 s apart, effective rise ≤ 1 s (value after 1 s within 1 % of target).
- [ ] **Step 2:** `node --test components/audio-sensor/cards/lib/engine.test.mjs` — the first test FAILS.
- [ ] **Step 3:** Implement as in Interfaces; a comment saying why (a rise shorter than the push gap reaches the target and stands still: the picture steps).
- [ ] **Step 4:** `node --test components/audio-sensor/cards/` PASS.
- [ ] **Step 5:** Commit "ambient-wave-card: rise never shorter than the push gap, so a short rise does not step (#99)".

### Task 4: audio-sensor package — the choice, the watching flag, the forwarding

**Files:**
- Modify: `components/audio-sensor/templates/package.yaml.j2`
- Modify: `components/audio-sensor/component.yaml` (provides, upstream `spectrum_rate`)
- Modify: `components/audio-sensor/translations/*.json` only if the package's names are translated there (follow the existing helpers)
- Test: `tests/test_audio_sensor_render.py`

**Interfaces:**
- Consumes: board select `entity_key: spectrum_rate` (Task 2); guessed id `select.<area>_<device>_spectrum_rate` via the existing `guess(board, 'select', 'spectrum_rate')`, overridable in `entities`.
- Produces (stable, only with a `music: true` board):
  - `input_select.audio_sensor_music_spectrum_rate` — options `eco`, `normal`, `fast`; no `initial:` (seeded `normal` by the Ramka reset or by hand; an unset helper reads as `normal`).
  - `input_boolean.audio_sensor_music_watching` — on while some view shows the music visual; no `initial:`.
  - `automation` id `audio_sensor_music_spectrum_rate` — sets the selected board's select to: the choice, except `fast` → `fast` only while watching is on, else `normal`; triggers on the choice, watching (off `for: 10 s`, on immediately), the music source, HA start and the board's select becoming available; on a music-source change sets the previous board back to `normal`. Mode `queued`.

- [ ] **Step 1: Write failing tests** in `test_audio_sensor_render.py`:
  - `test_spectrum_rate_helpers_with_a_music_board(demo)`: both helpers exist, options exactly `["eco", "normal", "fast"]`, neither has `initial`.
  - `test_no_music_board_no_spectrum_rate(tmp_path)`: neither helper nor the automation is rendered.
  - `test_spectrum_rate_automation_targets_the_selected_board(demo)`: the automation's action template picks the board's select through the same `lookup` as the aliases; its triggers include the watching flag `to: "off"` with `for: {seconds: 10}`, the source select, `homeassistant` start and the board select's `from: unavailable`.
  - `test_spectrum_rate_fast_only_while_watching(demo)`: render the option template with HA-style Jinja for (choice, watching) ∈ {(fast, on) → fast, (fast, off) → normal, (eco, off) → eco, (unknown, on) → normal}.
  - `test_spectrum_rate_resets_the_previous_board(demo)`: on a source change the automation sets `trigger.from_state`'s board to `normal`.
  - `test_entities_input_accepts_spectrum_rate(tmp_path)`: `spectrum_rate` is a known entity key.
  - `test_recorder_excludes_every_spectrum_and_the_alias` stays green.
- [ ] **Step 2:** `uv run pytest tests/test_audio_sensor_render.py -v` — new tests FAIL.
- [ ] **Step 3:** Implement in `package.yaml.j2` (add `spectrum_rate` to `known`; per board `spectrum_rate` from `guess`; the helpers and the automation under `[%- if source %]`); add the provides and upstream lines to `component.yaml`.
- [ ] **Step 4:** pytest PASS; `tools/ha-check.sh audio-sensor` ends `fresh: 0 errors`.
- [ ] **Step 5:** Commit "audio-sensor: a spectrum rate choice and a watching flag, forwarded to the music board (#99, #110)".

### Task 5: Ramka — the row on Music, Advanced, the reset, the watching flag, the fps label

**Files:**
- Modify: `components/ramka/templates/package.yaml.j2` (reset script, a watching automation, fps label)
- Modify: `components/ramka/templates/ramka-settings.lang.yaml.j2` (Music, Advanced row)
- Modify: `components/ramka/translations/{en,de,pl}.json`
- Modify: `components/ramka/component.yaml` (consumes)
- Test: `tests/test_ramka_render.py`

**Interfaces:**
- Consumes: `input_select.audio_sensor_music_spectrum_rate`, `input_boolean.audio_sensor_music_watching` (Task 4).
- Produces: automation `<prefix>_music_watching` (only with `music_visual`): `binary_sensor.<prefix>_music_view` on → `input_boolean.turn_on` the flag; off → `turn_off` (the 10 s grace is the audio-sensor automation's, not here). Translation key `ui.settings.music_spectrum_rate` ("Sensor update rate" / "Sensor-Aktualisierungsrate" / "Częstotliwość odczytu czujnika"), option labels eco/normal/fast in three languages.

- [ ] **Step 1: Write failing tests** in `test_ramka_render.py`:
  - extend `test_every_setting_is_on_a_page_and_reset`: the spectrum rate row is on Music, Advanced, with the `source_there` visibility (hidden while the audio-sensor select is unavailable); the Music reset and the global reset set it to `normal` with a condition that the entity exists (not `unavailable`), so a home without audio-sensor does not fail.
  - `test_music_view_drives_the_watching_flag(demo)`: the automation exists with `music_visual`, turns the flag on and off from `binary_sensor.<prefix>_music_view`; absent without `music_visual`.
  - `test_fps_is_the_redraw_rate`: en/de/pl labels of `music_fps` are the three in Global Constraints; helper id, min 1, max 60, default 30 unchanged.
  - `test_render_without_audio_sensor_unchanged`: the row and the automation reference only consumed ids and render the same YAML for a home without audio-sensor except those visibility-guarded lines (compare against today's render minus the new blocks).
- [ ] **Step 2:** `uv run pytest tests/test_ramka_render.py -v` — new tests FAIL.
- [ ] **Step 3:** Implement; the reset calls `input_select.select_option` guarded by a template condition on availability; add the two consumes lines.
- [ ] **Step 4:** pytest PASS; `tools/ha-check.sh ramka` ends `fresh: 0 errors`.
- [ ] **Step 5:** Commit "ramka: sensor update rate on Music, Advanced; the music view asks for fast data; fps is the redraw rate (#99, #110)".

### Task 6: Docs and the whole branch (coordinator)

**Files:**
- Modify: `components/audio-sensor/README.md` (a "Latency and update rate" section: the stage table above, the three profiles and their cost, the method of Task 7 with empty result rows), `components/ramka/README.md` (the Music, Advanced row)
- Modify: `components/audio-sensor/UPGRADE.md`, `components/ramka/UPGRADE.md`, `docs/UPGRADE_NOTES.md` only if a tag exists (Global Constraints)

- [ ] **Step 1:** Write the README sections; mark every time not yet measured as inference.
- [ ] **Step 2:** `tools/check-all.sh` green on the feature branch; `render --catalog-dev` of the demo home clean.
- [ ] **Step 3:** Commit "audio-sensor, ramka: document latency and the update rate (#99, #110)".

### Task 7: Measurement on the wall (human, after flashing a board from the feature branch)

Prepared by the agent, done by a human; results go into the README rows of Task 6.

- [ ] Publish rate per profile: 60 s each, count HA `state_changed` of the board's spectrum (websocket read); within 10 % of 500 / 200 / 85 ms.
- [ ] Load: board `Spectrum load` and HA event rate, eco vs normal over 10 min.
- [ ] Sound to screen: tone burst or kick near the microphone, 10 trials filmed at 240 fps beside the tablet, fast and normal; median and 90th percentile; target under 300 ms in 9 of 10 on fast, else name the limiting stage.
- [ ] Restart → normal; fast left on → normal after 60 min; music view closed → normal after 10 s.
- [ ] If a measured figure moves a profile's interval, change `publish_policy.h` and the spec in one commit.

When Tasks 1–6 are merged into `feature/spectrum-latency` and Task 7's figures are in, the coordinator opens one PR into `main` (closes #99, #110) for the human.
