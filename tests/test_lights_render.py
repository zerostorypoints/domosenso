"""The lights component's package: the lowest-battery sensor must not write `unknown` as its state."""
from pathlib import Path

import yaml

from domosenso_render import render_component

REPO = Path(__file__).resolve().parent.parent


def test_lowest_battery_goes_unavailable_rather_than_unknown(tmp_path):
    # A numeric sensor (unit, state_class) whose template renders "unknown" logs "Received invalid
    # sensor state" as an ERROR on every start of a home where the batteries have no value yet.
    inputs = yaml.safe_load((REPO / "examples/demo-home/inputs/lights.yaml").read_text())
    render_component(REPO / "components/lights", inputs, tmp_path, ["en"])
    package = yaml.safe_load((tmp_path / "package.yaml").read_text())
    sensors = {s["unique_id"]: s for block in package["template"] for s in block.get("sensor", [])}
    battery = sensors["hue_lowest_battery"]
    assert "availability" in battery
    assert "unknown" not in battery["state"].replace("['unknown', 'unavailable']", "")
