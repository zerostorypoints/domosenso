# ramka: field notes

What a home needs to know beyond `component.yaml` and the comments in `templates/package.yaml.j2`.
Breaking changes and the steps for an existing home: [UPGRADE.md](UPGRADE.md).

## Setting up the tablet

Step by step, with every Android and Companion app setting and what to switch off, on the tested
TCL tablet: [docs/tablet-setup.md](../../docs/tablet-setup.md).

## Photos

How the photos page draws a folder and its photos, where the event names and dates come from, and
who can open the files: [PHOTOS.md](PHOTOS.md).

## The tablet

- Android with the Home Assistant Companion app, signed in as its own Home Assistant user. Grant
  the app *Modify system settings* and *Display over other apps*, set the lock screen to None, and
  turn the app's own *Keep screen on* **off**: with it on, the panel never sleeps.
- **Companion app 2026.6.5 can get stuck awake.** It applies *Keep screen on* to the window only when
  the page is created or resumed, so a wake with `command_screen_on: keep_screen_on` leaves a flag
  that the later `release` cannot clear. The package therefore never sends `keep_screen_on`: it
  wakes with `release` and a long `command_screen_off_timeout`. To unstick a tablet: screen off,
  `command_launch_app` with the Android Settings package, then the Home Assistant app again.
  2026.8.4 applies the preference live.
- **`command_webview` opens a new hidden copy of the app on every call.** The package wakes with
  `command_launch_app` and reloads the page through `input_button.<prefix>_reload`
  (corner-taps-card's `reload:` option). `kiosk_reload` exists only in the iOS app.
- The tested TCL tablet stops charging at 80 % by itself and holds there on mains, so no smart plug
  is needed to protect the battery. With `alert_notify`, `<prefix>_charger_failed` fires after the
  charger type reads `none` or the battery is under 20 % for 30 minutes.
- The Companion app has no camera or microphone; a camera needs another app (the free IP Webcam
  serves only while it is on screen).
- The tested tablet is 1100 × 720 CSS pixels at device pixel ratio 2 (`devices/tcl-9469x.yaml`). Judge a
  layout from screenshots at that size on staging; a desktop browser pane is not a faithful tablet.
- **Screen sizes (0.2.0).** The `screen` input takes the tablet's CSS viewport from `domosenso probe`.
  The one tested layout fits 1024–1280 × 720–800 CSS px: every page shot on staging at both corners
  (2026-10-22, desktop Chromium at DPR 2, header hidden as kiosk-mode does). Below about 1000 px wide
  the view drops to two columns and the controls scroll; a portrait tablet needs a layout of its own.
- German status words are cut off on the status page at 1100 × 720 ("Eingefah…", "Geschlos…"); seen
  on staging 2026-10-22, already so in 0.1.2.

## Dashboards and cards

- A YAML dashboard does not refresh on a page that is already open: press the reload button
  (`input_button.<prefix>_reload`) after a dashboard or resource change.
- Home Assistant removes a card that hides itself while its `connectedCallback` runs, so
  `disconnectedCallback` fires first and listeners added afterwards are never removed; every
  dashboard rebuild then adds one more. `corner-taps-card` and `photo-frame-card` keep one set of
  listeners per page for that reason.
- `/local/` files are cached for 31 days. A new version of the cards goes to a new
  `www/domosenso/ramka/<version>/` directory and the resources' URLs change in place.
- Day stepping in the agenda must use calendar dates, not 24-hour steps: on the day the clocks go
  back a 24-hour step shows one day twice (`agenda-card.test.mjs` covers it).

## Music visual

With `music_visual: spectrum` or `level` (0.4.0) the now-playing view draws the room's music in its
wave strip: audio-sensor's `ambient-wave-card`, reading the aliases of the board marked
`music: true` (`sensor.music_spectrum` with `sensor.music_spl_offset`, or `sensor.music_level`).

- **Switching.** `input_select.<prefix>_music_visual` holds `spectrum`, `level` and `classic`, the
  input's choice first, so a fresh helper starts there; it has no `initial:`, so the choice survives
  a restart. It is set in Home Assistant (the settings dashboard's Music page), not on the tablet:
  the Controls page has no visual tile. `classic`, or any other state, draws Ramka's own wave and
  creates no visual card.
- **Without audio-sensor.** Ramka's render cannot read another component's inputs, so it does not
  check that the aliases exist. Without them the card falls back to the classic wave with an info
  icon; while `ambient-wave-card` is not loaded at all, the now-playing card draws its own wave.
- **The look is live.** Every option of the two visual configs names a helper (Live settings
  below): the flavour per kind (`input_select.<prefix>_music_spectrum_flavour`, `_level_flavour`),
  the palette, rise, fall, line width, tilt, the neutral and hot dB per kind and the redraw rate
  (`fps`: how often the browser draws, which cannot make the data newer; no settings page shows
  it, so it stays at its starting value, 30, unless changed in Home Assistant). The card reads their states on every update, so a change shows on the tablet at once.
  `music_visual_options` gives their starting values, key by key, for example
  `{level: {flavour: tide}, line_width: 3}`; absent keys take the card's defaults (spectrum `dune`,
  level `centre`, 30 to 70 dB SPL, the `series` palette, rise 200 ms, fall 4 s, 30 fps), the line
  Ramka's 2.8 px, the width of its own wave in that strip. The render checks them: a flavour of the
  other kind, a palette other than `zones`, `series` or `calm` (a palette of colour stops cannot be a
  select option), a number outside its helper's range, or hot not above neutral fails it.
- **What the card does with an unusable state:** `unknown` or `unavailable` (only while a helper
  does not exist yet) gives that option's card default, so the line falls to the card's 4 px. A hot
  set at or below neutral on the settings page is not stopped there: the visual shows the kind's
  default pair (30 to 70 dB) until it is corrected.
- Try flavours on the Ramka's settings, Music (Preview) before writing them down.
- The visual moves while `binary_sensor.<prefix>_media_playing` is on, as the wave does.

### Response profile (unreleased)

A response profile sets how the visual reacts: rise, fall, hold, tilt and a six-range EQ. It does
not change the colour range: the neutral and hot dB values stay the user's own helpers whichever
profile is on, as do flavour and palette. `input_select.<prefix>_music_template` picks one. **Every
profile is editable and keeps its own values**:

- `custom`: the helpers above (`input_number.<prefix>_music_{rise_ms,fall_s}`,
  `input_boolean.<prefix>_music_tilt`) plus `input_number.<prefix>_music_hold_s` and
  `input_number.<prefix>_music_eq_{sub,bass,low_mid,mid,presence,air}` (−18…+12 dB, flat at first).
  Their ids are those of the Custom profile before the templates were editable, so a home's tuning stays.
- `behind_speakers`, `lively`, `calm`, `analyser`: ten helpers each,
  `input_number.<prefix>_music_<id>_{rise_ms,fall_s,hold_s,eq_sub,eq_bass,eq_low_mid,eq_mid,eq_presence,eq_air}`
  and `input_boolean.<prefix>_music_<id>_tilt`, with Custom's ranges. They start at the catalog's
  values for the template (the table in `templates/package.yaml.j2`); `behind_speakers` starts from
  the home's `fitted` EQ once that is not flat, else its `behind_speakers` EQ.

Only the user, the seed and the reset, and the EQ loader below write a profile's helpers; choosing a
profile writes none. `sensor.<prefix>_music_look` carries the selected profile (attributes rise,
fall, hold, tilt, eq, read from that profile's own helpers, each falling back to the profile's
starting value while its helper is unavailable) in the card's `look` shape; a select state that is
no entry id is Custom. Every ambient-wave-card of the visual (the now-playing view, the settings
preview) binds it with `look:`, next to its helper bindings, which the card reads while the sensor
is unavailable.

- **EQ presets.** `input_select.<prefix>_music_eq` loads a preset's six gains into the selected
  profile's EQ (`script.<prefix>_music_load_eq`, field `preset`; an id that is no preset writes
  nothing and logs a warning). The catalog carries `flat`, the WLED-derived curves, `bass_light`,
  `voices` and `sparkle`; `behind_speakers`, `half_match` and `fitted` are flat until the home sets
  them with the input `music_eq_presets`, for example `{fitted: {bass: -6, air: 2}}` (a key left out
  is 0; an unknown preset or key, or a value outside −18…+12, fails the render). `fitted` comes from
  a pink-noise calibration: a profile's EQ adjusted until the bands sit level at 50–75 % of the
  window, the values copied into the input.

## Live settings

Since 0.4.0 every behaviour setting of the Ramka is a helper its automations and cards read live;
none has an `initial:` (Home Assistant would reset it at every restart), each is restored across
restarts. **Settings live only in Home Assistant**: the tablet's Controls page keeps only the
approach toggle it has had since 0.1.0.

| part | helpers | group |
|---|---|---|
| General | `input_boolean.<prefix>_near_enabled`, `input_number.<prefix>_{off_delay_s,brightness_min,brightness_max,near_cm,near_s,controls_hold_s,lux_max}` | presence_display |
| General | `input_select.<prefix>_theme_mode`, `input_boolean.<prefix>_settings_advanced` | pages |
| each view | `input_boolean.<prefix>_page_{climate,air,plants,photos,status,calendar,music}` | pages |
| Plants (with `plants`, 0.7.0) | `input_number.<prefix>_{plants_per_page,plants_page_s}` | plants |
| Climate (with `climate`, unreleased) | `input_number.<prefix>_climate_slots`; the widgets, `sensor.<prefix>_climate_rooms`, and `input_boolean.<prefix>_climate_thresholds` are group climate | climate_slots |
| Music (with `music_visual`) | `input_select.<prefix>_music_{visual,palette,spectrum_flavour,level_flavour}`, `input_number.<prefix>_music_{rise_ms,fall_s,line_width_px,spectrum_neutral_db,spectrum_hot_db,level_neutral_db,level_hot_db,fps}`, `input_boolean.<prefix>_music_tilt` | music_visual |
| Music look (with `music_visual`, unreleased) | `input_select.<prefix>_music_{template,eq}`, `input_number.<prefix>_music_{eq_sub,eq_bass,eq_low_mid,eq_mid,eq_presence,eq_air,hold_s}` | music_look |
| Music profiles (with `music_visual`, unreleased) | per template (`behind_speakers`, `lively`, `calm`, `analyser`): `input_number.<prefix>_music_<id>_{rise_ms,fall_s,hold_s,eq_sub,eq_bass,eq_low_mid,eq_mid,eq_presence,eq_air}`, `input_boolean.<prefix>_music_<id>_tilt` | music_profiles |

- **Defaults.** The catalog's: approach on, off delay 300 s, brightness 16 to 204, near 100 cm for
  1 s, controls hold 5 s, full brightness at 200 lx, theme `dark`, every page on, Advanced off; the
  music values above. `settings_defaults` overrides the General ones for a home, for example
  `{off_delay_s: 600}`; an unknown key, a value outside its helper's range or `brightness_min` above
  `brightness_max` fails the render. The templates' fallbacks (`| int(…)`, `| float(…)`) are the
  same values.
- **Seeding.** The automation `<prefix>_settings_seed` runs at every start. While
  `input_boolean.<prefix>_settings_seeded` is off it hands `script.<prefix>_settings_reset` the
  groups that are still untouched and turns the flag on. A group is untouched when each of its
  numbers is `unknown`, `unavailable` or at its own minimum, which is what Home Assistant gives a
  helper without `initial:` and without a restored state (the sliders of issue #51). The
  presence_display group needs all seven numbers so; the pages group is new in 0.4.0 and is seeded
  whenever the flag is off; the music_visual group needs its four dB helpers at 0 and is also seeded
  after the flag is on, for a home that adds `music_visual` later; music_look (Custom's EQ and hold)
  and music_profiles (the templates' numbers) likewise, so a home that had the profiles before they
  were editable gets the templates' values at its next start. **A home that already runs the
  Ramka keeps its tuning**: its numbers are not all at their minimum, so neither they nor the
  booleans of that group are touched; it gets every page switch on and the music defaults.
- **Reset.** `script.<prefix>_settings_reset` writes the defaults again. Field `page` (`general`, a
  view) limits it to that page's helpers, field `groups` (`presence_display`, `pages`,
  `music_visual`, `music_look`, `music_profiles`, …) to those groups; with both, the helpers in both; with neither, every helper and
  `input_boolean.<prefix>_ambient_music` too. It never touches audio-sensor's music source or
  calibration: a measurement is not a preference. The one audio-sensor helper it sets, while it is
  there, is the sensor update rate (`input_select.audio_sensor_music_spectrum_rate`, to `normal`).
- **Sensor update rate.** Music, Advanced also shows audio-sensor's update rate (`eco`, `normal`,
  `fast`; hidden in a home without audio-sensor). `<prefix>_music_watching` keeps
  `input_boolean.audio_sensor_music_watching` on while any Ramka's music view is on, and `fast`
  applies only then; audio-sensor's README ("Latency and update rate") has the profiles.
- **Page switches.** `input_boolean.<prefix>_page_<view>` takes a view out live; the render is the
  outer limit (a view the render left out stays out whatever its switch says). The ambient pages:
  `sensor.<prefix>_ambient_pages` lists the rendered pages whose switch is on, in rotation order;
  the loop, the swipes and swipe up step through that list. It is never empty: with every switch off
  it lists the first rendered page and its attribute `all_off` is `true`. A page switched off while
  it shows leaves at the end of its stage (at most 50 s, the photos), or at once with a swipe.
  Music off: `binary_sensor.<prefix>_music_view` stays off, so ambient shows the rotation while the
  player plays. Calendar off: the calendar buttons on the controls hide and
  `script.<prefix>_show_calendar` does nothing.
- **Theme mode.** `input_select.<prefix>_theme_mode` (`dark`, `light`) sets the server's default
  theme, `ramka-dark` or `ramka-light` (`themes/ramka.yaml`), through the automation
  `<prefix>_theme_mode` at start and on every change. That reaches every browser and user whose
  profile theme is "Backend-selected", on every dashboard, not only the tablet; the Ramka's views
  carry no theme of their own. A user who wants another look picks a theme in the profile. The
  two themes hold one mode each (`modes: {dark: …}`, `modes: {light: …}`, the series colours): the
  frontend forces a single-mode theme into that mode and draws its own defaults of it, whatever the
  browser's dark-mode setting (`themes/ramka.yaml` names the frontend version). That an open page
  follows a change without a reload is inference until staging shows it (SPEC-021).

## Settings page

The "Ramka settings" dashboard (`dashboards/ramka-settings.<lang>.yaml`, one per language the home
renders) changes every live setting from Home Assistant. It is for admins: a YAML dashboard cannot
restrict itself, so the home's `configuration.yaml` entry does, with `require_admin: true`, and it
stays out of the kiosk user's sidebar. Add it by hand (the catalog does not render
`configuration.yaml`); until it is there `domosenso status` prints `missing-dashboard-entry
dashboards/ramka-settings.<lang>.yaml`.

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

- **Pages**, in this order: General, Climate, Air, Plants, Photos, Status, Calendar, Music. Every
  page but General starts with its view's switch (with a note while it is off) and ends with "Reset
  to defaults" for that page; General's resets every setting. Each asks for a confirmation. Each page
  also lists its render-time inputs read-only with this render's values (General: the screen size).
- **Basic and Advanced.** The Advanced cards (General: near distance and hold, controls hold, lux
  for full brightness; Music: the music sensor (source and update rate), the flavours, line width,
  the profile settings, the colour range and the calibration; Photos: the albums;
  Air: the limits; Climate: the rooms) show while "Show advanced settings"
  (`input_boolean.<prefix>_settings_advanced`) is on; it sits on General and on every page with
  Advanced parts (Music, Photos, Air, Climate).
- **Open the Ramka view** (General): the tablet's dashboard in this browser, header and sidebar
  shown (`/<path>/ramka?disable_km`), in the page's language when `dashboard_paths` maps it, else
  `dashboard_path`. A desktop browser lays out the view for its own window, not the tablet's
  1100 × 720, so it shows the values, not the tablet's exact layout.
- **Language** (General): render-time. Each language is its own Ramka dashboard, and the tablet
  shows the one it opens (the tablet user's default dashboard, or the Companion app's start page);
  General says so. A live switch waits for the spike (SPEC-021, "language, a spike first"), which
  has not run on the tested tablet yet.
- **Photos**: photos per series (5), the time per photo (10 s) and, in Advanced, the albums, a
  checkbox each for the top-level folders of `photo_dir` that hold photos, "All albums" first (none
  ticked is all too). "All albums" keeps the ticks, greyed out, for when it is unticked. The list follows the folder: the photo index sends it after each run (at start,
  every 15 minutes). The choice is kept by `sensor.<prefix>_photo_albums` over a restart; a chosen
  album whose folder is gone stays ticked, marked "not found", and is skipped until it is back.
  With one folder per event the list is long: the card has a filter, and grouping folders (by year,
  `2025/…`) gives a shorter list.
- **Climate**: in Advanced, the number of widgets (`input_number.<prefix>_climate_slots`, 1 to 20,
  default 10), the switch **Threshold-based colours** (`input_boolean.<prefix>_climate_thresholds`,
  default off) and one row per widget (`climate-rooms-card`). Every row is a widget of a type,
  chosen in the dropdown of its header; a new row is Empty:
  - **Temperature**: a temperature sensor and a humidity sensor;
  - **Air quality**: a CO₂ sensor and a PM2.5 sensor;
  - **Custom**: any two sensors with a unit;
  - **Empty**: an empty tile on the Ramka, the size of the others, so widgets can be placed where
    they should sit in the grid; empty rows at the end are left out.

  Each reading is picked with Home Assistant's entity picker, which searches as you type, of the
  sensors with a unit of the type's device class (`temperature`, `humidity`, `carbon_dioxide`,
  `pm25`; every sensor with a unit when the home has none of that class); a plain dropdown if the
  picker cannot be loaded. A new type keeps the name and the readings that fit it. Each row's
  **Settings** opens a dialog (a modal over the page; Escape, a tap beside it or Cancel close it):
  a Temperature widget's comfort ranges (temperature 20 to 24 °C and humidity 40 to 60 % unless
  set), kept in the widget; an Air quality widget's limits, which are the Air page's own helpers
  (`input_number.<prefix>_air_{co2,pm2_5}_{raised,high}`, a change shows on the Air page too; a
  reading without them, as in a home whose `air` input lacks it, is said to be not set up); a Custom widget's
  colour, neutral or one of the series colours. The order changes by dragging a row by its handle
  (mouse, touch or pen: pointer events, so it works on the tablet and a phone) or with the row's up
  and down buttons (keyboard, screen readers); the picker is a plain ordered list, not the Ramka's
  grid.

  The tiles and both 7-day charts follow the rows: the n-th widget with a reading (empty ones
  skipped) in series colour n, in its tile's main value, the picker's dot and its chart lines (also
  when an earlier widget has no second reading), outside last. The series colours are the theme's
  without its threshold colours (blue, amber, red, orange, light blue): slots 4, 5, 6, 9, 11, 10 in
  turn. With **Threshold-based colours** on, the tiles colour by the thresholds instead: a
  Temperature widget's temperature and humidity blue below their range, neutral (the theme's text
  colour) within, red above; an Air quality widget's CO₂ and PM2.5 neutral while good, amber
  raised, red high, from the Air page's limits; a Custom widget's main value neutral or its chosen
  colour. The chart lines keep the series colours, and the layout is the same either way. A
  reading shows its sensor's unit, an empty name becomes the sensor's area. Fewer widgets than
  filled rows deletes nothing: the widgets beyond are kept but not shown on the Ramka, and the
  picker says how many there are, with a button to remove them. The rows are kept by
  `sensor.<prefix>_climate_rooms` (attribute `rooms`: up to twenty widgets, each
  `{type, label, main, extra, ...}` or `{type: empty, spacer: true}`, never an empty one at the end;
  state: how many have a reading); an entry from before the types reads as Temperature when its
  main sensor is a temperature, else Custom, and is stored so at the next save. The defaults (and
  the reset) are the first ten of `climate`, Temperature widgets of their temperature and humidity.
- **Air**: a switch per configured reading (off leaves its tile out, the others share the room)
  and, in Advanced, the two limits of each where its colour changes; the defaults are those in
  "Dashboards and cards". An unusable limit keeps the default.
- **Calendar by URL** (Calendar): links to Home Assistant's own add flows for an ICS link
  (`remote_calendar`) or a CalDAV account (`caldav`, see `components/calendar`), and the step after:
  the new `calendar.*` entity into `calendar`, a render and a deploy. Entering the URL or a password
  is a human step in Home Assistant.
- **Not configured.** A view the render left out (`climate`, `air`, `plants`, `photo_dir` absent,
  or `status_page: false`) shows only a note naming its input and the way to add it: the inputs
  file, `domosenso render ramka` and a deploy. Without `music_visual` the Music page keeps the
  now-playing switch and says the same of the visual.
- **Preview** (Music): the now-playing card's two visual configs, bound to the same helpers but
  without `active`, so they draw while nothing plays; the one the visualization select names
  shows, and `classic` shows a note, as does a home without audio-sensor (its music source select
  unavailable), where the card's element does not exist. Each is 63 px high, the strip on the 1100 × 720 tablet, and
  as wide as the page: on a desktop browser or the tablet that is the strip's own proportion; on a
  phone the strip is narrower at the same height.
- **Music page layout** (unreleased): Basic (the page switch, visualization, palette, the response
  profile and the Advanced switch), then Advanced, the whole section shown while the switch is on
  (one "Music sensor" card with audio-sensor's music source and its sensor update rate, each row
  hidden while unavailable and the card while both are; the two flavours and line width), the
  Preview across both columns, then Profile settings and the Colour range, both shown only while
  the Advanced switch is on, and the Calibration. The redraw rate has no row.
- **Response profile** (Music, unreleased): the profile select has an (i) at its end
  (`custom:ramka-info-select-row`, `cards/info-select-row.js`): hovering with a mouse shows the
  selected profile's purpose, best use and why / when (translated; the select shows the ids) in a
  floating tooltip beside the (i) (below it, above when there is no room, kept inside the window,
  over the cards without moving them), a tap pins it open on a tablet or phone, a tap elsewhere,
  Escape or a scroll closes it. Profile settings holds one
  card per profile, shown while that profile is selected: rise, fall, hold, tilt, the EQ preset
  select (with an (i) that tells what the selected preset does, its best use, why / when, and its
  curve, "Curve: sub −5 dB, bass −10 dB, …", built at render time from the preset table with the
  home's `music_eq_presets`; a flat one says it is flat until set), "Apply the selected preset" (it loads the
  select's preset again into this profile) and the six EQ ranges. The Colour range grid holds the
  four neutral and hot dB values, which no profile changes. The page's "Reset to default" restores
  everything on the Music page, every profile included.
- **Music sensor and calibration** (Music, Advanced): audio-sensor's
  `input_select.audio_sensor_music_source` (in the Advanced section's Music sensor card) and, in the Calibration
  section, the offset in use with "calibrated" or "estimate", the
  mic gain (read-only: changing it is a flash), the note, the procedure, the measured offset and
  note inputs and "Apply the calibration" (`script.audio_sensor_apply_calibration`). Ramka's render
  cannot see audio-sensor, so these cards hide while the select is unavailable; that a missing
  entity counts as unavailable in a visibility condition is inference until staging shows it
  (SPEC-021), and otherwise a home without audio-sensor sees "entity not available" rows there.
  No reset touches the calibration: a measurement is not a preference.
- **Option values** (`dune`, `series`, `dark`) read as they are: helper options are English, and a
  YAML `input_select` has no translated labels.
- **The standing rule, for implementers:** every Ramka extension updates the settings dashboard in
  the same change. A new behaviour gets its live setting on its view's page, Basic or Advanced,
  belongs to one page and one group, and is covered by the page's reset and the global one;
  `tests/test_ramka_render.py::test_every_setting_is_on_a_page_and_reset` fails on a helper that is
  neither a named state helper nor on a page, and on one on a page that the reset does not set.

## Preview dashboard

With `preview_dashboard: true` the render also writes the "Ramka preview" dashboard
(`dashboards/ramka-preview.<lang>.yaml`, one per language), to look at every screen one by one and
change its settings without waiting for the rotation; the live Ramka (or "Open the Ramka view" on
the settings' General page) stays the live view. Without the input the template renders empty and
no file is written. It is for admins, like the settings dashboard:

```yaml
lovelace:
  dashboards:
    ramka-preview:
      mode: yaml
      filename: dashboards/ramka-preview.en.yaml   # or .de / .pl
      title: Ramka preview
      icon: mdi:monitor-eye
      show_in_sidebar: true
      require_admin: true
```

- **Views**: the ambient pages the home renders, in the rotation's order (climate, air, plants,
  photos, status), then the calendar and the now-playing screen (with the music visual when
  `music_visual` is set). Each has the title, icon and path of its settings page.
- **Same cards.** `templates/ramka-preview.lang.yaml.j2` extends the Ramka dashboard's template and
  calls its screen blocks (`music`, `climate`, `air`, `plants`, `photos`, `status`, `calendar`), so
  a screen cannot look different here. With `preview` set the blocks leave out their visibility,
  count the card heights from `screen`'s height instead of the viewport, and the photo layer
  (`contained: true`) stays in the frame. No kiosk mode, corner taps, presence or rotation, and no
  controls screen: the cards read the live helpers, whatever the tablet shows.
- **The frame**: `custom:screen-frame-card` lays the sections out as the sections view does on the
  tablet (36 columns, 56 px rows, 8 px gaps and padding) in a box of `screen` (width x height CSS
  px), scaled down as a whole in a narrower browser. Under it a link to the screen's settings page,
  `/<settings path>/<view>`; `settings_paths` names the settings dashboard per language when it is
  not at `ramka-settings`. A card's own `visibility` is not applied (the screens' cards have none),
  and the photo caption still sizes itself from the browser's width (`vw`).

## About page

The settings dashboard's last page (SPEC-023) says what the home runs, read-only:

- **Components**: the lock's (`sensor.domosenso_components`, written by the `domosenso` command
  into `packages/domosenso.yaml`) and any other Domosenso component Home Assistant shows (a rendered
  file's stamp, a board flashing a catalog firmware); a board that reports another version than its
  device file pins says so.
- **Related components**: the integrations whose entities the components really use, core or HACS,
  their version and, for HACS, a newer one.
- **Devices**: the devices behind those entities, model, firmware, the hub they connect through, and
  their status (red when unavailable, or when the device's own connection sensor is off).

Names link to their page: a component to domosenso.org, a device the catalog knows to its device
page, an integration to its documentation. A device or integration the catalog does not know is
listed all the same, without a link.

The lists come from `shell/domosenso_discover.py`, which reads Home Assistant's own registries
inside the container (read-only), at start, nightly at 04:10 and on **Refresh**. Its result is
`sensor.<prefix>_discovery`, kept out of the recorder. What the registries cannot say, a home writes
in `<config_dir>/domosenso_discovery.yaml` (add it to `local:` in `domosenso.yaml`):

```yaml
# Entity ids the home's own templates build at runtime: a template entity whose definition
# contains a `when` string uses every id matching `match` (and the `also` ids built from its groups).
rules:
  - when: [amp_active]           # a macro in the home's custom_templates/
    match: 'binary_sensor[.]amp_(?P<d>.+)_present$'
    also: ['sensor.amp_{d}_source']
# Links Home Assistant does not record, by device id (Settings → Devices, the id in the URL): a
# Bluetooth sensor and the ESPHome proxy that relays it.
declared_links:
  - {device: <the sensor's device id>, via: <the proxy's device id>}
```

The links come from `shell/domosenso_catalog.json`, which ships with the Ramka
(`tools/catalog_index.py`): a device added to the catalog is linked after the next Ramka update.

## Behaviour

- **The ambient pages** (climate, air, plants, photos, status) are each optional: a page is in the
  rotation when its input is given (`climate`, `air`, `plants`, `photo_dir`), and status unless
  `status_page: false` (0.3.0), and while its page switch is on (0.4.0, Live settings). The loop and
  the swipes step only through the pages that are there;
  `input_select.<prefix>_ambient` keeps all five options (FROZEN), and a render that leaves no page
  fails. The times are fixed: climate 30 s, air 15 s, five photos of 10 s, status 15 s; plants take
  `plants_page_s` per page for at most two pages (0.7.0; 10 s with the defaults and up to six
  plants); one pass is their sum (130 s with all five before 0.7.0). The package's comments still quote 130 s and the
  status stage whichever pages a home has.
- **Why `status_page: false`**: the status page is read-only. A home whose controls screen already
  shows its lights and covers, and that has no doors, power or locks to list, gains nothing from it
  in the rotation.

- **`off_delay_s`**: the radar loses people who sit still, so a short delay sends the screen off
  and back on many times a day. In the first home 120 s gave 40 to 50 such offs a day; 300 s cut
  the short offs by 40 % and the median ambient stretch went from 2.3 to 9.6 minutes.
- After a Home Assistant restart an open tablet page gets its forecast back by itself: the clock
  card subscribes again when the page reconnects and when the weather entity is back, and retries
  (10 s, 30 s, 60 s, then every 5 min) until the weather integration answers with days (0.3.1). No reload automation is needed.
- A reload of the scripts stops the running ambient loop; the watchdog automation restarts it
  within five minutes. Template entities reload with `template.reload`.
- After a change to the input_select options, restart Home Assistant rather than reloading them
  (UPGRADE.md, 0.1.0).
