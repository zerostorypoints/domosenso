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
