# Website audit — enclosure for the CC1101 module and the Atom Lite (SPEC-036)

Source range: main from `10364b4` (the previous `documentationCommit`, #221) to `b6e14f9` (#240,
the merge of `claude/printable-enclosures`: the enclosure under
`devices/enclosures/m5stack-cc1101-atom-lite/`, the module guide's Enclosure section, the exporter
serving enclosure previews; SPEC-036). No tag selected or moved. Status: prepared on
`claude/website-enclosure-preview`; not merged.

| Surface | Result and evidence |
| --- | --- |
| Catalog | No change — no component release in the range is selected. `gate-remote 0.1.1` (#234) is untagged (`release_status.py`); its Release pull request selects it |
| Examples and views | No change — no view or demo changed |
| Hardware | Update: `documentationCommit` and every device and wiring source move from `10364b4` to `b6e14f9`. The only published source that changed in that range is `devices/m5stack-module-cc1101.md`: the Enclosure section (preview, what the box fixes, links to the README, 3MFs, STLs and the OpenSCAD source, pinned to GitHub at `b6e14f9`) and the short-pins note now pointing at it. `docs/tablet-setup.md`, the other device guides and the wiring SVGs are byte-identical in the range. New asset `/enclosures/m5stack-cc1101-atom-lite/closed.png` (kind `enclosure-preview`, DomoSenso, Apache-2.0, exported from `b6e14f9` by the exporter, PNG signature and bytes checked) |
| Guides | No change — the documents stay at `frameworkCommit` `5b01271`; the how-to `/how-to/open-a-garage-door-or-gate/` links the device guide, which now carries the enclosure |
| Journal/homepage | No change — the device guide explains the enclosure; a journal article can follow the first print, with a photograph of it |
| Release ledger | No change — no release selected |

The preview is a render of the model, not a photograph; the guide says nothing has been printed
yet. The DomoSenso.org symbol on the lid follows the brand book's casing mark.

Validation: `export_website.py --verify-remote` and `--check --verify-remote` (`ok website
content`); website lint, typecheck, unit tests and static build with the CI analytics id; the
device guide looked at locally on desktop and at 375 px. The e2e suite runs in the website
workflow of the pull request.

Demo: skip — website content only, no Home Assistant runtime change.

Still to do after merge: the live route `/devices/m5stack-module-cc1101/` and
`/enclosures/m5stack-cc1101-atom-lite/closed.png`, `build.json`, the IndexNow run and the sitemap
resubmission (skill `domosenso-website-audit`, "Tell the search engines").
