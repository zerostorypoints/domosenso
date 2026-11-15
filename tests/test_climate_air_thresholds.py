"""climate-air: comfort and air limit helpers per room from the home inputs, seeded once."""
from pathlib import Path

import pytest
import yaml

from domosenso_render import RenderError, render_component

ROOT = Path(__file__).resolve().parent.parent
COMPONENT = ROOT / "components/climate-air"
INPUTS = yaml.safe_load((ROOT / "examples/demo-home/inputs/climate-air.yaml").read_text(encoding="utf-8"))
HOME = yaml.safe_load((ROOT / "examples/demo-home/home.inputs.yaml").read_text(encoding="utf-8"))


def _render(tmp_path, home, inputs=INPUTS):
    render_component(COMPONENT, inputs, tmp_path, ["en"], home=home)
    return (tmp_path / "package.yaml").read_text(encoding="utf-8")


def _package(tmp_path, home=HOME, inputs=INPUTS) -> dict:
    return yaml.safe_load(_render(tmp_path, home, inputs))


def test_without_home_the_package_is_unchanged(tmp_path):
    expected = (ROOT / "tests/fixtures/climate-air-package-before.yaml").read_text(encoding="utf-8")
    assert _render(tmp_path, None) == expected


def test_comfort_helpers_per_climate_room(tmp_path):
    numbers = _package(tmp_path)["input_number"]
    for room in ("living_room", "bedroom"):
        for key in ("temp_low", "temp_high", "humidity_low", "humidity_high"):
            assert f"climate_air_{room}_{key}" in numbers
    assert not [k for k in numbers if k.startswith("climate_air_office_")]


def test_helper_ranges_and_no_initial(tmp_path):
    numbers = _package(tmp_path)["input_number"]
    for key, helper in numbers.items():
        assert "initial" not in helper, key
    temp = numbers["climate_air_living_room_temp_low"]
    assert (temp["min"], temp["max"], temp["step"]) == (10, 30, 0.5)
    humidity = numbers["climate_air_bedroom_humidity_high"]
    assert (humidity["min"], humidity["max"], humidity["step"]) == (20, 80, 1)


def test_air_limit_helpers_only_for_present_readings(tmp_path):
    numbers = _package(tmp_path)["input_number"]
    for reading in ("score", "co2"):
        assert f"climate_air_{reading}_fair" in numbers and f"climate_air_{reading}_poor" in numbers
    assert not [k for k in numbers if "pm2_5" in k or "voc" in k or "nox" in k]


def test_a_co2_only_room_gets_only_co2_limits(tmp_path):
    # An M5Stack Unit CO2L gives a room CO2 and nothing else (0.3.1 recommends it).
    home = {"rooms": [{"id": "bedroom", "name": "Bedroom", "air": {"co2": "sensor.bedroom_node_co2"}}]}
    numbers = _package(tmp_path, home)["input_number"]
    assert {"climate_air_co2_fair", "climate_air_co2_poor"} <= set(numbers)
    assert not [k for k in numbers if "score" in k or "pm2_5" in k or "voc" in k or "nox" in k]
    assert set(_groups(_seed(tmp_path, home))) == {"air.co2"}


def test_humidity_helpers_only_with_a_humidity_sensor(tmp_path):
    home = {"rooms": [{"id": "den", "name": "Den", "climate": {"temperature": "sensor.den_t"}}]}
    numbers = _package(tmp_path, home)["input_number"]
    assert "climate_air_den_temp_low" in numbers and "climate_air_den_humidity_low" not in numbers
    assert not [k for k in numbers if "score" in k or "co2" in k]


def _seed(tmp_path, home=HOME, inputs=INPUTS) -> dict:
    package = _package(tmp_path, home, inputs)
    seed = [a for a in package["automation"] if a["id"] == "climate_air_thresholds_seed"]
    assert len(seed) == 1
    return seed[0]


def _groups(seed) -> dict:
    """token -> {helper: value} from the seed's `if` actions; the token is read from the condition."""
    groups = {}
    for action in seed["actions"]:
        if "if" not in action:
            continue
        condition = action["if"][0]["value_template"]
        assert "not in done" in condition
        groups[condition.split("'")[1]] = {
            a["target"]["entity_id"].removeprefix("input_number.climate_air_"): a["data"]["value"]
            for a in action["then"]
        }
    return groups


def test_seed_triggers(tmp_path):
    seed = _seed(tmp_path)
    assert {"trigger": "homeassistant", "event": "start"} in seed["triggers"]
    assert {"trigger": "event", "event_type": "automation_reloaded"} in seed["triggers"]


def test_seed_groups_and_defaults(tmp_path):
    assert _groups(_seed(tmp_path)) == {
        "living_room": {"living_room_temp_low": 20, "living_room_temp_high": 24},
        "living_room.humidity": {"living_room_humidity_low": 40, "living_room_humidity_high": 60},
        "bedroom": {"bedroom_temp_low": 20, "bedroom_temp_high": 24},
        "bedroom.humidity": {"bedroom_humidity_low": 40, "bedroom_humidity_high": 60},
        "outside": {"outside_temp_low": 20, "outside_temp_high": 24},
        "outside.humidity": {"outside_humidity_low": 40, "outside_humidity_high": 60},
        "air.score": {"score_fair": 80, "score_poor": 60},
        "air.co2": {"co2_fair": 800, "co2_poor": 1200},
    }


def test_reset_script_sets_every_helper(tmp_path):
    package = _package(tmp_path)
    steps = package["script"]["climate_air_thresholds_reset"]["sequence"]
    reset = {s["target"]["entity_id"]: s["data"]["value"] for s in steps}
    assert set(reset) == {f"input_number.{k}" for k in package["input_number"]}
    assert reset["input_number.climate_air_co2_poor"] == 1200


def test_seeded_list_is_input_text_with_max_255(tmp_path):
    assert _package(tmp_path)["input_text"]["climate_air_seeded"]["max"] == 255


def test_a_room_gaining_humidity_is_a_group_of_its_own(tmp_path):
    # A list stored before the sensor existed holds "den" only; "den.humidity" is the group not in it.
    home = {"rooms": [{"id": "den", "name": "Den", "climate": {"temperature": "sensor.t", "humidity": "sensor.h"}}]}
    groups = _groups(_seed(tmp_path, home))
    assert set(groups) == {"den", "den.humidity"}
    assert set(groups["den.humidity"]) == {"den_humidity_low", "den_humidity_high"}


def test_a_new_air_reading_is_a_group_of_its_own(tmp_path):
    home = {"rooms": [{"id": "den", "name": "Den", "air": {"co2": "sensor.c", "pm2_5": "sensor.p"}}]}
    assert set(_groups(_seed(tmp_path, home))) == {"air.co2", "air.pm2_5"}


def test_stored_list_is_pruned_to_known_tokens(tmp_path):
    seed = _seed(tmp_path)
    variables = seed["actions"][0]["variables"]
    assert "select('in', ids)" in variables["done"]
    assert "unknown" not in variables["done"]  # 'unknown' is not a token, so the filter drops it
    assert variables["ids"] == ["living_room", "living_room.humidity", "bedroom", "bedroom.humidity",
                                "outside", "outside.humidity", "air.score", "air.co2"]
    assert seed["actions"][-1]["data"]["value"].startswith("{{ (done + (ids | reject('in', done)")


def test_too_many_tokens_fail_the_render(tmp_path):
    rooms = [{"id": f"room_number_{n:02d}", "name": f"R{n}", "climate": {"temperature": "sensor.t", "humidity": "sensor.h"}} for n in range(10)]
    with pytest.raises(RenderError, match="255"):
        _render(tmp_path, {"rooms": rooms})


def test_partial_comfort_defaults_render(tmp_path):
    groups = _groups(_seed(tmp_path, HOME, {**INPUTS, "comfort_defaults": {"temp_low": 18}}))
    assert groups["living_room"] == {"living_room_temp_low": 18, "living_room_temp_high": 24}

def test_no_derived_entities(tmp_path):
    package = _package(tmp_path)
    for block in package["template"]:
        for e in block.get("binary_sensor", []) + block.get("sensor", []):
            assert not e.get("unique_id", "").startswith("climate_air_")


def test_room_with_neither_climate_nor_air_leaves_no_null_keys(tmp_path):
    home = {"rooms": [{"id": "hall", "name": "Hall", "lights": "light.hall"}]}
    render_component(COMPONENT, INPUTS, tmp_path, ["en"], home=home)
    package = yaml.safe_load((tmp_path / "package.yaml").read_text(encoding="utf-8"))
    assert not _null_paths(package)
    assert all(b for b in package["template"])
    assert not {"input_text", "automation", "script"} & set(package)


def _null_paths(value, path=""):
    """Every path in a nested value that holds None."""
    if value is None:
        return [path]
    items = value.items() if isinstance(value, dict) else enumerate(value) if isinstance(value, list) else []
    return [p for k, v in items for p in _null_paths(v, f"{path}/{k}")]




def test_room_name_with_colon_and_hash_renders_valid_yaml(tmp_path):
    name = "Loft: east # wing"
    home = {"rooms": [{"id": "loft", "name": name, "climate": {"temperature": "sensor.t", "humidity": "sensor.h"}}]}
    render_component(COMPONENT, INPUTS, tmp_path, ["en"], home=home)
    package = yaml.safe_load((tmp_path / "package.yaml").read_text(encoding="utf-8"))
    assert package["input_number"]["climate_air_loft_temp_low"]["name"] == name + " comfort temperature low"
    assert package["input_number"]["climate_air_loft_humidity_high"]["name"] == name + " comfort humidity high"




def test_comfort_defaults_outside_helper_range_fail(tmp_path):
    from domosenso_render import RenderError
    for key, value in (("temp_high", 35), ("temp_low", 5), ("humidity_low", 10), ("humidity_high", 90)):
        with pytest.raises(RenderError, match=f"{key}.*{value}"):
            render_component(COMPONENT, {**INPUTS, "comfort_defaults": {key: value}}, tmp_path, ["en"], home=HOME)




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
    ids += [f"input_text.{k}" for k in package["input_text"]]
    ids += [f"automation.{a['id']}" for a in package["automation"]]
    ids += [f"script.{k}" for k in package["script"]]
    assert ids
    assert not [i for i in ids if not matches(i)]


# The outside comfort range: helpers like a room's, wider ranges, seeded from the Ramka's widget range.

def test_outside_helpers_with_humidity(tmp_path):
    numbers = _package(tmp_path)["input_number"]
    temp = numbers["climate_air_outside_temp_low"]
    assert temp["name"] == "Outside comfort temperature low"
    assert (temp["min"], temp["max"], temp["step"], temp["unit_of_measurement"]) == (-40, 50, 0.5, "°C")
    assert "climate_air_outside_temp_high" in numbers
    humidity = numbers["climate_air_outside_humidity_high"]
    assert (humidity["min"], humidity["max"], humidity["step"]) == (0, 100, 1)
    assert "climate_air_outside_humidity_low" in numbers


def test_outside_without_humidity_has_the_temperature_pair_only(tmp_path):
    home = {"rooms": [{"id": "den", "name": "Den"}], "outside": {"temperature": "sensor.out_t"}}
    package = _package(tmp_path, home)
    assert {k for k in package["input_number"]} == {"climate_air_outside_temp_low", "climate_air_outside_temp_high"}
    assert set(_groups(_seed(tmp_path / "seed", home))) == {"outside"}


def test_no_outside_no_outside_helpers(tmp_path):
    home = {"rooms": [{"id": "den", "name": "Den", "climate": {"temperature": "sensor.t"}}], "weather": "weather.home"}
    numbers = _package(tmp_path, home)["input_number"]
    assert not [k for k in numbers if "outside" in k]


def test_outside_comfort_defaults_and_reset(tmp_path):
    inputs = {**INPUTS, "outside_comfort_defaults": {"temp_low": -5, "humidity_high": 90}}
    groups = _groups(_seed(tmp_path, HOME, inputs))
    assert groups["outside"] == {"outside_temp_low": -5, "outside_temp_high": 24}
    assert groups["outside.humidity"] == {"outside_humidity_low": 40, "outside_humidity_high": 90}
    steps = _package(tmp_path / "reset", HOME, inputs)["script"]["climate_air_thresholds_reset"]["sequence"]
    reset = {s["target"]["entity_id"]: s["data"]["value"] for s in steps}
    assert reset["input_number.climate_air_outside_temp_low"] == -5
    assert reset["input_number.climate_air_outside_humidity_high"] == 90


def test_outside_comfort_defaults_outside_helper_range_fail(tmp_path):
    for key, value in (("temp_low", -45), ("temp_high", 55), ("humidity_low", -1), ("humidity_high", 101)):
        with pytest.raises(RenderError, match=f"outside_comfort_defaults.{key}.*{value}"):
            render_component(COMPONENT, {**INPUTS, "outside_comfort_defaults": {key: value}}, tmp_path, ["en"], home=HOME)


def test_component_defaults_match_the_ramka_widget_range():
    import re
    manifest = yaml.safe_load((COMPONENT / "component.yaml").read_text(encoding="utf-8"))
    widgets = (ROOT / "components/ramka/cards/lib/climate-widgets.js").read_text(encoding="utf-8")
    ramka = dict(re.findall(r"(\w+): (\d+)", re.search(r"export const COMFORT = \{([^}]*)\}", widgets).group(1)))
    given = manifest["inputs"]["outside_comfort_defaults"]["default"]
    assert given == {"temp_low": int(ramka["temp_low"]), "temp_high": int(ramka["temp_high"]),
                     "humidity_low": int(ramka["hum_low"]), "humidity_high": int(ramka["hum_high"])}
