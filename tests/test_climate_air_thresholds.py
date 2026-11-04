"""climate-air: comfort and air limit helpers per room from the home inputs, seeded once."""
from pathlib import Path

import yaml

from domosenso_render import render_component

ROOT = Path(__file__).resolve().parent.parent
COMPONENT = ROOT / "components/climate-air"
INPUTS = yaml.safe_load((ROOT / "examples/demo-home/inputs/climate-air.yaml").read_text(encoding="utf-8"))
HOME = yaml.safe_load((ROOT / "examples/demo-home/home.inputs.yaml").read_text(encoding="utf-8"))


def _render(tmp_path, home):
    render_component(COMPONENT, INPUTS, tmp_path, ["en"], home=home)
    return (tmp_path / "package.yaml").read_text(encoding="utf-8")


def _package(tmp_path, home=HOME) -> dict:
    return yaml.safe_load(_render(tmp_path, home))


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


def test_humidity_helpers_only_with_a_humidity_sensor(tmp_path):
    home = {"rooms": [{"id": "den", "name": "Den", "climate": {"temperature": "sensor.den_t"}}]}
    numbers = _package(tmp_path, home)["input_number"]
    assert "climate_air_den_temp_low" in numbers and "climate_air_den_humidity_low" not in numbers
    assert not [k for k in numbers if "score" in k or "co2" in k]


def _seed(tmp_path) -> dict:
    package = _package(tmp_path)
    seed = [a for a in package["automation"] if a["id"] == "climate_air_thresholds_seed"]
    assert len(seed) == 1
    return seed[0]


def test_seed_automation_covers_every_room_and_air(tmp_path):
    seed = _seed(tmp_path)
    platforms = [t.get("trigger") for t in seed["triggers"]]
    assert "homeassistant" in platforms
    text = yaml.safe_dump(seed)
    for room in ("living_room", "bedroom", "air"):
        assert room in text
    assert "office" not in text
    package = _package(tmp_path)
    assert package["input_text"]["climate_air_seeded"]["max"] == 255
    assert "climate_air_thresholds_reset" in package["script"]


def test_seed_uses_the_defaults(tmp_path):
    text = yaml.safe_dump(_seed(tmp_path))
    flat = " ".join(text.split())
    assert "climate_air_living_room_temp_low" in flat
    # the defaults are the number-set payloads: 20/24 comfort, 800/1200 co2, 80/60 score
    package = _package(tmp_path)
    reset = yaml.safe_dump(package["script"]["climate_air_thresholds_reset"])
    for expected in ("20", "24", "800", "1200", "80", "60"):
        assert expected in reset
    assert "input_number.climate_air_co2_fair" in reset
