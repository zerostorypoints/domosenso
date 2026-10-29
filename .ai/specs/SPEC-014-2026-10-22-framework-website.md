# SPEC-014: Public framework website and publication data

Status: the website design and launch plan were approved by the maintainer on 2026-10-22.
This specification records the approved exporter contract in the framework repository.

## Intent

An English-only framework website at domosenso.org lets people inspect released components,
follow agent-assisted onboarding into their own home repository, and contribute improvements.
The commercial offer stays on domosenso.com (EN/de-CH); domosenso.ch redirects there.
The framework site's source lives in website/, deployed separately as static Next.js output
on Cloudflare Pages. It contains no Home Assistant connection, account system or AI API.

## Publication contract

website/content/publication.json selects a framework commit, component id/version/tag/commit
records, and public documents with explicit path and slug. The exporter reads component data
at the selected tags, verifies immutable commit identities and produces deterministic JSON.
Missing tags or documents, a changed tag, an invalid identifier/version, or an unapproved path
fails generation. Selected tags must exist in the public remote before launch; CI checks this.
No research folder or .ai document is implicitly published as a page.

Each component entry contains id, version, sourceTag, sourceCommit, summary, requirements,
integrations, installationRole (installs/describes), testedHa, testedEspHome, testedHomes
(number or null), limitations, input summaries, sourceUrl and upgradeUrl when available.
Missing field evidence stays missing; zero homes and unknown homes are distinct. Descriptive
components do not claim to install an integration. Requirements and prose come from the
selected release, not HEAD. Explicit editorial limitations may supplement the manifest.

uv run tools/export_website.py writes website/src/generated/catalog.json and
website/content/docs.generated.json. --check exits nonzero if either differs or is absent.
This is build tooling, not a new domosenso home command. Hosting consumes committed snapshots
and does not require Python, Git credentials or live APIs at page runtime.

## Website and verification

Public routes: /, /get-started/, /components/, /components/<id>/, /docs/,
/docs/<slug>/, /contribute/, /releases/, /professional-services/.
All essential content is static HTML; unknown routes return 404. Canonical origin is
https://domosenso.org. Preview pages are not indexed. The existing root card-test setup is
unchanged; website has independent Node dependencies and checks.

Tests cover provenance failures, public document boundaries, deterministic output, missing and
zero field evidence, component role, navigation, source links, keyboard use, mobile/desktop
layout, direct deep links and 404s. Existing privacy checks include website source/generated
content while excluding build outputs and dependencies.

The public repository and site launch depend on the approved license and disclosure review.
A public alpha must disclose Container support and limited field evidence. No invented
commercial references, endorsements, guaranteed installation times or savings.

## Editorial extension approved in conversation — 2026-10-23

The maintainer asked to extend the accepted installation-journal style across all .org pages,
lead with a clear framework and AI onboarding explanation, and present the project as an open
foundation for other builders, not primarily an individual's contribution. Open Mercato's official
site (https://www.openmercato.com/) was inspected as a positioning reference: definition, reusable
modules, agent conventions, separate implementation and contribution paths. Its visual identity,
claims of scale, quantitative speed claims and partner network are not copied.

Approach: retain the approved editorial design and add a product introduction before the field
journal. A personal-journal-first home no longer fits the request; a generic SaaS landing page
would discard the accepted direction. Shared paper/ink/orange colors, serif headings, readable
body text, monospaced captions and ruled lists extend to guides, catalog, details, releases,
contribution and services. Installation 001 stays clearly labeled as maintainer field evidence.
AI is a local coding-agent workflow using repository skills, contracts and tools; examples are
illustrative, and live changes require approval. No browser AI chat or HA connection is added.

Implementation sequence (same Next static-export worktree and approved architecture):
1. Shared shell, navigation and editorial styles; catalog becomes a readable component index.
2. Framework-first homepage and concrete AI workflow; onboarding prompt and contribution paths.
3. Remaining page structures, docs navigation, full existing requirement details, and services.
4. Desktop/mobile route and interaction checks, actual screenshots, lint/build/unit/privacy checks.

Review focus: narrow screens and long source text; menu behavior after client navigation; one
clear h1 per page; complete device prerequisite fields; no invented community or live-AI claims.
External publication remains a separate launch step. This request extends the accepted design;
no additional design-choice or publication approval is inferred.

## Visual catalog and journal extension — approved 2026-10-28

The maintainer approved the design in
`docs/superpowers/specs/2026-10-28-component-browser-journal-design.md` and instructed immediate
implementation. The implementation plan is under `docs/superpowers/plans/` for that date.

The publication gains a documentationCommit. Optional equipment is exported alongside required
equipment. Release-bound component editorial records, explicit hardware records/assets and
Markdown journal entries generate `website/src/generated/content.json`. Draft articles never
enter the generated snapshot. Existing device guides and selected component Markdown are
allowlisted; wiring assets are copied from the pinned documentation commit. New routes are
`/devices/<id>/`, `/journal/`, `/journal/<slug>/` and `/journal/feed.xml`.

Public ref verification checks main ancestry as well as immutable remote tags. Historical
article release refs remain independent of current catalog selections. Examples are local,
fictional illustrations; they do not operate devices or claim to be HA screenshots. An agent
skill audits the website at merge and release; it does not introduce automatic publishing.
