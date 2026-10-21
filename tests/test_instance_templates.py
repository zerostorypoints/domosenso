"""A component's instance templates (templates/instance/) against the demo home's instance file.

`domosenso add` writes a component's instance files once from `templates/instance/`; `ha-check`
loads the demo home's committed copy (`artifacts.ha_instance`). Rendering the templates with the
demo home's inputs must give that copy, so the check covers the templates as well (SPEC-005).
"""
from pathlib import Path

import pytest
import yaml

from domosenso_render import render_component

REPO = Path(__file__).resolve().parent.parent
WITH_INSTANCE = sorted(p.parent.parent.name for p in (REPO / "components").glob("*/templates/instance"))


def test_some_component_has_instance_templates():
    assert "bermuda-presence" in WITH_INSTANCE


@pytest.mark.parametrize("component", WITH_INSTANCE)
def test_instance_renders_the_demo_homes_file(component, tmp_path):
    comp = REPO / "components" / component
    manifest = yaml.safe_load((comp / "component.yaml").read_text(encoding="utf-8"))
    committed = manifest["artifacts"].get("ha_instance")
    assert committed, f"{component} has templates/instance/ but no artifacts.ha_instance to compare with"
    inputs = yaml.safe_load((REPO / "examples/demo-home/inputs" / f"{component}.yaml").read_text(encoding="utf-8"))
    render_component(comp, inputs, tmp_path, ["en"])
    rendered = sorted((tmp_path / "instance").rglob("*.yaml"))
    assert [p.name for p in rendered] == [Path(committed).name]
    assert yaml.safe_load(rendered[0].read_text(encoding="utf-8")) == yaml.safe_load(
        (REPO / committed).read_text(encoding="utf-8")
    )
