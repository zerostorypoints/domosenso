# README for people and the integrate-a-device guide: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a README written for a person with a NAS who wants Home Assistant with Claude, a
`CONTRIBUTING.md` for the repository material, a guide `docs/integrate-a-device.md` with Hegel as the
worked example and the Naim Uniti Star as the example task, a `new-integration` skill, and onboarding
that offers a private GitHub repository for the home.

**Architecture:** documentation and one skill, plus two small guards as tests: images under
`.github/readme/` carry no metadata, and every relative link in the people-facing Markdown resolves.
The home template gains a `.gitignore`; the `onboard-home` skill gains the GitHub step.

**Tech Stack:** Markdown; pytest (existing `tests/`), Pillow (dev dependency already in
`pyproject.toml`) for the image check; `tools/install_skills.py`, `tools/agents_check.py`,
`tools/check-all.sh`.

**Spec:** `.ai/specs/SPEC-013-2026-10-22-readme-and-integration-guide.md` (approved by the maintainer
2026-10-22). Read it before any task; §5 is the design, §6 the maintainer's decisions.

## Global Constraints

- Base: `main` after `feature/onboard-v2` (SPEC-011/012) is merged into it. If it is not merged when
  you start, branch from `origin/feature/onboard-v2` and say so in the PR; the onboard-home skill text
  you change is the v2 text from that branch.
- All repository text is English. No household data: no real names of people, rooms or places, no
  entity ids, IPs, MACs, tokens (AGENTS.md "Privacy"). The only exception: the two photos in
  `.github/readme/` (SPEC-013 §6).
- `main` changes only through a pull request; never push `main`, never move a tag (AGENTS.md).
- README is written for a public repository; while the repository is private, one line says access is
  by invitation (SPEC-013 §6). Clone command: `git clone git@github.com:zerostorypoints/domosenso.git`.
- Anything not on `main` when the README is written is marked "coming" (SPEC-013 §4).
- No timings in the README stages (SPEC-013 §5.1 item 9). No domosenso.com/.ch row unless the site
  takes such work at the time (SPEC-013 §7) — ask the maintainer, do not guess.
- Integrations are installed through HACS; Domosenso never installs them (SPEC-013 §3).
- `AGENTS.md` stays under 32,768 bytes (`tools/agents_check.py`).

## Review Focus

1. A photo added later to `.github/readme/` straight from a phone carries GPS in EXIF — the image test
   must fail on any metadata, not only on GPS (Task 1).
2. Content moved from README to CONTRIBUTING.md leaves links pointing at anchors or files that no
   longer exist — the link test covers README.md, CONTRIBUTING.md and `docs/*.md` (Task 1).
3. `CONTRIBUTING.md` and the guide are outside today's privacy scan list — add them, and the Naim
   example must not name the first outside user's home, rooms or devices beyond "a Naim Uniti Star"
   (Task 2).
4. The README promises the guided HA install or `discover` while they are not on `main` — a manual
   check step lists every feature named in the README against `main` (Task 3).
5. The home repository is pushed with a token, `secrets.yaml` or a snapshot in it — the template
   `.gitignore` test and the skill's pre-push check (Task 6).

---

### Task 1: Guards — no metadata in README images, every relative link resolves

**Files:**
- Create: `tests/test_docs.py`
- (images already on the spec branch: `.github/readme/ramka-air.jpg`, `.github/readme/ramka-now-playing.jpg`)

**Interfaces:**
- Produces: `tests/test_docs.py::test_readme_images_have_no_metadata`, `test_relative_links_resolve` —
  later tasks keep them green.

- [ ] **Step 1: Write the tests**
  - `test_readme_images_have_no_metadata`: for every file in `.github/readme/` with suffix
    `.jpg/.jpeg/.png/.webp`, open with Pillow; assert `img.getexif()` is empty and `img.info` has no
    `exif`, `xmp`, `icc_profile`-with-text or `comment` key (`icc_profile` alone is allowed).
  - `test_relative_links_resolve`: for `README.md`, `CONTRIBUTING.md` (if present) and `docs/*.md`,
    every Markdown link or image target that is not `http(s)://`, `mailto:` or a pure `#anchor`
    resolves to an existing file relative to the document; a `file#anchor` target checks the file
    only.
- [ ] **Step 2:** `uv run pytest -q tests/test_docs.py` → image test PASS (the images were stripped);
  link test PASS or lists today's broken links — fix those in the same commit.
- [ ] **Step 3: Commit** `tests: README images carry no metadata; relative links in docs resolve`.

### Task 2: CONTRIBUTING.md and the privacy scan

**Files:**
- Create: `CONTRIBUTING.md`
- Modify: `tests/test_catalog_content.py` (the privacy scan's file list), `AGENTS.md` ("Privacy")

**Interfaces:**
- Produces: `CONTRIBUTING.md` with the anchors `#layout`, `#components`, `#agent-skills`, `#checks`,
  `#documents`, `#your-first-contribution` (Task 3 links to them).

- [ ] **Step 1:** Move today's README sections into CONTRIBUTING.md (SPEC-013 §5.2): Layout,
  Components (table with links), Agent skills, Checks (commands), Documents; add "Main, tags and pull
  requests" (short, pointing to AGENTS.md), the `.githooks` guard, spec first, privacy, and "Your first
  contribution" pointing to `docs/integrate-a-device.md` (created in Task 4; the link test passes once
  Task 4 lands — order Task 4 before running the full suite, or create the guide file empty here).
- [ ] **Step 2:** Add `CONTRIBUTING.md` and `.github/readme/` (text files only; images are skipped
  already) to the privacy scan list; add `CONTRIBUTING.md` to the files that may name the author and the
  first outside user. In AGENTS.md "Privacy", one sentence: the photos in `.github/readme/` are the
  maintainer's own tablet, chosen by him, with all metadata removed; nothing else from a real home.
- [ ] **Step 3:** `uv run pytest -q` → green (privacy and links).
- [ ] **Step 4: Commit** `CONTRIBUTING.md: the repository material moves out of the README`.

### Task 3: README for people

**Files:**
- Modify: `README.md` (rewritten)

**Interfaces:**
- Consumes: CONTRIBUTING.md anchors (Task 2); `docs/integrate-a-device.md` (Task 4);
  `.github/readme/*.jpg`.

- [ ] **Step 1:** Write the README in the order of SPEC-013 §5.1, items 1–10: title and claim; two or
  three sentences; the two photos with captions (air page by day; now playing at night with the radar
  board); Prerequisites (HA on the NAS: have it / guided install "coming" unless merged / steps for
  Synology Container Manager tested, other Docker hosts untested, HAOS not covered; SSH key-based with
  `docker`; tools table: git, gh, uv, SSH client, Claude Code or Codex with install commands for macOS
  via Homebrew, Linux via the distribution's package manager plus the official uv and Claude Code
  installers, Windows via WSL2 marked "not tested"); "Start in 10 minutes" with the prompt (clone with
  tags, `git config core.hooksPath .githooks`, `/onboard-home`, stop before any change to Home
  Assistant) and the Codex variant; the note for AI agents (SPEC-013 §5.1 item 6 as amended); the "You
  are → Start with" table (§2); What's in the box (one line per component with "tested in N homes",
  read from each manifest's `tested.homes`); Stages Minute 10 / Hour 1 / Day 1 / Month 1 with You
  decide / Run / Done when, Minute 10's Done when including the private home repository (§5.5); links.
  The privacy line: "The repository is private for now; access is by invitation." Licence line as
  today until a licence is chosen.
- [ ] **Step 2:** Check install commands against each tool's current docs (uv, Claude Code, Codex, gh,
  Homebrew); write the URLs you checked into the PR description.
- [ ] **Step 3: Manual check (Review Focus 4):** list every command, skill and feature the README
  names; for each, `git grep` on `main` (or the base branch) proves it exists; mark the rest "coming".
- [ ] **Step 4:** `uv run pytest -q tests/test_docs.py tests/test_catalog_content.py` → green.
- [ ] **Step 5: Commit** `README for people: prerequisites, the first ten minutes, stages`.

### Task 4: `docs/integrate-a-device.md`

**Files:**
- Create: `docs/integrate-a-device.md`

**Interfaces:**
- Consumes: `devices/hegel-h400.yaml`, `components/media/component.yaml`, the Hegel repository at tag
  `v0.1.7` (`https://github.com/zerostorypoints/hegel-home-assistant/tree/v0.1.7`).

- [ ] **Step 1:** Write the four steps of SPEC-013 §5.3, each with Done when: (1) what HA already has
  (`domosenso discover` — "coming" if not on main — and HA's Discovered list; built-ins for a player);
  (2) HACS: search, judge (README, tests, last update), install through HACS; Naim: `naim_media_player`
  from `jorourke/naim-atom-home-assistant`, marked "not tried yet"; (3) write one, Hegel file by file
  with links to files at tag `v0.1.7`: layout and `hacs.json`, `manifest.json`, config flow and
  discovery, API client, coordinator (push from the amp's event stream versus polling), entities,
  off versus not responding, options, translations, diagnostics, tests with a fake device, CI
  (`validate.yml`: HACS action and hassfest; `tests.yml`), releases with tags; (4) bring the device into
  the catalog: `devices/<id>.yaml` with `match` rules, the component's `recommend` list, and the
  contract warning of §5.3 (a second integration for `media` is a contract change — spec first, in the
  contributor's PR). Naim placeholders say exactly what is unknown (HA's manufacturer/model/domain
  strings, the HACS install) and that the first outside user fills them in.
- [ ] **Step 2:** `uv run pytest -q tests/test_docs.py tests/test_catalog_content.py` → green.
- [ ] **Step 3: Commit** `docs: integrate a device, with Hegel as the worked example`.

### Task 5: Skill `new-integration`

**Files:**
- Create: `.ai/skills/new-integration/SKILL.md`
- Modify: `AGENTS.md` (skills table), `CONTRIBUTING.md` (skills table)
- Generated: `.claude/skills/new-integration`, `.agents/skills/new-integration` (links, by the script)

- [ ] **Step 1:** Front matter `name: new-integration`, `description:` one sentence on when to use it
  (a device the catalog does not know, a player for the Ramka). Body: the four steps of
  `docs/integrate-a-device.md` in order, stopping for the person at: which integration, whether to write
  one, the match rules, the PR. Rules: reads the person's HA read-only; never installs or configures an
  integration (HACS and the UI are the person's); nothing household-specific into the catalog; spec
  first for a contract change.
- [ ] **Step 2:** `uv run tools/install_skills.py` then `uv run tools/agents_check.py` → `6 skill(s), 0
  error(s)` and AGENTS.md within budget.
- [ ] **Step 3: Commit** `skill new-integration`.

### Task 6: The home repository on a private GitHub repository

**Files:**
- Create: `examples/home-template/.gitignore`
- Modify: `.ai/skills/onboard-home/SKILL.md` (the step after `domosenso init`),
  `docs/getting-started.md`, `examples/home-template/AGENTS.md` (one line: later changes go to a
  branch with a pull request)
- Test: `tests/test_docs.py`

- [ ] **Step 1: Write the failing test** `test_home_template_gitignore`: the file exists and ignores
  `secrets.yaml`, `*.token`, `token`, `.domosenso/`, `staging/.data*/`, `.storage/`,
  `home-assistant_v2.db*` (assert each with `git check-ignore --no-index -q <path>` run in a temp copy of
  the template, or by matching the lines exactly).
- [ ] **Step 2:** Run → FAIL (no file). Create the `.gitignore`. Run → PASS.
- [ ] **Step 3:** Skill text (SPEC-013 §5.5): ask "GitHub, private? yes · later · no"; on a typed yes:
  `gh auth status` (else the owner runs `gh auth login`), the pre-push check (`git ls-files` and
  `git status --ignored`; refuse if a tracked path matches the `.gitignore` patterns above or contains
  `token`), then `gh repo create <owner>/<home name> --private --source <home> --remote origin --push`;
  never public; later changes on a branch with a PR. getting-started: the same step and its Done when
  ("`git remote -v` shows `origin`").
- [ ] **Step 4:** `uv run pytest -q` → green.
- [ ] **Step 5: Commit** `onboarding offers a private GitHub repository for the home`.

### Task 7: Whole-branch check and the pull request

- [ ] **Step 1:** `tools/check-all.sh` → `all checks passed`.
- [ ] **Step 2:** Mark SPEC-013's status "implemented" with the commit list.
- [ ] **Step 3:** Ask the maintainer, in the session doing it, for the go-ahead to push and open the PR
  into `main` (and to merge it). PR description: what changed per task, the URLs checked in Task 3, the
  "coming" list.
