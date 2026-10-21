# climate-air: field notes

What a home needs to know beyond `component.yaml`.

## Ruuvi Air (`ruuvitag_ble`)

- **Through classic ESP32 proxies only data format 6 arrives.** The Atom Lite proxies are Bluetooth
  4.2 and do not receive extended advertising, so the format with PM1, PM4 and PM10 never reaches
  Home Assistant: PM2.5, CO₂, VOC, NOx, temperature, humidity and pressure do. A proxy that
  receives extended advertising would get the rest *(inference, not tested)*.
- VOC and NOx indices need about 24 hours after power-on to calibrate; no alerts on them before.
- Entities to adjust after discovery: the illuminance entity exists but the production Air has no
  light sensor (disable it); `indoor_air_quality_score` and `signal_strength` are disabled by the
  integration. The score matches the Ruuvi app's "Air Quality /100"; enable it by hand for the
  Ramka's air page.

## Tapo sensors (`tplink`)

- The TP-Link account is entered in Home Assistant's UI; the hub is then polled on the home network.
- Battery and signal-strength entities are disabled by default. Check an entity's `disabled_by`
  before putting it on a dashboard.

## The package (0.2.0)

- **Leave a room out of the indoor figures** with `indoor: false`: a glazed porch or winter garden
  whose windows are often open pulls the average towards the outside. It still counts for the
  lowest battery and, with `bathroom: true`, for the bathroom flag.
- **Long-term statistics** come with `state_class: measurement` on every figure (5-minute and hourly
  min / mean / max), kept regardless of the recorder's `purge_keep_days`.
- **The most humid room's state is the room's `label`**, so set the labels the household wants to
  read. `—` when no room has a value.
- **Lowest sensor battery** reads the `battery` sensors of the rooms; Tapo hides them by default, so
  enable each one first (above).
- **Outside** comes from a weather entity's current conditions (`outside_weather`). A home with its
  own outdoor sensor sets `outside.temperature` instead; the difference sensor then uses it.
