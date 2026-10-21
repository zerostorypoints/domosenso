# SPEC-001: AI-first foundation of the framework repository

Status: approved 2026-10-21 (draft 2026-10-20).
Source: `docs/2026-10-20-domosenso-validation-notes.md` §3, `docs/research/2026-10-20-domosenso-architecture.md`
§1 (Open Mercato: AGENTS.md under 32 KB, skills per tool, spec-first, BACKWARD_COMPATIBILITY.md).
Scope: this repository only. Nothing in a home repository or the website; no push, no GitHub repository.

## Goal

A Claude Code or Codex session that opens this repository knows, from files in the repository and
nothing else, what the repository is, how a component is built, how to check its own work, what it
may do without asking and what it may not, and which names other homes depend on. Knowledge that so
far lives only in one Claude memory folder and is true for any home moves into the catalog.

## Deliverables

### 1. `AGENTS.md` and `CLAUDE.md`

- `AGENTS.md` at the root, the single instruction source. Sections: what the repository is; layout;
  component format and the three ownership layers (managed / instance / local); how to validate
  (`tools/check-all.sh`, what each step checks and what its failure means, including that
  `check_config` exits 0 on a broken automation-blueprint input and `tools/ha-check.sh` therefore
  counts the `ERROR:` lines); privacy rule; boundaries; spec-first rule; conventions (English source
  text, en/de/pl, pinned versions, tag scheme); where the skills are.
- Boundaries, as written rules: allowed without asking — anything in this repository, the checks,
  rendering into a scratch directory, a staging Home Assistant. Needs a human's go-ahead in the
  conversation — deploying to a production Home Assistant, flashing or reconfiguring a device,
  pushing to GitHub or creating a repository, touching any client's home.
- Spec-first: a new component, a new capability of the tools, a change to a schema or to anything
  in `docs/COMPATIBILITY.md` → a spec in `.ai/specs/` first, approved, then the change. A fix that
  keeps the contract goes straight to a commit.
- `CLAUDE.md` holds one import line, `@AGENTS.md`, and nothing else (as Open Mercato's root
  `CLAUDE.md`; Claude Code's memory docs recommend the import and it does not read the file twice).
- Budget: 32,768 bytes (Codex's default `project_doc_max_bytes`), measured in UTF-8 bytes.
  Target for the first version: under 16 KB, so the budget has room.

### 2. Agent check

`tools/agents_check.py` (pytest-tested like the other tools), exit 1 on any error:

- `AGENTS.md` exists and is at most 32,768 bytes; the message prints the size and the budget;
- `CLAUDE.md` exists and does not grow instructions of its own (only the import line and comments);
- every `.ai/skills/<name>/SKILL.md` has YAML front matter with `name` equal to the directory name
  (lower case, digits, hyphens, at most 64 characters) and a `description` of at most 1,024
  characters;
- every installed skill (see 3) points at its source and no installed skill is left without one.

Wired into `tools/check-all.sh` as its first step (`agents_check`). It needs only `uv`.

### 3. Skills, one source, installed per tool

- Source: `.ai/skills/<name>/SKILL.md` (Agent Skills format: front matter `name`, `description`,
  then Markdown). Shared by both tools; no tool-specific text inside.
- Install, as Open Mercato's `scripts/install-skills.mjs` does it (verified at its commit
  `4374c48`, 2026-10-16): `.agents/skills/` is the canonical directory, read natively by Codex
  (`$REPO_ROOT/.agents/skills`, `codex-rs` `host_roots.rs`) and Cursor; Claude Code reads only
  `.claude/skills/`, so it gets per-skill links. `uv run tools/install_skills.py [--agents
  claude-code,codex,cursor]` (default: all) writes relative symlinks
  `.agents/skills/<name> → ../../.ai/skills/<name>` and, for claude-code,
  `.claude/skills/<name> → ../../.agents/skills/<name>`; `--check` reports missing, wrong or stale
  links without writing (used by the agent check). Both tools follow symlinked skill directories
  (Claude Code docs "skills"; Codex docs "build-skills").
- Difference from Open Mercato: they gitignore `.agents/` and `.claude/`; here the links are
  committed, because sessions run in fresh git worktrees and an ignored link would be missing in
  each of them. `.claude/settings.local.json` and other local files stay ignored.
- Front matter: only `name` and `description` (Open Mercato's rule; the subset every tool accepts).
  `name` follows the Agent Skills specification: lower case, digits, single hyphens, at most 64
  characters, equal to the directory name; `description` at most 1,024 characters.
- Four skills, each short and calling only tools that exist:
  - `new-component` — directory, `component.yaml` from the schema, `translations/{en,de,pl}.json`
    with `meta.description`, optional `README.md`; ends when `uv run tools/catalog_check.py --strict`
    and `uv run pytest -q` pass. Reminds: a new component needs an approved spec.
  - `write-component-spec` — writes `.ai/specs/SPEC-NNN-<date>-<title>.md` from a template (goal,
    devices, integrations, inputs, provides with stability, consumes, artifacts, tests, what is out
    of scope, open questions) and stops for approval.
  - `render-and-stage` — renders a component with a home's inputs (`domosenso_render.py --stamp`),
    installs its files (`domosenso_install.py`), runs the home's `check_config`, puts it on the
    home's staging Home Assistant as that home's `AGENTS.md` describes, and compares screenshots;
    production only after the go-ahead.
  - `check` — runs `tools/check-all.sh`, reads each step's output (`fresh: N errors`, `config ok`,
    pytest and node summaries, the agent check), and reports pass/fail per step with the cause.

### 4. `docs/COMPATIBILITY.md` and `docs/UPGRADE_NOTES.md`

- The contract surface, each with a level:
  - FROZEN (changes only with a new major version and a migration): the tag scheme
    `<component>/<version>`, the `github://domosenso/domosenso/components/<id>/…@<tag>` URL form,
    component ids, `input_select.<prefix>_mode` / `_ambient` and their option values, the
    `install_path` pattern `www/domosenso/<id>/<version>/`, translation file layout
    (`translations/<lang>.json`, `en` as source and fallback).
  - STABLE (no breaking change without the deprecation protocol): manifest fields, every `provides`
    entity id and pattern marked stable, input names and types, card element names
    (`custom:<name>-card`) and their config keys, translation keys used by cards and templates,
    renderer delimiters (`[[ ]]`, `[% %]`, `[# #]`), globals (`t`, `inputs`, `lang`), the `yaml`
    filter and the CLI options of the tools, `--stamp` line format.
  - ADDITIVE-ONLY (new values may be added, none removed or renamed): manifest optional fields,
    `provides` marked additive-only (e.g. `sensor.<player>_audio_quality` values), scene fields,
    translation keys in general, check-all steps.
- The manifests' own `stability:` values stay the source for each entity; COMPATIBILITY.md states
  the rule and lists the surfaces, it does not copy every entity.
- Deprecation protocol: a breaking change to a STABLE surface keeps a bridge for one minor version
  (a template alias entity for a renamed entity, both option values accepted, an old config key read
  as the new one), is listed in the component's `UPGRADE.md` and in `docs/UPGRADE_NOTES.md`, and
  the bridge is removed in the next minor version with a note.
- `docs/UPGRADE_NOTES.md`, newest first, framework-wide, each entry linking the component's
  `UPGRADE.md`: stage 1 — Ramka 0.1.0 (English helper values, renamed entities, entity prefix as an
  input, versioned install path for the cards); bermuda-presence 0.1.0 from the pilot (tag scheme,
  instance layer). Stage 1 had no earlier release, so no bridge was kept; the note says so.

### 5. Knowledge out of the Claude memory

Read the memory folder of the author's home sessions (not edited). What is true for any home goes
into the catalog; what describes one household (addresses, MAC addresses, names, rooms, tokens,
account names, the household's decisions) stays out.

- Per component, a new `components/<id>/README.md` with a "Field notes" section, for bermuda-presence
  (proxies, IRK capture routes, coverage before calibration, wearables that do not advertise,
  recorder size of distance/RSSI sensors, LD2410 near-range limits), climate-air (Ruuvi Air over
  classic ESP32 proxies gives data format 6 only; VOC/NOx calibration; entities disabled by default),
  plants (proxy reach, thresholds need a restart), awnings (node firmware leaks the Wi-Fi passphrase
  on the serial console, discovery rejected, the wind sensor's cadence and patchy reception), media
  (hegel_streaming: Spotify Connect resume, port 50001 silent, a start is
  off → on → buffering → playing), lights (bulbs that lose power stop routing; group state after a
  wall-switch cut), ramka (Companion app screen-on behaviour, `command_webview` opening a hidden
  copy, YAML dashboards not refreshing, self-hiding cards and orphaned listeners), calendar (CalDAV
  with an app-specific password; reminders not served).
- Device notes where the fact belongs to the hardware (Atom Lite = classic ESP32 with BLE 4.2).
- `docs/home-assistant-notes.md`: lessons about a Container install that belong to no component
  (root-owned `custom_components`, registry edits only over the websocket API, discovery flows
  confirmed over REST, persistent notifications only over the websocket, templated `delay_off`).
- `docs/integration-notes.md`: gotchas for integrations the catalog has no component for yet
  (Midea AC login server, Nuki over MQTT without a bridge, Tapo camera via ONVIF while python-kasa
  lacks the ciphers, a mesh router's single admin session) — material for future components.
- Correction found on the way: `components/awnings/component.yaml` says the wind sensor transmits
  only on an event; the memory and the 2026-10-20 findings show a report about every 19.5 minutes,
  day and night. The note is corrected (a fix, no contract change).
- The privacy scan (`tests/test_catalog_content.py::test_privacy`) is extended to `.ai/`,
  `AGENTS.md` and `CLAUDE.md`, and passes.
- A short report of what moved and what stayed, in the session's final message.

## Tests

- `tests/test_agents_check.py`: over-budget file fails with the size in the message; exactly 32,768
  bytes passes; a skill whose `name` differs from its directory fails; missing description fails;
  a broken or missing installed link fails; `CLAUDE.md` with extra instructions fails; the real
  repository passes.
- The same file covers `tools/install_skills.py`: install into a temp tree creates relative links for both tools;
  `--check` on a clean tree passes and on a drifted one fails; a removed skill's stale link is
  reported.
- `tools/check-all.sh` passes end to end.

## Out of scope

- The home-repo template's `AGENTS.md` and its skills (add a device, check equivalence, promote to
  production) — they belong to the home repository and the `domosenso init` work.
- A check that enforces COMPATIBILITY.md mechanically (diffing `provides` between tags) — a later
  spec once there are two releases to compare.
- Cursor support beyond what the installer's `--agents` option makes easy to add.
