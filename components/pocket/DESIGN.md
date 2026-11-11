# Pocket design system

The rules every Pocket screen follows, and the ones a new feature follows. The README says what
each screen shows; this file says why it is built that way and how to add to it. Keep it current:
a change that adds or alters a pattern updates this file in the same pull request.

## 1. What Pocket is for

Pocket is Home Assistant on a phone: next to the person, used for a few seconds at a time, often
with one hand. It is not the Ramka (a wall screen seen from across a room, mostly ambient): the
phone is interactive, so every screen answers "what is going on?" and "what do I do about it?"
without making the person hunt through similar views.

Principles, in order when they conflict:

1. **High level first, details on demand (drill-down).** A screen shows the summary; a tap goes
   one level down; nothing shows every detail at once. A value the person can change is a deliberate
   step away from the summary, never on it by accident.
2. **Nothing is cut.** No ellipsis, no clamped lines, no truncated values: text wraps, a widget
   grows. A test (`no-literals`/style tests) rejects `text-overflow`, `line-clamp`.
3. **One size per kind.** Widgets in a grid are equal; tiles in a grid are equal. Uneven boxes read
   as importance that is not there.
4. **Few mis-taps.** Every target is at least 44 × 44 px; destructive or home-wide changes sit one
   level down (Settings panels) or in Home Assistant's own dialog.
5. **Snappy.** Every control shows its new state at once (optimistic) and rolls back with a toast
   when Home Assistant does not follow.
6. **Light visuals in both themes.** Colour carries meaning (levels), not decoration.

## 2. Navigation model

- **Routes in the hash** (`lib/router.js`): `#/`, `#/systems`, `#/areas`, `#/area/<id>`,
  `#/controls[/status]`,
  `#/climate`, `#/media[/<id>]`, `#/power`, `#/plants`, `#/scenes`, `#/safety`, `#/system`, `#/wifi-survey`, `#/floorplan[/<id>]`,
  `#/settings[/<panel>]`. Back and deep links work; nothing reloads.
- **Levels:**
  - Level 0: **Home**, in two views switched under the title: **Overview** (what is happening now and
    quick actions) and **Systems** (one tile per aspect, the way into every page).
  - Level 1: a **page** per aspect (Areas, Controls, Climate, Media, Power, Plants, Scenes, Safety,
    System, Floor plan, Settings). A page with two faces of the same aspect has views switched under its
    title, never two pages: Home (Overview | Systems), Controls (Controls | Status).
  - Level 2: an **area** page or a **panel** (Settings → Areas, Comfort ranges, About), with a back button
    in its title row; an item of a panel's list (one area's settings) drills down to a page of its own,
    with its back to the list.
  - Level 3: a **sheet** over the page (details, pickers); sheets may stack (Back returns).
- **The bar** (bottom, fixed): Home and Settings always, up to three pages the person picks. It is a
  quick switch, not the map of the app: every page is also reached from Systems.
- **Back:**
  - **Every page opened from Systems** has a back arrow to Systems beside ☰, on the bar or not; it
    goes back through history, so the phone's own back agrees. A page off the bar has it however
    it was reached. A page opened from its bar tab has none (the bar is the way).
  - An area, a panel, a floor plan opened from an area have their own back in the title row. It
    returns to the page it was opened from inside Pocket, through history (an area's settings opened
    from the area go back to the area, not to Settings); a page reached from a link or a reload goes
    up instead (an area's settings to Settings → Areas, a panel to Settings, an area to Areas). The
    shell's `ctx.back(up)` does both.
  - The phone's Back closes the open sheet first.
  - A switch between Home's two views replaces the history entry (Back leaves Home).
- **Home Assistant's menu** opens only from the ☰ button left of every page title (and HA's own in
  its header on a wide screen); the Companion app's edge swipe is ignored on this dashboard.
- **The header**: on a phone (up to 932 px wide) kiosk-mode hides HA's header; the page keeps clear
  of the status bar itself. On a wider screen HA's header stays.

## 3. Page anatomy

```
[☰][‹] Title                       [page actions]
[view switch / segmented control]   (only when the page has views)
[pills]                              (Home only: attention)
[content: widgets, tiles, sections]
                                     (room for the fixed bar)
```

- The title row is the page's first `.top`: the shell puts ☰ (and ‹ when due) into it.
- Page actions sit at the right of the title row (Media's player and power, Scenes' Choose,
  the floor plan's Layers).
- Sections inside a page have a small uppercase heading (12.5–13 px, muted).

## 4. Components

### 4.1 Widget (Overview, area page, Climate)

A square-ish card in an equal grid (`repeat(auto-fill, minmax(min(var(--square-min,160px),100%),1fr))`,
`width: 100%` on the items for WebKit): **a value, a label, a trend arrow** when the reading has one.
The value is coloured by its level (§6).

Every widget opens a **sheet**, never a page. Two kinds only:

| kind | when | its sheet |
|---|---|---|
| **aggregate** | the widget sums or ranges many sensors (Inside, Outside, Lights on, Power, Plants) | a list by area, each row its name, level dot and value; a row opens that sensor's trend sheet, stacked |
| **single sensor** | one sensor (Air) | that sensor's trend sheet |

A new widget picks one of the two. If it wants a page, it is a Systems tile instead.

**Inside and Outside** (Home, Climate) aggregate the areas of that type: the range of their main
temperatures in the worst one's colour. With no area of the type: "No areas assigned", opening Settings
→ Areas. With areas but no main sensor in any: "Main sensor not set". Their sheet lists the areas,
those without a main sensor last, each opening its settings page.

### 4.2 Tile (Home → Systems)

One per aspect the home has, in the bar's order, then System: **icon + page name, a headline, a
status line, and a dot** (amber or red, the border too) when it is worth a look. The headline is the
one fact that matters ("All in range", "2 need a look", "79 W", "Up to date"); the status explains
it. A tap opens the page. An aspect the home lacks has no tile.

"Worth a look" uses the levels the page itself uses; something that is news but not a problem
(an update waiting, a device switched off at the wall, the cold outside) has no tone.

### 4.3 Trend sheet (details of a reading)

`lib/trend-sheet.js`: title, area, the value in its level's colour, the band and the period's span,
a 24 h / 7 d / 30 d switch, and Home Assistant's own chart (history-graph for 24 h, statistics-graph
with mean/min/max for 7 d and 30 d), as the Ramka draws them.

**It is the sensor's sheet, not the reading's**: when the device measures more than one thing, the
title is a native drop-down of its measurements (`lib/measurements.js`), the entry point chosen; a
pick keeps the period. A new reading type gets this for free when it lives on the same device.

### 4.4 Sheets

`lib/sheet.js`, opened with `ctx.openSheet(spec)` by `spec.kind` (`SHEETS` in `pocket-app.js`):

- grab handle and a 44 px close button; closes by a finger dragged down anywhere on it from the top
  of its content, the close button, a tap on the dimmed page, Escape or Back;
- while open, nothing behind it moves (no pull-to-refresh);
- content is built once (`render`) and patched (`update`); a list rebuilds only when its rows change.

Pickers are sheets too (player, input, layers, scenes): rows of 48 px with a switch or a check.

### 4.5 Lists and rows

Rows of at least 48 px (52 in detail sheets), name left (wraps), value right, a level dot first
when the row has a level. A row that opens something is a `button`.

### 4.6 Controls page (the Ramka's controls and status)

- **Controls** view: Music (the player that plays: compact, previous / play-pause / next, volume
  down / up, power), Covers by area (open / stop / close, each only when supported; all open / all
  closed), Timers (time left ticking, start or pause, cancel), Lights (a tile per room, All off).
  Each section only when the home has something for it.
- **Status** view: read-only equal tiles of covers, doors and windows, lights per room, locks; an
  active one (open, on, unlocked) in the accent. A tile of something Controls acts on switches to
  Controls; a door or window opens its timeline.
- What the Ramka has for a wall only (calendar button, near toggle, Exit) is not on the phone.

### 4.6a Safety page (P4)

- The answer first: one line, "All quiet" (green dot) or the issues joined (red dot), each issue
  named as the person names the thing (`labelOf`: the home inputs' label, else HA's name).
- Then sections in a fixed order, each only when the home has such entities: Alarms, Doors and
  windows, Locks, Covers, Siren, Who is home. A row: name, state, at most one action button.
- A state that is not reporting reads "Not reporting" in the fair colour: on a safety page, silence
  is information, not a dash.
- Issues are also Home's first pills (red), each opening Safety; they come before readings.

### 4.7 Controls (elements)

- Light tile (`<pocket-light-tile>`): tap toggles, drag sets brightness; a group counts its members.
- Segmented control: Home's views, Media | Sound, trend periods: switching what a page shows. Not a
  drop-down when there are two or three choices; a native `<select>` when the list is long or
  open-ended (measurements).
- **In Settings, every choice among fixed options is a drop-down row** (the theme, the language, an
  area's type, a main sensor): a row of at least 48 px, its name on the left with what it means or
  where its value came from in a small grey line under it, the value on the right as a native
  `<select>` (grey, right-aligned, a chevron); tapping the name opens it too (the row is a `label`).
  A long value wraps under the name, whole, never cut. On/off is a switch.
- Media: transport (64 px play), a 44 px volume strip, mute, power when supported, the input chip
  beside what plays when the player can select a source.
- Risky acts confirm in place (`lib/confirm.js`), never with a dialog: the first tap turns the button
  red and reads "Tap again to …" for 4 s; the second tap acts; otherwise it goes back. Unlock, Close
  all and sounding a siren confirm; locking and stopping a siren act at once (the safe direction).
- A control is enabled unless its entity is missing or `unavailable` (`operable` in
  `lib/page-kit.js`). `unknown` is a value not known yet, such as a cover's position after a restart,
  a never-run scene or a speaker that has not reported: the value shows as a dash, but the control
  still acts, because Home Assistant takes the command.

## 5. Data: where things come from

- **The areas are Home Assistant's** (SPEC-038, `lib/home-model.js`): every HA area by its HA name (not
  translated), in floor order. Each has a **type** (Inside by default; Outside; Not assigned, which hides it from every view but
  Settings → Areas) and a **main sensor
  per kind** (`lib/kinds.json`: climate, air, light level, sound, pressure), resolved in this order: set
  in Pocket (the home store; climate in HA's own area fields), HA's area setting, the home inputs'
  defaults, the only candidate (recorded once by an administrator's Pocket, never redone).
- **No list of Pocket's own.** Entities are found the way the floor plan finds them: Home Assistant's
  registries by HA area (an entity's area, else its device's), hidden / disabled / diagnostic left
  out (`lib/sensors.js`). The home inputs (`home.inputs.yaml`, shared with the Ramka) give only
  defaults per area; lights and scenes come from the area when the inputs name none, and the
  registries supply everything else (other players, sensors, meters, update entities).
- **Thresholds** are climate-air's helpers (comfort ranges per area, air limits fair/poor), one
  shared definition the Ramka reads too. Pocket shows and links them; HA's more-info changes them.
- **Settings are per person** (HA frontend user data, `lib/settings.js`): theme, language, bar,
  climate view, media player, scenes. **The home's settings** (area types, main sensors) are the home
  store's (HA frontend system data: everyone reads, administrators write) or HA's own fields. **Per device** only what must differ by phone (open at start, in local
  storage). Nothing per dashboard.
- **Exceptions to discovery**: a domain whose entities are also a component's internals (timers) is
  named in Pocket's inputs, as the Ramka names it.
- **Charts** are Home Assistant's own cards (via `loadCardHelpers`), so they look as HA and the Ramka.

## 6. Levels and colour

The level keys and their boundaries are the shared contract
([decision D1](../../docs/2026-11-05-shared-home-decisions.md#d1-assessment-keys)).
`cards/lib/level.fixtures.test.mjs` runs `level()` over the shared cases in
`tests/fixtures/assessment.json`; a change to a boundary is a change to that file, not to Pocket alone.

- Vocabulary from the Ramka: **good / fair / poor**; a comfort range adds the sides **cold** (below)
  and **warm** (above).
- Tokens (`lib/theme.js`): `--ok` good, `--warn` fair, `--bad` poor, `--cold` blue, `--warm` red;
  `--acc` accent and on-states; `--mut` secondary text; `--card`, `--chip`, `--line`, `--bg`, `--fg`.
  Never a literal colour in a page.
- The worst level wins a summary (poor before fair before good, the home's order within).
- Attention (pills, What was checked, Climate tile, advice, the home's air) counts every area the home
  has not switched out of the checks (its setting Include in checks, on by default, an outside area
  too); the type never decides it. An area switched off is coloured on its page but never a
  problem.

## 7. Gestures

- Vertical page scroll is the page's; sideways swipes are the page's own where it has them (area to
  area, Media | Sound) and only when clearly sideways.
- A control that drags (volume, brightness, a slider) marks itself `data-drag`; sheets and pages
  leave it alone.
- The left edge does not open HA's menu here (see §2).

## 8. Words

- Every word is in `translations/{en,pl,de}.json` (`card.pocket.*`); sources hold none (a test scans
  them). Counts use plural forms (`one/few/many/other` with `pluralOf`).
- Labels name things as the person does (an area's name, a player's name); entity ids never show.
- An unavailable value is a dash in the muted style, never "unknown".

## 9. Building it

- Pages and sheets follow the page contract (`pages/index.js`): `render(ctx)` builds once,
  `update(el, ctx)` patches; `ctx` carries hass (optimistic view), config, settings, `t`, `navigate`,
  `openSheet`, `routeId`.
- WebKit (the iPhone) first: aspect-ratio grid items need a definite width; SVG has no `hidden`
  property (toggle the attribute). Every size in section 12 is tested, not only one iPhone.
- Tests per module (`*.test.mjs`), against the demo home only (no home's names or ids in the
  catalog).

## 10. Adding a page or a feature: the contract

### 10.1 A setting of the home: AI first, visible in Settings (SPEC-038 §3.10)

Domosenso is set up by an AI first; what a home customizes is little, and every bit of it is visible
to the person. A setting of the home (an area's type, a main sensor, anything a future feature lets a
home choose) is:

1. **declared once, as data** (`cards/lib/kinds.json` for the main sensors), never a page's own list;
2. **given to the AI**: its question in the skill that sets it up (`set-up-areas`) and its line in a
   read-only `domosenso` command that shows the value and its source (`domosenso areas`);
3. **visible and changeable in the global Settings** (Settings → Areas), with its source, by an
   administrator, through **generic controls per type of input** driven by the declaration (4.7): an
   enum, a device and a sensor are each a drop-down row of their options or candidates
   (`lib/area-settings.js` `pickRow`); what belongs to one item of a list (one area) is a drill-down
   page of that list, full screen with its back to the list (`#/settings/areas/<id>`), never a sheet;
   a non-administrator sees it read-only;
4. **stored in Home Assistant**: HA's own field when one exists (an area's Related sensors), else
   Pocket's home store (`lib/home-store.js`, frontend system data);
5. **discovered** from Home Assistant when nobody chose (area and device class, never a name), with a
   home-inputs default only for what HA cannot know.

A second way to the same setting somewhere else (the area page's settings button) is **not** a default
of this design system: the feature's developer decides it from a UX/UI analysis and records it in the
decisions log (section 11).

**The AI suggests, Settings fine-tunes.** The AI setup detects what Home Assistant has, suggests a value
for each setting with its reason and writes what the owner confirms; Settings is where a person changes
it later. So every setting is also in the register below, and a new one is added there with all five
places filled.

| setting | declared in | detected by | suggested by | in Settings | stored |
|---|---|---|---|---|---|
| an area's type | Inside, Outside, Not assigned (`lib/home-store.js` TYPES) | `domosenso areas` (`area` lines) | `set-up-areas` 2.1 | Areas → area → Type | the home store; inputs default `type` |
| an area in the checks | Include in checks (on by default; `lib/areas.js` isJudged) | `domosenso areas` (`unchecked` lines, `--json` checked) | `set-up-areas` 2.1 | Areas → area → Include in checks | the home store; inputs default `checked` |
| an area's main sensor per kind | `cards/lib/kinds.json` | `domosenso areas` (`main`, `candidates`, `--json` candidates) | `set-up-areas` 2.2, 2.3 | Areas → area → Main sensors | climate: HA's area fields; others: the home store; inputs defaults `climate`, `air` |
| Quick actions | `cards/lib/quick-actions.json` | `domosenso areas` (`quick` lines, `--json` quick) | `set-up-areas` 2.4 | Quick actions (+ Add) | the person's user data `quick`; home default: Pocket's input `quick_actions` |

A page is registered in **one place**, `TABS` in `lib/router.js` (or `SYSTEM`); everything else that
lists pages is derived from it, and a contract test fails when a derived part is missing. Never keep
a second list of pages.

| a page needs | where it comes from | checked by |
|---|---|---|
| a route `#/<page>` | derived from `TABS` (`SINGLE`) | `router.test.mjs`: every tab's route parses to its page |
| a Systems tile | derived (`SYSTEMS_PAGES` in `lib/sections.js`); its summary in `SUMMARIES` | Systems tests (a page without a summary throws) |
| the way back from Systems | derived (the shell uses `SYSTEMS_PAGES`) | `pocket-app.test.mjs`: **contract: every page Systems opens has the way back** |
| a bar choice in Settings | derived from `TABS` | `settings-page.test.mjs` |
| its name in en / de / pl (`card.pocket.nav.<page>`) | the translations | `router.test.mjs`: **contract: every page has its name** |
| the phone audit | derived (the audit reads the router) | `tools/dev_home/phone_audit.mjs`, default routes |
| its module in `pages/index.js` | by hand (an import) | `pocket-app.test.mjs`: every page follows the contract |

Then, for any feature:

1. Which level is it? An aspect → a page (above). A reading → a widget of one of the two kinds. A
   choice → a sheet. A home-wide value → a Settings panel.
2. How does a person get back from it? Level 2 and the sheets have their own back (section 2); a
   new kind of place needs its back defined here before it is built.
3. Where does its data come from? The registries by area, the home inputs, or a component's
   provided entities; never a new list in Pocket's inputs without a reason. Does it let the home
   choose something? Then 10.1 applies, in the same pull request.
4. What makes it "worth a look"? Its level rule, or none. Does it add pills on Home?
5. Is every target 44 px, every word translated, every value uncut, every control optimistic, every
   risky act confirmed in place (section 4.7)?
6. Does it work in both themes, portrait and landscape, with HA's header and without?
7. Does `tools/dev_home/phone_audit.mjs` end with `ok` at every size of section 12, and does the pull
   request show it (screenshots from the demo, `docs/LOCAL_DEVELOPMENT.md`)?
8. Update this file (sections 2 and 3 for a page) and the decisions log when it brings a new pattern.

### 10.2 Built-in rules

Pocket follows Home Assistant's configuration and the settings of 10.1, without heuristics of its own.
Where it still decides something itself, the rule is listed here (and in SPEC-038 §3.13) with its
setting; a rule marked open has none yet and becomes a setting, a line of `domosenso areas` and a
question of the skill when a home needs it. A new rule is added here in the pull request that brings
it, or it does not go in.

| rule | where | setting |
|---|---|---|
| every area is Inside until set otherwise | `lib/home-model.js` | Type |
| every area is checked until switched off | `lib/home-model.js` | Include in checks |
| an area's only candidate is its main sensor, recorded once | `lib/home-model.js` | the kind's picker |
| without a list, Quick is each area's lights, then All off | `lib/quick.js` | Quick actions |
| a light group stands for its members among an area's lights | `lib/home-model.js` | the inputs' `lights` |
| with no HA areas at all, the home inputs' rooms stand in (an `outside` without `area` too) | `lib/home-model.js` | creating HA areas |
| a device's first sensor of a class stands for that reading | `lib/kinds.js` | open |
| the home's air score is the lowest of the checked areas' | `lib/climate.js` | open |
| now playing: what plays anywhere, else the first area's player | `lib/media.js` | Media's player pick (Media only) |
| a backup is fair after 8 days, poor after 30 | `lib/system.js` | open |
| a plant's battery is low under 15 % | `lib/plants.js` | open |

### 4.8 Wi-Fi survey (SPEC-045)

- An administrator's page reached from System (a row there), with its own back to System. The plan
  fills the top (the floorplan card in its phone survey mode: spots numbered, the spot a filled dot)
  and a **panel section under it**, not a sheet, so the plan stays in sight while measuring: the
  method with Change, why this spot, Measure and its progress, then the result (the value in dBm,
  band and channel, access point, noise, rates, spread, the model's value), the failed checks (hard
  in the poor colour, soft in the fair one) and Keep / Retry, or the 2.4 / 6 GHz pick.
- **Install card:** a first use per device shows what that phone needs (the Shortcut and its Server
  step; on Android the Companion app's sensors and the phone picker) above the panel, until done. The
  Shortcut installs through Shortcuts' own `import-shortcut` link (no download in Safari between), named
  as Pocket runs it; the file itself is the fallback link.
- **Room picker** above the plan (a native drop-down, "Whole floor plan" first, then the plan's rooms by
  their HA names): a room zooms the plan to it with 1 m around (the card's `focusRoom`), so a tap where
  you stand is big enough on a phone; the rest of the plan stays drawn.
- **A waiting Measure** has Cancel beside it; after 30 s it says the Shortcut may be missing or its
  Server unset, and after 2 min it is given up (Measure is free again).
- **Per device** (localStorage): the method, the Android phone, the expected network name when the
  home sets none, the Shortcut installed. A Measure waiting for the iPhone's reading is kept there
  too, and the shell reopens `#/wifi-survey` from Home while it waits (the Companion app returns to
  the dashboard's first page).

## 11. Decisions log

| decision | why |
|---|---|
| Areas, not Rooms; the areas are Home Assistant's, each Inside (the default), Outside or Not assigned (hidden) | a list of rooms in a file missed every area added later; a new home sees all its rooms at once and only marks the outside and what it leaves out, never guessed |
| A back arrow returns to the page it was opened from inside Pocket (the shell's ctx.back), else goes up | a person assigning area after area goes area → settings → back to the area, as the phone's Back does |
| Settings → Areas holds every area's type and main sensors, each area a drill-down page; the area page has a settings button to the same page | Settings is the required place (10.1); a bottom sheet of selectors read badly on a phone; the button is this feature's UX choice: a person looking at one area changes it there |
| An area's checks are its own setting (Include in checks, on by default); an outside area is checked like any other | Pocket does not decide that the outside is weather; a home that does not want its balcony reported switches it off (10.2: no heuristics of Pocket's own) |
| Quick actions are a person's list with the home's default under it; Home's Quick has an "Edit" link to Settings → Quick actions | Quick is personal like the bar; the link is this feature's UX choice: the list is edited where it is missed |
| In Settings every choice among fixed options is a drop-down row, the theme included | one pattern for every setting, readable on a phone: name and source left, value right |
| Climate's main sensor is HA's own area field (Related sensors) | one place for what HA configures (principle 4) |
| The Wi-Fi survey is a page of its own under System, its result a section under the plan | measuring is a task, not a glance at the floor plan; the plan must stay visible while the result and checks are read |
| The language is a person's setting, Automatic by default; names are not translated | a person picks their language without a second dashboard; area names are HA's |
| Home has Overview and Systems | a single Home mixed status and navigation and was hard to read |
| Widgets open sheets, tiles open pages | one rule for "tap for details" vs "go to the aspect" |
| The trend sheet is per sensor with a measurement drop-down | a device measures several things; the entry point is only where you came from |
| Settings in two levels | home-wide values are a step away, not changed by accident |
| Bar of five, every page also in Systems | the bar is a quick switch; nothing is unreachable |
| HA's charts in details | they read better than a custom line and match the Ramka |
| HA's header hidden on a phone, ☰ by the title, no edge swipe for the menu | space on the screen, and the edge is the way back |
| Open at start is per device | HA's default dashboard is per user; a phone should not change the desktop |
| Scenes chosen per person from every HA scene; no reset | HA scenes have no "off"; a reset was not wanted for now |
| Controls and Status as views of one page | the same things, to act on or to read; the Ramka's two screens |
| Back from every page opened from Systems | a page on the bar opened from Systems still came from Systems |
| A card that sizes itself is never put in a fixed-height box | the floor plan's map bar cut the plan |
| Timers are named in the inputs, never every `timer.*` | components keep internal timers (the Ramka's controls timer); the Ramka takes a list too |
| User timers are found by `timer_role: user_countdown`; a list in the inputs wins | the timers component marks the timers it makes for people; agreed in #219 (decision D4), replacing the row above |
| A room may list its covers, contacts and locks (order, name); the rest are found by area | the Ramka's wall lists them by hand; a phone should show the same names first without losing new devices (#219, agreement 9) |
| `unknown` does not disable a control, `unavailable` does | HA accepts a command for an entity whose value is not known yet; agreed in the shared-model review (#219) |
| Phones are audited at eight sizes, 277–956 px | Android phones are 360–412 wide, iPhones 375–440, and zoom makes them narrower; one 390 × 844 frame missed broken words and a cramped landscape |
| Safety is broader than UC10: alarms, siren and who is home beside doors, locks and covers | the home had no contacts or locks yet; what it has (a siren, presence) is safety too |
| Risky acts confirm in place with a second tap, not a dialog | one hand, no modal to dismiss; the safe direction (lock, stop) acts at once |
| A component's own flag is never an alarm | climate-air's "bathroom humidity high" carries the moisture class of a leak sensor |
| A kiosk's account is no one at home (`person_role: kiosk`, set by the Ramka) | HA makes a person for every user, the wall tablet's login too; the component that owns the kiosk marks it |
| A page is registered once (`TABS`); every list of pages is derived, and contract tests check the rest | Safety shipped without its back arrow: the shell kept its own copy of the Systems pages, the router another, the audit a third (review 2026-11-05) |

## 12. Phones: sizes, platforms and the audit

Pocket runs in the HA Companion app's web view on iPhone and Android, and in a phone's browser. It
follows the platforms' own rules where a web page can:

| rule | source | in Pocket |
|---|---|---|
| A control a finger taps measures at least 44 × 44 | Apple HIG: 44 × 44 pt; Material: 48 × 48 dp, with 8 dp between targets | 44 px minimum everywhere; 48 px for the landscape bar and settings rows; neighbours spaced, or one control |
| The screen's edges belong to the system | safe areas (notch, Dynamic Island, home indicator); Android's edge-to-edge insets | `env(safe-area-inset-*)` on the bar, the page sides and the headless title; the bar's background runs under the home indicator |
| One column layout for phones | Material's compact width class (under 600 dp); iPhone's compact width | phones are 277–440 CSS px wide; grids drop a column before a word would break |
| A phone on its side keeps its content | iOS's compact-height tab bar (icon beside the label); Material's compact height | under 480 px high in landscape the bar is 48 px, the icon beside its label |
| Larger text and page zoom still fit | Dynamic Type and Android font scale; the Companion app's page zoom | words stay whole (`overflow-wrap: break-word`, never `anywhere`); a row wraps its values under the label; under 330 px Media's player chip shows its chevron and keeps the area as its label |
| Nothing scrolls sideways | both platforms | `overflow-x: clip` on the app; the audit checks every page |

**Sizes the audit runs** (CSS px; `tools/dev_home/phone_audit.mjs`, on the demo):

| size | stands for |
|---|---|
| 360 × 780 | compact Android (Galaxy S25, A series) |
| 375 × 667 | iPhone SE: narrow and short |
| 390 × 844 | iPhone 13–16 |
| 412 × 915 | Pixel, Galaxy S Ultra and Plus |
| 440 × 956 | iPhone Pro Max |
| 844 × 390 | a phone on its side |
| 300 × 650, 277 × 600 | 390 and 360 at 130 % zoom or larger text |

For each size and page the audit fails when:
- the page scrolls sideways;
- a tappable element is under 44 px either way;
- text is cut or off the screen;
- a word is split across two lines.

Run it before a pull request that changes a page, and put its last line in the PR. Each size's
screenshots come with `--out`.

**What the audit does not prove:**
- the real Companion app (kiosk-mode hides HA's header there; the demo keeps it);
- iOS Dynamic Type, which a web view applies only to text using the system font style;
- a foldable's inner screen;
- dark-mode contrast.

Those are checked on a real phone.
