# Issues: how to write one, how to check one

For people and agents who file issues on Domosenso or check them. Every issue has the same parts:
the problem, the value, a proposal, testable acceptance criteria, the tests a fix brings, the spec
decision and a privacy check. Then a maintainer can triage it the same way each time, and an
implementer can hold a pull request to it.

- **Forms:** `.github/ISSUE_TEMPLATE/` has one form per type, with the sections below as fields.
- **Checker:** `uv run tools/issue_check.py <file.md>` (a draft) or `--issue <n>` (a filed issue)
  checks everything that can be checked mechanically. It prints `ok` or `FAIL <n> error(s)`.
- **Skills:** `write-issue` drafts issues and user stories from a session, notes or a request;
  `review-issue` checks one and gives a verdict; `triage-issues` ranks the open backlog, proposes
  labels and picks the next issue to work on; `group-issues` groups it and picks the next scope. All three follow this page.

The `release-reminder` issue is written by the Release reminder workflow, not by a person: it
lists components waiting for a tag or the website, is not triaged and closes itself when nothing
is left.

## One issue, one change

An issue is the size of **one pull request**: a reviewer can hold the result against its acceptance
criteria in one sitting. Split it when:

- it touches two areas that can ship apart (a command and a component);
- part of it needs a spec and part does not;
- one part depends on another that is not built yet. File both, and say `Depends on #n` in the
  dependent one.

For a larger theme, file a parent issue that lists its child issues and holds no acceptance
criteria of its own.

## Types and required sections

| Section | bug | enhancement | new | docs |
|---|:-:|:-:|:-:|:-:|
| Type, Area, Spec needed (header fields) | ✓ | ✓ | ✓ | ✓ |
| Summary | ✓ | ✓ | ✓ | ✓ |
| User story | | recommended | recommended | |
| Problem statement | ✓ | ✓ | ✓ | ✓ |
| Evidence | ✓ | optional | optional | optional |
| Value proposition | ✓ | ✓ | ✓ | ✓ |
| Proposed solution | ✓ | ✓ | ✓ | ✓ |
| Alternatives considered | ✓ | ✓ | ✓ | ✓ |
| Acceptance criteria | ✓ | ✓ | ✓ | ✓ |
| Tests required | ✓ | ✓ | ✓ | ✓ |
| Compatibility and upgrade | ✓ | ✓ | ✓ | ✓ |
| Out of scope | optional | optional | optional | optional |
| Privacy check | ✓ | ✓ | ✓ | ✓ |
| Environment | ✓ | optional | optional | optional |

The four types are:

- **bug:** something does not do what its docs say.
- **enhancement:** a new option, behaviour or check in something that exists.
- **new:** a device, a component or a companion service the catalog does not have yet.
- **docs:** field notes, guides, process.

The checker reads `enhancement (false positives)` as `enhancement`, `new device / integration` as
`new`, and `process` as `docs`.

## Header fields and title

An issue written by hand or by an agent starts with one line:

```
**Type:** bug · **Area:** `domosenso verify` · **Spec needed:** no
```

A form asks for the same fields as `Type`, `Area` and `Spec needed`.

- **Area:** the command (`deploy --plan`, `verify`), the component and version (`ramka 0.3.0`),
  the device, the skill or the document.
- **Spec needed:** `yes` for a new component, a new capability of the tools, a schema change or a
  surface in `docs/COMPATIBILITY.md` (AGENTS.md, "Spec first"); otherwise `no`. Add a reason in
  parentheses when it is not obvious: `yes (input schema change)`.
- **Title:** `<area>: <what changes>`, at most 100 characters, no full stop. Examples:
  `verify: wait until Home Assistant is RUNNING before judging entities`, `ramka: tuning sliders
  start at their minimum on a first install`, `New device: Naim Uniti Star as the Ramka's player`.

## What each section must say

| Section | Must say | Not this |
|---|---|---|
| **Summary** | One sentence: what should change. | The story of how it was found. |
| **User story** | `As a <who>, I want <what>, so that <why>.` A real role: home owner, maintainer, contributor, a home's agent. | "As a user, I want it better." |
| **Problem statement** | What happens today, for whom, how often. Observed facts (measured, read from output), with inference marked "inference". Name the code or file involved when known. | A solution in disguise ("there is no X option"). |
| **Evidence** | The `domosenso` lines (`FAIL entities: 5 differences`), log lines, versions, steps to reproduce. Anonymised. | Whole logs; real entity ids or hosts. |
| **Value proposition** | Who gains what: time or risk saved, how many homes, what becomes possible. | "Nice to have." |
| **Proposed solution** | The approach, and every interface it touches: inputs, entity ids, command lines and their output, schema, files. | Code dumps. "Make it work." |
| **Alternatives considered** | At least one real alternative, with why it was not chosen. "Do nothing" counts when its cost is stated. | An empty list. |
| **Acceptance criteria** | Checkboxes, rules below. | Tasks ("write the code"). |
| **Tests required** | Checkboxes naming the test file or check, rules below. | "Add tests." |
| **Compatibility and upgrade** | Stable ids or inputs touched, the version bump, the `UPGRADE.md` / `docs/UPGRADE_NOTES.md` note, what an existing home must do. "None" with a reason when nothing changes. | Silence. |
| **Out of scope** | What a reader might expect that this issue does not do. | |
| **Privacy check** | A ticked box after the text was checked (below). | A ticked box over a leak. |
| **Environment** | HA version and installation type, catalog tag or commit, component versions, target kind, firmware or ESPHome version. | The home's host names. |

## Acceptance criteria

Each criterion:

- is a checkbox (`- [ ]`) that can be ticked on its own, by a test or a single command;
- states an observable result: an exact output line (`FAIL not verified: 1 failed`), an entity
  state, a file's content, a rendered page. Prefer the Given / When / Then form;
- covers one behaviour. Include the failure path as well as the happy path, and the case where
  today's behaviour must stay unchanged ("`--settle 0` behaves exactly as today");
- follows from the proposed solution. Nothing new appears only in the criteria;
- avoids vague words (`works correctly`, `as expected`, `user-friendly`, `etc.`). The checker
  warns on them.

A change with only one criterion is usually under-specified, and the checker warns.

## Tests required

- Name the file and what it covers: `tests/test_cli_verify.py`, `cards/<card>.test.mjs`, a render
  fixture, `tools/ha-check.sh <component>`, `tools/esphome-check.sh <component>`, `catalog_check`.
- **Tests fail first.** For a bug the issue says the test fails before the fix (AGENTS.md, "a fix
  … with a test that fails without it"); the checker requires it. For an enhancement or new work it
  says so too; the checker warns.
- Every acceptance criterion is covered by at least one listed test or check.
- Use fakes, not real devices or a real Home Assistant: `tests/fakes.py`, recorded and redacted
  fixtures with invented values, fake clocks instead of sleeps.
- For docs, list the checks that guard them: `test_privacy`, `tests/test_docs.py` (links), the
  website content check.

## Privacy and anonymisation

Issues are public. Before ticking the box:

- remove real names of people, rooms and places, entity ids, IP and MAC addresses, host names,
  account names, tokens, calendars, album or photo names, floor plans;
- keep what is true for any home: device models, firmware and HA versions, measured values (lux
  levels, delays), the shape of a fix;
- write examples with the demo home: Alex and Sam; Living room, Dining, Kitchen, Office, Bedroom,
  Kids' room, Hall; prefix `ramka`; `sensor.living_room_…`;
- an agent in a home repository passes that home's own words (names, rooms, the calendar's name)
  to the checker with `--forbidden-file <file outside the catalog>`.

The checker flags IP addresses (except loopback and the RFC 5737 documentation ranges), MAC
addresses, e-mail addresses (except `example.com` and the like), home directories and tokens.
Household words are only caught when they are in a `--forbidden-file`.

## Writing an issue (people and agents)

1. Search first: `gh issue list --repo zerostorypoints/domosenso --state all --search "<words>"`.
   Comment on an existing issue rather than filing a duplicate.
2. Read the code or document the issue is about, so the problem statement names what is really
   there. Check the catalog's `main`, not an old checkout.
3. Draft it with the skeleton below. One change per issue.
4. Run `uv run tools/issue_check.py <draft.md>` until it ends `ok`. Fix the warnings, or know why
   each one stays.
5. An agent shows the drafts to its human and files them only after a go-ahead typed in the session
   (filing publishes them): `gh issue create --repo zerostorypoints/domosenso --title "<title>"
   --body-file <body.md>`, where the body is the draft without its `# title` line.
6. Link related issues with a comment (`Depends on #n`, `Related: #n`).

## Checking an issue

**Mechanical:** `uv run tools/issue_check.py --issue <n>` must end `ok`.

**Judgment:** the reviewer then answers each of these questions:

1. **Problem:** is it observed (output, measurement, code read) rather than assumed? Is inference marked?
2. **Value:** does it name who gains and what? Would a maintainer understand why now?
3. **Solution:** does it name every interface it touches? Is it the smallest change that solves the problem?
4. **Alternatives:** is at least one real alternative weighed?
5. **Criteria:** is each one observable and testable on its own? Do they cover the failure path and unchanged behaviour? Does each follow from the solution?
6. **Tests:** does every criterion have a test? Do the tests fail first? Do they use fakes?
7. **Spec decision:** is it right by AGENTS.md "Spec first"? Does the compatibility section match it?
8. **Scope:** is it one pull request? If not, say how to split it.
9. **Duplicates:** is there an open or closed issue on the same thing?
10. **Privacy:** is there any household detail the checker cannot see?

The verdict is one of:

- **ready:** it can be implemented as written;
- **needs changes:** list each finding as `section: what is wrong → what it should say`;
- **split:** give the proposed child issues.

An agent posts the review as a comment only after its human's go-ahead.

## Labels

The forms set `bug`, `enhancement` or `documentation`. A maintainer may add `good first issue`
and `help wanted`.

## Ownership and progress

After `review-issue` gives a `ready` verdict, follow [the team workflow](TEAM_WORKFLOW.md): one
assignee, one task branch, and one status label (`needs-triage`, `ready`, `in-progress`, `in-review`
or `blocked`). A contributor without label permissions asks a core maintainer to record the claim.
A claim comment identifies the branch, scope and dependencies. Read existing claims before starting;
a conflicting claim is resolved by a maintainer, not by racing to push first.

Closing an issue means its agreed change landed. Report the released component version separately;
merging a PR does not mean any home's Home Assistant was updated.

## Skeleton

```markdown
# <area>: <what changes>

**Type:** <bug|enhancement|new device|new component|docs> · **Area:** <command, component version, device, skill or document> · **Spec needed:** <yes|no>

## Summary

<one sentence>

## User story

As a <who>, I want <what>, so that <why>.

## Problem statement

<what happens today, for whom, how often; inference marked>

## Evidence

<output lines, versions, steps to reproduce; anonymised>

## Value proposition

<who gains what>

## Proposed solution

<approach and the interfaces it touches>

## Alternatives considered

- <alternative>: <why not>

## Acceptance criteria

- [ ] Given <state>, when <action>, then <observable result>.
- [ ] <the unchanged case or the failure path>

## Tests required

- [ ] `tests/test_<area>.py`: <what it covers>; it fails before the change.

## Compatibility and upgrade

<stable ids or inputs touched, version bump, UPGRADE note; or "None: <why>">

## Out of scope

<what this does not cover>

## Privacy check

- [x] No real names, rooms, entity ids, IP or MAC addresses, accounts, tokens, calendars or photos; examples use the demo home.

## Environment

<HA version and installation type, catalog tag, component versions, target kind>
```
