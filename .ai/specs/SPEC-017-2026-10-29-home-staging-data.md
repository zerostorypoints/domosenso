# SPEC-017: readings for home staging (copied or invented)

- Status: draft, 2026-10-29
- Source: the maintainer's request after the first `stage-home-update` run on a private home:
  the staged Ramka rendered every tile without values, so the visual check showed layout only.
- Amends: SPEC-016, which ruled out mirroring production. This spec copies a **states snapshot**
  on request; `.storage`, the database, tokens and media stay out, as SPEC-016 requires.

## Goal

`home-staging.py` can fill an owned staging instance with entity states so dashboards and
templates show realistic values:

1. **copied** from a target the home already declares (usually `production`), read-only;
2. **invented** for every entity the home's components read that has no copied state.

The instance stays isolated: the host reads the source; the container never gets a route to it.

## Interface

```sh
home-staging.py --home HOME seed --name review --from production   # copy, then invent the rest
home-staging.py --home HOME seed --name review --fake               # invent only
home-staging.py --home HOME seed --name review --show               # what is seeded and why
```

Prints one line per entity (`copied`, `invented`, `skipped <reason>`) and ends `ok` / `FAIL`.
`--from` needs the target's `url` and `token_file` from `domosenso.yaml`; it only issues
`GET /api/states`. Re-running replaces the snapshot (no live sync).

## Which entities

- Default set: every entity id named in the home's `domosenso/*.inputs.yaml` and `consumes:`
  of its components (`--all` copies every source state, still filtered as below).
- **Skipped**: entities the staging config produces itself (template/helper entities from the
  home's packages, `input_*`, anything already present after the baseline deploy); those are
  computed, not seeded.
- Attributes are scrubbed: `access_token`, `entity_picture` with a query string, `stream_source`,
  and anything on a denylist kept with the tool. Cameras and media streams are not copied.

## Invented values

Deterministic, per domain / `device_class` / unit: temperature 21.5 °C, humidity 45 %, CO₂ 650 ppm,
battery 80 %, moisture 35 %, weather `partlycloudy` with a three-day forecast, covers `open` 100,
lights `off`, binary sensors `off`. Each invented state carries `domosenso_fixture: invented`
so screenshots and `compare` can tell it apart. Unknown kinds get `unknown`, reported as such.

## How states get into HA

A generic fixture integration `domosenso_fixture` (generalised from the demo's `domosenso_demo`)
reads `seed.json` from the staging config at start, publishes the states again after every
restart, and records service calls on seeded entities instead of acting (`sensor.domosenso_fixture_actions`).
It is copied only into a staging config, never rendered into a home or deployed to a target;
`deploy` refuses a plan that would carry it.

## Artifacts and ownership

| file | layer |
|---|---|
| `tools/home_staging_seed.py`, `tools/fixture/domosenso_fixture/` | framework |
| `.domosenso/staging/<id>/seed.json`, its copy in the staging config | private runtime, git-ignored |

Nothing new in a home repository. The installed skill and `HOME_STAGING.md` gain a "seed" step.

## Compatibility

Additive: a new subcommand; `up`, `down`, `reset`, `target` unchanged. No schema change.

## Tests

- pytest: entity selection from inputs/consumes, skip rules, attribute scrubbing, invented values.
- `home-staging-check`: a fictional home seeded `--fake`, `check_config` 0 errors, states present
  after a restart; a second staging instance used as the `--from` source, so no test touches a
  real home.
- Real home (manual, owner present): seed from production, screenshot the Ramka.

## Out of scope

History and statistics (charts stay empty), live mirroring, forwarding service calls to real
devices, cameras/streams, copying `.storage`.

## Open questions

- Default set: inputs/consumes only (proposed), or every source state?
- Is a read-only `GET /api/states` from production acceptable for every home by default, or does
  it need the owner's consent per run? (This home's AGENTS.md allows production reads; others may not.)
- Should copied values be frozen, or slowly drift so rotations and thresholds are exercised?
