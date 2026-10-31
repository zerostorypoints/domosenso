#!/usr/bin/env bash
# Every check of the catalog, in order; keeps going after a failure and exits non-zero if any
# failed:
#   agents_check (AGENTS.md within 32,768 bytes, CLAUDE.md, skills), pytest, npm test,
#   website build + e2e (only when the branch changes website/; skipped under CI and when
#   website/node_modules is missing; one-time: npm ci --prefix website &&
#   (cd website && npx playwright install chromium)),
#   catalog_check --strict,
#   tools/ha-check.sh for every component with a Home Assistant part (ha/, templates/ or
#   artifacts.ha_instance), tools/esphome-check.sh for every component with esphome/,
#   home staging runtime acceptance. Demo acceptance is a separate opt-in check.
#
#   tools/check-all.sh [--local]
# --local excludes HA/ESPHome runtime checks and never reports a full pass.
#
# pytest runs on every CPU (pytest-xdist). The HA/ESPHome checks and home staging run
# side by side, CHECK_JOBS at a time (default 4; 1 runs them one by one); each one's output is
# printed as one block once all have finished, in the order below.
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
JOBS=${CHECK_JOBS:-4}
failed=()
queued=()
LOGS=$(mktemp -d "${TMPDIR:-/tmp}/domosenso-check-all.XXXXXX")
trap 'rm -rf "$LOGS"' EXIT

step() {  # $1 = label, rest = command
  local label=$1; shift
  echo "==> $label"
  if "$@"; then echo "ok   $label"; else echo "FAIL $label"; failed+=("$label"); fi
}

background() {  # $1 = label, rest = command; started once fewer than $JOBS are running
  local label=$1 n=${#queued[@]}; shift
  while [ "$(jobs -pr | wc -l | tr -d ' ')" -ge "$JOBS" ]; do sleep 0.2; done
  echo "started $label"
  ( "$@" > "$LOGS/$n.log" 2>&1; echo $? > "$LOGS/$n.rc" ) &
  queued+=("$label")
}

collect() {  # waits for every background step, then reports each like step()
  wait
  local n
  for n in "${!queued[@]}"; do
    echo "==> ${queued[$n]}"
    cat "$LOGS/$n.log"
    if [ "$(cat "$LOGS/$n.rc" 2>/dev/null)" = 0 ]; then echo "ok   ${queued[$n]}"
    else echo "FAIL ${queued[$n]}"; failed+=("${queued[$n]}"); fi
  done
}

ha_image() {  # home staging needs the image present and pulls nothing; ha-check's docker run would
  local image
  image=$(sed -n "s/^IMAGE = '\(.*\)'\$/\1/p" tools/dev_home/runtime.py)
  [ -n "$image" ] || { echo "no IMAGE in tools/dev_home/runtime.py" >&2; return 1; }
  docker image inspect "$image" > /dev/null 2>&1 || docker pull -q "$image"
}

step agents_check uv run tools/agents_check.py
step pytest uv run pytest -q -n auto
step "website content" uv run tools/export_website.py --check
step "npm test" npm test --silent
if git diff --name-only origin/main...HEAD 2>/dev/null | grep -q '^website/'; then
  if [ -n "${CI:-}" ]; then
    echo "skip website build+e2e (CI: covered by the website workflow)"
  elif [ ! -d website/node_modules ]; then
    echo "skip website build+e2e (run: npm ci --prefix website && (cd website && npx playwright install chromium))"
  else
    # NEXT_PUBLIC_GOOGLE_ANALYTICS_ID: the e2e analytics spec needs a measurement id at build time
    step "website build" bash -c 'cd website && NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=G-DOMOTEST01 npm run build'
    step "website e2e" bash -c 'cd website && npm run e2e'
  fi
fi
step "catalog_check --strict" uv run tools/catalog_check.py --strict
if [ "$mode" = full ]; then
# Before the pool: on a fresh machine home staging would start before any ha-check had pulled it.
step "Home Assistant image" ha_image
# Home staging first: it is the longest, the others fill the remaining slots.
background "home staging runtime" uv run tools/home-staging-check.py
for manifest in components/*/component.yaml; do
  dir=$(dirname "$manifest"); comp=$(basename "$dir")
  if [ -d "$dir/ha" ] || [ -d "$dir/templates" ] || grep -q '^  ha_instance:' "$manifest"; then
    background "ha-check $comp" tools/ha-check.sh "$comp"
  fi
  if [ -d "$dir/esphome" ]; then
    background "esphome-check $comp" tools/esphome-check.sh "$comp"
  fi
done
# ramka 0.2.0: climate, air, plants and photos left out, only the status page (SPEC-011 section 6.2).
background "ha-check ramka (pages left out)" env INPUTS="$ROOT/tests/fixtures/ramka-without-pages.yaml" tools/ha-check.sh ramka
# ramka 0.7.0: plants: discover (SPEC-022).
background "ha-check ramka (plants discover)" env INPUTS="$ROOT/tests/fixtures/ramka-plants-discover.yaml" tools/ha-check.sh ramka
collect
fi
echo "skip demo acceptance (opt-in: run-demo PR label or explicit local demo command)"

echo
if [ ${#failed[@]} -eq 0 ]; then
  if [ "$mode" = full ]; then echo "all checks passed"
  else echo "partial checks passed (HA/ESPHome not run)"
  fi
  exit 0
fi
printf 'failed: %s\n' "${failed[@]}"
exit 1
