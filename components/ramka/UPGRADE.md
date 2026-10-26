# ramka: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the Ramka has to do.
`<prefix>` is the home's `prefix` input.

## 0.2.2 (2026-10-26): the pages fit under Home Assistant's header

The cards take their height from the screen (`calc(100dvh - …)`), which assumed the tablet's kiosk
view with no header. Opened in a browser, the Home Assistant header (56 px) stays, so every page
ran 56 px past the bottom of the window. The heights now subtract the header when it is shown:
`var(--kiosk-header-height, var(--header-height, 0px))`, which kiosk-mode sets to 0px where it hides
the header.

### What a home does

Nothing is required. On a tablet in kiosk mode the dashboards render as in 0.2.1. Updating moves
the cards to `www/domosenso/ramka/0.2.2/` and the twelve resource URLs with them (`domosenso update
ramka` and a deploy do both).

## 0.2.1 (2026-10-26): the cards fit a browser window

The rooms, air, plants and status cards sized their type by the card's height alone. In a window
squarer than the tablet (a desktop browser beside the Home Assistant sidebar) the cards grow tall
while the tiles stay narrow, so temperatures ran into each other and names were cut short. Their
sizes are now capped by the card's width, at the card's own proportions on the 1100 × 720 tablet.

### What a home does

Nothing is required. On the tested tablet (1100 × 720) the four cards render pixel for pixel as in
0.2.0; on a squarer screen (1024 × 800, or a browser window) their type is smaller and fits.
Updating moves the cards to `www/domosenso/ramka/0.2.1/` and the twelve resource URLs with them
(`domosenso update ramka` and a deploy do both).

## 0.2.0 (2026-10-22): optional pages, the tablet's screen size, a recommended tablet

- `climate`, `air`, `plants` and `photo_dir` are optional. A page whose input is absent is left out:
  its sections are not rendered and the rotation steps over it (the swipes too); without `photo_dir`
  the photo helper, image, shell commands and the `<prefix>_photo_index` automation are left out as
  well. `input_select.<prefix>_ambient` keeps all five options.
- New optional input `screen: {width, height}`, the tablet's CSS viewport as `domosenso probe`
  reports it. Absent means 1100 × 720. Rendering fails with `no tested layout for <w>x<h>` when no
  tested layout fits; the one there is fits 1024–1280 × 720–800 CSS px.
- `android-tablet` recommends `tcl-9469x`, the tablet the Ramka is tested on.

### What a home does

Nothing is required: with all three pages given and no `screen`, the package and the dashboards
render byte for byte as in 0.1.2. Updating moves the cards to `www/domosenso/ramka/0.2.0/` and the
twelve resource URLs with them (`domosenso update ramka` and a deploy do both). A home that wants to
drop a page removes its input and renders again.

## 0.1.2 (2026-10-22): metadata only

The manifest states the homes it is tested in (`tested.homes: 1`), so `domosenso recommend` no longer
says "unknown". Cards, templates and translations are unchanged.

### What a home does

Nothing is required: a home on 0.1.1 can stay there. Updating moves the cards to
`www/domosenso/ramka/0.1.2/` and their twelve resource URLs with them (`domosenso update ramka` and a
deploy do both).

## 0.1.1 (2026-10-21): "Tomorrow" capitalised in en and de

The agenda's label for the next day was lower-case in English and German ("tomorrow", "morgen")
while the weekday names beside it are capitalised. Polish keeps "jutro", in line with "pn"…"nd".

### What a home does

- Install the cards: they go to the new directory `www/domosenso/ramka/0.1.1/`, because the 31-day
  `/local/` cache would keep serving the old translation under `0.1.0/`.
- Update each of the twelve Lovelace resources in place from `/local/domosenso/ramka/0.1.0/cards/<name>.js`
  to `/local/domosenso/ramka/0.1.1/cards/<name>.js` (`lovelace/resources/update`, same resource id).
- Reload the tablet. No restart, no entity changes. The old `0.1.0/` directory can be deleted afterwards.

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
