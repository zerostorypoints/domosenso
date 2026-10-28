# Website audit — visual catalog and journal

Source main reviewed: `5b012718dcce57a386b1f3cfe87b8d7512c39b2f`.
Previous framework documentation selection: `817f8de4eebce9563b385294376e6b751c01ef9f`.
Status: local implementation; not merged or deployed. This note is not deployment evidence.

| Surface | Result and evidence |
| --- | --- |
| Catalog | Update: Ramka 0.3.0, awnings 0.2.1 and Room presence 0.2.1 selected from verified public tags; all ten entries retain immutable source SHAs |
| Examples and views | Update: ten bounded fictional examples, explicit rendering ownership, configuration conditions and view previews |
| Hardware | Update: nine shared device guides, two pinned public SVG wiring diagrams with pin tables, optional equipment retained in export |
| Guides | Update: documentation snapshot at reviewed main and Ramka photo documentation; pinned links from device/component pages |
| Journal/homepage | Update: four sourced articles, historical Ramka 0.2.0 reference preserved, installation story labeled personal evidence, latest entries and RSS |
| Release ledger | Update: selected versions and related release articles; article references remain separate from current versions |

Validation includes exporter provenance, draft exclusion, content/privacy checks, static build,
unit tests and browser journeys on desktop and mobile. The implementation plan's final execution
record records the completed runs. Review actual production routes separately after deployment.

## Deferred evidence

- No Shelly installation guide is published: the exact model and public compatibility evidence
  are not yet established in this catalog. Generic mains-meter optionality is not model support.
- New photographs and additional installation stories require specific publishable evidence.
- PR 67's local demo targets a feature branch and is not presented as a released website feature.
- The tagged component update has not been applied to any private home as part of this work.

After an authorized merge/deployment, verify the actual merge revision, changed live routes,
selected versions, source links, sitemap and RSS. A repeat audit or note-only PR should reuse
this record rather than create an audit loop. No background monitoring has been scheduled.

Final local verification: 775 Python tests, 127 card tests, full HA/ESPHome checks, website
lint/typecheck, 10 unit tests, static build and 37 browser tests passed. One desktop run of the
mobile-only navigation test was intentionally skipped. Independent code/content review findings
were fixed; no production result is claimed.
