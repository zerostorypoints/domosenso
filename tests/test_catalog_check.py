import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

import catalog_check as cc

FIXTURE = Path(__file__).parent / "fixtures" / "catalog"
REPO = Path(__file__).resolve().parent.parent


@pytest.fixture
def catalog(tmp_path):
    dest = tmp_path / "catalog"
    shutil.copytree(FIXTURE, dest)
    return dest


def component_yaml(catalog):
    return catalog / "components" / "demo-sensor" / "component.yaml"


def edit_yaml(path, change):
    data = yaml.safe_load(path.read_text())
    change(data)
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))


def edit_json(path, change):
    data = json.loads(path.read_text())
    change(data)
    path.write_text(json.dumps(data, ensure_ascii=False))


def test_valid_fixture_has_no_errors(catalog):
    comp = catalog / "components" / "demo-sensor"
    assert cc.check_component(component_yaml(catalog)) == []
    assert cc.check_translations(comp) == ([], [])
    assert cc.check_scene(catalog / "scenes" / "evening.yaml", catalog) == []
    assert cc.check_device(catalog / "devices" / "demo-node.yaml", catalog) == []
    assert cc.check_catalog(catalog) == ([], [])


def test_missing_artifact_path_is_error(catalog):
    (catalog / "components" / "demo-sensor" / "cards" / "card.yaml").unlink()
    errors = cc.check_component(component_yaml(catalog))
    assert len(errors) == 1
    assert "cards/card.yaml" in errors[0]


def test_missing_template_path_is_error(catalog):
    edit_yaml(component_yaml(catalog), lambda d: d["artifacts"].update(templates=["templates/gone.yaml.j2"]))
    errors = cc.check_component(component_yaml(catalog))
    assert len(errors) == 1
    assert "artifacts.templates" in errors[0] and "templates/gone.yaml.j2" in errors[0]


def test_schema_violation_is_error(catalog):
    edit_yaml(component_yaml(catalog), lambda d: d.pop("description_key"))
    errors = cc.check_component(component_yaml(catalog))
    assert any("description_key" in e for e in errors)


def test_photo_is_optional(catalog):
    edit_yaml(component_yaml(catalog), lambda d: d.pop("photo"))
    assert cc.check_component(component_yaml(catalog)) == []


def test_pl_key_absent_from_en_is_error(catalog):
    comp = catalog / "components" / "demo-sensor"
    edit_json(comp / "translations" / "pl.json", lambda d: d["ui"].update(extra="Dodatkowy"))
    errors, warnings = cc.check_translations(comp)
    assert any("ui.extra" in e and "pl" in e for e in errors)
    assert warnings == []


def test_en_key_missing_in_de_is_warning_not_error(catalog):
    comp = catalog / "components" / "demo-sensor"
    edit_json(comp / "translations" / "de.json", lambda d: d["ui"].pop("title"))
    errors, warnings = cc.check_translations(comp)
    assert errors == []
    assert any("ui.title" in w and "de" in w for w in warnings)


def test_invalid_json_is_error(catalog):
    comp = catalog / "components" / "demo-sensor"
    (comp / "translations" / "pl.json").write_text("{not json")
    errors, _ = cc.check_translations(comp)
    assert any("pl.json" in e for e in errors)


def test_sharp_s_in_de_is_error(catalog):
    comp = catalog / "components" / "demo-sensor"
    edit_json(comp / "translations" / "de.json", lambda d: d["ui"].update(title="Straße"))
    errors, _ = cc.check_translations(comp)
    assert any("ß" in e for e in errors)


def test_description_key_must_exist_in_en(catalog):
    edit_yaml(component_yaml(catalog), lambda d: d.update(description_key="meta.nope"))
    errors = cc.check_component(component_yaml(catalog))
    assert any("meta.nope" in e for e in errors)


def test_scene_unknown_component_is_error(catalog):
    scene = catalog / "scenes" / "evening.yaml"
    edit_yaml(scene, lambda d: d["components"].append("ghost"))
    errors = cc.check_scene(scene, catalog)
    assert any("ghost" in e for e in errors)


def test_scene_unknown_device_is_error(catalog):
    scene = catalog / "scenes" / "evening.yaml"
    edit_yaml(scene, lambda d: d["devices"].append("ghost-device"))
    errors = cc.check_scene(scene, catalog)
    assert any("ghost-device" in e for e in errors)


def test_scene_page_must_be_ambient_page(catalog):
    scene = catalog / "scenes" / "evening.yaml"
    edit_yaml(scene, lambda d: d["tablet"].update(page="temperatury"))
    errors = cc.check_scene(scene, catalog)
    assert any("temperatury" in e for e in errors)
    edit_yaml(scene, lambda d: d["tablet"].update(page="climate"))
    assert cc.check_scene(scene, catalog) == []


def test_scene_mode_must_be_ramka_mode(catalog):
    scene = catalog / "scenes" / "evening.yaml"
    edit_yaml(scene, lambda d: d["tablet"].update(mode="party"))
    errors = cc.check_scene(scene, catalog)
    assert any("party" in e for e in errors)


def test_scene_tablet_may_be_null(catalog):
    scene = catalog / "scenes" / "evening.yaml"
    edit_yaml(scene, lambda d: d.update(tablet=None))
    assert cc.check_scene(scene, catalog) == []


def test_scene_time_format(catalog):
    scene = catalog / "scenes" / "evening.yaml"
    edit_yaml(scene, lambda d: d.update(time="7:30pm"))
    assert cc.check_scene(scene, catalog) != []


def test_device_needs_names_in_all_languages(catalog):
    device = catalog / "devices" / "demo-node.yaml"
    edit_yaml(device, lambda d: d["names"].pop("pl"))
    assert cc.check_device(device) != []


def test_device_unknown_component_is_error(catalog):
    device = catalog / "devices" / "demo-node.yaml"
    edit_yaml(device, lambda d: d.update(component="ghost"))
    errors = cc.check_device(device, catalog)
    assert any("ghost" in e for e in errors)


def test_scenes_for_derives_reverse_index(catalog):
    second = catalog / "scenes" / "night.yaml"
    shutil.copy(catalog / "scenes" / "evening.yaml", second)
    edit_yaml(second, lambda d: d.update(id="night", devices=[]))
    index = cc.scenes_for(catalog)
    assert index["demo-sensor"] == ["evening", "night"]
    assert index["demo-node"] == ["evening"]


def test_scenes_for_without_scenes_dir(catalog):
    shutil.rmtree(catalog / "scenes")
    assert cc.scenes_for(catalog) == {}
    shutil.rmtree(catalog / "devices")
    assert cc.check_catalog(catalog) == ([], [])


def test_constants_are_exported():
    assert cc.RAMKA_MODES == ["off", "ambient", "controls", "calendar"]
    assert cc.RAMKA_PAGES == ["climate", "air", "plants", "photos", "status"]


def run_cli(*args):
    return subprocess.run(
        [sys.executable, str(REPO / "tools" / "catalog_check.py"), *args],
        capture_output=True,
        text=True,
    )


def test_cli_exit_codes(catalog):
    assert run_cli("--catalog", str(catalog)).returncode == 0
    comp = catalog / "components" / "demo-sensor"
    edit_json(comp / "translations" / "de.json", lambda d: d["ui"].pop("title"))
    assert run_cli("--catalog", str(catalog)).returncode == 0
    strict = run_cli("--catalog", str(catalog), "--strict")
    assert strict.returncode == 1
    assert "ui.title" in strict.stdout + strict.stderr
    edit_json(comp / "translations" / "pl.json", lambda d: d["ui"].update(extra="x"))
    assert run_cli("--catalog", str(catalog)).returncode == 1


def test_schemas_are_valid_draft_2020_12():
    from jsonschema import Draft202012Validator

    for name in ("component", "scene", "device"):
        schema = json.loads((REPO / "schemas" / f"{name}.schema.json").read_text())
        Draft202012Validator.check_schema(schema)


def test_repo_catalog_is_clean():
    errors, _ = cc.check_catalog(REPO)
    assert errors == []


# ---- leftovers from review ------------------------------------------------------------------


def test_catalog_without_components_dir_is_error(tmp_path):
    errors, _ = cc.check_catalog(tmp_path / "typo")
    assert any("components" in e for e in errors)
    assert cc.main(["--catalog", str(tmp_path / "typo")]) == 1


def test_tablet_page_only_with_ambient_mode(catalog):
    scene = catalog / "scenes" / "evening.yaml"
    edit_yaml(scene, lambda d: d["tablet"].update(mode="controls", page="climate"))
    errors = cc.check_scene(scene, catalog)
    assert any("page" in e and "ambient" in e for e in errors)
    edit_yaml(scene, lambda d: d["tablet"].update(mode="ambient", page="climate"))
    assert cc.check_scene(scene, catalog) == []


def test_scenes_for_skips_non_string_items(catalog):
    scene = catalog / "scenes" / "evening.yaml"
    edit_yaml(scene, lambda d: d.update(components=["demo-sensor", {"x": 1}, ["y"], 7, None], devices="oops"))
    assert cc.scenes_for(catalog) == {"demo-sensor": ["evening"]}


def test_recommended_devices_must_exist(catalog):
    def recommend(ids, group="requires"):
        def change(d):
            d["devices"].setdefault(group, [{"kind": "anything"}])[0]["recommend"] = ids
        return change

    edit_yaml(component_yaml(catalog), recommend(["demo-node"]))
    assert cc.check_component(component_yaml(catalog)) == []
    edit_yaml(component_yaml(catalog), recommend(["ghost-node"]))
    errors = cc.check_component(component_yaml(catalog))
    assert len(errors) == 1 and "devices.requires.0.recommend" in errors[0] and "ghost-node" in errors[0]
    edit_yaml(component_yaml(catalog), recommend(["demo-node"]))
    edit_yaml(component_yaml(catalog), recommend(["other-ghost"], "optional"))
    errors = cc.check_component(component_yaml(catalog))
    assert len(errors) == 1 and "devices.optional.0.recommend" in errors[0] and "other-ghost" in errors[0]


def test_component_and_device_photos_resolve_from_the_catalog_root(catalog):
    comp_dir = catalog / "components" / "demo-sensor"
    (catalog / "photos").mkdir()
    (catalog / "photos" / "x.jpg").write_bytes(b"jpg")
    (comp_dir / "local.jpg").write_bytes(b"jpg")
    edit_yaml(component_yaml(catalog), lambda d: d.update(photo="photos/x.jpg"))
    assert cc.check_component(component_yaml(catalog)) == []
    edit_yaml(component_yaml(catalog), lambda d: d.update(photo="local.jpg"))  # component-relative: wrong base
    assert any("photo: path does not exist: local.jpg" in e for e in cc.check_component(component_yaml(catalog)))
    device = catalog / "devices" / "demo-node.yaml"
    edit_yaml(device, lambda d: d.update(photo="photos/x.jpg"))
    assert cc.check_device(device, catalog) == []
    edit_yaml(device, lambda d: d.update(photo="local.jpg"))
    assert any("photo: path does not exist" in e for e in cc.check_device(device, catalog))


def test_scene_attributes_are_optional_and_need_a_state(catalog):
    scene = catalog / "scenes" / "evening.yaml"
    edit_yaml(scene, lambda d: d.update(attributes={"light.living_room": {"brightness": 180, "effect": None}}))
    assert cc.check_scene(scene, catalog) == []
    edit_yaml(scene, lambda d: d.update(attributes={"cover.ghost": {"current_position": 100}}))
    errors = cc.check_scene(scene, catalog)
    assert len(errors) == 1 and "cover.ghost" in errors[0] and "no state" in errors[0]
    edit_yaml(scene, lambda d: d.update(attributes={"light.living_room": {"rgb": [1, 2, 3]}}))
    assert any("attributes" in e for e in cc.check_scene(scene, catalog))
    edit_yaml(scene, lambda d: d.update(attributes={"light.living_room": {}}))
    assert any("attributes" in e for e in cc.check_scene(scene, catalog))


def test_device_match_rules_are_checked(catalog):
    device = catalog / "devices" / "demo-node.yaml"
    edit_yaml(device, lambda d: d.update(match=[{"integration": "esphome", "model": "demo*", "certainty": "maybe"},
                                                {"entry": "mqtt"}]))
    assert cc.check_device(device, catalog) == []
    for bad in ([{"entry": "mqtt", "model": "x"}], [{"certainty": "found"}], [{"modle": "x"}], []):
        edit_yaml(device, lambda d: d.update(match=bad))
        assert cc.check_device(device, catalog) != [], bad


def test_kind_files(catalog):
    kinds = catalog / "kinds"
    kinds.mkdir()
    kind = yaml.safe_load(component_yaml(catalog).read_text())["devices"]["requires"][0]["kind"]
    (kinds / f"{kind}.yaml").write_text(yaml.safe_dump({"id": kind, "match": [{"entity_domain": "sensor"}]}))
    assert cc.check_catalog(catalog) == ([], [])
    (kinds / "ghost.yaml").write_text(yaml.safe_dump({"id": "ghost", "match": [{"entry": "mqtt"}]}))
    (kinds / "named.yaml").write_text(yaml.safe_dump({"id": kind, "match": [{"entry": "mqtt"}]}))
    (kinds / "empty.yaml").write_text(yaml.safe_dump({"id": "empty"}))
    errors, _ = cc.check_catalog(catalog)
    assert any("ghost.yaml" in e and "no manifest names kind 'ghost'" in e for e in errors)
    assert any("named.yaml" in e and "does not match file name" in e for e in errors)
    assert any("empty.yaml" in e and "match" in e for e in errors)
