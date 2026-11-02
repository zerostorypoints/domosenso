# Website audit — ten releases with assistant metadata (#175)

Source: #175 (`af0d3f2`) raised the version of thirteen components for the optional assistant
definition (SPEC-029); the Release workflow tagged each at `af0d3f2`. Selected here: audio-sensor
0.4.0, awnings 0.3.0, backup 0.2.0, bermuda-presence 0.3.0, calendar 0.2.0, climate-air 0.3.0,
lights 0.3.0, media 0.2.0, plants 0.4.0, weather 0.2.0. floorplan 0.4.0 and ramka 0.12.0 are
selected in #173, which this branch builds on. remote-access 0.2.0 is on hold
(`.github/release-hold`) and has no page. This pull request supersedes the workflow's one per
component: #176–#184 and #187. Status: prepared on `claude/website-assistant-releases`; not merged.

The ten `UPGRADE.md` entries are one text with the component's id and version: optional metadata,
no new entity, no change to helpers, dashboards or automations, nothing exposed until a home
chooses sources in a compatible Frame app (`docs/ASSISTANT.md`).

| Surface | Result and evidence |
| --- | --- |
| Catalog | Update: each component's record carries its new `version` and `sourceCommit` (`publish_release.py`); no text changes, the outcome and setup steps are unchanged by the release |
| Examples and views | Update: every view owned by these components cites `af0d3f2`; conditions and defaults unchanged |
| Hardware | Update: devices with a compatibility entry for these components name the new versions |
| Guides | No change — the documentation selection (`frameworkCommit`, `documentationCommit`) is untouched |
| Journal/homepage | Deferred — the assistant answers need a compatible Frame app that is not public; an article belongs with that app |
| Release ledger | Update: `publication.json` selects the ten tags with their commit |

`release_status.py` after the change: every component released but remote-access 0.2.0 (on hold).
The e2e counts do not change (12 components).

Validation: `export_website.py --verify-remote` (`ok website content`), `tools/check-all.sh`,
website lint, typecheck, unit tests, static build, e2e on desktop and mobile.

Still to do after merge: the live routes, `build.json`, the IndexNow run and the sitemap
resubmission (skill `domosenso-website-audit`, "Tell the search engines").
