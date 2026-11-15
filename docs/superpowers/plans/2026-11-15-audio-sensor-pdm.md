# Audio sensor PDM board Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the approved second audio-sensor board in 0.5.0.

**Architecture:** Preserve the Atom entry point and extract its shared measurement/FFT/control
configuration. Add a PDM adapter and opt-in OLED package; the renderer chooses packages while
keeping thin files owner-managed. The DSP stays unchanged.

**Tech Stack:** ESPHome 2026.9.1, ESP-IDF, Jinja, Python/pytest, C++ host tests.

**Spec:** `.ai/specs/SPEC-050-2026-11-15-audio-sensor-pdm-board.md`

## Global Constraints

- 48 kHz mono 16-bit PCM, DC correction; 4096 Hann FFT, 50% overlap unchanged.
- PDM GPIO4 clock / GPIO5 data, right channel; OLED SCL6/SDA7, SSD1306 128x64 0x3C.
- Preserve Atom pins, ES8311 gain, amplifier off, strip and project identity.
- PDM project domosenso.audio-sensor-pdm; 16 MB flash, 8 MB octal PSRAM at 80 MHz.
- No production access, flash, push or release. Full checks before every commit.
- Independent review belongs to the coordinating session's separate reviewer.

## Review Focus

- Null fields retain absent-input semantics, but false/string/bogus boards do not select hardware.
- Explicit PDM gain and strip must fail before any device is written.
- An edited thin file survives update, even when inputs select another board.
- OLED non-finite/startup values cannot poison held maximum or draw outside its bar.
- Shared packages and secondary factory imports cannot escape version checks.

### Task 1: Board selection and compatibility

**Files:** `tests/test_audio_sensor_render.py`, `components/audio-sensor/esphome/device.yaml.j2`,
`components/audio-sensor/templates/package.yaml.j2`.
**Interfaces:** Consume per-sensor board/oled; produce existing thin filenames with Atom/PDM and optional OLED URLs.

- [x] Add tests for default/explicit Atom, PDM OLED on/off, null and invalid combinations; run and observe failures.
- [x] Add matching board validation to both existing template roots; select packages without altering existing outputs.
- [x] Verify unchanged HA/assistant contracts and owner-managed thin files in a fresh CLI fixture.
- [x] Run focused renderer/CLI tests; expected all pass.

### Task 2: Firmware and catalog release unit

**Files:** `components/audio-sensor/esphome/audio-sensor*.yaml`,
`components/audio-sensor/component.yaml`,
`tools/catalog_check.py`, `tests/test_catalog_check.py`, `tests/test_audio_sensor_boards.py`,
`tests/test_audio_spectrum_bands.py`.
**Interfaces:** Both adapters supply mic; common package supplies measurements and controls;
OLED consumes sound_level_dbfs and sound_peak_dbfs, holds finite maxima independently.

- [x] Add failing safety/package tests, host tests executing the OLED YAML callbacks and shared-ref/secondary-factory version tests.
- [x] Extract shared YAML without changing DSP; add PDM, OLED, factory and 0.5.0 manifest refs.
- [x] Expand checker to all component ESPHome YAML, preserving external-repository behavior.
- [x] Run focused tests and config/compile Atom, Atom strip, PDM, PDM OLED and PDM factory; expected success.

### Task 3: Reproducible assembly and handoff

**Files:** `devices/esp32-s3-im73d122.{yaml,md}`, `devices/wiring/esp32-s3-im73d122.svg`,
`components/audio-sensor/{README.md,UPGRADE.md,translations/*.json}`, `docs/{COMPATIBILITY.md,UPGRADE_NOTES.md}`,
`README.md`, `CONTRIBUTING.md`, `tests/test_catalog_content.py`, fictional ESPHome examples and catalog index.
**Interfaces:** New assembly identity matches only PDM project; default factory remains Atom.

- [x] Add failing model match regression; create catalog metadata and en/de/pl descriptions.
- [x] Document exact orientation, unproven L/R bias, fixed gain, manual thin-file updates and pending FFT hardware acceptance.
- [x] Generate original wiring SVG and fictional thin examples; update compatibility/release docs and generated index.
- [x] Run tools/check-all.sh; expected every step passes. Record failures with causes if environment prevents checks.
- [x] Review diff/privacy and prepare the local commit with retained evidence for independent review.

## Website and demo decision

Website: additive catalog and hardware guide; release audit/publication remains with coordinator after
merge/tag. Do not describe 0.5.0 as released. Demo: skip; HA/card contracts unchanged and the browser
demo cannot validate PDM firmware or physical OLED. Config/compile and host tests cover local risks;
hardware acceptance remains explicitly pending.

## Execution decisions and evidence

- Validation is duplicated in the two existing template roots rather than introducing a renderer
  loader API or symlinks. Both entry paths have the same regression matrix. Risk: predicates could drift.
- OLED callbacks are compiled and executed directly from the YAML in the host test, instead of
  adding a separate helper header. Risk: the host harness does not validate runtime scheduling.
- PDM firmware fixture inputs live separately in `examples/demo-home/inputs/audio-sensor-pdm.yaml`;
  the default HA demo stays unchanged. The template regression checks both fixture sets.
- Independent technical review is assigned to the coordinator's separate session/worktree. This
  implementation does not claim reviewer or human approval.
- Initial focused baseline: 93 passed. Expanded focused matrix: 167 passed. Full Python: 2203 passed.
- An initial full JavaScript run hit the existing Pocket history-arrow 30 ms timing assertion
  under compile load; its isolated file rerun passed 13/13. Final full-check result is in the handoff.

- Verification scope addition: two existing Pocket history-arrow tests used a fixed 30 ms wait
  and failed in two full runs. The three fixed waits in those files now drain the fixture's resolved promise callbacks and await the scheduled animation frame. Both files pass 30/30; no Pocket production changes. Cost if wrong: altered
  test scheduling could miss a race, so fetch-count and rendered-arrow assertions are retained.

Final local verification: `tools/check-all.sh` ended **all checks passed** (2203 Python tests,
1861 JavaScript tests, catalog/website content, isolated home staging and all HA/ESPHome checks).
The final scheduling-only test refinement was followed by another full JavaScript run: 1861/1861.
Both factories and four thin files validate; Atom, Atom strip, PDM, PDM OLED and PDM factory compile.
No physical device was flashed; shared FFT runtime, HA metadata and calibration acceptance remain pending.

## Independent review correction

The review of `5b9234d` reproduced a P2: recursive firmware discovery entered generated ESPHome
caches and compared dependency refs/project versions/imports against the enclosing component.
The fix prunes hidden tool/cache directories and `__pycache__` during source discovery, preserves
recursive authored source and factory validation, and keeps explicit manifest paths checked.
It uses the filesystem, so copied catalogs need no Git index. Regression RED: 5 failed / 38 passed;
GREEN: all 43 catalog-check tests passed. No firmware or Pocket changes in this correction.
Correction verification: `tools/check-all.sh` ended **all checks passed**, including 2208 Python
tests, 1861 JavaScript tests and the ordinary isolated HA/ESPHome checks.
