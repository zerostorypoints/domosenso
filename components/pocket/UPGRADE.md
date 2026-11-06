# pocket: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the pocket has to do.

## 0.1.0 (unreleased): areas from Home Assistant, area settings, Quick actions (SPEC-038)

- **The areas are Home Assistant's**, by their HA names (not translated), in floor order. Links use
  the HA area id: an old `#/area/<room id>` whose id is not an HA area goes to Areas. A room of the
  home inputs is now the defaults of its HA area (`area`, else `id`). With no HA areas at all, the
  inputs' rooms still stand in (and an `outside` with sensors but no `area` is an Outside area).
- **No Outside of the card's own.** The Outside pseudo-area and its weather-entity fallback are gone:
  an outside is an HA area of type Outside. `outside: {temperature, humidity, area}` gives its `area`
  the type Outside and those sensors; an `outside` without `area` shows only while HA has no areas
  (`domosenso areas` warns).
- **Every area is Inside and checked** until set otherwise: Settings → Areas → an area: Type (Inside,
  Outside, Not assigned to hide it) and Include in checks. An outside area is checked like any other;
  a home that does not want its balcony's cold reported switches it off.
- **Main sensors per kind** (climate, air, light level, sound, pressure) in the same page; an area's
  only candidate becomes its main sensor once, the first time an administrator opens Pocket. Climate
  is Home Assistant's own area setting (Related sensors): Pocket writes it there. The home's other
  choices live in HA's frontend system data (`domosenso-pocket-home`).
- **Quick actions** on Home are a person's own list (Settings → Quick actions), else the new input
  `quick_actions`, else each area's lights and All off, as before.
- **Language** is a person's setting (Settings → Appearance), Automatic by default.
- New in the home inputs: a room's `type` (`inside`, `outside`, `none`) and `checked` (bool); new in
  the pocket's inputs: `quick_actions`. Pocket's inputs are optional now (`uses_home: optional`).
- **What a home does:** run `domosenso areas <target>`; fix each `fail` line, and set `outside.area`
  if it warns. Then the skill `set-up-areas` suggests the rest (which areas are outside, which to
  leave out of the checks or hide, the main sensors, the Quick actions) for the owner to confirm. A
  home that does nothing still works: all its HA areas show, Inside, with the sensors its inputs name.

## 0.1.0 (unreleased): Media and its Sound tab

- **Media** (`#/media`) is built: artwork, progress, transport, volume, mute, source line and a
  player picker of the areas' `media` players (remembered per person, settings field
  `mediaPlayer`). Home's now playing and an area's player open it with their player
  (`#/media/<area id>`).
- With the new input `sound: true` (and optionally `sound_averages`), Media gets a **Sound** tab
  with audio-sensor's live meter and the home's Leq averages.
- **What a home does:** nothing for Media. For Sound: set `sound: true` in the pocket's inputs
  with audio-sensor added, and name its Leq sensors under `sound_averages` if it has them.

## 0.1.0 (unreleased): all sensors of an area, the floor plan

- An area page lists **All sensors** of its HA area by the catalog's categories (collapsed), each
  with a number opening its trend; with the new input `floorplan: true` it also shows the area's
  room on the floorplan component's card, and the **Floor plan** view (`#/floorplan`, a bar item
  each person may turn on) shows the whole plan with its layers in a bottom sheet.
- **What a home does:** nothing for All sensors. For the plan: set `floorplan: true` in the
  pocket's inputs, and run the floorplan component at the version with the card's `area`, `zoom`
  and `chips` options.

## 0.1.0 (unreleased): Areas, a fixed bar, the bar per person

- Rooms is **Areas** (`#/areas`, `#/area/<id>`); `#/rooms` and `#/room/<id>` redirect. The
  Outside (from `outside` / `weather`) is the last area.
- The bottom bar is fixed to the screen, and its pages are each person's choice, stored in their
  Home Assistant frontend user data (key `domosenso-pocket`).
- **What a home does:** nothing; a bookmark of an old route keeps working.

## 0.1.0 (unreleased): areas and the outside range

- The card's config gives each room its HA `area` (the home inputs' `area`, else the room id) and
  `thresholds.outside` (climate-air's outside helpers).
- **What a home does:** name `area` on a room whose id is not its area's id; render climate-air
  too, for the outside helpers.

## 0.1.0 (unreleased): first version

- The phone dashboard: one panel view with `custom:pocket-app`, configured from the home inputs and
  climate-air's threshold helpers.
- **What a home does:** add the component, register a YAML dashboard per language at the paths of
  `dashboard_paths`, and give the home inputs.
