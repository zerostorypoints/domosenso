# Pocket Wi-Fi survey and walk recordings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An administrator surveys Wi-Fi with a phone from a Pocket page (suggested spots, Measure,
checked readings saved as `wifi.samples` `source: "phone"`), and records walks whose handovers are
analysed and shown on the plan.

**Architecture:** The Wi-Fi engine stays in floorplan: the floorplan card element gains a small
**survey API** (spots, a reading's access point and band, the prediction at a point, add/undo a
sample and save) so Pocket never copies `wifi*.js`. Pocket adds pure modules (`wifi-capture.js`
methods and codes, `wifi-checks.js` checks, `wifi-walk.js` record and analysis), one page
(`wifi-survey-page.js`, views Spots | Walks) and a rendered HA package with two trigger sensors and
a script. Two signed Shortcuts ship with Pocket's card files.

**Tech Stack:** Vanilla ES modules, `node --test` with happy-dom (Pocket's `cards/testing/`),
Python 3 / pytest (`uv run pytest`), Jinja templates (`[[ ]]`/`[% %]`), JSON Schema, Shortcuts
(`shortcuts sign` on macOS).

**Spec:** `.ai/specs/SPEC-045-2026-11-11-pocket-wifi-survey.md` and
`.ai/specs/SPEC-046-2026-11-11-pocket-wifi-walks.md` (approved 2026-11-11). Read both; SPEC-044 for
the model, samples and fit; `components/pocket/DESIGN.md` for every screen.

## Global Constraints

- Branches: `feature/pocket-wifi-survey` cut from `feature/wifi-coverage` (this session is the
  coordinator, AGENTS.md); each stage a PR into it. Pushing needs the maintainer's typed go-ahead.
- No version bump in any `component.yaml`. No home's names, rooms, entity ids, BSSIDs or SSIDs in
  the catalog: fixtures use the demo home (Alex, Sam), SSID `"Home"`, BSSIDs `02:00:00:00:00:0N`.
- `schema: 1` stays; new sample keys optional, ADDITIVE-ONLY.
- Sample `source` ∈ `survey | manual | phone`; `phone`, `method` (`shortcut|companion`), `spread`,
  `scans` only with `phone`; `scans` 1–20, each with `t`; `dbm` −110..0; `rx`, `tx` 0..10000;
  `mhz` 2400..7125. 2000-sample cap.
- Phone offset prior 0 ± 4 dB, one offset per `phone` value (`OFFSET_SD.phone = 4`).
- Checks: hard `fresh`, `phone`, `wifi`, `network`, `count` (< 3 scans); soft `known_ap`, `steady`
  (spread > 6 dB or the BSSID changed), `band`. Never a check against the prediction.
- Code: 12 base32 chars, single use, expires 120 s. Scans default 5 (input `wifi_scans` 3–20), 1 s apart.
- Android: `command_update_sensors`; ≥ 3 updates within 20 s or hard failure.
- Band from MHz: 2400–2500 → 2.4, 5150–5895 → 5, 5925–7125 → 6. iPhone channel: BSSID band, then
  tracker `connection_type`, then 36–177 → 5; 1–13 → 2.4 unless an access point serves 6 (then
  unclear); other numbers → 6.
- Walks: batch 5 scans per event, ≤ 10 per sensor state, ≤ 1800 points, 30 min max, newest 20,
  user data key `domosenso_wifi_walks` `schema: 1`. `STICKY_S = 5`, `GAP_S = 1`, `PINGPONG_S = 30`,
  `RATE_DROP = 0.3` for ≥ 3 s, `DROP_WINDOW_S = 15`; marks −67 / −75 dBm.
- Entities: `sensor.domosenso_wifi_reading`, `sensor.domosenso_wifi_walk`,
  `script.domosenso_wifi_walk_stop`; events `domosenso_wifi_reading`, `domosenso_wifi_walk`,
  `domosenso_wifi_walk_stop`. Shortcut names "Domosenso Wi-Fi", "Domosenso Wi-Fi walk".
- Route `#/wifi-survey`, `#/wifi-survey/walks`, `#/wifi-survey/walks/<id>`; admins only.
- Pocket text in en, de, pl; DESIGN.md, README.md, UPGRADE.md updated in the stage that changes them.
- Every 44 px target, no ellipsis or clamp (`no-cut`, `no-literals` tests).

## Review Focus

1. **The page reloads on the return from Shortcuts** (navigate URL, or iOS killed the web view). The
   pending code and spot must come back from sessionStorage and the reading from the sensor's state;
   a second reload after Keep must not save it twice. Test in Task 6.
2. **An old reading on the sensor.** Pocket opens with `sensor.domosenso_wifi_reading` already
   holding yesterday's code: nothing is shown or saved. Test in Task 5.
3. **The plan changed meanwhile** (an admin edited it on a laptop): a save reads the dashboard
   config fresh and appends to it, never overwrites with a stale document. Test in Task 3.
4. **Shortcut output that is not what we expect:** empty RSSI, `"Not Connected"`, numbers as text
   with units ("864 Mbps"), a channel as `"36"`, decimal commas. Parsed or the scan dropped, never an
   exception. Test in Task 4.
5. **A walk that never stops** (the Shortcut misses the stop flag, the page closed): batches of a
   finished walk are ignored, a walk is closed at 30 min, the 20-walk cap holds. Test in Task 9.

---

## Stage S0: phone spike (no code kept)

### Task 0: Spike on the maintainer's iPhone

**Files:** none in the catalog. Results go into SPEC-045 and SPEC-046 as `## Amendment 1 (S0 results)`.

- [ ] **Step 1:** Write the steps for the maintainer (in the session, not the catalog): build a test
  Shortcut by hand (Get Network Details ×5 into a list → Fire event `domosenso_wifi_reading_test`
  with the list as JSON text → open `homeassistant://navigate/<pocket path>#/system`).
- [ ] **Step 2:** Ask for each observation and record it (verified / not):
  every Get Network Details field on 2.4 and 5 GHz (6 GHz if any), with Location for Shortcuts on and
  off; Channel Number and Wi-Fi Standard on 6 GHz; the event in HA (Developer tools → Events, listen);
  the navigate return keeps `#/…`; `window.open("shortcuts://run-shortcut?name=…")` from Pocket in
  the Companion app (a temporary bookmarklet-free test: a link in a Markdown card); importing a signed
  `.shortcut` (sign one on the Mac mini with `shortcuts sign --mode anyone`); x-callback from Safari
  and where `result` lands; a looping Shortcut (Repeat 120, Wait 1, Fire event every 5) behind
  Pocket, screen locked, and behind a Teams call; Android `command_update_sensors` latency if a phone
  is at hand.
- [ ] **Step 3:** Write Amendment 1 into both specs with what was verified; where an inference failed,
  the amendment states the fallback (SPEC-046's time-line-only walk; Fire event without return).
  Get the maintainer's approval of the amendment; commit.

## Stage S1: floorplan (SPEC-045)

### Task 1: Schema and validation of phone samples

**Files:**
- Modify: `schemas/floorplan.schema.json` (`wifi.samples.items`)
- Modify: `tools/domosenso_cli/floorplan_doc.py` (sample loop near line 117)
- Test: `tests/test_floorplan_schema.py`, `tests/test_cli_floorplan.py`

**Interfaces:** Produces the sample shape of Global Constraints, used by Tasks 2, 3, 6.

- [ ] **Step 1: Failing tests:** `test_phone_sample_valid` (a sample with `source: "phone"`,
  `phone`, `method: "shortcut"`, `spread: 2.0`, two scans with every field → schema valid, push
  plan prints `wifi samples 1`); refusals, each `DomosensoError` with the exact message:
  `sample 0: source radar unknown`, `sample 0: scans only with source phone` (scans on `manual`),
  `sample 0: more than 20 scans` (21), `sample 0: scan 1 dbm out of range` (−120),
  `sample 0: scan 0 rx out of range` (10001), `sample 0: scan 0 mhz out of range` (2000),
  `sample 0: scan 0 has no t`.
- [ ] **Step 2:** `uv run pytest tests/test_cli_floorplan.py tests/test_floorplan_schema.py -k phone -v` → FAIL.
- [ ] **Step 3:** Schema: `source` enum gains `phone`; properties `phone` (string), `method` (enum),
  `spread` (number ≥ 0), `scans` (array, maxItems 20, items with `t` required and optional `ssid`,
  `bssid`, `mac`, `standard` strings, `dbm`, `noise`, `channel`, `rx`, `tx`, `mhz` numbers or null,
  `additionalProperties: false`). Validator: the checks above in the sample loop, in that order.
- [ ] **Step 4:** Same command → PASS; full `uv run pytest tests -q` green.
- [ ] **Step 5:** Commit "Floorplan: phone samples in the plan document and their validation (SPEC-045)".

### Task 2: Phone observations and a per-phone offset

**Files:**
- Modify: `components/floorplan/cards/lib/wifi-sources.js` (`sampleObservations`)
- Modify: `components/floorplan/cards/lib/wifi-fit.js` (`OFFSET_SD`, `offsetKey`)
- Test: `wifi-sources.test.mjs`, `wifi-fit.test.mjs`

**Interfaces:** Produces observations `{source: "phone", device: sample.phone ?? "phone", …}`.

- [ ] **Step 1: Failing tests:** `sampleObservations` maps a `phone` sample to `source: "phone"`,
  `device` its `phone`; a sample with an unknown source still maps to `survey` (unchanged).
  Fit: synthetic observations from two phones with true offsets +5 and −5 dB on a fixture with a
  known brick wall → each fitted phone offset within 1 dB of truth and the brick loss within 1 dB;
  with phones' offsets ignored (one group) the test would fail (assert the two offsets differ by > 8).
- [ ] **Step 2:** `node --test components/floorplan/cards/lib/wifi-fit.test.mjs components/floorplan/cards/lib/wifi-sources.test.mjs` → FAIL.
- [ ] **Step 3:** `OFFSET_SD.phone = 4`; `offsetKey`: `device` and `phone` sources key by
  `o.device`; everything else unchanged (R25's frozen-offset sd follows from `OFFSET_SD`).
- [ ] **Step 4:** Same → PASS; `npm test` green.
- [ ] **Step 5:** Commit "Floorplan Wi-Fi: phone samples calibrate with one offset per phone (SPEC-045)".

### Task 3: The card's survey API, spots and taps

**Files:**
- Modify: `components/floorplan/cards/floorplan-card.js` (config `survey_spots`, `survey_path`
  reserved for Task 10, `floorplan-tap` event, methods below; header comment documents them)
- Modify: `components/floorplan/cards/lib/wifi.js` (`nextSpots` already takes `n`; no change unless
  tests show otherwise)
- Create: `components/floorplan/cards/lib/survey-api.js` (pure helpers the methods call)
- Test: `components/floorplan/cards/lib/survey-api.test.mjs`, `floorplan-card.test.mjs`

**Interfaces (Produces, used by Tasks 6 and 10):**
- Card config `survey_spots: [{x, y, n, why}]` (numbered rings), `survey_spot: {floor_id, x, y} | null` (filled dot).
- Event `floorplan-tap` `{floor_id, x, y}` (metres) on a tap in view mode when config `tap: "point"`.
- `card.surveySpots(band, n = 8) -> [{floor_id, x, y, why: "handover"|"room"|"far"}]` on the shown floor,
  from calibrated cells and current observations.
- `card.resolveReading({bssid, mac, band, mhz, channel}) -> {ap: string|null, band: "2.4"|"5"|"6"|null, via: "bssid"|"tracker"|"channel"|null}`
  (BSSID sensors, then the router tracker for `mac`, then Global Constraints' channel rule).
- `card.predictionAt({floor_id, x, y}, ap, band) -> number|null` (calibrated dBm, unsmoothed).
- `card.addSamples(samples) -> Promise<void>` and `card.removeSample(t, phone) -> Promise<void>`:
  read `lovelace/config` fresh, apply to its plan, `lovelace/config/save` via `withPlan`; reject
  with `Error("not admin")` when `hass.user.is_admin` is not true.
- `resolveReading` and spot helpers live in `survey-api.js` as pure functions of `(doc, hass, rules, …)`.

- [ ] **Step 1: Failing tests** (`survey-api.test.mjs`): `bandOf({mhz: 5180}) === "5"`, `{mhz: 6115}` → `"6"`,
  `{channel: 36}` → `"5"`, `{channel: 1}` with no 6 GHz access point → `"2.4"`, with one → `null`,
  `{channel: 37}` → `"6"`; `resolveReading` by BSSID sensor (fixture of SPEC-044's wifi-sources tests),
  by tracker for the MAC (`02-00-…` normalised), and unknown; `appendSamples(doc, samples)` keeps
  2000 cap (returns null beyond); `removeSample` by `t`+`phone`. Card test: `addSamples` reads the
  dashboard config again and appends to the **fresh** plan (a fake `callWS` whose plan gained a room
  meanwhile: the saved plan has the room and the sample); non-admin rejects; `floorplan-tap` fires
  with metres.
- [ ] **Step 2:** `node --test components/floorplan/cards/lib/survey-api.test.mjs components/floorplan/cards/floorplan-card.test.mjs` → FAIL.
- [ ] **Step 3:** Implement as the Interfaces say; draw spots as rings numbered `n` in the map's
  label colour, the spot as a filled accent dot; `floorplan-tap` only with config `tap: "point"`
  (Pocket's survey page sets it; `room-tap` unchanged otherwise).
- [ ] **Step 4:** Same → PASS; `npm test` green.
- [ ] **Step 5:** README Wi-Fi section: phone samples and the survey API (one paragraph); `docs/COMPATIBILITY.md`
  floorplan schema row (`source: phone`, keys) and element row (config keys, event, methods, ADDITIVE-ONLY).
  Commit "Floorplan card: survey API, spots and point taps for Pocket (SPEC-045)". Open the S1 PR into
  `feature/pocket-wifi-survey` after the go-ahead to push.

## Stage S2: Pocket spot survey (SPEC-045)

### Task 4: Capture: detection, codes, Shortcut output parsing

**Files:**
- Create: `components/pocket/cards/lib/wifi-capture.js`
- Test: `components/pocket/cards/lib/wifi-capture.test.mjs`

**Interfaces (Produces):**
- `detectMethod(win) -> "companion" | "shortcut-event" | "shortcut-callback" | null`
- `newCode(rand = crypto.getRandomValues) -> string` (12 base32); `pending` store:
  `savePending(storage, {code, floor_id, x, y, at, method, phone})`, `loadPending(storage, now) -> pending|null` (null after 120 s), `clearPending(storage)`.
- `shortcutUrl({code, n, mode, returnUrl}) -> string` (`shortcuts://run-shortcut?...` for event,
  `shortcuts://x-callback-url/run-shortcut?...&x-success=` for callback).
- `parseScans(raw) -> Scan[]`; `Scan = {t, ssid, bssid, mac, dbm, noise, channel, standard, rx, tx, mhz}`
  numbers or null, MACs normalised lower-case colons.
- `readingFromSensor(state, pending) -> {scans, user_id} | null` (state = the sensor's HA state).
- `callbackResult(location) -> string | null` (`result` from the query or after the fragment).
- `collectAndroid(hass, phoneEntities, {n, timeoutMs, send}) -> Promise<Scan[]>` with `send()` calling
  `notify.mobile_app_<device>` `command_update_sensors`; `phoneEntities(hass, deviceId) -> {signal, bssid, frequency, link, connection}`.

- [ ] **Step 1: Failing tests:** detection for `{externalApp}`, `{externalAppV2}`,
  `{webkit: {messageHandlers: {externalBus}}}`, Safari iPhone UA, desktop UA → `null`; code length 12
  and alphabet; pending expires at 121 s; `parseScans` of `"864 Mbps"`, `"-61"`, `"36"`, `"-61,5"`,
  `"Not Connected"` (scan dropped), missing RSSI (dropped); `readingFromSensor` ignores another code
  and a state older than `pending.at`; `callbackResult` for `?result=…#/wifi-survey` and
  `#/wifi-survey?result=…`; `collectAndroid` with a fake hass ticking `last_updated` returns n scans
  with `mhz` from `wifi_frequency`, rejects `Error("no updates")` with < 3 in 20 s (fake timers).
- [ ] **Step 2:** `node --test components/pocket/cards/lib/wifi-capture.test.mjs` → FAIL.
- [ ] **Step 3:** Implement. No DOM beyond the `win`/`storage`/`location` arguments.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit "Pocket: Wi-Fi capture from the iPhone Shortcut and the Companion sensors (SPEC-045)".

### Task 5: The checks

**Files:**
- Create: `components/pocket/cards/lib/wifi-checks.js`
- Test: `components/pocket/cards/lib/wifi-checks.test.mjs`

**Interfaces:**
- Consumes: `Scan` (Task 4); a `resolve` function with `card.resolveReading`'s signature (Task 3).
- Produces: `checkReading(scans, ctx) -> {checks: Check[], sample: Sample|null, needsBand: boolean}` with
  `ctx = {pending, now, userId, readingUserId, phoneEntities, ssid, resolve, spot}`,
  `Check = {id, ok, level: "hard"|"soft", reason}` (reason a translation key `card.pocket.wifi.check.<id>`),
  `Sample` exactly SPEC-045's shape (`dbm`, `noise`, `channel` medians of the majority BSSID's scans,
  `spread` max−min, `t` the last scan's, `phone` the chosen `mobile_app` device id on Android and `"ios"` on the iPhone, `method` `shortcut` or `companion`). `sampleWithBand(sample, band)` for the person's pick.

- [ ] **Step 1: Failing tests:** one per hard check (each makes `sample` null) and soft check (sample
  kept; `known_ap` → no `ap`); median of `[-60, -62, -61, -80, -61]` with the −80 on another BSSID →
  majority's median −61, `steady` failing because the BSSID changed; spread 7 dB → `steady` soft;
  channel 1 with a 6 GHz access point → `needsBand: true`; a reading 30 dB below `predictionAt` passes
  every check (`checks.every(c => c.ok)`); `network` passes when `ssid` is null.
- [ ] **Step 2:** `node --test components/pocket/cards/lib/wifi-checks.test.mjs` → FAIL.
- [ ] **Step 3:** Implement; the prediction is not an input.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit "Pocket: checks of a Wi-Fi reading before it is kept (SPEC-045)".

### Task 6: Package, inputs and the Wi-Fi survey page (Spots)

**Files:**
- Create: `components/pocket/templates/package.yaml.j2` (→ `packages/pocket.yaml`, empty output unless `wifi_survey`)
- Modify: `components/pocket/component.yaml` (inputs `wifi_survey`, `wifi_ssid`, `wifi_scans`; template; `provides.entities`)
- Modify: `components/pocket/templates/dashboard.lang.yaml.j2` (pass the three inputs into the card config; `fail('wifi_survey needs floorplan')`)
- Create: `components/pocket/cards/pages/wifi-survey-page.js`; Modify: `pages/index.js`, `lib/router.js` (route `wifi-survey`, its `walks` views for Task 10), `pages/system-page.js` (the row)
- Modify: `components/pocket/translations/{en,de,pl}.json` (`card.pocket.wifi.*`)
- Test: `wifi-survey-page.test.mjs`, `router.test.mjs`, `system-page.test.mjs`, pytest render test for the package
  (`tests/test_render_pocket.py` or the existing pocket render test)

**Interfaces:** Consumes Tasks 3–5. Produces the page module (`render`, `update`) and the package's
`sensor.domosenso_wifi_reading` (SPEC-045's YAML verbatim, `default_entity_id` included).

- [ ] **Step 1: Failing tests:**
  render: `wifi_survey: false` renders no `packages/pocket.yaml`; `true` renders the sensor YAML and
  `ha-check` loads it; `wifi_survey: true` with `floorplan: false` fails with `wifi_survey needs floorplan`.
  Router: `#/wifi-survey` parses. System page: the row shows for an admin with the input on, not
  otherwise. Page (fake floorplan element with the Task 3 API): non-admin sees
  `card.pocket.wifi.admin_only` only; a tap within 1 m of spot 2 snaps to it; Measure on
  `shortcut-event` calls `window.open` with the URL and saves pending; a sensor state with the pending
  code shows the result, the checks and "model −62 dBm"; Keep calls `addSamples` once with the sample;
  a re-render after reload with the same sensor state and cleared pending saves nothing; Undo calls
  `removeSample`; a hard failure shows only Retry; `needsBand` shows 2.4 / 6 buttons; Android path
  calls `notify.mobile_app_<device>` with `command_update_sensors`; the first-use install card; the phone picker lists `mobile_app` devices with a `wifi_signal_strength` entity, those whose name contains the user's name first.
- [ ] **Step 2:** `node --test components/pocket/cards/**/wifi-*.test.mjs components/pocket/cards/lib/router.test.mjs` and
  `uv run pytest tests -k pocket -q` → FAIL.
- [ ] **Step 3:** Implement per SPEC-045 "The page": title row with back to System and the band picker,
  the floorplan element with `{edit: false, tap: "point", layers: ["radio"], survey_spots, survey_spot}`
  (as `floorplan-page.js` creates it, plan from `loadPlan`), the panel section (method line with
  Change, reason, Measure, progress, result, checks, Keep/Retry, Undo). Per-device settings in
  localStorage keys `pocket.wifi.method`, `pocket.wifi.phone`, `pocket.wifi.scans` (try/catch). The
  expected SSID: input, else home store key `wifi_ssid` written by an admin on the first Keep.
  After Keep: `loadPlan` cache refreshed (`forgetPlan()` then reload) so the map recalibrates.
- [ ] **Step 4:** → PASS; `npm test`, `uv run pytest tests -q`, `tools/check-all.sh` green.
- [ ] **Step 5:** Commit "Pocket: the Wi-Fi survey page with suggested spots, Measure and checked readings (SPEC-045)".

### Task 7: The Shortcut, docs and the S2 prototype

**Files:**
- Create: `components/pocket/shortcuts/domosenso-wifi.shortcut` (signed, anyone) and
  `components/pocket/shortcuts/README.md` (build steps, action by action, and how to re-sign)
- Modify: `components/pocket/component.yaml` (install path carries `shortcuts/`), `README.md`, `DESIGN.md`
  (route, page anatomy: plan + panel section, install card, per-device settings), `UPGRADE.md`,
  `docs/COMPATIBILITY.md` (Pocket rows: route, sensor, event, inputs, Shortcut input)
- Test: `catalog_check`; a test that the rendered install contains `shortcuts/domosenso-wifi.shortcut`

- [ ] **Step 1:** Build the Shortcut on the Mac per its README (input JSON → Repeat n → Get Network
  Details fields → dictionary → list → Wait 1 → If mode = event: Fire event + Open URL, else output
  JSON), export, `shortcuts sign --mode anyone --input … --output …`.
- [ ] **Step 2:** The install-path test → FAIL, then add `shortcuts/` to the install → PASS.
- [ ] **Step 3:** Docs as listed; `tools/check-all.sh` green. Commit "Pocket: the Domosenso Wi-Fi Shortcut and the survey's docs (SPEC-045)".
- [ ] **Step 4:** Prototype on the maintainer's HA (AGENTS.md of the home: `render --catalog-dev`,
  `snapshot`, `deploy production --plan`, typed go-ahead, `--apply --allow-dirty --confirm`, `verify`).
  The maintainer installs the Shortcut and measures three spots; screenshots of every changed screen
  on a `pr-evidence/<PR>` branch; PR into `feature/pocket-wifi-survey` after the go-ahead to push.

## Stage W: walk recordings (SPEC-046)

### Task 8: Walk sensor and stop script

**Files:** Modify `components/pocket/templates/package.yaml.j2` (second trigger sensor
`sensor.domosenso_wifi_walk`, state `<walk>:<seq>`, attributes `scans[:10]`, `walk`, `seq`, `stop`;
`script.domosenso_wifi_walk_stop` with field `walk` firing `domosenso_wifi_walk_stop`); `component.yaml`
`provides`. Test: the package render test and `ha-check`.

- [ ] **Step 1:** Failing render test asserting both new entities' YAML (state template, the
  `stop` attribute set on the stop event and kept on batches).
- [ ] **Step 2:** → FAIL; implement; → PASS; `ha-check` green.
- [ ] **Step 3:** Commit "Pocket: the walk sensor and its stop script (SPEC-046)".

### Task 9: Walk record, storage and analysis

**Files:** Create `components/pocket/cards/lib/wifi-walk.js`; test `wifi-walk.test.mjs`.

**Interfaces (Produces, used by Task 10):**
- `newWalk({name, phone, method, now}) -> Walk` (SPEC-046's record, `id` `w-YYYYMMDD-HHMM[-n]`).
- `addBatch(walk, {seq, scans}) -> Walk` (dedupes by `seq`, ignores batches after `end`, caps 1800);
  `missingSeqs(walk) -> number[]`; `close(walk, now) -> Walk` (end = min(now, start + 30 min)).
- `loadWalks(hass) / saveWalk(hass, walk) / deleteWalk(hass, id)` over `frontend/get_user_data` /
  `set_user_data` key `domosenso_wifi_walks`, newest first, at most 20.
- `analyse(walk, resolve) -> {segments, handovers: [{t, from, to, bandChange, gapS, before, after, stickyS67, stickyS75, verdict: "clean"|"late"|"broken", at}], pingPongs, rateDrops, disconnects, drops: [{t, handover|null}], path, answer}`
  with `resolve` = `card.resolveReading`.

- [ ] **Step 1: Failing tests:** SPEC-046's list verbatim (clean; late 8 s below −75; broken 2 s gap;
  band change on one access point; ping-pong; rate drop; disconnect; interpolation between two taps and
  none outside; drop tied to the handover 10 s before, not 20 s); plus Review Focus 5: a batch after
  `close` ignored, `close` at 30 min, the 21st save drops the oldest; duplicate `seq` ignored.
- [ ] **Step 2:** `node --test components/pocket/cards/lib/wifi-walk.test.mjs` → FAIL.
- [ ] **Step 3:** Implement; thresholds as exported constants from Global Constraints.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit "Pocket: walk records and their handover analysis (SPEC-046)".

### Task 10: Walks view, recording, report; the walk Shortcut; W prototype

**Files:**
- Modify: `pages/wifi-survey-page.js` (views Spots | Walks via the router's ids; recording screen;
  list; report), `lib/router.js` (`#/wifi-survey/walks[/<id>]`), translations
- Modify: `components/floorplan/cards/floorplan-card.js` (config `survey_path: [{x, y}]` and
  `survey_marks: [{x, y, verdict}]` drawn as a line and coloured dots)
- Create: `components/pocket/shortcuts/domosenso-wifi-walk.shortcut` (+ build steps in `shortcuts/README.md`)
- Modify: README, DESIGN.md (Walks view, recording screen, report), UPGRADE.md, COMPATIBILITY.md
- Test: `wifi-survey-page.test.mjs` (walks), `floorplan-card.test.mjs` (path), `router.test.mjs`

- [ ] **Step 1: Failing tests:** the view switch replaces the history entry; Start opens the walk
  Shortcut URL (iPhone) or starts 5 s `command_update_sensors` (Android, fake timers); sensor batches
  of this walk collected, another walk's ignored; Stop calls `script.domosenso_wifi_walk_stop`, fills
  missing `seq` from a fake `history/history_during_period`, reads the router tracker's history, saves
  via `saveWalk`; taps and Call dropped recorded with times; the list's answer line; the report's
  handover rows; Export creates a JSON blob download; Delete; the card draws `survey_path`.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implement; the time line is an inline SVG (RSSI per access point colour from the
  card's Serving palette, −67/−75 lines, ticks), not HA's chart (no entity behind it).
- [ ] **Step 4:** → PASS; `tools/check-all.sh` green. Commit "Pocket: Wi-Fi walks, recording and the handover report (SPEC-046)".
- [ ] **Step 5:** Build and sign the walk Shortcut (as Task 7). Prototype on the maintainer's HA after
  the go-ahead; a real walk on a call; screenshots; PR into `feature/pocket-wifi-survey`.

### Task 11: The feature branch into the Wi-Fi branch or main

- [ ] When S1, S2 and W are merged into `feature/pocket-wifi-survey`: `domosenso status` in the home
  shows no `unclassified` file, `render` clean; open one PR from `feature/pocket-wifi-survey` (into
  `feature/wifi-coverage` while #289 is open, else `main`) with a summary per stage. Needs the
  maintainer's typed go-ahead.
