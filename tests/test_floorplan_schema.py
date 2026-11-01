"""The floor plan document: schema, dashboard embedding, canonical form and diff (SPEC-027)."""
import copy

import pytest

from domosenso_cli.errors import DomosensoError
from domosenso_cli.floorplan_doc import (
    CARD_TYPE, canonical, dashboard_config, diff, extract, point_key, validate, without_source,
)

SQUARE = [[0, 0], [5.4, 0], [5.4, 7.6], [0, 7.6]]


def demo() -> dict:
    return {
        "schema": 1,
        "floors": [{
            "floor_id": "ground",
            "rooms": [
                {"area_id": "living_room", "polygon": SQUARE},
                {"area_id": "kitchen", "polygon": [[5.4, 0], [9, 0], [9, 4], [5.4, 4]]},
            ],
            "points": [
                {"device_id": "dev1", "x": 0.6, "y": 0.8, "placed": True},
                {"entity_id": "plant.monstera", "x": 2.7, "y": 3.8, "placed": False},
            ],
        }],
        "source": {"image": "domosenso/floorplan/ground.jpg", "metres_per_px": 0.0123,
                   "rotation_deg": 0, "offset_px": [40, 30]},
    }


def test_valid_demo_plan():
    validate(demo())


def test_unknown_schema():
    doc = demo()
    doc["schema"] = 2
    with pytest.raises(DomosensoError, match="schema 2 not supported"):
        validate(doc)


@pytest.mark.parametrize("ids", [{"device_id": "d", "entity_id": "plant.x"}, {}])
def test_point_needs_one_id(ids):
    doc = demo()
    doc["floors"][0]["points"] = [{**ids, "x": 1, "y": 1, "placed": True}]
    with pytest.raises(DomosensoError):
        validate(doc)


def test_polygon_min_three_points():
    doc = demo()
    doc["floors"][0]["rooms"][0]["polygon"] = [[0, 0], [1, 1]]
    with pytest.raises(DomosensoError, match="polygon"):
        validate(doc)


def test_unknown_key_named():
    doc = demo()
    doc["floors"][0]["rooms"][0]["name"] = "Living room"
    with pytest.raises(DomosensoError, match="name"):
        validate(doc)


def test_null_floor_id_valid():
    doc = demo()
    doc["floors"][0]["floor_id"] = None
    validate(doc)


def test_extract_roundtrip():
    doc = demo()
    assert extract(dashboard_config(doc)) == without_source(doc)
    assert "source" not in without_source(doc)
    assert "source" in doc


def test_dashboard_config_shape():
    cfg = dashboard_config(demo())
    assert cfg["views"][0]["cards"][0]["type"] == CARD_TYPE
    assert cfg["views"][0]["type"] == "panel"


def test_extract_none():
    assert extract(None) is None
    assert extract({"title": "x", "views": [{"cards": [{"type": "markdown"}]}]}) is None


def test_point_key():
    assert point_key({"device_id": "d1"}) == "d1"
    assert point_key({"entity_id": "plant.monstera"}) == "plant.monstera"


def test_diff_lines():
    old = demo()
    old["floors"][0]["points"] = [{"device_id": "dev1", "x": 0.6, "y": 0.8, "placed": True}]
    new = copy.deepcopy(old)
    rooms = new["floors"][0]["rooms"]
    rooms[0]["polygon"] = [[0, 0], [6, 0], [6, 7.6], [0, 7.6]]
    del rooms[1]
    rooms.append({"area_id": "office", "polygon": [[0, 8], [3, 8], [3, 10]]})
    new["floors"][0]["points"] = [
        {"device_id": "dev1", "x": 1.5, "y": 0.8, "placed": True},
        {"entity_id": "plant.monstera", "x": 2.7, "y": 3.8, "placed": False},
    ]
    assert diff(old, new) == [
        ("room", "change", "ground", "living_room"),
        ("room", "remove", "ground", "kitchen"),
        ("room", "add", "ground", "office"),
        ("point", "move", "ground", "dev1"),
        ("point", "add", "ground", "plant.monstera"),
    ]


def test_diff_old_none_and_null_floor():
    new = demo()
    new["floors"][0]["floor_id"] = None
    lines = diff(None, new)
    assert ("room", "add", "-", "living_room") in lines
    assert ("point", "add", "-", "plant.monstera") in lines


def test_diff_placed_flag_is_a_move():
    old = demo()
    new = copy.deepcopy(old)
    new["floors"][0]["points"][1]["placed"] = True
    assert diff(old, new) == [("point", "move", "ground", "plant.monstera")]


def test_diff_removed_floor():
    old = demo()
    new = {"schema": 1, "floors": []}
    assert ("room", "remove", "ground", "kitchen") in diff(old, new)


def test_canonical_ignores_source_and_float_noise():
    a = demo()
    b = demo()
    b["source"] = {"image": "other.png"}
    b["floors"][0]["points"][0]["x"] = 0.6000000004
    assert canonical(a) == canonical(b)
    b["floors"][0]["points"][0]["x"] = 0.7
    assert canonical(a) != canonical(b)


def test_canonical_int_equals_integral_float():
    a = demo()
    b = demo()
    a["floors"][0]["points"][0]["x"] = 5
    b["floors"][0]["points"][0]["x"] = 5.0
    a["floors"][0]["rooms"][0]["polygon"] = [[0, 0], [5, 0], [5, 7], [0, 7]]
    b["floors"][0]["rooms"][0]["polygon"] = [[0.0, 0.0], [5.0, 0.0], [5.0, 7.0], [0.0, 7.0]]
    assert canonical(a) == canonical(b)
    assert diff(a, b) == []
