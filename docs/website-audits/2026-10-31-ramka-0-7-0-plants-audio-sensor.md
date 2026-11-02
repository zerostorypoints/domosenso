# Website audit — Ramka 0.5.0 to 0.7.0, plants 0.3.0 and 0.3.1, audio-sensor 0.2.0

Source range: main from `4a7bcf5` (the last selected Ramka and audio-sensor release) to `878d5ac`.
Tags selected: `ramka/0.7.0` at `c54b824` (#130), `plants/0.3.1` at `7be07cb` (#132, tagged
2026-10-31 during this audit), `audio-sensor/0.2.0` at `0f1f0a7` (#127, #128). `plants/0.3.0`
(`c54b824`) is covered by the 0.3.1 selection. `ramka/0.5.0` (`12b24d7`, #124) and `ramka/0.6.0` (`0f1f0a7`) are covered by
the 0.7.0 selection and the article. Status: Ramka 0.7.0, plants 0.3.0 and audio-sensor 0.2.0
merged in #137 (`af1b38c`), plants 0.3.1 in #138 (`74c9f19`); both live and verified on
2026-10-31 (below).

Why the site fell behind: the five tags were pushed in the evening of 30 October, after the last
publication (`c0be4b7`, 10:45). The `Release reminder` workflow listed them in issue #125, but
publication stays a manual step (AGENTS.md, "Website impact at merge and release") and no session
took it.

| Surface | Result and evidence |
| --- | --- |
| Catalog | Update: Ramka 0.7.0, plants 0.3.1 and audio-sensor 0.2.0 selected from the public tags; Ramka's setup names the new settings pages; plants' setup names the optional photo and `plants: discover` |
| Examples and views | Update: every Ramka-owned view cites `c54b824`; conditions for plants (discover, six per page, paging; UPGRADE.md 0.7.0), climate (ten rooms; 0.6.0), air (per-reading switch and limits; 0.5.0), photos (albums, count, time; 0.5.0) and audio-sensor's music view (faster rate while shown; audio-sensor 0.2.0, Ramka 0.6.0); audio-sensor's scenario states 5 updates a second by default (200 ms), about 12 on `fast` (85 ms). Previews unchanged: illustrations, not screenshots |
| Hardware | Update: compatibility of the TCL tablet, the LD2410C, the Atom Lite, the Atom EchoS3R and Mi Flora moves to the selected versions; no device was added or dropped in the three manifests. Device sources stay at `1578932` |
| Guides | No change — the documentation selection (`frameworkCommit`, `documentationCommit`) is untouched; moving it is a separate decision (see the 2026-10-30 note) |
| Journal/homepage | Update: release article `ramka-0-7-0` covering all six tags; plants 0.3.1's two fixes in one sentence |
| Release ledger | Update: the article carries the three selected tags and commits; upgrade links come from the selected tags |

The e2e counts move to 7 articles and 4 releases.

Validation: `export_website.py --verify-remote` and `--check --verify-remote` (`ok website
content`), website lint, typecheck, unit tests (42 passed), static build, e2e on desktop and mobile
(47 passed, 7 skipped). `release_status.py --hold remote-access`: `ok`.

## Live verification (2026-10-31)

- `https://domosenso.org/build.json` shows `74c9f19`, the merge commit of #138.
- Every route `website_changes.py --base 878d5ac --head 74c9f19 --format urls` lists (30, with the
  `index.md` copies, `llms.txt` and `llms-full.txt`) returns 200.
- The component pages show Ramka 0.7.0, plants 0.3.1 and audio-sensor 0.2.0; Mi Flora and Atom
  Lite name plants 0.3.1; `/releases/` lists the three versions; `/journal/ramka-0-7-0/` names
  `plants/0.3.1` at `7be07cb`; the article is in `llms.txt` and `sitemap.xml`.
- The IndexNow runs for #137 and #138 succeeded. The Release reminder run after #138 closed #125.
- Sitemap resubmitted at 13:06: Search Console (`sc-domain:domosenso.org`) accepted it, pending
  processing; Bing Webmaster (`https://domosenso.org/`) accepted it.

Nothing deferred.
