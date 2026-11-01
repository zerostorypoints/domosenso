# Floor plan: rooms and sensor positions for every component (design)

- Date: 2026-11-01. Status: draft for the maintainer's review.
- Source: a brainstorm with the maintainer on 2026-11-01, after the plants work (SPEC-022) and a
  trial of the HACS plant integration. Examples here are the demo home's; no real home's data.
- What the maintainer said is marked as his; my calls are marked **Call**; guesses are marked
  *(inference)*.

## Why

A home has many sensors that measure a place, not only a device: plant sensors read light and
temperature where the plant stands, room thermometers read the room, an air monitor reads its
corner. Today Domosenso knows only which *area* a device is in. It cannot say which part of a flat
is sunny and warm and which is dark and cool, or where a new plant with given likings would do well.

The maintainer's goals, in his words reduced to two:

1. **Place plants by their likings**: "wtedy wiem gdzie stawiać podobne rośliny".
2. **See the flat on its plan**: which part is sunny and warm, which darker and cooler, over a day.

Both need one thing first: the flat's rooms as shapes and each sensor's position in them. That is
this design. The light and heat map that uses it is the next project (section "Next").

## What gets built

A new catalog component **`floorplan`**, with three parts, plus one addition to the Ramka and one to
`onboard-home`.

### 1. The plan, stored in Home Assistant

- One plan per HA floor (one floor for a flat). A plan holds:
  - **rooms**: a polygon each, in metres, linked to an HA area (`area_id`); the name shown is the
    area's name, so a rename in HA shows on the plan;
  - **points**: a position in metres for an entity or a device, with its room derived from the
    polygon it stands in;
  - a `schema` version number.
- **Call:** the plan is stored as the config of a storage-mode Lovelace dashboard (`floorplan`),
  saved through the websocket (`lovelace/config/save`) by the editor card. Reason: the catalog has
  no way to install a custom integration (AGENTS.md lists that as manual), and the `domosenso` CLI
  already creates storage dashboards and saves their config (`tools/domosenso_cli/probe.py`). A
  drag takes effect at once, with no deploy or restart. Only an administrator can save (HA requires
  admin for `lovelace/config/save` *(inference: verify in HA 2026.9 before building)*).
- Cost of that call: positions are visible to cards and to tools that read dashboards, not to
  templates or automations. The maintainer did not ask for automations by position; they are out
  of scope for now.
- **The architect's plan never goes into HA.** The maintainer: it need not be visible all the time,
  but should be kept for later changes. It is a tracing aid: the agent reads it during the
  onboarding step, and it is kept in the home repository (`domosenso/floorplan/<floor>.<ext>`, with
  the scale and transform used, in the instance file). The drawn plan is rooms only. This avoids
  serving a private plan from a Home Assistant reachable from outside (`/api/image/serve/` may be
  unauthenticated *(inference)*).

### 2. The editor

- A card, `floorplan-card`, with a view mode and an edit mode, used on the `floorplan` dashboard
  (desktop or phone, in HA; not on the Ramka).
- Zoom (wheel, pinch, + / − / fit) and pan, in both modes. The maintainer asked for zoom so a
  sensor can be placed exactly ("powinien być zoomowalny").
- Edit mode:
  - drag a point to where the sensor stands; dropping it in another room changes its room on the
    plan only (the HA area is not changed; a mismatch is shown, see "Left to the builder");
  - drag a room's corners, add or remove a corner, split or join rooms, assign a room to an HA area
    or create the area *(Call: area creation goes through HA's area registry and needs the admin)*;
    **Call (builder check):** split and join change only the plan's shapes; the editor may create an
    area for a new room, never deletes an area or moves a device between areas;
  - a tray of entities not yet placed: every point entity (the classes below) with an area appears
    at the centre of its room, **marked `placed: false`** until someone drags it; others wait in the
    tray. **Call (builder check):** the light and heat map ignores unplaced points, so a guessed
    centre never feeds the interpolation;
- Which entities are points: those with a `device_class` of temperature, humidity, illuminance,
  moisture, carbon_dioxide, pm25, plus `plant.*` and any entity added by hand *(Call)*.
- View mode: rooms, points with their current value, nothing to tap (the maintainer: "póki co
  nic").

### 3. Making a plan: in onboarding, with the agent

The maintainer's proposal: during onboarding the owner uploads a floor plan and maps the rooms
together with the agent.

- New step in `onboard-home`, optional, after the Home Assistant scan:
  1. the owner gives an architect's plan or a phone photo of one (PDF, JPG, PNG);
  2. the agent traces each room as a polygon and asks for one known dimension (a wall length) to set
     the scale in metres;
  3. the agent matches rooms to the HA areas by name, asks about the ones it cannot match, and
     proposes areas for rooms HA lacks;
  4. the agent saves the image and the plan in the home repository, writes the plan to HA after the
     owner's typed yes (it writes to their HA), and the owner corrects it in the editor;
  5. a later redraw (a wall moved, a room split) starts from the kept image, with the agent.
- The same step works on a running home, outside onboarding (a skill or a section of the
  component's README *(Call)*).
- A home that already has a hand-drawn plan (an SVG with rectangles) can be converted the same way,
  the agent reading the SVG instead of an image.

### 4. The plan in the home repository

- `domosenso snapshot` already records dashboards. **Call:** the `floorplan` dashboard's config is
  also written to an instance file in the home repository (`domosenso/floorplan.json`), by a
  `domosenso` command, so the plan is in git history and staging and a fresh install get it back.
- **Call (builder check):** the way back, repository → HA, is its own command (e.g.
  `domosenso floorplan pull|push <target>`), not part of `deploy`. `deploy` knows only files and
  Lovelace resources; teaching it storage dashboards would touch its plan hash, backup, rollback and
  verify. The push command creates the storage dashboard when missing, prints a plan (rooms and
  points added, moved, removed), keeps the previous config as its backup and needs the same go-ahead
  as any production write. Onboarding step 4 writes through it.
- The file is **instance** layer: written by the command from HA, never rendered over by the
  catalog. Which way wins when both changed is left to the builder (see below).

### 5. On the Ramka: a second view of the controls

- The maintainer: the plan comes up as a second screen of the controls, reached with a sideways
  swipe, the way SPEC-026 swipes through a page's views.
- SPEC-026 (branch `claude/ramka-pause-swipe`, approved 2026-11-01, not merged) lists "sideways
  swipes on the controls" as a non-goal. This design reverses that for one case: **when the home has
  `floorplan` and the Ramka's input enables it**, a left or right swipe on the controls switches
  between the controls and the plan. Same thresholds as SPEC-026 (80 px, under 1.5 s, more
  horizontal than vertical).
- Read only: no taps on the plan; a tap anywhere returns to the controls *(Call)*. Without
  `floorplan`, the controls stay one view, as today.
- Depends on SPEC-026 being merged first.

## Goals

- Every home can get a plan of its rooms with sensor positions, from an uploaded plan, in one
  onboarding step, and correct it by dragging.
- Other components can read rooms and positions and draw on the plan. **Call (builder check):**
  both ways, and both are this project's contract: the stored plan's shape is a published,
  versioned schema in `schemas/` (other tools read it, `schema` bumps on a breaking change), and
  `floorplan-card` takes overlay layers from other components' cards (a small registration API), so
  the Ramka's view and the next project's map embed the card instead of redrawing rooms.
- The Ramka can show the plan.

## Non-goals (for this project)

- The light and heat map, DLI, "where to place a plant": the next project.
- Automations or templates that use positions.
- Tapping a room to control it.
- Several floors shown at once (one plan per floor is stored; a floor switcher is enough).
- Walls, doors, windows, furniture as objects. *(Call: windows would help the light map later; not
  now.)*
- Measuring by camera or AR.

## Anti-goals

- A plan that only works in the maintainer's home: no hard-coded rooms, no private plan in the
  catalog (global rule: build for reuse).
- A second source of truth for areas: room names and membership stay HA's areas.
- Duplicating HA (the maintainer: "nie chcę dublować infrastruktury"): no custom integration, no own
  database.

## Constraints

- Home Assistant 2026.9, Container and HAOS. Cards are plain JS modules like the Ramka's
  (`components/ramka/cards/*.js`), tested with `node --test`; translations en, de, pl.
- A new component, a new contract surface and a reversal of SPEC-026's non-goal each need a spec in
  `.ai/specs/` approved before code (`write-component-spec`).
- Privacy: the home's plan, room names and the uploaded image stay in the home's HA and repository.

## Next (not this project): the light and heat map

Shown to the maintainer as a mock-up and accepted ("jest ok"): the plan coloured between the points
by their readings, a time-of-day slider, three layers: **light** (from plant sensors only; rooms
without one are hatched), **heat** (plant sensors plus room thermometers), **where to place** (a
plant group: shade, half shade, sun; green where daily light and temperature fit). The maintainer
allows using every existing temperature and humidity sensor. `plants` adds DLI (lux × 0.0185 over the
day) as a number, not a problem state (the HACS trial showed every plant "DLI low" in November at a
threshold of 2 mol). Plant sensors always stay with their plants (no free probe).

## Left to the builder

- The card's internal model, drawing (SVG is what the mock-up used), and how pinch zoom and drag are
  implemented.
- The exact dashboard config shape (a `floorplan` key in the view's card config is one option).
- How a point whose plan room differs from its HA area is shown, and whether the editor offers to
  move the device's area in HA.
- Conflict between the repository file and HA (both edited): warn and refuse, or newer wins.
- Snapping, grid, undo.
- Colours, marker icons.

## Open questions

- Name of the instance file and of the command that writes it.
