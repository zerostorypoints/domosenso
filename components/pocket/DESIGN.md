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
  `#/climate`, `#/media[/<id>]`, `#/power`, `#/plants`, `#/scenes`, `#/system`, `#/floorplan[/<id>]`,
  `#/settings[/<panel>]`. Back and deep links work; nothing reloads.
- **Levels:**
  - Level 0: **Home**, in two views switched under the title: **Overview** (what is happening now and
    quick actions) and **Systems** (one tile per aspect, the way into every page).
  - Level 1: a **page** per aspect (Areas, Controls, Climate, Media, Power, Plants, Scenes, System,
    Floor plan, Settings). A page with two faces of the same aspect has views switched under its
    title, never two pages: Home (Overview | Systems), Controls (Controls | Status).
  - Level 2: an **area** page or a **panel** (Settings → Comfort ranges, About), with a back button
    in its title row.
  - Level 3: a **sheet** over the page (details, pickers); sheets may stack (Back returns).
- **The bar** (bottom, fixed): Home and Settings always, up to three pages the person picks. It is a
  quick switch, not the map of the app: every page is also reached from Systems.
- **Back:**
  - **Every page opened from Systems** has a back arrow to Systems beside ☰, on the bar or not; it
    goes back through history, so the phone's own back agrees. A page off the bar has it however
    it was reached. A page opened from its bar tab has none (the bar is the way).
  - An area, a panel, a floor plan opened from an area have their own back in the title row.
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
| **aggregate** | the widget sums or ranges many sensors (Inside, Lights on, Power, Plants) | a list by area, each row its name, level dot and value; a row opens that sensor's trend sheet, stacked |
| **single sensor** | one sensor (Outside, Air) | that sensor's trend sheet |

A new widget picks one of the two. If it wants a page, it is a Systems tile instead.

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

### 4.7 Controls (elements)

- Light tile (`<pocket-light-tile>`): tap toggles, drag sets brightness; a group counts its members.
- Segmented control: Home's views, Media | Sound, trend periods, Appearance. Not a drop-down when
  there are two or three choices; a native `<select>` when the list is long or open-ended
  (measurements).
- Media: transport (64 px play), a 44 px volume strip, mute, power when supported, the input chip
  beside what plays when the player can select a source.

## 5. Data: where things come from

- **No list of Pocket's own.** Entities are found the way the floor plan finds them: Home Assistant's
  registries by HA area (an entity's area, else its device's), hidden / disabled / diagnostic left
  out (`lib/sensors.js`). The home inputs (`home.inputs.yaml`, shared with the Ramka) name the rooms
  and what each room's readings are; the registries supply everything else (other players, sensors,
  scenes, meters, update entities).
- **Thresholds** are climate-air's helpers (comfort ranges per area, air limits fair/poor), one
  shared definition the Ramka reads too. Pocket shows and links them; HA's more-info changes them.
- **Settings are per person** (HA frontend user data, `lib/settings.js`): theme, bar, climate view,
  media player, scenes. **Per device** only what must differ by phone (open at start, in local
  storage). Nothing per dashboard.
- **Charts** are Home Assistant's own cards (via `loadCardHelpers`), so they look as HA and the Ramka.

## 6. Levels and colour

- Vocabulary from the Ramka: **good / fair / poor**; a comfort range adds the sides **cold** (below)
  and **warm** (above).
- Tokens (`lib/theme.js`): `--ok` good, `--warn` fair, `--bad` poor, `--cold` blue, `--warm` red;
  `--acc` accent and on-states; `--mut` secondary text; `--card`, `--chip`, `--line`, `--bg`, `--fg`.
  Never a literal colour in a page.
- The worst level wins a summary (poor before fair before good, the home's order within).
- Attention (pills, Climate tile) counts the rooms; the Outside is weather, coloured but never a
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
  property (toggle the attribute); test in a 390 × 844 frame and 932 × 430 landscape.
- Tests per module (`*.test.mjs`), against the demo home only (no home's names or ids in the
  catalog).

## 10. Adding a feature: checklist

1. Which level is it? An aspect → a page with a Systems tile (and a bar choice). A reading →
   a widget of one of the two kinds. A choice → a sheet. A home-wide value → a Settings panel.
2. Where does its data come from? The registries by area, the home inputs, or a component's
   provided entities; never a new list in Pocket's inputs without a reason.
3. What makes it "worth a look"? Its level rule, or none.
4. Is every target 44 px, every word translated, every value uncut, every control optimistic?
5. Does it work in both themes, portrait and landscape, with HA's header and without?
6. Update this file when the feature brings a new pattern.

## 11. Decisions log

| decision | why |
|---|---|
| Areas, not Rooms; the Outside is an area | the balcony and the outside belong with the rooms |
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
