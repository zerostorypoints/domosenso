#!/usr/bin/env bash
# Validate (and optionally compile) a component's ESPHome files the way a home would use them:
# the thin device files pull the package from a git remote at a tag. The remote here is a
# throwaway local repo built from the working tree (file:// URL), so nothing has to be published;
# github:// is the same code path with another URL. Secrets are fake.
#
#   tools/esphome-check.sh <component> [compile <device-file>...]
#
# Run from the repository root. Reads the instance from examples/demo-home/esphome/ and checks
# only the device files that pull a package of <component>. A component without esphome/ has
# nothing to check (exit 0). Needs uv (uvx esphome). Flashes nothing.
set -euo pipefail
shopt -s nullglob
COMP=${1:?component id}; shift
MODE=${1:-config}; [ $# -gt 0 ] && shift
ESPHOME_VERSION=${ESPHOME_VERSION:-2026.9.1}
SRC=$(pwd)
CDIR=$SRC/components/$COMP
INSTANCE=$SRC/examples/demo-home/esphome
[ -f "$CDIR/component.yaml" ] || { echo "no component $COMP" >&2; exit 2; }
if [ ! -d "$CDIR/esphome" ]; then echo "$COMP has no esphome/: nothing to check"; exit 0; fi
VERSION=$(sed -n 's/^version: *//p' "$CDIR/component.yaml")
TAG="$COMP/$VERSION"
# One work dir per checkout: git worktrees run checks side by side and must not share it.
ROOT_ID=$(printf %s "$SRC" | { shasum -a 256 2>/dev/null || sha256sum; } | cut -c1-8)
WORK=${TMPDIR:-/tmp}/domosenso-esphome-check/$ROOT_ID/$COMP
rm -rf "$WORK"; mkdir -p "$WORK/remote" "$WORK/home"

# 1. A git "catalog" with the component at its tag.
mkdir -p "$WORK/remote/components"
cp -R "$CDIR" "$WORK/remote/components/"
git -C "$WORK/remote" init -q
git -C "$WORK/remote" add -A
git -C "$WORK/remote" -c user.name=check -c user.email=check@localhost commit -qm "$TAG"
git -C "$WORK/remote" tag "$TAG"

# 2. The home: device files with the github:// shorthand rewritten to the long form on file://.
# Only the device files that use one of this component's packages.
python3 - "$INSTANCE" "$WORK/home" "$WORK/remote" "$COMP" <<'PY'
import pathlib, re, sys
src, dst, remote = map(pathlib.Path, sys.argv[1:4])
comp = sys.argv[4]
pat = re.compile(r"^(\s+)(\w+): github://zerostorypoints/domosenso/(\S+)@(\S+)$", re.M)
for f in sorted(src.glob("*.yaml")):
    if f"github://zerostorypoints/domosenso/components/{comp}/" not in f.read_text():
        print(f"skipped      {f.name} (no package of {comp})")
        continue
    text = pat.sub(lambda m: f"{m[1]}{m[2]}:\n{m[1]}  url: file://{remote}\n{m[1]}  ref: {m[4]}\n"
                             f"{m[1]}  files: [{m[3]}]\n{m[1]}  refresh: 0s", f.read_text())
    (dst / f.name).write_text(text)
PY
KEY=$(python3 -c 'import base64,os;print(base64.b64encode(os.urandom(32)).decode())')
printf 'wifi_ssid: "check"\nwifi_password: "check-password"\napi_encryption_key: "%s"\n' "$KEY" > "$WORK/home/secrets.yaml"
# The factory image includes the package locally; build it from a copy so .esphome/ stays out of
# the catalog.
cp -R "$CDIR/esphome" "$WORK/factory"

ESPHOME=(uvx --from "esphome==$ESPHOME_VERSION" esphome)
fail=0
# 3. The factory image and every device file. A package alone is not checked: without a device
# file it may lack required blocks (ble-proxy.yaml has no Wi-Fi network on purpose).
for f in "$WORK"/factory/*.factory.yaml "$WORK"/home/*.yaml; do
  [ "$(basename "$f")" = secrets.yaml ] && continue
  if "${ESPHOME[@]}" config "$f" > "$WORK/$(basename "$f").out" 2>&1; then echo "config ok    $f"
  else echo "config FAIL  $f (see $WORK/$(basename "$f").out)"; fail=1; fi
done
if [ "$MODE" = compile ]; then
  for name in "$@"; do
    f=$WORK/home/$name; [ -f "$f" ] || f=$WORK/factory/$name
    if "${ESPHOME[@]}" compile "$f" > "$WORK/$name.compile.out" 2>&1; then
      echo "compile ok   $f: $(grep -E '^(RAM|Flash):' "$WORK/$name.compile.out" | tr -s ' ' | tr '\n' ' ')"
    else echo "compile FAIL $f (see $WORK/$name.compile.out)"; fail=1; fi
  done
fi
echo "work dir: $WORK"
exit $fail
