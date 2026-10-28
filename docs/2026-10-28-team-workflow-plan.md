# Team workflow and local staging implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for isolated delegated tasks
> or superpowers:executing-plans for inline tasks. Track the checkboxes and evidence below.

**Goal:** Implement SPEC-016: a shared contribution process, reproducible isolated HA demo and
release checks that separate development, publication and home deployment.

**Architecture:** The existing catalog and production CLI stay authoritative. A repository-only
demo tool renders the real Ramka against fictional HA services. Policy, release tooling and demo
infrastructure are separate review units; the coordinator integrates them without deploying a home.

**Tech Stack:** Python 3.11.4+, pytest, Node 22+, existing Playwright, Docker, HA 2026.9.2,
ESPHome 2026.9.1, GitHub CLI.

**Spec:** [.ai/specs/SPEC-016](../.ai/specs/SPEC-016-2026-10-28-team-workflow-and-local-staging.md).

## Global constraints

- English source text; en/de/pl UI checks and Swiss Standard German.
- No household data, production target, physical device access, flashing or production deployment.
- No permanent dev branch. One independent core review and green CI before main merge.
- Shared AGENTS.md and skills for Codex/Claude. Runtime files and credentials stay ignored.
- Use pinned HA 2026.9.2 and existing renderer/installer; no duplicate component templates.
- Existing issues #49–62 are triaged, not implemented or silently rewritten in this change.
- Run tools/check-all.sh before every commit. A partial check is never full release evidence.

## Review focus

- Worktrees with identical instance names must not share ports, state or Docker resources (task 3).
- Symlinks and forged ownership records must never turn reset into arbitrary deletion (task 3).
- A dirty or unmerged checkout and stale CI results must never qualify for release (task 2).
- Restart and browser reconnect must exercise real HA while known Ramka bugs remain visible (task 3).
- GitHub protection updates must preserve existing checks and privileges (task 4).

## Task 1: Team agreement and contribution handoff

**Files:** AGENTS.md, CONTRIBUTING.md, docs/ISSUES.md, docs/TEAM_WORKFLOW.md,
examples/home-template/AGENTS.md, .github/pull_request_template.md.

**Interfaces:** Produces the authoritative human workflow, a short agent entry point and PR fields.
Consumes SPEC-016 sections 3–5 and 7–8. No tool or schema changes.

- [ ] Write the core/fork paths, author/reviewer/release roles, explicit task-scoped authorisation,
  issue status labels, claims, handoff, independent review, version and adoption sequence.
- [ ] Remove the stale private-repository protection claim and align home-template rules without
  weakening the separate production/flash consent boundary.
- [ ] Record triage proposals for #49/#51/#58/#59/#61 and dependency handling for #56/#57.
- [ ] Validate links/privacy/agent budget with existing tests and full tools/check-all.sh.
  Expected: all checks passed. Commit this independent documentation unit.

## Task 2: Release evidence and partial local checks

**Files:** tools/release.py, tools/check-all.sh, tests/test_release.py,
tests/test_check_all.py, docs/TEAM_WORKFLOW.md, docs/UPGRADE_NOTES.md.

**Interfaces:** Keep release(catalog: Path, component_id: str, skip_checks: bool=False) -> str.
When skip_checks is true, verify successful current GitHub check runs for exactly HEAD rather
than bypass verification. Resolve authoritative origin/main using a read-only remote comparison;
require HEAD ancestry and a completely clean checkout before tagging. Local repositories without
origin may use local main; tests use isolated repositories and fake GitHub subprocess responses.

- [ ] Add failing tests for an unmerged HEAD, dirty shared tools, a moved remote main, stale and
  missing/failing CI, and a successful exact-HEAD check set. Confirm existing happy paths still work.
- [ ] Implement ancestry/cleanliness/evidence guards; preserve immutable tags and upgrade checks.
  Document that --skip-checks skips local execution only and needs GitHub CI evidence.
- [ ] Add tools/check-all.sh --local for agents/pytest/content/node/catalog checks. It explicitly
  reports partial validation; default remains the full gate. Add a subprocess test with controlled
  command executables to assert skipped Docker steps, nonzero failures and argument validation.
- [ ] Run focused tests, then full tools/check-all.sh. Expected: all checks passed. Commit.

## Task 3: Isolated runnable catalog demo

**Files:** tools/dev-home.py, tools/dev_home/*.py, examples/demo-home/custom_components/domosenso_demo/, tests/test_dev_home.py,
tests/dev_home_browser.mjs, docs/LOCAL_DEVELOPMENT.md, .gitignore, .github/workflows/check.yml,
tools/check-all.sh if needed for a bounded integration gate.

**Interfaces:** Commands up/status/scenario/check/down/reset exactly as SPEC-016 section 6.2.
Render from current worktree; reuse render_component() and install(). All state under ignored
.domosenso/dev/<identity>/. Runtime network is internal, UI loopback-only; initial fixture is Ramka
plus synthetic upstream entities and registered services/forecast subscription support.

- [ ] Add tests first for invalid names, independent worktree identities, owned paths, symlink
  rejection, reset confirmation, occupied ports, missing Docker and bounded failure reporting.
- [ ] Implement lifecycle and config generation with strict resource ownership and no home inputs.
  up can resume; down preserves helpers; reset only removes its own generated state/resources.
- [ ] Implement demo HA integration and scene application using existing fictional fixtures.
  Record physical actions; real Ramka packages/cards run unchanged. Test action effects.
- [ ] Exercise two running instances, state persistence across restart, egress rejection to a
  controlled endpoint, cleanup and clean startup on the pinned HA image.
- [ ] Exercise actual HA frontend in Chromium at desktop/tablet viewports in en/de/pl; keep the
  browser open across HA restart. Report known #51–53 failures explicitly; do not fix components.
- [ ] Document first-run setup, commands, boundaries, supported scenes and observed known bugs.
  Wire reproducible new checks into CI without masking missing prerequisites.
- [ ] Run full tools/check-all.sh plus the runtime/browser acceptance. Commit independently.

## Task 4: Integration, GitHub protection and review delivery

**Files:** This plan's progress/evidence and any corrections from review.

**Interfaces:** Integrates reviewed task branches; GitHub changes preserve current protection fields.

- [ ] Independent review for each task; fix material findings with regression evidence.
- [ ] Read current main protection; set required approvals to 1 and conversation resolution true,
  retaining check names, strictness, stale dismissal, admin enforcement and force/deletion blocks.
  Read back and record results; do not alter unrelated settings.
- [ ] Run combined checks, review the whole change and verify working trees are clean.
- [ ] Push task branches and prepare linked draft PRs, following authorisation already given for
  this approved delivery. Do not merge main or publish a component release.
- [ ] Report deliverables, review links, test evidence, staging limitations and settings separately.

## Execution record

- 2026-10-28: SPEC-016 approved. Existing checkout preserved; coordinator branch codex/team-workflow.
- Ruling: execute the approved scope without another planning-only confirmation. The maintainer
  explicitly authorised the spec as the basis for planning and implementation.
- Ruling: reuse the existing Python environment and Node dependencies for verification where
  possible; do not copy credentials or production configurations into any worktree.
