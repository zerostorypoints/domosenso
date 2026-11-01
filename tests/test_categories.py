"""Device categories (SPEC-028 Amendment 5): catalog-wide, one rule engine in Python and in the card."""
import json
from pathlib import Path

import category_index
from domosenso_cli.categories import build, category_of, roles_of

ROOT = Path(__file__).resolve().parent.parent
CASES = json.loads((ROOT / "tests" / "fixtures" / "category-cases.json").read_text(encoding="utf-8"))["cases"]


def test_index_is_current():
    assert category_index.OUT.read_text(encoding="utf-8") == category_index.render(), \
        "components/floorplan/cards/lib/categories.json is stale: run uv run tools/category_index.py"


def test_every_named_kind_and_device_exists_and_orders_are_unique():
    index = build(ROOT)
    import yaml
    for path in sorted((ROOT / "categories").glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        assert path.stem == data["id"]
        for kid in data.get("kinds", []):
            assert (ROOT / "kinds" / f"{kid}.yaml").is_file(), f"{path.name}: no kind {kid}"
        for did in data.get("devices", []):
            assert (ROOT / "devices" / f"{did}.yaml").is_file(), f"{path.name}: no device {did}"
    orders = [c["order"] for c in index["categories"]]
    assert len(orders) == len(set(orders))
    assert [c["id"] for c in index["categories"] if c["fallback"]] == ["other"], "exactly one fallback"


def test_cases_get_their_category():
    index = build(ROOT)
    wrong = []
    for case in CASES:
        dev = {**case["device"], "entity_domains": set(case["device"]["entity_domains"]),
               "device_classes": set(case["device"]["device_classes"])}
        got = category_of(dev, index)
        if got != {"id": case["category"], "marker": case["marker"]}:
            wrong.append(f"{case['name']}: {got}, expected {case['category']} {case['marker']}")
    assert wrong == []


def test_the_plan_schema_lists_exactly_the_category_ids():
    schema = json.loads((ROOT / "schemas" / "floorplan.schema.json").read_text(encoding="utf-8"))
    point = schema["$defs"]["point"]["properties"]["category"]
    assert sorted(point["enum"]) == sorted(c["id"] for c in build(ROOT)["categories"] if c["placeable"])


def test_catalog_check_validates_categories(tmp_path):
    import catalog_check
    assert [e for p in sorted((ROOT / "categories").glob("*.yaml")) for e in catalog_check.check_category(p, ROOT)] == []
    (tmp_path / "kinds").mkdir()
    bad = tmp_path / "wrong.yaml"
    bad.write_text("id: other-id\norder: 1\nnames: {en: A, de: A, pl: A}\ncolour: '#000000'\nmarker: circle\nkinds: [nope]\n")
    errors = catalog_check.check_category(bad, tmp_path)
    assert any("does not match file name" in e for e in errors) and any("names 'nope'" in e for e in errors), errors
    bad.write_text("id: wrong\norder: 1\nnames: {en: A}\ncolour: red\nmarker: star\n")
    assert catalog_check.check_category(bad, tmp_path), "schema errors"


def test_roles_list_every_matching_category_by_order():
    index = build(ROOT)
    wrong = []
    for case in CASES:
        if "roles" not in case:
            continue
        dev = {**case["device"], "entity_domains": set(case["device"]["entity_domains"]),
               "device_classes": set(case["device"]["device_classes"])}
        got = [r["id"] for r in roles_of(dev, index)]
        if got != case["roles"]:
            wrong.append(f"{case['name']}: {got}, expected {case['roles']}")
        assert roles_of(dev, index)[0] == category_of(dev, index), "the first role is the category"
    assert wrong == []
