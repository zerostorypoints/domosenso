# pocket: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the pocket has to do.

## Unreleased (SPEC-053 and its amendment 1): the wind and the weather warnings from the weather component

- **The weather row and the forecast sheet** show the wind: now "32 km/h SW", from breezy the level
  word ("Breezy · 32 km/h SW"), the gust when known (", gusts 49"); each forecast day its wind speed
  and, with the weather component's Open-Meteo gusts, its gust maximum.
- **Home's warning chip** while `binary_sensor.weather_warning` is on (strong wind, a gale, or any
  official warning from yellow up): the most severe official warning, "Orange warning ·
  Thunderstorm", with "+1" when there are more, in its level's colour; without one the wind level,
  "Strong wind · 45 km/h", "Gale · gusts 95 km/h". It replaces "All good" and opens the forecast
  sheet; the other pills stay.
- **The forecast sheet** starts with a list of every official warning in effect (the type's icon in
  its level's colour, the warning's headline in the feed's language, the level and until when) and,
  while the wind is strong or a gale, the wind line.
- **What a home does:** update `weather` to the version with the wind status and warnings (SPEC-053
  amendment 1) first and render it; Pocket reads `binary_sensor.weather_warning`,
  `sensor.weather_warnings`, `sensor.weather_wind_level` and `sensor.weather_wind_gust` when they
  are there. Without them nothing changes; without weather's `warnings` input only the wind level
  drives the chip. Gusts need weather's `gusts: open_meteo`.

## 0.2.0 (2026-11-15): plants in hydroculture (SPEC-048)

The Plants page leaves moisture and fertiliser out for a plant with `domosenso_medium:
hydroculture`, never calls it thirsty, and its fine row reads "Fine · hydroculture, water by the
gauge". Nothing to do.

## 0.2.0 (2026-11-15): the Wi-Fi survey (SPEC-045)

- New inputs `wifi_survey` (needs `floorplan`), `wifi_ssid`, `wifi_scans`. With `wifi_survey: true` the
  render adds `packages/pocket.yaml` (`sensor.domosenso_wifi_reading`) and the System page a **Wi-Fi
  survey** row for administrators.
- **What a home does:** nothing unless it wants the survey. To use it: set `wifi_survey: true`, render,
  deploy (the package needs Home Assistant's restart, which the deploy does), install the Shortcut
  **Domosenso Wi-Fi** on the iPhone from the page and choose the Server in its Fire event action once;
  on Android turn on the Companion app's Wi-Fi sensors.

## 0.2.0 (2026-11-15): areas from Home Assistant, area settings, Quick actions (SPEC-038)

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

## 0.1.0 (2026-11-05): Media and its Sound tab

- **Media** (`#/media`) is built: artwork, progress, transport, volume, mute, source line and a
  player picker of the areas' `media` players (remembered per person, settings field
  `mediaPlayer`). Home's now playing and an area's player open it with their player
  (`#/media/<area id>`).
- With the new input `sound: true` (and optionally `sound_averages`), Media gets a **Sound** tab
  with audio-sensor's live meter and the home's Leq averages.
- **What a home does:** nothing for Media. For Sound: set `sound: true` in the pocket's inputs
  with audio-sensor added, and name its Leq sensors under `sound_averages` if it has them.

## 0.1.0 (2026-11-05): all sensors of an area, the floor plan

- An area page lists **All sensors** of its HA area by the catalog's categories (collapsed), each
  with a number opening its trend; with the new input `floorplan: true` it also shows the area's
  room on the floorplan component's card, and the **Floor plan** view (`#/floorplan`, a bar item
  each person may turn on) shows the whole plan with its layers in a bottom sheet.
- **What a home does:** nothing for All sensors. For the plan: set `floorplan: true` in the
  pocket's inputs, and run the floorplan component at the version with the card's `area`, `zoom`
  and `chips` options.

## 0.1.0 (2026-11-05): Areas, a fixed bar, the bar per person

- Rooms is **Areas** (`#/areas`, `#/area/<id>`); `#/rooms` and `#/room/<id>` redirect. The
  Outside (from `outside` / `weather`) is the last area.
- The bottom bar is fixed to the screen, and its pages are each person's choice, stored in their
  Home Assistant frontend user data (key `domosenso-pocket`).
- **What a home does:** nothing; a bookmark of an old route keeps working.

## 0.1.0 (2026-11-05): areas and the outside range

- The card's config gives each room its HA `area` (the home inputs' `area`, else the room id) and
  `thresholds.outside` (climate-air's outside helpers).
- **What a home does:** name `area` on a room whose id is not its area's id; render climate-air
  too, for the outside helpers.

## 0.1.0 (2026-11-05): first version

- The phone dashboard: one panel view with `custom:pocket-app`, configured from the home inputs and
  climate-air's threshold helpers.
- **What a home does:** add the component, register a YAML dashboard per language at the paths of
  `dashboard_paths`, and give the home inputs.
