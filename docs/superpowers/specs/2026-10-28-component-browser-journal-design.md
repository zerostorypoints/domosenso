# Visual component browser, journal and website audit

Status: approved in conversation on 2026-10-28; implemented on the accompanying named branch.
Date: 2026-10-28. Source language: English. Discussion language: Polish.
Base reviewed: public main at 5b012718dcce57a386b1f3cfe87b8d7512c39b2f.
Independent builder review: no important unanswered planning questions (2026-10-28).
Draft checks: repository privacy scan and relative-document-link check passed. Implementation
and production checks below are acceptance criteria, not checks performed on an implementation.

## Intent and decisions

Help a prospective builder understand what each DomoSenso component does, what hardware it
needs, how that hardware connects, and what they will see after configuring it. Connect this
catalog to a small journal of releases, updates and real installation stories. Keep the public
website aligned with framework changes through an agent skill invoked around PR merges.

The maintainer selected a visual catalog with interactive examples on 2026-10-28, together
with the journal and merge audit. He also requested wiring diagrams where installation involves
cables, reusing existing diagrams and adding new ones when necessary. He can supply photographs;
their absence must not block a useful first version.

This document specifies that chosen direction. File formats, initial scenarios and the audit
mechanism below are design proposals, not decisions already approved by the maintainer.

### Approaches considered

1. Photo/screenshot catalog: easiest to maintain, but does not demonstrate cause and effect.
2. **Selected: curated interactive examples within the static website.** Small deterministic
   demonstrations explain a component and link directly to its requirements and instructions.
   More work than screenshots, but bounded and usable without a live Home Assistant instance.
3. Full simulated home: allows broad exploration but adds a second application and a much larger
   compatibility surface. Not needed for this first catalog expansion.

## Existing evidence and constraints

- The framework website is already in `website/`, with Next.js static export, React, TypeScript,
  Tailwind, committed JSON content and Cloudflare Pages. Preserve that architecture.
- `SPEC-014` defines immutable publication selection. The exporter reads exact component tags
  and selected documentation commits; it must continue to do so.
- The publication currently contains ten components. Its Ramka entry is 0.2.0; the public remote
  contains a 0.3.0 tag. Main also has newer awnings and presence manifests; a manifest version
  alone is not evidence of a published tag. Recheck every selected version during implementation.
- Main contains device guides and SVG wiring for Atom Lite + HLK-LD2410C and Atom Lite + CC1101,
  tablet setup documentation and Ramka photo documentation. They are not currently all surfaced
  as website guides.
- The homepage already has an installation-journal visual language, approved photographs,
  Installation 001 and a short Ramka 0.2.0 editorial entry. There is no independent journal route.
- Some PRs merged on 2026-10-28 target a feature branch, not main. For example PR 67's local HA
  demo is not a released website dependency. Do not describe feature-branch work as shipped.
- A private historical wiring reference was located, but no household material has been copied.
  Public guides need a generic, model-specific reconstruction with verified sources.
- The framework website is English-only. The commercial website and its EN/de-CH routes are
  outside this change. Private home repositories, credentials and production devices are outside
  this change. Never record their paths or identity mapping in public content.

## Visitor journeys and navigation

Primary journey: choose a need -> try an example -> inspect hardware and views -> follow setup
instructions -> use the existing agent-assisted onboarding path.

Secondary journeys: inspect a release's practical effect; read an installation story and open
the components it uses; contribute evidence or documentation through existing contribution paths.

Navigation: Get started, Components, Docs, Journal, GitHub. Keep Contribute reachable from the
header menu/footer and existing links; use a compact overflow or mobile menu if necessary.
Keep Releases as the version ledger linked from Docs, Journal and component release records.

| Route | Result |
| --- | --- |
| `/components/` | Searchable visual catalog and filters |
| `/components/<id>/` | Example, views, hardware, setup, evidence and related journal entries |
| `/devices/<id>/` | A curated hardware/setup guide, shared by all referring components |
| `/journal/` | Chronological articles, with Releases, Updates and Installation stories filters |
| `/journal/<slug>/` | A permanent, dated article with related components and sources |
| `/releases/` | Existing version ledger, enriched with relevant release articles |
| `/docs/` | Curated guides including hardware and tablet setup links |
| `/` | Existing framework introduction plus catalog entry points and latest journal entries |

All essential content is pre-rendered HTML with canonical metadata, sitemap entries and real
404s. Preserve existing component/document URLs. Add RSS at `/journal/feed.xml`, containing
published article titles, summaries and canonical links. No CMS, database, comments, accounts,
newsletter, website-to-home connection or hosted AI session in this version.

## Component browser and detail experience

Keep the paper, ink, orange actions, serif headings and technical captions established by
SPEC-014. Component cards have a small visual, a plain-language outcome, selected version,
hardware indicator and view summary. Use precise verbs instead of a gallery of generic icons.

Search covers public names, summaries, device names and capabilities. Filters cover purpose
(presence, climate, lighting/shading, media/display, utilities), hardware requirement (required,
optional, no dedicated device), and UI availability (own view, shown through another component,
no bundled view). Categories may overlap. Display result count, clear filters and an explicit
empty state. Store filters in URL query parameters for share/back navigation; static HTML
initially contains all entries and filtering progressively enhances it in the browser.

Detail pages use this order:

1. Outcome and compact facts: selected version, role, local/cloud dependency, hardware, evidence.
2. **Try the example:** a visible starting state, controls, resulting state and short explanation.
3. **Views you get:** preview gallery with ownership, activation condition and supported layout.
4. **Hardware and connections:** required/optional devices, topology and wiring guide links.
5. **Set it up:** physical setup -> firmware/integration -> home inputs -> render -> verify.
6. Limitations, upgrade guidance, pinned sources and related journal articles.

Use anchor links on long pages. On mobile stack preview and controls before explanatory detail;
do not shrink tablet screenshots until their labels become unreadable. Offer an enlarged image
with text equivalent. The website is responsive; this does not mean every HA dashboard supports
phone or portrait layouts.

## Interactive examples

Implement small client-side state machines over fictional fixtures. No network calls to Home
Assistant, vendor services or user equipment. Label each example **Illustrative demo — sample
data**. A screenshot captured from a pinned component rendering can be labeled separately as
an actual demo-home view; an illustrative SVG must not be labeled an actual dashboard.

Every currently published component gets one bounded example. Details must be checked against
the selected release; if a scenario exceeds that release, simplify it rather than silently use HEAD.

| Component | Initial example | View ownership to explain |
| --- | --- | --- |
| Ramka | Choose away/near/playing; observe sleep, ambient, controls or now playing | Own dashboard; gallery for ambient pages, controls and calendar |
| Room presence | Switch between sample rooms; separately enable the optional radar signal | BLE room estimate differs from radar presence/distance; inspect released bundled cards |
| Climate & air | Select temperature/humidity versus optional air-quality readings | Data from this component; Ramka renders configured climate/air pages |
| Plant care | Change sample soil moisture and show a derived plant status | Sensor/status data, shown on a configured Ramka plant page |
| Awnings | Open/stop/close a sample awning with a radio-node topology | Controls may be supplied by Ramka; RTS feedback limits remain visible |
| Lighting | Change a sample Hue room group's brightness | Group data and behavior; Ramka supplies configured controls |
| Connected audio | Play/pause/standby sample media with track metadata | Upstream media player; Ramka's now-playing and controls views |
| Calendar | Select a sample day and inspect fictional events | Upstream calendar integration; Ramka agenda where configured |
| Weather | Select sample forecast conditions | Illustrative data flow; claim a bundled view only if the release ships one |
| Backups | Advance sample time from successful backup to overdue status | Explain sensors/alerts and retention; no invented dashboard or restore guarantee |

Prefer manual controls over continuous autoplay. Provide reset, keyboard operation, visible
focus and readable text states. If any timed animation is added, provide pause and honor reduced
motion. Changing one example cannot change another. Essential explanation remains without JS.
Reuse verified fictional demo data where appropriate; never import an entire household snapshot.
Do not depend on the unmerged local-demo project or new frame UI work to ship these examples.

## The views contract

For each view record: stable id, title, rendering component, data-provider components, availability
(`default`, `conditional`, `opt-in`), activation condition, preview asset, preview type
(`illustration` or `rendered-demo`), tested viewport/orientation and pinned evidence source.

Components without UI explicitly say **No bundled view** and can link to consumers that display
their data. A library card is not automatically a complete dashboard. Separate a card shipped by
the component from a view composed by Ramka. Do not infer view support merely from an entity.

For the planned Ramka 0.3.0 publication: status is enabled by default and can be disabled;
climate, air, plants and photos appear when their inputs are provided. Controls and now-playing
are behavior-driven states. Calendar availability and layout claims must match the tagged source.
Label configuration conditions in human language and expose the relevant input name as detail.
Do not call a conditional page default because the demonstration happens to populate its inputs.

## Hardware, photographs and wiring

Required/optional distinctions come from the tagged manifest, including hubs, power and protocol
requirements. Show separate physical hardware, integration and software-service dependencies.
One device page can be referenced by several components; do not repeat its wiring instructions.

Initial device-guide scope: publish the existing two Atom wiring guides and tablet setup; provide
basic verified setup for other devices named by the selected catalog using existing field notes
and official setup links. Wiring diagrams are required only where applicable. A battery sensor
or network player need not have a circuit diagram. Unknown instructions remain explicitly unknown.

Device guides contain model/revision, purpose, parts, power requirements, diagram and equivalent
pin table, physical assembly, firmware/integration setup, first-start checks, common faults and
sources. A topology diagram explains communication; a wiring diagram specifies electrical pins.
Name those separately. Shared Atom hardware does not imply shared firmware: the CC1101 awning
node and ESPHome BLE/radar proxy are distinct roles.

Reuse reviewed SVGs when their source/version matches. New diagrams are code-authored SVG with
legible labels, connector names and wire endpoints checked against official model documentation
and the corresponding firmware configuration. Do not use generative raster images to determine
electrical connectivity. Preserve a written pin table for accessibility and review.

For Shelly: identify the exact meter model and intended circuit from authorized evidence before
writing instructions. The current catalog names an optional mains meter but does not establish
generic compatibility with all Shelly models. Publish a supported-device page only after that
compatibility is substantiated; otherwise keep the material out of the supported catalog. Do not
copy private installation identifiers. Mark mains wiring and the work requiring a qualified
electrician at the relevant steps; do not present an unverified diagram as installation-ready.

Use existing approved photos immediately. New maintainer photos need confirmation of publication
scope, crop/redaction review, metadata removal, credit/license and an asset record. Preserve the
existing photo exceptions and expand tests narrowly for newly approved assets. Do not broaden
the public privacy exemption to arbitrary home photography. Missing photos use labeled diagrams
or illustrations, not invented product photographs. Additional photos are optional for launch.

## Journal

Use version-controlled Markdown with a validated metadata record per article; no executable MDX.
Fields: slug, title, summary, category, publication date, optional updated date, draft/published
status, author display name, related component ids, release references where applicable, sources,
and optional cover asset/alt text. Dates are explicit; builds never substitute today's date.

- **Releases:** explain user-visible effects, exact component versions, upgrade steps and limits.
- **Updates:** document framework/tool/docs changes on main; distinguish unreleased capability
  from an installable release. Feature-branch work can be discussed only as an explicit preview.
- **Installation stories:** context, equipment, component versions, observed result, problems and
  lessons. Real stories need publishable evidence. Label personal installations and simulations
  accurately; no invented client references or household details.

Index newest first, filter by category, link to related components and show related articles on
component pages. Drafts are excluded from routes, sitemap, feed, related links and client data.
Preserve old release articles unchanged when the catalog advances; historical links remain pinned.
An article can group several related PRs. Internal refactors do not require an article.

Initial editorial backlog:

1. Expand the existing Installation 001 into an article using its already approved evidence.
2. Preserve the existing Ramka 0.2.0 entry as a dated historical release article.
3. Add a Ramka 0.3.0 article about the optional status page after tag/main verification; distinguish
   website publication date from the actual release date.
4. Publish a practical update linking the two existing wiring guides and tablet setup.

Homepage shows a small latest-entries section and a highlighted installation story, with links
to the catalog and full journal. Avoid duplicating complete articles on the homepage.

## Content and provenance architecture

Keep immutable facts in the existing publication/export pipeline. Add website-owned editorial
records rather than changing every historical component manifest:

- `website/content/components/<id>.json`: explanatory text, categories, scenario id, view records,
  device-guide references and source evidence, explicitly bound to a component version/commit.
- `website/content/devices/<id>.json`: curated guide metadata, device/source revision, related
  component compatibility and public assets. Canonical existing device prose stays in `devices/`.
- `website/content/journal/`: Markdown bodies with validated article metadata.
- `website/content/assets.json`: path, type, alt text, provenance, credit/license and approval scope.

The exact metadata encoding and validation library are builder decisions. Extend the exporter
and its explicit allowlist for device guides and component documents such as Ramka's PHOTOS.md;
do not automatically publish every docs/component file. Keep raw HTML disabled in Markdown.

Documentation may postdate a component release. Record a separate full documentation commit,
verify it is reachable on public main, and explicitly bind the guide to compatible selected
releases. Do not pretend that a newly written guide existed at an older tag. Export referenced
SVG assets from that same documentation revision, rewrite internal links to website routes and
retain pinned GitHub source links. Use separate namespaces for live catalog links and immutable
article release citations.

Exporter validation must reject unknown ids, version/evidence mismatches, missing assets,
unapproved paths, escaping links, duplicate slugs, invalid dates, absent required article fields,
missing remote tags, moved tags and non-main publication refs. Generated snapshots remain
deterministic and committed; hosting still needs no Python, Git credentials or runtime API.
Schema evolution must update SPEC-014 or add a focused approved successor before implementation.

## Proposed skill: domosenso-website-audit

Install at `.ai/skills/domosenso-website-audit/SKILL.md`, with the repository's normal agent links
generated by `tools/install_skills.py`. Use this discovery description:

> Use when preparing or completing a DomoSenso framework PR merge, publishing a component
> release, or reviewing domosenso.org for drift from the public framework repository.

Add a concise invocation rule to framework AGENTS.md and a website-impact section to its PR
template. Integrate with any merge workflow present at implementation time, without replacing
unrelated team/review policy. The skill is a procedure run by the working agent, not a scheduler
or a GitHub event listener. Version one does not introduce an autonomous publishing service.

### Skill behavior

1. Read the PR's actual base, merge commit, changed files and release/tag evidence. Compare the
   relevant range to the publication snapshot and latest completed audit. Check exact commit
   ancestry; a merged feature-branch PR is not automatically public main or a component release.
2. Map impacts to the component catalog, interactive scenarios, view defaults, devices/wiring,
   onboarding/docs, journal, release ledger and homepage. Preserve explicit unknowns.
3. For each surface produce `update`, `no change` with a reason, or `deferred` with the blocking
   evidence and a concrete follow-up. Decide whether an article adds reader value; do not turn
   every merged PR into a post.
4. Prepare authorized website corrections on an owned branch. Update publication selections
   only for verified public tags; draft unreleased material separately. Regenerate snapshots,
   run relevant tests and inspect desktop/mobile results when presentation changes.
5. Record source range/PR, affected surfaces, decision, changed files, checks and remaining work
   in a reviewable audit note under `docs/website-audits/`. Record website publication separately
   from code merge. After an authorized deployment, inspect the live routes/version metadata.
6. Report what was audited, what changed, what remains and whether it is local, merged or live.
   Follow existing session authorization for push/PR/merge/deployment; the skill grants none.

Run an impact assessment before merge so related content can travel in the same PR. Run the
post-merge check on the actual merged revision, and again when a previously missing release tag
is published. A website merge does not create a release tag as a side effect.

Deduplicate audits by reviewed source commit/range and affected release versions. A PR that only
adds an audit note needs a brief no-impact result, not another committed audit note. A website
correction PR gets a focused verification of the existing audit; do not create recursive blog
posts or audit PRs. Pending main changes without tags can close the main audit with an explicit
release follow-up; never label the publication itself up to date for an unavailable version.

Skill acceptance scenarios: a released optional view changes; a wiring guide changes; an internal
test-only refactor; a feature-branch merge; a main merge awaiting a tag; a repeated audit; a
private-data photo; a broken published source link. Verify correct routing and no unauthorized
external mutation with fresh-agent trials when installing the skill, plus frontmatter/link checks.

## Acceptance and validation

1. All ten selected entries have a truthful outcome, hardware classification, view explanation,
   and working bounded example. Any new installable entry requires verified release evidence.
2. Catalog filtering, empty/reset states and browser back/forward work; all entries are reachable
   without JS. Detail content and setup instructions are useful without the example running.
3. View defaults and conditional inputs match tagged sources. At least one test distinguishes
   optional data-provider UI from the component that actually renders it.
4. Device guides preserve pin tables and readable SVGs on desktop/mobile; supported models and
   source revisions are explicit. Missing/unsafe publication references fail validation.
5. Journal drafts never leak into generated output; historical article versions do not change
   when current catalog versions advance. Related links and RSS resolve.
6. Test exporter provenance and deterministic output, search/filter state and meaningful scenario
   transitions. Browser checks cover keyboard use, reduced motion, no overflow, deep links/404,
   no device/network side effects, and unchanged analytics consent behavior.
7. Run website lint, TypeScript, unit tests, production static build and Playwright; run framework
   checks required by repository policy for exporter/skills/docs changes. Include privacy and
   asset-metadata checks. Inspect real rendered pages at desktop and narrow mobile sizes.
8. After publication, independently verify HTTPS routes, canonical metadata, sitemap/feed,
   current selected versions and source links. A local build is not a production verification.

## Delivery boundaries and sequencing

The approved design is implemented through an implementation plan covering:
content inventory and publication refresh; content contracts/exporter; browser and examples;
hardware pages; journal; audit skill/workflow integration; validation and publication.

Use the framework repository and an owned named branch. Leave the commercial repository and
private home state untouched. Retain current hosting and consent. No hardware purchases, flashing,
live HA access, home staging, account creation or new scheduled automation is required.

The builder may choose internal React composition, filter widgets, exact spacing, image sizes,
metadata parsing and test fixture names within this contract. Adding a CMS, full simulator,
automatic publication bot, commercial-site changes or additional supported hardware is a scope
change. New photos and additional installation stories can be incorporated later without blocking
the first release.
