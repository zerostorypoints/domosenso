---
name: set-up-areas
description: Set up Pocket's home settings from the running Home Assistant (SPEC-038) - each area's type (inside by default, outside, or not assigned to hide one), its main sensors (climate, air quality, light level, sound, pressure) and Home's Quick actions. Read the home with domosenso areas --json, suggest a choice for everything with the reason, let the owner confirm or change it, write the answers as defaults into the home's inputs, and check again. Use during onboarding, when adding Pocket or climate-air, when areas or sensors were added, or when Pocket shows "No areas assigned" or "Main sensor not set".
---

# set-up-areas

Pocket takes the areas from Home Assistant and lets a home choose each area's **type**, its **main
sensor per kind** and the **Quick actions** on Home (SPEC-038). Domosenso is set up by an AI first:
this skill **detects** what the home has, **suggests** a choice for each setting with the reason, and
the owner confirms or changes it. Pocket's Settings is where the owner fine-tunes afterwards (Settings →
Areas for the areas, Settings → Quick actions for their own list). Talk to the owner in their language; files in the catalog stay English.

## Rules

- **Reads are free, writes need a typed yes** (the rules of `onboard-home`). `domosenso areas`,
  `snapshot`, `deploy --plan` read. Writing the home inputs is a change in the home repository (allowed);
  writing Pocket's home store or Home Assistant's area fields on the running home needs the owner's
  typed yes, each time.
- **Suggest, never decide.** Candidates come from `domosenso areas` (HA area and device class only;
  the code never matches names). Your suggestion may use what a person would read (device names,
  makers, models), but it is a suggestion with its reason, and nothing is written until the owner
  confirms it. No area is suggested as outside or hidden from its name alone: ask.
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

## 2. Suggest, then ask once

Build one proposal from the `--json` document and show it as a short table per area, each line the
suggestion and its reason in a few words. Then ask once: "Is this right? Tell me what to change."

1. **Types.** Every area is Inside unless set otherwise (`type inside (default)`). Suggest Outside only
   for an area that has an outside sensor in the inputs (`(inputs)`) or that the owner named; for the
   rest ask, in the same message: "Which of these are outside, and which should not show in Pocket at
   all (a garage, a technical room)?" (`outside`, `none`).
2. **Main sensors.** For each area and kind (`data[].kinds.<kind>`):
   - a choice from `(home-assistant)` or `(pocket)` stays; say what it is;
   - one candidate: Pocket takes it (`(auto)`, recorded once); say which;
   - several: suggest one, preferring, in this order: the one Home Assistant's area already names; a
     device with all the kind's readings (temperature and humidity); a device that measures the room,
     not a thing in it (a name or model saying rack, vent, fridge, oven, server, NAS, tablet, hub or a
     battery's temperature measures equipment, not the room: say so as the reason); a dedicated air
     monitor for air. When two are equally good, ask instead of suggesting.
   - a kind nobody needs here (a light level in a hallway) can stay unset: suggest unset when no
     candidate is clearly the room's.
3. **Readings HA does not classify.** For an air device whose score, VOC or NOx index has no device
   class (its candidate lists fewer readings than the device has), suggest the matching sensor of that
   device by its name and ask to confirm.
4. **Quick actions** (`data[-1].quick`): suggest a short list for Home, in this order: each lived-in
   area's lights (`areas`), the scenes the household runs often (ask which, from `scenes`; suggest none
   rather than all), then All off. Keep it under eight. Say that each person can change their own list
   in Pocket's Settings → Quick actions.

Skip any setting the owner already chose in Pocket (source `(pocket)`).

## 3. Write

Write the answers as **defaults** into `domosenso/home.inputs.yaml` (the instance layer, SPEC-038 §3.7),
one room entry per area that has an answer:

```yaml
rooms:
  - id: living_room          # the HA area id (or `area:` when the id differs)
    name: Living room        # the Ramka's name; Pocket uses the HA area's
    type: outside            # inside (the default) | outside | none (hidden from Pocket)
    climate: {temperature: sensor.x, humidity: sensor.y}
    air: {score: sensor.z, co2: sensor.w}
```

and the Quick actions into `domosenso/pocket.inputs.yaml`:

```yaml
quick_actions: [area:living_room, scene.evening, all_off]   # the home's default; each person may change theirs
```

Then `domosenso render`, `deploy <target> --plan`, and the deploy only after the owner's yes (the
usual flow: `snapshot` before, `verify` after).

If the owner wants the answers live at once without a deploy, show them the store value (key
`domosenso-pocket-home`, SPEC-038 §3.6) and write it with `frontend/set_system_data` only on their typed
yes; for a climate choice, Home Assistant's own area fields (`config/area_registry/update`,
`temperature_entity_id`, `humidity_entity_id`) instead. Either way, tell them every choice is in
Pocket's Settings → Areas, where they can change it.

## 4. Check

Run `domosenso areas production` again: it ends `ok` (no `fail`), the `main` and `quick` lines are what
the owner confirmed, and the `warn` and `candidates` lines left are the ones the owner chose to leave.
