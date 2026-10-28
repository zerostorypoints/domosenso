# Reproducible home staging implementation plan

> **For agentic workers:** Use superpowers:executing-plans for native implementation and an independent final review.

**Goal:** Ship repeatable local home staging and its playbook from the framework to any home.
**Architecture:** Reuse the existing isolated Docker lifecycle with a separate home identity and
minimal bootstrap. Export a staging target rather than modifying a home's deploy declaration.
Install a self-contained shared skill and human guide with conflict-aware updates.
**Tech stack:** Python, existing PyYAML/HA client, Docker, pytest; no new dependencies.
**Spec:** `.ai/specs/SPEC-016-2026-10-28-team-workflow-and-local-staging.md`, section 9.

## Global constraints

- Home Assistant `2026.9.2`; isolated internal network and loopback relay.
- Private state in the home worktree, never the catalog; no production access.
- Every local session uses its own named linked worktree.
- Preserve customized/foreign files and resources; manual acceptance remains separate.

## Review focus

- Two homes and worktrees with identical names must not share resources.
- A pre-existing or symlinked runtime must be rejected before mutations.
- Resume must retain deployed home configuration and staging credentials.
- Installer upgrades must not overwrite home-customized skills or agent settings.
- Generated targets must authenticate after restart and never name production resources.

## Task 1: Generic home runtime

- [x] Write failing behavior tests in `tests/test_home_staging.py` for identity, workspace,
  ignored paths, generation/resume, target, ownership and symlinks.
- [x] Implement `HomeStaging(home, name, framework)` in `tools/home_staging.py`, reusing Demo
  lifecycle with a overridable proxy source. Add CLI `tools/home-staging.py`.
- [x] Run new tests and existing demo tests. Verify target against the existing home schema.

## Task 2: Portable playbook installation

- [x] Write failing tests in `tests/test_home_workflow.py`: fresh installation, repeat, upgrade,
  modified files, symlink escapes and collisions are checked before writes.
- [x] Add `tools/install-home-workflow.py` and `tools/home_workflow.py`: install canonical skill,
  guide and relative client symlinks, record source digest; preserve all unrelated files/settings.
- [x] Add shared skill and guide, link home template, onboarding, AGENTS and human quickstart.
  Incorporate lessons from private rehearsal without copying private identifiers or scripts.

## Task 3: Reproduce and review

- [x] Exercise two newly initialized fictional home Git worktrees through installer, up,
  authentication, target validation, restart/config persistence and independent reset.
- [x] Add the reproducible bounded runtime check to the full gate; retain no private evidence in CI.
- [x] Run full checks, independent review and fix substantive findings; branch ready for the authorised push.

## Evidence and implementation rulings

- Private-home rehearsals identified fixed Docker names, development-render hand-edit bypass,
  and the distinction between CLI checkout and component catalog. The shared playbook addresses
  these generically. No private home runtime is used as shared implementation.

- Shared runtime reproduction passed: two fresh fictional homes, distinct resources/ports, local
  long-lived-token authentication, controlled egress rejection, real CLI baseline/candidate
  deploy, config/token persistence and independent reset. No personal runtime was used.
- Unit RED: new modules absent; GREEN: 44 runtime/installer/demo tests passed before full gate.
- Independent review: confirmed released-tag updates preserve custom inputs/local files and use
  the new resource paths. Found an insufficient ignore probe and unsupported development-render
  asset cases. The ignore check now requires the effective explicit parent-directory ignore rule;
  two reproducing Git tests failed before the fix and pass after it.
- Ruling: retain the existing development-render CLI contract. The playbook explicitly blocks
  asset/inventory PR previews that cannot be represented by the actual deployment plan; use the
  fictional demo then stage a real release. Cost: some unreleased PRs cannot be accepted against
  a private home through this workflow yet. Never fabricate a tag/lock or claim stale assets pass.
- Portability: installed documentation references only installed local files; references to
  other framework-only skills are clearly named as framework guidance, not broken home links.
- The maintainer's private home draft now consumes the same installer output. Its legacy Docker
  resources and runtime were left unchanged; no household details entered the shared source.

- Final full gate: 854 Python tests, Node tests, strict catalog, HA/ESPHome checks, fictional
  demo runtime and fresh-home staging reproduction all passed. The first intermediate gate
  caught an invalid ignore-check Git invocation; it was corrected and the complete gate rerun.
