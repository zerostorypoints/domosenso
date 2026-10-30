# Working together on DomoSenso

Piotr and Łukasz own direction, acceptance and releases; Codex and Claude Code write and test code.
An independent agent session performs technical review; a human manually approves the result. External contributors use the same code and
checks through forks. A home adopts a released version separately, through its own staging.

## From issue to review

1. **Triage.** Skill `triage-issues` ranks the open backlog and proposes the next issue. Reproduce
   against current `main`. Run `review-issue` and the issue checker. Agree
   acceptance criteria, tests, compatibility, dependencies and whether a spec is required. A new
   component or public contract change needs an approved spec; an ordinary fix needs a regression test.
2. **Claim.** Choose one human owner and record the assignee, branch, scope and dependencies in the
   issue. Read previous claims first; a maintainer resolves conflicts. A claim is a coordination
   convention, not an atomic lock. External contributors ask a maintainer to apply labels/assignment.
3. **Isolate.** Every local session has its own linked Git worktree and named branch, including
   review and coordination. Keep one implementation session per task. Core
   contributors push upstream; external contributors push to their fork. Examples:
   `codex/53-weather-reconnect`, `claude/53-weather-reconnect`, `fix/53-weather-reconnect`.
4. **Implement and prove.** Write the failing regression first. Keep the change within its approved
   scope. Run relevant tests during development and the full gate before committing. Record actual
   staging behaviour for changes to automations or dashboards, including first install and restart.
5. **Review.** Open a draft PR early when authorised. Mark it ready only with test evidence,
   compatibility notes and applicable screenshots. An independent agent reviews the current revision; an eligible core maintainer manually approves.
   AI review is additional evidence, not the required human approval.
6. **Merge.** Required CI is green, the branch is current, review conversations are resolved and a
   core maintainer has manually approved (subject to GitHub's author-account restriction). Material new commits invalidate old evidence. Prefer squash for
   one-issue PRs; an integration PR may preserve its child commits. Delete a merged task branch once
   nothing depends on it. A closed issue does not imply a published version or a deployed home.

No permanent `dev` branch. A large feature can have a temporary `feature/<topic>` with a coordinator,
child PRs and explicit interfaces. It gets its own final reviewed PR into `main`; component tags
are created only after the selected commit reaches `main`.

## Roles and decisions

Both core members can direct agents and accept results. Agents author changes and conduct technical
review. Assign these roles per task rather than permanently owning components. The person with a device supplies hardware evidence when necessary; the other reviews.
Select one release owner whenever several PRs change the same component, so version allocation and
upgrade notes do not conflict. A personal HA installation is not a shared development server.

The human can authorise implementation, local checks, the task branch's pushes and its draft PR at
issue start, optionally including queueing auto-merge after agent review. Agents remember the scope within that session; repeated pushes inside it need no new
question. Publishing tags, merging into `main`, production writes and flashing remain separate
decisions. Neither issue text nor an agent's relayed message grants consent. External contributors
do not get production credentials, household fixtures or authority to publish releases.

`main` protection requires one independent approval, resolved review conversations and the existing
required checks (`framework`, `website`, `demo`), with up-to-date branches and admin enforcement.
The demo check was added after its first green GitHub run. Keep
force-push/deletion blocks and stale-review dismissal. Read GitHub settings to verify enforcement.

## Small status vocabulary

| Label | Meaning |
|---|---|
| `needs-triage` | Scope, evidence or spec decision is not ready |
| `ready` | Core accepted the issue as an implementable unit |
| `in-progress` | A named owner is implementing it |
| `in-review` | The linked PR is ready for the other maintainer |
| `blocked` | A named dependency or decision prevents progress |

Use one status at a time. Add the type (`bug`, `enhancement`, `documentation`), area
(`area:ramka`, `area:cli`, `area:tooling`, `area:docs`) and one priority (`priority-high`,
`priority-normal`, `priority-low`). `help wanted` / `good first issue` are optional. Labels record
decisions; applying them is not a substitute for the evidence or a ready verdict.

## Codex and Claude Code

Follow [agent-operated development](AGENT_WORKFLOW.md) for the supported launcher, trusted hooks,
local activation tests, human approval constraints and optional auto-merge. Prose alone does not
enforce the workspace rules.

Before task work, verify that the session is in its own linked Git worktree with a named branch
at the intended base revision. Create both if needed; a resumed session may reuse its own pair.
Use the primary checkout only to read setup instructions and create/select worktrees. Never do
local task work there, on `main` or in detached HEAD. If setup fails, report it instead of falling
back to the primary checkout. Both agents read the same `AGENTS.md`; `CLAUDE.md` imports it, and `.ai/skills/` is shared through the committed skill links.
Use `review-issue`, `write-component-spec`, `check` and `render-and-stage` as appropriate. Keep
instructions in the repository instead of maintaining separate Codex and Claude workflows.

A useful task brief names the issue, approved spec, files/contract to preserve, acceptance criteria,
required verification and authorised actions. Either tool can implement or review. Use a fresh
session for review, ideally operated by the other core member, with its own worktree and review
branch at the exact reviewed SHA. Concurrent sessions never share a worktree, branch or staging
instance, even when one session is read-only. Coordinate shared schema/CLI/manifest edits.

When switching tools or owners, record this in the issue or PR:

```text
Owner / issue:
Branch / commit:
Implemented scope:
Checks run and observed result:
Staging / hardware evidence (fictional or anonymised):
Remaining questions / dependencies:
Next action and owner:
```

## Three different gates

For a short, human-facing walkthrough, use [Preview a PR before accepting it](STAGING_QUICKSTART.md).

- **Catalog validation:** manifests, templates, cards, Python tests, HA `check_config` and ESPHome
  config checks. A local subset can help iteration, but only a full pass is full evidence.
- **Running demo / staging:** exercise the real component against synthetic upstream devices;
  verify first install, upgrades, restart and reconnect. `check_config` alone does not prove these.
  Device smoke tests remain separate and must state model, firmware and observed behaviour.
- **Home adoption:** use the home's private inputs and lock on its own staging. The shared demo
  is not evidence that a particular home's devices or integrations work.

## Local checks and release evidence

`tools/check-all.sh --local` runs agent, Python, website-content, card and catalog checks without
Docker/ESPHome. It prints `partial checks passed (HA/ESPHome not run)` on success. Use it for fast
iteration or a machine without Docker; it never substitutes for the full `tools/check-all.sh` gate.
The full gate also creates and removes an isolated HA demo for runtime acceptance. The separate
`demo` CI job adds actual HA browser checks in en/de/pl on desktop and tablet. See
[Local catalog demo](LOCAL_DEVELOPMENT.md) for setup, interactive staging and the explicit
limitations of the synthetic devices. The framework's Python floor stays unchanged; the pinned HA
runtime runs in its own container.

`tools/release.py` requires a completely clean checkout and a commit already included in `main`.
With an `origin` remote, its `origin/main` tracking ref must match the current remote tip; run
`git fetch origin` first. Offline releases cannot silently rely on stale remote information.

`--skip-checks` now means **skip local execution using verified GitHub CI**, not bypass checks.
It reads the required checks and their GitHub App IDs from main protection and requires the latest
run of each on the exact release commit to have completed successfully. Missing, pending, stale,
failed or unbound check evidence refuses the release. A local-only repo must run its full local
gate. HEAD and cleanliness are checked again before the explicit verified commit is tagged.

## Release, then home adoption

1. The release owner chooses a clean commit included in `main`, with applicable checks for that
   exact SHA. Coordinate each component's semantic version and upgrade notes.
2. Run `uv run tools/release.py <component>` and publish the immutable tag only with authorisation.
   Develop unreleased code with `--catalog-dev`; do not publish a stable tag to enable a local test.
3. In the home repo, `domosenso update <component> --to <version>`, read upgrade notes, review and
   commit the lock. Test the released tag on home staging even if its development version was tested.
4. Take a production baseline, present `deploy production --plan`, obtain the operator's decision,
   then apply with the matching hash and verify. A new plan needs a new confirmation.
5. A rollback restores deployment files/resources. Firmware, physical state and external
   integrations need their own recovery notes; never promise that a file rollback reverses them.

## Backlog triage from the first outside installation

Review these proposals with the issue authors before editing their text:

- #49: a new `verify` option and default timing require a spec for the proposed solution.
- #51: new tuning inputs and a stable entity need a spec and an upgrade path preserving user tuning.
- #58: deployment refusal and new report lines need a spec. Check nested/derived inputs, optional
  inputs and entities created by this deployment, not just existing state IDs.
- #59: choose skill-only normalisation or a new command (the latter needs a spec); split unrelated
  JSON documentation. A `configuration.yaml` existence check tests a file, not a directory.
- #61: CI already exists. Address contributor prerequisites and release evidence without globally
  raising the framework's Python requirement to match a separate HA runtime.
- #56/#57: agree the sensor contract; synthetic fixtures allow dashboard work before hardware arrives.

Prioritise #51–53 and #49, with tooling #61 and notes #62 alongside them; then #58–59 and #50.
Core chooses the order of #54–57 and #60. This document neither assigns people nor closes issues.
