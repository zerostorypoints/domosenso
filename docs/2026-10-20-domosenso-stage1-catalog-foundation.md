# Domosenso Stage 1 — Catalog Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private catalog repository in which the Ramka and everything it shows are components with English source text and en/de/pl translations, scenes and devices are data, a fictional example home renders and passes `check_config`, and the maintainer's own Ramka is rendered from the catalog and looks the same on staging.

**Architecture:** The framework repo `~/Projects/domosenso`; the author's home in a home repository of its own, split from the old all-in-one repository with its full history (Task 10). Each component holds a manifest, managed artifacts (cards, blueprints, Jinja templates) and `translations/{en,de,pl}.json`. A Python renderer turns a component's templates plus a home's inputs into HA files, writing one dashboard per language. Cards stay plain ES modules with no build step; they read their own runtime strings from the same JSON files, picking the language from the HA user. A Python checker validates manifests, scenes, devices and translation completeness. Stages 2 (staging) and 3 (website demo) get their own plans once this one has fixed the names below.

**Tech Stack:** Python 3.13 via `uv` (Jinja2, PyYAML, jsonschema, pytest, Pillow), Node 26 built-in test runner + happy-dom for cards, Docker image `homeassistant/home-assistant:2026.9.2` for `check_config`, `uvx esphome==2026.9.1`.

**Spec:** `docs/superpowers/specs/2026-10-20-domosenso-demo-staging-i18n-design.md` (smarthome repo), §5.1. Pilot findings: `domosenso/README.md` (same repo).

## Global Constraints

- Languages: `en` is the source; translations `de` (Swiss Standard German: `ss` never `ß`, no dialect) and `pl`. A missing key falls back to `en`, never to the key name or to another language.
- Nothing from the author's home goes into the catalog repo: no names of its people or rooms, no entity ids, IPs, photos, calendars or floor plans. The home's instance files live in the home's own repository. `tests/test_catalog_content.py::test_privacy` holds the list of words that must not appear.
- Catalog repo is private. No LICENSE file; README says "All rights reserved — licence not chosen yet (Apache-2.0 proposed)".
- Pinned versions: HA `2026.9.2`, ESPHome `2026.9.1`. HA runs as a Container: no add-ons/apps.
- Entity ids and helper option values are English. Ramka mode options: `off, ambient, controls, calendar`. Ambient pages, in rotation order: `climate, air, plants, photos, status`.
- Cards: plain ES modules loaded as Lovelace `module` resources; JSON imported with `import … with { type: "json" }`; no bundler.
- Nothing is deployed to production HA, the live tablet or any ESPHome device without the maintainer's explicit go-ahead in chat. Staging (`ha-staging`, :8124) only.
- After migration, the maintainer's Ramka must look and behave as before, apart from the intended changes (English helper values, the Wind notice).

## Review Focus

1. **Locale variants** — an HA user language of `de-CH`, `pl-PL`, `en-GB` or `fr` must give `de`, `pl`, `en`, `en`. Test in Task 3.
2. **A key missing in `pl` or `de`** must show the English text, never `card.status.on`. Test in Task 3; checker reports it (Task 2).
3. **Polish plurals** — 1 minuta, 2 minuty, 5 minut, 22 minuty; German and English one/other. Test in Task 3.
4. **The week across the DST change** — the agenda must show Sat 24, Sun 25, Mon 26 Oct 2026 once each (the bug staging caught on 2026-10-20). Test in Task 4.
5. **Inputs with diacritics or YAML-special characters** (`Kids' room`, `Łazienka: dzieci`, `"quoted"`) must render into valid YAML that round-trips the exact string. Test in Task 7.

---

## File structure (new repo `~/Projects/domosenso`)

```
README.md  .gitignore  pyproject.toml  package.json
schemas/component.schema.json  schemas/scene.schema.json  schemas/device.schema.json
tools/catalog_check.py          validation (Task 2)
tools/domosenso_render.py       instance renderer (Task 7)
tools/esphome-check.sh tools/ha-check.sh   from the pilot (Task 1)
tests/                          pytest for tools; node tests next to cards
components/<id>/component.yaml
components/<id>/translations/{en,de,pl}.json   keys: meta.* (catalog text), ui.* (dashboard labels), card.* (card runtime)
components/ramka/cards/*.js     cards; cards/lib/i18n.js shared helper; cards/*.test.mjs
components/ramka/templates/package.yaml.j2            the tablet logic
components/ramka/templates/dashboard.lang.yaml.j2     rendered once per language
components/bermuda-presence/…   moved from the pilot
devices/<id>/device.yaml (+ photo.jpg when the maintainer supplies one)
scenes/<id>.yaml
examples/demo-home/inputs/<component>.yaml   examples/demo-home/states.yaml   examples/demo-home/media/ (+ SOURCES.md)
```

---

### Task 1: Catalog repository with the pilot moved in

**Files:**
- Create: `~/Projects/domosenso/{README.md,.gitignore,pyproject.toml,package.json}`
- Create: `components/bermuda-presence/**` copied from `smarthome/domosenso/components/bermuda-presence/`, with `example-home/` removed
- Create: `examples/demo-home/esphome/ble-proxy-{living-room,dining}.yaml`, `examples/demo-home/inputs/bermuda-presence.yaml`, `examples/demo-home/ha/packages/bermuda_presence.yaml`
- Create: `tools/esphome-check.sh`, `tools/ha-check.sh` (from the pilot)
- Create: `docs/` — the framework's own documents copied from the smarthome branch `claude/domosenso-pilot-750b03`: `research/2026-10-20-domosenso-architecture.md`, the pilot README (as `docs/pilot-bermuda-presence.md`), this spec and this plan. Strip household detail from the pilot README (room names, people) or summarise it; the privacy grep in Step 5 applies to `docs/` too

**Interfaces:**
- Produces: the repo layout above; `tools/esphome-check.sh <component> [compile <file>…]` and `tools/ha-check.sh <component>` now read the instance from `examples/demo-home/` instead of `components/<id>/example-home/`.

- [ ] **Step 1:** `git init` the repo; `pyproject.toml` declares dev dependencies `jinja2`, `pyyaml`, `jsonschema`, `pytest`, `pillow`; `package.json` declares devDependency `happy-dom` and script `"test": "node --test components/"`.
- [ ] **Step 2:** Copy the pilot component, drop `example-home/`, and write the demo-home instance with the fictional people Alex and Sam (phones `sensor.alex_phone_area`, `sensor.sam_phone_area`, tablet `sensor.family_tablet_area`) and rooms Living room, Dining, Kitchen, Office, Bedroom, Kids' room, Hall. Proxies in `living-room` and `dining` (dining with `radar`).
- [ ] **Step 3:** Point both scripts at `examples/demo-home/`; `tools/ha-check.sh` drops the "home before/after" part (no real home here) and keeps the `fresh` check plus the blueprint-log counting.
- [ ] **Step 4: Verify** — `tools/esphome-check.sh bermuda-presence` prints `config ok` for every demo-home device file; `tools/ha-check.sh bermuda-presence` prints `fresh: 0 errors` and exits 0.
- [ ] **Step 5: Privacy grep** — a grep for the household's names, rooms and its LAN's address range returns nothing outside `.git/` (now `tests/test_catalog_content.py::test_privacy`).
- [ ] **Step 6: Commit** `Catalog repository with bermuda-presence and a fictional demo home`.
- [ ] **Step 7: Website AGENTS.md** — in `~/BusinessProjects/domosenso-web`, on a branch, change the line that reserves `~/BusinessProjects/domosenso` (or the reserve line without a path) to `~/Projects/domosenso` (spec §4, §5.1f), and the line naming the old all-in-one repository as the author's home to the new home repository; commit there, no push.
- [ ] **Step 8: GitHub** — ask the maintainer in chat which owner (personal or `zerostorypoints`) and for the go-ahead; then `gh repo create <owner>/domosenso --private --source . --push`. The maintainer adds the first outside user as collaborator himself (his GitHub handle is not known here).

---

### Task 2: Catalog checker

**Files:**
- Create: `schemas/{component,scene,device}.schema.json`, `tools/catalog_check.py`
- Test: `tests/test_catalog_check.py`, fixtures under `tests/fixtures/`

**Interfaces:**
- Produces:
  - `check_component(path: Path) -> list[str]` — schema plus every artifact path existing;
  - `check_translations(component_dir: Path) -> tuple[list[str], list[str]]` — errors (key in `de`/`pl` absent from `en`; invalid JSON) and warnings (key in `en` missing from `de`/`pl`);
  - `check_scene(path: Path, catalog: Path) -> list[str]` — schema, referenced components/devices exist, `tablet.mode` in the Ramka mode options, `tablet.page` in the ambient pages;
  - `check_device(path: Path) -> list[str]`;
  - `scenes_for(catalog: Path) -> dict[str, list[str]]` — component or device id → scene ids that reference it. Decision: the spec's "scenes it takes part in" is derived from the scene files, not written into manifests, so the two cannot disagree;
  - CLI `uv run tools/catalog_check.py [--strict]` exits 1 on any error, and with `--strict` on warnings too.
- Schema fields:
  - component additions over the pilot: `description_key: str` (a `meta.*` key), `photo: str|null`;
  - scene: `id`, `time` (`HH:MM`), `names: {en,de,pl}`, `states: {entity_id: state}`, `tablet: {mode, page?} | null`, `components: [id]`, `devices: [id]`;
  - device: `id`, `names: {en,de,pl}`, `description_key`, `does_key`, `photo: str|null`, `component: id`.

- [ ] **Step 1: Write failing tests:**
  - `test_valid_fixture_has_no_errors`;
  - `test_missing_artifact_path_is_error` (asserts the message contains the path);
  - `test_pl_key_absent_from_en_is_error`;
  - `test_en_key_missing_in_de_is_warning_not_error` (Review Focus 2);
  - `test_scene_unknown_component_is_error`;
  - `test_scene_page_must_be_ambient_page` (`page: temperatury` fails, `page: climate` passes);
  - `test_scenes_for_derives_reverse_index`.
- [ ] **Step 2:** `uv run pytest tests/test_catalog_check.py -v` → all FAIL (module missing).
- [ ] **Step 3:** Implement the functions above with `jsonschema` (Draft 2020-12) and PyYAML; translation keys are flattened to dot paths.
- [ ] **Step 4:** Tests PASS. `uv run tools/catalog_check.py` on the repo exits 0. Add `translations/` for bermuda-presence (meta keys only) to get there.
- [ ] **Step 5: Commit** `Catalog checker: schemas, artifact paths, translation completeness, scene references`.

---

### Task 3: Card i18n helper

**Files:**
- Create: `components/ramka/cards/lib/i18n.js`
- Test: `components/ramka/cards/lib/i18n.test.mjs`

**Interfaces:**
- Produces (ES module exports):
  - `language(hass) -> "en"|"de"|"pl"` from `hass.locale.language`, falling back to `hass.language`, then `"en"`;
  - `createT(dicts: {en, de?, pl?}) -> (hass, key: string, vars?: object) => string` — dot-path lookup, `{name}` interpolation, fallback to `en`, then to `key` only when `en` lacks it too;
  - `plural(hass, count: number, forms: {one?, few?, many?, other}) -> string` via `Intl.PluralRules(language(hass))`, `{count}` interpolated;
  - `formatDate(hass, date: Date, options: Intl.DateTimeFormatOptions) -> string` via `Intl.DateTimeFormat` with locale `{en: "en-GB", de: "de-CH", pl: "pl-PL"}[language(hass)]`.

- [ ] **Step 1: Write failing tests** with a fake `hass = { locale: { language } }`:
  - `language` maps `de-CH→de`, `pl-PL→pl`, `en-GB→en`, `fr→en`, missing locale → `en` (Review Focus 1);
  - `t` returns `pl` text when present, `en` text when the `pl` key is missing (Review Focus 2), and interpolates `{name}`;
  - `plural` in `pl` gives `1 minuta`, `2 minuty`, `5 minut`, `22 minuty` (Review Focus 3); in `de` gives `1 Minute`, `2 Minuten`;
  - `formatDate(pl, 2026-10-25, {weekday: "long"})` is `niedziela`.
- [ ] **Step 2:** `node --test components/ramka/cards/lib/` → FAIL.
- [ ] **Step 3:** Implement `i18n.js` (no imports, no DOM).
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5: Commit** `Ramka cards: i18n helper (language, t, plural, formatDate)`.

---

### Task 4: Date and time cards — agenda, clock-weather

**Files:**
- Create: `components/ramka/cards/{agenda-card.js,clock-weather-card.js}` (from `smarthome/home-assistant/www/` on `origin/main`)
- Create/modify: `components/ramka/translations/{en,de,pl}.json` (`card.agenda.*`, `card.clock.*`)
- Test: `components/ramka/cards/{agenda-card,clock-weather-card}.test.mjs`

**Interfaces:**
- Consumes: Task 3 exports.
- Produces: the same element names and config keys as today (`custom:agenda-card`, `custom:clock-weather-card`), so dashboards need no change beyond translations.

- [ ] **Step 1: Write failing tests** (happy-dom window; card created, `setConfig`, `hass` set with the fake locale and fixed states/forecast/calendar responses):
  - `agenda` in `pl` on 2026-10-24 renders the day headers Sat 24, Sun 25 and Mon 26 October, each once, in order (Review Focus 4);
  - `agenda` with an all-day event shows `cały dzień` in `pl` and `ganztägig` in `de`;
  - an untitled event shows the `card.agenda.untitled` text per language;
  - `clock-weather` shows the condition `partlycloudy` as `Częściowe zachmurzenie` in `pl` and `Partly cloudy` in `en`;
  - neither card's rendered text contains a Polish word when the language is `en`.
- [ ] **Step 2:** Tests FAIL.
- [ ] **Step 3:** Replace `DAYS`, `DAYS_SHORT`, `MONTHS` with `formatDate`. Prefer `hass.formatEntityState(weatherEntity)` for the condition when HA provides it, else `card.clock.condition.<state>`. Move the remaining literals to `card.*` keys with `en`, `de`, `pl` values.
- [ ] **Step 4:** Tests PASS; `uv run tools/catalog_check.py --strict` exits 0.
- [ ] **Step 5: Commit** `Ramka cards: agenda and clock-weather in English with de/pl`.

---

### Task 5: State and label cards — status, tap-button, rooms, plants, air, mains

**Files:**
- Create: `components/ramka/cards/{status-card,tap-button-card,rooms-card,plants-card,air-card,mains-card}.js`
- Modify: `components/ramka/translations/*.json` (`card.status.*`, `card.plants.*`, `card.air.*`, …)
- Test: one `*.test.mjs` per card

**Interfaces:**
- Consumes: Task 3. Produces: unchanged element names and config keys. A per-item `states:` map in a card's config still overrides the defaults, so rendered dashboards can pass labels.

- [ ] **Step 1: Write failing tests**, per card:
  - `status`: `cover` in `open` renders `Open` (en), `Offen` (de), `Otwarte` (pl); a config `states: {open: X}` wins over the default;
  - `plants`: a plant that needs nothing shows no text (the 2026-10-20 behaviour, commit `bfdf268`); a dry plant shows the `card.plants.water` text per language;
  - `air`: the level names per language;
  - `tap-button`: its hint text per language;
  - `rooms`, `mains`: no hard-coded Polish in `en`.
- [ ] **Step 2:** Tests FAIL.
- [ ] **Step 3:** Move every literal to `card.*` keys. `DEFAULT_LABELS` in `status-card` becomes a lookup of `card.status.<state>`.
- [ ] **Step 4:** Tests PASS; `catalog_check --strict` exits 0.
- [ ] **Step 5: Commit** `Ramka cards: status, tap-button, rooms, plants, air, mains in English with de/pl`.

---

### Task 6: Remaining cards and the no-literals lint

**Files:**
- Create: `components/ramka/cards/{now-playing-card,photo-frame-card,line-style-card,corner-taps-card}.js`
- Test: their `*.test.mjs`, plus `components/ramka/cards/no-literals.test.mjs`

**Interfaces:**
- Produces: unchanged element names and config keys. `corner-taps-card` keeps its config shape; its examples in comments use the generic prefix `ramka_` instead of the home's own prefix.

- [ ] **Step 1: Write failing tests:**
  - `no-literals`: every `cards/*.js` (excluding `lib/`) has no string literal containing `[ąćęłńóśźżäöüß]`, and every `t(…, "key")` it calls exists in `translations/en.json`;
  - `now-playing`: idle and paused labels per language;
  - `photo-frame`: its empty-folder message per language.
- [ ] **Step 2:** Tests FAIL.
- [ ] **Step 3:** Port the cards as in Tasks 4–5.
- [ ] **Step 4:** `npm test` passes all card tests; `catalog_check --strict` exits 0.
- [ ] **Step 5: Commit** `Ramka cards: now-playing, photo-frame, line-style, corner-taps; lint for literals`.

---

### Task 7: Instance renderer

**Files:**
- Create: `tools/domosenso_render.py`
- Test: `tests/test_render.py`, fixture component `tests/fixtures/render-comp/`

**Interfaces:**
- Produces:
  - `render_component(component_dir: Path, inputs: dict, out_dir: Path, langs: list[str] = ["en","de","pl"]) -> list[Path]`:
    - every `templates/*.j2` renders to `out_dir/<name without .j2>`;
    - `*.lang.yaml.j2` renders once per language to `<name>.<lang>.yaml`;
  - Jinja globals: `t(key)` (current language with `en` fallback, from `translations/`), `inputs`, `lang`; filter `yaml` (a YAML-safe scalar, `json.dumps` with `ensure_ascii=False`);
  - CLI `uv run tools/domosenso_render.py <component_dir> --inputs <yaml> --out <dir> [--lang en,de,pl]`;
  - `StrictUndefined`: an input the template uses but the file lacks is an error naming it.

- [ ] **Step 1: Write failing tests:**
  - `test_lang_template_renders_once_per_language` (3 files, `ui.title` text differs);
  - `test_missing_input_names_it`;
  - `test_missing_pl_key_falls_back_to_en`;
  - `test_yaml_filter_round_trips` for `Kids' room`, `Łazienka: dzieci`, `"quoted"` (`yaml.safe_load` of the output equals the input; Review Focus 5);
  - `test_plain_template_renders_once`.
- [ ] **Step 2:** `uv run pytest tests/test_render.py -v` → FAIL.
- [ ] **Step 3:** Implement with Jinja2 `Environment(undefined=StrictUndefined, keep_trailing_newline=True)`.
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5: Commit** `Instance renderer: Jinja templates, per-language dashboards, YAML-safe inputs`.

---

### Task 8: Ramka templates — package and dashboard

**Files:**
- Create:
  - `components/ramka/component.yaml`;
  - `components/ramka/templates/package.yaml.j2` (from the home's Ramka package);
  - `components/ramka/templates/dashboard.lang.yaml.j2` (from `…/dashboards/ramka.yaml`);
  - `examples/demo-home/inputs/ramka.yaml`.
- Create: `components/ramka/UPGRADE.md` — first entry: helper option values renamed (`kalendarz→calendar`, `temperatury→climate`, `powietrze→air`, `rosliny→plants`, `zdjecia→photos`), entity prefix now an input, and what an existing home must change (spec §5.1b)
- Modify: `components/ramka/translations/*.json` (`ui.*`)
- Test: `tests/test_ramka_render.py`

**Interfaces:**
- Consumes: Task 7 `render_component`; the cards from Tasks 4–6.
- Produces:
  - the inputs schema (in `component.yaml` `inputs:`):
    - `prefix` (entity id prefix; demo: `ramka`);
    - `radar.presence`, `radar.distance`;
    - `media_player`, `media_service_sensor`;
    - `covers: [{entity, label}]`, `wind_sensor`;
    - `lights: [{entity, label}]`;
    - `climate: [{label, temperature, humidity}]`, `air: {…}`, `plants: [{entity, label}]`;
    - `weather`, `calendar`, `photo_dir`;
    - `tablet_device` (Companion app notify service and sensors);
  - entity ids `input_select.<prefix>_mode` (options `off, ambient, controls, calendar`) and `input_select.<prefix>_ambient` (`climate, air, plants, photos, status`), and every other helper, script and automation as today with the home's prefix replaced by `<prefix>_`;
  - **Wind notice**: a dashboard banner `ui.wind.awnings_rolled_in`, visible while `inputs.wind_sensor` is `on`, on the ambient and controls sections.

- [ ] **Step 1: Write failing tests:**
  - `test_demo_renders_three_dashboards_and_package`;
  - `test_no_polish_option_values` (rendered package contains no `kalendarz|temperatury|powietrze|rosliny|zdjecia`);
  - `test_mode_and_page_options_exact` (the two option lists above, in that order);
  - `test_wind_banner_present_and_bound` (the condition entity equals `inputs.wind_sensor`);
  - `test_pl_dashboard_has_no_english_ui_labels` (every `ui.*` value in `pl.json` that differs from `en.json` appears in place of the English one).
- [ ] **Step 2:** Tests FAIL.
- [ ] **Step 3:** Turn the two files into templates:
  - home-specific entities → inputs; repeated tiles → loops over `inputs.lights` / `inputs.covers` / `inputs.climate`;
  - every `name:` / `heading:` / button label → `{{ t('ui.…') | yaml }}` or `{{ item.label | yaml }}`;
  - option values renamed throughout, including every `state:` / `state_not:` visibility condition and every `select_option`.
- [ ] **Step 4:** Tests PASS. Render the demo home to a temp dir. Run `tools/ha-check.sh ramka` (extend it to render `examples/demo-home/inputs/<component>.yaml` before checking) → `fresh: 0 errors`.
- [ ] **Step 5: Commit** `Ramka component: package and dashboard templates, English helper values, Wind notice`.

---

### Task 9: The other components, devices, scenes and the demo home's data

**Files:**
- Create `components/{awnings,lights,media,climate-air,plants,weather,calendar}/component.yaml` with their `translations/`. Sources:
  - awnings: ESPSomfy-RTS (`smarthome/espsomfy/`, `packages/awnings.yaml`);
  - lights: Hue rooms;
  - media: Hegel via `hegel_streaming`;
  - climate-air: Tapo sensors, Ruuvi Air;
  - plants: Mi Flora;
  - weather: Met.no;
  - calendar: CalDAV.
- Create `devices/{m5stack-atom-lite,hlk-ld2410c,cc1101,ruuvi-air,mi-flora,tapo-t315,hue-bridge,hegel-h400}/device.yaml`.
- Create `scenes/{morning,away,sun,wind,rain,home,evening,night}.yaml`.
- Create `examples/demo-home/states.yaml`, `examples/demo-home/media/` and `media/SOURCES.md`.
- Test: `tests/test_catalog_content.py`

**Interfaces:**
- Consumes: Task 2 schemas and `scenes_for`; Task 8 mode/page names and demo-home entity ids.
- Produces: scene files that stages 2 and 3 read. Tablet per scene, exactly:

| scene | time | tablet |
|---|---|---|
| morning | 07:00 | `{mode: ambient, page: climate}` |
| away | 08:30 | `{mode: off}` |
| sun | 13:00 | `{mode: ambient, page: status}` (awnings out) |
| wind | 16:00 | `{mode: ambient, page: climate}` (wind sensor `on` → banner) |
| rain | 18:00 | `null` |
| home | 17:30 | `{mode: controls}` |
| evening | 20:00 | `{mode: ambient}` (media `playing` → now-playing) |
| night | 22:00 | `{mode: off}` |

  Rain lists no components (motorised windows are tested nowhere). Away and Night list no roller shutters.

- [ ] **Step 1: Write failing tests:**
  - `test_all_eight_scenes_valid`;
  - `test_rain_has_no_tablet_and_no_components`;
  - `test_every_device_belongs_to_a_component`;
  - `test_every_scene_entity_exists_in_demo_states`;
  - `test_media_sources_listed` (every file in `media/` has a line in `SOURCES.md` naming a CC0 source or "generated");
  - `test_privacy` (the Task 1 grep pattern finds nothing in `scenes/`, `devices/`, `examples/`).
- [ ] **Step 2:** Tests FAIL.
- [ ] **Step 3:** Write the files.
  - Device photos stay `null` (placeholders) until the maintainer supplies them.
  - Descriptions are written in English with `de`/`pl` translations.
  - Ambient photos and cover art are CC0 or generated abstract images.
- [ ] **Step 4:** Tests PASS; `uv run tools/catalog_check.py --strict` exits 0.
- [ ] **Step 5: Commit** `Catalog data: components, devices, eight scenes, demo-home states and media`.

---

### Tasks 10 and 11: the author's home repository

Two tasks ran in the author's own home repository, not here, and their details stay there: Task 10
split the home's configuration out of its old repository with its full history (with a check that
no tracked, ignored or untracked file was lost); Task 11 rendered the home's Ramka from this
catalog (`tools/domosenso_render.py` with the home's inputs file), installed the cards from
`components/ramka/`, renamed the helper values per `components/ramka/UPGRADE.md`, and compared
staging screenshots page by page before and after (every page under 1 % of pixels changed, apart
from noise). Deploying it to the home's production Home Assistant waits for the author's go-ahead.
