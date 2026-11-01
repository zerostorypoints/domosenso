# Floor plan (floorplan 0.1.0, `domosenso floorplan`, the Ramka's plan view) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every home can hold its rooms as polygons and its sensors' positions in Home Assistant, edit them by dragging on a zoomable plan, keep them in the home repository, and show the plan on the Ramka.

**Architecture:** The plan is a JSON document (`schemas/floorplan.schema.json`) stored as the `plan` key of the one `custom:floorplan-card` on a storage-mode Lovelace dashboard `floorplan`. The card edits and saves it through the websocket; `domosenso floorplan pull|push` moves it between Home Assistant and `domosenso/floorplan.json` in the home repository. The Ramka embeds the same card read-only as a second view of its controls.

**Tech Stack:** Python 3 (`tools/domosenso_cli`, pytest, jsonschema), plain ES-module cards without a build step (`node --test`, happy-dom), Jinja-style Ramka templates (`[[ ]]`), Home Assistant 2026.9.

**Spec:** `.ai/specs/SPEC-027-2026-11-01-floorplan.md` (approved 2026-11-01); design `docs/superpowers/specs/2026-11-01-floorplan-design.md`.

## Global Constraints

- Home Assistant `2026.9`; core only: no custom integration, no HACS.
- Dashboard url path `floorplan`, storage mode, one view, one `custom:floorplan-card`.
- Plan document `schema: 1`; coordinates in metres, origin top left, y down; a reader refuses an unknown `schema`.
- Point entities: `device_class` temperature, humidity, illuminance, moisture, carbon_dioxide, pm25, and `plant.*`.
- `placed: false` for a point the editor put at its room's centre; dragging sets `placed: true`.
- Split and join change only shapes; the editor may create an area, never deletes an area or moves a device between areas.
- The architect's plan never goes to Home Assistant; it lives in the home repository as `domosenso/floorplan/<floor>.<ext>`, referenced by `source` in `domosenso/floorplan.json` only.
- Card sources carry no human-language text: every visible word in `translations/{en,de,pl}.json` under `card.*` (`no-literals.test.mjs`).
- Every `domosenso` command prints one line per action and ends with `ok` or `FAIL <reason>`; `--json` too.
- `push production --apply` asks for the word `production` or takes `--confirm <hash>`, like `deploy`; `deploy` itself is unchanged.
- No home's data in the catalog: examples use the demo home (Alex and Sam, `living_room`, `kitchen`, `office`).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Rulings made while planning (deviations from the spec text)

- **SPEC-026 is already merged and released (ramka 0.9.0).** The Ramka task is not blocked; its changes go into the next Ramka minor, released separately with `tools/release.py`.
- **`status` needs no change.** It walks only `config_dir` and `esphome_dir`; `domosenso/floorplan.json` sits beside `domosenso/<id>.inputs.yaml`, which `status` does not list either. Task 6 removes the spec's sentence and adds the files to COMPATIBILITY's home repository layout instead.
- **`plan` is optional on `floorplan-card`.** Without it the card reads the `floorplan` dashboard (`lovelace/config`, `url_path: floorplan`) and takes the plan from its card. The Ramka uses it this way and needs no copy of the plan. Task 6 adds this to the spec's Provides row.
- **`corner-taps-card` already takes `left` / `right` in a swipe rule** (SPEC-026), so the Ramka task changes only templates.

## Review Focus

1. A room whose area was deleted in HA after the plan was saved: the card draws the room with its `area_id` as the label and a missing-area mark, no crash; `push` fails `area missing`. Test in Task 4 (`roomLabel`) and Task 2 (`test_push_area_missing`).
2. The dashboard changed in another tab or by `push` while the editor was open: save re-reads the dashboard and refuses when it differs from what was loaded, with a reload prompt. Test in Task 5 (`save refuses a changed dashboard`).
3. A device with several point entities (temperature and humidity): one marker carrying both values. A device or entity with no area goes to the tray, never to (0, 0). Test in Task 4 (`candidates`).
4. A new home: no dashboard, an empty plan, a floor with no rooms. The card shows the tray and an empty-plan hint, and `push` creates the dashboard. Tests in Task 5 (`empty plan`) and Task 2 (`test_push_creates_dashboard`).
5. A non-admin (the Ramka's kiosk user, a family member): no edit button, and loading from the dashboard works. The Ramka with `floorplan: true` but no `floorplan` dashboard shows the card's no-plan message, and a sideways swipe still returns to the controls. Tests in Task 5 (`non-admin`) and Task 7 (`ha-check` fixture plus a template test).

---

### Task 1: The plan document: schema and Python model

**Files:**
- Create: `schemas/floorplan.schema.json`
- Create: `tools/domosenso_cli/floorplan_doc.py`
- Test: `tests/test_floorplan_schema.py`

**Interfaces:**
- Produces (Python, `domosenso_cli.floorplan_doc`):
  - `SCHEMA_VERSION = 1`, `URL_PATH = "floorplan"`, `CARD_TYPE = "custom:floorplan-card"`
  - `validate(doc: dict) -> None`: raises `DomosensoError("schema <n> not supported")` for another major, or a schema error naming the key (reuse `schema.describe`)
  - `extract(dashboard_config: dict | None) -> dict | None`: the `plan` of the one `CARD_TYPE` card in `views[*].cards[*]`, or None
  - `dashboard_config(doc: dict) -> dict`: `{"title": "Floor plan", "views": [{"path": "plan", "type": "panel", "cards": [{"type": CARD_TYPE, "plan": <doc without source>}]}]}`
  - `without_source(doc: dict) -> dict`
  - `canonical(doc: dict) -> bytes`: sorted-key JSON of `without_source(doc)`, coordinates rounded to 3 decimals
  - `point_key(point: dict) -> str`: the `device_id` or the `entity_id`
  - `diff(old: dict | None, new: dict) -> list[tuple[str, ...]]`: in floor order, then rooms by `area_id`, then points by key; `("room", "add"|"change"|"remove", floor, area_id)` and `("point", "add"|"move"|"remove", floor, key)`; `move` when x, y or placed differ; a floor's id prints as `-` when null

- [ ] **Step 1: Write the failing tests.** `test_valid_demo_plan` (two rooms, a device point placed and a `plant.monstera` point unplaced, `source` present: valid). `test_unknown_schema` (`schema: 2` → message `schema 2 not supported`). `test_point_needs_one_id` (both `device_id` and `entity_id`, or neither → invalid). `test_polygon_min_three_points`. `test_extract_roundtrip` (`extract(dashboard_config(doc)) == without_source(doc)`). `test_extract_none` (no card → None; None → None). `test_diff_lines` (old has living_room and kitchen, new changes living_room's polygon, removes kitchen, adds office, moves one point, adds one: exactly `[("room","change","ground","living_room"),("room","remove","ground","kitchen"),("room","add","ground","office"),("point","move","ground","dev1"),("point","add","ground","plant.monstera")]`). `test_canonical_ignores_source_and_float_noise` (0.30000000004 equals 0.3).
- [ ] **Step 2: Run** `uv run pytest tests/test_floorplan_schema.py -q`. Expected: FAIL (module missing).
- [ ] **Step 3: Write the schema** (draft 2020-12, `additionalProperties: false` throughout, a point `oneOf` `device_id` / `entity_id`, `floor_id` string or null, `source` optional with `image`, `metres_per_px`, `rotation_deg`, `offset_px`), **then implement `floorplan_doc.py`** with the signatures above.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** `floorplan: the plan document's schema and model (SPEC-027)`.

### Task 2: `domosenso floorplan pull | push`

**Files:**
- Create: `tools/domosenso_cli/floorplan.py`
- Modify: `tools/domosenso_cli/main.py` (`COMMANDS["floorplan"] = "domosenso_cli.floorplan"`, `SUMMARIES["floorplan"] = "move the floor plan between Home Assistant and the home repository"`)
- Modify: `tools/domosenso_cli/cmd_deploy.py`: turn `_confirm(plan, given, target, json_mode)` into `confirm_production(digest: str, given: str | None, target: str, json_mode: bool, command: str) -> None` (same messages, `deploy` replaced by `command`); deploy calls it with `"deploy"`
- Test: `tests/test_cli_floorplan.py` (uses `tests/fakes.py` `FakeHA`)

**Interfaces:**
- Consumes: Task 1's `validate`, `extract`, `dashboard_config`, `without_source`, `canonical`, `diff`, `URL_PATH`; `cmd_deploy.connect(t)`; `snapshot.pick_target`; `HomeConfig.load`.
- Produces: the command lines in SPEC-027 (`read floor <id> rooms <n> points <m>`, `wrote <file>`, `dashboard create floorplan`, `room …`, `point …`, `area missing <area_id>`, `hash <hash>`, `backup <file>`, `pushed`, `nothing to push`) and the files `domosenso/floorplan.json`, `.domosenso/floorplan/<target>.pulled.json`, `.domosenso/floorplan/<target>-<YYYYmmddTHHMMSSZ>.json`.
- Arguments: `floorplan (pull|push) <target> [--out <file>] [--plan | --apply] [--confirm <hash>]`. `--plan` / `--apply` are required with `push` and refused with `pull`.
- Hash: `sha256(canonical(target_doc or {}) + b"\0" + canonical(new))[:12]`.

- [ ] **Step 1: Write the failing tests.**
  - `test_pull_writes_file_and_keeps_source`: the file's `source` survives a pull; lines `read floor ground rooms 2 points 3`, `wrote domosenso/floorplan.json`; the pulled record is written.
  - `test_pull_no_dashboard`: FAIL `no floorplan dashboard on <target>`.
  - `test_push_plan_lines`: diff lines plus `hash`, and nothing is written to HA.
  - `test_push_creates_dashboard`: on an empty HA, `lovelace/dashboards/create` with `url_path=floorplan`, `require_admin=False`, `show_in_sidebar=True`, then `lovelace/config/save`; line `dashboard create floorplan`.
  - `test_push_area_missing`: a room whose area is not in `config/area_registry/list` → FAIL `area missing: office`.
  - `test_push_changed_on_target`: the target's plan differs from the pulled record → FAIL `changed on target since pull: 1 rooms, 2 points`.
  - `test_push_apply_backup_and_record`: backup file equal to the target's old dashboard config; pulled record = the new doc; lines `backup …`, `pushed`.
  - `test_push_nothing`: equal docs → `nothing to push`, no save.
  - `test_push_production_needs_confirm`: non-tty, no `--confirm` → FAIL `floorplan production needs --confirm <hash> when it does not run on a terminal`; a wrong hash → `the plan changed: …`.
  - `test_deploy_confirm_unchanged`: `tests/test_cli_deploy.py` still passes.
- [ ] **Step 2: Run** `uv run pytest tests/test_cli_floorplan.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** `add_arguments(parser)` and `run(args, rep) -> int` in `floorplan.py`, plus the `confirm_production` refactor. Read the areas with `config/area_registry/list`, and the dashboards with `lovelace/dashboards/list` and `lovelace/config` (`url_path=floorplan`).
- [ ] **Step 4: Run** `uv run pytest tests/test_cli_floorplan.py tests/test_cli_deploy.py -q`. Expected: PASS.
- [ ] **Step 5: Commit** `domosenso floorplan pull and push (SPEC-027)`.

### Task 3: The component and its geometry library

**Files:**
- Create: `components/floorplan/component.yaml` (id `floorplan`, version `0.1.0`, no `inputs`, `integrations: [{name: lovelace, source: core}]`, `host: {installs: [container, haos], ha_min: "2026.9"}`, `install_path: www/domosenso/floorplan/<version>/`, `dashboard_cards: [cards/floorplan-card.js]`, `provides` as SPEC-027's floorplan table with stability, `consumes: []`, `local_only: true`)
- Create: `components/floorplan/translations/{en,de,pl}.json` (`meta.description`, `card.*`)
- Create: `components/floorplan/cards/lib/geometry.js`, `components/floorplan/cards/testing/dom-env.mjs` (copied from ramka's)
- Test: `components/floorplan/cards/lib/geometry.test.mjs`

**Interfaces (ES module `lib/geometry.js`):**
- `pointInPolygon([x, y], polygon) -> boolean` (even-odd; a point on an edge counts as inside)
- `centroid(polygon) -> [x, y]`, the area centroid; a degenerate polygon gives the mean of its vertices
- `zoomAt(view, factor, [cx, cy]) -> view`, where `view = {x, y, w, h}` in metres; the point under `[cx, cy]` stays put; `w` is clamped to `[1, extentWidth]` (`extentWidth` from `view.max`)
- `splitPolygon(polygon, a, b) -> [p1, p2] | null`: `a` and `b` are points on the boundary (each snapped to its nearest edge within 0.05 m); null unless the chord's midpoint is inside and the chord crosses no edge
- `joinPolygons(p, q) -> polygon | null`: null unless the two share a collinear boundary segment longer than 0.05 m
- `snapToEdge(polygon, pt, tol) -> {pt, edge} | null`

  Join algorithm (not determined by the signature): insert each polygon's vertices that lie on the other's edges into that edge, drop every edge that appears in both polygons (in opposite directions), chain the remaining directed edges into one loop starting from the lowest-left vertex, and merge collinear runs.

- [ ] **Step 1: Write the failing tests.**
  - `pointInPolygon`: an L-shaped polygon (the demo hall `[[3,0],[4,0],[4,5],[0,5],[0,4],[3,4]]`) with an inside point, the notch outside, and an edge point.
  - `zoomAt` keeps the cursor point; clamps at `w = 1`.
  - `splitPolygon` of a 4 × 2 rectangle at x = 1.5: two rectangles of areas 3 and 5; a chord outside the L-polygon gives null.
  - `joinPolygons` of `[0,0..2,2]` and `[2,0..5,2]` gives the 5 × 2 rectangle, 4 vertices; two rectangles touching only at a corner give null; an L plus a rectangle that fills its notch gives a rectangle.
- [ ] **Step 2: Run** `node --test components/floorplan/cards/lib/geometry.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `geometry.js`.
- [ ] **Step 4: Run** the same tests, then `uv run tools/catalog_check.py --strict`. Expected: PASS, and `fresh: 0 errors` from the checker.
- [ ] **Step 5: Commit** `floorplan 0.1.0: the component and its geometry (SPEC-027)`.

### Task 4: The plan model in the card

**Files:**
- Create: `components/floorplan/cards/lib/plan.js`, `components/floorplan/cards/lib/i18n.js` (the same shape as audio-sensor's `lib/i18n.js`)
- Test: `components/floorplan/cards/lib/plan.test.mjs`

**Interfaces (ES module `lib/plan.js`):** all functions are pure; a `doc` is the plan document, and `hass` is the frontend object with `areas`, `devices`, `entities` and `states`.
- `POINT_CLASSES = ["temperature","humidity","illuminance","moisture","carbon_dioxide","pm25"]`
- `SCHEMA_VERSION = 1`; `supported(doc) -> boolean`
- `emptyPlan(floorIds: (string|null)[]) -> doc`
- `candidates(hass) -> [{key, kind: "device"|"entity", area_id|null, entities: string[]}]`: one per device with at least one point entity, plus `plant.*` and point entities without a device. The area is the entity's own `area_id`, else its device's.
- `autoPlace(doc, hass, floorId) -> doc`: adds every candidate missing from the plan whose area has a room on that floor, at the room's centroid, with `placed: false`. Candidates without a room stay out (they are the tray).
- `tray(doc, hass, floorId) -> candidates[]`: candidates not in any floor's points
- `roomOf(doc, floorId, [x,y]) -> area_id | null`
- `roomLabel(room, hass) -> {text, missing: boolean}`: the area's name, else `area_id` with `missing: true`
- `movePoint(doc, floorId, key, [x,y]) -> doc` (sets `placed: true`), `moveCorner(doc, floorId, area_id, index, [x,y])`, `insertCorner(...)`, `removeCorner(...)` (refuses below 3), `splitRoom(doc, floorId, area_id, a, b, newAreaId)`, `joinRooms(doc, floorId, keepAreaId, dropAreaId)`, `linkRoom(doc, floorId, area_id, newAreaId)`; each returns a new doc or `null` when refused
- `withPlan(dashboardConfig, doc) -> dashboardConfig`: the same config with the card's `plan` replaced (the Python `extract` / `dashboard_config` mirror)

- [ ] **Step 1: Write the failing tests.**
  - `candidates`: a device with temperature and humidity gives one candidate with two entities; a light-only device gives none; `plant.monstera` without a device gives a candidate.
  - `autoPlace`: a candidate lands at its room's centroid with `placed: false`; a candidate with no area stays out of the plan and appears in `tray`.
  - `movePoint` sets `placed: true`.
  - `roomLabel` with the area deleted: `{text: "office", missing: true}`.
  - `removeCorner` on a triangle returns null.
  - `joinRooms` keeps `keepAreaId` and refuses (null) when the rooms are not adjacent.
  - `withPlan(config, doc)` leaves the other keys untouched.
  - `supported({schema: 2})` is false.
- [ ] **Step 2: Run** `node --test components/floorplan/cards/lib/plan.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `plan.js` and `i18n.js`.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** `floorplan: the plan model of the card (SPEC-027)`.

### Task 5: `floorplan-card`

**Files:**
- Create: `components/floorplan/cards/floorplan-card.js`, `components/floorplan/cards/no-literals.test.mjs` (audio-sensor's, with its paths)
- Test: `components/floorplan/cards/floorplan-card.test.mjs`
- Create: `components/floorplan/README.md` (what it is; setup with the skill or `domosenso floorplan push`; editing; pull after editing in HA)

**Interfaces:**
- Consumes: Tasks 3–4.
- Element `floorplan-card`, config `{plan?, floor?, edit = true, values = true}`. Without `plan`, it calls `hass.callWS({type: "lovelace/config", url_path: "floorplan"})` and uses the plan of its card. With no dashboard, or no plan in it, it shows `card.floorplan.no_plan`.
- SVG in a `viewBox` that follows `zoomAt`. Wheel, pinch (two pointers) and the + / − / fit buttons zoom. Dragging the background pans.
- **View mode:** rooms with labels, and points with their entities' current values when `values` is on. Nothing reacts to a tap.
- **Edit button:** shown when `edit` is on and `hass.user.is_admin`.
- **Edit mode:**
  - drag points; drag, insert (double-click an edge) and remove (double-click a vertex) corners;
  - split (pick two boundary points);
  - join (pick two rooms);
  - link a room to an area (a select of `hass.areas`), or create one with `config/area_registry/create` and `{name}`;
  - a tray listing the `tray()` candidates, dragged onto the plan;
  - a floor select when the plan has more than one floor.
- **Save:**
  1. read `lovelace/config` again;
  2. if `extract` of it differs from the plan loaded, show `card.floorplan.changed_elsewhere` and do not save;
  3. otherwise `lovelace/config/save` with `withPlan(config, doc)`.
- On entering edit mode the card runs `autoPlace` on the floor shown.

- [ ] **Step 1: Write the failing tests** with happy-dom and a fake `hass` whose `callWS` records calls:
  - `loads the plan from the dashboard when config has none`;
  - `no plan message`;
  - `non-admin has no edit button`, and `edit: false hides it for an admin`;
  - `drag sets placed and moves the marker`;
  - `wheel zoom keeps the point under the cursor`;
  - `save sends withPlan`;
  - `save refuses a changed dashboard` (no `lovelace/config/save` call, the message shown);
  - `empty plan shows the tray and the hint`;
  - `values show the temperature and humidity of one device on one marker`.
- [ ] **Step 2: Run** `node --test components/floorplan/cards/`. Expected: FAIL.
- [ ] **Step 3: Implement** `floorplan-card.js`; every visible word comes from `translations/*.json` `card.floorplan.*` (en, de, pl).
- [ ] **Step 4: Run** `node --test components/floorplan/cards/` and `uv run tools/catalog_check.py --strict`. Expected: PASS, `fresh: 0 errors`.
- [ ] **Step 5: Commit** `floorplan: the card, view and edit (SPEC-027)`.

### Task 6: The skill, onboarding and the contract docs

**Files:**
- Create: `.claude/skills/floorplan-from-image/SKILL.md`
- Modify: `.claude/skills/onboard-home/SKILL.md`: a new optional section after "3. Integrations", "3.1 The floor plan", which calls the skill
- Modify: `docs/COMPATIBILITY.md`:
  - Cards row: `floorplan: floorplan`;
  - the `domosenso` command lines: `floorplan pull|push`, with its lines and FAIL reasons;
  - home repository layout: `domosenso/floorplan.json`, `domosenso/floorplan/<floor>.<ext>`;
  - a new row: `schemas/floorplan.schema.json`, `schema: 1`, STABLE.
- Modify: `.ai/specs/SPEC-027-2026-11-01-floorplan.md`: the rulings above, as `Amendment 1 (planning)`
- Test: `uv run tools/agents_check.py` and `uv run tools/install_skills.py --check` (the skill is listed)

**The skill's steps** (write them as the SKILL.md body, English, with the onboard-home skill's rules on writes and privacy):
1. Ask for the image (PDF: the page with the floor) or an existing SVG, and the HA floor it shows.
2. Trace each room as a polygon in image pixels and show the result back as an SVG overlay on the image (written to the home repository's `.domosenso/floorplan/trace.html`, opened for the owner).
3. Ask for one known length (a wall, in metres) to set `metres_per_px`.
4. Match each room to an area of `config/area_registry/list` by name. Ask about the unmatched rooms. Propose new areas, and create them only after the owner's typed yes.
5. Write `domosenso/floorplan/<floor>.<ext>` and `domosenso/floorplan.json` (with `source`), then run `domosenso floorplan push <target> --plan`. Show the plan and apply it only on a typed yes.
6. Tell the owner to drag the sensors in the `floorplan` dashboard, then run `domosenso floorplan pull <target>` and commit.

- [ ] **Step 1: Write the skill and the docs.**
- [ ] **Step 2: Run** `uv run tools/agents_check.py && uv run tools/install_skills.py --check`. Expected: `ok` from both.
- [ ] **Step 3: Commit** `floorplan: the floorplan-from-image skill, onboarding step, contract docs (SPEC-027)`.

### Task 7: The Ramka's plan view

**Files:**
- Modify: `components/ramka/component.yaml`:
  - input `floorplan` (`type: boolean`, `default: false`, `example: true`, comment: needs the floorplan component's dashboard);
  - `provides` `input_boolean.<prefix>_controls_plan`, stable;
  - `consumes`: the `floorplan` dashboard.
- Modify: `components/ramka/templates/package.yaml.j2`, under `[% if inputs.floorplan %]`:
  - `input_boolean.<prefix>_controls_plan` (initial off, not restored: `initial: false`);
  - `script.<prefix>_controls_plan_toggle`;
  - an automation `<prefix>_controls_plan_reset` that turns the helper off when `input_select.<prefix>_mode` leaves `controls`.
- Modify: `components/ramka/templates/dashboard.lang.yaml.j2`, when `inputs.floorplan`:
  - the controls swipe rule (states `[controls, calendar]`) gets `left` and `right`: `script.<prefix>_controls_plan_toggle`. Only when the mode is `controls`: add a separate rule before it with the condition `mode: controls`, carrying `up`, `down`, `left` and `right`.
  - every section with `visibility: *controls` also needs the helper off. Change the anchor's condition list when the input is on.
  - a new section, visible when the mode is `controls` and the helper is on, holds `custom:floorplan-card` with `edit: false`. A tap there already runs `script.<prefix>_show_controls` (the existing tap rule); with the input on, that script also turns the helper off.
  - the floorplan card's resource is in the home's resources once the component is added. The Ramka renders nothing for it.
- Modify: `components/ramka/UPGRADE.md`: an `Unreleased` entry ("New, optional: `floorplan: true` …; needs `floorplan` added and its dashboard pushed").
- Modify: `.ai/specs/SPEC-026-2026-11-01-ramka-pause-and-views.md`: amendment narrowing the non-goal "sideways swipes on the controls", pointing at SPEC-027.
- Create: `tests/fixtures/ramka-floorplan.yaml` (the demo inputs plus `floorplan: true`)
- Test: `tests/test_ramka_render.py`:
  - `test_floorplan_off_renders_as_before`: rendered output byte-equal to the output without the key;
  - `test_floorplan_helper_and_rules`: the helper, the script and the reset automation are present; the controls rule has `left` and `right`; the plan section's visibility.

- [ ] **Step 1: Write the failing tests.**
- [ ] **Step 2: Run** `uv run pytest tests/test_ramka_render.py -q -k floorplan`. Expected: FAIL.
- [ ] **Step 3: Implement** the template and manifest changes.
- [ ] **Step 4: Run** `uv run pytest tests/test_ramka_render.py -q`, `INPUTS=tests/fixtures/ramka-floorplan.yaml tools/ha-check.sh ramka` and `tools/ha-check.sh ramka`. Expected: PASS; `config ok` twice.
- [ ] **Step 5: Commit** `ramka: the floor plan as a second view of the controls (SPEC-027)`.

### Task 8: Whole check, then staging on the home that asked

**Files:** none in the catalog. The work in the home repository of the home that asked happens on its own branch there, with this branch as `--catalog-dev`; its paths and details come from the controller's dispatch, never into this catalog.

- [ ] **Step 1: Run** `tools/check-all.sh > <workspace>/check-all.log; tail -5 <workspace>/check-all.log`. Expected: `all checks passed`.
- [ ] **Step 2: Convert the home's hand-drawn plan** with the skill (its existing SVG; the scale is confirmed with the owner). This writes `domosenso/floorplan.json` in the home repository.
- [ ] **Step 3: Add the component on staging:**
  - `domosenso add floorplan@0.1.0 --catalog-dev <worktree>`;
  - `deploy staging --apply`;
  - `floorplan push staging --plan`, then `--apply`.

  Expected: `dashboard create floorplan`, `pushed`.
- [ ] **Step 4: Open `http://127.0.0.1:8125/floorplan`.** Drag a plant point, zoom, save; then `floorplan pull staging`. Expected: the moved point in the file with `placed: true`, and nothing else changed (`git diff`).
- [ ] **Step 5: Turn on the Ramka's `floorplan: true` on staging** and check the tablet simulator: from the controls, a swipe left shows the plan, a swipe right or a tap returns. Expected: screenshots in the home repository's `cutover/` notes.
- [ ] **Step 6: Leave staging as found** (remove the dashboard if the owner says so) and report. Production and pushing wait for the owner.
