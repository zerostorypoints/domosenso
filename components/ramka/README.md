# ramka: field notes

What a home needs to know beyond `component.yaml` and the comments in `templates/package.yaml.j2`.
Breaking changes and the steps for an existing home: [UPGRADE.md](UPGRADE.md).

## Setting up the tablet

From a reset Android tablet to the Ramka on screen. The steps are those of the tested tablet
(`devices/tcl-9469x.yaml`); menu names differ between Android makers. The reasons behind the
settings are in "The tablet" below.

**In Home Assistant, before the tablet:**

1. Create a Home Assistant user for the tablet (Settings → People → Add person, *Allow login* on,
   not an administrator). Its name goes into `kiosk_user` if you use kiosk-mode.
2. Optional: install `kiosk-mode` from HACS (frontend). It hides the header and sidebar for the
   tablet's user only; `?disable_km` on the URL shows them again.

**On the tablet, in Android:**

3. Update Android and *Android System WebView* (Play Store). The cards need WebView 123 or newer;
   the version is under Settings → Apps → Android System WebView.
4. Lock screen: None (Settings → Security). The package wakes the screen; a PIN or swipe would
   stop it there.
5. Install *Home Assistant* (the Companion app) from the Play Store, 2026.8.4 or newer if the Play
   Store offers it (2026.6.5 can get stuck awake, below).
6. Give the app, under Settings → Apps → Home Assistant:
   - *Modify system settings*: without it the brightness and screen-timeout commands are dropped;
   - *Display over other apps*: without it `command_launch_app` cannot bring the app forward after
     a wake;
   - battery: unrestricted (no battery optimisation), or Android stops it in the background.
7. Set the tablet's own charge limit (battery protection) if it has one; without one, plan a smart
   plug schedule. The tested TCL stops at 80 % by itself.

**In the Companion app:**

8. Sign in to your Home Assistant as the tablet's user, not as yourself.
9. App → Settings → Companion app:
   - device name: a short name; it becomes the slug of `notify.mobile_app_<slug>` and
     `sensor.<slug>_*`, which go into the `tablet_device` input;
   - *Keep screen on*: **off**;
   - *Fullscreen* on, *Screen orientation* landscape, *Always show first view on app start* on;
   - *Persistent connection*: Always;
   - Manage sensors: enable `light_sensor`, `battery_level`, `app_importance`, `charger_type`,
     `battery_temperature`, `is_charging` (and `interactive` to see the screen state);
     *Sensor update frequency*: Fast always.
10. Profile (in the app, as the tablet's user): default dashboard = the Ramka's (`dashboard_path`),
    language and time format matching the dashboard's language. Once kiosk-mode is active the
    profile page is hidden: set them first, or open it with `?disable_km`.

**Measure, then render:**

11. `domosenso probe <target> --install`, open `<HA URL>/domosenso-probe/0` in the Companion app
    held in its final orientation, `domosenso probe <target> --read`, then `--remove`. Its
    `viewport` goes into the `screen` input; `webview` under 123 or `json-modules no` means the
    cards will not load; `user admin` means the app is signed in as an administrator (step 8).
12. Fill the inputs (`tablet_device`, `screen`, `kiosk_user`, the radar), render, deploy to staging
    and look at the shots, then production. Press `input_button.<prefix>_reload` once the tablet
    has the dashboard.
13. Optional: pin the app (Settings → Security → App pinning) so a guest cannot leave it. The
    corner-taps card's two top corners are the way out: top-left opens `exit_left`, top-right
    reloads the Ramka with kiosk-mode off.

**Check it works:** with nobody near the radar for `off_delay_s` the screen goes dark; walking in
wakes it on the ambient page; `sensor.<slug>_app_importance` reads `foreground` while it is on and
`top_sleeping` while it sleeps. A screen that never sleeps is *Keep screen on* (step 9, and the
2026.6.5 note below); one that wakes onto the lock screen is step 4; one whose brightness never
changes is step 6.

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

## Behaviour

- **`off_delay_s`**: the radar loses people who sit still, so a short delay sends the screen off
  and back on many times a day. In the first home 120 s gave 40 to 50 such offs a day; 300 s cut
  the short offs by 40 % and the median ambient stretch went from 2.3 to 9.6 minutes.
- A reload of the scripts stops the running ambient loop; the watchdog automation restarts it
  within five minutes. Template entities reload with `template.reload`.
- After a change to the input_select options, restart Home Assistant rather than reloading them
  (UPGRADE.md, 0.1.0).
