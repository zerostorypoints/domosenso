# Getting started: your own home on Domosenso

Build a separate Home Assistant project from the shared component catalog.

## Start here: `/onboard-home`

Clone this repository with its tags, open it in Claude Code and type `/onboard-home` (Codex: ask for
the `onboard-home` skill). The agent asks about your Home Assistant host and how you will reach it,
reads your hardware and the integrations Home Assistant discovered on your network (`domosenso
recommend --from-ha`, `domosenso discover`), recommends components and the hardware still missing,
explains the Ramka and checks your tablet if you want one, creates your home repository in a
directory outside this one, offers to keep it in a private GitHub repository, adds `backup` with values read from your Home Assistant, and stops at
`deploy production --plan`. It reads your Home Assistant freely and writes nothing to it until you
type yes. From an empty directory instead: tell the agent to read
`<catalog>/.ai/skills/onboard-home/SKILL.md` and follow it.

The rest of this page is what the skill does, step by step, for reference.

## Release status (2026-10-23)

- The selected released components have field evidence from one personal installation. This is
  an early-stage framework, not a record of completed customer projects. Check each manifest's
  `tested.homes`; an unknown count and zero tested homes mean different things.
- The supported onboarding path is **Home Assistant Container** on a Docker host reached over
  key-based SSH. Home Assistant 2026.9.2 is the checked baseline. The existing-installation path
  has been used on a Synology NAS; other hosts need validation. HAOS is not supported.
- Ramka's published `ramka/0.2.0` release supports optional climate, air, plants and photo pages.
  Its one tested layout covers 1024–1280 × 720–800 CSS px in landscape. The manifest contains
  `media_player_contract`; the documented audio integration was tested with Hegel H400 through
  `hegel_streaming`. Other players need their own contract and behavior checks.
- The host-installation path, tablet probe and HTTP proxy tools exist and have local-container
  checks. This does not establish field validation on every host or tablet. There is no
  installable scene-simulation staging environment for a new home yet.
- `remote-access` is development work: it has **no published component tag** and its manifest
  records zero tested homes as packaged. It is not included in the released website catalog.
  Do not present it as an installable release or automatically add it during onboarding.
- The framework is licensed under [Apache-2.0](../LICENSE), including commercial use. See the
  [license scope for historical releases](licensing.md). Keep your home repository private;
  the framework license does not require you to publish its configuration.

## What you need

- A Home Assistant Container you can reach over SSH with `docker` (a Synology NAS works), a
  long-lived access token from your HA profile, saved in a file outside any repository.
- On your computer: `git`, [`uv`](https://docs.astral.sh/uv/), `ssh` and your coding agent.
  Docker is needed on the Home Assistant host; local Docker is needed for framework checks,
  not for the normal onboarding path.
- This repository cloned, with its tags: `git clone https://github.com/zerostorypoints/domosenso.git`, then `uv sync`
  in it (the command reads components only from tags such as `ramka/0.2.0`). You only read from
  this clone; a change to the catalog is a pull request from your fork (CONTRIBUTING.md).

## The components

| component | needs | gives you |
|---|---|---|
| `ramka` | an Android wall tablet with the HA Companion app, presence (a radar or Bermuda) | the wall-tablet dashboard: clock, weather, climate, air, plants, photos, calendar, controls |
| `backup` | — | nightly backups with retention, backup sensors, an alert when backups stop |
| `climate-air` | temperature/humidity sensors per room, a `weather` entity | indoor averages and extremes, outside figures, most humid room, lowest battery |
| `bermuda-presence` | ESPHome BLE proxies (M5Stack Atom Lite) and the Bermuda integration | which room each phone is in |
| `plants` | Mi Flora sensors | plant entities, water reminder, silent-sensor alert |
| `awnings` | Somfy RTS awnings, an ESPSomfy-RTS node | MQTT covers, wind sensor watch, sunset retract |
| `lights` | Hue rooms | room lights that follow reachable bulbs, lights-on count, lowest Hue battery |

Each component's `component.yaml` lists its inputs (your entity ids, names, rooms) and what it
provides; its `README.md` has field notes. `calendar`, `media`, `weather` describe what the Ramka reads.

## First steps (by hand)

Which components your devices satisfy, from the catalog's newest tags. With a running Home Assistant,
let it read the hardware (read-only; the token stays in its file):

```bash
uv run --project ~/path/to/domosenso domosenso recommend --catalog ~/path/to/domosenso --from-ha http://homeassistant.local:8123 --token-file ~/.config/ha-token
```

What Home Assistant found on your network and has set up, and whether it has an integration you
name (read-only):

```bash
uv run --project ~/path/to/domosenso domosenso discover --from-ha http://homeassistant.local:8123 --token-file ~/.config/ha-token --domain workday
```

Or name the devices yourself, and add what Home Assistant does not know yet the same way:

```bash
uv run --project ~/path/to/domosenso domosenso recommend --catalog ~/path/to/domosenso --have tapo-t315 network-audio-player
```

Then the home repository:

```bash
mkdir ~/my-home && cd ~/my-home && git init
uv run --project ~/path/to/domosenso domosenso init --catalog ~/path/to/domosenso
```

`init` writes `domosenso.yaml` (targets, components, local files) and a lock file. Copy
`examples/home-template/.gitignore` from the catalog into the home: it keeps `secrets.yaml`, tokens,
`.storage/`, the database and `.domosenso/` out of git.

If you want the home on GitHub, make it **private**: it names your rooms, devices and entities. Check
that `git ls-files` lists none of the ignored files above and nothing with `token` in its name. If
one is tracked, untrack it (`git rm --cached <path>`) and commit before you push. Then:

```bash
gh repo create <you>/<home name> --private --source . --remote origin --push
```

Done when `git remote -v` shows `origin`. From then on, every change goes on a branch with a pull
request.

Then, for each component you want:

```bash
uv run --project ~/path/to/domosenso domosenso add backup@0.1.0
# fill domosenso/backup.inputs.yaml with your values
uv run --project ~/path/to/domosenso domosenso render
uv run --project ~/path/to/domosenso domosenso status
```

Describe your Home Assistant as the `production` target in `domosenso.yaml` (SSH host, container,
config path, URL, token file). Rendered packages load only through
`homeassistant: packages: !include_dir_named packages`: copy your `configuration.yaml` from Home
Assistant into `home-assistant/configuration.yaml`, add that line if it is missing, and the deploy
carries it from then on (`secrets.yaml` and `.storage/` stay where they are). Then:

```bash
uv run --project ~/path/to/domosenso domosenso snapshot production --out before.json   # read-only
uv run --project ~/path/to/domosenso domosenso deploy production --plan                 # read-only
uv run --project ~/path/to/domosenso domosenso deploy production --apply --confirm <hash>
uv run --project ~/path/to/domosenso domosenso verify production --baseline before.json
uv run --project ~/path/to/domosenso domosenso rollback production                      # if needed
```

`deploy --plan` lists what would change, and files on your HA that the home repository does not know
about ("orphans"); decide each before `--apply`. The deploy backs up what it replaces and restores it
by itself if `check_config` fails.

Start small: `backup` first (no hardware), then one component whose hardware you have.

## With a coding agent, after onboarding

`/onboard-home` copies `examples/home-template/AGENTS.md` and `CLAUDE.md` into your home repository
and fills in the placeholders (host, container, paths). From then on open the agent in your home
repository for everyday work; it may read your Home Assistant freely and asks before any write to it.

## Giving back

A component you change or add goes back as a pull request to this repository: spec first for a new
component (`.ai/specs/`, skill `write-component-spec`), `tools/check-all.sh` green, nothing from your
household in the catalog (inputs carry it). A verified test in another home can support updating that component’s recorded field evidence.
It does not change the counts for unrelated components.
