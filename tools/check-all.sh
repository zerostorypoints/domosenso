#!/usr/bin/env bash
# Every check of the catalog, in order; keeps going after a failure and exits non-zero if any
# failed:
#   agents_check (AGENTS.md within 32,768 bytes, CLAUDE.md, skills), pytest, npm test,
#   catalog_check --strict,
#   tools/ha-check.sh for every component with a Home Assistant part (ha/, templates/ or
#   artifacts.ha_instance), tools/esphome-check.sh for every component with esphome/.
#
#   tools/check-all.sh
#
# Run from the repository root. Needs uv, node >= 22 (npm install once) and docker. Flashes
# nothing and talks to no Home Assistant instance.
set -uo pipefail
ROOT=$(pwd)
[ -f "$ROOT/tools/catalog_check.py" ] || { echo "run from the repository root" >&2; exit 2; }
failed=()

step() {  # $1 = label, rest = command
  local label=$1; shift
  echo "==> $label"
  if "$@"; then echo "ok   $label"; else echo "FAIL $label"; failed+=("$label"); fi
}

step agents_check uv run tools/agents_check.py
step pytest uv run pytest -q
step "npm test" npm test --silent
step "catalog_check --strict" uv run tools/catalog_check.py --strict
for manifest in components/*/component.yaml; do
  dir=$(dirname "$manifest"); comp=$(basename "$dir")
  if [ -d "$dir/ha" ] || [ -d "$dir/templates" ] || grep -q '^  ha_instance:' "$manifest"; then
    step "ha-check $comp" tools/ha-check.sh "$comp"
  fi
  if [ -d "$dir/esphome" ]; then
    step "esphome-check $comp" tools/esphome-check.sh "$comp"
  fi
done
# ramka 0.2.0: climate, air, plants and photos left out, only the status page (SPEC-011 section 6.2).
step "ha-check ramka (pages left out)" env INPUTS="$ROOT/tests/fixtures/ramka-without-pages.yaml" tools/ha-check.sh ramka

echo
if [ ${#failed[@]} -eq 0 ]; then echo "all checks passed"; exit 0; fi
printf 'failed: %s\n' "${failed[@]}"
exit 1
