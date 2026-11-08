"""SPEC-043: the music strip's ESPHome package, read as data (the firmware build is esphome-check's)."""
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
PACKAGE = REPO / "components" / "audio-sensor" / "esphome" / "music-strip.yaml"


def package():
    class Loader(yaml.SafeLoader):
        pass
    # !lambda and the like are ESPHome's tags; keep their text.
    Loader.add_multi_constructor("!", lambda loader, suffix, node: f"!{suffix} {loader.construct_scalar(node)}")
    return yaml.load(PACKAGE.read_text(encoding="utf-8"), Loader=Loader)


def strip_light():
    return next(light for light in package()["light"] if light["id"] == "strip_light")


def test_strip_is_off_after_a_boot():
    # A strip that comes back on at boot draws its full current before Home Assistant or anyone
    # chose it, and on the board's own 5 V that can brown the board out into a boot loop.
    assert strip_light()["restore_mode"] == "ALWAYS_OFF"


def test_a_plain_turn_on_restarts_the_last_music_style():
    # Only a music style runs the power limiter. ESPHome drops the effect on every turn-off, so a
    # turn-on without one (the follow automation's `keep`, a tap on the light) would light the strip
    # in its plain colour at full current; the package puts the last style back instead.
    light = strip_light()
    text = yaml.safe_dump(light["on_turn_on"])
    assert "get_effect_name" in text and "None" in text and "strip_last_effect" in text
    assert "strip_last_effect" in yaml.safe_dump(light["on_state"])
    last = next(g for g in package()["globals"] if g["id"] == "strip_last_effect")
    assert last["initial_value"].strip('"') == "Pulse"
    # The fade from off keeps the frames before the style takes over near dark.
    assert light.get("default_transition_length", "1s") not in ("0s", "0ms", 0)
