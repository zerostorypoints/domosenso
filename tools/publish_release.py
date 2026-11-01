#!/usr/bin/env python3
"""The website's mechanical update for a component's newest tag (SPEC-027).

Usage: uv run tools/publish_release.py <id> [--no-export]

Reads the newest tag `<id>/<version>` and its commit, then in `website/content/`:

- `publication.json`: the component's `version`, `tag` and `commit`;
- `components/*.json`: every view whose `owner` is the component cites the commit; the component's
  own record its `version` and `sourceCommit`;
- `devices/*.json`: a `compatibility` entry for the component names the version;

and runs `tools/export_website.py --verify-remote` (not with --no-export). It changes no text: the
view conditions, setup steps, journal and audit note stay for the pull request (skill
`domosenso-website-audit`). Prints `change <path>` per file and `ok`, or `FAIL <reason>` (exit 1).
A component the website does not list yet fails: its first record is editorial work.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from release_status import dotted, tag_versions

REPO = Path(__file__).resolve().parent.parent


class PublishError(Exception):
    pass


def tag_commit(root: Path, tag: str) -> str:
    out = subprocess.run(["git", "rev-parse", f"{tag}^{{commit}}"], cwd=root, capture_output=True, text=True)
    if out.returncode:
        raise PublishError(f"cannot read the commit of {tag}")
    return out.stdout.strip()


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save(path: Path, data: dict) -> None:
    # The format the content files are kept in: two spaces, UTF-8 as is, a final newline.
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def publish(root: Path, cid: str) -> list[Path]:
    versions = tag_versions(root, cid)
    if not versions:
        raise PublishError(f"no tag {cid}/<version>: fetch the tags, or release first")
    version = dotted(versions[-1])
    tag = f"{cid}/{version}"
    commit = tag_commit(root, tag)
    content = root / "website" / "content"

    changes: dict[Path, dict] = {}
    publication = load(content / "publication.json")
    entries = [c for c in publication["components"] if c["id"] == cid]
    if not entries:
        raise PublishError(f"{cid} is not on the website yet: its first record is editorial work")
    before = json.dumps(publication)
    entries[0].update(version=version, tag=tag, commit=commit)
    if json.dumps(publication) != before:
        changes[content / "publication.json"] = publication

    for path in sorted((content / "components").glob("*.json")):
        record = load(path)
        before = json.dumps(record)
        for view in record.get("views", []):
            if view.get("owner") == cid:
                view["sourceCommit"] = commit
        if record.get("id") == cid:
            record["version"] = version
            record["sourceCommit"] = commit
        if json.dumps(record) != before:
            changes[path] = record

    for path in sorted((content / "devices").glob("*.json")):
        record = load(path)
        before = json.dumps(record)
        for entry in record.get("compatibility", []):
            if entry.get("id") == cid:
                entry["version"] = version
        if json.dumps(record) != before:
            changes[path] = record

    for path, data in changes.items():
        save(path, data)
    return sorted(changes)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("id")
    parser.add_argument("--no-export", action="store_true", help="leave website/src/generated as it is")
    parser.add_argument("--root", type=Path, default=REPO, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        changed = publish(args.root, args.id)
        for path in changed:
            print(f"change {path.relative_to(args.root)}")
        if not args.no_export:
            export = subprocess.run([sys.executable, str(args.root / "tools" / "export_website.py"), "--verify-remote"],
                                    cwd=args.root, capture_output=True, text=True)
            if export.returncode:
                raise PublishError((export.stdout + export.stderr).strip().splitlines()[-1])
    except (PublishError, OSError, KeyError, ValueError) as error:
        print(f"FAIL {error}")
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
