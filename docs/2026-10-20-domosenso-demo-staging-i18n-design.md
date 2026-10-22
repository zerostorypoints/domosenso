# Domosenso: website demo, installable staging, English with translations — design

Status: approved in conversation with the maintainer on 2026-10-20, builder questions answered the same day;
not built. Follows the catalog pilot in
[pilot-bermuda-presence.md](pilot-bermuda-presence.md) and the research in
[research/2026-10-20-domosenso-architecture.md](research/2026-10-20-domosenso-architecture.md).
Statements marked **(my call)** are decisions made while writing, not by the maintainer; check them.
Validation notes from 2026-10-20 (the maintainer's priorities after stage 1, cut-over requirements for his home,
AI-first requirements, the Ramka player contract, operations log):
`2026-10-20-domosenso-validation-notes.md` (framework repo `docs/`; smarthome commit f567635). Read them
before planning stage 2, stage 3 or the cut-over.

## 1. Intent

People should see what a Domosenso home does before they own any hardware, and the people who
change a home should see the change before it reaches the house. The maintainer's starting point: "the basis
is a simulator where a user without hardware can check how it works". In the conversation the word
"simulator" was dropped for the installable part: it is **staging**, an environment that mirrors the
state of a home's configuration.

Everything a person reads is written in English, with translations; today the Ramka, its cards and
parts of the website mix Polish, German and English.

## 2. Who it is for — three moments

1. **A visitor on domosenso.com.** No hardware, no install. On the home page they switch between
   scenes of an illustrated house (Morning, Away, Sun, Wind, Rain, Home again, a new **Evening**,
   Night) and watch a wall tablet react in each, and they can tap the tablet as if it hung in front
   of them. A list shows the devices and mechanisms that are tested and ready, each with a photo, a
   description, what it does and the scenes it appears in.
2. **The maintainer, before changing a client's Ramka.** He has the client's home repo. One command starts
   Home Assistant on his laptop with the client's configuration and the client's current states,
   copied read-only from the client's HA. He changes the Ramka, looks at it at the tablet's real
   size, takes screenshots, and only then deploys. Nothing reaches the client's devices.
3. **A friend of the maintainer, before buying anything.** He has a NAS and a plan. He creates his
   home repo, picks components, starts the same staging, and drives it with the same scenes the
   website uses, or by switching states by hand. He sees his own Ramka and dashboards on his own
   rooms, and the list of hardware he is missing.

## 3. Goals, non-goals, anti-goals

Goals
- The website demo and the installable staging run the **same cards, the same scenes and the same
  catalog data**; a change in the catalog shows up in both.
- One source language (English) for every human-readable string; translations **en, de (de-CH), pl**;
  a missing translation falls back to English, never to a mix.
- Staging never touches production: no device commands, no writes to the mirrored HA.

Non-goals
- A full `domosenso` CLI (`update`, `eject`, lockfile resolution, version upgrades). Only what
  staging needs (§5.4).
- Polish on domosenso.com. The site stays en/de (my call, stated to the maintainer and not corrected).
- Real device emulation (no fake ESPHome nodes, no fake Zigbee); states are posted, services stubbed.
- Hosting a live Home Assistant for website visitors.
- Remote access to clients' Home Assistant. The commercial offer will need it — "something like
  Synology QuickConnect", which must let the maintainer configure a client's HA remotely to debug it (the maintainer,
  2026-10-20) — but it is its own project. Mirror mode here targets the maintainer's own home only; it takes
  the HA address and credentials as configuration so it can later run over that channel.

Anti-goals — it fails even if it technically works when:
- anything from the maintainer's own home (rooms, names, photos, entity ids, floor plan, calendars, family)
  appears on domosenso.com. The website repo's AGENTS.md forbids copying household configuration,
  identifiers, floor plans or private data into it;
- the demo tablet is a drawing that imitates the Ramka and drifts from the real one;
- a visitor or the first outside user sees half-translated screens;
- staging changes the state of a real house.

## 4. Constraints and current state

- HA runs as a Docker container (no add-ons/apps). Production here: 2026.9.2. Staging uses the
  home's pinned HA version.
- **Ramka today** (the home's `home-assistant/`): a dashboard of 928 lines (Polish labels on 50
  lines, home-specific entity ids), a package of 832 lines (modes, ambient loop, swipes, timers,
  brightness, Companion-app screen control), 13 custom cards in `www/`
  (~2,400 lines). The cards hold no entity ids, but hard-code Polish: day and month names
  (`agenda-card.js`), state words (`status-card.js`), weather conditions (`clock-weather-card.js`),
  hints (`tap-button-card.js`, `photo-frame-card.js`, `line-style-card.js`). The mode and page
  helpers have Polish option values that dashboards read: `input_select.<prefix>_mode`
  (`off, ambient, controls, kalendarz`), `input_select.<prefix>_ambient` (`temperatury,
  zdjecia, status` and later pages). The design behind it is in the home's repository.
- **Staging today** (`staging/` on main): `staging.py up | sync [--follow] | sim | shoot | page | down`;
  container `ha-staging` on 127.0.0.1:8124; dashboards, `www`, themes mounted read-only from the
  repo; the Ramka package copied in; production states posted over REST; `staging_stubs`
  custom component replaces services; simulator page at 1100 × 720 CSS px (the tablet's WebView,
  DPR 2) with a bar that writes radar and amplifier states. Hard-coded to this
  home: `PACKAGES`, `PAGES`, the production URL, the bar.
- **Website** (`~/BusinessProjects/domosenso-web`, private repo
  `zerostorypoints/domosenso-web`): Next.js 16 App Router, React 19, TypeScript strict, Tailwind,
  Jest, Playwright, Vercel. Routes `/de/` (default) and `/en/`. The scene section is
  `src/components/home-transformation.tsx` with copy in `src/lib/house-scenes.ts` (en/de per
  scene: label, condition, headline, text, states). Some strings are inline in components
  (e.g. the music bar: `locale === 'de' ? 'Musik · spielt' : …`). Its AGENTS.md: Swiss Standard
  German, `ss` for `ß`, no dialect; English authoring; no invented projects, testimonials or claims.
- **Catalog**: the pilot lives in this repo under `domosenso/` (one component, `bermuda-presence`),
  and its `example-home/` is the maintainer's real instance (family names, real rooms). The website's
  AGENTS.md reserves `~/BusinessProjects/domosenso` (empty today) for the future
  open-source framework and names the old all-in-one repository as the maintainer's home;
  both lines change with the repository layout in §5.1f.

## 5. Design

Three stages. Stage 1 first; stages 2 and 3 can then run in parallel (the maintainer agreed the order).

### 5.1 Stage 1 — catalog foundation

**a. Ramka becomes a catalog component, `ramka`, and so does everything it shows.** Its cards, the tablet logic and a dashboard
template move into the catalog in the component format from the pilot (manifest, managed artifacts,
a thin per-home instance). Home-specific parts become inputs: the radar presence and distance
entities, the media player, covers, light rooms, climate and air sensors, plant sensors, the photo
folder, the calendar, the tablet's Companion-app device. This home's Ramka is then an instance of
it, and must look and behave as it does today (checked with `staging.py shoot`, page by page,
before and after). Everything the Ramka shows today becomes a catalog component too, so the
website's list and the scenes have tested items to point at: awnings (ESPSomfy-RTS), lights (Hue
rooms), media (the Hegel through hegel_streaming), radar presence (the `bermuda-presence` radar
feature), climate and air (Tapo, Ruuvi Air), plants (Mi Flora), weather, calendar (the maintainer, 2026-10-20).

**b. English source text, translations en/de/pl.**
- Each card resolves its strings from a bundled dictionary per language, chosen from the HA user's
  language (`hass.locale.language`), falling back to `en`. Dates and numbers use `Intl` with that
  locale instead of hand-written day and month names. Weather and entity states use HA's own
  translations where HA provides them (`hass.formatEntityState`, `hass.localize`), the card's
  dictionary otherwise.
- **(my call)** The Ramka keeps HA's core cards (tiles, media control, sections view), because the
  website demo runs HA's own frontend (§5.3). HA does not translate YAML `name:`/`heading:` strings
  or template-entity names per user, so the component's dashboard template carries text keys, and
  the instance step renders one dashboard per language (en/de/pl) from them. Each tablet or HA user
  opens the dashboard of its language (the Ramka user here: pl). Custom cards resolve their own
  strings at runtime as above.
- Helper option values become English: `off, ambient, controls, calendar`;
  `climate, air, plants, photos, status`. For this home this is a breaking change of state values
  that dashboards and automations read; migrate in one step on staging, then production, and note it
  in the component's upgrade notes.
- Translations live next to the source as one file per language per component; `de` follows the
  website's rules (Swiss Standard German, `ss`). The maintainer reviews `pl`. **(my call)** `de` is written the
  way the website's German copy is today, and a missing key falls back to English rather than
  blocking a release; CI reports missing keys per language.
- The Ramka user here gets Polish by setting that HA user's language; the maintainer's own HA stays English.

**c. Scenes as catalog data.** One file per scene, used by staging and the website:
id, time of day, the states to post (entity → state, against the example home of §5.1e), what the
tablet should show (mode and page), the components and devices involved, and a short neutral name in
en/de/pl. **(my call)** The website keeps its own marketing copy per scene (headline, text, the
state lines) in `house-scenes.ts`, keyed by scene id; the catalog owns the data, the website owns
the sales voice. New scene: **Evening** (20:00, dinner, music; tablet on now-playing), placed
between Home again and Night. Proposed tablet per scene, accepted by the maintainer as a proposal: Morning —
ambient (clock, weather, temperature); Away — screen asleep; Sun — awnings out; Wind — notice
"awnings rolled in"; Rain — windows closed; Home again — radar wakes the screen, controls; Evening —
now playing; Night — dark screen. **Only tested things react** (the maintainer, 2026-10-20): the
tablet and the list show only components and devices that run in a home. Scenes whose hardware is
tested nowhere — Rain (motorised windows), the roller shutters in Away and Night — keep their
marketing copy on the website, which already labels them illustrative, with no tablet reaction and
no list items. Wind gets a real Ramka feature: a notice "awnings rolled in" when the awnings' wind
sensor (a `binary_sensor` through ESPSomfy-RTS) retracts them; it appears on the maintainer's own tablet as
well.

**d. Devices and mechanisms as catalog data.** Each device gets a record (photo, description in
en/de/pl, what it does, where to buy is out of scope); each component already names the devices it
needs. Scenes reference both. The website's list and staging's "what you are missing" are both
generated from this. Photos: the maintainer's own photos of the hardware or manufacturer images with a right
to use; nothing that shows a room of a real home. **(my call)** Until the maintainer supplies them, the list
ships with neutral placeholders; the builder does not pick product photos.

**e. A fictional example home.** Rooms with generic names (Living room, Dining, Kitchen, Office,
Bedroom, Kids' room, Hall), invented people, invented media (cover art, track names), photos for the
ambient rotation that are generic and licensed. **(my call)** Ambient photos and cover art come from
CC0 sources or are generated abstract images; their source is recorded next to each file. It is the configuration the website demo runs and
the default home for staging's scene mode. Nothing in it is derived from the maintainer's flat.

**f. Three repositories** (the maintainer, 2026-10-20). `smarthome` held everything; it is split:

| Repository | Folder | What it holds |
|---|---|---|
| `domosenso` | `~/Projects/domosenso` | the framework: catalog, tools, schemas, the fictional example home, framework docs. Private on GitHub, the first outside user as collaborator; public only after the licence (the research proposes Apache-2.0) and the trademark registration |
| the home repository | `~/LocalProjects/<home repository>` | The maintainer's home: everything home-specific from `smarthome` — HA config, ESPHome, services, staging, research and ideas for the future — as a Domosenso home repo |
| `domosenso-web` | `~/BusinessProjects/domosenso-web` | the commercial website, unchanged |

Nothing important from `smarthome` may be lost, and the maintainer's notes and ideas must stay reachable in
the home repository. **(my call)** The home repository starts as a clone of `smarthome` with its
full history, so every note, research file and past decision comes along; `smarthome` is archived
only after the split is verified and the maintainer agrees. Claude's project memory gets a copy under the new
folder, rewritten for the new layout. The pilot moves to `domosenso` with a fictional example home.
The `github://` URLs and the tag scheme `<component>/<version>` point at the `domosenso` repository.

**g. Manifest additions** (on top of the pilot's list in `domosenso/README.md`): per-component
description and photo keys, `scenes` it takes part in, translation files, and the device records.

### 5.2 Stage 2 — installable staging

Generalise `staging/staging.py` into the catalog's tooling, run as one command against a home repo
(working name `domosenso staging up | sim | shoot | down`).

- **Mirror mode (the maintainer, for now on his own home):** reads the home repo's pinned HA version and
  components, takes the HA's URL and a token (today: the NAS on the LAN), copies states, statistics and helper values as `sync` does today.
  The token is read-only in use: staging never calls services or writes to that HA. Client states
  stay on the laptop.
- **Scene mode (the first outside user, no hardware):** no production; states come from the scene files (§5.1c)
  mapped onto the home's own entities, plus a manual switch per entity. **(my call)** A scene written
  for the example home is mapped onto a real home through the component inputs (a scene says "the
  presence of the dining room", the instance says which entity that is). Rooms or devices a home does
  not have are skipped and listed.
- The simulator page keeps the tablet frame at the tablet's real size and the tap/swipe behaviour;
  the bar under it becomes a scene picker (and the current room/amplifier controls stay as manual
  switches).
- Runs in Docker on the laptop, never on the NAS. Stubs for every service as today.
- The UI of staging is English with de/pl translations.
- **Minimal home-repo setup** so the first outside user can start: create a home repo from a template, add a
  component and answer its inputs, write the instance files. No `update`/`eject`.
- **What you are missing:** from the chosen components' device requirements, a list of hardware
  per room.

### 5.3 Stage 3 — demo on domosenso.com

- **Layout A** in the existing scene section: illustration of the house on the left as today; on
  the right the headline, then the **tablet**, then the state lines shortened to one line. Every
  scene changes the house, the text and the tablet together. Mockup used in the conversation:
  scene tabs on top, the "Music · playing" bar under the house, a now-playing tablet in Evening.
- **The tablet is interactive** (as in mockup B): tap opens the controls, scroll/swipe changes the
  ambient page, at the tablet's aspect ratio (1100:720).
- **The tablet is HA's own frontend, built statically in demo mode** (the maintainer, 2026-10-20, on my
  recommendation): `home-assistant/frontend` (Apache-2.0) has a `demo/` build — the one behind
  demo.home-assistant.io — with demo home configs (`demo/src/configs`), stubs for the websocket API
  (`demo/src/stubs`), custom-card support and `script/build_demo`. A Domosenso config holds the
  fictional example home, the Ramka dashboard in en/de and the catalog's cards; the static output is
  embedded in the scene section at 1100:720 and loaded when the section comes into view. Service
  calls are answered in the browser (a tap on a light tile turns it on in the demo); nothing is shared
  between visitors and no server runs. Core cards, layout and HA's translations come with it, so the
  demo is the real Ramka (anti-goal 2). Cost accepted: a bundle of several MB, and the build follows
  HA versions.
- **(my call)** The tablet's behaviour lives in HA automations and scripts that the demo cannot run,
  so the demo does what a visitor can see: a scene sets the mode and page, a tap opens the controls,
  a swipe changes the ambient page, the controls go back to ambient after the hold time. The Ramka
  scripts the cards call (show controls, next/previous page) get small in-browser stand-ins; the
  rest of the package is not reimplemented.
- How the website gets the demo build and the catalog data — a pinned release of the catalog — is
  left to the builder; it must be pinned and carry no data from the maintainer's home.
- **Device and mechanism list** generated from the catalog: photo, description, what it does, the
  scenes it appears in; selecting a scene from an item switches the demo to it; a scene shows the
  items it uses.
- Languages en/de as the rest of the site, through the site's existing locale mechanism; strings
  currently inline in components move into the content files.
- Copy follows the site's AGENTS.md: illustrative scenarios, no claims of completed projects.

## 6. Decided by the maintainer

- A demo on domosenso.com in the browser, without install, as a sample implementation; and staging
  installed locally, mirroring the state of a home's configuration.
- The demo combines the existing house scene with the tablet; layout A; the tablet reacts to taps as
  in B; a new scene with music, Evening.
- The list: photo, description, what it does, which scenes it works in.
- Staging's two users: the maintainer before deploying Ramka changes at a client; the first outside user building his own
  system around his NAS and what he will buy.
- English everywhere, translations en, de, pl.
- One design document; stage 1 first, then 2 and 3 in parallel.
- The demo tablet is a static build of HA's frontend in demo mode.
- Only tested components and devices react in scenes and appear in the list; everything the Ramka
  shows becomes a component; Wind gets a real "awnings rolled in" notice.
- Three repositories: the framework in `~/Projects/domosenso` (private on GitHub, the first outside user as
  collaborator, public after licence and trademark), the maintainer's home in a home repository of its
  own (split from `smarthome`, nothing lost, memory rewritten),
  the website in `~/BusinessProjects/domosenso-web`.
- Mirror mode is built against the maintainer's own home; remote access to clients' HA (with remote
  configuration for debugging) is a separate project for the commercial offer.

## 7. Left to the builder

- Card i18n mechanics (dictionary format, plural rules via `Intl.PluralRules`), file layout of
  translations, the scene file format.
- Packaging of the staging command (language, how it is installed), as long as it runs on macOS with
  Docker and needs no HA add-ons.
- How the website consumes a pinned catalog release.
- The illustration changes for Evening (dusk, warm light in the dining room, music waves), in the
  site's existing style.
- Tests: card dictionaries complete for en/de/pl (CI fails on a missing key), `shoot` comparisons for
  this home's Ramka before/after stage 1, Playwright on the website demo in de and en, desktop and
  mobile.

## 8. Open questions

None blocking. Remote access to clients' HA is a separate project (§3, non-goals).
