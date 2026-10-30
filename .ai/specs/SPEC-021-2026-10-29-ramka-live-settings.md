# SPEC-021: Ramka live settings (ramka 0.4.0, audio-sensor 0.1.0)

- Status: approved 2026-10-29 by the maintainer, after a revision on the maintainer's review (settings
  pages, Basic and Advanced, page switches, the Controls tile removed, the standing rule); issue #86,
  phase 2 in #87–#90
- Source: the maintainer's design, approved in conversation (2026-10-29), after the wall check of
  SPEC-018's music visual: tuning the visual meant an inputs change, a render and a deploy for each
  value tried. Also covers issue #51 (the tuning sliders start at their minimum on a first install).
- Amends: SPEC-018 (the music-source select and the calibration helpers in `audio-sensor`; the
  Ramka's Controls tile removed; `music_visual_options` becomes the visual's starting values
  instead of literal card options). Both versions are unreleased, so this spec changes 0.4.0 and
  0.1.0 in place; no bridge.
- Decisions this spec adds to the approved design, each forced by the code or left open by the
  review, are marked **Decision**. Inference is marked as such.
- Later, each with its own issue on this page structure and the standing rule: photo album
  settings, air quality settings, a calendar by URL, background settings (Follow-up issues).

## Goal

A home gets:

1. every behaviour setting of the Ramka as a helper its automations and cards read live, changed on
   a page in Home Assistant and seen on the tablet at once, without an inputs change, a render or a
   deploy;
2. a switch per Ramka view (climate, air, plants, photos, status, calendar, music) that takes the
   view in or out live, inside the limit of what the render configured;
3. sensible values on a first install: a one-shot seed sets every helper to its default at the first
   start, and "Reset to defaults" (per page, and globally) runs the same seeding later; a home that
   already runs the Ramka keeps its tuned values when it moves to 0.4.0;
4. one admin dashboard, "Ramka settings", per language, with one page per view plus General, each
   page in Basic and Advanced parts;
5. with `audio-sensor`: which board feeds the music visual, and that board's calibration, from the
   Music page.

Settings live only in Home Assistant: the tablet's Controls page keeps no settings tile of 0.4.0.

## Devices

No change: the Ramka's tablet and radar, and with the visual one `audio-sensor` board or more
(SPEC-018).

## Integrations

No new integration. `input_number`, `input_select`, `input_boolean`, `input_text`, `script`,
`automation`, `frontend` (`frontend.set_theme`) and the Lovelace YAML dashboards are core. The home
adds one `lovelace: dashboards:` entry by hand (it lives in the home's `configuration.yaml`, which
the catalog does not render; Artifacts).

## Inputs

### ramka

| name | type | default | example (demo home) |
|---|---|---|---|
| `settings_defaults` (new) | `{near_enabled?: bool, near_cm?, near_s?, controls_hold_s?, off_delay_s?, brightness_min?, brightness_max?, lux_max?, theme_mode?: dark \| light}` | `null` | `{off_delay_s: 600}` |
| `music_visual_options` (changed meaning) | SPEC-018's keys, plus `fps?` | `null` | `{level: {flavour: tide}}` |

- **Decision: `settings_defaults`, one optional flat map.** The General page's defaults get an input
  in the smallest form: a map keyed by the helper's suffix, every key optional, absent keys keep the
  catalog's values (Provides). It is what the seed and the reset write, so "Reset to defaults"
  returns a home to its own baseline, and it is what issue #51 asked for (its `tuning:` block). The
  page switches have no default input: they start `on`, and the render-time inputs are their outer
  limit. Render-time checks (`fail()`): an unknown key → `ramka: settings_defaults: unknown key
  '<key>'`; a number outside its helper's range → `ramka: settings_defaults.<key> must be within
  <min> and <max>`; `brightness_min` above `brightness_max` → `ramka: settings_defaults:
  brightness_min above brightness_max`.
- **`music_visual_options` now gives starting values.** Its keys and shape stay SPEC-018's, with
  `fps` added; their values go into the seed and the reset of the music-visual helpers, no longer
  into the card configs, which bind the helpers. Absent keys take the card's defaults, and the line
  width Ramka's 2.8 px.
- **Decision: `music_visual_options` values are checked at render**, since each must fit a helper:
  a flavour not of its kind → `ramka: music_visual_options.<kind>.flavour '<flavour>' is not a
  <kind> flavour`; a palette other than `zones`, `series`, `calm` → `ramka:
  music_visual_options.palette must be zones, series or calm`; a number outside its helper's range →
  `ramka: music_visual_options.<key> must be within <min> and <max>`; `hot` not above `neutral` for a
  kind (the card would reverse its palette and fall back to its defaults, `orderColour`) → `ramka:
  music_visual_options.<kind>: hot must be above neutral`. A palette as a list of colour stops, which
  the card accepts, cannot be a select option; 0.4.0 is unreleased, so it is refused rather than
  bridged.
- The render-time inputs that make a view present (`climate`, `air`, `plants`, `photo_dir`,
  `status_page`) keep their meaning: they are the outer limit of the page switches.

### audio-sensor

No new input. `sensors[].music` keeps its meaning: at most one board, checked at render
(`two music sensors: <room>, <room>`), and it is the music-source select's default.

## Provides

### ramka: the settings helpers

Every helper below has no `initial:` (Home Assistant would reset it at every restart) and is
restored across restarts. Ranges of the presence and display helpers are 0.3.0's, unchanged. "Part"
is where the helper sits on its page; "group" is what the seed handles together (Seeding).

| entity | range, options | default | page, part | group | stability |
|---|---|---|---|---|---|
| `input_boolean.<prefix>_near_enabled` | | `on` | General, Basic | presence_display | stable |
| `input_number.<prefix>_off_delay_s` | 10–1800 s, step 10 | 300 | General, Basic | presence_display | stable |
| `input_number.<prefix>_brightness_min` | 1–255, step 1 | 16 | General, Basic | presence_display | stable |
| `input_number.<prefix>_brightness_max` | 1–255, step 1 | 204 | General, Basic | presence_display | stable |
| `input_number.<prefix>_near_cm` | 10–400 cm, step 10 | 100 | General, Advanced | presence_display | stable |
| `input_number.<prefix>_near_s` | 1–10 s, step 1 | 1 | General, Advanced | presence_display | stable |
| `input_number.<prefix>_controls_hold_s` | 1–600 s, step 1 | 5 | General, Advanced | presence_display | stable |
| `input_number.<prefix>_lux_max` | 20–2000 lx, step 10 | 200 | General, Advanced | presence_display | stable |
| `input_select.<prefix>_theme_mode` (new) | `dark`, `light`, the default first | `dark` | General, Basic | pages | stable; options additive-only |
| `input_boolean.<prefix>_settings_advanced` (new) | | `off` | General (and Music), Basic | pages | stable |
| `input_boolean.<prefix>_page_<view>` (new), `<view>` in `climate, air, plants, photos, status, calendar, music` | | `on` | that view's page, Basic | pages | stable |
| `input_select.<prefix>_music_visual` (0.4.0, SPEC-018) | `spectrum`, `level`, `classic`, the input's first | the input's | Music, Basic | music_visual | stable |
| `input_select.<prefix>_music_palette` | `zones`, `series`, `calm` | `series` | Music, Basic | music_visual | stable; options additive-only |
| `input_select.<prefix>_music_spectrum_flavour` | the card's spectrum flavours | `dune` | Music, Advanced | music_visual | stable; options additive-only |
| `input_select.<prefix>_music_level_flavour` | the card's level flavours | `centre` | Music, Advanced | music_visual | stable; options additive-only |
| `input_number.<prefix>_music_rise_ms` | 0–2000 ms, step 10 | 200 | Music, Advanced | music_visual | stable |
| `input_number.<prefix>_music_fall_s` | 0–30 s, step 0.1 | 4 | Music, Advanced | music_visual | stable |
| `input_number.<prefix>_music_line_width_px` | 0.5–12 px, step 0.1 | 2.8 | Music, Advanced | music_visual | stable |
| `input_boolean.<prefix>_music_tilt` | | `on` | Music, Advanced | music_visual | stable |
| `input_number.<prefix>_music_spectrum_neutral_db` | 0–130 dB, step 1 | 30 | Music, Advanced | music_visual | stable |
| `input_number.<prefix>_music_spectrum_hot_db` | 0–130 dB, step 1 | 70 | Music, Advanced | music_visual | stable |
| `input_number.<prefix>_music_level_neutral_db` | 0–130 dB, step 1 | 30 | Music, Advanced | music_visual | stable |
| `input_number.<prefix>_music_level_hot_db` | 0–130 dB, step 1 | 70 | Music, Advanced | music_visual | stable |
| `input_number.<prefix>_music_fps` (new) | 1–60, step 1 | 30 | Music, Advanced | music_visual | stable |

The music-visual helpers exist only with `music_visual`; every other helper above exists in every
home. Other entities this spec adds:

| entity | note | stability |
|---|---|---|
| `input_boolean.<prefix>_settings_seeded` | the seed's one-shot flag | stable |
| `sensor.<prefix>_ambient_pages` | state: the number of ambient pages in the rotation now; attribute `pages`: their list in rotation order; `component: ramka` | stable |
| `script.<prefix>_settings_reset` | fields `page` and `groups`, both optional | stable |
| automation `<prefix>_settings_seed` | on Home Assistant start | stable |
| automation `<prefix>_theme_mode` | on start and on a change of the theme mode | stable |

Helpers that are state rather than settings stay off the pages: `input_select.<prefix>_mode`,
`input_select.<prefix>_ambient`, `input_boolean.<prefix>_ambient_music` (the swipes flip it; the seed
sets it `on` with the presence_display group and the global reset does too), `input_text.<prefix>_photo`,
`input_button.<prefix>_reload`, `timer.<prefix>_controls`, `input_boolean.<prefix>_settings_seeded`.

The defaults are the catalog's; `settings_defaults` (General) and `music_visual_options` (Music)
override them per home.

- **Defaults checked against the template.** The presence and display values are the ones
  `templates/package.yaml.j2:72-74` documents; README's `off_delay_s` note (300 s) agrees. The
  defaults of `near_enabled` and `ambient_music` are inferred from the template's comments ("the
  now-playing card (default)"; controls on approach as the radar's purpose). The music values are
  the card's (`DEFAULTS`, `DEFAULT_FLAVOUR`, `DEFAULT_COLOUR` in
  `components/audio-sensor/cards/lib/config.js`, `fps` 30 there), except the line width, Ramka's
  2.8 px (SPEC-018).
- **Decision: where presence and display sit.** The review placed no page for them; they go to
  General, the tablet as a whole. Basic holds what a home changes in its first week (approach on or
  off, off delay, brightness); Advanced the radar's and the light sensor's fine tuning.
- **Decision: helper ids.** `music_` after the prefix groups the visual's helpers, `page_` the view
  switches; a unit suffix (`_ms`, `_s`, `_px`, `_db`) as on the existing `_near_cm` and
  `_off_delay_s`.
- **Decision: ranges of the music helpers** are the card's own: the console sliders
  (`cards/lib/console.js`: rise 0–2000 ms step 10, fall 0–30 s step 0.1, line width
  `LINE_WIDTH_RANGE` 0.5–12 px step 0.1, spectrum neutral and hot 0–130 dB) and `fps` 1–60 (the
  check in `ENTITY_OPTIONS`). The level's dB range is the spectrum's: the level is dB SPL too.
- **Decision: the selects list their default first**, then the rest in the card's registry order
  (`SPECTRUM` and `SCALAR` in `cards/lib/flavours/index.js`, `NAMED_PALETTES` in `config.js`), as
  `input_select.<prefix>_music_visual` does: a fresh select is right even before the seed runs.
  Spectrum: `still, swell, dune, veil, voices, halo, afterglow, bars`; level: `still, tide, centre,
  timeline, clocks, ripples, tint, bars`. Ramka's render cannot read audio-sensor's files, so the
  lists are literal in the template and a test pins them to the registry. A flavour the card later
  drops reads as the kind's default (`resolveOptions`).
- **Decision: the template's fallbacks equal the defaults.** Today the package's `| int()` /
  `| float()` fallbacks disagree with the documented values (`off_delay_s | int(120)`,
  `controls_hold_s | int(15)` in one place and `int(5)` in another, `near_s | int(3)`,
  `near_cm | float(50)`, `brightness_min | float(20)`, `brightness_max | float(255)`). They become
  the home's defaults, from one rendered table that the seed, the reset and the fallbacks share.

### ramka: page switches

`input_boolean.<prefix>_page_<view>` takes a view in or out live. **The render is the outer limit**:
a view the render left out (its input absent, or `status_page: false`) stays out whatever its switch
says; the switch only removes a view the render has. **Decision: all seven switches exist in every
home**, configured or not, so the set of ids does not depend on the inputs and a view configured
later finds its switch already `on`.

- **Ambient pages** (`climate`, `air`, `plants`, `photos`, `status`).
  `sensor.<prefix>_ambient_pages` lists the rendered pages whose switch is `on`, in rotation order.
  **Decision: it is never empty**: with every switch off it lists the first rendered page and sets
  the attribute `all_off: true`, which the General page shows as a warning, so ambient never has
  nothing to show.
  - The loop (`script.<prefix>_ambient_loop`) keeps one stage per rendered page; at the end of a
    stage it goes to the next page of the live list instead of the rendered `after(page)`. Its guard
    "a page this home has not" (today only with fewer than five pages) is always rendered and reads
    the live list: a page not in it goes to the list's first.
  - `script.<prefix>_ambient_next` / `_ambient_prev` step through the live list (today's template
    branch, now always; the plain `select_next` branch for five pages goes). `script.<prefix>_swipe_up`
    goes to the live list's first page.
  - **Decision: a switch turned off while its page shows takes effect at the end of that stage**
    (at most 50 s, the photos' five slots), or at once with a swipe. No extra automation; the
    sections' visibility does not read the switches, so the screen never goes empty mid-stage.
- **Music** (`page_music`): off, `binary_sensor.<prefix>_music_view` stays `off` (its template gains
  the switch), so ambient shows the rotation while the player plays and a swipe down on the controls
  leaves to the rotation.
- **Calendar** (`page_calendar`): off, the calendar tiles on the controls hide (a visibility
  condition on the switch) and `script.<prefix>_show_calendar` stops at a condition on it. The
  calendar input is required, so this view is always configured.
- **Decision: the Controls page is no view of its own** and has no switch: it is how the tablet is
  used, and every setting it shows is on General.

### ramka: the music visual binds the helpers

The two `visual:` configs of the now-playing card (SPEC-018) name a helper for every option:

```yaml
visual:
  select: input_select.ramka_music_visual
  spectrum:
    type: custom:ambient-wave-card
    source: {kind: spectrum, entity: sensor.music_spectrum, offset: sensor.music_spl_offset}
    active: binary_sensor.ramka_media_playing
    fallback: classic
    flavour: input_select.ramka_music_spectrum_flavour
    fps: input_number.ramka_music_fps
    colour:
      palette: input_select.ramka_music_palette
      neutral: input_number.ramka_music_spectrum_neutral_db
      hot: input_number.ramka_music_spectrum_hot_db
    dynamics:
      rise: input_number.ramka_music_rise_ms
      fall: input_number.ramka_music_fall_s
      tilt: input_boolean.ramka_music_tilt
    style: {line_width: input_number.ramka_music_line_width_px}
  level:
    # the same with kind scalar, entity sensor.music_level, the level flavour and the level dB pair;
    # tilt is bound too, as today, and the card reads it for a spectrum only
```

- **Which options are entity-valued, read from `config.js`.** `ENTITY_OPTION` accepts `input_number`,
  `input_select`, `input_boolean`, `number`, `select` and `sensor` ids, and `ENTITY_OPTIONS` lists
  every option bound here: `flavour` (choice), `colour.palette` (choice, `NAMED_PALETTES`),
  `colour.neutral`, `colour.hot`, `dynamics.rise`, `dynamics.fall`, `style.line_width` (number, within
  `LINE_WIDTH_RANGE`), `fps` (number, 1–60) and `dynamics.tilt` (boolean). `normaliseConfig` skips its
  literal checks for an entity value and `resolveOptions` reads the states on every update. **No card
  change is needed.** Inference to check in the card test: the card reads a changed `fps` on the
  next update without being recreated (it resolves options per update; whether its frame timer
  follows is not read here).
- What the card does with an unusable state (from `config.js`, unchanged): `unknown`,
  `unavailable`, missing or out of range gives that option's card default, so the line width falls to
  the card's 4 px, not 2.8 px (only while a helper does not exist: a restored or fresh `input_number`
  always has a number); a flavour not of the kind gives the kind's default; hot at or below neutral
  gives the kind's dB pair (`orderColour`). The page does not stop a person from setting hot below
  neutral; the visual then shows the defaults until it is corrected, and the README says so.
- The palette stays one select for both kinds, and rise, fall, line width, tilt and fps one helper
  each for both, as `music_visual_options` already groups them (SPEC-018).

### ramka: theme mode

`input_select.<prefix>_theme_mode` (`dark`, `light`); automation `<prefix>_theme_mode`, on Home
Assistant start and on a change of the select, calls `frontend.set_theme` with `name:
ramka-<mode>`, once without `mode` and once with `mode: dark`, so both of the server's default-theme
slots carry it. `themes/ramka.yaml` gains `ramka-dark` and `ramka-light`: each the series colours of
its mode (today's `modes:`) plus the base colours of that mode, without `modes:`, so the theme sets
the look whatever the browser's own dark-mode setting is.
**Amendment (2026-10-29, ruling C19):** each theme holds `modes:` with its one mode only (the
series colours of that mode, no base colours), because the frontend forces a single-mode theme into
that mode and applies its own defaults (home-assistant-frontend 20260826.7,
`src/state/themes-mixin.ts`), while copied base colours would go stale with every frontend update.

- **The limit, stated:** `frontend.set_theme` sets the server's default theme. It reaches every
  browser and every user whose profile theme is "Backend-selected", on every dashboard, not only the
  tablet. A user who picks a theme in the profile is not affected.
- **Decision: no scoping, and why.** What would scope it is not reachable from the server: the dark
  flag is stored per browser (a profile setting, which AGENTS.md keeps manual and the Companion app
  holds on the tablet), and a view's `theme:` is fixed when the dashboard renders. So the Ramka's
  views and the settings dashboard drop `theme: ramka` and take the server's default, which the
  automation sets. The README says how other users opt out (pick a theme in the profile).
- Inference, to prove on staging before the merge: a mode-free theme gives the dark look on a
  browser set to light and the reverse, and an open page follows `set_theme` without a reload
  (`themes_updated`). If either fails, theme mode leaves the must-build list and stays a render-time
  choice, recorded here.

### ramka: seeding and reset

```
automation <prefix>_settings_seed: trigger homeassistant start
  1. if input_boolean.<prefix>_settings_seeded is off:
       script.<prefix>_settings_reset {groups: [pages]
                                       + [presence_display] if that group is fresh
                                       + [music_visual]     if that group is fresh}
       input_boolean.<prefix>_settings_seeded → on
  2. else, with music_visual, if the music_visual group is fresh:
       script.<prefix>_settings_reset {groups: [music_visual]}
```

- **`script.<prefix>_settings_reset`** sets helpers to their defaults (`input_number.set_value`,
  `input_select.select_option`, `input_boolean.turn_on|turn_off`). Field `page` (`general`,
  `climate`, `air`, `plants`, `photos`, `status`, `calendar`, `music`): only that page's helpers.
  Field `groups` (`presence_display`, `pages`, `music_visual`): only those groups. Both absent: every
  helper, `ambient_music` included. Both given: the helpers in both. It never touches `audio-sensor`'s
  helpers (music source, calibration). **Decision: one script with two optional fields**, so the
  page buttons, the global button and the seed share one list of values; each helper belongs to one
  page and one group (the table above).
- **Decision: the rule for homes that already run the Ramka.** The flag is new in 0.4.0, so it is
  `off` in every home on its first 0.4.0 start; a plain seed would overwrite tuned values. A helper
  counts as **untouched** when its state is `unknown`, `unavailable` or at its own `min` attribute.
  - The **presence_display group is fresh** when all seven of its `input_number`s are untouched:
    that is what Home Assistant gives a helper without `initial:` and without a restored state
    (observed on a first install, issue #51), and no tuned tablet runs with a 10 s off delay and
    brightness 1 to 1. The rule is per group, not per helper: a home that set one value to its
    minimum on purpose (a 1 s near hold, brightness 1 in a dark hall) keeps it. In an upgraded home
    the group is not fresh, so its numbers and its booleans stay as they are; the booleans cannot
    tell a fresh `off` from a chosen `off`, so they are seeded only with a fresh group.
  - The **pages group** is new in 0.4.0 in every home, so it is seeded whenever the flag is `off`:
    without that, an upgraded home would find every page switch `off` (a fresh `input_boolean`) and
    its rotation reduced to the first page.
  - **Decision: the music_visual group seeds on its own condition**, all four dB helpers untouched
    (0 dB): neutral and hot both at 0 is no usable tuning. Its helpers exist only with
    `music_visual`, so a home can add the input after the flag is `on` (step 2). Every music helper is
    new in 0.4.0, so an update from 0.3.0 always gets them seeded.
- The approved design's "while the flag is off" holds for step 1; step 2 is the decision above. Once
  the flag is `on`, a restart never seeds the presence_display or pages group again.
- Home Assistant's `start` trigger fires after restored states are in place, so the seed sees the
  restored values (inference from how `homeassistant: start` behaves for the existing
  `<prefix>_photo_index` and `<prefix>_ambient_start`; the staging check below proves it).

### ramka: the Controls tile goes

The music-visual tile on the Controls page (SPEC-018, "Controls tile": three `tap-button-card`s
stepping `input_select.<prefix>_music_visual`) is removed: settings live only in Home Assistant.
This reverses part of ramka 0.4.0, which is unreleased; SPEC-018 and `UPGRADE.md` say so. The tablet
keeps the `near_enabled` tile it has had since 0.1.0 (released behaviour, out of this spec).

### ramka: the "Ramka settings" dashboard

`templates/ramka-settings.lang.yaml.j2`, rendered per language like the Ramka's dashboard: the
home's `dashboards/ramka-settings.<lang>.yaml`, in every language the home renders. Every label is a
`ui.settings.*` key in `translations/{en,de,pl}.json` (German Swiss Standard, no `ß`); no
`kiosk_mode:` block.

**Pages**, one sections view each, in this order (`path:` in brackets):

| page | Basic | Advanced | "not configured" when |
|---|---|---|---|
| General (`general`) | theme mode; approach on/off, off delay, brightness dark and bright; the Advanced switch; the "all pages off" warning; the screen size (read-only); global "Reset to defaults"; language (after the spike, below) | near distance, near hold, controls hold, lux for full brightness | never |
| Climate (`climate`) | page switch; rooms and `rooms_columns` (read-only) | | `climate` absent |
| Air (`air`) | page switch; the readings shown (read-only) | | `air` absent |
| Plants (`plants`) | page switch; the plants (read-only) | | `plants` absent |
| Photos (`photos`) | page switch; `photo_dir` (read-only) | | `photo_dir` absent |
| Status (`status`) | page switch; covers, contacts, power, locks and `status_columns` (read-only) | | `status_page: false` |
| Calendar (`calendar`) | page switch; the calendars (read-only) | | never (required input) |
| Music (`music`) | page switch; visualization type (`music_visual`); palette; the Advanced switch; a live preview | the two flavours, rise, fall, line width, tilt, the four dB values, refresh rate (`fps`); the music sensor (`input_select.audio_sensor_music_source`); the music sensor's calibration | the visual parts, when `music_visual` is absent |

- **Every page but General has its page switch at the top and a "Reset to defaults" button at the
  bottom** (`script.<prefix>_settings_reset` with `page: <view>`, with a confirmation). General's
  button resets every helper (no field). **Decision:** the Reset button sits on a page even when it
  has only the switch, so every page works the same way.
- **"Not configured".** A page whose view the render left out shows one markdown card instead of its
  settings: the view is not configured, the input that adds it (`climate`, `air`, `plants`,
  `photo_dir`, `status_page`, `music_visual`), and where: `domosenso/ramka.inputs.yaml`, then
  `domosenso render ramka` and a deploy. Its switch is not shown (it would change nothing). Each
  configured page lists its render-time inputs read-only with this render's values, as above; the
  structural inputs are not made live (Out of scope).
- **Basic and Advanced.** `input_boolean.<prefix>_settings_advanced` (default `off`) shows the
  Advanced cards on every page that has them: each Advanced card carries a visibility condition on
  it. **Decision:** the switch sits on General and again on Music, the two pages with Advanced parts.
- Each settings block is a heading and an `entities` card whose rows carry translated names
  (`ui.settings.<helper suffix>`). **Decision:** the select rows show option values as they are
  (`dune`, `series`, `dark`): helper option values are English by rule (AGENTS.md), and a YAML
  `input_select` has no translated option labels.
- **Music sensor.** Ramka's render cannot see whether `audio-sensor` has a music board, so the music
  sensor and calibration cards are rendered with `music_visual` and hidden by a visibility condition
  `state_not: unavailable` on `input_select.audio_sensor_music_source`. **Decision**, with an
  inference to check on staging: the frontend's state condition treats a missing entity as
  `unavailable`, so the cards are hidden in a home without the select.
- **Calibration block** (Music, Advanced), modelled on a Room acoustics sensor view and mapped to
  what `audio-sensor` provides for the music board (audio-sensor below):
  - offset in use: `sensor.music_spl_offset`, with `sensor.music_spl_calibration` (`estimate` or
    `calibrated`) beside it and its `note` attribute;
  - mic gain: `sensor.music_mic_gain` (read-only: the gain is the device file's `mic_gain`
    substitution, so changing it is a flash);
  - the procedure text (`ui.settings.calibration_procedure`: a reference meter next to the board,
    steady pink noise or music at a talking level, read both, measured offset = reference − the
    board's level without offset), with a link to audio-sensor's README;
  - the measured-offset input `input_number.audio_sensor_measured_offset`, the note input
    `input_text.audio_sensor_calibration_note`, and an "Apply" button:
    `script.audio_sensor_apply_calibration`.
  **Decision:** calibration is a measurement, not a preference: no reset touches it.
- **Preview** (Music, Basic). **Decision:** two `ambient-wave-card`s with the now-playing configs
  (spectrum and level) minus `active`, so the preview draws while the player is reported off too,
  each visible while `input_select.<prefix>_music_visual` reads its kind; `classic` (or anything
  else) shows a one-line note that the card draws its own wave. Height 63 px, the strip's on the
  1100 × 720 tablet (SPEC-018). With `fallback: classic` the preview shows the classic wave and the
  info icon when the board sends nothing.
- **Admin only.** The page is for admins, not the kiosk user. The YAML dashboard cannot restrict
  itself; the home's `lovelace:` entry does, with `require_admin: true`. README, "Settings page":

  ```yaml
  lovelace:
    dashboards:
      ramka-settings:                  # the URL path needs a hyphen
        mode: yaml
        filename: dashboards/ramka-settings.en.yaml   # or .de / .pl
        title: Ramka settings
        icon: mdi:tune-vertical
        show_in_sidebar: true
        require_admin: true
  ```

  Until the entry is there, `domosenso status` prints `missing-dashboard-entry
  dashboards/ramka-settings.<lang>.yaml`, as for any component dashboard.

Translation keys (new, `ui.settings.*`): one per page title, `basic`, `advanced`, `not_configured`,
`not_configured_how`, `render_time`, `all_off`, `preview`, `preview_classic`, `reset`,
`reset_confirm`, `reset_all`, `reset_all_confirm`, `calibration`, `calibration_procedure`,
`calibration_apply`, one per helper suffix and one per read-only input listed.

### ramka: language, a spike first

Language is a General item, but it is **not on the must-build list** until a spike passes. The Ramka
renders one dashboard per language, so a live switch means moving the tablet to another dashboard.

| option | how | against it |
|---|---|---|
| A. The page moves itself | `input_select.<prefix>_language` (the languages rendered); `corner-taps-card` on each language's dashboard gets its own `lang` and the paths of the others, and navigates with `pushState` + `reload` (as its corner taps do) when the select names another language; on load it checks again | needs one registered dashboard per language and a card change |
| B. `command_webview` | a Companion notification opens the other dashboard's URL | opens a new hidden copy of the app on every call (components/ramka/README.md) |
| C. One dashboard, every language | each label rendered three times behind a visibility condition on the select | triples the dashboard, and every card's own text (`card.*`) follows the user's language, not the select |
| D. The kiosk user's profile language | the user's language in Home Assistant | changes only the `card.*` texts and Home Assistant's own, not the rendered `ui.*` labels; a profile setting is manual (AGENTS.md) |

The spike tries A on the tested tablet (Companion app 2026.8.4, the TCL tablet) against staging, and
must prove:

1. a `pushState` + `reload` to another registered dashboard keeps one app task (no second copy in
   the recent-apps list) and keeps kiosk-mode;
2. after the screen sleeps and wakes, and after the app is restarted (it opens its configured start
   page), the tablet ends on the selected language's dashboard within one load;
3. the reload button (`input_button.<prefix>_reload`) and the corner taps still work on the new
   dashboard;
4. a select naming a language whose dashboard is not registered leaves the tablet where it is.

If it passes, a follow-up adds the select (General, Basic), the card option and the README entry for
the dashboards; if not, the result goes into the README and language stays render-time.

### audio-sensor: the music source and calibration (amends SPEC-018)

| entity | stability | note |
|---|---|---|
| `input_select.audio_sensor_music_source` | stable | with a `music: true` board; options: every board's `area`, that board first, then the others in input order; no `initial:` |
| `sensor.music_mic_gain` | stable | the selected board's Mic gain (`entities.mic_gain`), unchanged |
| `sensor.music_spl_calibration` | stable | `calibrated` or `estimate` from the selected board's flag; attribute `note`; `component: audio-sensor` |
| `input_boolean.<id_prefix>_spl_calibrated` | stable | per board; `off` = the offset is an estimate |
| `input_text.<id_prefix>_spl_note` | stable | per board, up to 255 characters |
| `input_number.audio_sensor_measured_offset` | stable | with a music board; 0–140 dB, step 0.1, the measurement to apply |
| `input_text.audio_sensor_calibration_note` | stable | with a music board; the note to apply |
| `script.audio_sensor_apply_calibration` | stable | writes the measured offset into the selected board's `input_number.<id_prefix>_spl_offset`, the note into its `_spl_note`, turns its `_spl_calibrated` on |

- No board with `music: true`: no select, no aliases, no calibration inputs or script, as in
  SPEC-018; the per-board flag and note exist for every board.
- The aliases follow the select: `sensor.music_spectrum`, `sensor.music_spl_offset`,
  `sensor.music_level`, `binary_sensor.music_sensor_online`, `sensor.music_mic_gain` and
  `sensor.music_spl_calibration` read the board whose area the select holds, through a rendered map
  from area to that board's entities and prefix; the script uses the same map. **Decision:** a
  select state that is not an option (`unknown` at a first start) reads the `music: true` board.
- `music: true` stays the default (the select's first option) and the render-time rule (at most one).
- **Decision:** two boards with the same `area` fail the render when the select is rendered,
  `duplicate area: <area>`: the options would collide.
- **Decision:** one board gives a one-option select, so the entity exists whenever there is a music
  board and a second board only adds an option.
- **Decision: the calibration helpers belong to audio-sensor**, which owns the offsets; Ramka's
  render cannot name a board's `<id_prefix>`, so it reads the aliases and calls the script. The
  manual calibration of SPEC-018 (typing the offset into `input_number.<id_prefix>_spl_offset`) keeps
  working.
- Ramka's manifest adds to `consumes:` the select, the two new aliases, the two calibration inputs
  and the script.

## The standing rule

**Every Ramka extension updates the settings dashboard in the same change.** A new behaviour gets its
live setting on its view's page, Basic or Advanced, belongs to one page and one group, and is covered
by the page's reset and the global one. `components/ramka/README.md` states it under "Settings page"
for implementers.

**Decision: a test holds it.** `tests/test_ramka_render.py::test_every_setting_is_on_a_page_and_reset`
renders the package and the settings dashboard with every optional input set, collects every
`input_number`, `input_boolean` and `input_select` the package defines, and fails on one that is
neither on some settings page nor in the test's named list of state helpers (`_mode`, `_ambient`,
`_ambient_music`, `_settings_seeded`), and on one on a page that the reset script does not set. A new
state helper has to be added to that list by name, in review. `catalog_check` is not used: the rule
is about one component's rendered output.

## Artifacts and ownership

| artifact | in the home | layer |
|---|---|---|
| `components/ramka/templates/package.yaml.j2` (changed) | `packages/ramka.yaml` | managed |
| `components/ramka/templates/dashboard.lang.yaml.j2` (changed: bindings, switches, no Controls tile, no view theme) | `dashboards/ramka.<lang>.yaml` | managed |
| `components/ramka/templates/ramka-settings.lang.yaml.j2` (new) | `dashboards/ramka-settings.<lang>.yaml` | managed |
| `components/ramka/themes/ramka.yaml` (gains `ramka-dark`, `ramka-light`) | `themes/ramka.yaml` | managed |
| `components/ramka/translations/{en,de,pl}.json` (`ui.settings.*`) | (rendered into the dashboards) | |
| `components/ramka/component.yaml`, `README.md`, `UPGRADE.md` | (catalog only) | |
| `components/audio-sensor/templates/package.yaml.j2` (changed) | `packages/audio_sensor.yaml` | managed |
| `components/audio-sensor/component.yaml`, `README.md`, `UPGRADE.md` | (catalog only) | |
| the `lovelace: dashboards:` entry | the home's `configuration.yaml` | local |
| `domosenso/ramka.inputs.yaml` (`settings_defaults`) | | instance |

The cards do not change (the language spike may change `corner-taps-card` later). The demo home's
Ramka inputs gain no `settings_defaults`.

## Compatibility

- **Both versions are unreleased** (ramka 0.4.0, audio-sensor 0.1.0 on `feature/audio-sensor`), so
  this spec amends them: no bridge, no new version number. A home that tried the dev render for the
  wall check (SPEC-019) renders again.
- **ramka 0.4.0, against 0.3.0:** new helpers, sensor, script and automations with stable ids
  (Provides; `component.yaml` lists them under `provides.entities` and `automations`); a new optional
  input `settings_defaults`; `music_visual_options` keeps its keys, gains `fps` and becomes starting
  values; a new managed dashboard; the theme file gains two themes and the Ramka's views drop
  `theme: ramka`; the existing helpers, their ranges and the FROZEN options of `_mode` and
  `_ambient` are unchanged. SPEC-018's rule "without `music_visual`, byte-identical to 0.3.0 apart
  from stamp and version" no longer holds: every 0.4.0 package gains the switches, the flag, the
  seed, the reset and the theme automation. The test compares 0.4.0 without `music_visual` to 0.3.0
  with those additions taken out.
- **The Controls tile of 0.4.0 is removed** before release; no home relies on it.
- **audio-sensor 0.1.0:** more provided entities, nothing removed.
- `docs/COMPATIBILITY.md`: the entities are in the manifests, whose rules it states. *Amended
  2026-10-30 (final review):* the renderer's destination rule is new and is stated there (Tools,
  "Renderer inputs").
- **The renderer's destination for a language template** (*amended 2026-10-30, final review*): the
  settings dashboard is the first `*.lang.yaml.j2` not named `dashboard`. `domosenso render` puts
  `dashboard.lang.yaml.j2` at `dashboards/<id>.<lang>.yaml`, as before, and any other
  `<name>.lang.yaml.j2` at `dashboards/<name>.<lang>.yaml` (here `dashboards/ramka-settings.<lang>.yaml`);
  `outputs:` in `domosenso.yaml` overrides either. The name carries no component prefix, so a
  component names such a template after itself (`ramka-settings`): two components with the same
  template name would claim the same file, and the second render fails `owned by <id>: <path>`.
- `docs/UPGRADE_NOTES.md`: the 2026-10-29 ramka 0.4.0 line gains "live settings on a settings
  dashboard and page switches; the theme follows a helper for every backend-selected browser; a home
  adds one `lovelace:` entry".

`components/ramka/UPGRADE.md`, the 0.4.0 entry changes to say:

> **Live settings.** Every behaviour setting is a helper the tablet reads live, now including the
> music visual's look and a switch per view (`input_boolean.<prefix>_page_<view>`). A new admin
> dashboard, "Ramka settings" (`dashboards/ramka-settings.<lang>.yaml`), has one page per view plus
> General, each in Basic and Advanced parts; add its `lovelace:` entry from the README ("Settings
> page"). The music-visual tile on the Controls page is gone: the visual is chosen on the Music page.
> **Theme.** `input_select.<prefix>_theme_mode` sets the server's default theme (`ramka-dark` or
> `ramka-light`) for every browser on "Backend-selected", not only the tablet.
> **Starting values.** On the first start of 0.4.0 the automation `<prefix>_settings_seed` turns the
> page switches on, sets the helpers that are new to their defaults (new optional input
> `settings_defaults`) and turns `input_boolean.<prefix>_settings_seeded` on. **A home that already
> runs the Ramka keeps its tuned values:** the presence and display helpers are set only when all
> seven numbers still sit at their minimum, as on a first install. To start over later, press
> "Reset to defaults" on a page or on General.

`components/audio-sensor/UPGRADE.md`, the 0.1.0 entry gains:

> With a board marked `music: true`, `input_select.audio_sensor_music_source` lists the boards'
> areas, that board first; the music aliases follow it, so another board can feed the Ramka's music
> visual without a render. Each board gains a calibrated flag and a note; the music board's
> calibration can be applied from the Ramka's settings (`script.audio_sensor_apply_calibration`).
> `music: true` stays the default.

## Tests

- `tests/test_ramka_render.py`:
  - `test_settings_helpers_stable_ids`: the exact set of helper, sensor, script and automation ids,
    with and without `music_visual`, and the same set in `component.yaml`;
  - `test_no_helper_has_initial`: no `initial:` anywhere in the package;
  - `test_seed_defaults_follow_the_inputs`: without inputs the reset script writes the catalog's
    values; with `settings_defaults` and `music_visual_options` it writes theirs; the selects start
    with the default;
  - `test_seed_rule_keeps_tuned_values` (the rule pinned): the seed's rendered conditions evaluated
    with Jinja and stub `states` / `state_attr` / `is_state` functions: flag `off` and all seven at
    minimum → groups `pages, presence_display, music_visual`; flag `off` and `off_delay_s` at 600 →
    `pages, music_visual`; flag `off`, `near_s` at its minimum on purpose and the rest tuned →
    `pages, music_visual`; flag `on` and the music dB helpers at 0 → `music_visual`; flag `on` and
    music tuned → nothing;
  - `test_reset_page_and_groups`: each `page` value sets exactly that page's helpers; each group
    exactly its helpers; no field sets every helper; no calibration helper anywhere;
  - `test_every_setting_is_on_a_page_and_reset` (the standing rule);
  - `test_fallbacks_equal_the_defaults`: every `| int()` / `| float()` default on a settings helper
    equals its default, also with `settings_defaults`;
  - `test_settings_defaults_bad_input_fails`, `test_music_visual_options_bad_values_fail`: each
    message under Inputs;
  - `test_ambient_pages_follow_the_switches`: the sensor's template evaluated with stub states:
    switches on → the rendered pages; `air` off → without it; a page the render left out stays out
    with its switch on; all off → the first rendered page and `all_off: true`;
  - `test_loop_and_swipes_read_the_live_list`: every stage's next page, `ambient_next`,
    `ambient_prev` and `swipe_up` read `sensor.<prefix>_ambient_pages`, for five pages and fewer;
  - `test_music_and_calendar_switches`: `music_view` reads `page_music`; the calendar tiles and
    `show_calendar` read `page_calendar`;
  - `test_controls_tile_gone`: no `tap-button-card` on `input_select.<prefix>_music_visual`
    (replaces `test_controls_tile_present_only_with_music_visual` and
    `test_controls_tile_sits_in_the_music_column_while_the_player_is_on`);
  - `test_visual_configs_bind_the_helpers`: every option of both configs is the right helper's id, for
    any prefix (replaces `test_music_visual_options_merged_key_by_key`);
  - `test_visual_configs_pass_the_card_normaliser` (rewritten): the configs pass `normaliseConfig`
    with entity values, and `resolveOptions` with states at the seeded defaults gives `dune` /
    `centre`, 2.8 px, 30 / 70 dB, 200 ms / 4 s, 30 fps; with every helper `unavailable` it gives the
    card's defaults;
  - `test_flavour_options_match_the_card_registry`: the two flavour selects and the palette select
    hold exactly `SPECTRUM`, `SCALAR` and `NAMED_PALETTES` from the card's files;
  - `test_settings_dashboard_pages_per_language`: `ramka-settings.{en,de,pl}.yaml` each with the
    eight views in order; labels from the translations (no English label in `de` or `pl`, no `ß` in
    `de`); no `kiosk_mode`;
  - `test_settings_page_not_configured`: for each of `climate`, `air`, `plants`, `photo_dir`,
    `status_page: false`, `music_visual` left out, that page shows the "not configured" card naming
    the input and no switch;
  - `test_advanced_cards_follow_the_switch`: every Advanced card has the visibility condition on
    `settings_advanced`, no Basic card has it;
  - `test_settings_reset_buttons`: one per page with its `page`, one global without a field, each
    with a confirmation;
  - `test_music_page_sensor_and_calibration`: rendered with `music_visual`, hidden on the select's
    `unavailable`; the calibration rows name the audio-sensor entities above;
  - `test_theme_mode`: the automation calls `frontend.set_theme` twice with `ramka-<mode>`; the
    Ramka's views have no `theme:`; `themes/ramka.yaml` has `ramka-dark` and `ramka-light`;
  - `test_music_visual_absent_renders_as_0_3_0` (changed as under Compatibility);
  - the existing `test_every_ui_key_has_en_de_pl` covers the new keys.
- `tests/test_audio_sensor_render.py`: `test_music_source_select_options` (music board first, then
  input order; `Kids' room` as an option); `test_no_music_board_no_select` (and no calibration inputs
  or script); `test_one_board_one_option`; `test_duplicate_area_fails`;
  `test_aliases_follow_the_select` (the alias templates evaluated with stub states, the mic gain and
  calibration aliases included: the select on the second board's area reads its entities; `unknown`
  reads the `music: true` board); `test_apply_calibration_targets_the_selected_board`;
  `test_calibration_helpers_per_board`.
- `catalog_check --strict`: the new template path, the theme file, the `ui.settings.*` keys in en,
  de, pl.
- `tools/ha-check.sh ramka` and `tools/ha-check.sh audio-sensor` on the demo home: `fresh: 0 errors`.
- `test_privacy`, `tests/test_docs.py`.
- Staging, before the merge into `main`: a fresh Ramka starts with the defaults, every switch `on`
  and the flag `on`; a 0.3.0 Ramka with tuned values updated to 0.4.0 keeps them, gets every switch
  `on` and the music defaults; a slider moved on a page changes the tablet without a reload
  (brightness, line width); a page switch turned off leaves the rotation at the end of the stage; a
  page reset and the global reset restore their helpers; the theme mode changes the tablet and a
  second browser on "Backend-selected" (and not one with a profile theme); the music sensor cards
  hide without `audio-sensor`; the dashboard is not in the kiosk user's sidebar.
- The language spike, separately, with its own result in the README.

## Out of scope

- Making the structural inputs live (pages present, rooms, covers, lights, screen size, status page,
  columns): they shape the rendered dashboards; the pages list them read-only and the switches only
  remove a view.
- The language switch, until its spike passes.
- Several music sources per home, one per Ramka: issue #73. The select here picks one source for the
  home's one set of aliases; #73's zone names would give each zone its own select.
- A palette of custom colour stops as a live setting; translated option labels in the selects.
- The `near_enabled` tile on the Controls page (since 0.1.0).
- The follow-up settings below.

## Follow-up issues (drafted, not filed)

Each follows this page structure and the standing rule:

- (f) photo album settings on the Photos page: how many photos, display time per photo, album
  selection from the subfolders of `photo_dir`;
- (g) air quality settings on the Air page: which readings to show, thresholds in Advanced;
- (h) a calendar by URL (ICS or CalDAV) instead of OAuth: Home Assistant configures calendars
  through config flows, not helpers, so the Calendar page links to the setup;
- (i) background settings on General.

## Open questions

1. **A missing entity in a visibility condition** (Music sensor cards): inference that the frontend
   treats it as `unavailable`; checked on staging. If it does not, the cards show Home Assistant's
   "entity not available" rows in a home without `audio-sensor`, which is harmless, and the README
   says so.
2. **Theme mode** rests on two inferences (a mode-free theme forces the look; an open page follows
   `set_theme`), checked on staging; if either fails, it goes back to render time.
3. **Issue #51** is covered by this spec (seed, flag, defaults input). Proposed: close it when this
   lands, with a link.

## Amendment 1 (2026-10-30): Photos, Air, the way to the view, language, calendar by URL

Issues #87 (follow-up f), #88 (g), #89 (h), #102 (the spike's interim note, part a of its triage) and
#103. ramka 0.4.0 is not tagged yet, so this amends 0.4.0. #100 (music sources) is not part of it.

**Photos page** (with `photo_dir`; group `photos`, page `photos`):

| helper | where | range | default |
|---|---|---|---|
| `input_number.<prefix>_photo_count` | Basic | 1 to 20 | 5 |
| `input_number.<prefix>_photo_s` | Advanced | 3 to 120 s | 10 |
| the albums, `sensor.<prefix>_photo_albums` | Advanced | any of the top-level folders of `photo_dir` that hold photos | none (all) |

- The albums are a checkbox each ("All albums" first) on a new card, `photo-albums-card`, which calls
  `script.<prefix>_photo_albums_set` with `chosen`. They are no helper: a choice of any of ~100
  folders fits neither an `input_select` nor a 255-character `input_text`. A trigger-based template
  sensor, `sensor.<prefix>_photo_albums`, keeps `available` and `chosen` as attributes (restored
  after a restart) and is set by event `<prefix>_photo_albums`, which sets either key and keeps the
  other. Its state is how many are chosen; none is all. The photo index sends `available` after
  each run; the reset sends `chosen: []` (the `('event', ...)` entry of the settings list).
- `shell/ramka_pick.py <root> <count> [<album> ...]` draws only from the folders under the chosen
  albums; one that is gone is skipped (`album <name> not found`), and with none left every folder is
  (`..., using all`). `ramka_pick.py <root> --albums` prints `{"albums": [...]}` for the new
  `shell_command.<prefix>_albums`.
- `shell_command.<prefix>_pick` takes `count` and `albums` (a list) as action data; a templated
  command runs without a shell, so each album is single-quoted for its split. The loop passes the
  helpers, with `| int(5)` and `| int(10)` fallbacks equal to the defaults; every photo slot, and
  the empty pick's slot, lasts `photo_s`. A chosen album that is gone stays chosen and listed,
  marked, so it comes back with its folder.

**Air page** (with `air`; group `air`, page `air`), only for the readings the input names:

| helper | where | range | default |
|---|---|---|---|
| `input_boolean.<prefix>_air_<reading>` (`score`, `co2`, `pm2_5`, `voc`, `nox`) | Basic | | on |
| `input_number.<prefix>_air_score_{fair,poor}` | Advanced | 0 to 100 | 80, 60 |
| `input_number.<prefix>_air_co2_{raised,high}` | Advanced | 400 to 5000 ppm | 800, 1200 |
| `input_number.<prefix>_air_pm2_5_{raised,high}` | Advanced | 1 to 250 µg/m³ | 15, 35 |
| `input_number.<prefix>_air_voc_{raised,high}` | Advanced | 1 to 500 | 150, 250 |
| `input_number.<prefix>_air_nox_{raised,high}` | Advanced | 1 to 500 | 20, 150 |

A limit is where its level begins: CO₂ is raised from `co2_raised`, high from `co2_high`; the score
(higher is better) is fair below `score_fair`, poor below `score_poor`. `air-card` gains two
additive keys (STABLE surface): `show:` on the score and on a tile (an `input_boolean`; `off` leaves
the tile out and the others share its room, any other state shows it), and a level limit written
`{entity, default}`, the entity's number on every update, `default` while it is not a number. The
dashboard binds both; literal levels and no `show:` render as before.

**Seeding.** Groups `photos` and `air` are seeded while their numbers are untouched (unknown,
unavailable or at their minimum), also after `settings_seeded` is on, so a home that ran 0.4.0
before this amendment gets them at its next start. The reset script's `groups` field lists
`presence_display`, `pages`, `music_visual`, `photos`, `air`. The Advanced switch also sits on the
Photos and Air pages, which now have Advanced parts.

**General, Basic: the way to the view.** A button "Open the Ramka view" navigates to
`/<path>/ramka?disable_km`, where `<path>` is the new optional input `dashboard_paths` (a map
language → URL path) for the page's language, else `dashboard_path`. Every path is a plain URL path
(letters, digits, `-`, `_`; no slash), or the render fails with `ramka: dashboard paths must be plain
url paths`. The Ramka dashboard's own top-right exit keeps `dashboard_path`.

**General, Basic: language.** The spike above has not run. Until it does, General shows a note:
each language is its own dashboard (the `dashboard_paths`, else `dashboard_path`), the tablet shows
the language of the one it opens, and a switch follows after the spike. No helper.

**Calendar, Basic: by URL.** A note with links to Home Assistant's add flows for `remote_calendar`
(an ICS URL, refreshed once a day) and `caldav` (refreshed every 15 minutes; both are config flows
in 2026.9.2, read from their manifests and coordinators), then the step after: the new `calendar.*`
entity into the `calendar` input, a render and a deploy. No helper: a calendar is an integration.
`components/calendar` gains the ICS path in its README and manifest.

**Dev-rendered cards get `?v=<sha8>`.** A dev render keeps its version's path (`/0.4.0/`), so a
changed card was the same URL and browsers kept the old one for the 31 days `/local/` is cached:
after this amendment's first deploy every air tile was red, the old card reading the new
`{entity, default}` limits as "high". `domosenso deploy` now gives a dev-rendered card's resource
`?v=` of its file, as it does the home's own; a locked card still changes with its version directory.

Tests: `tests/test_ramka_shell.py` (album, several albums, missing albums, `--albums`); `tests/test_ramka_render.py`
(the helpers on their pages and groups, the loop, the album options and their restore, nothing
without `photo_dir` or a reading, the card's bindings, the link per language and its failure, the
language note, the calendar links; the standing rule); `tests/test_cli_resources.py` (the dev card's hash); `cards/photo-albums-card.test.mjs`; `cards/air-card.test.mjs` (`show:`, entity
limits, an unusable limit, unchanged without the new keys).
