# Shared home model: decisions for the browser track (H0-lite)

Status: agreed in the review of the shared home metadata design
([#219](https://github.com/zerostorypoints/domosenso/pull/219), review and replies on 2026-11-05).
This record is for **track A**, the browser dashboards (Pocket, the Ramka, the floor plan). It answers
the questions #219's H0 asks for this track. Track B (Frame v2) uses the same keys and fixtures and
gates only its own activation.

Background: [the Pocket architecture guide](2026-11-05-pocket-architecture-review.md) (home inputs,
thresholds, discovery, settings) and `components/pocket/DESIGN.md`.

## D1. Assessment keys

A level has one of three stable keys: **`good`**, **`fair`**, **`poor`**. A comfort range adds
**`side: low | high`** when a reading is outside it. These keys appear in helper ids, typed facts and
fixtures, and they never change. Wording ("raised" / "high", "too cold") and colours (`cold` / `warm`
tones) belong to translations and presentation.

| kind | limits | `poor` | `fair` | `good` |
|---|---|---|---|---|
| `range` (temperature, humidity) | `{low, high}` | `value < low` (side `low`) or `value > high` (side `high`) | — (no band until one is defined) | `low <= value <= high` |
| `rising` (CO2, PM2.5, VOC, NOx) | `{fair, poor}` | `value >= poor` | `value >= fair` | otherwise |
| `falling` (air score) | `{fair, poor}` | `value < poor` | `value < fair` | otherwise |

A value or a limit that isn't a finite number gives **no level**, and the number is still shown. The
cases are in [`tests/fixtures/assessment.json`](../tests/fixtures/assessment.json). Every
implementation runs them: Pocket's `cards/lib/level.js`, the Python reference in
`tests/test_assessment_fixtures.py`, and the Ramka's and the Bridge's when they move onto it.

## D2. Helper ids and the policy owner

`climate-air` owns the household policy as Home Assistant helpers, seeded once from its inputs:

- per room with climate: `input_number.climate_air_<room>_{temp,humidity}_{low,high}`;
- per air reading: `input_number.climate_air_<reading>_{fair,poor}`, readings `score`, `co2`,
  `pm2_5`, `voc`, `nox`.

The Ramka's own helpers map onto them as follows. The Ramka renamed raised/high to "fair from /
poor from" in 0.9.0 but kept the ids.

| the Ramka (`<prefix>_air_…`) | climate-air |
|---|---|
| `score_fair`, `score_poor` | `climate_air_score_fair`, `climate_air_score_poor` |
| `co2_raised`, `co2_high` | `climate_air_co2_fair`, `climate_air_co2_poor` |
| `pm2_5_raised`, `pm2_5_high` | `climate_air_pm2_5_fair`, `climate_air_pm2_5_poor` |
| `voc_raised`, `voc_high` | `climate_air_voc_fair`, `climate_air_voc_poor` |
| `nox_raised`, `nox_high` | `climate_air_nox_fair`, `climate_air_nox_poor` |
| a widget's `temp_low` / `temp_high` / `hum_low` / `hum_high` (`sensor.<prefix>_climate_rooms`) | `climate_air_<room>_{temp,humidity}_{low,high}` of the room the widget shows |

Both sides' defaults are equal: 80/60, 800/1200, 15/35, 150/250, 20/150, and comfort 20–24 °C and
40–60 %.

**Migration (P3).** The values to carry over are the **live** ones, read from a `snapshot` of the
home, not template defaults. Seed-once only initialises a helper that doesn't exist yet. Where a
`climate_air_*` helper already exists with a different value, the dry-run reports a conflict, and
the home chooses explicitly before apply. `compare` before and after, with the renames explained in
`equivalence.yaml`, must read `equivalent` on the numbers.

## D3. Browser cards and the Bridge

Browser cards run on core Home Assistant. The shared element is this record, the fixtures and the
home-inputs schema: a contract, not a running service. The cards evaluate in JavaScript and the
Bridge in Python. A Bridge adapter is optional for a browser card and required for native Frame.

## D4. Discovery

Beyond what the home inputs name, a card finds entities through Home Assistant's registries by **HA
area**: the entity's own area, else its device's. Hidden, disabled, diagnostic and configuration
entities are left out; update entities are the exception (they are configuration or diagnostic by
nature). Name likeness and floor-plan overlap prove nothing. A browser card reads with the HA user's
permissions. Area discovery never widens a native Frame's grants.

**User timers** are the `timer.*` entities whose attributes carry `timer_role: user_countdown`, set
by the timers component. A component's internal timer has no role and stays out. An explicit list
stays as a legacy or manual selection, and no timers list goes into the home inputs.

## D5. States a control acts on

`unknown` is a value not known yet, and the control still acts. `unavailable`, or a missing entity,
blocks it. Missing, unavailable, stale and unsupported are distinct states; shown values treat
`unknown` and `unavailable` as "no value". Domain-aware wording, such as for a never-run scene, is the
card's own.
The cases are in [`tests/fixtures/operability.json`](../tests/fixtures/operability.json)
(`{domain, state}` → operable, shown), run beside the assessment cases. Whether the entity supports
the action (`supported_features`) is each control's own check.

## D6. Settings scopes

| scope | where | examples |
|---|---|---|
| household policy | the owning domain's HA helpers | comfort ranges, air limits |
| per person | HA frontend user data (`frontend/set_user_data`, one key per component) | theme, bar, chosen player, scenes shown |
| per device | browser local storage (per origin) | "open Pocket when the app starts" |

A preference never changes what a native device may read or do.

## D7. What the home inputs never carry

No Android, server or installation fields: provider location, broker, signing, packaging, backups
or provisioning. Those belong to a separate installation profile on the server track. The
home-inputs schema rejects unknown keys, so this holds by validation, not by convention.

## Next (track A)

Shared fixtures (D1), timers by role (D4), a home-inputs digest per consumer in the lock, optional
covers / contacts / locks per room, the floor plan's labels and default measurement from the home
inputs, then the Ramka on this model (P3, using D2).
