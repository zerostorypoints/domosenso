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

## Amendment 4 (staging feedback, second round)

Card changes asked for by the maintainer during the staging trial (2026-11-01). No new card config
key; the stored document is unchanged.

- **A tray drag shows where it goes.** While a sensor or a group is dragged from the tray, a faded
  marker with its name follows the pointer over the plan. The tray is not selectable, so a text
  selection or a native drag cannot take the pointer away.
- **Markers show readings only, never names.** A plan with many sensors would be unreadable; a
  plant, whose value is its name, is a dot. The name is in the tooltip.
- **A tooltip on hover** over a marker or a tray item: the photo (the first `entity_picture` among
  the point's entities, shown only when it is a path on Home Assistant or an http(s) URL), the name
  and the readings.
- **A tapped or dragged sensor shows its distance to its room's walls**, straight left, right, up and
  down, each with a dashed line and its length (2 decimals, m). No absolute coordinates: a distance
  to a wall can be checked with a tape.
- **A room's name sits at the widest horizontal run inside the room** (inside an L-shaped room too)
  and shrinks from 14 px down to 9 px to fit a narrow room; the floor area sits under it.
- **A plant without an HA area gets the area named like its room** in any language the plants
  component gives (`domosenso_room`, `domosenso_rooms`), ignoring case, spaces and diacritics. The
  tray groups it under the area's own name and entering edit mode places it in that room, so a
  plant's room is entered once, as the HA area. A room naming no area keeps Amendment 3's label group.

## Amendment 5 (every device on the plan: categories, colours, links)

- Status: approved 2026-11-01 by the maintainer. Source: the maintainer, 2026-11-01:
  categorise the sensors and devices (Bluetooth proxies, radios, audio, lights, switches), link
  those that belong together, colour the dots by category, so that everything can be placed.
- For floorplan **0.2.0** (stages 1 and 2 below) and **0.3.0** (stage 3). Replaces "Point entities"
  and Amendment 2's first ruling where they differ.

### Candidates: every device that has a place

- A **device** is a candidate when it is enabled, not a service, and has at least one enabled entity
  in a category below. An entity without a device is a candidate when it is a `plant.*` or matches a
  category. Amendment 3's computed platforms stay out.
- **Never candidates:** devices whose entities are only `device_tracker`, `person` or diagnostics;
  `mobile_app` devices (phones move); Bluetooth tags known only by their address (no name, no
  model). They may show later as live presence, not as points.
- **One point per physical device.** A device without enabled entities is never a point. An ESPHome
  Bluetooth proxy shows in the registry as the ESPHome node plus a device of the `bluetooth`
  integration (the adapter, no entities, `via_device_id` the node, its own `bluetooth` connection;
  the two MACs differ). Verified on a real home's registry, HA 2026.9.2, 2026-11-01: the adapter is
  no point, and a node with such a child is `radio`.
- **A plant's sensor joins the plant.** The core `plant` integration names its sensors in the
  `sensors` attribute (`{"moisture": "sensor.…", "temperature": "sensor.…", …}`, verified on the
  same home); a device whose entities are listed there is not a point of its own, the plant is.

### Categories and colours

First match wins. The rules live in the component (`cards/lib/categories.js`), read off the entity
domain, `device_class` and the registry; nothing is written per home.

| id | colour (CSS variable, default) | rule | marker |
|---|---|---|---|
| `plants` | `--floorplan-plants`, green | `plant.*`, or a device with `moisture` and `conductivity` sensors | circle |
| `climate` | `--floorplan-climate`, blue | `climate.*`, or `device_class` temperature, humidity, illuminance, carbon_dioxide, pm25, pm10, volatile_organic_compounds, pressure | circle |
| `light` | `--floorplan-light`, yellow | `light.*` that is not a group (no `entity_id` list attribute; Hue rooms and zones also carry `is_hue_group`, verified); a device with only `event` / `button` / `remote` entities beside such lights (a switch or dimmer) | circle; a switch is a square |
| `security` | `--floorplan-security`, red | `lock.*`, `camera.*`, `alarm_control_panel.*`, a model named `*motion*` (its motion entity may be disabled), `binary_sensor` motion, occupancy, presence, door, window, opening | circle |
| `radio` | `--floorplan-radio`, purple | a device other devices name as `via_device_id` (a hub, a bridge, a mesh main node), except when its children are only light groups; an ESPHome node with a `bluetooth` adapter child; a `tplink_deco` or other mesh access point | diamond |
| `media` | `--floorplan-media`, teal | `media_player.*` | circle |
| `shading` | `--floorplan-shading`, brown | `cover.*` | circle |
| `other` | `--floorplan-other`, grey | appliances (`vacuum`, `lawn_mower`, the `miele` and `home_connect` integrations), tried before `security` (order 45) because appliances report a door, a lid or a camera map; and the fallback for any other candidate (power meters, printers) | circle |

- A point may override its category: optional `category` (one of the ids) on a point in the stored
  document. The editor sets it from the tooltip.
- **Layers:** a chip per category above the plan switches its points on and off, with the colour as
  legend; the choice is kept per browser. New card config `layers` (list of ids, default all) fixes
  the layers for an embedding: the Ramka's plan view uses `[climate, plants]`.
- The tray groups by room as before; inside a group, items are ordered by category with a coloured
  dot.

### Links

| kind | from | stored | drawn |
|---|---|---|---|
| `via` | the registry (`via_device_id`): a sensor and its hub, a light and its bridge, a mesh satellite and its main node | no | a thin line when either end is hovered or selected |
| `controls`, `powers` | the maintainer, in the editor: a radio and the covers it drives, a power meter and what it feeds, a relay and its heating zone | yes: `links` on a floor, `[{"from": <point key>, "to": <point key>, "kind": "controls"}]` | the same, dashed |
| `heard_by` (0.3.0) | live: a Bluetooth sensor and the proxy that hears it best | no | dotted, on a `radio` point's hover; *(inference: the advertisement source is readable over the websocket; to verify)* |

- Edit mode gains a **Link** tool: tap one point, then another, pick the kind; tap a line to remove
  it. A link whose end is no longer on the plan is dropped on save.

### Compatibility

- `schemas/floorplan.schema.json` stays `schema: 1`: `category` on a point and `links` on a floor are
  optional additions. The schema lists them, so a 0.1.0 `domosenso floorplan push` (which validates
  with `additionalProperties: false`) refuses a document that uses them; the command and the
  schema ship together, and floorplan 0.1.0's card ignores both keys. COMPATIBILITY: the schema row
  gains the two keys (ADDITIVE-ONLY).
- `custom:floorplan-card` gains config `layers` (additive). The Ramka passes `layers: [climate,
  plants]` in its next minor; without it the Ramka's plan shows every layer.
- `push` and `pull` lines gain `link add|remove <floor> <from> <to> <kind>`.

### Stages

1. **0.2.0, part 1:** the candidates and categories above, colours, layer chips, the tray by category,
   the `category` override.
2. **0.2.0, part 2:** one point per physical device, a plant's sensor joined to its plant, `via`
   links drawn.
3. **0.3.0:** the Link tool and stored `links`, `heard_by`.

### Tests

- `categories.test.mjs`: each rule with a fictional registry (the demo home); first match wins; a
  group light, a phone, a bare Bluetooth address are not candidates.
- `plan.test.mjs`: an ESPHome node and its entity-less `bluetooth` adapter give one `radio` point; a
  plant's sensor device (named in its `sensors`) joins the plant;
  `links` survive a save and lose an end that left the plan.
- `floorplan-card.test.mjs`: marker colour and shape per category; layers hide points; `layers`
  config; `via` line on hover; the Link tool (0.3.0).
- pytest: the schema accepts `category` and `links`, refuses an unknown category or kind; `push`
  lines for links.
- Staging of the home that asked: every device placeable, the categories read right, the links
  match the hardware.

### Out of scope

People's live positions; a radio coverage map; automations by position; walls, doors, windows.

### Addition: categories are catalog-wide (the maintainer, 2026-11-01)

"If we invent an ontology or a metadata connection here, model it at the system level so it can be
used in every place of the system." The categories are not the card's: they are catalog data beside
`kinds/` (SPEC-010), and the card, the CLI and later components read the same definitions.

- **`categories/<id>.yaml`**, validated by `schemas/category.schema.json` and by `catalog_check`:
  `id`, `order` (lower is tried first), `names` (en, de, pl), `colour` (the default of the CSS
  variable `--floorplan-<id>`; other cards may use the same variable), `marker` (`circle`, `square`,
  `diamond`), `placeable` (default `true`; `false` for things that move: phones, tags), `fallback`
  (the one category for whatever matched nothing), `hub` (`true`: a device other enabled devices
  name as `via_device_id`), `kinds` and `devices` (ids under `kinds/` and `devices/`: a device their
  `match:` rules recognise is in this category), `match` (SPEC-010 rules, the same fields, plus
  `only_entity_domain`: every entity of the device is in these domains, and `marker`: this rule's
  marker instead of the category's).
- **A device's category:** the point's `category` override; else the first category by `order` whose
  `kinds` or `devices` rules, own `match` rules, or `hub` test match the device; else the fallback.
  An entity without a device is tested alone (its integration is its platform).
- **One rule engine, two languages:** `tools/domosenso_cli/categories.py` (with SPEC-010's
  `hwscan.matches`) and the card's `lib/categories.js` implement it; `tests/fixtures/category-cases.json`
  holds devices and their expected category, run by pytest and by `node --test`, so both agree.
- **The card ships a generated copy:** `tools/category_index.py` writes
  `components/floorplan/cards/lib/categories.json` (the categories with their kinds' and devices'
  rules resolved); `--check` fails when it is stale (pytest runs it), like the Ramka's catalog index.
- **The card reads device integrations as SPEC-010 does:** `config_entries/get` (no admin needed,
  verified in HA 2026.9.2's `components/config/config_entries.py`) gives each config entry's
  domain; a device's integrations are the domains of its `config_entries`.
- COMPATIBILITY: the category ids and the file's fields are a contract (ADDITIVE-ONLY: a new
  category or field is additive; renaming or removing an id is breaking, since plans store ids).
- Not in stage 1: awnings driven by one radio device are its entities, so they share its point; a
  point per entity of a device is for a later stage. One appliance seen by several integrations (an
  amplifier as itself, a Cast and a DLNA renderer) is several devices in the registry, so several
  points; merging them is stage 2's "one point per physical device".
- Checked on a real home's registry (112 devices, 2026-11-01): the rules sort it as the table says;
  12 phones and tags and 8 plant sensors (joined to their plants) are not points.

### Stage 2 as built (2026-11-01)

- **No automatic merging beyond entity-less devices.** On a real home's registry no two placeable
  devices share a MAC address or a serial number: every shared MAC pairs a device with its own
  network-client entry (a tracker only, never a point), and the three registry devices of one
  amplifier (its own integration, Cast, DLNA) share no identifier. Which devices are one piece of
  hardware is the home's knowledge, so the plan stores it.
- **`also` on a device point** (`schemas/floorplan.schema.json`, optional, only with `device_id`):
  the ids of other devices that are the same hardware. They are keys of that point (the duplicate
  check counts them; `push` prints `point change` when they change), their readings show on its
  marker and their names in its tooltip, and they are neither in the tray nor placed again.
- **Joining:** a device dropped from the tray onto a marker (within 10 px) joins that point; the
  tapped point's panel lists its joined devices, each with **Separate**, which puts it back in the
  tray. A plant (an entity) cannot be joined or carry joined devices.
- **`via` links:** the registry's `via_device_id` between devices on the plan (a device joined to a
  point counts for it) is drawn as a line from the point that is hovered, dragged or (in edit mode)
  tapped to its hub, or from a hub to every device behind it. Not stored.

## Amendment 6 (`domosenso floorplan preview`: edit against a real home, read-only)

- Status: approved 2026-11-01 by the maintainer ("Go"). Source: the maintainer, 2026-11-01:
  "an option to connect to prod HA, so I can check against real data"; staging as it is stays the
  mode for a home that starts without sensors.
- Why not staging: staging mirrors production's states, not its device registry, and copying the
  registry cannot work, since Home Assistant drops devices whose integration is not set up there
  *(inference from the registry's orphan cleanup; not tried)*. Categories, joining and links
  (Amendment 5) need the registry.

### The command

```
domosenso floorplan preview <target> [--port <n>] [--no-open]
```

- Starts a page on `127.0.0.1` (default port 8130; never another interface) and opens it unless
  `--no-open`. The page runs the home's rendered card
  (`<config_dir>/www/domosenso/floorplan/<locked version>/`, what a deploy carries; a
  `--catalog-dev` render is fine) with the target's real data, and stops on Ctrl-C.
- **Read-only towards Home Assistant.** At start it reads, over the target's websocket with its
  `token_file`: `get_config` (language), `config/area_registry/list`, `config/floor_registry/list`,
  `config/device_registry/list`, `config/entity_registry/list`, `config_entries/get`, `get_states`;
  then it subscribes to `state_changed` and passes new states to the page. Nothing is written to
  Home Assistant. The token stays in the command: the page never sees it.
- **The plan is the repository's** `domosenso/floorplan.json`. The page's save writes it there
  (validated as `push` validates; the file's `source` is kept); the person reviews the diff in git
  and pushes with `floorplan push`. Without the file the command fails as `push` does.
- **The page's `hass`** is built from those reads in the frontend's shapes the card uses (`states`,
  `entities` with `device_id`, `platform`, `area_id`, `entity_category`, `hidden`, `original_name`;
  `devices`, `areas`, `floors`, `language`, `user.is_admin: true`), and its `callWS` answers
  `lovelace/config` (url path `floorplan`: the file's plan in a one-card dashboard),
  `lovelace/config/save` (writes the file), `config_entries/get` (from the read). Any other call
  (creating an area) is refused with the message that the preview does not write to Home
  Assistant; the card shows it as a refused edit.
- **Photos:** a state's `entity_picture` under `/local/` (a plant's photo) is a file of the target's
  `www` folder, which Home Assistant serves without a login; the page asks the preview for it and
  the preview fetches it from the target, with no token. Any other path is not fetched.
- **Local safety.** The page's URL carries a random key; the server answers nothing without it, so
  another page in the browser cannot read the home's data or write the file.
- **Lines:** `read <target>: areas <n> devices <n> entities <n> states <n>`, `preview <url>`,
  `wrote domosenso/floorplan.json` per save, `refused <type>` per refused call, `stopped`; `FAIL`
  reasons: those of `push` for the file, `no floorplan card rendered: <path>` (render first),
  `port <n> in use`, and the target's connection failures as `snapshot` prints them.

### Compatibility, tests

- Additive: a new action of `floorplan`; COMPATIBILITY's `floorplan` row gains it. No card change:
  the page feeds the card the config and `hass` it already takes.
- pytest with `tests/fakes.py`: the reads build the expected `hass` shapes (disabled entities and
  devices left out, `hidden_by` as `hidden`); a save writes the file, keeps `source`, refuses an
  invalid plan and a request without the key; a refused call returns an error and writes nothing;
  the server binds 127.0.0.1 only; nothing but reads reaches the fake Home Assistant.
- By hand: `floorplan preview production` on the home that asked, every device placeable, a save
  shown by `git diff`, then `floorplan push staging --plan`.

### Out of scope

Writing to Home Assistant from the preview (areas, the dashboard); the Ramka's view; more than one
browser editing at once (the last save wins, as two tabs on the dashboard would).

### Addition: clusters of unplaced devices (the maintainer, 2026-11-01)

With a real home in the preview, edit mode put about 20 devices of one room on a 0.3 m circle,
covering each other. The maintainer: break them down into a list of devices under one dot.

- Two or more **unplaced** points (`placed: false`) in one room, of the layers shown, are drawn as
  one dot with their count at their mean position; placed points and a room's lone unplaced point
  keep their own markers. Hovering the dot names its devices.
- In edit mode a tap on the dot opens the list of its devices beside it (each with its category's
  dot, by name). Dragging a device out of the list moves it like a marker (it becomes `placed:
  true` and leaves the cluster); a tap picks it (its panel and distances). The list stays open
  while the cluster has two or more devices; a tap elsewhere closes it. Dragging the dot pans.
- View mode draws the same dots and does nothing on a tap (the design's "nothing to tap").
- While a device is dragged the list is hidden; it comes back after the drop while the cluster
  still has two or more devices.
- A registry link to a device inside a cluster ends at the cluster's dot, one line per dot, with the
  names of the linked devices in it written there (a sensor's hub not placed yet reads as such).
- **Stacks** (the maintainer: a dot dragged onto another should snap and make a combined list): a dot
  dropped within 10 px of another placed dot takes its exact position; placed dots closer than 14 px
  on screen to one another (single linkage, at the current zoom) are one dot with their count and
  list, like a room's cluster, so no dot hides under another; zooming in parts them, dragging one out
  of the list unstacks it. (A real plan had a lamp 7 mm off two others, hidden under their dot.) (A device dropped from the tray onto a marker still joins it as the same hardware.)
- **Dots stay inside rooms** (the maintainer: no leaving the room outlines, at most snapped to the
  wall): a dot dragged, dropped from the tray or from a list outside every room stands on the
  nearest point of a room's walls, while dragging and after. Moving into another room is fine.
- No change to the stored document.

### Addition: a device has roles, not one category (the maintainer, 2026-11-01, "Yes, build roles")

A radar wired to a Bluetooth proxy (an LD2410C on an ESPHome Atom) is entities of the proxy's
device, so the proxy's one category, `radio`, hid it: no presence on the dot, none in its layer.

- **Roles:** its category (the first that matches, as before), then every further category marked
  `extra_role: true` whose rules match it, by `order`. Only what a device senses is a further role
  (`security`, `climate`): every Bluetooth proxy also has a status LED as a `light` entity, which
  must not read as a light. A rule marked `extra_role: false` gives its category only, never a
  further role: on a real home a dryer's and a dishwasher's door and a robot vacuum's lid and camera
  map read as presence (security's door, window, opening and lock/camera/alarm rules are so marked;
  motion, occupancy and presence count). Checked on that home: the two proxies with radars and the
  motion sensor get the presence role, the plant sensors and the wall tablet a climate role, the
  appliances none. The first is its category as before (colour, shape, the point's `category`
  override replaces it); the others are its further roles. `tools/domosenso_cli/categories.py`
  `roles_of` and the card's `rolesOf` give the list; `category_of` / `categoryOf` stay its first.
  Shared cases name the expected roles where a device has several.
- **On the plan:** a further role is a ring around the dot in that role's colour (two at most). A
  layer shows a dot when any of its roles is switched on; the chips list every role on the plan.
- **Explained** (the maintainer: "add explainers to what each ring means"): the tooltip names the
  dot's category and, per ring, "Also senses: <role>" with a ring in its colour; the layer bar adds
  "ring: what else a device senses" when any dot on the plan has one (en, de, pl).
- **Presence in the tooltip:** a device's `binary_sensor` entities of the classes the `security`
  rules name (motion, occupancy, presence, door, window, opening) show in its tooltip with their
  name and state; the marker itself still shows only the point readings.
- COMPATIBILITY: the categories row gains roles (ADDITIVE-ONLY); the stored document is unchanged.
