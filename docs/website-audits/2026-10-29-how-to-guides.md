# Website audit — how-to guides and the website part of every PR

Source range: `1c8dd8a` (PR #81, how-to section and guides) and `2d33c42` (PR #85, changed
pages, preview cleanup, IndexNow, sitemap resubmission), both on `main`.
Status: merged and deployed; live routes checked on 2026-10-29.

| Surface | Result and evidence |
| --- | --- |
| Catalog | No change: no component version changed |
| Examples and views | No change |
| Hardware | Update: device pages list related how-to guides |
| Guides | Update: `/how-to/` with five published guides; the power guide stays a draft until zerostorypoints/domosenso#74 |
| Journal/homepage | Update: navigation gains "How-to"; journal articles can link guides; homepage unchanged |
| Release ledger | No change |

## Live checks

- `/how-to/` and the five guides return 200; `/how-to/see-power-consumption/` returns 404.
- `sitemap.xml` lists `/how-to/` and the five guides with `<lastmod>`.
- `/build.json` reports `2d33c421398d1eb0e17775edb73f8022d51b9ef8`; the IndexNow key file returns 200.

## Search engines

- After #81: sitemap submitted to Search Console (`sc-domain:domosenso.org`) and Bing
  (`https://domosenso.org/`); the six how-to addresses submitted to Bing directly.
- After #85: sitemap resubmitted to both. Google reports "pending processing".
- IndexNow job for `2d33c42` failed: it polled `build.json` for 15 minutes and timed out. Cause:
  Cloudflare answers Python's default `Python-urllib` user agent with 403, and the poll treated
  that as "not deployed yet". Fixed in the same change as this note (own user agent; the timeout
  names the last error). The single changed address (`https://domosenso.org/`) was then submitted
  by hand with the fixed tool: IndexNow answered 202.

## Still open

- Cloudflare preview builds for non-production branches are not enabled; the cleanup workflow
  skips until `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist (maintainer steps in
  `website/README.md`, "Manual setup").
- The first IndexNow run after the fix is the confirmation that the job works in CI.
- Guide content review items named in PR #81 (prices, Mosquitto wording, two installation hints,
  the music guide's title) remain for the maintainer.
