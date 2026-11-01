---
name: group-issues
description: Group the open Domosenso issues into scopes of related work, rank the groups and take the first as the next scope - a feature branch with a coordinator, one pull request per issue. Use when asked to triage the backlog into groups, to choose the next scope or batch of work (several related issues rather than one), or to plan a feature branch from open issues.
---

# group-issues

`triage-issues` picks one issue. This skill picks a **group**: the issues that one coordinator
lands together on a `feature/<topic>` branch (AGENTS.md, "Plans that span several pull requests").
It uses the same standards: [docs/ISSUES.md](../../../docs/ISSUES.md) and
[docs/TEAM_WORKFLOW.md](../../../docs/TEAM_WORKFLOW.md). It reads freely and writes nothing to
GitHub until the human says so.

`<repo>` is `zerostorypoints/domosenso` unless the human names another. Issues about one home
belong to that home's repository, not here: check `git remote -v` before concluding the backlog is
empty. `<client>` is the agent's branch prefix from TEAM_WORKFLOW (`claude`, `codex`).

## 1. Collect and check

Do steps 1 and 2 of skill `triage-issues`, with these additions:

- **Read `main` in a detached worktree**: `git fetch origin` in the shared clone (it moves only the
  remote refs), then `git worktree add --detach <scratch>/main origin/main`. Never read the shared
  checkout: it may be on someone else's branch, with components and fixes missing. Remove the
  worktree when done.
- **Find what already landed, for every issue, not only bugs:**
  `git log origin/main --oneline --grep="#<n>\b"`. One commit can deliver several issues. Read the
  commit before calling an issue delivered, and compare its date with the issue's `createdAt`: an
  issue filed after a related commit usually describes what that commit left.
- **Stale claims:** an issue labelled `in-review` whose delivering PR (named in its comments) is
  merged. Check with `gh pr view <n> --json state,mergedAt`.
- **Stale blockers:** a `Depends on #n` or "depends on the release of …" whose issue is closed or
  whose PR is merged no longer blocks.
- An issue without the header line (`Type`, `Area`, `Spec needed`) gets `?` for each in the report;
  its first step is rewriting it (skill `write-issue`). Do not guess the values.

Sort every issue into one of:

| kind | meaning | where it goes |
|---|---|---|
| claimed | assignee, or `in-progress` / `in-review` / `blocked`, and its PR not merged | `claimed:` |
| delivered | its change is on `main` (a merged PR or a commit found above) | `close:` |
| superseded | a later spec or decision replaced it | `close:` as the maintainer's call |
| partly delivered | part of it is on `main` | grouped, with a comment saying what is left |
| open | none of the above | grouped |

## 2. Group

Put each grouped issue into exactly one group. Issues share a group when they:

- change the same files or interface (one template, one command, one card), so separate branches
  would conflict; or
- one unblocks or changes the design of another (`Depends on`, "whichever lands second rebases"); or
- ship in the same component version bump.

A shared label (`area:ramka`) alone is not a reason: most of the backlog may carry it. Name each
group by what it delivers ("restart-safe deploys"), not by its area. A group holds one to five
issues; split a larger theme by interface. An issue that fits nowhere is a group of one. A parent
issue goes with its children; with none filed, it is a group of one. The `release-reminder` issue
is not grouped.

## 3. Rank the groups

Compare groups by, in order:

1. the best `priority-*` label among its members (a maintainer's `priority-high` puts its group first);
2. a bug still on `main` that leaves a home broken or dark, without a workaround, before one with;
3. a group that unblocks other issues or a release;
4. more **startable** members: `Spec needed: no` and `issue_check ok` (not the `ready` label, which
   needs a `review-issue` verdict);
5. fewer specs to write;
6. fewer pull requests;
7. the oldest member.

Mark impact and size judgements as inference.

## 4. Scope the first group

Run skill `review-issue` on each member of the first group; the report carries its verdict and
findings only. Then lay out the scope:

- branch `feature/<topic>` from `main`;
- the members in merge order: dependencies first, then `Spec needed: no` before `yes`; a spec is
  written (skill `write-component-spec`) and stops for approval before its code;
- per member: the first step (the issue's text fixed, the failing test, or the spec), the files it
  touches, and its sub-branch `<client>/<n>-<slug>`;
- near neighbours left out, and why.

## 5. Report and stop

```
backlog: <open> open = <claimed> claimed + <close> to close + <grouped> grouped + 1 release-reminder
groups (ranked):
1. <name>  <n> issues  startable <n>/<n>  specs <n>
     #<n> <priority> <type> spec <yes|no|?> issue_check <ok|FAIL n>  <title>
     why first: <the rule and the facts>
2. ...
claimed: #<n> <owner> (<status>, PR #<n>)
close: #<n>,... <delivered by PR #<n> | commit <sha> (<date>) | superseded by <spec>, maintainer's call>
stale blockers: #<n>,... wait on <#m | PR #m>, <merged|closed> on <date>
partly delivered: #<n> <what landed, what is left>

next scope: <group name>, feature/<topic>
  1. #<n> verdict <ready|needs changes|split>
       findings: <section: what is wrong → what it should say>
       first step: <...>  files: <...>  branch: <client>/<n>-<slug>
  2. ...
  left out: #<n> <why>

proposed writes:
  labels: ...
  comments: #<n> <one line>
  close: #<n> <reason>
  claim: #<n>,... assignee <the human who approves>, in-progress
  branch: push feature/<topic>
```

Ask **one** question: which writes to make and whether to start the scope. Labels, comments,
closing, claims and pushing the feature branch each need a go-ahead typed in this session.

## 6. After the go-ahead

The session becomes the scope's coordinator (AGENTS.md, "Plans that span several pull requests"):
it creates and pushes the feature branch, claims each member as `triage-issues` step 6 says, works
members in order (itself or in sub-sessions, each in its own worktree), and merges each sub-branch
into the feature branch after reading its diff against the issue. One pull request from the
feature branch into `main` at the end, with a line per issue; merging it is a separate go-ahead.
