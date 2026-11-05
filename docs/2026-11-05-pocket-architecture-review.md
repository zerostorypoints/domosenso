# Pocket and the shared home model: architecture for review

Status on 2026-11-05: built on the catalog branch `feature/pocket` (work branches merged into it by
pull request), unreleased, no component version bumped. Tried daily on a real home's phone since
2026-11-04; every round of feedback is in the commit history. This page is the guide for a
reviewer: what was built, the architectural choices, what changed on the way, and the open
questions.

- Diff to review: `main...feature/pocket`.
- The UI rules: [components/pocket/DESIGN.md](../components/pocket/DESIGN.md) (design system,
  decisions log). What each screen does: [components/pocket/README.md](../components/pocket/README.md).
- Examples use the demo home (`examples/demo-home`), never a real home's names.

## 1. The problem

The catalog had one dashboard component for people, the **Ramka** (a wall tablet: ambient pages,
controls when someone comes near). A phone needs something else: interactive, one hand, a few
seconds at a time, drill-down instead of rotation. Building a second dashboard the obvious way
would have duplicated what the Ramka's inputs already say about the home (its rooms, their lights,
climate sensors, air sensors, players) and its thresholds (comfort ranges, air limits), and the two
would drift: a room renamed in one, a comfort range changed in the other.

## 2. The plan

| piece | what | state |
|---|---|---|
| **P1** shared home inputs | a home-level inputs file and its schema, read by any component that opts in | merged into `feature/pocket` |
| **P2** thresholds in `climate-air` | comfort ranges and air limits as Home Assistant helpers, one definition for every screen | merged |
| **Prototype, iteration 2, phone rounds** | the `pocket` component, built from feedback on a real phone | merged / last round open as a PR into `feature/pocket` |
| **P3** Ramka migration | the Ramka reads its room lists from the home inputs and its colours from P2 | to plan |
| **P4** Pocket complete | the second-step use cases (security, notifications, current room first) and the final review | to plan |

The order was deliberate: P1 and P2 first, a Pocket prototype on top of them, then P3 only once the
shared inputs had proven themselves in a second consumer.

## 3. The shared home model (P1, P2): the main idea to review

> **Decided since** (review of #219, 2026-11-05): the level keys, helper ids, the mapping from the
> Ramka's helpers, discovery, operable states and settings scopes are recorded in
> [the shared home decisions](2026-11-05-shared-home-decisions.md). The cases every implementation
> runs are in `tests/fixtures/assessment.json`.

### 3.1 Home inputs: describe the home once

`domosenso.yaml` may name one file, `home_inputs: domosenso/home.inputs.yaml` (instance layer: the
home's own, edited by hand), validated by `schemas/home-inputs.schema.json`:

```yaml
rooms:                        # the order is the order everywhere (swipes, lists)
  - id: living_room
    name: {en: Living room, de: Wohnzimmer}
    area: living_room         # the HA area the room reads (default: its id)
    lights: light.living_room # a group; members are read at run time
    scenes: [scene.living_room_relax]
    climate: {temperature: sensor.living_room_temperature, humidity: sensor.living_room_humidity}
    air: {score: sensor.living_room_air_quality_score, co2: sensor.living_room_co2}
    media: [media_player.living_room_speaker]   # one player or several
outside: {temperature: sensor.balcony_temperature, humidity: sensor.balcony_humidity, area: balcony}
weather: weather.home
```

- A component declares `uses_home: true` (or `optional`) in its `component.yaml` and then gets
  `home` in its template context; one that does not declare it never sees the file (no hidden
  coupling).
- `render` validates the file and fails with `FAIL home-inputs: <reason>`; it is read on every
  render, not locked (`tools/domosenso_cli/home_inputs.py`).
- **What belongs there:** what describes the home for any screen (rooms, their names in each
  language, which sensor is a room's temperature). **What does not:** what one screen needs for
  itself (the Ramka's radar, its screen and kiosk settings; Pocket's sound averages, its timers) —
  those stay in the component's own inputs.

### 3.2 Thresholds: one definition, levels computed where shown

`climate-air` turns the home inputs into helpers: per room with climate,
`input_number.climate_air_<room>_{temp,humidity}_{low,high}`, and per air reading,
`input_number.climate_air_<reading>_{fair,poor}`, seeded once from its inputs so a person's change
survives restarts. These are **the** thresholds: Pocket reads them (and links them in its Settings,
where HA's own dialog changes them); the Ramka will read them in P3.

The data model holds readings and thresholds only, nothing derived. One vocabulary for a level —
**good / fair / poor**, and **cold / warm** for the sides of a comfort range — is computed by one
small function where a value is shown (`level(value, kind, limits)`). A first version rendered one
binary sensor per room and condition; it was removed: it put display messages into the data model.

### 3.3 Discovery through the registries: no lists of the dashboard's own

The home inputs name what is ambiguous (which of five temperature sensors is the room's). Everything
else is found the way the `floorplan` component already finds devices: Home Assistant's entity and
device registries, by HA area (an entity's own area, else its device's), hidden / disabled /
diagnostic / configuration entities left out. Pocket finds that way: an area's other sensors, the
other measurements of a sensor's device, every media player in an area, power meters, plants,
scenes, covers, doors and windows, locks, update entities, backup sensors.

Two consequences worth checking in review:
- A device added in Home Assistant appears without a render.
- A domain whose entities are also components' internals is named, not discovered: timers (the
  Ramka keeps an internal one), so Pocket takes `timers:` in its own inputs, as the Ramka does.

### 3.4 Settings: per person, per device, or shared

| scope | where | what |
|---|---|---|
| shared (the home) | HA helpers (P2) | comfort ranges, air limits |
| per person | HA frontend user data (`frontend/set_user_data`, key `domosenso-pocket`) | theme, bar, climate view, media player, scenes shown |
| per device | browser local storage | "open Pocket when the app starts" (HA keeps the default dashboard per user) |

## 4. Pocket's architecture

- **One card, one panel view, one dashboard per language** (`templates/dashboard.lang.yaml.j2`). The
  card's config is the home inputs as rendered plus the threshold helper ids; everything else is
  read at run time from `hass`.
- **A shell** (`cards/pocket-app.js`): hash routes (`#/`, `#/systems`, `#/area/<id>`, …; Back and deep
  links work, nothing reloads), a fixed bottom bar, one bottom sheet with stacking, an optimistic
  store, theme, a toast, the menu button.
- **Pages and sheets on one contract** (`cards/pages/index.js`): `render(ctx)` builds once,
  `update(el, ctx)` patches on each hass update; `ctx` carries hass (the optimistic view), config,
  settings, `t`, `navigate`, `openSheet`, `routeId`. Lists rebuild only when their rows change.
- **Optimistic controls** (`cards/lib/optimistic.js`): every service call goes through one store that
  shows the expected state at once and rolls back with a toast when Home Assistant does not follow
  within a timeout.
- **Home Assistant's own pieces where they are better**: charts are HA's history-graph and
  statistics-graph cards (via `loadCardHelpers`), more-info for changing helpers and installing
  updates, kiosk-mode (optional, HACS) to hide HA's header on a phone.
- **Shared code with the floor plan, copied not imported at run time**: the device categories and
  the scan form are verbatim copies of `floorplan`'s, kept equal by a test and
  `tools/category_index.py`; the floor plan's card is consumed as an element on the area pages.
- **Words**: `translations/{en,pl,de}.json`, none in the sources (a test scans them); Swiss Standard
  German.
- **Tests**: `node --test` per module against the demo home (550 tests), plus the catalog's
  `tools/check-all.sh` (render, schema, catalog rules, ha-check).

## 5. What changed on the way (spec → built)

| spec (2026-11-04) | built | why |
|---|---|---|
| Rooms tab | **Areas**, the outside an area too | the balcony belongs with the rooms |
| media picker offers the home inputs' players only | plus every player HA places in an area; `media` may list several | a device's DLNA entity misses streaming playback; the one that sees it had to be listable |
| own cards throughout | own cards, but HA's charts in the details | they read better and match the Ramka |
| HA's header stays | hidden on a phone by kiosk-mode, a menu button by the title | screen space; the edge swipe is the way back |
| one Home | **Overview** (now, quick actions) and **Systems** (a tile per page) | a single Home mixed status and navigation |
| a trend per reading | a trend per **sensor**, its measurements in a drop-down | a device measures several things |
| Settings on one page | two levels: comfort ranges and About are panels | home-wide values a step away |

## 6. P3: the Ramka on the shared model (to plan)

- The Ramka declares `uses_home: true` and consumes P2's helpers.
- Its inputs `lights`, `climate`, `outside`, `air`, `weather` move to the home inputs; it keeps the
  wall's own (radar, screen, kiosk, photos, music details, status lists until the home inputs carry
  them).
- Its colours read P2's helpers instead of its own `ramka_air_*` and widget ranges; its settings
  dashboard links to the shared ranges.
- `UPGRADE.md` gives the move step by step; `render` refuses the old inputs with a pointer to it.
- Acceptance: before/after snapshots of a home `compare` as `equivalent`.

## 7. Questions for the reviewer

1. **Home inputs scope.** Is "rooms + outside + weather, and per room lights, scenes, climate, air,
   media" the right first cut? Covers, contacts, locks and plants are discovered by area today;
   should the home inputs name them (as the Ramka's `covers` and `status` inputs do) to give an
   order and labels, or is registry discovery enough?
2. **Template-time vs run-time.** The home inputs are read at render time (a change needs a render
   and deploy); discovery is at run time. Is the split right, or should more move to run time (a
   home-model entity was considered and rejected: approach A in the spec)?
3. **Thresholds as helpers.** One helper per room and bound; is a component that owns shared
   helpers (`climate-air`) the right owner, and is the seed-once behaviour (a person's change wins
   over the inputs' default) right?
4. **Registry discovery rules.** Hidden / disabled / diagnostic / configuration entities are left
   out everywhere except update entities (which are config or diagnostic by nature). Any case where
   this hides something a person expects, or shows a component's internals?
5. **Per-person settings in HA user data**, per-device in local storage: any concern about a phone
   shared by two people, or about the start-up redirect (a dashboard resource that moves the app's
   first dashboard of a session to Pocket)?
6. **The copy of the floor plan's categories** inside Pocket (kept equal by a test) versus a shared
   card library loaded at run time.
7. **P3 order.** Migrate the Ramka next (one definition of thresholds today is used by Pocket only;
   the Ramka still has its own), or finish P4 first?
