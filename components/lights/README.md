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
