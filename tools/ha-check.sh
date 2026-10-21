#!/usr/bin/env bash
# Run Home Assistant's check_config against a component, in the HA container image, on a fresh
# home: a minimal configuration.yaml, the component's blueprints, what tools/domosenso_install.py
# copies (cards under www/domosenso/<id>/<version>/, artifacts.shell into shell/, artifacts.themes
# into themes/, loaded through frontend: themes:), the demo home's instance file
# (artifacts.ha_instance in component.yaml) and, for a component with templates/, what
# tools/domosenso_render.py writes from examples/demo-home/inputs/<component>.yaml: packages go to
# packages/<component>[_<name>].yaml, dashboard.<lang>.yaml files become YAML dashboards.
#
#   tools/ha-check.sh <component>
#
# Run from the repository root. Needs docker. Talks to no Home Assistant instance. Exits non-zero
# when the fresh home has an error.
#
# check_config counts an invalid template-blueprint instance as an error, but an invalid
# automation-blueprint instance only as a log line ("Blueprint ... generated invalid automation"),
# with exit code 0 even under --fail-on-warnings (HA 2026.9.2). Those lines are counted here.
set -uo pipefail
COMP=${1:?component id}
HA_VERSION=${HA_VERSION:-2026.9.2}
ROOT=$(pwd)
SRC=$ROOT/components/$COMP
INPUTS=$ROOT/examples/demo-home/inputs/$COMP.yaml
WORK=${TMPDIR:-/tmp}/domosenso-ha-check/$COMP
rm -rf "$WORK"; mkdir -p "$WORK"
[ -f "$SRC/component.yaml" ] || { echo "no component $COMP" >&2; exit 2; }

# artifacts.ha_instance, a path from the repository root (one line in the manifest).
HA_INSTANCE=$(sed -n 's/^  ha_instance: *\([^ #]*\).*/\1/p' "$SRC/component.yaml")

render_component() {  # renders templates/ into $WORK/rendered
  [ -d "$SRC/templates" ] || return 0
  [ -f "$INPUTS" ] || { echo "$COMP has templates/ but no $INPUTS" >&2; exit 2; }
  uv run --project "$ROOT" "$ROOT/tools/domosenso_render.py" "$SRC" --inputs "$INPUTS" --out "$WORK/rendered" > /dev/null \
    || { echo "render failed" >&2; exit 1; }
}

install_component() {  # $1 = config dir
  mkdir -p "$1/blueprints" "$1/packages" "$1/dashboards" "$1/www"
  [ -d "$SRC/ha/blueprints" ] && cp -R "$SRC/ha/blueprints/." "$1/blueprints/"
  uv run --project "$ROOT" "$ROOT/tools/domosenso_install.py" "$SRC" --config "$1" > /dev/null \
    || { echo "install failed" >&2; exit 1; }
  [ -n "$HA_INSTANCE" ] && cp "$ROOT/$HA_INSTANCE" "$1/packages/"
  [ -d "$WORK/rendered" ] || return 0
  local f name
  for f in "$WORK"/rendered/*.yaml; do
    name=$(basename "$f" .yaml)
    case "$name" in
      dashboard.*)
        cp "$f" "$1/dashboards/$COMP.${name#dashboard.}.yaml" ;;
      package) cp "$f" "$1/packages/${COMP//-/_}.yaml" ;;
      *) cp "$f" "$1/packages/${COMP//-/_}_$name.yaml" ;;
    esac
  done
  # A folder sensor's path must exist (cv.isdir), so make the ones under /config.
  uv run --project "$ROOT" python - "$1" <<'PY'
import sys, pathlib, yaml
config = pathlib.Path(sys.argv[1])
for package in (config / "packages").glob("*.yaml"):
    data = yaml.safe_load(package.read_text()) or {}
    for entry in data.get("sensor") or []:
        folder = entry.get("folder") if entry.get("platform") == "folder" else None
        if folder and folder.startswith("/config/"):
            (config / folder[len("/config/"):]).mkdir(parents=True, exist_ok=True)
PY
}

write_configuration() {  # $1 = config dir
  {
    printf 'homeassistant:\n  packages: !include_dir_named packages\n  allowlist_external_dirs: [/config/www]\n'
    [ -d "$1/themes" ] && printf 'frontend:\n  themes: !include_dir_merge_named themes\n'
    local d first=1
    for d in "$1"/dashboards/*.yaml; do
      [ -e "$d" ] || continue
      if [ $first = 1 ]; then printf 'lovelace:\n  dashboards:\n'; first=0; fi
      local slug; slug=$(basename "$d" .yaml | tr '._' '--')
      printf '    dashboard-%s:\n      mode: yaml\n      title: %s\n      filename: dashboards/%s\n' "$slug" "$slug" "$(basename "$d")"
    done
  } > "$1/configuration.yaml"
}

check() {  # $1 = label, $2 = config dir
  docker run --rm -v "$2:/config" --entrypoint python "homeassistant/home-assistant:$HA_VERSION" \
    -m homeassistant --script check_config -c /config --json > "$WORK/$1.json" 2> "$WORK/$1.err"
  python3 - "$1" "$WORK/$1.json" "$WORK/$1.err" <<'PY'
import json, re, sys
label, path, err = sys.argv[1:]
text = open(path).read()
# Log lines go to stdout ahead of the JSON document.
logged = re.findall(r"^ERROR:.*generated invalid .*$", text, re.M)
try:
    r = json.loads(text[re.search(r"^\{$", text, re.M).start():])
except Exception as e:
    print(f"{label}: no JSON output ({e})"); open(f"{path}.count", "w").write("999"); sys.exit(0)
n = r.get("total_errors", 0) + len(logged)
print(f"{label}: {n} errors ({len(logged)} from blueprint log lines), {r.get('total_warnings', 0)} warnings")
for kind in ("errors", "warnings"):
    for domain, msgs in (r.get(kind) or {}).items():
        for m in msgs:
            print(f"  {kind[:-1]} [{domain}] {str(m)[:300]}")
for line in logged:
    print(f"  error [log] {line[:300]}")
open(f"{path}.count", "w").write(str(n))
PY
}
count() { cat "$WORK/$1.json.count"; }

# fresh
render_component
F=$WORK/fresh; mkdir -p "$F"
install_component "$F"
write_configuration "$F"
check fresh "$F"

echo "work dir: $WORK"
[ "$(count fresh)" -eq 0 ]
