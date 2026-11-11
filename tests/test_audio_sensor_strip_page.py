"""The Music strip settings page (SPEC-043): every strip setting of a board, grouped, each group with a
plain-language explanation, rendered by audio-sensor so it works without the Ramka.

Home Assistant shows no description for a device's entities, so this page is where the strip's
settings are explained."""
import copy
import json
from pathlib import Path

import pytest
import yaml

import domosenso_render as dr

REPO = Path(__file__).resolve().parent.parent
COMP = REPO / "components" / "audio-sensor"
DEMO_INPUTS = REPO / "examples" / "demo-home" / "inputs" / "audio-sensor.yaml"
PACKAGE = COMP / "esphome" / "music-strip.yaml"
LANGS = ["en", "de", "pl"]
DOMAINS = ["light", "select", "text", "number", "switch", "button"]


def demo_inputs() -> dict:
    return yaml.safe_load(DEMO_INPUTS.read_text(encoding="utf-8"))


def render(tmp_path, inputs) -> Path:
    out = tmp_path / "out"
    dr.render_component(COMP, inputs, out)
    return out


def page(out: Path, lang: str):
    path = out / f"music-strip.{lang}.yaml"
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    return yaml.safe_load(text) if text.strip() else None


def firmware_entities() -> list[tuple[str, str]]:
    """(domain, name) of every entity the strip's ESPHome package creates."""
    class Loader(yaml.SafeLoader):
        pass
    Loader.add_multi_constructor("!", lambda loader, suffix, node: None)
    data = yaml.load(PACKAGE.read_text(encoding="utf-8"), Loader=Loader)
    found = [(domain, item["name"]) for domain in DOMAINS for item in data.get(domain, [])]
    found.append(("sensor", data["music_strip"]["current"]["name"]))
    return found


def demo_board_slug() -> str:
    board = next(b for b in demo_inputs()["sensors"] if b.get("strip"))
    name = board.get("name", "audio-sensor-" + board["room"])
    return board["area"].lower().replace("'", "").replace("-", "_").replace(" ", "_") + "_" + \
        name.lower().replace("'", "").replace("-", "_").replace(" ", "_")


def test_one_view_per_strip_board_with_every_setting(tmp_path):
    out = render(tmp_path, demo_inputs())
    dashboard = page(out, "en")
    boards = [b for b in demo_inputs()["sensors"] if b.get("strip")]
    assert len(dashboard["views"]) == len(boards)
    text = yaml.safe_dump(dashboard)
    slug = demo_board_slug()
    for domain, name in firmware_entities():
        assert f"{domain}.{slug}_{name.lower().replace(' ', '_')}" in text, name
    assert "[[" not in text and "]]" not in text


def test_every_group_has_its_explanation(tmp_path):
    view = page(render(tmp_path, demo_inputs()), "en")["views"][0]
    assert view["type"] == "sections"
    for section in view["sections"]:
        markdown = [c for c in section["cards"] if c["type"] == "markdown"]
        assert markdown and len(markdown[0]["content"]) > 80, section
    # The explanation names each setting the way Home Assistant shows it.
    help_text = " ".join(c["content"] for s in view["sections"] for c in s["cards"] if c["type"] == "markdown")
    for _, name in firmware_entities():
        if name in ("Music strip", "Strip reset settings", "Strip current"):
            continue
        assert name.removeprefix("Strip ").lower() in help_text.lower(), name


def test_follow_and_ambient_helpers_when_configured(tmp_path):
    text = yaml.safe_dump(page(render(tmp_path, demo_inputs()), "en"))
    board = next(b for b in demo_inputs()["sensors"] if b.get("strip"))
    prefix = board.get("id_prefix", board["room"].replace("-", "_"))
    for helper in ("input_boolean.{p}_strip_follow_music", "input_number.{p}_strip_follow_off_delay",
                   "input_select.{p}_strip_follow_effect", "input_boolean.{p}_strip_ambient",
                   "input_number.{p}_strip_ambient_dark_lux", "input_number.{p}_strip_ambient_max_pct"):
        assert helper.format(p=prefix) in text, helper
    plain = copy.deepcopy(demo_inputs())
    for b in plain["sensors"]:
        if b.get("strip"):
            b["strip"] = {"leds": 60}
    text = yaml.safe_dump(page(render(tmp_path / "plain", plain), "en"))
    assert "_strip_follow_music" not in text and "_strip_ambient" not in text


def test_no_page_without_a_strip(tmp_path):
    inputs = copy.deepcopy(demo_inputs())
    for b in inputs["sensors"]:
        b.pop("strip", None)
    out = render(tmp_path, inputs)
    for lang in LANGS:
        assert page(out, lang) is None


def test_every_language_has_the_page_text():
    keys = None
    for lang in LANGS:
        strip = json.loads((COMP / "translations" / f"{lang}.json").read_text(encoding="utf-8"))["ui"]["strip"]
        assert all(isinstance(v, str) and v.strip() for v in strip.values()), lang
        keys = keys or set(strip)
        assert set(strip) == keys, lang


@pytest.mark.parametrize("lang", LANGS)
def test_page_renders_in_each_language(tmp_path, lang):
    dashboard = page(render(tmp_path, demo_inputs()), lang)
    assert dashboard["title"] and dashboard["views"][0]["sections"]
