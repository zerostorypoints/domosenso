# SPEC-030: skill `ha-setup-review` — a read-only review of any Home Assistant setup

- Status: draft 2026-11-03, for the maintainer's approval. Source: the maintainer, 2026-11-03:
  "provide a skill to analyse any HA setup against the community good practises on HA
  architecture and … know how current domosenso practises are align with it. If not, then why".

## What

A skill, `.ai/skills/ha-setup-review/`, with its script `ha_review.py`:

- reads a running Home Assistant over the websocket API (registries, states, config entries,
  dashboards, people, backup schedule) and optionally its YAML files; writes nothing;
- prints one line per finding (`PASS|INFO|WARN|FAIL <check>: <text>`) and a summary line, and
  `--json` for the report;
- for a home built with a framework (Domosenso first), gives each finding a verdict: aligned,
  decided (a document says why) or missed (no document weighs it);
- hands fixes on as a plan a human approves, never applies them.

## Checks

Floors, device areas, empty areas, area temperature and humidity, helper and template entities
without an area, labels, automation categories, YAML leftovers restored without a definition,
registry orphans, entities without a `unique_id`, one box under several media players, mobile app
devices sharing a name (one notify service), people following missing trackers, door and window
sensors without their class, the security summary, device classes, integrations not loaded, the
unavailable share, HACS (the Marketplace from 2026.11), backups (schedule, locations, a second
schedule from an automation), pre-2024.10 YAML syntax, `friendly_name` in templates.

## Not in it

Writing to Home Assistant; a score; checks that need the recorder database. Registry fixes stay
the home's (its registry tool and a reviewed plan).

## Privacy

The script and the skill hold no home's data. A report names the home's rooms and entities, so it
is written in the home's repository only. The script never prints the backup encryption key that
`backup/config/info` returns.

## Tested

Against one home on 2026.9.2 (2026-11-03): 7 pass, 7 info, 9 warn, 0 fail after three false
positives were fixed (disabled players, a NAS's diagnostic temperature, players grouped by model
instead of device name).
