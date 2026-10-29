"""The audio-sensor component's Home Assistant package, rendered for the demo home (SPEC-018)."""
import copy
from pathlib import Path

import pytest
import yaml

import domosenso_render as dr

REPO = Path(__file__).resolve().parent.parent
COMP = REPO / "components" / "audio-sensor"
DEMO_INPUTS = REPO / "examples" / "demo-home" / "inputs" / "audio-sensor.yaml"


def demo_inputs() -> dict:
    return yaml.safe_load(DEMO_INPUTS.read_text(encoding="utf-8"))


def render_text(tmp_path, inputs) -> str:
    out = tmp_path / "out"
    dr.render_component(COMP, inputs, out)
    return (out / "package.yaml").read_text(encoding="utf-8")


def render(tmp_path, inputs) -> dict:
    return yaml.safe_load(render_text(tmp_path, inputs))


def templates(package) -> dict:
    """Every template entity by unique_id."""
    found = {}
    for block in package.get("template", []):
        for kind in ("sensor", "binary_sensor"):
            for entity in block.get(kind, []):
                found[entity["unique_id"]] = entity
    return found


@pytest.fixture(scope="module")
def demo(tmp_path_factory):
    return render(tmp_path_factory.mktemp("demo"), demo_inputs())


def test_render_aliases_follow_music_sensor(demo):
    found = templates(demo)
    spectrum = found["audio_sensor_music_spectrum"]
    assert "states('sensor.living_room_audio_sensor_living_room_spectrum')" in spectrum["state"]
    assert spectrum["default_entity_id"] == "sensor.music_spectrum"
    level = found["audio_sensor_music_level"]
    assert "sensor.living_room_audio_sensor_living_room_sound_level" in level["state"]
    assert "input_number.living_room_spl_offset" in level["state"]
    assert level["default_entity_id"] == "sensor.music_level"
    assert level["unit_of_measurement"] == "dB"
    offset = found["audio_sensor_music_spl_offset"]
    assert "input_number.living_room_spl_offset" in offset["state"]
    online = found["audio_sensor_music_sensor_online"]
    assert online["default_entity_id"] == "binary_sensor.music_sensor_online"
    assert "sensor.living_room_audio_sensor_living_room_spectrum" in online["state"]
    assert "unavailable" in online["state"] and "unknown" in online["state"]
    assert "kids_room" not in str([spectrum, level, offset, online])


def test_aliases_follow_a_different_music_board(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][0]["music"] = False
    inputs["sensors"][1]["music"] = True
    found = templates(render(tmp_path, inputs))
    assert "sensor.kids_room_audio_sensor_kids_room_spectrum" in found["audio_sensor_music_spectrum"]["state"]
    assert "input_number.kids_room_spl_offset" in found["audio_sensor_music_level"]["state"]


def test_entities_input_overrides_the_guessed_ids(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][0]["entities"] = {"spectrum": "sensor.lounge_mic_spectrum", "level": "sensor.lounge_mic_level"}
    package = render(tmp_path, inputs)
    found = templates(package)
    assert "sensor.lounge_mic_spectrum" in found["audio_sensor_music_spectrum"]["state"]
    assert "sensor.lounge_mic_level" in found["audio_sensor_music_level"]["state"]
    assert "sensor.lounge_mic_spectrum" in package["recorder"]["exclude"]["entities"]


def test_two_music_sensors_fail(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][1]["music"] = True
    with pytest.raises(dr.RenderError, match=r"two music sensors: living-room, kids-room"):
        render_text(tmp_path, inputs)


def test_no_music_sensor_no_aliases(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][0]["music"] = False
    package = render(tmp_path, inputs)
    assert templates(package).keys() == {"audio_sensor_living_room_spl_offset", "audio_sensor_kids_room_spl_offset"}
    assert "sensor.music_spectrum" not in package["recorder"]["exclude"]["entities"]
    assert "input_number" in package


def test_offset_helper_has_no_initial(demo):
    helpers = demo["input_number"]
    assert set(helpers) == {"living_room_spl_offset", "kids_room_spl_offset"}
    for helper in helpers.values():
        assert "initial" not in helper
        assert (helper["min"], helper["max"], helper["step"]) == (0, 140, 0.1)
        assert helper["mode"] == "box"
        assert helper["unit_of_measurement"] == "dB"


def test_offset_sensor_per_board(demo):
    sensor = templates(demo)["audio_sensor_kids_room_spl_offset"]
    assert sensor["default_entity_id"] == "sensor.kids_room_spl_offset"
    assert "Kids' room" in sensor["name"]
    assert "input_number.kids_room_spl_offset" in sensor["state"]


def test_id_prefix_default_slugs_room(tmp_path):
    inputs = demo_inputs()
    package = render(tmp_path, inputs)
    assert "living_room_spl_offset" in package["input_number"]
    inputs["sensors"][0]["id_prefix"] = "lounge"
    package = render(tmp_path / "again", inputs)
    assert "lounge_spl_offset" in package["input_number"]
    assert "living_room_spl_offset" not in package["input_number"]


def test_kids_room_apostrophe_slugs_to_kids_room(demo):
    # The area "Kids' room" gives the guessed entity id its area slug.
    assert "sensor.kids_room_audio_sensor_kids_room_spectrum" in demo["recorder"]["exclude"]["entities"]


def test_recorder_excludes_every_spectrum_and_the_alias(demo):
    excluded = demo["recorder"]["exclude"]["entities"]
    assert sorted(excluded) == [
        "sensor.kids_room_audio_sensor_kids_room_spectrum",
        "sensor.living_room_audio_sensor_living_room_spectrum",
        "sensor.music_spectrum",
    ]


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda i: i["sensors"][1].update(room="living-room"), "duplicate room: living-room"),
        (lambda i: i["sensors"][1].update(id_prefix="living_room"), "duplicate id_prefix: living_room"),
        (lambda i: i["sensors"][0].update(entities={"volume": "sensor.x"}), "unknown entity key: volume"),
    ],
)
def test_input_validation_fails(tmp_path, mutate, message):
    inputs = copy.deepcopy(demo_inputs())
    mutate(inputs)
    with pytest.raises(dr.RenderError, match=message):
        render_text(tmp_path, inputs)


def test_alias_templates_stay_cheap(demo):
    # The spectrum changes five times a second: its alias is one states() call, no loops or filters.
    state = templates(demo)["audio_sensor_music_spectrum"]["state"]
    assert state.count("states(") == 1
    assert "for " not in state and "split" not in state


def test_entities_carry_the_component_and_boards_their_area(demo):
    found = templates(demo)
    assert len(found) == 6
    for entity in found.values():
        assert entity["attributes"]["component"] == "audio-sensor"
    assert found["audio_sensor_kids_room_spl_offset"]["attributes"]["area"] == "Kids' room"
    assert found["audio_sensor_living_room_spl_offset"]["attributes"]["area"] == "Living room"
    assert "area" not in found["audio_sensor_music_level"]["attributes"]
