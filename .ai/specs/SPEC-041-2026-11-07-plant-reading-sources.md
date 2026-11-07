# SPEC-041 — Plant sources, history and reading age

**Status:** approved, 2026-11-07

## Goal

An installer can change where a plant's measurements come from and keep its
identity, thresholds, watering record and history. The wall shows the age of
the last valid report, including when a sensor goes quiet. A new installation
can use a tablet's native Bluetooth receiver as its only plant data source.

Home Assistant continues to pair sensors, decode Bluetooth, run ESPHome and
record history. DomoSenso supplies the stable plant bindings and a wall view
that follows them. The bindings work in any home.

## Devices and integrations

- One compatible plant sensor per plant. The initial reference device is
  Xiaomi Mi Flora HHCCJCY01. Use Home Assistant's Xiaomi BLE integration for
  advertisements from the host's Bluetooth receiver or a dedicated ESPHome
  Bluetooth proxy.
- A tablet can run DomoSenso HA Server with its allowlisted Android BLE
  receiver, Android 12 or later, and the Bluetooth permissions granted. This
  profile has no ESPHome or remote HA dependency for plant readings.
- A shared ATOM can expose decoded plant readings as ordinary ESPHome sensor
  entities. Its raw Bluetooth proxy stream still has one HA subscriber.
  Stock ESPHome's Mi Flora decoder requires unencrypted advertisements.
  Choosing a source in DomoSenso does not configure a radio or flash hardware.
- Validate against Home Assistant 2026.9.2. Native Android BLE observations
  are advertisements. Active battery polling and destination radio coverage
  require separate hardware acceptance.

## Inputs and ownership

Existing `plants[].sensors` bindings still render as before. To opt in, give
a plant named `sources` and an `active_source`. Each source maps the four
existing measurement keys to HA sensor entities. Names are installation
labels. The rendered package follows exactly the selected source.

```yaml
plants:
  - entity: plant.monstera
    label: Living room
    active_source: tablet
    sources:
      tablet:
        moisture: sensor.mi_flora_soil_moisture
        conductivity: sensor.mi_flora_conductivity
        brightness: sensor.mi_flora_illuminance
        temperature: sensor.mi_flora_temperature
      room_receiver:
        moisture: sensor.living_room_plant_moisture
        conductivity: sensor.living_room_plant_conductivity
        brightness: sensor.living_room_plant_illuminance
        temperature: sensor.living_room_plant_temperature
```

An installer changes `active_source`, renders, and reloads the configuration
through the documented HA workflow. If a dedicated proxy feeds the same
Xiaomi BLE integration entities, there is no plant source change to render.
Keep selection in the home's inputs. A separate editor or automatic
failover is outside this change. Reject missing, mixed legacy/new, incomplete
or self-referential bindings at render time with the plant and field named.

The `plants` component owns the rendered templates and public entity
patterns. `ramka` consumes the declared attributes and sensor patterns.
Device addresses, credentials, entity bindings and migration timestamps
remain installation inputs.

## Stable measurements and migration

Each opted-in plant keeps its existing `plant.<plant>` entity. Four managed
numeric sensors have stable entity IDs and unique IDs derived from the
plant, using `sensor.<plant>_reading_{moisture,conductivity,illuminance,temperature}`.
The plant integration and its statistics, alerts and assistant bindings
use these stable sensors. Source changes leave the recorder IDs and sensor
units intact. Reject incompatible units or normalize supported equivalent
units before recording. Missing and invalid readings stay unavailable.
An offset between two providers must not be counted as a watering event.

Existing homes keep their original measurements in Recorder. When adopting
the stable series for the first time, the installer may give a
`legacy_moisture_history` with the previous statistic ID and the ISO 8601
cutover time. The Ramka moisture chart reads the historical hourly buckets
before that time and the stable series after it. Keep one point per hour,
prefer the stable series in the cutover bucket, and keep gaps where neither
series has data. The earlier raw series remain accessible through their
original IDs and follow the existing Recorder retention. The switch
does not copy data into the new statistics IDs or rewrite HA's database.
Homes using legacy bindings retain their current graph behaviour. The
upgrade notes show how to migrate and how to roll back.

## Reading age

Expose the last valid HA report timestamp and availability for each managed
reading separately from its numeric recorder series. Use the source report
time, including identical numeric reports that HA records in
`last_reported`. A timer refresh or a re-render must not make an old value
look new. Keep the last known time and value when the source becomes
unavailable and label them accordingly. An unseen source shows no reading.
The timestamp describes a report from the configured integration to HA.
It does not establish the original radio transmission time or detect an
upstream integration that replays a cached value as a fresh report.

Show age in the Ramka tile and list, prioritizing moisture in the default
view. Make the other readings' ages available alongside their values. Use
the home's existing silent threshold as the initial stale boundary. Keep
the EN, DE and PL strings in the Ramka dictionaries. Do not append a new
numeric history row merely to update the displayed age. Use a bounded
refresh to reflect unchanged-value reports and elapsed time.

## Acceptance

- Legacy plants render unchanged and the existing component checks pass.
- Two selected providers write to the same four recorder identities. A
  simulated switch keeps prior samples and current samples readable. The
  Ramka chart joins old and new moisture buckets across adoption without
  moving original data or creating false watering events.
- In HA 2026.9.2, demonstrate an unchanged report refreshing its age, an
  unavailable or quiet source ageing honestly, and a missing source
  producing no reading. Cover the Ramka tile and list in the card tests.
- Start a fresh, isolated HA with no registry, recorder, NAS, ESPHome, MQTT,
  household accounts or household data. Feed fictional Mi Flora frames
  through the pinned HA Server native BLE adapter and the standard Xiaomi
  decoder. Verify four metrics and ages reach the plants component and
  fresh history is recorded. Include a fictional six-plant configuration
  and setup instructions for reproduction.
- This validates the standalone configuration and decode path without an
  ATOM. Physical Android screen-off reception, range in the destination
  apartment and a soak test are hardware acceptance, to be recorded
  separately from simulated radio input.

Website impact is deferred to the first tagged release. Update the plants
component notes, the Frame installation guide and the device requirements
there. Keep household evidence out of the catalog.
