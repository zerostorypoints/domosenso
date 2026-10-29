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
    # Since 0.4.0 the demo home shows the music visual, which 0.1.2 did not have.
    dr.render_component(old / "components" / "ramka", without_visual(), before)
    dr.render_component(COMP, without_visual(), after)
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
    """The 0.4.0 promise (UPGRADE.md): without music_visual a home gets 0.3.0's files; only the
    stamp line and the cards' resource URLs, neither written by render_component, carry 0.4.0."""
    import subprocess

    if subprocess.run(["git", "-C", str(REPO), "rev-parse", "-q", "--verify", "refs/tags/ramka/0.3.0"],
                      capture_output=True).returncode:
        pytest.skip("tag ramka/0.3.0 not in this clone")
    old = tmp_path / "ramka-0.3.0"
    old.mkdir()
    archive = subprocess.run(["git", "-C", str(REPO), "archive", "refs/tags/ramka/0.3.0", "components/ramka"],
                             capture_output=True, check=True).stdout
    subprocess.run(["tar", "-x", "-C", str(old)], input=archive, check=True)
    before, after = tmp_path / "before", tmp_path / "after"
    dr.render_component(old / "components" / "ramka", without_visual(), before)
    dr.render_component(COMP, without_visual(), after)
    names = sorted(p.name for p in before.iterdir())
    assert names == sorted(p.name for p in after.iterdir())
    for name in names:
        assert (before / name).read_text() == (after / name).read_text(), name


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


def test_music_visual_card_uses_aliases(tmp_path):
    """The visual reads audio-sensor's music aliases and falls back to the classic wave; the strip
    stays (wave: true) and moves only while the player plays (active)."""
    for lang in LANGS:
        card = now_playing(render(tmp_path / lang, with_visual())[f"dashboard.{lang}.yaml"])
        assert card["wave"] is True
        assert card["visual"] == {
            "select": "input_select.ramka_music_visual",
            "spectrum": {
                "type": "custom:ambient-wave-card",
                "source": {"kind": "spectrum", "entity": "sensor.music_spectrum", "offset": "sensor.music_spl_offset"},
                "active": "binary_sensor.ramka_media_playing",
                "fallback": "classic",
                "style": {"line_width": 2.8},
            },
            "level": {
                "type": "custom:ambient-wave-card",
                "source": {"kind": "scalar", "entity": "sensor.music_level"},
                "active": "binary_sensor.ramka_media_playing",
                "fallback": "classic",
                "style": {"line_width": 2.8},
            },
        }


def test_music_visual_follows_the_prefix(tmp_path):
    inputs = with_visual()
    inputs["prefix"] = "hall_frame"
    rendered = render(tmp_path, inputs)
    assert "hall_frame_music_visual" in rendered["package.yaml"]["input_select"]
    visual = now_playing(rendered["dashboard.en.yaml"])["visual"]
    assert visual["select"] == "input_select.hall_frame_music_visual"
    assert {visual[k]["active"] for k in ("spectrum", "level")} == {"binary_sensor.hall_frame_media_playing"}


def test_music_visual_options_merged_key_by_key(tmp_path):
    options = {"spectrum": {"flavour": "bars", "hot": 80}, "level": {"flavour": "tide", "neutral": 25},
               "palette": "calm", "rise": 150, "fall": 3, "tilt": False, "line_width": 3.5}
    visual = now_playing(render(tmp_path, with_visual(options=options))["dashboard.en.yaml"])["visual"]
    spectrum, level = visual["spectrum"], visual["level"]
    assert spectrum["flavour"] == "bars" and level["flavour"] == "tide"
    assert spectrum["colour"] == {"palette": "calm", "hot": 80}
    assert level["colour"] == {"palette": "calm", "neutral": 25}
    assert spectrum["dynamics"] == level["dynamics"] == {"rise": 150, "fall": 3, "tilt": False}
    assert spectrum["style"] == level["style"] == {"line_width": 3.5}
    # Keys given for one kind stay there; absent keys stay out, so the card's defaults apply.
    only = now_playing(render(tmp_path / "only", with_visual(options={"level": {"flavour": "tide"}}))["dashboard.en.yaml"])["visual"]
    assert only["level"]["flavour"] == "tide"
    assert "flavour" not in only["spectrum"]
    for config in (only["spectrum"], only["level"]):
        assert "colour" not in config and "dynamics" not in config
        assert config["style"] == {"line_width": 2.8}


@pytest.mark.parametrize("inputs, message", [
    (with_visual("bars"), r"music_visual must be spectrum or level, not 'bars'"),
    (with_visual(options={"colour": "red"}), r"music_visual_options: unknown key 'colour'"),
    (with_visual(options={"spectrum": {"palette": "calm"}}), r"music_visual_options.spectrum: unknown key 'palette'"),
])
def test_music_visual_bad_input_fails(tmp_path, inputs, message):
    with pytest.raises(dr.RenderError, match=message):
        render(tmp_path, inputs)


def test_controls_tile_present_only_with_music_visual(tmp_path):
    assert not visual_tiles(render(tmp_path / "without", without_visual())["dashboard.en.yaml"])
    rendered = render(tmp_path / "with", with_visual())
    for lang in LANGS:
        tiles = visual_tiles(rendered[f"dashboard.{lang}.yaml"])
        names = translations(lang)
        # One tile per option, each shown while the select reads it; anything else is the classic
        # wave on the card, so the classic tile stands for it.
        assert [t["name"] for t in tiles] == [names[f"ui.music_visual.{o}"] for o in VISUAL_OPTIONS], lang
        assert [t["visibility"][-1] for t in tiles] == [
            {"condition": "state", "entity": "input_select.ramka_music_visual", "state": "spectrum"},
            {"condition": "state", "entity": "input_select.ramka_music_visual", "state": "level"},
            {"condition": "state", "entity": "input_select.ramka_music_visual", "state_not": ["spectrum", "level"]},
        ]
        assert len({t["icon"] for t in tiles}) == 3
        for tile in tiles:
            assert tile["target"] == {"entity_id": "input_select.ramka_music_visual"}
            assert tile["data"] == {"cycle": True}
            assert tile["taps"] == 1
            assert (tile["columns"], tile["rows"]) == (12, 1)


def test_controls_tile_sits_in_the_music_column_while_the_player_is_on(tmp_path):
    dashboard = render(tmp_path, with_visual())["dashboard.en.yaml"]
    music = next(s for s in sections(dashboard)
                 if any(c.get("type") == "media-control" for c in s.get("cards", [])))
    tiles = [c for c in music["cards"] if c in visual_tiles(dashboard)]
    assert len(tiles) == 3
    player_on = next(c for c in music["cards"] if c.get("type") == "media-control")["visibility"]
    for tile in tiles:
        assert tile["visibility"][:-1] == player_on


def test_visual_configs_pass_the_card_normaliser(tmp_path):
    """The rendered configs go through ambient-wave-card's own normaliseConfig in node, so a key
    the card does not read or a value it refuses fails here, not on the wall."""
    import shutil
    import subprocess

    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH (eval \"$(fnm env --shell zsh)\")")
    options = {"spectrum": {"flavour": "bars", "neutral": 35, "hot": 75}, "level": {"flavour": "tide"},
               "palette": "zones", "rise": 150, "fall": 3, "tilt": False, "line_width": 3.5}
    configs = []
    for inputs in (with_visual(), with_visual("level", options)):
        visual = now_playing(render(tmp_path / str(len(configs)), inputs)["dashboard.en.yaml"])["visual"]
        configs += [visual["spectrum"], visual["level"]]
    script = tmp_path / "normalise.mjs"
    script.write_text(
        f"import {{ normaliseConfig }} from {json.dumps((AUDIO_CARDS / 'lib' / 'config.js').as_uri())};\n"
        f"import {{ FLAVOUR_KINDS }} from {json.dumps((AUDIO_CARDS / 'lib' / 'flavours' / 'index.js').as_uri())};\n"
        "const configs = JSON.parse(process.argv[2]);\n"
        "const out = configs.map((c) => normaliseConfig(c, FLAVOUR_KINDS));\n"
        "process.stdout.write(JSON.stringify(out));\n",
        encoding="utf-8")
    result = subprocess.run([node, str(script), json.dumps(configs)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    spectrum, level, spectrum2, level2 = json.loads(result.stdout)
    assert (spectrum["flavour"], level["flavour"]) == ("dune", "centre")
    assert spectrum["style"]["line_width"] == level["style"]["line_width"] == 2.8
    assert spectrum["fallback"] == level["fallback"] == "classic"
    assert (spectrum2["flavour"], spectrum2["colour"]["neutral"], spectrum2["colour"]["hot"]) == ("bars", 35, 75)
    assert (level2["flavour"], level2["colour"]["palette"], level2["dynamics"]["tilt"]) == ("tide", "zones", False)
    assert level2["style"]["line_width"] == 3.5
