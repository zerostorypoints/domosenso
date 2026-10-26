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
            if isinstance(target, str) and target in allowed and "option" in (node.get("data") or {}):
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
    """page -> the page the ambient loop goes to after it, read from the rendered loop."""
    stages = package["script"]["ramka_ambient_loop"]["sequence"][0]["repeat"]["sequence"]
    steps = {}
    for stage in stages:
        condition = stage["if"][0]
        if condition.get("condition") != "state":
            continue
        last = stage["then"][-1]
        steps[condition["state"]] = last["data"]["option"]
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
    assert guard["if"][0]["condition"] == "template" and guard["then"][0]["data"]["option"] == pages[0]
    # The swipes step through the same pages, never select_next onto a missing one.
    for script in ("ramka_ambient_next", "ramka_ambient_prev"):
        [step] = [s for s in package["script"][script]["sequence"] if "input_select" in s["action"]]
        assert step["action"] == "input_select.select_option"
        assert json.dumps(pages) in step["data"]["option"]
    for script, automation in (("ramka_swipe_up", None), (None, "ramka_ambient_stop")):
        actions = (package["script"][script]["sequence"] if script else
                   next(a for a in package["automation"] if a["id"] == automation)["actions"])
        starts = [a["data"]["option"] for a in actions
                  if a.get("action") == "input_select.select_option" and a["target"]["entity_id"] == "input_select.ramka_ambient"]
        assert starts == [pages[0]]


def test_all_pages_keep_select_next_and_no_guard(demo):
    package = demo["package.yaml"]
    assert package["script"]["ramka_ambient_next"]["sequence"][0]["action"] == "input_select.select_next"
    assert package["script"]["ramka_ambient_prev"]["sequence"][0]["action"] == "input_select.select_previous"
    first = package["script"]["ramka_ambient_loop"]["sequence"][0]["repeat"]["sequence"][0]
    assert first["if"][0] == {"condition": "state", "entity_id": "input_select.ramka_ambient", "state": "climate"}


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


def test_without_screen_and_with_every_page_renders_as_0_1_2_but_for_the_header(tmp_path):
    """The 0.2.0 promise: a home that changes nothing gets the same files (UPGRADE.md), except
    that since 0.2.2 the screen-high cards subtract the header when one is shown."""
    import subprocess

    if subprocess.run(["git", "-C", str(REPO), "rev-parse", "-q", "--verify", "refs/tags/ramka/0.1.2"],
                      capture_output=True).returncode:
        pytest.skip("tag ramka/0.1.2 not in this clone")
    old = tmp_path / "ramka-0.1.2"
    old.mkdir()
    archive = subprocess.run(["git", "-C", str(REPO), "archive", "refs/tags/ramka/0.1.2", "components/ramka"],
                             capture_output=True, check=True).stdout
    subprocess.run(["tar", "-x", "-C", str(old)], input=archive, check=True)
    before, after = tmp_path / "before", tmp_path / "after"
    dr.render_component(old / "components" / "ramka", demo_inputs(), before)
    dr.render_component(COMP, demo_inputs(), after)
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
