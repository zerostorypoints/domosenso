# SPEC-046 — Wi-Fi walk recordings in Pocket: handovers while moving, for calls that drop

**Status:** approved 2026-11-11 by the maintainer ("Approve, write plan").

**Source:** the maintainer, 2026-11-11: calls (Teams) drop while walking between rooms on a mesh
network after a phone change; a spot survey shows levels, not what happens during a handover.
Scope decided: a feature of its own, started on its own, recording a run for later analysis:
handovers between access points, time on weak signal before switching, link-rate drops. Designed
in the same conversation as [SPEC-045](SPEC-045-2026-11-11-pocket-wifi-survey.md), whose capture it
uses. No version bump. Inference is marked as such.

## Goal

An administrator starts a **walk** in Pocket, walks the route where calls drop (on a call or not),
taps the plan as they pass rooms and presses **Call dropped** when it happens. Afterwards Pocket
shows each handover: from which access point and band to which, how long the signal stayed weak
before the phone switched, whether the link went away, how the link rate fell, and where on the
plan it happened. The router's own view of the phone sits beside it. A walk can be exported as JSON.

Placement test: Home Assistant records the Companion app's sensors and the router's client trackers
but offers no walk, no handover analysis and no tie to a plan (1: no); every home with a mesh and
a phone has the question (2: a component, **pocket**, with floorplan's plan); nothing is
home-specific (3).

## Decisions (the maintainer, 2026-11-11)

- **Position:** a time line plus optional taps on the plan; positions between taps are
  interpolated by time.
- **Storage:** Home Assistant's per-user frontend data of the person who walked, the newest 20
  walks (`frontend/set_user_data`, any user, own data only; verified in HA core
  `frontend/storage.py`). The plan stays small. JSON export.
- **Where:** the Wi-Fi survey page (SPEC-045) gets two views under its title: **Spots | Walks**
  (DESIGN.md §2: two faces of one aspect are views, not pages). Administrators only, as Spots.

## Devices

As SPEC-045. What a walk can get:

| phone | handover moment | signal and rates | resolution |
|---|---|---|---|
| iPhone (Shortcut loop) | the BSSID changing between scans | RSSI, noise, RX/TX each scan | 1 s while the loop runs (S0 decides when it runs) |
| Android (Companion) | `wifi_bssid` and `wifi_frequency` update on every change (verified) | `wifi_signal_strength`, `wifi_link_speed` on each `command_update_sensors` answer | the change exactly; levels every ~5 s (inference; S0) |
| router (`tplink_deco` client tracker of the phone's MAC) | the tracker's node and `connection_type` changing | none | the integration's poll, about 30 s (inference from its default) |

**Not verified (S0 of SPEC-045):** whether a looping Shortcut keeps running while Pocket is in
front, and while a Teams call is on. Community reports say Shortcuts slow down or stop when the
screen locks or another app comes to the front (discussions.apple.com 254713824, automators.fm
19013): inference that it is not reliable. **Fallback when it does not run behind Pocket:** the
Shortcut runs in front with the screen on (time line only, no taps during the walk); taps and
"Call dropped" are then placed afterwards on the report's time line.

## Recording

- **Start walk** asks for an optional name ("Hall to bedroom on a call") and starts:
  - **iPhone:** the Shortcut "Domosenso Wi-Fi walk" (shipped beside SPEC-045's, same install card)
    with input `{"walk": "<id>", "every": 1, "batch": 5, "max_s": 1800}`: repeat: Get Network
    Details, add to a list, wait 1 s; every 5 scans fire `domosenso_wifi_walk`
    `{"walk": "<id>", "seq": <n>, "scans": [...]}`; stop when `sensor.domosenso_wifi_walk`'s
    attribute `stop` names this walk (the Shortcut reads it with the Companion app's **Render
    template** action each batch), or after `max_s`.
  - **Android:** Pocket sends `command_update_sensors` every 5 s and records every state change of
    the phone's `wifi_*` sensors.
  - **Both:** the walk's start and end times, to read the router's history afterwards.
- While recording the page shows the plan with large targets (the floor's rooms; a tap records
  `{t, floor_id, x, y}` and marks it), the elapsed time, the current access point and dBm when the
  last batch says it, **Call dropped** (records `{t, kind: "drop"}`) and **Stop**. Max 30 min.
- **Pocket's package** (SPEC-045's `packages/pocket.yaml`) gains a second trigger sensor
  `sensor.domosenso_wifi_walk` (with `default_entity_id`, as SPEC-045's): on `domosenso_wifi_walk` its state is `<walk>:<seq>`, its
  attributes the batch's `scans` (at most 10); on `domosenso_wifi_walk_stop` (fired by Pocket with
  `script.domosenso_wifi_walk_stop`, an admin calling a script it owns) its attribute `stop` is
  the walk id. Pocket collects batches from the sensor's state changes; after Stop it fills any
  missing `seq` from the recorder's history of the sensor
  (`history/history_during_period` with attributes; a batch is under 2 KB, below the recorder's
  16 KB attribute limit, inference from HA's documented limit).
- After Stop: the router's history for the phone's client tracker over the walk
  (`history/history_during_period`), then the walk is analysed and saved.

## The walk record (`lib/wifi-walk.js`; stored under user data key `domosenso_wifi_walks`)

```jsonc
{"schema": 1, "walks": [{
  "id": "w-20261111-1802", "name": "Hall to bedroom", "start": "…Z", "end": "…Z",
  "phone": "c3d4…", "method": "shortcut",
  "points": [{"t": "…Z", "bssid": "…", "dbm": -63, "noise": -93, "channel": 36, "mhz": null,
              "standard": "802.11ax", "rx": 864, "tx": 720, "ssid": "Home"}],   // ≤ 1800
  "taps": [{"t": "…Z", "floor_id": "ground", "x": 3.4, "y": 2.1}],
  "marks": [{"t": "…Z", "kind": "drop"}],
  "router": [{"t": "…Z", "ap": "a1b2…", "band": "5"}]
}]}
```

Newest first, at most 20 (the oldest drops); **Delete** per walk. Walks never become `wifi.samples`
and never feed the fit (the phone moves; inference that moving readings would bias it).

## Analysis (`lib/wifi-walk.js`, pure)

`analyse(walk, plan, hass) -> {segments, handovers, drops, path}`:

- **Segments:** runs of points on one BSSID, each mapped to an access point and band as SPEC-045
  maps a reading (BSSID sensors, then the router's tracker, else unknown).
- **Handover:** between two segments: time, from → to (access point, band), the **gap** (time
  between the last point on the old BSSID and the first on the new, or with no link), RSSI just
  before and just after.
- **Sticky time:** before each handover, how long the old link stayed below −67 dBm and below
  −75 dBm (SPEC-044's marks).
- **Verdict per handover:** **clean** (switched before 5 s below −75 dBm and a gap under 1 s),
  **late** (more than 5 s below −75 dBm first), **broken** (a gap of 1 s or more, or the link gone).
  Same-access-point band changes (5 → 2.4 on one node) are handovers too, marked as band changes.
- **Ping-pong:** A → B → A within 30 s.
- **Rate drops:** RX rate under 30 % of the walk's median for 3 s or more (iPhone; Android's link
  speed).
- **Disconnects:** no link for 1 s or more.
- **Path:** each point's position interpolated linearly in time between the taps around it (before
  the first tap and after the last: none). A handover's place is its interpolated position.
- **Drops:** each "Call dropped" mark with the nearest handover within 15 s before it, if any.
- With the router's points: its handover times beside the phone's (a router lagging the phone by its
  poll is expected; shown, not judged).
- Thresholds are constants in the module (`STICKY_S = 5`, `GAP_S = 1`, `PINGPONG_S = 30`,
  `RATE_DROP = 0.3`, `DROP_WINDOW_S = 15`), changed freely.

## The report (Walks view)

- The list: each walk's name, date, duration and a one-line answer ("3 handovers, 1 late, 1 call
  drop after a late handover"); a tap opens it (level 2, its back to the list).
- A walk: the answer line; the time line (RSSI over time coloured by access point, the −67 / −75
  marks, handover ticks with their verdict colour, tap ticks, drop marks, the router's line
  beneath); the handovers as rows (time, from → to, sticky time, gap, verdict; a row highlights
  its place on the plan); the plan with the path and handover places (the floorplan card with
  config `survey_path: [...]`, new, floorplan, additive); **Export JSON** (a download of the walk
  with its analysis); **Delete**.
- Colours follow the Serving map's access point colours (SPEC-044 Amendment 3), verdicts the levels
  (clean good, late fair, broken poor).

## Provides and consumes

- Provides (pocket): `sensor.domosenso_wifi_walk` **stable**; events `domosenso_wifi_walk`
  `{walk, seq, scans}` and `domosenso_wifi_walk_stop` `{walk}` **additive-only**;
  `script.domosenso_wifi_walk_stop` **stable**; the Shortcut "Domosenso Wi-Fi walk" and its input
  **additive-only**; the user data key `domosenso_wifi_walks` with `schema: 1` **additive-only**;
  the route `#/wifi-survey/walks[/<id>]` **stable**.
- Provides (floorplan): card config `survey_path` **additive-only**.
- Consumes: as SPEC-045, plus `history/history_during_period` for the sensor and the phone's client
  tracker.

## Artifacts and ownership

| artifact | layer |
|---|---|
| `lib/wifi-walk.js`, the Walks view, translations | managed (Pocket's card files) |
| `shortcuts/domosenso-wifi-walk.shortcut` | managed |
| the walk sensor and script in `packages/pocket.yaml` | managed |
| the walks | the user's HA frontend data (not in any repository) |

## Compatibility

Additive; rendered only with `wifi_survey: true` (SPEC-045's input). `docs/COMPATIBILITY.md` gains
the sensor, events, script, user data key and route. DESIGN.md: the Walks view, the recording
screen, the report. UPGRADE.md: "Install the walk Shortcut on the iPhone."

## Stages (pull requests into `feature/pocket-wifi-survey`, after SPEC-045's)

1. **W1:** `lib/wifi-walk.js` (record format, storage, analysis), the package's walk sensor and
   script.
2. **W2:** the Walks view: recording (both phones), the report, export and delete; the walk
   Shortcut; `survey_path` in the floorplan card; README, DESIGN.md, UPGRADE.md. Then the prototype
   on the maintainer's Home Assistant after the go-ahead: a real walk on a call, screenshots.

## Tests

- `wifi-walk.test.mjs` on synthetic walks: a clean handover; a late one (8 s below −75); a broken
  one (2 s gap); a band change on one access point; ping-pong; a rate drop; a disconnect; positions
  interpolated between two taps and none outside them; a drop mark tied to the handover 10 s before
  it and not to one 20 s before; the 20-walk cap; the router line ignored when empty.
- Capture: batches collected from sensor changes; a missing `seq` filled from history; a batch of
  another walk ignored; the stop event; Android collection from state changes.
- Page tests (Pocket's kit): Spots | Walks switch; Start → taps → Stop saves a walk; the list's
  answer line; Delete; non-admins see nothing.
- `ha-check`: the package with both sensors and the script; `no-literals`, `no-cut`.

## Out of scope

- Live alerts during a call; analysing the call itself (Teams' own call quality data).
- Changing the router's roaming settings (802.11k/v/r, thresholds); advice beyond the verdicts.
- Walks by non-administrators; walks as calibration samples.

## Open questions

- The iPhone loop behind Pocket and behind a call (S0): decides between taps during the walk and
  the time-line-only fallback.
- Whether **Render template** in a Shortcut loop is fast enough to read the stop flag each batch
  (inference: yes, one websocket call); otherwise the loop runs to `max_s` and Pocket ignores later
  batches.
- Android: whether 5 s update commands drain the battery noticeably during a 30 min walk
  (inference: no).

## Amendment 1 (S0 results, 2026-11-11)

- Status: draft, waiting for the maintainer's approval. Source: SPEC-045's S0 spike.
- SPEC-045 Amendment 1 applies here: the Fire event action's real identifier
  (`io.robbie.HomeAssistant.FireEventIntent`), the Server chosen once after installing, scans as JSON
  text, the return without a fragment and Pocket reopening its own route.
- **Not verified:** a looping Shortcut behind Pocket, with the screen locked and behind a Teams call
  (the maintainer deferred it). It becomes the **first step of W2**: a generated test Shortcut runs
  the three cases on the maintainer's iPhone before the recording screen is built; the fallback
  (Shortcut in front, time line only, taps placed afterwards) stays as specified.
