# SPEC-039: Search engines hear about a website change from CI, not from an agent

- Status: **approved 2026-11-07** by the maintainer.
- Source: the maintainer, 2026-11-07, after the ramka 0.17.0 website release (#273). He wants the
  submissions to search engines to happen as part of the workflow. Until now a session had to
  resubmit the sitemap by hand.
- Builds on SPEC-020 (agent-readable website, IndexNow) and the `domosenso-website-audit` skill,
  "After merge".
- Touches:
  - `.github/workflows/indexnow.yml`;
  - `tools/indexnow.py`;
  - a new `tools/submit_sitemap.py`;
  - their tests;
  - `website/README.md`;
  - the website-audit skill.

  No component, schema or command.

## 1. Problem

After a merge to `main` that changes the website, two things happen today:

- **Automatic:** the `IndexNow` workflow waits until https://domosenso.org/build.json reports the
  merge commit. Then it posts the changed URLs (`website_changes.py --format urls`) to IndexNow, which
  Bing uses. Verified on 2026-11-07 for #273: 55 URLs, HTTP 200.
- **By hand:** a session resubmits https://domosenso.org/sitemap.xml to:
  - Google Search Console (`sc-domain:domosenso.org`);
  - Bing Webmaster (`https://domosenso.org/`);

  with its own connected tools (audit skill, "After merge", step 3). That depends on a session
  remembering it, and on that session having the maintainer's Google and Bing tools.

There is also a gap in the automatic part. `wait_for_commit` accepts only the exact merge commit.
When two merges land close together, the later deploy can replace the earlier one before the
earlier job sees its own commit. That job then times out after 15 minutes and submits nothing. The
tool's docstring names this case and leaves it to the manual sitemap resubmission.

## 2. Goal

Every website-changing merge to `main` ends with the search engines told, with no agent step:

1. IndexNow gets the changed URLs, as today. A job whose commit was overtaken by a later deploy still
   submits.
2. The sitemap is resubmitted to Google Search Console and to Bing Webmaster, from the same job,
   once the site serves the commit.
3. A fork, or this repository without the credentials, skips the sitemap step with a notice and stays
   green. Nothing of the maintainer's is needed to build or test the site.

## 3. Design

### 3.1 `tools/indexnow.py`: an overtaken commit counts as served

`wait_for_commit` accepts the served commit when it equals `--sha` or when `--sha` is its ancestor.
The workflow already checks out with `fetch-depth: 0`. The tool fetches `origin main` once and asks
`git merge-base --is-ancestor <sha> <served>`. The URLs submitted stay the ones this merge changed.
The pages now carry the later commit's content as well, which is what a crawler should see anyway.

### 3.2 `tools/submit_sitemap.py` (new)

`uv run tools/submit_sitemap.py [--sitemap https://domosenso.org/sitemap.xml]`

It reads its credentials from the environment and prints one line per engine:

- **Bing:** `BING_WEBMASTER_API_KEY` (an API key from Bing Webmaster Tools). It calls the Webmaster
  API's sitemap submission for site `https://domosenso.org/`.
- **Google:** `GOOGLE_SEARCH_CONSOLE_CREDENTIALS` (a service account's JSON key). It gets an OAuth
  token for the `webmasters` scope and calls Search Console API `sitemaps.submit` for
  `sc-domain:domosenso.org`.

Output lines: `ok <engine>`, `skip <engine>: no credentials`, or `FAIL <engine>: <HTTP status> <reason>`.
It exits 1 on any `FAIL`; a skip is not a failure.

The site URL, the Search Console property and the sitemap come from constants next to `HOST` in
`indexnow.py`, overridable by flags. A fork that publishes its own site sets its own.

Its dependencies (`google-auth`, for the service-account token) go in PEP 723 inline metadata at
the top of the script. The `domosenso` package's dependencies do not change.

### 3.3 The workflow

`indexnow.yml` (display name "Search engines") keeps one job:

1. Compute the changed URLs. If the output is `no website changes`, stop.
2. `indexnow.py --sha $SHA`, as today, with 3.1.
3. `submit_sitemap.py`, only when step 2 ran. Its env reads `secrets.BING_WEBMASTER_API_KEY` and
   `secrets.GOOGLE_SEARCH_CONSOLE_CREDENTIALS`. A missing secret shows as a `skip` line.

`concurrency: search-engines` with `cancel-in-progress: false`, so back-to-back merges queue instead
of racing.

### 3.4 Docs and the skill

- **`website/README.md`:** the two secrets, what each is for, and the setup below. Forks leave them
  unset.
- **Website-audit skill, "After merge":** step 3 becomes "confirm the Search engines run: `ok` or
  `skip` for each engine". The manual resubmission with a session's tools stays only as the
  fallback after a `FAIL` or a timeout, and the audit note records it.

## 4. What the maintainer sets up once (manual, credentials stay his)

Checked on 2026-11-07, names only, no values read. The maintainer's machine already reaches both
services for HiFiSync, through MCP servers in the user configuration:

- **Bing:** an API key in the `bing` server's environment (`BING_WEBMASTER_API_KEY`). One Bing
  account holds both sites, so the same key covers domosenso.org.
- **Google:** an OAuth client of type "installed app" (`~/.config/gsc/client_secrets.json`, used by
  `mcp-search-console`) acting as the maintainer's own account. Its Google Cloud project therefore
  has the Search Console API enabled already. There is no service account.

None of the HiFiSync repositories, nor this one, holds such a secret on GitHub. HiFiSync submits from
a session, not from CI.

1. **Bing:** copy the existing key into this repository's secret `BING_WEBMASTER_API_KEY`. The
   maintainer runs one command that reads it from his configuration without printing it. An agent
   does not enter credentials.
2. **Google:** in the same Cloud project:
   - create a service account with a JSON key, stored whole as the secret
     `GOOGLE_SEARCH_CONSOLE_CREDENTIALS`;
   - in Search Console, add the account's e-mail to `sc-domain:domosenso.org` (Settings → Users and
     permissions) with the permission `sitemaps.submit` needs. Full is expected to be enough;
     confirm at setup.

   Rejected: putting the maintainer's own OAuth refresh token into CI. It acts as his personal
   account, and a client whose consent screen is still in "Testing" gets refresh tokens that expire
   after seven days, so the job would fail silently a week later. Inference: the client's consent
   screen status was not checked.

Until these exist, the sitemap step prints `skip` for both and the workflow passes.

## 5. Compatibility

No component, input, entity, schema or `domosenso` command changes. No surface in
`docs/COMPATIBILITY.md` is touched; homes notice nothing. Forks keep building, testing and running
the workflow, which skips the sitemap step.

## 6. Tests

- **`tests/test_indexnow.py`:** the served commit equal to `--sha`, newer with `--sha` as ancestor,
  unrelated, and unreachable then served. Git calls and HTTP are faked.
- **`tests/test_submit_sitemap.py` (new):**
  - Bing success and HTTP error;
  - the Google token request and a successful `sitemaps.submit`, then a 403 (the service account
    lacks permission);
  - each engine skipped when its variable is unset, and the exit codes.

  HTTP and the token are faked; no network.
- `tools/check-all.sh --local` stays green; `agents_check` covers the skill edit.
- **Live, after the secrets exist:** the first merge that changes the website shows `ok` for Bing
  and Google in the run. Search Console's sitemap report then shows a fresh "last read" date.

## 7. Out of scope

- Requesting indexing of single URLs from Google (the URL Inspection API does not index; the
  Indexing API is for job and broadcast pages only).
- The commercial site (domosenso.com) and any other property.
- Reporting search performance.

## 8. Open questions; what is verified and what is inference

Verified on 2026-11-07:

- **IndexNow:** the workflow submits after the deploy (55 URLs, 200).
- **Bing sitemap resubmission:** through the Webmaster API with the maintainer's connection:
  "submitted successfully".
- **Search Console:** after resubmission, `sitemap.xml` reads "Valid", 60 URLs, 0 errors.
- **The timeout case:** read from `indexnow.py`. Not observed in a run.

Inference, to confirm while implementing:

- **Google:** retired its anonymous sitemap "ping" in 2023, so the Search Console API with a service
  account is the way left.
- **Bing** (read since approval in the source of the `bing` MCP server used on 2026-11-07): `POST https://ssl.bing.com/webmaster/api.svc/json/SubmitFeed?apikey=<key>` with the JSON body `{siteUrl, feedUrl}`.
- **Service account permission:** which permission level `sitemaps.submit` requires.

Open:

- Whether the Bing sitemap resubmission is worth keeping next to IndexNow, which already gives
  Bing every changed URL. Proposed: keep it. It is one call, and it covers an IndexNow failure.
