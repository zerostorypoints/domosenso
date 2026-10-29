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
  input's choice first, so a fresh helper starts there; it has no `initial:`, so the tablet's choice
  survives a restart. A tile on the controls, under the player while it is on, names the current
  choice; a tap steps to the next (`input_select.select_next` with `cycle: true`). `classic`, or any
  other state, draws Ramka's own wave and creates no visual card.
- **Without audio-sensor.** Ramka's render cannot read another component's inputs, so it does not
  check that the aliases exist. Without them the card falls back to the classic wave with an info
  icon; while `ambient-wave-card` is not loaded at all, the now-playing card draws its own wave.
- **The look.** The card's own defaults apply (spectrum `dune`, level `centre`, 30 to 70 dB SPL, the
  `series` palette), except the line: 2.8 px, the width of Ramka's wave in that strip, where the
  card's 4 px is heavy. `music_visual_options` overrides them key by key, for example
  `{level: {flavour: tide}, line_width: 3}`; `flavour`, `neutral` and `hot` per kind, `palette`,
  `rise`, `fall`, `tilt` and `line_width` for both. A key it does not know fails the render. Try
  flavours on audio-sensor's Room acoustics dashboard (Wave view) before writing them down here.
- The visual moves while `binary_sensor.<prefix>_media_playing` is on, as the wave does.

## Behaviour

- **The ambient pages** (climate, air, plants, photos, status) are each optional: a page is in the
  rotation when its input is given (`climate`, `air`, `plants`, `photo_dir`), and status unless
  `status_page: false` (0.3.0). The loop and the swipes step only through the pages that are there;
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
