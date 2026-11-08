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


EFFECTS = ["Pulse", "Glow", "Bands", "Centre meter", "Spectrum", "Ripple"]


def style_select():
    return next(s for s in package()["select"] if s["id"] == "strip_style")


def test_a_plain_turn_on_restarts_the_chosen_style():
    # ESPHome drops the effect on every turn-off: a turn-on without one (the follow automation's
    # `keep`, a tap on the light) would light the strip in a plain colour; the package starts the
    # style of the Strip style select instead.
    light = strip_light()
    text = yaml.safe_dump(light["on_turn_on"])
    assert "get_effect_name" in text and "None" in text and "strip_style" in text
    on_state = yaml.safe_dump(light["on_state"])
    # Through the select's own call, so a style chosen in the light's dialog is saved over a restart
    # too (a bare publish_state shows it but does not save it).
    assert "strip_style" in on_state and "select.set" in on_state and "publish_state" not in on_state
    assert "globals" not in package() or not any(g["id"] == "strip_last_effect" for g in package()["globals"])
    # The fade from off keeps the frames before the style takes over near dark.
    assert light.get("default_transition_length", "1s") not in ("0s", "0ms", 0)


def test_style_select_offers_the_light_effects():
    # Home Assistant tucks a light's effect into a small button of its dialog; the select puts the
    # style on the device page next to intensity and palette, and is what automations set.
    select = style_select()
    assert [next(iter(e.values()))["name"] for e in strip_light()["effects"]] == EFFECTS
    assert select["options"] == EFFECTS
    assert select["initial_option"] == "Pulse"
    assert select["restore_value"] is True and select.get("entity_category") is None
    action = yaml.safe_dump(select["set_action"])
    assert "strip_light" in action and "light.turn_on" in action and "is_on" in action


def test_the_strip_component_watches_the_light():
    # Without a style the light shows a plain colour, which the frame limiter never sees: the
    # component caps it through the light's maximum brightness.
    assert package()["music_strip"]["light_id"] == "strip_light"


def test_bass_position_offers_start_and_end():
    # Start and end lay the music out once from the strip's beginning to its end (bass first, or
    # last), for a strip whose beginning is on the left or on the right.
    bass = next(s for s in package()["select"] if s["id"] == "strip_bass")
    assert bass["options"] == ["centre", "ends", "start", "end"]
    assert bass.get("entity_category") is None
    for where in ("set_action", ):
        text = yaml.safe_dump(bass[where])
        assert "BassPosition::START" in text and "BassPosition::END" in text
    boot = yaml.safe_dump(package()["esphome"]["on_boot"])
    assert "BassPosition::START" in boot and "BassPosition::END" in boot


def test_style_select_and_light_do_not_call_each_other_forever():
    # The light's on_state sets the select, and the select's action switches the light; the select
    # publishes only after its action, so an action that always called the light recursed until the
    # board ran out of stack and restarted (seen on the prototype on every style change in the dialog).
    action = yaml.safe_dump(style_select()["set_action"])
    assert "get_effect_name" in action and "!=" in action


def test_settings_are_written_to_flash_within_seconds():
    # ESPHome writes restored values to flash once a minute by default: a restart in that minute lost
    # the last changes. A write happens only when a value changed.
    interval = package()["preferences"]["flash_write_interval"]
    assert interval.endswith("s") and not interval.endswith("ms") and int(interval[:-1]) <= 10
