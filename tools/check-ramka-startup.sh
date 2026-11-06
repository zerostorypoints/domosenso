#!/usr/bin/env bash
# Validate retry and state convergence in the pinned HA engine without a real screen client.
set -euo pipefail
ramka_check_root=$(pwd)
ramka_fixture_dir=$(mktemp -d "${TMPDIR:-/tmp}/domosenso-ramka-startup.XXXXXX")
trap 'rm -rf "$ramka_fixture_dir"' EXIT
uv run tools/domosenso_render.py components/ramka --inputs examples/demo-home/inputs/ramka.yaml --out "$ramka_fixture_dir" >/dev/null
docker run --rm --network none \
  -v "$ramka_fixture_dir:/fixture:ro" \
  -v "$ramka_check_root/tests/fixtures/ramka_startup_runtime.py:/check.py:ro" \
  --entrypoint python homeassistant/home-assistant:2026.9.2 /check.py
