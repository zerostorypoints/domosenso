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
  the palette, rise, fall, line width, tilt, the neutral and hot dB per kind and the refresh rate
  (`fps`). The card reads their states on every update, so a change shows on the tablet at once.
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
- Try flavours on audio-sensor's Room acoustics dashboard (Wave view) before writing them down.
- The visual moves while `binary_sensor.<prefix>_media_playing` is on, as the wave does.

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
| Music (with `music_visual`) | `input_select.<prefix>_music_{visual,palette,spectrum_flavour,level_flavour}`, `input_number.<prefix>_music_{rise_ms,fall_s,line_width_px,spectrum_neutral_db,spectrum_hot_db,level_neutral_db,level_hot_db,fps}`, `input_boolean.<prefix>_music_tilt` | music_visual |

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
  calibration: a measurement is not a preference.
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
  follows a change without a reload is inference until staging shows it (SPEC-020).
- **The standing rule, for implementers:** every Ramka extension updates the settings in the same
  change. A new behaviour gets its live setting, belongs to one page and one group, and is covered
  by the page's reset and the global one; `tests/test_ramka_render.py::test_every_setting_is_on_a_page_and_reset`
  fails on a helper that is neither a named state helper nor reset.

## Behaviour

- **The ambient pages** (climate, air, plants, photos, status) are each optional: a page is in the
  rotation when its input is given (`climate`, `air`, `plants`, `photo_dir`), and status unless
  `status_page: false` (0.3.0), and while its page switch is on (0.4.0, Live settings). The loop and
  the swipes step only through the pages that are there;
  `input_select.<prefix>_ambient` keeps all five options (FROZEN), and a render that leaves no page
  fails. The times are fixed: climate 30 s, air 15 s, plants 20 s, five photos of 10 s, status 15 s;
  one pass is their sum (130 s with all five). The package's comments still quote 130 s and the
  status stage whichever pages a home has.
- **Why `status_page: false`**: the status page is read-only. A home whose controls screen already
  shows its lights and covers, and that has no doors, power or locks to list, gains nothing from it
  in the rotation.

- **`off_delay_s`**: the radar loses people who sit still, so a short delay sends the screen off
  and back on many times a day. In the first home 120 s gave 40 to 50 such offs a day; 300 s cut
  the short offs by 40 % and the median ambient stretch went from 2.3 to 9.6 minutes.
- A reload of the scripts stops the running ambient loop; the watchdog automation restarts it
  within five minutes. Template entities reload with `template.reload`.
- After a change to the input_select options, restart Home Assistant rather than reloading them
  (UPGRADE.md, 0.1.0).
