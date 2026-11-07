"""The plants component's package (SPEC-022): what the Ramka reads off each plant, the derived
sensors and the watch for a new sensor in a pot."""
from pathlib import Path

import pytest
import yaml

from domosenso_render import RenderError, render_component

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
        # The rate over the readings actually held, so less than 48 h of history does not halve it.
        assert statistics[f"{p}_moisture_change_48h"]["state_characteristic"] == "change_second"
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
        # A watering stays true while the sensor is out of range (review item 1): no availability.
        assert "availability" not in sensor
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


def test_unplaced_list_is_rebuilt_every_minute(demo):
    """integration_entities() registers no listener: without a time trigger a sensor added later
    would never be seen (review item 2)."""
    inputs, package = demo
    block, _ = template_sensors(package)["plants_unplaced_in_soil"]
    kinds = {t["trigger"] for t in block["triggers"]}
    assert kinds == {"time_pattern", "homeassistant"}
    assert next(t for t in block["triggers"] if t["trigger"] == "time_pattern")["minutes"] == "/1"


def test_water_in_uses_the_rate_per_second(demo):
    inputs, package = demo
    _, water_in = template_sensors(package)["monstera_water_in_days"]
    assert "86400" in water_in["state"] and "/ 2" not in water_in["state"]


def test_drying_rate_keeps_its_digits(demo):
    """A rate per second is around -1e-5 %/s; statistics rounds to 2 decimals by default, which
    made every rate 0.0 and water_in_days never known (production, 2026-10-30)."""
    inputs, package = demo
    statistics = {s["unique_id"]: s for s in package["sensor"]}
    for plant in inputs["plants"]:
        assert statistics[f"{object_id(plant['entity'])}_moisture_change_48h"]["precision"] >= 8


def test_new_sensor_message_renders_with_plain_jinja(demo):
    """Home Assistant has no `zip` filter: the automation was disabled at the start (production,
    2026-10-30). Plain Jinja has none either, so rendering the message here proves the filters exist."""
    import jinja2

    inputs, package = demo
    automation = next(a for a in package["automation"] if a["id"] == "plants_sensor_new")
    new = [{"entity": "sensor.plant_sensor_9c2d_moisture", "device": "Plant Sensor 9C2D", "value": 11.0},
           {"entity": "sensor.plant_sensor_ab12_moisture", "device": "Plant Sensor AB12", "value": 7.0}]
    text = jinja2.Environment().from_string(automation["variables"]["text"]).render(new=new).strip()
    assert text == "Plant Sensor 9C2D: 11.0 %, Plant Sensor AB12: 7.0 %"


def test_source_switch_keeps_plant_and_history_ids(tmp_path):
    plant = {"entity": "plant.fern", "label": "Fern",
             "sources": {name: {key: f"sensor.{name}_{key}" for key in
                                 ("moisture", "conductivity", "brightness", "temperature")}
                         for name in ("tablet", "receiver")},
             "legacy_moisture_history": {"statistic_id": "sensor.old_fern",
                                        "before": "2026-11-07T12:00:00Z"}}
    for source in ("tablet", "receiver"):
        render_component(REPO / "components/plants",
                         {"plants": [{**plant, "active_source": source}], "notify": "notify.fixture"},
                         tmp_path, ["en"])
        package = yaml.safe_load((tmp_path / "package.yaml").read_text())
        assert package["plant"]["fern"]["sensors"]["moisture"] == "sensor.fern_reading_moisture"
        sensors = template_sensors(package)
        assert sensors["fern_reading_moisture"][1]["default_entity_id"] == "sensor.fern_reading_moisture"
        assert f"sensor.{source}_moisture" in sensors["fern_reading_moisture"][1]["state"]
        assert sensors["fern_reading_status"][1]["attributes"]["readings"]
        assert package["homeassistant"]["customize"]["plant.fern"]["domosenso_legacy_moisture_history"] == plant["legacy_moisture_history"]


@pytest.mark.parametrize("source", [
    {},
    {"moisture": "sensor.fern_reading_moisture", "conductivity": "sensor.fern_raw_conductivity",
     "brightness": "sensor.fern_raw_light", "temperature": "sensor.fern_raw_temperature"},
])
def test_invalid_plant_source_fails_render(tmp_path, source):
    with pytest.raises(RenderError, match=r"plant\.fern.*sources"):
        render_component(REPO / "components/plants",
                         {"plants": [{"entity": "plant.fern", "label": "Fern",
                                      "active_source": "tablet", "sources": {"tablet": source}}],
                          "notify": "notify.fixture"}, tmp_path, ["en"])


@pytest.mark.parametrize(("change", "error"), [
    ({"moisture": "sensor.fern_moisture_min_3h"}, "managed plant"),
    ({1: "sensor.malformed"}, "supply moisture"),
])
def test_source_rejects_circular_or_malformed_binding(tmp_path, change, error):
    binding = {key: f"sensor.fixture_{key}" for key in ("moisture", "conductivity", "brightness", "temperature")}
    with pytest.raises(RenderError, match=error):
        render_component(REPO / "components/plants", {"plants": [
            {"entity": "plant.fern", "label": "Fern", "active_source": "tablet",
             "sources": {"tablet": {**binding, **change}}},
        ], "notify": "notify.fixture"}, tmp_path, ["en"])


@pytest.mark.parametrize(("before", "valid"), [
    ("2026-11-07T12:00:00.123Z", True),
    ("2026-11-07T12:00:00", False),
    ("abcdefghijT12345678Z", False),
    ("2026-02-31T12:00:00Z", False),
    ("2026-11-07T12:00:00+01:60", False),
])
def test_history_cutoff_requires_a_real_zoned_timestamp(tmp_path, before, valid):
    inputs = {"plants": [{
        "entity": "plant.fern", "label": "Fern", "active_source": "tablet",
        "sources": {"tablet": {key: f"sensor.fixture_{key}" for key in
                               ("moisture", "conductivity", "brightness", "temperature")}},
        "legacy_moisture_history": {"statistic_id": "sensor.old_fern", "before": before},
    }], "notify": "notify.fixture"}
    if valid:
        render_component(REPO / "components/plants", inputs, tmp_path, ["en"])
    else:
        with pytest.raises(RenderError, match=r"plant\.fern\.legacy_moisture_history.*ISO 8601"):
            render_component(REPO / "components/plants", inputs, tmp_path, ["en"])
