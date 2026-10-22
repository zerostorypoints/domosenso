---
name: new-component
description: Scaffold a new Domosenso catalog component (a directory under components/ with component.yaml, translations in en, de and pl, optional README) and get the catalog checker and the tests passing. Use when adding a component to the catalog, after its spec is approved.
---

# new-component

A new component needs an approved spec in `.ai/specs/` first (skill `write-component-spec`). Rule
from AGENTS.md: a thing enters the catalog when it could work in a second home unchanged; nothing
from a real home goes in.

1. **Id.** Lower case and hyphens, `^[a-z0-9]+(-[a-z0-9]+)*$`; the directory name equals `id`.
2. **Manifest** `components/<id>/component.yaml`, schema `schemas/component.schema.json`. Start
   from the smallest real one, `components/weather/component.yaml`. Required: `id`, `version`
   (`0.1.0`), `summary`, `description_key: meta.description`, `devices`, `host.installs`,
   `integrations`, `artifacts`, `tested.ha` (the pinned HA version it was checked on). Add `inputs`
   for everything home-specific, `provides` with a `stability` per entity (`frozen`, `stable`,
   `additive-only`, see `docs/COMPATIBILITY.md`), `consumes` for other components' entities it reads,
   `local_only`. Every path under `artifacts` must exist. A device in `recommend` needs
   `devices/<device>.yaml`.
3. **Translations** `components/<id>/translations/{en,de,pl}.json`, at least
   `{"meta": {"description": "..."}}`. English is the source; German is Swiss Standard German (`ss`,
   never `ß`); Polish without English calques. A key in `de`/`pl` that `en` lacks is an error.
4. **Artifacts**, as needed: `esphome/` (remote packages; the demo home's thin device files in
   `examples/demo-home/esphome/` pull them as
   `github://zerostorypoints/domosenso/components/<id>/esphome/<file>@<id>/<version>`),
   `ha/blueprints/`, `templates/*.j2` (rendered by `tools/domosenso_render.py`; delimiters `[[ ]]`,
   `[% %]`, `[# #]`; inputs in `examples/demo-home/inputs/<id>.yaml`), `cards/` with
   `artifacts.install_path: www/domosenso/<id>/<version>/`.
5. **Notes.** `components/<id>/README.md` for what a home needs to know that the manifest cannot
   say (integration quirks, hardware limits). No household facts.
6. **Catalog lists.** Add the id to `COMPONENTS` in `tests/test_catalog_content.py` (and new
   devices to `DEVICES`) and a row to the components table in `README.md`.
7. **Check** until all pass:

   ```bash
   uv run tools/catalog_check.py --strict
   uv run pytest -q
   tools/ha-check.sh <id>          # when it has ha/, templates/ or artifacts.ha_instance
   tools/esphome-check.sh <id>     # when it has esphome/
   ```

   Then the whole of `tools/check-all.sh` (skill `check`) before the commit.
