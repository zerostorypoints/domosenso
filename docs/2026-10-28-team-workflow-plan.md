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

- [x] Write the core/fork paths, author/reviewer/release roles, explicit task-scoped authorisation,
  issue status labels, claims, handoff, independent review, version and adoption sequence.
- [x] Remove the stale private-repository protection claim and align home-template rules without
  weakening the separate production/flash consent boundary.
- [x] Record triage proposals for #49/#51/#58/#59/#61 and dependency handling for #56/#57.
- [x] Validate links/privacy/agent budget with existing tests and full tools/check-all.sh.
  Expected: all checks passed. Commit this independent documentation unit.

## Task 2: Release evidence and partial local checks

**Files:** tools/release.py, tools/check-all.sh, tests/test_release.py,
tests/test_check_all.py, docs/TEAM_WORKFLOW.md, docs/UPGRADE_NOTES.md.

**Interfaces:** Keep release(catalog: Path, component_id: str, skip_checks: bool=False) -> str.
When skip_checks is true, verify successful current GitHub check runs for exactly HEAD rather
than bypass verification. Resolve authoritative origin/main using a read-only remote comparison;
require HEAD ancestry and a completely clean checkout before tagging. Local repositories without
origin may use local main; tests use isolated repositories and fake GitHub subprocess responses.

- [x] Add failing tests for an unmerged HEAD, dirty shared tools, a moved remote main, stale and
  missing/failing CI, and a successful exact-HEAD check set. Confirm existing happy paths still work.
- [x] Implement ancestry/cleanliness/evidence guards; preserve immutable tags and upgrade checks.
  Document that --skip-checks skips local execution only and needs GitHub CI evidence.
- [x] Add tools/check-all.sh --local for agents/pytest/content/node/catalog checks. It explicitly
  reports partial validation; default remains the full gate. Add a subprocess test with controlled
  command executables to assert skipped Docker steps, nonzero failures and argument validation.
- [x] Run focused tests, then full tools/check-all.sh. Expected: all checks passed. Commit.

## Task 3: Isolated runnable catalog demo

**Files:** tools/dev-home.py, tools/dev_home/*.py, examples/demo-home/custom_components/domosenso_demo/, tests/test_dev_home.py,
tests/dev_home_browser.mjs, docs/LOCAL_DEVELOPMENT.md, .gitignore, .github/workflows/demo.yml; coordinator integrates tools/dev_home/ci.py --runtime-only
into tools/check-all.sh as a bounded runtime gate.

**Interfaces:** Commands up/status/scenario/check/down/reset exactly as SPEC-016 section 6.2.
Render from current worktree; reuse render_component() and install(). All state under ignored
.domosenso/dev/<identity>/. Runtime network is internal, UI loopback-only; initial fixture is Ramka
plus synthetic upstream entities and registered services/forecast subscription support.

- [x] Add tests first for invalid names, independent worktree identities, owned paths, symlink
  rejection, reset confirmation, occupied ports, missing Docker and bounded failure reporting.
- [x] Implement lifecycle and config generation with strict resource ownership and no home inputs.
  up can resume; down preserves helpers; reset only removes its own generated state/resources.
- [x] Implement demo HA integration and scene application using existing fictional fixtures.
  Record physical actions; real Ramka packages/cards run unchanged. Test action effects.
- [x] Exercise two running instances, state persistence across restart, egress rejection to a
  controlled endpoint, cleanup and clean startup on the pinned HA image.
- [x] Exercise actual HA frontend in Chromium at desktop/tablet viewports in en/de/pl; keep the
  browser open across HA restart. Report known #51–53 failures explicitly; do not fix components.
- [x] Document first-run setup, commands, boundaries, supported scenes and observed known bugs.
  Wire reproducible new checks into CI without masking missing prerequisites.
- [x] Run full tools/check-all.sh plus the runtime/browser acceptance. Commit independently.

## Task 4: Integration, GitHub protection and review delivery

**Files:** This plan's progress/evidence and any corrections from review.

**Interfaces:** Integrates reviewed task branches; GitHub changes preserve current protection fields.

- [x] Independent review for each task; fix material findings with regression evidence.
- [x] Read current main protection; set required approvals to 1 and conversation resolution true,
  retaining check names, strictness, stale dismissal, admin enforcement and force/deletion blocks.
  Read back and record results; do not alter unrelated settings.
- [x] Run combined checks and review the whole change; retain clean task worktrees for core review.
- [x] Push task branches and prepare linked draft PRs, following authorisation already given for
  this approved delivery. Do not merge main or publish a component release.
- [ ] Report deliverables, review links, test evidence, staging limitations and settings separately.

## Execution record

- 2026-10-28: SPEC-016 approved. Existing checkout preserved; coordinator branch codex/team-workflow.
- Ruling: execute the approved scope without another planning-only confirmation. The maintainer
  explicitly authorised the spec as the basis for planning and implementation.
- Ruling: reuse the existing Python environment and Node dependencies for verification where
  possible; do not copy credentials or production configurations into any worktree.

- Team agreement: PR #65, merged to temporary `feature/team-workflow`; policy review and scoped
  correction approved. Existing instructions in the original checkout remained untouched.
- Release evidence: PR #66, merged to the integration branch. Regression tests reject unmerged
  commits, dirty/untracked files (including hidden Git status preferences), stale main refs and
  missing/stale/failed/unbound CI. Full gate: 781 Python tests plus Node, catalog, HA and ESPHome.
- GitHub settings read back: one approval, resolved conversations, strict app-bound framework and
  website checks, stale review dismissal and admin enforcement; force pushes/deletion blocked.
  Twelve status/area/priority labels were created. Existing issue text and ownership were preserved.
- Demo implementation: real HA Container with fictional upstream integration, eight scenes,
  six locale/viewport browser cases and open-page restart. Full source gate after review fixes: 792 Python tests,
  127 Node tests, zero catalog warnings/errors and HA/ESPHome configuration checks. Runtime/browser
  acceptance passed; known component defects #51–53 remain separately recorded observations.
- Isolation uses an internal-only HA network plus a fixed-destination, read-only TCP relay for
  loopback UI ingress, because Docker does not publish ports directly on the internal network.
  Controlled HTTP-200 positive control and rejected HA egress verify the network boundary.
- CI preserves only allowlisted reports/screenshots after removing the generated home and Docker
  resources. Native HA navigation and empty fresh-install history remain visible; physical kiosk,
  firmware, radio and home deployment are outside these checks.
- Integration dispatcher regression: two expected failures before adding the runtime step; all
  five focused dispatcher cases passed afterwards, including failure propagation and local omission.
- Clean-runner evidence: GitHub demo run 40719516899 passed on implementation commit c7579e7.
  Main protection now also requires `demo` bound to GitHub Actions app 15368, preserving the
  existing app-bound checks and strictness. Current review-fix commit gets its own fresh CI run.
- Independent demo review: synthetic cover Stop regression fixed and verified through registered
  HA services; null Docker labels now fail with an ownership refusal. Scoped re-review approved.
- Whole-change independent review found no further P0/P1/P2 or minor changes. PR #67 checks
  framework, website and demo all passed on review-fix commit 4f30f26. Protection read-back
  confirms one review, strict app-bound framework/website/demo, resolved conversations, stale
  dismissal and admin enforcement, with force pushes and deletion disabled.
- Combined full gate passed after integrating all sources: 811 Python tests, 127 Node tests,
  strict catalog and all HA/ESPHome checks, plus the newly required local demo runtime acceptance.
  Runtime evidence explicitly says browser not run in this gate; the separate GitHub demo job
  passed the full browser matrix/reconnect. The local runner removed its Docker resources.
- Final delivery remains a core-review PR into main. No main merge, release tag, physical-device
  operation or home deployment is part of this implementation. Task worktrees remain for review.
