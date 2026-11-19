# SPEC-054: Now playing in the Ramka's rotation

- **Status:** approved 2026-11-19
- **Source:** a home owner, after weeks with music on: "I cannot follow the information on the
  Ramka, because the music is always running." Today the now-playing card takes over ambient for as
  long as the player plays; the owner wants, as an option, the now-playing card as one more view of
  the rotation, for a time they set, with today's behaviour the default.

## Goal

A Ramka setting chooses how the music shares the wall:

- **takeover** (default, today's behaviour): while the player plays, ambient shows the now-playing
  card; the swipes on the controls switch between it and the rotation, as now.
- **rotation**: while the player plays, the rotation keeps running and the now-playing card is one
  more view of it, shown for a set time (default 30 s, up to 10 minutes) once per pass, after the
  last page and before the first. Silent player: the rotation as today.

Placement test: Home Assistant has no wall rotation; the Ramka's rotation is the catalog's, and
any home with music on its wall has the same trade-off: **a change of the Ramka component**.

## Devices, integrations

None new. The media player and the page switch `input_boolean.<prefix>_page_music` as today.

## Settings (Home Assistant helpers, on the Ramka Settings' Music page)

| helper | type | default | note |
|---|---|---|---|
| `input_select.<prefix>_music_mode` | takeover, rotation | takeover (first option: a fresh helper has it) | how the now-playing card shares ambient |
| `input_number.<prefix>_music_turn_s` | 10–600 s, step 5 | 30 (seeded once, group `music_turn`) | rotation mode: how long the now-playing card stays each pass |

`settings_defaults` accepts `music_mode` and `music_turn_s`. Both are on the Music page's reset.
Only with a media player (`media_player` input): without one, neither helper exists.

## How it works

- New `input_boolean.<prefix>_music_turn` (internal, `initial: false`): the now-playing card's turn
  in the rotation.
- `binary_sensor.<prefix>_music_view` becomes: playing **and** the page switch on **and**
  (takeover: `ambient_music` on, as today; rotation: `music_turn` on). Every view condition and the
  loop's start and stop keep reading this one sensor, so the dashboards do not change.
- Rotation mode: when the loop turns from the last live page to the first while the player plays
  (and ambient, not paused, the music view off), a script turns `music_turn` on (the music view comes,
  the stop automation stops the loop and rests on the first page), waits `music_turn_s`, turns it
  off (the music view goes, the start automation runs the loop from the first page with its full
  time). A swipe up on the now-playing card ends the turn early (the next page, as on the rotation).
- Switching the mode while music plays: to rotation, the music view goes and the rotation runs; to
  takeover, today's rules (`ambient_music`) decide.

## Provides (additive)

`input_select.<prefix>_music_mode`, `input_number.<prefix>_music_turn_s`, `input_boolean.<prefix>_music_turn`
(stable; the last one internal state, like `ambient_music`), `script.<prefix>_music_turn`.
`binary_sensor.<prefix>_music_view` keeps its id and meaning ("the now-playing card is on ambient").

## Compatibility

Additive; the default is today's behaviour. UPGRADE.md: the setting and where it is.

## Tests

Render tests (helpers, options order, seed group, settings rows, the music view's template per
mode, the loop's turn), the Ramka's card tests unchanged; on the owner's test instance after the
go-ahead: rotation mode with music on, the card's turn and its length.

## Out of scope

Several now-playing turns per pass; a turn per page; Pocket (it has no rotation).
