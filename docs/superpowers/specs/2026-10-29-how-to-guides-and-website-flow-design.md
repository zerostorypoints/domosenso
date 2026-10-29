# How-to guides on domosenso.org, and the website part of every PR

Status: design, 2026-10-29. Source: the maintainer, in a brainstorming session.

## Why

People have things at home they would like to automate (old awnings, music, heating, air) and
either never thought it possible or assume it is hard. With DomoSenso it is a few steps, because
an AI agent does the technical work. The site today explains components, devices and releases
to people who already know what they want. It does not meet the person who has a problem and
does not know the solution exists ("oh, I can automate my old awnings?").

Second, the site drifts: a release, a new device or a new Ramka scenario reaches the catalog,
and the site is updated later or not at all. The website work should be planned and reviewed
with the change that causes it, and search engines told when it is live.

## Goals

1. A **How-to** section: practical, reader-oriented guides ("recipes and hints"), each starting
   from what the reader has at home and ending in a working result.
2. Every how-to is **tied to components**: the guide links them, and each component page lists
   its guides.
3. Six first guides: music, awnings, temperature, air quality, presence, power consumption.
4. Search-friendly: titles, descriptions, URLs and first sentences in the words people search
   with; structured data; a sitemap with modification dates.
5. A **website part in every framework PR**: planned with the change, written in the same PR,
   previewed on Cloudflare with direct links to each changed page.
6. After a merge to `main`: the live pages are checked, and Google and Bing are told what changed.

## Non-goals

- A Shelly component. It is a separate project (its own spec), needed by two branches below.
- Translations: the framework site stays English.
- Automatic publishing without a human merge.
- Rewriting the journal; it stays the place for news.

## Anti-goals (a failure even if it works)

- A guide that promises what DomoSenso does not do today. A branch without a component says
  "coming soon" and links the tracking issue; it never describes unsupported steps as working.
- Jargon-first text ("component 0.2.1 provides cover entities"): the reader's problem comes first.
- Any household identifier on the public site: names, rooms, addresses, entity ids, photos of a
  private home. Experience from a real home is used, anonymised ("on one installation the wind
  sensor was heard only intermittently").
- Preview builds indexed by search engines, or duplicate content between `pages.dev` and the domain.

## The how-to guide

**Route:** `/how-to/<slug>/`, slug in search words, e.g. `/how-to/automate-old-awnings/`,
`/how-to/multi-room-music/`. Index page `/how-to/`.

**Source:** `website/content/how-to/<slug>.md`, Markdown with YAML frontmatter, validated by the
exporter like journal entries. Fields: `slug`, `title`, `description` (meta, ≤ 160 chars),
`components` (catalog ids, at least one), `devices` (catalog device ids), `status`
(`draft`/`published`), `updated` (date), `sources` (pinned repository links), `branches`.

**Shape, by branch.** A guide opens with the everyday problem, then asks "what do you have?"
and gives one branch per situation. Awnings example:

| you have | you need | wiring | supported |
|---|---|---|---|
| a motor with a remote (Somfy RTS) | radio node: Atom Lite + CC1101 with ESPSomfy-RTS, pairs as one more remote | none at the awning | yes, `awnings` |
| a motor with buttons in the wall | Shelly 2PM behind the switch; the button keeps working | mains, electrician | coming soon (Shelly component) |
| no motor | — | — | not automatable without a motor; say so |

Each supported branch has: what to buy (model, approximate price range, link to the device
guide), wiring or none, **what to tell your agent** (a ready sentence to copy), what you get
(what runs by itself, what shows on the Ramka or phone), and **hints** from real installations
(what to check first, what goes wrong, limits). Branch fields are frontmatter so the page can
render the table and the component page can show "covers: remote-controlled motors".

**The first six** and their components (pages are drafted from the catalog READMEs and the
maintainer's installation notes, anonymised):

| guide | components | note |
|---|---|---|
| Music in every room | `media` | |
| Automate old awnings | `awnings` | wall-button branch: coming soon |
| Room temperature you can see | `climate-air` | |
| Know your air quality | `climate-air` | separate guide: different searches |
| Presence: who is home, which room | `bermuda-presence`, `ramka` | |
| See your power consumption | — | `status: draft` (not public at all) until the Shelly component is released |

**Where hints come from.** The maintainer's own installations, anonymised (decided 2026-10-29).
The agent drafts hints in the home session from that home's notes, writes them generically (no
names, rooms, entity ids, dates tied to the household), and the maintainer reads each hint in
the preview before merge; the privacy test is a second net, not the review. Other contributors add
hints from their own installations the same way.

**Unsupported branches** link the Shelly component issue,
[zerostorypoints/domosenso#74](https://github.com/zerostorypoints/domosenso/issues/74).

**Connections:** component page shows "How-to guides" (all guides naming it); device guide shows
guides that use the device; journal articles may name `howto:` slugs and link them; a how-to
links related guides.

**SEO:** `<title>` = guide title; meta description from `description`; canonical URL; Open Graph;
JSON-LD `HowTo` (steps from the chosen branch) and `BreadcrumbList`; one `h1`; answer the
question in the first paragraph; internal links to components and devices. Sitemap entries for
all published pages carry `lastModified` (how-to `updated`, journal `date`, component release date).

## The website part of every PR

Added to the framework PR template and `AGENTS.md`, extending the existing
`domosenso-website-audit` skill (not a new parallel process).

1. **Plan.** When a change is planned (issue, spec or task), the plan names its website impact:
   new or changed component/version, new device, new Ramka scenario or view, how-to changes,
   journal article, or "no change — reason". A component version bump checks every how-to that
   names the component.
2. **Write in the same PR.** Content that describes behaviour not yet released stays
   `status: draft` in the PR (visible in the preview build, not on the live site); the release step
   that publishes the component tag flips it to `published` and re-runs the post-merge step
   (decided 2026-10-29, "fine for now"). Content about what is already released is published at merge.
   The agent edits content, runs the exporter and website checks
   (including `npm run e2e`, which `check-all.sh` should run when `website/` changes — today it
   does not, and a journal count assertion failed only in CI on 2026-10-29).
3. **Preview links.** Cloudflare Pages builds a preview for the PR branch. A tool
   (`tools/website_changes.py`) maps the PR's changed content files to routes and prints a
   "Changed pages" list; the agent puts it in the PR description with the preview base URL,
   one line per page with what to check. Previews are **public** (the repository is public),
   protected only by `noindex` (already implemented through `CF_PAGES_BRANCH`) and the
   `X-Robots-Tag` header, verified once; `website/README.md`'s "enable only with an Access policy"
   is replaced (decided 2026-10-29). Preview builds render drafts with a "Draft" banner so the
   reviewer sees them; production builds still exclude them *(designer's call)*.
   **Cleanup:** Cloudflare Pages keeps preview deployments after a merge. A workflow on PR close
   deletes that branch's preview deployments through the Cloudflare API, with a Pages-edit token
   (account-scoped; see manual steps) available only to that workflow on the base repository (fork PRs have no previews).
4. **After merge.** The agent verifies the live routes from the same list, then notifies search
   engines (below) and records the audit note in `docs/website-audits/`.

**Fork PRs** get no Cloudflare preview (no credentials). A maintainer builds the site locally
from the PR head, or reviews after it is rebased onto a maintainer branch.

## Telling search engines

- **IndexNow (Bing, Yandex, others):** a public key file in `website/public/<key>.txt`; after
  a production deploy, a GitHub Actions job on `main` POSTs the changed URLs (from
  `tools/website_changes.py` on the merge range). No secret needed beyond the public key.
- **Google:** Google no longer accepts sitemap pings. Resubmit `https://domosenso.org/sitemap.xml`
  to the Search Console property `sc-domain:domosenso.org` through the Search Console API. In
  an agent session this is the agent's post-merge step using the maintainer's connected account;
  later optional CI with a service account added as a property user (a repository secret on
  `main` only, never available to PR workflows).
- **Bing Webmaster:** sitemap resubmitted for `https://domosenso.org/` the same way; IndexNow
  covers individual URLs.
- Both steps report what was submitted; failures are reported, not retried in a loop.

## Constraints

- Static export on Cloudflare Pages; production branch `main`; root `website`; no runtime server.
- Existing content validation and privacy test (`tests/test_catalog_content.py::test_privacy`)
  apply to how-to files; public assets follow `content/assets.json` provenance rules.
- Analytics consent behaviour unchanged.
- Shared and reproducible: nothing depends on one maintainer's machine; account-bound steps
  (Search Console, Cloudflare settings) are documented as manual or as CI with secrets.

## Manual steps for a human

- Create the Cloudflare API token (Account > Cloudflare Pages > Edit; Cloudflare may not allow narrowing it to one project, and it can also deploy to production) as repository secret `CLOUDFLARE_API_TOKEN`, plus variable `CLOUDFLARE_ACCOUNT_ID`.
- Enable preview deployments for non-production branches in the Cloudflare Pages project
  `domosenso-framework` (today only `main` deploys).
- Generate and commit the IndexNow key; for later Google CI, create the service account and
  add it to Search Console.

## Left to the builder

Visual design of the how-to pages within the site's existing style; exact frontmatter names;
how branch tables render on mobile; the JSON-LD details; how `website_changes.py` maps docs and
generated JSON to routes; wording of the six guides (the maintainer reviews each in the preview).

## Order

1. How-to content model, routes, component links, sitemap `lastModified`, SEO metadata, tests.
2. The six guides (power as draft).
3. `website_changes.py`, PR template, AGENTS.md and the audit skill update; e2e in `check-all.sh`.
4. IndexNow key and the post-merge job; Google/Bing resubmission step.
Later, separate: the Shelly component, then the wall-button branch and the power guide.
