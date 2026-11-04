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
