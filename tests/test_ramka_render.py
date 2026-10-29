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
    return {p.name: yaml.safe_load(p.read_text(encoding="utf-8")) for p in sorted(out.glob("*.yaml"))}


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
    assert set(demo) == {"package.yaml", "dashboard.en.yaml", "dashboard.de.yaml", "dashboard.pl.yaml"}
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
        if not key.startswith("ui.") or pl_value == en[key]:
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
            # Since 0.4.0 the page steps are templates over the live list (SPEC-020), evaluated in
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
        for entities in block.values():
            for entity in entities:
                assert entity["unique_id"].startswith("hall_frame_")
                assert entity["default_entity_id"].split(".")[1].startswith("hall_frame_")


def defined_entities(package) -> set[str]:
    ids = set()
    for domain in ("input_select", "input_boolean", "input_number", "timer", "input_button", "input_text", "script", "shell_command"):
        ids |= {f"{domain}.{key}" for key in package[domain]}
    for block in package["template"]:
        for entities in block.values():
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


def rotation(package) -> dict[str, str]:
    """page -> the page the ambient loop goes to after it with every page switch on, evaluated from
    the rendered loop (since 0.4.0 each stage reads the live list, SPEC-020)."""
    stages = package["script"]["ramka_ambient_loop"]["sequence"][0]["repeat"]["sequence"]
    steps = {}
    for stage in stages:
        condition = stage["if"][0]
        if condition.get("condition") != "state":
            continue
        last = stage["then"][-1]
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
        [step] = [s for s in package["script"][script]["sequence"] if "input_select" in s["action"]]
        assert step["action"] == "input_select.select_option"
        assert json.dumps(pages) in step["data"]["option"]
    for script, automation in (("ramka_swipe_up", None), (None, "ramka_ambient_stop")):
        actions = (package["script"][script]["sequence"] if script else
                   next(a for a in package["automation"] if a["id"] == automation)["actions"])
        starts = [next_page(a["data"]["option"], "nowhere", None) for a in actions
                  if a.get("action") == "input_select.select_option" and a["target"]["entity_id"] == "input_select.ramka_ambient"]
        assert starts == [pages[0]]


def test_all_pages_step_through_the_live_list_too(demo):
    """Since 0.4.0 the page switches can take any page out, so with all five pages the swipes read
    the live list as well and the loop's guard is always there (SPEC-020; was
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
    assert texts(tmp_path / "a", inputs) == texts(tmp_path / "b", demo_inputs())


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
    import subprocess

    if subprocess.run(["git", "-C", str(REPO), "rev-parse", "-q", "--verify", f"refs/tags/ramka/{version}"],
                      capture_output=True).returncode:
        pytest.skip(f"tag ramka/{version} not in this clone")
    old = tmp_path / f"ramka-{version}"
    old.mkdir()
    archive = subprocess.run(["git", "-C", str(REPO), "archive", f"refs/tags/ramka/{version}", "components/ramka"],
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
        [step] = [s for s in package["script"][script]["sequence"] if "input_select" in s["action"]]
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
# The views with a page switch (SPEC-020).
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
    """Without music_visual a home gets 0.3.0's files plus the live settings (SPEC-020,
    Compatibility): the package's new helpers, sensor, script and automations, the parts that read
    the page switches and fallbacks equal to the defaults; the dashboards without the view theme and
    with the calendar switch. Everything else is 0.3.0's, value for value."""
    before, after = tmp_path / "before", tmp_path / "after"
    dr.render_component(tagged_ramka(tmp_path, "0.3.0"), without_visual(), before)
    dr.render_component(COMP, without_visual(), after)
    names = sorted(p.name for p in before.iterdir())
    assert names == sorted(p.name for p in after.iterdir())
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
            assert without_calendar_switch(new_dashboard) == old_dashboard, name


# What 0.4.0's live settings add to and change in a package without music_visual (SPEC-020,
# Compatibility); everything else is 0.3.0's, value for value.
SETTINGS_ADDED = {
    "input_select": {"ramka_theme_mode"},
    "input_boolean": {"ramka_settings_advanced", "ramka_settings_seeded", *(f"ramka_page_{v}" for v in PAGE_VIEWS)},
    "input_number": set(), "timer": set(), "input_button": set(), "input_text": set(), "shell_command": set(),
    "script": {"ramka_settings_reset"},
    "automation": {"ramka_settings_seed", "ramka_theme_mode"},
    "template": {"ramka_ambient_pages"},
}
SETTINGS_CHANGED = {
    # The live list of pages (page switches).
    "script": {"ramka_ambient_next": "live list", "ramka_ambient_prev": "live list", "ramka_ambient_loop": "live list",
               "ramka_swipe_up": "live list", "ramka_show_calendar": "calendar switch",
               "ramka_show_controls": "fallback = default"},
    "automation": {"ramka_ambient_stop": "live list", "ramka_presence_off": "fallback = default",
                   "ramka_near": "fallback = default", "ramka_near_left": "fallback = default"},
    "template": {"ramka_music_view": "music switch", "ramka_brightness_target": "fallback = default",
                 "ramka_near": "fallback = default"},
}


def keyed(package, domain) -> dict[str, object]:
    if domain == "automation":
        return {a["id"]: a for a in package["automation"]}
    if domain == "template":
        return {e["unique_id"]: e for block in package["template"] for entities in block.values() for e in entities}
    return dict(package.get(domain) or {})


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


@pytest.mark.parametrize("choice, options", [("spectrum", ["spectrum", "level", "classic"]),
                                             ("level", ["level", "spectrum", "classic"])])
def test_music_visual_spectrum_first_option(tmp_path, choice, options):
    """The input's choice is the first option, so a fresh helper starts there; no initial:, which
    would reset the tablet's choice at every restart."""
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


# ---- 0.4.0: live settings (SPEC-020) ------------------------------------------------------------

PRESENCE_NUMBERS = ["off_delay_s", "brightness_min", "brightness_max", "near_cm", "near_s", "controls_hold_s", "lux_max"]
MUSIC_DB = ["music_spectrum_neutral_db", "music_spectrum_hot_db", "music_level_neutral_db", "music_level_hot_db"]
# The catalog's defaults (SPEC-020, Provides): what the reset writes in a home without
# settings_defaults or music_visual_options.
DEFAULTS = {
    "input_boolean.ramka_near_enabled": "on", "input_number.ramka_off_delay_s": 300,
    "input_number.ramka_brightness_min": 16, "input_number.ramka_brightness_max": 204,
    "input_number.ramka_near_cm": 100, "input_number.ramka_near_s": 1, "input_number.ramka_controls_hold_s": 5,
    "input_number.ramka_lux_max": 200, "input_boolean.ramka_ambient_music": "on",
    "input_select.ramka_theme_mode": "dark", "input_boolean.ramka_settings_advanced": "off",
    **{f"input_boolean.ramka_page_{v}": "on" for v in PAGE_VIEWS},
}
MUSIC_DEFAULTS = {
    "input_select.ramka_music_visual": "spectrum", "input_select.ramka_music_palette": "series",
    "input_select.ramka_music_spectrum_flavour": "dune", "input_select.ramka_music_level_flavour": "centre",
    "input_number.ramka_music_rise_ms": 200, "input_number.ramka_music_fall_s": 4,
    "input_number.ramka_music_line_width_px": 2.8, "input_boolean.ramka_music_tilt": "on",
    "input_number.ramka_music_spectrum_neutral_db": 30, "input_number.ramka_music_spectrum_hot_db": 70,
    "input_number.ramka_music_level_neutral_db": 30, "input_number.ramka_music_level_hot_db": 70,
    "input_number.ramka_music_fps": 30,
}
# Which page and group each setting belongs to (SPEC-020's table); ambient_music is state the swipes
# flip, set only by the presence_display group and the global reset.
PAGE_OF = {
    **{e: "general" for e in DEFAULTS if not e.startswith("input_boolean.ramka_page_")},
    "input_boolean.ramka_ambient_music": None,
    **{f"input_boolean.ramka_page_{v}": v for v in PAGE_VIEWS},
    **{e: "music" for e in MUSIC_DEFAULTS},
}
GROUP_OF = {
    **{e: "presence_display" for e in DEFAULTS},
    "input_select.ramka_theme_mode": "pages", "input_boolean.ramka_settings_advanced": "pages",
    **{f"input_boolean.ramka_page_{v}": "pages" for v in PAGE_VIEWS},
    **{e: "music_visual" for e in MUSIC_DEFAULTS},
}
# Helpers that are state, not settings: no settings page shows them (SPEC-020, the standing rule).
# A new one is added here by name, in review.
STATE_HELPERS = {"input_select.ramka_mode", "input_select.ramka_ambient", "input_boolean.ramka_ambient_music",
                 "input_boolean.ramka_settings_seeded"}


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


def run_reset(package, page=None, groups=None) -> dict[str, object]:
    """What script.<prefix>_settings_reset sets, evaluated with Jinja: entity -> value."""
    fields = {k: v for k, v in (("page", page), ("groups", groups)) if v is not None}
    sequence = reset_script(package)["sequence"]
    variables = {}
    for name, template in sequence[0]["variables"].items():
        variables[name] = ha_value(template, **fields)
    written = {}
    for block in sequence[1:]:
        [condition] = block["if"]
        assert condition["condition"] == "template"
        if ha(condition["value_template"], **variables) != "True":
            continue
        for step in block["then"]:
            entity = step["target"]["entity_id"]
            action = step["action"]
            if action.endswith("set_value"):
                written[entity] = step["data"]["value"]
            elif action.endswith("select_option"):
                written[entity] = step["data"]["option"]
            else:
                written[entity] = {"input_boolean.turn_on": "on", "input_boolean.turn_off": "off"}[action]
    return written


def seed_groups(package, states) -> list[str]:
    """The groups the seed automation hands the reset, evaluated with stub states whose `min`
    attributes are the helpers' own."""
    [seed] = [a for a in package["automation"] if a["id"] == "ramka_settings_seed"]
    attrs = {e: {"min": h["min"]} for e, h in helpers(package).items() if "min" in h}
    template = seed["actions"][0]["variables"]["seed_groups"]
    return ha_value(template, states=states, attrs=attrs)


def run_seed(package, states) -> dict[str, object]:
    """The states after the seed automation ran once at a start."""
    after = dict(states)
    groups = seed_groups(package, states)
    if groups:
        after.update(run_reset(package, groups=groups))
    after["input_boolean.ramka_settings_seeded"] = "on"
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
        assert set(helpers(package)) == set(settings) | STATE_HELPERS, music
        ids = defined_entities(package)
        assert {"sensor.ramka_ambient_pages", "script.ramka_settings_reset",
                "automation.ramka_settings_seed", "automation.ramka_theme_mode"} <= ids
    manifest = yaml.safe_load((COMP / "component.yaml").read_text(encoding="utf-8"))
    provided = set().union(*(expand(e["id"]) for e in manifest["provides"]["entities"]))
    automations = set().union(*(expand(a.strip()) for a in
                                re.split(r",\s*(?![^{]*\})", manifest["provides"]["automations"].split(", with")[0])))
    rendered = defined_entities(demo["package.yaml"])
    assert {e for e in rendered if not e.startswith("automation.")} <= provided
    assert {e.split(".", 1)[1] for e in rendered if e.startswith("automation.")} - {"ramka_charger_failed", "ramka_battery_hot"} <= automations


def test_no_helper_has_initial(plain, demo):
    for package in (plain["package.yaml"], demo["package.yaml"]):
        for entity, helper in helpers(package).items():
            assert "initial" not in helper, entity


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
    assert seed_groups(package, fresh) == ["pages", "presence_display", "music_visual"]
    upgraded = {**fresh, "input_number.ramka_off_delay_s": 600.0}
    assert seed_groups(package, upgraded) == ["pages", "music_visual"]
    on_purpose = {**tuned(package), "input_number.ramka_near_s": 1.0}
    assert seed_groups(package, on_purpose) == ["pages", "music_visual"]
    seeded = {**tuned(package), "input_boolean.ramka_settings_seeded": "on"}
    assert seed_groups(package, seeded) == ["music_visual"]
    music_tuned = {**seeded, **{f"input_number.ramka_{k}": v for k, v in
                                zip(MUSIC_DB, (35.0, 75.0, 30.0, 70.0))}}
    assert seed_groups(package, music_tuned) == []
    # unknown and unavailable count as untouched.
    unknown = {**fresh, "input_number.ramka_lux_max": "unknown", "input_number.ramka_near_cm": "unavailable"}
    assert seed_groups(package, unknown) == ["pages", "presence_display", "music_visual"]
    # Without music_visual there is no music group at all.
    assert seed_groups(plain["package.yaml"], at_minimum(plain["package.yaml"])) == ["pages", "presence_display"]
    assert seed_groups(plain["package.yaml"], {**at_minimum(plain["package.yaml"]),
                                               "input_boolean.ramka_settings_seeded": "on"}) == []


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
    for page in ["general"] + PAGE_VIEWS:
        assert set(run_reset(package, page=page)) == {e for e in everything if PAGE_OF[e] == page}, page
    for group in ("presence_display", "pages", "music_visual"):
        assert set(run_reset(package, groups=[group])) == {e for e in everything if GROUP_OF[e] == group}, group
    assert set(run_reset(package, groups="pages")) == {e for e in everything if GROUP_OF[e] == "pages"}
    assert set(run_reset(package, page="general", groups=["pages"])) == {
        "input_select.ramka_theme_mode", "input_boolean.ramka_settings_advanced"}
    assert set(run_reset(package, groups=["presence_display", "music_visual"])) == {
        e for e in everything if GROUP_OF[e] in ("presence_display", "music_visual")}
    # Never audio-sensor's helpers: the music source and the calibration are not preferences.
    for step in walk(reset_script(package)):
        target = step.get("target", {}).get("entity_id", "") if isinstance(step.get("target"), dict) else ""
        assert target.startswith("input_") and ".ramka_" in target or not target, target
    fields = reset_script(package)["fields"]
    assert set(fields) == {"page", "groups"}
    assert fields["page"]["selector"]["select"]["options"] == ["general"] + PAGE_VIEWS
    assert fields["groups"]["selector"]["select"]["options"] == ["presence_display", "pages", "music_visual"]


def test_every_setting_is_on_a_page_and_reset(tmp_path):
    """The standing rule (SPEC-020), its package half: every helper the package defines is a named
    state helper or one the global reset sets. The settings dashboard's half (each such helper on a
    page) comes with that dashboard."""
    inputs = with_visual()
    inputs["settings_defaults"] = {"off_delay_s": 600}
    package = render(tmp_path, inputs)["package.yaml"]
    reset = run_reset(package)
    for entity in helpers(package):
        assert entity in STATE_HELPERS or entity in reset, f"{entity}: neither a state helper nor reset"


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
        for entity, fallback in found:
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
                here = next_page(stage["then"][-1]["data"]["option"], here, live)
    return seen


@pytest.mark.parametrize("dropped", [(), ("air",), ("climate", "air", "plants")])
def test_loop_and_swipes_read_the_live_list(tmp_path, dropped):
    package = render(tmp_path, without_pages(*dropped))["package.yaml"]
    pages = [p for p in RAMKA_PAGES if p not in dropped]
    # Every stage, the guard, both swipes and swipe up read the live list.
    for stage in loop_stages(package):
        option = (stage["then"][0] if stage["if"][0]["condition"] == "template" else stage["then"][-1])["data"]["option"]
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
    rest = next(a for a in stop["actions"] if a.get("target", {}).get("entity_id") == "input_select.ramka_ambient")
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
                     "tilt": f"input_boolean.{prefix}_music_tilt"},
        "style": {"line_width": f"input_number.{prefix}_music_line_width_px"},
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
            "select": f"input_select.{prefix}_music_visual",
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
    # The default first, then the rest in the registry's order.
    for key, registry, default in (("music_spectrum_flavour", spectrum, "dune"), ("music_level_flavour", scalar, "centre"),
                                   ("music_palette", palettes, "series")):
        assert selects[f"ramka_{key}"]["options"] == [default] + [o for o in registry if o != default], key


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
    # Single-mode themes (SPEC-020 amendment, C19): a theme whose modes hold only one mode is
    # forced into it (frontend 20260826.7, src/state/themes-mixin.ts), and the frontend applies its
    # own defaults of that mode, so nothing of the frontend is copied here to go stale.
    series = {mode: themes["ramka"]["modes"][mode] for mode in ("dark", "light")}
    assert len(series["dark"]) == len(series["light"]) == 11
    assert themes["ramka-dark"] == {"modes": {"dark": series["dark"]}}
    assert themes["ramka-light"] == {"modes": {"light": series["light"]}}


def test_an_empty_photo_pick_still_takes_a_slot(demo):
    """With photos the only live page and an empty pick (an empty folder, a share not mounted), the
    stage hands on to photos again: without a pause the loop would spin and call the pick on every
    pass. An empty pick waits one photo slot (10 s) instead; a pick with photos does not."""
    [stage] = [s for s in loop_stages(demo["package.yaml"])
               if s["if"][0].get("state") == "photos"]
    pauses = [step for step in stage["then"] if "if" in step and any("delay" in t for t in step["then"])]
    assert len(pauses) == 1
    [condition] = pauses[0]["if"]
    assert ha(condition["value_template"], picks=[]) == "True"
    assert ha(condition["value_template"], picks=["a/1.jpg"]) == "False"
    assert [t["delay"] for t in pauses[0]["then"] if "delay" in t] == [{"seconds": 10}]
    # The pause sits after the photos and before the hand-on to the next page.
    steps = stage["then"]
    assert steps.index(pauses[0]) == len(steps) - 2
