# floorplan: field notes

A floor plan of the home (SPEC-028): each floor's rooms as polygons in metres, each linked to a
Home Assistant area, and the sensors and plants at the places they stand. One card,
`floorplan-card`, draws it and edits it. The plan is the config of a storage-mode dashboard with url
path `floorplan`; the home repository keeps a copy in `domosenso/floorplan.json`, written from and
back to Home Assistant by `domosenso floorplan pull | push`.

## What it shows

- The rooms of one floor, each labelled with its area's name. A room whose area was deleted shows
  its `area_id` in italics; link it to an area in edit mode.
- A marker per point: a device (all its temperature, humidity, illuminance, moisture, CO₂ and PM2.5
  sensors show on one marker) or an entity without a device, such as a `plant.*`. With `values: true`
  (the default) the marker carries the current readings.
- **Categories** (SPEC-028 Amendment 5): every marker has the colour and shape of its device's
  category, from the catalog's `categories/` (the same for every component): plants, audio and
  media, radios and hubs (a diamond), presence and security, climate, light (a switch or dimmer is a
  square), shading, other. A theme can change a colour with `--floorplan-<id>`. A chip per category
  on the plan switches its markers off and on; the browser remembers the choice. `layers:` fixes the
  categories shown and hides the chips (the Ramka shows `[climate, plants]`).
- Zoom with the wheel, two fingers, or the + / − / fit buttons; drag the background to pan. Nothing
  else reacts to a tap, so the card can sit on a wall tablet (the Ramka embeds it with `edit: false`).

```yaml
type: custom:floorplan-card
plan: {schema: 1, floors: [...]}   # optional: else read from the `floorplan` dashboard
floor: ground                      # optional: the floor_id to show; default the first floor
edit: true                         # false: no Edit button
values: true                       # false: markers without readings
layers: [climate, plants]          # optional: only these categories, no chips
```

Every user can read the `floorplan` dashboard, the Ramka's kiosk user included; saving needs an
administrator (`lovelace/config/save` requires one).

## Setting it up

1. `domosenso add floorplan@0.1.0`, `render`, `deploy`: installs the card as a Lovelace resource.
2. Make the plan:
   - **from an architect's plan or a photo of one**: the agent's `floorplan-from-image` skill ([`.ai/skills/floorplan-from-image/SKILL.md`](../../.ai/skills/floorplan-from-image/SKILL.md)) traces
     the rooms, asks for one known length for the scale, matches the rooms to areas, writes
     `domosenso/floorplan.json` (and keeps the image as `domosenso/floorplan/<floor>.<ext>`, in the
     home repository only), then runs `floorplan push`;
   - **by hand**: write `domosenso/floorplan.json` (`schemas/floorplan.schema.json`), then
     `domosenso floorplan push <target> --plan` to see what would change and `--apply` to write it.
     `push` creates the `floorplan` dashboard if it is missing. It replaces the whole config of
     that dashboard with one view and the card: a card added there by hand is gone after a push
     (it is in the backup, `.domosenso/floorplan/<target>-<timestamp>.json`).
3. Open the *Floor plan* dashboard in Home Assistant and place the sensors (below).

## Editing in Home Assistant

An administrator sees **Edit** (unless the card has `edit: false`). Entering edit mode puts every
device that has an area but no position just below the centre of its area's room (several in one
room on a small circle there), drawn faded (`placed: false`) until it is dragged.

| tool | what it does |
|---|---|
| Move | drag a marker (it becomes `placed: true`); drag a room corner (a corner shared with a neighbouring room moves with it, and a corner dropped within 5 cm of another room's corner or wall snaps onto it, so the walls stay shared; otherwise it lands on a 5 cm grid); double-click a wall to add a corner (on the grid along a level or plumb wall), a corner to remove it; tap a room to link it to another area or to create a new area by name |
| Split | tap two points on the walls of one room; then pick the area of the new half (or create one). The first half keeps the room's area |
| Join | tap two neighbouring rooms; the first keeps its area. Rooms join only along a shared wall |

- The tray lists the devices not on the plan yet (no area, or an area without a room on this floor):
  every enabled device with an entity that is not a diagnostic, a computed sensor or a light group
  (a Hue room or zone), except phones, Bluetooth tags and network clients, which move. A device
  whose entities a plant names as its `sensors` is that plant's point, not one of its own,
  and an ESPHome Bluetooth proxy is one point, not two. They are
  grouped by room: the area, or for a plant without an area the HA area named like the room the
  plants component gives it, in any of its languages (case, spaces and diacritics aside: `Hobbyraum`
  is the area `Hobby Raum`), so such a plant is also placed in that room on its own; a room naming
  no area groups under its own name, else *No room*. Tap a group to open it; drag one sensor onto the plan, or drag a group's title to
  put all of its sensors round that spot (faded, to be dragged into place one by one); while
  dragging, a faded marker with the name follows the pointer over the plan. Inside a room the items
  go by category, each with its colour. Computed sensors are those of the `template`, `statistics`,
  `min_max`, `derivative`, `integration`, `utility_meter`, `filter`, `trend`, `threshold`,
  `compensation` and `group` integrations.
- Tap a marker to choose its category when the catalog's guess is wrong; choosing what it is anyway
  removes the override (`category` on the point in the stored plan).
- **One piece of hardware, several Home Assistant devices** (an amplifier seen by its own
  integration, by Cast and by DLNA): drop the extra devices from the tray onto the marker. They
  become part of that point (`also` in the stored plan): their readings show on it, their names in
  its tooltip. The tapped point's panel lists them; **Separate** puts one back in the tray.
- **Clusters:** the devices edit mode puts down in one room, not dragged yet, show as one dot with
  their count. Tap it to open their list; drag each device from the list to where it stands (it
  leaves the cluster), or tap one to set its category. A tap elsewhere closes the list.
- **Links:** hovering a marker, or tapping it in edit mode, draws lines to the devices it reaches
  Home Assistant through and to those that reach it through this one (Home Assistant's
  `via_device_id`): a bulb to its bridge, a hub to its sensors, a mesh node to its satellites.
- Edit mode draws a faint 1 m grid (0.5 m when zoomed in) and shows every room's floor area under
  its name; the selected room, or the one whose corner is being dragged, shows its wall lengths.
  A sensor tapped or dragged shows its distance to its room's walls straight left, right, up and
  down. Markers show only readings, never names (a plan with many sensors would be unreadable); a
  plant, whose value is its name, is a dot. A room's name sits at the widest spot inside the room
  and shrinks (down to 9 px) to fit a narrow one.
- Hovering a sensor on the plan or in the tray shows a tooltip: its photo when it has one (a plant's
  `entity_picture` from the plants component; only a path on Home Assistant or an http(s) URL), its
  name and its readings.
  Split ends also go to the 5 cm grid along their wall.
- With more than one floor in the plan, a select switches the floor.
- Split and join change only shapes: the editor never deletes an area and never moves a device to
  another area. An area left without a room after a join stays in Home Assistant.
- **Save** reads the dashboard again first. If the plan there is not the one this page loaded (an
  edit in another tab, or a `floorplan push` since), it saves nothing and says so: reload the page
  and edit again. **Cancel** drops the unsaved edits of the plan. An area created by name in the
  editor is created in Home Assistant at once: Cancel does not remove it (delete it in Home
  Assistant's area settings if it is not wanted).

## After editing in Home Assistant

The repository copy is now behind. Run `domosenso floorplan pull <target>` and commit
`domosenso/floorplan.json`. `push` refuses to write over a plan edited in Home Assistant since the
last `pull`, so an edit made in the browser is never lost silently.

## Editing against a real home: `preview`

A staging Home Assistant mirrors production's states but not its device registry, so categories,
joined devices and links show only what staging itself has. To place a real home's devices:

```bash
domosenso floorplan preview production        # --port <n> (default 8130), --no-open
```

- It reads the target's areas, floors, devices, entities, config entries and states once (read
  only, with the target's token file), follows its state changes, and opens a page on
  `127.0.0.1` with the home's rendered card on that data. The token never reaches the page; the
  page's URL carries a random key, without which it answers nothing.
- **Save writes `domosenso/floorplan.json`** (validated as `push` validates, the file's `source`
  kept), never Home Assistant. Review it with `git diff`, then `floorplan push <target>`.
- Creating an area from the card is refused (`refused config/area_registry/create`): the preview
  does not write to Home Assistant. Create it there, restart the preview.
- Lines: `read <target>: areas <n> devices <n> entities <n> states <n>`, `preview <url>`, `wrote
  domosenso/floorplan.json` per save, `refused <type>`, `stopped` (Ctrl-C).

## Limits

- One floor at a time; no walls, doors, windows or furniture; tapping a room in view mode does
  nothing (SPEC-028 non-goals).
- A corner added on a wall shared with another room belongs to that room only: dragging it off the
  wall opens a gap the neighbour does not follow.
- Pinch zoom has no automated test (the test DOM has no multi-touch) and has not been tried on a
  device yet; the tests cover the wheel and the buttons.
