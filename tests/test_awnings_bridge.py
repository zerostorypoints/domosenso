"""The awnings component's frame bridge: event parsing, the burst filter and the topics (no network)."""
import importlib.util
import json
from pathlib import Path

import pytest

BRIDGE = Path(__file__).resolve().parent.parent / "components" / "awnings" / "services" / "frame-bridge" / "bridge.py"
spec = importlib.util.spec_from_file_location("frame_bridge", BRIDGE)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

ENV = {"NODE_WS": "ws://node:8080", "MQTT_HOST": "broker", "WIND_SENSOR": "123456"}


def frame(address=123456, command="Sensor", rcode=1):
    return {"address": address, "command": command, "rcode": rcode, "rssi": -80, "bits": 56, "valid": True}


def test_config_requires_the_node_and_the_broker():
    cfg = bridge.config(ENV)
    assert (cfg["root"], cfg["mqtt_port"], cfg["wind_sensor"]) == ("espsomfy", 1883, 123456)
    with pytest.raises(KeyError):
        bridge.config({"MQTT_HOST": "broker"})
    assert bridge.config({**ENV, "WIND_SENSOR": ""})["wind_sensor"] is None


def test_parse():
    assert bridge.parse('42[remoteFrame,{"address":1}]') == ("remoteFrame", {"address": 1})
    assert bridge.parse("2") == (None, None)


def test_wind_frames_under_the_root_topic_and_bursts_dropped():
    cfg = bridge.config({**ENV, "ROOT_TOPIC": "awn/"})
    bursts = bridge.Bursts()
    first = bridge.publications("remoteFrame", frame(rcode=3), 100.0, cfg, bursts)
    assert [(t, p, r) for t, p, r in first if t != "awn/frames"] == [("awn/wind_sensor/state", "1", False)]
    assert json.loads(next(p for t, p, _ in first if t == "awn/frames"))["address"] == 123456
    assert bridge.publications("remoteFrame", frame(rcode=3), 101.0, cfg, bursts) == []
    later = bridge.publications("remoteFrame", frame(rcode=2), 101.5, cfg, bursts)
    assert ("awn/wind_sensor/state", "0", False) in later


def test_other_remotes_and_positions():
    cfg = bridge.config({**ENV, "WIND_SENSOR": ""})
    bursts = bridge.Bursts()
    assert [t for t, _, _ in bridge.publications("remoteFrame", frame(), 1.0, cfg, bursts)] == ["espsomfy/frames"]
    assert bridge.publications("shadeState", {"shadeId": 2, "position": 40}, 2.0, cfg, bursts) == [
        ("espsomfy/shades/2/position", "40", True)
    ]
    assert bridge.publications("memStatus", {}, 3.0, cfg, bursts) == []
