"""climate-air: the derived binary sensors per room, their HA templates run against fake states."""
from pathlib import Path

import jinja2
import pytest
import yaml

from domosenso_render import render_component

ROOT = Path(__file__).resolve().parent.parent
COMPONENT = ROOT / "components/climate-air"
INPUTS = yaml.safe_load((ROOT / "examples/demo-home/inputs/climate-air.yaml").read_text(encoding="utf-8"))
HOME = yaml.safe_load((ROOT / "examples/demo-home/home.inputs.yaml").read_text(encoding="utf-8"))

LIVING = "input_number.climate_air_living_room_"
TEMP = "sensor.living_room_temperature"
HUMIDITY = "sensor.living_room_humidity"
CO2 = "sensor.living_room_co2"
SCORE = "sensor.living_room_air_quality_score"


def _float(value, default=jinja2.utils.missing):
    """Home Assistant's `float`: without a default a non-number raises, with one it is the fallback."""
    try:
        return float(value)
    except (TypeError, ValueError):
        if default is jinja2.utils.missing:
            raise ValueError(f"float got a non-number: {value!r}") from None
        return default


def evaluate(template, states_by_id) -> str:
    """A Home Assistant template run with stub states; an entity not listed is `unavailable`."""
    env = jinja2.Environment()

    def states(entity_id):
        return states_by_id.get(entity_id, "unavailable")

    def is_number(value):
        try:
            float(value)
        except (TypeError, ValueError):
            return False
        return value not in ("nan", "inf", "-inf")

    env.filters["float"] = _float
    env.filters["is_number"] = is_number
    return env.from_string(template).render(states=states).strip()


@pytest.fixture(scope="module")
def derived(tmp_path_factory):
    out = tmp_path_factory.mktemp("derived")
    render_component(COMPONENT, INPUTS, out, ["en"], home=HOME)
    package = yaml.safe_load((out / "package.yaml").read_text(encoding="utf-8"))
    return {e["unique_id"]: e for block in package["template"] for e in block.get("binary_sensor", [])
            if e["unique_id"].startswith("climate_air_")}


def _states(**overrides):
    base = {TEMP: "22", HUMIDITY: "50", CO2: "600", SCORE: "90",
            LIVING + "temp_low": "20", LIVING + "temp_high": "24",
            LIVING + "humidity_low": "40", LIVING + "humidity_high": "60",
            "input_number.climate_air_co2_poor": "1200", "input_number.climate_air_score_poor": "60"}
    base.update(overrides)
    return base


def _on(derived, uid, states):
    sensor = derived[uid]
    assert evaluate(sensor["availability"], states) == "True", uid
    return evaluate(sensor["state"], states) == "True"


def test_too_hot_above_high(derived):
    assert _on(derived, "climate_air_living_room_too_hot", _states(**{TEMP: "24.5"}))
    assert not _on(derived, "climate_air_living_room_too_hot", _states(**{TEMP: "24.0"}))


def test_too_cold_below_low(derived):
    assert _on(derived, "climate_air_living_room_too_cold", _states(**{TEMP: "19.5"}))
    assert not _on(derived, "climate_air_living_room_too_cold", _states(**{TEMP: "20.0"}))


def test_inverted_range_is_never_both(derived):
    states = _states(**{TEMP: "23", LIVING + "temp_low": "25", LIVING + "temp_high": "22"})
    assert _on(derived, "climate_air_living_room_too_hot", states)
    assert not _on(derived, "climate_air_living_room_too_cold", states)


def test_humid_and_dry(derived):
    assert _on(derived, "climate_air_living_room_too_humid", _states(**{HUMIDITY: "61"}))
    assert not _on(derived, "climate_air_living_room_too_humid", _states(**{HUMIDITY: "60"}))
    assert _on(derived, "climate_air_living_room_too_dry", _states(**{HUMIDITY: "39"}))
    assert not _on(derived, "climate_air_living_room_too_dry", _states(**{HUMIDITY: "40"}))


def test_unavailable_reading_makes_sensor_unavailable(derived):
    for uid in ("too_hot", "too_cold"):
        sensor = derived[f"climate_air_living_room_{uid}"]
        assert evaluate(sensor["availability"], _states(**{TEMP: "unavailable"})) == "False"
        assert evaluate(sensor["availability"], _states(**{LIVING + "temp_high": "unknown"})) == "False"


def test_air_poor_for_co2_and_score(derived):
    uid = "climate_air_living_room_air_poor"
    assert _on(derived, uid, _states(**{CO2: "1200"}))
    assert not _on(derived, uid, _states(**{CO2: "1199"}))
    assert _on(derived, uid, _states(**{SCORE: "59"}))
    assert not _on(derived, uid, _states(**{SCORE: "60"}))


def test_air_poor_survives_one_offline_reading(derived):
    sensor = derived["climate_air_living_room_air_poor"]
    states = _states(**{CO2: "unavailable", SCORE: "59"})
    assert evaluate(sensor["availability"], states) == "True"
    assert evaluate(sensor["state"], states) == "True"
    states = _states(**{CO2: "unavailable", SCORE: "70"})
    assert evaluate(sensor["availability"], states) == "True"
    assert evaluate(sensor["state"], states) == "False"
    states = _states(**{CO2: "1500", SCORE: "unknown"})
    assert evaluate(sensor["availability"], states) == "True"
    assert evaluate(sensor["state"], states) == "True"


def test_air_poor_unavailable_when_no_reading_is_a_number(derived):
    sensor = derived["climate_air_living_room_air_poor"]
    assert evaluate(sensor["availability"], _states(**{CO2: "unavailable", SCORE: "unknown"})) == "False"
    assert evaluate(sensor["availability"], _states(**{"input_number.climate_air_co2_poor": "unknown",
                                                         "input_number.climate_air_score_poor": "unknown"})) == "False"


def test_strict_float_raises_so_the_guard_is_proven():
    with pytest.raises(ValueError):
        evaluate("{{ states('x') | float }}", {})


def test_no_humidity_means_no_humid_or_dry(derived):
    assert "climate_air_bedroom_too_hot" in derived
    ids = [u for u in derived if u.startswith("climate_air_")]
    assert not [u for u in ids if u.startswith("climate_air_den_")]
    home = {"rooms": [{"id": "den", "name": "Den", "climate": {"temperature": "sensor.den_t"}}]}
    assert {"too_humid", "too_dry"}.isdisjoint(_rendered_suffixes(home))


def _rendered_suffixes(home):
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        render_component(COMPONENT, INPUTS, Path(tmp), ["en"], home=home)
        package = yaml.safe_load((Path(tmp) / "package.yaml").read_text(encoding="utf-8"))
    return {e["unique_id"].removeprefix("climate_air_den_") for b in package["template"]
            for e in b.get("binary_sensor", []) if e["unique_id"].startswith("climate_air_den_")}


def test_room_with_neither_climate_nor_air_leaves_no_null_keys(tmp_path):
    home = {"rooms": [{"id": "hall", "name": "Hall", "lights": "light.hall"}]}
    render_component(COMPONENT, INPUTS, tmp_path, ["en"], home=home)
    package = yaml.safe_load((tmp_path / "package.yaml").read_text(encoding="utf-8"))
    assert not [k for k, v in package.items() if v is None]
    assert all(b for b in package["template"])


def test_air_poor_ignores_missing_readings(tmp_path):
    home = {"rooms": [{"id": "den", "name": "Den", "air": {"co2": "sensor.den_co2"}}]}
    render_component(COMPONENT, INPUTS, tmp_path, ["en"], home=home)
    package = yaml.safe_load((tmp_path / "package.yaml").read_text(encoding="utf-8"))
    found = {e["unique_id"]: e for b in package["template"] for e in b.get("binary_sensor", [])}
    sensor = found["climate_air_den_air_poor"]
    assert "score" not in sensor["state"] and "score" not in sensor["availability"]
    states = {"sensor.den_co2": "1300", "input_number.climate_air_co2_poor": "1200"}
    assert evaluate(sensor["availability"], states) == "True"
    assert evaluate(sensor["state"], states) == "True"
    assert not [u for u in found if u.startswith("climate_air_den_too_")]


def test_ids_classes_and_attributes(derived):
    expected = {"too_hot": "heat", "too_cold": "cold", "too_humid": "moisture", "too_dry": None,
                "air_poor": "problem"}
    for suffix, device_class in expected.items():
        sensor = derived[f"climate_air_living_room_{suffix}"]
        assert sensor["default_entity_id"] == f"binary_sensor.living_room_{suffix}"
        assert sensor.get("device_class") == device_class
        assert sensor["name"] == "Living room " + suffix.replace("_", " ")
    assert "climate_air_bedroom_too_hot" in derived and "climate_air_bedroom_air_poor" not in derived
    assert "climate_air_office_too_hot" not in derived


def test_every_derived_entity_has_component_attribute(derived):
    assert derived
    for uid, sensor in derived.items():
        room = uid.removeprefix("climate_air_").rsplit("_too_", 1)[0].rsplit("_air_poor", 1)[0]
        assert sensor["attributes"] == {"component": "climate-air", "room": room}


@pytest.fixture(scope="module")
def attention(tmp_path_factory):
    out = tmp_path_factory.mktemp("attention")
    render_component(COMPONENT, INPUTS, out, ["en"], home=HOME)
    package = yaml.safe_load((out / "package.yaml").read_text(encoding="utf-8"))
    return {e["unique_id"]: e for b in package["template"] for e in b.get("sensor", [])}["climate_air_attention"]


def _attention(sensor, on):
    import json
    states = {f"binary_sensor.{r}": "on" for r in on}
    env = jinja2.Environment()
    env.filters["states"] = lambda eid: states.get(eid, "unavailable")
    count = env.from_string(sensor["state"]).render().strip()
    rooms = env.from_string(sensor["attributes"]["rooms"]).render().strip()
    return int(count), json.loads(rooms)


def test_attention_counts_rooms_once(attention):
    on = ["living_room_too_hot", "living_room_air_poor", "bedroom_too_cold"]
    assert _attention(attention, on) == (2, ["living_room", "bedroom"])


def test_attention_zero_when_all_off(attention):
    assert _attention(attention, []) == (0, [])


def test_attention_identity(attention):
    assert attention["default_entity_id"] == "sensor.climate_attention"
    assert attention["name"] == "Climate attention"
    assert attention["attributes"]["component"] == "climate-air"


def test_attention_absent_without_derived_sensors(tmp_path):
    home = {"rooms": [{"id": "hall", "name": "Hall", "lights": "light.hall"}]}
    render_component(COMPONENT, INPUTS, tmp_path, ["en"], home=home)
    package = yaml.safe_load((tmp_path / "package.yaml").read_text(encoding="utf-8"))
    assert "climate_air_attention" not in {e["unique_id"] for b in package["template"] for e in b.get("sensor", [])
                                          if "unique_id" in e}


def test_manifest_provides_every_rendered_entity(tmp_path):
    import re
    render_component(COMPONENT, INPUTS, tmp_path, ["en"], home=HOME)
    package = yaml.safe_load((tmp_path / "package.yaml").read_text(encoding="utf-8"))
    manifest = yaml.safe_load((COMPONENT / "component.yaml").read_text(encoding="utf-8"))
    patterns = [e["id"] for e in manifest["provides"]["entities"]]

    def matches(entity_id):
        for pattern in patterns:
            body = re.escape(pattern)
            body = re.sub(r"\\\{([^}]*)\\\}", lambda m: "(?:" + m.group(1).replace(",", "|") + ")", body)
            body = re.sub(r"<\w+>", "[a-z0-9_]+", body)
            if re.fullmatch(body, entity_id):
                return True
        return False

    rendered = [k for k in package["input_number"]]
    ids = [f"input_number.{k}" for k in rendered if k.startswith("climate_air_")]
    ids += [f"script.{k}" for k in package["script"]]
    for block in package["template"]:
        for e in block.get("binary_sensor", []) + block.get("sensor", []):
            if e.get("unique_id", "").startswith("climate_air_"):
                ids.append(e["default_entity_id"])
    assert ids
    assert not [i for i in ids if not matches(i)]
