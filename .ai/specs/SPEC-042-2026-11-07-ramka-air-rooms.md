# SPEC-042: the Ramka's Air page for more than one room

- Status: approved 2026-11-07 by the maintainer, in the design session that preceded this change
  (one page per room, turned on a timer and by the sideways swipes as the plant pages are; no
  average across rooms). Implemented in ramka 0.19.0.
- Source: a home added a second air sensor, a CO₂-only one in a bedroom, next to a full air-quality
  station in the living area. The Ramka's `air` input takes one set of readings, so the second room
  could not reach the wall.

## Goal and placement

A home with an air sensor in several rooms sees each room on the wall. Placement test: any home with
two air sensors has the same need, and Home Assistant has no wall rotation of its own → the Ramka.

Not an average: CO₂ and fine dust are local, so a mean of a stuffy bedroom and an aired living room
reads as fine while the bedroom needs a window. Each room keeps its own page.

## Input

`air` (ADDITIVE-ONLY) keeps its mapping form and may also be a list of rooms:

```yaml
air:
  - {label: Dining, score: sensor.dining_air_quality_score, co2: sensor.dining_air_carbon_dioxide}
  - {label: Bedroom, room: bedroom, co2: sensor.bedroom_co2}
```

- Each room has at least one reading of `score`, `co2`, `pm2_5`, `voc`, `nox`; with more than one
  room each has a `label`. The render fails otherwise, naming the rule.
- A mapping, or a list of one, renders as 0.17.0 did.
- With the shared home inputs (`_home.jinja`), every room with `air` becomes a room of the list,
  labelled with the room's name. Before, only the first room was used.
- The switches (`input_boolean.<prefix>_air_<reading>`), the limits and the colours stay one set for
  all rooms: a limit is a property of the reading, not of the room.

## Pages

With more than one room:

- The Air page renders, per room, the air-card titled with the room's label and holding only that
  room's readings, and below it the 24-hour charts of that room's CO₂ and PM2.5. Each room's cards
  are visible while `input_number.<prefix>_air_page` holds the room's index (0-based).
- The ambient loop's air stage shows the rooms from the one on screen to the last, each for
  `input_number.<prefix>_air_page_s` seconds (5–30, default 15), then sets the page back to the first
  room for the next pass.
- The sideways swipes on the Air page step to the next or previous room, round, and restart the
  room's time while the rotation runs, as they do on the plant pages (SPEC-026).
- The settings page's Air section lists `air_page_s` under Advanced and, per reading, the rooms
  that have it.

One room's layout changes for every home: a lone reading takes both rows of the air-card, as the
score does, and a lone chart takes the full width.

## Contract surface

New, `stable`, only with more than one room:

- `input_number.<prefix>_air_page_s`: a setting, group air, seeded and reset like the others;
- `input_number.<prefix>_air_page`: state, not a setting, excluded from the recorder.

## Out of scope

- Per-room limits, an ordering by the worst room, alarms (a blueprint the user turns on in Home
  Assistant) and the matching change to climate-air's `air` input: later specs if a home needs them.
- The Unit CO2L as a catalog device and its ESPHome package (SPEC-040, "CO2L").
