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
empty.

## 1. Collect and check

Do steps 1 and 2 of skill `triage-issues`, with these additions:

- **Read `main` in a detached worktree** (`git worktree add --detach <scratch>/main origin/main`),
  not the shared checkout: it may be on someone else's branch, with components and fixes missing.
  Remove the worktree when done.
- `issue_check --issue <n>` takes several seconds per issue; run the loop over all of them in the
  background and read the code meanwhile.
- **Stale claims:** an issue labelled `in-review` whose delivering PR (named in its comments) is
  merged is a close candidate. Check with `gh pr view <n> --json state,mergedAt`.
- **Stale blockers:** a `Depends on #n` or "depends on the release of …" whose issue is closed or
  whose PR is merged no longer blocks. Note it; the comment needs updating.
- **Bugs:** read the code each one names on `main`. Compare the fix commit's date with the issue's
  `createdAt` before calling it fixed: an issue filed after a related commit usually describes what
  that commit left.

## 2. Group

Put each unclaimed issue into exactly one group. Issues share a group when they:

- change the same files or interface (one template, one command, one card), so separate branches
  would conflict; or
- one unblocks or changes the design of another (`Depends on`, "whichever lands second rebases"); or
- ship in the same component version bump.

A shared label (`area:ramka`) alone is not a reason: most of the backlog may carry it. Name each
group by what it delivers ("restart-safe deploys"), not by its area. A group holds one to five
issues; split a larger theme by interface. An issue that fits nowhere is a group of one. Parent
issues (no acceptance criteria) go with their children. The `release-reminder` issue is not grouped.

## 3. Rank the groups

Rank each group by its highest-ranked member under `triage-issues` step 3 (a maintainer's
`priority-high` places its whole group first). Break ties by:

1. more members ready to start (`Spec needed: no` and `issue_check ok`);
2. fewer specs to write and approve;
3. fewer pull requests.

Mark impact and size judgements as inference.

## 4. Scope the first group

Run skill `review-issue` on each member of the first group. Then lay out the scope:

- branch `feature/<topic>` from `main`;
- the members in merge order: dependencies first, then `Spec needed: no` before `yes`; a spec is
  written (skill `write-component-spec`) and stops for approval before its code;
- per member: the first step (the failing test, the spec, or the findings for its author), the files
  it touches, and its sub-branch `<client>/<n>-<slug>`;
- what stays out of the group and why, when a near neighbour was left out.

A member whose `issue_check` fails or whose verdict is `needs changes` starts with the fix to its
text (skill `write-issue`; the author edits their own issue).

## 5. Report and stop

```
backlog: <n> open, <n> claimed, <n> grouped
groups (ranked):
1. <name>  <n> issues  ready <n>/<n>  specs <n>
     #<n> <priority> <type> spec <yes|no> issue_check <ok|FAIL n>  <title>
     why first: <the rule and the facts>
2. ...
claimed: #<n> <owner> (<status>, PR #<n>)
close candidates: #<n> <reason>
stale blockers: #<n> waits on #<m>, which <merged|closed> on <date>

next scope: <group name>, feature/<topic>
  1. #<n> <first step>  files: <...>
  2. ...
  left out: #<n> <why>

proposed writes:
  labels: ...
  comments: #<n> <one line>
  close: #<n> <reason>
  claim: #<n>,... assignee <human>, in-progress
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
