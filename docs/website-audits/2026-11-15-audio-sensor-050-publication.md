# Audio-sensor 0.5.0 publication audit

Date: 2026-11-15. Publication PR #311 follows framework PR #310 / SPEC-051.
Remote annotated tag audio-sensor/0.5.0 resolves to merged main commit
`10b863238b9d89208a60a6e3d9bd959d47a0f083`; its tag object is
`121b0bcb7e5255279598c54ec23fd3c170beb886`. No tag was moved or recreated.

Release run 43724445629 successfully checked, tagged and pushed audio-sensor and
opened #311. Its final failure is unrelated: climate-air 0.3.1 lacks an upgrade
heading accepted by release.py. That component remains a separate release task;
the audio-sensor tag is valid. Do not describe the aggregate run as fully green.

| Surface | Result |
| --- | --- |
| Catalog | Update: selects the exact 0.5.0 tag/commit, lists Atom and ESP32-S3 IM73D122, explains fixed gain and optional OLED. Existing music-view conditions and owners remain unchanged. |
| Examples/views | No rendering change: existing fictional spectrum/level examples still apply to both adapters; setup describes explicit board selection and preserving thin files. No new calibrated-measurement claim. |
| Hardware | Update: new public PDM device page and original wiring SVG, explicit microphone orientation and ESP bottom view, voltage/pin tables, L/R uncertainty and factory choice. Atom compatibility advances to 0.5.0. |
| Guides | Update: device documentation and assets pinned to the released main commit. The PDM page uses editorial text backed by released device metadata; its detailed source guide was written before tagging and is explicitly labelled as such. This avoids presenting historical unreleased wording as current status. |
| Journal/homepage | No new article: release ledger and component/device pages explain this additive hardware option; no new installation story or changed homepage claim. Existing historical article release references remain fixed. |
| Release ledger | Update: 0.5.0 available at its verified public tag. Old tag URLs remain unchanged. |

All device/asset source references advance together to the documentation commit,
as required by the exporter. Existing device text and assets remain unchanged;
new PDM content is original and contains no private photos, addresses or logs.

Physical evidence: 48 kHz PDM, 31 finite spectrum bands over at least 60 seconds in
each profile, voice-responsive OLED and held maximum. At 400 kHz I2C, normal/fast
mean publication intervals were about 200/85.5 ms. Residual jitter remains. No
actual HA metadata, direct octave-entity runtime acceptance, calibrated SPL/20 Hz
accuracy, general module L/R bias or deployed-home acceptance is claimed.

Validation and handoff: exporter regeneration and remote verification pass. Full
catalog checks and website lint/typecheck/unit/build/e2e results, desktop/mobile
visual evidence, final reviewed SHA and changed routes are recorded in PR #311.
Demo skipped: editorial data and a device guide, no HA runtime change. Eligible
human approval is required separately from independent technical review.

After merge, verify the actual merge revision, deployed build.json, component and
new device page, release ledger, SVG, agent Markdown/llms index and sitemap. Read
Search engines for IndexNow submission and Google/Bing sitemap results. Record
those observed results in the PR handoff, not as pre-merge assertions here.
