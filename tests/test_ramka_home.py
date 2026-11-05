"""P3: the Ramka on the shared home model (templates/_home.jinja). An input the Ramka's own file gives
wins unchanged; without it, lights, climate, outside, air, weather, covers and status contacts/locks
come from the home inputs."""
import copy
from pathlib import Path

import yaml

import domosenso_render as dr

REPO = Path(__file__).resolve().parent.parent
COMP = REPO / "components" / "ramka"
DEMO = REPO / "examples" / "demo-home"
MOVED = ("lights", "climate", "outside", "air", "weather", "covers")


def _inputs() -> dict:
    return yaml.safe_load((DEMO / "inputs/ramka.yaml").read_text(encoding="utf-8"))


def _home() -> dict:
    return yaml.safe_load((DEMO / "home.inputs.yaml").read_text(encoding="utf-8"))


def _texts(out: Path, inputs: dict, **kw) -> dict[str, str]:
    dr.render_component(COMP, inputs, out, ["en"], **kw)
    return {p.name: p.read_text(encoding="utf-8") for p in sorted(out.glob("*.yaml"))}


def test_the_ramkas_own_inputs_win_unchanged(tmp_path):
    """The demo's Ramka lists everything itself: the home inputs change nothing it renders."""
    alone = _texts(tmp_path / "alone", _inputs())
    with_home = _texts(tmp_path / "home", _inputs(), home=_home())
    assert alone.keys() == with_home.keys()
    for name in alone:
        assert alone[name] == with_home[name], name


def test_without_its_own_lists_the_ramka_takes_the_homes_rooms(tmp_path):
    inputs = _inputs()
    for key in MOVED:
        inputs.pop(key, None)
    inputs.pop("status", None)
    home = _home()
    home["rooms"][0]["covers"] = [{"entity": "cover.awning_living_room", "name": "Terrace awning"}]
    home["rooms"][0]["contacts"] = [{"entity": "binary_sensor.terrace_door", "name": "Terrace door"}]
    texts = _texts(tmp_path / "out", inputs, home=home)
    everything = "\n".join(texts.values())
    living, bedroom, office = home["rooms"]
    assert living["lights"] in everything and office["lights"] in everything
    for room in (living, bedroom):
        assert room["climate"]["temperature"] in everything
        assert room["climate"]["humidity"] in everything
    assert home["outside"]["temperature"] in everything
    assert home["weather"] in everything
    assert living["air"]["co2"] in everything, "the first room with air is the Air page's"
    assert "cover.awning_living_room" in everything and "Terrace awning" in everything
    assert "binary_sensor.terrace_door" in everything and "Terrace door" in everything
    # The room's name labels its lights and its climate widget.
    assert "Living room" in everything and "Bedroom" in everything


def test_one_input_of_its_own_and_the_rest_from_the_home(tmp_path):
    inputs = _inputs()
    for key in ("lights", "outside", "air", "weather", "covers"):
        inputs.pop(key, None)
    own_climate = copy.deepcopy(inputs["climate"])
    texts = _texts(tmp_path / "out", inputs, home=_home())
    everything = "\n".join(texts.values())
    for row in own_climate:
        assert row["temperature"] in everything, "the Ramka's own climate list stays"
    assert _home()["weather"] in everything


# P3.3: `thresholds: climate-air` points the wall at climate-air's helpers.
def test_shared_thresholds_point_the_wall_at_climate_air(tmp_path):
    inputs = {**_inputs(), "thresholds": "climate-air"}
    texts = _texts(tmp_path / "out", inputs, home=_home())
    dashboard, settings, package = texts["dashboard.en.yaml"], texts["ramka-settings.en.yaml"], texts["package.yaml"]
    for reading in ("score", "co2", "pm2_5"):
        assert f"input_number.climate_air_{reading}_fair" in dashboard
        assert f"input_number.climate_air_{reading}_poor" in dashboard
    assert "input_number.ramka_air_co2_raised" not in dashboard, "the cards read climate-air's limits"
    assert "input_number.climate_air_co2_fair" in settings, "the settings page changes climate-air's limits"
    # The comfort map, keyed by each home room's temperature sensor.
    board = yaml.safe_load(dashboard)
    found = []
    def walk(node):
        if isinstance(node, dict):
            if "comfort" in node:
                found.append(node["comfort"])
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(board)
    assert found and found[0]["sensor.living_room_temperature"] == {
        "temp_low": "input_number.climate_air_living_room_temp_low", "temp_high": "input_number.climate_air_living_room_temp_high",
        "hum_low": "input_number.climate_air_living_room_humidity_low", "hum_high": "input_number.climate_air_living_room_humidity_high"}
    # The Ramka's own helpers stay for one release and follow climate-air's.
    assert "input_number.ramka_air_co2_raised" in package or "ramka_air_co2_raised:" in package
    automations = yaml.safe_load(package)["automation"]
    (follow,) = [a for a in automations if a["id"] == "ramka_air_limits_follow_climate_air"]
    assert "input_number.climate_air_co2_fair" in follow["trigger"][1]["entity_id"]


def test_own_thresholds_are_the_default(tmp_path):
    texts = _texts(tmp_path / "out", _inputs(), home=_home())
    assert "climate_air_" not in texts["dashboard.en.yaml"]
    assert "follow_climate_air" not in texts["package.yaml"]
