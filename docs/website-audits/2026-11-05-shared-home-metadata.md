# Shared home metadata: merge audit

Reviewed 2026-11-05 for [PR #219](https://github.com/zerostorypoints/domosenso/pull/219).
The approved head was `1831a7270c4217015b08112f15f1b5b769f018d4`; the actual squash
merge into main is `6d3d8e27c839553a249db5d5b53a6d3aa21949c3`. Their trees are identical.
The main change comprises four documentation files; no runtime, manifest version,
website asset or publication selection changes. Framework and website CI passed;
the demo job records the docs-only skip rather than runtime acceptance.

| Surface | Result and evidence |
|---|---|
| Catalog | No change — design/handoff only; no component version or tag changed |
| Examples and views | No change — no dashboard, condition or default changes |
| Hardware | No change — installation requirements are proposed, not new tested hardware claims |
| Guides | Deferred — publish shared-input migration and native compatibility minima after their implementations and releases pass acceptance |
| Journal and homepage | No change — a design merge establishes no new released behavior |
| Release ledger | No change — this PR creates no tag or release |

`uv run tools/website_changes.py --base origin/main` reported `no website changes`
for the candidate. `uv run tools/release_status.py` listed `remote-access 0.2.0`
and `timers 0.1.0` as unpublished on the existing site, with all other inspected
components released. These pre-existing publication gaps are outside this design PR;
do not turn the design audit into a release or alter tags to clear them.

No changed website route requires live acceptance or indexing submission for this
range. No website publication or production verification is claimed. At browser
track A2 and native track F2 release, audit the exact released versions, setup and
upgrade guides, component coverage and compatibility documentation separately.
