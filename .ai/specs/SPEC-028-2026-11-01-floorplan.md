# SPEC-028: Floor plan: rooms and sensor positions (floorplan 0.1.0, a `domosenso floorplan` command, ramka)

- Status: approved 2026-11-01 by the maintainer
- Source: the maintainer's design, approved 2026-11-01:
  [docs/superpowers/specs/2026-11-01-floorplan-design.md](../../docs/superpowers/specs/2026-11-01-floorplan-design.md).
  This spec states the contract; the why and the next project (light and heat map) are there.
- Decisions this spec adds to the design are marked **Decision**; inference is marked as such.

## Goal

A home gets:

1. its rooms as polygons in metres, each linked to a Home Assistant area, one plan per floor;
2. a position for each sensor that measures a place (temperature, humidity, light, soil, air,
   plants), placed by dragging on a zoomable plan in Home Assistant;
3. the plan made from an architect's plan or a photo of one, traced by the agent during onboarding
   (or later), the image kept only in the home repository;
4. the plan in the home repository, written from and back to Home Assistant by one command;
5. optionally, the plan on the Ramka as a second view of the controls, reached with a sideways swipe.

Non-goals (from the design): the light and heat map, DLI, "where to place" (next spec); automations
or templates by position; tapping a room; walls, doors, windows, furniture; several floors at once.

## Devices

None required. Points come from devices the home already has. Verified on one home: Mi Flora plant
sensors, room thermometers, an air monitor *(the shape is verified; the editor is not built yet)*.

## Integrations

Core only: `frontend`/`lovelace` (a storage-mode dashboard), the area and floor registries. No
custom integration, no HACS.

**Decision:** the plan is the config of a storage-mode Lovelace dashboard with url path
`floorplan`, created by `domosenso floorplan push` (the CLI already creates storage dashboards:
`probe`). Writing needs an administrator (`lovelace/config/save` carries `@websocket_api.require_admin`,
verified in HA 2026.9.2's `components/lovelace/websocket.py` on 2026-11-01). Every user can read it (`lovelace/config`), the Ramka's kiosk user included.

## The plan document (`schemas/floorplan.schema.json`)

```json
{
  "schema": 1,
  "floors": [{
    "floor_id": "ground",                         // HA floor id, or null in a home without floors
    "rooms":  [{"area_id": "living_room", "polygon": [[0,0],[5.4,0],[5.4,7.6],[0,7.6]]}],
    "points": [
      {"device_id": "a1b2…", "x": 0.6, "y": 0.8, "placed": true},
      {"entity_id": "plant.monstera", "x": 2.7, "y": 3.8, "placed": false}
    ]
  }],
  "source": {"image": "domosenso/floorplan/ground.jpg", "metres_per_px": 0.0123, "rotation_deg": 0,
             "offset_px": [40, 30]}                // only in the home repository's file; optional
}
```

- Coordinates in metres, origin top left, y down. A room's name is its area's name (never stored).
- A point is a `device_id` (all of the device's point entities show on it) or an `entity_id` (an
  entity without a device, e.g. a `plant.*`). Its room is the polygon it stands in, computed, not
  stored.
- `placed: false`: put at its area's room centre by the editor, not yet dragged. **Decision:** any
  consumer that interpolates readings ignores unplaced points.
- Point entities: `device_class` temperature, humidity, illuminance, moisture, carbon_dioxide, pm25,
  and `plant.*`. **Decision:** a home adds others by dragging them from the tray's search.
- Stored in the dashboard config as the `plan` key of the one `custom:floorplan-card` in its one
  view. The repository file is the same document with `source`.

## Inputs (floorplan 0.1.0)

None required. **Decision:** the component has no inputs in 0.1.0; it ships cards and a skill. A
home adds it with `domosenso add floorplan@0.1.0` and creates the plan with the skill or
`domosenso floorplan push`.

## Provides

**floorplan 0.1.0**

| surface | level | note |
|---|---|---|
| `schemas/floorplan.schema.json`, `schema: 1` | stable | a breaking change bumps `schema`; readers refuse an unknown major |
| dashboard url path `floorplan` | stable | storage mode; one view, one `custom:floorplan-card` |
| `custom:floorplan-card`, config `plan` (the document; optional, without it the card reads the `floorplan` dashboard, Amendment 1), `floor` (floor_id to show), `edit` (`true`: edit button shown to admins; default `true`), `values` (`true`: current readings on points; default `true`) | stable | `edit: false` for embedding (the Ramka) |
| card behaviour: zoom (wheel, pinch, + / − / fit), pan; edit mode: drag points (sets `placed: true`), drag / add / remove room corners, split a room by a line, join two rooms, link a room to an area or create one; a tray of point entities without a position; save with `lovelace/config/save` | — | split and join change only shapes; never deletes an area or moves a device between areas |
| skill `floorplan-from-image` (installed by `install_skills.py`), called by `onboard-home` | stable (its name) | traces rooms from an image or SVG, asks one known length for the scale, matches areas, writes `domosenso/floorplan.json` and `domosenso/floorplan/<floor>.<ext>`, then `floorplan push` |

**The `domosenso floorplan` command** (COMPATIBILITY, the `domosenso` command)

| command | lines |
|---|---|
| `floorplan pull <target> [--out <file>]` | `read floor <id> rooms <n> points <m>` per floor, `wrote <file>` (default `domosenso/floorplan.json`; keeps the file's `source`) |
| `floorplan push <target> (--plan \| --apply [--confirm <hash>])` | `dashboard create floorplan` (when missing), `room add\|change\|remove <floor> <area_id>`, `point add\|move\|remove <floor> <device or entity id>`, `area missing <area_id>`, `hash <hash>`; apply: `backup <file>` (`.domosenso/floorplan/<target>-<timestamp>.json`), `pushed`; `nothing to push` |

- `FAIL` reasons: `schema <n> not supported`, `area missing: <ids>` (a room's area is not in HA;
  push refuses), `the plan changed: its hash is now <hash>, not <given>`, `not confirmed`, and
  **Decision:** `changed on target since pull: <n> rooms, <m> points` when the target's plan differs
  from the last `pull` recorded in `.domosenso/floorplan/<target>.pulled.json` (pull first; no
  silent overwrite of a drag made in HA).
- Production: `push production --apply` asks for the word `production`, or `--confirm <hash>`, as
  `deploy` does. `deploy` is unchanged.
- `domosenso.yaml`: nothing new. `status` is unchanged: it walks only `config_dir` and `esphome_dir`,
  and `domosenso/floorplan.json` and `domosenso/floorplan/*` sit beside `domosenso/<id>.inputs.yaml`
  (home repository layout in COMPATIBILITY, ADDITIVE-ONLY; Amendment 1).

**ramka (next minor after SPEC-026)**, only when `floorplan: true` and the dashboard exists

| id | level | note |
|---|---|---|
| input `floorplan` (boolean, default `false`) | stable | |
| `input_boolean.<prefix>_controls_plan` | stable | on while the controls show the plan; turned off whenever the mode leaves `controls` |
| `corner-taps-card` swipe rule `left` / `right` on the controls page | stable | SPEC-026's thresholds; toggles the helper. **Reverses SPEC-026's non-goal** "sideways swipes on the controls", for this case only |
| controls dashboard: the plan view embeds `custom:floorplan-card` with `edit: false`, reading the plan from `lovelace/config` `floorplan` | — | a tap anywhere returns to the controls |

Consumes (ramka): the `floorplan` dashboard and the schema above.

## Artifacts and ownership

| artifact | layer |
|---|---|
| `www/domosenso/floorplan/<version>/cards/*.js`, translations | managed |
| the `floorplan` storage dashboard in HA (`.storage/lovelace.floorplan`) | not a file the deploy carries; written by `floorplan push` and the editor |
| `domosenso/floorplan.json`, `domosenso/floorplan/<floor>.<ext>` | instance (home repository) |
| `.domosenso/floorplan/` (backups, the last pull) | not committed |

The architect's plan never goes to Home Assistant (the maintainer: keep it for later changes, it
need not be visible). Verified 2026-11-01: HA 2026.9.2's `ImageServeView` (`/api/image/serve/`)
has `requires_auth = False`, so an uploaded plan would be readable without a login.

## Compatibility

- New component and command: additive. COMPATIBILITY gains the `floorplan` command's lines, the
  schema, the card, the instance files.
- ramka: additive (`floorplan` defaults to `false`); the SPEC-026 non-goal is narrowed, recorded as
  an amendment there. Needs SPEC-026 merged first.
- `UPGRADE.md` for ramka; `README.md` for floorplan (setup with the skill, editing, pull and push).

## Tests

- pytest: `tests/test_floorplan_schema.py` (valid and invalid documents, unknown `schema`),
  `tests/test_cli_floorplan.py` with `tests/fakes.py` (pull writes the file and keeps `source`;
  push plan lines for add / change / remove / move; missing area fails; the changed-on-target guard;
  dashboard created when missing; backup written; production confirm).
- `node --test`: `floorplan-card.test.mjs` (point-in-polygon room, zoom keeps the point under the
  cursor, drag sets `placed: true`, split and join, unplaced points at room centres, edit hidden
  for non-admins and with `edit: false`, save payload equals the document), `no-literals.test.mjs`.
- ramka: `corner-taps-card` left / right on controls; the helper reset on leaving controls;
  `ha-check ramka` with `floorplan: true`.
- `catalog_check --strict`, `ha-check floorplan`.
- Staging of the home that asked: its hand-drawn plan converted by the skill, pushed, dragged on a
  phone, pulled back equal; the Ramka swipe on the tablet simulator.

## Out of scope

The design's non-goals; the overlay layer API other components will draw with (**Decision:**
specified with the light and heat map, its first user, not here; the Ramka needs only the card).

## Open questions

- Pinch zoom inside the Companion app's webview on the Ramka: the plan view is read-only, so zoom
  there is a nice-to-have *(inference)*.

## Amendment 1 (planning)

Rulings made while planning the implementation (2026-11-01); they replace the text above where they
differ.

- **SPEC-026 is merged and released (ramka 0.9.0).** The Ramka view is not blocked; it goes into
  the next Ramka minor, released separately.
- **`status` needs no change.** It walks only `config_dir` and `esphome_dir`; the floorplan files
  sit beside `domosenso/<id>.inputs.yaml`, which it does not list either. The sentence "`status`
  classifies ..." is withdrawn; COMPATIBILITY's home repository layout lists the files.
- **`plan` is optional on `floorplan-card`.** Without it the card reads the `floorplan` dashboard
  (`lovelace/config`, `url_path: floorplan`) and takes the plan from its card; the Ramka uses it
  this way and needs no copy of the plan.
- **`corner-taps-card` already takes `left` / `right`** in a swipe rule (SPEC-026), so the Ramka
  change is in templates only.
- **The overlay layer API** that other components will draw with is deferred to the light and heat
  map spec, its first user.
- **The dashboard is created with `allow_single_word: true`**: Home Assistant requires a hyphen in
  a dashboard url path otherwise (verified in HA 2026.9.2, `lovelace/dashboard.py`).

## Amendment 2 (final review)

Rulings from the final review of the implementation (2026-11-01); they replace the text above where
they differ.

- **No tray search in 0.1.0.** The tray lists only the candidates of the point entities above
  (`device_class` temperature, humidity, illuminance, moisture, carbon_dioxide, pm25, and
  `plant.*`). Adding other entities by a search in the tray is deferred to a later minor of the
  component; the Decision under "Point entities" waits for it.
- **`floorplan push --apply` replaces the whole `floorplan` dashboard config** with one view and
  one card. Anything added to that dashboard by hand is gone after a push; it is in the backup
  (`.domosenso/floorplan/<target>-<timestamp>.json`, written when the dashboard had a saved config).
- **`push` reads the dashboard again after the confirm.** A save in the card while the plan was
  shown or `production` was typed ends the command with `changed on target since pull`, and the
  backup is taken from that second read.
- **An area created from the card is written at once** (`config/area_registry/create`) and stays
  after Cancel; Cancel only drops the plan's unsaved edits.
- **Coordinates are kept to a millimetre** (3 decimals) by the card and compared at that precision
  by the command.
- **A plan with a duplicate `floor_id`, a duplicate `area_id` on one floor, or a point key used
  twice is invalid**, beyond what the schema says.

## Amendment 3 (staging feedback)

Editor changes asked for by the maintainer after a trial on a staging Home Assistant (2026-11-01):
the tray was too long to use (about 40 entries, most of them computed sensors) and room shapes
were hard to draw to size. No new card config key; the stored document is unchanged.

- **Computed entities are not candidates.** An entity whose registry entry has a `platform` in
  `template`, `statistics`, `min_max`, `derivative`, `integration`, `utility_meter`, `filter`,
  `trend`, `threshold`, `compensation` or `group` is left out of the tray and of a device's marker;
  `plant.*` stays whatever its platform, and an entity without a registry entry stays.
- **The tray is grouped by room**: the candidate's area, else for a plant the plants component's
  `domosenso_room` (or its `domosenso_rooms` entry for the dashboard language), else a "No room"
  group, last. A plant room whose name equals an area group's name (ignoring case and accents)
  joins that area's group. Groups are collapsible and start collapsed when there is more than one; the card
  remembers which are open. Dragging a group's summary onto the plan puts all its sensors round the
  drop point on a 0.3 m circle with `placed: false`; a tap opens or closes it.
- **Entering edit mode spreads** the sensors it puts in one room on a 0.3 m circle (by key) instead
  of stacking them, centred 0.6 m below the room's centroid when the room is at least 2 m tall (else
  on the centroid), so the room's name and area stay readable; still `placed: false`.
- **A dropped room corner snaps to a 5 cm grid** when it did not join another room's corner or wall
  (shared walls win). An added corner and the ends of a split go to the grid along their wall, and
  only where that keeps them inside it (a level or plumb wall). Sensor points do not snap.
- **Edit mode draws a faint grid** (1 m; 0.5 m once that is 24 px on screen) and **dimensions**:
  every room's floor area under its name (1 decimal, m²) and, for the selected room or the room
  whose corner is dragged, each wall's length along the wall (2 decimals, m), live while dragging.
  Numbers use the dashboard language's decimal separator. View mode shows neither.
