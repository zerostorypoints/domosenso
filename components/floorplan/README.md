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
- **Readings** sit next to their dot where they cross no wall, stay in the dot's room and cover no
  other dot or reading; when the nearest spots are taken they move farther out, with a thin line to
  their dot.
- **Roles:** what else a device senses is a ring around its dot in that category's colour: a
  Bluetooth proxy with a presence radar wired to it is a purple diamond with a red ring, a plant
  sensor or a tablet that reads temperature has a blue one. Its dot shows while any of its roles'
  layers is on, and its tooltip lists its presence and contact sensors ("Presence: Detected"). An
  appliance's door or a vacuum's camera map is not a role. The tooltip names the dot's category
  and each ring ("Also senses: Presence and security"); the layer bar explains rings once when the
  plan has one.
- **Maps** (SPEC-028 Amendment 7): with one of plants, climate, light or radio shown alone, the bar
  offers its maps (radio: the Wi-Fi maps, below). Plants: light, temperature, soil moisture; climate: temperature, humidity, CO₂; light:
  light (what the sensors measure, lamps included) and lamps (on with a glow by brightness, off
  grey). A reading's map is interpolated inside each room from that room's placed sensors, whatever
  their category; a room without one is hatched. **Now / 24 h** switches between the current
  readings and each map's figure over the last 24 hours from the recorder's hourly statistics:
  plants the coldest, brightest and driest hour, rooms the mean, CO₂ the highest. A sensor without
  statistics (no `state_class`) has no 24 h value. On the climate layer's temperature and humidity maps, a room whose area names its
  own temperature or humidity sensor (Settings → Areas) takes that sensor's value, placed or not;
  every other sensor in it (one on an amplifier, at a vent) is a spot that fades out within 1.2 m.
  Such a room is hatched while its own sensor has no value; its tooltip says "Room sensor". Fixed scales: 17–24 °C, 30–60 %, soil 10–50 %,
  400–1400 ppm, 0–20 000 lx (log). The browser remembers the map per layer and the switch.
- **Wi-Fi maps** (SPEC-044): with the radio layer shown alone, one map per band some access point
  serves (**2.4 GHz**, **5 GHz**, **6 GHz**: the strongest predicted signal per spot) and
  **Serving** (each spot in the colour of the access point that serves it on the band chosen beside
  it; where a client moving through would hand over between two, the spot is hatched).
  - **A prediction, not a measurement.** It is worked out from the access points' positions, bands,
    transmit power and mount height, the rooms' walls and the doors and windows in them, each with
    a material, and the floor height and slab. Nothing is measured: the loss per material
    (`cards/lib/materials.json`) is a prior from ITU-R P.2040 and field values, a typical wall of
    that kind, not yours. Real walls differ, so read the map as where signal is likely strong,
    weak or gone, not as dBm to the decibel. Coated glass (low-E) and metal block the most.
  - **Scale:** fixed, −90 to −30 dBm, with marks at −67 dBm (the usual floor for calls) and −75 dBm.
  - Without an access point on the plan there is no map; the bar says how to add one.
  - `wifi: false` turns the Wi-Fi maps off.
  - **Calibration against your devices' Wi-Fi signals and the walk-around survey are not yet
    available**; the maps are the prediction alone.
- **Open spaces:** rooms open to each other without doors (a living room, kitchen and hall in one)
  share their readings on the maps instead of stopping at the line between them; the walls between
  them are dashed. Mark them in edit mode with the **Open** tool (tap two rooms); a selected room's
  panel names what it is open to and has **Close off**.
- **Doors, windows and doorways** (SPEC-028 Amendment 9, draft): drawn in the walls, each
  optionally linked to its door or window sensor (a `binary_sensor` door, window, opening or garage
  door, or a cover): an open one is drawn open in the security colour, live, and the sensor's dot
  stands on it. Edit mode's **Doors & windows** tool adds one with a tap on a wall, slides it along
  the walls (measuring the free wall either side), and sets its kind, width and sensor; a door is
  hinged or sliding, and two buttons swap its hinge (left/right) and the side it opens into.
  **Fixed glass** is a window or glass wall that never opens; **Whole wall** stretches an opening
  across its wall. Stored as `openings` on the floor.
- Zoom with the wheel, two fingers, or the + / − / fit buttons; drag the background to pan. Nothing
  else reacts to a tap, so the card can sit on a wall tablet (the Ramka embeds it with `edit: false`);
  a tap on a room only tells a host page which room it was (`room-tap`, below).

```yaml
type: custom:floorplan-card
plan: {schema: 1, floors: [...]}   # optional: else read from the `floorplan` dashboard
floor: ground                      # optional: the floor_id to show; default the first floor
edit: true                         # false: no Edit button
values: true                       # false: markers without readings
layers: [climate, plants]          # optional: only these categories, no chips
layer_choice: one                  # with layers: a chip each, one layer at a time (the Ramka)
maps: true                         # false: no maps
wifi: true                         # false: no Wi-Fi maps on the radio layer
fill: true                         # optional: as tall as the screen below the card's top
area: living_room                  # optional: that area's room alone, fitted to the card; no Edit
context: true                      # with area: the floor's other rooms faded around it
zoom: true                         # false: no wheel, pinch, pan or zoom buttons; a finger scrolls the page
chips: true                        # false: no layer chips (a host shows them: layerChips, pressLayer)
tap_tips: true                     # false: a finger's tap on a marker shows no tooltip
```

**For a host page** (the pocket's area page and floor plan view, on a phone):

- `area: <area_id>` draws the floor that holds that area's room with that room alone, the points
  standing in it or on its walls, and its doors and windows; it is fitted to the card and has no
  Edit button. An area with no room on the plan says so (status `no_area`).
- With `area`, `context: true` also draws the floor's other rooms faded (outline and name only: no
  points, readings or taps) and fits 1.5 m more on every side, so the room is seen among its
  neighbours.
- A tap on a room in view mode fires `room-tap` (`detail: {area_id}`, bubbling out of the card); a
  drag, pinch or zoom does not. Edit mode's taps are the editor's, as before.
- The card's status is its `data-status` attribute (`loading`, `none`, `unsupported`, `no_area`,
  `ready`), and a `floorplan-status` event (`detail: {status}`) fires when it changes, so a host can
  hide the card while there is no plan or no room.
- With `chips: false` the layer chips are left out; the card's `layerChips` (`[{id, name, colour,
  on}]`) lists them and `pressLayer(id)` presses one, as a tap on the chip would (the same browser
  memory). A host shows them elsewhere, in a bottom sheet.
- **On a phone** (a finger: no hover), a tap on a marker in view mode shows its tooltip, with its
  links, until the next tap; that next tap only closes it (it fires no `room-tap`), and a drag or
  pinch closes it too. A mouse keeps hover. `tap_tips: false` turns it off.
- `--floorplan-target: 44px` (a CSS variable on the card) makes the bar's buttons and the chips at
  least that big, for fingers.

Every user can read the `floorplan` dashboard, the Ramka's kiosk user included; saving needs an
administrator (`lovelace/config/save` requires one).

### The home's rooms

When the home has shared inputs (`home_inputs:` in `domosenso.yaml`), the plan shows each room
under the home's name for it, in the dashboard's language. On the climate map, a room is coloured by
the temperature or humidity sensor the home selects for it. The HA area stays the room's identity,
and devices are still found in it by area. `floorplan push` writes them into the floor plan
dashboard, and Pocket passes them on its pages.

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
  leaves the cluster), or tap one to set its category. A tap elsewhere closes the list; it hides
  while you drag. Dropping a dot on another placed dot snaps it there: devices standing at one spot
  (a shelf, a rack), or too close to tell apart at the current zoom, are one dot with their list in
  the same way; zoom in to part them.
- **Dots stay inside rooms:** dragged or dropped outside every room, a dot stands on the nearest
  wall instead.
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

### Wi-Fi: access points and materials

In edit mode (SPEC-044):

- **Access points.** A point the rules recognise as an access point (a mesh node or router from a
  supported integration) is offered once per browser: "<name>: use as access point?" (Yes / No).
  Any other point: tap it, switch on **Access point** in its panel. The panel also sets the bands it
  serves, the **transmit power** per band (dBm; empty keeps the default) and the **height above the
  floor** (m). Stored as `access_points` on the floor.
- **Walls.** The **Walls** tool selects a wall segment with a tap; its panel sets **Wall material**.
  Two buttons use that material for all interior or all exterior walls (the defaults for walls
  nothing was set on). Stored as `walls`.
- **Doors and windows.** The opening's panel has **Material**: a window or fixed glass is glass,
  double glazing (default), low-E or triple low-E; a door is wood (default), glass or metal; a
  doorway has none. Stored as `material` on the opening.
- **Floor.** With the Walls tool, the floor's **Height** (m, default 2.7) and **Floor below** (the
  slab material) are set in its panel; they decide how much a signal loses between floors.
- A change to walls, materials, access points, height or slab shows on the maps at once; **Save**
  and `floorplan push` write it as for any other edit.

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
  page's URL carries a random key, without which it answers nothing. Photos under `/local/` (the
  plants') are fetched from the target's `www` folder, which needs no login.
- **Save writes `domosenso/floorplan.json`** (validated as `push` validates, the file's `source`
  kept), never Home Assistant. Review it with `git diff`, then `floorplan push <target>`.
- Creating an area from the card is refused (`refused config/area_registry/create`): the preview
  does not write to Home Assistant. Create it there, restart the preview.
- Lines: `read <target>: areas <n> devices <n> entities <n> states <n>`, `preview <url>`, `wrote
  domosenso/floorplan.json` per save, `refused <type>`, `stopped` (Ctrl-C).

## Limits

- One floor at a time; no furniture; tapping a room in view mode does nothing (SPEC-028
  non-goals).
- A corner added on a wall shared with another room belongs to that room only: dragging it off the
  wall opens a gap the neighbour does not follow.
- Pinch zoom has no automated test (the test DOM has no multi-touch) and has not been tried on a
  device yet; the tests cover the wheel and the buttons.
