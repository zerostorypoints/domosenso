## Problem and resulting behaviour

<!-- What triggers the problem, and what changes for a person using DomoSenso? -->

## Issue and approved scope

<!-- Link issue and, when needed, the approved spec. Name dependencies or out-of-scope follow-ups. -->

## Compatibility and release

<!-- Components and proposed version, inputs/entities/CLI changes, upgrade notes and existing-home steps.
     If none, explain why. A merge does not publish a tag or deploy a home. -->

## Verification

<!-- Commands and actual results; regression failing before/passing after where applicable.
     Distinguish partial checks, full CI, running HA, browser and physical-device evidence. -->

- Full catalog checks:
- Applicable staging scenarios (first install, upgrade, restart, reconnect):
- UI screenshots / device evidence, or why not applicable:
- How to open the interactive staging preview (credentials supplied privately), tested SHA and things to try:
- Known limitations:

## Website impact

Use `domosenso-website-audit` for the merge/release handoff.

- Catalog and version availability:
- Examples and default/conditional views:
- Hardware and installation guides:
- Onboarding and upgrade documentation:
- Journal, homepage and release ledger:
- Changed pages (from tools/website_changes.py):

For each, record update, no change with a reason, or deferred with evidence and follow-up.
After merge verify the actual target/revision; after a new tag verify release availability.
A feature-branch merge is not a public main release. Link the audit note when one is needed.

## Review and handoff

- [ ] Every local session used its own worktree and named branch, including reviews.
- [ ] Examples and evidence contain no household identifiers, credentials or private media.
- [ ] The change matches the issue/spec and includes its required tests.
- [ ] Independent agent review findings and verification evidence are recorded for this revision.
- [ ] A core maintainer has enough evidence to manually accept the behaviour and risks.

<!-- Owner, branch/SHA, remaining work and next action when handing over an incomplete change. -->
