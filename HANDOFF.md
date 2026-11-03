# Handoff: ha-setup-review skill and SPEC-030 (2026-11-03)

> **TEMPORARY.** This file lets a later session continue this branch. Delete it in the commit that
> opens a pull request from this branch into `main`.

Branch `claude/ha-setup-review`, pushed with no pull request. The owner wants to review the skill
and the spec first.

## What is here

- `.ai/skills/ha-setup-review/SKILL.md`: how to review any running Home Assistant against good
  practice and give each finding a verdict:
  - **Aligned**: the setup follows the practice.
  - **Decided**: it departs, and a document says why.
  - **Missed**: it departs and nothing weighs it.
- `.ai/skills/ha-setup-review/ha_review.py`: a read-only collector over the websocket API, plus an
  optional scan of the configuration files. It prints one line per finding
  (`PASS|INFO|WARN|FAIL <check>: <text>`) and a summary line, and has a `--json` option. It never
  prints the backup encryption key: `backup/config/info` returns that key, so nothing may dump that
  call raw.
- `.ai/specs/SPEC-030-2026-11-03-ha-setup-review.md` (draft).
- The skill is linked from `.claude/skills` and `.agents/skills`.
- `agents_check` passes. The docs, agents and catalog-content tests pass (82).

## Open before a pull request

1. **The owner's review** of the skill, the checks and SPEC-030.
2. **The skill's row in `AGENTS.md`.** The skills table needs a row for it, but adding one put the
   file at 32,877 bytes, over its 32,768-byte limit. Something has to be trimmed first; the owner
   decides what.
3. **SPEC number.** Catalog main also has a `SPEC-030-…-ramka-wake-application.md`. Renumber this
   spec before merging.
4. Tried on one home only (7 pass, 7 info, 9 warn, 0 fail after its cleanup). Its false positives
   are fixed:
   - disabled media players counted as duplicates;
   - a diagnostic NAS sensor taken for a room sensor;
   - players grouped by model instead of by device.
   A second home would test it further.

## How Home Assistant models a home (the background for the checks)

Home Assistant builds higher-level objects in layers. Most of the review checks whether a home uses
them.

| Layer | What it is | Used for |
|---|---|---|
| Entity | one value or control (`binary_sensor.*`, `media_player.*`) with a **device class** (door, window, motion, opening…) | state, history, icons and wording, voice |
| Device | the physical box an integration reports; groups its entities | where entities come from; one box seen by several integrations is several devices: keep one, disable the rest |
| Area | a room; devices (and entities that override them) belong to one. An area can name its temperature and humidity sensor | area cards, voice ("lights in the kitchen"), area triggers and targets |
| Floor | a level holding areas (2024.4) | targets (2026.4), triggers, dashboard sections |
| Label | any number of tags across rooms and domains (2024.4): "perimeter", "hi-fi rack", "night check" | triggers on a label (2026.1), targets (2026.4), dashboards that fill themselves (2026.11) |
| Category | a folder for automations, scripts and helpers in their own list | keeping many automations findable |
| Group helper | a new entity combining others: any door open, mean temperature, all lights | one state to show or trigger on |
| Template entity | a new entity computed from others, with its own device class | derived objects ("rack powered", "balcony secure") |
| Alarm panel | arms and disarms over the openings and motion sensors | security with modes |

**Higher-level objects** come from combining these layers:

- **Doors and windows**: an entity with the device class `door`, `window` or `garage_door` in an area,
  with a label such as `perimeter`. A group helper (any open) builds on the label. The Home
  dashboard's security summary reads the device classes.
- **An audio rack**: its devices in one area, a label `hi-fi rack`, and template or group entities for
  its state ("rack on", "now playing"). One media player per box; the extra integrations' players
  are disabled.
- Since 2026, areas, floors and labels are what automations and dashboards address. A home with thin
  registries cannot use those features.

**Practice the checks follow**:
- every area on a floor;
- every device in an area;
- each area names its climate sensors;
- labels for whatever spans rooms;
- correct device classes;
- a `unique_id` on every YAML entity, so the UI can give it an area, a label or a name;
- no leftover registry entries;
- one entity per box;
- unique phone names, and people that follow only real trackers;
- encrypted backups in two places, on one schedule;
- current YAML syntax;
- no `friendly_name` in templates (planned for deprecation in 2026.11).

## What it means for Domosenso (the review's conclusion)

Everything Domosenso keeps in files is aligned with good practice. The gaps all sit in the registry.
"Files only, never replace `.storage`" was decided for the cut-over, and by default no one took
charge of the registry afterwards. The proposals, none started:

1. **A registry layer**: a component declares what it expects of the registry (areas, labels such as
   `domosenso:<id>`, an area's sensors). `status` and `verify` check it, and changes go through a
   reviewed plan applied over the API.
2. **Registry orphans**: `update` names the entities a removed file defined. `verify` reports
   entities that were unavailable before the change as well as newly unavailable ones.
3. **Areas and labels as inputs**: components read areas and labels, and accept entity lists only as
   a fallback.
4. **Two decisions to write down**: cards vendored instead of installed from the store, and a marker
   attribute instead of labels.
5. **HA 2026.11**:
   - `friendly_name` is read in 9 catalog files;
   - HACS becomes the built-in Marketplace;
   - sun and calendar offsets change sign.
6. **The backup component**: its archives are not encrypted and sit in one place. Weigh that against
   its retention rule.
