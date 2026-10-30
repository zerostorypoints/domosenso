# Website audit — audio-sensor 0.1.0 and Ramka 0.4.0

Source range: PR #113, merge commit `4a7bcf5f222f38dbb9f9e8790c95b56e68305b0c` on main.
Tags published from that commit with `tools/release.py`: `audio-sensor/0.1.0`, `ramka/0.4.0`.
Status: local implementation in a pull request; not merged or deployed. This note is not
deployment evidence.

Why the site did not change at merge: #113 touched no file under `website/`, so Cloudflare Pages
did not build, and the site only shows tagged releases selected in `publication.json`. The tags
did not exist until this audit. Publication stays a manual step (AGENTS.md, "Website impact at
merge and release").

| Surface | Result and evidence |
| --- | --- |
| Catalog | Update: Ramka 0.4.0 and audio-sensor 0.1.0 selected from the public tags; new editorial record for audio-sensor (media-display, hardware required, rendered by Ramka) |
| Examples and views | Update: every Ramka-owned view now cites the 0.4.0 commit; now playing names audio-sensor as an optional provider; the status view's condition names the settings dashboard; audio-sensor has a fictional three-state example |
| Hardware | Update: new device guide for the M5Stack Atom EchoS3R (power, first USB flash, limits), no photo; device compatibility moves to Ramka 0.4.0; device sources and wiring diagrams pinned to `4a7bcf5` |
| Guides | No change — documents stay at `5b01271`: CONTRIBUTING.md at `4a7bcf5` names the maintainers, which the website privacy check refuses |
| Journal/homepage | Update: release article `ramka-0-4-0` with both immutable release references |
| Release ledger | Update: the article carries tags and commit; upgrade links come from the selected tags |

The website renders a device without a photo (the photo component returns nothing when the record
has none). The e2e counts move to 11 components, 10 devices and 6 articles; photos stay 9.

Validation: `export_website.py --check --verify-remote`, website unit tests, lint, static build,
e2e on desktop and mobile (47 passed), `tools/check-all.sh --local` (HA/ESPHome not run).

## Deferred evidence

- A publishable photo of the Atom EchoS3R, with credit and license.
- The documentation snapshot: move `frameworkCommit` once the public docs are cleared for the
  website's privacy check, or the check allows the maintainers' names there.
- PR #107 (Shelly PM Mini Gen3 and wind-sensor index entries) is not merged; its device page
  follows with a later documentation selection after it merges.
- After merge: check the live routes, `build.json`, the IndexNow run and the sitemap resubmission.
