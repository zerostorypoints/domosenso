# /// script
# requires-python = ">=3.11"
# ///
"""Export the mount with OpenSCAD; no Python packages or printer profile required."""

import argparse
import os
import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
PARTS = (
    "tower", "head", "radar_keeper", "atom_cradle", "atom_keeper", "stand", "clamp", "clamp_wedge",
    "base_key", "head_key", "fit_coupon", "dock_coupon",
)
VIEWS = ("assembly_stand", "assembly_clamp", "explode_stand", "explode_clamp", "view_wires")
BLOCKER_PARTS = ("radar_keeper", "tower", "head", "atom_cradle", "stand", "clamp", "fit_coupon", "dock_coupon")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-D", dest="defines", action="append", default=[],
                        metavar="NAME=VALUE", help="OpenSCAD parameter override (repeatable)")
    parser.add_argument("--out", type=Path, default=HERE,
                        help="output directory, with stl/ and preview/ subdirectories")
    parser.add_argument("--part", choices=PARTS, action="append",
                        help="export only these printable parts; skips assembly previews")
    parser.add_argument("--no-preview", action="store_true", help="export meshes only")
    parser.add_argument("--support-blockers", action="store_true",
                        help="also export non-printing support blockers into blockers/")
    args = parser.parse_args()
    exe = os.environ.get("OPENSCAD") or shutil.which("openscad")
    if not exe:
        app = Path("/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD")
        exe = str(app) if app.exists() else None
    if not exe:
        parser.error("OpenSCAD not found: install it or set OPENSCAD")
    if any(value.split("=", 1)[0].strip() == "part" for value in args.defines):
        parser.error("use --part to select a printable part; -D part is reserved")
    defines = [item for value in args.defines for item in ("-D", value)]

    def export(part: str, target: Path, extra: list[str], source: str = "enclosure.scad") -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        # Keep an existing deliverable intact if compilation fails.
        temporary = target.with_name(target.stem + ".building" + target.suffix)
        command = [exe, "--backend=Manifold", "-o", str(temporary), *defines, "-D", f'part="{part}"',
                   *extra, str(HERE / source)]
        try:
            result = subprocess.run(command, capture_output=True, text=True)
            log = result.stdout + result.stderr
            if result.returncode or "ERROR:" in log or "WARNING:" in log:
                raise SystemExit(f"Failed to export {part}:\n{log}")
            if not temporary.exists() or not temporary.stat().st_size:
                raise SystemExit(f"OpenSCAD produced no geometry for {part}")
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        print(f"ok {target}")

    for part in args.part or PARTS:
        export(part, args.out / "stl" / f"{part}.stl", ["--export-format", "binstl"])
        if args.support_blockers and part in BLOCKER_PARTS:
            export("support_blockers", args.out / "blockers" / f"{part}.stl",
                   ["--export-format", "binstl", "-D", f'blocker_part="{part}"'],
                   "support-blockers.scad")
    if not args.part and not args.no_preview:
        for part in VIEWS:
            export(part, args.out / "preview" / f"{part}.png", [
                "--render", "--imgsize=1600,1200", "--viewall", "--autocenter",
                "--camera=140,-180,130,0,0,40", "--projection=p", "--colorscheme=Tomorrow",
            ])


if __name__ == "__main__":
    main()
