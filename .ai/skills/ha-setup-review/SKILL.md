---
name: ha-setup-review
description: Review any running Home Assistant setup against community good practice on its architecture (floors, areas, labels, device classes, leftovers, duplicate entities, people and phones, unique ids, integration health, backups, YAML syntax, upcoming deprecations) and, for a Domosenso home, say for each gap whether the framework departs on purpose or missed it. Read-only; fixes leave as a reviewed registry plan. Use when asked to audit, review or health-check a Home Assistant configuration, or before planning a cleanup.
---

# ha-setup-review

A review reads; it changes nothing. Everything here is a GET over the websocket API or a read of
files. A fix is written as a plan a human approves (a registry plan, a change to a package), never
applied from this skill.

## What you need

- The instance's websocket URL (`ws://<host>:8123/api/websocket`) and a long-lived token in a file
  outside any repository. An admin token: the registries need it.
- Optional: the configuration's files (a checkout or a read-only copy) for the YAML checks.
- Optional: the framework the home is built with. For a Domosenso home, its catalog checkout.

## 1. Collect and check

```bash
uv run --with websockets python3 .ai/skills/ha-setup-review/ha_review.py \
  --url ws://<host>:8123/api/websocket --token-file <token file> \
  [--config-dir <config dir>] --json <scratch>/ha-review.json
```

One line per finding, `PASS|INFO|WARN|FAIL <check>: <text>`, then
`summary pass <n> info <n> warn <n> fail <n>`. The script never prints a secret. Do not dump
`backup/config/info` yourself: it holds the backup encryption key.

Read every WARN and FAIL against its source before you report it. The script is a first pass:

- **leftovers**: a REST or command-line sensor of a device that is switched off is restored too.
  Search the configuration for the entity id *and* the registry's `unique_id`, matching whole ids
  (`sensor.x` is a prefix of `sensor.x_2`).
- **duplicate-players**: one is often kept on purpose (a dashboard uses it). Find its users first:
  the files, and every storage dashboard's config (`lovelace/config` with its `url_path`).
- **phone-names**: two mobile app devices with one name share one `notify.mobile_app_<name>`.
  Which phone it reaches is not knowable from outside. Say so.

## 2. What the script cannot see

Check these by hand and add them to the findings:

- **Configuration layout**: packages per concern, `!include` structure, secrets in `secrets.yaml`,
  the configuration under version control.
- **Recorder**: high-rate sensors excluded, `purge_keep_days` set on purpose, database size.
- **Updates**: the version against the latest release; a habit of reading the
  backward-incompatible changes before updating.
- **Dashboards**: sections views, areas shown, nothing left on unavailable entities.
- **Automations**: modes chosen (`single`, `restart`, `queued`), ids on YAML automations (traces),
  blueprints where the same logic repeats.
- **Security model**: door and window sensors with the right device class, a group or label for
  openings, an alarm panel when there are both.

## 3. The practices and why they matter

| Practice | Why | Since |
|---|---|---|
| Every area on a floor | floors are targets, triggers and dashboard sections | 2024.4; targets 2026.4 |
| Every device in an area; each area names its temperature and humidity sensor | area cards, voice, area triggers | 2024; area sensors 2025 |
| Labels for what spans rooms (perimeter, a hi-fi rack, night checks) | label triggers and targets, automatic dashboard sections | 2024.4; triggers 2026.1 |
| Categories or labels on automations once there are more than about 20 | finding and maintaining them | 2024.4 |
| Correct device classes (door, window, motion…) | icons, wording, voice, the Home dashboard's security summary | — |
| A `unique_id` on every YAML entity | rename, area, label and hide in the UI | — |
| One entity per physical box; the extra integrations' entities disabled | pickers, voice, targets stay unambiguous | — |
| A registry without leftovers | unavailable entities hide real failures | — |
| Unique phone names; a person follows only real trackers | notifications and presence | — |
| Automatic backups encrypted, in two locations, one schedule | a restore works when the machine is gone | 2025.1; local drives 2026.11 |
| Current YAML syntax (`triggers:`, `trigger:` items, `actions:`, `action:`) | old syntax is kept but no longer documented | 2024.10 |
| No `friendly_name` in templates (`entity_name()`, `device_name()`, `area_name()`) | planned deprecation; names become device plus entity | 2026.11 |

## 4. A framework's decisions

A home built with a framework departs from these practices on purpose in places. For every WARN
and FAIL, look for the decision before calling it a gap:

- **Domosenso**: `docs/PRINCIPLES.md` (placement test, files only), the validation notes
  (`docs/2026-10-20-domosenso-validation-notes.md`), the research (`docs/research/`), the specs in
  `.ai/specs/`, the component's `README.md`. Search by topic (`grep -ril <topic>`), then read the
  passage.

Give each finding one verdict:

- **Aligned**: the setup follows the practice.
- **Decided**: it departs, and a document says why. Quote the reason in a few words and say
  whether it still holds now (release notes since the document's date).
- **Missed**: it departs and no document weighs it. Name what it follows from (often a decision
  made for something else).

## 5. Report

Write the report where the home keeps its documents (a home repository's `reports/`), never in a
catalog or a public place: it names the home's rooms and entities.

1. The short answer: three to five sentences.
2. Tables: Aligned, Decided, Missed (each row: practice, what the setup does, evidence as a file
   path or a count, the cause).
3. What the next Home Assistant release changes for this setup.
4. Recommendations, in order.
5. Sources: the files read, and the release notes with links.

Mark inference as inference. A count in a finding comes from the script's JSON or a query you ran,
not from memory.

## 6. Fixes

Offer the fixes as a plan: for a Domosenso home, a registry plan in `docs/registry/` applied by its
registry tool after a dry run; for a change in files, the normal render and deploy. Nothing is
written to Home Assistant without the owner's go-ahead typed in that session.
