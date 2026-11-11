# Network Traffic on the Floor Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two live maps on the floor plan card's radio layer, Traffic heat and Traffic links, drawn from a router integration's client trackers, with clients matched to plan points by MAC.

**Architecture:** A pure module `components/floorplan/cards/lib/traffic.js` turns `hass` plus the plan plus the router rules into client records (matching, freshness, Mbit/s), heat samples and ring positions; the card only draws. The router's field names live in data (`lib/wifi-rules.json`'s new `traffic` block). The plan document gains one optional key, `points[].mac`, validated by `tools/domosenso_cli/floorplan_doc.py`.

**Tech Stack:** ES modules tested with `node --test` (happy-dom for the card); Python 3.13 with pytest and jsonschema for the plan document.

**Spec:** `.ai/specs/SPEC-047-2026-11-11-floorplan-network-traffic.md` (approved 2026-11-11). Builds on SPEC-044 (`lib/wifi.js` `coverage`, `lib/maps.js` radio maps, `lib/wifi-sources.js`).

**Branch:** `claude/floorplan-network-traffic`, cut from `feature/wifi-coverage`. Each stage (T1 = Tasks 1–2, T2 = Tasks 3–5, T3 = Task 6) is a pull request into `feature/wifi-coverage`, opened only after the maintainer's go-ahead.

## Global Constraints

- Mbit/s = kB/s × 8 / 1000, rounded to 0.01.
- Scale `mbps`: logarithmic 0.1 to 1000 Mbit/s, marks at 1, 10 and 100; a client's value is `total` (down + up).
- Live: the router's `freshness.updated` sensor younger than 3 × `interval_s` and its `polling` switch (when it exists) `on`; a client is stale exactly when the router is not live (SPEC-047 Amendment 1).
- Idle: under 0.01 Mbit/s.
- Heat blur: 1 m. Heat redraw at most once a second.
- Card config `traffic` (boolean, default `true`).
- Refusals, verbatim: `point <key>: mac malformed`, `mac linked twice: <mac>`.
- Every new string in en, de and pl under `card.floorplan.traffic.*` (the `no-literals` test enforces it).
- Fixtures: the demo home's Alex and Sam, MACs `02:00:00:…` only. Nothing from a real home.
- No version bump (the maintainer's call). No `UPGRADE.md` step.
- `npm test` and `uv run pytest` green after every task; `tools/check-all.sh` green before each stage's pull request.

## Review Focus

1. **A client tracker whose `mac` or `deco_mac` is missing or empty** (integration upgrade, guest client): the record is skipped, nothing throws. Test in Task 1.
2. **Two trackers with the same MAC** (the integration's per-node query mode can list a client twice during a roam): one record, the most recently updated tracker wins. Test in Task 1.
3. **A `mac` link on a point that is also matched by registry to another client:** the link wins for its MAC; the registry match still applies to the other MAC; one point never draws two clients twice in the heat. Test in Task 1.
4. **Rates as strings or `null`** (`"0"`, `null`, `"unknown"`): non-numbers read as 0, never `NaN` in a path or a width. Test in Task 1.
5. **A plan with access points but the shown floor has none of the client's access point's serving cells** (the access point serves another floor only): the client's heat falls back to the access point's room only when that room is on this floor; otherwise nothing on this floor. Test in Task 3.

---

### Task 1: Rules and client records (`lib/traffic.js`)

**Files:**
- Modify: `components/floorplan/cards/lib/wifi-rules.json` (the `tplink_deco` access point rule)
- Create: `components/floorplan/cards/lib/traffic.js`
- Test: `components/floorplan/cards/lib/traffic.test.mjs`

**Interfaces:**
- Consumes: `normMac` from `lib/wifi-sources.js`; `accessPoints(doc)` from `lib/maps.js` (`[{key, floorId, bands}]`).
- Produces:
  - `trafficRules(rules) -> rule[]`: the access point rules that have a `traffic` block.
  - `clients(hass, doc, rules, now = Date.now()) -> {list: Client[], live: boolean, updated: Date|null, reason: null|"stale"|"polling_off"|"unavailable"}`
  - `Client = {mac, name, ap: string|null, link: "wired"|"2.4"|"5"|"6", down, up, total, device_id: string|null, point: {floorId, key}|null, matched_by: "link"|"registry"|null, stale: boolean, updated: Date}`
  - `nodeRates(hass, rules, apKey) -> {down, up}|null` (Mbit/s, the node's own sensors)
  - `toMbps(value, unit) -> number`

- [ ] **Step 1: Add the `traffic` block** to the `tplink_deco` rule, exactly as SPEC-047 **Rules** shows (`client`, `node`, `freshness` with `interval_s: 30`).

- [ ] **Step 2: Write the failing tests** in `traffic.test.mjs`, on a fixture hass with two Deco nodes (Alex's office node, Sam's hall node, each a `device_tracker` with `device_type: "deco"` and `mac`), placed as access points in a one-floor plan, and these clients:

```js
test("rates in Mbit/s, down plus up", () => {
  // tracker down_kilobytes_per_s 196, up 0.75 on the office node, wired
  const c = byMac(clients(hass, doc, rules, NOW).list, "02:00:00:00:00:10");
  assert.deepEqual([c.down, c.up, c.total, c.link], [1.57, 0.01, 1.57, "wired"]);
});
test("each connection_type maps to its link; undefined and not_home are skipped", ...);   // band2_4 -> "2.4", band5 -> "5", band6 -> "6"
test("a client on a node not on the plan has ap null", ...);
test("match by a point's mac link before the registry", ...);          // matched_by "link"
test("match by registry, the router's own tracker device excluded", ...);// device with connections [["mac", ...]] -> matched_by "registry"
test("a point's also device matches by registry", ...);                 // point.also contains the MAC-bearing device
test("unmatched: device_id and point null, matched_by null", ...);
test("not live when the updated sensor is older than 90 s", ...);      // reason "stale", every client stale
test("not live when the polling switch is off", ...);                  // reason "polling_off"
test("one tracker older than 90 s is stale alone", ...);
test("missing mac or deco_mac: skipped", ...);                         // Review Focus 1
test("two trackers with one MAC: the newer wins", ...);                // Review Focus 2
test("a link and a registry match for different MACs both hold", ...); // Review Focus 3
test("string, null and unknown rates read as 0", ...);                 // Review Focus 4
test("node rates from the node's _down and _up sensors", ...);         // nodeRates -> {down: 1.64, up: 0.84} for 205 and 105 kB/s
```

Write each body with explicit hass fixtures. The rounding rule the first test pins: `down = round2(1.568)`, `up = round2(0.006)`, `total = round2(1.568 + 0.006)` (the unrounded sum), so 1.57, 0.01, 1.57.

- [ ] **Step 3: Run** `node --test components/floorplan/cards/lib/traffic.test.mjs`. Expected: FAIL, `traffic.js` not found.

- [ ] **Step 4: Implement** `traffic.js`. Trackers: `hass.entities` with `platform === rule.integration`, `device_tracker.` prefix, state `home`, `connection_type` in the rule's `link.values`. A client's `ap`: the access point key (from `accessPoints(doc)`) whose node tracker's `mac` equals the client's `deco_mac` (reuse the same lookup as `nodeMacs` in `wifi-sources.js`; export it from there rather than copy it). Registry match: `hass.devices[*].connections` contains `["mac", m]` with `normMac(m) === client.mac`, and the device is not the client tracker's own `device_id`; its point is the point whose `keysOf(point)` (`lib/plan.js`) contains that device. Freshness entities: on the main node's device, object ids ending `freshness.updated` and `freshness.polling` (`sensor.` and `switch.`); integration unavailable when no node tracker is `home` (`reason: "unavailable"`).

- [ ] **Step 5: Run** the same command. Expected: PASS. Then `npm test`: all pass.

- [ ] **Step 6: Commit**

```bash
git add components/floorplan/cards/lib/wifi-rules.json components/floorplan/cards/lib/traffic.js components/floorplan/cards/lib/traffic.test.mjs components/floorplan/cards/lib/wifi-sources.js
git commit -m "floorplan: traffic rules and client records, matched by link and registry (SPEC-047 T1)"
```

### Task 2: `points[].mac` in the plan document

**Files:**
- Modify: `schemas/floorplan.schema.json` (`$defs.point.properties`)
- Modify: `tools/domosenso_cli/floorplan_doc.py` (`_refuse_duplicates`, `diff`)
- Modify: `docs/COMPATIBILITY.md` (the `floorplan.schema.json` row and the `floorplan` command row)
- Test: `tests/test_floorplan_schema.py`

**Interfaces:**
- Produces: `points[].mac` (string) on a device or entity point; `diff` reports `("point", "change", <floor>, <key>)` when `mac` changes.

- [ ] **Step 1: Write the failing tests**

```python
def test_mac_on_a_point_is_valid():           # "02:00:00:00:00:10" and "02-00-00-00-00-10" both validate
def test_mac_malformed():                      # "02:00:00" -> DomosensoError("point <key>: mac malformed")
def test_mac_linked_twice():                   # same MAC, other case and separator, on two points -> "mac linked twice: 02:00:00:00:00:10"
def test_diff_mac_is_a_change():               # == [("point", "change", "ground", <key>)]
```

- [ ] **Step 2: Run** `uv run pytest tests/test_floorplan_schema.py -k mac -v`. Expected: FAIL (unknown key `mac`).

- [ ] **Step 3: Implement.** Schema: `"mac": {"type": "string", "minLength": 1, "description": "This point is the router client with this MAC (SPEC-047)"}`, no pattern (the refusal text is ours). In `_refuse_duplicates`, per point with `mac`: `re.fullmatch(r"[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}", mac)` else `point <key>: mac malformed`; normalised (lower case, colons) seen twice in the document: `mac linked twice: <normalised>`. In `diff`, the `change` signature becomes `(p.get("category"), p.get("also", []), p.get("mac"))`. COMPATIBILITY: the schema row gains `points[].mac` (SPEC-047); the command row's `point … change` names `mac` and the two refusals join the list.

- [ ] **Step 4: Run** `uv run pytest tests/test_floorplan_schema.py tests/test_cli_floorplan.py -v`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add schemas/floorplan.schema.json tools/domosenso_cli/floorplan_doc.py docs/COMPATIBILITY.md tests/test_floorplan_schema.py
git commit -m "floorplan: a point's mac links it to a router client, validated and diffed (SPEC-047 T1)"
```

### Task 3: Heat samples and the Mbit/s scale

**Files:**
- Modify: `components/floorplan/cards/lib/traffic.js`
- Modify: `components/floorplan/cards/lib/maps.js` (`SCALES`, `colourAt`)
- Test: `components/floorplan/cards/lib/traffic.test.mjs`, `components/floorplan/cards/lib/maps.test.mjs`

**Interfaces:**
- Consumes: `Client` (Task 1); `coverage(ctx, band, step).cells` `[{x, y, room, dbm, ap}]` from `lib/wifi.js`.
- Produces:
  - `SCALES.mbps = {lo: 0.1, hi: 1000, unit: "Mbit/s", digits: 2, log: "decade", marks: [1, 10, 100], ramp: [...]}`; `colourAt("mbps", v)` maps `log10(clamp(v, lo, hi))` linearly from `log10(lo)` to `log10(hi)`. The other scales are unchanged (`log: true` keeps `log1p`).
  - `heatCells(list, floor, servingByBand, pointAt, apAt, step) -> [{x, y, value}]`: `servingByBand` is `{band: cells}` for this floor; `pointAt(point) -> [x, y]|null` and `apAt(apKey) -> {x, y, floorId, roomIndex}|null` come from the card.
  - `apTotals(list) -> Map<apKey, {total, count}>`

- [ ] **Step 1: Write the failing tests**

```js
test("a placed client puts its total in the cell at its point", ...);
test("an unplaced Wi-Fi client spreads its total evenly over its access point's serving cells of its band", ...); // 4 cells, total 2 -> 0.5 each
test("no serving cells for that band: the access point's room on this floor takes it", ...);
test("the access point serves another floor only: nothing on this floor", ...);   // Review Focus 5
test("an unplaced wired client sits at its access point", ...);
test("ap null: left out", ...);
test("cells sum their clients", ...);
test("apTotals sums total and counts clients per access point", ...);
// maps.test.mjs
test("mbps colours: 0.1 and below the first ramp colour, 1000 and above the last, 10 the middle", ...);
```

- [ ] **Step 2: Run** `node --test components/floorplan/cards/lib/traffic.test.mjs components/floorplan/cards/lib/maps.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement** `heatCells`, `apTotals` and the scale. The ramp: a sequential ramp distinct from the dBm and temperature ramps (pale to deep orange, five stops); the 1 m blur is drawn by the card (Task 4), not here.

- [ ] **Step 4: Run** the same command, then `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "floorplan: traffic heat cells and the Mbit/s scale (SPEC-047 T2)"`

### Task 4: Traffic heat on the card

**Files:**
- Modify: `components/floorplan/cards/lib/maps.js` (`MAPS.radio`, `radioMaps`)
- Modify: `components/floorplan/cards/floorplan-card.js` (`setConfig`, `_wifiMap`, `_valueStamp`, the radio drawing branch, the legend)
- Modify: `components/floorplan/translations/{en,de,pl}.json`
- Test: `components/floorplan/cards/floorplan-card.test.mjs`, `components/floorplan/cards/lib/maps.test.mjs`

**Interfaces:**
- Consumes: `clients`, `trafficRules`, `heatCells` (Tasks 1, 3); `this._wifi(band, step, calibrated)` for serving cells.
- Produces: map ids `traffic_heat`, `traffic_links`; `radioMaps(bands, traffic) -> maps` (traffic maps appended when `traffic` is true, even with no band); `this._traffic() -> clients(...)` memoised per stamp; `_drawTraffic(svg, floor, map)` dispatching on `map.cls`.

- [ ] **Step 1: Write the failing tests**

```js
test("traffic maps offered only when a traffic rule finds client trackers", ...);
test("traffic: false offers neither traffic map", ...);
test("traffic heat draws cells coloured on the mbps scale", ...);   // a rect with the colourAt("mbps", v) fill per cell
test("not live: banner with the time, no heat cells, devices grey", ...);
test("integration unavailable: the maps stay, with the reason", ...);
test("a tracker's rate change redraws the heat", ...);               // _valueStamp includes the trackers' rates and links
test("legend: 0.1 to 1000 Mbit/s with marks 1, 10, 100", ...);
// maps.test.mjs
test("radioMaps(bands, true) appends traffic_heat and traffic_links; radioMaps([], true) has only them", ...);
```

- [ ] **Step 2: Run** `node --test components/floorplan/cards/floorplan-card.test.mjs components/floorplan/cards/lib/maps.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement.** `_wifiMap` passes `this._config.traffic !== false && trafficRules(wifiRules).length > 0 && clients(...).list.length > 0` (or `reason === "unavailable"`, so the maps stay with the reason) to `radioMaps`; a traffic map has no band and no Predicted/Calibrated switch. `_valueStamp` pushes, for a traffic map, each traffic tracker's `down|up|connection_type|deco_mac` and the freshness entities' states. Heat: cells from `heatCells`, each a rect on the `STEP_M` grid clipped per room as `_drawWifi` does, under an SVG `feGaussianBlur` whose `stdDeviation` is 1 m in plan units; throttle the rebuild with a 1000 ms timestamp check. Not live: a `.banner` element with `card.floorplan.traffic.not_live` (`{time}` formatted with `formatDate`), no heat group. Strings: `traffic_heat`, `traffic_links` under `card.floorplan.maps` beside `serving`; `not_live`, `unavailable`, `legend` under `card.floorplan.traffic`.

- [ ] **Step 4: Run** the same command, then `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "floorplan card: the Traffic heat map, its legend and the not-live banner (SPEC-047 T2)"`

### Task 5: Traffic links, Idle switch and tap panel

**Files:**
- Modify: `components/floorplan/cards/lib/traffic.js`
- Modify: `components/floorplan/cards/floorplan-card.js`
- Modify: `components/floorplan/translations/{en,de,pl}.json`
- Test: `components/floorplan/cards/lib/traffic.test.mjs`, `components/floorplan/cards/floorplan-card.test.mjs`

**Interfaces:**
- Consumes: `Client`, `apTotals`, `nodeRates` (Tasks 1, 3).
- Note: SPEC-047 says "the Serving map's band colours", but the Serving map colours access points, not bands. Use `LINK_COLOURS = {wired, "2.4", "5", "6"}` in `traffic.js`, four categorical colours distinct from `servingColour`'s, and record this in the pull request.
- Produces: `ringPosition(centre, i, n, radius = 1.2) -> [x, y]` (evenly spaced from the top, clockwise); `lineWidth(total) -> px` and `dotRadius(total) -> px` (monotonic in `log10`, minimum for idle); `IDLE_KEY = "domosenso.floorplan.traffic_idle"` in localStorage, default on.

- [ ] **Step 1: Write the failing tests**

```js
test("ringPosition spaces n clients evenly around the access point", ...);
test("lineWidth and dotRadius grow with total and floor at idle", ...);
test("links: solid for wired, dashed for Wi-Fi, coloured by link", ...);       // stroke-dasharray present only on Wi-Fi lines
test("an unplaced client sits on its access point's ring with a dotted rim", ...);
test("an access point is labelled with its clients' total and count", ...);
test("Idle on: idle clients small and unlabelled; off: hidden; remembered", ...);
test("tap a client: name, router name when different, access point, link, down and up, matched_by, updated", ...);
test("tap an access point: clients vs node rates, and clients on access points not on the plan", ...);
```

- [ ] **Step 2: Run** `node --test components/floorplan/cards/lib/traffic.test.mjs components/floorplan/cards/floorplan-card.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement** the links drawing in `_drawTraffic`, the Idle switch in the bar beside the map chooser (as Ranges is), and the tap panel through the card's existing point-tap path (the panel a point tap opens in view mode). Stale clients take the `stale` class (grey). Strings under `card.floorplan.traffic`: `idle`, `router_name`, `access_point`, `link`, `down`, `up`, `matched.link`, `matched.registry`, `matched.none`, `updated_ago`, `clients_vs_node`, `off_plan`, `links.wired`.

- [ ] **Step 4: Run** the same command, then `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "floorplan card: Traffic links, the Idle switch and the tap panel (SPEC-047 T2)"`

- [ ] **Step 6: Prototype gate (stop here).** Report to the maintainer that T2 is ready for the prototype on their test home (`render floorplan --catalog-dev <this worktree>` in the home repository, then `deploy production --plan`). Deploying needs the maintainer's go-ahead typed in that session. On the prototype, check SPEC-047's two open questions and take screenshots of both maps for the pull request.

### Task 6: Network client in edit mode, and the suggestion

**Files:**
- Modify: `components/floorplan/cards/lib/traffic.js`
- Modify: `components/floorplan/cards/floorplan-card.js` (`_pointPanelHtml` and its change handler)
- Modify: `components/floorplan/translations/{en,de,pl}.json`
- Modify: `components/floorplan/README.md` (a "Network traffic" section: the two maps, the matching order, linking a client, `traffic: false`)
- Test: `components/floorplan/cards/lib/traffic.test.mjs`, `components/floorplan/cards/floorplan-card.test.mjs`

**Interfaces:**
- Consumes: `clients` (Task 1); `editFloor`, `joinPoint(doc, floorId, key, candidate)` and `keysOf` from `lib/plan.js`.
- Produces: `setPointMac(doc, floorId, key, mac|null) -> doc` (normalised MAC; `null` removes it; a MAC already on another point moves to this one); `suggestions(hass, doc, list) -> [{mac, deviceId, pointKey, floorId}]`; `lastSeen(hass, rules, mac) -> Date|null`.

- [ ] **Step 1: Write the failing tests**

```js
test("setPointMac normalises, removes with null, moves a MAC from another point", ...);
test("suggestion: MAC on an unplaced device, one placed point of its manufacturer without a mac connection", ...);
test("no suggestion with two candidate points", ...);
test("a suggestion is never applied by clients()", ...);
test("edit panel: Network client lists online clients by router name; choosing one sets mac", ...);
test("edit panel: a link to an offline client shows not seen since <time>; Remove clears it", ...);
test("edit panel: Same device as <point>? adds the device to the point's also", ...);   // via joinPoint
```

- [ ] **Step 2: Run** `node --test components/floorplan/cards/lib/traffic.test.mjs components/floorplan/cards/floorplan-card.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement.** The panel section is offered only when `trafficRules` is non-empty. Strings under `card.floorplan.traffic.edit`: `title`, `choose`, `not_seen`, `remove`, `same_device`.

- [ ] **Step 4: Run** `npm test`, `uv run pytest`, `tools/check-all.sh`. Expected: all green.

- [ ] **Step 5: Commit** `git commit -m "floorplan card: link a point to a router client, and the same-device suggestion (SPEC-047 T3)"`
