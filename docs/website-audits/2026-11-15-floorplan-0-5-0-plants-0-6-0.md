# Website audit — floorplan 0.5.0 and plants 0.6.0 (pocket 0.2.0 not published)

Source: tags `floorplan/0.5.0`, `plants/0.6.0` and `pocket/0.2.0`, all at `d9da474` (#317, the merge
that raised the versions of work merged after `floorplan/0.4.0`, `plants/0.5.0` and `pocket/0.1.0`).
The Release run 43739463261 tagged all three and opened this pull request (#318) for floorplan and
plants; its publish step refused pocket ("its first record is editorial work"), so the run is red.

| Surface | Result and evidence |
| --- | --- |
| Catalog | Update: floorplan's outcome names the Wi-Fi maps (SPEC-044); versions and commits set by `publish_release.py`. plants: no change to the outcome |
| Examples and views | Update: the floorplan dashboard view (owner `floorplan`) names walls and doors, the radio layer's Wi-Fi coverage maps once an access point is marked, the traffic maps with a supported router (`tplink_deco`, SPEC-047), and walls drawn by weight unless `wifi: false`. The plant care view (owner `ramka`, at the selected Ramka 0.20.0, `e30de12`) adds that with plants 0.6.0 a hydroculture plant is judged on light and temperature only (Ramka 0.20.0's upgrade note, SPEC-048). No change to the Ramka plan view: the radio layer's maps on the Ramka were not checked against Ramka 0.20.0 |
| Hardware | No change — no device added; a Mi Flora in hydroculture keeps its guide (light and temperature are what the plant is judged on) |
| Guides | Update: floorplan setup step 3 adds access points, wall materials and `domosenso floorplan survey`; plants setup step 3 adds `medium: hydroculture` |
| Journal/homepage | No change — Wi-Fi coverage would merit an article; deferred, not part of the release mechanics |
| Release ledger | Update (mechanical): `floorplan/0.5.0` and `plants/0.6.0` at `d9da474` |

Deferred:

- **floorplan's upgrade note is incomplete.** 0.5.0 also ships the network traffic maps (SPEC-047,
  14 commits in the range; described in `components/floorplan/README.md`, "Network traffic"), with no
  entry in `UPGRADE.md`. The ledger's link is pinned to the tag; the entry belongs on main.
- **pocket** has no website record, so `pocket/0.1.0` and `pocket/0.2.0` are tagged but unpublished,
  and each pocket release turns the Release run red until its first record is written (or pocket is
  held in `.github/release-hold`).
- `release_status.py` on this branch also lists `climate-air 0.3.1` (its website PR #316 is open),
  `remote-access 0.2.0` (held) and `roon 0.1.0` as tagged and unpublished; not in this range.

Validation: `export_website.py --verify-remote` and `--check --verify-remote` (`ok website content`);
content and privacy tests; website typecheck, unit tests, static build and Playwright `catalog` +
`framework` specs.

After merge: the live routes `/components/floorplan/`, `/components/plants/`, `/releases/`, and the
`Search engines` run for the merge commit, still to check.

Demo: skip — website content only, no Home Assistant runtime change.
