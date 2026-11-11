# pocket: field notes

A phone dashboard for the Companion app, built on Home Assistant's areas (SPEC-038), the shared home
inputs as defaults, and climate-air's threshold helpers. One YAML dashboard per language with one `panel` view holding one card,
`custom:pocket-app`, which draws every screen itself.

The design system (navigation, widgets, tiles, sheets, levels, data sources, the checklist for a
new feature and the decisions behind them) is [DESIGN.md](DESIGN.md); a change that adds or alters
a pattern updates it.

## The 0.1.0 prototype

- **Home** in two views, switched under the title: **Overview** (`#/`): attention pills, widgets
  (inside and outside, the air score, lights on, power now and plants, each opening its details or
  page), the weather in one row (with a `weather` entity: the condition now, today's high / low and
  chance of rain, opening the forecast sheet), now playing (whatever plays anywhere, else the first
  area's player) and quick light tiles. **Systems** (`#/systems`): the same pills and a tile per
  aspect the home has, on the bar or not (Areas, Climate, Media, Power, Plants, Scenes, Floor plan,
  System), each with a headline, a status and an amber or red dot when it is worth a look by the
  levels its page uses; a tap opens the page: from the high level down to the details.
- **Controls** (`#/controls`, `#/controls/status`): the Ramka's controls and status for the phone, two
  views under the title. Controls: music (the player that plays), covers by area (open / stop /
  close, all open / all closed), timers (the timers component's user timers, found by their role, or the input `timers` when it lists some: time left, start or pause, cancel), lights (a tile per room,
  All off). Status: covers, doors and windows, lights per room and locks, read-only. Covers, timers,
  contacts (binary sensors of class door, window, garage door or opening) and locks are found by
  area through the registries; each section only when the home has some.
- **Safety** (`#/safety`; a Systems tile, a bar choice): one answer at the top ("All quiet", or what
  needs a look), then alarms (smoke, gas, carbon monoxide, water leak, tamper; one that is not
  reporting says so), doors and windows, locks (lock at once, unlock after a second tap), covers
  (Close all after a second tap), the siren (Test after a second tap, a short sound when it takes a
  duration; Stop) and who is home (HA's people, and the rooms whose occupancy sensors sense someone).
  Each section only when the home has some. Every open door or window, unlocked lock, open cover,
  alarm or sounding siren is also a red pill first on Home, opening Safety. A component's own
  computed flag (`attributes.component`), an entity only restored by HA and a drive's health
  (`safety` class) are not alarms.
- **Scenes** (`#/scenes`): the scenes a person keeps at hand, by area, one tap each; "Choose" lists
  every scene Home Assistant has (found by area through the registries) with a switch each. The
  choice is per person; until one is made, the scenes the home inputs name.
- **System** (`#/system`, from Systems): the last automatic backup (amber after 8 days, red after
  30 or when the last attempt failed), the updates waiting (each opening HA's more-info), the
  devices that read nothing, and for an administrator a link to HA's settings.
- **Widgets** (Overview): each opens a sheet, never a page. An aggregate (many sensors: Inside and
  Outside with the areas of that type, Lights on with every lamp to switch, Power with its meters,
  Plants with every plant) lists them, each row opening its trend; one sensor (Air) opens its trend,
  the sensor's other measurements a pick away. Inside and Outside show the range of their areas' main
  temperatures; "No areas assigned" (opening Settings → Areas) or "Main sensor not set" otherwise.
- **The areas** are Home Assistant's, by their HA names, in floor order; a new area appears as
  Inside. **Settings → Areas** lists every area with its type (Inside, the default; Outside; Not
  assigned, which hides it from Pocket's views, not from this list) and its
  main sensors (climate, air quality, light level, sound, pressure: `cards/lib/kinds.json`); a row, or
  the settings button on an area page, opens that area's settings page (`#/settings/areas/<id>`),
  where each setting is a row with a drop-down. An administrator changes them
  there (climate into HA's own Related sensors, the rest into Pocket's home store, HA's frontend system
  data); anyone else sees them read-only, each with where it came from. An area's only candidate becomes
  its main sensor once, the first time an administrator opens Pocket. The skill `set-up-areas` asks the
  rest during onboarding and writes it as defaults into the home inputs; `domosenso areas <target>` shows
  it all from the running home.
- **Include in checks** (an area's settings): every area, an outside one too, counts for All good, the
  pills, the Climate tile and the advice until it is switched off there (or `checked: false` in the home
  inputs). Pocket's other built-in rules, and which have a setting, are in DESIGN.md 10.2.
- **Quick actions** (Home → Quick, Settings → Quick actions): a person's own list of actions, in order
  (an area's lights, a light, a switch, fan or toggle helper, a scene, script or button, All lights off:
  `cards/lib/quick-actions.json`), with up, down, remove and an Add page; until they change it, the
  home's default (the input `quick_actions`, which the skill `set-up-areas` suggests), else each area's
  lights and All off. "Edit" beside Quick's title opens the list.
- **Language** (Settings → Appearance): Automatic (the dashboard's `lang`, else the person's Home
  Assistant language) or English, Deutsch, Polski, per person. Area names are not translated. A sheet closes by a finger dragged down anywhere on it from the top of
  its content; the page behind never pulls to refresh while it is open.
- **Back**: every page opened from Systems has a back arrow to Systems beside the menu button (on
  the bar or not); a page off the bar has it however it was reached.
- **This device** (Settings): "Open Pocket when the app starts" moves the app's first dashboard of a
  session to the pocket on this phone or browser only (its local storage; HA's own default
  dashboard is per user). Off: HA opens as it would.
- **The header on a phone**: the dashboard asks kiosk-mode (a HACS plugin, installed by hand; the
  Ramka uses it too) to hide Home Assistant's header up to 932 px wide; a menu button left of every
  page's title opens HA's sidebar, the only way it opens on this dashboard: the Companion app's
  swipe from the left edge is ignored here, so it never fights the way back. Without kiosk-mode the
  header stays; on a wider screen HA's header is as HA draws it (its menu button works).
- **Climate & air** (`#/climate`): an advice card only while a limit is crossed now (a poor CO₂ or
  VOC: open a window; a poor air reading by name; a room too cold, warm, dry or humid), squares for
  Inside, Outside (the areas of each type) and Air, the weather forecast as a strip (today and the next four days, from
  Home Assistant's daily `weather/subscribe_forecast`, else the entity's `forecast` attribute),
  and a Temp / Humidity / Air switch (remembered per person) over every area with that reading: each value on a bar of its comfort range, or the air's good / fair / poor with marks at
  climate-air's limits. Every card, square and row opens its trend.
- **Areas** tab (`#/areas`): every Home Assistant area with its lights and readings.
- **Area page** (`#/area/<id>`, the HA area id): one area in detail, with a settings button for its
  type and main sensors; a horizontal swipe goes to the next or previous
  area. The first version's `#/rooms` and `#/room/<id>` links are redirected. Below its controls:
  - **its part of the floor plan** (with the input `floorplan`): the floorplan component's own
    card with `area` set to the area's HA area, so it draws that room alone with its sensors and
    readings, fixed (a finger on it scrolls the page), without maps or chips; hidden while the
    area has no room on the plan. A tap on it, or **Open**, goes to the floor plan view;
  - **All sensors**, collapsed under a 44 px header with their count: every `sensor` and
    `binary_sensor` whose HA area is the area's (the entity's own area, else its device's), grouped
    by the catalog's categories (`categories/*.yaml`) exactly as the floor plan groups devices
    (`cards/lib/categories.js` and `categories.json` are copies of the floor plan's, held equal by
    a test and by `tools/category_index.py`). Hidden and disabled entities, diagnostic and
    configuration entities and a disabled device's are left out (the scan form and those rules
    are the floor plan's own `cards/lib/shared.js`, copied verbatim the same way). Each row shows
    the name and the value as Home Assistant words it and opens its sheet: a number its trend, an
    on/off or other sensor a timeline of its states over 24 h or 7 d (history; on in the accent)
    with how long it was on.
- **Floor plan** (`#/floorplan`, with the input `floorplan`): the floorplan component's card as
  tall as the screen between the header and the bar, read-only. Two fingers zoom, a drag pans,
  its + / − / fit buttons and maps stay in its bar at 44 px; its layer chips are in a bottom sheet
  behind **Layers**. A tap on a room opens that area's page; a tap on a marker shows its tooltip
  until the next tap. The plan is read from the `floorplan` dashboard once per session (again
  after a lost connection) and handed to every floor plan card the pocket shows. A bar item each person may turn on in
  Settings (off by default); without the floorplan component neither the page's plan nor the
  item is offered.
- **Media** (`#/media`, `#/media/<area id>`): the shown player's artwork (tap: Home Assistant's
  more-info), title, artist and album, the progress ticking on the phone, previous / play-pause
  (64 px) / next, a 44 px volume strip (drag along it, tap a point, or the arrow keys) and mute,
  each hidden when the player's `supported_features` lack it, and its app and source. The picker
  top right lists every area's `media` players (one entity or a list), then every other media
  player Home Assistant places in an area, in a sheet: each row the player's name, its area and
  what it plays, or what it is doing (off, idle) when it plays nothing; the choice is remembered
  per person. An integration that misses some playback (a DLNA renderer does not see Spotify
  Connect) shows idle while the device plays: name the entity that sees it in the area's `media`.
  Home's now playing and an area's player open Media with that area's player. Every control shows
  its new state at once and rolls back with a toast when the player does not follow.
  - **Sound** (with the input `sound`, audio-sensor in the home): a Media | Sound switch; Sound
    shows audio-sensor's own live meter (`room-meter-card` on `sensor.music_level` and
    `sensor.music_spl_offset`) and, with `sound_averages`, the home's Leq averages (1 min, 15 min,
    1 h), each opening its trend. Media's source line then shows the level now.
- **Power** (`#/power`, a bar item each person may turn on in Settings, off by default; needs no
  input): every `sensor` of device class `power`, `apparent_power`, `power_factor`, `energy`,
  `current` or `voltage`, found the way an area's All sensors are (Home Assistant's registries: the
  entity's area, else its device's; hidden, disabled, diagnostic and configuration entities and a
  disabled device's left out), grouped by area (the pocket's areas first, then Home Assistant's
  other areas, then "No area") and by device. Each row shows the name without the device's in
  front, the value as Home Assistant words it and the last hour's trend arrow (none for `energy`,
  a counter that only rises), and opens its trend. Two squares: **Now**, the sum of the power
  meters that measure separate loads, opening a sheet of those meters, and **Today**, today's kWh
  from Home Assistant's Energy dashboard (`energy/get_prefs`: the grid's imports, else the
  individual devices not included in another one's; `recorder/statistics_during_period`, period
  day, change, in kWh, from local midnight), opening the import's trend; hidden when the home has
  no energy preferences. The rule of Now, stated on its sheet: device class `power` in W / kW / MW
  only; one sensor per device, its highest reading (a total and its channels or phases would count
  twice); a device connected through another device (`via_device_id`) whose own power is counted
  is left out; an entity without a device counts on its own. Two meters in series that Home
  Assistant does not link (a mains meter and a plug behind it) are both counted. In the catalog a
  meter is so far the `mains-meter` kind (power and voltage, a Shelly PM Mini tested), the `mains`
  input of media and the Ramka; the Power page reads it, and any other meter, from the registries.
- **Plants** (`#/plants`; on the default bar, in Media's place, with the input `plants`: the plants
  component in the home; else a bar item each person may turn on): every `plant.*` with its
  readings, grouped by area, the area whose plant needs most first, plants worst first, and a line
  with how many need something. A plant's readings (moisture, fertiliser, light, temperature,
  battery) come from its sensors (the plant's `sensors` attribute, else
  `sensor.<plant>_<moisture|conductivity|illuminance|temperature|battery>`, the plants component's
  entities), else its attributes, each in its tone against the plant's bands (`domosenso_bands`,
  which the plants component writes, over the component's defaults); a reading with a sensor
  opens its trend. What a plant needs is said in plain words: thirsty, too wet, needs light, too
  much light, cold, warm, needs fertiliser, too much fertiliser, low battery (below 15 %); light is
  judged on the day's brightest reading (`sensor.<plant>_illuminance_max_24h`, else
  `max_brightness`), never on the dark of the night, and the plant integration's own `problem`
  adds its reasons too. The area is the plant's own in the registry, else its sensors' device's
  (a Mi Flora), else the plants component's room matched by name to a pocket room or an HA area.
  With no plant the page says so.
- **Widgets**: squares in a grid (an area's, the Areas tab's) share one size: equal columns and
  rows, a fixed aspect (a lone square does not stretch); no text is ellipsized anywhere, a long
  name wraps and a big value shrinks with its square. Each shows a
  title, one value in its level's colour (below a comfort range blue, above it red) with a trend
  arrow from the last hour, and one short line written to fit (no text is cut off). An area's light
  level, sound or pressure sensor (its settings) is a square of its own. Every widget opens a sheet:
  "All good" and the attention pills the checks (every reading of every area in the checks, problems
  first), Inside and Outside the areas of their type, the lights-on chip the lights, the Air square
  every air reading; each reading in them opens its trend sheet on top (Back returns to the list).
- **Trend sheet**: Home's air chip, an area's Climate and other squares and every reading in a
  detail sheet open a bottom sheet with that reading over 24 h (the recorder's history), 7 d (hourly
  long-term statistics) or 30 d (daily), one line over the shaded comfort band (climate-air's
  range or air limit); a sensor without statistics (no `state_class`) shows its history for 7 d
  and 30 d, as far back as the recorder keeps it. It closes by a drag down on its handle, the
  close button, a tap above it or the phone's Back.
- **Bottom bar**: fixed to the bottom of the screen (beside HA's sidebar on a wide screen), its
  background down over the home indicator. Home and Settings always, the person's chosen pages
  between them, at most five; by default Home, Areas, Climate, Media, Settings, and with the input
  `plants` Home, Areas, Climate, Plants, Settings (Media is a tap away on Home's now playing); a
  person's own choice in Settings wins.
- **Settings** (`#/settings`): Appearance (System / Light / Dark), the bar's pages (at most three
  besides Home and Settings), the comfort ranges and air limits (each value opens Home Assistant's
  dialog of its climate-air helper, which changes it), and About: the pocket's version, every
  component the home runs (`sensor.domosenso_components`, which the `domosenso` command writes),
  the Home Assistant area each pocket area reads, and links to the catalog.
- **Colours**: the base colours (background, cards, text, lines, accent) are Home Assistant's
  theme variables, so the pocket has the theme's contrast; level colours and the lamp are the
  pocket's own. System follows the phone's light or dark setting; Light or Dark against Home
  Assistant's current theme uses the pocket's own palette for that variant.

### Per-person settings

Stored in Home Assistant's frontend user data (websocket `frontend/get_user_data` /
`frontend/set_user_data`, key `domosenso-pocket`): they follow the person to every device and are
nobody else's. Fields `bar`: the page ids on the bar; `theme`: `system` (default), `light` or `dark`;
`climateView`: the reading the Climate page shows, `temperature` (default), `humidity` or `air`;
`mediaPlayer`: the media player the Media page shows (the entity id of an area's `media`). When
they cannot be read, the defaults apply.

Levels are good, fair or poor (plus a side, low or high, for comfort ranges). They are computed in
the cards from the states and climate-air's limits; the messages are translations.

### Gestures

- A tap on a light tile switches the light: off when it shows on, else on. A tile for several
  lights switches all of them off when any is on, else all on.
- The brightness strip under the tile (44 px tall) is a slider: a horizontal drag or a tap sets
  the brightness. It never turns a light off: it floors at 1 %. A light without a dimmer has none.
- A long press on a light tile opens Home Assistant's details for the light.
- A horizontal swipe on an area page goes to the next or previous area (no wrap), replacing the
  history entry: Back returns to Areas, not through every area. It starts anywhere on the page, a
  light tile too, but on a brightness strip or the scene row.
- Every control (lights, All off, scenes, play/pause) shows its new state at once and keeps it
  until Home Assistant reports it; a call that fails, or no report within 4 s, puts the last
  reported state back with a short message.
- Nothing in the pocket scrolls sideways and the bar takes no drags, so neither a sideways drag
  nor iOS's rubber band moves the bar or the page; HA's pull to refresh from the top stays.

## Use in the Companion app

Register one dashboard per language in `configuration.yaml` (YAML mode), with the rendered file as
`filename:`; the main language shows in the sidebar:

```yaml
lovelace:
  dashboards:
    dashboard-pocket:               # the dashboard's URL path (needs a hyphen)
      mode: yaml
      filename: dashboards/pocket.en.yaml   # one per language: pocket.<lang>.yaml
      title: Home
      icon: mdi:cellphone
      show_in_sidebar: true
```

Restart Home Assistant, then open the dashboard in the Companion app (or set it as the app's
default dashboard in the user's profile).

## What a home needs

- The **home inputs** (`uses_home: optional`): defaults per HA area (a room's `type`, `climate`, `air`,
  and `lights`, `scenes`, `media` to override what the area has), `outside` (its area's default:
  Outside) and `weather`. Without them Pocket shows Home Assistant's areas with no defaults.
- **floorplan** (optional, with the input `floorplan: true`): its card on the area pages and the
  floor plan view; its Lovelace resource comes with that component and its plan with `domosenso
  floorplan push`. Needs the floorplan version that has the card's `area`, `zoom` and `chips`
  options (unreleased after 0.4.0).
- **audio-sensor** (optional, with the input `sound: true`): its music aliases and its
  `room-meter-card`, whose Lovelace resource comes with that component. The averages
  (`sound_averages`: `leq_1_min`, `leq_15_min`, `leq_1_h`) are the home's own sensors in dB SPL.
- **plants** (optional, with the input `plants: true`): Plants on the default bar. The page reads
  every `plant.*` whether or not the flag is set.
- **The Wi-Fi survey** (optional, with the input `wifi_survey: true`, which needs `floorplan`): see
  *Wi-Fi survey* below.
- **climate-air** for the levels: its threshold helpers (comfort range per room with climate, air
  limits per reading). Without it the card shows readings but no level.
- A YAML dashboard per language in `configuration.yaml`, at the paths you choose
  (`dashboard_paths` is reserved: no template reads it, it only records them; default
  `dashboard-pocket` for English), each with `filename:` the rendered file.

## Wi-Fi survey

An administrator measures the home's Wi-Fi with the phone they carry and the readings calibrate the
floor plan's Wi-Fi maps (SPEC-045; the floorplan component's *Wi-Fi* sections). Set `wifi_survey: true`
(with `floorplan: true`), render and deploy: that adds `packages/pocket.yaml` with
`sensor.domosenso_wifi_reading`, and a **Wi-Fi survey** row on the System page for administrators.

- **The page** (`#/wifi-survey`) shows the floor plan's Wi-Fi map with up to 3 suggested spots,
  numbered: handover zones between access points and rooms without a reading, at least 4 m apart. Tap
  where you stand (a tap within 1 m of a spot takes the spot), press **Measure** and stand still.
- **iPhone** (iOS 17.4 or later): Pocket opens the Shortcut **Domosenso Wi-Fi**, which reads the
  Wi-Fi details 5 times, a second apart (signal, noise, channel, Wi-Fi standard, rates, the access
  point's BSSID, the network name), sends them to Home Assistant with the Companion app's **Fire
  event** and shows a notification; go back to Home Assistant (◀ at the top left) and the reading shows
  on the page. The Shortcut does not open the app itself: that would restart it. Install it once from the page's install card (download it, open the download, tap Add
  Shortcut), then open it in Shortcuts, tap **Server** in its Fire event action and choose your Home Assistant (it is listed by
  its name in the Companion app; searching for its address finds nothing). Allow Shortcuts Location
  access if the reading has no BSSID. Pocket in Safari without the Companion app uses **Domosenso
  Wi-Fi Safari** instead, which hands the reading back through x-callback-url.
- **Android**: turn on the Companion app's Wi-Fi sensors (signal strength, BSSID, frequency, link
  speed, connection) and choose the phone on the page. Measure asks the app to update its sensors
  (`command_update_sensors`) and collects 5 fresh readings within 20 s.
- **The checks.** A reading is not kept when it is not from this Measure, comes from someone else's
  phone, was not on Wi-Fi or on another network, or has fewer than 3 scans: retry. It is kept or
  retried at your choice when its access point is not one on the plan (kept without it, at half
  weight), the signal moved by more than 6 dB or the phone changed access point while measuring, or
  the band is unclear (a channel 6 GHz shares with another band: pick 2.4 or 6 GHz). The model's
  value shows beside the reading; a reading is never refused for disagreeing with it.
- **Kept at once** when every check passes (a green dot); with a warning (amber) you choose **Keep** or
  **Retry**; a failure (red) keeps nothing. A kept reading is a sample of the plan (`source: phone`, with
  every scan) and the maps recalibrate at once; **Undo** takes the last one out. **Readings kept**, under
  the panel, lists them with their details and scans, and the plan shows them as dots.
- The Shortcuts are written by `tools/pocket_shortcuts.py` (plists, then `shortcuts sign --mode
  anyone` on macOS) into `cards/shortcuts/`; regenerate them there after changing the tool.

## The card's config

Rendered from the home inputs; nothing in it is a state.

| key | holds |
|---|---|
| `lang` | the dashboard's language |
| `rooms` | the defaults per HA area, in the home's order: `id`, `name` (in this language, for a frontend without `hass.areas`), `area` (its HA area: the room's `area`, else its id), and `type`, `lights`, `scenes`, `climate`, `air`, `media` as the home gives them; `[]` without home inputs. The areas themselves are HA's |
| `outside`, `weather` | as the home gives them; `outside.area` is that area's default (type Outside, its climate) |
| `thresholds.rooms` | per room with climate: `temp_low`, `temp_high` (and `humidity_low`, `humidity_high` with a humidity sensor), each a climate-air `input_number` id |
| `thresholds.outside` | with `outside`: `temp_low`, `temp_high` (and `humidity_low`, `humidity_high` with outside humidity), climate-air's outside helpers; absent without `outside` |
| `thresholds.air` | per air reading any room names (score, co2, pm2_5, voc, nox): `fair`, `poor` ids |
| `floorplan` | `true` with the input `floorplan`: the home has the floorplan component, whose card the area pages and the floor plan view use; absent otherwise |
| `plants` | `true` with the input `plants`: the home has the plants component, so Plants is on the default bar; absent otherwise |
| `wifi_survey`, `wifi_scans`, `wifi_ssid` | with the input `wifi_survey`: `true`, the readings per measurement (the input `wifi_scans`, default 5) and the network name a reading must be on (the input `wifi_ssid`, absent when empty); absent otherwise |
| `sound` | with the input `sound`: `level` (`sensor.music_level`), `offset` (`sensor.music_spl_offset`) and `averages` (the input `sound_averages`); absent otherwise |

## Levels

`cards/lib/level.js`: `level(value, kind, limits)` gives `{level: good | fair | poor, side?: low |
high}` or `null` when the value or a limit is not a number.

- `range` (`{low, high}`): within, edges included, good; outside poor, with the side.
- `rising` (`{fair, poor}`): higher is worse; from `fair` fair, from `poor` poor (CO2, dust, VOC, NOx).
- `falling` (`{fair, poor}`): lower is worse; below `fair` fair, below `poor` poor (the air score).

`numberOf(hass, entityId)` reads a state as a number, `null` when it has none.
