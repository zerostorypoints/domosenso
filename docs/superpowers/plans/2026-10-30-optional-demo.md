# Optional demo implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run expensive demo acceptance only when explicitly requested, without duplication.

**Architecture:** A small standard-library selector reads the Actions event and
writes a run decision and summary. The existing demo job gates all expensive
steps on that decision; the framework dispatcher no longer invokes demo.

**Tech Stack:** GitHub Actions YAML, Python, Bash, pytest.

**Spec:** `docs/superpowers/specs/2026-10-30-optional-demo-design.md`

## Global Constraints

- Exact label: `run-demo`; absent means skip. Manual dispatch means run.
- No `pull_request_target`, no secrets or write permission for untrusted PR code.
- Keep ordinary framework checks and branch protection unchanged.
- Preserve explicit local demo entry points and accurate partial/full evidence.

## Review Focus

- New commits and label removal must refresh the decision.
- Unrelated labels must not turn an enabled failed demo into a skipped pass.
- Malformed events must fail, never silently bypass requested verification.
- A failed runtime must fail the job; evidence uploads must not hide failure.
- Main pushes must not repeat demo; manual selected-ref checks remain possible.

### Task 1: Selection, workflow and duplicate removal

**Files:** `tools/demo_ci_policy.py`, `.github/workflows/demo.yml`,
`tools/check-all.sh`, `tests/test_demo_ci_policy.py`, `tests/test_check_all.py`.

**Interfaces:** Event JSON and event name -> `run=true|false` Actions output and
human-readable summary. Existing `tools/dev_home/ci.py` remains the full runner.

- [x] Add failing selector tests for PR labels, push/reopen/label events, manual
  dispatch and malformed input; test workflow guards and event wiring.
- [x] Change dispatcher tests to require no demo call, an explicit skipped
  message, and retained HA/ESPHome/home-staging checks and failure propagation.
- [x] Run targeted pytest; expect failures against the old implementation.
- [x] Implement the selector and workflow gates; remove the duplicate call.
- [x] Run targeted pytest and workflow/shell syntax checks; expect success.

### Task 2: Shared agent policy and verification

**Files:** `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, `docs/TEAM_WORKFLOW.md`,
`docs/LOCAL_DEVELOPMENT.md`, `.github/pull_request_template.md`.

**Interfaces:** Agents record demo decision, reason, scenario and tested revision;
all shared docs agree with the workflow from Task 1.

- [x] Explain conservative opt-in, failure handling, manual use and no main rerun.
- [x] Update obsolete unconditional-demo and required-check claims.
- [ ] Run agent checks and applicable regression suite; inspect every result.
- [ ] Commit the cohesive change, obtain independent technical review, and
  prepare the task PR. Verify skip first, then apply `run-demo` because this PR
  changes demo gating; record actual GitHub results. Do not merge or self-approve.
