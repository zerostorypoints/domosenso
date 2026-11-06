# SPEC-038: Areas from Home Assistant, their type and main sensors, set in Pocket

- Status: **draft**, implemented as the prototype on branch `claude/pocket-overview-no-grouping`;
  for the maintainers' review.
- Date: 2026-11-06.
- Builds on SPEC-037 (shared home metadata), `docs/2026-11-05-shared-home-decisions.md` (D1–D7) and
  the home inputs of track A (`schemas/home-inputs.schema.json`).
- Touches: `pocket` (its area model, its settings, its Home and Climate widgets, Quick actions), the home-inputs
  schema (one optional field), the skills `onboard-home` and `add-component` and a new skill
  `set-up-areas`, and the `domosenso` command (one new read-only command, `areas`). The Ramka and
  `climate-air` keep reading the home inputs as they do; they can follow later.

## 1. Problem

Pocket shows the rooms a person wrote into `home.inputs.yaml`, with the sensors written there, and an
"Outside" built from the file's `outside:` entry. Nothing comes from the running home:

- an area added in Home Assistant never appears; a room listed with the wrong HA area id shows
  nothing; a renamed area keeps its old name;
- a new sensor counts only after someone edits the file, renders, deploys and restarts;
- which sensor stands for an area, and whether an area is inside or outside, is decided in a file
  that a person who only has the phone cannot reach;
- the Home widgets "Inside" and "Outside" aggregate whatever the file says, and a home with no file
  entries gets no widget and no hint of what to do.

Three moments have to work, for any home and with nothing written by hand first:

- **A. Onboarding**, possibly before any sensor exists.
- **B. Installing Pocket** on a home that is already set up.
- **C. Adding** an area, a sensor or a device later.

## 2. Review against the guidelines (`docs/PRINCIPLES.md`, AGENTS.md, D1–D7, SPEC-037)

| guideline | finding |
|---|---|
| **Principle 4**: "it does not open a second place to configure what Home Assistant configures" | Today broken: areas, their names and their temperature and humidity sensors are configured in Home Assistant (the area registry has `temperature_entity_id` and `humidity_entity_id`, shown as **Related sensors** in the area editor of 2026.9.2) and again in the home inputs. **This spec:** the areas, their names and their climate sensors come from Home Assistant; Pocket writes the climate sensor into HA's own field. Only what HA has no field for (an area's type, its air device, other indicators) is Pocket's, kept in HA's own home-wide frontend store. |
| **Principle 1**: the metadata is the asset | Every setting Pocket adds is declared once (the kinds table, §3.3) and appears in three places that read the same declaration: the area's settings, Settings → Areas, and the questions of the `set-up-areas` skill. |
| **Principle 5**: machine-readable pass or fail | `domosenso areas <target>` (§3.8) prints each area, its type and main sensors and where each came from, ending `ok` or `FAIL <n> to resolve`. |
| **D4**: discovery by HA area, no name likeness | Candidates are found by HA area and **device class** only. A reading HA does not classify (an air-quality score or index) is never guessed from its name: a person picks it once (§3.4). |
| **SPEC-037**: "selected defaults are not a complete room inventory"; "preserve explicit manual selections" | The home inputs become defaults; everything else is discovered. An explicit choice (in the app or in the inputs) always wins, and a one-time automatic choice is never redone (§3.5). |
| **D7**: no installation fields in the home inputs | Respected: the one new field (`type`) describes the home. |
| **D1, D2**: level vocabulary; climate-air's helpers own the comfort policy | Respected: ranges stay climate-air's helpers; this spec only says which areas are judged (§3.6). |
| **Placement test** | HA has areas, floors, area sensors and a home-wide frontend store → use them. HA has no "inside / outside" and no air device per area → Pocket's setting, in HA's store, not a new file. |
| **Privacy** | This spec and its tests use only the demo home. |
| **Spec first**: a schema change, a new command, a new STABLE output | This spec. |

## 3. Design

### 3.1 The areas are Home Assistant's

Pocket's area list is Home Assistant's area registry, as the frontend gives it to every card
(`hass.areas`, `hass.floors`): every area, by its HA name (names are not translated), ordered by
floor (`level`, then HA's order) with the areas on no floor last. An area added, renamed or removed in
HA shows in Pocket after the app is reloaded (in practice at once: `hass.areas` follows the registry).
A `#/area/<id>` link to an area that no longer exists goes to Areas.

The home inputs' `rooms` stop being the list. A room entry is now **the defaults for one HA area**
(its `area`, else its `id`), §3.7. A room whose area does not exist in HA is reported by
`domosenso areas`, never shown as an area of its own.

### 3.2 An area's type: Inside, Outside or Not assigned

Every area has a type: **Inside** (the default for every area), **Outside** or **Not assigned**. The
type decides:

| | Inside | Outside | Not assigned |
|---|---|---|---|
| in Pocket's views (Areas, its area page, Home, Climate, attention, controls by area) | yes | yes | **no**: hidden |
| in Home's **Inside** / **Outside** widgets and the Climate page's squares | Inside | Outside | neither |
| its temperature and humidity judged against a comfort range (attention pills, Climate tile) | yes, when climate-air has a range for it | never: it is weather | no |
| its air judged against the air limits | yes | no | no |
| listed in Settings → Areas, its settings page reachable | yes | yes | yes, to bring it back |

Not assigned is how a home leaves an area out of Pocket (a technical room, a garage). Every area is
Inside until someone says otherwise, so a new home sees all its rooms at once; Outside is the one
choice a home has to make. Nothing is inferred: no area becomes Outside or Not assigned because of its
name, floor or sensors. The store keeps `none` for Not assigned; no type stored is Inside, the default
(source `default`).

### 3.3 Main sensors, per kind

Each area has **one main sensor per kind** (or none). The kinds are one table in Pocket
(`cards/lib/kinds.js`), and every screen and the skill read it; a new kind is a new row, and it gets
its picker, its row in Settings → Areas and its question in the skill without other code:

| kind | what is picked | its readings (HA device class) | the candidates |
|---|---|---|---|
| `climate` | a device | temperature (`temperature`, required), humidity (`humidity`) | devices in the area with a temperature sensor |
| `air` | a device | CO₂ (`carbon_dioxide`), PM2.5 (`pm25`), VOC (`volatile_organic_compounds`, `volatile_organic_compounds_parts`), NO₂/NOx (`nitrogen_dioxide`), score (`aqi`) | devices in the area with at least one of these |
| `illuminance` | a sensor | light level (`illuminance`) | sensors in the area of that class |
| `sound` | a sensor | sound level (`sound_pressure`) | sensors in the area of that class |
| `pressure` | a sensor | air pressure (`atmospheric_pressure`, `pressure`) | sensors in the area of that class |

A candidate is a `sensor` whose area is the area (its own, else its device's), not hidden, not
disabled, not diagnostic or configuration, of the reading's device class; a device kind lists the
devices that have one. A sensor with no device is a candidate on its own. Nothing else filters:
the list is what HA says is in the area.

### 3.4 Readings HA does not classify

Some integrations give a reading no device class (an air-quality score, a VOC or NOx index). Once
an area's air device is chosen, each air reading that device does not have by class is offered as a
pick among **that device's** measurement sensors without a device class ("Score: choose a sensor").
A default in the home inputs (`air.score: sensor.x`) counts as that pick when the sensor belongs to the
chosen device.

### 3.5 Where a choice comes from, and the one-time automatic choice

For each area and kind, the first of these that has an answer wins:

1. **Set in Pocket** (an administrator, in the area's settings or Settings → Areas). For `climate`
   Pocket writes Home Assistant's own area fields (`config/area_registry/update`:
   `temperature_entity_id`, `humidity_entity_id`), so HA's area card and Pocket agree; for the other
   kinds and the type it writes Pocket's home store (§3.6). "None" is a choice too, and it is kept.
2. **Home Assistant's area setting** (`climate` only: the area's Related sensors).
3. **The home inputs' default** for that area (§3.7).
4. **The only candidate.** When an area has exactly one candidate for a kind and nothing above
   answers, it is the main one. It is recorded once (for `climate` into HA's area fields, for the others
   into the home store) the first time an administrator's Pocket sees it, with a mark that it was
   done. A second sensor added later changes nothing, and a choice cleared to None stays None. Until
   an administrator has opened Pocket, the only candidate is used without being recorded.

Each choice shows where it came from: "Set in Pocket", "Set in Home Assistant", "From the home's
setup", "Found automatically".

### 3.6 Pocket's home store

Home Assistant's frontend system data (`frontend/get_system_data`, `subscribe_system_data`,
`set_system_data`; in HA since 2025.x, present in 2026.9.2): one value per key for the whole home,
read by every user, written by administrators only, pushed live to every open Pocket. Key
`domosenso-pocket-home`:

```json
{
  "areas": {
    "living_room": {"type": "inside", "air": "<device id>", "air_readings": {"score": "sensor.x"}},
    "garden": {"type": "outside", "illuminance": "none"}
  },
  "picked": {"living_room": ["air"]}
}
```

A non-administrator sees every setting and its source, read-only, with "Only an administrator can
change this". A person's own settings (theme, language, bar) stay in their frontend user data.

### 3.7 The home inputs: defaults only

`home.inputs.yaml` holds what a home wants as its default and what HA cannot know; everything else is
discovered by area:

| field of a room | becomes |
|---|---|
| `id`, `area` | which HA area the defaults are for (`area`, else `id`) |
| `type` (**new**, optional: `inside` \| `outside`) | the area's default type |
| `climate`, `air` | the default main sensors (an air reading without a device class included) |
| `lights`, `media`, `scenes`, `covers`, `contacts`, `locks` | an override; without it Pocket shows every light, player and scene HA places in the area (a light group stands for its members), and the covers, contacts and locks as today |
| `name` | the name the Ramka shows; Pocket uses the HA area's name |
| `outside: {temperature, humidity, area}` | kept for the Ramka; Pocket reads it as the default type `outside` and the default climate of its `area` |

Pocket declares `uses_home: optional`: a home without home inputs renders it, and the card shows
Home Assistant's areas with no defaults. The schema gains one optional field (`type`); `climate-air` and
the Ramka read the inputs as before.

### 3.8 `domosenso areas <target>`: the read-only check

Reads the target's area and floor registries, the devices and entities, the states and Pocket's home
store (all reads). One line per finding:

```
area living_room "Living room" floor ground type inside (pocket)
main living_room climate sensor.living_room_temperature sensor.living_room_humidity (home-assistant)
main living_room air <device "Air monitor"> (inputs)
candidates bedroom climate 2: choose one
warn inputs room cellar: no HA area cellar
fail inputs sensor.attic_temperature: no such entity
```

It ends with `ok`, or `FAIL <n> to resolve` when a `fail` line was printed (an input naming
something HA does not have). `warn` lines (an area without a type, an area with several candidates
and no choice) never fail it: an empty new home passes. `--json` prints the same as one document.
`verify` does not run it.

### 3.9 Pocket's screens

- **Home → Overview**: an **Inside** and an **Outside** widget again, each aggregating the areas of
  its type: the range of their main temperatures ("21.0–22.4°"), coloured by the worst judged area
  (Inside only), the trend arrow for a single sensor. With no area of that type: the widget shows "No
  areas assigned" and opens Settings → Areas. With areas of that type but none with a main sensor:
  "Main sensor not set". The sheet behind it lists every area of the type, each with its value or "Main
  sensor not set", a row opening that area's trend or its settings page.
- **Climate page**: the same Inside and Outside squares; the list of every area with a climate
  sensor.
- **Settings → Areas** (`#/settings/areas`), the required place (§3.10): every area with its type
  and main sensor in one line; a row drills down to that **area's settings page**
  (`#/settings/areas/<area id>`, full screen, its back to the list): a Type row (Inside / Outside / Not
  assigned), then a Main sensors group with a row per kind of §3.3 (each candidate by its device's name,
  then None) and the unclassified readings of §3.4 under their kind. Every row is Settings' drop-down
  row: the name and its source on the left, the value on the right.
- **An area page**: a settings button in its title row opens the same page. This second way in is a
  UX decision of this feature (a person looking at one area should not have to go through Settings),
  not a rule of the design system: §3.10.
- **Areas page**: every HA area.

### 3.10 An architectural requirement for Pocket: AI first, visible in Settings

Domosenso is configured by an AI first: a person answers questions, and the skills write the answers.
What a home customizes should be little, and every bit of it must also be visible to the person.
So everything about the home that Pocket lets a home choose is:

1. **declared once**, as data (a table such as `kinds.json`), never as a page's own list;
2. **detected and suggested by the AI**: a read-only `domosenso` command shows its current value, its
   source and what Home Assistant offers for it (here `domosenso areas`, with `--json` details); the skill
   that sets it up (here `set-up-areas`) suggests a value from that, with its reason, and writes only
   what the owner confirms (§3.12); a new setting adds its line to the command and its suggestion to the
   skill;
3. **visible in Pocket's global Settings**, with its source, and changeable there (by an administrator
   for a setting of the home, by each person for their own, such as Quick actions); Settings is for
   fine-tuning and quick changes, the AI setup for the first values;
   through **generic controls, one per type of input**, all driven by the declaration: an enum (a type),
   a device and a sensor are each a drop-down row of their options or candidates (name and source left,
   value right; every choice among fixed options in Settings is a drop-down); what belongs to one item
   of a list is a full-screen drill-down page of that list, never a bottom sheet; a new setting of a
   known input type needs no new control;
4. **stored in Home Assistant**: its own registry field when one exists, else Pocket's home store for
   the home, a person's frontend user data for a person (the home's default then in the inputs);
5. **discovered from Home Assistant** when nobody chose (by area and device class, never by name), with a
   default in the home inputs only for what HA cannot know.

**Other entry points** to the same setting (the area page's settings button here) are not part of this
rule and not a default of the design system: the developer of a feature decides them from a UX/UI
analysis of that feature, and records the decision in `components/pocket/DESIGN.md`'s decisions log.

A feature that adds a setting does 1 to 5 in the same pull request. `components/pocket/DESIGN.md`
carries this rule.

### 3.11 Quick actions

Home's Quick section is a list of actions, in order. What an action can be is declared once in
`cards/lib/quick-actions.json`, read by Pocket and `domosenso areas`:

| item | Home's tile |
|---|---|
| `area:<area id>` | that area's lights, one light tile (tap toggles, drag dims) |
| `light.*` | one light, a light tile |
| `switch.*`, `fan.*`, `input_boolean.*` | toggles, showing On or Off |
| `scene.*`, `script.*` (turn_on), `button.*` (press) | runs it |
| `all_off` | every light off |

The list Home shows, the first that has one:

1. **the person's own** (their frontend user data, `quick`, set in Settings → Quick actions): Quick is
   theirs, as the bottom bar and the Scenes page are; an empty list is a choice (no Quick section);
2. **the home's default**: Pocket's input `quick_actions` (the instance layer), written by the skill
   `set-up-areas` after the owner confirms its suggestion;
3. **each area with lights, then All off**: what Quick showed before this spec.

An item that no longer resolves (a removed entity, a hidden area) is left out. **Settings → Quick
actions** (`#/settings/quick`) lists the person's actions with up, down and remove (44 px each), "Add an
action" (a drill-down page, `#/settings/quick/add`, of everything not yet in the list, by group), and,
while the list is theirs, "Use the home's default". "Edit" beside Quick's title on Home opens it: this
feature's second way in (§3.10).

`domosenso areas` prints the home's default as `quick <item> (<inputs|default>)` lines.

### 3.12 Detect, suggest, confirm

The AI setup does not ask open questions about things Home Assistant can show. `domosenso areas --json`
gives, per area and kind, every candidate with its device's name, manufacturer, model and readings, and
for Quick actions the default and every action that could be added, with names and areas. The skill
`set-up-areas` turns that into one proposal: a suggestion for every setting with its reason (a device
with all the kind's readings over one with some; a device named or modelled as the room's sensor over
one that measures equipment, such as a rack, a vent or a tablet's battery; the area's own lights and a
few scenes for Quick), shown to the owner as one table and confirmed or changed in one answer. Only
what the owner confirms is written. The code never matches names (D4); the AI may read them to suggest,
because a person checks every suggestion.

## 4. The three moments

### A. Onboarding (possibly with no sensor yet)

1. `onboard-home` creates the HA areas with the owner (floors if the home has several), as part of
   setting up integrations; Pocket needs nothing else to show them.
2. `add-component pocket`: no inputs are needed. The dashboard is registered as `add` prints.
3. The skill `set-up-areas` (§5), called by `onboard-home` once the areas exist and by `add-component`
   for a component with `uses_home`, reads the areas, asks the type of each, and for each area with more
   than one candidate which one is main; with no sensors it only asks the types.
4. Without sensors, Home shows Inside and Outside with "No areas assigned" or "Main sensor not set";
   lights, media and controls work by area.

### B. Installing Pocket on a home already set up

1. `domosenso areas production` before anything: it shows which areas already have HA Related sensors,
   which have one candidate (found automatically on first open) and which need a choice.
2. `set-up-areas` asks what is open and writes the answers as defaults into the home inputs (the
   instance layer), or, with the owner's typed yes, into the home store.
3. The owner can change every answer later on the phone.

### C. Adding something later

- **A new area** in HA: it appears in Pocket as Inside; its only sensor, if it has one, becomes its
  main one when an administrator opens Pocket. If it is outside or should not show, an administrator
  says so in Settings → Areas.
- **A new sensor** in an area that has a main one: nothing changes; it is offered in the picker.
- **A new sensor** in an area with none: it becomes the main one (the only candidate).
- No render, deploy or restart for any of these.

## 5. The skill `set-up-areas`

AI-led, against the running HA, reads free and writes only on a typed yes (the rules of
`onboard-home`):

1. Run `domosenso areas <target> --json`.
2. List the areas, all Inside by default, and ask which of them are outside and which should not show
   in Pocket at all (one question); the answers become `outside` and `none`.
3. For every area and kind with several candidates and no choice, name the candidates by their device
   names and ask which one stands for the area.
4. For an air device with readings HA does not classify, name its unclassified sensors and ask which
   one is the score, VOC or NOx (§3.4).
5. Write the answers into `domosenso/home.inputs.yaml` as defaults (`type`, `climate`, `air`),
   then `render` and the usual deploy plan; or, if the owner wants them live at once, show the store
   value and write it with `frontend/set_system_data` only on their typed yes.
6. Run `domosenso areas` again: no `fail` line.

`onboard-home` calls it after the areas exist (its new step 3.0); `add-component` calls it when the
component declares `uses_home`. Every answer it writes is visible, with its source, in Pocket's Settings →
Areas (§3.10).

## 6. Compatibility and migration

| who | what changes |
|---|---|
| a home whose inputs name rooms | the same sensors show (they are the defaults); areas the inputs did not list appear too, as Inside; Pocket's names become the HA areas' names |
| the inputs' `outside:` | its area defaults to Outside; Pocket no longer builds an "Outside" of its own |
| room ids that differ from their HA area (`room id: lukasz_office, area: office`) | Pocket's links use the HA area id; an old `#/area/<room id>` goes to Areas |
| climate-air, the Ramka | unchanged |
| a non-administrator | sees every setting read-only |

## 7. Acceptance and tests

- Pocket's tests (node --test): the area list from `hass.areas` and `hass.floors` in floor order; the
  precedence of §3.5 for each source; the one-time pick recorded once and never redone; candidates by
  device class only (a sensor named "temperature" without the class is not one); the unclassified
  reading picker; the Inside and Outside widgets in their three states; the area settings page and
  Settings → Areas reading one kinds table; read-only for a non-administrator.
- The render tests: a room's `type` passes to the card; a home inputs file without `rooms` renders
  Pocket.
- `domosenso areas`: the lines and the ending above, on a fake registry.
- The privacy test.

## 8. Delivery

1. This spec, the schema field, Pocket's area model, settings and widgets, `domosenso areas`, the skill
   `set-up-areas` and the calls from `onboard-home` and `add-component` (one pull request: the
   prototype).
2. The Ramka reading areas the same way.
3. climate-air home-wide comfort helpers for areas it has no range for (today an area climate-air has no
   range for is shown, not judged).

## 9. Questions for the maintainers

1. Should the one-time automatic choice write HA's own area fields (as here) or only Pocket's store?
2. Is `frontend/system_data` the store we want, or a component-owned storage file behind a small
   integration?
3. Should the default type be configurable per home (Not assigned instead of Inside for homes with
   many technical areas)?
