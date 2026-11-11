"""The floor plan document: schema, dashboard embedding, canonical form and diff (SPEC-028)."""
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


def test_diff_category_override_is_a_change_and_a_move_wins():
    old = demo()
    new = copy.deepcopy(old)
    new["floors"][0]["points"][1]["category"] = "other"
    assert diff(old, new) == [("point", "change", "ground", "plant.monstera")]
    new["floors"][0]["points"][1]["x"] += 1
    assert diff(old, new) == [("point", "move", "ground", "plant.monstera")]


def test_schema_refuses_an_unknown_category():
    doc = demo()
    doc["floors"][0]["points"][0]["category"] = "spaceship"
    with pytest.raises(Exception):
        validate(doc)
    doc["floors"][0]["points"][0]["category"] = "radio"
    validate(doc)


def test_also_joins_devices_to_a_point_and_counts_as_a_key():
    doc = demo()
    doc["floors"][0]["points"][0]["also"] = ["cast1", "dlna1"]
    validate(doc)
    doc["floors"][0]["points"].append({"device_id": "dev2", "x": 1, "y": 1, "placed": True, "also": ["cast1"]})
    with pytest.raises(DomosensoError, match="duplicate point: cast1"):
        validate(doc)
    doc = demo()
    doc["floors"][0]["points"][0]["also"] = [doc["floors"][0]["points"][0]["device_id"]]
    with pytest.raises(DomosensoError, match="duplicate point"):
        validate(doc)
    doc = demo()
    doc["floors"][0]["points"][1]["also"] = ["dev9"]   # an entity point cannot carry devices
    with pytest.raises(DomosensoError):
        validate(doc)


def test_diff_also_is_a_change():
    old = demo()
    new = copy.deepcopy(old)
    new["floors"][0]["points"][0]["also"] = ["cast1"]
    assert diff(old, new) == [("point", "change", "ground", new["floors"][0]["points"][0]["device_id"])]


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


def test_duplicate_floor_refused():
    doc = demo()
    doc["floors"].append(copy.deepcopy(doc["floors"][0]))
    doc["floors"][1]["rooms"] = []
    doc["floors"][1]["points"] = []
    with pytest.raises(DomosensoError, match="duplicate floor_id: ground"):
        validate(doc)


def test_duplicate_area_on_a_floor_refused():
    doc = demo()
    doc["floors"][0]["rooms"][1]["area_id"] = "living_room"
    with pytest.raises(DomosensoError, match="duplicate area_id on floor ground: living_room"):
        validate(doc)


def test_same_area_on_two_floors_valid():
    doc = demo()
    doc["floors"].append({"floor_id": "upstairs", "rooms": [{"area_id": "living_room", "polygon": SQUARE}],
                          "points": []})
    validate(doc)


def test_duplicate_point_refused_across_floors():
    doc = demo()
    doc["floors"].append({"floor_id": "upstairs", "rooms": [],
                          "points": [{"entity_id": "plant.monstera", "x": 1, "y": 1, "placed": True}]})
    with pytest.raises(DomosensoError, match="duplicate point: plant.monstera"):
        validate(doc)


def test_null_floor_duplicate_named():
    doc = demo()
    doc["floors"][0]["floor_id"] = None
    doc["floors"].append({"floor_id": None, "rooms": [], "points": []})
    with pytest.raises(DomosensoError, match="duplicate floor_id: -"):
        validate(doc)


def test_open_spaces_valid_and_their_errors():
    plan = demo()
    plan["floors"][0]["open_spaces"] = [["living_room", "kitchen"]]
    validate(plan)
    for groups, message in (
        ([["living_room", "office"]], "open space on floor ground: office is not a room of the floor"),
        ([["living_room", "living_room"]], "open space on floor ground: living_room twice"),
        ([["living_room", "kitchen"], ["kitchen", "living_room"]], "open space on floor ground: kitchen twice"),
    ):
        bad = demo()
        bad["floors"][0]["open_spaces"] = groups
        with pytest.raises(DomosensoError, match=message):
            validate(bad)
    one = demo()
    one["floors"][0]["open_spaces"] = [["living_room"]]
    with pytest.raises(DomosensoError):
        validate(one)    # the schema: two rooms at least


def test_diff_open_spaces_is_one_line_per_floor():
    old = demo()
    new = copy.deepcopy(old)
    new["floors"][0]["open_spaces"] = [["living_room", "kitchen"]]
    assert diff(old, new) == [("open", "change", "ground")]
    same = copy.deepcopy(new)
    same["floors"][0]["open_spaces"] = [["kitchen", "living_room"]]
    assert diff(new, same) == [], "the order inside and between groups does not matter"


def test_dashboard_config_carries_the_home_rooms():
    from domosenso_cli.floorplan_doc import card_rooms
    home = {"rooms": [{"id": "living_room", "name": {"en": "Living room", "de": "Wohnzimmer"}, "lights": "light.x",
                       "climate": {"temperature": "sensor.living_room_temperature"}},
                      {"id": "office", "name": "Office", "area": "study"}], "weather": "weather.home"}
    rooms = card_rooms(home)
    assert rooms == [{"id": "living_room", "name": {"en": "Living room", "de": "Wohnzimmer"}, "area": "living_room",
                      "climate": {"temperature": "sensor.living_room_temperature"}},
                     {"id": "office", "name": "Office", "area": "study"}]
    card = dashboard_config(demo(), rooms)["views"][0]["cards"][0]
    assert card["rooms"] == rooms
    assert extract(dashboard_config(demo(), rooms)) == without_source(demo())
    assert "rooms" not in dashboard_config(demo())["views"][0]["cards"][0]
    assert card_rooms(None) == []


# --- Wi-Fi keys (SPEC-044) ---------------------------------------------------------------------

def wifi_demo() -> dict:
    doc = demo()
    floor = doc["floors"][0]
    floor["height"] = 2.7
    floor["slab"] = "slab"
    floor["walls"] = [{"at": [5.4, 3.8], "material": "brick"}]
    floor["openings"] = [{"kind": "window", "rooms": ["living_room", None], "at": [2.0, 0.0],
                          "material": "low_e"}]
    floor["access_points"] = [{"device_id": "dev1", "bands": ["2.4", "5"], "tx": {"5": 20}, "mount": 1.0}]
    doc["wifi"] = {
        "defaults": {"interior": "interior", "exterior": "exterior"},
        "outdoor": ["kitchen"],
        "samples": [{"floor_id": "ground", "x": 3.4, "y": 2.1, "t": "2026-11-10T19:30:00Z",
                     "band": "5", "channel": 36, "dbm": -58, "noise": -92,
                     "ap": "dev1", "bssid": "02:00:00:00:00:01", "source": "survey"}],
    }
    return doc


def test_a_plan_with_wifi_keys_validates():
    validate(wifi_demo())


def _edit(doc, fn):
    fn(doc)
    return doc


def _ap(**kw):
    return lambda d: d["floors"][0]["access_points"].__setitem__(0, {"device_id": "dev1", "bands": ["5"], **kw})


REFUSALS = [
    (lambda d: d["floors"][0]["walls"][0].update(at=[2.7, 2.0]),
     "wall on floor ground: [2.7, 2.0] is not on a room edge"),
    (lambda d: d["floors"][0]["walls"][0].update(material="mud"), "unknown material mud"),
    (lambda d: d["floors"][0]["walls"][0].update(material="slab"), "material slab does not fit a wall"),
    (lambda d: d["floors"][0].update(slab="mud"), "unknown material mud"),
    (lambda d: d["floors"][0].update(slab="brick"), "material brick does not fit a slab"),
    (lambda d: d["wifi"]["defaults"].update(interior="slab"), "material slab does not fit a wall"),
    (lambda d: d["floors"][0]["openings"][0].update(material="wood"), "material wood does not fit a window"),
    (lambda d: d["floors"][0]["openings"][0].update(kind="door", material="brick"),
     "material brick does not fit a door"),
    (lambda d: d["wifi"]["outdoor"].append("garden"), "outdoor: garden is not a room"),
    (lambda d: d["wifi"]["outdoor"].append("kitchen"), "outdoor: kitchen twice"),
    (lambda d: d["floors"][0]["openings"][0].update(kind="opening", material="wood"),
     "material wood does not fit a doorway"),
    (lambda d: d["floors"][0]["access_points"].__setitem__(0, {"device_id": "nope", "bands": ["5"]}),
     "access point on floor ground: nope is not a point of the floor"),
    (lambda d: d["floors"][0]["access_points"].append({"device_id": "dev1", "bands": ["5"]}),
     "access point twice: dev1"),
    (_ap(bands=[]), "access point dev1: bands empty or unknown"),
    (_ap(bands=["7"]), "access point dev1: bands empty or unknown"),
    (_ap(tx={"5": 40}), "access point dev1: tx 5 out of range"),
    (_ap(tx={"6": 10}), "access point dev1: tx 6 out of range"),
    (_ap(mount=6), "mount out of range"),
    (lambda d: d["floors"][0].update(height=1), "height out of range"),
    (lambda d: d["wifi"]["samples"][0].update(floor_id="attic"), "sample 0: floor attic not in the plan"),
    (lambda d: d["wifi"]["samples"][0].update(dbm=5), "sample 0: dbm out of range"),
    (lambda d: d["wifi"]["samples"][0].update(dbm=-120), "sample 0: dbm out of range"),
    (lambda d: d["wifi"].update(samples=d["wifi"]["samples"] * 2001), "more than 2000 samples"),
]


@pytest.mark.parametrize("edit,reason", REFUSALS, ids=[r[1] for r in REFUSALS])
def test_wifi_refusals(edit, reason):
    doc = wifi_demo()
    edit(doc)
    with pytest.raises(DomosensoError) as exc:
        validate(doc)
    assert str(exc.value) == reason


def test_a_doorway_takes_no_material_and_a_door_takes_wood():
    doc = wifi_demo()
    doc["floors"][0]["openings"] = [
        {"kind": "opening", "rooms": ["living_room", "kitchen"], "at": [5.4, 2.0]},
        {"rooms": ["living_room", "kitchen"], "at": [5.4, 3.0], "material": "wood"},
    ]
    validate(doc)


def test_wifi_changes_are_diffed_per_floor_and_order_is_left_out():
    old = wifi_demo()
    new = copy.deepcopy(old)
    assert diff(old, new) == []
    new["floors"][0]["walls"][0]["material"] = "concrete"
    assert diff(old, new) == [("wifi", "change", "ground")]
    new = copy.deepcopy(old)
    new["floors"][0]["walls"][0]["at"] = [5.4000001, 3.8]
    new["floors"][0]["access_points"][0]["mount"] = 1
    assert diff(old, new) == []
    for key, value in (("height", 3), ("slab", "interior")):
        new = copy.deepcopy(old)
        new["floors"][0][key] = value
        assert diff(old, new) == [("wifi", "change", "ground")]
    new = copy.deepcopy(old)
    new["floors"][0]["openings"][0]["material"] = "double"
    assert ("wifi", "change", "ground") in diff(old, new)


def test_glazing_fits_walls_and_doors_and_thick_concrete_a_slab():
    doc = wifi_demo()
    doc["floors"][0]["walls"][0]["material"] = "low_e"
    doc["floors"][0]["openings"][0].update(kind="door", material="triple_low_e")
    doc["floors"][0]["slab"] = "concrete_thick"
    doc["wifi"]["defaults"] = {"interior": "concrete_thin", "exterior": "glass"}
    validate(doc)


def test_an_outdoor_flag_change_is_a_wifi_change_of_its_floor():
    old = wifi_demo()
    second = {"floor_id": "upstairs", "rooms": [{"area_id": "terrace", "polygon": SQUARE}], "points": []}
    old["floors"].append(second)
    validate(old)
    new = copy.deepcopy(old)
    new["wifi"]["outdoor"] = ["terrace", "kitchen"]
    assert diff(old, new) == [("wifi", "change", "upstairs")], "order is left out"
    new["wifi"]["outdoor"] = ["terrace"]
    assert diff(old, new) == [("wifi", "change", "ground"), ("wifi", "change", "upstairs")]
    del new["wifi"]["outdoor"]
    validate(new)
    assert diff(old, new) == [("wifi", "change", "ground")]


def test_wifi_samples_are_diffed_by_count_after_the_push():
    old = wifi_demo()
    new = copy.deepcopy(old)
    new["wifi"]["samples"].append({**new["wifi"]["samples"][0], "dbm": -70})
    assert diff(old, new) == [("wifi", "samples", "2")]
    assert diff(new, old) == [("wifi", "samples", "1")]
    reordered = copy.deepcopy(new)
    reordered["wifi"]["samples"].reverse()
    assert diff(new, reordered) == []
    assert diff(demo(), demo()) == []


def test_a_plan_without_wifi_keys_has_no_wifi_lines():
    assert diff(demo(), demo()) == []
    assert diff(None, demo()) == [(k, "add", "ground", n) for k, n in
                                  [("room", "living_room"), ("room", "kitchen"),
                                   ("point", "dev1"), ("point", "plant.monstera")]]


def test_the_cards_geometry_edits_leave_walls_the_validator_accepts(tmp_path):
    """A wall material on an edge a join, a corner move, a corner removal or insertion takes away is
    dropped (or carried along a moved edge) by lib/plan.js, so the edited plan still validates."""
    import json
    import shutil
    import subprocess
    from pathlib import Path

    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH (eval \"$(fnm env --shell zsh)\")")
    plan_js = Path(__file__).resolve().parents[1] / "components" / "floorplan" / "cards" / "lib" / "plan.js"
    doc = demo()
    del doc["source"]
    doc["floors"][0]["walls"] = [
        {"at": [5.4, 2], "material": "glass"},        # shared edge: gone with the join
        {"at": [0, 3.8], "material": "brick"},        # west edge: moves with corner 0
        {"at": [2.7, 7.6], "material": "drywall"},    # north edge: gone with corner 2's removal
    ]
    validate(doc)
    script = tmp_path / "edits.mjs"
    script.write_text(
        f"import * as plan from {json.dumps(plan_js.as_uri())};\n"
        "const doc = JSON.parse(process.argv[2]);\n"
        "process.stdout.write(JSON.stringify([\n"
        "  plan.joinRooms(doc, 'ground', 'living_room', 'kitchen'),\n"
        "  plan.moveCorner(doc, 'ground', 'living_room', 0, [-1, 0]),\n"
        "  plan.removeCorner(doc, 'ground', 'living_room', 2),\n"
        "  plan.insertCorner(doc, 'ground', 'living_room', 2, [2.7, 8.6]),\n"
        "]));\n",
        encoding="utf-8")
    result = subprocess.run([node, str(script), json.dumps(doc)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    edited = json.loads(result.stdout)
    for out in edited:
        validate(out)
    joined, moved, removed, inserted = edited
    assert [w["material"] for w in joined["floors"][0]["walls"]] == ["brick", "drywall"]
    assert len(moved["floors"][0]["walls"]) == 3
    assert [w["material"] for w in removed["floors"][0]["walls"]] == ["glass", "brick"]
    assert [w["material"] for w in inserted["floors"][0]["walls"]] == ["glass", "brick"]
