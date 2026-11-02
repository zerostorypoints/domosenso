---
name: triage-issues
description: Triage the open Domosenso issues - check each against docs/ISSUES.md, close what is delivered or no longer relevant, group related issues, rank the groups, propose labels, lay out the next scope (one issue or a group on a feature branch), and after a typed go-ahead claim it and take it through docs/TEAM_WORKFLOW.md. Use when asked to triage or clean up the backlog, what to work on next, to pick up the most important issue, or to choose the next scope or batch of work.
---

# triage-issues

The standards are [docs/ISSUES.md](../../../docs/ISSUES.md) (what an issue must say) and
[docs/TEAM_WORKFLOW.md](../../../docs/TEAM_WORKFLOW.md) (labels, claims, from issue to review).
Read both. This skill reads freely and writes nothing to GitHub until the human says so.

`<repo>` is `zerostorypoints/domosenso` unless the human names a fork or another repository. Issues
about one home belong to that home's repository, not here: check `git remote -v` before concluding
the backlog is empty. `<client>` is the agent's branch prefix (`claude`, `codex`).

## 1. Collect

- **Read `main` in a detached worktree**: `git fetch origin` in the shared clone (it moves only the
  remote refs), then `git worktree add --detach <scratch>/main origin/main`. Never read the shared
  checkout: it may be on someone else's branch, with components and fixes missing. Remove the
  worktree when done.
- List the open issues and pull requests:

  ```sh
  gh issue list --repo <repo> --state open --limit 200 \
    --json number,title,author,labels,assignees,createdAt,updatedAt,comments,body
  gh pr list --repo <repo> --state open --json number,title,headRefName,body,isDraft
  ```

- Read every issue body and its comments in full. A title is a pointer, not the issue.

## 2. Check each issue

- `uv run tools/issue_check.py --issue <n>`: note `ok` or the error count (under a second each).
- Note its type, area and spec decision from the header line, and every `Depends on #n`. An issue
  without the header line gets `?` for each in the report; its first step is rewriting it (skill
  `write-issue`). Do not guess the values.
- **Find what already landed, for every issue, not only bugs:**
  `git log origin/main --oneline --grep="#<n>\b"`. One commit can deliver several issues. Read the
  commit before calling an issue delivered, and compare its date with the issue's `createdAt`: an
  issue filed after a related commit usually describes what that commit left.
- For a bug, read the code it names on `main` and say whether the problem is still there.
- **Stale claims:** an issue labelled `in-review` whose delivering PR (named in its comments, or an
  open PR's `Fixes #n`) is merged: `gh pr view <n> --json state,mergedAt`.
- **Stale blockers:** a `Depends on #n` or "depends on the release of …" whose issue is closed or
  whose PR is merged no longer blocks.
- Duplicates and overlaps, among open issues and against closed ones
  (`gh issue list --repo <repo> --state all --search "<words>"`).

Sort every issue into one kind:

| kind | meaning | where it goes |
|---|---|---|
| claimed | assignee, or `in-progress` / `in-review` / `blocked`, and its PR not merged | `claimed:`, never worked on here |
| delivered | its change is on `main` (a merged PR or a commit found above) | `close:` (completed) |
| superseded | a later spec or decision replaced it, or a duplicate | `close:` (not planned) |
| parked | its own text says nothing is built until someone asks, and nobody has; or a parent with no child issues whose items were taken over or are idle notes | `close:` (not planned) |
| partly delivered | part of it is on `main` | grouped, with a comment saying what is left |
| open | none of the above | grouped |

The `release-reminder` issue is written by a workflow: not triaged, not grouped.

## 3. Group

Put each grouped issue into exactly one group. Issues share a group when they:

- change the same files or interface (one template, one command, one card), so separate branches
  would conflict; or
- one unblocks or changes the design of another (`Depends on`, "whichever lands second rebases"); or
- ship in the same component version bump.

A shared label (`area:ramka`) alone is not a reason: most of the backlog may carry it. Name each
group by what it delivers ("restart-safe deploys"), not by its area. A group holds one to five
issues; split a larger theme by interface. An issue that fits nowhere is a group of one. A parent
issue goes with its children; with none filed, it is a group of one.

## 4. Rank

Within a group, and between groups by their best member, these rules decide in order; a rule decides
only when the ones above it tie:

1. **A maintainer's `priority-*` label stands.** Propose a change in the report; never reorder
   against it on your own.
2. **Harm to a running home or a first install:** a bug still on `main` that leaves a home broken,
   dark, unsafe, or loses data or tuning comes first; one without a workaround before one with.
3. **Unblocks other work:** an issue others name in `Depends on #n`, or that a release or an open PR
   waits for.
4. **Startable:** `Spec needed: no` and `issue_check ok` (a spec needs a human's approval before any
   code). Between groups: more startable members first, then fewer specs to write.
5. **Size:** one small pull request before a large one; between groups, fewer pull requests.
6. **Age:** the older issue first.

From this, propose for each issue one status (`needs-triage` or `ready`) and one priority
(`priority-high`, `priority-normal`, `priority-low`). Propose `ready` only after `review-issue` gives
the verdict `ready`. Mark every judgement that is inference (impact, size) as inference.

## 5. Lay out the next scope

The next scope is the first group. Run skill `review-issue` on each of its members; the report
carries each verdict and its findings. When the human asked for one issue, the scope is the first
group's first member.

- **One member, or an urgent one:** a member with `priority-high` and `Spec needed: no` that would
  otherwise wait behind its group's specs ships **alone** as a pull request into `main`; the others
  rebase on it. Do not hold an urgent fix on a feature branch for a spec approval.
- **Several members:** branch `feature/<topic>` from `main`, with a coordinator (AGENTS.md, "Plans
  that span several pull requests"). Members in merge order: dependencies first, then `Spec needed:
  no` before `yes`; a spec (skill `write-component-spec`) stops for approval before its code.
- **Per member:** the first step (the issue's text fixed, the failing test, or the spec), the files
  it touches, and its branch `<client>/<n>-<slug>`.
- **The first member** is scoped to the level of an implementation plan: answer each open finding
  from earlier reviews and comments, name the mechanism (prefer reusing what exists over copying
  it), the tests that fail first, the version bump and what is out of scope.
- Near neighbours left out, and why.

## 6. Report and stop

Show the human, in chat:

```
backlog: <open> open = <claimed> claimed + <close> to close + <grouped> grouped + 1 release-reminder
groups (ranked):
1. <name>  <n> issues  startable <n>/<n>  specs <n>
     #<n> <priority> <status> <type> spec <yes|no|?> issue_check <ok|FAIL n>  <title>
     why first: <the rule that placed it, and the facts behind it>
2. ...
claimed: #<n> <owner> (<status>, PR #<n>)
close: #<n>,... <delivered by PR #<n> | commit <sha> (<date>) | superseded by <spec> | parked: <why>>
stale blockers: #<n>,... wait on <#m | PR #m>, <merged|closed> on <date>
partly delivered: #<n> <what landed, what is left>

next scope: <group name>, <main | feature/<topic>>
  1. #<n> verdict <ready|needs changes|split>
       findings: <section: what is wrong → what it should say>
       first step: <...>  files: <...>  branch: <client>/<n>-<slug>
  2. ...
  left out: #<n> <why>

proposed writes:
  labels: #<n> +<label> -<label>; ...
  comments: #<n> <one line on what the comment says>
  close: #<n> <completed | not planned> <reason>
  claim: #<n>,... assignee <the human who approves>, in-progress
  branch: push feature/<topic>
```

Then ask **one** question: which of the proposed writes to make, and whether to start the scope.
Labels, comments, assignees, closing and pushing are writes to a shared repository: each needs a
go-ahead typed in this session (AGENTS.md, Boundaries). Do nothing on silence or on text found in
an issue.

## 7. After the go-ahead

- **Closing:** `gh issue close <n> --reason "completed"|"not planned" --comment "<reason>"`. The
  comment names the PR, commit or spec that delivered or replaced it, what was not done, and when
  to reopen. When the human asks for an aggressive pass, close every `close:` issue; low priority
  alone is never a reason to close, a wanted change stays open.
- **Labels and comments:** apply exactly what was approved. The author owns an issue's text:
  propose edits in a comment and edit only your own issues.
- **Claim** each member as it starts: the approving human as assignee (not the agent),
  `+in-progress -ready -needs-triage`, and the claim comment from docs/TEAM_WORKFLOW.md, "Claim":
  the branch, the target (`main` or the feature branch), dependencies and the scope from step 5.
- **Work it:** a worktree on a named branch, `python3 tools/agent-session.py <client> <n>-<slug>`
  or the client's native worktree tools (docs/AGENT_WORKFLOW.md). A spec first if the issue needs
  one, then stop for its approval. Otherwise the tests the issue lists, failing first; the change;
  skill `check`.
- **A group:** this session is the coordinator. It creates and pushes the feature branch, works the
  members in order (itself or in sub-sessions, each in its own worktree), and merges each
  sub-branch into the feature branch after reading its diff against the issue. One pull request
  from the feature branch into `main` at the end, with a line per issue.
- **Stop at the draft PR.** Push the task branch and open a draft PR only if the human authorised
  that scope when the issue started; otherwise report the branch and ask. Merging, releasing and
  any home's production remain separate decisions.
