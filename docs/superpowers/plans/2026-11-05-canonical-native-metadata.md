# Canonical native metadata implementation plan

> **For agentic workers:** Use superpowers:executing-plans for this framework slice. Independent technical review uses its own managed worktree and named branch.

**Goal:** Compile native client metadata from the same component definitions and private bindings as protocol 1, without changing legacy artifacts.

**Architecture:** Optional client annotations extend authoring only. Normalize and validate once against the canonical semantic definitions, project strict schema-1 legacy artifacts and a separate private schema-2 artifact. The Bridge owns permission/evidence evaluation; Frame consumes negotiated wire data.

**Tech stack:** Python, JSON Schema Draft 2020-12, existing Jinja/render/install/lock/deploy pipelines; HA 2026.9.2.

**Spec:** [SPEC-037](../../../.ai/specs/SPEC-037-2026-11-05-shared-home-native-metadata.md), accepted in this chat on 2026-11-05. Native execution was confirmed after the maintainer saw the metadata → Bridge → Frame order. Scope here is the independently testable H2 framework slice; this does not claim F2 or native activation.

## Global constraints

- Keep schema-1 validators strict and existing bytes unchanged for identical provenance.
- Client annotations and optional subject/room aliases never grant access.
- New generic measurement capabilities use implemented primitives, not an ID allowlist; legacy specialized adapters remain allowlisted.
- Private compiled artifacts go through managed ownership/dirty render/deploy/rollback, never `www` or HA packages.
- No production/tablet changes, tags, Bridge prerequisite merge or v2 activation.
- Preserve English source, en/de/pl fallback and domain-owned live policy references.
- Browser migration on feature/pocket remains separate. This plan does not change home inputs.

## Review focus

1. An alias-only edit must not leak alias fields or extra translations into strict v1 output.
2. One shared room key with conflicting alias declarations must fail before any artifact is written.
3. Unknown executable/authoring fields must fail; stripping known annotations is not permissive filtering.
4. A v2-only capability must never enter a legacy loader or remove an unrelated specialized capability.
5. Metadata-only humidity after temperature must pass the same compiler without registering either ID in code.

## Task 1 — Canonical authoring and dual projection

Files: `schemas/assistant.schema.json`, new `schemas/frame-assistant-metadata.schema.json`, `tools/assistant_contract.py`, new `tools/assistant_metadata.py`, `tools/catalog_check.py`; tests in `tests/test_assistant_metadata.py`.

Interfaces: keep `compile_profile(component_dir, manifest, rendered_bindings, version, sha, dirty)` for strict legacy projection (returns `None` for an entirely new v2-only definition). Add `compile_metadata(...) -> dict | None` for the separate schema-2 artifact. Normalize known alias annotations before projecting; validate all other fields strictly.

- [x] Write/run failing tests: existing definition+client/aliases compiles to v2; v1 bytes match baseline; translations fall back; invalid client/alias/role fields fail; conflicting room aliases fail; generic temperature/humidity use the same primitives without ID registration.
- [x] Implement the bounded authoring extension and projection. Existing legacy definitions/evaluators retain exact validation. Add only the reviewed generic `measurement.v1` evaluator with scalar numeric role, a declared supported unit and bounded report-age policy.
- [x] Run compiler, canonical contract, bindings and catalog tests; compare observed results to expected outputs. No runtime transport is implied.

## Task 2 — Managed render/install lifecycle

Files: `tools/domosenso_cli/build.py`, `tests/test_cli_metadata.py` and reusable fictional fixtures.

Interface: optional `domosenso/assistant-metadata/<component>.yaml` managed output derived from the existing assistant binding template; no second authoring declaration/template.

- [x] Write/run a failing render test proving private output, provenance/lock ownership and exact legacy bytes; test v2-only definitions skip legacy output.
- [x] Wire compilation into the existing build path. Keep raw binding templates out of package/recommendation installs.
- [x] Test re-render, removal of client annotations, dirty provenance and rollback through existing output/lock mechanisms. Exercise a fresh independent synthetic home.

## Task 3 — Verification and cross-repository handoff

Files: SPEC-037 status, `docs/ASSISTANT.md`, `docs/COMPATIBILITY.md`, `docs/UPGRADE_NOTES.md`, fixture README and this ledger.

- [x] Record explicit approval of SPEC-037, private schema shape, generic evaluator scope and unchanged v1 behavior.
- [x] Pin schema and immutable fictional projected fixtures for Bridge consumption. Cover all current specialized capability definitions via synthetic opt-in tests without enabling production components.
- [x] Run focused tests and full `tools/check-all.sh`; demo skip for an inert compiler-only change, reassess for actual Bridge reload/reconnect work.
- [x] Independent exact-commit review in a separate worktree; fix material findings and repeat affected validation.
- [x] Publish the framework candidate and exact checks in its PR; no merge into main without review and task-authorized acceptance.

## Subsequent independently reviewed slices

B1/B2 consume the pinned schema/fixtures and integrate canonical projection with the existing verified v1 evaluators. F1 consumes authenticated Bridge discovery/results and retains strict negotiated fallback. F2 covers all four version combinations, unchanged binaries for two metadata-only capabilities, held-out PL/EN exact routing and separate physical acceptance. The source recovery and v1 dependency listed in SPEC-037 are prerequisites, not proof of completion.

## Execution ledger

- Started 2026-11-05 in the existing owned worktree, branch `codex/shared-home-native-contract`; workspace guard passed. PR #237 is the framework candidate and remains draft until implementation review.
- Ruling: use the existing single framework PR for this self-contained H2 slice; do not open parallel browser work or modify the Pocket integration branch. Cross-repository slices have separate review and release gates.
- Ruling: preserve the historical experiment as reference; implement canonical authoring directly rather than cherry-picking the independent-v2-definition compiler.

- Completed framework H2 candidate at `b53c34dadb49fb49de455a802b22752355b9099e` after integrating main `1fc7eb449d774a4db506f8bd233cde3a2fd2c39f`. Full `tools/check-all.sh`: all passed, 1,740 Python tests and 806 JavaScript tests, including HA/ESPHome and isolated home staging.
- Independent exact-commit review: no critical/important blockers; 144 focused tests passed. Reviewer compared the BASE compiler against the candidate for all 15 catalog components at identical provenance and confirmed exact YAML byte equality. A mixed specialized/generic fixture preserved its legacy profile while adding native humidity.
- Task 1 complete: canonical authoring, strict v1 projection, private v2 output and generic measurement primitive tested RED→GREEN.
- Task 2 complete: fresh-home managed lifecycle, dirty-render provenance, v2-only rendering and FakeTarget remove/rollback passed. No live-device or native runtime acceptance is implied.
- Task 3 complete: schema/source/golden-fixture hashes, upgrade notes, compatibility and independent review recorded. PR #237 carries the framework candidate for human acceptance; do not merge or activate it solely from this ledger.
- Next scope: Bridge B1/B2 consumes the reviewed framework revision and fixtures explicitly. Framework implementation is complete; Bridge, Frame and F2 acceptance remain separate pending work.
