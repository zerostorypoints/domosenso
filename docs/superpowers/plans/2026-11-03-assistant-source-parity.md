# Assistant source parity implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically include future configured subjects when an administrator explicitly enables that scope.

**Architecture:** The HA bridge resolves versioned scope grants against verified component bindings or existing manual subjects. Its existing read adapters and display projection consume the result. The framework documents the contract; native parsers retain their existing protocol.

**Tech Stack:** Python, HA WebSocket/storage APIs, plain JavaScript custom elements, pytest and node test runner.

**Spec:** `.ai/specs/SPEC-032-2026-11-03-assistant-source-parity.md`.

## Global constraints

- HA 2026.9.2; no production writes or publication as part of implementation.
- Existing explicit/legacy grants retain their semantics. Dynamic selection is opt-in.
- Refresh private metadata within 30 seconds without disk I/O on the event loop.
- No new roles/capability revisions/write actions become authorized by a component update.
- Private metadata never enters public fixtures; use fictional subjects.
- Bridge work starts above the preserved timer implementation so integration tests exercise both; keep the new commits separate from that existing change.

## Review focus

- A replacement sensor follows dynamic intent but cannot inherit a manual override's unrelated policy (task 1).
- Same-version bindings change without an inventory event (task 2).
- Old clients save unrelated assistant fields and must retain scope grants (task 1).
- Removal, permissions and invalid metadata must invalidate in-flight results (task 2).
- Vanilla subjects and display projections cannot broaden voice permissions accidentally (task 3).

### Task 1: Bounded selection policy

Files in `domosenso-frame-ha`: create `custom_components/domosenso_frame/assistant_selection.py`, `tests/test_assistant_selection.py`; modify `assistant_bindings.py`, `assistant_data.py`, `assistant_extended.py`, `studio_mappings.py`.

- [x] Write failing tests for future subjects, exclusions, frozen capability/role grants, manual precedence, missing metadata and old-client saves.
- [x] Add versioned `assistant.source_policy` with component scopes (component, kind, roles, read capability revisions, exclusions) and manual-kind scopes. Preserve absent policy semantics.
- [x] Resolve dynamic subjects through `selected_subjects`; carry bounded capability authorization through each runtime route. Explicit/manual grants retain previous behavior.
- [x] Validate scope additions against current verified catalog, revalidate after save, retain exclusions and unchanged stale scopes. Back up old storage before first policy save.
- [x] Run focused pytest selection/binding/mapping/runtime tests and commit after relevant checks.

### Task 2: Metadata refresh and lifecycle

Create `assistant_refresh.py`, `tests/test_assistant_refresh.py`; modify `assistant_api.py`, integration teardown.

- [x] Test same-version file replacement, invalid/missing bundles, unchanged signatures, concurrent refresh and close.
- [x] Implement `MetadataRefresh.check(force=False)` with a lock, executor-backed fingerprint/load and atomic snapshot callback. Refresh every 30 seconds and on inventory changes; close cancels pending work/listeners.
- [x] Increment metadata revision and clear data caches on change; reject in-flight asynchronous queries if metadata or mappings changed.
- [x] Run refresh/API lifecycle tests and isolated HA startup smoke.

### Task 3: Editor, display and vanilla parity

Modify `assistant-panel.js`, `studio_api.py`, `studio_data.py`; create `assistant_projection.py` with tests; extend `tests/assistant-panel.test.mjs`.

- [x] Write DOM tests for opt-in, exclusion, existing selection and PL/EN wording; write projection tests for plants/rooms, permission boundaries and manual override precedence.
- [x] Add mode controls per supported scope from admin catalog proposals, with exclusions and missing/unsupported diagnostics. Saving does not modify HA YAML/dashboard configuration.
- [x] Use one normalized resolved subject collection for bridge display plants/rooms/air. Existing manual subject mappings automatically join selected manual-kind scopes; unconfigured sensors do not.
- [x] Run DOM and projection tests; verify existing native response parser fixtures.

### Task 4: Acceptance and documentation

- [x] Extend isolated HA smoke with two plants then a third at the same component revision, explicit versus dynamic endpoints and vanilla manual sources.
- [x] Run complete bridge Python/DOM checks and relevant native parser tests. Run framework `tools/check-all.sh` before framework commit.
- [x] Update bridge setup/upgrade docs and framework `docs/ASSISTANT.md`, `docs/COMPATIBILITY.md`.
- [x] Record actual tested limits and website impact (documentation only until release), and prepare reviewed production plan separately if requested.

### Task 5: Timer incident (diagnosis, separate deployment)

- [x] Read tablet transcript: English one-minute timer was recognized, reported unsupported.
- [x] Confirm production bridge lacks `timer_api.py`, action metadata and timer mappings; controls report no shared timers.
- [x] Prepare a minimal deployment/setup plan for the existing timer implementation, preserving HA settings and pairing; do not start a timer or write production without approval.

Execution: inline in the existing owned worktrees; no new execution-method confirmation is needed after the maintainer's implementation approval. This plan does not authorize remote pushes, merges or production deployment.


## Execution ledger

- 2026-11-03: framework branch `codex/assistant-source-parity` starts from main `1376887`;
  bridge branch of the same name preserves the two prior timer commits through `a7f6123`.
- Task 1: regression tests failed before implementation; future subjects, exclusions, source
  replacement, changed revisions/roles, old-client saves and pre-policy backup pass.
- Task 2: periodic refresh runs on real HA 2026.9.2, detecting same-version input changes within
  30 seconds. Invalid reloads disable old bindings; tests cover serialization and close.
- Task 3: PL/EN editor mode/exclusion tests pass. The real HA smoke proves two plants becoming
  three in answers and Studio display; vanilla manual subjects use both surfaces once mapped.
- Task 4: 232 bridge Python tests and 16 DOM tests pass. Framework `tools/check-all.sh` reports
  all checks passed (component demo intentionally skipped; separate HA bridge smoke ran).
  Native parser accepts the newly generated three-plant answer; 32 relevant native PL/EN and
  timer tests pass. Native code and APK remain unchanged. Timer WebSocket smoke also passes.
- Independent review at bridge `e99a80d` found three P2 issues: mode-off role expansion,
  inventory changes during display I/O, missing projected air policies. Each gained a failing
  regression test and a passing fix, committed as `5e7faa1`; the full bridge suite and real HA
  acceptance passed afterwards. No second reviewer pass was claimed.
- Task 5: production diagnosis is read-only. The existing navigation timer is unrelated to user
  countdowns. A separate private deployment plan covers bridge replacement, one new core timer,
  explicit endpoint writes/alarm target and future read scopes; no production operation applied.
- Ruling: reuse existing explicit manual adapter grants instead of adding a redundant manual-kind
  permission toggle. Their supported plant/room display projection is shared; unmapped vanilla
  sensors remain candidates. Cost: no automatic discovery of arbitrary vanilla devices.
- Ruling: existing explicit Studio display overrides keep precedence. Component-derived plant and
  room measurements fill the missing sources; other dynamic read scopes do not create actuator
  mappings. Cost: intentional display overrides can differ, and no new control widget is implied.
- Limits: attribute-backed room measurements still need a display adapter; physical tablet tests
  of this server candidate await deployment approval. A minor pre-existing Polish summary says
  “trzy pozycji”; parser/formatter tests pass but this wording was not changed in the native app.
- Website: development setup documentation only; no public website change, tag, push or release.
