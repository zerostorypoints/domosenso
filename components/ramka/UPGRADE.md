# ramka: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the Ramka has to do.
`<prefix>` is the home's `prefix` input.

## 0.1.0 (2026-10-20): from a home's own Ramka to the catalog component

The package and the dashboard are now rendered from `templates/` with the home's inputs
(`tools/domosenso_render.py components/ramka --inputs <inputs.yaml> --out <dir>`): `package.yaml`
once, `dashboard.<lang>.yaml` for en, de and pl.

### What changed

- **Helper option values are English.** Dashboards and automations read these states, so this is
  a breaking change.

  | helper | before | now |
  |---|---|---|
  | `input_select.<prefix>_mode` | `off, ambient, controls, kalendarz` | `off, ambient, controls, calendar` |
  | `input_select.<prefix>_ambient` | `temperatury, powietrze, rosliny, zdjecia, status` | `climate, air, plants, photos, status` |

  Renamed: `kalendarz → calendar`, `temperatury → climate`, `powietrze → air`, `rosliny → plants`,
  `zdjecia → photos`. `off`, `ambient`, `controls` and `status` stay.
- **The entity prefix is an input.** Every helper, script, automation id and template entity is
  `<prefix>_*`; unique ids likewise. A home that keeps its old prefix keeps its entity ids.
- **Entities renamed** so that nothing names one player or one language, and so that a second
  Ramka in the same home does not collide:

  | before | now |
  |---|---|
  | `binary_sensor.<prefix>_hegel_playing` (unique id `<prefix>_hegel_playing`) | `binary_sensor.<prefix>_media_playing` |
  | `input_text.ramka_zdjecie` | `input_text.<prefix>_photo` |
  | `image.ramka` (unique id `ramka_photo`) | `image.<prefix>_photo` (unique id `<prefix>_photo`) |
  | `shell_command.ramka_index`, `shell_command.ramka_pick` | `shell_command.<prefix>_index`, `shell_command.<prefix>_pick` |

- **Template entities carry `default_entity_id`**, so their entity ids follow the prefix whatever
  the `name` input says.
- **Wind banner:** with the `wind_sensor` input, a heading "awnings rolled in" (`ui.wind.awnings_rolled_in`)
  shows over the ambient pages and the controls while that sensor is `on`. It takes one row, so the
  page under it scrolls by that much while it shows.
- **Labels come from translations** (`translations/<lang>.json`, keys `ui.*`) or from the inputs'
  `label:` values; the media player is any `media_player` (see `media_player_contract` in
  `component.yaml`), with the player-specific sensors as optional inputs.

### What an existing home must change

Do it in one step, on staging first, then production (spec §5.1b).

1. Write the inputs file with the home's entity ids, its current prefix and its labels (room
   names, per-cover `status_label`, `media_label`, `media_turn_on_label`), render, and replace the
   package and the dashboard with the rendered files. Point the dashboard's `filename:` in
   `configuration.yaml` at the language its tablet user reads, e.g. `dashboard.pl.yaml`.
2. Search everything else the home owns for the old option values and entity ids, and rename them:
   other dashboards, automations, scripts, template conditions (`is_state(…, 'kalendarz')`),
   `state:` / `state_not:` / `option:` / `to:` / `from:` values, staging or test tooling, and the
   recorder's include/exclude lists (`input_text.ramka_zdjecie`).
3. Restart Home Assistant rather than reloading the input_selects: in HA 2026.9.2 a reload keeps
   a current state that is no longer an option (`kalendarz`), a restart sets it to the first
   option, `off` and `climate`. The next radar event moves them on.
4. In Settings → Devices & services → Entities, remove the orphans the renames leave behind:
   `binary_sensor.<prefix>_hegel_playing`, `image.ramka`, `input_text.ramka_zdjecie`.
5. Install the cards, the shell scripts and the theme:
   `uv run tools/domosenso_install.py components/ramka --config <config dir>` copies the cards,
   `cards/lib/` and `translations/` to `www/domosenso/ramka/0.1.0/` (the manifest's
   `install_path`), `shell/ramka_pick.py` and `shell/ramka_index.py` to `shell/`, and
   `themes/ramka.yaml` to `themes/`, and prints the twelve resource URLs,
   `/local/domosenso/ramka/0.1.0/cards/<name>.js`. Change each existing Lovelace resource of a
   Ramka card to its new URL in place (`lovelace/resources/update`, or Settings → Dashboards →
   Resources → edit); adding the new ones beside the old would define every custom element twice,
   and the second definition throws. Restart Home Assistant (step 3) rather than only reloading,
   then reload the tablet's page.
