# Component Browser and Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver the approved interactive catalog, hardware guides, journal and post-merge audit skill.

**Architecture:** Extend the existing immutable Python export with curated, release-bound editorial records and Markdown articles. Next.js consumes committed snapshots; bounded React examples run locally without HA connections. Preserve the existing editorial design and Cloudflare static hosting.

**Tech Stack:** Python, PyYAML, Next.js 16, React 19, strict TypeScript, Tailwind, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-component-browser-journal-design.md` (approved in conversation 2026-10-28).

## Global Constraints

- English-only framework site; commercial website and private home repositories remain outside scope.
- Exact component tags and full source SHAs; documentation may have its own public-main SHA.
- All essential content is pre-rendered HTML; no runtime API, CMS or device connections.
- Illustrative examples use fictional data and never imply a real dashboard screenshot.
- No invented hardware compatibility, field evidence or installation stories.
- Existing analytics consent behavior, photo privacy rules and named-branch workflow remain intact.
- Implementation is authorized now; proceed continuously without another plan approval round.

## Review Focus

- Query state survives browser history and Unicode/empty search, without hiding the no-JS catalog.
- Advancing current releases does not change historical article references or accept stale view metadata.
- Draft articles and unapproved source paths never appear in routes, sitemap, feed or generated content.
- Hardware optionality and UI ownership survive export; unknowns are not described as support.
- Repeated merge audits and feature-branch merges do not generate release claims or recursive work.

## Task 1: Versioned editorial data and exporter

**Files:** `tools/export_website.py`, new `tools/website_content.py`, `tests/test_website_export.py`, new `tests/test_website_content.py`, `website/content/publication.json`, `website/content/components/*.json`, `website/content/devices/*.json`, `website/content/assets.json`, `website/content/journal/*.md`, generated snapshots, `.ai/specs/SPEC-014-2026-10-22-framework-website.md`.

**Interfaces:** Keep `build(root, publication) -> (catalog, docs)` compatible. Add `build_content(root, publication) -> dict` with `components`, `devices`, `articles`, `assets`. Output `website/src/generated/content.json`. Component editorial fields: `id`, `version`, `sourceCommit`, `outcome`, `categories`, `hardware`, `ui`, `scenario`, `views`, `deviceIds`, `setup`, `evidencePaths`. Views record ownership, availability, condition, illustration and evidence. Articles are Markdown with YAML frontmatter. Devices import explicitly selected Markdown from `documentationCommit` or a reviewed setup summary with pinned source.

- [x] Add tests for stale editorial versions, missing previews, draft exclusion, invalid dates/ids, historical tag references and device-source escaping; run them and observe failure.
- [x] Implement exporter validation, documentation asset export/link mapping and ancestry verification against current public main in remote verification.
- [x] Select verified newer public component tags, refresh docs to reviewed main, author ten component records, shared device guides and four initial articles from public evidence.
- [x] Run `uv run pytest -q tests/test_website_export.py tests/test_website_content.py` and exporter `--check --verify-remote`; require all pass and deterministic output.

## Task 2: Catalog and interactive examples

**Files:** new `website/src/lib/content.ts`, `browser.ts`, `browser.test.ts`; new `website/src/components/component-browser.tsx`, `component-demo.tsx`, `component-visual.tsx`, `component-experience.tsx`; component routes; new `website/src/app/catalog.css`; new `website/e2e/catalog.spec.ts`.

**Interfaces:** `filterComponents(entries, filters)` preserves source ordering; `readFilters(search)` and `filterQuery(filters)` use q/purpose/hardware/ui. `ComponentDemo({id})` displays one of each component's fictional scenario states with reset. `ComponentExperience({id})` renders views and setup using Task 1 content.

- [x] Add tests for combined filters, empty query, URL round trips, and browser examples/reset; run to confirm missing implementation fails.
- [x] Implement ten visual examples, accessible manual state controls, catalog search/filters with history and SSR fallback, view gallery and equipment/setup links.
- [x] Preserve release facts and complete requirements on existing detail routes; label UI ownership and illustrative previews explicitly.
- [x] Run Jest and Playwright catalog tests; verify mobile/desktop, back/forward, no-JS content and reduced-motion behavior.

## Task 3: Hardware pages, journal and navigation

**Files:** new `website/src/app/devices/[id]/page.tsx`, `journal/page.tsx`, `journal/[slug]/page.tsx`, `journal/feed.xml/route.ts`, new `website/src/components/journal-list.tsx`, `journal-cards.tsx`, new `website/src/lib/feed.ts` and test; shared header/mobile nav, homepage, docs index, releases, sitemap; browser tests.

**Interfaces:** Published article data from `content.ts`; `journalFeed(articles)` returns escaped RSS. All ids/slugs are statically enumerated. Existing markdown renderer remains non-executable.

- [x] Add feed tests for XML escaping and pinned article links; browser tests for article filters, related links, SVG/pin-table rendering and all new deep routes.
- [x] Render hardware guides with models, compatibility, sources and readable SVG; render dated journal articles/category filtering and RSS.
- [x] Move the old homepage article to a historical journal entry; add latest articles and keep Installation 001 evidence. Add reciprocal links and sitemap entries.
- [x] Run unit tests, static build and browser tests; require draft exclusion, no overflow and unchanged existing journeys.

## Task 4: Audit skill and workflow integration

**Files:** new `.ai/skills/domosenso-website-audit/SKILL.md`, generated agent symlinks; AGENTS.md, PR template, `website/README.md`, initial `docs/website-audits/2026-10-28-catalog-refresh.md`.

**Interfaces:** Skill accepts PR/source range or drift request; reports per-surface update/no-change/deferred, release evidence, checks and local/merged/live status. This is an agent procedure, not an autonomous event listener.

- [x] Run a read-only post-merge baseline without the skill; identify missing website/release follow-up behavior.
- [x] Write the scoped skill and references to the approved publication model; install normal repository skill links and invoke through AGENTS/PR checklist.
- [x] Trial released-view, feature-branch, missing-tag and repeated-audit scenarios with the skill; validate frontmatter, links and privacy checks.
- [x] Record this branch's audit and outstanding publication status without claiming it is live.

## Task 5: Integration, visual review and delivery

**Files:** tests above; implementation ledger; plan completion checkboxes; final code/content fixes only as evidence requires.

- [x] Run website lint, typecheck, unit tests, production build and all Playwright tests, plus `tools/check-all.sh` before committing.
- [x] Inspect screenshots of catalog/detail/device/journal desktop and mobile; check readable diagrams, overflow and focus.
- [x] Obtain fresh whole-branch review against the spec, fix actionable findings with regression tests and rerun affected checks.
- [x] Commit the reviewable change after required checks. Prepare publication/PR handoff; apply only external actions authorized in the session and verify production separately when deployed.

## Execution notes

Use the existing owned `codex/website-catalog-design` worktree. One cohesive branch/PR, not a multi-PR feature branch. Defer commits until the repository-required full check run rather than running container checks for every small edit. Track progress and test evidence in the plan's ignored ledger.

## Completion record — 2026-10-28

Implemented locally on the named worktree branch. Full repository checks passed: 775 Python
tests, 127 card tests, strict catalog, Home Assistant and ESPHome checks. Website lint, typecheck,
10 unit tests, production static build and 37 Playwright tests passed (one intentional desktop
skip for the mobile-only navigation case). Desktop/mobile screenshots, keyboard example controls,
reduced-motion presentation and hardware diagram enlargement were inspected.

A fresh whole-branch reviewer found three factual/discovery issues; all were corrected and
regression checks passed. Installation usability and historical-ref coverage observations were
also addressed. The audit skill passed structural/link checks and fresh-agent scenario trials.

Publication is pending: no push, PR, main merge or deployment has been performed by this task.
The local preview is not evidence that production changed. Shelly-specific instructions await
verified model/compatibility evidence; no private home was changed.
