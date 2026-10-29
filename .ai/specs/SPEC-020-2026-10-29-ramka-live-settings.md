# SPEC-020: Ramka live settings (ramka 0.4.0, audio-sensor 0.1.0)

- Status: draft 2026-10-29
- Source: the maintainer's design, approved in conversation (2026-10-29), after the wall check of
  SPEC-018's music visual: tuning the visual meant an inputs change, a render and a deploy for each
  value tried. Also covers issue #51 (the tuning sliders start at their minimum on a first install).
- Amends: SPEC-018 (the music-source select in `audio-sensor`; `music_visual_options` becomes the
  visual's starting values instead of literal card options). Both versions are unreleased, so this
  spec changes 0.4.0 and 0.1.0 in place; no bridge.
- Decisions this spec adds to the approved design, each forced by the code, are marked
  **Decision**.

## Goal

A home gets:

1. every behaviour setting of the Ramka as a helper that its automations and cards read live:
   presence, display and the music visual's look, changed on a page and seen on the tablet at
   once, without an inputs change, a render or a deploy;
2. sensible values on a first install: a one-shot seed sets every helper to its default at the
   first start, and a "Reset to defaults" button runs the same seeding later; a home that already
   runs the Ramka keeps its tuned values when it moves to 0.4.0;
3. one admin page, "Ramka settings", per language, with the live settings, a live preview of the
   now-playing visual and a read-only list of the settings that stay render-time;
4. with `audio-sensor`: which board feeds the music visual, chosen live from that page.

## Devices

No change: the Ramka's tablet and radar, and with the visual one `audio-sensor` board or more
(SPEC-018).

## Integrations

No new integration. `input_number`, `input_select`, `input_boolean`, `script`, `automation` and
the Lovelace YAML dashboards are core. The home adds one `lovelace: dashboards:` entry by hand (it
lives in the home's `configuration.yaml`, which the catalog does not render; Artifacts).

## Inputs

### ramka

| name | type | default | example (demo home) |
|---|---|---|---|
| `settings_defaults` (new) | `{near_enabled?: bool, near_cm?, near_s?, controls_hold_s?, off_delay_s?, brightness_min?, brightness_max?, lux_max?, ambient_music?: bool}` | `null` | `{off_delay_s: 600}` |
| `music_visual_options` (changed meaning) | as in SPEC-018 | `null` | `{level: {flavour: tide}}` |

- **Decision: `settings_defaults`, one optional flat map.** The presence and display defaults get an
  input in the smallest form: a map keyed by the helper's suffix, every key optional, absent keys
  keep the catalog's values (Starting values). It is what the seed and the reset write, so "Reset to
  defaults" returns a home to its own baseline, and it is what issue #51 asked for (its `tuning:`
  block). Render-time checks (`fail()`): an unknown key → `ramka: settings_defaults: unknown key
  '<key>'`; a number outside its helper's range → `ramka: settings_defaults.<key> must be within
  <min> and <max>`; `brightness_min` above `brightness_max` → `ramka: settings_defaults:
  brightness_min above brightness_max`.
- **`music_visual_options` now gives starting values.** Its keys and shape stay SPEC-018's; their
  values go into the seed and the reset of the music-visual helpers, no longer into the card
  configs, which bind the helpers (Music visual). Absent keys take the card's defaults, and the line
  width Ramka's 2.8 px.
- **Decision: `music_visual_options` values are checked at render**, since each must fit a helper:
  a flavour not of its kind → `ramka: music_visual_options.<kind>.flavour '<flavour>' is not a
  <kind> flavour`; a palette other than `zones`, `series`, `calm` → `ramka: music_visual_options.palette
  must be zones, series or calm`; a number outside its helper's range → `ramka:
  music_visual_options.<key> must be within <min> and <max>`; `hot` not above `neutral` for a kind
  (the card would reverse its palette and fall back to its defaults, `orderColour`) → `ramka:
  music_visual_options.<kind>: hot must be above neutral`. A palette as a list of colour stops, which
  the card accepts, cannot be a select option; 0.4.0 is unreleased, so it is refused rather than
  bridged.

### audio-sensor

No new input. `sensors[].music` keeps its meaning: at most one board, checked at render
(`two music sensors: <room>, <room>`), and it is the select's default (Sensor).

## Provides

### ramka: the live settings

Every helper below has no `initial:` (Home Assistant would reset it at every restart) and is
restored across restarts. Ranges of the presence and display helpers are 0.3.0's, unchanged.

| entity | range, options | default | stability |
|---|---|---|---|
| **Presence** (exist since 0.1.0) | | | |
| `input_boolean.<prefix>_near_enabled` | | `on` | stable |
| `input_number.<prefix>_near_cm` | 10–400 cm, step 10 | 100 | stable |
| `input_number.<prefix>_near_s` | 1–10 s, step 1 | 1 | stable |
| `input_number.<prefix>_controls_hold_s` | 1–600 s, step 1 | 5 | stable |
| `input_number.<prefix>_off_delay_s` | 10–1800 s, step 10 | 300 | stable |
| **Display** (exist since 0.1.0) | | | |
| `input_number.<prefix>_brightness_min` | 1–255, step 1 | 16 | stable |
| `input_number.<prefix>_brightness_max` | 1–255, step 1 | 204 | stable |
| `input_number.<prefix>_lux_max` | 20–2000 lx, step 10 | 200 | stable |
| `input_boolean.<prefix>_ambient_music` | | `on` | stable |
| **Music visual** (with `music_visual`) | | | |
| `input_select.<prefix>_music_visual` (0.4.0, SPEC-018) | `spectrum`, `level`, `classic`, the input's first | the input's | stable |
| `input_select.<prefix>_music_spectrum_flavour` | the card's spectrum flavours | `dune` | stable; options additive-only |
| `input_select.<prefix>_music_level_flavour` | the card's level flavours | `centre` | stable; options additive-only |
| `input_select.<prefix>_music_palette` | `zones`, `series`, `calm` | `series` | stable; options additive-only |
| `input_number.<prefix>_music_rise_ms` | 0–2000 ms, step 10 | 200 | stable |
| `input_number.<prefix>_music_fall_s` | 0–30 s, step 0.1 | 4 | stable |
| `input_number.<prefix>_music_line_width_px` | 0.5–12 px, step 0.1 | 2.8 | stable |
| `input_boolean.<prefix>_music_tilt` | | `on` | stable |
| `input_number.<prefix>_music_spectrum_neutral_db` | 0–130 dB, step 1 | 30 | stable |
| `input_number.<prefix>_music_spectrum_hot_db` | 0–130 dB, step 1 | 70 | stable |
| `input_number.<prefix>_music_level_neutral_db` | 0–130 dB, step 1 | 30 | stable |
| `input_number.<prefix>_music_level_hot_db` | 0–130 dB, step 1 | 70 | stable |
| **Seeding** | | | |
| `input_boolean.<prefix>_settings_seeded` | | (set by the seed) | stable |
| `script.<prefix>_settings_reset` | field `only` (`music`), optional | | stable |
| automation `<prefix>_settings_seed` | | | stable |

The defaults above are the catalog's; `settings_defaults` (presence, display) and
`music_visual_options` (music visual) override them per home.

- **Defaults checked against the template.** The presence and display values are the ones
  `templates/package.yaml.j2:72-74` documents; README's `off_delay_s` note (300 s) agrees. The
  booleans' defaults are inferred from the template's comments ("the now-playing card (default)";
  controls on approach as the radar's purpose). The music values are the card's (`DEFAULTS`,
  `DEFAULT_FLAVOUR`, `DEFAULT_COLOUR` in `components/audio-sensor/cards/lib/config.js`), except the
  line width, Ramka's 2.8 px (SPEC-018).
- **Decision: helper ids.** `music_` after the prefix groups the visual's helpers; a unit suffix
  (`_ms`, `_s`, `_px`, `_db`) as on the existing `_near_cm` and `_off_delay_s`.
- **Decision: ranges of the music helpers** are the card's own console sliders
  (`cards/lib/console.js`: rise 0–2000 ms step 10, fall 0–30 s step 0.1, line width
  `LINE_WIDTH_RANGE` 0.5–12 px step 0.1, spectrum neutral and hot 0–130 dB). The level's dB range is
  the spectrum's: the level is dB SPL too (`sensor.music_level`).
- **Decision: the flavour and palette selects list their default first**, then the rest in the
  card's registry order (`SPECTRUM` and `SCALAR` in `cards/lib/flavours/index.js`, `NAMED_PALETTES`
  in `config.js`), as `input_select.<prefix>_music_visual` does: a fresh select is right even
  before the seed runs. Spectrum: `still, swell, dune, veil, voices, halo, afterglow, bars`; level:
  `still, tide, centre, timeline, clocks, ripples, tint, bars`. Ramka's render cannot read
  audio-sensor's files, so the lists are literal in the template and a test pins them to the
  registry. A flavour the card later drops reads as the kind's default (`resolveOptions`).
- **Decision: the template's fallbacks equal the defaults.** Today the package's `| int()` /
  `| float()` fallbacks disagree with the documented values (`off_delay_s | int(120)`,
  `controls_hold_s | int(15)` in one place and `int(5)` in another, `near_s | int(3)`,
  `near_cm | float(50)`, `brightness_min | float(20)`, `brightness_max | float(255)`). They become
  the home's defaults, from one rendered table that the seed, the reset and the fallbacks share.

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
  every option this design binds: `flavour` (choice), `colour.palette` (choice, `NAMED_PALETTES`),
  `colour.neutral`, `colour.hot`, `dynamics.rise`, `dynamics.fall`, `style.line_width` (number, within
  `LINE_WIDTH_RANGE`) and `dynamics.tilt` (boolean). `normaliseConfig` skips its literal checks for an
  entity value (flavour of the kind, palette, hot above neutral) and `resolveOptions` reads the states
  on every update. **No card change is needed.**
- What the card does with an unusable state (from `config.js`, unchanged): `unknown`,
  `unavailable`, missing or out of range gives that option's card default, so the line width falls
  to the card's 4 px, not 2.8 px (only while a helper does not exist: a restored or fresh
  `input_number` always has a number); a flavour not of the kind gives the kind's default; hot at or
  below neutral gives the kind's dB pair (`orderColour`). The settings page does not stop a person
  from setting hot below neutral; the visual then shows the defaults until it is corrected, and the
  README says so.
- The palette stays one select for both kinds, and rise, fall, line width and tilt one helper each
  for both, as `music_visual_options` already groups them (SPEC-018).

### ramka: seeding and reset

```
automation <prefix>_settings_seed: trigger homeassistant start
  1. if input_boolean.<prefix>_settings_seeded is off:
       if the presence/display group is fresh: script.<prefix>_settings_reset   (everything)
       input_boolean.<prefix>_settings_seeded → on
  2. with music_visual, if the music group is fresh: script.<prefix>_settings_reset {only: music}
```

- **`script.<prefix>_settings_reset`** sets every helper to its default: `input_number.set_value`,
  `input_select.select_option`, `input_boolean.turn_on|turn_off`. With `only: music` it sets the
  music-visual group only. It never touches `audio-sensor`'s music-source select. **Decision: one
  script with one optional field**, so the seed and the button share one list of values.
- **Decision: the rule for homes that already run the Ramka.** The flag is new in 0.4.0, so it is
  `off` in every home on its first 0.4.0 start; a plain seed would overwrite tuned values. A helper
  counts as **untouched** when its state is `unknown`, `unavailable` or at its own `min` attribute.
  The **presence/display group is fresh** when all seven of its `input_number`s are untouched: that
  is what Home Assistant gives a helper without `initial:` and without a restored state (observed on
  a first install, issue #51), and no tuned tablet runs with a 10 s off delay and brightness 1 to 1.
  The rule is per group, not per helper: a home that set one value to its minimum on purpose (a
  1 s near hold, brightness 1 in a dark hall) keeps it. In an upgraded home the group is not fresh,
  so its seven numbers and its two booleans stay as they are; the booleans cannot tell a fresh `off`
  from a chosen `off`, so they are seeded only with a fresh group.
- **Decision: the music group seeds on its own condition.** Its helpers exist only with
  `music_visual`, so a home can add the input after the flag is already `on`; its fresh helpers would
  then sit at rise 0, fall 0, line 0.5 px and 0 dB. The **music group is fresh** when its four dB
  helpers are all untouched (0 dB): neutral and hot both at 0 is no usable tuning (the card falls
  back to its defaults). Seeding it then sets all twelve of its helpers. Every music helper is new in
  0.4.0, so a home updating from 0.3.0 always gets them seeded.
- The approved design's "while the flag is off" holds for the presence/display group; step 2 is
  the decision above (after a full reset in step 1 the music group is no longer fresh, so step 2
  does nothing). The flag stays the one-shot guard: once `on`, a restart never seeds the
  presence/display group again, even when someone sets all seven to their minimum.
- Home Assistant's `start` trigger fires after restored states are in place, so the seed sees the
  restored values (inference from how `homeassistant: start` behaves for the existing
  `<prefix>_photo_index` and `<prefix>_ambient_start`; the staging check below proves it).

### ramka: the "Ramka settings" dashboard

`templates/ramka-settings.lang.yaml.j2`, rendered per language like the Ramka's dashboard: the
home's `dashboards/ramka-settings.<lang>.yaml`. One sections view; every label is a `ui.settings.*`
key in `translations/{en,de,pl}.json` (German Swiss Standard, no `ß`); no `kiosk_mode:` block.

| section | shows | when |
|---|---|---|
| Presence | `near_enabled`, `near_cm`, `near_s`, `controls_hold_s`, `off_delay_s` | always |
| Display | `brightness_min`, `brightness_max`, `lux_max`, `ambient_music` | always |
| Music visual | `music_visual`, the two flavours, palette, rise, fall, line width, tilt, the four dB values | with `music_visual` |
| Sensor | `input_select.audio_sensor_music_source` | with `music_visual`, visible while the select is not `unavailable` |
| Preview | the now-playing visual on the same helpers | with `music_visual` |
| Render-time settings (read-only) | the structural inputs and where to change them | always |
| Reset | a "Reset to defaults" button: `script.<prefix>_settings_reset`, with a confirmation | always |

- Each settings section is a heading and an `entities` card whose rows carry translated names
  (`ui.settings.<helper suffix>`), so the page reads in the dashboard's language while the helpers'
  own names stay English. **Decision:** the select rows show option values as they are (`dune`,
  `series`): helper option values are English by rule (AGENTS.md), and a YAML `input_select` has no
  translated option labels.
- **Sensor.** Ramka's render cannot see whether `audio-sensor` has a music board, so the section is
  rendered with `music_visual` and hidden by a visibility condition `state_not: unavailable` on
  `input_select.audio_sensor_music_source`. **Decision**, with an inference to check on staging: the
  frontend's state condition treats a missing entity as `unavailable`, so the section is hidden in a
  home without the select.
- **Preview.** **Decision:** two `ambient-wave-card`s with the now-playing configs (spectrum and level)
  minus `active`, so the preview draws while the player is reported off too, each visible while
  `input_select.<prefix>_music_visual` reads its kind; `classic` (or anything else) shows a one-line
  note that the card draws its own wave. Height 63 px, the strip's on the 1100 × 720 tablet
  (SPEC-018). With the card's `fallback: classic` the preview shows the classic wave and the info
  icon when the board sends nothing.
- **Render-time settings.** A markdown card that lists, with this render's values: the ambient pages
  present (`climate`, `air`, `plants`, `photo_dir`, `status_page`), the climate rooms (`climate`
  labels), `covers` and `lights` (labels), `screen` (width × height, or the default 1100 × 720),
  `status_page`, `rooms_columns` and `status_columns`, each with its input name; and one line: change
  them in `domosenso/ramka.inputs.yaml`, then `domosenso render ramka` and a deploy.
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
- The Controls tile of SPEC-018 (music visual on the tablet) stays; the tablet keeps no other
  settings.

Translation keys (new, `ui.settings.*`): `title`, `presence`, `display`, `music_visual`, `sensor`,
`preview`, `preview_classic`, `structure`, `structure_how`, `reset`, `reset_confirm`, one per helper
suffix (`near_enabled` … `music_level_hot_db`, `music_source`), and one per structural input listed.

### audio-sensor: the music source (amends SPEC-018)

| entity | stability | note |
|---|---|---|
| `input_select.audio_sensor_music_source` | stable | with a `music: true` board; options: every board's `area`, that board first, then the others in input order; no `initial:` |

- No board with `music: true`: no select and no aliases, as in SPEC-018.
- The aliases follow the select: `sensor.music_spectrum`, `sensor.music_spl_offset`,
  `sensor.music_level` and `binary_sensor.music_sensor_online` read the board whose area the select
  holds, through a rendered map from area to that board's spectrum, level and offset entities.
  **Decision:** a select state that is not an option (`unknown` at a first start) reads the
  `music: true` board.
- `music: true` stays the default (the select's first option, so a fresh select starts there) and
  the render-time rule (at most one).
- **Decision:** two boards with the same `area` fail the render when the select is rendered,
  `duplicate area: <area>`: the options would collide.
- **Decision:** one board gives a one-option select, so the entity exists whenever there is a
  music board and a second board only adds an option.
- Ramka's manifest adds `input_select.audio_sensor_music_source` to `consumes:`.

## Artifacts and ownership

| artifact | in the home | layer |
|---|---|---|
| `components/ramka/templates/package.yaml.j2` (changed) | `packages/ramka.yaml` | managed |
| `components/ramka/templates/dashboard.lang.yaml.j2` (changed: bindings) | `dashboards/ramka.<lang>.yaml` | managed |
| `components/ramka/templates/ramka-settings.lang.yaml.j2` (new) | `dashboards/ramka-settings.<lang>.yaml` | managed |
| `components/ramka/translations/{en,de,pl}.json` (`ui.settings.*`) | (rendered into the dashboards) | |
| `components/ramka/component.yaml`, `README.md`, `UPGRADE.md` | (catalog only) | |
| `components/audio-sensor/templates/package.yaml.j2` (changed) | `packages/audio_sensor.yaml` | managed |
| `components/audio-sensor/README.md`, `UPGRADE.md` | (catalog only) | |
| the `lovelace: dashboards:` entry | the home's `configuration.yaml` | local |
| `domosenso/ramka.inputs.yaml` (`settings_defaults`) | | instance |

The cards do not change. The demo home's Ramka inputs gain no `settings_defaults` (the catalog's
values are the demo's).

## Compatibility

- **Both versions are unreleased** (ramka 0.4.0, audio-sensor 0.1.0 on `feature/audio-sensor`), so
  this spec amends them: no bridge, no new version number. A home that tried the dev render for the
  wall check (SPEC-019) renders again.
- **ramka 0.4.0, against 0.3.0:** new helpers, script and automation with stable ids (Provides;
  `component.yaml` lists them under `provides.entities` and `automations`); a new optional input
  `settings_defaults`; `music_visual_options` keeps its keys and becomes starting values; a new
  managed dashboard; the existing helpers, their ranges and options are unchanged. SPEC-018's rule
  "without `music_visual`, byte-identical to 0.3.0 apart from stamp and version" no longer holds:
  every 0.4.0 package gains the flag, the seed and the reset, and the fallbacks change. The test
  compares 0.4.0 without `music_visual` to 0.3.0 with those additions taken out.
- **audio-sensor 0.1.0:** one more provided entity, nothing removed.
- `docs/COMPATIBILITY.md`: nothing new; the entities are in the manifests, whose rules it states.
- `docs/UPGRADE_NOTES.md`: the 2026-10-29 ramka 0.4.0 line gains "live settings and a settings page;
  a home adds one `lovelace:` entry".

`components/ramka/UPGRADE.md`, the 0.4.0 entry gains:

> **Live settings.** Every behaviour setting is a helper the tablet reads live, now including the
> music visual's look (`input_select.<prefix>_music_spectrum_flavour` … `_music_level_hot_db`); the
> visual's cards read them, and `music_visual_options` sets their starting values. A new admin page,
> "Ramka settings" (`dashboards/ramka-settings.<lang>.yaml`), shows them; add its `lovelace:` entry
> from the README ("Settings page").
> **Starting values.** On the first start of 0.4.0 the automation `<prefix>_settings_seed` sets the
> helpers to their defaults (new optional input `settings_defaults`) and turns
> `input_boolean.<prefix>_settings_seeded` on. **A home that already runs the Ramka keeps its tuned
> values:** the seed sets the presence and display helpers only when all seven numbers still sit at
> their minimum, as on a first install. The music visual's helpers are new and get their defaults.
> To start over later, press "Reset to defaults" on the settings page.

`components/audio-sensor/UPGRADE.md`, the 0.1.0 entry gains:

> With a board marked `music: true`, `input_select.audio_sensor_music_source` lists the boards'
> areas, that board first; the music aliases follow it, so another board can feed the Ramka's music
> visual without a render. `music: true` stays the default.

## Tests

- `tests/test_ramka_render.py`:
  - `test_settings_helpers_stable_ids`: the exact set of helper, script and automation ids, with
    and without `music_visual`, and the same set under `provides` in `component.yaml`;
  - `test_no_helper_has_initial`: no `initial:` anywhere in the package;
  - `test_seed_defaults_follow_the_inputs`: without inputs the reset script writes the catalog's
    values; with `settings_defaults` and `music_visual_options` it writes theirs; the select
    options start with the default;
  - `test_seed_rule_keeps_tuned_values` (the rule pinned): the seed's rendered conditions evaluated
    with Jinja and stub `states` / `state_attr` / `is_state` functions: flag `off` and all seven at
    minimum → full reset; flag `off` and one of seven tuned (`off_delay_s` 600) → music only;
    flag `off`, one at minimum on purpose and the rest tuned → music only; flag `on` and the music
    dB helpers at 0 → music only; flag `on` and music tuned → nothing;
  - `test_fallbacks_equal_the_defaults`: every `| int()` / `| float()` default on a settings helper
    equals that helper's default, also with `settings_defaults`;
  - `test_settings_defaults_bad_input_fails`, `test_music_visual_options_bad_values_fail`: each
    message under Inputs;
  - `test_visual_configs_bind_the_helpers`: every option of both configs is the right helper's id,
    for any prefix (replaces `test_music_visual_options_merged_key_by_key`);
  - `test_visual_configs_pass_the_card_normaliser` (rewritten): the rendered configs pass
    `normaliseConfig` with their entity values, and `resolveOptions` with states at the seeded
    defaults gives `dune` / `centre`, 2.8 px, 30 / 70 dB, 200 ms / 4 s; with every helper
    `unavailable` it gives the card's defaults;
  - `test_flavour_options_match_the_card_registry`: the two flavour selects and the palette select
    hold exactly `SPECTRUM`, `SCALAR` and `NAMED_PALETTES` from the card's files;
  - `test_settings_dashboard_per_language`: `ramka-settings.{en,de,pl}.yaml` rendered; labels from
    the translations (no English label in `de` or `pl`, no `ß` in `de`); no `kiosk_mode`;
  - `test_settings_dashboard_sections`: Presence, Display, Render-time settings and Reset always;
    Music visual, Sensor (with its visibility) and Preview only with `music_visual`; the preview
    configs equal the now-playing configs minus `active`; the read-only section lists each
    structural input with this render's values;
  - `test_music_visual_absent_renders_as_0_3_0` (changed as under Compatibility);
  - the existing `test_every_ui_key_has_en_de_pl` covers the new keys.
- `tests/test_audio_sensor_render.py`: `test_music_source_select_options` (music board first,
  then input order; `Kids' room` as an option); `test_no_music_board_no_select`;
  `test_one_board_one_option`; `test_duplicate_area_fails`; `test_aliases_follow_the_select`
  (the alias templates evaluated with stub states: the select on the second board's area reads its
  entities; `unknown` reads the `music: true` board).
- `catalog_check --strict`: the new template path, the `ui.settings.*` keys in en, de, pl.
- `tools/ha-check.sh ramka` and `tools/ha-check.sh audio-sensor` on the demo home: `fresh: 0 errors`.
- `test_privacy`, `tests/test_docs.py`.
- Staging, before the merge into `main`: a fresh Ramka starts with the defaults and the flag `on`;
  a 0.3.0 Ramka with tuned values updated to 0.4.0 keeps them and gets the music defaults; a slider
  moved on the settings page changes the tablet without a reload (brightness, the visual's line
  width); "Reset to defaults" restores the values; the Sensor section hides without
  `audio-sensor`; the page is not in the kiosk user's sidebar.

## Out of scope

- Making the structural inputs live (pages present, rooms, covers, lights, screen size, status page,
  columns): they shape the rendered dashboards; the page lists them read-only.
- Several music sources per home, one per Ramka: issue #73. The select here picks one source for the
  home's one set of aliases; #73's zone names would give each zone its own select.
- A palette of custom colour stops as a live setting.
- Resetting one section at a time; resetting `audio-sensor`'s music source (its default is the
  select's first option).
- Translated option labels in the selects.

## Open questions

1. **A missing entity in a visibility condition** (Sensor section): inference that the frontend
   treats it as `unavailable`; checked on staging. If it does not, the section is shown with
   Home Assistant's "entity not available" row in a home without `audio-sensor`, which is harmless,
   and the README says so.
2. **Issue #51** is covered by this spec (seed, flag, defaults input). Proposed: close it when this
   lands, with a link.
