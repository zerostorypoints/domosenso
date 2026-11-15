# Audio-sensor PDM board: pre-merge website audit

Date: 2026-11-15. Source: PR #310, approved PDM scope now identified as SPEC-051
(previously SPEC-050; renumbered because main independently used 050 for HiFiSync).
Reviewed feature revision before integration: `008543f`; target main: `6b8023b`.
This note covers the source changes and merge preparation, not a completed release.

| Surface | Decision and evidence |
| --- | --- |
| Catalog | Update after release: 0.5.0 adds ESP32-S3 IM73D122 and optional OLED. Publication currently selects audio-sensor 0.4.0 at af0d3f27a30a04e9fd5cb3cf9b5458deb182753f; keep that released selection until the new tag exists. |
| Examples and views | Source examples add PDM with/without OLED. Existing HA/music views retain their contracts and defaults; no board-specific UI changes. Re-export release-backed examples when 0.5.0 is selected. |
| Hardware | New original assembly guide and bottom-view ESP wiring SVG in devices/. Defer public guide selection to the release website PR; verify its documentation SHA includes these files. Atom remains supported. |
| Guides | Source compatibility and upgrade steps document additive inputs, fixed PDM gain, optional OLED and owner-managed thin files. Re-export pinned documentation at publication. |
| Journal and homepage | No change now: no released capability to announce. An editorial article is optional after the tag; do not imply a deployed home or calibrated microphone. |
| Release ledger | Deferred: audio-sensor/0.5.0 does not exist remotely. The normal Release workflow should create the tag after an approved main merge and open the mechanical website publication PR. |

`tools/export_website.py --check --verify-remote`: ok website content. No website
files change in this PR; `tools/website_changes.py --base origin/main` reports no
website changes. No changed live routes, desktop/mobile presentation or sitemap
submission to verify at this stage. Browser demo skipped: it cannot establish
physical PDM/I2C performance; HA/card runtime is unchanged.

`tools/release_status.py` reports the expected untagged audio-sensor 0.5.0 plus
pre-existing pending climate-air, pocket, remote-access and roon work. Those are
outside this PR; no tags or publication selections are changed here.

## Evidence and limits for publication

Shared FFT bench: 48 kHz, 31 finite bands, at least 60 seconds per eco/normal/fast
profile, OLED on and polling suspended. At 400 kHz I2C, normal publication averaged
200 ms and fast 85.5 ms; residual synchronous-display jitter remains. Final firmware
was checked after reboot for 90 seconds and the operator confirmed readable Now/Max
and a responsive bar. This is offline UART and physical-display evidence, not HA
registry/network acceptance, calibrated SPL/20 Hz response or a deployed home.
Keep tested.homes at 0 and retain these limits in release-backed content.

## Merge/release follow-up

After merge verify the actual main merge SHA and Release run. After the tag exists,
review the workflow-created website PR, verify catalog/device/guide references and
changed routes, then follow normal human approval and publication rules. Do not
create/move tags manually. If merge is blocked on human approval, this pre-merge
assessment remains valid for the reviewed source range; no live release is claimed.
