"""Loading the shared home inputs named by `home_inputs:` in domosenso.yaml."""
import pytest
import yaml

from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.home_inputs import load_home_inputs

ROOMS = {"rooms": [{"id": "living_room", "name": "Living room"}, {"id": "kitchen", "name": "Kitchen"}]}


def make_home(tmp_path, inputs: dict | None = None, *, declare: bool = True) -> HomeConfig:
    data = {
        "catalog": "../catalog",
        "config_dir": "config",
        "esphome_dir": "esphome",
        "targets": {},
        "components": {},
    }
    if declare:
        data["home_inputs"] = "home.inputs.yaml"
    (tmp_path / "domosenso.yaml").write_text(yaml.safe_dump(data), encoding="utf-8")
    if inputs is not None:
        (tmp_path / "home.inputs.yaml").write_text(yaml.safe_dump(inputs), encoding="utf-8")
    return HomeConfig.load(tmp_path)


def test_no_home_inputs_key_gives_none(tmp_path):
    home = make_home(tmp_path, declare=False)
    assert home.home_inputs is None
    assert load_home_inputs(home) is None


def test_home_inputs_are_loaded_and_validated(tmp_path):
    result = load_home_inputs(make_home(tmp_path, ROOMS))
    assert result["rooms"][0]["id"] == "living_room"


def test_missing_file_names_the_path(tmp_path):
    with pytest.raises(DomosensoError) as exc:
        load_home_inputs(make_home(tmp_path))
    assert str(exc.value).startswith("home-inputs: ")
    assert "not found" in str(exc.value)
    assert "home.inputs.yaml" in str(exc.value)


def test_duplicate_room_ids_are_refused(tmp_path):
    rooms = {"rooms": [{"id": "kitchen", "name": "Kitchen"}, {"id": "kitchen", "name": "Kitchen 2"}]}
    with pytest.raises(DomosensoError) as exc:
        load_home_inputs(make_home(tmp_path, rooms))
    assert str(exc.value) == "home-inputs: rooms: duplicate id kitchen"


def test_room_id_outside_is_reserved(tmp_path):
    rooms = {"rooms": [{"id": "kitchen", "name": "Kitchen"}, {"id": "outside", "name": "Garden"}]}
    with pytest.raises(DomosensoError) as exc:
        load_home_inputs(make_home(tmp_path, rooms))
    assert str(exc.value) == "home-inputs: rooms: id outside is reserved for the outside area; name the room otherwise"


def test_room_and_outside_may_name_an_area(tmp_path):
    data = {"rooms": [{"id": "kitchen", "name": "Kitchen", "area": "kuchnia"}],
            "outside": {"temperature": "sensor.t", "area": "garden"}}
    result = load_home_inputs(make_home(tmp_path, data))
    assert result["rooms"][0]["area"] == "kuchnia" and result["outside"]["area"] == "garden"


def test_invalid_file_is_prefixed(tmp_path):
    with pytest.raises(DomosensoError) as exc:
        load_home_inputs(make_home(tmp_path, {"rooms": [{"name": "No id"}]}))
    assert str(exc.value).startswith("home-inputs: ")
