# lights 0.5.0 presence rooms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Hue room's light switches on at entry when it is dark and off `off_after` after the room is empty, restoring its last state, with logbook lines for tuning; then one real room uses it.

**Architecture:** New optional input `presence_rooms` of the `lights` component; `templates/package.yaml.j2` renders, per room, a hold helper, an ambient and a median illuminance sensor, a last-distance sensor, a main automation (`mode: queued`) and a start automation. An empty list renders today's package unchanged. A behaviour check drives the rendered package on a throwaway HA container with stand-in entities.

**Tech Stack:** Jinja templates with `[[ ]]`/`[% %]` delimiters (`tools/domosenso_render.py`), HA 2026.9.2 YAML (template, statistics, automation, input_boolean, logbook), pytest, docker.

**Spec:** `.ai/specs/SPEC-053-2026-11-20-lights-presence-rooms.md` (approved 2026-11-20). Read it before every task.

## Global Constraints

- Version `0.5.0`; 0.3.0 and 0.4.0 are taken. Assistant and assistant-action metadata stay as in 0.4.0.
- `presence_rooms: []` (or absent) renders `packages/lights.yaml` byte for byte as 0.4.0 does.
- Entity ids English; template entities carry `component: lights`; the `statistics` sensor is the noted exception.
- `turn_on` on the group carries **no** `data` (the bridge restores the last state).
- "A bulb of the group is on" = `expand(state_attr(group, 'entity_id') or []) | selectattr('state','eq','on') | list | count > 0`, never the group's own state.
- Unknown or unavailable illuminance counts as dark.
- `off_after` default `"00:05:00"`; median window 2 minutes.
- No household names, rooms or entity ids of the real home in this repository or its PR text.
- Translations en, de (Swiss, `ss`), pl (no calques); `en` is the source.

## Review Focus

1. **Steady daylight reading** — a source that does not change for minutes leaves a `max_age` statistics sensor empty, which would read "dark" at noon. Expected: the median keeps the last sample (`keep_last_sample: true`). Test in Task 2 and case 3 in Task 4.
2. **Presence flapping with the light on** (a radar drops for seconds) — expected: no new `turn_on`, no hold change, the off timer restarts. Case 6 in Task 4.
3. **Bulbs cut at the wall** (all `unavailable`, group still `on`) — expected: counts as off, entry tries `turn_on`, `empty_lit` never fires. Case 8 in Task 4.
4. **Switched off by hand, sensor drops for less than `off_after`, person still there** — expected: hold stays, no relight. Case 5 in Task 4.
5. **Restart with the light on and the room occupied** — expected: nothing switches off. Case 10 in Task 4.

---

### Task 1: Manifest, input and render guard

**Files:**
- Modify: `components/lights/component.yaml` (version, `inputs.presence_rooms`, `provides`, `integrations` gains `statistics`, `automation`, `input_boolean`, `logbook` as core)
- Modify: `components/lights/templates/package.yaml.j2` (guard only)
- Test: `tests/test_lights_render.py`

**Interfaces:**
- Produces: input `presence_rooms: list[{group, name, presence, illuminance?, dark_below?, off_after?, distance?, id?}]`, default `[]`; `id` defaults to `group.split('.',1)[1]`. Entities as SPEC-053 "Provides" plus `automation.lights_presence_<id>_start` (unique_id `lights_presence_<id>_start`, stable).

- [ ] **Step 1: Write failing tests**
  - `test_empty_presence_rooms_renders_as_before`: render the demo inputs with `presence_rooms: []` and with the key absent; both equal a golden copy of today's output, saved first as `tests/fixtures/lights-0.4.0-package.yaml` (render it from `main` before changing the template).
  - `test_illuminance_without_dark_below_fails`: `presence_rooms: [{group: light.office, name: Office, presence: binary_sensor.office_presence, illuminance: sensor.office_illuminance}]` → `render_component` raises; the message contains `presence_rooms` and `Office` and `dark_below`.
  - `test_manifest_version`: `component.yaml` version is `0.5.0` and `presence_rooms` default is `[]`.
- [ ] **Step 2: Run** `uv run pytest tests/test_lights_render.py -q` → the new tests FAIL.
- [ ] **Step 3: Implement** the manifest changes (the `statistics` sensor's provides entry notes it carries no `component` attribute) and the guard with the renderer's global `fail()`, as `components/audio-sensor/templates/package.yaml.j2` does: `[[ fail('presence_rooms: ' ~ room.name ~ ' has illuminance but no dark_below') ]]`.
- [ ] **Step 4: Run** `uv run pytest tests/test_lights_render.py -q` and `uv run tools/catalog_check.py` → PASS / `ok`.
- [ ] **Step 5: Commit** `lights 0.5.0: presence_rooms input and render guard`.

### Task 2: Helpers and sensors per room

**Files:**
- Modify: `components/lights/templates/package.yaml.j2`
- Test: `tests/test_lights_render.py`

**Interfaces:**
- Consumes: Task 1 input.
- Produces, per room `<id>` (only for a non-empty list):
  - `input_boolean.lights_presence_<id>_hold` (name `<name> presence hold`, icon `mdi:lightbulb-off-outline`).
  - With `illuminance`: trigger template sensor `lights_presence_<id>_ambient` — triggers on `illuminance` state change and on every bulb of the group changing; state = the illuminance while no bulb is on, otherwise `this.state`; attributes `component: lights`, `source: <illuminance entity>`.
  - With `illuminance`: `statistics` sensor `lights_presence_<id>_illuminance`, source the ambient sensor, `state_characteristic: median`, `max_age: {minutes: 2}`, `keep_last_sample: true`, `sampling_size: 200`.
  - With `distance`: trigger template sensor `lights_presence_<id>_last_distance` — triggers on `distance` change; state updates only while `presence` is on and the value is above 0, otherwise `this.state`; unit copied from the source; `component: lights`.

- [ ] **Step 1: Write failing tests**
  - `test_presence_room_helpers_and_sensors`: demo inputs plus the Office room from Task 3's demo entry → package has `input_boolean` key `lights_presence_office_hold`; template trigger sensors with unique ids `lights_presence_office_ambient` and `lights_presence_office_last_distance`, both with `attributes.component == "lights"`; a `sensor` list entry with `platform: statistics`, `unique_id: lights_presence_office_illuminance`, `state_characteristic: median`, `keep_last_sample: true`, `max_age == {"minutes": 2}`.
  - `test_presence_room_without_optional_sensors`: entry without `illuminance` and `distance` → none of the three sensors is rendered; the hold is.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** in the template's `[% if presence_rooms %]` block, below the existing blocks.
- [ ] **Step 4: Run** `uv run pytest tests/test_lights_render.py -q` → PASS.
- [ ] **Step 5: Commit** `lights 0.5.0: presence room helpers and sensors`.

### Task 3: Automations, logbook text, demo room

**Files:**
- Modify: `components/lights/templates/package.yaml.j2`
- Modify: `components/lights/translations/{en,de,pl}.json` (`ui.presence.on`, `ui.presence.off`)
- Modify: `examples/demo-home/inputs/lights.yaml`, `examples/demo-home/states.yaml`
- Test: `tests/test_lights_render.py`

**Interfaces:**
- Consumes: Task 2 entities.
- Produces:
  - `automation` id `lights_presence_<id>`, alias `<name> presence light`, `mode: queued`, `max: 10`, triggers by id: `enter` (presence to `on`), `empty_lit` (template: a bulb on and presence `off`, `for: off_after`), `leave` (presence to `off`, `for: off_after`), `manual_off` (any bulb of the group from `on` to `off`; condition presence `on`), `manual_on` (any bulb to `on`).
    - `enter`: conditions no bulb on, hold `off`, and dark = `states(median) | float(none)` is none or below `dark_below` (no illuminance → always); action `light.turn_on` target group, no data; `logbook.log` name `<name>`, message `ui.presence.on` with the median value (or `—`).
    - `empty_lit`: `light.turn_off` group; `logbook.log` with `ui.presence.off`, `off_after` in minutes and the last distance (or `—`).
    - `leave` / `manual_on`: `input_boolean.turn_off` hold. `manual_off`: `input_boolean.turn_on` hold.
  - `automation` id `lights_presence_<id>_start`, `mode: single`, trigger `homeassistant` `start`; condition a bulb on and presence `off`; `wait_for_trigger` presence to `on`, `timeout: off_after`, `continue_on_timeout: true`; if `wait.trigger` is none: the same turn-off and logbook line as `empty_lit`.
  - Copy, en: `ui.presence.on` = `"switched on at entry, illuminance {value}"`, `ui.presence.off` = `"switched off, {minutes} min without presence, last seen at {distance}"`. de and pl: same content, natural wording.
  - Demo: room `{group: light.office, name: Office, presence: binary_sensor.office_presence, illuminance: sensor.office_illuminance, dark_below: 15, off_after: "00:03:00", distance: sensor.office_presence_distance}`; states `binary_sensor.office_presence: "off"`, `sensor.office_illuminance: 40`, `sensor.office_presence_distance: 0`. (The spec's example says Study; the demo home has an Office, used instead.)

- [ ] **Step 1: Write failing tests**
  - `test_presence_automation_triggers`: the main automation has trigger ids exactly `{enter, empty_lit, leave, manual_off, manual_on}`, `mode == "queued"`; the `empty_lit` and `leave` triggers have `for == "00:03:00"`.
  - `test_turn_on_sends_no_data`: every `light.turn_on` action in both automations has no `data` key and targets `light.office`.
  - `test_start_automation`: id `lights_presence_office_start`, trigger platform `homeassistant`, event `start`, wait timeout `"00:03:00"`.
  - `test_presence_translations`: `ui.presence.on` and `ui.presence.off` exist in en, de, pl; de contains no `ß`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** template, translations, demo inputs and states.
- [ ] **Step 4: Run** `uv run pytest tests/test_lights_render.py -q` and `tools/ha-check.sh lights` → PASS, no errors.
- [ ] **Step 5: Commit** `lights 0.5.0: presence room automations`.

### Task 4: Behaviour check on a live Home Assistant

**Files:**
- Create: `tools/lights-presence-check.py`
- Create: `tests/fixtures/lights-presence-standins.yaml` (a local package with the stand-ins)
- Modify: `tools/check-all.sh` (one `background "lights presence behaviour" uv run tools/lights-presence-check.py` line next to the home staging runtime)

**Interfaces:**
- Consumes: Task 3 package. Reuse the throwaway-home pattern of `tools/home-staging-check.py` (`make_home`, `HomeStaging`, `HA`), with `--catalog-dev` rendering of `lights`.
- Stand-ins in the fixture: `input_boolean.office_presence_raw` → template `binary_sensor.office_presence`; `input_number.office_lux` (0–255) → template `sensor.office_illuminance` (plus `input_boolean.office_lux_unavailable` that makes it unavailable); `input_number.office_distance` → `sensor.office_presence_distance`; two template lights backed by input_booleans (`light.office_bulb_1`, `_2`, with an `input_boolean.office_bulbs_unavailable` for availability) and a `group` platform light `light.office` of both. Inputs for the check use `off_after: "00:00:10"`.

- [ ] **Step 1: Write the check** with one function per case; each sets states through service calls, waits with a timeout, asserts bulb states, the hold, and logbook entries (`/api/logbook`):
  1. entry, lux 2 → bulbs on, logbook "switched on".
  2. entry, lux 100 for 2 min → stays off.
  3. lux 100 set once and left unchanged 3 min, then entry → stays off (Review Focus 1).
  4. entry with lux unavailable → on.
  5. on, presence on, switch off by hand → hold on; presence off 5 s and on again → stays off (Review Focus 4); presence off 12 s → hold off; next entry in the dark → on.
  6. on, presence toggles off/on every 3 s for 30 s → bulbs on throughout, no new logbook "switched on" (Review Focus 2).
  7. presence off 12 s with light on → off, logbook "switched off" with the last distance.
  8. bulbs unavailable, group state on, entry → `turn_on` attempted, no error in the log beyond HA's unavailable warning; no `empty_lit` turn-off (Review Focus 3).
  9. presence off, light switched on by hand → off after 10 s.
  10. `automation.trigger` the start automation with the light on: presence comes on within 10 s → stays on (Review Focus 5); again with presence staying off → off after 10 s.
  11. return within 2 min after case 7 with lux reading 8 while lit and 2 before → on (ambient holds the pre-light reading).
- [ ] **Step 2: Run** `uv run tools/lights-presence-check.py` → every case prints `ok <case>`, last line `ok`. Fix the template (not the check) where a case fails, then re-run Task 1–3 tests.
- [ ] **Step 3: Commit** `lights 0.5.0: behaviour check on a live HA`.

### Task 5: Field notes, upgrade note, full checks, PR

**Files:**
- Modify: `components/lights/README.md`, `components/lights/UPGRADE.md`, `components/lights/translations/{en,de,pl}.json` (`meta.description`), `docs/UPGRADE_NOTES.md` if it lists component versions

- [ ] **Step 1: Write** README sections from SPEC-053 "Artifacts": picking `dark_below` from the sensor's own hourly medians and from the reading just before people switched the light on by hand; the off-delay trade-off; one HA per Hue group; remove a local automation on the same group first. UPGRADE `## 0.5.0 (2026-11-20)`: additive, nothing to change.
- [ ] **Step 2: Run** `tools/check-all.sh` → `all checks passed`.
- [ ] **Step 3: Commit**, then **ask Piotr** for the go-ahead to push `claude/presence-lights` and open the PR into `main`; on yes: `gh pr create`, then request review from `docere-priv`. After merge the Release workflow tags `lights/0.5.0`; never tag by hand.

### Task 6: Home rollout

Lives in the home's own repository and plan, not here: this repository is public. After the tag
`lights/<0.5.0>` exists, the home updates the component, adds its room to its inputs, stages,
deploys to production with the owner's go-ahead, verifies, checks on the real bridge that a bare
`turn_on` restores the last brightness and colour temperature, and records any installation that
does not run the room as a parity gap.
