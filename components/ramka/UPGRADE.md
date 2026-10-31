# ramka: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the Ramka has to do.
`<prefix>` is the home's `prefix` input.

## Unreleased: a measured Behind speakers curve, the preview dashboard by default

SPEC-024.

- **Behind speakers and Half match are no longer flat.** The catalog's EQ presets `behind_speakers`
  (sub −5, bass −10, low mids −3, mids 0, presence +3, air +2 dB) and `half_match` (−2, −5, −1, 0,
  +2, +1) are one measurement: a sensor on an amplifier between the speakers against the listening
  position, and half of it. A starting point; `fitted` stays flat until set. The Behind speakers
  profile starts from that curve (or from `fitted` once it is not flat); the preset's name no longer
  says "flat until set", and its tooltip names the curve.
- **`music_eq_presets` replaces a curve as a whole**: a key left out is 0, as the input always said;
  with the catalog's curves no longer flat, a home's `{behind_speakers: {bass: -6}}` is that one cut
  and nothing else.
- **`preview_dashboard` defaults to true**: a home without the input now gets
  `dashboards/ramka-preview.<lang>.yaml` rendered, and the settings pages' headers link to it.
- Translations: `ui.settings.music_template_behind_speakers_why`, `ui.settings.music_eq_behind_speakers`,
  `ui.settings.music_eq_behind_speakers_why` and `ui.settings.music_eq_half_match_why` change (en,
  de, pl); no new keys.

### What a home does

- A home that relied on the flat default and wants it keeps it with
  `music_eq_presets: {behind_speakers: {sub: 0, bass: 0, low_mid: 0, mid: 0, presence: 0, air: 0}}`
  (or `{behind_speakers: {}}`), then a render. The new curve reaches the Behind speakers profile's
  own helpers only through the seed of a fresh helper or the Music page's Reset; a home whose
  helpers were seeded flat loads the preset into the profile ("Apply the selected preset") or
  resets the Music page to get it.
- The preview: add its `lovelace:` entry with `require_admin: true` (README, "Preview dashboard")
  and deploy (a restart for the entry; the preview's resource `cards/screen-frame-card.js`). Until
  the entry is there, `domosenso status` prints `missing-dashboard-entry dashboards/ramka-preview.<lang>.yaml`
  for each language. A home that does not want it sets `preview_dashboard: false` and renders.

## Unreleased: colour dots in the colour choices, readings without a unit, the albums' column

SPEC-024.

- **Colour dots**: every colour choice shows the colour: the value and each choice of the list have
  the colour's dot in front, the climate picker's swatch, the names in the page's language. The
  settings page's four colour selects (`input_select.<prefix>_air_color_{good,fair,poor}`,
  `input_select.<prefix>_climate_color_neutral`) become the new row
  `custom:ramka-colour-select-row` (`cards/colour-select-row.js`, a new Lovelace resource; entity,
  name, `lang`), which selects with `input_select.select_option`; the Custom widget's dialog has the
  same list (new module `cards/lib/colour-list.js`), Neutral with the neutral colour's dot. The list
  is an overlay (a tap, or an arrow, Enter or Space on the keyboard); Escape closes only the list.
- **Readings without a unit**: the climate picker (Home Assistant's entity picker and the plain
  dropdown) offers a sensor with a unit, a state class (`measurement`, `total`,
  `total_increasing`) or a number for its state, so a score without a unit (an indoor air quality
  score) can be a Custom widget's reading; Temperature and Air quality keep their device classes.
  The widgets' own sensor is never offered. On the Ramka an Air quality or Custom widget's reading
  without a unit shows none (it showed °C or %); a Temperature widget keeps °C and %.
- **Photos page**: the albums are their own section, in the right column next to Basic; the
  render-time inputs and Reset below.
- No new texts (the colours' names are the `card.colours.*` of the release before).

### What a home does

- Render and deploy: the deploy adds the resource `cards/colour-select-row.js` (`deploy --plan`
  prints `resource create`). Nothing else changes in a home's state.

## Unreleased: named colours for Air and Climate, fair / poor, page titles

SPEC-024.

- **One colour list**: the Ramka's named colours (`cards/lib/colours.js`: green, teal, blue, light
  blue, purple, pink, magenta, amber, orange, red, grey), each a series colour of the Ramka's theme,
  so it follows the theme mode. Every colour setting below picks from it and stores the colour's id.
- **Air page colours** (with `air`): `input_select.<prefix>_air_color_good` (the neutral one),
  `_air_color_fair` and `_air_color_poor`, in the Air page's Advanced card after the limits,
  defaults green, amber, red; group `air` (reset with the Air page, seeded while the air numbers are
  untouched; a fresh select starts at its default). The air-card colours its levels from them; its
  theme variables `--air-good`, `--air-raised`, `--air-high` are no longer read. Red is now the
  theme's red (`--graph-color-3`, `#ff7a5c` dark) rather than the air-card's own `#ff6b5c`.
- **Fair and poor**: the Air page's limits read "CO₂ fair from / poor from" (PM2.5, VOC and NOx the
  same; the score keeps "fair below / poor below"), the air-card's own level words are good, fair,
  poor, and PM2.5's and the indexes' labels on the Ramka "fair" and "poor". The helper ids stay
  `input_number.<prefix>_air_<reading>_raised` / `_high`.
- **Climate**: an Air quality widget's colours, with threshold-based colours on, are the Air page's
  three, so both views agree. New `input_select.<prefix>_climate_color_neutral` ("Neutral colour",
  Climate, Advanced, next to "Threshold-based colours", default green, group `climate`): a
  Temperature widget within its range and a Custom widget without a colour of its own (it was the
  theme's text colour). Below (blue) and above (red) are unchanged.
- **Custom widget colour**: the dialog's radio buttons become a dropdown of the named colours
  (names in the page's language) plus Neutral; the widget stores the id (`color: teal`). A colour
  stored as a theme slot number by the build before reads as its colour (4 teal, 5 purple, 6 pink,
  9 green, 11 magenta, 10 grey), in the cards and in `script.<prefix>_climate_rooms_set`, and the
  next save stores the id: no choice is lost.
- **Page titles**: every settings page's header starts with the page's title (the tab's name,
  as its tooltip shows it), then the description and the preview link.
- **Translations**: new `card.colours.*`, `ui.settings.air_color_{good,fair,poor}`,
  `ui.settings.climate_color_neutral`; `card.air.level.{raised,high}` become `.fair`, `.poor`,
  `card.climate_rooms.{raised,high_from}` become `.fair_from`, `.poor_from`,
  `ui.air.{pm,index}_{raised,high}` become `_fair`, `_poor`; `card.climate_rooms.colour` is gone
  (en, de, pl).

### What a home does

- Render and deploy (new module `cards/lib/colours.js`, no new resource). The four selects start at
  their defaults. A theme or dashboard that set `--air-good`, `--air-raised` or `--air-high` picks
  the colours on the Air page instead.

## Unreleased: settings page headers, the Controls page, every screen in the preview

SPEC-024.

- **Headers**: every settings page but About starts with a short text: what its view shows, what
  it is for and when it is on the screen (General: the Ramka as a whole). With `preview_dashboard`
  it links to the preview's tab of the same path; the new input `preview_paths` (the preview
  dashboard's URL path per language, default `ramka-preview`) names it.
- **Controls page** (`/<settings path>/controls`, between Calendar and Music): "Controls on
  approach" (Basic), near distance, near time and how long the controls stay up (Advanced) move
  here from General, the same helpers with the same values. The settings reset's `page` field takes
  `controls`, which resets these four; `page: general` no longer does. The global reset and the
  seed are unchanged.
- **Preview**: always one tab per screen, climate, air, plants, photos, status, calendar,
  **controls** (new) and music. A screen the render left out says which input adds it, without a
  frame; a screen whose page switch is off has a banner over its frame. The frame lays sections in
  the sections view's three columns, applies the cards' own visibility, and keeps a card's own
  height: the calendar tab drew a 56 px strip, its one grid row, instead of the agenda.
- **Translations**: new keys `ui.settings.pages.controls`, `ui.settings.header.*`,
  `ui.settings.preview_link`, `ui.settings.preview_link_general`, `ui.settings.inputs.radar`,
  `ui.settings.inputs.lights`, `ui.preview.switched_off`, `ui.preview.not_set_up` (en, de, pl).

### What a home does

- Render and deploy (`screen-frame-card.js` changes at its path, no new resource; reload the
  preview without the browser's cache to get it). A script or
  automation that calls `script.<prefix>_settings_reset` with `page: general` to reset the near
  settings now passes `page: controls` for them. With the preview on another path than
  `ramka-preview`, set `preview_paths`.

## Unreleased: climate widgets

SPEC-024.

The Climate page's rows (with `climate`) become **widgets** of a type, each with its own settings.

- **Types**: Temperature (a temperature and a humidity sensor), Air quality (CO₂ and PM2.5), Custom
  (any two sensors with a unit) and Empty (an empty tile), chosen in each row's dropdown; the pickers
  offer the type's device classes. Every row is editable: a row without a widget is Empty, and takes
  a type. `sensor.<prefix>_climate_rooms` stores `type` per entry and the type's own values
  (`temp_low`, `temp_high`, `hum_low`, `hum_high`; `color`), an empty one as
  `{type: empty, spacer: true}`. **Existing lists keep every room**: an entry without a type reads
  as Temperature when its main sensor's `device_class` is `temperature`, else Custom (cards and
  `script.<prefix>_climate_rooms_set`), and is stored with its type at the next save. A widget of a
  type whose sensor is not picked yet keeps its row (an empty tile on the Ramka until it has one);
  the sensor's state counts widgets with a reading.
- **Settings dialog** per widget: Temperature, comfort ranges (default 20 to 24 °C, 40 to 60 %);
  Air quality, the Air page's own limits (`input_number.<prefix>_air_{co2,pm2_5}_{raised,high}`, the
  same helpers); Custom, a colour.
- **Threshold-based colours**: `input_boolean.<prefix>_climate_thresholds` (default off; Climate,
  Advanced; group `climate`, reset with the page and seeded with the widgets). Off, the tiles look as
  before, in the series colours; on, the values are blue / neutral / red by their comfort ranges,
  neutral / amber / red by the Air page's limits, a Custom widget's neutral or its colour.
- **Series colours change**: the widgets, the picker's dots and the 7-day chart lines leave out the
  theme's blue, amber, red, orange and light blue (slots 1, 2, 3, 7, 8), so they are never read as a
  threshold: the n-th widget takes slot 4, 5, 6, 9, 11, 10 in turn. Every room's colour changes
  once; with more than six widgets the colours repeat.
- **Number of widgets**: the slider `input_number.<prefix>_climate_slots`, renamed "Number of
  widgets", moves from Climate, Basic to Climate, Advanced; its value and its seed stay.
- **Translations after a deploy**: `climate-rooms-card` and `rooms-card` load their translations and
  the new `cards/lib/climate-widgets.js` with their own `?v=`, so a browser's 31-day cache of
  `/local/` no longer serves an old translation after a deploy in the same version (the picker showed
  the raw key `card.climate_rooms.spacer`).
- Render and deploy; the deploy updates the card resources. The rooms-card gets `thresholds` and,
  for a home with the Air page's CO₂ or PM2.5, `air_limits`; the settings card `air_limits`. Nothing
  else to do.

## Unreleased: preview dashboard

SPEC-024.

**Preview dashboard** (optional): with `preview_dashboard: true` the render also writes
`dashboards/ramka-preview.<lang>.yaml`, one view per screen the home has (climate, air, plants,
photos, status, calendar, music), each screen with the Ramka dashboard's own cards in a frame of
`screen`'s size and a link to that screen's settings page (README, "Preview dashboard"). The
Ramka dashboard renders as before, byte for byte: its screens are now blocks the preview calls.

- **New card resource**: `cards/screen-frame-card.js` (`custom:screen-frame-card`); the deploy
  creates its Lovelace resource. `photo-frame-card` takes `contained: true` (the preview's).
- **New inputs**: `preview_dashboard` (default false; true since the newest entry) and `settings_paths` (the settings
  dashboard's URL path per language, default `ramka-settings`).
- **Renderer**: a template whose output is only whitespace writes no file; that is how the preview
  stays out of a home without the input.

### What a home does

- (Superseded: the input now defaults to true, see the newest entry.) Nothing, without the input.
  To use it: set `preview_dashboard: true` (and `settings_paths` when
  the settings dashboard is not at `/ramka-settings`), render, add the `lovelace:` entry with
  `require_admin: true` (README) and deploy (a restart for the entry, and a new resource).
  Setting the input back to false leaves the rendered files in place: remove them and the entry.

## Unreleased: climate places, order and spacers

The Climate page (with `climate`) gets a number of places, a reorderable picker and spacers.

- **Number of places**: `input_number.<prefix>_climate_slots` (1 to 20, default 10) on the settings
  page's Climate, Basic, in the new settings group `climate_slots`. The seed gives it 10 at the next
  start while it is untouched (also after the seeded flag is on); the Climate page's Reset and the
  global reset restore it. A number set to 1 on purpose reads as untouched and is set to 10 again at
  the next start (one number, as the seed rule goes).
- **Order**: rows are dragged by a handle (mouse and touch) or moved with up and down buttons; no
  values to enter again.
- **Spacers**: a row without a main reading now keeps its place, an empty tile on the Ramka, instead
  of the rooms below moving up. `sensor.<prefix>_climate_rooms` stores it as `{spacer: true}`; its
  state counts rooms only. A home whose list has no gaps sees no change. `script.<prefix>_climate_rooms_set`
  turns a row without a sensor as its main reading into a spacer (it used to drop it), drops spacers at
  the end and keeps up to twenty places (it used to keep ten). An automation that calls the script
  with gaps on purpose gets them as empty tiles now.
- **Colours**: the n-th room (spacers skipped) has series colour n in its tile, the picker's dot and
  both 7-day charts; the charts set it per line, so a room without a second reading no longer shifts
  the humidity lines' colours.
- **Fewer places than rooms**: the rooms beyond are kept in the list but not shown on the Ramka; the
  picker counts them and offers to remove them.
- The rooms-card and both line-style-cards on the Climate view read `slots`
  (`input_number.<prefix>_climate_slots`); render and deploy, and the deploy updates the card
  resources. Nothing else to do.

## Unreleased: music looks

SPEC-024.

**Response profiles** (with `music_visual`): a profile select (`custom`, `behind_speakers`, `lively`,
`calm`, `analyser`), each profile editable with its own values, and EQ presets (README, "Response
profile"). A profile sets rise, fall, hold, tilt and the EQ; it does not change the colour range, so
the four neutral and hot dB values stay the user's whichever profile is on. The visual cards bind
`sensor.<prefix>_music_look` (attributes rise, fall, hold, tilt, eq, read from the selected
profile's own helpers). There is no blind audition.

- **Per-profile values.** Custom keeps its helpers and ids (`input_number.<prefix>_music_{rise_ms,fall_s,hold_s}`,
  `input_number.<prefix>_music_eq_<range>`, `input_boolean.<prefix>_music_tilt`), so its tuning stays.
  New: ten helpers per template, `input_number.<prefix>_music_<id>_{rise_ms,fall_s,hold_s,eq_sub,eq_bass,eq_low_mid,eq_mid,eq_presence,eq_air}`
  and `input_boolean.<prefix>_music_<id>_tilt`, in the new settings group `music_profiles`; the seed
  gives them the catalog's values at the next start (also after the seeded flag is on), and the Music
  page's Reset and the global reset restore them.
- **EQ presets** load into the selected profile's EQ (`script.<prefix>_music_load_eq`, field `preset`),
  no longer always into Custom's.
- **Copy to custom is gone**: `script.<prefix>_music_copy_to_custom` and its button. A template is now
  tuned in place; a home that called the script from its own automations removes the call.
- **Settings, Music**: Basic (with the profile select), Advanced right after it (the whole section
  with the switch: music source, flavours, line width, redraw rate, sensor update rate; no longer an
  explanation of `eco` / `normal` / `fast`), Preview, Profile settings (one card per profile, shown
  while it is selected), Colour range, Calibration. The description card, "Values in use" and the
  preset list are gone: the profile and EQ preset selects carry an (i) tooltip instead.
- **New card resource**: `cards/info-select-row.js` (`custom:ramka-info-select-row`), an entities-card
  row; the deploy creates its Lovelace resource. Its description is a floating tooltip next to the
  (i) (hover shows it, a tap pins it, a tap elsewhere, Escape or a scroll closes it); no layout moves.
- **Settings polish**: on Music, Profile settings and the Colour range show only while "Show advanced
  settings" is on; the music source and the sensor update rate share one "Music sensor" card in
  Advanced; the redraw rate (`input_number.<prefix>_music_fps`) has no row any more (the helper, its
  default 30 and the cards' binding stay; a home that changed it keeps its value). Each EQ preset's
  tooltip explains it and names its curve from the preset table, the home's `music_eq_presets`
  included. On Photos, the time per photo moved from Advanced to Basic. Nothing to do.

The looks need the audio-sensor release that carries the `look` option and `dynamics.eq`; an older
audio-sensor card ignores both and draws without them, so update the two components together.

### What a home does

- With the release that carries it: `domosenso update ramka` and a deploy (a restart: new helpers,
  a template sensor and a new Lovelace resource). The seed gives Custom a flat EQ and a 1.5 s hold
  and selects `custom`, and gives each template its starting values, so the visual looks as before.
- Optional: the home's measured curves in `music_eq_presets` (`behind_speakers`, `half_match`, `fitted`),
  then a render. A home that set `music_eq_presets.mlp_match` while the feature was unreleased renames
  that key to `behind_speakers` (an unknown key fails the render). `behind_speakers`' own EQ starts
  from that curve; a home that changes the curve later and wants it in the profile loads the preset
  into it, or resets the Music page.

## 0.8.0 (2026-10-31): a list of every plant, a leaf instead of the initial, the About page

SPEC-022 amendment 2, SPEC-023.

**The list page.** With more than four plants, list pages follow the tile pages: one row per plant
with its photo, name, room and action (or the watered / water-in line), the sun, fertiliser
and water bars and the moisture line, at most seven rows a page, shared evenly. The plants stage of
the ambient loop counts them: with five or six plants it now lasts 20 s (the tiles, then the list)
instead of 10 s. `list: false` on the card drops them; `list_rows` sets the rows per page.

**A plant without a photo** shows a leaf in its state's colour instead of its initial.

**Settings, About** (SPEC-023): a last page with DomoSenso's header and links, the components the
home runs (`sensor.domosenso_components`, which the `domosenso` command now writes into
`packages/domosenso.yaml`, adding `released` to each entry of `domosenso.lock`), the integrations
they use and the devices behind them, each linked to its page (README, "About page").

New in the package: `shell_command.<prefix>_discover` (in every home, also without photos),
`script.<prefix>_about_refresh`, `sensor.<prefix>_discovery` (excluded from the recorder) and
`automation.<prefix>_about_discover`; new shell files `domosenso_discover.py` and
`domosenso_catalog.json` in `/config/shell/`.

### What a home does

- `domosenso update ramka` with a current `domosenso` command, and a deploy (the cards move to
  `www/domosenso/ramka/0.8.0/`; a restart: new template entities); press the Ramka's reload. No
  inputs change. A snapshot `compare` then shows the new entities `sensor.domosenso_components` and
  `sensor.<prefix>_discovery`.
- Optional: a home whose templates build entity ids at runtime, or with a Bluetooth sensor behind an
  ESPHome proxy, writes `domosenso_discovery.yaml` (README, "About page") and adds it to `local:`.

## 0.7.0 (2026-10-30): the plants page for 1 to 50 plants

SPEC-022, with plants 0.3.0.

**The plants page** shows up to `input_number.<prefix>_plants_per_page` plants (default 6) on a page,
the tiles growing to fill it; above that, pages of that many turn every
`input_number.<prefix>_plants_page_s` seconds (default 10), the plants that need something first,
with a strip of one dot per plant grouped by room and a count. A tile has the plant's photo (or its
initial), name, room, the 7-day moisture line, the action, and "watered N days ago" or "water in ~N
days" when plants 0.3.0 provides them. Three states, never red: good green, neutral grey (no
reading, or water due within 3 days), needs something amber. Up to four tiles keep the three gauges.
The plants stage of the ambient loop lasts two pages at most (one with the defaults and up to six
plants: 10 s instead of 20 s); the card continues on the next pass where it stopped.

**`plants: discover`** (new form of the input): the card finds every plant the plants component
marks (`domosenso_plant`) and reads its room, limits, photo and names from it, so the Ramka's inputs
no longer list the plants. A list keeps working as before; its `label` may be given per language.

**Two settings** on the Plants settings page: plants per page (Basic) and time per page (Advanced),
seeded at the next start and in the page's Reset.

### What a home does

`domosenso update ramka` and a deploy (the cards move to `www/domosenso/ramka/0.7.0/`). To drop the
plant list from the Ramka's inputs: update plants to 0.3.0 and deploy it first (or in the same
deploy), then set `plants: discover`; before plants 0.3.0 runs the page says "no plants".

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
