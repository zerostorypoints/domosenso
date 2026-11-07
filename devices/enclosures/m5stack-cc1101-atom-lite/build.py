# /// script
# requires-python = ">=3.11"
# ///
"""Export the enclosure's printable parts (stl/) and preview images (preview/) with OpenSCAD.

Usage: uv run build.py [-D name=value ...]
Every -D is passed on to OpenSCAD, e.g. -D 'pins_used=[1,7,8,9,11,20,22,28]'.
The variants (clamp_12mm) are exported only without -D: they belong to the default box.
OpenSCAD is found through $OPENSCAD, then PATH, then the macOS app bundle.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCAD = HERE / "enclosure.scad"

PARTS = ["base", "base_wall", "lid", "lid_inlay_parts", "clamp"]

# name: (part, its own -D values); the same box, a clamp for shorter female housings
VARIANTS = {"clamp_12mm": ("clamp", ["clamp_housing_len=12"])}

# name: (part, camera eye x,y,z, centre x,y,z)
VIEWS = {
    "closed": ("assembly", "175,-150,150,45,28,15"),
    "open": ("assembly_open", "105,-95,190,45,28,12"),
    "section": ("section", "45,-175,40,45,30,19"),
    "exploded": ("explode", "200,-185,190,45,28,38"),
    "back": ("assembly", "-70,220,120,45,28,30"),
    "top": ("assembly", "45,0,290,45,28,20"),
    "plate": ("plate_all", "10,-60,200,10,0,0"),
}


def openscad() -> str:
    for candidate in (
        os.environ.get("OPENSCAD"),
        shutil.which("openscad"),
        "/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD",
    ):
        if candidate and Path(candidate).exists():
            return candidate
    sys.exit("OpenSCAD not found: install it or set OPENSCAD")


def run(exe: str, out: Path, part: str, defines: list[str], extra: list[str]) -> None:
    out.parent.mkdir(exist_ok=True)
    cmd = [exe, "-o", str(out), "-D", f'part="{part}"', *defines, *extra, str(SCAD)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    log = result.stdout + result.stderr
    if result.returncode != 0 or "ERROR" in log or "WARNING" in log:
        sys.exit(f"FAIL {out.name}\n{log}")
    print(f"ok {out.relative_to(HERE)}")


def main() -> None:
    exe = openscad()
    defines: list[str] = []
    args = sys.argv[1:]
    while args:
        flag = args.pop(0)
        if flag == "-D" and args:
            defines += ["-D", args.pop(0)]
        else:
            sys.exit(__doc__)
    for part in PARTS:
        run(exe, HERE / "stl" / f"{part}.stl", part, defines, ["--export-format", "binstl"])
    for name, (part, own) in (VARIANTS.items() if not defines else []):
        own_defines = [arg for value in own for arg in ("-D", value)]
        run(exe, HERE / "stl" / f"{name}.stl", part, defines + own_defines, ["--export-format", "binstl"])
    for name, (part, camera) in VIEWS.items():
        run(
            exe,
            HERE / "preview" / f"{name}.png",
            part,
            defines,
            ["--render", "--imgsize=1600,1200", f"--camera={camera}", "--projection=p", "--colorscheme=Tomorrow"]
            + (["--viewall", "--autocenter"] if part == "plate_all" else []),
        )


if __name__ == "__main__":
    main()
