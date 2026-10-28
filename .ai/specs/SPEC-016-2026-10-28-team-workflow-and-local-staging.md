# SPEC-016 — Core team, contributions and local Home Assistant staging

Status: approved, 2026-10-28, by the maintainer's explicit "go" in the originating conversation.
The maintainer selected short-lived task branches into `main`, local staging and temporary
integration branches for larger features. This document is the approved implementation scope.
Maintainer amendment, 2026-10-28: every local session must use its own linked worktree and named branch, including read-only review and
coordination; a resumed session may reuse its own pair.

Source: the maintainer's request to organise a two-person core team, later external contributions,
new components, issues and Codex / Claude Code work. Baseline: catalog `5b01271`, inspected on
2026-10-28. This is a framework workflow and developer-tool spec, not a home configuration.

## 1. Outcome and scope

A contributor can reproduce a component problem without a real home, make an independently
reviewable change, prove it locally and in CI, and hand it to a core maintainer. A home owner can
adopt the released component through their own staging and an explicit production decision.

Goals:
- One issue, one accountable human, one task branch and one implementation worktree by default.
- Shared instructions and verification for Codex and Claude Code.
- Independent review before merge; component release and home deployment are separate actions.
- A repeatable local HA demo using the real component code and fictional inputs.
- External contributions do not need household data, hardware or production credentials.

Non-goals:
- A permanent `dev` branch, automatic production deploys, a hosted QA platform or a package registry.
- Implementing the open feature issues as part of this spec.
- Simulating radio protocols, proving firmware on hardware or controlling a real wall tablet.
- Copying a real home's configuration, `.storage`, database, credentials or media into the demo.
- Supporting several maintenance release lines before there is a demonstrated need.

## 2. Verified starting point

- `main` requires the `framework` and `website` checks and an up-to-date branch. Admin enforcement
  is enabled; force pushes and deletion are disabled. Required approving reviews currently equal 0.
- `.github/workflows/check.yml` already runs `tools/check-all.sh` on PRs and pushes to `main`.
- `AGENTS.md` is the common policy; `CLAUDE.md` imports it. `.ai/skills/` is linked into both agents'
  skill directories. Issues have a standard and mechanical checker.
- `render --catalog-dev` and `deploy staging` exist. `deploy production` rejects recorded dirty
  renders. The render-and-stage skill repeats staging after installing the released tag.
- `examples/demo-home/` contains fictional inputs, states, scenes and media, but is not a complete
  runnable home with a generic local launcher. `init` leaves `targets` empty.
- `ha-check` validates a fresh rendered configuration. It does not prove first-start behaviour,
  state restoration, reconnect recovery or browser interactions in a running HA instance.
- `tools/release.py` creates immutable per-component tags locally and checks upgrade notes. It
  does not itself enforce that HEAD belongs to `main`; the policy currently supplies that rule.
- Issues #49–62 are open, with no assignees or labels at inspection time. #48 was completed by #63.
- The paragraph claiming this is a private repository without branch protection is stale.

These are observations, not guarantees about settings at implementation time. Re-read the relevant
GitHub settings and current source before changing them.

## 3. Approaches and decision

| Approach | Benefit | Cost | Decision |
|---|---|---|---|
| Task branches → `main`; release components by immutable tag | Small review units; simple for core and forks; homes choose when to upgrade | Every merge must preserve a usable trunk | Selected by the maintainer |
| Task branches → permanent `dev` → `main` | A shared integration queue | Extra merges, drift and unrelated features waiting for each other | Rejected for the current team |
| `main` plus maintenance release branches | Patch older supported versions independently | Backports and additional release testing | Deferred until needed |

Large features may use an explicitly named, temporary `feature/<topic>` integration branch with
child PRs. Its coordinator owns the order, shared interfaces and final PR to `main`; it is removed
after integration. It is not a route around final review or CI.

Open Mercato currently uses `main` for the next minor and `release/vX.Y.x` for maintenance. Its
snapshot channel retains the name `develop` from a retired branch. Reuse its separation of review,
QA evidence and release authority, scaled to this team; do not copy its entire automation stack.

## 4. People, branches and authority

| Role | Can do | Completion boundary |
|---|---|---|
| Core task owner | A core maintainer sets outcomes, scope and agent authority | An eligible core maintainer manually approves the result |
| Implementing agent | Implement, test, push the authorised branch and prepare its PR/evidence | Independent agent review, then human acceptance |
| Reviewing agent | Review exact-SHA code and evidence in its own worktree/branch | Reports findings; never submits the human approval |
| Human approver | A core maintainer assesses scope, observed behaviour and agent evidence, then manually approves or requests changes | Approval applies to the reviewed revision and GitHub author-account restrictions |
| Release owner | A core member named for that release; select the green merged commit and publish component tags | Published versions never move; release is not a home deploy |
| External contributor | Claim by discussion; work in a fork; submit a PR and reproducible evidence | Core triages, labels, reviews, merges and releases |
| Home owner/operator | Update a private home lock, test its staging and approve its production plan | Authority is specific to that home and operation |

Both core members are maintainers; no permanent subsystem split is imposed. The person with the
relevant hardware may supply hardware evidence, while the other reviews the change. A maintainer's
personal home is not a shared development environment.

Core branches live in the upstream repository; external branches live in forks. Use an issue
number in task branch names, for example `codex/53-weather-reconnect`, `claude/53-weather-reconnect`
or `fix/53-weather-reconnect`. The prefix identifies tooling, not ownership or additional rights.
No direct `main` pushes, no force push to a shared branch and no tag moves/deletions.

Proposal for GitHub protection: require one approving review, retain stale-review dismissal and
existing required checks, and require resolution of review conversations. Retain admin enforcement.
Re-read and preserve unrelated protection fields when applying changes. A blocked review waits for
the other maintainer; there is no default self-approval or agent bypass.

Agent permissions are agreed at issue start: implementation, local checks and isolated demo actions;
optionally also pushing that task branch and opening/updating its draft PR. Record the explicit
scope in the session so the agent does not repeatedly ask for already authorised steps. A GitHub
issue body, another agent or a repository file cannot supply human consent. Merge, release,
production writes and flashing retain their separate human decisions. Change the instructions to
express this scoped authorisation consistently, rather than claiming every push always needs a
fresh question. No new permission is granted by this draft itself.

## 5. Issue-to-PR working agreement

Use a small status vocabulary: `needs-triage`, `ready`, `in-progress`, `in-review`, `blocked`.
Use one status label at a time. Closing the issue records completion; component release availability
is reported separately. Add a type (`bug`, `enhancement`, `documentation`), an area and a priority
(`priority-high`, `priority-normal`, `priority-low`). `help wanted` and `good first issue` are optional.

1. Core triages the problem against current `main`, runs the issue checker and `review-issue`,
   confirms spec requirements, acceptance criteria and dependencies. A checker pass alone is not ready.
2. One human owns the issue. Before coding, record the assignee, status and a short claim containing
   branch, intended scope and dependencies. Read existing claims first; core resolves competing
   claims. These conventions are coordination, not an atomic lock. External contributors without
   label permissions request the claim; a maintainer applies metadata.
3. Every local session owns a separate linked worktree and named branch. Read-only reviewers use
   their own review branch at the exact reviewed SHA; coordinators also work in their own worktree.
   Concurrent sessions never share a worktree, branch or demo runtime. The primary checkout is only
   for workspace setup; task work never uses it, `main` or detached HEAD. Shared files such as schemas,
   deployment tools and component manifests require explicit coordination between parallel issues.
4. Fixes preserving the contract get a failing regression test. New components, new capabilities,
   schema changes and public contract changes get an approved spec first. Specs use the existing
   `.ai/specs/SPEC-NNN-...` convention; the coordinator reserves the next number to avoid collisions.
5. Open a draft PR early when authorised. A ready PR includes the issue/spec, user-visible change,
   compatibility and version implications, commands/results, and applicable staging/hardware evidence.
6. The reviewer checks the current diff and evidence. Material new commits require refreshed
   affected checks and renewed approval. CI and approval must apply to the revision being merged.
7. Merge after the checks and independent approval. Prefer squash for a normal single-issue PR;
   an integration PR may preserve its child commits. Delete merged task branches once no dependent
   work needs them. No repository-wide destructive branch cleanup is part of this change.

A handoff lives in the issue/PR, not only in chat: branch and SHA, implemented scope, commands and
observed results, unresolved questions, next action and owner. Never include a home snapshot or token.
Do not add comments, assign other people or modify their issue text without the relevant authorisation.

Codex and Claude use the same `AGENTS.md`, skills and checks. Either can implement or review. An
agent review supplies findings; it does not replace the other maintainer's required human approval.

## 6. Local staging: first deliverable

### 6.1 Two distinct environments

- **Catalog demo:** shared fictional fixtures and the real rendered components, runnable locally
  by core members and external contributors without any home access. This is the new tool's scope.
- **Home staging:** a private home's existing `local-docker` target, using that home's inputs and
  lock. Its setup and permissions remain in the home repository. The new tool must not overwrite it.

The initial catalog demo covers Ramka and the synthetic upstream inputs it consumes, including
lights, media, weather and presence. It does not claim to emulate every catalog integration.
Use the pinned HA version already in the repository, not a floating image tag.

### 6.2 Proposed interface and ownership

Add a repository development tool, `tools/dev-home.py`, rather than expanding the production CLI
in this first slice. Proposed commands (not implemented yet):

```text
uv run tools/dev-home.py up --name <name> [--port <port>]
uv run tools/dev-home.py status --name <name>
uv run tools/dev-home.py scenario <scene-id> --name <name>
uv run tools/dev-home.py check --name <name>
uv run tools/dev-home.py down --name <name>
uv run tools/dev-home.py reset --name <name> --confirm <name>
```

`up` bootstraps or resumes a generated home, renders from this catalog worktree and prints its
loopback URL, HA version and source SHA/dirty status. Default port allocation must support concurrent
worktrees; an explicitly occupied port fails without stopping another container. `down` preserves
runtime data for restart tests. `reset` destroys only this named generated instance after matching
confirmation. No command accepts a production target or imports a real home's files.

Runtime identity combines the canonical worktree path and validated instance name. Generated home,
tokens, Docker resources and test output live under ignored `.domosenso/dev/<identity>/`; add ignore
rules before any runtime generation. Identity and ownership markers must be checked before cleanup;
reject symlink/path escapes. Ports, containers and volumes are not shared between worktrees.

Tracked sources: fixtures under `examples/demo-home/`, the launcher under `tools/`, a demo-only HA
integration under the demo fixtures if required, and tests. All generated home files are disposable.
The launcher reuses existing render/install/validation code; it does not fork component templates.
Changes to production CLI contracts are outside this slice and would require a spec amendment.

### 6.3 Isolation and realistic behaviour

Start an independently bootstrapped HA, bind its UI only to loopback and attach it to an isolated
Docker network. No host networking, production mounts, USB devices, radio access or production
tokens. Runtime outbound access to the household LAN and internet must be blocked; downloading
pinned images/dependencies is a distinct preparation step before the isolated runtime starts.

Use fictional fixtures and demo-owned services/entities. A demo integration may implement light,
media, weather and notification behaviours to record actions and change synthetic states. Simply
posting states to `/api/states` is insufficient evidence for registered services, forecast
subscriptions and restart recovery. Disable automatic discovery and do not configure cloud logins,
tunnels, physical integrations or real shell actions. Real component automation and card code runs
unchanged; only upstream device/service boundaries are synthetic.

Reuse scene IDs and fixture data already in `scenes/`; do not create another competing scenario
catalog. The initial implementation must document which scene behaviours it can actually reproduce.
Wall-tablet wake/sleep commands are recorded as intended actions, not claimed as physical success.
Run UI acceptance on the demo's declared tablet viewport and a desktop viewport, in en/de/pl.

### 6.4 What the checks prove

| Layer | Evidence |
|---|---|
| Unit/render tests | Manifest, template, card and tool behaviour with synthetic inputs |
| HA config check | Generated configuration loads without the errors already recognised by the harness |
| Running demo | First install, restore after restart, service effects and frontend reconnect |
| Hardware smoke test, when relevant | Behaviour on the stated device/firmware; performed by an authorised operator |
| Home staging | Released tag with the specific home's inputs and dependencies |

`check` has bounded readiness timeouts, exits nonzero for a missing prerequisite, failed test or
unsupported required check, and reports each case. Missing Docker is not a passing full gate.
Introduce the demo check in CI when reproducible on a clean runner; keep existing checks required.
Choose the smallest browser harness that exercises the real HA frontend; document its invocation.

Acceptance for the launcher: two simultaneous instances have distinct resources; both are isolated;
one can restart and preserve helpers without affecting the other; reset affects only its own state;
the dashboard renders from this worktree and recorded service calls never reach real equipment.
The first suite must distinguish fresh-start and restored-state cases, and exercise a browser left
open across a restart. Known failures from #51–53 are recorded as existing defects, not silently
fixed or disguised as passing coverage in the launcher PR. Required new runtime cases become green
gates alongside their separately reviewed fixes; already-correct harness behaviour is gated at once.

## 7. Release and adoption

Components keep their own semantic versions and immutable `<component>/<version>` tags. The release
owner coordinates version allocation when several PRs touch the same component. Stage an unreleased
change using `--catalog-dev`; do not publish a stable tag merely to enable a local test.

For a release: select a merged `main` commit, verify applicable checks for that exact commit,
review component contracts and upgrade notes, run the release tool, then publish the tag with the
human's authorisation. Do not move tags or treat `--skip-checks` as evidence. Strengthen the release
tool to enforce main ancestry and make any CI-evidence alternative explicit under the revised #61.
No automatic release workflow or new prerelease tag syntax is required by this design.

Home adoption uses an explicit version (`update <id> --to <version>`), reviewed upgrade notes and a
committed lock. Test that released version on home staging, take the production baseline, show the
production plan/hash, obtain the operator's decision, apply and verify. A changed plan invalidates
the old confirmation. Use the existing rollback mechanism for the last deployment; do not promise
it reverses external integrations, firmware or hardware state. Handle those through explicit
component-specific recovery notes. Never deploy production directly from a development checkout.

## 8. Delivery slices and issue triage

This is one umbrella design delivered through separate reviewable PRs, not one large implementation:

1. **Team agreement:** update `CONTRIBUTING.md`, concise `AGENTS.md` rules and home-template guidance;
   add a PR template and documented status/handoff convention. Remove the stale branch-protection
   claim. Apply the agreed GitHub review settings separately and verify the resulting settings.
2. **Developer bootstrap:** scope #61 against existing CI. Keep framework Python requirements
   separate from the interpreter used by HA checks. Distinguish partial local checks from a full
   pass, and specify release evidence before implementing a bypass or new gate.
3. **Isolated demo:** implement the launcher, fixtures and behaviour described in section 6, with
   its own tests and CI integration. No real-home migration is required to try it.
4. **Reliability fixes:** separate PRs for #51–53 and #49, using the demo where applicable. The fixes
   can proceed in parallel with demo infrastructure using unit tests and existing safe staging.
5. **Release enforcement:** exact-commit evidence and main ancestry, coordinated with #61; then use
   the complete path on one small component fix before expanding automation.

Proposed backlog order: reliability (#51–53, #49), contributor tooling (#61) and reusable notes
(#62); then input/access validation (#58–59) and reload planning (#50); then #54–57 and #60 according
to maintainer priorities. A designated person owns each issue; do not infer who owns an area.

Triage corrections to propose, not silently apply to another author's text:
- #49 adds a CLI option and default behaviour: spec required for the proposed solution.
- #51 adds inputs and a stable entity: approve its contract and existing-home migration first;
  do not overwrite user tuning on upgrade.
- #58 introduces a deployment refusal and new report surface: spec required. Its classifier must
  account for nested/derived inputs, optional values and entities created by the deployment itself.
- #59 must choose skill-only normalisation or a new CLI capability; the latter needs a spec. Split
  unrelated JSON documentation. A configuration file check uses a file test, not `test -d`.
- #61 already has CI; revise the issue around missing developer/release guarantees rather than
  creating a duplicate workflow or globally raising Python requirements without need.
- #56 and #57 need an agreed sensor/package contract; #57 may use synthetic sensor fixtures while
  hardware work proceeds. #60 needs its own scope and spec before selecting a service location.

## 9. Validation, rollout and builder discretion

For policy/docs: existing document-link, privacy and agent checks; manual verification of the PR
template and one core / one fork contribution walkthrough. For settings: read back required
reviews, checks, stale-review handling, conversation resolution and admin enforcement. Do not claim
settings were applied from a documentation change alone.

For the demo: unit tests for identity, paths and lifecycle; integration tests on a clean Docker
runner for isolation, concurrency, restart and cleanup; browser checks against running HA. Include
a negative network test to a controlled test endpoint, not a real household device. For release
hardening: tests for an unmerged commit, stale CI evidence, existing tag and contract change.
Run the existing full gate before commits as required by `AGENTS.md`; report any missing execution
prerequisite rather than substituting the earlier GitHub run for local verification.

Builder decisions: internal helper names, exact fixture organisation, allocated port strategy and
browser-test library, provided the boundaries and outcomes above hold. Approved product-level
defaults: one human approval, the small label vocabulary, task-scoped agent push
permission and a demo limited initially to Ramka with synthetic upstream devices.

## 10. References

- [Repository contribution rules](../../CONTRIBUTING.md)
- [Issue standard](../../docs/ISSUES.md)
- [Compatibility contract](../../docs/COMPATIBILITY.md)
- [Existing render and stage workflow](../skills/render-and-stage/SKILL.md)
- [Earlier demo/staging design](../../docs/2026-10-20-domosenso-demo-staging-i18n-design.md)
- [Open Mercato contribution and release model](https://github.com/open-mercato/open-mercato/blob/main/CONTRIBUTING.md)
- [Open Mercato review/QA conventions](https://github.com/open-mercato/open-mercato/blob/main/.ai/docs/pr-workflow.md)
- [Codex repository instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Claude Code shared instructions](https://code.claude.com/docs/en/memory)

## 11. Agent-operated workflow amendment — 2026-10-28

The maintainers clarified that agents write and review code; The core maintainers set direction and
accept changes. Implement one tested local session launcher and shared workspace guard for both
agents, with project SessionStart/PreToolUse hooks and Git commit/push checks. The launcher prepares
a named branch in a linked worktree before starting the selected CLI. Native desktop worktrees
remain supported; detached starts may perform only the branch-creation bootstrap before task work.
Keep source instructions shared through AGENTS.md and the CLAUDE.md import.

Prefer these local guardrails plus existing server-side protection over prose alone or an unscoped
machine-wide policy. Do not claim an absolute sandbox: hooks need local trust/activation, some tool
paths are not intercepted, and an arbitrary shell can target other directories. CI validates the
committed configuration and guard regressions, not the state of every contributor's workstation.
Each workstation must complete the documented activation and negative-test checklist. No global
trust bypass, private credentials or new bot account is introduced.

Enable repository auto-merge availability without weakening protection. An agent may queue it for
a PR when the task authorisation includes that action; approval remains a manual core-team action.
Agents never submit that human approval themselves. GitHub's author-account restriction still
applies: PRs opened with one maintainer's account need the other maintainer's approval, and vice versa. Allowing either
person to approve every PR would require a separately configured agent identity, outside this slice.
Tag publication and production deployment remain separately authorised.

## 9. Reproducible home staging amendment

Requested by the maintainer on 2026-10-28: home staging and its agent playbook must be reusable
by other installations and users, not implemented only in a maintainer's private repository.
This extends section 6.1 with an additional home tool; the fictional demo remains separate.

Implementation decisions: provide `tools/home-staging.py --home PATH up|status|target|down|reset
--name NAME` (`up` optionally `--port`, `reset` requires `--confirm NAME`). Reuse the audited
internal-network HA lifecycle and loopback relay. Use a home-worktree-derived identity and
private, ignored `.domosenso/staging/` state. Require an owned linked worktree and named branch.
Reject catalog-contained homes, symlinked state, foreign resources and nonignored runtime paths.
Never adopt or stop a pre-existing home's staging container. Do not read production credentials,
copy production storage, mirror production, or automatically deploy home configuration.

Bootstrap an empty local HA; generate its private login and long-lived staging token, and output
a `local-docker` target fragment for `staging-NAME`. The user/agent reviews and adds that single
entry to the home declaration. Preserve existing targets. Starting HA is not evidence that the
home's components work: deploy, private fixtures, integration limitations and browser checks are
separate playbook steps. Missing integrations/upstream state must be reported, not presented as
complete simulation. Home config may be deployed only after review; egress remains blocked.

Distribute a shared `stage-home-update` skill with a reproducible installer into any home
worktree. It installs a versioned copy for both agent clients and a short human guide, without
replacing AGENTS/CLAUDE, existing skills, hooks or settings. Updates replace only unchanged
previously installed files; conflicts fail before writes. Runtime data stays ignored and private.
Home-template and onboarding instructions discover this workflow. No personal paths, hostnames,
rooms or household scripts enter the shared implementation.

Acceptance: two fresh synthetic home repositories/worktrees can install the workflow, start
concurrent isolated staging with the same name, load local HA, obtain valid generated targets,
resume without losing deployed configuration, and clean up one without affecting the other.
Tests cover ownership, symlinks, ignored-state checks, occupied ports, safe installer upgrades and
private file permissions. Existing demo and CLI tests remain green. No production action or
automatic human approval is introduced.
