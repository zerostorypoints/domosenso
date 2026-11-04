"""`uses_home`: the shared home inputs as the `home` and `room_name` template globals."""
import shutil
from pathlib import Path

import pytest
import yaml

from catalog_check import check_component
from domosenso_cli.build import plan_outputs
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import ComponentEntry, HomeConfig
from domosenso_render import RenderError, render_component

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "tests/fixtures/uses-home"
DEMO = yaml.safe_load((ROOT / "examples/demo-home/home.inputs.yaml").read_text(encoding="utf-8"))


def test_home_is_visible_to_a_component_that_uses_it(tmp_path):
    home = {"rooms": [{"id": "a", "name": "Living room"}, {"id": "b", "name": {"en": "Den", "pl": "Pokoj"}}]}
    render_component(FIXTURE, {}, tmp_path, ["en", "pl"], home=home)
    en = (tmp_path / "rooms.en.yaml").read_text(encoding="utf-8")
    pl = (tmp_path / "rooms.pl.yaml").read_text(encoding="utf-8")
    assert "Living room" in en and "Den" in en
    assert "Living room" in pl and "Pokoj" in pl and "Den" not in pl


def test_demo_home_renders(tmp_path):
    render_component(FIXTURE, {}, tmp_path, ["en"], home=DEMO)
    assert "Living room" in (tmp_path / "rooms.en.yaml").read_text(encoding="utf-8")


def _component(tmp_path, template: str, uses_home=None) -> Path:
    comp = tmp_path / "comp"
    shutil.copytree(FIXTURE, comp)
    for f in (comp / "templates").iterdir():
        f.unlink()
    (comp / "templates/x.yaml.j2").write_text(template, encoding="utf-8")
    manifest = yaml.safe_load((comp / "component.yaml").read_text(encoding="utf-8"))
    manifest["artifacts"]["templates"] = ["templates/x.yaml.j2"]
    if uses_home is None:
        del manifest["uses_home"]
    else:
        manifest["uses_home"] = uses_home
    (comp / "component.yaml").write_text(yaml.safe_dump(manifest), encoding="utf-8")
    return comp


def test_home_is_undefined_without_it(tmp_path):
    comp = _component(tmp_path, "[[ home.rooms ]]\n")
    with pytest.raises(Exception, match="home"):
        render_component(comp, {}, tmp_path / "out", ["en"])


def _plan(tmp_path, comp: Path, home_inputs: Path | None):
    path = tmp_path / "inputs.yaml"
    path.write_text("{}\n")
    entry = ComponentEntry("uses-home-fixture", path, ["en"], {})
    home = HomeConfig(tmp_path, str(ROOT), tmp_path / "ha", tmp_path / "esphome", {},
                      {"uses-home-fixture": entry}, home_inputs=home_inputs)
    return plan_outputs(home, entry, comp, "0.0.1", "a" * 40)


def test_plan_outputs_passes_home_inputs(tmp_path):
    inputs = tmp_path / "home.inputs.yaml"
    shutil.copy(ROOT / "examples/demo-home/home.inputs.yaml", inputs)
    outputs = _plan(tmp_path, FIXTURE, inputs)
    text = b"".join(o.content for o in outputs).decode("utf-8")
    assert "Living room" in text and "Bedroom" in text


def test_plan_outputs_fails_without_home_inputs(tmp_path):
    with pytest.raises(DomosensoError, match="uses-home-fixture: uses home inputs, but domosenso.yaml names no home_inputs"):
        _plan(tmp_path, FIXTURE, None)


def test_optional_user_renders_without_home_inputs(tmp_path):
    comp = _component(tmp_path, "[% if home %]x[% endif %]\n", uses_home="optional")
    assert _plan(tmp_path, comp, None) == []


def test_optional_user_sees_home_when_given(tmp_path):
    comp = _component(tmp_path, "[% if home %]x[% endif %]\n", uses_home="optional")
    inputs = tmp_path / "home.inputs.yaml"
    shutil.copy(ROOT / "examples/demo-home/home.inputs.yaml", inputs)
    (output,) = _plan(tmp_path, comp, inputs)
    assert output.content.endswith(b"x\n")


def test_catalog_check_accepts_uses_home():
    errors = check_component(FIXTURE / "component.yaml")
    assert not [e for e in errors if "uses_home" in e]
