# DomoSenso framework website

English-only static website for https://domosenso.org. This package is independent
from the catalog's root JavaScript tests and the commercial website repository.
Original source: Apache-2.0, copyright 2026 ZeroStoryPoints GmbH; see ../LICENSE.

## Local build and checks

Use Node 22. From this directory:

```sh
npm ci
npm run lint
npm run typecheck
npm test -- --runInBand
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=G-DOMOTEST01 npm run build
npx playwright install chromium
npm run e2e
```

`next build` exports HTML to `out/`. `python3 scripts/serve.py` serves that output
on loopback port 4336. No runtime API, Python service or Home Assistant connection
is part of the deployed website.

## Updating public content

`content/publication.json` selects exact component tags and commit SHAs and an
allowlist of documents at `frameworkCommit`. From the repository root:

```sh
uv run tools/export_website.py --verify-remote
uv run tools/export_website.py --check
```

Commit the publication selection and the generated snapshots together. Only
select reviewed revisions reachable from the public repository before deployment.
The website consumes committed JSON; the Cloudflare build needs no Git credentials
for another repository and no Python content-generation step. Never move tags.

The build also writes files for AI agents (SPEC-020): `/llms.txt`, `/llms-full.txt` and an
`index.md` beside every content page (`/how-to/<slug>/index.md`, components, devices, docs,
journal, get-started), linked from each page as `rel="alternate" type="text/markdown"`. They are
route handlers rendering the same data as the pages (`src/lib/markdown.ts`, `src/lib/llms.ts`), so
a content update refreshes them; nothing is maintained by hand. The limits in `llms.txt` are the
README's "Prerequisites" at `frameworkCommit`, exported to `src/generated/agent.json`. The clone
commands come from `src/lib/install.ts`, which a test keeps equal to the README's.
`e2e/agent-files.spec.ts` checks a production `out/`: every content page has its `index.md`,
listed in `llms.txt`, and every link there resolves; `e2e/drafts.spec.ts` covers `.md` too.

## Cloudflare Pages configuration

Proposed project: `domosenso-framework`; repository: `zerostorypoints/domosenso`.
Production branch: `main`. Root directory: `website`. Build command: `npm run build`.
Output directory: `out`. Set `NODE_VERSION=22`. The project is not provisioned by
this document. Verify account, GitHub access, DNS and TLS independently.

Watch `website/*` for builds; Cloudflare’s single wildcard also matches nested
paths. Catalog and documentation changes must update the committed snapshots
through the exporter checks. Pull requests must not receive
deployment credentials.
Branch previews set `CF_PAGES_BRANCH`; non-main builds emit `noindex` metadata.
Also verify Cloudflare's preview `X-Robots-Tag` behavior and redirect the production
`pages.dev` hostname to the canonical domain to avoid duplicate indexing.

Attach `domosenso.org` only after the release is approved and the public repository
is reachable anonymously. Configure `www.domosenso.org` to redirect to the apex
with paths and queries retained. Keep commercial domains on their existing Vercel
project. The export has no SPA fallback; unknown paths must return HTTP 404.

## Launch and rollback

Verify all sitemap routes, canonical metadata, license and source links, a nested
direct visit, HTTP 404, preview indexing controls and anonymous onboarding. Publish
commercial cross-links only after the framework site works publicly. A site
rollback restores the preceding deployment; it does not undo repository exposure.

### Publication settings to apply

Use the **Pages** flow under Workers & Pages, with Git integration (not a Worker).
Create the project only after approval to expose the release. A first Pages
production deployment is public on `pages.dev` even before adding a custom domain.

| Setting | Value |
| --- | --- |
| Project name | `domosenso-framework` (confirm availability) |
| GitHub repository | `zerostorypoints/domosenso` |
| Production branch | `main` |
| Root directory | `website` |
| Framework preset | Next.js (Static HTML Export) |
| Build command | `npm run build` |
| Build output directory | `out` |
| Environment variable | `NODE_VERSION=22` in production and preview |
| Build watch include | `website/*` |
| Preview deployments | Enabled and public; every non-`main` build is `noindex` |
| Runtime bindings / secrets | None |

Authorize GitHub access to this repository only if the integration needs approval.
Do not create API tokens in source or add deployment secrets to pull-request jobs.
`CF_PAGES_BRANCH` is supplied by Pages; do not override it. Non-main builds have
`noindex` metadata and `X-Robots-Tag`. Previews are public by decision (2026-10-29); they
hold only what the repository already shows. Cloudflare keeps a preview after merge; the
PR-close workflow deletes it.

After the first successful production deployment, add `domosenso.org` in the
project's **Custom domains** tab. Let Pages set up DNS in the same account. Do not
add a CNAME first and assume that this attaches the domain. Wait for domain and
certificate status to become Active and verify HTTPS independently.

Add `www.domosenso.org` as a custom domain and wait for its certificate. In
Cloudflare **Bulk Redirects**, configure these two exact-host entries (replace the
proposed Pages hostname if Cloudflare assigns a different one):

| Source URL | Target URL | Status | Subpath matching | Preserve path suffix | Preserve query string | Include subdomains |
| --- | --- | --- | --- | --- | --- | --- |
| `https://www.domosenso.org/` | `https://domosenso.org/` | 301 | Yes | Yes | Yes | No |
| `https://domosenso-framework.pages.dev/` | `https://domosenso.org/` | 301 | Yes | Yes | Yes | No |

Enable the list's Bulk Redirect rule. Do not match branch/hash preview subdomains.
Cloudflare Pages `_redirects` does not support domain-level redirects. Verify
HTTP-to-HTTPS behavior for all hosts as well as these HTTPS redirects.

### Public acceptance checks

Run only after the domain is attached and TLS is Active:

```sh
curl -I https://domosenso.org/
curl -I https://domosenso.org/components/ramka/
curl -I https://domosenso.org/this-page-does-not-exist/
curl -I 'https://www.domosenso.org/docs/?from=launch-check'
curl -I 'https://domosenso-framework.pages.dev/docs/?from=launch-check'
curl -fsS https://domosenso.org/robots.txt
curl -fsS https://domosenso.org/sitemap.xml
curl -fsS https://domosenso.org/llms.txt | head
curl -I https://domosenso.org/how-to/automate-old-awnings/index.md
```

Expect 200 for real pages, 404 for the missing page and redirects to
`https://domosenso.org/docs/?from=launch-check` for the aliases. The `index.md` answers
`content-type: text/markdown; charset=utf-8` and `link: <…/how-to/automate-old-awnings/>; rel="canonical"`. Check the response
headers from `public/_headers`, canonical URLs, page metadata, mobile navigation
and source links. Verify every sitemap route anonymously. The selected
`frameworkCommit` and component commits must be reachable without authentication.

For a preview, verify both `noindex` metadata and `X-Robots-Tag: noindex`. Previews are
public; do not put anything on them that the repository does not show. List a PR's pages
with `uv run tools/website_changes.py --base origin/main --preview-url <preview>`.

On first-launch failure, remove custom-domain routing or restore a holding page;
there is no earlier DomoSenso Pages deployment to roll back to. For later releases,
use Pages' prior successful production deployment. Repository visibility cannot
recall copies already downloaded. Revert commercial links if the framework site
is unavailable for a prolonged period.

References: [static Next.js](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/),
[custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/),
[preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/),
[redirects](https://developers.cloudflare.com/pages/configuration/redirects/).

Merge the release PR with a merge commit that preserves its commits. The curated
`frameworkCommit` points at the reviewed documentation commit; squashing and then
deleting the branch would not preserve that commit as an ancestor of `main`.
If the merge method changes, select and regenerate content from an immutable
revision that will remain publicly reachable before publishing the website.

## Manual setup

Done once in the provider panels; nothing here is provisioned by the repository.

- Cloudflare Pages project `domosenso-framework`: enable preview deployments for non-production
  branches.
- Create a Cloudflare API token with Account > Cloudflare Pages > Edit (Cloudflare may not let you
  narrow it to one project; check when creating it, and note that it can also deploy to production).
  Store it as repository secret `CLOUDFLARE_API_TOKEN` and add repository variable
  `CLOUDFLARE_ACCOUNT_ID`. The preview-cleanup workflow skips until both are set.
- On the first preview, verify the `noindex` metadata and the `X-Robots-Tag` header once.
- IndexNow: the key file is `website/public/<key>.txt`; nothing else is needed.
- Sitemap resubmission to Search Console and Bing after a merge is an agent step in the
  `domosenso-website-audit` skill.

## Optional analytics and webmaster verification

Production may set `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` to its own GA4 web-stream ID
and `NEXT_PUBLIC_BING_SITE_VERIFICATION` to its own Bing ownership token. These
are public build-time identifiers, not secrets. Leave both unset in forks and
previews; never inherit the maintainer's analytics property. See `.env.example`.

The tag is loaded only after explicit consent. Visitors can decline or revoke
through Analytics settings in the footer. Stored choices expire after 180 days;
advertising consent and Google signals remain off. Page and referrer URLs omit
query strings and fragments. Enhanced measurement is disabled in the production
GA4 stream so automatically captured interactions do not bypass that policy.

For analytics browser checks, build with the fake ID `G-DOMOTEST01` (as CI does).
Tests intercept the tag request; no test traffic goes to a production property.
A GA4 property and Search Console association are configured in their provider
panels; a successful build alone does not establish that analytics receives data.

## Visual catalog, device guides and journal

`content/components/<id>.json` binds editorial text, illustrative states and view ownership to
the selected component release. `content/devices/` names explicit public source files at
`documentationCommit`; `content/assets.json` records preview/wiring/photo provenance. Run the
exporter from the repository root to regenerate catalog, docs, editorial JSON and pinned SVGs.
Never edit generated snapshots alone. The exporter rejects stale component/view versions and
missing or unsafe evidence/asset paths.

Journal entries live in `content/journal/<slug>.md` with YAML frontmatter: slug, title, summary,
category (`releases`, `updates`, `installations`), date (`YYYY-MM-DD`, quoted), status
(`draft` or `published`), author, components, releases and sources; cover is optional. A release
reference records id, version, tag and full commit. Keep historical references fixed. Journal drafts
are excluded from all generated website data. Published articles feed `/journal/feed.xml`.

How-to guides live in `content/how-to/<slug>.md` with YAML frontmatter: slug, title, description
(at most 160 characters), components, devices, status (`draft` or `published`), updated
(`'YYYY-MM-DD'`), sources and branches. Each branch has situation, needs, wiring and supported
(`yes`, `coming-soon` or `no`), plus issue for `coming-soon` and prompt for `yes`. The exporter writes
them to `src/generated/howtos.json`. Drafts render with a banner on preview builds (`CF_PAGES_BRANCH`
set and not `main`) and never appear on production. Import `howtos.json` and `@/lib/howto` only from
server modules, never from a `'use client'` component or anything it imports, because client bundles
are public. `e2e/drafts.spec.ts` checks a production `out/` for draft text.

Examples use manual controls and fictional data. Preview illustrations are not dashboard
screenshots. Do not imply mobile HA layout support because the website itself is responsive.
Use the repository `domosenso-website-audit` skill around merges and release publication; record
local, merged and production state separately. The skill is not an automatic background job.

### Hardware product photographs

Device records reference `photo` paths from `content/assets.json`. Product photographs live in
`public/hardware/` and render on the hardware index and device guide with source credits.
Builds use the committed files without downloads or third-party image requests.

To replace or add a photograph, verify the exact hardware model, save a local WebP without
embedded metadata (maximum 1000 × 800, keep aspect ratio and avoid enlargement), and update
its asset entry: alt text, credit, source page and image URLs, rights/terms, retrieval date,
width, height and SHA-256 of the saved file. Set the device's `photo` path, regenerate the
content with `uv run tools/export_website.py`, then build and inspect desktop/mobile output.
Keep the original rights notice; product photographs are not Apache-2.0. See
[photo sources and terms](public/hardware/SOURCES.md) before reusing or publishing the images.
