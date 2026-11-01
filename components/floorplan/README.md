# floorplan: field notes

A floor plan of the home (SPEC-027): each floor's rooms as polygons in metres, each linked to a
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
- Zoom with the wheel, two fingers, or the + / − / fit buttons; drag the background to pan. Nothing
  else reacts to a tap, so the card can sit on a wall tablet (the Ramka embeds it with `edit: false`).

```yaml
type: custom:floorplan-card
plan: {schema: 1, floors: [...]}   # optional: else read from the `floorplan` dashboard
floor: ground                      # optional: the floor_id to show; default the first floor
edit: true                         # false: no Edit button
values: true                       # false: markers without readings
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
sensor that has an area but no position just below the centre of its area's room (several in one
room on a small circle there), drawn faded (`placed: false`) until it is dragged.

| tool | what it does |
|---|---|
| Move | drag a marker (it becomes `placed: true`); drag a room corner (a corner shared with a neighbouring room moves with it, and a corner dropped within 5 cm of another room's corner or wall snaps onto it, so the walls stay shared; otherwise it lands on a 5 cm grid); double-click a wall to add a corner (on the grid along a level or plumb wall), a corner to remove it; tap a room to link it to another area or to create a new area by name |
| Split | tap two points on the walls of one room; then pick the area of the new half (or create one). The first half keeps the room's area |
| Join | tap two neighbouring rooms; the first keeps its area. Rooms join only along a shared wall |

- The tray lists the sensors not on the plan yet (no area, or an area without a room on this floor),
  grouped by room: the area, or for a plant without an area the room the plants component gives it
  (in the area's group when the names match), else *No room*. Tap a group to open it; drag one sensor onto the plan, or drag a group's title to
  put all of its sensors round that spot (faded, to be dragged into place one by one). Only the
  kinds above and plants are listed; computed sensors (from the `template`, `statistics`,
  `min_max`, `derivative`, `integration`, `utility_meter`, `filter`, `trend`, `threshold`,
  `compensation` and `group` integrations) are left out, and other entities cannot be added in 0.1.0.
- Edit mode draws a faint 1 m grid (0.5 m when zoomed in) and shows every room's floor area under
  its name; the selected room, or the one whose corner is being dragged, shows its wall lengths.
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

## Limits

- One floor at a time; no walls, doors, windows or furniture; tapping a room in view mode does
  nothing (SPEC-027 non-goals).
- A corner added on a wall shared with another room belongs to that room only: dragging it off the
  wall opens a gap the neighbour does not follow.
- Pinch zoom has no automated test (the test DOM has no multi-touch) and has not been tried on a
  device yet; the tests cover the wheel and the buttons.
