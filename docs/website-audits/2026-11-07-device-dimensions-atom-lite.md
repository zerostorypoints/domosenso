# Website audit — device dimensions, first device the Atom Lite (SPEC-040)

Source range: main from `e83edec` (the previous `documentationCommit`) to `87acd5f` (#278, the
merge of `claude/hardware-dimensions`: the `dimensions` field of device files, the Atom Lite's
dimensions and drawing, the exporter serving `/dimensions/<id>.svg`, the device page's Dimensions
section; SPEC-040). No tag selected or moved. Status: prepared on
`claude/website-dimensions-atom-lite`; not merged.

| Surface | Result and evidence |
| --- | --- |
| Catalog | No change — no component release in the range. `release_status.py` lists `pocket 0.1.0` and `remote-access 0.2.0` as tagged and unpublished (site none); they predate this range and are left to their own publication |
| Examples and views | No change — no view or demo changed |
| Hardware | Update: `documentationCommit` and every device and source-asset commit move from `e83edec` to `87acd5f`. In that range the published sources changed only in `devices/m5stack-atom-lite.yaml` (the `dimensions` block, A to E) and the new `devices/dimensions/m5stack-atom-lite.svg`; the other device files and guides, the wiring SVGs and the enclosure preview are byte-identical (the enclosure README, which is not served, gained a link to the device file). New asset `/dimensions/m5stack-atom-lite.svg` (kind `dimensions`, DomoSenso, Apache-2.0), exported from `87acd5f` byte-identical. `/devices/m5stack-atom-lite/` and its `index.md` gain the Dimensions section; no other device has dimensions |
| Guides | No change — the documents stay at `frameworkCommit` `5b01271`; `docs/COMPATIBILITY.md` gained the two SPEC-040 rows on main and is published with the next framework move |
| Journal/homepage | No change — a reference table, no news; the enclosure and stand articles can link it |
| Release ledger | No change — no release selected |

The drawing marks in orange the positions the sources name without a number (the Grove socket, the
M2 hole, the USB-C's left–right position); the table holds only the lettered values.

Validation: `export_website.py`, `--check` and `--verify-remote` (`ok website content`); website
unit tests (45) and static build with the CI analytics id; `e2e/catalog.spec.ts` (14 passed,
desktop and mobile); `out/devices/m5stack-atom-lite/index.md` carries the table and the drawing link;
the served drawing is byte-identical to the source.

Demo: skip — website content only, no Home Assistant runtime change.

Still to do after merge: the live route `/devices/m5stack-atom-lite/` and
`/dimensions/m5stack-atom-lite.svg`, `build.json`, the IndexNow run and the sitemap resubmission
(skill `domosenso-website-audit`, "Tell the search engines").
