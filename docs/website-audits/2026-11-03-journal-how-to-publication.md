# Three practical journal guides

## Scope and evidence

Base: `1376887c0b93017e1dcac03591d33362f5572494` on remote main. The maintainer approved
publishing all three prepared articles on 3 November 2026. This change publishes the English
Bermuda proxy, Atom EchoS3R Assist and Mi Flora guides and regenerates the website snapshot.
It does not change a component, select a new release or claim a new hardware test.

Technical sources are linked in each article: Bermuda's official wiki, Home Assistant's
Bluetooth and Xiaomi BLE documentation, and M5Stack's hardware and Assist documentation.
The Atom guide distinguishes the manufacturer's voice firmware from DomoSenso's audio-sensor
package. Suggested reader checks are identified as suggestions, not field evidence.

## Surface assessment

| Surface | Result |
| --- | --- |
| Catalog | No change to selected versions or capabilities; existing related-journal links pick up the articles. |
| Examples and views | No change to component demonstrations, preview assets or conditions. |
| Hardware | No change to device records or wiring; guides link existing hardware and upstream setup references. |
| Guides | No change to existing how-to pages; the Bermuda article links the existing presence guide. |
| Journal and homepage | Update: three published entries, journal index and recent/related article lists. |
| Release ledger | No change: these are tutorials, not component release announcements. |

`release_status.py` reports the existing unpublished `remote-access 0.2.0` selection. That
unrelated release remains outside this publication; the components referenced here are released.

## Routes

- `/journal/bermuda-bluetooth-proxy-setup/`
- `/journal/atom-echos3r-home-assistant-assist/`
- `/journal/mi-flora-home-assistant-setup/`
- `/journal/`, `/`, and related entries on the three component pages.
- Generated RSS, sitemap, agent indexes and each article's `index.md`.

## Verification and publication handoff

The exporter and remote-reference checks pass. Website lint, TypeScript, 42 unit tests and
the static production build pass. Playwright passes 47 tests, with 7 existing skips. The
initial run correctly exposed the old journal count of eight; the assertion now expects
eleven entries. The existing route/metadata/layout check includes all three new articles.
Desktop and mobile screenshots were inspected for each new article.

Demo: skip — website content only, with no Home Assistant runtime behavior change. The
repository-required full check is recorded in the PR's verification results separately.

Publication is through a PR and the existing Cloudflare Pages main deployment. At preparation
time main requires the `framework` and `website` checks and one independent human approval;
the agent must not submit that human approval or bypass protection.

After merge, verify `build.json` matches the actual merge commit, open the three production
routes and their Markdown copies, inspect feed/sitemap and check IndexNow. Search Console and
Bing sitemap resubmission are deferred until deployment and require a connected maintainer
tool or account; neither connector is available in this session. Record live verification
and any remaining indexing action in the PR or session handoff, without another audit-only PR.
