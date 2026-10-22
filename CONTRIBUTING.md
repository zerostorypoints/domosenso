# Contributing to Domosenso

For people and agents who change Domosenso itself: the catalog, the `domosenso` command, the skills
and the documents. If you want to run your own home on it, start with the [README](README.md).
Agents: [AGENTS.md](AGENTS.md) is the full rule set; this page is the map.

## Your first contribution

The usual first one is a device the catalog does not know yet, such as a network player for the
Ramka: [docs/integrate-a-device.md](docs/integrate-a-device.md) walks through it, with the Hegel
integration as the worked example (skill `new-integration`).

## How changes land

- **A pull request from your fork.** Fork the repository (`gh repo fork zerostorypoints/domosenso
  --clone` also sets the `upstream` remote), make one branch per change
  (`feat/…`, `fix/…`, `docs/…`), keep it current with `git pull --rebase upstream main`, and open a
  pull request into `main`. Maintainers review and merge; nothing reaches `main` any other way, and
  published tags never move.
- **Spec first** for a new component, a new capability of the command, a schema change or anything in
  [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md): a spec in `.ai/specs/` (skill `write-component-spec`),
  approved, then built. A fix that keeps the contract goes straight to a pull request with a test.
- **A plan with several pull requests** has a coordinator session and a feature branch (AGENTS.md,
  "Plans that span several pull requests").
- **Privacy.** Nothing from a real home: no real names, rooms, entity ids, addresses, photos or floor
  plans; examples use the demo home (Alex and Sam). `tests/test_catalog_content.py::test_privacy`
  checks it. The one exception is the maintainer's own Ramka photos in `.github/readme/`.
- `tools/check-all.sh` is green before a pull request.

## Layout

```
AGENTS.md, CLAUDE.md    instructions for coding agents (CLAUDE.md only imports AGENTS.md)
.ai/skills/, .ai/specs/ agent skills (linked into .agents/skills/ and .claude/skills/) and specs
components/<id>/        the catalog: manifest (component.yaml), esphome/, ha/, cards/, translations/,
                        README.md (field notes)
devices/<id>.yaml       the hardware the components name: names, description and what it does (en, de, pl),
                        and how Home Assistant shows it (match rules)
kinds/<kind>.yaml       how Home Assistant shows a kind of hardware (match rules for `recommend --from-ha`)
scenes/<id>.yaml        the demo's eight scenes: time, entity states and attributes, what the tablet shows,
                        who takes part (format and rules: scenes/README.md)
examples/demo-home/     a fictional home (Alex and Sam) as an instance of the catalog: inputs, states, generated media
tools/                  checks that run a component against ESPHome and Home Assistant
docs/                   framework design: research, the pilot write-up, specs and plans
```

Nothing from a real household belongs here: no real names, rooms, entity ids, addresses, photos,
calendars or floor plans. A real home lives in its own repository.

## Components

| Component | What it does |
|---|---|
| [awnings](components/awnings/component.yaml) | Somfy RTS awnings through an ESPSomfy-RTS radio node, with the awnings' wind sensor |
| [backup](components/backup/component.yaml) | Nightly backups with rolling retention, backup sensors and a stale alert |
| [remote-access](components/remote-access/component.yaml) | Home Assistant from anywhere through a Cloudflare Tunnel: no open port, a country allow-list |
| [bermuda-presence](components/bermuda-presence/component.yaml) | Room-level presence of phones and tablets from BLE proxies and Bermuda |
| [calendar](components/calendar/component.yaml) | Calendar events from a CalDAV server |
| [climate-air](components/climate-air/component.yaml) | Room temperature and humidity (Tapo), air quality (Ruuvi Air) |
| [lights](components/lights/component.yaml) | Philips Hue lights per room |
| [media](components/media/component.yaml) | A network audio player as a media player (tested: Hegel H400) |
| [plants](components/plants/component.yaml) | Houseplant sensors (Xiaomi Mi Flora) |
| [ramka](components/ramka/component.yaml) | Wall tablet: radar wake-up, ambient pages, music, awnings, lights, calendar ([upgrade notes](components/ramka/UPGRADE.md)) |
| [weather](components/weather/component.yaml) | Weather and forecast from Met.no |

## Agent skills

One source in `.ai/skills/<name>/SKILL.md`, linked for Claude Code (`.claude/skills/`) and Codex and
Cursor (`.agents/skills/`) by `uv run tools/install_skills.py`.

| skill | use it to |
|---|---|
| [onboard-home](.ai/skills/onboard-home/SKILL.md) | start a new home: interview, recommend components, `domosenso init`, add `backup`, stop at `deploy production --plan` |
| [check](.ai/skills/check/SKILL.md) | run `tools/check-all.sh` and report pass or fail per step |
| [new-component](.ai/skills/new-component/SKILL.md) | scaffold `components/<id>/` and get the checker and tests passing |
| [new-integration](.ai/skills/new-integration/SKILL.md) | bring a device the catalog lacks: find or write its integration, add it to the catalog in a PR |
| [write-component-spec](.ai/skills/write-component-spec/SKILL.md) | write a spec in `.ai/specs/` and stop for approval |
| [render-and-stage](.ai/skills/render-and-stage/SKILL.md) | render a component into a home repository, install it, check it, try it on staging |

## Checks

They need Docker or `uv` and flash nothing. Run from the repository root.

```bash
tools/check-all.sh                           # all of the below: agents_check, pytest, npm test,
                                             # catalog_check, ha-check and esphome-check for every component
uv run tools/agents_check.py                 # AGENTS.md within 32,768 bytes, CLAUDE.md, skills and their links
uv run tools/install_skills.py               # links .ai/skills/ for claude-code, codex and cursor
tools/esphome-check.sh bermuda-presence      # config of the demo-home device files using it, and the factory image
tools/esphome-check.sh bermuda-presence compile ble-proxy-dining.yaml   # also compile
tools/ha-check.sh bermuda-presence           # check_config on a fresh home; needs docker
uv run tools/catalog_check.py --strict       # manifests, translations, devices, scenes
uv run tools/make_demo_media.py              # rewrites examples/demo-home/media/ (generated images)
tools/ha-check.sh ramka                      # renders examples/demo-home/inputs/ramka.yaml first
uv run tools/domosenso_render.py components/ramka --inputs examples/demo-home/inputs/ramka.yaml --out <dir> [--stamp]
uv run tools/domosenso_install.py components/ramka --config <config dir>   # cards, shell scripts, theme
```

`--stamp` makes the first line of every rendered file
`# Rendered by Domosenso from <component>@<commit> — do not edit`. A component's cards install
under `www/domosenso/<id>/<version>/` (`artifacts.install_path`), so a new version gets new
`/local/` URLs and the browser's 31-day cache cannot mix versions.

`tools/esphome-check.sh` builds a throwaway git remote from the working tree, tagged
`<component>/<version>`, and rewrites the demo home's `github://` packages to it; `tools/ha-check.sh`
loads the component's blueprints and the demo-home instance into a minimal Home Assistant
configuration and runs `check_config` in the `homeassistant/home-assistant:2026.9.2` image.

Dependencies: `uv sync` (Python: jinja2, pyyaml and jsonschema for the tools, pytest and pillow
for development) and `npm install` (happy-dom, for `npm test`; node 22 or newer).

## Documents

- [AGENTS.md](AGENTS.md): how to work in this repository, for people and agents
- [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md): the contract surface and the deprecation protocol;
  [docs/UPGRADE_NOTES.md](docs/UPGRADE_NOTES.md): what changed for homes
- [docs/home-assistant-notes.md](docs/home-assistant-notes.md), [docs/integration-notes.md](docs/integration-notes.md): field notes
- [.ai/specs/](.ai/specs/): specs, SPEC-NNN-<date>-<title>.md

- [docs/research/2026-10-20-domosenso-architecture.md](docs/research/2026-10-20-domosenso-architecture.md)
- [docs/pilot-bermuda-presence.md](docs/pilot-bermuda-presence.md): the catalog format tried on one component
- [docs/2026-10-20-domosenso-demo-staging-i18n-design.md](docs/2026-10-20-domosenso-demo-staging-i18n-design.md): design for the demo, staging and translations
- [docs/2026-10-20-domosenso-stage1-catalog-foundation.md](docs/2026-10-20-domosenso-stage1-catalog-foundation.md): the stage 1 plan

## License and contributions

Original DomoSenso code and documentation are licensed under [Apache-2.0](LICENSE),
with copyright 2026 ZeroStoryPoints GmbH. Unless you explicitly state otherwise,
contributions intentionally submitted for inclusion are provided under the same
license, as described in section 5. Only submit material you have the right to
contribute and preserve third-party license and attribution notices.

The code license does not grant rights to use DomoSenso or ZeroStoryPoints trade
names or trademarks for your own branding. See [NOTICE](NOTICE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
