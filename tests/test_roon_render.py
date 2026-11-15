"""SPEC-049: the roon component renders one queued automation per volume bridge."""
from pathlib import Path

import pytest
import yaml
from domosenso_render import render_component

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "components/roon"


def render(tmp_path, bridges):
    render_component(COMPONENT, {"volume_bridges": bridges}, tmp_path, ["en"])
    return yaml.safe_load((tmp_path / "package.yaml").read_text())


def test_no_bridge_renders_an_empty_package(tmp_path):
    assert render(tmp_path, []) == {}


def test_demo_inputs_render(tmp_path):
    inputs = yaml.safe_load((ROOT / "examples/demo-home/inputs/roon.yaml").read_text())
    render_component(COMPONENT, inputs, tmp_path, ["en"])
    pkg = yaml.safe_load((tmp_path / "package.yaml").read_text())
    assert [a["id"] for a in pkg["automation"]] == ["roon_volume_study_dac"]


def test_bridge_with_steps_and_without_mute(tmp_path):
    pkg = render(tmp_path, [{"event": "event.study_dac_roon_volume",
                             "amplifier": "media_player.study_amplifier", "steps": 2, "mute": False}])
    (auto,) = pkg["automation"]
    assert auto["alias"] == "Roon volume study_dac"
    assert auto["mode"] == "queued" and auto["max"] == 20
    assert auto["triggers"] == [{"trigger": "state", "entity_id": "event.study_dac_roon_volume",
                                 "not_from": ["unavailable"], "not_to": ["unavailable", "unknown"]}]
    options = auto["actions"][0]["choose"]
    assert len(options) == 2  # no mute branch
    for option, action in zip(options, ["media_player.volume_up", "media_player.volume_down"]):
        repeat = option["sequence"][0]["repeat"]
        assert repeat["count"] == 2
        assert repeat["sequence"] == [{"action": action, "target": {"entity_id": "media_player.study_amplifier"}}]


def test_mute_is_on_by_default(tmp_path):
    pkg = render(tmp_path, [{"event": "event.den_roon_volume", "amplifier": "media_player.den_amp"}])
    options = pkg["automation"][0]["actions"][0]["choose"]
    assert options[0]["sequence"][0]["repeat"]["count"] == 1
    mute = options[2]["sequence"][0]
    assert mute["action"] == "media_player.volume_mute"
    assert "is_state_attr('media_player.den_amp', 'is_volume_muted', true)" in mute["data"]["is_volume_muted"]


@pytest.mark.parametrize("bridge,reason", [
    ({"event": "event.den_volume", "amplifier": "media_player.den_amp"}, "event.<zone>_roon_volume"),
    ({"event": "sensor.den_roon_volume", "amplifier": "media_player.den_amp"}, "event.<zone>_roon_volume"),
    ({"event": "event.den_roon_volume", "amplifier": "switch.den_amp"}, "media_player"),
    ({"event": "event.den_roon_volume", "amplifier": "media_player.den_amp", "steps": 0}, "steps"),
    ({"event": "event.den_roon_volume", "amplifier": "media_player.den_amp", "steps": True}, "steps"),
    ({"event": "event.den_roon_volume", "amplifier": "media_player.den_amp", "mute": "yes"}, "mute"),
    ({"event": "event.den_roon_volume", "amplifier": "media_player.den_amp", "volume": 3}, "unknown"),
])
def test_bad_bridge_is_refused(tmp_path, bridge, reason):
    with pytest.raises(Exception, match="roon:") as err:
        render(tmp_path, [bridge])
    assert reason in str(err.value)


def test_duplicate_event_is_refused(tmp_path):
    b = {"event": "event.den_roon_volume", "amplifier": "media_player.den_amp"}
    with pytest.raises(Exception, match="two volume bridges"):
        render(tmp_path, [b, dict(b)])
