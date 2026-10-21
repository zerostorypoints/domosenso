# Compatibility: the contract surface of Domosenso

What a home, another component or a tool outside this repository relies on, and how much each may
change. Modelled on Open Mercato's `BACKWARD_COMPATIBILITY.md`
([research](research/2026-10-20-domosenso-architecture.md) §1). A change to anything listed here
needs a spec in `.ai/specs/` first (AGENTS.md, spec-first).

## Levels

| level | what may change |
|---|---|
| **FROZEN** | nothing, short of a new major version with a migration every home runs |
| **STABLE** | nothing that breaks a home without the deprecation protocol below; additions are free |
| **ADDITIVE-ONLY** | new values, keys or fields may be added; none is removed, renamed or given a new meaning |

Versions are per component (`version:` in `component.yaml`, semantic versioning). While a
component is `0.x`, a minor version counts as the "next version" of the protocol.

## Surfaces

### Distribution

| surface | level |
|---|---|
| Tag scheme `<component>/<version>`, e.g. `bermuda-presence/0.1.0` | FROZEN |
| Remote package URL `github://zerostorypoints/domosenso/components/<id>/<path>@<component>/<version>` (ESPHome device files, `dashboard_import`; at most 255 characters) | FROZEN |
| Component ids (the directory name, `^[a-z0-9]+(-[a-z0-9]+)*$`) | FROZEN |
| Device ids (`devices/<id>.yaml`) | STABLE |
| ESPHome `project:` name `domosenso.<component>` | STABLE |
| Card install path `www/domosenso/<id>/<version>/`, served as `/local/domosenso/<id>/<version>/` | FROZEN |

### Manifest (`component.yaml`, `schemas/component.schema.json`)

| surface | level |
|---|---|
| Required fields and their meaning: `id`, `version`, `summary`, `description_key`, `devices`, `host`, `integrations`, `artifacts`, `tested` | STABLE |
| Optional fields (`inputs`, `provides`, `consumes`, `features`, `local_only`, `photo`, artifact kinds) | ADDITIVE-ONLY |
| `inputs`: each input's name, type and default | STABLE; new optional inputs are free, a new required input is a breaking change |
| `media_player_contract` of the Ramka: `required` / `optional` | STABLE; moving a feature from optional to required is a breaking change |
| Scene files (`schemas/scene.schema.json`, `scenes/README.md`) and device files | ADDITIVE-ONLY |

### Entities a component provides

Each entry in a manifest's `provides.entities` carries its own `stability:` (`frozen`, `stable` or
`additive-only`); the manifest is the source, this page states the rules.

- The **entity id or pattern** (`sensor.presence_<area slug>`, `input_select.<prefix>_mode`) is the
  contract, placeholders included. The slug rule is Home Assistant's: it transliterates
  (`Küche` → `kuche`).
- **Option values of a select or a state set** are part of the entity: `input_select.<prefix>_mode`
  (`off, ambient, controls, calendar`) and `input_select.<prefix>_ambient`
  (`climate, air, plants, photos, status`, in rotation order) are FROZEN.
- **Attributes** a component sets as a marker (`component:`, `area:` on the presence sensors) are
  STABLE.
- **Events** (`esphome.atom_button` with `room`, `click`) carry their own level in the manifest.
- Entity ids Home Assistant builds from a device's area and names
  (`light.<area>_ble_proxy_<room>_led`) are declared, not promised: a Home Assistant release can
  change the rule. Entities under `upstream:` belong to another integration and are not ours to
  freeze.
- An `additive-only` sensor may gain state values (`sensor.<player>_audio_quality`); consumers must
  treat an unknown value as "other".

### Cards (Lovelace resources)

| surface | level |
|---|---|
| Element names `custom:<name>-card` (agenda, air, clock-weather, corner-taps, line-style, mains, now-playing, photo-frame, plants, rooms, status, tap-button) | STABLE |
| Config keys a card's `setConfig` reads, and their meaning | STABLE; new optional keys are free |
| Resource type `module`, ES modules without a build step, JSON imported `with { type: "json" }` | STABLE |

### Translations

| surface | level |
|---|---|
| Layout `translations/<lang>.json`, `en` as source and fallback, languages `en`, `de`, `pl` | FROZEN |
| Namespaces `meta.*` (catalog text), `ui.*` (rendered dashboards), `card.*` (card runtime) | FROZEN |
| Keys a card or template uses | STABLE (renaming one breaks a home's override); new keys ADDITIVE-ONLY |
| The English wording | free; it is text, not a contract |

### Tools

| surface | level |
|---|---|
| Renderer delimiters `[[ ]]`, `[% %]`, `[# #]`; Home Assistant's own `{{ }}` / `{% %}` passed through byte-identical | FROZEN |
| Renderer inputs: globals `t(key)`, `inputs`, `lang`; filter `yaml`; `*.lang.yaml.j2` → `<name>.<lang>.yaml`; an input set to `null` counts as absent | STABLE |
| `--stamp` first line `# Rendered by Domosenso from <component>@<commit> — do not edit` (`-dirty` suffix) | STABLE |
| Command lines of `domosenso_render.py`, `domosenso_install.py`, `catalog_check.py`, `ha-check.sh`, `esphome-check.sh`, `check-all.sh`, `agents_check.py`, `install_skills.py` | STABLE |
| Output lines agents parse: `fresh: N errors`, `config ok` / `config FAIL`, `ok` / `FAIL <step>`, `all checks passed`, `ERROR` / `WARNING` prefixes | STABLE |
| Steps of `check-all.sh` | ADDITIVE-ONLY |

## Deprecation protocol

For a breaking change to a STABLE surface:

1. **Spec first**, saying what breaks, who is affected and the bridge.
2. **A bridge for one version.** The old name keeps working next to the new one for the next
   minor version:
   - a renamed entity → a template alias entity under the old id that mirrors the new one;
   - a renamed option value → automations and cards accept both, the helper offers the new one;
   - a renamed card config key or input → the old key is read as the new one and a warning is
     logged;
   - a renamed translation key → both keys, the old one marked deprecated.
3. **Notes.** An entry in the component's `UPGRADE.md` (what changed, what a home must do, in
   order) and a line in [UPGRADE_NOTES.md](UPGRADE_NOTES.md).
4. **Removal** of the bridge in the version after, with its own note.

A FROZEN surface does not change inside a major version. Until a component's first release to a
home other than its author's, a breaking change may skip the bridge if the upgrade note says so;
the stage 1 renames were made this way.
