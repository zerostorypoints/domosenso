---
name: domosenso-website-audit
description: Use when preparing or completing a DomoSenso framework PR merge, publishing a component release, or reviewing domosenso.org for drift from the public framework repository.
---

# DomoSenso website audit

Keep the English framework website in `website/` aligned with publicly available behavior.
The commercial site and private home projects are separate. This skill is an agent procedure,
not a scheduled job or a GitHub event listener. Follow the session's authorization and AGENTS.md
for pushes, PRs, merges and publishing; an audit does not grant permission to perform them.

## Evidence before publication

Read the actual PR base, merge commit, changed paths and relevant tags. Fetch public refs and
verify ancestry against the actual remote main. A PR merged into a feature branch is not on
main. A version in a manifest is not a published release. Never create or move tags to make a
website audit pass.

`uv run tools/release_status.py` lists what is untagged or unpublished on this commit (the open
`release-reminder` issue shows the same for main). Compare that range with `website/content/publication.json`, the editorial records under
`website/content/`, and existing notes under `docs/website-audits/`. The catalog uses exact tags
and full SHAs; device guides have a separately pinned documentation SHA. View records name both
the data provider and rendering owner. Check their conditions against the selected release,
not a working-tree template. Historical journal release references stay fixed.

Assess every surface with a concrete result:

| Surface | Check |
| --- | --- |
| Catalog | outcome, selected version, role, local/cloud dependencies, field evidence |
| Examples and views | behavior, defaults/conditions, owner, preview and tested layout |
| Hardware | required/optional models, power, firmware, wiring and pin tables |
| Guides | onboarding, installation, upgrade steps and pinned source links |
| Journal and homepage | reader-visible news, related articles, accurate installation evidence |
| Release ledger | public tag and commit, availability, useful upgrade link |

For each use `update`, `no change — <reason>`, or `deferred — <missing evidence and follow-up>`.
If the diff is unknown, defer with the missing evidence rather than guessing no change.
A test-only internal refactor may need no website changes. A published version changing view
defaults needs updated examples and view metadata, not just a new version label. Missing tags
need a release follow-up; feature-branch work stays unpublished or explicitly labeled preview.

## The Release workflow's pull request

For a new tag the `Release` workflow (SPEC-027) opens `website: publish <id> <version>` (label
`website-publish`) with the mechanical part done by `tools/publish_release.py`: the selection, the
component's views and devices. Work on that branch: its body quotes the upgrade notes and lists what
is left. Run the tool yourself (`uv run tools/publish_release.py <id>`) for a tag made by hand.

## Prepare and verify

Prepare authorized edits on an owned named branch. Choose a journal article only when there is
something useful to explain; related PRs may share one article. Drafts stay excluded from routes,
client data, feed and sitemap. Reuse public or specifically approved assets; private household
configuration, photographs and identifying details are not website sources. General asset
permission does not widen the repository photo exception; apply any specific user authorization
together with crop/redaction, metadata and provenance checks.

From the framework root regenerate and check:

```sh
uv run tools/export_website.py --verify-remote
uv run tools/export_website.py --check --verify-remote
```

Run the relevant content/privacy tests and website checks described in `website/README.md`.
Inspect desktop and mobile when presentation changes; preserve analytics consent behavior.
Before the PR is ready, list the pages it changes and paste the list under "Website impact":

```sh
uv run tools/website_changes.py --base origin/main --preview-url <preview URL>
```

Check each listed route on the preview. Draft routes exist only there. After merge, open the
same routes on https://domosenso.org (`--format urls` prints them without drafts).
Agent files: `/llms.txt` lists every published how-to and component, and a changed page's
`index.md` matches the page (`e2e/agent-files.spec.ts` checks the build; look at one live).

### Tell the search engines

After merge, once the live routes are checked:

1. Wait until https://domosenso.org/build.json shows the merge commit.
2. Confirm the `IndexNow` workflow run for the merge commit succeeded.
3. Resubmit `https://domosenso.org/sitemap.xml` to the Search Console property
   `sc-domain:domosenso.org` and to the Bing Webmaster site `https://domosenso.org/`, with the
   session's connected Search Console and Bing Webmaster tools.
4. Record both results in the audit note. Report a failure; do not retry in a loop.

These accounts belong to a maintainer. A contributor without them leaves this step to a maintainer.
A later CI job could do it: a Google service account added as a property user, its key in a secret
available only to `main` workflows.

Run repository-required checks before committing. If deployment is authorized, independently
check live changed routes, versions, source links and sitemap/feed after deployment. Report
local, merged and live status separately; a green build is not proof of current production.

## Close without a loop

Before merge, assess impact so content can travel with the change. After merge, verify the actual
merged revision. Audit again when a missing tag is published. Record source range/PR, affected
surfaces, changes, checks, publication status and deferred work in a dated note under
`docs/website-audits/`. Do not include tokens, private paths or household identifiers.

Deduplicate by reviewed range and release versions. For an audit-note-only PR, return a short
no-impact result rather than creating another audit note. A website correction verifies the
existing note; it does not require a recursive audit PR or blog article. End with the concrete
remaining work, including release or production verification when still pending.

A deferred tag follow-up is a recorded next action, not monitoring. Do not promise an automatic
notification or retry unless the user separately requested an automation. Check actual rendered
routes as well as shared data: component details, `/releases/`, journal articles and homepage.
