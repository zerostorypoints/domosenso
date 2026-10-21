# Scenes

The demo's eight moments of a day in the fictional home of `examples/demo-home/`. Each
`scenes/<id>.yaml` (schema: `schemas/scene.schema.json`, checked by `tools/catalog_check.py`) says
how the home looks at that moment and which catalog components and devices take part.

| field | what it holds |
|---|---|
| `id` | the file name; the website uses the same ids |
| `time` | `HH:MM`, local |
| `names` | the scene's name in en, de and pl |
| `states` | entity id → state, over the baseline in `examples/demo-home/states.yaml`; every entity not listed keeps its baseline state. States are strings or numbers, as Home Assistant holds them (quote `"on"` / `"off"`) |
| `attributes` | optional: entity id → `{attribute: value}`, merged over the baseline's attributes of that entity (keys not named keep their baseline value). An entity here must also be in `states`. Example: Sun gives the awnings `current_position: 100`, Morning gives the watered basil `moisture: 34` and `problem: none` |
| `tablet` | what the Ramka shows: `{mode}` with a mode of `off, ambient, controls, calendar`, plus `page` (`climate, air, plants, photos, status`) only with `ambient`; `null` when the scene leaves the tablet alone |
| `components`, `devices` | what takes part, derived by the listing rule below |

## Listing rule

A component is listed when one of its entities has a state or an attribute other than the
baseline's in this scene; `ramka` is listed whenever `tablet` is not null. A device is listed when
its component is listed and, if it has entities of its own, one of them changed. So everything a
scene lists visibly reacts in it. `tests/test_catalog_content.py` derives the listing from the
states and compares it with each file.

## Derived entities

Some entities of the Ramka's package follow others; a scene never sets them, whoever shows a
scene (the website, a staging home) computes them:

- `binary_sensor.<prefix>_media_playing` is `on` while the media player is `playing`;
- `binary_sensor.<prefix>_music_view`, the Ramka's music view, is `on` while the player is
  `playing` and the ambient-music helper `input_boolean.<prefix>_ambient_music` is `on`. With
  `tablet: {mode: ambient}` it decides between the now-playing card and the page rotation: in
  Evening the speaker plays and ambient music is on, so the tablet shows what is playing.

The baseline holds their values for the baseline states, and the tests check that they agree.

## Mapping a scene onto another home

Scene states name the demo home's entity ids. The `room:` slug on the Ramka's list inputs
(`covers`, `lights`, `climate`, `plants` in `examples/demo-home/inputs/ramka.yaml`; documented in
`components/ramka/component.yaml`) is the join key: a scene's entity → the demo input item that
names it → its room → the other home's input item with the same room → that home's entity. The
templates ignore `room:`; it changes nothing that is rendered.
