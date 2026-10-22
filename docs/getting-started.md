# Getting started: your own home on Domosenso

For a first outside home.

## Start here: `/onboard-home`

Clone this repository with its tags, open it in Claude Code and type `/onboard-home` (Codex: ask for
the `onboard-home` skill). The agent asks about your Home Assistant host and how you will reach it,
reads your hardware and the integrations Home Assistant discovered on your network (`domosenso
recommend --from-ha`, `domosenso discover`), recommends components and the hardware still missing,
explains the Ramka and checks your tablet if you want one, creates your home repository in a
directory outside this one, adds `backup` with values read from your Home Assistant, and stops at
`deploy production --plan`. It reads your Home Assistant freely and writes nothing to it until you
type yes. From an empty directory instead: tell the agent to read
`<catalog>/.ai/skills/onboard-home/SKILL.md` and follow it.

The rest of this page is what the skill does, step by step, for reference.

## Where things stand (2026-10-22)

- One home runs fully on the catalog since 2026-10-22: seven components, deployed and checked with the
  `domosenso` command. Every component is tested in that one home only.
- Home Assistant runs as a **Container** (Docker), no add-ons or apps. Tested on 2026.9.2.
- Not there yet: an installable staging Home Assistant with scene simulation for a home without
  hardware (planned, "stage 2"); a written contract for the Ramka's music player (it is tested with a
  Hegel amplifier through `hegel_streaming`; another `media_player` such as a Naim streamer through
  `cast` or `dlna_dmr` should work but has not been tried); remote access for an installer; in
  progress (SPEC-011): installing Home Assistant, a `remote-access` component, a probe that measures a
  tablet's screen, and Ramka layouts for screens other than 1100 × 720 CSS px.
- The repository is private and has no licence yet. Ask before sharing anything from it.

## What you need

- A Home Assistant Container you can reach over SSH with `docker` (a Synology NAS works), a
  long-lived access token from your HA profile, saved in a file outside any repository.
- On your computer: `git`, [`uv`](https://docs.astral.sh/uv/), Docker (for the checks).
- This repository cloned, with its tags: `git clone git@github.com:zerostorypoints/domosenso.git`,
  then in it `git config core.hooksPath .githooks` (the guard that keeps pushes off `main`; changes go
  in through pull requests, see AGENTS.md "Main, tags and pull requests").
  (the command reads components only from tags such as `ramka/0.1.1`).

## The components

| component | needs | gives you |
|---|---|---|
| `ramka` | an Android wall tablet with the HA Companion app, presence (a radar or Bermuda) | the wall-tablet dashboard: clock, weather, climate, air, plants, photos, calendar, controls |
| `backup` | — | nightly backups with retention, backup sensors, an alert when backups stop |
| `remote-access` | a Cloudflare account with a domain | Home Assistant from anywhere through a Cloudflare Tunnel, no open port |
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

`init` writes `domosenso.yaml` (targets, components, local files) and a lock file. Then, for each
component you want:

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
household in the catalog (inputs carry it). A component tested in your home becomes "tested in 2 homes".
