# SPEC-024: Music response profiles, climate widgets and the settings pages' polish (ramka, audio-sensor, unreleased)

- Status: approved 2026-10-31 by the maintainer, in conversation, round by round after prototypes
  on the maintainer's test instance, each looked at on the wall tablet and accepted before the next.
  This spec records what the branch implements; the README and UPGRADE notes of both components are
  the reference for each detail.
- Source: catalog issue #112 (a sensor near the speakers sees a different spectrum) and a research
  pass on sensor placement (2026-10-31), then the maintainer's design: whole reaction behaviours to
  compare by eye, an EQ in the picture, and no firmware change. Later rounds of the same review
  added the climate widgets, named colours, page headers, the Controls page and the full preview.
  This spec restates the contract for any home; the examples are the demo home's.
- Amends: SPEC-018 (the card gains `dynamics.eq` and `look`), SPEC-021 (new settings groups and
  pages; the Music page's layout; the preview dashboard of its amendment 1 follow-up).
- No version bump: the release that carries it is the maintainer's call.
- Decisions this spec adds are marked **Decision**. Inference is marked as such.

## Goal

A home gets:

1. **Response profiles** for the music visual: Custom plus four templates (Behind speakers, Lively,
   Calm, Analyser), each a bundle of rise, fall, hold, tilt and a six-range EQ, picked on the
   settings page and seen on the tablet at once; every profile editable, keeping its own values.
2. **EQ presets** to load into the selected profile: flat, a measured near-speaker curve and its
   half, four curves derived from WLED-MM's frequency profiles, three named looks, and the home's
   own calibrated curve; each with a tooltip that says what it does and names its curve.
3. A **colour range** that is the user's whichever profile is on.
4. **Climate widgets** with types, a per-widget settings dialog and threshold colours that share
   the Air page's limits and colours.
5. **Named colours** in every colour choice, as dropdowns with a dot per colour.
6. A **header** on every settings page, a **Controls** page for the near settings, and a **preview
   dashboard** with every screen, on by default.

## The card (audio-sensor)

- `dynamics.eq: {sub, bass, low_mid, mid, presence, air}`: dB per range, each a number or an
  entity (−18…+12, clamped; absent or unavailable is 0). Range centres 31.5 Hz, 80 Hz, 315 Hz,
  1 kHz, 4 kHz, 12.5 kHz; a band's gain is interpolated linearly on log frequency between the two
  neighbouring centres, the ends held. Applied where `tilt` is, before the colour mapping, for the
  spectrum only; the tooltip's loudest band keeps its measured dB. All zeros is the picture of
  before, exactly.
- `look: <sensor>`: the sensor's attributes (`rise`, `fall`, `hold`, `tilt`, `eq`, and the card's
  `spectrum` / `level` windows) override the options they name; an unavailable sensor or an invalid
  attribute leaves the configured option.
- **Decision:** the EQ lives in the card, not in the `sensor.music_spectrum` alias (#112's first
  idea) nor in the firmware. Only the picture changes: the spectrum, the level, the SPL calibration
  and any automation keep what the microphone hears, and Home Assistant renders no 31-value template
  twelve times a second.
- **Decision:** six ranges, not 31 band gains: a curve cannot become jagged, six sliders fit a
  settings page, and both the measured near-field differences and the community's profiles are
  smooth at that resolution.

## The profiles (ramka)

`input_select.<prefix>_music_template` (`custom`, `behind_speakers`, `lively`, `calm`, `analyser`)
picks one; `sensor.<prefix>_music_look` carries the selected profile's values in the card's `look`
shape (rise, fall, hold, tilt, eq; a select state that is no id is Custom) and every visual card of
the Ramka binds it.

| profile | EQ it starts from | tilt | rise ms | fall s | hold s | after |
|---|---|---|---|---|---|---|
| Custom | flat (Custom's own helpers, ids of before) | on | the home's `music_visual_options` | | 1.5 | the home's tuning |
| Behind speakers | `fitted` once not flat, else `behind_speakers` | on | 100 | 2 | 1.5 | a near-speaker correction |
| Lively | `wled_big_speakers_ics` | off | 50 | 0.3 | 0.5 | WLED Vivid, Govee Dynamic |
| Calm | `wled_big_speakers` | on | 80 | 4.2 | 2.0 | WLED Lazy, Govee Calm |
| Analyser | `flat` | off | 0 | 0.5 | 1.0 | MSGEQ7 analysers, peak programme meters |

- **Every profile is editable** and keeps its own ten values: Custom its helpers of before, each
  template ten new ones (`input_number.<prefix>_music_<id>_{rise_ms,fall_s,hold_s,eq_<range>}`,
  `input_boolean.<prefix>_music_<id>_tilt`, group `music_profiles`), seeded from its row and
  restored by the Music page's Reset. Choosing a profile writes none of them.
- **Decision:** no profile carries the colour window. The four neutral and hot dB helpers stay the
  user's whichever profile is on (the "Colour range" card): the window depends on the room's level
  and the user's taste, not on a reaction style, and switching profiles must not move it.
- Each profile's purpose, best use and why / when is an (i) tooltip on the select
  (`custom:ramka-info-select-row`), in en, de and pl.
- On `fast` a frame arrives every 85 ms: a rise under that acts as a jump (Analyser's 0 is
  deliberate). The card's fall is the time to cover about 90 % of a drop.

## The EQ presets (ramka)

`input_select.<prefix>_music_eq` and `script.<prefix>_music_load_eq` (field `preset`) load a
preset's six gains into the selected profile's EQ; "Apply the selected preset" loads it again.

| preset | sub | bass | low_mid | mid | presence | air | origin |
|---|---|---|---|---|---|---|---|
| `flat` | 0 | 0 | 0 | 0 | 0 | 0 | what WLED's "Generic Line-In" and an MSGEQ7 analyser show for a clean source |
| `behind_speakers` | −5 | −10 | −3 | 0 | +3 | +2 | one measurement: a sensor on an amplifier between the speakers against the listening position |
| `half_match` | −2 | −5 | −1 | 0 | +2 | +1 | half of it: some of the near-field punch kept |
| `wled_big_speakers` | −4 | −2 | −5 | 0 | +1 | +2 | WLED-MM "INMP441 – big speakers, strong bass" |
| `wled_big_speakers_ics` | −3 | −4 | −4 | 0 | +2 | −1 | WLED-MM "ICS-43434 – big speakers" |
| `wled_pink` | −2 | +1 | +2 | 0 | +2 | +4 | WLED's default pink-noise correction |
| `bass_light` | −8 | −6 | 0 | 0 | 0 | 0 | rumble and hum guard; WLED's ~90 Hz microphone high-pass as a gentle EQ |
| `voices` | −6 | −8 | −2 | +3 | +4 | 0 | dialogue over a film score |
| `sparkle` | −3 | −3 | 0 | 0 | +3 | +5 | the highs a cabinet shadows |
| `fitted` | 0 | 0 | 0 | 0 | 0 | 0 | flat until the home's pink-noise calibration sets it |

- **Decision (amended the same day):** `behind_speakers` and `half_match` ship the measured curve
  rather than flat, on the maintainer's request. A flat "Behind speakers" did nothing until a home
  measured, and few homes have a measurement set-up (inference); one measurement points the right way (less bass, a little more presence and air, the same
  direction as WLED-MM's big-speaker profiles and as loudspeaker-boundary practice) and is a
  starting point. It came from one film with a possible volume change, so a home with a same-clip
  A/B measurement sets its own.
- The input `music_eq_presets` replaces `behind_speakers`, `half_match` or `fitted` with the home's
  curve, as a whole (a key left out is 0; `{behind_speakers: {}}` is flat). An unknown preset or
  range key, or a value outside −18…+12, fails the render. The catalog's other presets are not
  overridable.
- `fitted`: pink noise from an undistorted source for 2–3 minutes, a profile's EQ adjusted until
  the bands sit level at 50–75 % of the window (WLED-MM's calibration), the values copied into
  `music_eq_presets.fitted`. Once not flat, Behind speakers starts from it.
- **The WLED curves.** WLED-MM's profiles are multipliers on FFT magnitude for 16 channels (centres
  ≈ 65 Hz to 8.2 kHz). Each curve is 20·log10(profile / "Generic Line-In"), set to 0 dB on the mean
  of the four mid channels (689–1658 Hz), averaged into the ranges (bass: channels 0–1; low_mid 2–5;
  mid 6–9; presence 10–14; air 15) and rounded to 1 dB; `sub` takes channel 0, as WLED has nothing
  below 43 Hz. Source: MoonModules WLED-AudioReactive-Usermod, `audio_reactive.h`. The profiles were
  tuned for I2S microphones; on the board's analog MSM381 they carry the community's placement
  intent, not a calibration.
- Each preset's (i) tooltip says what it does, its best use, why / when and its curve ("Curve: sub
  −5 dB, bass −10 dB, …"), built at render time from the table with the home's `music_eq_presets`;
  a flat curve says so, `fitted` that it waits for the home's curve.

### Why the placement matters (the research)

The board's 31 bands are correct anywhere; the placement changes the room's transfer function,
not the sensor's timing. Near the speakers the level rises by a few dB at 1 m and about 10 to
13 dB at 0.3 m, most of it in the bass (boundary gain), the mids barely change and the highs drop
a little (cabinet shadow). The direct sound dominates the reverberant tail, so the picture looks
punchier. It is not lower latency: a few metres closer saves under 10 ms of a sound-to-screen time
near 280 ms. Headroom is the one effect on the board, handled by the existing `mic_gain`
substitution; the firmware stays as it is. One omnidirectional microphone cannot leave room voices
out. Sources and figures: audio-sensor's README, "Placement" (inference is marked there).

## The settings page (ramka)

- **Music**: Basic (the page switch, visualization, palette, the response profile with its (i), the
  Advanced switch); Advanced (one "Music sensor" card with audio-sensor's music source and update
  rate, the flavours, the line width); the Preview across both columns; then, while Advanced is on,
  **Profile settings** (one card per profile, shown while it is selected: rise, fall, hold, tilt,
  the EQ preset select with its (i), "Apply the selected preset", the six ranges) and the **Colour
  range**; the Calibration. The redraw rate has no row (its helper and binding stay). The page's
  Reset restores everything on it, every profile included.
- **Headers**: every page but About starts with its title, what its view shows, what it is for and
  when it is on the screen (General: the Ramka as a whole), and, with the preview, a link to the
  preview's tab of the same path (`preview_paths` names the preview per language).
- **Controls** (between Calendar and Music): "Controls on approach" (Basic), the near distance and
  time and how long the controls stay up (Advanced), moved from General with the same helpers; the
  reset's `page: controls` sets these four.
- **Colours**: one list of named colours (`cards/lib/colours.js`: green, teal, blue, light blue,
  purple, pink, magenta, amber, orange, red, grey), each a series colour of the theme, so it follows
  the theme mode. The Air page's three colours (`input_select.<prefix>_air_color_{good,fair,poor}`,
  green, amber, red) and Climate's neutral colour pick from it through
  `custom:ramka-colour-select-row`, a dropdown with the colour's dot before each name. The Air
  levels read good, fair, poor; the helper ids stay.

## Climate widgets (ramka)

- A number of widgets (Climate, Advanced, default 10, 1 to 20), reordered by drag and drop or up
  and down buttons. Types: **Temperature** (temperature and humidity), **Air quality** (CO₂ and
  PM2.5), **Custom** (any two sensors with a unit, a state class or a numeric state) and **Empty**
  (a spacer tile). An entry without a type reads as Temperature when its sensor's device class is
  temperature, else Custom, so existing lists keep every room.
- A settings dialog per widget: Temperature its comfort ranges (default 20–24 °C, 40–60 %); Air
  quality the Air page's own CO₂ and PM2.5 limits (the same helpers); Custom a named colour.
- **Threshold-based colours** (`input_boolean.<prefix>_climate_thresholds`, default off): below,
  within and above a comfort range blue, neutral and red; Air quality the Air page's three colours,
  so both views agree. **Decision:** the series colours leave out blue, amber, red, orange and light
  blue, so a widget's own colour is never read as a threshold.

## The preview dashboard (ramka)

`dashboards/ramka-preview.<lang>.yaml`, for admins: one tab per screen the component has, always
(climate, air, plants, photos, status, calendar, controls, music), each with the Ramka dashboard's
own cards in a frame of `screen`'s size (`custom:screen-frame-card`) and a link to its settings
page. A screen the render left out says which input adds it; a screen switched off has a banner.

- **Decision (amended the same day, on the maintainer's request):** `preview_dashboard` defaults
  to true. Seeing a setting's
  effect on a screen that is not in the rotation right now is what the settings pages are for, and
  the preview is how an admin does that. A home adds the `lovelace:` entry (until then `domosenso
  status` prints `missing-dashboard-entry` for each file) or sets the input to false.

## Considered and dropped

- **A blind audition** (a timer stepping through the templates during playback, logged only, with
  a "keep this one" button): dropped on the maintainer's review after the first deploy, with its
  helpers, scripts, automation and texts. Switching by hand, with the tooltips, does the comparing;
  that the machinery was too much for a choice made once is inference.
- **Read-only templates and "Copy to custom"**: the first design kept the templates fixed and
  copied one into Custom to tune it. Superseded on review by editable profiles: each keeps its own
  values, so a template is tuned in place and no copy is needed.
- **Half match and Cinema as profiles**: dropped in the prototype session on the wall tablet, to
  keep a short list of clearly different choices. Their EQ presets (`half_match`, `voices`) stay,
  to load into any profile.
- **Also dropped from the first draft**: "Near-field raw" (Custom with tilt off and a 3 dB higher
  window), "WLED Normal" (between Custom and Behind speakers), PPM Type I
  and II (merged into Analyser), Fitted as its own profile (Behind speakers uses it once set).
- **The colour window in a profile**: the first design bundled neutral and hot into each profile,
  so switching profiles moved the user's window. Dropped on review (above).
- **A placement select with a per-band correction in the `sensor.music_spectrum` alias** (#112):
  replaced by the card's EQ (above). **A firmware gain select**: not needed; the existing `mic_gain`
  covers a loud test that clips.
- **AGC or squelch emulation**: the board has a fixed gain and no gate; the colour window does that
  job.

## Compatibility

- Additive for a home: the profiles need `music_visual`; Custom keeps its helper ids, so its tuning
  stays, and the visual looks as before until another profile is chosen. A home that called
  `script.<prefix>_music_copy_to_custom` (unreleased only) removes the call.
- The look needs the audio-sensor card with `look` and `dynamics.eq`; an older card ignores both.
  Update the two components together.
- The measured `behind_speakers` default reaches a profile's helpers only through a fresh seed or a
  Reset; a home that wants the flat curve of before sets `music_eq_presets.behind_speakers` to all
  zeros.
- `UPGRADE.md` entries in both components (Unreleased).

## Tests

- `node --test`: the card's EQ (flat equals no EQ, a centre gets the full gain, monotonic between
  centres, clamping, entity binding, unavailable entity) and `look` (overrides, absent attribute,
  unavailable sensor); the info-select and colour-select rows; the climate widgets' cards.
- pytest `tests/test_ramka_render.py`: the profiles' helpers, seed and reset; the look sensor per
  profile; the loader writes the selected profile; `music_eq_presets` validation and replacement;
  the preset table equal in the package and the settings page; the tooltips name each curve; the
  measured default and a home's flat override; the preview on by default and off with false; every
  setting on a page and reset (the standing rule).
- `catalog_check --strict`; the translations in en, de and pl.

## Out of scope

Any firmware change (gain, AGC, squelch); EQ sliders in the card's own console; an on-screen
profile label; a per-band correction in `sensor.music_spectrum`; a placement select.

## Open questions

- The `behind_speakers` curve comes from one film with a possible volume change; a same-clip A/B
  at the listening position and the near spot, at three volumes, would refit it (inference until
  then). A band whose difference varies more than about 3 dB between runs should not get a fixed
  correction.
- Whether a silence test on an amplifier shows hum that justifies a stronger `sub` cut in
  `bass_light`.
