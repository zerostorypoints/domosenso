# climate-air: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.

## 0.2.0 (2026-10-21): a package with the whole home's figures

New artifact `templates/package.yaml.j2` → `packages/climate-air.yaml`; new optional inputs
`outside_weather`, `bathroom_humidity` and the room keys `indoor`, `bathroom`, `battery`; new
entities (`provides` in `component.yaml`). Nothing that existed changes.

### What a home does

- Nothing, unless it wants the package: then `domosenso add climate-air@0.2.0` (or `update`), set the
  inputs, and remove any own package that defines the same `unique_id`s (`climate_*`): Home
  Assistant refuses the second entity with a given `unique_id` ("ID ... already exists").
