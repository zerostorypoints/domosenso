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


WITH_DEVICES = sorted(p.parent.parent.name for p in (REPO / "components").glob("*/esphome/device.yaml.j2"))


@pytest.mark.parametrize("component", [c for c in WITH_DEVICES if c == "audio-sensor"])
def test_device_template_renders_the_demo_homes_files(component):
    """The ESPHome device template (artifacts.esphome.devices) with the demo home's inputs gives the
    committed device files that esphome-check validates."""
    from domosenso_render import render_device_files

    comp = REPO / "components" / component
    manifest = yaml.safe_load((comp / "component.yaml").read_text(encoding="utf-8"))
    inputs = yaml.safe_load((REPO / "examples/demo-home/inputs" / f"{component}.yaml").read_text(encoding="utf-8"))
    rendered = dict(render_device_files(comp, inputs))
    committed_dir = REPO / Path(manifest["artifacts"]["esphome"]["instance"]).parent
    committed = {p.name: p.read_text(encoding="utf-8") for p in committed_dir.glob(f"{component}-*.yaml")}
    assert rendered and rendered == committed


def test_device_template_sets_name_gain_only_when_given():
    from domosenso_render import render_device_files

    comp = REPO / "components" / "audio-sensor"
    sensors = [
        {"room": "den", "area": "Den"},
        {"room": "hall", "area": "Hall", "name": "audio-sensor", "friendly_name": "Audio sensor", "mic_gain": "18DB"},
    ]
    files = dict(render_device_files(comp, {"sensors": sensors}))
    def substitutions(name):  # !secret is an ESPHome tag; read the file as plain data
        class Loader(yaml.SafeLoader):
            pass
        Loader.add_multi_constructor("!", lambda loader, suffix, node: None)
        return yaml.load(files[name], Loader=Loader)["substitutions"]

    plain = substitutions("audio-sensor-den.yaml")
    assert plain == {"room": "den", "area": "Den"}
    kept = substitutions("audio-sensor-hall.yaml")
    assert kept == {"room": "hall", "area": "Hall", "name": "audio-sensor",
                    "friendly_name": "Audio sensor", "mic_gain": "18DB"}
