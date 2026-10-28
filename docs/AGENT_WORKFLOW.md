# Agent-operated development

Piotr and Łukasz are the core maintainers: they choose outcomes, accept scope and decide whether a
change is ready. Codex and Claude Code implement, test, inspect the running demo and prepare PRs.
An independent agent session reviews code and evidence; the human approval is a separate decision.
No maintainer is expected to manually write the implementation.

## New local sessions

After this workflow reaches main, pull it into each developer's clone. For a new CLI session, run
from the clone or an existing worktree:

```sh
python3 tools/agent-session.py codex 53-weather-reconnect -- "Implement the approved issue 53 scope"
python3 tools/agent-session.py claude 51-initial-values -- "Prepare the issue 51 spec and regression"
```

The launcher fetches origin/main by default, creates a new named branch and linked worktree under
`.worktrees/`, enables `.githooks` for that clone, checks the workspace, then starts the selected
installed CLI there. It passes no permission, model or trust bypass flags. A selected base must
already contain this workflow's guard and hook configuration; old bases are refused. For an
approved temporary integration branch or an exact review SHA, pass `--base <ref>` before `--`.
`--prepare-only` prepares the workspace without starting an agent. Existing names are refused;
resume the original session in its own worktree instead of creating a competing writer.

For Codex desktop, select **Worktree** when creating the task. Use its native worktree tools when
available. A native worktree may start detached: the guard permits only a plain
`git switch -c codex/<task>` (or `git checkout -b <branch>`) as its branch bootstrap. A session
accidentally started in the primary checkout may use the native create/attach-worktree tools;
ordinary task tools stay blocked. These are setup actions, not exceptions for task work.
If the client does not expose these tools under the documented names, create/select the worktree
through its UI or use `--prepare-only` and open that directory. Do not disable the guard to recover.

Every local session, including independent review and coordination, has a separate worktree and
branch. Git itself prevents checking the same branch out in two worktrees. Review branches point
at the exact PR SHA. Do not start two clients in one worktree: the hook checks workspace shape,
not live session ownership, and does not provide a cross-client session lock. Delegated agents
must actually start or attach with their own client working directory; putting a path in their
prompt or changing only a tool workdir is not session isolation. If the client cannot relocate a
child session, use a separate supported CLI/client session for that review.

## Activate and verify on each machine

Repository files cannot silently grant trust on Piotr's or Łukasz's computer. Complete this once
per clone/client, and repeat when the client requests trust for changed hooks:

1. Inspect the committed `.codex/hooks.json`, `.codex/config.toml`, `.claude/settings.json` and
   `tools/agent_workspace.py`. Codex requires project trust and explicit review/trust of the hook
   definition through `/hooks`; changed hook definitions are skipped until trusted. Claude Code also requires
   project trust and can display its active hooks through `/hooks`. Do not use modes that disable
   project instructions/hooks. No trust approval is submitted by an agent on a human's behalf.
2. The launcher sets `git config --local core.hooksPath .githooks`. If using native worktree setup,
   set it yourself after reviewing the hooks. An existing custom hooksPath is preserved and the
   launcher refuses until its owner integrates the guards. This setting is local to the clone;
   committing a `.githooks` directory alone does not activate it elsewhere.
3. In a correctly prepared worktree, run `python3 tools/agent_workspace.py check`. Expect
   `workspace ok` with the actual path and branch. Run `python3 tools/agents_check.py` to check
   shared instructions and the committed hook wiring.
4. In each client's `/hooks`, confirm SessionStart and PreToolUse are loaded and enabled. Start a
   disposable session in the primary checkout and request a harmless ordinary shell command.
   Expect a visible workspace denial, with the command not executed. In a named linked worktree,
   the same command must run. Native workspace setup and a detached branch bootstrap are allowed.
   This is the client activation test; a direct Python test alone does not prove the client loaded
   its hooks. If it fails, stop task work and diagnose setup.
5. Resume or compact the prepared session: SessionStart should again report its actual path and
   branch. Keep proof of activation locally; do not put local credentials or household paths in PRs.

Repository tests exercise real temporary Git repositories, the JSON hook protocol, a fake agent
executable, and actual Git commit/push hooks. They do not launch a paid agent session, approve trust
or certify another machine. Baseline inspected here: Codex CLI 0.164.0-alpha.11.1 and Claude Code
2.1.303; verify support when using a different client/version.

## What is enforced, and where

| Layer | Check | Boundary |
|---|---|---|
| Shared AGENTS.md / CLAUDE import | Roles, task scope, worktree ownership, tests and handoff | Instructions for the agent, not executable enforcement |
| Launcher | Named linked worktree before CLI start; refuses old bases, conflicting names and startup overrides | Use this supported entry point or native worktree setup |
| Trusted PreToolUse hook | Refuses primary checkout, main/detached task work and explicit tool workdir/file-edit escapes | Supported intercepted tool paths; needs activation/trust |
| SessionStart hook | Reintroduces current workspace and human approval rule on start/resume | Context reminder; not relied on to block execution |
| Installed Git hooks | Refuse commit/push outside a named linked worktree; retain main/tag push guard | Local hooks are not a security boundary against someone disabling them |
| Required CI | Regression tests and committed hook wiring, plus framework/website/demo | Cannot inspect a contributor's local activation or session ownership |
| GitHub main protection | Required approval, green app-bound checks, current branch, resolved conversations | Server-side merge gate; retain admin enforcement |

No local hook guarantees obedience to every instruction. Arbitrary shell commands can change
directories or write absolute paths, free-form patches and remote tools are not fully inspected,
and some tool paths bypass the hook mechanism. A missing interpreter, hook error/timeout or disabled
hook can also prevent interception. Use supported entry points, activation tests and independent
review; stronger isolation needs a managed sandbox/OS policy, outside this repository change.

## Agent task and human decision

Use skill [`preview-pr`](../.ai/skills/preview-pr/SKILL.md) when preparing an interactive PR preview
for human acceptance. It ends at the live-preview handoff; approval and adoption remain separate.

Give the agent the issue, expected outcome, approved spec if applicable, constraints and authorised
actions. A practical brief is: implement and test; push this task branch; open/update its PR;
queue auto-merge after independent agent review. That last action is optional and must be within
the human's task authorisation. Agents handle technical review and test evidence; humans get a
short summary of changed behaviour, screenshots/demo evidence, risks and unresolved decisions.

The implementing agent owns its worktree and fixes review findings. A separate review agent uses
its own worktree/branch at the exact revision. It reports findings and evidence but **never submits
the required human approval**, even if its GitHub CLI is authenticated as a core maintainer.

Piotr or Łukasz makes an explicit acceptance decision after seeing the result; use the short
[staging guide](STAGING_QUICKSTART.md) to request and inspect a preview. Merely adding a reviewer,
reviewing your own change locally, a successful demo or green CI never counts as acceptance.
Agents never auto-approve PRs. Auto-merge may execute only after the required human approval;
it does not replace this extra step.

Piotr or Łukasz manually approves in GitHub. GitHub cannot distinguish a human and an agent sharing
one account, so account credentials are not a technical proof of human action. Also, an author
cannot approve their own PR: an agent PR opened under Piotr's account needs Łukasz's approval, and
vice versa. PRs from an external contributor can be approved by either core maintainer. A dedicated
agent account/App would let either maintainer approve core agent PRs; it is not configured here.
Do not weaken protection or use a self-approval workaround to remove that constraint.

## Auto-merge

Repository auto-merge availability is enabled. When authorised for a specific PR, the agent may
queue GitHub auto-merge; the human's later approval and green required checks permit GitHub to merge.
Use squash for a single-issue PR; preserve child history where appropriate for an integration PR.
Queueing auto-merge is still a merge decision: never enable it outside the task's agreed scope,
never use admin bypass, and do not queue it merely because the repository offers the option.

New changes require refreshed evidence and renewed approval where GitHub dismisses stale reviews.
A main merge does not publish a component tag, flash hardware or deploy a home. Those remain
separate authorised operations. This amendment enables the repository option, not auto-merge of
PR #68; that PR still awaits a human decision.

Sources checked on 2026-10-28: [Codex hooks](https://learn.chatgpt.com/docs/hooks),
[Claude Code hooks](https://code.claude.com/docs/en/hooks),
[GitHub auto-merge](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request),
[GitHub approval constraints](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews).
