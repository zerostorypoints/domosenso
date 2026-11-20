# lights: field notes

What a home needs to know beyond `component.yaml`.

- **Hue bulbs that lose power stop routing.** Bulbs relay Zigbee for each other; in a household that
  switches lights at the wall, the mesh shrinks to the bulbs still powered, and the rest drop to
  `unavailable` for a minute or two at a time (hundreds of times overnight in one home). The
  bridge is not at fault. The fix is the Hue wall switch module, which keeps the bulbs powered while
  the switch still works. The integration's option "Ignore connectivity status" hides the symptom,
  and with it a bulb that really is unpowered.
- **A room group stays `on` after its bulbs lost power.** A dashboard that should show the room's
  real state reads a template light that is on only while a reachable bulb is on, and sends its
  commands to the group.
- Entity ids carry the bridge room's name as a prefix, fixed when the bridge is paired
  (`light.<room>_<bulb>`). Name the rooms in the Hue app before
  pairing; renaming them later does not change the ids.
- Creating a bridge room over the CLIP v2 API with children moves those bulbs out of their old room.
  The API needs the bridge's application key, which sits in Home Assistant's config entry; ask the
  home's owner before reading it.
- If Zigbee interference is suspected, pick a channel clear of the Wi-Fi in use (with Wi-Fi on 1, 6
  and 11, Zigbee 25).

## The package (0.2.0)

- **Room lights.** `light.room_<id>` per entry of `rooms`, with `default_entity_id` pinned, so the
  id does not follow the name. `<id>` is the group's object id unless the entry sets `id`. The
  dashboards should show these, not the Hue groups.
- **Brightness and colour temperature** come from the group; `set_temperature` passes the brightness
  along when a call sets both.
- **All off:** the bridge accepts about one command per second per group, so switching many rooms
  at once is better done with one Hue scene (the `lights_all_off` input) than with a call per light.
- **Lights on** counts Hue bulbs only: groups and zones carry `is_hue_group` and are left out.

## Presence rooms (0.5.0)

A room in `presence_rooms` switches its Hue group on at entry when it is dark and off once it has
been empty for `off_after` (SPEC-053). `turn_on` carries no brightness or colour temperature, so the
bridge brings the room back as it was left. Every automatic switch-on and switch-off writes a
logbook line (`switched on at entry, illuminance …`, `switched off after … min without presence,
last seen at …`): read them to tune the two numbers below.

- **Picking `dark_below`.** Use the sensor's own history, not a lux figure from elsewhere: a radar's
  photodiode reads 0-255 in no unit. Two readings settle it: the hourly medians over a week with the
  light off (night and daylight separate clearly), and the reading in the two minutes before people
  switched the light on by hand. Put the threshold just above the second. The decision reads the
  room's ambient sensor, which holds its value while the room's own light is on, so a sensor that
  sees the room's bulbs does not block the next switch-on.
- **Picking `off_after`.** mmWave radars lose a person who sits or stands still for seconds to
  minutes at a time. A short delay switches the light off at the desk now and then; a long one leaves
  it on after people leave. Count the presence drop-outs between one and ten minutes while the light
  was on, and decide which mistake the room can live with. The logbook's last distance on each
  switch-off tells a drop-out at a desk from someone leaving.
- **Switched off by hand** in an occupied room, the light stays off until the room has been empty
  for `off_after`. A light switched on in an empty room goes off after `off_after`, and so does one
  left on and empty across a restart (`automation.lights_presence_<id>_start`).
- **One Home Assistant per Hue group.** Two installations that reach the same bridge must not both
  run a presence room for the same group: their automations would switch against each other.
- **Remove an older automation first.** A local motion or presence automation on the same group
  keeps running next to this one.
- Switching `automation.lights_presence_<id>` off pauses the room.
