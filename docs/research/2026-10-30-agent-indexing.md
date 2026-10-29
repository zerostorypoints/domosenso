# domosenso.org indexing after SPEC-020: baseline

Status: first reading, 2026-10-30 00:10 CET, two hours after the agent files went live (PR #96,
merge `d1e89f4`, 2026-10-29 22:02 UTC). Required by SPEC-020, acceptance item 5. The second reading
is due 2026-11-06 and is added to this file under its own heading.

## Live site

Read with `curl` from the maintainer's Mac:

| URL | status | Content-Type | Link |
|---|---|---|---|
| `/how-to/automate-old-awnings/index.md` | 200 | `text/markdown; charset=utf-8` | `<https://domosenso.org/how-to/automate-old-awnings/>; rel="canonical"` |
| `/get-started/index.md` | 200 | `text/markdown; charset=utf-8` | `<https://domosenso.org/get-started/>; rel="canonical"` |
| `/llms.txt` | 200 | (body starts `# DomoSenso`) | — |
| `/llms-full.txt` | 200 | `text/plain; charset=utf-8` | — |

The `:slug` placeholder in a `_headers` value works on Cloudflare Pages; this was the one part
the local tests could not cover. `sitemap.xml` lists 46 URLs.

## IndexNow

The `indexnow` workflow ran on the merge (run 40962782910): it waited for the deploy of
`d1e89f4`, then `submitted 40 urls (200)`. The log does not list them; on the branch before merge,
`tools/website_changes.py --format urls` listed 37 `index.md` files and the two llms files, so the
40 are taken to be those plus one page (inference, not read from the run).

## Google Search Console (`sc-domain:domosenso.org`)

- Sitemap `https://domosenso.org/sitemap.xml`: valid, 0 errors, 0 warnings, last downloaded
  2026-10-29 19:22 (as the API reports it, no zone given), 46 URLs reported as indexed.
- URL inspection:

| URL | verdict | coverage | last crawl |
|---|---|---|---|
| `/` | PASS | Submitted and indexed | 2026-10-29 |
| `/how-to/automate-old-awnings/` | PASS, rich result: Breadcrumbs | Submitted and indexed | 2026-10-29 |
| `/get-started/` | PASS | Submitted and indexed | 2026-10-29 |
| `/llms.txt` | NEUTRAL | URL is unknown to Google | never |
| `/how-to/automate-old-awnings/index.md` | NEUTRAL | URL is unknown to Google | never |

The HTML pages are in Google. The markdown copies and `llms.txt` are not in the sitemap and Google
has not found them yet. That is expected: they exist for agents, and each HTML page names its
copy with `rel="alternate"`, which Google may or may not follow.

## Bing Webmaster Tools (`https://domosenso.org/`, verified)

- Sitemap: status Success, submitted 2026-10-29 19:22 UTC, last crawled 2026-10-25 07:42 UTC
  with 23 URLs. Bing has not re-read it since the site grew to 46 URLs.
- Crawl stats, latest day (2026-10-28): 0 pages crawled, 0 in index, 0 errors.
- URL info for `/how-to/automate-old-awnings/`: no discovery or crawl date (never crawled).
- Crawl issues: none.

Bing has not indexed domosenso.org yet. ChatGPT search draws on Bing according to press reports,
not OpenAI (SPEC-020, Evidence).

## Brave Search

Searched at `search.brave.com` (Claude's web search uses Brave):

| query | domosenso.org results | other results |
|---|---|---|
| `site:domosenso.org` | 0 ("Too few matches were found") | — |
| `domosenso.org` | 0 | the GitHub repository, its issues and pull requests |
| `domosenso home assistant catalog` | 0 | the GitHub repository, `domosenso-frame-ha`, pull requests |
| `domosenso automate old awnings` | 0 | other awning sites, one domosenso pull request |

Brave knows the project only through GitHub. An agent searching through Claude today lands on the
repository, whose README points it to the how-tos and `llms.txt` (SPEC-020, README block), so the
route to a recipe exists even before Brave indexes the site.

## Not read here

- Cloudflare AI Crawl Control: whether real search and agent crawlers pass the zone. The
  maintainer reads it in the dashboard (SPEC-020, off-site steps).

## What to compare on 2026-11-06

- Bing: sitemap URL count and last crawl, crawl stats (crawled, in index), URL info for the
  awnings how-to.
- Google: whether any `index.md` or `llms.txt` becomes known; the three HTML pages stay indexed.
- Brave: the same four queries; any domosenso.org result.
- Cloudflare: requests per crawler in AI Crawl Control, from the maintainer.
