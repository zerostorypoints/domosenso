# pocket: field notes

A phone dashboard for the Companion app, built on the shared home inputs and climate-air's
threshold helpers. One YAML dashboard per language with one `panel` view holding one card,
`custom:pocket-app`, which draws every screen itself.

## The 0.1.0 prototype

- **Home**: attention pills, readings (inside and outside, with the air score and a lights-on
  chip), now playing, quick light tiles and a rooms strip.
- **Rooms** tab: every room with its lights and readings.
- **Room page**: one room in detail; a horizontal swipe goes to the next or previous room.
- **Bottom bar**: Home, Rooms, Media, Settings. Media and Settings are "coming next".

Levels are good, fair or poor (plus a side, low or high, for comfort ranges). They are computed in
the cards from the states and climate-air's limits; the messages are translations.

### Gestures

- A tap toggles a light. A tile for several lights switches all of them off when any is on, else
  all on.
- A horizontal drag sets its brightness. It never turns a light off: it floors at 1 %.
- A long press opens Home Assistant's details for the light.
- A horizontal swipe on a room page goes to the next or previous room, replacing the history
  entry: Back returns to Rooms, not through every room.

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
