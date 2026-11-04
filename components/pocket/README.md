# pocket: field notes

A phone dashboard (spec: the pocket phone view). One YAML dashboard per language with one `panel`
view holding one card, `custom:pocket-app`, which draws every screen itself. Version 0.1.0 is the
skeleton: the dashboard, the card's config and the level function; the screens follow.

## What a home needs

- The **home inputs** (`uses_home: true`): the rooms with their lights, scenes, climate, air and
  media, `outside` and `weather`. Without them the render fails.
- **climate-air** for the levels: its threshold helpers (comfort range per room with climate, air
  limits per reading). Without it the card shows readings but no level.
- A YAML dashboard per language in `configuration.yaml`, at the paths of `dashboard_paths`
  (default `dashboard-pocket` for English), each with `filename:` the rendered file.

## The card's config

Rendered from the home inputs; nothing in it is a state.

| key | holds |
|---|---|
| `lang` | the dashboard's language |
| `rooms` | per room in the home's order: `id`, `name` (in this language), and `lights`, `scenes`, `climate`, `air`, `media` as the home gives them |
| `outside`, `weather` | as the home gives them; absent when it does not |
| `thresholds.rooms` | per room with climate: `temp_low`, `temp_high` (and `humidity_low`, `humidity_high` with a humidity sensor), each a climate-air `input_number` id |
| `thresholds.air` | per air reading any room names (score, co2, pm2_5, voc, nox): `fair`, `poor` ids |

## Levels

`cards/lib/level.js`: `level(value, kind, limits)` gives `{level: good | fair | poor, side?: low |
high}` or `null` when the value or a limit is not a number.

- `range` (`{low, high}`): within, edges included, good; outside poor, with the side.
- `rising` (`{fair, poor}`): higher is worse; from `fair` fair, from `poor` poor (CO2, dust, VOC, NOx).
- `falling` (`{fair, poor}`): lower is worse; below `fair` fair, below `poor` poor (the air score).

`numberOf(hass, entityId)` reads a state as a number, `null` when it has none.
