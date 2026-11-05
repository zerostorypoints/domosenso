# pocket: field notes

A phone dashboard for the Companion app, built on the shared home inputs and climate-air's
threshold helpers. One YAML dashboard per language with one `panel` view holding one card,
`custom:pocket-app`, which draws every screen itself.

## The 0.1.0 prototype

- **Home**: attention pills, readings (inside and outside, with the air score and a lights-on
  chip), now playing, quick light tiles and a rooms strip.
- **Areas** tab (`#/areas`): every room with its lights and readings, then the **Outside** when
  the home has `outside` or `weather`.
- **Area page** (`#/area/<id>`): one room in detail, or the Outside's temperature and humidity
  (levels against climate-air's outside range); a horizontal swipe goes to the next or previous
  area. The first version's `#/rooms` and `#/room/<id>` links are redirected.
- **Bottom bar**: fixed to the bottom of the screen (beside HA's sidebar on a wide screen), its
  background down over the home indicator. Home and Settings always, the person's chosen pages
  between them, at most five; by default Home, Areas, Climate, Media, Settings. Climate, Media,
  Power, Plants and Settings are "coming next".

### Per-person settings

Stored in Home Assistant's frontend user data (websocket `frontend/get_user_data` /
`frontend/set_user_data`, key `domosenso-pocket`): they follow the person to every device and are
nobody else's. Field `bar`: the page ids on the bar. When they cannot be read, the defaults apply.

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

## Levels

`cards/lib/level.js`: `level(value, kind, limits)` gives `{level: good | fair | poor, side?: low |
high}` or `null` when the value or a limit is not a number.

- `range` (`{low, high}`): within, edges included, good; outside poor, with the side.
- `rising` (`{fair, poor}`): higher is worse; from `fair` fair, from `poor` poor (CO2, dust, VOC, NOx).
- `falling` (`{fair, poor}`): lower is worse; below `fair` fair, below `poor` poor (the air score).

`numberOf(hass, entityId)` reads a state as a number, `null` when it has none.
