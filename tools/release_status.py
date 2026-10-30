#!/usr/bin/env python3
"""Which components on this commit still wait for a release step: a tag, or the website.

Usage: uv run tools/release_status.py [--hold <id>]... [--format lines|markdown]

For every `components/<id>/component.yaml` it compares the manifest's version with the component's
tags `<id>/<version>` and with the version `website/content/publication.json` selects:

- `untagged <id> <version>`: no tag `<id>/<version>`; make it with tools/release.py once merged;
- `unpublished <id> <tag version> (site <version|none>)`: the newest tag is not what the site shows;
- `hold <id> <version>`: named with --hold (development work, not to be released yet); not counted;
- `released <id> <version>`: tagged and published.

Ends with `ok` or `FAIL <n> pending` (exit 1). Reads the local tags: fetch them first. Merging,
tagging and publishing stay human decisions (AGENTS.md); this only says what is left.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def tag_versions(root: Path, cid: str) -> list[tuple[int, ...]]:
    out = subprocess.run(["git", "tag", "--list", f"{cid}/*"], cwd=root, capture_output=True, text=True, check=True).stdout
    versions = []
    for tag in out.split():
        match = SEMVER.match(tag.removeprefix(f"{cid}/"))
        if match:
            versions.append(tuple(int(n) for n in match.groups()))
    return sorted(versions)


def dotted(version: tuple[int, ...]) -> str:
    return ".".join(map(str, version))


def status(root: Path, hold: set[str]) -> list[tuple[str, str]]:
    publication = json.loads((root / "website/content/publication.json").read_text(encoding="utf-8"))
    site = {c["id"]: c["version"] for c in publication["components"]}
    lines = []
    for path in sorted((root / "components").glob("*/component.yaml")):
        manifest = yaml.safe_load(path.read_text(encoding="utf-8"))
        cid, version = manifest["id"], str(manifest["version"])
        if cid in hold:
            lines.append(("hold", f"{cid} {version}"))
            continue
        tags = tag_versions(root, cid)
        pending = False
        if version not in {dotted(t) for t in tags}:
            lines.append(("untagged", f"{cid} {version}"))
            pending = True
        if tags and site.get(cid) != dotted(tags[-1]):
            lines.append(("unpublished", f"{cid} {dotted(tags[-1])} (site {site.get(cid) or 'none'})"))
            pending = True
        if not pending:
            lines.append(("released", f"{cid} {version}"))
    return lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--hold", action="append", default=[], metavar="ID")
    parser.add_argument("--format", choices=("lines", "markdown"), default="lines")
    parser.add_argument("--root", type=Path, default=REPO, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        lines = status(args.root, set(args.hold))
    except (OSError, KeyError, ValueError, yaml.YAMLError, subprocess.CalledProcessError) as error:
        print(f"FAIL {error}")
        return 1
    pending = sum(kind in ("untagged", "unpublished") for kind, _ in lines)
    if args.format == "markdown":
        print("| state | component |\n|---|---|")
        for kind, text in lines:
            print(f"| {kind} | `{text}` |")
    else:
        for kind, text in lines:
            print(f"{kind} {text}")
    print(f"FAIL {pending} pending" if pending else "ok")
    return 1 if pending else 0


if __name__ == "__main__":
    sys.exit(main())
