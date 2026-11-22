# SPEC-056: wind status from the weather component, on the Ramka and in Pocket

- **Status:** approved 2026-11-18 (open questions answered by the owner the same day: hysteresis on
  the level too; the wind chip replaces "All good"; gusts are wanted)
- **Source:** a home owner, during a windy evening (Met.no: cloudy, 31.7 km/h): the wall and the
  phone said nothing about the wind. The owner's choices: a wind level from Met.no *and* official
  warnings from Meteoalarm; the Ramka's Wind banner from "strong" or a warning, "breezy" on the
  clock line only; in Pocket a Home status chip from "strong" or a warning, the wind always in the
  weather row and the forecast sheet.

## Goal

A home with `weather` gets one judged wind status — calm, breezy, strong, gale, plus any official
wind warning in effect — that every surface reads the same way, instead of each card judging a raw
`wind_speed` itself (today none does: Met.no's condition is "cloudy" at 32 km/h).

Placement test: (1) Home Assistant has the raw speed and, through Meteoalarm, a warning sensor, but
no wind level and no surface that shows one on a wall or a phone home page; (2) every home with a
weather entity has wind, and the thresholds are tunable helpers, so a second home needs it
unchanged: **a component change** (`weather`), with the Ramka and Pocket as consumers.

## Devices

None required. Optional: a home's own anemometer is out of scope (see Out of scope).

## Integrations

- `met` (core), as today. **Verified on a home running 2026.9.2:** neither the entity's attributes
  nor the hourly forecast (`weather/subscribe_forecast`, `hourly`) carry a gust value; only
  `wind_speed`, `wind_bearing`, `wind_speed_unit`. Met.no's own `locationforecast/2.0/complete`
  has `wind_speed_of_gust` only for the Nordic area (verified: 0 of 88 steps for a Swiss point).
- Gusts from **Open-Meteo** (`api.open-meteo.com/v1/forecast`, no key, free for non-commercial use,
  any location; verified 2026-11-18 for a Swiss point: `current=wind_gusts_10m` 48.6 km/h while
  Met.no's sustained speed was 32 km/h; `daily=wind_gusts_10m_max`). A `rest` sensor in the weather
  package, opt-in (`gusts: open_meteo`), because it sends the home's coordinates (rounded to two
  decimals, about 1 km) to one more service; every 15 minutes (96 calls a day). Without it, a gust
  is used only when the weather entity has `wind_gust_speed` (other integrations do).
- `meteoalarm` (core, YAML `binary_sensor` platform: `country`, `province`, `language`), optional.
  A human adds it (YAML only, so a file in the home's local layer); the README names the steps. Its
  sensor is `on` while any warning is in effect,
  with attributes `awareness_level` (e.g. `2; yellow; Moderate`), `awareness_type`
  (e.g. `1; Wind`), `event`, `headline`, `description`, `onset`, `expires`.
  **Verified on the live Swiss feed (MeteoSwiss through Meteoalarm), 2026-11-18:** wind warnings
  carry `awareness_type: "1; wind"`, events "Gale force wind" (yellow) and "Strong gale" (orange);
  rain is `10; rain`; areas are MeteoSwiss warning regions (e.g. "Basel"). The template matches
  code `1` **or** the word `wind`. Green (`1; green; Minor`) entries carry no awareness type and do
  not count. *Not verified:* that the HA integration's `province` matches a Swiss region name; the
  prototype checks it.

## Inputs (weather)

| name | type | default | example |
|---|---|---|---|
| `weather` | entity_id | — (as today) | `weather.forecast_home` |
| `wind_breezy` | number, km/h | `29` (Beaufort 5) | `29` |
| `wind_strong` | number, km/h | `39` (Beaufort 6) | `45` |
| `wind_gale` | number, km/h | `62` (Beaufort 8) | `62` |
| `alerts` | entity_id, `binary_sensor` (Meteoalarm) | `null` | `binary_sensor.meteoalarm` |
| `gusts` | `none` \| `open_meteo` | `none` | `open_meteo` |

The three thresholds are the **initial values** of `input_number` helpers; the home tunes them in
Home Assistant afterwards (the Ramka's settings page shows them, see below).

## Provides (weather)

| id | stability | note |
|---|---|---|
| `input_number.weather_wind_{breezy,strong,gale}` | stable | km/h, 10–120, step 1 |
| `sensor.weather_wind_level` | stable | state `calm`, `breezy`, `strong`, `gale` (`unavailable` without a speed). Attributes: `speed` and `gust` in km/h (converted from `wind_speed_unit`: m/s, km/h, mph, kn), `gust` null when unknown, `bearing` (degrees), `direction` (N, NE … NW), `warning` (bool), `warning_level` (`yellow`/`orange`/`red` or null), `warning_headline`, `warning_expires` |
| `binary_sensor.weather_wind_warning` | stable | `on` while the level is `strong` or `gale` **or** an official wind warning is in effect; `delay_off: 15 min` so a speed going back and forth over the threshold does not flicker a wall |
| `sensor.weather_wind_gust` | stable | with `gusts: open_meteo`: the current gust in km/h; attribute `daily` (`{time: [dates], wind_gusts_10m_max: [km/h]}`, 3 days, Open-Meteo's shape) |

Hysteresis on the level too (owner, 2026-11-18): the level rises at once, and falls one step only
once the judged speed has been below that step's threshold minus 10 % for 15 minutes (a trigger-based
template sensor keeps the last level as its own state).

The judged speed is the sustained speed, or the gust divided by 1.5 when that is higher: the
thresholds are Beaufort's, for sustained wind, and a gust of 1.5 times a threshold counts as reaching
it (implementation note, 2026-11-18: judging a 49 km/h gust against 39 km/h would call a breezy
evening "strong"). The gust sensor keeps Open-Meteo's shape: attribute `daily` with `time` and
`wind_gusts_10m_max`. Translations (en, de, pl) give the level names, so
`calm` etc. never show untranslated.

Consumes: nothing new (the `alerts` sensor belongs to an integration, recorded as `upstream`).

## Ramka (consumer)

- Consumes `sensor.weather_wind_level`, `binary_sensor.weather_wind_warning`,
  `input_number.weather_wind_*`. Without them (an older `weather`), nothing changes.
- **Wind banner:** today it shows only while `inputs.wind_sensor` (the awnings) is on. New: a second
  heading in the same place while `binary_sensor.weather_wind_warning` is on — "Strong wind ·
  45 km/h SW", "Gale · gusts 70 km/h", or the warning's headline with its colour ("Orange warning:
  wind until 18:00"). When both are on, the awning heading shows (it says what the house did).
- **Clock-weather line:** from `breezy` the wind part reads the level word and direction
  ("Breezy, 32 km/h SW") instead of "wind 32 km/h"; `calm` keeps today's text.
- **Settings dashboard:** the three thresholds on the Weather section (the rule that every Ramka
  extension also updates its settings page).

## Pocket (consumer)

- Consumes the same entities; without them, as today.
- **Weather row (Home) and forecast sheet:** the current speed and direction always ("32 km/h SW"),
  the level word from `breezy`, and the gust when known ("32 km/h SW, gusts 49"); each forecast day
  its `wind_speed`, and its gust maximum from `sensor.weather_wind_gust` `days` when present.
- **Home status chip:** while `binary_sensor.weather_wind_warning` is on, an attention chip
  beside the others ("Strong wind · 45 km/h", or the warning's level and headline); it opens the
  forecast sheet. It **replaces "All good"** (owner, 2026-11-18) while it shows; other attention
  pills stay beside it. `DESIGN.md` gets the chip and its colours (warning yellow/orange/red follow
  Meteoalarm's level, a Met.no-only `strong`/`gale` uses the existing fair/poor colours).

## Artifacts and layers

| artifact | layer |
|---|---|
| `components/weather/templates/package.yaml.j2` → the home's weather package (helpers, template sensor, binary sensor) | managed |
| weather translations en/de/pl: level names | managed |
| Ramka dashboard template, `clock-weather-card.js`, settings dashboard | managed |
| Pocket `lib/weather.js`, Home chip, `DESIGN.md` | managed |
| `domosenso/weather.inputs.yaml` thresholds, `alerts` | instance |
| Meteoalarm's YAML `binary_sensor` entry in the home | local (a human adds the integration) |

## Compatibility

Additive only. `weather` gains a package (the component had `ha_packages: []`); existing entities
and assistant bindings are untouched. Ramka and Pocket read the new entities only when present;
`wind_sensor` keeps its meaning and its heading. `UPGRADE.md` of each of the three: what appears,
the optional Meteoalarm setup, and that weather must be updated before the Ramka and Pocket show
anything. Versions are set at release, by the maintainer.

## Tests

- `catalog_check` and pytest: the weather package renders; unit conversion and level judgement as
  template tests (each unit, gust above and below, each threshold, `unavailable` speed, an alert
  of code `1`, of the word `Wind`, and of another type that must not count).
- Card tests (`node --test`): clock line per level; Pocket weather row and chip, with and without
  the entities; the banner's choice when both banners would show.
- `ha-check` on the rendered home.
- On the owner's test instance (production, after the go-ahead): a dev render, the banner forced by
  lowering `input_number.weather_wind_strong` below the current speed, screenshots of the Ramka
  and Pocket, then the threshold back.

## Out of scope

- A home's own anemometer (an ESPHome or Ecowitt sensor) as the speed source: a later input
  `wind_speed: sensor` would slot in before the weather entity.
- National warning integrations (MeteoSwiss, DWD, IMGW-PIB from HACS) instead of Meteoalarm: `alerts`
  takes any `binary_sensor` with the same attributes; an adapter per integration is a later change.
- Notifications (phone push on a gale warning).

## Answered questions

1. Hysteresis on the level as well: yes (see Provides).
2. The wind chip replaces "All good" in Pocket: yes.
3. Gusts left out: no, they are wanted: Open-Meteo (see Integrations).
4. Meteoalarm's wind code: `1; wind`, verified on the Swiss feed.

## Amendment 1 (2026-11-18): every dangerous weather condition, the warnings list, off by default

Approved by the owner the same day, after the prototype on the test instance.

- **Scope:** not only wind. Every official warning type of level yellow and up (MeteoAlarm types:
  wind, snow/ice, thunderstorm, fog, heat, cold, coastal, forest fire, avalanche, rain, flood,
  rain-flood) plus the component's own wind level (strong, gale). No own thresholds for other
  hazards: the national services judge rain, heat and storms.
- **Source:** Home Assistant's `meteoalarm` integration keeps one warning (inference from its
  attributes, which hold one), so a home with wind and rain at once would see only one. The
  component reads the MeteoAlarm feed itself: `shell/weather_warnings.py` (standard library, runs in
  the Home Assistant container) for a `command_line` sensor every 15 minutes. Input
  `warnings: {country, region, language?}` replaces `alerts`; the home's local `meteoalarm`
  binary sensor goes.
- **Provides (replacing the unreleased wind-only ones):** `sensor.weather_warnings` (the number in
  effect; attribute `warnings` most severe first, each `{type, level, severity, event, headline,
  onset, expires}`), `binary_sensor.weather_warning` (wind level strong or gale, or any warning in
  effect; 15 min off-delay). `sensor.weather_wind_level` loses its `warning*` attributes.
  `binary_sensor.weather_wind_warning` is gone (never released).
- **Several warnings:** the banner and Pocket's chip show the most severe, with "+n" for the
  others; Pocket's forecast sheet and the Ramka's warnings list show all of them.
- **Ramka:**
  - The indicator (the floating banner) is **off by default**: a home that updates sees nothing
    new until it turns it on (`input_select.<prefix>_weather_banner`: off, icon, hide, always;
    off first). It shows over the ambient screens only, **not over the controls**.
  - The **controls** get a "Weather warnings" button while `binary_sensor.weather_warning` is on
    (whatever the banner setting): a tap opens an overlay with the list of every warning (type
    icon, level colour, event, until when) and the wind level with speed and gusts. The indicator
    says something is up from across the room; the list is read when someone walks up and the
    controls come up.
- **Pocket:** the chip says the most severe warning and "+n"; its sheet lists every warning.
