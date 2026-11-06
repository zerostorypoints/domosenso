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
    assert office == {"id": "office", "name": "Office", "area": "office", "lights": "light.office"}


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
    assert "outside" not in thresholds


def test_title_from_the_inputs(tmp_path):
    dashboard = _dashboard(tmp_path, inputs={"title": "Flat"})
    assert dashboard["title"] == "Flat"


def test_render_without_home_inputs_gives_no_defaults(tmp_path):
    # uses_home: optional (SPEC-038): the card takes the areas from Home Assistant; no defaults.
    written = render_component(COMPONENT, INPUTS, tmp_path, ["en"])
    dashboard = next(p for p in written if p.name == "dashboard.en.yaml")
    card = yaml.safe_load(dashboard.read_text(encoding="utf-8"))["views"][0]["cards"][0]
    assert card["rooms"] == []
    assert "outside" not in card and "weather" not in card


def test_a_rooms_type_passes_to_the_card(tmp_path):
    home = copy.deepcopy(HOME)
    home["rooms"][0]["type"] = "inside"
    card = _card(_dashboard(tmp_path, home))
    assert card["rooms"][0]["type"] == "inside"
    assert "type" not in card["rooms"][1]


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


def test_room_area_defaults_to_its_id(tmp_path):
    home = copy.deepcopy(HOME)
    home["rooms"][1]["area"] = "master_bedroom"
    rooms = _card(_dashboard(tmp_path, home))["rooms"]
    assert [r["area"] for r in rooms] == ["living_room", "master_bedroom", "office"]


def test_outside_area_passes_through(tmp_path):
    home = copy.deepcopy(HOME)
    home["outside"]["area"] = "garden"
    assert _card(_dashboard(tmp_path, home))["outside"]["area"] == "garden"


def test_thresholds_outside_name_the_climate_air_helpers(tmp_path):
    thresholds = _card(_dashboard(tmp_path))["thresholds"]
    assert thresholds["outside"] == {
        key: f"input_number.climate_air_outside_{key}"
        for key in ("temp_low", "temp_high", "humidity_low", "humidity_high")
    }
    home = {"rooms": [{"id": "den", "name": "Den"}], "outside": {"temperature": "sensor.out_t"}}
    assert _card(_dashboard(tmp_path / "dry", home))["thresholds"]["outside"] == {
        "temp_low": "input_number.climate_air_outside_temp_low",
        "temp_high": "input_number.climate_air_outside_temp_high",
    }


def test_floorplan_only_with_the_input(tmp_path):
    assert "floorplan" not in _card(_dashboard(tmp_path / "without"))
    card = _card(_dashboard(tmp_path / "with", inputs={**INPUTS, "floorplan": True}))
    assert card["floorplan"] is True


def test_consumes_the_floorplan_card_as_an_element():
    manifest = yaml.safe_load((COMPONENT / "component.yaml").read_text(encoding="utf-8"))
    assert {"component": "floorplan", "element": "floorplan-card"} in manifest["consumes"]
    assert manifest["inputs"]["floorplan"]["default"] is False


def test_sound_only_with_the_input(tmp_path):
    assert "sound" not in _card(_dashboard(tmp_path / "without"))
    card = _card(_dashboard(tmp_path / "with", inputs={**INPUTS, "sound": True}))
    assert card["sound"] == {"level": "sensor.music_level", "offset": "sensor.music_spl_offset"}
    averages = {"leq_1_min": "sensor.a_leq_1_min", "leq_1_h": "sensor.a_leq_1_h"}
    card = _card(_dashboard(tmp_path / "avg", inputs={**INPUTS, "sound": True, "sound_averages": averages}))
    assert card["sound"]["averages"] == averages
    # The averages are read only with `sound`.
    card = _card(_dashboard(tmp_path / "off", inputs={**INPUTS, "sound_averages": averages}))
    assert "sound" not in card


def test_sound_averages_unknown_key_fails(tmp_path):
    with pytest.raises(RenderError, match="sound_averages: unknown key leq_5_min"):
        _dashboard(tmp_path, inputs={**INPUTS, "sound": True, "sound_averages": {"leq_5_min": "sensor.x"}})


def test_consumes_the_room_meter_card_and_the_music_aliases():
    manifest = yaml.safe_load((COMPONENT / "component.yaml").read_text(encoding="utf-8"))
    for item in ({"component": "audio-sensor", "element": "room-meter-card"},
                 {"component": "audio-sensor", "id": "sensor.music_level"},
                 {"component": "audio-sensor", "id": "sensor.music_spl_offset"}):
        assert item in manifest["consumes"], item
    assert manifest["inputs"]["sound"]["default"] is False
    audio = yaml.safe_load((ROOT / "components/audio-sensor/component.yaml").read_text(encoding="utf-8"))
    assert "cards/room-meter-card.js" in audio["artifacts"]["dashboard_cards"]
    provided = {e["id"] for e in audio["provides"]["entities"]}
    assert {"sensor.music_level", "sensor.music_spl_offset"} <= provided


def test_plants_flag_only_with_the_input(tmp_path):
    assert _card(_dashboard(tmp_path / "with"))["plants"] is True, "the demo home has the plants component"
    card = _card(_dashboard(tmp_path / "without", inputs={**INPUTS, "plants": False}))
    assert "plants" not in card
    manifest = yaml.safe_load((COMPONENT / "component.yaml").read_text(encoding="utf-8"))
    assert manifest["inputs"]["plants"]["default"] is False
    assert {"component": "plants", "id": "plant.<plant>"} in manifest["consumes"]


def test_listed_covers_contacts_locks_pass_with_names_in_the_language(tmp_path):
    home = copy.deepcopy(HOME)
    home["rooms"][0]["covers"] = ["cover.living_room_blind",
                                  {"entity": "cover.awning_living_room", "name": {"en": "Awning", "de": "Markise"}}]
    home["rooms"][0]["locks"] = [{"entity": "lock.front_door", "name": "Front door"}]
    card = _card(_dashboard(tmp_path / "de", home, lang="de"))
    living = card["rooms"][0]
    assert living["covers"] == ["cover.living_room_blind", {"entity": "cover.awning_living_room", "name": "Markise"}]
    assert living["locks"] == [{"entity": "lock.front_door", "name": "Front door"}]
    assert "contacts" not in living
    assert "covers" not in card["rooms"][1]


def test_a_room_with_several_lights_passes_them_as_a_list(tmp_path):
    home = copy.deepcopy(HOME)
    home["rooms"][0]["lights"] = ["light.ceiling", "light.reading_lamp"]
    card = _card(_dashboard(tmp_path, home))
    assert card["rooms"][0]["lights"] == ["light.ceiling", "light.reading_lamp"]


def test_quick_actions_pass_as_the_homes_default(tmp_path):
    # SPEC-038 §3.11: the home's default Quick actions; a person's own list in Settings wins.
    inputs = {**INPUTS, "quick_actions": ["area:living_room", "scene.all_lights_off", "all_off"]}
    assert _card(_dashboard(tmp_path, inputs=inputs))["quick"] == ["area:living_room", "scene.all_lights_off", "all_off"]
    assert "quick" not in _card(_dashboard(tmp_path / "none"))
