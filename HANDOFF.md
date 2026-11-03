# Handoff: floorplan sound maps (2026-11-03)

> **TEMPORARY.** This file lets a later session continue this branch. Delete it in the commit that
> opens a pull request from this branch into `main`.

Branch `claude/floorplan-sound-map`, pushed with no pull request: the sound maps stay a prototype
until the owner decides to go on with them.

## What is here

- **Sound maps** (SPEC-028 Amendment 8, draft): a live sound field on the Audio and media layer,
  drawn on a canvas behind the plan from the plan's speakers, ceiling and the audio sensors' levels
  (`cards/lib/sound.js`), the legend in the bar, the "show one layer alone" hint, a `sound change`
  line in `push --plan`.
- **Openings** (SPEC-028 Amendment 9): doors, windows, doorways and fixed glass linked to their
  sensors. These went to their own branch, `claude/floorplan-openings`, rebuilt on `main` without the
  sound maps, with a pull request. Once that merges, rebasing this branch drops its openings commits.
- This branch is based on `main` at `1376887`, which is 11 commits behind `main` on 2026-11-03.

## Next

1. Rebase on `main` after the openings pull request merges; resolve the spec, README and card.
2. The design to aim for comes from a feasibility study made for a home using this card. Its
   conclusions are general:
   - The speakers are the sources and the microphones are samples of their field. Do not radiate
     gradients from the sensors.
   - A static spatial pattern per band, built from long averages, with a live room-average level on
     top. A per-frame map of the dominant frequency mostly shows the music, not the room.
   - Below the Schroeder frequency, show measured dots or a modal model. Never blend between them.
   - Show uncertainty: the map fades away from data and each band carries a badge for its regime.
   - Optional: a sweep-capture mode in the sensor firmware for RT60, EDT and C50/C80.
3. The audio-sensor rule that two boards cannot share an area has to go before a room can have
   several sensors.
4. No version bump: the owner releases versions.
