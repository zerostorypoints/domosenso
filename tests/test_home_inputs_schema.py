"""The home inputs file (home.inputs.yaml): the shape components read about rooms and outside."""
from pathlib import Path

import pytest

from domosenso_cli.errors import DomosensoError
from domosenso_cli.schema import load_validated

DEMO = Path(__file__).resolve().parent.parent / "examples" / "demo-home" / "home.inputs.yaml"


def load(tmp_path, text: str):
    path = tmp_path / "home.inputs.yaml"
    path.write_text(text, encoding="utf-8")
    return load_validated(path, "home-inputs")


def test_demo_home_inputs_are_valid():
    data = load_validated(DEMO, "home-inputs")
    assert len(data["rooms"]) == 3


def test_room_name_may_be_a_string_or_a_language_map(tmp_path):
    load(tmp_path, "rooms:\n  - {id: kitchen, name: Kitchen}\n")
    load(tmp_path, "rooms:\n  - id: kitchen\n    name: {en: Kitchen, pl: Kuchnia}\n")


def test_unknown_room_key_is_refused(tmp_path):
    with pytest.raises(DomosensoError, match="windows"):
        load(tmp_path, "rooms:\n  - {id: x, name: X, windows: []}\n")


def test_room_id_must_be_a_slug(tmp_path):
    with pytest.raises(DomosensoError, match=r"rooms\.0\.id"):
        load(tmp_path, "rooms:\n  - {id: Living Room, name: X}\n")


def test_air_needs_at_least_one_reading(tmp_path):
    with pytest.raises(DomosensoError):
        load(tmp_path, "rooms:\n  - {id: x, name: X, air: {}}\n")


def test_bad_entity_id_is_refused(tmp_path):
    with pytest.raises(DomosensoError):
        load(tmp_path, "rooms:\n  - {id: x, name: X, lights: Living room}\n")



# Decision record of #219 (agreement 9): optional shared labels and order for covers, contacts and
# locks per room; an entity id or {entity, name}, the name one string or one per language.
def _validate(tmp_path, room):
    import yaml
    path = tmp_path / "home.inputs.yaml"
    path.write_text(yaml.safe_dump({"rooms": [{"id": "living_room", "name": "Living room", **room}]}))
    return load_validated(path, "home-inputs")


def test_room_covers_contacts_locks_are_optional_lists(tmp_path):
    _validate(tmp_path, {
        "covers": ["cover.living_room_blind", {"entity": "cover.terrace_awning", "name": {"en": "Awning", "de": "Markise"}}],
        "contacts": [{"entity": "binary_sensor.terrace_door", "name": "Terrace door"}],
        "locks": ["lock.front_door"]})


@pytest.mark.parametrize("bad", [{"covers": []}, {"covers": ["cover.a", "cover.a"]}, {"locks": [{"name": "x"}]},
                                 {"contacts": [{"entity": "binary_sensor.a", "name": "A", "area": "x"}]},
                                 {"covers": "cover.a"}])
def test_room_covers_contacts_locks_refuse_bad_shapes(tmp_path, bad):
    with pytest.raises(DomosensoError):
        _validate(tmp_path, bad)


# P3: a room's lights may be one entity (a group) or several, as the Ramka lists them.
def test_room_lights_one_or_several(tmp_path):
    _validate(tmp_path, {"lights": "light.living_room"})
    _validate(tmp_path, {"lights": ["light.ceiling", "light.reading_lamp"]})
    for bad in ([], ["light.a", "light.a"], ["not an entity"]):
        with pytest.raises(DomosensoError):
            _validate(tmp_path, {"lights": bad})
