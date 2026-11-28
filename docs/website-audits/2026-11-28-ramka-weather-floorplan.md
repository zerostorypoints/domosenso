# Website audit — Ramka, Weather and Floorplan

This change combines the generated website updates in #343, #346 and #348. The catalog
selects `ramka/0.24.0` at `6146173107945fbcdd7a3cdebcd65680f4709835`,
`weather/0.3.0` at `4c8c5418b9904e9d2de3d5b986eba2eca8edcc2e` and
`floorplan/0.5.1` at `7709bb25807f8d64ef85268000b73b6a9a4ed8ef`. The
Ramka changes from `ramka/0.23.0` are included in the public copy and in the
selected Ramka upgrade notes.

| Surface | Result |
| --- | --- |
| Catalog | Select the three latest tags and regenerate the public data together. Weather 0.3.0 installs a Home Assistant package. The website browser test covers both an installable component (Weather) and a descriptive integration (Calendar). |
| Examples and views | Update Ramka photo folders, Ramka weather warnings and Floorplan plant markers using the corresponding tagged upgrade notes. Existing illustrations still show the base views. |
| Hardware | No device requirements changed. Update compatibility records for the existing Ramka equipment. |
| Guides | Describe the optional Weather inputs and update order. Floorplan users update the component and reload their dashboard. |
| Journal and homepage | The component pages and linked upgrade notes cover the changes. The homepage and release index pick up the generated versions. |
| Release ledger | Select one current tag per component. Ramka 0.23.0 remains available from its public tag and through the upgrade notes. |

Local validation included the remote-tag export check, lint, TypeScript, 45 website unit tests,
a static build and 47 desktop/mobile browser tests. The built HTML and Markdown for all three
components were checked against their selected source commits.

Demo skipped because this change only affects the website and its tests. After merge,
verify the affected live routes and the Search engines workflow for the merge commit.
