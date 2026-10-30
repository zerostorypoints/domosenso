# Website audit — Shelly PM Mini Gen3 device page

Source range: PR #107, merge commit `703424fd168b550ce6d1e68354a4903e62e1ca34` on main
(`devices/shelly-pm-mini-gen3.yaml`, the `mains-meter` and `wind-sensor` found rules).
Status: local implementation in a pull request; not merged or deployed. This note is not
deployment evidence.

Why the page was missing after #107 merged: device pages cite their source at
`documentationCommit`, which was `4a7bcf5` (before #107), and no device record existed.

| Surface | Result and evidence |
| --- | --- |
| Catalog | Update: media lists the Shelly PM Mini Gen3 among its devices; no component version changes (media stays 0.1.0) |
| Examples and views | No change |
| Hardware | Update: new device guide for the Shelly PM Mini Gen3 (what it measures, Ramka's `mains` input, electrician for the wall box, limits) with DomoSenso's own photograph (Apache-2.0; the photo component now shows a photograph without a third-party source link); no wiring diagram yet; the Hegel guide links to it instead of saying no meter guide exists; every device source and wiring diagram pinned to `703424f` |
| Guides | No change — documents stay at `5b01271` (the privacy check, see the 2026-10-30 audio-sensor audit) |
| Journal/homepage | No change: an index entry, not a release |
| Release ledger | No change |

The wind-sensor rule from #107 finds an entity of the awnings package; it has no device of its own
and gets no page.

Validation: `export_website.py --verify-remote`, `pytest tests` (1127 passed), website unit tests,
lint, typecheck, static build with the CI analytics id, e2e on desktop and mobile (47 passed,
7 skipped). The e2e counts move to 11 devices and 10 photos.

## Deferred evidence

- The wiring guide and diagram (#123): once on main, the record's source moves to `devices/shelly-pm-mini-gen3.md`, the diagram joins `assets.json` and `documentationCommit` moves to that merge.
- After merge: check `/devices/shelly-pm-mini-gen3/`, `build.json` and the IndexNow run.
