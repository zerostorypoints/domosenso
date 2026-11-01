# SPEC-025: The music source contract and a Music page that follows it (audio-sensor, ramka, unreleased)

- Status: implemented on the branch claude/music-source-contract, 2026-11-01; to be prototyped on
  the maintainer's test instance (designed with the maintainer in conversation section by section).
- Source: the maintainer's feedback on SPEC-024's Music page: the music sensor cannot be changed or
  removed from the settings; settings that need a sensor's data (or one ability of it) show
  whatever is selected; the preview does not say that a visual without data falls back to Classic.
- Builds on: SPEC-024 (profiles, EQ, the Music page), SPEC-021 (live settings, seed and reset),
  SPEC-018 (the music aliases and the card). Its branch starts from SPEC-024's.
- No version bump: the release that carries it is the maintainer's call.
- Decisions are marked **Decision**. Inference is marked as such.

## Goal

1. A **contract** for a music source: what a consumer may read, what a producer must give, and
   which abilities are optional; checked by the interface, not by a firmware version.
2. **Abilities detected at run time** in Home Assistant, as entities a settings page can test.
3. A music sensor that can be **changed or set to none** from the settings page.
4. A **Music page** that shows a setting only when the selected visual uses it and the selected
   sensor can give what it needs; the sensor's own settings on a **sub-view** of their own.
5. A **preview** that says when the Ramka falls back to Classic, and why.
6. **Classic** as the default visual.

## The contract (audio-sensor)

**Decision:** consumers (the Ramka, any later component) read only the music aliases audio-sensor
renders, never a board's own entities. The aliases are the interface, version 1:

| alias | shape | ability |
|---|---|---|
| `sensor.music_spectrum` | 31 comma-separated dBFS values, third octaves 20 Hz to 20 kHz (`THIRD_OCTAVE` of `cards/lib/sources.js`) | `spectrum` |
| `sensor.music_level` | one number, dBFS | `level` |
| `sensor.music_spl_offset` | dB; attribute `calibrated` | `calibration` (with `level`) |
| `input_select.audio_sensor_music_spectrum_rate`, forwarded to the board's select with options eco, normal, fast | | `rate` |
| `sensor.music_mic_gain` | the board's gain, read only | `gain` |

A board **meets the contract** when it gives `spectrum` or `level`; the other abilities are
optional. A board is mapped to the aliases as today, by `sensors[].entities` (or the guessed ids),
so a board that is not this catalog's firmware meets it by giving the same shapes.

## Detecting abilities (audio-sensor)

**Decision (maintainer's choice A):** abilities are read from the selected board's entities at run
time, with no firmware change. The package adds:

- `sensor.music_source`: state the selected board's area, or `none`; attributes `interface: 1`
  and `capabilities`, a list of the abilities below. For cards and diagnosis.
- `binary_sensor.music_source_spectrum`, `_level`, `_rate`, `_calibration`: on while the selected
  board has the ability. Visibility conditions in Home Assistant test a state, not an attribute,
  hence one entity per ability.

Per ability, for the selected board:

- `spectrum`: its spectrum entity exists, and while it is available its state parses to 31 numbers.
- `level`: its level entity exists, and while it is available its state is a number.
- `rate`: its spectrum-rate select exists and its options include eco, normal and fast.
- `calibration`: `level` (the offset applies to the level).
- `gain`: its mic-gain entity exists (attribute only; nothing on the page depends on it but a row).

**Decision:** an ability is what the board can do, not whether it sends data now. A board that is
offline (its entities `unavailable`) keeps its abilities, so the page does not change while a board
restarts; the preview says that data is missing (below). An entity that does not exist (`unknown`
with no state object) is no ability.

Later, not in this spec: a board that publishes its interface (a text entity, say
`domosenso.music/1; spectrum, level, rate`) would be read in preference to the detection.

## The music source select (audio-sensor)

- Options: the boards of the inputs, the `music: true` board first, then input order, then
  **`—`** (no sensor). **Decision:** `—`, as the Ramka's EQ preset select: options of an
  input_select are not translated. A fresh helper takes the first option, the `music: true` board,
  as today. A home without a `music: true` board gets the select too, `—` first.
- `—` selected: `sensor.music_source` is `none` with no capabilities, every ability is off, the
  aliases are `unavailable` (the Ramka's card falls back to Classic, as it does today), the
  spectrum-rate automation sends nothing, and the board left goes back to normal (today's rule on a
  source change).
- A board that does not meet the contract stays an option (the options are fixed at render time,
  the abilities known at run time); the page says what it can do (below).
- Removing a board for good stays an edit of the inputs and a render.

## The Music page (ramka)

Two conditions drive it:

- **V**: the visual is `spectrum` or `level` (it needs a sensor).
- **A** (active): V, and the selected sensor has the visual's ability (`spectrum` for spectrum,
  `level` for level).

| place | row | shown |
|---|---|---|
| Basic | Music page on/off | always |
| Basic | Visual: classic, spectrum, level, with its (i) | always |
| Basic | Music sensor (the source select), with a line under it naming the sensor's abilities ("This sensor: spectrum, level, update rate, calibration" or "This sensor gives no data for a visual") | always |
| Basic | Sensor settings › (navigate to the sub-view) | sensor not `—`, and it has `rate` or `calibration` |
| Basic | Response profile, with its (i) | A |
| Basic | Palette | A |
| Basic | Advanced switch | always |
| Advanced | Flavour (the spectrum flavour with spectrum, the level flavour with level), line width | Advanced and A |
| Advanced | Profile settings: the selected profile's rise, fall, hold, tilt; the EQ preset select and the six ranges only with spectrum | Advanced and A |
| Advanced | Colour range: the neutral and hot pair of the current visual only | Advanced and A |
| right column | Preview, with the fallback notice | always |

**Decision:** the EQ is spectrum-only on the page, since it acts on the bands; its helpers and the
profiles' values stay as SPEC-024 defines them.

Gone from the page: the Calibration section and the Advanced "Music sensor" card; both move to the
sub-view. With Classic the page has four rows and the preview.

## The sensor sub-view (ramka)

**Decision (maintainer's choice A):** a Home Assistant sub-view (`subview: true`, its back arrow
returns to Music), reached by the navigate row; native, no dialog of our own.

| row | shown |
|---|---|
| Header: the board's area and its abilities | always |
| Preview, the Music page's | always |
| Update rate: eco, normal, fast, with its description | `rate` |
| Mic gain, read only; above Calibration; hides on `unavailable` and `unknown` | `gain` |
| Calibration: measured offset, note, Apply (today's rows) | `calibration` |
| Reset: the update rate only (a calibration is a measurement, not a preference) | `rate` |

Rule for later features: a setting of the sensor itself goes to the sub-view, with its ability; a
setting of a visual stays on the Music page, with V and A.

## The preview's notice (ramka)

Native conditional cards on the Music page, the sub-view and the Music tab of the preview dashboard:

| case | notice | the preview shows |
|---|---|---|
| V, sensor `—` | No sensor is selected: this visual cannot work. The Ramka shows Classic. | Classic |
| V, the sensor lacks the visual's ability | This sensor gives no spectrum (level) data. The Ramka shows Classic. | Classic |
| A, the alias `unavailable` | The sensor is offline: the Ramka shows Classic until data arrives. | Classic |
| A, data | none | the visual |
| Classic | none | Classic |

The Ramka itself is unchanged: its card falls back to Classic while the alias is unavailable; a
test pins that.

## Classic by default (ramka)

**Decision:** `input_select.<prefix>_music_visual` lists classic, spectrum, level; the seed and the
reset set classic. The input `music_visual` still turns the feature and its helpers on; it no
longer picks the starting visual. A home's own choice stays.

## Compatibility

- New entities: `sensor.music_source`, `binary_sensor.music_source_{spectrum,level,rate,calibration}`.
- `input_select.audio_sensor_music_source` gains `—` at the end (additive); the selection stays.
- `input_select.<prefix>_music_visual`: classic first (order only; the options are the same).
- The Music page's Calibration section and Advanced "Music sensor" card move to the sub-view.
- New translation keys in en, de, pl. No flashing, no registry edit.
- UPGRADE.md of both components lists the above.

## Tests

- Ability sensors: 31 numbers, another count, `unavailable`, a missing entity, a select without
  `fast`, the source `—`.
- The Music page and the sub-view: each row's conditions over visual (classic, spectrum, level) x
  sensor (none, level only, full) x Advanced (on, off).
- Each notice case; Classic in the seed and the reset; the card's fallback with an unavailable alias.
- `tools/check-all.sh`; then the prototype on the test instance, looked at on the tablet.

## Amendment 1 (2026-11-01): Live visualization

- Source: the maintainer liked the sensor sub-view and asked to slim the Music page further:
  everything of the sensor-driven visual on its own sub-view, a switch instead of "classic" in the
  dropdown (`.superpowers/live-visualization-brief.md`).
- **Decision:** a new `input_boolean.<prefix>_music_live` (Live visualization), no `initial:`, a
  setting of page `music`, group `music_visual`, default off. Off is Classic on the Ramka and in
  every preview; on, the select's visual. `input_select.<prefix>_music_visual` holds `spectrum`
  and `level` only, the input's first (the default); `classic` is no option. This replaces "Classic
  by default" above: the switch's default off is that default.
- **Decision:** the now-playing card gets `visual.live` (an entity id): the visual only while it is
  `on`, the own wave otherwise. The Ramka dashboard and the preview's frame bind it. The
  ambient-wave-card's own fallback is unchanged.
- **Decision:** V is Live on; A is Live on and the selected sensor has the visual's ability; the
  notices carry V too (no notice while Live is off).
- **The Music page:** the page switch, the Live switch, "Live visualization ›" (always, the switch
  off too), a note while the switch is off ("the Ramka shows the Classic wave"), the render-time
  inputs, the Reset (page `music`: the two switches). No Advanced switch: the page has no Advanced
  part.
- **The Live visualization sub-view** (`music-live`, `subview: true`, back to `/<settings path>/music`),
  in order: the Preview (both columns: the notice and the preview; with Live off the Classic note);
  the Music sensor widget, always (the source select, the abilities line, "Sensor settings ›" as
  before); the Visualization widget with V (the mode select with its (i) for spectrum and level,
  the spectrum flavour with spectrum, the Advanced switch); the Colour range (Advanced and A); the
  "Advanced: response profile" widget (Advanced and A), one card: the profile select, then each
  profile's rise, fall, hold, tilt, EQ preset and six gains as conditional rows on the select (the
  EQ rows also on the spectrum); the Reset (page `music_live`).
- **Decision:** the flavour selects offer spectrum `dune`, `halo`, `bars` and level `centre`, plus
  the home's own `music_visual_options` flavour when it is another (first, as the default). The
  level has no flavour row; the line width and the palette no row (helpers and bindings stay).
- **Decision:** the settings of groups `music_visual` (but the Live switch), `music_look` and
  `music_profiles` move from page `music` to page `music_live`.
- The sensor sub-view's back arrow returns to Live visualization.
- Migration: a home starts with Live off (Classic); one that used spectrum or level turns it on
  once. A restored `classic` select state is no option; Home Assistant takes the first one.
- Tests: the Music page's rows (Live on and off); the sub-view's rows over Live x visual x sensor x
  Advanced, with a missing entity read as unknown and unavailable; the links and back paths per
  language; the flavour options with a home's own; no classic option; the card's own wave with Live
  off; the reset pages.

## Out of scope

- A board publishing its own interface (above, later).
- Choosing a sensor per view, or two sensors at once.
- Firmware changes.
