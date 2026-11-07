#!/usr/bin/env bash
# Isolated, fictional standalone HA profile. Requires an existing HA image and Server clone.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd -P)
server=${1:?Usage: tools/check-plant-sources.sh /path/to/domosenso-ha-server}
server_ref=6b9549f60cb1c4034e0965e546c47fd633a2d384
fixture=$(mktemp -d "${TMPDIR:-/tmp}/domosenso-plant-sources.XXXXXX")
trap 'find "$fixture" -depth -delete' EXIT
git -C "$server" archive "$server_ref" examples/android-ble/custom_components | tar -xf - -C "$fixture"
cd "$root"
uv run python - "$fixture" <<'PY'
from pathlib import Path
import sys
import yaml
from tools.domosenso_render import render_component

root = Path(sys.argv[1])
inputs = yaml.safe_load(Path("examples/standalone-tablet/plants.inputs.yaml").read_text())
render_component(Path("components/plants"), inputs, root / "tablet", ["en"])
plant = inputs["plants"][0]
plant["sources"]["fixture_receiver"] = {
    k: f"sensor.fixture_{k}" for k in plant["sources"]["tablet"]
}
plant["active_source"] = "fixture_receiver"
render_component(Path("components/plants"), inputs, root / "switched", ["en"])
PY
docker run --rm --network none \
  -v "$fixture:/fixture:ro" -v "$root/tests/fixtures/plant_sources_runtime.py:/check.py:ro" \
  --entrypoint python homeassistant/home-assistant:2026.9.2 /check.py
