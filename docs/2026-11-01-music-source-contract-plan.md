# Music source contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** audio-sensor publishes what the selected music board can do, the board can be set to none,
and Ramka's Music page shows each setting only when the visual uses it and the sensor can feed it,
with the sensor's own settings on a sub-view and a preview that says when the Ramka falls back.

**Architecture:** audio-sensor's package gains a `—` option on the music source select and five
trigger-based template entities (the abilities). Ramka's templates reference those fixed entity ids
(the contract) in Home Assistant visibility conditions; no new card code beyond a test of the
existing fallback. Everything is rendered Jinja (`[[ ]]`, `[% %]`) into HA YAML.

**Tech Stack:** Jinja2 templates rendered by `tools/domosenso_render.py`; Home Assistant 2026.9
template entities, sections views, `subview: true`; pytest (`tests/test_audio_sensor_render.py`,
`tests/test_ramka_render.py`); node:test for cards.

**Spec:** `.ai/specs/SPEC-025-2026-11-01-music-source-contract.md`

## Global Constraints

- Entity ids, verbatim: `sensor.music_source` (unique_id `audio_sensor_music_source`),
  `binary_sensor.music_source_spectrum`, `binary_sensor.music_source_level`,
  `binary_sensor.music_source_rate`, `binary_sensor.music_source_calibration`
  (unique_ids `audio_sensor_music_source_<ability>`).
- `sensor.music_source` attributes: `interface: 1`, `capabilities`: a list in the order
  `spectrum, level, rate, calibration, gain`, only those the board has; state the area or `none`.
- The no-sensor option is the string `—` (U+2014), last in the source select.
- Spectrum ability: 31 values; rate ability: options include `eco`, `normal`, `fast`.
- No template may read the spectrum on every frame: the ability entities are trigger-based
  (HA start, a source select change, and `time_pattern` every minute); `test_alias_templates_stay_cheap` stays.
- An ability is "the board can", not "data now": an existing entity that is `unavailable` or `unknown` keeps its ability; a missing entity (no state object: `expand(e) | count == 0`) has none.
- Music visual select options: `classic`, then the input's visual, then the other; seed and reset default `classic`.
- Text in English; translations en, de, pl for every new key; no home data in the catalog.
- No version bump. Never edit a rendered file. `tools/check-all.sh` before the PR.

## Review Focus

1. HA start before the board is online (its entities `unavailable`): the abilities stay on, so the page does not collapse — pinned in Task 2.
2. A home with Ramka and `music_visual` but no audio-sensor (none of the five entities exist): only the always-rows show, and with spectrum the "no sensor" notice — pinned in Task 4 and Task 5.
3. `—` chosen while the rate is `fast`: the board left goes back to `normal`, and no call targets a select that `—` has none of — pinned in Task 1.
4. A fresh source select (`unknown`): read as the `music: true` board, not as none — pinned in Task 1.
5. The sub-view link in a second language goes to that language's settings path (`settings_paths`) — pinned in Task 6.

---

### Task 1: The no-sensor option on the music source (audio-sensor)

**Files:**
- Modify: `components/audio-sensor/templates/package.yaml.j2` (the `ordered` list and `board_map`/`lookup` macros ≈ lines 45-55; `input_select.audio_sensor_music_source` ≈ 120; the alias template sensors ≈ 145-220; automation `audio_sensor_music_spectrum_rate` ≈ 280-330; the `[% if source %]` guards)
- Modify: `components/audio-sensor/component.yaml` (the select's note), `README.md`, `UPGRADE.md` (an Unreleased section)
- Test: `tests/test_audio_sensor_render.py`

**Interfaces:**
- Produces: the select options `[music board, others in input order, "—"]`; with no `music: true` board, `["—", boards in input order]` and the aliases, select, script and automation rendered (today: none). A state `—` makes every alias `unavailable`; a state that is no option (`unknown`) reads the `music: true` board, or none when there is none.

- [ ] **Step 1: Write the failing tests**

```python
NONE = "—"

def test_music_source_select_ends_with_none(demo):
    assert demo["input_select"]["audio_sensor_music_source"]["options"] == ["Living room", "Kids' room", NONE]

def test_none_makes_every_alias_unavailable(demo):
    for uid in ("audio_sensor_music_spectrum", "audio_sensor_music_level", "audio_sensor_music_spl_offset", "audio_sensor_music_mic_gain"):
        t = templates(demo)[uid]
        assert evaluate(t.get("availability", "true"), {SELECT: NONE, LIVING: "1", LIVING_LEVEL: "-40"}) == "False", uid

def test_unknown_source_still_reads_the_music_board(demo):
    t = templates(demo)["audio_sensor_music_spectrum"]
    assert evaluate(t["state"], {SELECT: "unknown", LIVING: "-1,-2"}) == "-1,-2"

def test_no_music_board_renders_the_select_with_none_first(tmp_path):
    inputs = demo_inputs(); inputs["sensors"][0]["music"] = False
    package = render(tmp_path, inputs)
    assert package["input_select"]["audio_sensor_music_source"]["options"] == [NONE, "Living room", "Kids' room"]
    t = templates(package)["audio_sensor_music_level"]
    assert evaluate(t.get("availability", "true"), {SELECT: "unknown", LIVING_LEVEL: "-40"}) == "False"

def test_rate_goes_back_to_normal_and_sends_nothing_for_none(demo):
    # run the automation (rate_automation, run_template) with from_state "Living room", to_state "—", rate "fast":
    # one select_option normal on the Living room board's select, no call with an empty or "—" target.
```

Replace `test_no_music_board_no_select` and adjust `test_one_board_one_option` (`["Living room", NONE]`) and `test_music_source_select_options` (trailing `NONE`).

- [ ] **Step 2: Run them to see them fail** — `uv run pytest -q tests/test_audio_sensor_render.py` → the five new tests FAIL.
- [ ] **Step 3: Implement.** `board_map(field)` gains no entry for `—`; `lookup(field)` returns `""` for `—`, and its default for a state that is no option is the music board's value or `""`; each alias gets `availability: "{{ <lookup> != '' and has_value(<lookup>) }}"` (keep the existing availability logic if there is one, ANDed). The rate automation's per-board action is skipped when the board's select id is `""`. Keep `test_alias_templates_stay_cheap` passing (two `states(` in the spectrum alias's state).
- [ ] **Step 4: Run** `uv run pytest -q tests/test_audio_sensor_render.py` → PASS.
- [ ] **Step 5: Docs and commit:** manifest note "options: the boards, then — (no sensor)"; README "Music source"; UPGRADE: "`—` added at the end; a home without a `music: true` board now gets the select". `git commit -m "audio-sensor: a no-sensor option on the music source"`

### Task 2: The abilities (audio-sensor)

**Files:**
- Modify: `components/audio-sensor/templates/package.yaml.j2` (a new trigger-based `template:` block after the aliases)
- Modify: `components/audio-sensor/component.yaml` (`provides.entities`), `README.md` ("The music source contract", the alias table of SPEC-025), `UPGRADE.md`
- Test: `tests/test_audio_sensor_render.py`

**Interfaces:**
- Consumes: Task 1's `lookup(field)` (`""` for none).
- Produces: the five entities of Global Constraints. Binary sensors `on`/`off`, never `unavailable`.

- [ ] **Step 1: Write the failing tests** (extend `evaluate` with an `expand` stub: a listed entity, even `unavailable`, expands to one object; an unlisted one to none — add `expand` and `state_attr` to the stub env)

```python
ABILITY = {a: f"audio_sensor_music_source_{a}" for a in ("spectrum", "level", "rate", "calibration")}
RATE = "select.living_room_audio_sensor_living_room_spectrum_rate"
FULL = {SELECT: "Living room", LIVING: ",".join(["-50"] * 31), LIVING_LEVEL: "-40", RATE: "normal"}
RATE_ATTRS = {RATE: {"options": ["eco", "normal", "fast"]}}

@pytest.mark.parametrize("states, attrs, expected", [
    (FULL, RATE_ATTRS, {"spectrum": "on", "level": "on", "rate": "on", "calibration": "on"}),
    ({**FULL, LIVING: ",".join(["-50"] * 30)}, RATE_ATTRS, {"spectrum": "off", "level": "on", "rate": "on", "calibration": "on"}),
    ({**FULL, LIVING: "unavailable", LIVING_LEVEL: "unavailable", RATE: "unavailable"}, RATE_ATTRS, {"spectrum": "on", "level": "on", "rate": "on", "calibration": "on"}),
    ({SELECT: "Living room", LIVING_LEVEL: "-40"}, {}, {"spectrum": "off", "level": "on", "rate": "off", "calibration": "on"}),
    (FULL, {RATE: {"options": ["eco", "normal"]}}, {"spectrum": "on", "level": "on", "rate": "off", "calibration": "on"}),
    ({**FULL, SELECT: "—"}, RATE_ATTRS, {"spectrum": "off", "level": "off", "rate": "off", "calibration": "off"}),
])
def test_abilities(demo, states, attrs, expected): ...

def test_music_source_sensor_names_the_board_and_its_abilities(demo):
    # state "Living room", attributes interface 1, capabilities ["spectrum","level","rate","calibration","gain"] for FULL plus the mic gain entity;
    # state "none", capabilities [] for "—".

def test_abilities_are_trigger_based_and_cheap(demo):
    # each of the five has triggers: homeassistant start, state of SELECT, time_pattern minutes "/1"; and no trigger on any spectrum entity.
```

- [ ] **Step 2: Run** → FAIL (entities missing).
- [ ] **Step 3: Implement** one `template:` item with those triggers, holding `sensor.music_source` and the four binary sensors; each reads its board entity via `lookup(...)`. `spectrum`: `expand(e)|count == 1 and (states(e) in ['unavailable','unknown'] or states(e).split(',')|count == 31)`; `level`: exists and (`unavailable`/`unknown` or `is_number`); `rate`: exists and `['eco','normal','fast']` ⊆ `state_attr(e,'options')`; `calibration`: the level expression; `gain` (attribute only): the mic-gain entity exists. Rendered only when the select is (every home with a board).
- [ ] **Step 4: Run** → PASS; `test_alias_templates_stay_cheap` still PASS.
- [ ] **Step 5: Docs and commit:** manifest entries for the five ids with SPEC-025; README section "The music source contract" (the alias table, the rule "an ability is what the board can do"). `git commit -m "audio-sensor: publish the music source's abilities"`

### Task 3: Classic by default (ramka)

**Files:**
- Modify: `components/ramka/templates/package.yaml.j2` (`input_select.<p>_music_visual` options ≈ line 286; `mv.update({'music_visual': music_visual})` ≈ the music_visual_options block)
- Modify: `components/ramka/component.yaml` (the input `music_visual` note and the select's entry), `README.md`, `UPGRADE.md`
- Test: `tests/test_ramka_render.py`

**Interfaces:**
- Produces: options `["classic", <input visual>, <other>]`; the settings default of `music_visual` is `classic`.

- [ ] **Step 1: Failing test** `test_music_visual_defaults_to_classic(demo)`: options `== ["classic", "spectrum", "level"]` for the demo (input spectrum); `run_reset(package, page="music")["input_select.ramka_music_visual"] == "classic"`; and the seed of an untouched music_visual group sets `classic`.
- [ ] **Step 2: Run** → FAIL. Update the tests that expect the input's visual first (`MUSIC_DEFAULTS` and similar) to `classic`.
- [ ] **Step 3: Implement** the order and the default.
- [ ] **Step 4: Run** `uv run pytest -q tests/test_ramka_render.py` → PASS.
- [ ] **Step 5: Docs and commit:** UPGRADE "Classic by default; a home's choice stays". `git commit -m "ramka: Classic is the default music visual"`

### Task 4: The Music page follows the visual and the sensor (ramka)

**Files:**
- Modify: `components/ramka/templates/ramka-settings.lang.yaml.j2` (the Music view: Basic, Advanced, Profile settings, Colour range, Calibration sections; `source_there`/`rate_there` ≈ line 65; the "Music sensor" card ≈ 419-460)
- Modify: `components/ramka/translations/{en,de,pl}.json`
- Test: `tests/test_ramka_render.py`

**Interfaces:**
- Consumes: Task 2's entity ids.
- Produces: two Jinja strings in the template, `needs_sensor` (V: visual `spectrum` or `level`) and `active` (A: `or` of (visual spectrum and `binary_sensor.music_source_spectrum` on) and (visual level and `binary_sensor.music_source_level` on)), used by Tasks 5 and 6. Translation keys `ui.settings.music_sensor_abilities` (the line's lead), `ui.settings.music_ability_{spectrum,level,rate,calibration}`, `ui.settings.music_sensor_no_data`.

- [ ] **Step 1: Failing test** — a helper `visible(conditions, states) -> bool` in the test file for HA visibility conditions (`state`, `state_not`, `and`, `or`; a missing entity's state is `unknown`), and

```python
@pytest.mark.parametrize("visual", ["classic", "spectrum", "level"])
@pytest.mark.parametrize("sensor", ["none", "level_only", "full", "no_audio_sensor"])
@pytest.mark.parametrize("advanced", ["on", "off"])
def test_music_page_rows_follow_visual_and_sensor(demo, visual, sensor, advanced): ...
```

Expected set of shown entities (walk sections → cards → rows with their visibility):
always `page_music`, `music_visual`, `audio_sensor_music_source` (except `no_audio_sensor`), `settings_advanced`;
with A also `music_template`, `music_palette`; with A and Advanced also the visual's flavour, `music_line_width_px`, the selected profile's rise/fall/hold/tilt, and with spectrum the EQ select and six gains; the colour pair of the visual only. Never on this page: `audio_sensor_music_spectrum_rate`, `audio_sensor_measured_offset`.
Also: the abilities line is a markdown card shown with sensor ≠ `—` whose content names each ability with its translation, or `music_sensor_no_data`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Rows that need A go in their own entities card with card visibility (entity-row conditions are not relied on for `and`/`or`); the EQ rows of every profile card get a spectrum visibility; the Calibration section and the Advanced "Music sensor" card are removed (Task 5 re-homes them).
- [ ] **Step 4: Run** → PASS, every language.
- [ ] **Step 5: Commit** `git commit -m "ramka: the Music page shows what the visual and the sensor can use"`

### Task 5: The preview's fallback notice (ramka)

**Files:**
- Modify: `components/ramka/templates/ramka-settings.lang.yaml.j2` (the Music Preview section; macro `music_notice()` used by Music and the sub-view), `components/ramka/templates/ramka-preview.lang.yaml.j2` / `dashboard.lang.yaml.j2` (the preview's Music tab)
- Modify: translations; Test: `tests/test_ramka_render.py`, `components/audio-sensor/cards/ambient-wave-card.test.mjs`

**Interfaces:**
- Consumes: Task 4's `needs_sensor`/`active`.
- Produces: macro `music_notice()` rendering four markdown cards with visibility; keys `ui.settings.music_notice_no_sensor`, `ui.settings.music_notice_no_spectrum`, `ui.settings.music_notice_no_level`, `ui.settings.music_notice_offline` with the spec's texts.

- [ ] **Step 1: Failing tests**
  - `test_music_notice_cases(demo)` over the spec's table: visual × sensor (`—`, level only, full) × alias (`unavailable`, data): exactly the expected notice is visible (none for A with data and for Classic), and the preview card shown is the classic one whenever a notice shows, the visual's otherwise.
  - Same for the preview dashboard's Music tab, and with `no_audio_sensor` → the no-sensor notice for spectrum.
  - `ambient-wave-card.test.mjs`: "an unavailable source draws the fallback": config `fallback: "classic"`, source entity `unavailable` → the classic renderer runs.
- [ ] **Step 2: Run** → FAIL (the card test may already pass: keep it as the pin).
- [ ] **Step 3: Implement** the macro and the classic preview under it (offline: the alias of the visual — `sensor.music_spectrum` or `sensor.music_level` — is `unavailable` while A).
- [ ] **Step 4: Run** → PASS; `node --test` in `components/audio-sensor/cards` and `components/ramka/cards` → 0 fail.
- [ ] **Step 5: Commit** `git commit -m "ramka: the preview says when the Ramka falls back to Classic"`

### Task 6: The sensor sub-view (ramka)

**Files:**
- Modify: `components/ramka/templates/ramka-settings.lang.yaml.j2` (a new view after Music), `components/ramka/templates/package.yaml.j2` (`reset_pages` gains `music_sensor`; the reset script sets `audio_sensor_music_spectrum_rate` to `normal` for that page only when the helper exists, as it does today for Music)
- Modify: translations, `README.md` (Settings, Music), `UPGRADE.md`
- Test: `tests/test_ramka_render.py`

**Interfaces:**
- Consumes: Task 2's ids, Task 4's `needs_sensor`/`active`, Task 5's macro `music_notice()` (the sub-view's preview calls it).
- Produces: view `path: music-sensor`, `subview: true`, `back_path: /<settings path of the language>/music`; the row on Music: a button row named `ui.settings.music_sensor_settings`, `tap_action: {action: navigate, navigation_path: /<settings path>/music-sensor}`, in a card shown while the source is not `—` and (`rate` or `calibration` on). Keys `ui.settings.music_sensor_settings`, `ui.settings.music_sensor_page` (the view's title), `ui.settings.music_sensor_reset`.

- [ ] **Step 1: Failing tests**
  - `test_sensor_subview(demo)`: the view exists per language with `subview: true` and the back path; rows: header markdown (area and abilities); the Music preview cards; `audio_sensor_music_spectrum_rate` shown with `rate` on; the calibration rows (measured offset, note, Apply) with `calibration` on; `sensor.music_mic_gain` with `gain` (a markdown or entity row shown while `sensor.music_mic_gain` is not `unavailable`); a reset button calling `script.ramka_settings_reset` with `page: music_sensor`, shown with `rate`.
  - `test_reset_music_sensor_sets_only_the_rate(demo)`: `run_reset(package, page="music_sensor") == {"input_select.audio_sensor_music_spectrum_rate": "normal"}`.
  - `test_sensor_settings_link_per_language(tmp_path)`: with `settings_paths: {en: ramka-settings, pl: ramka-settings-pl}` the pl link and back path use `/ramka-settings-pl/`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the view (sections view, `max_columns: 2` as the others; the header like the other pages' headers) and the link row.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "ramka: the music sensor's settings on a sub-view"`

### Task 7: Docs, checks and the prototype

**Files:** `.ai/specs/SPEC-025-…md` (Status: implemented on the branch), both `UPGRADE.md` (one Unreleased section each, listing SPEC-025's Compatibility), `components/ramka/README.md` (Settings, Music).

- [ ] **Step 1:** `bash tools/check-all.sh` → `all checks passed`.
- [ ] **Step 2:** In the home repository: `render ramka audio-sensor --catalog-dev /Users/docere/Dev/domosenso-music-source`, review the diff, commit there.
- [ ] **Step 3:** With the maintainer's go-ahead only: `snapshot production`, `deploy production --plan`, `--apply --allow-dirty --confirm <hash>`, `verify` now and after 10 minutes; then look at the Music page and the sub-view on the tablet with each visual and with the sensor set to `—`.
- [ ] **Step 4:** Commit the docs `git commit -m "SPEC-025: implemented; upgrade notes"`.
