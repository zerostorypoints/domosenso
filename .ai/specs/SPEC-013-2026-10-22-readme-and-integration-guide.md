# SPEC-013: README for people, and a guide for integrating your own device

Status: implemented 2026-10-22 (f656eef, a24cd68, 0bd31b7, 0c19985, e1081cd, e694a73, review fixes d6850e4); approved by the maintainer 2026-10-22 (after the builder check); plan: docs/2026-10-22-readme-and-integration-guide-plan.md. Written from a brainstorm with the maintainer in the coordinator
session. Statements marked **(my call)** were decided while writing, not by the maintainer.

## 1. Intent

Today's README is written for someone already working inside the repository: layout, skills,
checks. The first person who opens Domosenso on GitHub is someone else (maintainer, 2026-10-22): a
person with a Synology or other NAS at home who wants to set up Home Assistant with Claude. The
README must get that person from "what is this" to a running first step in about ten minutes,
the way Open Mercato's README does for a developer.

The second audience is a contributor who wants to extend the framework. The first concrete case is
the first outside user's Naim Uniti Star: he needs to see how a device that Domosenso does not know
yet gets into Home Assistant and then into the catalog. The Hegel integration, which lives in its own
repository, is the worked example of how that is done (maintainer: "rather the way of doing it").

## 2. Audiences

| reader | arrives with | leaves with |
|---|---|---|
| a home owner with a NAS and Home Assistant | a NAS, some smart devices, Claude Code or Codex | the repository cloned, `/onboard-home` started: scan, recommendations, a first component planned |
| a home owner with a NAS, no Home Assistant yet | a NAS | either the guided install (SPEC-011 §1.1) or the steps for their NAS, then as above |
| someone who wants it done for them | interest, no time | a pointer to domosenso.com / domosenso.ch **(my call: one line, no sales copy)** |
| a contributor with a device the catalog lacks | a device, some Python | the integration guide: check what HA already has, then HACS, then write one, then add the device to the catalog |
| an AI agent | a request | a short note for agents at the top, then AGENTS.md (as Open Mercato does) |

## 3. Goals, non-goals, anti-goals

Goals
- README rewritten for people, in the shape of Open Mercato's: one sentence on what it is and for whom,
  one prompt to paste into Claude Code or Codex, a picture of a working result, a "you are → start
  with" table, stages (Minute 10, Hour 1, Day 1, Month 1) with **You decide / Run / Done when**.
- Prerequisites stated before the first step: a NAS or Docker host with Home Assistant (or the way to
  get it), SSH access to it, and the tools on the person's computer, with install commands per
  operating system.
- A guide `docs/integrate-a-device.md` for contributors, with Hegel as the worked example and the
  Naim Uniti Star as the example task.
- A skill `new-integration` that takes an agent through that guide.
- Onboarding offers to publish the home repository as a private GitHub repository (§5.5).
- The repository-internal material (layout, checks, skills table, documents) moves out of the README
  to `CONTRIBUTING.md`, linked from the README.

Non-goals
- A photos component. It was considered as a first contributor example (a slideshow as its own HA
  dashboard tab that the Ramka consumes) and deferred by the maintainer.
- Domosenso installing custom integrations. HACS stays the way to install them (maintainer,
  2026-10-22); Domosenso names the integration, its repository and the tested version, and checks
  that it is present.
- Moving Hegel into the catalog repository or onto the Ramka differently than today.
- Translations of the README; it is English like the rest of the repository.

Anti-goals — it fails even if it technically works when:
- a reader with a NAS cannot tell within the first screen whether this is for them and what to do
  first;
- anything from a real home appears in the README or the guide beyond what the maintainer chose to
  show: no real names, addresses or entity ids (AGENTS.md privacy rule). The one exception is §5.1's
  pictures, which the maintainer chose (2026-10-22): photos of his own wall tablet, cropped to the
  tablet and its sideboard, every metadata field removed (the originals carried the flat's GPS
  position);
- the README promises what is not on `main` (e.g. the guided HA install) without saying it is coming;
- a contributor writes a Naim integration from scratch when one already exists in HACS.

## 4. Constraints and current state

- Repository text is English. Household data stays out (privacy test in `tests/`).
- `main` changes only through pull requests (AGENTS.md "Main, tags and pull requests"); the
  organisation's GitHub plan has no branch protection, so the rule and `.githooks/pre-push` hold it.
- On `main` today: the `domosenso` command incl. `recommend --from-ha`, seven components, the
  `onboard-home` skill (SPEC-009, SPEC-010), `docs/getting-started.md`. On local branches, not merged:
  SPEC-011 (onboard-home v2: `discover`, `probe`, ramka 0.2.0, the HA install path) and the SPEC-012
  draft (remote access). The README describes what is on `main`; anything from SPEC-011/012 is
  marked "coming" until it is merged **(my call)**.
- Open Mercato's README (read 2026-10-22, github.com/open-mercato/open-mercato) is the model: centred
  title and one-line claim, a `npx` command, "No terminal?" and "Prefer to delegate?" lines with a
  prompt to paste, a note for AI coding agents, a navigation line, a tour GIF of a fictional business
  (Kaldi & Co.), "What is …" bullets, a "You are / Start with / Then" table, stages with You decide /
  Run / Done when and timings from a real run, and contributor material behind a link.
- Hegel today: `zerostorypoints/hegel-home-assistant`, public; `custom_components/hegel_streaming`
  (config flow with discovery, a coordinator on the amp's event stream, `media_player` and sensors,
  diagnostics, translations en/pl, brand), `hacs.json`, tests, CI (`validate.yml`: HACS and hassfest;
  `tests.yml`), releases (0.1.7, 2026-10-15). Installed through HACS as a custom repository or by
  hand; the maintainer's home has it by hand (`git archive <tag>`, extract, restart). In the catalog:
  device `devices/hegel-h400.yaml` with match rules; component `media` lists the integration
  (`source: hacs`, repo, `tested: "0.1.7"`) and the device under `recommend`.
- Naim (checked 2026-10-22, not in HACS's default list): `jorourke/naim-atom-home-assistant`
  (domain `naim_media_player`, built for the Naim Atom, HACS custom repository, tests, updated
  2026-09-04); also `peteS-UK/naim_streamer` (older streamers over UPnP) and `blitzkopf/naim_muso`
  (Mu-so). **(inference, not tried)** The Uniti Star shares the Uniti platform and local API with the
  Atom, so `naim_media_player` is the first thing to try.

## 5. Design

### 5.1 README

Top of the page, in this order:

1. Title and one-line claim: your home on Home Assistant, built with Claude or Codex from parts that
   already run in a real home.
2. Two or three sentences for the NAS owner: scan, fitting components, what is missing, installs and
   checks; the agent types, you approve every change.
3. The pictures (maintainer, 2026-10-22): two photos of the maintainer's Ramka in
   `.github/readme/` — `ramka-air.jpg` (the air page by day) and `ramka-now-playing.jpg` (now playing at
   night, on the sideboard next to the speaker, with the radar board visible) — cropped, EXIF/GPS
   stripped. The caption says what each page is; the photos stay in Polish, as the tablet runs.
4. **Prerequisites** (maintainer):
   - *Home Assistant on your NAS.* Have it → go on. Don't have it → the guided install (SPEC-011 §1.1,
     "coming" until merged) or the steps for a mainstream NAS: Synology Container Manager (tested),
     other Docker hosts (QNAP, Unraid, a mini PC with Docker: same path, not tested). HAOS: not
     covered.
   - *SSH access* to that host, key-based, and `docker` usable there.
   - *A console and a few tools* on your computer: git, gh, uv, an SSH client, Claude Code or Codex.
     One table with the install commands per system: macOS (Homebrew), Linux (the distribution's
     package manager plus the official installers for uv and Claude Code), Windows (WSL2, then as
     Linux). **(my call: WSL2 for Windows, as Open Mercato does; nothing tested on Windows yet — say
     so.)**
5. **Start in 10 minutes**: the prompt to paste into Claude Code (clone with tags, enable the guard,
   run `/onboard-home`, stop before any change to Home Assistant), the Codex variant.
6. The note for AI agents (one paragraph, like Open Mercato's): clone the catalog with its tags and
   enable `.githooks`, run `onboard-home` from that clone, create the home with `domosenso init` in a
   separate folder, never change the catalog itself except on a branch with a pull request, stop at
   every question. **(my call, from the builder check)** Unlike Open Mercato, Domosenso is not a
   package yet: every command runs as `uv run --project <catalog clone> domosenso …` and the skill is
   read from the clone, so a home owner does clone it; "don't clone" would need CLI packaging first.
7. The "You are → Start with" table from §2.
8. **What's in the box**: the components in one line each, each with "tested in N homes".
9. **Stages**, each with You decide / Run / Done when:
   - Minute 10: scan (`recommend --from-ha`), recommendations, missing hardware.
   - Hour 1: `backup` live: `deploy --plan`, `--apply` with the owner's yes, `verify`.
   - Day 1: the Ramka (needs a tablet and a radar): device, inputs, first deploy.
   - Month 1: updates from tags (`update`), more components, your own device (link to the guide).
   **(my call)** Timings come from a real run (the first outside user's onboarding), not invented;
   until then the stages carry no timings.
10. Links: CONTRIBUTING.md, docs/getting-started.md, docs/integrate-a-device.md, AGENTS.md.

`docs/getting-started.md` stays as the longer version of stages 1–2; the README links to it instead of
repeating it **(my call)**.

### 5.2 CONTRIBUTING.md

The current README's repository material: layout, components table with links, the skills table,
checks and their commands, documents, the rule that `main` changes only through pull requests, the
`.githooks` guard, spec first, privacy. Plus a short "your first contribution" section that points to
the integration guide.

### 5.3 `docs/integrate-a-device.md`

For a device the catalog does not know. Four steps, each with Done when:

1. **What Home Assistant already has.** Run `domosenso discover` (SPEC-011; until merged:
   `recommend --from-ha` plus HA's "Discovered" list) and look for a built-in integration (for an audio
   player: Google Cast, DLNA, Spotify Connect…). If one gives a `media_player` that meets what the
   component needs, stop here and go to step 4.
2. **HACS.** Search the HACS list and GitHub for an existing integration. Read its README, tests and
   last update. Install it through HACS (Domosenso does not install integrations). Naim example:
   `naim_media_player` from `jorourke/naim-atom-home-assistant`.
3. **Write one**, only if nothing fits. Hegel as the worked example, file by file: the repository layout
   (`custom_components/<domain>/`, `hacs.json`, tests, CI), `manifest.json`, the config flow and
   discovery, the API client, the coordinator (push versus poll, how Hegel subscribes to the amp's
   event stream), entities (`media_player`, sensors), "off" versus "not responding", options,
   translations, diagnostics, tests with a fake device, CI (HACS action, hassfest), releases with tags.
   Publish it as its own public repository, installable through HACS.
4. **Bring the device into the catalog**: a `devices/<id>.yaml` with names, description and `match`
   rules (integration domain, manufacturer, model) so `recommend --from-ha` finds it; the component
   that uses it (for a player: `media`) gets the device under `recommend` and the integration under
   `integrations` with `source: hacs`, `repo` and `tested`; what the Ramka shows for players that lack
   Hegel's extra sensors (they are optional). **(my call, from the builder check)** `integrations` is a
   flat list read as "all of these", so a second player integration next to `hegel_streaming` would
   read as needing both. The guide says so plainly: an alternative integration for an existing
   component is a contract change — spec first (`write-component-spec`), e.g. integrations tied to a
   device or a `one_of` group — done in the contributor's PR with its own spec, not in this work. Spec first if the component's contract changes
   (`write-component-spec`), `tools/check-all.sh` green, a PR into `main`. The device is "tested in
   1 home" — the contributor's.

The Naim Uniti Star runs through the whole guide as the example task, ending at step 4 with the
first outside user's home as the tested home. **(my call, from the builder check; it follows the
brainstorm's proposal that the first outside user adds the Naim himself as his first contribution)**
This work adds no Naim device or catalog entry: the guide shows the Naim steps marked "not tried yet"
where nobody has seen the real values (HA's manufacturer, model and domain strings for a Uniti Star,
the install from HACS), and the first outside user fills them in with his PR.

### 5.4 Skill `new-integration`

`.ai/skills/new-integration/SKILL.md`, installed for Claude Code and Codex by
`tools/install_skills.py`. It walks an agent through §5.3 in order and stops at the decisions: which
integration to use, whether to write one, the device's match rules, the PR. It reads the person's Home
Assistant read-only and never installs or configures an integration in it (HACS and the UI are the
person's). It writes nothing household-specific into the catalog. The skills table in CONTRIBUTING.md
and AGENTS.md lists it.

### 5.5 The home repository on a private GitHub repository

The home repository holds the whole configuration of a house; today it lives only on the owner's
computer. The `onboard-home` skill offers, right after `domosenso init` (its step 6, before the first
component), to publish it as a **private** GitHub repository, as Open Mercato offers for a new app:

- Ask: GitHub, private? **yes** · later · no. Only on a typed yes (pushing is a write outside the
  machine): `gh auth status` first (if not logged in, the owner runs `gh auth login`), then
  `gh repo create <owner>/<home name> --private --source <home> --remote origin --push`. Never public:
  the repository names rooms, devices and entity ids. If the owner wants a public one, stop and ask.
- Before the first push, check that nothing secret is tracked: the home template's `.gitignore`
  covers `secrets.yaml`, token files, `.domosenso/` (backups, snapshots) and staging data; the skill
  runs `git status --ignored` and `git ls-files` and refuses to push if a token, `secrets.yaml`, a
  `.storage` file or a snapshot is tracked. **(my call)** If the template's `.gitignore` lacks any of
  these, this work adds it.
- After that, every later change is committed in the home repository and pushed to its own branch
  with a pull request, as the home's `AGENTS.md` says; the owner merges.
- `docs/getting-started.md` and the README's Minute 10 stage list it: **Done when** "the home
  repository is on GitHub as a private repository (if you chose it): `git remote -v` shows `origin`".
- Not without the owner: creating the repository, the first push, any later push.

This changes the `onboard-home` skill (SPEC-011's v2 text once merged) and the home template; it is
part of this work.

## 6. Decided by the maintainer (2026-10-22)

- The README is written for a public repository (the reader is a stranger who finds it on GitHub);
  until the repository goes public, one line says it is private and access is by invitation, and the
  clone command works for invited collaborators.
- The README's pictures are photos of his own Ramka (two views he supplied), processed: cropped,
  metadata removed. AGENTS.md's privacy rule gets this one exception, for `.github/readme/`.

- The first reader is a person with a Synology/NAS at home who wants to start configuring Home
  Assistant with Claude.
- Both audiences: home owners and contributors who extend the framework.
- Prerequisites in the README: Home Assistant on the NAS (guided, or steps for a mainstream NAS), a
  console and tools, installed differently on macOS (Homebrew), Linux and Windows.
- Hegel is the reference for the way an integration is written and brought in; it is not put on the
  Ramka for this. The point is an example for the first outside user integrating his Naim.
- HACS stays the way integrations are installed. A guide and a `new-integration` skill.
- No photos component now.
- Onboarding offers to push the home repository to a private GitHub repository (§5.5).

## 7. Left to the builder

- Wording, the order of sentences inside each section, the exact prompt text.
- Whether domosenso.com / domosenso.ch appears: only if the site takes such work at the time the
  README is written; otherwise leave the row out rather than promise it.
- The exact install commands per operating system, checked against each tool's current docs.
- The structure of the Hegel walk-through (excerpts or links to files at a fixed tag).

## 8. Open questions

None known at writing; see the builder check.
