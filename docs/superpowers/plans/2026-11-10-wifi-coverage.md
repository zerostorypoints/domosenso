# Wi-Fi coverage on the floor plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The floorplan card draws, per Wi-Fi band, the predicted signal, the serving access point
and handover zones from access points, walls, openings and slabs with materials; Wi-Fi devices'
signal sensors and survey samples calibrate it; `domosenso floorplan survey` records a laptop's
readings where the owner taps.

**Architecture:** Pure ES modules beside the existing `lib/maps.js`: `lib/wifi.js` (walls, path
loss, prediction, serving, handover, next spots), `lib/wifi-sources.js` (access points and signal
observations from `hass`), `lib/wifi-fit.js` (MAP fit, residuals, confidence), with two data files
`materials.json` and `wifi-rules.json`. The card only wires them into the `radio` layer's maps and
edit tools. Python validates the new document keys and adds `floorplan survey`, a subclass of the
existing `Preview` server with an OS Wi-Fi reader.

**Tech Stack:** Vanilla ES modules tested with `node --test` (no bundler), Python 3 with pytest
(`uv run pytest`), JSON Schema (`schemas/floorplan.schema.json`).

**Spec:** `.ai/specs/SPEC-044-2026-11-10-wifi-coverage.md` (approved 2026-11-10). Read it with this
plan; SPEC-028 (Amendments 5, 6, 7, 9) for the document, maps, preview and openings it extends.

## Global Constraints

- `schema: 1` stays; every new key is optional and ADDITIVE-ONLY. A plan without them renders as today.
- Bands are the strings `"2.4"`, `"5"`, `"6"`; centre frequencies 2437, 5500, 6500 MHz.
- `L0`: 40.2 / 47.3 / 48.7 dB (`20·log10(f_MHz) − 27.55`); default EIRP 20 / 23 / 23 dBm, prior ±4 dB.
- Distance exponent `n` 2.0, prior ±0.3; distance floored at 0.5 m; client and default mount height 1.0 m;
  floor `height` default 2.7 m.
- Oblique factor `k(θ) = min(1/cos θ, 2)`.
- Grid 0.15 m (`STEP_M`), 0.3 m when the card is narrower than 600 px. Cells only inside rooms.
- Handover zone: the strongest two access points on the band within 6 dB.
- Scale −90 to −30 dBm, marks at −67 and −75.
- Fit guards: < 5 observations on a band → only that band's `T` offsets move; < 3 distinct rooms with
  observations → materials keep their priors; cross-band carry-over at one third of the weight.
- Residuals: inverse distance squared, 3 m range, each wall between halves the weight.
- Confidence: high within 2 m of an observation of the cell's serving access point and band.
- Device offset prior 0 ± 6 dB, survey 0 ± 3, manual 0 ± 5; unknown access point at half weight.
- Samples ≤ 2000; `dbm` −110 to 0; `tx` −10 to 36; `mount` 0–5; `height` 2–10.
- View mode never makes an admin-only call; `config/entity_registry/list` only in edit mode.
- Text in en, de, pl (`components/floorplan/translations/*.json`); no home's names, entity ids or
  BSSIDs in the catalog: fixtures use fictional ones (Alex, Sam, `02:00:00:…`).
- No version bump in `component.yaml` (the maintainer's call).

## Review Focus

1. **A wall shared by two rooms is in both polygons.** A ray crossing it must pay its loss once, and a
   ray through a corner where two edges meet must not pay twice. Test in Task 3.
2. **Access points that cannot be drawn:** none marked, an access point whose point is unplaced
   (`placed: false`) or on another floor without a slab path. Expect: hint "Mark your access points in
   edit mode" or that access point left out, never an exception. Test in Task 4.
3. **Sensor values that are not numbers:** `unavailable`, `unknown`, missing statistics, a BSSID in
   another case or with dashes (Deco MACs use `98-03-…`, BSSIDs `98:03:…`). Expect: skipped or
   normalised. Test in Task 9.
4. **A large home on the Ramka:** 200 m², 3 access points, 3 bands, 2000 samples. Expect the coverage
   for one band in under 300 ms in Node on the CI machine, and no recomputation when nothing changed
   (cache hit). Test in Task 4 and Task 11.
5. **The laptop changes band or drops the link during a 5-reading sample.** Expect: the sample keeps
   the readings of the majority band; fewer than 3 usable readings → no sample and the line
   `sample skipped <reason>`. Test in Task 15.

---

# Stage S1: Prediction (one pull request into `feature/wifi-coverage`)

### Task 1: Materials table and its generator

**Files:**
- Create: `tools/materials_table.py`
- Create: `components/floorplan/cards/lib/materials.json`
- Test: `tests/test_materials_table.py`

**Interfaces:**
- Produces: `materials.json` =
  `{"bands": {"2.4": {"mhz": 2437, "l0": 40.2, "tx": 20}, "5": {…47.3, 23}, "6": {…48.7, 23}},
    "defaults": {"interior": "interior", "exterior": "exterior", "slab": "slab", "window": "double", "door": "wood"},
    "materials": {"<id>": {"loss": {"2.4": n, "5": n, "6": n}, "sd": n, "for": ["wall"|"window"|"door"|"slab"], "basis": "…"}}}`
  with exactly the 14 ids and values of the spec's table.
- Produces: `tools/materials_table.py`: `slab_loss(material: str, f_ghz: float, thickness_m: float) -> float`
  (P.2040-3 normal-incidence single slab, averaged over ±20 % thickness, 41 steps) and `main()` that
  prints the computed column per homogeneous row; it does not rewrite the rounded table.

- [ ] **Step 1: Write the failing tests**

```python
def test_p2040_slab_values_match_the_spec_basis():
    assert round(slab_loss("concrete", 2.437, 0.20), 1) == 14.7
    assert round(slab_loss("concrete", 5.5, 0.20), 1) == 26.5
    assert round(slab_loss("brick", 2.437, 0.12), 1) == 3.8
    assert round(slab_loss("glass", 6.5, 0.004), 1) == 3.2

def test_table_has_the_spec_rows_and_bands():
    t = json.loads(MATERIALS.read_text())
    assert set(t["materials"]) == {"drywall", "wood", "aerated_block", "brick", "concrete", "reinforced_concrete",
        "glass", "double", "low_e", "triple_low_e", "metal", "interior", "exterior", "slab"}
    assert t["materials"]["low_e"]["loss"] == {"2.4": 20, "5": 27, "6": 30} and t["materials"]["low_e"]["sd"] == 8
    assert t["bands"]["5"] == {"mhz": 5500, "l0": 47.3, "tx": 23}

def test_every_homogeneous_prior_is_at_least_its_slab_value():
    # drywall, wood, brick, concrete, reinforced_concrete, glass: rounded prior ≥ computed lower thickness
```

- [ ] **Step 2: Run** `uv run pytest tests/test_materials_table.py -q` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `slab_loss` with P.2040-3 Table 3 coefficients (concrete 5.24/0/0.0462/0.7822,
  brick 3.91/0/0.0238/0.16, plasterboard 2.73/0/0.0085/0.9395, wood 1.99/0/0.0047/1.0718,
  glass 6.31/0/0.0036/1.3394); check them against the ITU text and note the check in the module
  docstring. Write `materials.json` by hand from the spec table.
- [ ] **Step 4: Run** the tests — Expected: PASS.
- [ ] **Step 5: Commit** `git add tools/materials_table.py components/floorplan/cards/lib/materials.json tests/test_materials_table.py && git commit -m "floorplan: materials table for Wi-Fi coverage (SPEC-044)"`

### Task 2: Document keys, validation and push lines

**Files:**
- Modify: `schemas/floorplan.schema.json` (top-level `wifi`; floor `height`, `slab`, `walls`, `access_points`; `openings[].material`)
- Modify: `tools/domosenso_cli/floorplan_doc.py` (`validate`, `_check_opening`, `diff`, new `_wifi(floor)`, `_samples(doc)`)
- Modify: `docs/COMPATIBILITY.md` (schema row and command row, as the spec's Compatibility says)
- Test: `tests/test_floorplan_schema.py`, `tests/test_cli_floorplan.py`

**Interfaces:**
- Consumes: `materials.json` ids and their `for` lists (read by path from `components/floorplan/cards/lib/`).
- Produces: `diff()` lines `("wifi", "change", <floor label>)` and `("wifi", "samples", "<n>")`, printed by
  `push --plan` as `wifi change <floor>` and `wifi samples <n>`.
- Produces: `validate()` refusals, each a `DomosensoError` with these reasons:
  `wall on floor <f>: <at> is not on a room edge`, `unknown material <id>`, `material <id> does not fit a <kind>`,
  `access point on floor <f>: <key> is not a point of the floor`, `access point twice: <key>`,
  `access point <key>: bands empty or unknown`, `access point <key>: tx <band> out of range`,
  `mount out of range`, `height out of range`, `sample <i>: floor <id> not in the plan`,
  `sample <i>: dbm out of range`, `more than 2000 samples`.

- [ ] **Step 1: Write the failing tests** — one per refusal above (parametrised), plus
  `test_push_plan_prints_wifi_change_when_a_wall_material_changes`,
  `test_push_plan_prints_wifi_samples_with_the_count_after_push`,
  `test_a_plan_without_wifi_keys_validates_and_pushes_unchanged` (the existing fixture, byte-equal canonical form).
- [ ] **Step 2: Run** `uv run pytest tests/test_floorplan_schema.py tests/test_cli_floorplan.py -q` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** A wall's `at` is on an edge when `snapToEdge`-equivalent distance ≤ 0.05 m
  (port the 6-line helper into `floorplan_doc.py`). `_wifi(floor)` compares walls, access points,
  `height`, `slab` and opening materials, rounded like points, order left out. Samples are compared as
  a rounded sorted list.
- [ ] **Step 4: Run** the tests — Expected: PASS, and the whole floorplan suite still passes.
- [ ] **Step 5: Commit** `git commit -m "floorplan: Wi-Fi keys in the plan document, validated and diffed (SPEC-044)"`

### Task 3: Walls with materials and path loss

**Files:**
- Create: `components/floorplan/cards/lib/wifi.js`
- Test: `components/floorplan/cards/lib/wifi.test.mjs`

**Interfaces:**
- Consumes: `geometry.js` `snapToEdge`, `pointInPolygon`; `plan.js` `facingWalls(floor)`;
  `openings.js` `openingShape(floor, o)`, `openingState(o, hass)`, `kindOf(o)`; `materials.json`.
- Produces:
  - `export const BANDS = ["2.4", "5", "6"]`
  - `export function wallSegments(floor, wifi, hass) -> Segment[]` where
    `Segment = {a: [x, y], b: [x, y], material: string, open: boolean, kind: "wall" | "opening"}`:
    every room edge once (shared edges merged), edges inside an open space dropped, each opening cut out
    of its wall as its own segment (`open` from `openingState`, material from `openings[].material` or
    the kind's default), wall material from `floor.walls` (`at` within 0.05 m), else `wifi.defaults`
    interior/exterior.
  - `export function pathLoss(segments, p, q, band, losses) -> number`, `losses[material][band]` in dB;
    sums `L·min(1/cos θ, 2)` over segments the open segment `p→q` crosses; an open opening costs 0.

- [ ] **Step 1: Write the failing tests**
  - `"a wall shared by two rooms is one segment"`: two 3×3 rooms side by side → the shared edge appears once.
  - `"a ray through the shared wall pays it once"`: `pathLoss(..., [1.5,1.5], [4.5,1.5], "5", {brick:{5:10}})` with that wall `brick` → `10`.
  - `"a ray through a corner pays one wall, not two"`.
  - `"oblique crossing costs more, capped at twice"`: 60° → 2×, 80° → 2× (cap).
  - `"an open door costs nothing, a closed one its material"` (binary_sensor `on`/`off` in `hass`).
  - `"an edge inside an open space is no wall"`.
  - `"unset walls take the interior and exterior defaults"`.
- [ ] **Step 2: Run** `node --test components/floorplan/cards/lib/wifi.test.mjs` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** segment intersection with a 1e-9 tolerance; a hit exactly on a segment end
  counts for the segment whose parameter is in `[0, 1)` only, so a corner is paid once.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "floorplan: walls with materials and path loss (SPEC-044)"`

### Task 4: Prediction, serving access point and handover

**Files:**
- Modify: `components/floorplan/cards/lib/wifi.js`
- Test: `components/floorplan/cards/lib/wifi.test.mjs`

**Interfaces:**
- Produces:
  - `export function priorParams(table, aps) -> Params` with
    `Params = {tx: {[apKey]: {[band]: dBm}}, n: number, loss: {[material]: {[band]: dB}}, device: {[id]: dB}}`
    (`apKey` = the access point's `device_id` or `entity_id`; `tx` from the access point's `tx`, else the band default).
  - `export function predict(ctx, apKey, band, p) -> dBm` where
    `ctx = {doc, floorId, params, segmentsByFloor, apPos: {[apKey]: {floorId, x, y, mount}}, floors: [{floor_id, z, slab}]}`.
  - `export function coverage(ctx, band, step) -> {cells: [{x, y, room, dbm, ap, second}], aps: apKey[], hint: string|null}`;
    `second` is the second-strongest dBm or `null`. `hint` is `"no_access_points"` when none can be drawn.
  - `export const isHandover = (cell, margin = 6) => cell.second !== null && cell.dbm - cell.second <= margin`.
  - `export function contextFor(doc, floorId, hass, table, params?) -> ctx` (floors ordered by HA floor
    `level`, null last, then id; `z` = sum of the heights below).
  - `export function cacheKey(doc, floorId, band, params, step) -> string` (a stable JSON of the inputs).

- [ ] **Step 1: Write the failing tests**
  - `"free space at 1 m is T minus L0"`: one access point at (0,0), cell at (1,0), same height, `"5"` → `23 − 47.3`.
  - `"each doubling of distance costs 6 dB with n = 2"`.
  - `"a slab between floors costs the slab's loss"`: access point on the floor below.
  - `"serving is the strongest; handover where the top two are within 6 dB"`: two access points 10 m apart,
    the midpoint is handover, a cell 1 m from one is not.
  - `"no access point: hint and no cells"`; `"an unplaced access point is left out"`.
  - `"a band no access point serves has no cells"`.
  - `"200 m², 3 access points, one band at 0.15 m in under 300 ms"` (generated rectangle rooms; `performance.now()`).
  - `"same inputs give the same cache key and cells"`.
- [ ] **Step 2: Run** the test — Expected: FAIL.
- [ ] **Step 3: Implement** the formula of the spec's Prediction section; 3D distance with the access
  point's `mount` and the client at 1.0 m above its floor; slabs = the `slab` materials of the floors
  between.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "floorplan: Wi-Fi prediction, serving access point and handover (SPEC-044)"`

### Task 5: Access point rules

**Files:**
- Create: `components/floorplan/cards/lib/wifi-rules.json`
- Create: `components/floorplan/cards/lib/wifi-sources.js`
- Test: `components/floorplan/cards/lib/wifi-sources.test.mjs`

**Interfaces:**
- Produces: `wifi-rules.json` =
  `{"access_points": [{"integration": "tplink_deco", "device_attr": {"device_type": "deco"}, "bssid": {"2.4": "bssid_2_4_ghz", "5": "bssid_5_ghz"}, "clients": "device_tracker"}],
    "signal": {"integrations": ["esphome", "shelly", "tasmota", "wled", "tplink", "mobile_app"], "object_id": ["wi_fi", "wifi"], "bssid_object_id": ["bssid", "connected_ap_bssid"]},
    "exclude": {"integrations": ["bluetooth", "zha"], "connections": ["bluetooth", "zigbee"]}}`
- Produces: `export function accessPointCandidates(hass, floor, rules) -> string[]` (point keys of the floor
  whose device matches an access-point rule and is not yet in `floor.access_points`).
- Produces: `export const normMac = (s) => s.replaceAll("-", ":").toLowerCase()`.

- [ ] **Step 1: Write the failing tests** — a fictional `tplink_deco` node point is a candidate; a node
  already marked is not; a Deco *client* tracker is not; a plain ESPHome device is not.
- [ ] **Step 2: Run** `node --test components/floorplan/cards/lib/wifi-sources.test.mjs` — FAIL.
- [ ] **Step 3: Implement** with `hass.devices` / `hass.entities` (the frontend registries the card already reads).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "floorplan: access point rules (SPEC-044)"`

### Task 6: The radio layer's Wi-Fi maps

**Files:**
- Modify: `components/floorplan/cards/floorplan-card.js` (`_mapLayer`, `_map`, map drawing near the `heat(` call, legend)
- Modify: `components/floorplan/cards/lib/maps.js` (`MAPS.radio`, `SCALES.dbm`)
- Modify: `components/floorplan/translations/{en,de,pl}.json`
- Modify: `components/floorplan/component.yaml` (the `custom:floorplan-card` note: config `wifi`)
- Test: `components/floorplan/cards/floorplan-card.test.mjs`, `components/floorplan/cards/lib/maps.test.mjs`

**Interfaces:**
- Consumes: Task 4 `contextFor`, `coverage`, `isHandover`, `cacheKey`; Task 1 table.
- Produces: `MAPS.radio = [["wifi_2.4", null], ["wifi_5", null], ["wifi_6", null], ["serving", null]]`, only the
  bands some access point serves offered; `SCALES.dbm = {lo: -90, hi: -30, unit: "dBm", digits: 0, marks: [-67, -75], ramp: […5 colours, red to green]}`.
  Card config `wifi` (default `true`).

- [ ] **Step 1: Write the failing tests** — with a fixture plan of two rooms and two access points:
  the radio layer offers 2.4 and 5 (not 6, nobody serves it) and Serving; the 5 GHz map draws cells
  with `data-dbm`; Serving colours cells by access point and hatches handover cells; the legend shows
  −90…−30 with marks −67 and −75; `wifi: false` offers no Wi-Fi maps; no access points → the hint text
  `card.floorplan.wifi.hint.no_access_points`; the coverage is computed once per cache key (spy); an
  access point's label lists its bands ("2.4 · 5 GHz").
- [ ] **Step 2: Run** `node --test components/floorplan/cards/` — FAIL.
- [ ] **Step 3: Implement.** Cells drawn like `heat` cells; step 0.3 m when the card's width < 600 px; the
  computation memoised by `cacheKey`.
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** `git commit -m "floorplan: Wi-Fi maps on the radio layer (SPEC-044)"`

### Task 7: Edit tools: walls, opening material, access point, floor

**Files:**
- Modify: `components/floorplan/cards/floorplan-card.js` (a `walls` tool beside `openings`; panels)
- Modify: `components/floorplan/cards/lib/wifi.js` (pure edit functions)
- Modify: translations (en, de, pl)
- Test: `wifi.test.mjs`, `floorplan-card.test.mjs`

**Interfaces:**
- Produces (pure, each returns a new doc like `openings.js`' editors):
  `setWallMaterial(doc, floorId, at, material)`, `setWifiDefault(doc, which /* "interior"|"exterior" */, material)`,
  `setOpeningMaterial(doc, floorId, index, material)`,
  `setAccessPoint(doc, floorId, key, patch /* {bands?, tx?, mount?} | null to unmark */)`,
  `setFloorWifi(doc, floorId, patch /* {height?, slab?} */)`.

- [ ] **Step 1: Write the failing tests** — each editor's result (a default material removes the wall entry;
  unmarking removes the access point; `tx` limited to its bands); the card: a tap on a wall with the
  Walls tool selects its segment and the panel lists only materials whose `for` includes `wall`; the
  opening panel lists window materials for a window, door materials for a door, none for a doorway;
  a candidate from Task 5 shows "Use as access point?" once and accepting marks it.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** `git commit -m "floorplan: edit walls, opening materials, access points and floors (SPEC-044)"`

### Task 8: S1 README, staging and pull request

**Files:**
- Modify: `components/floorplan/README.md` (Wi-Fi maps, materials, how to mark access points)

- [ ] **Step 1:** Write the README section (what the maps show, that it is a prediction, the materials table's meaning).
- [ ] **Step 2: Run** `tools/check-all.sh` — Expected: every step `ok`.
- [ ] **Step 3:** Render the card into a home with `render floorplan --catalog-dev <worktree>` and take a
  screenshot per map with the demo home for the pull request (`pr-evidence/<PR>` branch, as the catalog does).
- [ ] **Step 4: Commit** and open the pull request into `feature/wifi-coverage`.

---

# Stage S2: Device calibration

### Task 9: Signal observations from devices

**Files:**
- Modify: `components/floorplan/cards/lib/wifi-sources.js`
- Test: `wifi-sources.test.mjs`

**Interfaces:**
- Produces: `Observation = {floorId, x, y, band, ap: apKey|null, dbm, weight, source: "device"|"survey"|"manual", device?: string, entity?: string}`.
- Produces: `export function deviceObservations(hass, doc, floorId, rules, values /* {[entity_id]: number} */) -> Observation[]`:
  placed points only; a signal entity counts when `device_class === "signal_strength"`, unit `dBm`, and its
  integration is in `rules.signal.integrations` or its object id contains a `rules.signal.object_id` word;
  excluded by `rules.exclude`; the access point and band from the device's BSSID entity matched (after
  `normMac`) to an access point's BSSID entities, else from a router client tracker whose `mac` attribute
  matches one of the device's `mac` connections (`deco_device` → access point by name, `connection_type`
  → band), else `ap: null` and band `"2.4"` with weight 0.5.
- Produces: `export function signalEntities(hass, rules) -> string[]` (the entities whose 24 h means the card fetches).

- [ ] **Step 1: Write the failing tests** — an ESPHome Wi-Fi sensor with a BSSID on access point A's 2.4 GHz →
  `{ap: A, band: "2.4", weight: 1}`; BSSID upper-case or dashed still matches; a device without BSSID
  found through the client tracker's `mac` with dashes; a Bluetooth dBm sensor → none; a Tapo
  `signal_level` → none; `unavailable` value → none; an unplaced point → none.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `git commit -m "floorplan: Wi-Fi observations from devices' signal sensors (SPEC-044)"`

### Task 10: The fit

**Files:**
- Create: `components/floorplan/cards/lib/wifi-fit.js`
- Test: `components/floorplan/cards/lib/wifi-fit.test.mjs`

**Interfaces:**
- Consumes: Task 4 `ctx`, `predict`, `priorParams`; Task 3 `pathLoss`; Task 9 `Observation`.
- Produces: `export function calibrate(ctx, observations, table) -> {params: Params, moved: {tx: boolean, loss: boolean, n: boolean}, residuals: [{obs: Observation, r: number}]}`.
  Gauss–Newton with priors as extra residual rows (`(θ − prior)/sd`), 10 fixed iterations, unknowns
  sorted by key; observation sd 4 dB times `1/weight`; the guards and cross-band rule of Global Constraints.
  An observation with `ap: null` is compared with the strongest predicted access point on its band.

- [ ] **Step 1: Write the failing tests** — synthetic observations from known params:
  recovers a +5 dB `tx` offset within 1 dB; recovers a brick wall of 12 dB (prior 10 ± 3) within 1 dB
  with ≥ 5 observations in ≥ 3 rooms; with 4 observations only `tx` moves (`moved.loss === false`);
  observations all in one room keep materials at their priors; a 2.4 GHz-only set moves the 5 GHz loss
  of the same material by the prior ratio at one third of the weight; same input twice → identical params.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `git commit -m "floorplan: calibrate the Wi-Fi model from observations (SPEC-044)"`

### Task 11: Residuals and confidence

**Files:**
- Modify: `components/floorplan/cards/lib/wifi-fit.js`
- Test: `wifi-fit.test.mjs`

**Interfaces:**
- Produces: `export function residualAt(residuals, segments, p) -> dB` (inverse distance squared, 3 m range,
  each wall between halves the weight; 0 beyond the range);
  `export function calibratedCoverage(ctx, band, step, fit) -> same shape as coverage() plus cell.conf`;
  `export function confidenceOf(cell, observations, fit, ctx) -> "high"|"medium"|"low"`.

- [ ] **Step 1: Write the failing tests** — a +8 dB residual raises the cell beside it by about 8 and nothing at 3.1 m;
  a −8 dB residual lowers it; a wall between halves the effect; a cell 1.5 m from an observation of its
  serving access point and band is `high`, one whose paths cross a fitted material is `medium`, else
  `low`; 2000 observations and 200 m² in under 300 ms for one band.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `git commit -m "floorplan: residuals and confidence for Wi-Fi maps (SPEC-044)"`

### Task 12: Card: Predicted / Calibrated, Confidence, disabled sources

**Files:**
- Modify: `components/floorplan/cards/floorplan-card.js`, `lib/maps.js` (`MAPS.radio` gains `["confidence", null]`), translations
- Test: `floorplan-card.test.mjs`

**Interfaces:**
- Consumes: Tasks 9–11; the card's existing `recorder/statistics_during_period` fetch, extended with
  `signalEntities()` (hourly `mean`, last 24 h; the state when an entity has no statistics).

- [ ] **Step 1: Write the failing tests** — the switch shows Predicted / Calibrated in place of Now / 24 h on
  the Wi-Fi maps and is hidden without observations; Calibrated is the default with observations;
  Confidence draws three levels; in edit mode as admin the legend lists a disabled ESPHome Wi-Fi
  entity (fake `config/entity_registry/list`), and view mode never calls it (spy on `callWS`);
  a signal source's label shows its dBm, band and access point ("−52 dBm · 2.4 · Alex's office");
  survey samples are small dots with their dBm on the Confidence map and in edit mode only.
- [ ] **Step 2–4:** run (FAIL), implement, run `npm test` (PASS).
- [ ] **Step 5: Commit**, README section on calibration, `tools/check-all.sh` green, pull request into the feature branch.

---

# Stage S3: Survey

### Task 13: Spike: macOS BSSID access (throwaway)

- [ ] **Step 1:** In a scratch directory outside the repository, a 20-line Swift script with `CWWiFiClient.shared().interface()`
  printing `bssid()`, `rssiValue()`, `noiseMeasurement()`, `wlanChannel()`, and a `scanForNetworks(withSSID: nil)`; run it once
  without and once with Location permission granted to the terminal.
- [ ] **Step 2:** Record in the spec's Open questions what is readable (verified), and decide: the macOS reader uses
  CoreWLAN through a bundled helper when it gives the BSSID, else `system_profiler` alone. No code is kept.

### Task 14: Wi-Fi link readers

**Files:**
- Create: `tools/domosenso_cli/wifi_link.py`
- Create: `tests/fixtures/wifi/{macos_system_profiler.txt, linux_iw_link.txt, windows_netsh.txt}` (fictional networks)
- Test: `tests/test_wifi_link.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True) class Link: band: str; channel: int; dbm: float; noise: float | None; bssid: str | None`;
  `parse_macos(text: str) -> Link | None`, `parse_iw(text: str) -> Link | None`, `parse_netsh(text: str) -> Link | None`
  (`dbm = percent / 2 − 100`); `band_of(channel: int, hint: str | None) -> str` (6 GHz from the hint "6GHz" or
  the frequency); `read_link(system: str = platform.system(), interface: str | None = None) -> Link | None`;
  `mac_address(interface: str | None) -> str | None` (the laptop's own MAC, for the tracker fallback).

- [ ] **Step 1: Write the failing tests** — each fixture parses to its expected `Link`
  (the macOS fixture: channel 36 → band "5", −58/−92; one with `Channel: 69 (6GHz, 160MHz)` → band "6");
  Wi-Fi off text → `None`; `band_of(1, None) == "2.4"`.
- [ ] **Step 2–4:** run `uv run pytest tests/test_wifi_link.py -q` (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `git commit -m "domosenso: read a laptop's Wi-Fi link on macOS, Linux and Windows (SPEC-044)"`

### Task 15: `floorplan survey` command

**Files:**
- Create: `tools/domosenso_cli/floorplan_survey.py`
- Modify: `tools/domosenso_cli/floorplan.py` (`add_arguments`: `survey` action, `--interface`; `run`)
- Modify: `docs/COMPATIBILITY.md` (command row: `survey`, its lines and `FAIL` reasons)
- Test: `tests/test_floorplan_survey.py`

**Interfaces:**
- Consumes: `floorplan_preview.Preview`, `start_server`, `build_hass`; Task 14 `read_link`, `mac_address`.
- Produces: `class Survey(Preview)` with `reading() -> dict | None` (the last `Link` as JSON) and
  `sample(floor_id: str, x: float, y: float, readings: list[Link], tracker: dict | None) -> dict | None`;
  routes `GET /survey/link` and `POST /survey/sample {floor_id, x, y}` behind the same key;
  `average(readings: list[Link]) -> Link | None` (majority band; < 3 readings of it → `None`; mean dBm and noise,
  rounded to 1). The serving access point: the BSSID matched to an access point's BSSID entity, else the
  router tracker whose `mac` is the laptop's (read once per sample from the target, read-only), else absent.
- Produces lines: `survey <url>`, `link <band> <channel> <dbm> dBm` every 30 s, `sample <floor> <x> <y> <band> <dbm> dBm <ap or ->`,
  `sample skipped <reason>`, `wrote domosenso/floorplan.json`, `stopped`; `FAIL no Wi-Fi interface`, `FAIL Wi-Fi is off`.

- [ ] **Step 1: Write the failing tests** with a fake reader and `FakeHA`: five readings → one sample appended to
  `wifi.samples` with `source: "survey"`; readings 3×5 GHz + 2×2.4 GHz → a 5 GHz sample of the three;
  two readings → `sample skipped too few readings` and no write; the plan file validates after each
  write; no request other than GETs and the registry reads reaches `FakeHA`; binding is loopback only;
  without the key → 403.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `git commit -m "floorplan survey: record a laptop's Wi-Fi where the owner taps (SPEC-044)"`

### Task 16: Survey panel, next spots and manual readings in the card

**Files:**
- Modify: `components/floorplan/cards/lib/wifi.js` (`nextSpots`), `lib/wifi-sources.js` (`sampleObservations`)
- Modify: `components/floorplan/cards/floorplan-card.js` (config `survey: true` set only by the survey page; the
  Survey panel; edit-mode tool `reading`), translations
- Test: `wifi.test.mjs`, `wifi-sources.test.mjs`, `floorplan-card.test.mjs`

**Interfaces:**
- Produces: `export function nextSpots(cells, observations, rooms, n = 3) -> [{x, y, why: "far"|"handover"|"room"}]`;
  `export function sampleObservations(doc, floorId) -> Observation[]` (survey weight from prior 0 ± 3, manual 0 ± 5);
  `addReading(doc, floorId, {x, y, band, dbm, ap})` (pure editor, `source: "manual"`).

- [ ] **Step 1: Write the failing tests** — `nextSpots` returns the three farthest cells first, then unsampled handover cells, then
  rooms without samples; samples become observations; the Survey panel shows the live link from
  `/survey/link`, "I'm here" posts the tapped position, the samples redraw; Add reading saves a manual sample.
- [ ] **Step 2–4:** run (FAIL), implement, run `npm test` (PASS).
- [ ] **Step 5: Commit** `git commit -m "floorplan: survey panel, next spots and manual readings (SPEC-044)"`

### Task 17: The survey walk in the README, and the stage's pull request

- [ ] **Step 1:** Copy the spec's "Survey walk" steps into `components/floorplan/README.md`, and the same text as
  the Survey panel's help (translations en, de, pl).
- [ ] **Step 2:** Run `tools/check-all.sh` — Expected: every step `ok`.
- [ ] **Step 3:** A real walk in a home (the maintainer), `floorplan push --plan`, screenshots before and after
  calibration for the pull request.
- [ ] **Step 4:** Commit; pull request into `feature/wifi-coverage`; when S1–S3 are merged there, one pull
  request from the feature branch into `main` for the maintainer.
