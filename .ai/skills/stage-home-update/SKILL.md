---
name: stage-home-update
description: Use when setting up local Home Assistant staging for a home repository, previewing a component update with private inputs, or preserving local customizations before adoption. Not for the fictional framework PR demo or production deployment.
---

# stage-home-update

Use the shared [home staging guide](../../../docs/HOME_STAGING.md). Read the home's AGENTS.md and
CLAUDE.md first. The framework owns tools/components; the home owns inputs, lock and local files.
This skill works in any home installed with `tools/install-home-workflow.py`; it contains no
household-specific runtime. In the framework, it routes home work to a separate private workspace.

## Identify and preserve

Identify the home from the conversation and its Git origin, not an app label. Use an owned linked
worktree and named branch for both the home and any framework work. Preserve uncommitted changes
from their original worktree; a new worktree does not inherit them. Record both paths, branches
and SHAs privately. Do not copy inputs, screenshots, credentials or household identifiers into
the framework, its demo, issues or PRs.

Run `status` using the explicit home. Resolve `managed-modified` and unclassified files before
rendering. Preserve the intent in inputs/local extensions or a generic framework fix. Never use
`--force` to discard edits. **`render --catalog-dev` bypasses the normal hand-edit refusal even
without `--force`**: a clean new worktree is not proof that pending customizations were preserved.

The CLI checkout and component catalog are distinct. `uv --project` selects CLI code; the home's
`catalog:` selects the source for tagged updates. Verify both. If temporarily selecting the owned
catalog worktree in the home's `catalog:` field, preserve and restore its original value before
committing. Fetch tags from the verified origin without moving existing tags. Record the selected
tag's commit separately from CLI HEAD. For an unreleased PR, fetch/verify its exact SHA, inspect
changed scripts, use `render COMPONENT --catalog-dev CATALOG_WT`, and record the development stamp;
the unchanged lock is not its source identity. Never present a development render as a release.

**Unreleased PR limitation:** the current CLI's development render leaves deploy inventory and
resources in the old lock. Changed copied assets (cards/scripts) may be refused as hand edits;
new/versioned asset paths may be omitted while old resources remain. Before any PR-home preview,
compare candidate output paths, hashes and resources with the actual deploy plan. Only proceed
when it carries the entire intended candidate. If assets/inventory differ or the plan refuses,
report home preview blocked by current CLI support; use the fictional `preview-pr` demo for the
framework review, then stage the explicit release after merge/release. Do not hand-edit the lock,
reclassify managed assets as local, use `--force` or invent a release to evade this limit.

## Set up the local runtime

Use the guide's prerequisite and installer commands. Check the home ignores `.domosenso/` and
that runtime files are untracked. Run the framework's `home-staging.py --home HOME_WT up --name
review` from the prepared paths. The shared tool derives unique resources from the home worktree;
never run or copy a household-specific launcher with fixed Docker names.

Read the returned runtime status and private `target_file`. Add only its `staging-review` entry
to the owned home worktree's `targets` after reviewing the diff. Preserve all other entries. An
existing entry with that name must match this runtime or be reconciled explicitly; do not deploy
through a target copied from another worktree. Keep the temporary entry out of permanent commits.
Recheck `status`, mounts/identity and the target before deploy, rollback or any state write.
Foreign ownership or changed isolation blocks runtime work; never adopt or stop foreign resources.

This starts an empty HA, not a mirror or complete simulated home. Runtime HA cannot reach the LAN
or internet. No production token, `.storage`, database or media is imported. Review the home config
before deploying it. Identify missing integrations, secrets, services and upstream states; use
reviewed private test fixtures/stubs when needed. Do not enable networking to make a test pass or
silently substitute production. Report unsupported behavior and failures explicitly.

## Baseline, candidate, acceptance

First establish the existing customized home revision on this owned staging: review `deploy
staging-review --plan`, apply, inspect errors/UI and take a snapshot to an explicit private path.
Then update to the selected released version with `update COMPONENT --to VERSION`, or render the
verified PR through the development route. Read upgrade notes, inspect input/lock/generated diffs,
run appropriate checks, plan/apply the candidate to the same owned staging and take a separate
snapshot. Reapply any private fixtures after restart; compare and explain intended differences.
A blank bootstrap is not a production baseline. Never hide failures with new comparison exemptions.

Inspect the actual dashboard and relevant interactions. Recheck PR head if applicable. Handoff:
verified URL, private login-file path, home/CLI/component revisions, source/target identity, checks
and visual evidence, limitations, and 3–5 things to try with expected outcomes. State **staging
ready for inspection; awaiting the home owner's acceptance**, or the precise blocker. Physical
hardware/cloud behavior is not established by a local stub or infrastructure check.

Leave an agreed preview running with its owner and stop command. `down` preserves data; `reset`
requires the matching name and explicit cleanup scope. Restore temporary catalog/target fields
without discarding unrelated home edits before committing. Skills and source files do not prove
client hooks are trusted/active. Never submit human approval, merge, publish tags, flash hardware
or write production under this playbook. A released version still requires a separately reviewed
home change and fresh production plan before the owner's explicit deployment approval.
