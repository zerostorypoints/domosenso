# pocket: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the pocket has to do.

## 0.1.0 (unreleased): areas and the outside range

- The card's config gives each room its HA `area` (the home inputs' `area`, else the room id) and
  `thresholds.outside` (climate-air's outside helpers).
- **What a home does:** name `area` on a room whose id is not its area's id; render climate-air
  too, for the outside helpers.

## 0.1.0 (unreleased): first version

- The phone dashboard: one panel view with `custom:pocket-app`, configured from the home inputs and
  climate-air's threshold helpers.
- **What a home does:** add the component, register a YAML dashboard per language at the paths of
  `dashboard_paths`, and give the home inputs.
