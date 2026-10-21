# Domosenso: validation of the plan — decisions and open requirements

Status: notes from a brainstorming session with the maintainer on 2026-10-20, held while the stage 1 plan
(`docs/superpowers/plans/2026-10-20-domosenso-stage1-catalog-foundation.md`, branch
`claude/domosenso-pilot-750b03`) was already running. The maintainer decided to **keep executing that plan
unchanged**; this document records what the validation found so it is applied later, not lost.
Read it before writing the plans for stage 2, stage 3 and the cut-over of the maintainer's home.

Statements marked **(Claude)** are my assessment, not the maintainer's decision.

## 1. What the maintainer said

- **Priority:** the maintainer's own home on Domosenso first, then the first outside user, then the website demo. The running
  plan keeps its own order (Ramka, i18n, scenes, demo home); the priority applies to what comes after.
- **Migration strategy:** build Domosenso in parallel; production stays untouched until Claude
  judges the home repo a 100 % equivalent of what runs today; then switch over once.
- **Downtime is acceptable:** during the switch the maintainer can live without automations; nothing in the
  home needs continuous monitoring.
- **Helper history does not matter:** renaming helpers (Polish → English option values) may break
  their history.
- **How the maintainer would notice a problem:** "the Ramka stops working". Nothing else.
- **First outside user:** a friend of the maintainer — Naim Uniti Star streamer, Tapo sensors, Synology NAS.
  **Nothing goes to the first outside user before the maintainer has tested it in his own home.** The home repo and the
  cut-over come first; the first outside user gets the framework only after that.
- **Open Mercato pattern applies to users too:** a user customises their setup and may contribute
  components back. For the first outside user: Domosenso shows the way ("the Ramka supports ambient play, connect
  your player"), the first outside user connects the Naim.
- **AI development first:** the whole project is laid out for Claude and Codex sessions working on
  it.
- **Operations log / notifications** for remote debugging: not needed by the maintainer today (he has not
  debugged remotely yet); it is for future clients.

## 2. Cut-over of the maintainer's home — requirements

Not covered by the stage 1 plan, whose Task 11 renders only the Ramka from the catalog on staging.

1. **Files only.** The switch replaces what lives in files: `packages/`, dashboards, `www/`,
   blueprints, ESPHome configs, compose services. It never replaces HA's `.storage` or the
   recorder database: integrations added through the UI, the entity and device registries, areas,
   history and statistics stay as they are. The catalog does not try to reproduce them.
2. **Rollback in minutes.** The old config directory is kept; going back = mounting it into the
   container again. The seven Atoms can be reflashed with the old firmware (`esphome/` in the old
   repo). **(Claude)** With nothing critical and a fast rollback, no period of running both configs
   side by side is needed.
3. **"100 %" is measured by a script, not judged.** Before the switch: list every entity id and
   every automation on production and on staging running the home repo; the difference must be
   empty or explained. After the switch: every automation loaded, no entity newly `unavailable`.
4. **Silent automations get checked explicitly**, because the maintainer notices only the Ramka: the ones
   that only push, log or run in the background — backups (a failure shows only at restore time),
   sensor-silence and device-offline alerts, logbook entries. The home's own list of them is in its
   repository.
5. **Scope of the home repo at cut-over = everything**, not only what the Ramka shows: every
   package above either becomes a catalog component instance or stays in the home repo's local
   layer. Nothing is left in `smarthome` only.
6. **Three layers in the home repo** (from the pilot): managed artifacts (replaced by update),
   the instance (written once from inputs, then owned by the home), local (the home's own files,
   never touched by the catalog). Home-specific automations, such as family routines, may stay
   local for good. Rule: a thing enters the catalog when it could work
   in a second home without changes.

## 3. AI development first — requirements

Not in the stage 1 plan (Task 1 creates a README, no agent files).

- **One instruction source:** `AGENTS.md` under 32 KB (Codex's `project_doc_max_bytes`) in the
  framework repo and in the home-repo template; `CLAUDE.md` only points to it.
- **Shared skills** for Claude Code and Codex: add a device, write a component spec, deploy to
  staging, check equivalence, promote to production. Installed per tool, as Open Mercato's
  `--agents claude-code|codex|cursor`.
- **Spec before code** for new components (`.ai/specs/` or `docs/superpowers/specs/`); fixes go
  straight to a PR.
- **Every check returns machine-readable pass/fail** so an agent closes its own loop without a
  human looking: manifest schema, `check_config` (plus the `ERROR:` line count — `check_config`
  exits 0 on broken automation-blueprint inputs, found in the pilot), ESPHome config/compile,
  staging screenshots compared, entity/automation diff.
- **Boundaries written in the repo:** staging is always allowed; production deploy, flashing a
  device and any client home are separate commands that need a human's go-ahead.
- **Components in separate directories** so parallel sessions do not collide (three ran at once on
  2026-10-20).
- **Knowledge leaves Claude's private memory.** Much of what is known about the home lives in
  Claude's project memory for the home (IPs, integration gotchas, decisions). Codex and the first outside user's
  sessions cannot read it. Task 10 of the stage 1 plan only copies it to a new Claude memory
  folder. Split it instead: general gotchas into the component docs (e.g. an integration's login
  quirk), facts about the maintainer's home into the home repo.

## 4. Extension points for other homes — requirements

- **The Ramka's player is a contract.** The `ramka` component declares an input "player: any
  `media_player`", and documents which features it needs (play/pause, artwork, title) and which are
  optional (source list, volume in dB, …). Hegel (`hegel_streaming`) is one provider.
- **The first outside user's path (Claude, unverified):** the Naim Uniti Star has Chromecast built-in and UPnP, so
  HA's `cast` or `dlna_dmr` integration should give a `media_player` with no code. If that is not
  enough, the first outside user writes a `naim` component and opens a PR; it enters the catalog as "tested in 1
  home". **(Claude, unverified)** Today's Ramka cards may assume Hegel-specific attributes; check
  before telling the first outside user it works.
- **Catalog coverage for the first outside user today:** Synology as host and Tapo sensors only. The first real test
  of Domosenso is whether the catalog absorbs a device it does not have yet.

## 5. Operations log — for later

- **Now (costs nothing):** every component deployment leaves a trace in the home repo — component,
  version, date, what changed. Git history plus the lock file give most of it.
- **Later, with remote access for clients** (its own project, see the session started from the
  pilot on remote access): a component that collects automation errors (`system_log`), entities
  going `unavailable`, notifications sent and deployments in one place readable remotely. HA keeps
  only a few traces per automation by default; today the home writes logbook lines in a few places
  (the lock, the player, the Ramka) and nothing collects them.

## 6. Considered and not adopted (2026-10-20)

- **Trimming i18n to en + pl and reordering stage 1 around the maintainer's home.** the maintainer chose to keep the
  running plan (full en/de/pl, Ramka first, demo home). Revisit if stage 1 runs long.
