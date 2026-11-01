"""The ramka component's package and dashboard templates, rendered for the demo home."""
import copy
import json
import re
from pathlib import Path

import pytest
import yaml

import domosenso_render as dr
from catalog_check import RAMKA_MODES, RAMKA_PAGES, flatten

REPO = Path(__file__).resolve().parent.parent
COMP = REPO / "components" / "ramka"
DEMO_INPUTS = REPO / "examples" / "demo-home" / "inputs" / "ramka.yaml"
LANGS = ["en", "de", "pl"]
OLD_POLISH_VALUES = re.compile(r"\b(kalendarz|temperatury|powietrze|rosliny|zdjecia)\b")


def demo_inputs() -> dict:
    return yaml.safe_load(DEMO_INPUTS.read_text(encoding="utf-8"))


def render(tmp_path, inputs) -> dict[str, object]:
    out = tmp_path / "out"
    dr.render_component(COMP, inputs, out)
    # libyaml: the pure-Python loader takes most of a render test's time on these files.
    return {p.name: yaml.load(p.read_text(encoding="utf-8"), Loader=yaml.CSafeLoader)
            for p in sorted(out.glob("*.yaml"))}


def texts(tmp_path, inputs) -> dict[str, str]:
    out = tmp_path / "text"
    dr.render_component(COMP, inputs, out)
    return {p.name: p.read_text(encoding="utf-8") for p in sorted(out.glob("*.yaml"))}


@pytest.fixture(scope="module")
def demo(tmp_path_factory):
    return render(tmp_path_factory.mktemp("demo"), demo_inputs())


def translations(lang: str) -> dict[str, str]:
    return flatten(json.loads((COMP / "translations" / f"{lang}.json").read_text(encoding="utf-8")))


def walk(node):
    """Every mapping in a YAML tree, depth first."""
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from walk(value)
    elif isinstance(node, list):
        for item in node:
            yield from walk(item)


def strings(node):
    """Every string value in a YAML tree (keys are configuration, not text on screen)."""
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for value in node.values():
            yield from strings(value)
    elif isinstance(node, list):
        for item in node:
            yield from strings(item)


def word(text: str) -> re.Pattern:
    """`text` as a whole word or phrase: 'normal' does not match inside 'normalne'."""
    return re.compile(rf"(?<!\w){re.escape(text)}(?!\w)")


def sections(dashboard):
    return dashboard["views"][0]["sections"]


def as_list(value):
    return value if isinstance(value, list) else [value]


# ---- the brief's five ----------------------------------------------------------------------


def test_demo_renders_three_dashboards_and_package(demo):
    # The preview is on by default (preview_dashboard: true).
    assert set(demo) == {"package.yaml", *(f"{name}.{lang}.yaml" for name in ("dashboard", "ramka-settings", "ramka-preview")
                                           for lang in LANGS)}
    package = demo["package.yaml"]
    for domain in ("input_select", "input_boolean", "input_number", "timer", "input_button", "script", "automation", "template"):
        assert package[domain], domain
    for lang in LANGS:
        dashboard = demo[f"dashboard.{lang}.yaml"]
        assert dashboard["views"][0]["type"] == "sections"
        assert len(sections(dashboard)) > 10


def test_no_polish_option_values(tmp_path):
    for name, text in texts(tmp_path, demo_inputs()).items():
        found = OLD_POLISH_VALUES.findall(text)
        assert not found, f"{name}: {found}"


def test_mode_and_page_options_exact(demo):
    selects = demo["package.yaml"]["input_select"]
    assert selects["ramka_mode"]["options"] == RAMKA_MODES
    assert selects["ramka_ambient"]["options"] == RAMKA_PAGES


def wind_banners(dashboard, wind_text):
    return [s for s in sections(dashboard) if wind_text in list(strings(s.get("cards", [])))]


def test_wind_banner_present_and_bound(demo):
    wind = demo_inputs()["wind_sensor"]
    for lang in LANGS:
        text = translations(lang)["ui.wind.awnings_rolled_in"]
        banners = wind_banners(demo[f"dashboard.{lang}.yaml"], text)
        assert len(banners) == 1, lang
        conditions = banners[0]["visibility"]
        assert {"condition": "state", "entity": wind, "state": "on"} in conditions
        mode = [c for c in walk(conditions) if c.get("entity") == "input_select.ramka_mode"]
        assert sorted(s for c in mode for s in as_list(c["state"])) == ["ambient", "controls"]


def test_pl_dashboard_has_no_english_ui_labels(demo):
    en, pl = translations("en"), translations("pl")
    shown = list(strings(demo["dashboard.pl.yaml"]))
    for key, pl_value in pl.items():
        # ui.settings.* label the settings dashboard (test_settings_dashboard_pages_per_language),
        # ui.preview.* the preview dashboard (test_preview_links_point_at_existing_settings_views).
        if not key.startswith("ui.") or key.startswith(("ui.settings.", "ui.preview.")) or pl_value == en[key]:
            continue
        assert any(word(pl_value).search(s) for s in shown), f"{key}: {pl_value!r} not in the pl dashboard"
        assert not any(word(en[key]).search(s) for s in shown), f"{key}: English {en[key]!r} in the pl dashboard"


# ---- beyond the brief ----------------------------------------------------------------------


def test_every_ui_key_has_en_de_pl():
    en, de, pl = translations("en"), translations("de"), translations("pl")
    ui = {k for k in en if k.startswith("ui.")}
    assert ui
    assert ui == {k for k in de if k.startswith("ui.")} == {k for k in pl if k.startswith("ui.")}
    assert not [k for k in ui if "ß" in de[k]]


def test_every_mode_and_page_reference_is_an_option(demo):
    allowed = {"input_select.ramka_mode": set(RAMKA_MODES), "input_select.ramka_ambient": set(RAMKA_PAGES)}
    used = {key: set() for key in allowed}
    for name, tree in demo.items():
        for node in walk(tree):
            entity = node.get("entity") or node.get("entity_id")
            if isinstance(entity, str) and entity in allowed:
                for field in ("state", "state_not", "states", "to", "from"):
                    if field in node:
                        used[entity].update(as_list(node[field]))
            target = (node.get("target") or {}).get("entity_id") if isinstance(node.get("target"), dict) else None
            # Since 0.4.0 the page steps are templates over the live list (SPEC-021), evaluated in
            # test_loop_and_swipes_read_the_live_list; the literal options are checked here.
            if isinstance(target, str) and target in allowed and "option" in (node.get("data") or {}) \
                    and "{{" not in str(node["data"]["option"]):
                used[target].add(node["data"]["option"])
    for entity, values in used.items():
        assert values, entity
        assert values <= allowed[entity], f"{entity}: {values - allowed[entity]}"
    assert used["input_select.ramka_ambient"] == set(RAMKA_PAGES)
    assert {"off", "ambient", "controls", "calendar"} <= used["input_select.ramka_mode"]


def test_no_wind_sensor_no_banner(tmp_path):
    inputs = demo_inputs()
    del inputs["wind_sensor"]
    rendered = render(tmp_path, inputs)
    for lang in LANGS:
        text = translations(lang)["ui.wind.awnings_rolled_in"]
        assert not wind_banners(rendered[f"dashboard.{lang}.yaml"], text)


def skip_buttons(dashboard, lang):
    labels = {translations(lang)[f"ui.media.{k}"] for k in ("previous", "next")}
    return [n for n in walk(dashboard) if n.get("type") == "custom:tap-button-card" and n.get("name") in labels]


def test_media_service_sensor_is_optional(demo, tmp_path):
    for button in skip_buttons(demo["dashboard.en.yaml"], "en"):
        assert all("sensor." not in str(c.get("entity")) for c in button["visibility"])
    inputs = demo_inputs()
    inputs["media_service_sensor"] = "sensor.speaker_streaming_service"
    buttons = skip_buttons(render(tmp_path, inputs)["dashboard.en.yaml"], "en")
    assert len(buttons) == 2
    for button in buttons:
        assert {"condition": "state", "entity": "sensor.speaker_streaming_service", "state_not": "Spotify"} in button["visibility"]


def test_prefix_names_every_helper(tmp_path):
    inputs = demo_inputs()
    inputs["prefix"] = "hall_frame"
    package = render(tmp_path, inputs)["package.yaml"]
    for domain in ("input_select", "input_boolean", "input_number", "timer", "input_button", "input_text", "script", "shell_command"):
        for key in package[domain]:
            assert key.startswith("hall_frame_"), f"{domain}.{key}"
    for automation in package["automation"]:
        assert automation["id"].startswith("hall_frame_")
    for block in package["template"]:
        for entities in template_entities(block):
            for entity in entities:
                assert entity["unique_id"].startswith("hall_frame_")
                assert entity["default_entity_id"].split(".")[1].startswith("hall_frame_")


def template_entities(block):
    """A template block's entity lists: a trigger-based block's `triggers` are not entities."""
    return [entities for kind, entities in block.items() if kind != "triggers"]


def defined_entities(package) -> set[str]:
    ids = set()
    for domain in ("input_select", "input_boolean", "input_number", "timer", "input_button", "input_text", "script", "shell_command"):
        ids |= {f"{domain}.{key}" for key in package.get(domain) or {}}
    for block in package["template"]:
        for entities in template_entities(block):
            ids |= {entity["default_entity_id"] for entity in entities}
    ids |= {f"automation.{a['id']}" for a in package["automation"]}
    return ids


def test_every_prefixed_reference_is_defined(tmp_path):
    rendered = texts(tmp_path, demo_inputs())
    defined = defined_entities(yaml.safe_load(rendered["package.yaml"]))
    pattern = re.compile(r"\b(?:input_\w+|timer|script|shell_command|sensor|binary_sensor|image)\.ramka_\w+")
    for name, text in rendered.items():
        for ref in set(pattern.findall(text)):
            assert ref in defined, f"{name}: {ref} is not defined by the package"


def test_loops_follow_the_inputs(demo):
    inputs = demo_inputs()
    dashboard = demo["dashboard.en.yaml"]
    light_tiles = [n for n in walk(dashboard) if n.get("type") == "tile" and str(n.get("entity")).startswith("light.")]
    assert [t["entity"] for t in light_tiles[::2]] == [light["entity"] for light in inputs["lights"]]
    rooms = next(n for n in walk(dashboard) if n.get("type") == "custom:rooms-card")["rooms"]
    assert [r["name"] for r in rooms] == [c["label"] for c in inputs["climate"]]
    awnings = [n["target"]["entity_id"] for n in walk(dashboard)
               if n.get("type") == "custom:tap-button-card" and n.get("action") == "cover.open_cover"]
    covers = [c["entity"] for c in inputs["covers"]]
    assert awnings == covers + [covers]


def test_minimal_inputs_render(tmp_path):
    """Only the required inputs: every optional block is left out, nothing fails."""
    inputs = demo_inputs()
    for key in ("kiosk_user", "mains", "wind_sensor", "lights_all_off", "outside", "pressure", "status"):
        inputs.pop(key)
    rendered = render(tmp_path, inputs)
    assert "kiosk_mode" not in rendered["dashboard.en.yaml"]
    types = {n.get("type") for n in walk(rendered["dashboard.en.yaml"])}
    assert "custom:mains-card" not in types


@pytest.mark.parametrize("key", ["mains", "wind_sensor"])
def test_null_optional_input_renders_like_an_omitted_one(tmp_path, key):
    omitted = demo_inputs()
    del omitted[key]
    nulled = demo_inputs()
    nulled[key] = None
    assert texts(tmp_path / "a", omitted) == texts(tmp_path / "b", nulled)


ROOM_LISTS = ("covers", "lights", "climate", "plants")
ROOM_SLUG = re.compile(r"^[a-z0-9]+(_[a-z0-9]+)*$")


def test_demo_list_items_carry_a_room_slug():
    inputs = demo_inputs()
    for key in ROOM_LISTS:
        assert inputs[key], key
        for item in inputs[key]:
            assert ROOM_SLUG.match(item.get("room", "")), f"{key}: {item}"


def test_room_slugs_do_not_change_the_render(tmp_path):
    """`room:` is the join key for scenes (scenes/README.md); the templates ignore it."""
    without = demo_inputs()
    for key in ROOM_LISTS:
        for item in without[key]:
            item.pop("room")
    assert texts(tmp_path / "with", demo_inputs()) == texts(tmp_path / "without", without)


# ---- 0.2.0: optional pages and the screen (SPEC-011 sections 6.2, 7.4) ------------------------

PAGE_INPUTS = {"climate": ("climate", "outside", "pressure"), "air": ("air",), "plants": ("plants",),
               "photos": ("photo_dir",)}
PAGE_CARDS = {"climate": "custom:rooms-card", "air": "custom:air-card", "plants": "custom:plants-card",
              "photos": "custom:photo-frame-card"}


def without_pages(*pages) -> dict:
    inputs = demo_inputs()
    for page in pages:
        for key in PAGE_INPUTS[page]:
            inputs.pop(key, None)
    return inputs


def hand_on(stage) -> dict:
    """A loop stage's last step to another page (the plants stage turns its page after it)."""
    return [a for a in stage["then"] if a.get("action") == "input_select.select_option"
            and a["target"]["entity_id"] == "input_select.ramka_ambient"][-1]


def rotation(package) -> dict[str, str]:
    """page -> the page the ambient loop goes to after it with every page switch on, evaluated from
    the rendered loop (since 0.4.0 each stage reads the live list, SPEC-021)."""
    stages = package["script"]["ramka_ambient_loop"]["sequence"][0]["repeat"]["sequence"]
    steps = {}
    for stage in stages:
        condition = stage["if"][0]
        if condition.get("condition") != "state":
            continue
        last = hand_on(stage)
        steps[condition["state"]] = next_page(last["data"]["option"], condition["state"], None)
    return steps


@pytest.mark.parametrize("dropped", [("climate",), ("air",), ("plants",), ("photos",), ("climate", "air", "plants"),
                                     ("climate", "air", "plants", "photos")])
def test_a_page_without_its_input_is_left_out(tmp_path, dropped):
    rendered = render(tmp_path, without_pages(*dropped))
    pages = [p for p in RAMKA_PAGES if p not in dropped]
    for lang in LANGS:
        # isinstance: line-style-card's dash pattern is a list under `type`.
        types = {n["type"] for n in walk(rendered[f"dashboard.{lang}.yaml"]) if isinstance(n.get("type"), str)}
        for page, card in PAGE_CARDS.items():
            assert (card in types) == (page not in dropped), (lang, page)
    package = rendered["package.yaml"]
    # The rotation visits exactly the pages there are, in order, round.
    assert rotation(package) == {page: pages[(i + 1) % len(pages)] for i, page in enumerate(pages)}
    # A helper standing on a missing page goes to the first page there is.
    guard = package["script"]["ramka_ambient_loop"]["sequence"][0]["repeat"]["sequence"][0]
    assert guard["if"][0]["condition"] == "template"
    assert next_page(guard["then"][0]["data"]["option"], "nowhere", None) == pages[0]
    # The swipes step through the same pages, never select_next onto a missing one.
    for script in ("ramka_ambient_next", "ramka_ambient_prev"):
        [step] = [s for s in package["script"][script]["sequence"] if "input_select" in s.get("action", "")]
        assert step["action"] == "input_select.select_option"
        assert json.dumps(pages) in step["data"]["option"]
    for script, automation in (("ramka_swipe_up", None), (None, "ramka_ambient_stop")):
        actions = (package["script"][script]["sequence"] if script else
                   next(a for a in package["automation"] if a["id"] == automation)["actions"])
        starts = [next_page(a["data"]["option"], "nowhere", None) for a in walk(actions)
                  if a.get("action") == "input_select.select_option" and a["target"]["entity_id"] == "input_select.ramka_ambient"]
        assert starts == [pages[0]]


def test_all_pages_step_through_the_live_list_too(demo):
    """Since 0.4.0 the page switches can take any page out, so with all five pages the swipes read
    the live list as well and the loop's guard is always there (SPEC-021; was
    test_all_pages_keep_select_next_and_no_guard)."""
    package = demo["package.yaml"]
    assert package["script"]["ramka_ambient_next"]["sequence"][0]["action"] == "input_select.select_option"
    assert package["script"]["ramka_ambient_prev"]["sequence"][0]["action"] == "input_select.select_option"
    first = package["script"]["ramka_ambient_loop"]["sequence"][0]["repeat"]["sequence"][0]
    assert first["if"][0]["condition"] == "template"


@pytest.mark.parametrize("key", ["climate", "air", "plants", "photo_dir"])
def test_null_page_input_renders_like_an_omitted_one(tmp_path, key):
    omitted = demo_inputs()
    del omitted[key]
    nulled = demo_inputs()
    nulled[key] = None
    assert texts(tmp_path / "a", omitted) == texts(tmp_path / "b", nulled)


@pytest.mark.parametrize("screen", [{"width": 1100, "height": 720}, {"width": 1024, "height": 720},
                                    {"width": 1280, "height": 800}])
def test_a_screen_the_tested_layout_fits_renders_as_without_one(tmp_path, screen):
    inputs = demo_inputs()
    inputs["screen"] = screen
    given, default = texts(tmp_path / "a", inputs), texts(tmp_path / "b", demo_inputs())
    # The settings dashboard lists the screen among the render-time inputs and the preview's frames
    # take its size; nothing else changes.
    settings = {name for name in given if name.startswith("ramka-settings.")}
    sized = settings | {name for name in given if name.startswith("ramka-preview.")}
    assert {k: v for k, v in given.items() if k not in sized} == {k: v for k, v in default.items() if k not in sized}
    assert all(f"{screen['width']} × {screen['height']}" in given[name] for name in settings)


@pytest.mark.parametrize("screen", [{"width": 800, "height": 1280}, {"width": 1000, "height": 720},
                                    {"width": 1100, "height": 700}, {"width": 1920, "height": 1080}])
def test_a_screen_no_tested_layout_fits_fails(tmp_path, screen):
    inputs = demo_inputs()
    inputs["screen"] = screen
    with pytest.raises(dr.RenderError, match=rf"no tested layout for {screen['width']}x{screen['height']} CSS px "
                                             r"\(tested: 1100x720 for 1024-1280 x 720-800\)"):
        render(tmp_path, inputs)


def tagged_ramka(tmp_path, version) -> Path:
    """components/ramka at the tag ramka/<version>, extracted under tmp_path."""
    return ramka_at(tmp_path, f"refs/tags/ramka/{version}", f"ramka-{version}")


def ramka_at(tmp_path, rev, name) -> Path:
    """components/ramka at a revision, extracted under tmp_path/<name>."""
    import subprocess

    if subprocess.run(["git", "-C", str(REPO), "rev-parse", "-q", "--verify", f"{rev}^{{commit}}"],
                      capture_output=True).returncode:
        pytest.skip(f"{rev} not in this clone")
    old = tmp_path / name
    old.mkdir()
    archive = subprocess.run(["git", "-C", str(REPO), "archive", rev, "components/ramka"],
                             capture_output=True, check=True).stdout
    subprocess.run(["tar", "-x", "-C", str(old)], input=archive, check=True)
    return old / "components" / "ramka"


def test_without_screen_and_with_every_page_renders_as_0_1_2_but_for_the_header(tmp_path):
    """The 0.2.0 promise: a home that changes nothing gets the same files (UPGRADE.md), except
    that since 0.2.2 the screen-high cards subtract the header when one is shown. Held up to 0.3.0;
    0.4.0's live settings change the files (test_music_visual_absent_renders_as_0_3_0)."""
    before, after = tmp_path / "before", tmp_path / "after"
    # Since 0.4.0 the demo home shows the music visual, which 0.1.2 did not have.
    dr.render_component(tagged_ramka(tmp_path, "0.1.2"), without_visual(), before)
    dr.render_component(tagged_ramka(tmp_path, "0.3.0"), without_visual(), after)
    names = sorted(p.name for p in before.iterdir())
    assert names == sorted(p.name for p in after.iterdir())
    header = "var(--kiosk-header-height, var(--header-height, 0px)) - "
    for name in names:
        a, b = (before / name).read_text(), (after / name).read_text()
        if not name.startswith("dashboard."):
            assert a == b, name
            continue
        # Line by line: a height gains the header term, a comment may say so; nothing else moves.
        b_lines = [line.replace(header, "") for line in b.splitlines()]
        a_lines = a.splitlines()
        assert len(a_lines) + 2 == len(b_lines), name  # the dvh comment grows by two lines
        assert b.count(header) == 6, name
        assert [l for l in a_lines if not l.lstrip().startswith("#")] == \
               [l for l in b_lines if not l.lstrip().startswith("#")], name


def test_without_photo_dir_nothing_of_the_photos_is_rendered(tmp_path):
    """The photos hang on nothing else of the Ramka (they may become a component of their own)."""
    out = texts(tmp_path, without_pages("photos"))
    for name, text in out.items():
        for word_ in ("ramka_photo", "ramka_pick", "ramka_index", "photo-frame-card", "/config/www/ramka", "platform: folder"):
            assert word_ not in text, (name, word_)


# ---- 0.3.0: status_page -------------------------------------------------------------------------

@pytest.mark.parametrize("dropped", [(), ("photos",), ("climate", "air", "plants")])
def test_status_page_false_leaves_the_status_page_out(tmp_path, dropped):
    inputs = without_pages(*dropped)
    inputs["status_page"] = False
    rendered = render(tmp_path, inputs)
    pages = [p for p in RAMKA_PAGES if p not in dropped and p != "status"]
    for lang in LANGS:
        types = {n["type"] for n in walk(rendered[f"dashboard.{lang}.yaml"]) if isinstance(n.get("type"), str)}
        assert "custom:status-card" not in types, lang
    package = rendered["package.yaml"]
    assert rotation(package) == {page: pages[(i + 1) % len(pages)] for i, page in enumerate(pages)}
    for script in ("ramka_ambient_next", "ramka_ambient_prev"):
        [step] = [s for s in package["script"][script]["sequence"] if "input_select" in s.get("action", "")]
        assert step["action"] == "input_select.select_option"
        assert json.dumps(pages) in step["data"]["option"]
    # The helper keeps all five options (FROZEN): a home's history and scenes still name status.
    assert package["input_select"]["ramka_ambient"]["options"] == RAMKA_PAGES


def test_status_page_true_renders_as_without_it(tmp_path):
    inputs = demo_inputs()
    inputs["status_page"] = True
    assert texts(tmp_path / "a", inputs) == texts(tmp_path / "b", demo_inputs())


def test_status_page_false_without_another_page_fails(tmp_path):
    inputs = without_pages("climate", "air", "plants", "photos")
    inputs["status_page"] = False
    with pytest.raises(dr.RenderError, match=r"status_page: false leaves no ambient page"):
        render(tmp_path, inputs)


# ---- 0.4.0: music_visual ------------------------------------------------------------------------

AUDIO_CARDS = REPO / "components" / "audio-sensor" / "cards"
VISUAL_OPTIONS = ("spectrum", "level", "classic")
# The views with a page switch (SPEC-021).
PAGE_VIEWS = ["climate", "air", "plants", "photos", "status", "calendar", "music"]


def without_visual() -> dict:
    inputs = demo_inputs()
    inputs.pop("music_visual", None)
    inputs.pop("music_visual_options", None)
    return inputs


def with_visual(choice="spectrum", options=None) -> dict:
    inputs = without_visual()
    inputs["music_visual"] = choice
    if options is not None:
        inputs["music_visual_options"] = options
    return inputs


def now_playing(dashboard):
    [card] = [n for n in walk(dashboard) if n.get("type") == "custom:now-playing-card"]
    return card


def visual_tiles(dashboard):
    return [n for n in walk(dashboard) if n.get("type") == "custom:tap-button-card"
            and n.get("action") == "input_select.select_next"]


def test_music_live_defaults_to_off(demo):
    """The input turns the feature on; a fresh home shows Classic: the Live visualization switch is
    off (SPEC-025 amendment 1). The select holds the visuals only, the input's first."""
    package = demo["package.yaml"]
    assert package["input_select"]["ramka_music_visual"]["options"] == ["spectrum", "level"]
    assert "classic" not in json.dumps(package["input_select"]["ramka_music_visual"])
    live = package["input_boolean"]["ramka_music_live"]
    assert "initial" not in live and live["name"] == "Ramka music live visualization"
    assert run_reset(package, page="music")[MUSIC_LIVE] == "off"
    assert run_reset(package, page="music_live")["input_select.ramka_music_visual"] == "spectrum"
    # An untouched music_visual group (the dB helpers at 0) is seeded: Live off, the input's visual.
    states = at_minimum(package)
    states.update({"input_select.ramka_music_visual": "level", MUSIC_LIVE: "on"})
    assert "music_visual" in seed_groups(package, states)
    after = run_seed(package, states)
    assert (after[MUSIC_LIVE], after["input_select.ramka_music_visual"]) == ("off", "spectrum")
    # A home whose music is tuned keeps its switch: the seed leaves the music_visual group alone.
    tuned_music = {**states, **{f"input_number.ramka_{k}": 40.0 for k in MUSIC_DB}, "input_boolean.ramka_settings_seeded": "on"}
    assert run_seed(package, tuned_music)[MUSIC_LIVE] == "on"


def test_now_playing_reads_the_live_switch(demo):
    """The Ramka's now-playing card and the preview's frame show the visual only while Live is on
    (now-playing-card's visual.live; off draws its own classic wave, SPEC-025 amendment 1)."""
    for lang in LANGS:
        for name in (f"dashboard.{lang}.yaml", f"ramka-preview.{lang}.yaml"):
            visual = now_playing(demo[name])["visual"]
            assert visual["live"] == MUSIC_LIVE and visual["select"] == MUSIC_VISUAL, name
            assert set(visual) == {"select", "live", "spectrum", "level"}, name


def test_demo_inputs_show_the_spectrum():
    """The demo home is what ha-check and the website render: it shows the visual."""
    assert demo_inputs()["music_visual"] == "spectrum"


def test_music_visual_absent_renders_wave_true(tmp_path):
    rendered = render(tmp_path, without_visual())
    assert "ramka_music_visual" not in rendered["package.yaml"]["input_select"]
    for lang in LANGS:
        dashboard = rendered[f"dashboard.{lang}.yaml"]
        card = now_playing(dashboard)
        assert card["wave"] is True
        assert "visual" not in card
        assert not visual_tiles(dashboard), lang


def test_music_visual_absent_renders_as_0_3_0(tmp_path):
    """Without music_visual a home gets 0.3.0's files plus the live settings (SPEC-021,
    Compatibility): the package's new helpers, sensor, script and automations, the parts that read
    the page switches and fallbacks equal to the defaults; the dashboards without the view theme and
    with the calendar switch. Everything else is 0.3.0's, value for value."""
    before, after = tmp_path / "before", tmp_path / "after"
    dr.render_component(tagged_ramka(tmp_path, "0.3.0"), without_visual(), before)
    # 0.6.0, the last release before SPEC-022 changed the plants parts on purpose (tested below).
    dr.render_component(tagged_ramka(tmp_path, "0.6.0"), without_visual(), after)
    names = sorted(p.name for p in before.iterdir())
    # The settings dashboard is new in 0.4.0.
    assert sorted(p.name for p in after.iterdir()) == sorted(names + [f"ramka-settings.{lang}.yaml" for lang in LANGS])
    load = lambda path: yaml.safe_load(path.read_text(encoding="utf-8"))  # noqa: E731
    old_package, new_package = load(before / "package.yaml"), load(after / "package.yaml")
    for domain, added in SETTINGS_ADDED.items():
        old_items, new_items = keyed(old_package, domain), keyed(new_package, domain)
        assert set(new_items) - set(old_items) == added, domain
        for key, value in old_items.items():
            if key not in SETTINGS_CHANGED.get(domain, {}):
                assert new_items[key] == value, f"{domain}.{key}"
    for name in names:
        if name.startswith("dashboard."):
            old_dashboard, new_dashboard = load(before / name), load(after / name)
            assert old_dashboard["views"][0].pop("theme") == "ramka"
            assert "theme" not in new_dashboard["views"][0]
            assert without_live_rooms(without_air_settings(without_calendar_switch(new_dashboard))) == old_dashboard, name


# The Photos and Air pages' settings (SPEC-021, amendment 1), with the demo home's photo_dir and
# all five readings.
AIR_READINGS = ["score", "co2", "pm2_5", "voc", "nox"]
AIR_LIMITS = {"score_fair": 80, "score_poor": 60, "co2_raised": 800, "co2_high": 1200, "pm2_5_raised": 15,
              "pm2_5_high": 35, "voc_raised": 150, "voc_high": 250, "nox_raised": 20, "nox_high": 150}
PHOTO_DEFAULTS = {"input_number.ramka_photo_count": 5, "input_number.ramka_photo_s": 10}
# The Plants page's settings (SPEC-022), with the demo home's plants.
PLANT_SETTINGS = {"input_number.ramka_plants_per_page": 6, "input_number.ramka_plants_page_s": 10}
# The albums are no helper: the reset sends event ramka_photo_albums with all albums, the ticks kept.
ALBUMS = "sensor.ramka_photo_albums"
SERIES = "sensor.ramka_photo_series"
# Nor are the Climate page's rooms (amendment 2): the reset sends event ramka_climate_rooms.
CLIMATE = "sensor.ramka_climate_rooms"
# The number of places on the Climate page: a helper of its own group, seeded while untouched.
CLIMATE_SLOTS = {"input_number.ramka_climate_slots": 10}
SLOTS = "input_number.ramka_climate_slots"
# Threshold-based colours on the Climate page: off, in group climate with the widgets (seeded while
# the rooms sensor has none).
THRESHOLDS = "input_boolean.ramka_climate_thresholds"
CLIMATE_THRESHOLDS = {THRESHOLDS: "off"}
# The Climate page's neutral colour, the Air page's good colour by default; in group climate too.
NEUTRAL_COLOUR = "input_select.ramka_climate_color_neutral"
CLIMATE_NEUTRAL = {NEUTRAL_COLOUR: "green"}
AIR_COLOUR_SELECTS = {key: f"input_select.ramka_air_color_{key}" for key in ("good", "fair", "poor")}
# The Air page's colours (named colours, cards/lib/colours.js): good, fair and poor, in group air.
AIR_COLOURS = {"input_select.ramka_air_color_good": "green", "input_select.ramka_air_color_fair": "amber",
               "input_select.ramka_air_color_poor": "red"}
AIR_DEFAULTS = {**{f"input_boolean.ramka_air_{r}": "on" for r in AIR_READINGS},
                **{f"input_number.ramka_air_{k}": v for k, v in AIR_LIMITS.items()}, **AIR_COLOURS}


# What 0.4.0's live settings add to and change in a package without music_visual (SPEC-021,
# Compatibility); everything else is 0.3.0's, value for value.
SETTINGS_ADDED = {
    "input_select": {"ramka_theme_mode"},
    "input_boolean": {"ramka_settings_advanced", "ramka_settings_seeded", *(f"ramka_page_{v}" for v in PAGE_VIEWS),
                      *(f"ramka_air_{r}" for r in AIR_READINGS)},
    "input_number": {"ramka_photo_count", "ramka_photo_s", *(f"ramka_air_{k}" for k in AIR_LIMITS)},
    "timer": set(), "input_button": set(), "input_text": set(), "shell_command": {"ramka_albums"},
    "script": {"ramka_settings_reset", "ramka_photo_albums_set", "ramka_climate_rooms_set"},
    "automation": {"ramka_settings_seed", "ramka_theme_mode"},
    "template": {"ramka_ambient_pages", "ramka_photo_albums", "ramka_climate_rooms"},
}
SETTINGS_CHANGED = {
    # The live list of pages (page switches).
    "script": {"ramka_ambient_next": "live list", "ramka_ambient_prev": "live list", "ramka_ambient_loop": "live list, photo settings",
               "ramka_swipe_up": "live list", "ramka_show_calendar": "calendar switch",
               "ramka_show_controls": "fallback = default"},
    "shell_command": {"ramka_pick": "count and album (amendment 1)"},
    "automation": {"ramka_ambient_stop": "live list", "ramka_presence_off": "fallback = default",
                   "ramka_photo_index": "album options (amendment 1)",
                   "ramka_near": "fallback = default", "ramka_near_left": "fallback = default"},
    "template": {"ramka_music_view": "music switch", "ramka_brightness_target": "fallback = default",
                 "ramka_near": "fallback = default"},
}


def keyed(package, domain) -> dict[str, object]:
    if domain == "automation":
        return {a["id"]: a for a in package["automation"]}
    if domain == "template":
        return {e["unique_id"]: e for block in package["template"] for entities in template_entities(block) for e in entities}
    return dict(package.get(domain) or {})


def without_air_settings(node):
    """The air-card as 0.3.0 had it: no show:, literal limits (the defaults the helpers start at)."""
    if isinstance(node, dict):
        if set(node) == {"entity", "default"} and str(node["entity"]).startswith("input_number.ramka_air_"):
            return node["default"]
        return {k: without_air_settings(v) for k, v in node.items()
                if not (k == "show" and str(v).startswith("input_boolean.ramka_air_"))}
    if isinstance(node, list):
        return [without_air_settings(v) for v in node]
    return node


def without_live_rooms(node):
    """The climate cards as 0.3.0 had them: no rooms-card `entity`, no line-style-card `rooms`."""
    if isinstance(node, dict):
        kind = node.get("type")  # a line style's `type` is a dash list
        live = {"custom:rooms-card": "entity", "custom:line-style-card": "rooms"}.get(kind) if isinstance(kind, str) else None
        return {k: without_live_rooms(v) for k, v in node.items() if k != live}
    if isinstance(node, list):
        return [without_live_rooms(v) for v in node]
    return node


def without_calendar_switch(node):
    if isinstance(node, dict):
        return {k: without_calendar_switch(v) for k, v in node.items()}
    if isinstance(node, list):
        return [without_calendar_switch(v) for v in node
                if not (isinstance(v, dict) and v.get("entity") == "input_boolean.ramka_page_calendar")]
    return node


def test_music_visual_options_alone_change_nothing(tmp_path):
    inputs = without_visual()
    inputs["music_visual_options"] = {"line_width": 3}
    assert texts(tmp_path / "a", inputs) == texts(tmp_path / "b", without_visual())


@pytest.mark.parametrize("choice, options", [("spectrum", ["spectrum", "level"]),
                                             ("level", ["level", "spectrum"])])
def test_music_visual_input_first_option(tmp_path, choice, options):
    """The input's visual is the first option, so a fresh helper starts there; classic is no option
    (the live switch off, SPEC-025 amendment 1); no initial:, which would reset the tablet's choice
    at every restart."""
    package = render(tmp_path, with_visual(choice))["package.yaml"]
    helper = package["input_select"]["ramka_music_visual"]
    assert helper["options"] == options
    assert "initial" not in helper
    assert helper["name"] == "Ramka music visual"




def test_music_visual_follows_the_prefix(tmp_path):
    inputs = with_visual()
    inputs["prefix"] = "hall_frame"
    rendered = render(tmp_path, inputs)
    assert "hall_frame_music_visual" in rendered["package.yaml"]["input_select"]
    visual = now_playing(rendered["dashboard.en.yaml"])["visual"]
    assert visual["select"] == "input_select.hall_frame_music_visual"
    assert {visual[k]["active"] for k in ("spectrum", "level")} == {"binary_sensor.hall_frame_media_playing"}


@pytest.mark.parametrize("inputs, message", [
    (with_visual("bars"), r"music_visual must be spectrum or level, not 'bars'"),
    (with_visual(options={"colour": "red"}), r"music_visual_options: unknown key 'colour'"),
    (with_visual(options={"spectrum": {"palette": "calm"}}), r"music_visual_options.spectrum: unknown key 'palette'"),
])
def test_music_visual_bad_input_fails(tmp_path, inputs, message):
    with pytest.raises(dr.RenderError, match=message):
        render(tmp_path, inputs)


# ---- 0.4.0: live settings (SPEC-021) ------------------------------------------------------------

PRESENCE_NUMBERS = ["off_delay_s", "brightness_min", "brightness_max", "near_cm", "near_s", "controls_hold_s", "lux_max"]
MUSIC_DB = ["music_spectrum_neutral_db", "music_spectrum_hot_db", "music_level_neutral_db", "music_level_hot_db"]
# The catalog's defaults (SPEC-021, Provides): what the reset writes in a home without
# settings_defaults or music_visual_options.
DEFAULTS = {
    "input_boolean.ramka_near_enabled": "on", "input_number.ramka_off_delay_s": 300,
    "input_number.ramka_brightness_min": 16, "input_number.ramka_brightness_max": 204,
    "input_number.ramka_near_cm": 100, "input_number.ramka_near_s": 1, "input_number.ramka_controls_hold_s": 5,
    "input_number.ramka_lux_max": 200, "input_boolean.ramka_ambient_music": "on",
    "input_select.ramka_theme_mode": "dark", "input_boolean.ramka_settings_advanced": "off",
    **{f"input_boolean.ramka_page_{v}": "on" for v in PAGE_VIEWS},
    **PHOTO_DEFAULTS, **PLANT_SETTINGS, **AIR_DEFAULTS, **CLIMATE_THRESHOLDS, **CLIMATE_NEUTRAL, **CLIMATE_SLOTS,
}
EQ_KEYS = ["sub", "bass", "low_mid", "mid", "presence", "air"]
# Custom's look (spec 5): its own group, so an upgraded home whose music window is tuned still gets
# a flat EQ and 1.5 s hold rather than the sliders' minimum (-18 dB, 0 s).
LOOK_DEFAULTS = {
    "input_select.ramka_music_template": "custom", "input_select.ramka_music_eq": "—",
    **{f"input_number.ramka_music_eq_{k}": 0 for k in EQ_KEYS}, "input_number.ramka_music_hold_s": 1.5,
}
# Each template's own values (group music_profiles): the looks table's rows (spec 4.1) in the
# template's ten helpers; the EQ is the row's preset (catalog values, behind_speakers the measured one).
PROFILE_ROWS = {
    "behind_speakers": (100, 2, 1.5, True, (-5, -10, -3, 0, 3, 2)),
    "lively": (50, 0.3, 0.5, False, (-3, -4, -4, 0, 2, -1)),
    "calm": (80, 4.2, 2.0, True, (-4, -2, -5, 0, 1, 2)),
    "analyser": (0, 0.5, 1.0, False, (0, 0, 0, 0, 0, 0)),
}
PROFILE_DEFAULTS = {
    entity: value for id, (rise, fall, hold, tilt, gains) in PROFILE_ROWS.items() for entity, value in {
        f"input_number.ramka_music_{id}_rise_ms": rise, f"input_number.ramka_music_{id}_fall_s": fall,
        f"input_number.ramka_music_{id}_hold_s": hold,
        **{f"input_number.ramka_music_{id}_eq_{k}": g for k, g in zip(EQ_KEYS, gains)},
        f"input_boolean.ramka_music_{id}_tilt": "on" if tilt else "off"}.items()
}
MUSIC_LIVE = "input_boolean.ramka_music_live"
MUSIC_DEFAULTS = {
    **LOOK_DEFAULTS, **PROFILE_DEFAULTS, MUSIC_LIVE: "off",
    "input_select.ramka_music_visual": "spectrum", "input_select.ramka_music_palette": "series",
    "input_select.ramka_music_spectrum_flavour": "dune", "input_select.ramka_music_level_flavour": "centre",
    "input_number.ramka_music_rise_ms": 200, "input_number.ramka_music_fall_s": 4,
    "input_number.ramka_music_line_width_px": 2.8, "input_boolean.ramka_music_tilt": "on",
    "input_number.ramka_music_spectrum_neutral_db": 30, "input_number.ramka_music_spectrum_hot_db": 70,
    "input_number.ramka_music_level_neutral_db": 30, "input_number.ramka_music_level_hot_db": 70,
    "input_number.ramka_music_fps": 30,
}
# Which page and group each setting belongs to (SPEC-021's table); ambient_music is state the swipes
# flip, set only by the presence_display group and the global reset.
# The near settings (when the controls come up) are the Controls page's.
CONTROLS_SETTINGS = {"input_boolean.ramka_near_enabled": "basic", "input_number.ramka_near_cm": "advanced",
                     "input_number.ramka_near_s": "advanced", "input_number.ramka_controls_hold_s": "advanced"}
PAGE_OF = {
    **{e: "general" for e in DEFAULTS if not e.startswith("input_boolean.ramka_page_")},
    **{e: "controls" for e in CONTROLS_SETTINGS},
    "input_boolean.ramka_ambient_music": None,
    **{e: "photos" for e in PHOTO_DEFAULTS}, **{e: "plants" for e in PLANT_SETTINGS}, **{e: "air" for e in AIR_DEFAULTS},
    **{e: "climate" for e in {**CLIMATE_SLOTS, **CLIMATE_THRESHOLDS, **CLIMATE_NEUTRAL}},
    **{f"input_boolean.ramka_page_{v}": v for v in PAGE_VIEWS},
    # The visual's settings are the Live visualization sub-view's (SPEC-025 amendment 1); its switch
    # is the Music page's.
    **{e: "music_live" for e in MUSIC_DEFAULTS}, MUSIC_LIVE: "music",
}
GROUP_OF = {
    **{e: "presence_display" for e in DEFAULTS},
    "input_select.ramka_theme_mode": "pages", "input_boolean.ramka_settings_advanced": "pages",
    **{f"input_boolean.ramka_page_{v}": "pages" for v in PAGE_VIEWS},
    **{e: "music_visual" for e in MUSIC_DEFAULTS}, **{e: "music_look" for e in LOOK_DEFAULTS},
    **{e: "music_profiles" for e in PROFILE_DEFAULTS},
    **{e: "photos" for e in PHOTO_DEFAULTS}, **{e: "plants" for e in PLANT_SETTINGS}, **{e: "air" for e in AIR_DEFAULTS},
    **{e: "climate_slots" for e in CLIMATE_SLOTS}, **{e: "climate" for e in {**CLIMATE_THRESHOLDS, **CLIMATE_NEUTRAL}},
}
# Helpers that are state, not settings: no settings page shows them (SPEC-021, the standing rule).
# A new one is added here by name, in review.
STATE_HELPERS = {"input_select.ramka_mode", "input_select.ramka_ambient", "input_boolean.ramka_ambient_music",
                 "input_boolean.ramka_settings_seeded", "input_boolean.ramka_climate_slots_seeded",
                 # The pause and the plant page on screen (SPEC-026); the plant page with plants.
                 "input_boolean.ramka_paused", "input_number.ramka_plants_page"}
# State with music_visual: none (the blind audition is gone).
MUSIC_STATE_HELPERS: set[str] = set()
# State a settings page drives: shown, never reset. None at present.
PAGE_CONTROLS: dict[str, str] = {}


def ha(template, states=None, attrs=None, **variables) -> str:
    """A Home Assistant template run with stub states: an entity not given is `unavailable`, an
    attribute not given is None."""
    import jinja2

    states = states or {}
    attrs = attrs or {}

    def state(entity_id):
        value = states.get(entity_id, "unavailable")
        return value if isinstance(value, str) else str(value)

    env = jinja2.Environment()
    env.filters["from_json"] = json.loads
    return env.from_string(template).render(
        states=state, is_state=lambda e, v: state(e) == v,
        state_attr=lambda e, a: attrs.get(e, {}).get(a), **variables).strip()


def ha_value(template, **kwargs):
    """A template's result as Home Assistant's native types would read it."""
    out = ha(template, **kwargs)
    return yaml.safe_load(out) if out else ""


def helpers(package) -> dict[str, dict]:
    return {f"{domain}.{key}": value or {} for domain in ("input_boolean", "input_number", "input_select")
            for key, value in (package.get(domain) or {}).items()}


def reset_script(package):
    return package["script"]["ramka_settings_reset"]


def run_reset(package, page=None, groups=None, states=None, events=False) -> dict[str, object]:
    """What script.<prefix>_settings_reset sets, evaluated with Jinja: entity -> value. `states`
    are what its conditions read; an entity not given is unavailable (a home without audio-sensor).
    With `events`, also what its events set: ALBUMS -> the event data, CLIMATE -> the rooms."""
    fields = {k: v for k, v in (("page", page), ("groups", groups)) if v is not None}
    sequence = reset_script(package)["sequence"]
    variables = {}
    for name, template in sequence[0]["variables"].items():
        variables[name] = ha_value(template, **fields)
    written = {}
    for block in sequence[1:]:
        [condition] = block["if"]
        assert condition["condition"] == "template"
        if ha(condition["value_template"], states=states, **variables) != "True":
            continue
        for step in block["then"]:
            if "event" in step:
                if step["event"] == "ramka_photo_albums":
                    assert step["event_data"] == {"all": True}
                    if events:
                        written[ALBUMS] = step["event_data"]
                else:
                    assert step["event"] == "ramka_climate_rooms" and set(step["event_data"]) == {"rooms"}
                    if events:
                        written[CLIMATE] = step["event_data"]["rooms"]
                continue
            entity = step["target"]["entity_id"]
            action = step["action"]
            if action.endswith("set_value"):
                written[entity] = step["data"]["value"]
            elif action.endswith("select_option"):
                written[entity] = step["data"]["option"]
            else:
                written[entity] = {"input_boolean.turn_on": "on", "input_boolean.turn_off": "off"}[action]
    return written


def seed_groups(package, states, rooms=None) -> list[str]:
    """The groups the seed automation hands the reset, evaluated with stub states whose `min`
    attributes are the helpers' own; `rooms`: the climate sensor's, none before the first seed."""
    [seed] = [a for a in package["automation"] if a["id"] == "ramka_settings_seed"]
    attrs = {e: {"min": h["min"]} for e, h in helpers(package).items() if "min" in h}
    if rooms is not None:
        attrs[CLIMATE] = {"rooms": rooms}
    template = seed["actions"][0]["variables"]["seed_groups"]
    return ha_value(template, states=states, attrs=attrs)


def run_seed(package, states) -> dict[str, object]:
    """The states after the seed automation ran once at a start."""
    after = dict(states)
    groups = seed_groups(package, states)
    if groups:
        after.update(run_reset(package, groups=groups))
    after["input_boolean.ramka_settings_seeded"] = "on"
    if "input_boolean.ramka_climate_slots_seeded" in helpers(package):
        after["input_boolean.ramka_climate_slots_seeded"] = "on"
    return after


def at_minimum(package) -> dict[str, object]:
    """Every helper as Home Assistant creates it on a first install: numbers at their minimum,
    booleans off, selects on their first option."""
    states = {}
    for entity, helper in helpers(package).items():
        if entity.startswith("input_number."):
            states[entity] = float(helper["min"])
        elif entity.startswith("input_boolean."):
            states[entity] = "off"
        else:
            states[entity] = helper["options"][0]
    return states


@pytest.fixture(scope="module")
def plain(tmp_path_factory):
    return render(tmp_path_factory.mktemp("plain"), without_visual())


def expand(pattern: str) -> set[str]:
    """`a_{b,c}` -> {a_b, a_c}; <prefix> -> ramka."""
    pattern = pattern.replace("<prefix>", "ramka")
    match = re.search(r"\{([^{}]*)\}", pattern)
    if not match:
        return {pattern}
    return set().union(*(expand(pattern[:match.start()] + part + pattern[match.end():]) for part in match.group(1).split(",")))


def test_settings_helpers_stable_ids(plain, demo):
    for package, music in ((plain["package.yaml"], False), (demo["package.yaml"], True)):
        settings = {**DEFAULTS, **(MUSIC_DEFAULTS if music else {})}
        # input_text settings are no input_boolean, input_number or input_select.
        settings = {e for e in settings if not e.startswith("input_text.")}
        assert set(helpers(package)) == settings | STATE_HELPERS | (MUSIC_STATE_HELPERS if music else set()), music
        ids = defined_entities(package)
        assert {"sensor.ramka_ambient_pages", "script.ramka_settings_reset",
                "automation.ramka_settings_seed", "automation.ramka_theme_mode"} <= ids
    manifest = yaml.safe_load((COMP / "component.yaml").read_text(encoding="utf-8"))
    provided = set().union(*(expand(e["id"]) for e in manifest["provides"]["entities"]))
    automations = set().union(*(expand(a.strip()) for a in
                                re.split(r",\s*(?![^{]*\})", manifest["provides"]["automations"].split(", with")[0])))
    rendered = defined_entities(demo["package.yaml"])
    assert {e for e in rendered if not e.startswith("automation.")} <= provided
    assert {e.split(".", 1)[1] for e in rendered if e.startswith("automation.")} - {"ramka_charger_failed", "ramka_battery_hot", "ramka_music_watching", "ramka_music_eq_load"} <= automations
    assert "with music_visual also <prefix>_music_watching and <prefix>_music_eq_load," in manifest["provides"]["automations"]
    assert "audition" not in json.dumps(manifest["provides"]) and "audition" not in json.dumps(demo["package.yaml"])


def test_no_helper_has_initial(plain, demo):
    for package in (plain["package.yaml"], demo["package.yaml"]):
        for entity, helper in helpers(package).items():
            assert "initial" not in helper, entity
        # helpers() leaves input_text out (it is no setting domain of the page checks), so look at it here.
        for key, helper in (package.get("input_text") or {}).items():
            assert "initial" not in helper, key


def test_seed_defaults_follow_the_inputs(tmp_path, plain, demo):
    assert run_reset(plain["package.yaml"]) == DEFAULTS
    assert run_reset(demo["package.yaml"]) == {**DEFAULTS, **MUSIC_DEFAULTS}
    inputs = with_visual("level", {"spectrum": {"flavour": "bars", "neutral": 40}, "level": {"flavour": "tide", "hot": 90},
                                   "palette": "calm", "rise": 100, "fall": 2, "line_width": 3.5, "tilt": False, "fps": 24})
    inputs["settings_defaults"] = {"near_enabled": False, "off_delay_s": 600, "brightness_min": 30, "brightness_max": 180,
                                   "near_cm": 80, "near_s": 2, "controls_hold_s": 10, "lux_max": 400, "theme_mode": "light"}
    package = render(tmp_path, inputs)["package.yaml"]
    assert run_reset(package) == {
        **DEFAULTS, "input_boolean.ramka_near_enabled": "off", "input_number.ramka_off_delay_s": 600,
        "input_number.ramka_brightness_min": 30, "input_number.ramka_brightness_max": 180,
        "input_number.ramka_near_cm": 80, "input_number.ramka_near_s": 2, "input_number.ramka_controls_hold_s": 10,
        "input_number.ramka_lux_max": 400, "input_select.ramka_theme_mode": "light",
        **MUSIC_DEFAULTS, "input_select.ramka_music_visual": "level", "input_select.ramka_music_palette": "calm",
        "input_select.ramka_music_spectrum_flavour": "bars", "input_select.ramka_music_level_flavour": "tide",
        "input_number.ramka_music_rise_ms": 100, "input_number.ramka_music_fall_s": 2,
        "input_number.ramka_music_line_width_px": 3.5, "input_boolean.ramka_music_tilt": "off",
        "input_number.ramka_music_spectrum_neutral_db": 40, "input_number.ramka_music_level_hot_db": 90,
        "input_number.ramka_music_fps": 24,
    }
    # The selects start with the home's default, so a fresh helper is right before the seed runs.
    selects = package["input_select"]
    for key, first in (("theme_mode", "light"), ("music_visual", "level"), ("music_palette", "calm"),
                       ("music_spectrum_flavour", "bars"), ("music_level_flavour", "tide")):
        assert selects[f"ramka_{key}"]["options"][0] == first, key
    for key, first in (("theme_mode", "dark"), ("music_palette", "series"), ("music_spectrum_flavour", "dune"),
                       ("music_level_flavour", "centre")):
        assert demo["package.yaml"]["input_select"][f"ramka_{key}"]["options"][0] == first, key


def tuned(package, **values) -> dict[str, object]:
    """A home that has run the Ramka: every number off its minimum, then `values` on top."""
    states = at_minimum(package)
    for entity in states:
        if entity.startswith("input_number.ramka_") and not entity.startswith("input_number.ramka_music_"):
            states[entity] = float(package["input_number"][entity.split(".")[1]]["max"])
    states.update({f"input_number.ramka_{k}": v for k, v in values.items()})
    return states


def test_seed_rule_keeps_tuned_values(demo, plain):
    package = demo["package.yaml"]
    fresh = at_minimum(package)
    music = ["music_visual", "music_look", "music_profiles"]
    assert seed_groups(package, fresh) == ["pages", "presence_display", *music, "photos", "plants", "air", "climate", "climate_slots"]
    upgraded = {**fresh, "input_number.ramka_off_delay_s": 600.0}
    assert seed_groups(package, upgraded) == ["pages", *music, "photos", "plants", "air", "climate", "climate_slots"]
    on_purpose = {**tuned(package), "input_number.ramka_near_s": 1.0}
    assert seed_groups(package, on_purpose, rooms=[]) == ["pages", *music]
    seeded = {**tuned(package), "input_boolean.ramka_settings_seeded": "on"}
    assert seed_groups(package, seeded, rooms=[]) == music
    music_tuned = {**seeded, **{f"input_number.ramka_{k}": v for k, v in
                                zip(MUSIC_DB, (35.0, 75.0, 30.0, 70.0))}}
    # A home that tuned its music window before the looks existed still gets Custom's flat EQ, and a
    # home that had the profiles before they were editable gets the templates' values, after the flag.
    assert seed_groups(package, music_tuned, rooms=[]) == ["music_look", "music_profiles"]
    music_tuned = {**music_tuned, "input_number.ramka_music_hold_s": 0.5}
    assert seed_groups(package, music_tuned, rooms=[]) == ["music_profiles"]
    music_tuned = {**music_tuned, "input_number.ramka_music_calm_fall_s": 6.0}
    assert seed_groups(package, music_tuned, rooms=[]) == []
    assert seed_groups(package, {**seeded, "input_number.ramka_music_eq_bass": -18.0, "input_number.ramka_music_eq_air": 2.0},
                       rooms=[]) == ["music_visual", "music_profiles"]
    # A template's helper tuned to its slider's minimum on purpose (analyser's rise is 0 ms) does not
    # make the group look untouched while another of its numbers is off its minimum.
    assert "music_profiles" not in seed_groups(package, {**seeded, **{e: float(v) for e, v in PROFILE_DEFAULTS.items()
                                                                     if e.startswith("input_number.")}}, rooms=[])
    # unknown and unavailable count as untouched.
    unknown = {**fresh, "input_number.ramka_lux_max": "unknown", "input_number.ramka_near_cm": "unavailable"}
    assert seed_groups(package, unknown) == ["pages", "presence_display", *music, "photos", "plants", "air", "climate", "climate_slots"]
    # Without music_visual there is no music group at all.
    assert seed_groups(plain["package.yaml"], at_minimum(plain["package.yaml"])) == ["pages", "presence_display", "photos", "plants", "air", "climate", "climate_slots"]
    # Photos and air are seeded while untouched after the flag too: a home that ran 0.4.0 before
    # amendment 1 gets them at its next start (unknown), one that tuned them keeps them.
    assert seed_groups(plain["package.yaml"], {**at_minimum(plain["package.yaml"]),
                                               "input_boolean.ramka_settings_seeded": "on"}, rooms=[]) == ["photos", "plants", "air", "climate_slots"]
    one_tuned = {**music_tuned, "input_number.ramka_photo_count": "unknown", "input_number.ramka_photo_s": "unknown",
                 **{f"input_number.ramka_air_{k}": "unknown" for k in AIR_LIMITS}, "input_number.ramka_air_co2_high": 1500.0}
    assert seed_groups(package, one_tuned, rooms=[]) == ["photos"]
    # The climate rooms are seeded while the sensor has none (amendment 2), whatever the flag; any
    # list, even an empty one the settings page saved, is the home's.
    assert seed_groups(package, music_tuned) == ["climate"]


def test_a_home_upgraded_from_0_3_0_keeps_its_tuning(demo):
    """0.3.0 had the presence and display helpers, tuned; every 0.4.0 helper is new, so it starts
    at its minimum (off, the first option). After the first start the tuning is unchanged, every
    page switch is on, the music helpers have their defaults and the flag is on."""
    package = demo["package.yaml"]
    before = tuned(package, off_delay_s=600.0, brightness_min=1.0, near_s=1.0)
    before.update({"input_boolean.ramka_near_enabled": "off", "input_boolean.ramka_ambient_music": "off"})
    after = run_seed(package, before)
    for entity in [f"input_number.ramka_{k}" for k in PRESENCE_NUMBERS] + ["input_boolean.ramka_near_enabled",
                                                                          "input_boolean.ramka_ambient_music"]:
        assert after[entity] == before[entity], entity
    for view in PAGE_VIEWS:
        assert after[f"input_boolean.ramka_page_{view}"] == "on"
    for entity, value in MUSIC_DEFAULTS.items():
        assert after[entity] == value, entity
    assert after["input_boolean.ramka_settings_seeded"] == "on"
    # The next start changes nothing, and a fresh install gets every default.
    assert run_seed(package, after) == after
    first = run_seed(package, at_minimum(package))
    assert {e: first[e] for e in {**DEFAULTS, **MUSIC_DEFAULTS}} == {**DEFAULTS, **MUSIC_DEFAULTS}


def test_reset_page_and_groups(demo):
    package = demo["package.yaml"]
    everything = {**DEFAULTS, **MUSIC_DEFAULTS}
    assert run_reset(package) == everything
    for page in ["general"] + PAGE_VIEWS + ["controls", "music_live"]:
        assert set(run_reset(package, page=page)) == {e for e in everything if PAGE_OF[e] == page}, page
    for group in ("presence_display", "pages", "music_visual", "music_look", "music_profiles", "photos", "plants", "air", "climate",
                  "climate_slots"):
        assert set(run_reset(package, groups=[group])) == {e for e in everything if GROUP_OF[e] == group}, group
    assert set(run_reset(package, groups="pages")) == {e for e in everything if GROUP_OF[e] == "pages"}
    assert set(run_reset(package, page="general", groups=["pages"])) == {
        "input_select.ramka_theme_mode", "input_boolean.ramka_settings_advanced"}
    assert set(run_reset(package, groups=["presence_display", "music_visual"])) == {
        e for e in everything if GROUP_OF[e] in ("presence_display", "music_visual")}
    # Never audio-sensor's helpers: the music source and the calibration are not preferences. The
    # one exception is the sensor update rate on the sensor sub-view, set only while it is there.
    for step in walk(reset_script(package)):
        target = step.get("target", {}).get("entity_id", "") if isinstance(step.get("target"), dict) else ""
        assert target.startswith("input_") and ".ramka_" in target or target == SPECTRUM_RATE or not target, target
    assert run_reset(package, states={SPECTRUM_RATE: "eco"}) == {**everything, SPECTRUM_RATE: "normal"}
    assert run_reset(package, groups=["pages"], states={SPECTRUM_RATE: "eco"}) == {
        e: v for e, v in everything.items() if GROUP_OF[e] == "pages"}
    fields = reset_script(package)["fields"]
    assert set(fields) == {"page", "groups"}
    assert fields["page"]["selector"]["select"]["options"] == ["general"] + PAGE_VIEWS + ["controls", "music_live", "music_sensor"]
    assert fields["groups"]["selector"]["select"]["options"] == ["presence_display", "pages", "music_visual", "music_look", "music_profiles",
                                                                 "photos", "plants", "air", "climate", "climate_slots"]


def maximal_inputs() -> dict:
    """Every optional input that adds a helper or a page: the music visual with its options, the
    General defaults, the alerts, the photos and every page (the demo home has the rest)."""
    inputs = with_visual(options={"level": {"flavour": "tide"}, "fps": 24})
    inputs["settings_defaults"] = {"off_delay_s": 600}
    assert inputs.get("alert_notify") and inputs.get("photo_dir") and inputs.get("status_page", True)
    assert all(inputs.get(page) for page in ("climate", "air", "plants", "status"))
    return inputs


def without_optional_pages() -> dict:
    inputs = without_visual()
    for key in ("climate", "air", "plants", "photo_dir", "alert_notify", "outside", "pressure"):
        inputs.pop(key, None)
    return inputs


@pytest.mark.parametrize("make_inputs, left_out", [
    (maximal_inputs, set()), (without_visual, set()), (without_optional_pages, {"climate", "air", "plants", "photos"}),
], ids=["maximal", "no-music-visual", "no-optional-pages"])
def test_every_setting_is_on_a_page_and_reset(tmp_path, make_inputs, left_out):
    """The standing rule (SPEC-021): rendered with every optional input (and without the optional
    ones), every input_number, input_boolean and input_select the package defines is a named state
    helper or on a settings page; every helper on a page is one the global reset sets, and on its
    own page's reset. A new state helper goes into STATE_HELPERS by name, in review. A view the
    render left out shows "not configured" without its switch (SPEC-021), which still exists."""
    rendered = render(tmp_path, make_inputs())
    package = rendered["package.yaml"]
    reset = run_reset(package)
    state_helpers = STATE_HELPERS | MUSIC_STATE_HELPERS
    for entity in helpers(package):
        assert entity in state_helpers or entity in reset, f"{entity}: neither a state helper nor reset"
    for lang in LANGS:
        # A sub-view's path is its reset page's (music-live: music_live).
        views = {path.replace("-", "_"): view for path, view in settings_views(rendered[f"ramka-settings.{lang}.yaml"], subviews=True).items()}
        on_pages = {e: path for path, view in views.items() for e in shown_entities(view)}
        for entity in helpers(package):
            if entity in PAGE_CONTROLS:
                assert on_pages.get(entity) == PAGE_CONTROLS[entity], f"{lang}: {entity} not on its page"
            elif entity in state_helpers:
                assert entity not in on_pages, f"{lang}: state helper {entity} on the {on_pages[entity]} page"
            elif entity in OFF_PAGE_SETTINGS:
                assert entity not in on_pages, f"{lang}: {entity} is on the {on_pages[entity]} page"
            elif entity.removeprefix("input_boolean.ramka_page_") in left_out:
                assert entity not in on_pages, f"{lang}: {entity} shown on a page the render left out"
            else:
                assert entity in on_pages, f"{lang}: {entity} is on no settings page"
        for path, view in views.items():
            for entity in shown_entities(view):
                if not entity.startswith("input_") or ".ramka_" not in entity or entity in PAGE_CONTROLS:
                    continue
                assert entity in reset, f"{lang}: {entity} on the {path} page and not reset"
                # On its own page's reset; the Advanced switch also sits on the pages with Advanced parts.
                assert PAGE_OF[entity] == path or (entity == "input_boolean.ramka_settings_advanced"
                                                   and path.replace("_", "-") in ADVANCED_PAGES), (entity, path)
                assert entity in run_reset(package, page=PAGE_OF[entity]), entity
        # audio-sensor's sensor update rate (amended 2026-10-30, #110) is a setting of the sensor, not
        # of a visual: not on the Music page (SPEC-025; the sensor sub-view's).
        music = "input_select.ramka_music_visual" in helpers(package)
        assert on_pages.get(SPECTRUM_RATE) != "music", lang
        if not music:
            assert SPECTRUM_RATE not in on_pages and SPECTRUM_RATE not in json.dumps(views), lang
    # The sensor sub-view's reset and the global reset set it to normal while it is there; a home
    # without audio-sensor (unknown: no such entity; unavailable) skips it rather than fails.
    there = {SPECTRUM_RATE: "fast"}
    expected = {SPECTRUM_RATE: "normal"} if music else {}
    for page in (None, "music_sensor") if music else (None,):
        assert {e: v for e, v in run_reset(package, page=page, states=there).items() if e == SPECTRUM_RATE} == expected, page
        for state in ("unknown", "unavailable"):
            assert SPECTRUM_RATE not in run_reset(package, page=page, states={SPECTRUM_RATE: state}), (page, state)
    for page in ["general"] + PAGE_VIEWS + ["controls"]:
        assert SPECTRUM_RATE not in run_reset(package, page=page, states=there), page


# Settings no page shows, which the resets still set: the redraw rate stays at its default, 30; the
# line width, the palette and the level's flavour (it has one to offer) since SPEC-025 amendment 1.
OFF_PAGE_SETTINGS = {"input_number.ramka_music_fps", "input_number.ramka_music_line_width_px",
                     "input_select.ramka_music_palette", "input_select.ramka_music_level_flavour"}

FALLBACK = re.compile(r"states\('(input_\w+\.ramka_\w+)'\)\s*\|\s*(?:int|float)\(([\d.]+)\)")


def test_fallbacks_equal_the_defaults(tmp_path, demo):
    cases = [(texts(tmp_path / "demo", demo_inputs())["package.yaml"], {**DEFAULTS, **MUSIC_DEFAULTS})]
    inputs = demo_inputs()
    inputs["settings_defaults"] = {"off_delay_s": 600, "near_cm": 80, "near_s": 2, "controls_hold_s": 10,
                                   "brightness_min": 30, "brightness_max": 180, "lux_max": 400}
    package = texts(tmp_path / "home", inputs)["package.yaml"]
    cases.append((package, run_reset(yaml.safe_load(package))))
    for text, defaults in cases:
        found = FALLBACK.findall(text)
        assert {e for e, _ in found} >= {f"input_number.ramka_{k}" for k in PRESENCE_NUMBERS}
        # State helpers (the plant page on screen) are no settings and have no default.
        for entity, fallback in found:
            if entity not in STATE_HELPERS:
                assert float(fallback) == float(defaults[entity]), entity


@pytest.mark.parametrize("defaults, message", [
    ({"tuning": 1}, r"ramka: settings_defaults: unknown key 'tuning'"),
    ({"off_delay_s": 5}, r"ramka: settings_defaults.off_delay_s must be within 10 and 1800"),
    ({"near_cm": 500}, r"ramka: settings_defaults.near_cm must be within 10 and 400"),
    ({"near_s": 0}, r"ramka: settings_defaults.near_s must be within 1 and 10"),
    ({"controls_hold_s": 601}, r"ramka: settings_defaults.controls_hold_s must be within 1 and 600"),
    ({"brightness_min": 0}, r"ramka: settings_defaults.brightness_min must be within 1 and 255"),
    ({"brightness_max": "bright"}, r"ramka: settings_defaults.brightness_max must be within 1 and 255"),
    ({"lux_max": 10}, r"ramka: settings_defaults.lux_max must be within 20 and 2000"),
    ({"brightness_min": 210}, r"ramka: settings_defaults: brightness_min above brightness_max"),
    ({"brightness_min": 100, "brightness_max": 90}, r"ramka: settings_defaults: brightness_min above brightness_max"),
    ({"theme_mode": "auto"}, r"ramka: settings_defaults.theme_mode must be dark or light"),
    ({"near_enabled": "yes"}, r"ramka: settings_defaults.near_enabled must be true or false"),
])
def test_settings_defaults_bad_input_fails(tmp_path, defaults, message):
    inputs = demo_inputs()
    inputs["settings_defaults"] = defaults
    with pytest.raises(dr.RenderError, match=message):
        render(tmp_path, inputs)


@pytest.mark.parametrize("options, message", [
    ({"spectrum": {"flavour": "tide"}}, r"ramka: music_visual_options.spectrum.flavour 'tide' is not a spectrum flavour"),
    ({"level": {"flavour": "dune"}}, r"ramka: music_visual_options.level.flavour 'dune' is not a level flavour"),
    ({"palette": "rainbow"}, r"ramka: music_visual_options.palette must be zones, series or calm"),
    ({"palette": [[0, "#000"], [1, "#fff"]]}, r"ramka: music_visual_options.palette must be zones, series or calm"),
    ({"rise": 2500}, r"ramka: music_visual_options.rise must be within 0 and 2000"),
    ({"fall": -1}, r"ramka: music_visual_options.fall must be within 0 and 30"),
    ({"line_width": 0.2}, r"ramka: music_visual_options.line_width must be within 0.5 and 12"),
    ({"fps": 120}, r"ramka: music_visual_options.fps must be within 1 and 60"),
    ({"spectrum": {"neutral": 140}}, r"ramka: music_visual_options.spectrum.neutral must be within 0 and 130"),
    ({"level": {"hot": "loud"}}, r"ramka: music_visual_options.level.hot must be within 0 and 130"),
    ({"spectrum": {"hot": 25}}, r"ramka: music_visual_options.spectrum: hot must be above neutral"),
    ({"level": {"neutral": 70, "hot": 70}}, r"ramka: music_visual_options.level: hot must be above neutral"),
    ({"tilt": "yes"}, r"ramka: music_visual_options.tilt must be true or false"),
])
def test_music_visual_options_bad_values_fail(tmp_path, options, message):
    with pytest.raises(dr.RenderError, match=message):
        render(tmp_path, with_visual(options=options))


@pytest.mark.parametrize("presets, message", [
    ({"wled_pink": {}}, r"ramka: music_eq_presets: unknown preset 'wled_pink'"),
    ({"behind_speakers": {"treble": 1}}, r"ramka: music_eq_presets.behind_speakers: unknown key 'treble'"),
    ({"behind_speakers": {"bass": -19}}, r"ramka: music_eq_presets.behind_speakers.bass must be within -18 and 12"),
    ({"half_match": {"air": 13}}, r"ramka: music_eq_presets.half_match.air must be within -18 and 12"),
    ({"fitted": 3}, r"ramka: music_eq_presets.fitted must be a mapping"),
])
def test_music_eq_presets_bad_input_fails(tmp_path, presets, message):
    inputs = with_visual()
    inputs["music_eq_presets"] = presets
    with pytest.raises(dr.RenderError, match=message):
        render(tmp_path, inputs)


def test_music_eq_presets_at_the_limits_render(tmp_path):
    inputs = with_visual()
    inputs["music_eq_presets"] = {"behind_speakers": {"bass": -18, "air": 12}, "fitted": {}}
    render(tmp_path, inputs)


def test_music_eq_presets_alone_change_nothing(tmp_path):
    inputs = without_visual()
    inputs["music_eq_presets"] = {"behind_speakers": {"bass": -10}}
    assert texts(tmp_path / "a", inputs) == texts(tmp_path / "b", without_visual())


def test_settings_defaults_at_the_limits_render(tmp_path, plain):
    numbers = plain["package.yaml"]["input_number"]
    inputs = with_visual(options={"rise": 0, "fall": 30, "line_width": 12, "fps": 1,
                                  "spectrum": {"neutral": 0, "hot": 130}, "level": {"neutral": 129, "hot": 130}})
    inputs["settings_defaults"] = {k: numbers[f"ramka_{k}"]["max"] for k in PRESENCE_NUMBERS}
    package = render(tmp_path, inputs)["package.yaml"]
    assert run_reset(package)["input_number.ramka_off_delay_s"] == numbers["ramka_off_delay_s"]["max"]


# ---- page switches -----------------------------------------------------------------------------


def ambient_pages_sensor(package):
    [sensor] = [e for block in package["template"] for e in block.get("sensor", [])
                if e["default_entity_id"] == "sensor.ramka_ambient_pages"]
    return sensor


def live_pages(package, off=(), on_states=None):
    """The ambient-pages sensor evaluated with every switch on but `off`: (state, pages, all_off)."""
    sensor = ambient_pages_sensor(package)
    states = {f"input_boolean.ramka_page_{v}": "off" if v in off else "on" for v in PAGE_VIEWS}
    states.update(on_states or {})
    return (ha_value(sensor["state"], states=states), ha_value(sensor["attributes"]["pages"], states=states),
            ha_value(sensor["attributes"]["all_off"], states=states))


def test_ambient_pages_follow_the_switches(tmp_path, demo):
    package = demo["package.yaml"]
    sensor = ambient_pages_sensor(package)
    assert sensor["unique_id"] == "ramka_ambient_pages"
    assert sensor["attributes"]["component"] == "ramka"
    assert live_pages(package) == (5, RAMKA_PAGES, False)
    assert live_pages(package, off=["air"]) == (4, ["climate", "plants", "photos", "status"], False)
    # Calendar and music are no ambient pages.
    assert live_pages(package, off=["calendar", "music"]) == (5, RAMKA_PAGES, False)
    # The render is the outer limit: a page it left out stays out with its switch on.
    fewer = render(tmp_path, without_pages("plants"))["package.yaml"]
    assert live_pages(fewer) == (4, ["climate", "air", "photos", "status"], False)
    # Never empty: with every switch off, the first rendered page and the warning flag.
    assert live_pages(package, off=RAMKA_PAGES) == (1, ["climate"], True)
    assert live_pages(fewer, off=["climate", "air", "photos", "status"]) == (1, ["climate"], True)
    # A switch not yet restored (before the seed) counts as off.
    assert live_pages(package, on_states={"input_boolean.ramka_page_climate": "unknown"})[1] == RAMKA_PAGES[1:]


def next_page(template, here, live):
    attrs = {"sensor.ramka_ambient_pages": {"pages": live}} if live is not None else {}
    return ha(template, states={"input_select.ramka_ambient": here}, attrs=attrs)


def loop_stages(package):
    return package["script"]["ramka_ambient_loop"]["sequence"][0]["repeat"]["sequence"]


def run_rotation(package, start, live, steps=6) -> list[str]:
    """The loop's pass, evaluated: each stage whose page is current hands on to the template's
    choice; the guard first."""
    here, seen = start, []
    for _ in range(steps):
        for stage in loop_stages(package):
            condition = stage["if"][0]
            if condition["condition"] == "template":
                if ha(condition["value_template"], states={"input_select.ramka_ambient": here},
                      attrs={"sensor.ramka_ambient_pages": {"pages": live}}) == "True":
                    here = next_page(stage["then"][0]["data"]["option"], here, live)
                continue
            if condition["state"] == here:
                seen.append(here)
                here = next_page(hand_on(stage)["data"]["option"], here, live)
    return seen


@pytest.mark.parametrize("dropped", [(), ("air",), ("climate", "air", "plants")])
def test_loop_and_swipes_read_the_live_list(tmp_path, dropped):
    package = render(tmp_path, without_pages(*dropped))["package.yaml"]
    pages = [p for p in RAMKA_PAGES if p not in dropped]
    # Every stage, the guard, both swipes and swipe up read the live list.
    for stage in loop_stages(package):
        option = (stage["then"][0] if stage["if"][0]["condition"] == "template" else hand_on(stage))["data"]["option"]
        assert "sensor.ramka_ambient_pages" in option
    assert loop_stages(package)[0]["if"][0]["condition"] == "template"
    for script in ("ramka_ambient_next", "ramka_ambient_prev", "ramka_swipe_up"):
        steps = [s for s in package["script"][script]["sequence"]
                 if s.get("action") == "input_select.select_option" and s["target"]["entity_id"] == "input_select.ramka_ambient"]
        assert len(steps) == 1 and "sensor.ramka_ambient_pages" in steps[0]["data"]["option"], script
    # All on: round the rendered pages; a page switched off is skipped.
    assert run_rotation(package, pages[0], pages)[:len(pages)] == pages
    live = pages[1:] if len(pages) > 1 else pages
    assert run_rotation(package, live[0], live)[:len(live) + 1] == live + [live[0]]
    # The sensor not there yet (a first start): the rendered pages.
    assert run_rotation(package, pages[0], None)[:len(pages)] == pages


def test_swipes_step_through_the_live_list(demo):
    package = demo["package.yaml"]
    nxt = next(s for s in package["script"]["ramka_ambient_next"]["sequence"] if "data" in s)["data"]["option"]
    prv = next(s for s in package["script"]["ramka_ambient_prev"]["sequence"] if "data" in s)["data"]["option"]
    live = ["climate", "plants", "status"]
    assert [next_page(nxt, here, live) for here in live] == ["plants", "status", "climate"]
    assert [next_page(prv, here, live) for here in live] == ["status", "climate", "plants"]
    # From a page switched off while it shows: the next and the previous live page around it.
    assert (next_page(nxt, "air", live), next_page(prv, "air", live)) == ("plants", "climate")
    assert (next_page(nxt, "unknown", live), next_page(prv, "unknown", live)) == ("climate", "climate")
    up = next(s for s in package["script"]["ramka_swipe_up"]["sequence"]
              if s.get("target", {}).get("entity_id") == "input_select.ramka_ambient")["data"]["option"]
    assert next_page(up, "status", live) == "climate"
    assert next_page(up, "status", ["air", "photos"]) == "air"
    [stop] = [a for a in package["automation"] if a["id"] == "ramka_ambient_stop"]
    rest = next(a for a in walk(stop["actions"]) if a.get("target", {}).get("entity_id") == "input_select.ramka_ambient")
    assert next_page(rest["data"]["option"], "status", ["air", "photos"]) == "air"


def test_the_last_page_switched_off_leaves_the_first(demo):
    """Every ambient switch off: the sensor lists the first rendered page (and all_off), so the
    rotation rests there and the swipes go nowhere else; it never runs out of pages."""
    package = demo["package.yaml"]
    _, live, all_off = live_pages(package, off=RAMKA_PAGES)
    assert (live, all_off) == (["climate"], True)
    assert run_rotation(package, "status", live)[:3] == ["climate", "climate", "climate"]
    for script in ("ramka_ambient_next", "ramka_ambient_prev"):
        option = next(s for s in package["script"][script]["sequence"] if "data" in s)["data"]["option"]
        assert next_page(option, "climate", live) == "climate"


def test_music_and_calendar_switches(demo):
    package = demo["package.yaml"]
    [music_view] = [e for block in package["template"] for e in block.get("binary_sensor", [])
                    if e["unique_id"] == "ramka_music_view"]
    playing = {"binary_sensor.ramka_media_playing": "on", "input_boolean.ramka_ambient_music": "on"}
    assert ha(music_view["state"], states={**playing, "input_boolean.ramka_page_music": "on"}) == "True"
    assert ha(music_view["state"], states={**playing, "input_boolean.ramka_page_music": "off"}) == "False"
    first = package["script"]["ramka_show_calendar"]["sequence"][0]
    assert first == {"condition": "state", "entity_id": "input_boolean.ramka_page_calendar", "state": "on"}
    switch = {"condition": "state", "entity": "input_boolean.ramka_page_calendar", "state": "on"}
    for lang in LANGS:
        names = translations(lang)
        tiles = [n for n in walk(demo[f"dashboard.{lang}.yaml"]) if n.get("type") == "tile"
                 and n.get("name") == names["ui.calendar.button"]]
        assert len(tiles) == 2, lang
        for tile in tiles:
            assert switch in tile["visibility"], lang


def test_controls_tile_gone(demo):
    for lang in LANGS:
        dashboard = demo[f"dashboard.{lang}.yaml"]
        assert not [n for n in walk(dashboard) if n.get("type") == "custom:tap-button-card"
                    and "ramka_music_visual" in json.dumps(n)], lang
    # The near_enabled tile stays (since 0.1.0).
    assert [n for n in walk(demo["dashboard.en.yaml"]) if n.get("entity") == "input_boolean.ramka_near_enabled"]
    assert not [k for k in translations("en") if k.startswith("ui.music_visual.")]


def bound(prefix, kind):
    helper = "spectrum" if kind == "spectrum" else "level"
    return {
        "flavour": f"input_select.{prefix}_music_{helper}_flavour",
        "fps": f"input_number.{prefix}_music_fps",
        "colour": {"palette": f"input_select.{prefix}_music_palette",
                   "neutral": f"input_number.{prefix}_music_{helper}_neutral_db",
                   "hot": f"input_number.{prefix}_music_{helper}_hot_db"},
        "dynamics": {"rise": f"input_number.{prefix}_music_rise_ms", "fall": f"input_number.{prefix}_music_fall_s",
                     "tilt": f"input_boolean.{prefix}_music_tilt", "hold": f"input_number.{prefix}_music_hold_s",
                     "eq": {k: f"input_number.{prefix}_music_eq_{k}" for k in ("sub", "bass", "low_mid", "mid", "presence", "air")}},
        "style": {"line_width": f"input_number.{prefix}_music_line_width_px"},
        "look": f"sensor.{prefix}_music_look",
    }


@pytest.mark.parametrize("prefix", ["ramka", "hall_frame"])
def test_visual_configs_bind_the_helpers(tmp_path, prefix):
    inputs = with_visual(options={"spectrum": {"flavour": "bars"}, "rise": 100})
    inputs["prefix"] = prefix
    rendered = render(tmp_path, inputs)
    package = rendered["package.yaml"]
    for lang in LANGS:
        visual = now_playing(rendered[f"dashboard.{lang}.yaml"])["visual"]
        assert visual == {
            "select": f"input_select.{prefix}_music_visual", "live": f"input_boolean.{prefix}_music_live",
            "spectrum": {"type": "custom:ambient-wave-card",
                         "source": {"kind": "spectrum", "entity": "sensor.music_spectrum", "offset": "sensor.music_spl_offset"},
                         "active": f"binary_sensor.{prefix}_media_playing", "fallback": "classic", **bound(prefix, "spectrum")},
            "level": {"type": "custom:ambient-wave-card",
                      "source": {"kind": "scalar", "entity": "sensor.music_level"},
                      "active": f"binary_sensor.{prefix}_media_playing", "fallback": "classic", **bound(prefix, "level")},
        }, lang
        # Every bound id is a helper the package defines.
        for entity in strings(visual):
            domain, _, key = entity.partition(".")
            if domain.startswith("input_"):
                assert key in package[domain], entity


def card_states(package, values):
    """Hass states for the card: each helper's value as Home Assistant reports it."""
    out = {}
    for entity, value in values.items():
        out[entity] = {"state": value if isinstance(value, str) else str(float(value))}
    return out


def test_visual_configs_pass_the_card_normaliser(tmp_path, demo):
    """The bound configs go through ambient-wave-card's own normaliseConfig and resolveOptions in
    node: entity values pass, the seeded states give the defaults, unavailable helpers the card's."""
    import shutil
    import subprocess

    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH (eval \"$(fnm env --shell zsh)\")")
    visual = now_playing(demo["dashboard.en.yaml"])["visual"]
    configs = [visual["spectrum"], visual["level"]]
    seeded = card_states(demo["package.yaml"], run_reset(demo["package.yaml"], groups=["music_visual"]))
    script = tmp_path / "normalise.mjs"
    script.write_text(
        f"import {{ normaliseConfig, resolveOptions }} from {json.dumps((AUDIO_CARDS / 'lib' / 'config.js').as_uri())};\n"
        f"import {{ FLAVOUR_KINDS }} from {json.dumps((AUDIO_CARDS / 'lib' / 'flavours' / 'index.js').as_uri())};\n"
        "const [configs, states] = JSON.parse(process.argv[2]);\n"
        "const out = configs.map((c) => {\n"
        "  const config = normaliseConfig(c, FLAVOUR_KINDS);\n"
        "  return [config, resolveOptions(config, states, FLAVOUR_KINDS), resolveOptions(config, {}, FLAVOUR_KINDS)];\n"
        "});\n"
        "process.stdout.write(JSON.stringify(out));\n",
        encoding="utf-8")
    result = subprocess.run([node, str(script), json.dumps([configs, seeded])], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    (spectrum, s_seeded, s_none), (level, l_seeded, l_none) = json.loads(result.stdout)
    assert spectrum["flavour"] == "input_select.ramka_music_spectrum_flavour"
    assert (s_seeded["flavour"], l_seeded["flavour"]) == ("dune", "centre")
    for resolved in (s_seeded, l_seeded):
        assert resolved["style"]["line_width"] == 2.8
        assert (resolved["colour"]["neutral"], resolved["colour"]["hot"], resolved["colour"]["palette"]) == (30, 70, "series")
        assert (resolved["dynamics"]["rise"], resolved["dynamics"]["fall"], resolved["dynamics"]["tilt"]) == (200, 4, True)
        assert resolved["fps"] == 30
    # Every helper unavailable: the card's own defaults (its 4 px line, not Ramka's 2.8).
    for resolved, flavour in ((s_none, "dune"), (l_none, "centre")):
        assert resolved["flavour"] == flavour
        assert resolved["style"]["line_width"] == 4
        assert (resolved["colour"]["neutral"], resolved["colour"]["hot"]) == (30, 70)
        assert resolved["fps"] == 30


def test_flavour_options_match_the_card_registry(tmp_path, demo):
    import shutil
    import subprocess

    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH (eval \"$(fnm env --shell zsh)\")")
    script = tmp_path / "registry.mjs"
    script.write_text(
        f"import {{ NAMED_PALETTES }} from {json.dumps((AUDIO_CARDS / 'lib' / 'config.js').as_uri())};\n"
        f"import {{ flavoursFor }} from {json.dumps((AUDIO_CARDS / 'lib' / 'flavours' / 'index.js').as_uri())};\n"
        "process.stdout.write(JSON.stringify([flavoursFor('spectrum'), flavoursFor('scalar'), NAMED_PALETTES]));\n",
        encoding="utf-8")
    result = subprocess.run([node, str(script)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    spectrum, scalar, palettes = json.loads(result.stdout)
    selects = demo["package.yaml"]["input_select"]
    # The palette: the default first, then the rest in the registry's order.
    assert selects["ramka_music_palette"]["options"] == ["series"] + [o for o in palettes if o != "series"]
    # The flavours the Live visualization sub-view offers (SPEC-025 amendment 1), all the registry's.
    assert selects["ramka_music_spectrum_flavour"]["options"] == ["dune", "halo", "bars"]
    assert selects["ramka_music_level_flavour"]["options"] == ["centre"]
    assert {"dune", "halo", "bars"} <= set(spectrum) and "centre" in scalar
    # A home's own flavour (music_visual_options, any of the registry's) joins them, first: its default.
    own = render(tmp_path / "own", with_visual(options={"spectrum": {"flavour": "veil"}, "level": {"flavour": "tide"}}))["package.yaml"]
    assert own["input_select"]["ramka_music_spectrum_flavour"]["options"] == ["veil", "dune", "halo", "bars"]
    assert own["input_select"]["ramka_music_level_flavour"]["options"] == ["tide", "centre"]
    assert run_reset(own, page="music_live")["input_select.ramka_music_spectrum_flavour"] == "veil"
    # One of the offered ones stays where it is, first.
    bars = render(tmp_path / "bars", with_visual(options={"spectrum": {"flavour": "bars"}}))["package.yaml"]
    assert bars["input_select"]["ramka_music_spectrum_flavour"]["options"] == ["bars", "dune", "halo"]


def test_theme_mode(demo):
    package = demo["package.yaml"]
    assert package["input_select"]["ramka_theme_mode"]["options"] == ["dark", "light"]
    [automation] = [a for a in package["automation"] if a["id"] == "ramka_theme_mode"]
    assert {"trigger": "homeassistant", "event": "start"} in automation["triggers"]
    assert any(t.get("entity_id") == "input_select.ramka_theme_mode" for t in automation["triggers"])
    calls = [a for a in automation["actions"] if a.get("action") == "frontend.set_theme"]
    assert len(calls) == 2
    assert "mode" not in calls[0]["data"] and calls[1]["data"]["mode"] == "dark"
    variables = automation["actions"][0]["variables"]
    for mode in ("dark", "light"):
        theme = ha(variables["theme"], states={"input_select.ramka_theme_mode": mode})
        assert theme == f"ramka-{mode}"
        assert all(ha(c["data"]["name"], theme=theme) == theme for c in calls)
    assert ha(variables["theme"], states={}) == "ramka-dark"
    for lang in LANGS:
        assert all("theme" not in view for view in demo[f"dashboard.{lang}.yaml"]["views"]), lang
    themes = yaml.safe_load((COMP / "themes" / "ramka.yaml").read_text(encoding="utf-8"))
    assert {"ramka", "ramka-dark", "ramka-light"} <= set(themes)
    # Single-mode themes (SPEC-021 amendment, C19): a theme whose modes hold only one mode is
    # forced into it (frontend 20260826.7, src/state/themes-mixin.ts), and the frontend applies its
    # own defaults of that mode, so nothing of the frontend is copied here to go stale.
    series = {mode: themes["ramka"]["modes"][mode] for mode in ("dark", "light")}
    assert len(series["dark"]) == len(series["light"]) == 11
    assert themes["ramka-dark"] == {"modes": {"dark": series["dark"]}}
    assert themes["ramka-light"] == {"modes": {"light": series["light"]}}


def test_an_empty_photo_pick_still_takes_a_slot(demo):
    """With photos the only live page and an empty pick (an empty folder, a share not mounted), the
    stage hands on to photos again: without a pause the loop would spin and call the pick on every
    pass. An empty pick waits one photo slot (the time per photo) instead; a pick with photos does not."""
    [stage] = [s for s in loop_stages(demo["package.yaml"])
               if s["if"][0].get("state") == "photos"]
    pauses = [step for step in stage["then"] if "if" in step and any("delay" in t for t in step["then"])]
    assert len(pauses) == 1
    [condition] = pauses[0]["if"]
    # The series the pick left in sensor.ramka_photo_series (SPEC-026).
    assert ha(condition["value_template"], attrs={SERIES: {"photos": []}}) == "True"
    assert ha(condition["value_template"]) == "True"
    assert ha(condition["value_template"], attrs={SERIES: {"photos": ["a/1.jpg"], "index": 1}}) == "False"
    [pause] = [t["delay"]["seconds"] for t in pauses[0]["then"] if "delay" in t]
    assert ha(pause) == "10" and ha(pause, states={"input_number.ramka_photo_s": "25"}) == "25"
    # The pause sits after the photos and before the hand-on to the next page.
    steps = stage["then"]
    assert steps.index(pauses[0]) == len(steps) - 2


# ---- 0.4.0: the "Ramka settings" dashboard (SPEC-021) --------------------------------------------

SETTINGS_PAGES = ["general", *PAGE_VIEWS[:-1], "controls", "music", "about"]
# The music sensor's own settings (SPEC-025): a sub-view after Music, reached from its Basic.
SENSOR_VIEW = "music-sensor"
# The music visual's own settings (SPEC-025 amendment 1): a sub-view after Music, reached from it.
LIVE_VIEW = "music-live"
MIC_GAIN = "sensor.music_mic_gain"
ADVANCED_ON = {"condition": "state", "entity": "input_boolean.ramka_settings_advanced", "state": "on"}
MUSIC_SOURCE = "input_select.audio_sensor_music_source"
# audio-sensor's sensor update rate and watching flag (SPEC-021, amended 2026-10-30, #99, #110).
SPECTRUM_RATE = "input_select.audio_sensor_music_spectrum_rate"
MUSIC_WATCHING = "input_boolean.audio_sensor_music_watching"
RATE_THERE = {"condition": "state", "entity": SPECTRUM_RATE, "state_not": "unavailable"}
# The source select's row: shown while audio-sensor provides it (a missing entity reads unknown).
SOURCE_EXISTS = {"condition": "state", "entity": MUSIC_SOURCE, "state_not": ["unavailable", "unknown"]}
# The music source contract's abilities (SPEC-025): what the selected board can do.
MUSIC_CONTRACT_IDS = {"sensor.music_source", *(f"binary_sensor.music_source_{a}" for a in ("spectrum", "level", "rate", "calibration"))}
# Where each setting sits (SPEC-021's page table): Basic or Advanced.
BASIC = {
    "general": {"input_select.ramka_theme_mode", "input_number.ramka_off_delay_s",
                "input_number.ramka_brightness_min", "input_number.ramka_brightness_max",
                "input_boolean.ramka_settings_advanced"},
    **{v: {f"input_boolean.ramka_page_{v}"} for v in PAGE_VIEWS},
    "controls": {e for e, where in CONTROLS_SETTINGS.items() if where == "basic"} | {"input_boolean.ramka_settings_advanced"},
}
# The Music page: its switch and the live switch (SPEC-025 amendment 1); the visual's settings are the
# Live visualization sub-view's, its mode, flavour and sensor Basic, the rest Advanced.
BASIC["music"] |= {MUSIC_LIVE}
BASIC[LIVE_VIEW] = {"input_select.ramka_music_visual", "input_select.ramka_music_spectrum_flavour",
                    "input_boolean.ramka_settings_advanced", MUSIC_SOURCE}
BASIC["photos"] |= {"input_number.ramka_photo_count", "input_number.ramka_photo_s", "input_boolean.ramka_settings_advanced"}
BASIC["climate"] |= {"input_boolean.ramka_settings_advanced"}
BASIC["plants"] |= {"input_number.ramka_plants_per_page", "input_boolean.ramka_settings_advanced"}
BASIC["air"] |= {f"input_boolean.ramka_air_{r}" for r in AIR_READINGS} | {"input_boolean.ramka_settings_advanced"}
# The pages besides General that have Advanced parts, and so the Advanced switch too.
ADVANCED_PAGES = {LIVE_VIEW, "photos", "air", "climate", "plants", "controls"}
ADVANCED = {
    "general": {"input_number.ramka_lux_max"},
    "controls": {e for e, where in CONTROLS_SETTINGS.items() if where == "advanced"},
    LIVE_VIEW: {"input_select.ramka_music_template",
              # The response profile (Custom's rows and each template's own, the EQ select) and the colour range.
              "input_select.ramka_music_eq", "input_number.ramka_music_hold_s",
              *(f"input_number.ramka_music_eq_{k}" for k in ("sub", "bass", "low_mid", "mid", "presence", "air")),
              "input_number.ramka_music_rise_ms", "input_number.ramka_music_fall_s", "input_boolean.ramka_music_tilt",
              *(f"input_number.ramka_{k}" for k in MUSIC_DB), *PROFILE_DEFAULTS},
    "photos": {ALBUMS},
    # The number of widgets and the threshold-based colours sit in the Advanced card with the widgets.
    "climate": {CLIMATE, SLOTS, THRESHOLDS},
    "plants": {"input_number.ramka_plants_page_s"},
    "air": {f"input_number.ramka_air_{k}" for k in AIR_LIMITS},
}
# What audio-sensor provides that the Music page reads (its manifest's provides, Ramka's consumes).
AUDIO_SENSOR_IDS = {MUSIC_SOURCE, "sensor.music_spl_offset", "sensor.music_spl_calibration", "sensor.music_mic_gain",
                    "input_number.audio_sensor_measured_offset", "input_text.audio_sensor_calibration_note",
                    "script.audio_sensor_apply_calibration", *MUSIC_CONTRACT_IDS}
# The page each input adds, and how a render leaves it out.
NOT_CONFIGURED = [("climate", "climate"), ("air", "air"), ("plants", "plants"), ("photos", "photo_dir"),
                  ("status", "status_page"), ("music", "music_visual")]


def settings_views(dashboard, subviews=False) -> dict[str, dict]:
    """A dashboard's views by path; the settings pages only, unless `subviews`: a sub-view (the music
    sensor's, SPEC-025) is no page of its own, no tab, no preview tab, no page Reset of the table."""
    return {view["path"]: view for view in dashboard["views"] if subviews or not view.get("subview")}


def view_cards(view):
    """Every card of a sections view, with its section: (section, card), nested stacks included."""
    for section in view["sections"]:
        for card in section["cards"]:
            yield section, card


def rows(card) -> list[dict]:
    """An entities card's rows; a conditional row as the row it shows."""
    if card.get("type") != "entities":
        return []
    out = [r if isinstance(r, dict) else {"entity": r} for r in card.get("entities", [])]
    return [r["row"] if r.get("type") == "conditional" else r for r in out]


def row_conditions(card, entity) -> list[dict]:
    """The conditions of an entities card's conditional row for `entity` ([] for a plain row)."""
    for r in card.get("entities", []):
        if isinstance(r, dict) and r.get("type") == "conditional" and r["row"].get("entity") == entity:
            return r["conditions"]
    return []


def shown_entities(view) -> set[str]:
    """The entities a page shows as rows, tiles or cards (not the ones its conditions read)."""
    out = set()
    for _, card in view_cards(view):
        if card.get("entity"):
            out.add(card["entity"])
        out |= {r["entity"] for r in rows(card) if r.get("entity")}
    return out


def advanced(section, card) -> bool:
    return ADVANCED_ON in (section.get("visibility") or []) + (card.get("visibility") or [])


def markdown(view) -> str:
    return "\n".join(card["content"] for _, card in view_cards(view) if card.get("type") == "markdown")


def reset_actions(view):
    """Every tap that runs the Ramka's reset script on a page, from cards and rows."""
    for _, card in view_cards(view):
        for node in walk(card):
            if node.get("perform_action") == "script.ramka_settings_reset":
                yield node


def settings_texts(lang) -> dict[str, str]:
    return {k: v for k, v in translations(lang).items() if k.startswith("ui.settings.")}


def test_settings_dashboard_pages_per_language(demo):
    en = settings_texts("en")
    assert en
    for lang in LANGS:
        dashboard = demo[f"ramka-settings.{lang}.yaml"]
        t = settings_texts(lang)
        assert dashboard["title"] == t["ui.settings.title"]
        assert "kiosk_mode" not in dashboard
        assert [v["path"] for v in dashboard["views"]] == SETTINGS_PAGES[:-1] + [LIVE_VIEW, SENSOR_VIEW, "about"], lang
        for view in settings_views(dashboard).values():
            assert view["title"] == t[f"ui.settings.pages.{view['path']}"], (lang, view["path"])
            assert view["type"] == "sections" and "theme" not in view
            # Each row of a Ramka helper carries its translated name.
            for _, card in view_cards(view):
                for row in rows(card):
                    entity = row.get("entity", "")
                    if ".ramka_" in entity and entity.startswith("input_"):
                        # A template's own helper is labelled as Custom's (music_calm_rise_ms -> music_rise_ms).
                        key = re.sub(r"^music_(?:behind_speakers|lively|calm|analyser)_", "music_", entity.split(".ramka_", 1)[1])
                        assert row["name"] == t["ui.settings." + key], (lang, entity)
        if lang == "en":
            continue
        shown = list(strings(dashboard))
        for key, value in t.items():
            if value == en[key] or "`" in en[key] or "\n" in en[key] or en[key] in SETTINGS_PAGES + list(ABILITY_SENSORS):
                continue  # (a page path, such as "air", or an ability id the abilities line reads, is no English text)
            assert not any(word(en[key]).search(s) for s in shown), f"{lang}: English {en[key]!r} ({key})"
    assert "ß" not in json.dumps(demo["ramka-settings.de.yaml"], ensure_ascii=False)


def test_settings_page_switches_at_the_top(demo):
    views = settings_views(demo["ramka-settings.en.yaml"])
    for view in PAGE_VIEWS:
        first = views[view]["sections"][0]
        [switch] = [c for c in first["cards"] if f"input_boolean.ramka_page_{view}" in {r.get("entity") for r in rows(c)}]
        assert not advanced(first, switch)
        # While the switch is off, the page says the tablet leaves the view out.
        notes = [c for _, c in view_cards(views[view]) if c.get("type") == "markdown"
                 and {"condition": "state", "entity": f"input_boolean.ramka_page_{view}", "state": "off"} in c.get("visibility", [])]
        assert len(notes) == 1, view
        assert notes[0]["content"] == translations("en")["ui.settings.page_off"]


@pytest.mark.parametrize("page, dropped", NOT_CONFIGURED)
def test_settings_page_not_configured(tmp_path, page, dropped):
    inputs = without_visual() if dropped == "music_visual" else (
        {**with_visual(), "status_page": False} if dropped == "status_page" else
        {k: v for k, v in with_visual().items() if k not in PAGE_INPUTS.get(page, (dropped,))})
    rendered = render(tmp_path, inputs)
    en = translations("en")
    for lang in LANGS:
        t = translations(lang)
        view = settings_views(rendered[f"ramka-settings.{lang}.yaml"])[page]
        text = markdown(view)
        assert t["ui.settings.not_configured"] in text, lang
        assert f"`{dropped}`" in text and "`domosenso/ramka.inputs.yaml`" in text and "`domosenso render ramka`" in text
        if page == "music":
            # The now-playing view is there without the visual: its switch stays, the visual parts go.
            assert shown_entities(view) == {"input_boolean.ramka_page_music"}
            assert not [n for n in walk(view) if n.get("type") == "custom:ambient-wave-card"]
            assert not {e for e in AUDIO_SENSOR_IDS if e in json.dumps(view)}
            assert len(list(reset_actions(view))) == 1
        else:
            # Its switch would change nothing: no switch, no settings, no reset.
            assert not shown_entities(view), (lang, shown_entities(view))
            assert not list(reset_actions(view))
    # A configured page has no such card.
    demo_views = settings_views(render(tmp_path / "demo", with_visual())["ramka-settings.en.yaml"])
    assert en["ui.settings.not_configured"] not in markdown(demo_views[page])


def test_calendar_page_always_configured(tmp_path):
    inputs = {k: v for k, v in demo_inputs().items() if k in ("prefix", "radar", "media_player", "weather", "calendar", "tablet_device", "air")}
    view = settings_views(render(tmp_path, inputs)["ramka-settings.en.yaml"])["calendar"]
    assert "input_boolean.ramka_page_calendar" in shown_entities(view)
    assert translations("en")["ui.settings.not_configured"] not in markdown(view)


def test_advanced_cards_follow_the_switch(demo):
    for lang in LANGS:
        views = settings_views(demo[f"ramka-settings.{lang}.yaml"], subviews=True)
        for path, view in views.items():
            basic, extra = BASIC.get(path, set()), ADVANCED.get(path, set())
            seen = set()
            for section, card in view_cards(view):
                shown = ({card.get("entity")} | {r.get("entity") for r in rows(card)}) - {None}
                seen |= shown
                if shown & extra:
                    assert advanced(section, card), (lang, path, shown & extra)
                if shown & basic:
                    assert not advanced(section, card), (lang, path, shown & basic)
                if advanced(section, card):
                    assert not shown & basic, (lang, path)
                    # Advanced cards carry the condition themselves (SPEC-021), not only their section.
                    assert ADVANCED_ON in card.get("visibility", []), (lang, path, card.get("type"))
            assert basic | extra <= seen, (lang, path, (basic | extra) - seen)
        # The switch sits on General and on every page with Advanced parts.
        on = {p for p, v in views.items() if "input_boolean.ramka_settings_advanced" in shown_entities(v)}
        assert on == {"general", *ADVANCED_PAGES}


def test_settings_reset_buttons(demo):
    for lang in LANGS:
        t = translations(lang)
        views = settings_views(demo[f"ramka-settings.{lang}.yaml"])
        assert not list(reset_actions(views.pop("about")))  # read-only: nothing to reset (SPEC-023)
        for path, view in views.items():
            [action] = list(reset_actions(view))
            if path == "general":
                assert not action.get("data"), action
                assert action["confirmation"]["text"] == t["ui.settings.reset_all_confirm"]
            else:
                assert action["data"] == {"page": path}
                assert action["confirmation"]["text"] == t["ui.settings.reset_confirm"]
        # The reset is the last section of each page.
        for path, view in views.items():
            last = view["sections"][-1]
            assert any(n.get("perform_action") == "script.ramka_settings_reset" for n in walk(last)), path


def live_subview(dashboard) -> dict:
    return settings_views(dashboard, subviews=True)[LIVE_VIEW]


def sensor_widget(view) -> dict:
    """The Live visualization sub-view's Sensor widget: the section after the preview."""
    return view["sections"][1]


def test_music_page_reads_the_source_contract(demo):
    """The Live visualization sub-view reads the music source contract (SPEC-025): the source select
    in its Sensor widget, shown while audio-sensor provides it, with its abilities line; the
    calibration and the update rate are not on it (the sensor sub-view's), nor on the Music page."""
    manifest = yaml.safe_load((COMP / "component.yaml").read_text(encoding="utf-8"))
    consumed = {c["id"] for c in manifest["consumes"] if "id" in c and c["component"] == "audio-sensor"}
    audio = yaml.safe_load((REPO / "components/audio-sensor/component.yaml").read_text(encoding="utf-8"))
    provided = {e["id"] for e in audio["provides"]["entities"]}
    assert AUDIO_SENSOR_IDS <= consumed <= provided
    assert MUSIC_CONTRACT_IDS <= AUDIO_SENSOR_IDS
    for lang in LANGS:
        t = translations(lang)
        dashboard = demo[f"ramka-settings.{lang}.yaml"]
        view = live_subview(dashboard)
        basic = sensor_widget(view)
        assert heading_of(basic) == t["ui.settings.music_source"] and not basic.get("visibility"), lang
        [select] = [c for c in basic["cards"] if MUSIC_SOURCE in {r.get("entity") for r in rows(c)}]
        assert row_conditions(select, MUSIC_SOURCE) == [SOURCE_EXISTS], lang
        [row] = [r for r in rows(select) if r.get("entity") == MUSIC_SOURCE]
        assert row["name"] == t["ui.settings.music_source"], lang
        assert not advanced(basic, select) and not select.get("visibility"), lang
        assert MUSIC_SOURCE not in json.dumps(settings_views(dashboard)["music"]), lang
        text = json.dumps(view)
        for gone in ("input_number.audio_sensor_measured_offset", "input_text.audio_sensor_calibration_note",
                     "script.audio_sensor_apply_calibration", "sensor.music_spl_calibration", "sensor.music_mic_gain",
                     SPECTRUM_RATE):
            assert gone not in text, (lang, gone)
        assert t["ui.settings.calibration"] not in {heading_of(s) for s in view["sections"]}, lang


MUSIC_VISUAL = "input_select.ramka_music_visual"


def visual_is(kind) -> dict:
    return {"condition": "state", "entity": MUSIC_VISUAL, "state": kind}


LIVE_ON = {"condition": "state", "entity": MUSIC_LIVE, "state": "on"}
LIVE_OFF = {"condition": "state", "entity": MUSIC_LIVE, "state_not": "on"}
# A (SPEC-025, amendment 1): Live is on, and the selected sensor has the visual's ability.
ACTIVE = {"condition": "and", "conditions": [LIVE_ON, {"condition": "or", "conditions": [
    {"condition": "and", "conditions": [visual_is(kind), {"condition": "state", "entity": f"binary_sensor.music_source_{kind}", "state": "on"}]}
    for kind in ("spectrum", "level")]}]}
ABILITY_SENSORS = {a: f"binary_sensor.music_source_{a}" for a in ("spectrum", "level", "rate", "calibration")}
# The selected profile in the matrix below: a template's own helpers, not Custom's.
MATRIX_PROFILE = "lively"
SENSOR_CASES = {
    # The source select on no sensor: every ability off.
    "none": {MUSIC_SOURCE: "\u2014", **{e: "off" for e in ABILITY_SENSORS.values()}},
    "level_only": {MUSIC_SOURCE: "kitchen", ABILITY_SENSORS["spectrum"]: "off", ABILITY_SENSORS["level"]: "on",
                   ABILITY_SENSORS["rate"]: "off", ABILITY_SENSORS["calibration"]: "on"},
    "full": {MUSIC_SOURCE: "kitchen", **{e: "on" for e in ABILITY_SENSORS.values()}},
    # A home without audio-sensor: none of its entities (a missing entity reads unknown).
    "no_audio_sensor": {},
}


def visible(conditions, states, missing="unknown") -> bool:
    """Home Assistant's visibility conditions (state, state_not, and, or; a list is and) on stub
    states: an entity not in `states` reads `missing`, unknown by default; the frontend may read a
    missing one as unavailable, so the no-audio-sensor cases run under both."""
    def holds(c) -> bool:
        kind = c.get("condition", "state")
        if kind == "and":
            return all(holds(x) for x in c["conditions"])
        if kind == "or":
            return any(holds(x) for x in c["conditions"])
        assert kind == "state" and ("state" in c) != ("state_not" in c), c
        state = states.get(c["entity"], missing)
        return state in as_list(c["state"]) if "state" in c else state not in as_list(c["state_not"])
    return all(holds(c) for c in conditions or [])


def shown_with(view, states, missing="unknown") -> set[str]:
    """The entities a sections view shows for `states`: sections, cards and conditional rows with
    their visibility applied."""
    out = set()
    for section in view["sections"]:
        if not visible(section.get("visibility"), states, missing):
            continue
        for card in section["cards"]:
            if not visible(card.get("visibility"), states, missing):
                continue
            if card.get("entity"):
                out.add(card["entity"])
            for r in card.get("entities", []) if card.get("type") == "entities" else []:
                r = r if isinstance(r, dict) else {"entity": r}
                if r.get("type") == "conditional":
                    if not visible(r["conditions"], states, missing):
                        continue
                    r = r["row"]
                if r.get("entity"):
                    out.add(r["entity"])
    return out


@pytest.mark.parametrize("live", ["on", "off"])
def test_music_page_rows(demo, live):
    """SPEC-025 amendment 1: the Music page has the page switch, the Live visualization switch and the
    way to its sub-view, whatever the switch; the Classic note while it is off; nothing else of the
    visual."""
    states = {"input_boolean.ramka_page_music": "on", MUSIC_LIVE: live, "input_boolean.ramka_settings_advanced": "on",
              MUSIC_VISUAL: "spectrum", TEMPLATE_SELECT: MATRIX_PROFILE, **SENSOR_CASES["full"]}
    for lang in LANGS:
        t = translations(lang)
        view = settings_views(demo[f"ramka-settings.{lang}.yaml"])["music"]
        assert shown_with(view, states) == {"input_boolean.ramka_page_music", MUSIC_LIVE}, lang
        notes = [c["content"] for s_, c in view_cards(view) if c.get("type") == "markdown"
                 and visible(s_.get("visibility"), states) and visible(c.get("visibility"), states)]
        assert (t["ui.settings.music_live_off"] in notes) is (live == "off"), lang
        [link] = [r for _, c in view_cards(view) for r in c.get("entities", []) if c.get("type") == "entities"
                  and isinstance(r, dict) and r.get("tap_action", {}).get("action") == "navigate"]
        assert link["name"] == t["ui.settings.music_live_link"] and link["action_name"] == "\u203a", lang
        assert link["tap_action"]["navigation_path"] == "/ramka-settings/music-live", lang
        [card] = [c for _, c in view_cards(view) if link in c.get("entities", [])]
        assert not card.get("visibility"), lang
        text = json.dumps(view)
        for gone in ("custom:ambient-wave-card", MUSIC_VISUAL, TEMPLATE_SELECT, "input_select.ramka_music_palette",
                     "ramka_music_spectrum_flavour", "ramka_settings_advanced", MUSIC_SOURCE, t["ui.settings.music_notice_no_sensor"]):
            assert gone not in text, (lang, gone)


@pytest.mark.parametrize("live", ["on", "off"])
@pytest.mark.parametrize("visual", ["spectrum", "level"])
@pytest.mark.parametrize("sensor", ["none", "level_only", "full", "no_audio_sensor"])
@pytest.mark.parametrize("advanced", ["on", "off"])
def test_live_subview_rows_follow_live_visual_and_sensor(demo, live, visual, sensor, advanced):
    """SPEC-025's row table, amended: the sensor always; with Live on (V) the mode, the spectrum's
    flavour and the Advanced switch; A (V and the sensor has the visual's ability) with Advanced: the
    colour range and the response profile with the selected profile's rows, its EQ with the spectrum."""
    states = {"input_boolean.ramka_page_music": "on", MUSIC_LIVE: live, MUSIC_VISUAL: visual, TEMPLATE_SELECT: MATRIX_PROFILE,
              "input_boolean.ramka_settings_advanced": advanced, **SENSOR_CASES[sensor]}
    active = live == "on" and states.get(ABILITY_SENSORS[visual], "unknown") == "on"
    expected = set()
    if sensor != "no_audio_sensor":
        expected.add(MUSIC_SOURCE)
    if live == "on":
        expected |= {MUSIC_VISUAL, "input_boolean.ramka_settings_advanced"}
        if visual == "spectrum":
            expected.add("input_select.ramka_music_spectrum_flavour")
    if active and advanced == "on":
        h = profile_helpers(MATRIX_PROFILE)
        expected |= {TEMPLATE_SELECT, h["rise"], h["fall"], h["hold"], h["tilt"],
                     f"input_number.ramka_music_{visual}_neutral_db", f"input_number.ramka_music_{visual}_hot_db"}
        if visual == "spectrum":
            expected |= {EQ_SELECT, *(h[f"eq_{k}"] for k in EQ_KEYS)}
    for lang in LANGS:
        view = live_subview(demo[f"ramka-settings.{lang}.yaml"])
        for missing in ("unknown", "unavailable") if sensor == "no_audio_sensor" else ("unknown",):
            shown = shown_with(view, states, missing)
            assert shown == expected, (lang, missing, sorted(shown - expected), sorted(expected - shown))
            assert not shown & {SPECTRUM_RATE, "input_number.audio_sensor_measured_offset"}, lang


def sensor_subview(dashboard) -> dict:
    return settings_views(dashboard, subviews=True)[SENSOR_VIEW]


def sensor_link(view) -> tuple[dict, dict]:
    """The Live visualization sub-view's way to the sensor sub-view: (its card, its button row)."""
    [(card, row)] = [(c, r) for _, c in view_cards(view) for r in c.get("entities", []) if c.get("type") == "entities"
                     and isinstance(r, dict) and r.get("tap_action", {}).get("action") == "navigate"]
    return card, row


CALIBRATION_ROWS = {"input_number.audio_sensor_measured_offset", "input_text.audio_sensor_calibration_note"}


def test_sensor_subview(demo):
    """SPEC-025's sub-view table: a Home Assistant sub-view after Live visualization whose back arrow
    returns to it (amendment 1); the header names the board's area and its abilities; the Live
    visualization sub-view's preview; the update
    rate with `rate`, the calibration with `calibration`, the mic gain while it reads, the Reset of
    the update rate with `rate`."""
    for lang in LANGS:
        t = translations(lang)
        dashboard = demo[f"ramka-settings.{lang}.yaml"]
        paths = [v["path"] for v in dashboard["views"]]
        assert paths.index(SENSOR_VIEW) == paths.index(LIVE_VIEW) + 1 == paths.index("music") + 2, lang
        view = sensor_subview(dashboard)
        assert view["subview"] is True and view["back_path"] == "/ramka-settings/music-live", lang
        assert (view["type"], view["max_columns"]) == ("sections", 2), lang
        assert view["title"] == t["ui.settings.music_sensor_page"], lang
        # The header: the title, the board's area and its abilities, or that no sensor is selected;
        # the link to the preview's Music tab.
        header = header_text(view)
        assert header.startswith(f"## {t['ui.settings.music_sensor_page']}\n\n"), lang
        assert f"[{t['ui.settings.preview_link']}](/ramka-preview/music)" in header, lang
        caps = {"sensor.music_source": {"capabilities": ["spectrum", "level", "rate", "calibration", "gain"]}}
        text = ha(header, states={"sensor.music_source": "Kitchen"}, attrs=caps)
        assert "Kitchen" in text and t["ui.settings.music_sensor_abilities"] in text, (lang, text)
        assert ", ".join(t[f"ui.settings.music_ability_{a}"] for a in ("spectrum", "level", "rate", "calibration")) in text, lang
        for state in ("none", "unknown", "unavailable"):
            text = ha(header, states={"sensor.music_source": state})
            assert t["ui.settings.music_sensor_none"] in text and t["ui.settings.music_sensor_abilities"] not in text, (lang, state)
        # The preview: the Live visualization sub-view's, notice and cards, across both columns.
        music = live_subview(dashboard)
        preview = grid_with_heading(view, t["ui.settings.preview"])
        assert preview["cards"] == grid_with_heading(music, t["ui.settings.preview"])["cards"], lang
        assert preview.get("column_span") == 2 and view["sections"][0] is preview, lang
        # The rows over the sensor cases, the gain reading or not.
        for sensor, case in SENSOR_CASES.items():
            for gain in ("12", "unavailable"):
                states = {**case, MIC_GAIN: gain} if case else {}
                expected = set()
                if case.get(ABILITY_SENSORS["rate"]) == "on":
                    expected.add(SPECTRUM_RATE)
                if case.get(ABILITY_SENSORS["calibration"]) == "on":
                    expected |= CALIBRATION_ROWS
                if case and case[MUSIC_SOURCE] != "\u2014" and gain != "unavailable":
                    expected.add(MIC_GAIN)
                for missing in ("unknown", "unavailable") if not case else ("unknown",):
                    shown = shown_with(view, states, missing)
                    assert shown == expected, (lang, sensor, gain, missing, shown ^ expected)
        # The source on no sensor while the gain still reads: no gain row.
        assert MIC_GAIN not in shown_with(view, {**SENSOR_CASES["none"], MIC_GAIN: "12"}), lang
        # The update rate with what each option does; the calibration rows and Apply.
        [rate] = [r for _, c in view_cards(view) for r in rows(c) if r.get("entity") == SPECTRUM_RATE]
        assert rate["type"] == INFO_ROW and rate["name"] == t["ui.settings.music_spectrum_rate"], lang
        assert rate["descriptions"] == {o: t[f"ui.settings.music_sensor_rate_{o}"] for o in ("normal", "eco", "fast")}, lang
        calibration = grid_with_heading(view, t["ui.settings.calibration"])
        assert calibration["visibility"] == [{"condition": "state", "entity": ABILITY_SENSORS["calibration"], "state": "on"}], lang
        [apply] = [n for n in walk(calibration) if n.get("perform_action") == "script.audio_sensor_apply_calibration"]
        assert apply["confirmation"]["text"] == t["ui.settings.calibration_apply_confirm"], lang
        assert "sensor.music_spl_offset" in json.dumps(calibration), lang
        # The Reset: the last section, the update rate only, shown with `rate`.
        last = view["sections"][-1]
        [action] = list(reset_actions(view))
        assert action in list(walk(last)) and action["data"] == {"page": "music_sensor"}, lang
        [button] = [c for c in last["cards"] if c.get("type") == "button"]
        assert button["name"] == t["ui.settings.music_sensor_reset"], lang
        for sensor, case in SENSOR_CASES.items():
            for missing in ("unknown", "unavailable"):
                shown = visible(last.get("visibility"), case, missing) and visible(button.get("visibility"), case, missing)
                assert shown is (case.get(ABILITY_SENSORS["rate"]) == "on"), (lang, sensor, missing)


def test_reset_music_sensor_sets_only_the_rate(demo):
    package = demo["package.yaml"]
    assert run_reset(package, page="music_sensor", states={SPECTRUM_RATE: "eco"}) == {SPECTRUM_RATE: "normal"}
    # A home without audio-sensor: nothing to set.
    assert run_reset(package, page="music_sensor") == {}
    # The rate is the sub-view's now: Music's Reset leaves it.
    assert SPECTRUM_RATE not in run_reset(package, page="music", states={SPECTRUM_RATE: "eco"})


def test_sensor_settings_link(demo):
    """The Live visualization sub-view's Sensor widget, right after the abilities line: the way to the
    sensor sub-view, while a sensor is selected that has an update rate or a calibration."""
    for lang in LANGS:
        t = translations(lang)
        view = live_subview(demo[f"ramka-settings.{lang}.yaml"])
        card, row = sensor_link(view)
        basic = sensor_widget(view)["cards"]
        assert basic.index(card) == 1 + next(i for i, c in enumerate(basic)
                                             if c.get("type") == "markdown" and "sensor.music_source" in c["content"]), lang
        assert row["type"] == "button" and row["name"] == t["ui.settings.music_sensor_settings"], lang
        assert row["tap_action"] == {"action": "navigate", "navigation_path": "/ramka-settings/music-sensor"}, lang
        for sensor, case in SENSOR_CASES.items():
            for missing in ("unknown", "unavailable"):
                assert visible(card["visibility"], case, missing) is (sensor in ("level_only", "full")), (lang, sensor, missing)
        no_settings = {**SENSOR_CASES["full"], ABILITY_SENSORS["rate"]: "off", ABILITY_SENSORS["calibration"]: "off"}
        assert not visible(card["visibility"], no_settings), lang
        assert visible(card["visibility"], {**no_settings, ABILITY_SENSORS["rate"]: "on"}), lang


def test_sensor_settings_link_per_language(tmp_path):
    rendered = render(tmp_path, {**demo_inputs(), "settings_paths": {"en": "ramka-settings", "pl": "ramka-settings-pl"}})
    for lang, path in (("en", "ramka-settings"), ("pl", "ramka-settings-pl"), ("de", "ramka-settings")):
        dashboard = rendered[f"ramka-settings.{lang}.yaml"]
        assert sensor_subview(dashboard)["back_path"] == f"/{path}/music-live", lang
        assert live_subview(dashboard)["back_path"] == f"/{path}/music", lang
        _, row = sensor_link(live_subview(dashboard))
        assert row["tap_action"]["navigation_path"] == f"/{path}/music-sensor", lang
        [link] = [r for _, c in view_cards(settings_views(dashboard)["music"]) for r in c.get("entities", [])
                  if isinstance(r, dict) and r.get("tap_action", {}).get("action") == "navigate"]
        assert link["tap_action"]["navigation_path"] == f"/{path}/music-live", lang


def test_no_sensor_subview_without_music_visual(plain):
    for lang in LANGS:
        dashboard = plain[f"ramka-settings.{lang}.yaml"]
        assert not {SENSOR_VIEW, LIVE_VIEW} & set(settings_views(dashboard, subviews=True)), lang
        assert "music-live" not in json.dumps(dashboard), lang
    options = reset_script(plain["package.yaml"])["fields"]["page"]["selector"]["select"]["options"]
    assert "music_sensor" not in options and "music_live" not in options
    assert "ramka_music_live" not in json.dumps(plain["package.yaml"])


def test_music_sensor_abilities_line(demo):
    """Under the source select, while a sensor is selected: the abilities the selected board has, in
    the page's language, or that it gives no data for a visual (neither spectrum nor level)."""
    for lang in LANGS:
        t = translations(lang)
        view = live_subview(demo[f"ramka-settings.{lang}.yaml"])
        [line] = [c for c in sensor_widget(view)["cards"]
                  if c.get("type") == "markdown" and "sensor.music_source" in c["content"]]
        assert visible(line.get("visibility"), {MUSIC_SOURCE: "kitchen"}), lang
        for state in ("\u2014", "unavailable", "unknown"):
            assert not visible(line.get("visibility"), {MUSIC_SOURCE: state}), (lang, state)
        assert not visible(line.get("visibility"), {}), lang
        lead, none_ = t["ui.settings.music_sensor_abilities"], t["ui.settings.music_sensor_no_data"]
        named = lambda *abilities: lead + " " + ", ".join(t[f"ui.settings.music_ability_{a}"] for a in abilities)  # noqa: E731
        for caps, out in (
            (["spectrum", "level", "rate", "calibration", "gain"], named("spectrum", "level", "rate", "calibration")),
            # The line keeps the contract's order, whatever the attribute's.
            (["calibration", "level", "spectrum"], named("spectrum", "level", "calibration")),
            (["level", "calibration", "gain"], named("level", "calibration")),
            (["spectrum"], named("spectrum")),
            (["rate", "gain"], none_), (["gain"], none_), ([], none_), (None, none_),
        ):
            attrs = {} if caps is None else {"sensor.music_source": {"capabilities": caps}}
            assert ha(line["content"], states={"sensor.music_source": "kitchen"}, attrs=attrs) == out, (lang, caps)
        # Translated, not copied.
        if lang != "en":
            en = translations("en")
            for key in ("music_sensor_abilities", "music_sensor_no_data", "music_ability_spectrum", "music_ability_level",
                        "music_ability_rate", "music_ability_calibration"):
                assert t[f"ui.settings.{key}"] != en[f"ui.settings.{key}"], (lang, key)


MUSIC_ALIASES = {"spectrum": "sensor.music_spectrum", "level": "sensor.music_level"}
NOTICE_KEYS = ("no_sensor", "no_spectrum", "no_level", "offline")


def expected_notice(visual, sensor, alias) -> str | None:
    """SPEC-025's notice table: V with no sensor, V with a sensor lacking the visual's ability, A
    with the alias unavailable; none for A with data and for Classic (the live switch off, the select
    on spectrum: amendment 1)."""
    if visual == "classic":
        return None
    if sensor in ("none", "no_audio_sensor"):
        return "no_sensor"
    if SENSOR_CASES[sensor][ABILITY_SENSORS[visual]] != "on":
        return f"no_{visual}"
    return "offline" if alias == "unavailable" else None


def notice_states(visual, sensor, alias) -> dict:
    """Classic: Live off, whatever the select holds (spectrum here)."""
    states = {"input_boolean.ramka_page_music": "on", MUSIC_LIVE: "off" if visual == "classic" else "on",
              MUSIC_VISUAL: "spectrum" if visual == "classic" else visual, **SENSOR_CASES[sensor]}
    if sensor != "no_audio_sensor":
        states |= {e: "unavailable" if alias == "unavailable" else "42" for e in MUSIC_ALIASES.values()}
    return states


def notices_shown(cards, states, t, missing) -> list[str]:
    """The notices among `cards` (markdown cards carrying a notice text) that `states` shows."""
    out = []
    for card in cards:
        # The preview dashboard's stack has no card visibility: a conditional card carries it.
        conditions = card.get("visibility")
        if card.get("type") == "conditional":
            conditions, card = card["conditions"], card["card"]
        for key in NOTICE_KEYS:
            if card.get("type") == "markdown" and t[f"ui.settings.music_notice_{key}"] in card["content"] \
                    and visible(conditions, states, missing):
                out.append(key)
    return out


NOTICE_CASES = [(v, s, a) for v in ("classic", "spectrum", "level") for s in ("none", "level_only", "full", "no_audio_sensor")
                for a in ("unavailable", "data") if not (s == "no_audio_sensor" and a == "data")]


@pytest.mark.parametrize("visual,sensor,alias", NOTICE_CASES)
def test_music_notice_cases(demo, visual, sensor, alias):
    """The Live visualization sub-view's preview: exactly the case's notice (none for A with data and
    for Classic, Live off).
    With audio-sensor the visual's own card, whose fallback draws Classic while a notice shows (the
    card test "an unavailable source draws the fallback"); the classic note for Classic and for a
    visual without audio-sensor, where the card's element does not exist."""
    states, want = notice_states(visual, sensor, alias), expected_notice(visual, sensor, alias)
    for lang in LANGS:
        t = translations(lang)
        view = live_subview(demo[f"ramka-settings.{lang}.yaml"])
        for missing in ("unknown", "unavailable") if sensor == "no_audio_sensor" else ("unknown",):
            shown = [(s, c) for s, c in view_cards(view) if visible(s.get("visibility"), states, missing)]
            notices = notices_shown([c for _, c in shown], states, t, missing)
            assert notices == ([want] if want else []), (lang, missing, notices)
            cards = [c for _, c in shown if visible(c.get("visibility"), states, missing)]
            classic = [c for c in cards if c.get("type") == "markdown" and c["content"] == t["ui.settings.preview_classic"]]
            visuals = [c["source"]["entity"] for c in cards if c.get("type") == "custom:ambient-wave-card"]
            if visual == "classic" or sensor == "no_audio_sensor":
                assert (len(classic), visuals) == (1, []), (lang, missing, visuals)
            else:
                assert (classic, visuals) == ([], [MUSIC_ALIASES[visual]]), (lang, missing, visuals)


@pytest.mark.parametrize("visual,sensor,alias", NOTICE_CASES)
def test_preview_music_tab_has_the_notice(demo, visual, sensor, alias):
    """The preview dashboard's Music tab: the same notice, in the stack over the frame (the frame
    stays last; its now-playing card falls back to Classic on its own)."""
    states, want = notice_states(visual, sensor, alias), expected_notice(visual, sensor, alias)
    for lang in LANGS:
        t = translations(lang)
        view = settings_views(demo[f"ramka-preview.{lang}.yaml"])["music"]
        preview_frame(view)
        [stack] = view["cards"]
        for missing in ("unknown", "unavailable") if sensor == "no_audio_sensor" else ("unknown",):
            notices = notices_shown(stack["cards"], states, t, missing)
            assert notices == ([want] if want else []), (lang, missing, notices)


def test_preview_music_notices_are_conditional_cards(demo):
    """The preview dashboard's stack ignores card visibility: its notices are conditional cards."""
    for lang in LANGS:
        view = settings_views(demo[f"ramka-preview.{lang}.yaml"])["music"]
        [stack] = view["cards"]
        notices = [c for c in stack["cards"] if c.get("type") == "conditional"
                   and c["card"].get("content", "").startswith("<ha-alert alert-type=\"info\"")]
        assert len(notices) == 4, lang
        assert not [c for c in stack["cards"] if "visibility" in c], lang


def test_music_visual_row_describes_each_visual(demo):
    """The mode row is the info row with what each visual draws and what it needs; no classic (the
    live switch off, SPEC-025 amendment 1)."""
    for lang in LANGS:
        t = translations(lang)
        view = live_subview(demo[f"ramka-settings.{lang}.yaml"])
        [row] = [r for _, c in view_cards(view) for r in rows(c) if r.get("entity") == MUSIC_VISUAL]
        assert row["type"] == INFO_ROW and row["name"] == t["ui.settings.music_visual_mode"], lang
        assert row["descriptions"] == {v: t[f"ui.settings.music_visual_{v}"] for v in ("spectrum", "level")}, lang
        assert len(set(row["descriptions"].values())) == 2, lang
    en = translations("en")
    assert "spectrum data" in en["ui.settings.music_visual_spectrum"]
    assert "level data" in en["ui.settings.music_visual_level"]


def test_music_notice_texts():
    """The spec's texts in English; German and Polish translated, not copied."""
    en = translations("en")
    assert en["ui.settings.music_notice_no_sensor"] == "No sensor is selected: this visual cannot work. The Ramka shows Classic."
    assert en["ui.settings.music_notice_no_spectrum"] == "This sensor gives no spectrum data. The Ramka shows Classic."
    assert en["ui.settings.music_notice_no_level"] == "This sensor gives no level data. The Ramka shows Classic."
    assert en["ui.settings.music_notice_offline"] == "The sensor is offline: the Ramka shows Classic until data arrives."
    for lang in ("de", "pl"):
        t = translations(lang)
        for key in NOTICE_KEYS:
            assert t[f"ui.settings.music_notice_{key}"] != en[f"ui.settings.music_notice_{key}"], (lang, key)


def preview_cards(view):
    return [(s, c) for s, c in view_cards(view) if c.get("type") == "custom:ambient-wave-card"]


def test_settings_preview_is_the_now_playing_visual(demo):
    for lang in LANGS:
        visual = now_playing(demo[f"dashboard.{lang}.yaml"])["visual"]
        view = live_subview(demo[f"ramka-settings.{lang}.yaml"])
        cards = preview_cards(view)
        assert [c["source"]["kind"] for _, c in cards] == ["spectrum", "scalar"]
        for (section, card), kind in zip(cards, ("spectrum", "level")):
            expected = {k: v for k, v in visual[kind].items() if k != "active"}
            assert {k: v for k, v in card.items() if k not in ("height", "visibility", "grid_options")} == expected
            # The strip's height on the 1100 x 720 tablet (SPEC-018): 14 % of 720 - 272 px.
            assert card["height"] == "63px"
            # While audio-sensor exists: the card's own fallback draws Classic while its alias is
            # unavailable; without audio-sensor the element does not exist (test_music_notice_cases).
            assert card["visibility"] == [LIVE_ON, {"condition": "state", "entity": "input_select.ramka_music_visual", "state": kind},
                                          SOURCE_EXISTS]
            assert not advanced(section, card)
        # One classic note; its visibility is test_music_notice_cases'.
        [_] = [c for _, c in view_cards(view) if c.get("type") == "markdown"
               and c.get("content") == translations(lang)["ui.settings.preview_classic"]]


def test_settings_preview_passes_the_card_normaliser(tmp_path, demo):
    import shutil
    import subprocess

    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH (eval \"$(fnm env --shell zsh)\")")
    configs = [c for _, c in preview_cards(live_subview(demo["ramka-settings.en.yaml"]))]
    seeded = card_states(demo["package.yaml"], run_reset(demo["package.yaml"], groups=["music_visual"]))
    script = tmp_path / "preview.mjs"
    script.write_text(
        f"import {{ normaliseConfig, resolveOptions }} from {json.dumps((AUDIO_CARDS / 'lib' / 'config.js').as_uri())};\n"
        f"import {{ FLAVOUR_KINDS }} from {json.dumps((AUDIO_CARDS / 'lib' / 'flavours' / 'index.js').as_uri())};\n"
        "const [configs, states] = JSON.parse(process.argv[2]);\n"
        "process.stdout.write(JSON.stringify(configs.map((c) => resolveOptions(normaliseConfig(c, FLAVOUR_KINDS), states, FLAVOUR_KINDS))));\n",
        encoding="utf-8")
    result = subprocess.run([node, str(script), json.dumps([configs, seeded])], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    spectrum, level = json.loads(result.stdout)
    assert (spectrum["flavour"], level["flavour"]) == ("dune", "centre")
    assert spectrum["style"]["line_width"] == level["style"]["line_width"] == 2.8
    # No `active`: the preview draws while the player is off too.
    assert not [c for c in configs if "active" in c]


def test_settings_read_only_inputs(demo):
    inputs = demo_inputs()
    t = translations("en")
    views = settings_views(demo["ramka-settings.en.yaml"])
    general = markdown(views["general"])
    assert t["ui.settings.inputs.screen"] in general and "1100 × 720" in general
    climate = markdown(views["climate"])
    assert all(c["label"] in climate for c in inputs["climate"]) and t["ui.settings.inputs.rooms_columns"] in climate
    air = markdown(views["air"])
    assert all(entity in air for entity in inputs["air"].values())
    plants = markdown(views["plants"])
    assert all(p["label"] in plants for p in inputs["plants"])
    assert inputs["photo_dir"] in markdown(views["photos"])
    status = markdown(views["status"])
    for item in [*inputs["covers"], *inputs["status"]["contacts"], *inputs["status"]["power"], *inputs["status"]["locks"]]:
        assert item["label"] in status
    assert t["ui.settings.inputs.status_columns"] in status
    assert inputs["calendar"] in markdown(views["calendar"])
    for path, view in views.items():
        if path != "about":  # the About page has no input (SPEC-023)
            assert t["ui.settings.render_time"] in json.dumps(view, ensure_ascii=False), path


def test_settings_all_off_warning(demo):
    view = settings_views(demo["ramka-settings.en.yaml"])["general"]
    t = translations("en")
    [card] = [c for _, c in view_cards(view) if c.get("type") == "markdown" and "all_off" in c["content"]]
    assert card["show_empty"] is False
    attrs = lambda off: {"sensor.ramka_ambient_pages": {"all_off": off}}
    assert t["ui.settings.all_off"] in ha(card["content"], attrs=attrs(True))
    assert ha(card["content"], attrs=attrs(False)) == ""
    assert ha(card["content"]) == ""


def header_text(view) -> str:
    card = view["header"]["card"]
    assert card["type"] == "markdown" and card["text_only"] is True
    return card["content"]


def test_settings_pages_start_with_a_header(demo, preview, tmp_path):
    """Every page but About says what its view shows, what for and when it is on the screen (General:
    the Ramka as a whole); with the preview dashboard (the default) also the link to the preview's tab."""
    off = render(tmp_path, {**demo_inputs(), "preview_dashboard": False})
    for lang in LANGS:
        t = translations(lang)
        for rendered, linked in ((off, False), (demo, True), (preview, True)):
            views = settings_views(rendered[f"ramka-settings.{lang}.yaml"])
            for path, view in views.items():
                if path == "about":
                    continue
                text = header_text(view)
                # The page's title first, the tab's own (its tooltip), then what the view is.
                assert text.startswith(f"## {t[f'ui.settings.pages.{path}']}\n\n{t[f'ui.settings.header.{path}']}"), (lang, path)
                assert view["title"] == t[f"ui.settings.pages.{path}"], (lang, path)
                assert 2 <= t[f"ui.settings.header.{path}"].count(". ") + 1 <= 3, (lang, path)
                link = f"[{t['ui.settings.preview_link_general' if path == 'general' else 'ui.settings.preview_link']}]"
                target = f"(/ramka-preview/{'climate' if path == 'general' else path})"
                assert (link + target in text) is linked, (lang, path, linked)
                assert ("ramka-preview" in text) is linked, (lang, path)
    # Every settings page but General and About is a preview tab, and every preview tab a settings page.
    settings = settings_views(preview["ramka-settings.en.yaml"])
    assert set(settings) - {"general", "about"} == set(settings_views(preview["ramka-preview.en.yaml"]))


def test_settings_header_links_follow_preview_paths(tmp_path):
    rendered = render(tmp_path, {**demo_inputs(), "preview_dashboard": True, "preview_paths": {"de": "ramka-vorschau"}})
    assert "(/ramka-vorschau/air)" in header_text(settings_views(rendered["ramka-settings.de.yaml"])["air"])
    assert "(/ramka-preview/air)" in header_text(settings_views(rendered["ramka-settings.en.yaml"])["air"])
    # A view the render left out still has its header and its link: the preview's tab says what is missing.
    rendered = render(tmp_path / "noair", {**without_pages("air"), "preview_dashboard": True})
    assert "(/ramka-preview/air)" in header_text(settings_views(rendered["ramka-settings.en.yaml"])["air"])


@pytest.mark.parametrize("value", [{"en": "/ramka-preview"}, {"de": "ramka preview"}, ["ramka-preview"]])
def test_preview_paths_must_be_plain(tmp_path, value):
    with pytest.raises(dr.RenderError, match="preview paths must be plain url paths"):
        render(tmp_path, {**demo_inputs(), "preview_dashboard": True, "preview_paths": value})


def test_controls_page_holds_the_near_settings(demo):
    """The Controls page: the near settings, moved from General (Basic and Advanced as they were),
    the render-time inputs of the controls and its own reset."""
    package = demo["package.yaml"]
    for lang in LANGS:
        views = settings_views(demo[f"ramka-settings.{lang}.yaml"])
        controls, general = views["controls"], views["general"]
        assert controls["title"] == translations(lang)["ui.settings.pages.controls"]
        assert shown_entities(controls) == set(CONTROLS_SETTINGS) | {"input_boolean.ramka_settings_advanced"}
        assert not shown_entities(general) & set(CONTROLS_SETTINGS), lang
        for section, card in view_cards(controls):
            for row in rows(card):
                if row["entity"] in CONTROLS_SETTINGS:
                    assert advanced(section, card) == (CONTROLS_SETTINGS[row["entity"]] == "advanced"), row
        [action] = list(reset_actions(controls))
        assert action["data"] == {"page": "controls"}
        text = markdown(controls)
        assert translations(lang)["ui.settings.inputs.radar"] in text and translations(lang)["ui.settings.inputs.lights"] in text
    assert set(run_reset(package, page="controls")) == set(CONTROLS_SETTINGS)
    assert not set(run_reset(package, page="general")) & set(CONTROLS_SETTINGS)


def test_settings_dashboard_is_documented():
    manifest = yaml.safe_load((COMP / "component.yaml").read_text(encoding="utf-8"))
    assert "templates/ramka-settings.lang.yaml.j2" in manifest["artifacts"]["templates"]
    readme = (COMP / "README.md").read_text(encoding="utf-8")
    assert "## Settings page" in readme
    block = readme.split("## Settings page", 1)[1].split("```yaml", 1)[1].split("```", 1)[0]
    entry = yaml.safe_load(block)["lovelace"]["dashboards"]["ramka-settings"]
    assert entry["filename"] == "dashboards/ramka-settings.en.yaml" and entry["require_admin"] is True
    assert entry["mode"] == "yaml"


# ---- 0.4.0, amended 2026-10-30: sensor update rate and the watching flag (#99, #110) ----------

class HAStates:
    """`states` as a Home Assistant template reads it: `states('id')` and `states.<domain>`. An
    entity not given is unavailable."""

    def __init__(self, values, attrs=None):
        self.values, self.attrs = values, attrs or {}

    def __call__(self, entity_id):
        return str(self.values.get(entity_id, "unavailable"))

    def __getattr__(self, domain):
        from types import SimpleNamespace

        return [SimpleNamespace(entity_id=e, state=str(v), attributes=self.attrs.get(e, {}))
                for e, v in self.values.items() if e.startswith(domain + ".")]


def ha_states(template, values, attrs=None) -> str:
    import jinja2

    states = HAStates(values, attrs)
    return jinja2.Environment().from_string(template).render(
        states=states, is_state=lambda e, v: states(e) == v).strip()


def run_watching(automation, values, attrs=None):
    """What automation <prefix>_music_watching does to the flag: "on", "off" or None (nothing)."""
    for condition in automation.get("conditions", []):
        assert condition["condition"] == "template"
        if ha_states(condition["value_template"], values, attrs) != "True":
            return None
    [step] = automation["actions"]
    [condition] = step["if"]
    branch = step["then"] if ha_states(condition["value_template"], values, attrs) == "True" else step["else"]
    [action] = branch
    assert action["target"]["entity_id"] == MUSIC_WATCHING
    return {"input_boolean.turn_on": "on", "input_boolean.turn_off": "off"}[action["action"]]


def test_music_view_drives_the_watching_flag(demo, plain):
    """With music_visual, the music view turns audio-sensor's watching flag on and off; another
    Ramka's music view keeps it on (one flag per home); without audio-sensor nothing runs."""
    assert not [a for a in plain["package.yaml"]["automation"] if a["id"] == "ramka_music_watching"]
    [automation] = [a for a in demo["package.yaml"]["automation"] if a["id"] == "ramka_music_watching"]
    assert MUSIC_WATCHING not in json.dumps(plain["package.yaml"])
    entities = {t.get("entity_id") for t in automation["triggers"] if t["trigger"] == "state"}
    assert entities == {"binary_sensor.ramka_music_view"}
    assert {"trigger": "homeassistant", "event": "start"} in automation["triggers"]
    # The music view is a Ramka's: its marker lets another Ramka's automation find it.
    [view] = [e for e in keyed(demo["package.yaml"], "template").values() if e["unique_id"] == "ramka_music_view"]
    assert view["attributes"]["component"] == "ramka"
    ramka = {"component": "ramka"}
    mine, other = "binary_sensor.ramka_music_view", "binary_sensor.hall_frame_music_view"
    flag = {MUSIC_WATCHING: "off"}
    attrs = {mine: ramka, other: ramka}
    assert run_watching(automation, {**flag, mine: "on"}, attrs) == "on"
    assert run_watching(automation, {**flag, mine: "off"}, attrs) == "off"
    assert run_watching(automation, {**flag, mine: "off", other: "on"}, attrs) == "on"
    assert run_watching(automation, {**flag, mine: "off", other: "off"}, attrs) == "off"
    # Some other integration's "…_music_view" is no Ramka's.
    assert run_watching(automation, {**flag, mine: "off", "binary_sensor.den_music_view": "on"}, attrs) == "off"
    # A home without audio-sensor: no flag, nothing to set.
    assert run_watching(automation, {mine: "on"}, attrs) is None
    assert run_watching(automation, {MUSIC_WATCHING: "unknown", mine: "on"}, attrs) is None


def test_fps_is_the_redraw_rate(demo):
    # Not on the settings page; the helper, its default and the cards' binding stay.
    for lang in LANGS:
        view = settings_views(demo[f"ramka-settings.{lang}.yaml"])["music"]
        assert "input_number.ramka_music_fps" not in json.dumps(view["sections"][:2] + view["sections"][3:]), lang
        assert "input_number.ramka_music_fps" not in shown_entities(view), lang
        for card in preview_cards(view):
            assert card[1]["fps"] == "input_number.ramka_music_fps", lang
    helper = demo["package.yaml"]["input_number"]["ramka_music_fps"]
    assert (helper["min"], helper["max"], helper["step"]) == (1, 60, 1)
    assert helper["name"] == "Ramka music redraw rate (fps)"
    assert run_reset(demo["package.yaml"])["input_number.ramka_music_fps"] == 30


def test_spectrum_rate_row_translated(demo):
    names = {"en": "Sensor update rate", "de": "Sensor-Aktualisierungsrate", "pl": "Częstotliwość odczytu czujnika"}
    for lang, name in names.items():
        t = translations(lang)
        assert t["ui.settings.music_spectrum_rate"] == name
        view = settings_views(demo[f"ramka-settings.{lang}.yaml"])["music"]
        # The row left the Music page (SPEC-025: a setting of the sensor, for its sub-view); no note
        # on what each option does stays behind.
        assert not [r for _, c in view_cards(view) for r in rows(c) if r.get("entity") == SPECTRUM_RATE], lang
        assert not [c for _, c in view_cards(view) if c.get("type") == "markdown" and RATE_THERE in c.get("visibility", [])], lang


# Ramka without the sensor update rate and the watching flag: main as last merged into the
# feature branch (ramka 0.5.0).
BEFORE_SPECTRUM_RATE = "12b24d7cbba26f0da2cfa19bf0cd8bc3880adc06"
AUDIO_SENSOR_ID = re.compile(r"\b((?:input_select|input_boolean|input_number|input_text|sensor|binary_sensor|script)"
                             r"\.(?:audio_sensor_|music_)\w+)")


def test_render_without_audio_sensor_unchanged(tmp_path):
    """The render cannot see audio-sensor, so it is one render for a home with or without it: the
    new row, note and reset step are hidden or skipped while audio-sensor's ids are not there, and
    they and the watching automation read only the ids Ramka consumes. Apart from them (and the fps
    label and the audio-sensor version in the calibration link), the files are the ones before the
    change, value for value."""
    before, after = tmp_path / "before", tmp_path / "after"
    dr.render_component(ramka_at(tmp_path, BEFORE_SPECTRUM_RATE, "ramka-before"), demo_inputs(), before)
    # 0.6.0, the last release before SPEC-022 changed the plants parts on purpose (tested below).
    after_comp = tagged_ramka(tmp_path, "0.6.0")
    dr.render_component(after_comp, demo_inputs(), after)
    names = sorted(p.name for p in before.iterdir())
    assert names == sorted(p.name for p in after.iterdir())
    manifest = yaml.safe_load((after_comp / "component.yaml").read_text(encoding="utf-8"))
    consumed = {c["id"] for c in manifest["consumes"] if "id" in c and c["component"] == "audio-sensor"}
    assert {SPECTRUM_RATE, MUSIC_WATCHING} <= consumed
    load = lambda path: yaml.safe_load(path.read_text(encoding="utf-8"))  # noqa: E731
    fps = {"en": "Redraw rate", "de": "Neuzeichnungsrate", "pl": "Częstotliwość rysowania"}
    for name in names:
        text = (after / name).read_text(encoding="utf-8")
        assert set(AUDIO_SENSOR_ID.findall(text)) <= consumed, (name, set(AUDIO_SENSOR_ID.findall(text)) - consumed)
        old = load(before / name)
        text = text.replace("blob/audio-sensor/0.2.0/", "blob/audio-sensor/0.1.0/")
        for ten, five in (("Up to ten rooms", "Up to five rooms"), ("Do dziesięciu pokoi", "Do pięciu pokoi"),
                          ("Bis zu zehn Räume", "Bis zu fünf Räume")):  # amendment 3, not this change
            text = text.replace(ten, five)
        new = yaml.safe_load(text)
        if name == "package.yaml":
            new["automation"] = [a for a in new["automation"] if a["id"] != "ramka_music_watching"]
            sequence = new["script"]["ramka_settings_reset"]["sequence"]
            new["script"]["ramka_settings_reset"]["sequence"] = [b for b in sequence if SPECTRUM_RATE not in json.dumps(b)]
            assert new["input_number"]["ramka_music_fps"].pop("name") == "Ramka music redraw rate (fps)"
            old["input_number"]["ramka_music_fps"].pop("name")
            for package in (old, new):
                for block in package["template"]:
                    for entity in block.get("binary_sensor", []):
                        if entity["unique_id"] == "ramka_music_view":
                            entity.pop("attributes", None)
                # Ten Climate rooms instead of five (amendment 3) is another change than this one.
                package["script"].pop("ramka_climate_rooms_set", None)
                for block in package["script"]["ramka_settings_reset"]["sequence"][1:]:
                    for step in block["then"]:
                        if step.get("event") == "ramka_climate_rooms":
                            step["event_data"].pop("rooms")
        elif name.startswith("ramka-settings."):
            lang = name.split(".")[1]
            new["views"] = [v for v in new["views"] if v["path"] != "about"]  # another change (SPEC-023)
            for view in new["views"]:
                for section in view["sections"]:
                    section["cards"] = [c for c in section["cards"] if SPECTRUM_RATE not in json.dumps(c)]
            for dashboard, label in ((old, None), (new, fps[lang])):
                for view in dashboard["views"]:
                    for _, card in view_cards(view):
                        for row in rows(card):
                            if row.get("entity") == "input_number.ramka_music_fps":
                                assert label is None or row["name"] == label
                                row.pop("name")
        assert new == old, name


# ---- SPEC-021 amendment 1: Photos, Air, the way to the view, language, calendar by URL ---------

def automation(package, suffix):
    [a] = [a for a in package["automation"] if a["id"] == f"ramka_{suffix}"]
    return a


def photo_stage(package):
    loop = package["script"]["ramka_ambient_loop"]["sequence"][0]["repeat"]["sequence"]
    [stage] = [s for s in loop if s.get("if") and s["if"][0].get("state") == "photos"]
    return stage["then"]


def test_photo_settings_drive_the_loop(demo):
    package = demo["package.yaml"]
    count, seconds = package["input_number"]["ramka_photo_count"], package["input_number"]["ramka_photo_s"]
    assert (count["min"], count["max"], seconds["min"], seconds["max"]) == (1, 20, 3, 120)
    stage = photo_stage(package)
    # The stage starts with the series' photo, a new series when it is over (SPEC-026).
    assert stage[0] == {"action": "script.ramka_photo_show"}
    [pick] = [s for s in package["script"]["ramka_photo_series_new"]["sequence"] if s.get("action") == "shell_command.ramka_pick"]
    assert ha(pick["data"]["count"], states={"input_number.ramka_photo_count": "3"}) == "3"
    attrs = {ALBUMS: {"chosen": ["2024 Kreta", "2026 Bern"], "all": False}}
    assert ha_value(pick["data"]["albums"], attrs=attrs) == ["2024 Kreta", "2026 Bern"]
    # 0.4.0's sensor, without `all`: the chosen ones.
    assert ha_value(pick["data"]["albums"], attrs={ALBUMS: {"chosen": ["2026 Bern"]}}) == ["2026 Bern"]
    # All albums (the ticks kept), none chosen, or the sensor not there yet: every album; the count
    # falls back to the default.
    assert ha_value(pick["data"]["albums"], attrs={ALBUMS: {"chosen": ["2026 Bern"], "all": True}}) == []
    assert ha_value(pick["data"]["albums"], attrs={ALBUMS: {"chosen": []}}) == []
    assert ha_value(pick["data"]["albums"]) == [] and ha(pick["data"]["count"]) == "5"
    delays = [n["delay"]["seconds"] for n in walk(stage) if isinstance(n.get("delay"), dict)]
    assert delays and all(ha(d, states={"input_number.ramka_photo_s": "20"}) == "20" for d in delays)
    assert all(ha(d) == "10" for d in delays)


def test_pick_command_quotes_every_album(demo):
    import shlex

    package = demo["package.yaml"]
    prog, args = package["shell_command"]["ramka_pick"].split(" ", 1)
    head = ["python3", "/config/shell/ramka_pick.py", "/config/www/ramka", "3"]
    for albums in (["2026"], ["Wakacje nad morzem", "Tom's party"], []):
        assert shlex.split(f"{prog} {ha(args, count=3, albums=albums)}") == head + albums
    # A string is not a list of albums (a template that did not render to a list): every album.
    assert shlex.split(f"{prog} {ha(args, count=3, albums='2026')}") == head
    assert package["shell_command"]["ramka_albums"] == "python3 /config/shell/ramka_pick.py /config/www/ramka --albums"


def event_sensor(package, event):
    [block] = [b for b in package["template"] if b.get("triggers") == [{"trigger": "event", "event_type": event}]]
    [sensor] = block["sensor"]
    return sensor


def albums_sensor(package):
    return event_sensor(package, "ramka_photo_albums")


def run_albums_sensor(package, before, data):
    """The sensor after event ramka_photo_albums with `data`: (state, attributes)."""
    sensor = albums_sensor(package)
    trigger = {"event": {"data": data}}
    this = {"attributes": before}
    attributes = {k: ha_value(v, trigger=trigger, this=this) for k, v in sensor["attributes"].items()}
    return ha(sensor["state"], trigger=trigger, this=this), attributes


def test_albums_sensor_keeps_what_the_event_does_not_set(demo):
    package = demo["package.yaml"]
    assert albums_sensor(package)["default_entity_id"] == ALBUMS
    state, attrs = run_albums_sensor(package, {}, {"available": ["2025", "2026"]})
    assert (state, attrs) == ("0", {"available": ["2025", "2026"], "chosen": [], "all": True})
    state, attrs = run_albums_sensor(package, attrs, {"chosen": ["2026"], "all": False})
    assert (state, attrs) == ("1", {"available": ["2025", "2026"], "chosen": ["2026"], "all": False})
    # A new index keeps the choice, even of an album that is gone for now.
    state, attrs = run_albums_sensor(package, attrs, {"available": ["2025"]})
    assert (state, attrs) == ("1", {"available": ["2025"], "chosen": ["2026"], "all": False})
    # All albums keeps the ticks; the reset's event too.
    state, attrs = run_albums_sensor(package, attrs, {"all": True})
    assert (state, attrs) == ("1", {"available": ["2025"], "chosen": ["2026"], "all": True})
    # A sensor from 0.4.0, without `all`: all is none chosen.
    assert run_albums_sensor(package, {"chosen": ["2026"]}, {"available": []})[1]["all"] is False
    assert run_albums_sensor(package, {"chosen": []}, {"available": []})[1]["all"] is True


def test_album_list_follows_the_folder(demo):
    package = demo["package.yaml"]
    actions = automation(package, "photo_index")["actions"]
    [albums] = [a for a in actions if a.get("action") == "shell_command.ramka_albums"]
    [event] = [a for a in actions if a.get("event") == "ramka_photo_albums"]
    reply = {"stdout": 'index rebuilt\n{"albums": ["2025", "2026"]}'}
    assert ha_value(event["event_data"]["available"], **{albums["response_variable"]: reply}) == ["2025", "2026"]
    assert ha_value(event["event_data"]["available"], **{albums["response_variable"]: {"stdout": ""}}) == []
    assert "chosen" not in event["event_data"]
    # The card's script sets the choice and all; the reset sets all, the ticks kept.
    script = package["script"]["ramka_photo_albums_set"]
    # 2026.9.2 refused `object: {}` and `boolean: {}` here and disabled the script.
    assert not any("selector" in field for field in script["fields"].values())
    variables, step = script["sequence"]
    assert step["event"] == "ramka_photo_albums"

    def sent(**fields):
        picked = ha_value(variables["variables"]["picked"], **fields)
        return {k: ha_value(v, picked=picked, **fields) for k, v in step["event_data"].items()}

    assert sent(chosen=["a", "b"], all_albums=False) == {"chosen": ["a", "b"], "all": False}
    assert sent(chosen=["a"], all_albums=True) == {"chosen": ["a"], "all": True}
    assert sent(chosen=["a"]) == {"chosen": ["a"], "all": False}
    assert sent() == {"chosen": [], "all": True} and sent(chosen="a") == {"chosen": [], "all": True}
    assert run_reset(package, page="photos", events=True)[ALBUMS] == {"all": True}
    assert run_reset(package, events=True)[ALBUMS] == {"all": True}
    assert ALBUMS not in run_reset(package, page="air", events=True)


def test_album_card_on_photos_advanced(demo):
    for lang in LANGS:
        photos = settings_views(demo[f"ramka-settings.{lang}.yaml"])["photos"]
        [(section, card)] = [(s, c) for s, c in view_cards(photos) if c.get("type") == "custom:photo-albums-card"]
        assert card["entity"] == ALBUMS and card["script"] == "script.ramka_photo_albums_set"
        assert advanced(section, card) and ADVANCED_ON in card["visibility"]
        assert translations(lang)["ui.settings.photo_albums_how"] in markdown(photos)


def test_albums_in_their_own_section_in_the_right_column(demo):
    """The albums, a long list, are the Photos page's second section: the right column next to Basic
    in its two-column sections view, Advanced like the list; the render-time inputs and Reset below."""
    for lang in LANGS:
        t = translations(lang)
        photos = settings_views(demo[f"ramka-settings.{lang}.yaml"])["photos"]
        assert photos["type"] == "sections" and photos["max_columns"] == 2
        basic, albums, *rest = photos["sections"]
        assert heading_of(basic) == t["ui.settings.basic"], lang
        assert not [c for c in basic["cards"] if c.get("type") == "custom:photo-albums-card"], lang
        assert heading_of(albums) == t["ui.settings.photo_albums"], lang
        assert ADVANCED_ON in albums["visibility"], lang
        assert [c["type"] for c in albums["cards"]] == ["heading", "markdown", "custom:photo-albums-card"], lang
        assert heading_of(rest[0]) == t["ui.settings.render_time"], lang
        assert any(c.get("type") == "button" for c in rest[-1]["cards"]), lang


def test_time_per_photo_in_photos_basic(demo):
    """Time per photo sits in Basic after the photos per series; the Advanced card it left is gone
    (the albums keep their own Advanced section)."""
    for lang in LANGS:
        t = translations(lang)
        photos = settings_views(demo[f"ramka-settings.{lang}.yaml"])["photos"]
        basic = photos["sections"][0]
        assert heading_of(basic) == t["ui.settings.basic"], lang
        [entities] = [c for c in basic["cards"] if c["type"] == "entities"]
        assert [r["entity"] for r in rows(entities)] == [
            "input_boolean.ramka_page_photos", "input_number.ramka_photo_count", "input_number.ramka_photo_s",
            "input_boolean.ramka_settings_advanced"], lang
        assert t["ui.settings.advanced"] not in [heading_of(s) for s in photos["sections"]], lang


def test_no_photo_helpers_without_photo_dir(tmp_path):
    package = render(tmp_path, without_pages("photos"))["package.yaml"]
    assert not {e for e in helpers(package) if ".ramka_photo" in e}
    # The About page's discovery is the only shell command a home without photos gets (SPEC-023).
    assert set(package.get("shell_command", {})) == {"ramka_discover"} and "ramka_photo" not in package.get("input_text", {})
    assert ALBUMS not in defined_entities(package) and "ramka_photo_albums_set" not in package["script"]
    assert not [a for a in package["automation"] if a["id"].startswith("ramka_photo")]


def air_card(dashboard):
    [card] = [n for n in walk(dashboard) if n.get("type") == "custom:air-card"]
    return card


def test_air_settings_bound_in_the_card(demo):
    card = air_card(demo["dashboard.en.yaml"])
    assert card["score"]["show"] == "input_boolean.ramka_air_score"
    assert [lv[0] for lv in card["score"]["levels"]] == [
        {"entity": "input_number.ramka_air_score_fair", "default": 80},
        {"entity": "input_number.ramka_air_score_poor", "default": 60}, 0]
    for tile, reading in zip(card["tiles"], ["co2", "pm2_5", "voc", "nox"]):
        assert tile["show"] == f"input_boolean.ramka_air_{reading}"
        assert [lv[0] for lv in tile["levels"]] == [
            {"entity": f"input_number.ramka_air_{reading}_raised", "default": AIR_LIMITS[f"{reading}_raised"]},
            {"entity": f"input_number.ramka_air_{reading}_high", "default": AIR_LIMITS[f"{reading}_high"]}, None]
    package = demo["package.yaml"]
    for key, value in AIR_LIMITS.items():
        helper = package["input_number"][f"ramka_air_{key}"]
        assert helper["min"] <= value <= helper["max"], key


def test_air_helpers_only_for_configured_readings(tmp_path):
    inputs = demo_inputs()
    del inputs["air"]["nox"]
    rendered = render(tmp_path, inputs)
    assert not {e for e in helpers(rendered["package.yaml"]) if "air_nox" in e}
    assert "input_boolean.ramka_air_voc" in helpers(rendered["package.yaml"])
    for lang in LANGS:
        view = settings_views(rendered[f"ramka-settings.{lang}.yaml"])["air"]
        assert not {e for e in shown_entities(view) if "nox" in e}
    no_air = render(tmp_path / "no-air", without_pages("air"))["package.yaml"]
    assert not {e for e in helpers(no_air) if ".ramka_air_" in e}


def named_colours() -> list[tuple[str, int, str]]:
    """cards/lib/colours.js's COLOURS: (id, theme slot, fallback), in the dropdowns' order."""
    text = (COMP / "cards" / "lib" / "colours.js").read_text(encoding="utf-8")
    return [(id, int(slot), hue) for id, slot, hue in re.findall(r'\["([a-z ]+)", (\d+), "(#[0-9a-f]{6})"\]', text)]


def test_named_colours_are_one_list(demo):
    """The colour selects' options are the cards' named colours, in their order with the default first;
    each a series colour of the theme, its fallback the theme's dark colour; named in en, de, pl."""
    colours = named_colours()
    ids = [id for id, _, _ in colours]
    assert ids[:3] == ["green", "teal", "blue"] and {"amber", "red", "grey", "light blue"} <= set(ids) and len(ids) == 11
    theme = yaml.safe_load((COMP / "themes" / "ramka.yaml").read_text(encoding="utf-8"))["ramka-dark"]["modes"]["dark"]
    assert sorted(slot for _, slot, _ in colours) == list(range(1, 12))
    for id, slot, hue in colours:
        assert theme[f"graph-color-{slot}"] == hue, id
    for lang in LANGS:
        t = translations(lang)
        names = [t[f"card.colours.{id.replace(' ', '_')}"] for id in ids]
        assert len(set(names)) == len(names), lang
    selects = demo["package.yaml"]["input_select"]
    for entity, default in {**AIR_COLOURS, **CLIMATE_NEUTRAL}.items():
        assert selects[entity.split(".")[1]]["options"] == [default] + [i for i in ids if i != default], entity
    # The package's slot map for the stored slot numbers (the climate script) is the cards' too.
    text = (COMP / "templates" / "package.yaml.j2").read_text(encoding="utf-8")
    [slots] = re.findall(r"set colour_slots = (\{[^}]*\})", text)
    assert yaml.safe_load(slots) == {slot: id for id, slot, _ in colours}


def test_air_colours_on_air_advanced_and_in_the_card(demo):
    """The Air page's good, fair and poor colours: three selects in its Advanced card after the limits,
    reset and seeded with the air group; the air-card reads them."""
    package = demo["package.yaml"]
    assert run_reset(package, page="air")["input_select.ramka_air_color_good"] == "green"
    assert set(AIR_COLOURS) <= set(run_reset(package, groups=["air"]))
    assert {e: run_reset(package, groups=["air"])[e] for e in AIR_COLOURS} == AIR_COLOURS
    for lang in LANGS:
        t = translations(lang)
        air = settings_views(demo[f"ramka-settings.{lang}.yaml"])["air"]
        [(section, card)] = [(s, c) for s, c in view_cards(air)
                             if any(r.get("entity") == "input_select.ramka_air_color_good" for r in rows(c))]
        entities = [r["entity"] for r in rows(card)]
        assert entities[-3:] == list(AIR_COLOUR_SELECTS.values()) and "input_number.ramka_air_co2_raised" in entities
        assert advanced(section, card)
        assert [r["name"] for r in rows(card)][-3:] == [t[f"ui.settings.air_color_{k}"] for k in ("good", "fair", "poor")]
        assert air_card(demo[f"dashboard.{lang}.yaml"])["colors"] == AIR_COLOUR_SELECTS
    assert translations("en")["ui.settings.air_color_good"] == "Good colour"


def test_air_limits_are_named_fair_and_poor(demo):
    """The readings' limits read "fair from" / "poor from" (the score "fair below" / "poor below"); the
    helper ids keep raised and high, a stable contract; the air-card's own level words are good, fair, poor."""
    en = translations("en")
    assert en["ui.settings.air_co2_raised"] == "CO₂ fair from" and en["ui.settings.air_co2_high"] == "CO₂ poor from"
    assert en["ui.settings.air_pm2_5_raised"] == "PM2.5 fair from" and en["ui.settings.air_nox_high"] == "NOx index poor from"
    assert en["ui.settings.air_score_fair"] == "Air quality fair below"
    assert {"input_number.ramka_air_co2_raised", "input_number.ramka_air_co2_high"} <= set(helpers(demo["package.yaml"]))
    for lang, words in {"en": ("Good", "Fair", "Poor"), "de": ("Gut", "Mässig", "Schlecht"), "pl": ("Dobry", "Umiarkowany", "Zły")}.items():
        t = translations(lang)
        assert tuple(t[f"card.air.level.{k}"] for k in ("good", "fair", "poor")) == words, lang
        assert not any(k.startswith("card.air.level.") and k.split(".")[-1] in ("raised", "high") for k in t), lang
        for key, text in t.items():
            if key.startswith("ui.settings.air_") and key.endswith(("_raised", "_high")):
                assert not re.search(r"raised|high|erhöht|hoch\b|podwyższ|wysok", text, re.I), (lang, key, text)


def open_view_cards(view):
    return [c for _, c in view_cards(view) if c.get("tap_action", {}).get("action") == "navigate"]


def test_settings_link_to_dashboard(demo):
    for lang in LANGS:
        general = settings_views(demo[f"ramka-settings.{lang}.yaml"])["general"]
        [card] = open_view_cards(general)
        assert card["tap_action"]["navigation_path"] == "/dashboard-ramka/ramka?disable_km"
        assert card["name"] == translations(lang)["ui.settings.open_view"]
        [section] = [s for s, c in view_cards(general) if c is card]
        assert not advanced(section, card)


def test_settings_link_per_language(tmp_path):
    inputs = demo_inputs()
    inputs["dashboard_paths"] = {"en": "dashboard-ramka", "de": "ramka-de"}
    rendered = render(tmp_path, inputs)
    paths = {lang: open_view_cards(settings_views(rendered[f"ramka-settings.{lang}.yaml"])["general"])[0]["tap_action"]["navigation_path"]
             for lang in LANGS}
    # pl has no entry: dashboard_path.
    assert paths == {"en": "/dashboard-ramka/ramka?disable_km", "de": "/ramka-de/ramka?disable_km", "pl": "/dashboard-ramka/ramka?disable_km"}


@pytest.mark.parametrize("key, value", [("dashboard_paths", {"en": "/dashboard-ramka"}), ("dashboard_paths", {"de": "ramka de"}),
                                        ("dashboard_path", "/dashboard-ramka"), ("dashboard_paths", ["ramka-de"])])
def test_settings_link_bad_path_fails(tmp_path, key, value):
    inputs = demo_inputs()
    inputs[key] = value
    with pytest.raises(dr.RenderError, match=r"ramka: dashboard paths must be plain url paths"):
        render(tmp_path, inputs)


def test_settings_language_note(tmp_path, demo):
    for lang in LANGS:
        t = translations(lang)
        general = settings_views(demo[f"ramka-settings.{lang}.yaml"])["general"]
        [note] = [c for s, c in view_cards(general) if c.get("type") == "markdown" and t["ui.settings.language"] in c["content"]]
        [section] = [s for s, c in view_cards(general) if c is note]
        assert not advanced(section, note)
        assert "`/dashboard-ramka`" in note["content"]
        assert "input_select.ramka_language" not in json.dumps(general)
    inputs = demo_inputs()
    inputs["dashboard_paths"] = {"en": "dashboard-ramka", "pl": "dashboard-ramka-pl"}
    general = settings_views(render(tmp_path, inputs)["ramka-settings.en.yaml"])["general"]
    assert "en: `/dashboard-ramka`" in markdown(general) and "pl: `/dashboard-ramka-pl`" in markdown(general)


def test_calendar_page_links_to_ics_and_caldav(demo):
    for lang in LANGS:
        view = settings_views(demo[f"ramka-settings.{lang}.yaml"])["calendar"]
        text = markdown(view)
        assert "/config/integrations/dashboard/add?domain=remote_calendar" in text
        assert "/config/integrations/dashboard/add?domain=caldav" in text
        assert "`calendar`" in text and "`domosenso/ramka.inputs.yaml`" in text
        assert translations(lang)["ui.settings.calendar_by_url"] in text


# ---- Climate rooms (SPEC-021 amendment 2) -------------------------------------------------------


def demo_rooms(inputs=None):
    """The rooms the seed gives a home: the first ten of `climate`, temperature and humidity."""
    return [{"type": "temperature", "label": c["label"], "main": c["temperature"], "extra": c.get("humidity") or ""}
            for c in (inputs or demo_inputs())["climate"][:10]]


def test_climate_rooms_default_to_the_first_ten(demo, tmp_path):
    package = demo["package.yaml"]
    # The demo has seven, more than amendment 2's five: all of them now (amendment 3).
    assert 5 < len(demo_inputs()["climate"]) <= 10
    rooms = run_reset(package, events=True)[CLIMATE]
    assert rooms == demo_rooms() and len(rooms) == len(demo_inputs()["climate"])
    # More than ten: the first ten.
    inputs = demo_inputs()
    inputs["climate"] = [dict(inputs["climate"][n % 7], label=f"R{n}") for n in range(12)]
    many = run_reset(render(tmp_path, inputs)["package.yaml"], events=True)[CLIMATE]
    assert many == demo_rooms(inputs) and len(many) == 10
    assert run_reset(package, page="climate", events=True) == {CLIMATE: rooms, "input_boolean.ramka_page_climate": "on", **CLIMATE_SLOTS,
                                                              **CLIMATE_THRESHOLDS, **CLIMATE_NEUTRAL}
    assert run_reset(package, groups=["climate"], events=True) == {CLIMATE: rooms, **CLIMATE_THRESHOLDS, **CLIMATE_NEUTRAL}
    assert run_reset(package, groups=["climate_slots"], events=True) == CLIMATE_SLOTS
    assert CLIMATE not in run_reset(package, page="photos", events=True)


def test_climate_rooms_sensor_and_script(demo):
    package = demo["package.yaml"]
    sensor = event_sensor(package, "ramka_climate_rooms")
    assert sensor["default_entity_id"] == CLIMATE
    rooms = [{"type": "empty", "spacer": True}, {"type": "temperature", "label": "K", "main": "sensor.k_t", "extra": ""},
             {"type": "air", "label": "No sensor yet", "main": "", "extra": ""}, {"label": "Old", "main": "sensor.o", "extra": ""}]
    trigger = {"event": {"data": {"rooms": rooms}}}
    # The state counts the widgets with a reading, not the empty ones nor one without its sensor.
    assert ha(sensor["state"], trigger=trigger) == "2"
    assert ha_value(sensor["attributes"]["rooms"], trigger=trigger) == rooms
    script = package["script"]["ramka_climate_rooms_set"]
    assert "selector" not in script["fields"]["rooms"]
    [step] = script["sequence"]
    assert step["event"] == "ramka_climate_rooms"
    sent = lambda attrs=None, **f: ha_value(step["event_data"]["rooms"], attrs=attrs, **f)  # noqa: E731
    empty = {"type": "empty", "spacer": True}
    many = [{"type": "custom", "label": f"R{n}", "main": f"sensor.r{n}", "extra": f"sensor.h{n}"} for n in range(21)]
    assert sent(rooms=many) == many[:20]
    # The type and its own values are kept: a temperature's comfort numbers, a custom's colour; a
    # typed widget without its sensor yet keeps its place and type.
    typed = [{"type": "temperature", "label": "K", "main": "sensor.k_t", "extra": "sensor.k_h", "temp_low": 19.5, "temp_high": 23,
              "hum_low": 35, "hum_high": 55},
             {"type": "air", "label": "B", "main": "sensor.b_co2", "extra": "sensor.b_pm"},
             {"type": "custom", "label": "P", "main": "sensor.p", "extra": "", "color": "light blue"},
             {"type": "temperature", "label": "", "main": "", "extra": ""},
             {"type": "custom", "label": "Q", "main": "sensor.q", "extra": ""}]
    expected = [{**typed[0], "temp_high": 23.0, "hum_low": 35.0, "hum_high": 55.0}, *typed[1:]]
    assert sent(rooms=typed) == expected
    # A colour stored as a theme slot number (the build before the named colours) becomes its id:
    # every slot the old dialog offered keeps its colour.
    old = {4: "teal", 5: "purple", 6: "pink", 9: "green", 11: "magenta", 10: "grey"}
    assert [r.get("color") for r in sent(rooms=[{"type": "custom", "label": "P", "main": "sensor.p", "extra": "", "color": n}
                                                for n in old])] == list(old.values())
    assert sent(rooms=[{"type": "custom", "label": "P", "main": "sensor.p", "extra": "", "color": 9.0}])[0]["color"] == "green"
    # Values that do not belong to the type, or are no number, go.
    assert sent(rooms=[{"type": "air", "label": "A", "main": "sensor.a", "extra": "", "temp_low": 18, "color": 9},
                       {"type": "temperature", "label": "T", "main": "sensor.t", "extra": "", "temp_low": "cold", "color": 9},
                       {"type": "custom", "label": "C", "main": "sensor.c", "extra": "", "color": "violet"},
                       {"type": "custom", "label": "D", "main": "sensor.d", "extra": "", "color": 2.5}]) == [
        {"type": "air", "label": "A", "main": "sensor.a", "extra": ""}, {"type": "temperature", "label": "T", "main": "sensor.t", "extra": ""},
        {"type": "custom", "label": "C", "main": "sensor.c", "extra": ""}, {"type": "custom", "label": "D", "main": "sensor.d", "extra": ""}]
    # An entry without a type (before the types): a temperature when its main sensor is one, else
    # custom; without a sensor as its main reading an empty one in its place (an empty tile); missing
    # keys become empty; empty ones at the end go, and junk that is no row at all.
    attrs = {"sensor.a": {"device_class": "temperature"}, "sensor.b": {"device_class": "carbon_dioxide"}}
    assert sent(attrs, rooms=[{"label": "x", "main": ""}, {"main": "sensor.a"}, "junk", {"label": "y", "main": "light.l"},
                              {"spacer": True}, {"label": "B", "main": "sensor.b", "extra": "sensor.c"}, {"type": "empty"},
                              {"spacer": True}, {"main": ""}]) == [
        empty, {"type": "temperature", "label": "", "main": "sensor.a", "extra": ""}, empty, empty,
        {"type": "custom", "label": "B", "main": "sensor.b", "extra": "sensor.c"}]
    # A typed widget whose main reading is no sensor keeps its type, the reading empty.
    assert sent(rooms=[{"type": "custom", "label": "L", "main": "light.l"}]) == [{"type": "custom", "label": "L", "main": "", "extra": ""}]
    assert sent(rooms=[{"spacer": True}, {"main": ""}, {"type": "empty"}]) == []
    # Twenty at most, counted before the empty ones at the end go.
    assert sent(rooms=[{"spacer": True}] * 20 + [{"main": "sensor.a"}]) == []
    assert sent() == [] and sent(rooms="sensor.a") == []


def test_climate_cards_follow_the_rooms(demo):
    for lang in LANGS:
        dashboard = demo[f"dashboard.{lang}.yaml"]
        [rooms_card] = [n for n in walk(dashboard) if n.get("type") == "custom:rooms-card"]
        assert rooms_card["entity"] == CLIMATE and rooms_card["slots"] == SLOTS
        charts = [n for n in walk(dashboard) if n.get("type") == "custom:line-style-card"]
        outside = translations(lang)["ui.climate.outside"]
        assert [c["rooms"] for c in charts] == [
            {"entity": CLIMATE, "slots": SLOTS, "key": "extra", "after": [{"entity": "sensor.outside_humidity", "name": outside}]},
            {"entity": CLIMATE, "slots": SLOTS, "key": "main", "after": [{"entity": "sensor.outside_temperature", "name": outside}]}]


def test_climate_slots_helper_and_seed(demo):
    """The number of places (1 to 20, default 10): a slider on Climate, Basic; seeded once, by its
    own flag (a fresh helper's 1 cannot be told from a chosen 1), whatever the rooms and also after
    the settings flag is on; a home's number stays, a chosen 1 too; unknown is seeded again."""
    package = demo["package.yaml"]
    helper = package["input_number"]["ramka_climate_slots"]
    assert (helper["min"], helper["max"], helper["step"], helper["mode"]) == (1, 20, 1, "slider") and "initial" not in helper
    seeded = {**tuned(package), "input_boolean.ramka_settings_seeded": "on",
              **{f"input_number.ramka_{k}": v for k, v in zip(MUSIC_DB, (35.0, 75.0, 30.0, 70.0))},
              "input_number.ramka_music_hold_s": 0.5, "input_number.ramka_music_calm_fall_s": 6.0}
    rooms = demo_rooms()
    assert seed_groups(package, seeded, rooms=rooms) == []
    slots_seeded = {**seeded, "input_boolean.ramka_climate_slots_seeded": "on"}
    for untouched in (1.0, "unknown", "unavailable"):
        assert seed_groups(package, {**seeded, SLOTS: untouched}, rooms=rooms) == ["climate_slots"], untouched
        after = run_seed(package, {**seeded, SLOTS: untouched})
        assert after[SLOTS] == 10 and after["input_boolean.ramka_climate_slots_seeded"] == "on"
    for unusable in ("unknown", "unavailable"):
        assert seed_groups(package, {**slots_seeded, SLOTS: unusable}, rooms=rooms) == ["climate_slots"], unusable
    # A home's number stays: one it had before the flag, and a 1 it chose after the first seed.
    assert seed_groups(package, {**seeded, SLOTS: 4.0}, rooms=rooms) == []
    assert seed_groups(package, {**slots_seeded, SLOTS: 1.0}, rooms=rooms) == []
    assert run_seed(package, {**slots_seeded, SLOTS: 1.0})[SLOTS] == 1.0
    # The rooms are not sent again when only the number is seeded.
    assert run_reset(package, groups=["climate_slots"], events=True) == {SLOTS: 10}
    for lang in LANGS:
        climate = settings_views(demo[f"ramka-settings.{lang}.yaml"])["climate"]
        [(section, card)] = [(s, c) for s, c in view_cards(climate) if c.get("type") == "custom:climate-rooms-card"]
        assert card["slots"] == SLOTS
        assert any(r.get("entity") == SLOTS and r.get("name") == translations(lang)["ui.settings.climate_slots"]
                   for _, c in view_cards(climate) for r in rows(c))


def test_climate_thresholds_switch_and_air_limits(demo, tmp_path):
    """Threshold-based colours (default off) and the number of widgets sit in Climate's Advanced card;
    the rooms-card reads the switch and, as the settings card, the Air page's CO2 and PM2.5 limits of
    the readings the home has."""
    package = demo["package.yaml"]
    assert package["input_boolean"]["ramka_climate_thresholds"]["name"] and "initial" not in package["input_boolean"]["ramka_climate_thresholds"]
    assert package["input_number"]["ramka_climate_slots"]["name"].endswith("climate widgets")
    # Reset with the page and with the widgets' group; seeded with the widgets, while the sensor has none.
    assert run_reset(package, page="climate")[THRESHOLDS] == "off"
    assert run_reset(package, groups=["climate"]) == {**CLIMATE_THRESHOLDS, **CLIMATE_NEUTRAL}
    assert THRESHOLDS not in run_reset(package, groups=["climate_slots"])
    limits = {"co2": ["input_number.ramka_air_co2_raised", "input_number.ramka_air_co2_high"],
              "pm2_5": ["input_number.ramka_air_pm2_5_raised", "input_number.ramka_air_pm2_5_high"]}
    for lang in LANGS:
        t = translations(lang)
        climate = settings_views(demo[f"ramka-settings.{lang}.yaml"])["climate"]
        [(section, card)] = [(s, c) for s, c in view_cards(climate) if any(r.get("entity") == THRESHOLDS for r in rows(c))]
        # The neutral colour next to the switch.
        assert [r["entity"] for r in rows(card)] == [SLOTS, THRESHOLDS, NEUTRAL_COLOUR] and advanced(section, card)
        assert [r["name"] for r in rows(card)] == [t["ui.settings.climate_slots"], t["ui.settings.climate_thresholds"],
                                                   t["ui.settings.climate_color_neutral"]]
        [picker] = [c for _, c in view_cards(climate) if c.get("type") == "custom:climate-rooms-card"]
        assert picker["air_limits"] == limits and picker["neutral_color"] == NEUTRAL_COLOUR
        [rooms_card] = [n for n in walk(demo[f"dashboard.{lang}.yaml"]) if n.get("type") == "custom:rooms-card"]
        assert rooms_card["thresholds"] == THRESHOLDS and rooms_card["air_limits"] == limits
        # An Air quality widget takes the Air page's colours, so both views agree.
        assert rooms_card["neutral_color"] == NEUTRAL_COLOUR and rooms_card["air_colors"] == AIR_COLOUR_SELECTS
    assert (translations("en")["ui.settings.climate_slots"], translations("de")["ui.settings.climate_slots"],
            translations("pl")["ui.settings.climate_slots"]) == ("Number of widgets", "Zahl der Widgets", "Liczba widżetów")
    # A home whose air input has no PM2.5: only CO2's limits; without the air input none.
    inputs = demo_inputs()
    inputs["air"] = {k: v for k, v in inputs["air"].items() if k != "pm2_5"}
    rendered = render(tmp_path / "co2", inputs)
    [rooms_card] = [n for n in walk(rendered["dashboard.en.yaml"]) if n.get("type") == "custom:rooms-card"]
    assert rooms_card["air_limits"] == {"co2": limits["co2"]}
    rendered = render(tmp_path / "noair", without_pages("air"))
    [rooms_card] = [n for n in walk(rendered["dashboard.en.yaml"]) if n.get("type") == "custom:rooms-card"]
    assert "air_limits" not in rooms_card and rooms_card["thresholds"] == THRESHOLDS
    assert "air_colors" not in rooms_card and rooms_card["neutral_color"] == NEUTRAL_COLOUR
    assert not set(AIR_COLOURS) & defined_entities(rendered["package.yaml"])
    climate = settings_views(rendered["ramka-settings.en.yaml"])["climate"]
    assert all("air_limits" not in c for _, c in view_cards(climate))
    assert THRESHOLDS not in defined_entities(render(tmp_path / "noclimate", without_pages("climate"))["package.yaml"])


def test_climate_card_on_climate_advanced(demo):
    for lang in LANGS:
        climate = settings_views(demo[f"ramka-settings.{lang}.yaml"])["climate"]
        [(section, card)] = [(s, c) for s, c in view_cards(climate) if c.get("type") == "custom:climate-rooms-card"]
        assert card["entity"] == CLIMATE and card["script"] == "script.ramka_climate_rooms_set"
        assert advanced(section, card) and ADVANCED_ON in card["visibility"]
        assert translations(lang)["ui.settings.climate_rooms_how"] in markdown(climate)


def test_no_climate_rooms_without_climate(tmp_path):
    rendered = render(tmp_path, without_pages("climate"))
    package = rendered["package.yaml"]
    assert CLIMATE not in defined_entities(package) and "ramka_climate_rooms_set" not in package["script"]
    assert CLIMATE not in run_reset(package, events=True)
    assert "climate" not in seed_groups(package, at_minimum(package))


def test_no_script_field_has_an_empty_selector(demo):
    """Home Assistant 2026.9.2 disabled a script whose field selector was a type with an empty
    mapping (`object: {}`, then `boolean: {}`: "Only one type can be specified")."""
    for name, script in demo["package.yaml"]["script"].items():
        for field, spec in (script.get("fields") or {}).items():
            for kind, options in (spec.get("selector") or {}).items():
                assert options, f"{name}.{field}: selector {kind} is empty"


# ---- The About page (SPEC-023) ---------------------------------------------------------


def _about_markdown(dashboard) -> str:
    cards = [c for _, c in view_cards(settings_views(dashboard)["about"]) if c.get("type") == "markdown"]
    [table] = [c["content"] for c in cards if "sensor.domosenso_components" in c["content"]]
    return table  # the Components table; the discovery row is above it, Related and Devices follow


@pytest.mark.parametrize("lang", LANGS)
def test_about_page_lists_the_components(demo, lang):
    """The table comes from sensor.domosenso_components, rendered by Home Assistant's Jinja."""
    import jinja2
    t = settings_texts(lang)
    content = _about_markdown(demo[f"ramka-settings.{lang}.yaml"])
    items = [{"id": "audio-sensor", "version": "0.2.0", "tag": "audio-sensor/0.2.0", "commit": "0f1f0a7d060e",
              "released": "2026-10-30", "dev": False},
             {"id": "ramka", "version": "0.8.0", "tag": "", "commit": "abc-dirty", "released": "2026-10-31", "dev": True},
             {"id": "bermuda-presence", "version": "0.2.1", "tag": "bermuda-presence/0.2.1", "commit": "", "released": "",
              "dev": False, "package": "ble-proxy.yaml"}]
    env = jinja2.Environment()
    # Home Assistant's own template functions, as far as the table uses them; no discovery has run.
    ha = {"states": lambda entity: "unknown", "as_timestamp": lambda value, default=None: default}
    shown = env.from_string(content).render(state_attr=lambda entity, attr: items if (entity, attr) == (
        "sensor.domosenso_components", "components") else None, **ha)
    lines = shown.splitlines()
    header = f"| {t['ui.settings.about_component']} | {t['ui.settings.about_version']} | {t['ui.settings.about_released']} |"
    at = lines.index(header)
    assert lines[at + 1:at + 5] == [
        "|---|---|---|",
        "| audio-sensor | 0.2.0 | 2026-10-30 |",
        f"| ramka | 0.8.0 ({t['ui.settings.about_dev']}) | 2026-10-31 |",
        f"| bermuda-presence | 0.2.1 ({t['ui.settings.about_package']} `ble-proxy.yaml`) | — |",
    ]
    # Without the sensor: the Ramka alone, as rendered, and how to get the list.
    missing = env.from_string(content).render(state_attr=lambda entity, attr: None, **ha)
    version = yaml.safe_load((COMP / "component.yaml").read_text(encoding="utf-8"))["version"]
    assert f"| ramka | {version} |" in missing.splitlines()
    assert t["ui.settings.about_missing"].split(":")[0] in missing


def test_about_page_is_last_and_read_only(demo):
    view = settings_views(demo["ramka-settings.en.yaml"])["about"]
    assert [v["path"] for v in demo["ramka-settings.en.yaml"]["views"]][-1] == "about"
    # No helper, nothing to reset: the only row is the Refresh button, which runs the discovery.
    assert [r for _, card in view_cards(view) for r in rows(card) if r.get("entity")] == []
    assert not list(reset_actions(view))


# ---- Plants (SPEC-022): discover, plants per page and seconds per page --------------------------

DISCOVER_INPUTS = REPO / "tests" / "fixtures" / "ramka-plants-discover.yaml"


def plants_card(dashboard):
    [card] = [n for n in walk(dashboard) if isinstance(n, dict) and n.get("type") == "custom:plants-card"]
    return card


def plants_stage(package):
    loop = package["script"]["ramka_ambient_loop"]["sequence"][0]["repeat"]["sequence"]
    [stage] = [s for s in loop if s.get("if") and s["if"][0].get("state") == "plants"]
    return stage["then"]


def stage_seconds(template, states=None, plants=()):
    """The plants stage's delay with stub states and `plants` as the plant entities' attributes."""
    import types

    import jinja2

    states = states or {}

    class States:
        plant = [types.SimpleNamespace(attributes=a) for a in plants]

        def __call__(self, entity_id):
            return str(states.get(entity_id, "unavailable"))

    env = jinja2.Environment()
    return env.from_string(template).render(states=States()).strip()


def test_plants_discover_renders_a_discovering_card(tmp_path):
    out = render(tmp_path, yaml.safe_load(DISCOVER_INPUTS.read_text(encoding="utf-8")))
    card = plants_card(out["dashboard.en.yaml"])
    assert card["discover"] is True and "plants" not in card
    assert card["per_page"] == "input_number.ramka_plants_per_page"
    assert card["page_s"] == "input_number.ramka_plants_page_s"


def test_plants_list_still_renders_as_before(demo):
    card = plants_card(demo["dashboard.en.yaml"])
    assert [p["entity"] for p in card["plants"]] == [p["entity"] for p in demo_inputs()["plants"]]
    assert "discover" not in card
    assert (card["per_page"], card["page_s"]) == ("input_number.ramka_plants_per_page", "input_number.ramka_plants_page_s")


def test_plants_helpers_and_their_ranges(demo):
    numbers = demo["package.yaml"]["input_number"]
    per, secs = numbers["ramka_plants_per_page"], numbers["ramka_plants_page_s"]
    assert (per["min"], per["max"], per["step"]) == (1, 12, 1)
    assert (secs["min"], secs["max"], secs["unit_of_measurement"]) == (5, 30, "s")


def plants_pages(stage, states=None, plants=()) -> int:
    [variables] = [a["variables"] for a in stage if "variables" in a]
    return int(stage_seconds(variables["pages"], states, plants))


def test_plants_stage_length_follows_pages(demo, tmp_path):
    """Since SPEC-026 the stage turns the pages itself: the page on screen for plants_page_s, the
    next, at most two a pass (with the count of plants-card's pages); no plants: 1 s."""
    stage = plants_stage(demo["package.yaml"])
    # The demo lists three plants: one page, with the defaults or the helpers' values.
    assert plants_pages(stage) == 1
    assert plants_pages(stage, {"input_number.ramka_plants_per_page": "2"}) == 2
    [split] = [a for a in stage if "if" in a and "else" in a]
    assert ha(split["if"][0]["value_template"], pages=0) == "True"
    assert [n["delay"]["seconds"] for n in walk(split["then"]) if "delay" in n] == [1]
    [repeat] = [a["repeat"] for a in split["else"] if "repeat" in a]
    assert [ha(repeat["count"], pages=n) for n in (1, 2, 5)] == ["1", "2", "2"]
    [delay] = [n["delay"]["seconds"] for n in walk(repeat["sequence"]) if isinstance(n.get("delay"), dict)]
    assert ha(delay) == "10" and ha(delay, states={"input_number.ramka_plants_page_s": "7"}) == "7"
    out = render(tmp_path, yaml.safe_load(DISCOVER_INPUTS.read_text(encoding="utf-8")))
    stage = plants_stage(out["package.yaml"])
    marked = [{"domosenso_plant": True}] * 15 + [{}]
    assert plants_pages(stage, plants=marked) == 6           # three pages of six, three list pages
    assert plants_pages(stage, plants=marked[:6]) == 2       # the tiles, then the list (0.8.0)
    assert plants_pages(stage, plants=marked[:4]) == 1       # up to four: no list page
    assert plants_pages(stage, plants=[]) == 0


def test_plants_stage_turns_the_page_and_continues_next_pass(demo):
    """Between the two slots and once more after handing on, so the next pass continues; round
    the page count (SPEC-026)."""
    stage = plants_stage(demo["package.yaml"])
    turns = [a for a in walk(stage) if a.get("action") == "input_number.set_value"]
    assert len(turns) == 2 and stage[-1] is turns[-1]
    assert stage.index(hand_on({"then": stage})) == len(stage) - 2
    page = {"input_number.ramka_plants_page": "5.0"}
    assert [ha(turns[0]["data"]["value"], states=page, pages=n) for n in (6, 4, 0)] == ["0", "2", "0"]
    [inner] = [a for a in walk(stage) if "repeat" in a]
    [cond] = [a for a in inner["repeat"]["sequence"] if "if" in a]
    assert [ha(cond["if"][0]["value_template"], pages=3, repeat={"index": i}) for i in (1, 2)] == ["True", "False"]


def test_plants_card_reads_the_page_on_screen(demo):
    for lang in LANGS:
        assert plants_card(demo[f"dashboard.{lang}.yaml"])["page"] == "input_number.ramka_plants_page"


def test_plants_helpers_reset_and_seeded(demo):
    package = demo["package.yaml"]
    text = yaml.safe_dump(reset_script(package))
    for entity, value in PLANT_SETTINGS.items():
        assert entity in text
    seed = automation(package, "settings_seed")
    assert "ramka_plants_per_page" in yaml.safe_dump(seed) and "'plants'" in yaml.safe_dump(seed)


def test_plants_settings_page_has_both_helpers(tmp_path):
    for inputs in (demo_inputs(), yaml.safe_load(DISCOVER_INPUTS.read_text(encoding="utf-8"))):
        out = render(tmp_path / str(id(inputs)), inputs)
        [page] = [v for v in out["ramka-settings.en.yaml"]["views"] if v["path"] == "plants"]
        found = {n for n in strings(page) if n.startswith("input_number.ramka_plants")}
        assert found == set(PLANT_SETTINGS)


def test_plants_list_labels_per_language(tmp_path):
    inputs = demo_inputs()
    inputs["plants"][0]["label"] = {"en": "Living room", "de": "Wohnzimmer", "pl": "Pokój dzienny"}
    out = render(tmp_path, inputs)
    for lang, room in (("en", "Living room"), ("de", "Wohnzimmer"), ("pl", "Pokój dzienny")):
        assert plants_card(out[f"dashboard.{lang}.yaml"])["plants"][0]["room"] == room, lang
    [page] = [v for v in out["ramka-settings.pl.yaml"]["views"] if v["path"] == "plants"]
    assert "Pokój dzienny" in yaml.safe_dump(page, allow_unicode=True)


def test_about_discovery_in_the_package(demo):
    """The About page's discovery (SPEC-023): the command in every home, the refresh script publishing
    the result and updating the HACS update entities, the sensor out of the recorder, start and nightly."""
    package = demo["package.yaml"]
    assert package["shell_command"]["ramka_discover"] == "python3 /config/shell/domosenso_discover.py /config"
    steps = package["script"]["ramka_about_refresh"]["sequence"]
    assert steps[0] == {"action": "shell_command.ramka_discover", "response_variable": "run"}
    [event] = [s for s in steps if "event" in s]
    assert event["event"] == "ramka_discovery"
    assert set(event["event_data"]) == {"refreshed", "ha_version", "found", "uses", "integrations", "declared_links", "links"}
    assert any("homeassistant.update_entity" in json.dumps(s) for s in steps)
    assert "sensor.ramka_discovery" in package["recorder"]["exclude"]["entities"]
    [block] = [b for b in package["template"] if any(t.get("event_type") == "ramka_discovery" for t in b.get("triggers", []))]
    [sensor] = block["sensor"]
    assert sensor["default_entity_id"] == "sensor.ramka_discovery" and "device_class" not in sensor
    assert set(sensor["attributes"]) == {"component", "ha_version", "found", "uses", "integrations", "declared_links", "links"}
    [auto] = [a for a in package["automation"] if a["id"] == "ramka_about_discover"]
    assert {t["trigger"] for t in auto["triggers"]} == {"homeassistant", "time"}
    assert auto["actions"][-1] == {"action": "script.ramka_about_refresh"}


def test_about_header_and_refresh_badge(demo):
    for lang in LANGS:
        view = settings_views(demo[f"ramka-settings.{lang}.yaml"])["about"]
        assert view["type"] == "sections" and view["header"]["card"]["text_only"] is True
        header = view["header"]["card"]["content"]
        assert "/cards/assets/domosenso-mark.svg" in header and "https://domosenso.org/get-started/" in header
        assert "Apache-2.0" in header and "ZeroStoryPoints GmbH" in header
        [badge] = view["badges"]
        assert badge["tap_action"]["perform_action"] == "script.ramka_about_refresh"
        assert len(view["sections"]) == 2  # Components and Related; Devices


# ---- music looks: the response profiles, each with its own values, and the EQ loader (spec 4.1, 5, 8)

LOOK_IDS = ["custom", "behind_speakers", "lively", "calm", "analyser"]
TEMPLATE_IDS = LOOK_IDS[1:]
EQ_PRESET_IDS = ["flat", "behind_speakers", "half_match", "wled_big_speakers", "wled_big_speakers_ics", "wled_pink",
                 "bass_light", "voices", "sparkle", "fitted"]
LOOK = "sensor.ramka_music_look"
TEMPLATE_SELECT = "input_select.ramka_music_template"
EQ_SELECT = "input_select.ramka_music_eq"
INFO_ROW = "custom:ramka-info-select-row"


def eq(*gains) -> dict:
    return dict(zip(EQ_KEYS, gains))


FLAT = eq(0, 0, 0, 0, 0, 0)
# SPEC-024; behind_speakers and half_match are one measurement on an amplifier (the full and the half
# correction), fitted is flat until set; a home's music_eq_presets replaces any of the three.
CATALOG_EQ = {
    "flat": FLAT, "behind_speakers": eq(-5, -10, -3, 0, 3, 2), "half_match": eq(-2, -5, -1, 0, 2, 1),
    "wled_big_speakers": eq(-4, -2, -5, 0, 1, 2), "wled_big_speakers_ics": eq(-3, -4, -4, 0, 2, -1),
    "wled_pink": eq(-2, 1, 2, 0, 2, 4), "bass_light": eq(-8, -6, 0, 0, 0, 0), "voices": eq(-6, -8, -2, 3, 4, 0),
    "sparkle": eq(-3, -3, 0, 0, 3, 5), "fitted": FLAT,
}
# Spec 4.1, the templates' starting values: EQ preset, tilt, rise ms, fall s, hold s. No colour window.
LOOK_ROWS = {
    "behind_speakers": ("behind_speakers", True, 100, 2, 1.5),
    "lively": ("wled_big_speakers_ics", False, 50, 0.3, 0.5),
    "calm": ("wled_big_speakers", True, 80, 4.2, 2.0),
    "analyser": ("flat", False, 0, 0.5, 1.0),
}
# Custom's starting values (the music_visual options' defaults, a flat EQ, 1.5 s hold).
CUSTOM_LOOK = {"rise": 200, "fall": 4, "hold": 1.5, "tilt": True, "eq": FLAT}


def profile_helpers(profile) -> dict[str, str]:
    """A profile's own helpers, by the look's key (eq_<range> for the gains): Custom keeps its ids from
    before the templates were editable, each template has its own."""
    stem = "ramka_music_" if profile == "custom" else f"ramka_music_{profile}_"
    return {"rise": f"input_number.{stem}rise_ms", "fall": f"input_number.{stem}fall_s", "hold": f"input_number.{stem}hold_s",
            "tilt": f"input_boolean.{stem}tilt", **{f"eq_{k}": f"input_number.{stem}eq_{k}" for k in EQ_KEYS}}


PROFILE_HELPERS = {e for profile in LOOK_IDS for e in profile_helpers(profile).values()}


def look_row(row) -> dict:
    """A template's starting values in the card's `look` shape (spec 3.2)."""
    preset, tilt, rise, fall, hold = row
    return {"rise": rise, "fall": fall, "hold": hold, "tilt": tilt, "eq": CATALOG_EQ[preset]}


def look_states(profile, look) -> dict:
    """The states of a profile's helpers holding `look`."""
    h = profile_helpers(profile)
    return {h["rise"]: look["rise"], h["fall"]: look["fall"], h["hold"]: look["hold"], h["tilt"]: "on" if look["tilt"] else "off",
            **{h[f"eq_{k}"]: look["eq"][k] for k in EQ_KEYS}}


def look_sensor(package) -> dict:
    [sensor] = [e for block in package["template"] for entities in template_entities(block) for e in entities
                if e["unique_id"] == "ramka_music_look"]
    return sensor


def run_look(package, states) -> tuple[str, dict]:
    """The look sensor's state and attributes, evaluated with stub states."""
    sensor = look_sensor(package)
    return ha(sensor["state"], states=states), {k: ha_value(t, states=states) for k, t in sensor["attributes"].items()}


def run_script(sequence, attrs=None, states=None, **variables) -> tuple[dict, list]:
    """What a script sequence writes (entity -> value) and logs (system_log.write data), evaluated
    with Jinja: variables, template `if` blocks, state conditions, `stop`, the helper actions and
    templated targets."""
    variables = dict(variables)
    written, logs = {}, []

    def value(v):
        return ha_value(v, attrs=attrs, states=states, **variables) if isinstance(v, str) else v

    def run(steps) -> bool:
        for step in steps:
            if step.get("condition") == "state":
                if (states or {}).get(step["entity_id"], "unavailable") != step["state"]:
                    return False
            elif "variables" in step:
                # In order: a variable can read the ones before it, as in Home Assistant.
                for k, v in step["variables"].items():
                    variables[k] = value(v)
            elif "if" in step:
                [condition] = step["if"]
                assert condition["condition"] == "template"
                if ha(condition["value_template"], attrs=attrs, states=states, **variables) == "True" and not run(step["then"]):
                    return False
            elif "stop" in step:
                return False
            else:
                action = ha(step["action"], attrs=attrs, **variables)
                data = {k: value(v) for k, v in (step.get("data") or {}).items()}
                if action == "system_log.write":
                    logs.append(data)
                    continue
                entity = ha(step["target"]["entity_id"], attrs=attrs, states=states, **variables)
                written[entity] = (data["value"] if action.endswith("set_value") else data["option"] if action.endswith("select_option")
                                   else {"input_boolean.turn_on": "on", "input_boolean.turn_off": "off"}[action])
        return True

    run(sequence)
    return written, logs


def eq_written(profile, gains) -> dict:
    h = profile_helpers(profile)
    return {h[f"eq_{k}"]: g for k, g in gains.items()}


def test_music_look_helpers(demo, plain):
    package = demo["package.yaml"]
    numbers, booleans = package["input_number"], package["input_boolean"]
    # Custom's ranges (spec 3.1, the card's console), and every template's helpers the same.
    spec = {"rise": (0, 2000, 10, "ms", "mdi:arrow-up-bold"), "fall": (0, 30, 0.1, "s", "mdi:arrow-down-bold"),
            "hold": (0, 10, 0.1, "s", "mdi:timer-sand"), **{f"eq_{k}": (-18, 12, 0.5, "dB", "mdi:equalizer") for k in EQ_KEYS}}
    for profile in LOOK_IDS:
        for key, entity in profile_helpers(profile).items():
            domain, name = entity.split(".")
            if domain == "input_boolean":
                assert booleans[name]["icon"] == "mdi:slope-uphill" and "initial" not in booleans[name], entity
                continue
            helper = numbers[name]
            assert (helper["min"], helper["max"], helper["step"], helper["unit_of_measurement"], helper["icon"], helper["mode"]) == (
                *spec[key], "slider"), entity
            assert "initial" not in helper, entity
    selects = package["input_select"]
    assert selects["ramka_music_template"]["options"] == LOOK_IDS
    assert selects["ramka_music_eq"]["options"] == ["—", *EQ_PRESET_IDS]
    # Copy to custom is gone: every profile is edited in place.
    assert "copy_to_custom" not in json.dumps(demo) and "ramka_music_copy_to_custom" not in package["script"]
    # Only with music_visual, as the other music helpers.
    without = plain["package.yaml"]
    assert not {e for e in defined_entities(without) if "music_look" in e or "music_eq" in e
                or "music_template" in e or "music_hold" in e or any(f"music_{i}_" in e for i in TEMPLATE_IDS)}
    assert LOOK not in json.dumps(without)


def test_music_look_sensor(demo):
    package = demo["package.yaml"]
    sensor = look_sensor(package)
    assert sensor["default_entity_id"] == LOOK
    assert set(sensor["attributes"]) == {"rise", "fall", "hold", "tilt", "eq"}
    assert LOOK in package["recorder"]["exclude"]["entities"]
    # Every profile's helpers hold their own values; the sensor reads the selected profile's only.
    tuned_looks = {profile: {"rise": 110.0 + i, "fall": 1.5 + i, "hold": 0.2 + i, "tilt": i % 2 == 0,
                             "eq": eq(-1.0 - i, -2.0, 0.5 * i, 1.0, 2.5, 3.0 - i)} for i, profile in enumerate(LOOK_IDS)}
    states = {e: v for profile, look in tuned_looks.items() for e, v in look_states(profile, look).items()}
    # The colour range is read by the cards, not by the sensor.
    states.update({"input_number.ramka_music_spectrum_neutral_db": 31.0, "input_number.ramka_music_spectrum_hot_db": 77.0})
    for profile in LOOK_IDS:
        state, attributes = run_look(package, {**states, TEMPLATE_SELECT: profile})
        assert (state, attributes) == (profile, tuned_looks[profile]), profile
        assert isinstance(attributes["tilt"], bool) and all(isinstance(attributes[k], (int, float)) for k in ("rise", "fall", "hold"))
        # A profile carries no colour window: the cards keep the user's neutral and hot helpers.
        assert "spectrum" not in attributes and "level" not in attributes, profile
    # A state that is no entry id (a dropped entry, unknown, unavailable) is Custom (spec 8).
    for other in ("half_match", "cinema", "unknown", "unavailable"):
        assert run_look(package, {**states, TEMPLATE_SELECT: other}) == ("custom", tuned_looks["custom"]), other
    # A profile's helpers unavailable: that profile's defaults, the values the seed writes.
    for entry, row in LOOK_ROWS.items():
        assert run_look(package, {TEMPLATE_SELECT: entry}) == (entry, look_row(row)), entry
    assert run_look(package, {TEMPLATE_SELECT: "custom"})[1] == CUSTOM_LOOK
    # One helper unavailable: only that value falls back.
    calm = look_states("calm", tuned_looks["calm"])
    del calm["input_number.ramka_music_calm_fall_s"]
    assert run_look(package, {**calm, TEMPLATE_SELECT: "calm"})[1] == {**tuned_looks["calm"], "fall": 4.2}
    # No table of fixed values any more: each template's value comes from its helper.
    for profile in TEMPLATE_IDS:
        for key in ("rise", "fall", "hold", "tilt", "eq"):
            assert profile_helpers(profile)[key if key != "eq" else "eq_sub"] in sensor["attributes"][key], (profile, key)


def test_music_look_behind_speakers_takes_fitted_when_set(tmp_path):
    """MLP match starts from the home's fitted curve once it is not flat, else its behind_speakers
    (spec 3.3, 4.1): the sensor's fallback and the value the reset writes into its helpers."""
    mlp = eq(-5, -10, -3, 0, 3, 2)
    inputs = with_visual()
    for name, presets, expected in (("mlp", {"behind_speakers": mlp}, mlp),
                                    ("flat-fitted", {"behind_speakers": mlp, "fitted": {"bass": 0}}, mlp),
                                    ("fitted", {"behind_speakers": mlp, "fitted": {"bass": -4, "air": 1.5}}, eq(0, -4, 0, 0, 0, 1.5))):
        inputs["music_eq_presets"] = presets
        package = render(tmp_path / name, inputs)["package.yaml"]
        assert run_look(package, {TEMPLATE_SELECT: "behind_speakers"})[1]["eq"] == expected, name
        written = run_reset(package, groups=["music_profiles"])
        assert {e: written[e] for e in eq_written("behind_speakers", expected)} == eq_written("behind_speakers", expected), name
        # The home's presets are what the EQ select loads too, into the selected profile.
        loaded, _ = run_script(package["script"]["ramka_music_load_eq"]["sequence"], states={TEMPLATE_SELECT: "calm"},
                               preset="behind_speakers")
        assert loaded == eq_written("calm", mlp), name


def test_behind_speakers_starts_from_the_measured_curve_and_a_home_can_flatten_it(tmp_path):
    """The catalog's behind_speakers and half_match are a measured starting point (SPEC-024); a home
    that wants the flat curve of before sets music_eq_presets.behind_speakers all zeros."""
    measured = render(tmp_path / "measured", with_visual())["package.yaml"]
    assert run_look(measured, {TEMPLATE_SELECT: "behind_speakers"})[1]["eq"] == eq(-5, -10, -3, 0, 3, 2)
    assert package_eq_table(measured)["half_match"] == eq(-2, -5, -1, 0, 2, 1)
    inputs = with_visual()
    inputs["music_eq_presets"] = {"behind_speakers": dict.fromkeys(EQ_KEYS, 0)}
    flat = render(tmp_path / "flat", inputs)
    assert run_look(flat["package.yaml"], {TEMPLATE_SELECT: "behind_speakers"})[1]["eq"] == FLAT
    written = run_reset(flat["package.yaml"], groups=["music_profiles"])
    assert {e: written[e] for e in eq_written("behind_speakers", FLAT)} == eq_written("behind_speakers", FLAT)
    [tip, *_] = eq_tooltips(flat["ramka-settings.en.yaml"])
    assert tip["behind_speakers"].splitlines()[-1] == "Curve: " + translations("en")["ui.settings.music_eq_curve_flat"]


def test_music_profile_helpers_have_few_writers(demo):
    """A profile's values are written by the user, the seed and reset, and the EQ loader only:
    choosing a profile, the templates and every other automation leave them alone."""
    package = demo["package.yaml"]
    writers = {"ramka_settings_reset", "ramka_music_load_eq"}
    for owner, node in [*((f"script.{k}", v) for k, v in package["script"].items() if k not in writers),
                        *((f"automation.{a['id']}", a) for a in package["automation"])]:
        for step in walk(node):
            target = step.get("target")
            ids = as_list(target.get("entity_id", [])) if isinstance(target, dict) else []
            assert not PROFILE_HELPERS & set(ids), owner
            assert not any("_music_" in str(i) and "_eq_" in str(i) for i in ids), owner


def test_music_eq_load_targets_the_selected_profile(demo):
    package = demo["package.yaml"]
    [auto] = [a for a in package["automation"] if a["id"] == "ramka_music_eq_load"]
    [trigger] = auto["triggers"]
    assert trigger["trigger"] == "state" and trigger["entity_id"] == EQ_SELECT
    assert all(c["condition"] == "template" for c in auto["conditions"]), auto["conditions"]
    [call, rest] = auto["actions"]
    assert call["action"] == "script.ramka_music_load_eq"
    # Then the select returns to no preset: one select serves every profile card.
    assert rest == {"action": "input_select.select_option", "target": {"entity_id": EQ_SELECT}, "data": {"option": "—"}}

    def fires(before, after) -> bool:
        event = {"from_state": None if before is None else {"state": before}, "to_state": {"state": after}}
        return all(ha(c["value_template"], trigger=event) == "True" for c in auto["conditions"] if c["condition"] == "template")

    # A choice loads; a start (no old state, or unavailable before) does not overwrite the profile's EQ.
    assert fires("—", "voices") and not fires(None, "voices") and not fires("unavailable", "voices")
    # The return to no preset (and a reset to it) loads nothing.
    assert not fires("voices", "—")
    assert ha(call["data"]["preset"], trigger={"to_state": {"state": "voices"}}) == "voices"
    # The script: the preset's six gains into the selected profile's EQ, whichever it is; a state that
    # is no entry id is Custom; an unknown preset logs a warning and writes nothing.
    script = package["script"]["ramka_music_load_eq"]
    sequence = script["sequence"]
    assert set(script["fields"]) == {"preset"} and script["fields"]["preset"].get("required") is not True
    for profile in LOOK_IDS:
        for preset, gains in CATALOG_EQ.items():
            assert run_script(sequence, states={TEMPLATE_SELECT: profile}, preset=preset) == (eq_written(profile, gains), []), (profile, preset)
    for other in ("half_match", "unknown", "unavailable"):
        assert run_script(sequence, states={TEMPLATE_SELECT: other}, preset="voices") == (eq_written("custom", CATALOG_EQ["voices"]), []), other
    for unknown in ("loud", ""):
        written, logs = run_script(sequence, states={TEMPLATE_SELECT: "calm"}, preset=unknown)
        assert written == {} and [log["level"] for log in logs] == ["warning"], unknown
    # It never changes the profile itself.
    assert all(TEMPLATE_SELECT != s.get("target", {}).get("entity_id") for s in sequence if isinstance(s.get("target"), dict))
    # Called without a preset, it loads the EQ select's preset; at rest (no preset) it writes nothing.
    assert run_script(sequence, states={TEMPLATE_SELECT: "lively", EQ_SELECT: "sparkle"}) == (
        eq_written("lively", CATALOG_EQ["sparkle"]), [])
    written, logs = run_script(sequence, states={TEMPLATE_SELECT: "lively", EQ_SELECT: "—"})
    assert written == {} and [log["level"] for log in logs] == ["warning"]


def test_music_reset_restores_every_profile(demo):
    package = demo["package.yaml"]
    expected = {**LOOK_DEFAULTS, **PROFILE_DEFAULTS}
    for fields in ({}, {"page": "music_live"}, {"groups": ["music_look", "music_profiles"]}):
        written = run_reset(package, **fields)
        assert {e: written.get(e) for e in expected} == expected, fields
    # The templates' defaults are their rows of spec 4.1.
    for entry, row in LOOK_ROWS.items():
        look = look_row(row)
        assert {e: PROFILE_DEFAULTS[e] for e in profile_helpers(entry).values()} == look_states(entry, look), entry
    # The music_profiles group is the templates' helpers and nothing else.
    assert set(run_reset(package, groups=["music_profiles"])) == set(PROFILE_DEFAULTS)
    assert set(PROFILE_DEFAULTS) == PROFILE_HELPERS - set(profile_helpers("custom").values())
    # The reset selects custom before it sets the EQ select (the select is the profile the cards then follow).
    order = [s["target"]["entity_id"] for s in walk(reset_script(package)["sequence"]) if isinstance(s.get("target"), dict)]
    assert order.index(TEMPLATE_SELECT) < order.index(EQ_SELECT)


# ---- music looks on the dashboards and the settings page (spec 4.1, 5, 7) ---------------------

# Spec 4.1's descriptions (en), word for word: purpose, best use, why / when.
LOOK_TEXTS = {
    "custom": ("Your own profile; starts as today's design.", "Anything, once you have tuned it.",
               "When no template fits. Every profile keeps its own values, so tuning one never changes another."),
    "behind_speakers": ("Look like your listening position does.", "Music and TV with the sensor behind or near the speakers, or on the amplifier.",
                  "Undoes the difference between the sensor's spot and your listening position: the catalog's curve, "
                  "measured with a sensor on an amplifier, until the home sets its own behind_speakers EQ, or the fitted one once calibrated."),
    "lively": ("Every beat shows.", "Parties, electronic and pop.",
               "WLED-MM's fast limiter (50 / 300 ms): a quick attack and release. Expect flicker on quiet material."),
    "calm": ("Slow and ambient.", "Background music, classical, evenings.",
             "WLED's \"Lazy\" for strong dynamics: a 4.2 s decay keeps loud passages from jumping."),
    "analyser": ("A meter to read.", "Watching the sound itself; best with the `bars` or `afterglow` flavour.",
                 "Instant attack and a short release, like the MSGEQ7 spectrum analysers sold on AliExpress and broadcast peak meters."),
}
LOOK_KEYS = ["music_template", *(f"music_template_{i}{part}" for i in LOOK_IDS for part in ("", "_purpose", "_best", "_why")),
             "music_eq", *(f"music_eq_{p}" for p in EQ_PRESET_IDS), *(f"music_eq_{k}" for k in EQ_KEYS),
             *(f"music_eq_{p}{part}" for p in EQ_PRESET_IDS for part in ("_purpose", "_best", "_why")),
             "music_eq_curve", "music_eq_curve_flat", "music_eq_curve_unset", *(f"music_eq_band_{k}" for k in EQ_KEYS),
             "music_hold_s", "music_rise_ms", "music_fall_s", "music_tilt",
             # The page's own labels around them.
             "music_look_best", "music_look_why", "music_profile_widget", "music_colour"]
# Gone with Copy to custom, the description card, the values read-out and the rate explanation.
GONE_KEYS = ["music_look_values", "music_copy_to_custom", "music_copy_to_custom_confirm", "music_custom", "music_look",
             "music_sensor", "music_spectrum_rate_eco", "music_spectrum_rate_normal", "music_spectrum_rate_fast",
             # Classic is the live switch off, and the profile is one card (SPEC-025 amendment 1).
             "music_visual_classic", "music_profile_settings"]


def profile_text(t, profile) -> str:
    """The tooltip of a profile: purpose, best use and why / when, a line each."""
    return "\n".join([t[f"ui.settings.music_template_{profile}_purpose"],
                      f"{t['ui.settings.music_look_best']}: {t[f'ui.settings.music_template_{profile}_best']}",
                      f"{t['ui.settings.music_look_why']}: {t[f'ui.settings.music_template_{profile}_why']}"])


def db(value) -> str:
    """A gain as the tooltip writes it: a true minus, a plus for a lift, no ".0"."""
    v = int(value) if value == int(value) else value
    return f"\u2212{-v} dB" if v < 0 else f"+{v} dB" if v > 0 else "0 dB"


def preset_text(t, preset, gains, own=False) -> str:
    """The tooltip of an EQ preset: purpose, best use, why / when and its curve, a line each; `own`:
    the home set it in music_eq_presets (a flat `fitted` waits for the home's curve until then)."""
    if any(gains.values()):
        curve = ", ".join(f"{t[f'ui.settings.music_eq_band_{k}']} {db(gains[k])}" for k in EQ_KEYS)
    else:
        curve = t["ui.settings.music_eq_curve_unset" if preset == "fitted" and not own else "ui.settings.music_eq_curve_flat"]
    return "\n".join([t[f"ui.settings.music_eq_{preset}_purpose"],
                      f"{t['ui.settings.music_look_best']}: {t[f'ui.settings.music_eq_{preset}_best']}",
                      f"{t['ui.settings.music_look_why']}: {t[f'ui.settings.music_eq_{preset}_why']}",
                      f"{t['ui.settings.music_eq_curve']}: {curve}"])


def eq_tooltips(dashboard) -> list[dict]:
    """The descriptions of every EQ preset select on a settings dashboard."""
    return [n["descriptions"] for n in walk(dashboard) if n.get("type") == INFO_ROW and n.get("entity") == EQ_SELECT]


def package_eq_table(package) -> dict:
    """The preset table the package's loader script carries (eq_presets in templates/package.yaml.j2)."""
    [gains] = [step["variables"]["gains"] for step in package["script"]["ramka_music_load_eq"]["sequence"]
               if "gains" in step.get("variables", {})]
    return json.loads(gains.strip().removeprefix("{{").rsplit("[chosen]", 1)[0])


def test_eq_preset_tooltips_name_their_curve(tmp_path, demo):
    """Every EQ preset's (i) tells what it does, its best use, why / when and the curve it loads,
    built at render time from the preset table: the catalog's, and a home's own in music_eq_presets."""
    en = translations("en")
    assert preset_text(en, "wled_pink", CATALOG_EQ["wled_pink"]).endswith(
        "Curve: sub \u22122 dB, bass +1 dB, low mids +2 dB, mids 0 dB, presence +2 dB, air +4 dB")
    assert preset_text(en, "flat", FLAT).endswith("Curve: flat, 0 dB in every range")
    assert "music_eq_presets" in preset_text(en, "fitted", FLAT).splitlines()[-1]
    for lang in LANGS:
        tips = eq_tooltips(demo[f"ramka-settings.{lang}.yaml"])
        assert len(tips) == len(LOOK_IDS), lang
        for tip in tips:
            assert tip == {p: preset_text(translations(lang), p, CATALOG_EQ[p]) for p in EQ_PRESET_IDS}, lang
            assert all(len(text.splitlines()) == 4 for text in tip.values()), lang
    # A home's own curves replace the catalog's as a whole (a key left out is 0, a fraction kept); one
    # it sets empty is flat.
    inputs = with_visual()
    inputs["music_eq_presets"] = {"behind_speakers": {"sub": -4, "bass": -10, "low_mid": -3, "presence": 3, "air": 2.5},
                                  "half_match": {}}
    rendered = render(tmp_path, inputs)
    table = package_eq_table(rendered["package.yaml"])
    assert table["behind_speakers"] == eq(-4, -10, -3, 0, 3, 2.5) and table["half_match"] == FLAT
    for lang in LANGS:
        t = translations(lang)
        for tip in eq_tooltips(rendered[f"ramka-settings.{lang}.yaml"]):
            # The settings page's table is the package's.
            assert tip == {p: preset_text(t, p, table[p], own=p in inputs["music_eq_presets"]) for p in EQ_PRESET_IDS}, lang
    [tip, *_] = eq_tooltips(rendered["ramka-settings.en.yaml"])
    assert tip["behind_speakers"].splitlines()[-1] == (
        "Curve: sub \u22124 dB, bass \u221210 dB, low mids \u22123 dB, mids 0 dB, presence +3 dB, air +2.5 dB")
    assert tip["half_match"].splitlines()[-1] == "Curve: " + en["ui.settings.music_eq_curve_flat"]
    assert tip["fitted"].splitlines()[-1] == "Curve: " + en["ui.settings.music_eq_curve_unset"]
    # The catalog's table, as the package carries it.
    assert package_eq_table(demo["package.yaml"]) == CATALOG_EQ


def taps(card) -> list[dict]:
    """Every tap_action of a card and of its rows."""
    return [n["tap_action"] for n in walk(card) if isinstance(n.get("tap_action"), dict)]


def test_music_visuals_bind_look(demo):
    """Every ambient-wave-card of the music visual, on the Ramka dashboards and the settings preview,
    in every language, binds the look sensor; its helper bindings stay (a card without the sensor
    draws from them, as before)."""
    package = demo["package.yaml"]
    assert "ramka_music_look" in json.dumps(package["template"])
    for lang in LANGS:
        for name in (f"dashboard.{lang}.yaml", f"ramka-settings.{lang}.yaml"):
            cards = [n for n in walk(demo[name]) if n.get("type") == "custom:ambient-wave-card"]
            # The settings preview twice: on Music and on the sensor sub-view.
            assert len(cards) == (4 if name.startswith("ramka-settings") else 2), name
            for card in cards:
                kind = "spectrum" if card["source"]["kind"] == "spectrum" else "level"
                assert card["look"] == LOOK, name
                assert {k: card[k] for k in bound("ramka", kind)} == bound("ramka", kind), name


def test_music_visuals_without_music_visual_have_no_look(plain):
    assert LOOK not in json.dumps(plain)
    for lang in LANGS:
        view = settings_views(plain[f"ramka-settings.{lang}.yaml"])["music"]
        text = json.dumps(view)
        assert "music_template" not in text and "music_colour" not in text and INFO_ROW not in text, lang


def grid_with_heading(view, text):
    """The section (grid) of a view whose heading card says `text`."""
    [section] = [sec for sec in view["sections"]
                 if any(c.get("type") == "heading" and c.get("heading") == text for c in sec["cards"])]
    return section


def heading_of(section) -> str | None:
    return next((c["heading"] for c in section["cards"] if c.get("type") == "heading"), None)


def test_music_settings_page_layout(demo):
    """SPEC-025 amendment 1: the Music page is Basic (the two switches, the way to Live visualization,
    the notes), the render-time inputs and the Reset; the Live visualization sub-view is the preview,
    the Sensor, the Visualization, the colour range, the response profile and its Reset."""
    package = demo["package.yaml"]
    for lang in LANGS:
        t = translations(lang)
        dashboard = demo[f"ramka-settings.{lang}.yaml"]
        music = settings_views(dashboard)["music"]
        assert [heading_of(s) for s in music["sections"]] == [t["ui.settings.basic"], t["ui.settings.render_time"], None], lang
        basic = music["sections"][0]
        assert [c["type"] for c in basic["cards"]] == ["heading", "entities", "markdown", "markdown"], lang
        switches, live_off, page_off = basic["cards"][1:]
        assert [r.get("entity") for r in switches["entities"]] == ["input_boolean.ramka_page_music", MUSIC_LIVE, None], lang
        assert [r["name"] for r in switches["entities"][:2]] == [t["ui.settings.page_music"], t["ui.settings.music_live"]], lang
        assert live_off["visibility"] == [LIVE_OFF] and live_off["content"] == t["ui.settings.music_live_off"], lang
        assert page_off["content"] == t["ui.settings.page_off"], lang
        assert [a["data"] for a in reset_actions(music)] == [{"page": "music"}], lang

        view = live_subview(dashboard)
        paths = [v["path"] for v in dashboard["views"]]
        assert paths.index(LIVE_VIEW) == paths.index("music") + 1, lang
        assert view["subview"] is True and view["back_path"] == "/ramka-settings/music", lang
        assert (view["type"], view["max_columns"], view["title"]) == ("sections", 2, t["ui.settings.music_live_page"]), lang
        header = header_text(view)
        assert header.startswith(f"## {t['ui.settings.music_live_page']}\n\n{t['ui.settings.header.music_live']}"), lang
        assert f"[{t['ui.settings.preview_link']}](/ramka-preview/music)" in header, lang
        assert 2 <= t["ui.settings.header.music_live"].count(". ") + 1 <= 3, lang
        sections = view["sections"]
        assert [heading_of(s) for s in sections] == [t[f"ui.settings.{k}"] for k in (
            "preview", "music_source", "music_visual", "music_colour", "music_profile_widget")] + [None], lang
        preview, sensor, visualization, colour, profile, reset = sections
        assert preview.get("column_span") == 2, lang
        # The sensor, always: the select, the abilities line, the way to the sensor's settings.
        assert not sensor.get("visibility") and [c["type"] for c in sensor["cards"]] == ["heading", "entities", "markdown", "entities"], lang
        # The visualization while Live is on: the mode, the spectrum's flavour with the spectrum, the
        # Advanced switch; no level flavour, line width, palette or redraw rate.
        assert visualization["visibility"] == [LIVE_ON], lang
        [card] = visualization["cards"][1:]
        assert card["visibility"] == [LIVE_ON], lang
        assert [r["entity"] for r in rows(card)] == [MUSIC_VISUAL, "input_select.ramka_music_spectrum_flavour",
                                                     "input_boolean.ramka_settings_advanced"], lang
        assert row_conditions(card, "input_select.ramka_music_spectrum_flavour") == [visual_is("spectrum")], lang
        assert row_conditions(card, MUSIC_VISUAL) == [] == row_conditions(card, "input_boolean.ramka_settings_advanced"), lang
        # (The preview's cards bind them; no row shows them.)
        listed_rows = {r.get("entity") for _, c in view_cards(view) for r in rows(c)}
        for gone in ("ramka_music_level_flavour", "ramka_music_line_width_px", "ramka_music_palette", "ramka_music_fps"):
            assert f"input_select.{gone}" not in listed_rows and f"input_number.{gone}" not in listed_rows, (lang, gone)
        assert "`eco`" not in json.dumps(view) and "`fast`" not in json.dumps(view), lang
        # The colour range: Advanced with A, the four neutral/hot rows, each pair with its visual only.
        assert colour["visibility"] == [ADVANCED_ON, ACTIVE], lang
        assert [c["type"] for c in colour["cards"]] == ["heading", "entities"] and colour["cards"][0]["icon"] == "mdi:palette", lang
        assert colour["cards"][1]["visibility"] == [ADVANCED_ON, ACTIVE], lang
        assert [r["entity"] for r in rows(colour["cards"][1])] == [f"input_number.ramka_{k}" for k in MUSIC_DB], lang
        for k in MUSIC_DB:
            assert row_conditions(colour["cards"][1], f"input_number.ramka_{k}") == [visual_is(k.split("_")[1])], (lang, k)
        # The response profile: ONE card, Advanced with A; the select with its tooltip first, then each
        # profile's rows on the select's state (Custom also for a state that is no entry id), the EQ
        # rows with the spectrum too. Custom's labels for every profile's rows.
        assert profile["visibility"] == [ADVANCED_ON, ACTIVE], lang
        assert [c["type"] for c in profile["cards"]] == ["heading", "entities"], lang
        [card] = profile["cards"][1:]
        assert card["visibility"] == [ADVANCED_ON, ACTIVE], lang
        listed = card["entities"]
        first = listed[0]
        assert first["type"] == INFO_ROW and first["entity"] == TEMPLATE_SELECT and first["name"] == t["ui.settings.music_template"], lang
        assert first["descriptions"] == {p: profile_text(t, p) for p in LOOK_IDS}, lang
        per = 4 + 1 + len(EQ_KEYS)
        assert len(listed) == 1 + per * len(LOOK_IDS), lang
        for i, profile_id in enumerate(LOOK_IDS):
            chunk = listed[1 + i * per:1 + (i + 1) * per]
            selected = ({"condition": "state", "entity": TEMPLATE_SELECT, "state_not": TEMPLATE_IDS} if profile_id == "custom"
                        else {"condition": "state", "entity": TEMPLATE_SELECT, "state": profile_id})
            h = profile_helpers(profile_id)
            assert all(r["type"] == "conditional" for r in chunk), (lang, profile_id)
            assert [r["row"]["entity"] for r in chunk] == [h["rise"], h["fall"], h["hold"], h["tilt"], EQ_SELECT,
                                                          *(h[f"eq_{k}"] for k in EQ_KEYS)], (lang, profile_id)
            for r in chunk[:4]:
                assert r["conditions"] == [selected], (lang, profile_id)
            for r in chunk[4:]:
                assert r["conditions"] == [selected, visual_is("spectrum")], (lang, profile_id)
            assert [r["row"]["name"] for r in chunk if r["row"]["entity"] != EQ_SELECT] == [
                t[f"ui.settings.{k}"] for k in ("music_rise_ms", "music_fall_s", "music_hold_s", "music_tilt",
                                                *(f"music_eq_{k}" for k in EQ_KEYS))], (lang, profile_id)
            preset = chunk[4]["row"]
            assert preset["type"] == INFO_ROW and preset["name"] == t["ui.settings.music_eq"], (lang, profile_id)
            assert preset["descriptions"] == {p: preset_text(t, p, CATALOG_EQ[p]) for p in EQ_PRESET_IDS}, (lang, profile_id)
        # Gone: the description markdown, the values in use, Copy to custom, the preset list.
        assert "copy_to_custom" not in json.dumps(view) and "`wled_pink`" not in json.dumps(view), lang
        for key in ("music_template_calm_purpose", "music_eq_wled_pink"):
            assert t[f"ui.settings.{key}"] not in markdown(view), (lang, key)
        assert "audition" not in json.dumps(view), lang
        # Every perform_action names a script the package defines.
        for _, c in view_cards(view):
            for tap in taps(c):
                if tap.get("perform_action", "").startswith("script.ramka_"):
                    assert tap["perform_action"].removeprefix("script.") in package["script"], tap
        # The sub-view's Reset (the last section) restores the visual, every profile and the colour
        # range; the live switch is the Music page's.
        assert [a["data"] for a in reset_actions(view)] == [{"page": "music_live"}], lang
        assert any(n.get("perform_action") == "script.ramka_settings_reset" for n in walk(reset)), lang
        written = run_reset(package, page="music_live")
        assert set(f"input_number.ramka_{k}" for k in MUSIC_DB) <= set(written), lang
        assert set(LOOK_DEFAULTS) | set(PROFILE_DEFAULTS) | {MUSIC_VISUAL, "input_select.ramka_music_spectrum_flavour"} <= set(written), lang
        assert MUSIC_LIVE not in written and run_reset(package, page="music") == {
            "input_boolean.ramka_page_music": "on", MUSIC_LIVE: "off"}, lang


COLOUR_ROW = "custom:ramka-colour-select-row"


def test_colour_selects_are_colour_rows(demo):
    """The Air page's good, fair and poor colours and the Climate page's neutral colour are colour rows
    (each choice with its dot), entity and name, the colours named in the page's language; no other
    row is one."""
    expected = {*AIR_COLOUR_SELECTS.values(), NEUTRAL_COLOUR}
    for lang in LANGS:
        t = translations(lang)
        dashboard = demo[f"ramka-settings.{lang}.yaml"]
        found = {n["entity"]: n for n in walk(dashboard) if n.get("type") == COLOUR_ROW}
        assert set(found) == expected, lang
        for entity, row in found.items():
            assert set(row) == {"type", "entity", "name", "lang"} and row["lang"] == lang, (lang, entity)
            assert row["name"] == t["ui.settings." + entity.removeprefix("input_select.ramka_")], (lang, entity)
    manifest = yaml.safe_load((COMP / "component.yaml").read_text(encoding="utf-8"))
    assert "cards/colour-select-row.js" in manifest["artifacts"]["dashboard_cards"]
    source = (COMP / "cards" / "colour-select-row.js").read_text(encoding="utf-8")
    assert f'customElements.define("{COLOUR_ROW.removeprefix("custom:")}"' in source
    assert "select_option" in source
    # The climate picker and the row draw the same dot: the shared list module's swatch.
    for card in ("colour-select-row.js", "climate-rooms-card.js"):
        assert 'load("./lib/colour-list.js")' in (COMP / "cards" / card).read_text(encoding="utf-8"), card


def test_info_select_row_is_a_card_resource():
    manifest = yaml.safe_load((COMP / "component.yaml").read_text(encoding="utf-8"))
    assert "cards/info-select-row.js" in manifest["artifacts"]["dashboard_cards"]
    source = (COMP / "cards" / "info-select-row.js").read_text(encoding="utf-8")
    assert f'customElements.define("{INFO_ROW.removeprefix("custom:")}"' in source
    assert "innerHTML" not in source.split("  _update() {")[1], "descriptions are set as text"


def test_music_translations_complete():
    en, de, pl = translations("en"), translations("de"), translations("pl")
    for key in LOOK_KEYS:
        for lang, t in (("en", en), ("de", de), ("pl", pl)):
            assert t.get(f"ui.settings.{key}", "").strip(), (lang, key)
        if key.endswith(("_purpose", "_best", "_why")):
            # Translated, not copied.
            assert de[f"ui.settings.{key}"] != en[f"ui.settings.{key}"] != pl[f"ui.settings.{key}"], key
    for key in GONE_KEYS:
        assert all(f"ui.settings.{key}" not in t for t in (en, de, pl)), key
    for lang, t in (("en", en), ("de", de), ("pl", pl)):
        assert t["card.info_select_row.about"].strip(), lang
    # en: spec 4.1's texts word for word.
    for entry, texts_ in LOOK_TEXTS.items():
        assert tuple(en[f"ui.settings.music_template_{entry}_{p}"] for p in ("purpose", "best", "why")) == texts_, entry


# ---- the preview dashboard: one view per screen, the Ramka's own cards in a frame --------------

PREVIEW_VIEWS = ["climate", "air", "plants", "photos", "status", "calendar", "controls", "music"]
VIEWPORT = "100dvh - var(--kiosk-header-height, var(--header-height, 0px))"


def ramka_screens(dashboard) -> dict[str, list]:
    """The Ramka dashboard's sections per screen, read from their visibility."""
    screens: dict[str, list] = {}
    for section in sections(dashboard):
        states = {c.get("entity", "").split(".", 1)[-1].removeprefix("ramka_"): c.get("state") for c in section.get("visibility", [])}
        if states.get("mode") == "calendar":
            screens.setdefault("calendar", []).append(section)
        elif states.get("mode") == "controls" and len(section.get("visibility", [])) == 1:
            screens.setdefault("controls", []).append(section)
        elif states.get("mode") == "ambient" and states.get("music_view") == "on":
            screens.setdefault("music", []).append(section)
        elif states.get("mode") == "ambient" and "ambient" in states:
            screens.setdefault(states["ambient"], []).append(section)
    return screens


def framed(section, height=720):
    """A Ramka section as the preview shows it: no visibility, heights from the frame, the photo
    layer contained instead of switched by show_when."""
    text = json.dumps({k: v for k, v in section.items() if k != "visibility"}).replace(VIEWPORT, f"{height}px")
    section = json.loads(text)
    for card in section["cards"]:
        if card.get("type") == "custom:photo-frame-card":
            del card["show_when"]
            card["contained"] = True
    return section


def preview_frame(view):
    """The frame of a screen the render has: the last card of the view's stack, under the banner
    for its page switch (none on the controls)."""
    [stack] = view["cards"]
    assert stack["type"] == "vertical-stack"
    card = stack["cards"][-1]
    assert card["type"] == "custom:screen-frame-card"
    return card


@pytest.fixture(scope="module")
def preview(tmp_path_factory):
    return render(tmp_path_factory.mktemp("preview"), {**with_visual(), "preview_dashboard": True})


def test_preview_dashboard_by_default_and_off_with_false(demo, preview, tmp_path):
    """preview_dashboard defaults to true: a home without the input gets the preview; false leaves it
    out, and the settings pages' headers then have no preview link."""
    assert "preview_dashboard" not in demo_inputs()
    assert {f"ramka-preview.{lang}.yaml" for lang in LANGS} <= set(demo)
    assert {f"ramka-preview.{lang}.yaml" for lang in LANGS} <= set(preview)
    off = render(tmp_path, {**demo_inputs(), "preview_dashboard": False})
    assert not any(name.startswith("ramka-preview.") for name in off)
    assert "/ramka-preview/" in json.dumps(demo["ramka-settings.en.yaml"])
    assert "/ramka-preview/" not in json.dumps(off["ramka-settings.en.yaml"])


def test_preview_leaves_the_ramka_dashboard_as_it_was(preview, tmp_path):
    without = render(tmp_path, with_visual())
    for lang in LANGS:
        assert preview[f"dashboard.{lang}.yaml"] == without[f"dashboard.{lang}.yaml"], lang


def test_preview_has_one_view_per_screen_with_the_settings_title_and_icon(preview):
    for lang in LANGS:
        views = preview[f"ramka-preview.{lang}.yaml"]["views"]
        assert [v["path"] for v in views] == PREVIEW_VIEWS, lang
        settings = settings_views(preview[f"ramka-settings.{lang}.yaml"])
        for view in views:
            assert (view["title"], view["icon"]) == (settings[view["path"]]["title"], settings[view["path"]]["icon"]), (lang, view["path"])
        assert preview[f"ramka-preview.{lang}.yaml"]["title"] == translations(lang)["ui.preview.title"]
        assert "kiosk_mode" not in preview[f"ramka-preview.{lang}.yaml"]


def test_preview_has_every_tab_and_says_which_input_adds_a_missing_screen(tmp_path):
    """One tab per view the component has, always, in the same order; a screen the render left out
    says the input that adds it, with the link to its settings page and no frame."""
    inputs = {**demo_inputs(), "preview_dashboard": True, "status_page": False}
    for key in ("air", "plants", "photo_dir"):
        inputs.pop(key)
    rendered = render(tmp_path, inputs)
    needs = {"air": "air", "plants": "plants", "photos": "photo_dir", "status": "status_page"}
    for lang in LANGS:
        t = translations(lang)
        views = settings_views(rendered[f"ramka-preview.{lang}.yaml"])
        assert list(views) == PREVIEW_VIEWS, lang
        for path, view in views.items():
            if path not in needs:
                assert preview_frame(view)["link"]["path"] == f"/ramka-settings/{path}"
                continue
            [card] = view["cards"]
            assert card["type"] == "markdown", (lang, path)
            assert t["ui.preview.not_set_up"].replace("{input}", needs[path]) in card["content"], (lang, path)
            assert f"[{t['ui.preview.settings_link']}](/ramka-settings/{path})" in card["content"], (lang, path)
            assert not [n for n in walk(view) if n.get("type") == "custom:screen-frame-card"], (lang, path)
    # The climate tab without climate says so too.
    views = settings_views(render(tmp_path / "noclimate", {**without_pages("climate"), "preview_dashboard": True})["ramka-preview.en.yaml"])
    assert "`climate`" in views["climate"]["cards"][0]["content"]
    assert list(views) == PREVIEW_VIEWS


def test_preview_banner_while_the_page_switch_is_off(preview):
    for lang in LANGS:
        t = translations(lang)
        for path, view in settings_views(preview[f"ramka-preview.{lang}.yaml"]).items():
            stack = view["cards"][0]["cards"]
            if path == "controls":
                assert len(stack) == 1, "the controls have no page switch"
                continue
            # The Music tab has the fallback notice's four cards between them (test_preview_music_tab_has_the_notice).
            banner, *notices, frame = stack
            assert len(notices) == (4 if path == "music" else 0), path
            assert banner["type"] == "conditional"
            assert banner["conditions"] == [{"condition": "state", "entity": f"input_boolean.ramka_page_{path}", "state": "off"}]
            assert banner["card"]["type"] == "markdown"
            content = banner["card"]["content"]
            assert t["ui.preview.switched_off"] in content and "ha-alert" in content, (lang, path)
            assert f"[{t['ui.preview.settings_link']}]({frame['link']['path']})" in content, (lang, path)


def test_preview_controls_are_the_ramka_controls_with_their_cards_visibility(preview):
    """The controls tab: the three controls sections without the mode visibility; the cards keep
    theirs (the player tiles, the unavailable twins), which the frame applies."""
    ramka = ramka_screens(preview["dashboard.en.yaml"])["controls"]
    assert len(ramka) == 3
    frame = preview_frame(settings_views(preview["ramka-preview.en.yaml"])["controls"])
    assert frame["sections"] == [{k: v for k, v in s.items() if k != "visibility"} for s in ramka]
    assert any(c.get("visibility") for s in frame["sections"] for c in s["cards"])
    assert frame["link"]["path"] == "/ramka-settings/controls"


def test_preview_calendar_card_keeps_its_own_height(tmp_path):
    """The calendar tab's empty strip: agenda-card is one row in grid_options and takes its height
    from `height`; the frame sized it by its one row (56 px) over that height. The frame now keeps a
    card's own height (cards/screen-frame-card.test.mjs); here: the card carries one, the frame's."""
    rendered = render(tmp_path, {**demo_inputs(), "preview_dashboard": True, "screen": {"width": 1280, "height": 800}})
    frame = preview_frame(settings_views(rendered["ramka-preview.en.yaml"])["calendar"])
    [card] = [c for s in frame["sections"] for c in s["cards"]]
    assert card["type"] == "custom:agenda-card"
    assert card["height"] == "calc(800px - 16px)" and card["grid_options"]["rows"] == 1


def test_preview_cards_are_the_ramka_dashboards(preview):
    for lang in LANGS:
        screens = ramka_screens(preview[f"dashboard.{lang}.yaml"])
        assert set(screens) == set(PREVIEW_VIEWS), lang
        for view in preview[f"ramka-preview.{lang}.yaml"]["views"]:
            frame = preview_frame(view)
            assert frame["sections"] == [framed(s) for s in screens[view["path"]]], (lang, view["path"])
            assert all("visibility" not in s for s in frame["sections"])
    music = preview_frame(settings_views(preview["ramka-preview.en.yaml"])["music"])
    assert music["sections"][0]["cards"][0]["visual"]["select"] == "input_select.ramka_music_visual"


def test_preview_frames_the_screen_size_and_counts_heights_from_it(tmp_path):
    rendered = render(tmp_path, {**demo_inputs(), "preview_dashboard": True, "screen": {"width": 1280, "height": 800}})
    text = json.dumps(rendered["ramka-preview.en.yaml"])
    assert "dvh" not in text and "calc(800px - 16px)" in text
    for view in rendered["ramka-preview.en.yaml"]["views"]:
        frame = preview_frame(view)
        assert (frame["width"], frame["height"]) == (1280, 800)
    for section in sections(rendered["dashboard.en.yaml"]):
        assert "800px" not in json.dumps(section)


def test_preview_links_point_at_existing_settings_views(preview, tmp_path):
    for lang in LANGS:
        settings = settings_views(preview[f"ramka-settings.{lang}.yaml"])
        for view in preview[f"ramka-preview.{lang}.yaml"]["views"]:
            link = preview_frame(view)["link"]
            dashboard, page = link["path"].strip("/").split("/")
            assert dashboard == "ramka-settings" and page == view["path"] and page in settings, (lang, link)
            assert link["label"] == translations(lang)["ui.preview.settings_link"]
    rendered = render(tmp_path, {**demo_inputs(), "preview_dashboard": True, "settings_paths": {"de": "ramka-settings-de"}})
    assert preview_frame(rendered["ramka-preview.de.yaml"]["views"][0])["link"]["path"] == "/ramka-settings-de/climate"
    assert preview_frame(rendered["ramka-preview.en.yaml"]["views"][0])["link"]["path"] == "/ramka-settings/climate"


@pytest.mark.parametrize("value", [{"en": "/ramka-settings"}, {"de": "ramka settings"}, ["ramka-settings"]])
def test_preview_settings_paths_must_be_plain(tmp_path, value):
    with pytest.raises(dr.RenderError, match="settings paths must be plain url paths"):
        render(tmp_path, {**demo_inputs(), "preview_dashboard": True, "settings_paths": value})


def test_preview_dashboard_is_documented_and_its_card_is_a_resource():
    manifest = yaml.safe_load((COMP / "component.yaml").read_text(encoding="utf-8"))
    assert "templates/ramka-preview.lang.yaml.j2" in manifest["artifacts"]["templates"]
    assert "cards/screen-frame-card.js" in manifest["artifacts"]["dashboard_cards"]
    assert {"preview_dashboard", "settings_paths", "preview_paths"} <= set(manifest["inputs"])
    assert any(d["file"] == "ramka-preview.<lang>.yaml" for d in manifest["provides"]["dashboards"])
    readme = (COMP / "README.md").read_text(encoding="utf-8")
    block = readme.split("## Preview dashboard", 1)[1].split("```yaml", 1)[1].split("```", 1)[0]
    entry = yaml.safe_load(block)["lovelace"]["dashboards"]["ramka-preview"]
    assert entry["filename"] == "dashboards/ramka-preview.en.yaml" and entry["require_admin"] is True
    assert "### Preview dashboard" in (COMP / "UPGRADE.md").read_text(encoding="utf-8")


# ---- Pause and the views of a page (SPEC-026) ------------------------------------------------------

PAUSED_OFF = {"condition": "state", "entity_id": "input_boolean.ramka_paused", "state": "off"}


def test_a_pause_holds_the_loop_and_its_page(demo):
    package = demo["package.yaml"]
    loop = package["script"]["ramka_ambient_loop"]["sequence"][0]["repeat"]
    assert PAUSED_OFF in loop["while"]
    assert PAUSED_OFF in automation(package, "ambient_watchdog")["conditions"]
    start = automation(package, "ambient_start")
    assert PAUSED_OFF in start["conditions"]
    assert {"trigger": "state", "entity_id": "input_boolean.ramka_paused", "to": "off"} in start["triggers"]
    stop = automation(package, "ambient_stop")
    assert {"trigger": "state", "entity_id": "input_boolean.ramka_paused", "to": "on"} in stop["triggers"]
    assert stop["actions"][0] == {"action": "script.turn_off", "target": {"entity_id": "script.ramka_ambient_loop"}}
    # The page goes back to the first only while not paused: the controls give back the page as it was.
    [rest] = [a for a in stop["actions"] if "if" in a]
    assert rest["if"] == [PAUSED_OFF] and rest["then"][0]["target"]["entity_id"] == "input_select.ramka_ambient"


def test_the_screen_off_and_swipe_up_end_a_pause(demo):
    package = demo["package.yaml"]
    end = automation(package, "pause_end")
    assert end["triggers"] == [{"trigger": "state", "entity_id": "input_select.ramka_mode", "to": "off"}]
    assert end["actions"][0] == {"action": "input_boolean.turn_off", "target": {"entity_id": "input_boolean.ramka_paused"}}
    assert next_page(end["actions"][1]["data"]["option"], "plants", ["air", "plants"]) == "air"
    up = package["script"]["ramka_swipe_up"]["sequence"]
    assert {"action": "input_boolean.turn_off", "target": {"entity_id": "input_boolean.ramka_paused"}} in up
    # Pause only while the rotation shows; resume always.
    pause = package["script"]["ramka_pause"]["sequence"]
    assert [c["entity_id"] for c in pause if c.get("condition")] == ["input_select.ramka_mode", "binary_sensor.ramka_music_view"]
    assert package["script"]["ramka_resume"]["sequence"] == [
        {"action": "input_boolean.turn_off", "target": {"entity_id": "input_boolean.ramka_paused"}}]


def test_page_swipes_keep_a_pause(demo, tmp_path):
    package = demo["package.yaml"]
    for script in ("ramka_ambient_next", "ramka_ambient_prev"):
        [after] = [s for s in package["script"][script]["sequence"] if "if" in s]
        assert after["if"] == [PAUSED_OFF]
        assert after["then"] == [{"action": "script.turn_on", "target": {"entity_id": "script.ramka_ambient_loop"}}]
        # Paused onto the photos: the series' photo, since no loop shows one.
        assert after["else"][0]["then"] == [{"action": "script.ramka_photo_show"}]
    without = render(tmp_path, without_pages("photos"))["package.yaml"]
    [after] = [s for s in without["script"]["ramka_ambient_next"]["sequence"] if "if" in s]
    assert "else" not in after


def test_view_step_turns_plant_pages_and_photos_round(demo):
    package = demo["package.yaml"]
    assert package["script"]["ramka_view_next"]["sequence"] == [{"action": "script.ramka_view_step", "data": {"step": 1}}]
    assert package["script"]["ramka_view_prev"]["sequence"] == [{"action": "script.ramka_view_step", "data": {"step": -1}}]
    step = package["script"]["ramka_view_step"]["sequence"]
    [choose] = [s["choose"] for s in step if "choose" in s]
    by_page = {c["conditions"][0]["state"]: c["sequence"] for c in choose}
    assert set(by_page) == {"plants", "photos"}   # climate, air and status have one view
    for seq in by_page.values():
        assert seq[-1]["if"] == [PAUSED_OFF]       # running: the page starts again; paused: stays
    value = by_page["plants"][0]["data"]["value"]
    page = lambda n: {"input_number.ramka_plants_page": n}
    # Three plants, one page by default; two a page: two pages.
    assert ha(value, states=page("0.0"), step=1) == "0"
    two = {**page("1.0"), "input_number.ramka_plants_per_page": "2"}
    assert [ha(value, states=two, step=s) for s in (1, -1)] == ["0", "0"]
    one = {**page("0.0"), "input_number.ramka_plants_per_page": "1"}
    assert [ha(value, states=one, step=s) for s in (1, -1)] == ["1", "2"]
    [event] = [a for a in walk(by_page["photos"]) if a.get("event") == "ramka_photo_series"]
    assert [ha(event["event_data"]["index"], index=i, step=s, photos=["a", "b", "c"]) for i, s in ((2, 1), (0, -1), (1, 1))] == ["0", "2", "2"]
    assert by_page["photos"][-2] == {"action": "script.ramka_photo_show"}


def test_photo_show_picks_a_new_series_when_one_is_over(demo):
    package = demo["package.yaml"]
    show = package["script"]["ramka_photo_show"]["sequence"]
    over = show[0]["if"][0]["value_template"]
    assert ha(over, attrs={SERIES: {"photos": ["a", "b"], "index": 2}}) == "True"
    assert ha(over, attrs={SERIES: {"photos": ["a", "b"], "index": 1}}) == "False"
    assert ha(over) == "True"
    assert show[0]["then"] == [{"action": "script.ramka_photo_series_new"}]
    new = package["script"]["ramka_photo_series_new"]["sequence"]
    [event] = [a for a in new if "event" in a]
    assert event["event_data"]["index"] == 0
    assert "sensor.ramka_photo_series" in package["recorder"]["exclude"]["entities"]


def test_the_rotation_takes_sideways_swipes_and_the_pause_corner(demo):
    for lang in LANGS:
        [card] = [n for n in walk(demo[f"dashboard.{lang}.yaml"]) if n.get("type") == "custom:corner-taps-card"]
        [rotation_rule] = [r for r in card["swipe"] if r.get("left")]
        assert (rotation_rule["left"], rotation_rule["right"]) == ("script.ramka_view_next", "script.ramka_view_prev")
        assert rotation_rule["up"] == "script.ramka_ambient_next"
        assert card["pause"]["conditions"] == rotation_rule["conditions"]
        assert (card["pause"]["entity"], card["pause"]["pause"], card["pause"]["resume"]) == (
            "input_boolean.ramka_paused", "script.ramka_pause", "script.ramka_resume")


# ---- 0.10.0: floorplan (SPEC-028) -----------------------------------------------------------------

def with_floorplan() -> dict:
    inputs = demo_inputs()
    inputs["floorplan"] = True
    return inputs


def test_floorplan_false_equals_absent(tmp_path):
    plain = texts(tmp_path / "a", demo_inputs())
    off = demo_inputs()
    off["floorplan"] = False
    assert texts(tmp_path / "b", off) == plain
    assert "controls_plan" not in "".join(plain.values())
    assert "floorplan-card" not in "".join(plain.values())


def test_floorplan_helper_and_rules(tmp_path):
    out = render(tmp_path, with_floorplan())
    package, dash = out["package.yaml"], out["dashboard.en.yaml"]
    assert package["input_boolean"]["ramka_controls_plan"]["initial"] is False
    toggle = package["script"]["ramka_controls_plan_toggle"]
    assert toggle["sequence"][0]["action"] == "input_boolean.toggle"
    shows = package["script"]["ramka_show_controls"]["sequence"]
    assert any(s.get("action") == "input_boolean.turn_off"
               and s["target"]["entity_id"] == "input_boolean.ramka_controls_plan" for s in shows)
    [reset] = [a for a in package["automation"] if a["id"] == "ramka_controls_plan_reset"]
    assert reset["triggers"] == [{"trigger": "state", "entity_id": "input_select.ramka_mode", "not_to": "controls"}]
    assert "conditions" not in reset
    assert reset["actions"][0]["action"] == "input_boolean.turn_off"

    [corner] = [n for n in walk(dash) if n.get("type") == "custom:corner-taps-card"]
    first, second = corner["swipe"][0], corner["swipe"][1]
    assert first["conditions"][0]["states"] == ["controls"]
    for side in ("left", "right"):
        assert first[side] == "script.ramka_controls_plan_toggle"
    for key in ("up", "down"):
        assert first[key] == second[key]
    assert "left" not in second and second["conditions"][0]["states"] == ["controls", "calendar"]

    [plan] = [s for s in sections(dash) if any(c.get("type") == "custom:floorplan-card" for c in s["cards"])]
    assert plan["cards"][0]["edit"] is False and "plan" not in plan["cards"][0]
    assert plan["cards"][0]["layers"] == ["climate", "plants"], "SPEC-028 Amendment 5: what a room is like"
    assert {(c["entity"], c["state"]) for c in plan["visibility"]} == {
        ("input_select.ramka_mode", "controls"), ("input_boolean.ramka_controls_plan", "on")}
    controls = [s for s in sections(dash) if any(c.get("type") == "media-control" for c in s["cards"])]
    assert controls and all({"entity": "input_boolean.ramka_controls_plan", "state": "off", "condition": "state"}
                            in s["visibility"] for s in controls)


def test_floorplan_layers_input_sets_the_plan_views_layers(tmp_path):
    inputs = with_floorplan()
    inputs["floorplan_layers"] = ["climate", "plants", "light", "security"]
    dash = render(tmp_path, inputs)["dashboard.en.yaml"]
    [plan] = [n for n in walk(dash) if n.get("type") == "custom:floorplan-card"]
    assert plan["layers"] == ["climate", "plants", "light", "security"]
    assert plan["layer_choice"] == "one", "a chip per layer, one at a time: a tap anywhere else goes back"


def test_floorplan_not_in_the_preview(tmp_path):
    out = render(tmp_path, with_floorplan())
    assert not any(n.get("type") == "custom:floorplan-card" for n in walk(out["ramka-preview.en.yaml"]))
