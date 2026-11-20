# SPEC-053: `lights` 0.5.0 — rooms whose light follows presence

Status: approved 2026-11-20 by the maintainer (draft 2026-11-20).
Source: the maintainer, in a design conversation on 2026-11-20 about one room with an LD2410C radar
and Hue spots. That room's data (illuminance by hour, presence gaps, when the light was switched on
by hand) stays in the home's own records; only the conclusions that hold for any home are here.

## Goal

A room's Hue light switches on when someone comes in and it is dark, and off a set time after the
room is empty. It comes back as it was left: brightness and colour temperature are never sent, so
the bridge restores the room's last state. Standing or sitting still does not switch it off as long
as the presence sensor still sees the person; short drop-outs of the sensor are absorbed by the
off delay. Switching the light off by hand while in the room is respected until the room has been
empty for the off delay.

Each automatic switch-on and switch-off writes a logbook line with the reading that decided it
(illuminance on the way in, last seen distance on the way out), so a home can tune the threshold
and the delay from its own log.

## Devices, integrations

- Required: unchanged (Hue bridge, `hue` core).
- New, per presence room: any `binary_sensor` that is on while someone is in the room (an mmWave
  radar such as the LD2410C through ESPHome, a Hue motion sensor, a template occupancy sensor).
  Optional: a numeric `sensor` that falls with darkness (lux, or a radar's raw 0-255 photodiode);
  optional: a numeric distance `sensor` for the log.
- Tested: LD2410C on ESPHome 2026.9.0 with HA 2026.9.2, one room. Hue motion sensors: assumed to
  work (a plain binary sensor), not tested.
- New core platforms used: `automation`, `input_boolean`, `statistics` (sensor), `logbook`.

## Inputs

Existing inputs unchanged. New, optional:

| input | type | default | note |
|---|---|---|---|
| `presence_rooms` | `list[{group, name, presence, illuminance?, dark_below?, off_after?, distance?, id?}]` | `[]` | one automation per entry |

Per entry:

| key | type | default | note |
|---|---|---|---|
| `group` | entity_id (`light.*`) | — | the Hue room group the commands go to |
| `name` | string | — | used in the automation's alias and the logbook lines |
| `presence` | entity_id (`binary_sensor.*`) | — | on while someone is in the room |
| `illuminance` | entity_id (`sensor.*`) | null | absent: switch on at every entry |
| `dark_below` | number | — | required when `illuminance` is set; in the sensor's own unit. A raw photodiode and a lux sensor need different values, so there is no default |
| `off_after` | `HH:MM:SS` | `"00:05:00"` | time without presence before switching off |
| `distance` | entity_id (`sensor.*`) | null | logged on switch-off as the last distance the sensor saw |
| `id` | string | the group's object id | the id part of the entities below |

Demo home example: `{group: light.study, name: Study, presence: binary_sensor.study_presence,
illuminance: sensor.study_illuminance, dark_below: 15, off_after: "00:03:00"}`.

A render fails with a message naming the entry when `illuminance` is set without `dark_below`.

## Behaviour

One automation per room, `mode: queued`, triggers with ids:

| trigger | id | action |
|---|---|---|
| `presence` to `on` | `enter` | if no bulb of the group is on, the hold is off and it is dark: `light.turn_on` on the group with no data; logbook line with the illuminance used |
| template "a bulb of the group is on and `presence` is off", true for `off_after` | `empty_lit` | `light.turn_off` on the group; logbook line with `off_after` and the last distance. Covers leaving the room and a light switched on in an empty room (Ramka, Hue app, a dimmer) |
| Home Assistant start | `start` | if a bulb is on and `presence` is off: wait `off_after` for `presence` to come on; if it does not, as `empty_lit`. A restart cancels a running `for`, and a template trigger that is already true at start does not fire |
| `presence` to `off` for `off_after` | `leave` | hold off |
| group from `on` to `off` while `presence` is on | `manual_off` | hold on |
| group to `on` | `manual_on` | hold off (the light was switched on by hand, or by `enter`) |

- "Dark" is the `statistics` median over the last 2 minutes of the room's ambient reading, below
  `dark_below`. The ambient reading follows `illuminance` only while no bulb of the group is on and
  holds its last value while the light is on, so the room's own light never makes it read
  "daylight": after an automatic switch-off and a quick return, the window still holds the
  readings from before the light came on. The median, because a radar photodiode jumps by tens for
  a second at a time. (Builder's call, recorded: settled in review, not asked.) An unknown or
  unavailable reading counts as dark, as the existing corridor practice does: a room that stays
  dark because a sensor restarted is worse than one lit in daylight.
- "A bulb of the group is on" reads the group's bulbs, not the group (SPEC-008: a group keeps
  "on" after a wall switch cut its bulbs).
- The `manual_off` trigger cannot be fired by the automation itself: it only switches off at
  `empty_lit` or `start`, when `presence` is already off.
- The `start` wait must not block the queue for `off_after`: the builder picks how (a separate
  automation or `mode: parallel` for that branch).
- Decided by the maintainer 2026-11-20: a light switched on in an empty room goes off after
  `off_after` too.
- No turn-on while someone is already in the room and it gets dark: the light comes on at the next
  entry, or by hand. Out of scope below.

## Provides (additive-only)

| entity | `unique_id` | stability | note |
|---|---|---|---|
| `automation.lights_presence_<id>` | `lights_presence_<id>` | stable | switching it off is how a home pauses the room |
| `input_boolean.lights_presence_<id>_hold` | — (YAML helper, id from the key) | stable | on after a switch-off by hand in an occupied room |
| `sensor.lights_presence_<id>_ambient` | `lights_presence_<id>_ambient` | stable | trigger template: `illuminance` while no bulb of the group is on, held while one is; only with `illuminance`; `component: lights` |
| `sensor.lights_presence_<id>_illuminance` | `lights_presence_<id>_illuminance` | stable | `statistics` of the ambient sensor, median, `max_age` 2 min; only with `illuminance` |
| `sensor.lights_presence_<id>_last_distance` | `lights_presence_<id>_last_distance` | stable | trigger template: the distance while presence is on; only with `distance`; `component: lights` |

The `statistics` sensor cannot carry the `component: lights` attribute (not a template entity); the
manifest notes this exception.

## Artifacts and layers

- `templates/package.yaml.j2` → `packages/lights.yaml` (managed): the new helpers, sensors and
  automations below the existing blocks, rendered only for a non-empty `presence_rooms`.
- `component.yaml`: version 0.5.0 (0.3.0 and 0.4.0 are taken by the assistant metadata), the input, the provided entities, `supports` gains the presence
  sensor kinds that already exist in `kinds/` (inference: none fits the LD2410C yet; a new kind is
  then out of scope and the input stays a plain entity id).
- `translations/*`: `meta.description` updated; logbook text as `ui.presence.*` keys. The package
  renders once in `en` (SPEC-008), so the logbook lines are English in every home (accepted).
- `README.md`: how to pick `dark_below` from the sensor's own history (the hourly medians, and the
  reading just before people switched the light on by hand), and how the off delay trades a light
  switched off at a desk against one left on after leaving.
- `UPGRADE.md`: 0.5.0 is additive; nothing to change. The assistant and assistant-action metadata stay as in 0.4.0.

## Compatibility

Additive: `presence_rooms` defaults to `[]`, which renders the same `packages/lights.yaml` as 0.4.0
byte for byte. A home that already has a local automation on the same group must remove it before
adding the room, or both will switch the light.

A home with two Home Assistant installations that reach the same Hue bridge enables a presence
room on one of them only: two automations on one group would fight. The other installation records
the gap.

## Tests

- `catalog_check` for the manifest.
- pytest: render with `presence_rooms: []` equals the 0.4.0 output; a room with and without
  `illuminance` and `distance`; the render failure for `illuminance` without `dark_below`.
- `ha-check lights` on the demo home with the example room.
- Staging (demo home): post states for presence, illuminance and the group's bulbs and check each
  trigger: entry in the dark switches on, entry in daylight does not, a return within 2 minutes of an automatic switch-off switches on again while the sensor reads the room's own light as bright, `off_after` switches off and
  logs, a switch-off by hand while present holds until the room has been empty, a light switched on in an empty room goes off after `off_after`, and a restart with the light on in an empty room switches it off after `off_after`.
- In a real home after deploy: the bridge restores the last brightness and colour temperature on a
  bare `turn_on` (inference from the Hue API, where `on: true` without `bri` keeps the last value;
  staging has no bridge, so this is checked on production).

## Out of scope

- Switching on when it gets dark while someone is already in the room.
- Brightness or colour by time of day (the room keeps what the person last set).
- Several presence sensors per room (a home combines them in a template binary sensor).
- A Ramka control for pausing a room (the automation entity can be switched off today).
- A new device kind for mmWave radars.

## Open questions

None for the maintainer at draft time. Inference marked above: the Hue restore, and whether an
existing kind fits the radar.
