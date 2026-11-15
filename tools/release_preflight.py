#!/usr/bin/env python3
"""Before a merge: would the Release workflow be able to tag every component on this commit?

Usage: uv run tools/release_preflight.py [--hold <id>]... [--changed-since <ref>]

The Release workflow runs tools/release.py only after a merge to main, so a version bump it refuses
blocks every later run until another pull request fixes it. This runs release.py's own rules, and
two that catch work merged under an already tagged version, against the local tags:

- an untagged version is higher than the newest tag;
- a changed contract (`inputs`, `provides`, `artifacts`) since the newest tag has a raised version
  and a `## <version>` heading in `components/<id>/UPGRADE.md` that release.py recognises;
- no UPGRADE.md heading calls a tagged version `(unreleased)`.

With --changed-since only the components with a change under `components/<id>/` since the merge
base with <ref> are checked: a pull request answers for what it touches (Framework checks run it
so against the base branch). Prints `ok <id> <version>` or `FAIL <id>: <reason>` per component and ends with `ok` or
`FAIL <n> refused` (exit 1). Fetch the tags first (a shallow checkout has none: every component then
reads as never released, and only the heading rule applies).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml

from release import SEMVER, contract, git, has_upgrade_entry, newest_earlier_tag

REPO = Path(__file__).resolve().parent.parent


def _version(text: str) -> tuple[int, ...]:
    return tuple(int(n) for n in SEMVER.match(text).groups())


def problems(catalog: Path, component_id: str) -> list[str]:
    component = catalog / "components" / component_id
    manifest = yaml.safe_load((component / "component.yaml").read_text(encoding="utf-8"))
    version = str(manifest.get("version", ""))
    if not SEMVER.match(version):
        return [f"version {version!r} is not X.Y.Z"]
    upgrade = component / "UPGRADE.md"
    found = []

    tagged = set(git(catalog, "tag", "-l", f"{component_id}/*").stdout.split())
    if upgrade.is_file():
        for line in upgrade.read_text(encoding="utf-8").splitlines():
            match = re.match(r"^##\s+(\d+\.\d+\.\d+)\s*\(unreleased\)", line)
            if match and f"{component_id}/{match[1]}" in tagged:
                found.append(f"UPGRADE.md calls {match[1]} unreleased, but {component_id}/{match[1]} is tagged: "
                             f"date the heading, and put work merged after the tag under a new version")

    newest = newest_earlier_tag(catalog, component_id)
    if not newest:
        return found
    newest_version = newest.split("/", 1)[1]
    shown = git(catalog, "show", f"{newest}:components/{component_id}/component.yaml")
    if shown.returncode:
        return found + [f"cannot read the manifest at {newest}"]
    changed = contract(yaml.safe_load(shown.stdout)) != contract(manifest)

    if version == newest_version:
        if changed:
            found.append(f"the contract changed since {newest}, but the version is still {version}: raise it")
        return found
    if f"{component_id}/{version}" in tagged:
        return found  # an older version checked out; nothing to release from here
    if _version(version) < _version(newest_version):
        found.append(f"version {version} is lower than the newest tag {newest}")
    elif changed and not has_upgrade_entry(upgrade, version):
        found.append(f"the contract changed since {newest}: add a '## {version}' heading (a space or the line's "
                     f"end after the version) to components/{component_id}/UPGRADE.md")
    return found


def changed_components(catalog: Path, ref: str) -> set[str]:
    base = git(catalog, "merge-base", ref, "HEAD")
    if base.returncode:
        raise SystemExit(f"FAIL cannot find the merge base with {ref}")
    names = git(catalog, "diff", "--name-only", base.stdout.strip(), "HEAD", "--", "components").stdout.split()
    return {name.split("/")[1] for name in names if name.count("/") >= 2}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--hold", action="append", default=[], help="a component not to be released yet")
    parser.add_argument("--changed-since", metavar="REF", help="check only the components changed since the merge base with REF")
    parser.add_argument("--root", type=Path, default=REPO, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    only = changed_components(args.root, args.changed_since) if args.changed_since else None
    refused = 0
    for path in sorted((args.root / "components").glob("*/component.yaml")):
        component_id = path.parent.name
        if only is not None and component_id not in only:
            continue
        if component_id in args.hold:
            print(f"hold {component_id}")
            continue
        found = problems(args.root, component_id)
        if found:
            refused += 1
            for reason in found:
                print(f"FAIL {component_id}: {reason}")
        else:
            print(f"ok {component_id} {yaml.safe_load(path.read_text(encoding='utf-8')).get('version')}")
    if refused:
        print(f"FAIL {refused} refused")
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
