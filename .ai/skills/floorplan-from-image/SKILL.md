---
name: floorplan-from-image
description: Trace the rooms of a home from the owner's floor-plan image (an architect's plan, a PDF page, a photo of a hand drawing) or an existing SVG, set the scale from one known length, match each room to a Home Assistant area, write domosenso/floorplan.json and push it with domosenso floorplan push. Use when someone wants the floorplan component's plan made from a drawing, or when onboard-home reaches its floor-plan step.
---

# floorplan-from-image

Makes the plan that the `floorplan` component's card draws (SPEC-027). The person running it owns
the home and its Home Assistant; talk to them in their language, files stay English. It runs inside
the **home repository**, not in the catalog checkout. Called from `onboard-home` step 3.1, or
alone when a home already has `floorplan` added (`domosenso add floorplan@<version>`).

## Rules

- **Reads are free, writes need a typed yes.** Reading the area and floor registries, `floorplan pull`
  and `floorplan push --plan` need no go-ahead. Creating an area, `floorplan push --apply` and
  anything else that writes to their Home Assistant need their yes typed in this session, each time.
  `push production --apply` also asks for the word `production`, or takes `--confirm <hash>` of the
  plan you showed.
- **The token never shows.** It stays in its file outside every repository; read it only as
  `$(cat <token file>)` inside a command.
- **The drawing is private.** It stays in the home repository as `domosenso/floorplan/<floor>.<ext>`.
  Never upload it to Home Assistant (its image upload URLs are readable without a login), never
  copy it into the catalog checkout, a pull request or an issue.
- **No household in the catalog.** Room names, areas and measurements are theirs. Nothing from this
  session goes into the catalog checkout.
- **A trace is an inference.** Say so when you show it: the owner checks every room against their
  drawing before anything is written.
- `domosenso <command>` below is `uv run --project <catalog> domosenso --home <home> <command>`;
  every command ends with `ok` or `FAIL <reason>`, and you read that line.

## 1. The image and the floor

Ask for, one question at a time:

1. **The drawing**: an image (PNG, JPG), a PDF (ask which page shows this floor; render that page to
   a PNG), or an SVG. Copy it into the home repository as `domosenso/floorplan/<floor>.<ext>`. A
   photo of a hand drawing works if its walls are readable; say if the photo is skewed, because a
   skew breaks the scale.
2. **Which Home Assistant floor it shows.** Read the floors:
   `config/floor_registry/list` over the websocket (a short script with
   `domosenso_cli.cmd_deploy.connect(target)` and `ha.call(...)`, as `floorplan.py` does), and let
   them pick one. A home without floors uses `floor_id: null`. One floor per run; for a second
   floor, run the skill again.
3. **The target** to push to (`staging` first when the home has one).

## 2. Trace the rooms

Open the image yourself and trace each room as a polygon in **image pixels**, corners in order,
walls straight. Name each room as the drawing labels it.

- Rooms share walls: reuse the same corner pixels for a wall two rooms share, so the editor keeps
  the wall shared.
- Skip what is not a room of the plan: stairs, balconies and garden unless the owner wants them
  (an area for each).
- Write `.domosenso/floorplan/trace.html` (not committed): the image with your polygons drawn over
  it as an inline SVG, each labelled with the room's name, polygon outlines translucent. Open it
  for the owner (`open` on macOS, `xdg-open` on Linux) and ask what is wrong: a missing room, a
  merged pair, a corner off the wall. Redraw until they say it matches.

## 3. The scale

Ask for **one length they know**: a wall, a door width, a room's side, in metres, and which wall.
Measure its length in pixels on your trace (the two corner points) and compute
`metres_per_px = metres / pixels`. Show the result and one more check: "your living room then comes out
at 5.4 by 7.6 m, does that fit?". If it is off by more than a few percent, ask for a second known
length and look for a skewed photo before going on.

Convert the polygons: with `offset_px` the pixel of the plan's top-left corner (the smallest x and
smallest y over all corners), each corner `(px, py)` becomes
`[round((px - offset_x) * metres_per_px, 2), round((py - offset_y) * metres_per_px, 2)]`. Metres,
origin top left, y down. The plan is not rotated: if the drawing's north is not up, leave it, and
write `rotation_deg: 0`.

## 4. Match rooms to areas

Read `config/area_registry/list` (and `floor_registry/list`). For each room:

1. **Match by name**, ignoring case and diacritics (`Küche` and `kuche`, the area id is HA's slug).
   Show the table room → `area_id` for them to confirm.
2. **Unmatched rooms**: ask which existing area each is, or whether it is a new one.
3. **New areas**: propose them with a name and the floor, as a list. Create them only after their
   typed yes, one `config/area_registry/create` per area (`name`, `floor_id`), then read the
   registry again for the ids Home Assistant gave them. Never delete or rename an area, and never
   move a device to another area.

A room's `area_id` is the registry's id, which is not always the slug of its current name (an area
renamed later keeps its first id): take it from the registry, never derive it.

## 5. Write the plan, show the push

Write `domosenso/floorplan.json` (`schemas/floorplan.schema.json`, `schema: 1`). If the file
exists with other floors, keep them and replace only this floor:

```json
{
  "schema": 1,
  "floors": [{
    "floor_id": "ground",
    "rooms": [
      {"area_id": "living_room", "polygon": [[0, 0], [5.4, 0], [5.4, 7.6], [0, 7.6]]},
      {"area_id": "kitchen", "polygon": [[5.4, 0], [9.0, 0], [9.0, 4.2], [5.4, 4.2]]}
    ],
    "points": []
  }],
  "source": {"image": "domosenso/floorplan/ground.jpg", "metres_per_px": 0.0123,
             "rotation_deg": 0, "offset_px": [40, 30]}
}
```

`points` stays empty: the owner places the sensors by dragging, and the tray lists every sensor
with an area. `source` stays in the repository's file; `push` never sends it to Home Assistant.

Then:

```bash
domosenso floorplan push <target> --plan
```

Read the lines to the owner: `dashboard create floorplan` (the dashboard does not exist yet),
`room add|change|remove <floor> <area_id>`, `area missing <area_id>` (then `FAIL area missing:
<ids>`: a room points at an area Home Assistant does not have; go back to step 4),
`nothing to push` (the plan equals what is there), `hash <hash>`. `FAIL changed on target since
pull: <n> rooms, <m> points` means the plan in Home Assistant was edited since the last pull: run
`domosenso floorplan pull <target>`, merge, and plan again.

Ask whether to apply. Only after they type yes in this session:

```bash
domosenso floorplan push <target> --apply --confirm <hash>
```

It backs up an existing plan to `.domosenso/floorplan/<target>-<timestamp>.json`, creates the
dashboard if missing, saves, and ends `pushed`, `ok`. On `production` the word `production` is
asked when `--confirm` is left out.

## 6. After the push

Tell the owner, in their language:

1. Open the **Floor plan** dashboard in Home Assistant (the sidebar). It needs the card installed:
   if the dashboard shows an unknown card, `domosenso add floorplan@<version>`, `render` and
   `deploy` come first (the `onboard-home` and `render-and-stage` skills).
2. As an administrator press **Edit**, and drag each sensor and plant to where it stands. Sensors
   start at their room's centre, faded, until dragged. Rooms can be reshaped, split and joined
   there as well.
3. When done, `domosenso floorplan pull <target>` brings the plan back into
   `domosenso/floorplan.json` (it keeps `source`), and then commit `domosenso/floorplan.json` and
   `domosenso/floorplan/<floor>.<ext>`. Pushing again before that pull would be refused, so the
   browser's edits are never lost.

## Not ready

- The trace is by eye, to a few percent; walls are straight lines, curved walls become corners.
- One floor per run; no doors, windows or furniture (SPEC-027 non-goals).
- Not tried on a PDF with several plans on one page: ask them to crop it.
