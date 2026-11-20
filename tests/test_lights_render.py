"""The lights component's package: the lowest-battery sensor must not write `unknown` as its state."""
from pathlib import Path

import yaml

from domosenso_render import render_component

REPO = Path(__file__).resolve().parent.parent


def test_lowest_battery_goes_unavailable_rather_than_unknown(tmp_path):
    # A numeric sensor (unit, state_class) whose template renders "unknown" logs "Received invalid
    # sensor state" as an ERROR on every start of a home where the batteries have no value yet.
    inputs = yaml.safe_load((REPO / "examples/demo-home/inputs/lights.yaml").read_text())
    render_component(REPO / "components/lights", inputs, tmp_path, ["en"])
    package = yaml.safe_load((tmp_path / "package.yaml").read_text())
    sensors = {s["unique_id"]: s for block in package["template"] for s in block.get("sensor", [])}
    battery = sensors["hue_lowest_battery"]
    assert "availability" in battery
    assert "unknown" not in battery["state"].replace("['unknown', 'unavailable']", "")


# SPEC-053: presence rooms (0.5.0).
import pytest

from domosenso_render import RenderError

DEMO = REPO / "examples/demo-home/inputs/lights.yaml"
GOLDEN = REPO / "tests/fixtures/lights-0.4.0-package.yaml"


def _render(tmp_path, **extra):
    inputs = yaml.safe_load(DEMO.read_text())
    inputs.pop("presence_rooms", None)
    inputs.update(extra)
    render_component(REPO / "components/lights", inputs, tmp_path, ["en"])
    return (tmp_path / "package.yaml").read_text()


def test_empty_presence_rooms_renders_as_before(tmp_path):
    assert _render(tmp_path / "absent") == GOLDEN.read_text()
    assert _render(tmp_path / "empty", presence_rooms=[]) == GOLDEN.read_text()


def test_illuminance_without_dark_below_fails(tmp_path):
    room = {"group": "light.office", "name": "Office", "presence": "binary_sensor.office_presence",
            "illuminance": "sensor.office_illuminance"}
    with pytest.raises(RenderError) as exc:
        _render(tmp_path, presence_rooms=[room])
    assert all(word in str(exc.value) for word in ("presence_rooms", "Office", "dark_below"))


def test_manifest_version():
    manifest = yaml.safe_load((REPO / "components/lights/component.yaml").read_text())
    assert manifest["version"] == "0.5.0"
    assert manifest["inputs"]["presence_rooms"]["default"] == []


OFFICE = {"group": "light.office", "name": "Office", "presence": "binary_sensor.office_presence",
          "illuminance": "sensor.office_illuminance", "dark_below": 15, "off_after": "00:03:00",
          "distance": "sensor.office_presence_distance"}


def _package(tmp_path, rooms):
    return yaml.safe_load(_render(tmp_path, presence_rooms=rooms))


def _template_sensors(package):
    return {s["unique_id"]: s for block in package["template"] for s in block.get("sensor", [])}


def test_presence_room_helpers_and_sensors(tmp_path):
    package = _package(tmp_path, [OFFICE])
    assert "lights_presence_office_hold" in package["input_boolean"]
    sensors = _template_sensors(package)
    for uid in ("lights_presence_office_ambient", "lights_presence_office_last_distance"):
        assert sensors[uid]["attributes"]["component"] == "lights"
    stats = {s["unique_id"]: s for s in package["sensor"] if s["platform"] == "statistics"}
    median = stats["lights_presence_office_illuminance"]
    assert median["entity_id"] == "sensor.lights_presence_office_ambient"
    assert median["state_characteristic"] == "median"
    assert median["keep_last_sample"] is True
    assert median["max_age"] == {"minutes": 2}


def test_presence_room_without_optional_sensors(tmp_path):
    room = {k: OFFICE[k] for k in ("group", "name", "presence")}
    package = _package(tmp_path, [room])
    assert "lights_presence_office_hold" in package["input_boolean"]
    sensors = _template_sensors(package)
    assert not any(uid.startswith("lights_presence_") for uid in sensors)
    assert "sensor" not in package


def _automations(package):
    return {a["id"]: a for a in package["automation"]}


def _actions(node):
    """Every action mapping in an automation, nested ones (if/then, choose) included."""
    if isinstance(node, dict):
        if "action" in node:
            yield node
        for value in node.values():
            yield from _actions(value)
    elif isinstance(node, list):
        for item in node:
            yield from _actions(item)


def test_presence_automation_triggers(tmp_path):
    main = _automations(_package(tmp_path, [OFFICE]))["lights_presence_office"]
    triggers = {t["id"]: t for t in main["triggers"]}
    assert set(triggers) == {"enter", "empty_lit", "leave", "manual_off", "manual_on"}
    assert main["mode"] == "queued"
    assert triggers["empty_lit"]["for"] == "00:03:00"
    assert triggers["leave"]["for"] == "00:03:00"


def test_turn_on_sends_no_data(tmp_path):
    automations = _automations(_package(tmp_path, [OFFICE]))
    turn_ons = [a for auto in automations.values() for a in _actions(auto["actions"])
                if a["action"] == "light.turn_on"]
    assert turn_ons
    for action in turn_ons:
        assert "data" not in action
        assert action["target"] == {"entity_id": "light.office"}


def test_start_automation(tmp_path):
    start = _automations(_package(tmp_path, [OFFICE]))["lights_presence_office_start"]
    assert start["triggers"] == [{"trigger": "homeassistant", "event": "start"}]
    waits = [step for step in start["actions"] if "wait_for_trigger" in step]
    assert waits and waits[0]["timeout"] == "00:03:00"


def test_off_after_default(tmp_path):
    room = {k: OFFICE[k] for k in ("group", "name", "presence")}
    main = _automations(_package(tmp_path, [room]))["lights_presence_office"]
    assert {t["id"]: t for t in main["triggers"]}["leave"]["for"] == "00:05:00"


def test_presence_translations():
    import json
    for lang in ("en", "de", "pl"):
        ui = json.loads((REPO / f"components/lights/translations/{lang}.json").read_text())["ui"]
        assert "{value}" in ui["presence"]["on"]
        assert all(p in ui["presence"]["off"] for p in ("{minutes}", "{distance}"))
        if lang == "de":
            assert "ß" not in json.dumps(ui, ensure_ascii=False)
