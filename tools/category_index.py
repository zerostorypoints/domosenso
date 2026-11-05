#!/usr/bin/env python3
"""The device categories the floor plan card ships with (SPEC-028 Amendment 5).

Writes components/floorplan/cards/lib/categories.json: categories/*.yaml by order, each with the
rules of the kinds and devices it names resolved (tools/domosenso_cli/categories.py). The card runs
in a browser without the catalog, so the index ships with the component and is current at its tag.
The pocket groups an area's sensors by the same categories and ships the same file (COPIES), with
verbatim copies of the floor plan's lib/categories.js and lib/shared.js (LIB_COPIES: the rule
engine, the scan form and the plan's place in the dashboard), so the two never drift apart.

    uv run tools/category_index.py           # write it
    uv run tools/category_index.py --check   # exit 1 when the file differs (pytest runs this)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from domosenso_cli.categories import build  # noqa: E402

OUT = ROOT / "components" / "floorplan" / "cards" / "lib" / "categories.json"
COPIES = [ROOT / "components" / "pocket" / "cards" / "lib" / "categories.json"]
_FLOORPLAN_LIB = ROOT / "components" / "floorplan" / "cards" / "lib"
_POCKET_LIB = ROOT / "components" / "pocket" / "cards" / "lib"
LIB_COPIES = [(_FLOORPLAN_LIB / name, _POCKET_LIB / name) for name in ("categories.js", "shared.js")]


def _shown(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def render(root: Path = ROOT) -> str:
    return json.dumps(build(root), indent=1, ensure_ascii=False, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail when the file is not what the catalog gives")
    args = parser.parse_args()
    text = render()
    wanted = [(out, text) for out in [OUT, *COPIES]]
    wanted += [(copy, source.read_text(encoding="utf-8")) for source, copy in LIB_COPIES]
    if args.check:
        for out, content in wanted:
            current = out.read_text(encoding="utf-8") if out.is_file() else ""
            if current != content:
                print(f"FAIL {_shown(out)} is stale: run uv run tools/category_index.py")
                return 1
        print("ok")
        return 0
    for out, content in wanted:
        out.write_text(content, encoding="utf-8")
        print(f"write {_shown(out)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
