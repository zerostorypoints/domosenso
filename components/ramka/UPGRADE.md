# ramka: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the Ramka has to do.
`<prefix>` is the home's `prefix` input.

## 0.6.0 (2026-10-30): the sensor update rate, the music view sets "watching", ten Climate rooms

The music parts go with audio-sensor 0.2.0 (#99, #110); without audio-sensor they change nothing
but a label.

**Music page, Advanced.** A "Sensor update rate" row sets audio-sensor's choice
`input_select.audio_sensor_music_spectrum_rate`; it shows only while audio-sensor provides it. The
Music page's reset and the global reset set it to `normal` when it is there. The redraw rate's
label is now "Redraw rate" (it was "Refresh rate"): it is how often the browser draws, not how new
the data is.

**The automation `<prefix>_music_watching`** turns `input_boolean.audio_sensor_music_watching` on
while any Ramka's music view shows (`binary_sensor.<prefix>_music_view`, which gains the attribute
`component: ramka`) and off when none does; audio-sensor puts the board on `fast` only then.

**Ten Climate rooms** (SPEC-021 amendment 3). Climate → Advanced takes up to ten rooms instead of
five; the default and the reset are the first ten of `climate`. A home whose rooms were set on the
page keeps them; one with more than five `climate` rooms adds the others on the page, or presses the
Climate page's reset to take the first ten.

### What a home does

`domosenso update ramka` and a deploy (the cards move to `www/domosenso/ramka/0.6.0/`). With
audio-sensor, update it to 0.2.0 in the same deploy.

## 0.5.0 (2026-10-30): Photos, Air, Climate, Calendar and General settings

Settings pages for more of the Ramka (SPEC-021 amendments 1 and 2); they need 0.4.0's "Ramka
settings" dashboard entry, nothing else.

**Photos, Air, Calendar and General pages** (SPEC-021 amendment 1). Photos: photos per series, time
per photo and the albums (`input_number.<prefix>_photo_count`, `_photo_s`, `sensor.<prefix>_photo_albums`
with the new card `photo-albums-card`, a new Lovelace resource the deploy creates). Air: a switch and two limits per configured reading (`input_boolean.<prefix>_air_<reading>`,
`input_number.<prefix>_air_<reading>_<level>`), read live by `air-card`'s new `show:` and
`{entity, default}` limits. Their defaults are 0.3.0's five photos of 10 s from all folders and the
air page's former limits, set by the seed at the next start; nothing to do. General links to the
Ramka view (new optional input `dashboard_paths` for a dashboard per language) and says how the
language is chosen; Calendar links to adding a calendar by URL.

**Albums, all kept** (amendment 2). "All albums" on Photos → Advanced no longer clears the ticked
albums: it greys them out until it is unticked. `sensor.<prefix>_photo_albums` gains the attribute
`all`, `script.<prefix>_photo_albums_set` the field `all_albums`; a sensor from 0.4.0 without it reads as
before (none chosen is all).

**Climate rooms** (amendment 2). Climate → Advanced picks up to five rooms, each a name, a main
reading and a second one with Home Assistant's searchable entity picker (sensors with a unit; new card
`climate-rooms-card`, a new Lovelace resource the deploy creates). The room tiles and both 7-day
charts follow them, outside stays last. They live in `sensor.<prefix>_climate_rooms` (set by
`script.<prefix>_climate_rooms_set`); the seed fills it once with the first five of `climate`,
temperature and humidity, so the page looks as before. A home with more than five `climate` rooms
shows its first five after the update: pick the others on the page, or keep `climate` to five.

### What a home does

`domosenso update ramka` and a deploy: the cards move to `www/domosenso/ramka/0.5.0/` with their
resource URLs, the restart creates the new helpers and the seed sets them. Check after the restart
that `sensor.<prefix>_climate_rooms` lists the rooms.

## 0.4.0 (2026-10-29): the now-playing view can draw the room's music; live settings

0.4.0 includes 0.3.1 (the clock card's forecast comes back after a restart); a home on 0.3.0 gets
both with one update.

New optional inputs `music_visual` (`spectrum` or `level`), `music_visual_options` and
`settings_defaults`. With `music_visual`, the now-playing card's wave strip shows audio-sensor's
spectrum or level of the board marked `music: true`; a new helper `input_select.<prefix>_music_visual`
(`spectrum`, `level`, `classic`, the input's choice first, no `initial:`) picks it.

**Live settings.** Every behaviour setting is a helper the tablet reads live, now including the
music visual's look and a switch per view (`input_boolean.<prefix>_page_<view>`). A new admin
dashboard, "Ramka settings" (`dashboards/ramka-settings.<lang>.yaml`), has one page per view plus
General, each in Basic and Advanced parts; add its `lovelace:` entry from the README ("Settings
page"). The visual is chosen on the settings dashboard's Music page.
**Theme.** `input_select.<prefix>_theme_mode` sets the server's default theme (`ramka-dark` or
`ramka-light`) for every browser on "Backend-selected", not only the tablet.
**Starting values.** On the first start of 0.4.0 the automation `<prefix>_settings_seed` turns the
page switches on, sets the helpers that are new to their defaults (new optional input
`settings_defaults`) and turns `input_boolean.<prefix>_settings_seeded` on. **A home that already
runs the Ramka keeps its tuned values:** the presence and display helpers are set only when all
seven numbers still sit at their minimum, as on a first install. To start over later, press
"Reset to defaults" on a page or on General.

`music_visual_options` keeps its keys, gains `fps` and now gives the visual's starting values (what
the seed and the reset write into its helpers) instead of literal card options; the render checks
them (README, "Music visual"). The templates' fallbacks now equal the defaults (they were 120 s off
delay, 3 s near hold, 50 cm, brightness 20 to 255, a 15 s controls hold in two places).

### What a home does

One step is required: add the "Ramka settings" dashboard's `lovelace:` entry to the home's
`configuration.yaml` (README, "Settings page"); until then `domosenso status` prints
`missing-dashboard-entry dashboards/ramka-settings.<lang>.yaml`. The tablet itself works without
it, and the seed gives every new helper its value at the first start. Render with a `domosenso`
command from this catalog release or later: an older one puts the settings dashboard under
`packages/`, where Home Assistant refuses it. To use the visual, install `audio-sensor` with one
sensor marked `music: true`, set `music_visual: spectrum` or `level`, render both and deploy.
Updating moves the cards to `www/domosenso/ramka/0.4.0/` and the twelve resource URLs with them
(`domosenso update ramka` and a deploy do both); the deploy's restart creates the new helpers and
runs the seed. Check after the restart that `input_boolean.<prefix>_settings_seeded` is on and
every `input_boolean.<prefix>_page_<view>` is on. A dashboard or theme of the home's own that relied
on the Ramka's view theme `ramka` keeps it: the theme stays in `themes/ramka.yaml`.

## 0.3.1 (2026-10-29): the forecast comes back after a restart

An open page reconnects after a Home Assistant restart before the weather integration is back, so
the clock card's forecast subscription was refused or answered with no days, and the forecast
stayed empty until the page was reloaded. The card now subscribes again on every reconnect and as
soon as the weather entity is back, and retries after 10 s, 30 s, 60 s and then every 5 minutes
until days arrive. Card code only.

### What a home does

Nothing is required. Updating moves the cards to `www/domosenso/ramka/0.3.1/` and the twelve
resource URLs with them (`domosenso update ramka` and a deploy do both). A home that added an
automation reloading the tablet's page after every start for this can remove it.

## 0.3.0 (2026-10-27): the status page is optional

New optional input `status_page` (default `true`). With `status_page: false` the status page is
left out like any other missing page: its section is not rendered, and the ambient rotation and
the swipes step over it. `input_select.<prefix>_ambient` keeps all five options. Rendering fails
with `status_page: false leaves no ambient page` when no other page is there.

### What a home does

Nothing is required: without `status_page` the package and the dashboards render as in 0.2.2.
Updating moves the cards to `www/domosenso/ramka/0.3.0/` and the twelve resource URLs with them
(`domosenso update ramka` and a deploy do both). A home that wants no status page sets
`status_page: false` in its inputs and renders again.

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
