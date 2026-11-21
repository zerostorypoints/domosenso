# ramka: the photo slideshow

How the Ramka's photos page picks, shows and captions photos, and what decides what you see. For an
agent answering an owner's question, and for the owner. Read from the code of this component
(`shell/ramka_pick.py`, `shell/ramka_index.py`, `cards/photo-frame-card.js`, the photo parts of
`templates/package.yaml.j2`); ramka 0.2.0 and later, with the input `photo_dir` set.

## In short

- **An event is a folder.** The caption's name is the name of the folder the photo lies in,
  exactly as it is written on disk. Nothing else names it: no album, no tag, no EXIF field.
- **The albums take turns.** An album is a top-level folder of `photo_dir`. Each time the photos
  page comes round, the next album of the running cycle shows, then the next event inside it, then
  up to five of that event's photos not yet shown (the Photos page's count), ten seconds each.
  Every album comes once per cycle, however many events or photos it holds, and every photo of an
  event comes before any comes again.
- **The date comes from the photo** (EXIF "date taken"), and only when it has none from the file's
  modification time.

## Where the photos live

`photo_dir` (default `/config/www/ramka`) is a folder inside Home Assistant's `www` directory.
Inside it, put folders of JPEGs, at any depth:

```
/config/www/ramka/
  2026/
    07/
      Lake trip/            event "Lake trip"
        IMG_1001.jpg
        IMG_1002.jpg
    08/
      Grandma's birthday/   event "Grandma's birthday"
  Summer 2025/              event "Summer 2025"
  a.jpg                     never shown: a photo directly in photo_dir belongs to no event
```

Counted as an event: every folder that holds at least one `.jpg` or `.jpeg` directly. A folder that
holds only other folders (`2026/`, `07/` above) is no event and never shown by itself. Left out:

- photos directly in `photo_dir` (the top level);
- other formats: HEIC, PNG, WebP, video. Convert them to JPEG first (a phone's "most compatible"
  export, or any converter);
- hidden files and folders (a name starting with `.`) and folders starting with `@`, such as a
  Synology's `@eaDir` thumbnails;
- from the captions only: a file Pillow cannot open (damaged, or not really a JPEG) gets no index
  entry; it can still be drawn and then shows without a caption, or not at all.

## Event names come from the file system

The name on screen is the last part of the folder's path, as it is: `2026/07/Lake trip` shows
`Lake trip`. So:

- **Name the folder the way it should read**, with spaces, capitals and diacritics (`Urodziny
  babci`, `Wakacje w Grecji`). `lake-trip` shows `lake-trip`: hyphens and underscores are not
  turned into spaces, and nothing is translated.
- The parent folders only sort the files. A year or a date in the folder name is not needed for
  the caption: the date is shown anyway, from the photo.
- Two folders with the same name in different places (`2025/07/Summer`, `2026/07/Summer`) are two
  events with the same caption.
- Renaming a folder renames the event from the next index rebuild (below) on.
- The whole path of a photo, `<folders>/<file>`, must stay within 255 characters (the length of the
  helper that holds it). For a longer one Home Assistant logs `Invalid value` and the photo before
  it stays on screen for those 10 seconds.

## How the draw works

The ambient rotation runs climate → air → plants → photos → status, each page that the home has.
On the photos page, the loop calls `shell_command.<prefix>_pick`, which runs `ramka_pick.py`. It
lists every event folder (as above) and groups them by album, the top-level folder they lie in
(`2026/07/Lake trip` is in album `2026`; `Summer 2025/` is an album of one event). With albums
chosen on the settings dashboard's Photos page, only those count. Then it keeps three cycles:

1. **Albums.** It takes an album not yet shown in the running cycle, at random among those left.
   Once every album has had its turn, a new cycle starts, leaving out the album shown last, so no
   album comes twice in a row (unless it is the only one).
2. **Events in that album.** The same way: an event of the album not yet shown in the album's own
   cycle. An album with one event shows that one each time.
3. **Photos of that event.** Up to the Photos page's count (default 5) of the event's photos not
   yet shown in its cycle, in random order. When fewer are left, they are shown and the series is
   topped up from the event's next cycle, so a series holds the full count whenever the event has
   that many photos, and no photo twice.

The cycles are kept in `.ramka_rotation.json` next to `photo_dir` (for `/config/www/ramka`:
`/config/www/.ramka_rotation.json`). A folder or photo added mid-cycle joins the running cycle; a
removed one drops out; deleting the file starts every cycle anew.

The loop then shows the series for 10 seconds per photo, the page cross-fades from one to the
next, and the rotation moves on. One pass of the whole rotation with all five pages is 130
seconds, so a photo series comes about every two minutes while the tablet is in ambient mode;
fewer pages (an absent input, `status_page: false`) make the pass, and the wait for the next
series, shorter.

What follows from that:

- **Every album has the same share of series.** With 90 albums, each comes once in every 90
  series, so a full album cycle takes 90 photo pages (about three hours of ambient mode at one
  series every two minutes).
- **A big event takes several turns to show all its photos.** An event of 100 photos, five per
  series, is fully shown after 20 of its album's turns; a small one repeats sooner. Album size
  does not change how often an album comes, only how long its photos last.
- To show an event more often, make it an album of its own (a top-level folder); to show it less
  often, move it into another album or out of `photo_dir`.
- An empty `photo_dir` (no event folder) skips the photos page.
- Nothing is drawn while the music view is on, the tablet is off or in controls mode: the loop
  only runs in ambient mode.

## The caption

The bottom-left corner shows two lines:

1. `<event> · <date>`, the date in the language of the Home Assistant user the tablet is signed in
   as (en, de, pl);
2. camera, lens, focal length, aperture, exposure time and ISO, each only when the photo's EXIF
   has it.

They come from `<photo_dir>/index.json`, which `ramka_index.py` writes (inside the Home Assistant
container, with its Pillow): one entry per photo with `event` (the folder's name), `date` (EXIF
DateTimeOriginal, else DateTime, else the file's modification time), size and the camera fields.

The index is rebuilt:

- when Home Assistant starts;
- every 15 minutes;
- when the folder sensor sees the number of photos one level down change;
- right away by the picker when a photo it drew is not in the index yet (a folder added since the
  last rebuild), so a new folder has its caption on first show.

The card reloads the index every 5 minutes, and at once when the photo on screen is not in its copy.

**Wrong date?** Photos that lost their EXIF (some messenger apps strip it, screenshots never had
it) fall back to the file's modification time, which is often the day the file was copied. Fix it
in the photo's EXIF ("date taken"); renaming the file does not help.

## Adding, removing, renaming

Copy a folder of JPEGs into `photo_dir` (a NAS share, `scp`, the file browser of the host). Nothing
to restart: the picker sees the folder on its next draw and indexes it then. Removing works the same
way. The Ramka's own files (`index.json`, `.ramka_rotation.json`) are rewritten by the scripts; do not
edit them.

## Who can see the photos

Home Assistant serves `/config/www` at `/local/` **without a login** (verified in the 2026.9.2
source: `/local` is registered as a static path, like the frontend's own files, and a static path
checks no authentication). Anyone who can reach the Home Assistant address can open
`<HA URL>/local/<photo_dir under www>/index.json`, which lists every photo's path, and then each
photo. At home that is everyone on the network; with a remote way in (a Cloudflare Tunnel, a
forwarded port, Nabu Casa) it can be anyone on the internet who guesses the folder name.

Choose the photos with that in mind, or keep remote access to people who already have the
address. (The image entity the tablet shows goes through Home Assistant's own login; the files
under `/local/` do not.)
