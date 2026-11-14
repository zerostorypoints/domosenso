# Website audit — the M5Stack Unit CO2L guide and its dragon stand enclosure

Source range: main from `87acd5f` (the previous `documentationCommit`) to `a87cf11` (#299, the
Unit CO2L device file and guide, the `m5stack-co2l-atom-lite` enclosure; SPEC-036 layout). No tag
selected or moved.

| Surface | Result and evidence |
| --- | --- |
| Catalog | No change — no component release in the range. `release_status.py` lists `pocket 0.1.0` and `remote-access 0.2.0` as tagged and unpublished (site none); they predate this range and are left to their own publication |
| Examples and views | No change — no view or demo changed |
| Hardware | Update: `documentationCommit` and every device and source-asset commit move from `87acd5f` to `a87cf11`. In that range the published sources changed only by the new `devices/m5stack-unit-co2l.md`; the other guides, the wiring and dimension SVGs and the CC1101 enclosure previews are byte-identical. New device record `m5stack-unit-co2l` (component `ramka`, compatible with the selected 0.19.0, whose per-room `air` input takes the reading). New assets `/enclosures/m5stack-co2l-atom-lite/closed.png` and `connections.png` (kind `enclosure-preview`, DomoSenso, Apache-2.0), exported from `a87cf11` byte-identical. The guide's other links (README, 3MF, source) go to GitHub at `a87cf11` |
| Guides | No change — the documents stay at `frameworkCommit` `5b01271` |
| Journal/homepage | No change — no news article for one device guide |
| Release ledger | No change — no release selected |

Deferred: `devices/m5stack-led-strip-sk6812.yaml` entered main in the same range without a guide or
a website record; it is left to the change that publishes it.

Validation: `export_website.py --verify-remote` and `--check --verify-remote` (`ok website
content`); website typecheck, unit tests (45) and static build with the CI analytics id;
`out/devices/m5stack-unit-co2l/` renders the guide with both enclosure images served locally.

Demo: skip — website content only, no Home Assistant runtime change.
