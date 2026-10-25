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

Commit the publication selection and both generated snapshots together. Only
select reviewed revisions reachable from the public repository before deployment.
The website consumes committed JSON; the Cloudflare build needs no Git credentials
for another repository and no Python content-generation step. Never move tags.

## Cloudflare Pages configuration

Proposed project: `domosenso-framework`; repository: `zerostorypoints/domosenso`.
Production branch: `main`. Root directory: `website`. Build command: `npm run build`.
Output directory: `out`. Set `NODE_VERSION=22`. The project is not provisioned by
this document. Verify account, GitHub access, DNS and TLS independently.

Watch `website/**` for builds; catalog and documentation changes must update the
committed snapshots through the exporter checks. Pull requests must not receive
deployment credentials. Keep previews private until repository publication.
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
| Build watch include | `website/**` |
| Preview deployments | Disabled initially; enable only with an Access policy |
| Runtime bindings / secrets | None |

Authorize GitHub access to this repository only if the integration needs approval.
Do not create API tokens in source or add deployment secrets to pull-request jobs.
`CF_PAGES_BRANCH` is supplied by Pages; do not override it. Non-main builds have
`noindex` metadata, but that is not access control. Pages Access for previews does
not protect the production `pages.dev` address or custom domains.

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
```

Expect 200 for real pages, 404 for the missing page and redirects to
`https://domosenso.org/docs/?from=launch-check` for the aliases. Check the response
headers from `public/_headers`, canonical URLs, page metadata, mobile navigation
and source links. Verify every sitemap route anonymously. The selected
`frameworkCommit` and component commits must be reachable without authentication.

For a preview, verify both `noindex` metadata and `X-Robots-Tag: noindex`, and that
Access blocks an anonymous browser if private previews are enabled. Do not use
robots.txt as an access-control mechanism.

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
