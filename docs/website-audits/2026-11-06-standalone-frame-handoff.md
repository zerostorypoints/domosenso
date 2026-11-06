# Standalone Frame integration: website audit

Date: 2026-11-06. Prepared range: main `2be0f97826bfefdab3f932d579b1a8221346a55f`
to integration `2ce0be0` plus this documentation update. The branch integrates earlier screen-policy
recovery/unavailable-control fixes and the optional media/calendar correction. No version bump or
tag publication is included. Ramka0.16.0 is already released; that existing tag does not contain
these changes. A branch merge must not be described as installation or released feature availability.

| Surface | Decision and evidence |
| --- | --- |
| Catalog | Deferred publication: no matching new release tag; README/UPGRADE document source behavior. Follow the existing release-reminder issue #239 before advertising it. |
| Examples and views | No website change: the published selection remains pinned. Runtime tests cover minimal inputs and configured availability; screenshot acceptance remains a PR review item. |
| Hardware | No change: no model, firmware, wiring or power specification is introduced. Native BLE is a platform-specific optional adapter, not a universal receiver guarantee. |
| Installation guides | Updated shared `docs/FRAME_INSTALLATION.md` and tablet setup; current source, fresh fixture, startup acceptance and incomplete delivery are distinguished. |
| Journal/homepage | No change: no release/delivery claim or household field story is published. |
| Release ledger | No change: existing tags remain unchanged. `release_status.py` reports unrelated unpublished pocket0.1.0 and remote-access0.2.0; this branch does not resolve them. |

`tools/website_changes.py --base origin/main` reports no website changes. Full catalog checks passed
with 1914 Python tests, 1471 Node tests, eleven pinned-HA startup cases and all remaining runtime
checks. No private household screenshots, addresses, data or source repository mapping is included.

Before merge this note is preparation evidence only. After merge verify the actual target/SHA.
There are no changed live routes, feed or sitemap entries to submit to search engines. After a
future tag, revisit catalog/examples/upgrade availability through the normal Release website PR.
