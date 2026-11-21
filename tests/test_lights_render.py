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
    assert {"trigger": "homeassistant", "event": "start"} in start["triggers"]
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


def test_automation_aliases_give_the_provided_entity_ids(tmp_path):
    # HA makes an automation's entity id from its alias, not from its id.
    import re
    automations = _automations(_package(tmp_path, [OFFICE]))
    for auto_id, auto in automations.items():
        assert re.sub(r"[^a-z0-9]+", "_", auto["alias"].lower()).strip("_") == auto_id


def test_statistics_name_gives_the_provided_entity_id(tmp_path):
    # A YAML statistics sensor takes its entity id from its name (no default_entity_id).
    import re
    package = _package(tmp_path, [OFFICE])
    for s in (s for s in package["sensor"] if s["platform"] == "statistics"):
        assert re.sub(r"[^a-z0-9]+", "_", s["name"].lower()).strip("_") == s["unique_id"]


def test_ambient_follows_only_the_illuminance(tmp_path):
    # Review I1: a group trigger writes the reading taken while the lamp was still lit the moment
    # the bulbs report off; the ambient sensor follows the illuminance alone.
    package = _package(tmp_path, [OFFICE])
    block = next(b for b in package["template"]
                 if any(s.get("unique_id") == "lights_presence_office_ambient" for s in b.get("sensor", [])))
    assert [t["entity_id"] for t in block["triggers"]] == ["sensor.office_illuminance"]


def test_manual_off_needs_presence_for_a_few_seconds(tmp_path):
    # Review I3: someone walking back in while the automation switches off is not a switch-off by hand.
    main = _automations(_package(tmp_path, [OFFICE]))["lights_presence_office"]
    branch = next(c for c in main["actions"][0]["choose"]
                  if {"condition": "trigger", "id": "manual_off"} in c["conditions"])
    presence = next(c for c in branch["conditions"] if c.get("condition") == "state")
    assert presence == {"condition": "state", "entity_id": "binary_sensor.office_presence",
                        "state": "on", "for": "00:00:05"}


def test_start_automation_runs_after_a_reload_and_a_resume(tmp_path):
    # Review I4: a reload cancels a running `for` and re-attaches a template trigger that is
    # already true; so does switching the paused room back on.
    start = _automations(_package(tmp_path, [OFFICE]))["lights_presence_office_start"]
    assert {"trigger": "event", "event_type": "automation_reloaded"} in start["triggers"]
    assert {"trigger": "state", "entity_id": "automation.lights_presence_office", "from": "off", "to": "on"} in start["triggers"]
