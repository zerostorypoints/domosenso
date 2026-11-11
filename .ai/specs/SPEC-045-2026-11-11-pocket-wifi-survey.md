# SPEC-045 — A guided Wi-Fi spot survey in Pocket, measured with the phone

**Status:** approved 2026-11-11 by the maintainer ("Approve, write plan").

**Source:** the maintainer, 2026-11-11, after SPEC-044 was prototyped on a real home: surveying
needs a laptop today; the maintainer carries an iPhone and wants the survey in Pocket, guided by the
model, with readings checked before they are kept. Designed in conversation section by section
(who surveys, where it lives, failed checks, the iPhone's return path, data, stages). The answers
are recorded under **Decisions**. Walk recordings, for calls dropping while walking, are the
companion [SPEC-046](SPEC-046-2026-11-11-pocket-wifi-walks.md), built on this spec's capture.

Builds on [SPEC-044](SPEC-044-2026-11-10-wifi-coverage.md) (the model, `wifi.samples`, the fit,
`nextSpots`) and Pocket's design system (`components/pocket/DESIGN.md`). No version bump: the
release that carries it is the maintainer's call. Inference is marked as such.

## Goal

An administrator walks the home with only a phone. Pocket shows on the floor plan where a reading
would teach the model most (handover zones, rooms without a reading, places far from any reading of
their access point). At a spot the person taps where they stand and presses **Measure**; the phone
reads its Wi-Fi link several times, Pocket checks the result, shows it against the model, and keeps
it as a `wifi.samples` entry. The calibrated map updates at once.

Placement test (`docs/PRINCIPLES.md`):

1. Home Assistant has no survey and no coverage model; the Companion apps report a few Wi-Fi
   sensors (Android: signal, BSSID, frequency, link speed; iOS: SSID and BSSID only) but nothing
   ties them to a place.
2. Every home with the floorplan's Wi-Fi maps and a phone gains from it; nothing is specific to one
   home. **Components: pocket (the page, capture, checks) and floorplan (schema, fit, spots).**
3. A home's readings stay in its own plan.

## Decisions (the maintainer, 2026-11-11)

- **Who surveys:** administrators only. Readings are saved into the plan as the floor plan's edit
  mode saves it (`lovelace/config/save`, admin-only, verified in HA core's `lovelace/websocket.py`).
- **Where:** a Pocket page of its own, **Wi-Fi survey** (`#/wifi-survey`), reached from the System
  page; the Floor plan page is unchanged.
- **Failed checks:** hard failures are not kept and ask for a retry; soft ones show the reason and
  offer **Keep** or **Retry**. A reading is never refused for disagreeing with the prediction: that
  disagreement is what calibration needs.
- **iPhone return path:** both: a Home Assistant event first (Companion app), an x-callback result
  when Pocket runs in Safari without the app.
- **Keep everything the phone gives:** every scan's every field is kept with the sample, not only
  the averaged signal; the data is small and later analysis may want it.

## Devices

- **iPhone, iOS 17.4 or later** with the Shortcuts app. Shortcuts' **Get Network Details** (Wi-Fi)
  gives Network Name, BSSID, Wi-Fi Standard, RX Rate, TX Rate, RSSI, Noise, Channel Number and
  Hardware MAC Address (verified on the maintainer's iPhone: RSSI −58 and the list of fields; Apple
  added channel, MAC and rates in iOS 17.4, HT213909). Not verified: whether BSSID needs Location
  permission for Shortcuts (inference: likely, Apple gates BSSID behind Location elsewhere); S0.
- **HA Companion app for iOS** (optional, recommended): its **Fire event** Shortcuts action
  (App Intent, iOS 17+; re-added 2026-07-29 after a beta dropped it; parameters Server, Event name,
  Event data as JSON text; sent through the app's mobile_app webhook, so any user may fire it;
  verified in home-assistant/iOS `Sources/Extensions/AppIntents/FireEventAppIntent.swift` and
  issue 5279). The companion docs page still calls it deprecated; the source wins (S0 confirms).
- **Android phone with the HA Companion app:** sensors `wifi_signal_strength` (dBm),
  `wifi_link_speed` (Mbps), `wifi_frequency` (MHz), `wifi_bssid` (needs Location), `wifi_connection`
  (the SSID). Signal and link speed update only on the app's periodic worker (15 min, 1 min with
  "Fast Always"); frequency, BSSID and connection on every network change; the notification command
  `command_update_sensors` on `notify.mobile_app_<device>` forces an update of changed sensors
  (verified: home-assistant/android `NetworkSensorManager.kt`, companion docs "Sensors" and
  "Notification commands"). Android gives no noise and no TX rate. The owner enables these
  sensors in the app (they are off by default; inference from the docs' defaults, S0).
- **Not supported:** iPhone without Shortcuts' Wi-Fi details (before iOS 17.4); the iOS Companion
  app's own Wi-Fi sensors (no signal).

## Integrations

None new. `mobile_app` (the Companion apps) is core. The owner installs the Shortcut (below) and,
on Android, enables the Wi-Fi sensors in the Companion app.

## How a reading is taken

### The page (`components/pocket/cards/pages/wifi-survey-page.js`)

- Route `#/wifi-survey`; a row **Wi-Fi survey** on the System page, shown to administrators when
  the Pocket input `wifi_survey` is true and the plan has an access point. A non-administrator who
  opens the route sees "Only an administrator can survey" and nothing else.
- Title row: back to System, the page title, the band picker (the bands some access point serves;
  the phone chooses its band, this picks the map shown).
- The floorplan card (consumed as an element, as the Floor plan page does; read-only,
  `edit: false`) on the radio layer's band map, Calibrated when there are observations, with
  config `survey_spots: [...]` (new card config, floorplan S1) drawing the suggested spots as
  numbered rings and the tapped spot as a filled dot. A tap on the plan sets the spot
  (`floorplan-tap` event with floor and metres, new, floorplan S1); a tap within 1 m of a suggested
  spot snaps to it.
- The panel under the plan (a section, not a sheet: the plan stays visible):
  - the method line ("iPhone Shortcut" or "Companion app sensors on <phone>", a **Change** link);
  - the next spot's reason ("Handover between two access points", "No reading in this room",
    "Far from any reading");
  - **Measure** (disabled until a spot is set), then the progress ("Reading 3 of 5");
  - the result: dBm in its level colour (SPEC-044's −67 / −75 marks), band and channel, access point
    name, noise and rates when given, the spread, and "model −62 dBm" beside it; the checks, each
    with a tick or its reason; **Keep** / **Retry** (soft) or **Retry** (hard);
  - after a keep: "Kept", **Undo** (the last reading only, until the next Measure), the next spot.
- First use per phone: an install card (iPhone: **Install the Shortcut** and its build steps link;
  Android: "Turn on the Wi-Fi sensors in the Companion app", which ones, and the phone picker).
- Per-device settings (localStorage, Pocket's existing per-device pattern): the method, the
  Android phone's `mobile_app` device, the scan count.

### The phone and the method (`lib/wifi-capture.js`)

- Detection (verified: HA frontend `external_auth.ts`, the apps' user agents): `window.externalApp`
  or `window.externalAppV2` → Android Companion → method **companion**; `window.webkit
  .messageHandlers.externalBus` → iOS Companion → **shortcut-event**; an iPhone user agent without
  the app (Safari) → **shortcut-callback**; anything else → "Survey from a phone". The person can
  change the method.
- The Android phone: the external bus does not identify the device (verified, external-bus
  reference), so the person picks it once from the `mobile_app` devices that have a
  `wifi_signal_strength` entity, the ones of the current user first (inference: matched by the
  device's name to the user's when no better link exists).
- **Measure** creates a one-time **code** (12 random base32 characters) and remembers it with the
  spot, the floor and the time in sessionStorage, so a page reload on the return keeps it. A code is
  used once and expires after 2 minutes.

### iPhone: the Shortcut "Domosenso Wi-Fi"

- Shipped with the component: `components/pocket/shortcuts/domosenso-wifi.shortcut`, signed for
  anyone (`shortcuts sign --mode anyone` on macOS), served under Pocket's install path; the install
  card opens it, which imports it into Shortcuts (inference: Safari and the Companion app hand a
  `.shortcut` file to Shortcuts; S0). The README gives the same Shortcut as build steps for a home
  that prefers to build it.
- Input: text JSON `{"code": "...", "n": 5, "mode": "event" | "callback", "return": "<url>"}`.
- Body: repeat `n` times: Get Network Details (each field), add a dictionary to a list, wait 1 s.
- `mode: event`: Home Assistant **Fire event** `domosenso_wifi_reading` with
  `{"code": "...", "scans": [...]}`, then open `return`
  (`homeassistant://navigate/<dashboard path>#/wifi-survey`; inference: the fragment survives,
  as the handler keeps everything but `webhook_id`; S0).
- `mode: callback`: the Shortcut's output is the same JSON; Pocket opened it with
  `shortcuts://x-callback-url/run-shortcut?name=Domosenso%20Wi-Fi&input=text&text=<json>&x-success=<pocket url>`
  and reads the appended `result` parameter on return (verified: Apple's Shortcuts guide "Use
  x-callback-url" appends `result` with the textual output).
- Pocket opens the Shortcut URL with `window.open(url, "_blank")`: inside the iOS app a new-window
  navigation with a non-http scheme goes to `UIApplication.open` (verified: home-assistant/iOS
  `Utils.swift`, `WebViewController+WebKitDelegates.swift`).

### Why a sensor carries the iPhone's reading

The page cannot rely on a live event subscription: while Shortcuts is in front, iOS suspends the
app's web view and its websocket may drop (inference), so an event fired then would be missed.
And `subscribe_events` to a custom event is admin-only (verified, `websocket_api/commands.py`).
**Pocket's new package** (`templates/package.yaml.j2` → `packages/pocket.yaml`, rendered only with
`wifi_survey: true`) holds one trigger-based template sensor:

```yaml
template:
  - trigger:
      - trigger: event
        event_type: domosenso_wifi_reading
    sensor:
      - name: Domosenso Wi-Fi reading
        unique_id: domosenso_wifi_reading
        default_entity_id: sensor.domosenso_wifi_reading   # the name alone would slugify to wi_fi
        state: "{{ trigger.event.data.code | default('') | string | truncate(32, true, '') }}"
        attributes:
          scans: "{{ (trigger.event.data.scans | default([]))[:20] }}"
          user_id: "{{ trigger.event.context.user_id }}"
          at: "{{ now().isoformat() }}"
```

`sensor.domosenso_wifi_reading`: its state is the last code, its attributes the scans, the user who
fired it and the time. Pocket reads it when it comes back (and on every update while open); the
reading survives the page's reload and a reconnect. A code that does not match the page's pending
one is ignored.

### Android: the Companion sensors

Measure calls `notify.mobile_app_<device>` with `message: command_update_sensors`, then collects
up to `n` updates of `wifi_signal_strength` (each new `last_updated`) within 20 s, sending the
command again after each update. Each scan takes the phone's `wifi_signal_strength`, `wifi_bssid`,
`wifi_frequency`, `wifi_link_speed`, `wifi_connection` at that moment. Fewer than 3 updates in
20 s is a hard failure "The phone did not report; check the Companion app's Wi-Fi sensors" (not
verified: how fast the app answers repeated commands; S0 measures it).

## The checks (`lib/wifi-checks.js`, pure)

`checkReading(scans, context) -> {sample, checks: [{id, ok, level: hard|soft, reason}]}`.
`context`: the code and spot, the plan, `hass`, the expected SSID, the time Measure was pressed.

| check | fails when | level |
|---|---|---|
| `fresh` | the code is not the pending one, has expired, or a scan's time is before Measure | hard |
| `phone` | the reading's `user_id` is not the current user's (iPhone, event route; the callback route has none and skips it), or an entity not of the chosen phone (Android) | hard |
| `wifi` | no scan has a BSSID or an RSSI (not on Wi-Fi) | hard |
| `network` | the majority SSID differs from the expected one | hard |
| `count` | fewer than 3 scans | hard |
| `known_ap` | the majority BSSID matches no marked access point (BSSID sensors, then the router's client tracker for the phone's MAC) | soft: kept without `ap`, half weight |
| `steady` | the RSSI spread (max − min of the majority BSSID's scans) is over 6 dB, or the BSSID changed during the scans | soft |
| `band` | the band is unclear (below) | soft: the person picks 2.4 or 6 GHz, or retries |

- **Expected SSID:** the Pocket input `wifi_ssid` when set; else the SSID of the first reading kept,
  stored in the home store (HA frontend system data, admins write; Pocket's existing store) and
  shown on the page with **Change**.
- **Band:** Android's frequency decides (2400–2500, 5150–5895, 5925–7125 MHz). On the iPhone the
  channel alone is ambiguous: 6 GHz channels 1, 5, 9, 13 share numbers with 2.4 GHz ones. In order:
  the BSSID's own band (an access point's per-band BSSID sensor); the router's client tracker
  `connection_type` for the phone's MAC; the channel (36–177 → 5; 2.4 GHz numbers 1–13 → 2.4 when
  no access point of the plan serves 6, else unclear; other 6 GHz numbers → 6).
- **The prediction** at the spot (the calibrated level of the reading's access point and band) is
  shown beside the result and is never a check.
- The sample (below) is built from the majority BSSID's scans: `dbm`, `noise`, `channel` their
  medians.

## The plan document (`schemas/floorplan.schema.json`, `schema: 1`, additive)

`wifi.samples[]` gains a source and optional keys:

```jsonc
{"floor_id": "ground", "x": 3.4, "y": 2.1, "t": "2026-11-11T18:02:10Z", "band": "5", "channel": 36,
 "dbm": -61, "noise": -94, "ap": "a1b2…", "bssid": "02:00:00:00:00:01",
 "source": "phone",                          // new: beside survey and manual
 "phone": "c3d4…",                           // the mobile_app device id, or "ios" / "android"
 "method": "shortcut",                       // shortcut | companion
 "spread": 2.0,                              // dB
 "scans": [{"t": "2026-11-11T18:02:06Z", "ssid": "Home", "bssid": "02:00:00:00:00:01",
            "dbm": -61, "noise": -94, "channel": 36, "standard": "802.11ax",
            "rx": 864, "tx": 720, "mhz": null, "mac": "02:00:00:00:00:aa"}]
}
```

- `source` one of `survey`, `manual`, `phone`; `phone`, `method`, `spread`, `scans` only with
  `phone`. `scans` 1 to 20 entries, each field optional except `t`; `dbm` −110 to 0; `rx`, `tx`
  0 to 10000 (Mbps); `mhz` 2400 to 7125. The 2000-sample cap stands.
- Validation (`push`, `preview`, `survey`) refuses: `sample <i>: source <s> unknown`,
  `sample <i>: scans only with source phone`, `sample <i>: more than 20 scans`,
  `sample <i>: scan <j> <field> out of range`. `push --plan` prints `wifi samples <n>` as before.
- The top-level fields keep SPEC-044's meaning, so every reader of samples works unchanged.

## Calibration (floorplan, `lib/wifi-sources.js`, `lib/wifi-fit.js`)

- `sampleObservations` maps `source: phone` to an observation with source `phone` and `device` the
  sample's `phone`.
- The fit gives **each phone its own offset**, 0 ± 4 dB (`OFFSET_SD.phone = 4`, keyed like a
  device's): phones' antennas and their RSSI reports differ by model (inference from the spread of
  published phone RSSI comparisons), so two phones do not drag each other. With fewer than 5
  readings on a band, R25's frozen-offset uncertainty gives `hypot(4, 4)` = 5.7 dB.
- `nextSpots(cells, observations, rooms, n)` is called with `n = 8` by Pocket; its order (handover,
  room, far) and reasons are unchanged.

## Inputs (pocket)

| name | type | default | example |
|---|---|---|---|
| `wifi_survey` | bool | `false` | `true` (needs `floorplan: true`; the render fails otherwise with `wifi_survey needs floorplan`) |
| `wifi_ssid` | string or null | `null` | `"Home"` (the network name the `network` check expects; empty: the first kept reading's) |
| `wifi_scans` | int 3–20 | `5` | `5` (scans per reading; the page can change it per device) |

## Provides and consumes

- Provides (pocket): `sensor.domosenso_wifi_reading` (state: the last code; attributes `scans`,
  `user_id`, `at`) **stable**; the event `domosenso_wifi_reading` with data `{code, scans}`
  **additive-only** (the Shortcut's contract); the route `#/wifi-survey` **stable**; the Shortcut
  name "Domosenso Wi-Fi" and its input JSON **additive-only**.
- Provides (floorplan): `wifi.samples[]` `source: phone` and its keys **additive-only**; card config
  `survey_spots` and the `floorplan-tap` event **additive-only**.
- Consumes: `mobile_app` devices and their `wifi_*` sensors; `notify.mobile_app_<device>`; the
  router integration's client trackers and BSSID sensors (as SPEC-044); the floorplan dashboard.

## Artifacts and ownership

| artifact | layer |
|---|---|
| `pages/wifi-survey-page.js`, `lib/wifi-capture.js`, `lib/wifi-checks.js`, translations | managed (Pocket's card files) |
| `shortcuts/domosenso-wifi.shortcut` | managed (served with the card) |
| `templates/package.yaml.j2` → `packages/pocket.yaml` | managed (rendered with `wifi_survey: true`) |
| floorplan's schema, `wifi-sources.js`, `wifi-fit.js`, card config | managed |
| the samples | instance (the plan) |
| per-device method, phone, scan count | the phone (localStorage) |

## Compatibility

- Additive: a home without `wifi_survey` renders as today (no package, no page). Old samples are
  untouched. A plan with `phone` samples read by an older floorplan card: the card's
  `sampleObservations` treats an unknown source as `survey` (current code), which is acceptable.
- `docs/COMPATIBILITY.md`: the floorplan schema row gains `source: phone` and its keys; the Pocket
  rows gain the route, the sensor, the event and the inputs.
- `components/pocket/UPGRADE.md`: "To survey Wi-Fi from a phone, set `wifi_survey: true`, render,
  deploy (adds `packages/pocket.yaml`), install the Shortcut on the iPhone."
- `components/pocket/DESIGN.md`: the route, the page's anatomy (a plan with a panel under it, a
  section rather than a sheet), the per-device settings, the install card pattern.

## Stages (each a pull request into `feature/pocket-wifi-survey`, cut from `feature/wifi-coverage`)

0. **S0 phone spike** (no code kept; the maintainer runs it on the iPhone with steps from the
   session; results recorded as Amendment 1 here and in SPEC-046):
   - Get Network Details: every field's value on 2.4 and 5 GHz (6 GHz if available), with and
     without Location permission for Shortcuts; what Channel Number reads for 6 GHz;
   - Fire event from a Shortcut reaches HA with JSON event data; the trigger sensor holds it;
   - `homeassistant://navigate/...#/wifi-survey` returns to the page with the fragment;
   - `window.open("shortcuts://...")` from the Companion app's web view starts the Shortcut;
   - opening a signed `.shortcut` file from Pocket imports it;
   - x-callback from Safari: the `result` arrives and where it is appended (query or after the
     fragment);
   - (SPEC-046) a looping Shortcut's behaviour behind Pocket and behind a Teams call;
   - Android, if a phone is at hand: `command_update_sensors` round-trip time, repeated.
1. **S1 floorplan:** schema keys and validation (CLI and card), `source: phone` observations, the
   per-phone offset, `survey_spots` and `floorplan-tap`, `nextSpots` with `n`.
2. **S2 pocket:** the package, the page, capture (three methods), checks, save and undo, the
   Shortcut file and build steps, inputs, translations (en, de, pl), README, DESIGN.md, UPGRADE.md.
   Then the prototype on the maintainer's Home Assistant after the go-ahead, with screenshots.

## Tests

- pytest (`test_cli_floorplan.py`): each refusal above; a `phone` sample with scans passes; `wifi
  samples` counts them. `ha-check`: the rendered package loads.
- `wifi-fit.test.mjs`: two phones with offsets +5 and −5 dB recover their offsets within 1 dB and
  leave a known wall loss unbiased; a phone sample counts as its own offset group.
- `wifi-sources.test.mjs`: `source: phone` → observation with its phone as device.
- `wifi-checks.test.mjs`: each hard and soft case; the iPhone channel 1–13 with and without a 6 GHz
  access point; band from the BSSID sensor and from the tracker; medians and spread; a reading
  30 dB below the prediction passes every check.
- `wifi-capture.test.mjs`: detection per user agent and bridge; the code's single use and expiry;
  a stale `sensor.domosenso_wifi_reading` (old code) ignored; the callback `result` parsed from the
  query and from after the fragment; Android collection with a fake `hass` (updates, timeout).
- `wifi-survey-page.test.mjs` (Pocket's testing kit): hidden for non-admins; snapping to a spot;
  Measure → result → Keep saves one sample via `lovelace/config/save`; Undo removes it; Retry.
- `no-literals`, `no-cut`; `catalog_check`.

## Out of scope

- Non-administrators surveying (would need a server-side writer).
- Forcing the phone onto a band or an access point; a scan of other networks (iOS gives only the
  connected one).
- iOS Companion's own sensors as a reading (no signal).
- Walk recordings ([SPEC-046](SPEC-046-2026-11-11-pocket-wifi-walks.md)).

## Open questions (all for S0)

- Location permission and BSSID in Shortcuts (inference: needed).
- 6 GHz on the iPhone: what Channel Number and Wi-Fi Standard read.
- The navigate URL's fragment and the x-callback `result` placement (inference: kept / query).
- Importing a signed `.shortcut` from the Companion app's web view (inference: works via Safari).
- Android update latency under repeated `command_update_sensors`.

## Amendment 1 (S0 results, 2026-11-11)

- Status: draft, waiting for the maintainer's approval. Source: the S0 spike on the maintainer's
  iPhone (iOS, HA Companion app, a mesh on one SSID), with a read-only listener on Home Assistant.
- **Verified:**
  - A Shortcut generated as a binary plist and signed with `shortcuts sign --mode anyone` on macOS
    (over SSH, no GUI session) imports on the iPhone from a shared file.
  - The Companion app's Fire event action is stored as `io.robbie.HomeAssistant.FireEventIntent`
    (`AppIntentIdentifier` `FireEventIntent`, team `QMQYCKL255`), parameters `eventName`, `eventData`
    (a text token) and `server`. The name `FireEventAppIntent` (the Swift type) is not found by
    Shortcuts. `server` is an entry the phone generates (`identifier: "autogenerated-<uuid>"`, titled
    with the server's name in the app), so a shipped Shortcut cannot carry it.
  - The event reaches Home Assistant with the JSON text parsed to data, `origin: REMOTE` and the
    phone user's `user_id` in its context, about 1.5 s after the last scan.
  - Get Network Details gives every field, each inserted into text as a plain string: SSID, BSSID
    (lower case, colons), RSSI and noise in dBm, channel (`"40"`), `802.11ax`, RX and TX rate in Mbps
    without a unit, the phone's MAC. Location permission for Shortcuts was in its existing state;
    BSSID was given.
  - The first scan after a pause can carry an implausible RX rate (6 Mbps, then 2401 on the next
    scans; RSSI was steady).
  - `homeassistant://navigate/dashboard-pocket#/system` reopens the Companion app on Pocket's
    **Home**, not on the fragment's page.
- **Not verified (deferred to S2's prototype):** BSSID with Location for Shortcuts off; 6 GHz;
  x-callback from Safari (Apple documents the `result` parameter; where it lands in a URL with a
  fragment is not seen); `window.open("shortcuts://…")` from Pocket in the app's web view.
- **Changes:**
  - The Shortcut carries the scans as JSON **text** built inside it (every value a string), not as a
    Shortcuts dictionary; `parseScans` (Task 4) reads strings.
  - The shipped Shortcut leaves **Server** empty. The install card says: after installing, open the
    Shortcut, tap **Server** in the Fire event action and choose your Home Assistant (listed by the
    name it has in the Companion app; searching for its address finds nothing). Pocket's first
    Measure that gets no reading within 30 s repeats that hint.
  - The Shortcut is generated by a catalog tool (`tools/pocket_shortcuts.py`: plist, then
    `shortcuts sign`), not built by hand, so it is reproducible and reviewed as code.
  - The return URL is `homeassistant://navigate/<dashboard path>` without a fragment. The pending
    code, spot and route are kept in **localStorage** (not sessionStorage: the app reloads the page),
    and Pocket, on start, opens `#/wifi-survey` when a pending measurement younger than 120 s exists.
  - `rx` and `tx` are judged by their median over the scans (the first scan's rate is not trusted);
    the `scans` keep every raw value.
