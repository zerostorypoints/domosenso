"""SPEC-043: the Ramka pushes its music palette to audio-sensor's music strip and shows the strip's
rows on its music sensor sub-view, only through audio-sensor's provides."""
import re
from pathlib import Path

import pytest
import yaml

import domosenso_render as dr

REPO = Path(__file__).resolve().parent.parent
COMP = REPO / "components" / "ramka"
DEMO_INPUTS = REPO / "examples" / "demo-home" / "inputs" / "ramka.yaml"
PALETTE_JS = REPO / "components" / "audio-sensor" / "cards" / "lib" / "palette.js"
LANGS = ["en", "de", "pl"]
STRIP_ON = {"condition": "state", "entity": "binary_sensor.music_source_strip", "state": "on"}
SYNC = "input_boolean.ramka_music_strip_palette_sync"


@pytest.fixture(scope="module")
def demo(tmp_path_factory):
    out = tmp_path_factory.mktemp("ramka") / "out"
    dr.render_component(COMP, yaml.safe_load(DEMO_INPUTS.read_text(encoding="utf-8")), out)
    return {p.name: yaml.load(p.read_text(encoding="utf-8"), Loader=yaml.CSafeLoader) for p in out.glob("*.yaml")}


def card_palettes():
    """PALETTES of the wave card's palette.js, sampled at 0, 0.25, 0.5, 0.75 and 1 with its own
    linear interpolation (the literal first stop: the card swaps in its neutral colour, a strip has none)."""
    src = PALETTE_JS.read_text(encoding="utf-8")
    body = src[src.index("export const PALETTES"):src.index("};")]
    palettes = {}
    for name, stops in re.findall(r"(\w+): \[(.*?)\]\],?\s", body + "\n", re.S):
        palettes[name] = [(float(a), c) for a, c in re.findall(r'\[([\d.]+), "(#[0-9a-f]{6})"\]', stops + "]")]

    def rgb(c):
        return [int(c[i:i + 2], 16) for i in (1, 3, 5)]

    def at(stops, x):
        if x <= stops[0][0]:
            return rgb(stops[0][1])
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            if x <= b:
                f = (x - a) / (b - a)
                lo, hi = rgb(ca), rgb(cb)
                return [round(lo[k] + (hi[k] - lo[k]) * f) for k in range(3)]
        return rgb(stops[-1][1])

    return {n: ["#%02x%02x%02x" % tuple(at(s, x)) for x in (0, 0.25, 0.5, 0.75, 1)] for n, s in palettes.items()}


def sync_automation(package):
    return next(a for a in package["automation"] if a["id"] == "ramka_music_strip_palette_sync")


def music_sensor_view(dashboard):
    return next(v for v in dashboard["views"] if v.get("path") == "music-sensor")


def test_strip_stops_match_the_card_palettes(demo):
    table = sync_automation(demo["package.yaml"])["actions"][0]["variables"]["stops_by_palette"]
    expected = card_palettes()
    assert set(table) == set(expected) == {"zones", "series", "calm"}
    for name, stops in table.items():
        assert stops == expected[name], name
        assert all(re.fullmatch(r"#[0-9a-f]{6}", s) for s in stops)


def test_sync_automation(demo):
    package = demo["package.yaml"]
    assert "initial" not in package["input_boolean"]["ramka_music_strip_palette_sync"]
    automation = sync_automation(package)
    triggers = automation["triggers"]
    assert {"trigger": "state", "entity_id": "input_select.ramka_music_palette"} in triggers
    assert {"trigger": "state", "entity_id": SYNC, "to": "on"} in triggers
    assert {"condition": "state", "entity_id": SYNC, "state": "on"} in automation["conditions"]
    assert {"condition": "state", "entity_id": "binary_sensor.music_source_strip", "state": "on"} in automation["conditions"]
    call = automation["actions"][-1]
    assert call["action"] == "script.audio_sensor_music_strip_palette"
    assert "stops_by_palette" in call["data"]["stops"] and "input_select.ramka_music_palette" in call["data"]["stops"]


def test_sub_view_strip_rows(demo):
    for lang in LANGS:
        view = music_sensor_view(demo[f"ramka-settings.{lang}.yaml"])
        sections = [s for s in view["sections"] if s.get("visibility") == [STRIP_ON]]
        assert len(sections) == 1, lang
        text = yaml.safe_dump(sections[0])
        assert "light.music_strip" in text and SYNC in text, lang
        # The way to every other strip setting: the board's device page, from the light the
        # contract names; no strip setting of the board is rebuilt here.
        markdown = next(c["content"] for c in sections[0]["cards"] if c["type"] == "markdown")
        assert "state_attr('binary_sensor.music_source_strip', 'light')" in markdown, lang
        assert "/config/devices/device/{{ device }}" in markdown, lang
        assert "strip_intensity" not in text and "strip_palette'" not in text, lang


def test_strip_rows_hidden_without_a_strip(demo):
    # Ramka cannot see audio-sensor's inputs: in a home without a strip the ability entity does not
    # exist and the section's visibility hides it.
    view = music_sensor_view(demo["ramka-settings.en.yaml"])
    for section in view["sections"]:
        if "light.music_strip" in yaml.safe_dump(section):
            assert section.get("visibility") == [STRIP_ON]


def test_translations_for_the_strip_rows():
    for lang in LANGS:
        import json
        t = json.loads((COMP / "translations" / f"{lang}.json").read_text(encoding="utf-8"))["ui"]["settings"]
        for key in ("music_strip", "music_strip_palette_sync", "music_strip_device"):
            assert t.get(key), (lang, key)
