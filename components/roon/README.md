# roon: field notes

A Roon Core's zones as Home Assistant media players, through the core `roon` integration
(`roonapi 0.1.6`, local push). The component itself renders only the volume bridges (SPEC-049).
Checked against the integration's code at Home Assistant 2026.9.2 and on one ROCK running Roon
Server 2.74 (build 1719).

## Setup (by hand)

1. In Home Assistant, go to Settings → Devices & services → Add → Roon. The Core is found by
   multicast discovery. On a Container install without host networking, enter the Core's address
   instead.
2. In the Roon app, go to Settings → Extensions and enable "Home Assistant". Until you do, the flow
   waits and creates nothing.
3. Assign an area to each zone's device. The entity id comes from the zone's name in Roon, so
   rename zones in Roon first if you want clean ids.

The integration creates one hub device, "Roon Core (\<name\>)", with manufacturer `Roonlabs`. Under
it comes one device per zone with manufacturer `RoonLabs`, and each zone has two entities:

- `media_player.<zone>`, the player;
- `event.<zone>_roon_volume`, which receives the volume button presses.

A zone that Roon removes (an endpoint switched off for good) reads `unavailable`.

## What a zone's player does

| | |
|---|---|
| state | `off` when the endpoint's source control supports standby and reads standby or deselected. Otherwise Roon's state: `playing` (also while loading), `paused` or `idle` |
| now playing | `media_title`, `media_artist`, `media_album_name` (Roon's three lines), position, duration, artwork through HA's media proxy |
| not given | `source`, `app_name`, quality or format |
| controls | play, pause, stop, previous, next, seek, shuffle, repeat (off, all, one), mute, on and off, `play_media`, browse |
| volume | `volume_set` and `volume_step` when the endpoint's volume is absolute; only `volume_step` when it is incremental; neither for fixed volume |
| on and off | standby through the source control where there is one; otherwise `turn_on` plays and `turn_off` stops |
| grouping | `media_player.join` and `unjoin`; only zones Roon allows to group (`can_group_with_output_ids`), otherwise an error in the log |

The Ramka's `media_player_contract` needs `volume_set`, so a fixed-volume zone cannot be the
Ramka's player. Bridge it to its amplifier (below) and give the Ramka the amplifier instead.

A Roon Ready endpoint that has its own Home Assistant integration often reports Roon as its
input as well. For example, a Naim streamer's own player reads `inputs/roon`, with the same title
and artwork. Either player can feed a dashboard.

## Playing something

`media_player.play_media` with `media_content_type: music` and a path through Roon's browse tree:

```yaml
action: media_player.play_media
target: {entity_id: media_player.study}
data:
  media_content_type: music
  media_content_id: Library/Artists/Neil Young/Harvest
```

Radio: `My Live Radio/<station>`. Playlists: `Playlists/<name>`. Genres: `Genres/<genre>`. When a
step of the path does not match, the log lists what Roon offers at that step. Browse media in the
player's more-info dialog shows the same tree.

## Transfer

The `roon.transfer` action moves the queue to another zone. The target is the zone that plays now,
and `transfer_id` is the destination:

```yaml
action: roon.transfer
target: {entity_id: media_player.living_room}
data: {transfer_id: media_player.kitchen}
```

## Volume bridge

Use this when Roon cannot set an amplifier's volume, for example a DAC with fixed output into an
amplifier with an IR or network remote.

1. In Roon, go to the zone's Device setup → Volume control and choose "Home Assistant: \<zone\> roon
   volume". The integration registers it for every zone.
2. In `domosenso/roon.inputs.yaml`:

   ```yaml
   volume_bridges:
     - {event: event.study_dac_roon_volume, amplifier: media_player.study_amplifier, steps: 1}
   ```

   `render` writes one `automation.roon_volume_<zone>`. Each + or − press calls the amplifier's
   `volume_up` or `volume_down` `steps` times. Mute toggles the amplifier's mute; set
   `mute: false` to ignore it.

The integration reports a press, not a level, and does not pass Roon's step size. The volume
slider in Roon therefore shows nothing useful for a bridged zone; use the + and − buttons.

## Not covered

- The integration reads no format or quality: Roon's signal path is not exposed.
- RoonOS upgrades (for example ROCK to RoonOS 3.0) do not change the integration.
