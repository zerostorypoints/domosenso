# Opt-in demo acceptance

Approved scope: use an agent-selected `run-demo` PR label, remove duplicate demo
execution, and document conservative selection for both Codex and Claude Code.

## Approaches

- **Chosen: explicit `run-demo` label.** The agent names a runtime/browser risk
  and scenario in the PR. Documentation-only changes need no expensive demo.
- Automatic path selection would be simpler to enforce, but changes to the same
  file can have very different verification needs and cause unnecessary runs.
- Always running demo retains the current cost and duplication.

## Behaviour

PRs without the label report demo skipped before installing dependencies or
starting Docker. With the label, the existing full runtime/browser acceptance
runs once. Opening, reopening, pushing commits and adding/removing labels
refresh the decision. An unrelated label change while `run-demo` remains present
also reruns acceptance: it must not replace a failed result with a skipped one.
Concurrent runs for the same PR cancel older runs.

`workflow_dispatch` explicitly runs the full demo on the selected ref. There is
no automatic push-to-main demo rerun. The existing `framework` gate retains
its other checks but no longer invokes the demo runtime. Local demo commands
remain available; a catalog-check success must not claim demo was tested.

Agents default to skipping demo and record a reason, enabling it only for a
concrete risk covered by its runtime/browser tests. They reassess after scope
changes and never remove the label just to hide a failing applicable test.
Reviewers can require it. Branch protection and human approval stay unchanged.

## Verification and limits

Test selection for labelled/unlabelled PR events, manual requests and malformed
events; check that expensive workflow steps are gated and failures still fail.
Exercise the real check dispatcher with fake external commands to prove removal
of the duplicate while preserving other checks. Validate workflow syntax and
verify actual skipped and opted-in GitHub runs when the task PR is available.
This changes CI policy, not components, hardware or runtime behaviour.

Website impact: no public component/release change. Update shared developer
instructions; no catalog, hardware or journal update is needed.
