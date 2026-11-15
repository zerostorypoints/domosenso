# SPEC-050: A second audio-sensor board: ESP32-S3 with IM73D122

- Status: approved 2026-11-15 by the maintainer in the coordinating chat; implementation delegated
  to a separate implementation chat, with independent technical review before handoff.
- Source: maintainer request following a successful hardware bench, and a request to reuse the
  existing Atom spectrum implementation. No private bench records or photos are distributed.
- Builds on SPEC-018 and SPEC-043; proposed component version: audio-sensor 0.5.0.

## Goal and placement

Let another installation build an audio-sensor from an ESP32-S3 DevKitC-1 N16R8-compatible board,
an IM73D122 PDM microphone module and, optionally, an SSD1306 OLED. It exposes the same sound
levels, third-octave spectrum, octave summaries and controls as the Atom EchoS3R.

Home Assistant already provides ESPHome device integration; use it unchanged. The firmware and
reproducible hardware recipe are useful to a second home, so they belong in audio-sensor. Network
credentials, entity bindings, recordings and installation-specific calibration remain in the home.

Reuse the existing audio_spectrum implementation (4096-point FFT, Hann window, 50% overlap,
48 kHz PCM), including its eco/normal/fast publication policy. History attributes the FFT change
to docere-priv in f97b1af (#110). Do not fork the DSP or replace it with the bench sound meter.

## Devices and evidence

- Required new catalog device: `esp32-s3-im73d122`, describing a complete assembly, not a bare chip.
  ESP32-S3, 16 MB flash, 8 MB octal PSRAM; ESP-IDF and 80 MHz octal PSRAM as on the bench.
- Microphone: the round IM73D122 module with two three-pin headers. A generic board sold under
  that chip name is not automatically the same PCB. Document visual landmarks and verified pins.
- Optional display: SSD1306 128x64 I2C, address 0x3C, 3.3 V-compatible module.
- USB powers the development board; the microphone uses its 3.3 V supply, never 5 V.
- Verified before this change: two microphone modules produced finite, sound-responsive readings
  with 48 kHz PDM and the corrected wiring. N16R8 memory and OLED worked. Earlier no-data trials
  used the wrong orientation and are not evidence of defective microphones.
- Not yet verified: the shared framework FFT on this assembly, full firmware runtime, acoustic
  calibration, low-frequency accuracy, or music-strip operation. A bench is not a deployed home;
  catalog `tested.homes` starts at 0 with a precise bench-evidence note.

### Wiring conventions

ESP view is **bottom / pin side**, antenna at the top, USB at the bottom. Count each header from
the antenna end. For the tested DevKitC-1 layout, the right header has 3V3 at positions 1 and 2,
GPIO4 at 4, GPIO5 at 5, GPIO6 at 6 and GPIO7 at 7. Check printed GPIO labels on other clones.

Microphone view is **metal lid towards the viewer, two brown components above it**, matching the
seller's working orientation. Use this explicit view in an original SVG; never infer orientation
from the word "top" alone or reuse a mislabeled bench drawing.

| Microphone pin in that view | Connection |
| --- | --- |
| Right top | 3.3 V |
| Right middle | GND |
| Right bottom | NC, unconnected |
| Left middle | CLK, GPIO4 |
| Left bottom | DATA, GPIO5 |
| Left top | L/R; unconnected in the verified module configuration |

The tested receiver uses the right channel. L/R selects which clock edge carries the chip's data;
it is not an additional audio input. The tested module's bias has not been established. Do not
claim that a floating L/R is valid for every bare IM73D122, or infer bias from an "R" marking.
Document the module-specific observation and the chip datasheet requirement separately. Any
permanent strap recommendation must be checked against the actual PCB and chip datasheet first.

OLED: SCL GPIO6, SDA GPIO7, VCC 3.3 V, GND common. Show these in the same bottom-view ESP drawing.
No GPIO15/16 self-test, supply cycling or automatic probing is included in production firmware.

## Integrations and firmware structure

- ESPHome 2026.9.1, ESP-IDF, existing HA ESPHome integration; no new HACS dependency.
- Keep `esphome/audio-sensor.yaml` as the compatible Atom entry point, with its current pin map,
  ES8311 gain, amplifier-off behavior and project name `domosenso.audio-sensor`.
- Extract shared measurements, FFT, publication controls and diagnostics into a local package.
  Both board entry points consume it with microphone id `mic` and 48 kHz mono 16-bit PCM.
- Add `esphome/audio-sensor-pdm.yaml`: PDM on GPIO4/GPIO5, right channel, DC correction;
  no ES8311 configuration, Atom I2C pins or amplifier output.
- The new variant uses additive project name `domosenso.audio-sensor-pdm`. This distinguishes it
  from the existing Atom catalog match on model `audio-sensor`; existing project identity stays
  unchanged. Add the new project to the manifest's provides and compatibility documentation.
  Test model matching from representative ESPHome device information; label inference honestly
  until actual HA device information is observed.
- Add `esphome/audio-sensor-oled.yaml`, loaded only when requested. Show current dBFS, a bounded
  bar and maximum finite peak since boot. Keep HA Sound peak as the current measurement window;
  the display's held maximum must not silently change its meaning. Handle startup and non-finite
  values, and avoid a display refresh rate that disrupts microphone processing.
- PDM has no ES8311 programmable gain. Its diagnostic Mic gain reports a fixed-PDM description;
  do not pretend it applies the Atom's 24DB setting.
- Add a distinct PDM factory YAML with correct dashboard_import, checked by the existing factory
  glob. Keep the manifest's scalar default factory pointing to Atom; document the explicit PDM
  file and flash command. No factory-selection schema expansion is needed for this change.

## Inputs

Add optional per-sensor fields; existing sensor entries retain their behavior.

| Input | Type / default | Meaning |
| --- | --- | --- |
| `board` | enum: `m5stack-atom-echos3r`, `esp32-s3-im73d122`; default first | Select hardware package |
| `oled` | bool, false | Include the documented display on the PDM assembly |

Example: `{room: studio, area: Studio, board: esp32-s3-im73d122, oled: true}`.
Reject unknown board values and OLED on Atom with actionable errors. `mic_gain` remains an Atom
input; reject an explicitly supplied gain for PDM rather than silently ignoring it. Preserve the
current Atom music-strip feature. Reject `strip` on the new assembly for this first support
increment, since its wiring/power/runtime have not been qualified. GPIO overrides, if exposed as
ESPHome substitutions, belong in the owner's thin file, not a new generic pin-allocation API.

## Provides, consumes and ownership

- Existing component id, remote package paths and tag scheme: **frozen**, unchanged.
- Existing Atom project, HA entity ids/unique ids, level/peak semantics and controls: **stable**.
- Existing spectrum format (31 bands) and octave units/meaning: **stable**, unchanged.
- New board id, PDM project, package paths and optional inputs: additive; stable after release.
- Existing music-source aliases, assistant bindings and consumes remain unchanged. No Ramka or
  HA backend specialization by board, and no new dependency on another installation.
- Managed catalog: shared firmware, adapters, manifest, translations en/de/pl, component guide,
  hardware guide `devices/esp32-s3-im73d122.md`, original wiring SVG, tests and fictional examples.
- Instance: generated thin ESPHome YAML, written once; credentials and calibration owned by home.
- Local: user pin customizations. Updates preserve existing thin files and other local edits.

## Compatibility and rollout

No migration for existing Atom homes. Keep the old package path as a permanent wrapper, not only
a one-minor bridge. Document selecting the new board when adding a device, or explicitly editing
an existing owner-managed thin file; changing inputs must not overwrite it. Add UPGRADE.md notes
for the new variant, fixed microphone gain, optional OLED and separate factory choice.

Pin all external component references and examples to the same proposed component version. CI
Release creates the tag after the approved merge; no manual tag or release. Use local test remotes
to validate unreleased packages. Firmware flashing and live-home rollout are separate actions.

## Verification and acceptance

1. Baseline at f9c6833: 93 focused tests passed on 2026-11-15 (`test_audio_spectrum_bands.py`,
   `test_audio_sensor_render.py`, `test_esphome_check.py`). This is existing-code evidence only.
2. Add regressions before implementation for default Atom rendering, PDM selection, display on/off,
   rejected combinations, no Atom hardware outputs in PDM, and distinct catalog device matching.
3. Keep host FFT/band/publication tests passing; do not duplicate or retune the DSP for this board.
4. Generate device files in a fresh independent fixture with fictional inputs and fake secrets.
   Verify local ownership/update behavior and unchanged HA/assistant output for existing inputs.
5. ESPHome config and compile: existing Atom, Atom with strip, PDM without display, PDM with
   display, and the new PDM factory. Validate factory import tag as well as shared component refs;
   include shared-package files in version validation if factoring otherwise evades those checks.
6. Run catalog, translation, HA and rendering checks, plus `tools/check-all.sh` before a commit.
7. On the authorized bench, run the actual shared firmware: sound response, 31 finite spectrum
   bands, octave updates, rate switching, load and OLED maximum hold. Record firmware identity,
   duration and results; at least a 60-second run per rate. Do not call raw level evidence FFT
   acceptance or claim calibrated 20 Hz performance. Preserve a known working firmware for rollback.
8. Independent reviewer in a separate session/worktree examines compatibility, GPIO safety,
   tests and runtime evidence. Request docere-priv on the PR; human approval is separate.

## Website impact

Add the assembly to the shared device catalog and audio-sensor recommendations, with en/de/pl
descriptions and the reusable wiring/setup guide. Explain optional OLED and fixed PDM gain.
Keep the Atom guide and links working. Follow website-audit before merge/release, distinguish
unreleased support from available tags and verify links/catalog rendering. No private photos,
addresses, account names, local paths or bench logs enter the public framework.

## Out of scope and remaining uncertainty

No new FFT algorithm, arbitrary microphones, automatic pin discovery, OLED support on Atom,
qualified LED strip on the PDM assembly, calibrated SPL claim or microphone authenticity claim.
No production NAS/tablet deployment in this change. Their HA contracts remain shared; a later
installation rollout must assess both backend and visible Frame/Ramka behavior separately.

Implementation may resolve internal file names and test organization within this scope. A
contract change beyond this draft needs an amendment. L/R bias, runtime FFT evidence and actual
HA device metadata remain verification items, not established facts.
