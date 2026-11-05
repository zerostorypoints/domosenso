# pocket: field notes

A phone dashboard for the Companion app, built on the shared home inputs and climate-air's
threshold helpers. One YAML dashboard per language with one `panel` view holding one card,
`custom:pocket-app`, which draws every screen itself.

## The 0.1.0 prototype

- **Home**: attention pills, readings (inside and outside, with the air score and a lights-on
  chip), the weather in one row (with a `weather` entity: the condition now, today's high / low
  and chance of rain, opening the forecast sheet), now playing, quick light tiles and a rooms strip.
- **Climate & air** (`#/climate`): an advice card only while a limit is crossed now (a poor CO₂ or
  VOC: open a window; a poor air reading by name; a room too cold, warm, dry or humid), squares for
  Inside, Outside and Air, the weather forecast as a strip (today and the next four days, from
  Home Assistant's daily `weather/subscribe_forecast`, else the entity's `forecast` attribute),
  and a Temp / Humidity / Air switch (remembered per person) over every area, the Outside
  included: each value on a bar of its comfort range, or the air's good / fair / poor with marks at
  climate-air's limits. Every card, square and row opens its trend.
- **Areas** tab (`#/areas`): every room with its lights and readings, then the **Outside** when
  the home has `outside` or `weather`.
- **Area page** (`#/area/<id>`): one room in detail, or the Outside's temperature and humidity
  (levels against climate-air's outside range); a horizontal swipe goes to the next or previous
  area. The first version's `#/rooms` and `#/room/<id>` links are redirected. Below its controls:
  - **its part of the floor plan** (with the input `floorplan`): the floorplan component's own
    card with `area` set to the area's HA area, so it draws that room alone with its sensors and
    readings, fixed (a finger on it scrolls the page), without maps or chips; hidden while the
    area has no room on the plan. A tap on it, or **Open**, goes to the floor plan view;
  - **All sensors**, collapsed under a 44 px header with their count: every `sensor` and
    `binary_sensor` whose HA area is the area's (the entity's own area, else its device's), grouped
    by the catalog's categories (`categories/*.yaml`) exactly as the floor plan groups devices
    (`cards/lib/categories.js` and `categories.json` are copies of the floor plan's, held equal by
    a test and by `tools/category_index.py`). Hidden and disabled entities, diagnostic and
    configuration entities and a disabled device's are left out. Each row shows the name and the
    value as Home Assistant words it; a row with a number opens its trend sheet.
- **Floor plan** (`#/floorplan`, with the input `floorplan`): the floorplan component's card as
  tall as the screen between the header and the bar, read-only. Two fingers zoom, a drag pans,
  its + / − / fit buttons and maps stay in its bar at 44 px; its layer chips are in a bottom sheet
  behind **Layers**. A tap on a room opens that area's page. A bar item each person may turn on in
  Settings (off by default); without the floorplan component neither the page's plan nor the
  item is offered.
- **Widgets**: squares in a grid (an area's, the Areas tab's) share one size: equal columns and
  rows, a fixed aspect (a lone square does not stretch); no text is ellipsized anywhere, a long
  name wraps and a big value shrinks with its square. Each shows a
  title, one value in its level's colour (below a comfort range blue, above it red, the Outside
  against climate-air's outside range) with a trend arrow from the last hour, and one short line
  written to fit (no text is cut off). Every widget opens a sheet: "All good" and the attention
  pills the checks (every reading of every area, the Outside included, problems first), the inside
  chip the rooms' temperatures, the lights-on chip the lights that are on, the Air square every air
  reading; each reading in them opens its trend sheet on top (Back returns to the list).
- **Trend sheet**: Home's outside and air chips, an area's Climate square and every reading in a
  detail sheet open a bottom sheet with that reading over 24 h (the recorder's history), 7 d (hourly
  long-term statistics) or 30 d (daily), one line over the shaded comfort band (climate-air's
  range or air limit); a sensor without statistics (no `state_class`) shows its history for 7 d
  and 30 d, as far back as the recorder keeps it. It closes by a drag down on its handle, the
  close button, a tap above it or the phone's Back.
- **Bottom bar**: fixed to the bottom of the screen (beside HA's sidebar on a wide screen), its
  background down over the home indicator. Home and Settings always, the person's chosen pages
  between them, at most five; by default Home, Areas, Climate, Media, Settings. Media, Power and
  Plants are "coming next".
- **Settings** (`#/settings`): Appearance (System / Light / Dark), the bar's pages (at most three
  besides Home and Settings), the comfort ranges and air limits (each value opens Home Assistant's
  dialog of its climate-air helper, which changes it), and About: the pocket's version, every
  component the home runs (`sensor.domosenso_components`, which the `domosenso` command writes),
  the Home Assistant area each pocket area reads, and links to the catalog.
- **Colours**: the base colours (background, cards, text, lines, accent) are Home Assistant's
  theme variables, so the pocket has the theme's contrast; level colours and the lamp are the
  pocket's own. System follows the phone's light or dark setting; Light or Dark against Home
  Assistant's current theme uses the pocket's own palette for that variant.

### Per-person settings

Stored in Home Assistant's frontend user data (websocket `frontend/get_user_data` /
`frontend/set_user_data`, key `domosenso-pocket`): they follow the person to every device and are
nobody else's. Fields `bar`: the page ids on the bar; `theme`: `system` (default), `light` or `dark`. When they cannot be read, the defaults apply.

Levels are good, fair or poor (plus a side, low or high, for comfort ranges). They are computed in
the cards from the states and climate-air's limits; the messages are translations.

### Gestures

- A tap on a light tile switches the light: off when it shows on, else on. A tile for several
  lights switches all of them off when any is on, else all on.
- The brightness strip under the tile (44 px tall) is a slider: a horizontal drag or a tap sets
  the brightness. It never turns a light off: it floors at 1 %. A light without a dimmer has none.
- A long press on a light tile opens Home Assistant's details for the light.
- A horizontal swipe on an area page goes to the next or previous area (no wrap), replacing the
  history entry: Back returns to Areas, not through every area. It starts anywhere on the page, a
  light tile too, but on a brightness strip or the scene row.
- Every control (lights, All off, scenes, play/pause) shows its new state at once and keeps it
  until Home Assistant reports it; a call that fails, or no report within 4 s, puts the last
  reported state back with a short message.
- Nothing in the pocket scrolls sideways and the bar takes no drags, so neither a sideways drag
  nor iOS's rubber band moves the bar or the page; HA's pull to refresh from the top stays.

## Use in the Companion app

Register one dashboard per language in `configuration.yaml` (YAML mode), with the rendered file as
`filename:`; the main language shows in the sidebar:

```yaml
lovelace:
  dashboards:
    dashboard-pocket:               # the dashboard's URL path (needs a hyphen)
      mode: yaml
      filename: dashboards/pocket.en.yaml   # one per language: pocket.<lang>.yaml
      title: Home
      icon: mdi:cellphone
      show_in_sidebar: true
```

Restart Home Assistant, then open the dashboard in the Companion app (or set it as the app's
default dashboard in the user's profile).

## What a home needs

- The **home inputs** (`uses_home: true`): the rooms with their lights, scenes, climate, air and
  media, `outside` and `weather`. Without them the render fails.
- **floorplan** (optional, with the input `floorplan: true`): its card on the area pages and the
  floor plan view; its Lovelace resource comes with that component and its plan with `domosenso
  floorplan push`. Needs the floorplan version that has the card's `area`, `zoom` and `chips`
  options (unreleased after 0.4.0).
- **climate-air** for the levels: its threshold helpers (comfort range per room with climate, air
  limits per reading). Without it the card shows readings but no level.
- A YAML dashboard per language in `configuration.yaml`, at the paths you choose
  (`dashboard_paths` is reserved: no template reads it, it only records them; default
  `dashboard-pocket` for English), each with `filename:` the rendered file.

## The card's config

Rendered from the home inputs; nothing in it is a state.

| key | holds |
|---|---|
| `lang` | the dashboard's language |
| `rooms` | per room in the home's order: `id`, `name` (in this language), `area` (its HA area: the room's `area`, else its id), and `lights`, `scenes`, `climate`, `air`, `media` as the home gives them |
| `outside`, `weather` | as the home gives them (`outside` with its `area` when named); absent when it does not. The cards build the **Outside** pseudo-area (id `outside`, which no room may take) from them, listed after the rooms |
| `thresholds.rooms` | per room with climate: `temp_low`, `temp_high` (and `humidity_low`, `humidity_high` with a humidity sensor), each a climate-air `input_number` id |
| `thresholds.outside` | with `outside`: `temp_low`, `temp_high` (and `humidity_low`, `humidity_high` with outside humidity), climate-air's outside helpers; absent without `outside` |
| `thresholds.air` | per air reading any room names (score, co2, pm2_5, voc, nox): `fair`, `poor` ids |
| `floorplan` | `true` with the input `floorplan`: the home has the floorplan component, whose card the area pages and the floor plan view use; absent otherwise |

## Levels

`cards/lib/level.js`: `level(value, kind, limits)` gives `{level: good | fair | poor, side?: low |
high}` or `null` when the value or a limit is not a number.

- `range` (`{low, high}`): within, edges included, good; outside poor, with the side.
- `rising` (`{fair, poor}`): higher is worse; from `fair` fair, from `poor` poor (CO2, dust, VOC, NOx).
- `falling` (`{fair, poor}`): lower is worse; below `fair` fair, below `poor` poor (the air score).

`numberOf(hass, entityId)` reads a state as a number, `null` when it has none.
