# Domosenso on the Open Mercato pattern — research

Status: research only, nothing built. 2026-10-20.

Goal: domosenso.org as an open-source catalog that lets someone build their own home system from the components tested in this repo ("I have a Synology NAS and these devices" → hardware to buy + matching components → install). domosenso.com / domosenso.ch as the paid offer: design, installation, maintenance.

Sources were fetched by a deep-research run (5 angles, 22 sources, 3-vote adversarial check per claim) plus manual checks of hacs.xyz and home-assistant.io/installation. Sections marked **inference** are my design reasoning, not sourced fact.

## 1. How Open Mercato is built (verified)

| Aspect | What they do |
|---|---|
| Stack | TypeScript, Next.js App Router, PostgreSQL 17 + pgvector, MikroORM, zod, Awilix DI, Redis, Meilisearch, an MCP server. Yarn 4 workspaces + Turborepo, Node 24. Version 0.9.0. |
| Repo | Monorepo `apps/` + ~41 `@open-mercato/*` packages (`core`, `cli`, `ui`, `events`, `search`, `ai-assistant`, `enterprise`, …) + `starters/` + `.ai/`. Only core contributors clone it. |
| Start | `npx create-mercato-app my-app [--preset classic\|empty\|crm\|wms] [--agents claude-code\|codex\|cursor]`. Core is a versioned npm dependency: "install, never fork". |
| Module contract | `src/modules/<id>` holds pages, API, CLI commands, i18n, entities; auto-discovered. No ORM relations between modules (FK-id + separate fetch). Extending other modules only through declared extension points (UMES: widget spots, event subscribers, API interceptors, response enrichers, component overrides, DI overrides). Editing core is forbidden. |
| Eject | A module flagged `ejectable: true` can be copied into the app (`yarn mercato eject`) and maintained by the user from then on. |
| Compatibility | `BACKWARD_COMPATIBILITY.md` lists 14 contract surfaces (auto-discovery files, event IDs, widget spot IDs, API routes, DB schema, DI keys, CLI commands, AI tool IDs, …), each FROZEN / STABLE / ADDITIVE-ONLY. A breaking change needs a bridge for at least one minor version plus an `UPGRADE_NOTES.md` entry, or the merge is blocked. |
| Module distribution | Was: npm packages + `mercato module add`. The separate `official-modules` repo is now **deprecated**; modules are moving into the core monorepo as opt-in (forms moved 2026-10-07). |
| AI agents | Every generated app ships `AGENTS.md`, `CLAUDE.md`, `.ai/` skills for Claude Code / Codex / Cursor. Spec-first: `.ai/specs/SPEC-NNN-date-title.md` → approve → implement. Spec required for new capabilities, schema, API contracts; bugfixes go straight to code. `AGENTS.md` kept under 32 KB (Codex limit), enforced by a script. |
| License | Core MIT. `@open-mercato/enterprise` is commercial (Open Mercato sp. z o.o.): evaluation only without a licence, per-project licence with revenue tiers and phone-home on-prem. |
| Money | Enterprise licence sold through certified software houses (4 partner tiers), community vs SLA support, Open Mercato Cloud (browser sandboxes with coding agents preinstalled; Developer $95/seat/month, Enterprise $1400/month incl. production hosting). |
| Catch The Tornado | Appears only as "Supported by" in the README and site footer. Ownership link to Open Mercato sp. z o.o. not established. |

Takeaways that transfer: scaffolder + versioned core instead of forks; a written contract surface with a deprecation protocol; agent files and spec-first workflow shipped inside every generated project; one monorepo with opt-in modules rather than a separate registry (they tried the registry and backed out); open code, money from licence + partners + hosting.

## 2. Home Assistant ecosystem facts that constrain the design

Extracted from primary sources with verbatim quotes; not all went through the 3-vote check (budget), the ones marked ✔ I re-checked by hand.

- ✔ **No add-ons on Container installs.** home-assistant.io/installation: "Home Assistant Container installations don't have access to apps" (add-ons are now called apps). Every service a component needs (Mosquitto, Zigbee2MQTT, cloudflared, MCP servers) has to ship as a Docker/compose service, not an add-on.
- ✔ **HACS becomes core.** hacs.xyz: "HACS is built into Home Assistant as the Marketplace, starting with 2026.11." HACS distributes only public GitHub repos with a `hacs.json`; versions come from GitHub *releases* (tags alone are not enough). Categories: integrations, dashboard plugins, AppDaemon, python_scripts, templates, themes — **not YAML packages, not blueprints**.
- **Blueprints** import by URL from GitHub, gists or the forum; stored as YAML under `blueprints/automation/`. "Take control" converts an automation to plain YAML irreversibly and ends upstream updates.
- **ESPHome remote packages**: `packages:` can pull from Git with `url`/`ref`/`files`; remote packages cannot use `!secret`, so Wi-Fi/API keys stay in the user's file. The `project:` block (name + version) is required for Dashboard adoption. The claim about `dashboard_import.package_import_url` as a distribution path was **refuted 0-3** — verify before relying on it.
- **CI**: `hass --script check_config -c <dir> --json --fail-on-warnings` validates a config repo without a running instance. `frenck/action-home-assistant` wraps it (matrix against stable/beta/dev, honours `.HA_VERSION`, fake secrets file) but its maintenance badge says 2023.
- **Brand.** Home Assistant and ESPHome marks belong to the Open Home Foundation (Swiss non-profit); a HOME ASSISTANT US application (79432098) is pending. Commercial partners (Nabu Casa, Apollo Automation) license the brand under binding profit-sharing agreements. *Works with Home Assistant* is for device manufacturers (500 CHF/year per partner, local control required, UI-configured integrations, partner maintains non-standard integrations), so it is no route for an integrator. **I found no published OHF policy on how an installer may use the name** — open question, ask OHF.
- **openHAB's trademark policy** (prior art for protecting a home-automation brand): no mark in company, product, service or domain names, no implied endorsement, the project namespace reserved for project code.
- **Selora Homes** is the closest prior art for domosenso.com: a managed HA platform for professional installers; free part (Selora AI via HACS) + paid Hub subscription (~$325 hub); partner tracks where the installer keeps its brand and gets a recurring share, or Selora sells and routes jobs to local installers.
- **Trademark vs open code.** Open licences don't grant trademark rights (Apache-2.0 §6 says so explicitly); Red Hat-style pure-open businesses rely on the mark; Elastic vs AWS settled with AWS reducing use of the name. Licensing a mark without quality control weakens it — relevant to any certified-installer program.

## 3. Proposed design (inference)

### 3.1 Two repos, mirroring create-mercato-app

- **`domosenso/domosenso`** — one monorepo: CLI, component catalog, docs, site for domosenso.org. Components are opt-in directories, not separate repos (Open Mercato's lesson). Exception: HA custom integrations (Hegel) stay in their own repos because HACS requires one repo per integration; the catalog references them.
- **User's home repo**, generated by `npx create-domosenso` / `domosenso init --host synology`:

```
home/
  domosenso.lock            # component@version, pinned HA version
  compose.yaml              # HA, Mosquitto, staging, cloudflared… from component fragments
  ha/configuration.yaml     # packages: !include_dir_named packages
  ha/packages/<component>/  # managed by the CLI, never hand-edited
  ha/local/                 # the user's own packages and overrides
  esphome/<device>.yaml     # thin: substitutions + remote package @tag + secrets
  dashboards/
  AGENTS.md  CLAUDE.md  .ai/skills/  .ai/specs/
  .github/workflows/check.yaml
```

`domosenso add bermuda-presence`, `domosenso update`, `domosenso eject <component>` (copy into `ha/local/`, stop tracking) — same semantics as Mercato.

### 3.2 Component manifest

```yaml
id: bermuda-presence
version: 1.2.0
summary: Room-level presence from BLE beacons and phones
devices:                         # what the user already has, or must buy
  requires:
    - kind: ble-proxy
      recommend: [m5stack-atom-lite]
      count: "1 per room"
  supports: [iphone, apple-watch, ble-beacon]
host:
  installs: [container, haos]    # container = no apps, services via compose
integrations:
  - {name: bermuda, source: hacs}
  - {name: esphome, source: core}
artifacts:
  esphome: esphome/ble-proxy.yaml        # remote package, project: domosenso.ble-proxy
  ha_packages: [packages/presence.yaml]
  blueprints: []
  dashboard_cards: [cards/presence-room.yaml]
  services: []                           # compose fragments
provides:                        # contract surface — FROZEN/STABLE/ADDITIVE-ONLY
  entities:
    - {id: "sensor.<person>_room", stability: stable}
  events: []
consumes: []
tested:
  ha: ["2026.10"]
  homes: 1
local_only: true
```

The equivalent of "no ORM relations between modules": a package never references another component's entities unless the manifest declares it under `consumes`, and that component lists the entity under `provides`. Example: Ramka consumes `bermuda-presence` room sensors and the radar presence entity. Renaming an entity in `provides` follows the Mercato deprecation protocol: keep a template alias for one minor version, write an upgrade note.

### 3.3 Hardware recommendation

Start as data, not AI: manifests already say what each component requires and recommends. The engine is a filter: host type × devices owned × wanted features (presence, blinds, audio, plants) → missing hardware (Atom Lite, CC1101, Ruuvi, Shelly) → component set and a shopping list. Keep `local_only` and "tested in N homes" visible; Works with HA's local-control rule is a reasonable admission criterion. The agent sits on top of this data to hold the conversation, it does not invent the matrix.

### 3.4 Distribution per artifact type

| Artifact | Channel |
|---|---|
| Custom integration (Hegel) | HACS / HA Marketplace from 2026.11, GitHub releases |
| Dashboard plugins / custom cards | HACS |
| Blueprints | GitHub import URL; the CLI can also drop them into `blueprints/` |
| YAML packages, dashboard YAML | Domosenso CLI (vendored with a lock file) — no ecosystem channel exists |
| ESPHome firmware | remote packages `github://domosenso/domosenso/components/…@vX`, `project:` block |
| Services (Mosquitto, cloudflared, staging, MCP servers, agents) | compose fragments, images on GHCR |

### 3.5 Testing

Per component in the catalog repo: `check_config` against pinned stable + beta in CI, with fake secrets; for components with dashboards, the existing `staging.py shoot` approach (render at the real tablet resolution). In the user's repo: same check on every PR, then deploy to staging, then prod — the procedure this repo already follows, packaged as skills.

### 3.6 Agent layer

`AGENTS.md` under 32 KB in every generated home repo, plus skills: `add-device`, `recommend-hardware`, `write-component-spec`, `deploy-staging`, `promote-prod`, `diagnose`. Spec-first only for new components; config changes go straight to a PR. Most of the content exists already in this repo's READMEs and memory notes (deploy procedure, staging, Ramka, Atom flashing).

### 3.7 .org vs .com / .ch

- **.org**: catalog + CLI under **Apache-2.0** (explicit patent grant and trademark carve-out; MIT would also work). Everything a DIY user needs is open.
- **.com / .ch**: design, installation, maintenance, remote monitoring of many homes. The only closed piece worth having is the installer side — fleet monitoring, remote updates across homes, backups — the analogue of `@open-mercato/enterprise` or the Selora Hub subscription. Not the home components.
- **Brand is the moat**: register "Domosenso" (Swiss IGE for .ch, EUIPO for the EU) before .org goes public; write a trademark policy modelled on openHAB's (no use in company/domain/product names, no implied endorsement, `domosenso.*` component namespace reserved). A certified-installer program, if it comes, needs real quality control or it weakens the mark.
- **Home Assistant name**: describe the product factually ("runs on Home Assistant"), no HA logo, no wording that suggests endorsement, nothing like "Domosenso Home Assistant". Confirm with the Open Home Foundation before commercial launch.

## 4. Open questions

1. OHF's rules for installers using the "Home Assistant" name in marketing — no public policy found.
2. Does HA 2026.11 Marketplace change anything for packages/blueprints, or only absorb HACS's existing categories? Check the release notes in early November.
3. ESPHome `dashboard_import` as a one-click adoption path — refuted in research, needs a hands-on test with an Atom Lite.
4. Selora's partner economics (revenue share) — disclosed only on a call; relevant if domosenso.com ever routes jobs to other installers.
5. Catch The Tornado ↔ Open Mercato sp. z o.o. ownership — not established.

## 5. A first concrete step

Pilot the manifest on one component that spans every artifact type: `bermuda-presence` (ESPHome remote package for the Atom Lite, HACS integration, HA package, dashboard card) — extract it from this repo into the catalog layout, generate a fresh home repo with it, and run it against `ha-staging`.

## Sources

- https://github.com/open-mercato/open-mercato and its AGENTS.md, BACKWARD_COMPATIBILITY.md
- https://github.com/open-mercato/official-modules
- https://www.openmercato.com, https://www.openmercato.com/partners, https://openmercatocloud.com
- https://hacs.xyz/docs/publish/start
- https://www.home-assistant.io/installation/
- https://www.home-assistant.io/docs/automation/using_blueprints/
- https://esphome.io/guides/creators/, https://esphome.io/components/packages/
- https://home-assistant.io/docs/tools/check_config, https://github.com/frenck/action-home-assistant
- https://works-with.home-assistant.io/resources/wwha-compliance-guide/
- https://apolloautomation.com/blogs/news/who-owns-home-assistant-the-open-home-foundation-nabu-casa-and-apollo-automation-explained
- https://gleanmark.com/trademark/uspto-79432098
- https://selorahomes.com/docs/installer/partner-program/
- https://www.openhab.org/about/trademark.html
- https://opensource.google.com/docs/casebook/trademarks, https://writing.kemitchell.com/2022/07/27/Trademark-Undefined
