---
name: write-issue
description: Draft Domosenso issues and user stories that follow docs/ISSUES.md, from a request, notes or the sessions of a home, check each with tools/issue_check.py and file them only after a typed go-ahead. Use when asked to report a bug, propose an enhancement, a device or a component, or turn what a home learned into issues.
---

# write-issue

The standard is [docs/ISSUES.md](../../../docs/ISSUES.md); read it first. This skill is the
procedure.

1. **Collect.** From the request, notes, or a home's sessions and git log, list each candidate:
   - what went wrong (a `FAIL` line, a fix that took several attempts);
   - where time went (repeated deploys, debugging, manual steps);
   - what the home built that the catalog lacks (a device, a local package, a card);
   - mistakes that a check or a doc would have caught.
   For each one, note the evidence: the output line, the measured value, the commit.
2. **Keep only what holds for any home.** Drop anything that only describes that home. Every
   candidate becomes one change the size of one pull request. Split candidates that are bigger
   (docs/ISSUES.md, "One issue, one change").
3. **Check the catalog's `main`** (`git fetch` and read the files it touches, or the GitHub API),
   so that nothing proposes what is already there. Search for duplicates with `gh issue list --repo
   zerostorypoints/domosenso --state all --search "<words>"`.
4. **Draft** each one in the skeleton from docs/ISSUES.md, in a scratch directory, never inside a
   home repository or the catalog checkout:
   - the problem is observed facts, with inference marked;
   - the value says who gains what;
   - the solution names the interfaces it touches;
   - at least one alternative;
   - the acceptance criteria are observable, one behaviour each, and include the unchanged case;
   - every test is named, and for a bug it fails before the fix;
   - the spec decision follows AGENTS.md "Spec first";
   - add a user story for enhancements and new work.
5. **Anonymise.** Use demo-home examples (Alex and Sam). In a home repository, write that home's
   own words (people, rooms, the calendar's or account's names) to a file in the scratch directory
   and pass it with `--forbidden-file`.
6. **Check** each draft: `uv run --project <catalog> python <catalog>/tools/issue_check.py <draft.md>
   --forbidden-file <words>`. Repeat until it ends `ok`. Fix the warnings or know why each stays.
7. **Show** the human one table (number, title, type, spec yes or no), and point to the drafts.
   Filing publishes them, so wait for a go-ahead typed in this session.
8. **File** with `gh issue create --repo zerostorypoints/domosenso --title "<title>" --body-file
   <body>`, where the body is the draft without its `# title` line. Then run `issue_check.py
   --issue <n>` on each filed issue, and link related ones with a comment (`Depends on #n`,
   `Related: #n`).
9. **Report** the issue links, and remove the scratch drafts.
