# SPEC-026: Pause the rotation and swipe through a page's views (ramka, unreleased)

- Status: approved 2026-11-01 by the maintainer (the behaviour, in a brainstorm; the mechanism
  below is the builder's and marked **Decision**)
- Source: the maintainer, at the tablet: a tap anywhere opens the controls, so there is no way to
  stop on a page and read it before the rotation moves on.

## Goal

1. **Pause.** A hidden target in the bottom-right corner of the rotation. A tap freezes the page on
   screen and the view inside it (the plant page, the photo); a small play button then shows in that
   corner, and a tap on it resumes, the page on screen getting its full time again.
2. **Sideways swipes** step through the views of the page on screen: plants, the previous or next
   plant page; photos, the previous or next photo of the series (round the series). A page with one
   view (climate, air, status) ignores them. A swipe restarts the page's time; while paused it changes
   the view and the rotation stays paused.
3. Nothing else changes meaning: up and down still turn pages (and keep a pause), a tap anywhere but
   the corners still opens the controls, and coming back from the controls finds the frame as it was
   left, paused on the same view.
4. **A pause ends by itself when the screen goes off** (mode `off`, the radar's off delay), so the
   next person who comes gets the rotation. Swipe up on the controls (the rotation from its first
   page) ends it too.

Non-goals: pausing the music view (it has no rotation); sideways swipes on the controls, the calendar
or the music view; an animation between views.

## Contract

New entities (`provides`, stable):

- `input_boolean.<prefix>_paused`: on while the rotation is paused. Restored over a restart.
- `script.<prefix>_{pause,resume}`: pause only while the rotation shows (mode `ambient`, music view
  off); resume always.
- `script.<prefix>_{view_next,view_prev}`: one step through the views of the page on screen, through
  `script.<prefix>_view_step` (field `step`, 1 or -1).
- `input_number.<prefix>_plants_page` (with plants): the plant page on screen, 0-based; the card shows
  it modulo its page count.
- `sensor.<prefix>_photo_series` (with photo_dir): attributes `photos` (the series, paths as
  `input_text.<prefix>_photo` holds them) and `index` (the photo on screen; `index` equal to the
  count: the series is over); state the index. Set by event `<prefix>_photo_series`; excluded from
  the recorder. `script.<prefix>_photo_series_new` picks a new series.
- Automation `<prefix>_pause_end`.

Cards:

- `corner-taps-card`: a swipe rule takes `left` and `right` scripts (finger moved left / right: a
  drag of 80 px or more, under 1.5 s, more horizontal than vertical, the same thresholds as up and
  down); new option `pause: {entity, conditions, pause, resume, size}` draws the bottom-right target
  while the conditions hold, with a play button while the entity is on; a tap on it runs `resume`
  when the entity is on, else `pause`, and never counts as a tap anywhere.
- `plants-card`: new option `page: <entity>`; with it the card shows that page and turns none
  itself (no timer, no page kept in the browser). Without it, as before.

## Decisions

- **Decision: the state lives in Home Assistant, not the browser.** The rotation is a Home Assistant
  script, restarted by a watchdog and by every return to ambient; only a helper they all read can
  hold it. `ambient_start` and the watchdog do not run the loop while paused; `ambient_stop` (leaving
  ambient, the music view coming on) does not reset the page to the first while paused; the loop's
  while-condition includes the pause; pausing stops the loop (`ambient_stop` triggers on it) and
  resuming starts it (`ambient_start` triggers on it).
- **Decision: plant pages turn in Home Assistant** (`input_number.<prefix>_plants_page`), not in the
  card: a swipe and a pause must reach them, and the loop already counts the pages. The plants
  stage shows the page on screen for `plants_page_s`, turns, shows the next, at most two per pass as
  before, and turns once more after leaving so the next pass continues.
- **Decision: the photo series is kept** (`sensor.<prefix>_photo_series`), so a swipe can step back
  and a resume continues the same series. The photos stage continues a series that is not over and
  picks a new one when it is (or is empty). A series left by a vertical swipe is continued on the
  next visit.
- **Decision: next after the last photo is the first of the same series** (round, both ways), the
  same as plant pages.
- **Decision:** the pause target is the same size as the top corners (`size`, 72 px); the play
  button is a 40 px dimmed circle inside it, so it does not spoil a photo.
- **Decision:** a vertical swipe onto the photos page while paused shows a photo of the current
  series, or a new series when it is over (the loop that would pick it is stopped).

## Amendment (2026-11-01, SPEC-027)

The non-goal "sideways swipes on the controls" is narrowed: with the optional input
`floorplan: true`, a sideways swipe on the controls switches between the controls and the floor
plan (SPEC-027). Sideways swipes on the calendar and the music view stay a non-goal, and without
the input the controls ignore them as before.
