---
name: review-issue
description: Check a Domosenso issue or a draft against docs/ISSUES.md, run tools/issue_check.py, answer the review questions and give a verdict of ready, needs changes or split, with findings per section. Use before implementing an issue, when triaging, or when asked whether an issue is correct.
---

# review-issue

The standard is [docs/ISSUES.md](../../../docs/ISSUES.md), "Checking an issue". Read it, and read
the issue in full.

1. **Mechanical check:** `uv run tools/issue_check.py --issue <n>` (or `<draft.md>`). Every
   `error` line is a finding. Each `warn` line is a finding unless the issue explains it.
2. **Read what the issue names** on `main`: the code, the component manifest, the document. A
   problem statement that contradicts the code is a finding. So is a solution that proposes
   something already there.
3. **Search for duplicates:** `gh issue list --repo zerostorypoints/domosenso --state all
   --search "<words>"`.
4. **Answer the ten questions** of "Checking an issue": problem, value, solution, alternatives,
   criteria, tests, spec decision, scope, duplicates, privacy. One line each: `ok`, or the
   finding.
5. **Verdict** in this shape:

   ```
   #<n> <title>
   issue_check: ok | FAIL <n> error(s)
   verdict: ready | needs changes | split
   - <section>: <what is wrong> → <what it should say>
   - split: <child issue title> / <child issue title>   (verdict split only)
   ```

6. **Do not fix silently.** Report to the human. A comment on the issue, an edit of its body or a
   new label needs a go-ahead typed in this session. The issue's author owns its text: propose
   changes, and edit only your own issues.

Before implementing an issue, its verdict must be `ready`. The tests it lists are written first and
fail before the change (skill `check`, AGENTS.md "Spec first").
