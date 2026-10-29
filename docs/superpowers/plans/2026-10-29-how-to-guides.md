# How-to guides and the website part of every PR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A How-to section on domosenso.org tied to catalog components, the first six guides, and a per-PR website flow with preview links, preview cleanup and search-engine notification.

**Architecture:** How-to Markdown in `website/content/how-to/` is validated by the Python exporter (`tools/website_content.py`) into `website/src/generated/content.json`, like journal articles; Next.js static routes render it and link it from components and devices. A Python tool maps a git diff to site routes for PR descriptions and IndexNow; two GitHub workflows delete Cloudflare previews on PR close and notify IndexNow after `main` is live.

**Tech Stack:** Python 3.11 (uv, pytest, PyYAML), Next.js static export (TypeScript, jest, Playwright), GitHub Actions, Cloudflare Pages API, IndexNow.

**Spec:** `docs/superpowers/specs/2026-10-29-how-to-guides-and-website-flow-design.md` (approved 2026-10-29). Executors read both.

**Delivery:** two PRs into `main`, from branches cut from `main`: **PR A** = Tasks 1–5 (section and guides), **PR B** = Tasks 6–9 (flow). PR B starts after PR A merges (Task 6 maps how-to routes). Each PR follows `docs/TEAM_WORKFLOW.md`: independent agent review, a human approval, green `framework`, `website`, `demo`.

## Global Constraints

- English only on the site. Text reader-first: the reader's problem before any component name.
- Route `/how-to/<slug>/`, index `/how-to/`; slug matches `IDENTIFIER` in `tools/export_website.py` and the file stem.
- Frontmatter: `slug`, `title`, `description` (1–160 characters), `components` (catalog ids from `publication.json`; ≥ 1 when `published`, may be empty for a `draft`), `devices` (catalog device ids, may be empty), `status` (`draft` | `published`), `updated` (`'YYYY-MM-DD'`, quoted), `sources` (https URLs, ≥ 1), `branches` (≥ 1).
- Branch fields: `situation` (str), `needs` (str), `wiring` (str), `supported` (`yes` | `coming-soon` | `no`), `issue` (https URL, required when `coming-soon`), `prompt` (str, required when `yes`).
- A branch with `supported: coming-soon` links `https://github.com/zerostorypoints/domosenso/issues/74` for Shelly cases; never describes unsupported steps as working.
- Drafts: production builds (`CF_PAGES_BRANCH` unset or `main`) never render, list, link or sitemap a draft how-to; preview builds (`CF_PAGES_BRANCH` set and not `main`) render it with a "Draft" banner. Journal drafts keep today's behaviour (excluded from generated data).
- No household identifiers in any public file (names, rooms, addresses, entity ids, IPs, photos of a private home); `tests/test_catalog_content.py::test_privacy` must pass.
- Previews are public and `noindex` (existing `robots` in `website/src/lib/seo.ts`); never weaken it.
- Fork PRs get no secrets: every workflow using a secret runs only when `head.repo.full_name == github.repository` or on `push` to `main`.
- Analytics consent behaviour unchanged (`website/e2e/analytics.spec.ts` green).
- Python through `uv run`; full gate `bash tools/check-all.sh` before each commit.

## Review Focus

1. A how-to naming a component that is not in `publication.json` (renamed or removed) → export fails with `unknown how-to component`, not a broken link. Test in Task 1.
2. A draft how-to referenced from a published page (journal `howto:`, related guides) on a production build → the link is omitted, never a 404. Test in Task 3.
3. `website_changes.py` on a diff that touches only site code (`website/src/**`) → it lists `/` with reason `site code changed — check all pages` rather than an empty list. Test in Task 6.
4. IndexNow job when the live site never reaches the merge commit (Cloudflare build failed) → job fails after the timeout and submits nothing. Test in Task 8.
5. Preview cleanup for a branch with no deployments, or a Cloudflare API error → exits 0 with `no previews` / exits 1 with the API message; never deletes production deployments. Test in Task 7.

---

### Task 1: How-to content model in the exporter

**Files:**
- Modify: `tools/website_content.py` (`build_content`)
- Test: `tests/test_website_content.py`
- Create: `website/content/how-to/.gitkeep`

**Interfaces:**
- Produces: `build_content(...)` result gains key `'howTos'`: list of dicts with all frontmatter fields plus `body` (str), sorted by `slug`; drafts included with `status: 'draft'`. Journal items accept optional `howto: list[str]` (slugs).

- [ ] **Step 1: Write the failing tests** in `tests/test_website_content.py`, with a `howto(base, **overrides)` helper mirroring `article()` (valid defaults: one `yes` branch with a `prompt`):
  - `test_howto_published_and_draft_are_exported`: one published, one draft → `[h['status'] for h in content['howTos']] == ['published','draft']` order by slug, bodies present.
  - parametrized `test_invalid_howto_fails` over `('components',['unknown'])` → `unknown how-to component`; `('components',[])` on a published guide → `published how-to needs a component` (and accepted on a draft); `('description','x'*161)` → `invalid how-to description`; `('updated','2026-02-30')`; `('branches',[{... 'supported':'coming-soon'}])` without `issue` → `coming-soon branch needs an issue`; `('branches',[{... 'supported':'yes'}])` without `prompt` → `supported branch needs a prompt`; `('sources',['javascript:alert(1)'])`; `('devices',['unknown'])` → `unknown how-to device`; slug ≠ file stem.
  - `test_journal_howto_reference_must_exist`: article with `howto: ['missing']` → `unknown how-to reference`.
- [ ] **Step 2:** `uv run pytest tests/test_website_content.py -q` → the new tests FAIL (`KeyError: 'howTos'`).
- [ ] **Step 3:** Implement in `build_content`: read `website/content/how-to/*.md` with the same frontmatter split as journal; use `require(...)` with the messages above; validate devices against the exported device ids and components against `selected`; then validate each article's optional `howto` against the set of how-to slugs (drafts count as existing).
- [ ] **Step 4:** Run the tests → PASS; `uv run tools/export_website.py` regenerates `content.json` with `"howTos": []`.
- [ ] **Step 5:** `bash tools/check-all.sh` → `all checks passed`; commit `website content: how-to guides model`.

### Task 2: How-to pages, draft visibility and structured data

**Files:**
- Create: `website/src/lib/howto.ts`, `website/src/lib/howto.test.ts`, `website/src/app/how-to/page.tsx`, `website/src/app/how-to/[slug]/page.tsx`, `website/src/components/howto-cards.tsx`
- Modify: `website/src/lib/content.ts` (export `howTos`, type `HowTo`), `website/src/components/site.tsx` (header and footer nav: "How-to" before "Journal"), `website/src/app/journal.css` or a new `howto.css` imported by the layout

**Interfaces:**
- Produces (`website/src/lib/howto.ts`):
  - `isPreviewBuild(branch: string | undefined = process.env.CF_PAGES_BRANCH): boolean` — `!!branch && branch !== 'main'`
  - `visibleHowTos(all: HowTo[], preview = isPreviewBuild()): HowTo[]` — published only, or all in preview
  - `howToJsonLd(h: HowTo, origin = 'https://domosenso.org'): object[]` — `[HowTo, BreadcrumbList]`; `HowTo.step` from branches with `supported: 'yes'` (`name` = situation, `text` = needs + prompt); breadcrumb Home › How-to › title.

- [ ] **Step 1: Failing jest tests** `howto.test.ts`: `isPreviewBuild(undefined)===false`, `('main')===false`, `('codex/x')===true`; `visibleHowTos([pub, draft], false)` → `[pub]`, `(…, true)` → both; `howToJsonLd(h)[0]['@type']==='HowTo'`, its `step.length` equals the count of `yes` branches, `[1]['itemListElement'][2].item==='https://domosenso.org/how-to/<slug>/'`.
- [ ] **Step 2:** `cd website && npm test -- howto` → FAIL (module missing).
- [ ] **Step 3:** Implement `howto.ts`; pages: index lists `visibleHowTos(howTos)` as cards (title, description, component names); detail page uses `generateStaticParams` over `visibleHowTos`, `metadata(title, path, description)` from `seo.ts`, a `<script type="application/ld+json">` with `howToJsonLd`, a branch table (columns: You have / You need / Wiring / Supported, `coming-soon` cell links `issue`), a "Tell your agent" block per `yes` branch with the `prompt` in a copyable code element, the Markdown body, a sidebar with Components and Devices links. Draft pages show a "Draft — not published" banner.
- [ ] **Step 4:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` → pass.
- [ ] **Step 5:** check-all; commit `website: how-to section`.

### Task 3: Connections from components, devices and journal

**Files:**
- Modify: `website/src/components/howto-cards.tsx` (add `RelatedHowTos`), `website/src/app/components/[id]/page.tsx`, `website/src/app/devices/[id]/page.tsx`, `website/src/app/journal/[slug]/page.tsx`
- Test: `website/e2e/catalog.spec.ts`, `website/src/lib/howto.test.ts`

**Interfaces:**
- Consumes: `visibleHowTos`, `HowTo` (Task 2).
- Produces: `RelatedHowTos({componentId?: string, deviceId?: string})` — renders nothing when none visible; `howToLinks(slugs: string[], preview?: boolean): HowTo[]` in `howto.ts` — drops unknown or invisible slugs.

- [ ] **Step 1: Failing tests:** jest `howToLinks(['draft-one'], false)` → `[]`, `(…, true)` → one item. e2e (fixture guide from Task 5 is not yet there — use the jest test only here; e2e lands in Task 5).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Component page: "How-to guides" section above "Release details" using `RelatedHowTos({componentId:id})`; device page: same with `deviceId`; journal sidebar: "How-to" section from `howToLinks(a.howto ?? [])`.
- [ ] **Step 4:** tests, lint, typecheck, build pass.
- [ ] **Step 5:** check-all; commit `website: link how-to guides from components, devices and journal`.

### Task 4: Sitemap with modification dates

**Files:**
- Modify: `website/src/app/sitemap.ts`
- Create: `website/src/lib/sitemap.ts`, `website/src/lib/sitemap.test.ts`

**Interfaces:**
- Produces: `sitemapEntries(input: {howTos, articles, devices, catalog, docs, publication}): {url: string, lastModified?: string}[]` — how-to `lastModified = updated`, journal `date` (or `updated` when set), component = its release date from `publication.json` if present, else omitted; drafts never included, even in preview.

- [ ] **Step 1:** jest: a published how-to appears with `lastModified: '2026-10-29'`; a draft never appears, even when `CF_PAGES_BRANCH` is a preview branch; every URL starts `https://domosenso.org/` and ends `/`; existing static paths unchanged (copy today's list from `sitemap.ts` into the expectation).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Move the list into `sitemapEntries`; `sitemap.ts` calls it. If `publication.json` has no per-component date, add nothing and leave the component entries without `lastModified` (do not invent dates).
- [ ] **Step 4:** tests and build pass; `out/sitemap.xml` contains `<lastmod>` for journal entries.
- [ ] **Step 5:** check-all; commit `website: sitemap with lastmod and how-to pages`.

### Task 5: The first six guides

**Files:**
- Create in `website/content/how-to/`: `multi-room-music.md` (`media`), `automate-old-awnings.md` (`awnings`; devices `m5stack-atom-lite`, `cc1101`), `see-room-temperature.md` (`climate-air`), `know-your-air-quality.md` (`climate-air`; device `ruuvi-air`), `presence-who-is-home.md` (`bermuda-presence`, `ramka`; devices `m5stack-atom-lite`, `hlk-ld2410c`), `see-power-consumption.md` (status `draft`, `components: []`, one `coming-soon` branch linking #74)
- Modify: `website/e2e/catalog.spec.ts`, `website/src/generated/content.json` (regenerated)

- [ ] **Step 1: Failing e2e:** `/how-to/` shows 5 cards (`.howto-card`); `/how-to/automate-old-awnings/` has an `h1`, a table row containing "buttons in the wall" with a link to `/issues/74`, a "Tell your agent" block, and a `script[type="application/ld+json"]` whose JSON has `@type` `HowTo`; `/components/awnings/` lists "Automate old awnings"; `/how-to/see-power-consumption/` returns 404 on the production build.
- [ ] **Step 2:** `npm run build && npm run e2e` → FAIL.
- [ ] **Step 3:** Write the guides. Each: first paragraph answers the search question; branches per the spec's awnings table (wall buttons and power → `coming-soon`, #74; "no motor" → `no`); price ranges as approximate ranges; hints from installation experience, generic only. Sources: pinned `https://github.com/zerostorypoints/domosenso/tree/<main sha>/components/<id>`. The maintainer drafts hints from their own home in the home session and pastes the anonymised text; the implementer does not read private repositories.
- [ ] **Step 4:** export, e2e (with `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=G-DOMOTEST01 npm run build`), privacy test pass.
- [ ] **Step 5:** check-all; commit `website: first five how-to guides, power as draft`. Open **PR A**; its description lists the six preview URLs with what to check per page (by hand — Task 6's tool is not there yet). **Gate:** the maintainer reads every guide in the preview before approval.

### Task 6: Changed pages from a diff, and the PR flow text

**Files:**
- Create: `tools/website_changes.py`, `tests/test_website_changes.py`
- Modify: `.github/pull_request_template.md` ("Website impact": add `Changed pages:` line), `AGENTS.md` (website section: planning names the website impact; drafts until tag), `.ai/skills/domosenso-website-audit/SKILL.md` (steps: run `website_changes.py`, put the list in the PR; after merge verify live, notify engines per Task 9), `website/README.md` (replace "Disabled initially; enable only with an Access policy" with public `noindex` previews and cleanup), `tools/check-all.sh` (run `npm run build` + `npm run e2e` with `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=G-DOMOTEST01` when `git diff --name-only origin/main...HEAD` touches `website/`)

**Interfaces:**
- Produces: `changed_routes(paths: list[str], root: Path, base: str) -> list[tuple[str, str]]` (route, reason), sorted, unique; CLI `uv run tools/website_changes.py --base <ref> [--head HEAD] [--preview-url URL] [--format markdown|urls]`. `urls` prints one absolute `https://domosenso.org<route>` per line (Task 8 uses it).
- Mapping: `website/content/how-to/<s>.md` → `/how-to/<s>/` + `/how-to/`; `journal/<s>.md` → `/journal/<s>/` + `/journal/`; `components/<id>.json` → `/components/<id>/`; `devices/<id>.json` → `/devices/<id>/`; `publication.json` → `/releases/` + `/components/<id>/` for each id whose version differs between `base` and head; `docs.generated.json` → `/docs/<slug>/` for changed slugs; `website/src/**` or `website/public/**` → `/` with reason `site code changed — check all pages`; draft files listed with reason suffix ` (draft, preview only)`.

- [ ] **Step 1:** pytest with a temporary git repo (pattern from `tests/test_website_export.py`): one case per mapping row, the site-code case (Review Focus 3), `--format markdown` with `--preview-url https://abc.domosenso-framework.pages.dev` renders `- [/how-to/x/](https://abc…/how-to/x/) — new how-to`, and an empty diff prints `no website changes`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement; docs edits as listed.
- [ ] **Step 4:** tests pass; `uv run tools/website_changes.py --base origin/main` on this branch lists the doc/tool changes as no routes.
- [ ] **Step 5:** check-all (AGENTS.md stays < 32,768 bytes, `agents_check`); commit.

### Task 7: Delete Cloudflare previews when a PR closes

**Files:**
- Create: `tools/cloudflare_previews.py`, `tests/test_cloudflare_previews.py`, `.github/workflows/preview-cleanup.yml`

**Interfaces:**
- Produces: `delete_branch_previews(branch: str, account: str, project: str, token: str, http=urlopen_json) -> list[str]` (deleted ids). Lists `GET /client/v4/accounts/{account}/pages/projects/{project}/deployments?env=preview` (all pages), keeps those with `deployment_trigger.metadata.branch == branch` and `environment == 'preview'`, deletes each with `DELETE …/deployments/{id}?force=true`. Refuses `branch == 'main'`.
- Workflow: `on: pull_request: types: [closed]`; `if: github.event.pull_request.head.repo.full_name == github.repository`; env `CLOUDFLARE_API_TOKEN` (secret), `CLOUDFLARE_ACCOUNT_ID` (repository variable), project `domosenso-framework`; prints `deleted <id>` per deployment or `no previews`.

- [ ] **Step 1:** pytest with a fake `http`: two branch previews + one other branch + one production → deletes exactly the two; none → `[]` and prints `no previews`; API error → raises with Cloudflare's message (Review Focus 5); `main` → raises.
- [ ] **Step 2:** FAIL. **Step 3:** implement script and workflow. **Step 4:** pass; `actionlint` if available, else YAML parse in the test.
- [ ] **Step 5:** check-all; commit.

### Task 8: IndexNow after the live site reaches the merge commit

**Files:**
- Create: `website/src/app/build.json/route.ts` (force-static JSON `{commit: process.env.CF_PAGES_COMMIT_SHA ?? 'local'}`), `website/public/<key>.txt` (key = 32 lowercase hex, generated once with `python -c "import secrets;print(secrets.token_hex(16))"`, file content = key), `tools/indexnow.py`, `tests/test_indexnow.py`, `.github/workflows/indexnow.yml`

**Interfaces:**
- Consumes: `website_changes.py --format urls` (Task 6).
- Produces: `wait_for_commit(sha, url='https://domosenso.org/build.json', timeout=900, interval=30, fetch=..., sleep=...) -> None` (raises `TimeoutError`); `submit(urls: list[str], key: str, fetch=...) -> int` POSTing `https://api.indexnow.org/indexnow` with `{"host":"domosenso.org","key":key,"keyLocation":f"https://domosenso.org/{key}.txt","urlList":urls}`; returns HTTP status; empty list → no request.
- Workflow: `on: push: branches: [main]`, `fetch-depth: 0`, runs `website_changes.py --base ${{ github.event.before }} --format urls`, then `indexnow.py --sha ${{ github.sha }}`.

- [ ] **Step 1:** pytest with fakes: commit appears on the third poll → submit called once with the URL list; never appears → `TimeoutError`, no submit (Review Focus 4); empty list → no POST; 200/202 accepted, 4xx → exit 1.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** pass; `npm run build` emits `out/build.json`.
- [ ] **Step 5:** check-all; commit.

### Task 9: Google and Bing sitemap resubmission, manual steps

**Files:**
- Modify: `.ai/skills/domosenso-website-audit/SKILL.md`, `website/README.md`

- [ ] **Step 1:** Skill, after-merge section: once the live `build.json` shows the merge commit, resubmit `https://domosenso.org/sitemap.xml` to Search Console property `sc-domain:domosenso.org` and to Bing Webmaster site `https://domosenso.org/` with the session's connected tools; record both results in the audit note; failures are reported, not retried in a loop. Name the optional later CI (service account as a property user, secret on `main` only).
- [ ] **Step 2:** README: manual steps — enable preview deployments for non-production branches in Cloudflare Pages `domosenso-framework`; create the Pages-edit API token as secret `CLOUDFLARE_API_TOKEN` and variable `CLOUDFLARE_ACCOUNT_ID`; verify preview `X-Robots-Tag`/`noindex` once on the first preview.
- [ ] **Step 3:** `uv run pytest tests/test_docs.py tests/test_catalog_content.py -q` pass; check-all; commit. Open **PR B** with its own "Changed pages" list from `website_changes.py`.
- [ ] **Step 4 (after PR B merges, maintainer present):** run the audit skill's after-merge steps once for real: live check, IndexNow job result, Search Console and Bing resubmission; write `docs/website-audits/<date>-how-to-guides.md`.
