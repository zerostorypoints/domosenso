"""The plants component's package (SPEC-022): what the Ramka reads off each plant, the derived
sensors and the watch for a new sensor in a pot."""
from pathlib import Path

import pytest
import yaml

from domosenso_render import render_component

REPO = Path(__file__).resolve().parent.parent


@pytest.fixture
def demo(tmp_path):
    inputs = yaml.safe_load((REPO / "examples/demo-home/inputs/plants.yaml").read_text())
    render_component(REPO / "components/plants", inputs, tmp_path, ["en"])
    return inputs, yaml.safe_load((tmp_path / "package.yaml").read_text())


def object_id(entity):
    return entity.split(".", 1)[1]


def moisture(plant):
    return plant.get("sensors", {}).get("moisture", f"sensor.{object_id(plant['entity'])}_moisture")


def template_sensors(package):
    return {s["unique_id"]: (block, s) for block in package.get("template", []) for s in block.get("sensor", [])}


def test_customize_carries_room_photo_and_bands(demo):
    inputs, package = demo
    customize = package["homeassistant"]["customize"]
    photos = 0
    for plant in inputs["plants"]:
        attrs = customize[plant["entity"]]
        assert attrs["domosenso_plant"] is True
        label = plant["label"]
        assert attrs["domosenso_room"] == (label if isinstance(label, str) else next(iter(label.values())))
        assert attrs["domosenso_bands"]["min_moisture"] == plant.get("min_moisture", 15)
        assert attrs["domosenso_bands"]["max_conductivity"] == 2000
        if "photo" in plant:
            photos += 1
            assert attrs["entity_picture"] == plant["photo"]
        else:
            assert "entity_picture" not in attrs
        if "min_temperature" in plant:
            assert attrs["domosenso_bands"]["min_temperature"] == plant["min_temperature"]
    assert photos == 1


def test_derived_sensors_per_plant(demo):
    inputs, package = demo
    statistics = {s["unique_id"]: s for s in package["sensor"]}
    templates = template_sensors(package)
    for plant in inputs["plants"]:
        p = object_id(plant["entity"])
        assert statistics[f"{p}_moisture_min_3h"]["state_characteristic"] == "value_min"
        assert statistics[f"{p}_moisture_min_3h"]["entity_id"] == moisture(plant)
        assert statistics[f"{p}_moisture_change_48h"]["state_characteristic"] == "change"
        assert f"{p}_last_watered" in templates
        assert f"{p}_water_in_days" in templates


def test_last_watered_ignores_a_start(demo):
    inputs, package = demo
    templates = template_sensors(package)
    for plant in inputs["plants"]:
        p = object_id(plant["entity"])
        block, sensor = templates[f"{p}_last_watered"]
        assert sensor["device_class"] == "timestamp"
        assert block["triggers"][0]["entity_id"] == moisture(plant)
        assert "trigger.from_state" in sensor["state"] and "is_number(f)" in sensor["state"]
        assert moisture(plant) in sensor["availability"]
        _, water_in = templates[f"{p}_water_in_days"]
        assert moisture(plant) in water_in["availability"]
        assert f"sensor.{p}_last_watered" in water_in["state"]
        assert f"sensor.{p}_moisture_change_48h" in water_in["state"]


def test_new_sensor_watch_excludes_known_sensors(demo):
    inputs, package = demo
    _, unplaced = template_sensors(package)["plants_unplaced_in_soil"]
    assert "integration_entities('xiaomi_ble')" in unplaced["state"]
    for plant in inputs["plants"]:
        assert moisture(plant) in unplaced["attributes"]["sensors"]
    automation = next(a for a in package["automation"] if a["id"] == "plants_sensor_new")
    assert automation["triggers"][0]["entity_id"] == "sensor.plants_unplaced_in_soil"
    assert "notify" in automation["actions"][-1]["action"] or any(
        a.get("action") == inputs["notify"] for a in automation["actions"])


def test_names_and_rooms_per_language(demo):
    """A name or label given per language: the first is the friendly name and the room, and the whole
    map goes to the Ramka, which shows each dashboard's language."""
    inputs, package = demo
    attrs = package["homeassistant"]["customize"]["plant.basil"]
    assert attrs["friendly_name"] == "Basil" and attrs["domosenso_room"] == "Kitchen"
    assert attrs["domosenso_names"] == {"en": "Basil", "de": "Basilikum", "pl": "Bazylia"}
    assert attrs["domosenso_rooms"] == {"en": "Kitchen", "de": "Küche", "pl": "Kuchnia"}
    monstera = package["homeassistant"]["customize"]["plant.monstera"]
    assert monstera["friendly_name"] == "Monstera"
    assert "domosenso_names" not in monstera and "domosenso_rooms" not in monstera
    assert package["homeassistant"]["customize"]["sensor.basil_last_watered"]["friendly_name"] == "Basil last watered"
