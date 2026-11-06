---
name: set-up-areas
description: Give a home's Home Assistant areas their type (inside, outside or not assigned) and their main sensors (climate, air quality, light level, sound, pressure) the way Pocket reads them (SPEC-038) - read the running home with domosenso areas, ask the owner only what Home Assistant cannot tell, write the answers as defaults into the home inputs, and check again. Use during onboarding, when adding Pocket or climate-air, when areas or sensors were added, or when Pocket shows "No areas assigned" or "Main sensor not set".
---

# set-up-areas

Pocket takes the areas from Home Assistant and lets a home choose each area's **type** and **main
sensor per kind** (SPEC-038). This skill is the first way to make those choices (the system is set up
by an AI first); Pocket's **Settings → Areas** shows every one of them and lets an administrator change
it later on the phone. Talk to the owner in their language; files in the catalog stay English.

## Rules

- **Reads are free, writes need a typed yes** (the rules of `onboard-home`). `domosenso areas`,
  `snapshot`, `deploy --plan` read. Writing the home inputs is a change in the home repository (allowed);
  writing Pocket's home store or Home Assistant's area fields on the running home needs the owner's
  typed yes, each time.
- **Nothing is guessed.** No area becomes inside or outside because of its name, floor or sensors; no
  sensor is a candidate because of its name. Candidates come from `domosenso areas` (HA area and device
  class only). Ask.
- **What HA already says stays HA's.** An area whose climate comes from `(home-assistant)` (the area's
  Related sensors) needs no question.
- **The household stays in the home repository**: area names, device names and entity ids never go
  into the catalog checkout, a pull request or an issue on it.

## 1. Read

```bash
domosenso areas production --json
```

The kinds and their device classes are in `<catalog>/components/pocket/cards/lib/kinds.json`: read it
to name each kind to the owner ("temperature and humidity", "air quality", "light level", ...).

Lines (SPEC-038 §3.8): `area <id> "<name>" floor <f> type <t> (<source>)`, `main <id> <kind> <entities>
(<source>)`, `candidates <id> <kind> <n>: choose one`, `warn ...`, `fail ...`. A `fail` (an input that
names an entity HA does not have) is fixed first: show it and ask what the input should name, or remove
it.

## 2. Ask, one question at a time

1. **Types.** For the areas with `warn <id> type not assigned`, one question listing them: "Which of
   these areas are inside, which outside, and which neither (a garage, a technical room)?". Neither
   stays not assigned. An area without sensors still gets its type: it shows as "Main sensor not set"
   until it has one.
2. **Main sensors with a choice.** For each `candidates <id> <kind> <n>`, name the candidates by their
   device names (from `domosenso recommend --json` → `scan.devices`, or the registry) and ask which one
   stands for the area. "Leave it unset" is an answer.
3. **Readings HA does not classify.** For an air device whose score, VOC or NOx index has no device
   class (`main <id> air` lists fewer readings than the device has), name its measurement sensors without
   a class and ask which is which.
4. **The only candidate** (`(auto)`) needs no question; say which one Pocket will use, and that it stays
   so when sensors are added later.

Skip any question the owner has already answered in Pocket (source `(pocket)`).

## 3. Write

Write the answers as **defaults** into `domosenso/home.inputs.yaml` (the instance layer, SPEC-038 §3.7),
one room entry per area that has an answer:

```yaml
rooms:
  - id: living_room          # the HA area id (or `area:` when the id differs)
    name: Living room        # the Ramka's name; Pocket uses the HA area's
    type: inside             # inside | outside
    climate: {temperature: sensor.x, humidity: sensor.y}
    air: {score: sensor.z, co2: sensor.w}
```

Then `domosenso render`, `deploy <target> --plan`, and the deploy only after the owner's yes (the
usual flow: `snapshot` before, `verify` after).

If the owner wants the answers live at once without a deploy, show them the store value (key
`domosenso-pocket-home`, SPEC-038 §3.6) and write it with `frontend/set_system_data` only on their typed
yes; for a climate choice, Home Assistant's own area fields (`config/area_registry/update`,
`temperature_entity_id`, `humidity_entity_id`) instead. Either way, tell them every choice is in
Pocket's Settings → Areas, where they can change it.

## 4. Check

Run `domosenso areas production` again: it ends `ok` (no `fail`), and the `warn` lines left are the
ones the owner chose to leave.
