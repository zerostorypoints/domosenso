#!/usr/bin/env bash
# Every check of the catalog, in order; keeps going after a failure and exits non-zero if any
# failed:
#   agents_check (AGENTS.md within 32,768 bytes, CLAUDE.md, skills), pytest, npm test,
#   catalog_check --strict,
#   tools/ha-check.sh for every component with a Home Assistant part (ha/, templates/ or
#   artifacts.ha_instance), tools/esphome-check.sh for every component with esphome/,
#   isolated demo HA runtime acceptance (browser matrix runs in the separate demo CI job).
#
#   tools/check-all.sh [--local]
# --local excludes HA/ESPHome runtime checks and never reports a full pass.
#
# Run from the repository root. Needs uv, node >= 22 (npm install once) and docker. Flashes
# nothing and uses only a generated, isolated Home Assistant instance.
set -uo pipefail
mode=full
if [ "$#" -gt 0 ]; then
  if [ "$#" -eq 1 ] && [ "$1" = --local ]; then mode=local
  else echo "usage: tools/check-all.sh [--local]" >&2; exit 2
  fi
fi
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
step "website content" uv run tools/export_website.py --check
step "npm test" npm test --silent
step "catalog_check --strict" uv run tools/catalog_check.py --strict
if [ "$mode" = full ]; then
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
step "demo runtime" uv run tools/dev_home/ci.py --runtime-only
step "home staging runtime" uv run tools/home-staging-check.py
fi

echo
if [ ${#failed[@]} -eq 0 ]; then
  if [ "$mode" = full ]; then echo "all checks passed"
  else echo "partial checks passed (HA/ESPHome not run)"
  fi
  exit 0
fi
printf 'failed: %s\n' "${failed[@]}"
exit 1
