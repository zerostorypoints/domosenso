# weather: upgrade notes

## Unreleased (SPEC-053): the wind status and official weather warnings

Adds a package, `packages/weather.yaml`, and a script, `shell/weather_warnings.py`:

- the wind thresholds as helpers (`input_number.weather_wind_{breezy,strong,gale}`, seeded once
  from `wind_breezy`, `wind_strong`, `wind_gale`: 29, 39, 62 km/h) and `sensor.weather_wind_level`
  (calm, breezy, strong, gale);
- with `warnings:`, `sensor.weather_warnings`: every official warning of level yellow and up in
  effect for the region, from the MeteoAlarm feed, most severe first;
- `binary_sensor.weather_warning`: dangerous weather, the wind level strong or gale or any warning.

Additive: the weather entity and the assistant bindings are unchanged.

### What a home does

- Nothing, for the wind level from the weather entity's speed.
- Gusts (optional): `gusts: open_meteo` in the inputs. The package's rest sensor sends the home's
  coordinates, rounded to two decimals, to api.open-meteo.com every 15 minutes.
- Official warnings (optional): `warnings: {country: <feed>, region: <area>, language: en}`. The
  country is the MeteoAlarm feed's name (`switzerland`, `germany` ...), the region the area as the
  feed spells it (a MeteoSwiss warning region, for example) or its EMMA_ID code, the language the
  text's (`en` by default; Switzerland's feed also has `de`, `fr`, `it`). A home that set up Home
  Assistant's `meteoalarm` binary sensor for an earlier prototype can remove it: it keeps one
  warning only.
- Update weather before the Ramka and Pocket: they show the status only when these entities exist.

## 0.2.0 (2026-11-02): component-backed assistant answers

Adds the optional version 1 assistant definition and private source bindings (SPEC-029).
Existing entities, helper values, dashboard preferences and automation actions are preserved.
The component's metadata alone does not grant the Frame app access to its data.

### What a home does

Upgrade DomoSenso tooling to a revision supporting assistant metadata **before** updating this
component; old tooling cannot install its bindings template correctly. After this version is
released, run `domosenso update weather --to 0.2.0` and review the normal staging/deployment plan.
Deploy the generated `domosenso/assistant/weather.yaml` alongside the matching inventory.
With a compatible Frame bridge, reload metadata, choose the frame in **Assistant sources**,
review the proposed sources and save the selection. Existing supported answers do not require
another APK just to change labels or thresholds. New answer types require a compatible app.

No automatic exposure or control is added. Missing metadata, permissions, fresh observations or
assessment rules produce qualified/unavailable answers. Keep old tooling and component versions
together when reverting. See [shared setup and limitations](../../docs/ASSISTANT.md).

