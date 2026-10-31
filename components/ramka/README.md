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
  (`fps`: how often the browser draws, which cannot make the data newer). The card reads their states on every update, so a change shows on the tablet at once.
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

### Music looks (unreleased)

A look sets how the visual reacts: rise, fall, hold, tilt, a six-range EQ and the neutral/hot window
of both kinds (flavour and palette stay as chosen). `input_select.<prefix>_music_template` picks one:

- `custom`: the user's own, from the helpers above plus `input_number.<prefix>_music_hold_s` and
  `input_number.<prefix>_music_eq_{sub,bass,low_mid,mid,presence,air}` (−18…+12 dB, flat at first).
  Only the user, the reset and the two scripts below write them.
- `mlp_match`, `lively`, `calm`, `analyser`: fixed templates rendered from the catalog's table. MLP
  match takes the home's `fitted` EQ once that is not flat, else its `mlp_match` EQ.

`sensor.<prefix>_music_look` carries the active look in the card's `look` shape; every
ambient-wave-card of the visual (the now-playing view, the settings preview) binds it with
`look:`, next to its helper bindings, which the card reads while the sensor is unavailable.

- **EQ presets.** `input_select.<prefix>_music_eq` loads a preset's six gains into Custom's EQ
  (`script.<prefix>_music_load_eq`, only while Custom is selected). The catalog carries `flat`, the
  WLED-derived curves, `bass_light`, `voices` and `sparkle`; `mlp_match`, `half_match` and `fitted`
  are flat until the home sets them with the input `music_eq_presets`, for example
  `{mlp_match: {bass: -10, presence: 3}}` (a key left out is 0; an unknown preset or key, or a
  value outside −18…+12, fails the render). `fitted` comes from a pink-noise calibration: Custom's
  EQ adjusted until the bands sit level at 50–75 % of the window, the values copied into the input.
- **Copy to custom.** `script.<prefix>_music_copy_to_custom` copies the active look into Custom's
  helpers and selects `custom`.
- **Blind audition.** `input_boolean.<prefix>_music_audition` (off at every start) steps through
  `input_text.<prefix>_music_audition_list` (comma-separated look ids) every
  `input_number.<prefix>_music_audition_s` seconds of playback, writing each step to the logbook and
  naming nothing on the wall; `script.<prefix>_music_audition_keep` keeps the look on screen,
  switching off returns to the look the audition began on.

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
| Music (with `music_visual`) | `input_select.<prefix>_music_{visual,palette,spectrum_flavour,level_flavour}`, `input_number.<prefix>_music_{rise_ms,fall_s,line_width_px,spectrum_neutral_db,spectrum_hot_db,level_neutral_db,level_hot_db,fps}`, `input_boolean.<prefix>_music_tilt` | music_visual |
| Music look (with `music_visual`, unreleased) | `input_select.<prefix>_music_{template,eq}`, `input_number.<prefix>_music_{eq_sub,eq_bass,eq_low_mid,eq_mid,eq_presence,eq_air,hold_s,audition_s}`, `input_text.<prefix>_music_audition_list` | music_look |

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
  after the flag is on, for a home that adds `music_visual` later. **A home that already runs the
  Ramka keeps its tuning**: its numbers are not all at their minimum, so neither they nor the
  booleans of that group are touched; it gets every page switch on and the music defaults.
- **Reset.** `script.<prefix>_settings_reset` writes the defaults again. Field `page` (`general`, a
  view) limits it to that page's helpers, field `groups` (`presence_display`, `pages`,
  `music_visual`) to those groups; with both, the helpers in both; with neither, every helper and
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
  for full brightness; Music: the flavours, line width, the refresh rate, the music sensor and its
  calibration; Photos: the time per photo and the albums;
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
- **Photos**: photos per series (5) and, in Advanced, the time per photo (10 s) and the albums, a
  checkbox each for the top-level folders of `photo_dir` that hold photos, "All albums" first (none
  ticked is all too). "All albums" keeps the ticks, greyed out, for when it is unticked. The list follows the folder: the photo index sends it after each run (at start,
  every 15 minutes). The choice is kept by `sensor.<prefix>_photo_albums` over a restart; a chosen
  album whose folder is gone stays ticked, marked "not found", and is skipped until it is back.
  With one folder per event the list is long: the card has a filter, and grouping folders (by year,
  `2025/…`) gives a shorter list.
- **Climate**: in Advanced, up to ten rooms, each a name, a main reading and a second one, picked
  with Home Assistant's entity picker, which searches the home's sensors with a unit as you type
  (`climate-rooms-card`; a plain dropdown if the picker cannot be loaded). The room tiles and both
  7-day charts follow them, room n in colour n, outside last; a reading shows its sensor's unit. A
  room without a main reading is left out, an empty name becomes the sensor's area. They are kept by
  `sensor.<prefix>_climate_rooms`; the defaults (and the reset) are the first ten of `climate`,
  temperature and humidity.
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
- **Music look** (Music, unreleased): the look select, under it the selected look's name, purpose,
  best use and why (translated; the select shows the ids) and its values as the look sensor has
  them. With `custom` selected: Custom's rows (rise, fall, hold, tilt, the four dB values, the EQ
  preset select with "Apply the selected preset", which loads the select's preset again, and the six
  EQ ranges) and the presets' names; with a template, "Copy to custom" instead. Then the blind
  audition: its switch, interval and list, and "Keep this one" while it runs. The audition switch is
  state, so no reset sets it.
- **Music sensor and calibration** (Music, Advanced): audio-sensor's
  `input_select.audio_sensor_music_source`, the offset in use with "calibrated" or "estimate", the
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
