"""`domosenso areas` (SPEC-038 §3.8): the report from a fake registry of the demo home."""
from domosenso_cli.areas import load_kinds, report


def _state(entity, device_class=None, state="20"):
    attributes = {"state_class": "measurement"}
    if device_class:
        attributes["device_class"] = device_class
    return {"entity_id": entity, "state": state, "attributes": attributes}


REGISTRY = {
    "floors": [{"floor_id": "up", "level": 1}, {"floor_id": "ground", "level": 0}],
    "areas": [
        {"area_id": "bedroom", "name": "Bedroom", "floor_id": "up"},
        {"area_id": "living_room", "name": "Living room", "floor_id": "ground",
         "temperature_entity_id": "sensor.living_room_temperature", "humidity_entity_id": None},
        {"area_id": "office", "name": "Office", "floor_id": "ground"},
        {"area_id": "garden", "name": "Garden", "floor_id": None},
    ],
    "devices": [
        {"id": "a", "area_id": "bedroom"}, {"id": "b", "area_id": "bedroom"}, {"id": "c", "area_id": "office"},
        {"id": "air", "area_id": "living_room"},
    ],
    "entities": [
        {"entity_id": "sensor.bedroom_a", "device_id": "a"},
        {"entity_id": "sensor.bedroom_b", "device_id": "b"},
        {"entity_id": "sensor.office_temperature", "device_id": "c"},
        {"entity_id": "sensor.office_battery_temperature", "device_id": "c", "entity_category": "diagnostic"},
        {"entity_id": "sensor.living_room_co2", "device_id": "air"},
        {"entity_id": "sensor.living_room_temperature", "area_id": "living_room"},
    ],
    "states": [
        _state("sensor.bedroom_a", "temperature"), _state("sensor.bedroom_b", "temperature"),
        _state("sensor.office_temperature", "temperature"), _state("sensor.office_battery_temperature", "temperature"),
        _state("sensor.living_room_co2", "carbon_dioxide"), _state("sensor.living_room_temperature", "temperature"),
        _state("sensor.outside_temperature", "temperature"),
    ],
}


def test_the_kinds_are_pockets_own_table():
    assert [k["id"] for k in load_kinds()] == ["climate", "air", "illuminance", "sound", "pressure"]


def test_lines_in_floor_order_with_sources_and_choices():
    home = {"rooms": [{"id": "living_room", "type": "inside"}, {"id": "cellar", "name": "Cellar"}],
            "outside": {"temperature": "sensor.outside_temperature", "area": "garden"}}
    store = {"areas": {"office": {"type": "inside"}}, "picked": {}}
    lines, fails = report(REGISTRY, store, home)
    text = [" ".join(line) for line in lines]
    assert text == [
        "warn inputs room cellar: no HA area cellar",
        'area living_room "Living room" floor ground type inside (inputs)',
        "main living_room climate sensor.living_room_temperature (home-assistant)",
        "main living_room air sensor.living_room_co2 (auto)",
        'area office "Office" floor ground type inside (pocket)',
        "main office climate sensor.office_temperature (auto)",
        'area bedroom "Bedroom" floor up type inside (default)',
        "candidates bedroom climate 2: choose one",
        'area garden "Garden" floor - type outside (inputs)',
        "main garden climate sensor.outside_temperature (inputs)",
        "quick all_off (default)",
    ]
    assert fails == 0


def test_an_input_naming_a_missing_entity_fails_a_none_is_kept_a_pick_not_redone():
    home = {"rooms": [{"id": "office", "climate": {"temperature": "sensor.attic_temperature"}}]}
    store = {"areas": {"living_room": {"air": "none"}}, "picked": {"bedroom": ["climate"]}}
    lines, fails = report(REGISTRY, store, home)
    text = [" ".join(line) for line in lines]
    assert "fail inputs sensor.attic_temperature: no such entity" in text
    assert fails == 1
    assert not any(t.startswith("main living_room air") for t in text), "None is a choice"
    assert not any(t.startswith("candidates bedroom climate") for t in text), "picked once, not asked again"


def test_an_empty_new_home_passes():
    lines, fails = report({"areas": [{"area_id": "hall", "name": "Hall"}]}, None, None)
    assert [" ".join(line) for line in lines] == ['area hall "Hall" floor - type inside (default)', "quick all_off (default)"]
    assert fails == 0


def test_json_data_gives_the_ai_each_candidates_device_and_the_quick_actions():
    registry = {**REGISTRY,
                "devices": [*REGISTRY["devices"][:2], {"id": "b", "area_id": "bedroom", "name": "Bedside sensor",
                                                      "manufacturer": "Acme", "model": "TH-1"}, *REGISTRY["devices"][3:]],
                "entities": [*REGISTRY["entities"], {"entity_id": "light.bedroom", "area_id": "bedroom"},
                             {"entity_id": "scene.evening", "area_id": "living_room"}],
                "states": [*REGISTRY["states"], {"entity_id": "light.bedroom", "state": "off", "attributes": {}},
                           {"entity_id": "scene.evening", "state": "x", "attributes": {"friendly_name": "Evening"}}]}
    data: list = []
    lines, _ = report(registry, None, None, ["scene.evening", "all_off"], data)
    bedroom = next(d for d in data if d.get("area") == "bedroom")
    candidates = bedroom["kinds"]["climate"]["candidates"]
    assert {c["id"]: (c["device"], c.get("model")) for c in candidates}["b"] == ("Bedside sensor", "TH-1")
    assert candidates[0]["readings"]["temperature"]["entity"].startswith("sensor.bedroom_")
    quick = data[-1]["quick"]
    assert quick["default"] == ["scene.evening", "all_off"] and quick["source"] == "inputs"
    assert quick["candidates"]["areas"] == [{"id": "area:bedroom"}]
    assert quick["candidates"]["scenes"] == [{"id": "scene.evening", "name": "Evening", "area": "living_room"}]
    assert [" ".join(l) for l in lines if l[0] == "quick"] == ["quick scene.evening (inputs)", "quick all_off (inputs)"]
