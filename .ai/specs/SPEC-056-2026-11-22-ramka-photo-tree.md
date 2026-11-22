# SPEC-056: The Ramka reads a photo folder tree

- **Status:** approved 2026-11-22
- **Source:** a home owner whose photo source mirrors a library's album tree on disk (sets per
  year, a set per trip inside it, an album per day inside that). The Ramka finds photos at any
  depth, but it names an event after its last folder only ("Day 1", without the trip), offers only
  the top-level folders as albums to choose from, and takes turns at two levels only (top-level
  albums, then the events inside one), so a tree's top level, often the years, decides every
  share. The owner asked for a general solution: any nested photo folder, synced or copied by hand,
  should read well on the wall.

## Goal

The Ramka's photos page reads a folder tree under `photo_dir`:

1. **Caption levels.** A Ramka setting, **Folder levels in the caption**, with the options `1`,
   `2`, `3` and `all`; default `1`. The caption's first line shows the last N folders of the
   photo's folder path, outermost first, joined with ` › `, then ` · ` and the date as today.
   `1` is exactly today's caption.
   - `1`: `Day 1 · 8 Jul 2025`
   - `2`: `Lisbon › Day 1 · 8 Jul 2025`
   - `3` or `all`: `2025 › Lisbon › Day 1 · 8 Jul 2025`
2. **Album tree.** The settings page's album picker (today's dialog: filter, show all / chosen /
   unchosen, date sort, Select all, Deselect all, Save) lists every folder that holds photos at
   some depth, as a tree: indented by depth, labelled with the folder's own name. Ticking a folder
   chooses it and everything below it; folders below a ticked one show as included and cannot be
   unticked on their own (to leave one out, untick the parent and tick its siblings). "All albums"
   and "none chosen is all" stay as they are. Select all and Deselect all act on the top-level
   folders the filter shows; the filter matches the full path and shows each match with its
   parents; the date sort orders siblings within their parent.
3. **Turns, level by level.** Today's draw keeps cycles at two levels. It becomes one rule at every
   level: at the top, the folders that hold photos at some depth take turns (each once per cycle,
   random among those left, not the last one twice in a row); inside the one drawn, its child
   folders that hold photos take turns the same way, and a folder that holds photos itself counts
   its own photos as one more turn; so on down until a folder's own photos are drawn, whose photos
   take turns as today (the series of N). Each year gets the same share, each trip the same share
   within its year, each day within its trip. For a flat `photo_dir` this is exactly today's draw.
4. **Choosing by path.** A choice is a folder path relative to `photo_dir`; a folder is in when its
   path equals a chosen path or starts with a chosen path and `/`. Today's choices are top-level
   folder names, which are paths of depth one: they keep working unchanged.

Placement test: Home Assistant has no wall photo rotation; the Ramka's photos page is the
catalog's, and any home with a nested photo folder has the same need: **a change of the Ramka
component**. The photo source (a sync, a NAS, a hand copy) stays outside it.

## Devices, integrations

None new. `photo_dir` and the `folder` integration as today.

## Inputs

None new. The caption levels are a live setting, not a render input.

## Provides

| id | stability | change |
|---|---|---|
| `input_select.<prefix>_photo_caption_levels` | stable | new, with `photo_dir`: options `1`, `2`, `3`, `all`; initial `1`; on the settings page's Photos page (Basic section) and in its reset |
| `sensor.<prefix>_photo_albums` | stable (unchanged id and keys) | `available` lists every folder path that holds photos at some depth, sorted by path (a flat `photo_dir`: the same values as today); `chosen` holds paths |
| `script.<prefix>_photo_albums_set` | stable | `chosen` takes paths; unchanged fields |
| `shell_command.<prefix>_{pick,albums}` | stable | the album arguments are paths; `--albums` prints every folder path that holds photos at some depth |
| `photo-frame-card` | stable | new optional config `caption_levels_entity` (absent: `1`, today's caption) |
| `photo-albums-card` | stable | shows `available` as a tree |
| `.ramka_rotation.json` (next to `photo_dir`) | internal | new shape (per-folder cycles); a file in the old shape is read once into the new one where the folders still exist, else ignored, so the rotation at worst starts anew once |

The index (`index.json`) is unchanged: each photo's `folder` already holds its path, from which the
card builds the caption.

## Artifacts and ownership

All managed: `templates/package.yaml.j2` (the helper, the reset entry, the card config),
`templates/ramka-settings.lang.yaml.j2` (the setting on the Photos page),
`templates/dashboard.lang.yaml.j2` and `ramka-preview.lang.yaml.j2` (the frame card's config),
`cards/photo-frame-card.js`, `cards/photo-albums-card.js`, `shell/ramka_pick.py`, translations
(en, de, pl), `PHOTOS.md`, `README.md`, `UPGRADE.md`. Every Ramka extension updates the Ramka
settings dashboard: this one adds the caption setting there.

## Compatibility

- A flat `photo_dir`: captions, the album list, the choices and the draw are as today.
- A nested `photo_dir`: the album list grows from the top level to every folder with photos; the
  choices made before (top-level names) stay valid. The draw's shares change as Goal 3 says; a
  home that wants today's top-level shares keeps its tree one level deep.
- The settings reset sets the caption levels to `1`.
- `UPGRADE.md` notes the new setting and the level-by-level draw; nothing to do for a flat folder.
- The version is the maintainer's call at release (no bump in the change itself).

## Tests

- `tests/test_ramka_shell.py`: `--albums` on a tree lists every folder path with photos at some
  depth; the draw on a flat folder gives today's sequence shape (album, then event, then photos);
  on a tree every top-level folder comes once per cycle, a trip's days take turns within the trip,
  a folder with own photos and subfolders counts its photos as one turn; chosen paths at depth two
  restrict the draw to that branch; a top-level choice from before keeps working; an old-shape
  `.ramka_rotation.json` does not fail the draw.
- `cards/photo-frame-card.test.mjs`: caption with levels 1, 2, 3 and all for a path of depth 3 and
  depth 1; no `caption_levels_entity` gives today's caption.
- `cards/photo-albums-card.test.mjs`: the tree order and indentation; ticking a parent shows its
  children included and saves only the parent; the filter shows matches with their parents; Select
  all of a filtered list; date sort within siblings.
- `tests/test_ramka_render.py`: the helper with `photo_dir` only, its reset entry, the settings
  page's row, the frame card's `caption_levels_entity`.
- `tools/check-all.sh` green.

## Out of scope

- How a photo source lays out its tree (the integration that mirrors a library is its own project).
- Weighting the draw by photo count, or hiding a year folder from captions by itself.

## Open questions

- `available` with every folder of a large tree may pass Home Assistant's 16 KB limit for
  recorded attributes (the state stays, the recorder skips it and logs a warning). Inference: a
  library of about 150 albums in three levels gives roughly 120 paths, about 6 KB. A smaller form
  (branch points only) is possible if real homes pass the limit.

## Amendment 1 (2026-11-22): long paths are shown

The owner: a photo whose path is longer than the 255 characters `input_text.<prefix>_photo` holds
is shown, not left out; a caption longer than the screen ends in "…".

- The picker and the index give such a photo a short stand-in: a hard link (a copy where the file
  system has none) at `<photo_dir>/@ramka-long/<first 16 hex of the path's SHA-1>.jpg`. The draw
  takes turns over the real folders as before; only the path it hands to the loop is the stand-in.
  The index lists the photo under the stand-in's path with its real `event` and `folder`, so the
  caption and the caption levels read as for any photo.
- `@ramka-long` starts with `@`, so neither the draw, the album list nor the index counts it as a
  folder of photos. The index removes stand-ins no photo needs any more.
- The caption's lines already end in "…" where they pass the screen's width (CSS ellipsis); kept,
  and tested with a long folder path.
- From the review: Select all and Deselect all act on the topmost folders the filter matches (without
  a filter: the top-level folders), so filtering a trip and selecting all chooses that trip, not its
  year. The counts ("3 of 4 albums", "All albums (4)", the picker's "selected") count the innermost
  folders, so a tree's intermediate folders are not counted twice.
