#!/usr/bin/env python3
"""The catalog index the Ramka's About page links with (SPEC-023).

Writes components/ramka/shell/domosenso_catalog.json: every component of the catalog (and whether
domosenso.org publishes its page), every device with its English name, whether the site has its
page, and the match rules of devices/*.yaml that tell a Home Assistant device as that device
(SPEC-010). The About page's discovery (shell/domosenso_discover.py) runs inside Home Assistant,
without the catalog or the internet, so the index ships with the Ramka and is current at its tag.

    uv run tools/catalog_index.py           # write it
    uv run tools/catalog_index.py --check   # exit 1 when the file differs (pytest runs this)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "components" / "ramka" / "shell" / "domosenso_catalog.json"
SITE = "https://domosenso.org"
REPOSITORY = "https://github.com/zerostorypoints/domosenso"


def build(root: Path = ROOT) -> dict:
    publication = json.loads((root / "website" / "content" / "publication.json").read_text(encoding="utf-8"))
    published = {c["id"] for c in publication.get("components", [])}
    components = {}
    for manifest in sorted((root / "components").glob("*/component.yaml")):
        cid = manifest.parent.name
        components[cid] = {"page": cid in published}
    devices = []
    for path in sorted((root / "devices").glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        devices.append({
            "id": data["id"],
            "name": (data.get("names") or {}).get("en", data["id"]),
            "page": (root / "website" / "content" / "devices" / f"{data['id']}.json").is_file(),
            "match": data.get("match") or [],
        })
    return {"site": SITE, "repository": REPOSITORY, "components": components, "devices": devices}


def render(root: Path = ROOT) -> str:
    return json.dumps(build(root), indent=1, ensure_ascii=False, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail when the file is not what the catalog gives")
    args = parser.parse_args()
    text = render()
    if args.check:
        current = OUT.read_text(encoding="utf-8") if OUT.is_file() else ""
        if current != text:
            print(f"FAIL {OUT.relative_to(ROOT)} is stale: run uv run tools/catalog_index.py")
            return 1
        print("ok")
        return 0
    OUT.write_text(text, encoding="utf-8")
    print(f"write {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
