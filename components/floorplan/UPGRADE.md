# floorplan: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the floor plan has to do.

## 0.2.1 (2026-11-01): faster on a busy home

No change in what the card shows or stores. It works out its devices once per registry change
instead of on every state change in Home Assistant, redraws only the plan while a dot or the view is
dragged, builds a tooltip only when the pointer reaches something new, and lays out readings with
less work. `floorplan preview` keeps one change per entity instead of every change of the session.
**After the update:** `domosenso update floorplan --to 0.2.1`, deploy, reload the browsers that
show the plan (the card's files move to `www/domosenso/floorplan/0.2.1/`).

## 0.2.0 (2026-11-01): every device on the plan, by category; the preview against a real home

Everything since 0.1.0 (SPEC-028 Amendments 4 to 6 and their additions).

- **Every device, by category:** the editor's tray and the plan hold every placeable device, not
  only sensors, each coloured and shaped by its category from the catalog's `categories/` (plants,
  media, radio, security, climate, light, shading, other); further roles (what a device also
  senses) are rings. Layer chips switch categories on and off; `layers:` fixes them, and
  `layer_choice: one` shows one at a time with chips (the Ramka's plan view). Nothing to do: the
  card reads the categories it ships with.
- **The stored plan** (still `schema: 1`) may carry two optional keys per point: `category` (an
  override) and `also` (devices that are the same hardware). A `domosenso` command older than this
  catalog refuses a plan that uses them: run `floorplan pull | push` with this catalog's command.
  `push` prints `point change` for them.
- **`domosenso floorplan preview <target>`:** the editor against the target's real data, read-only
  towards Home Assistant; saves go to `domosenso/floorplan.json`. Use it when staging lacks the
  home's devices.
- **On the plan:** a room's unplaced devices are one dot with their list; placed dots too close to
  tell apart are one dot with a list; dots stay inside rooms; readings are laid out clear of walls,
  dots, other readings and room names, with leader lines; links to a device's hub show on hover.
- **After the update:** `domosenso update floorplan --to 0.2.0`, deploy, and reload the browsers
  that show the plan (the card's files moved to `www/domosenso/floorplan/0.2.0/`).
