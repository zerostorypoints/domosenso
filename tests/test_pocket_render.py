"""pocket: the phone dashboard, one panel view with the pocket-app card configured from the home inputs."""
import copy
from pathlib import Path

import pytest
import yaml

from catalog_check import check_component, check_translations
from domosenso_render import RenderError, render_component

ROOT = Path(__file__).resolve().parent.parent
COMPONENT = ROOT / "components/pocket"
INPUTS = yaml.safe_load((ROOT / "examples/demo-home/inputs/pocket.yaml").read_text(encoding="utf-8")) or {}
HOME = yaml.safe_load((ROOT / "examples/demo-home/home.inputs.yaml").read_text(encoding="utf-8"))


def _dashboard(tmp_path, home=HOME, lang="en", inputs=INPUTS) -> dict:
    render_component(COMPONENT, inputs, tmp_path, [lang], home=home)
    return yaml.safe_load((tmp_path / f"dashboard.{lang}.yaml").read_text(encoding="utf-8"))


def _card(dashboard: dict) -> dict:
    (view,) = dashboard["views"]
    (card,) = view["cards"]
    return card


def test_one_panel_view_with_the_app_card(tmp_path):
    dashboard = _dashboard(tmp_path)
    assert dashboard["title"] == "Home"
    (view,) = dashboard["views"]
    assert view["panel"] is True and view["path"] == "home"
    card = _card(dashboard)
    assert card["type"] == "custom:pocket-app"
    assert card["lang"] == "en"


def test_rooms_follow_the_home_in_order(tmp_path):
    card = _card(_dashboard(tmp_path))
    assert [r["id"] for r in card["rooms"]] == [r["id"] for r in HOME["rooms"]]
    living = card["rooms"][0]
    source = HOME["rooms"][0]
    for key in ("lights", "scenes", "climate", "air", "media"):
        assert living[key] == source[key], key
    office = card["rooms"][2]
    assert office == {"id": "office", "name": "Office", "lights": "light.office"}


def test_outside_and_weather(tmp_path):
    card = _card(_dashboard(tmp_path))
    assert card["outside"] == HOME["outside"]
    assert card["weather"] == HOME["weather"]
    home = {"rooms": [{"id": "den", "name": "Den"}]}
    card = _card(_dashboard(tmp_path / "bare", home))
    assert "outside" not in card and "weather" not in card


def test_room_names_per_language(tmp_path):
    home = copy.deepcopy(HOME)
    home["rooms"][1]["name"] = {"en": "Bedroom", "pl": "Pokoj sypialny", "de": "Schlafraum"}
    assert _card(_dashboard(tmp_path / "en", home))["rooms"][1]["name"] == "Bedroom"
    pl = _card(_dashboard(tmp_path / "pl", home, "pl"))
    assert pl["lang"] == "pl" and pl["rooms"][1]["name"] == "Pokoj sypialny"
    assert _card(_dashboard(tmp_path / "de", home, "de"))["rooms"][1]["name"] == "Schlafraum"


def test_thresholds_name_the_climate_air_helpers(tmp_path):
    thresholds = _card(_dashboard(tmp_path))["thresholds"]
    for room in ("living_room", "bedroom"):
        assert thresholds["rooms"][room] == {
            key: f"input_number.climate_air_{room}_{key}"
            for key in ("temp_low", "temp_high", "humidity_low", "humidity_high")
        }
    assert "office" not in thresholds["rooms"]
    assert thresholds["air"] == {
        reading: {"fair": f"input_number.climate_air_{reading}_fair", "poor": f"input_number.climate_air_{reading}_poor"}
        for reading in ("score", "co2")
    }


def test_no_humidity_no_humidity_thresholds(tmp_path):
    home = {"rooms": [{"id": "den", "name": "Den", "climate": {"temperature": "sensor.den_temperature"}}]}
    thresholds = _card(_dashboard(tmp_path, home))["thresholds"]
    assert thresholds == {"rooms": {"den": {"temp_low": "input_number.climate_air_den_temp_low",
                                            "temp_high": "input_number.climate_air_den_temp_high"}},
                          "air": {}}


def test_title_from_the_inputs(tmp_path):
    dashboard = _dashboard(tmp_path, inputs={"title": "Flat"})
    assert dashboard["title"] == "Flat"


def test_render_without_home_inputs_fails(tmp_path):
    with pytest.raises(RenderError, match="pocket: uses_home is true but no home inputs were given"):
        render_component(COMPONENT, INPUTS, tmp_path, ["en"])


def test_component_check_passes():
    assert check_component(COMPONENT / "component.yaml") == []
    errors, warnings = check_translations(COMPONENT)
    assert errors == [] and warnings == []


def test_ids_that_are_yaml_booleans_stay_strings(tmp_path):
    home = {"rooms": [{"id": "on", "name": "On", "climate": {"temperature": "sensor.on_temperature"}}],
            "weather": "no"}
    card = _card(_dashboard(tmp_path, home))
    assert card["rooms"][0]["id"] == "on"
    assert card["weather"] == "no"
    assert "on" in card["thresholds"]["rooms"]
