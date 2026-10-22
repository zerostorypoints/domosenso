# plants: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.

## 0.2.0 (2026-10-21): a package with the plants, their light peak and two alerts

New artifact `templates/package.yaml.j2` → `packages/plants.yaml`: the `plant:` entities with their
thresholds, a 24-hour light peak per plant, the water reminder and the silent-sensor alert. New
inputs: `notify` (required by the package), `notify_from`, `notify_until`, `dry_for`, `silent_hours`
and the plant keys `name`, `sensors`, `min_temperature`, `max_temperature`, `check_days`.

### What a home does

- Nothing, unless it wants the package: then `domosenso add plants@0.2.0` (or `update`), set
  `notify`, and remove any own `plant:` entries and statistics sensors with the same ids: two `plant:`
  keys of the same name do not load, and Home Assistant refuses a second entity with a given
  `unique_id`.
