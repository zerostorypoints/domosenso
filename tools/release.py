#!/usr/bin/env python3
"""Tag a component release: an annotated git tag `<id>/<version>` at HEAD.

Usage: uv run tools/release.py <id> [--skip-checks]

The `domosenso` command reads components only from these tags. Refuses when
- the component's directory has uncommitted changes (the tag would not match what is installed);
- the tag `<id>/<version>` already exists (a published version is never moved);
- the contract (`inputs`, `provides`, `artifacts`) differs from the newest earlier tag of the
  component and `components/<id>/UPGRADE.md` has no `## <version>` heading;
- `tools/check-all.sh` fails (unless --skip-checks).

Prints `tag <id>/<version> at <short sha>` and `ok`, or `FAIL <reason>` (exit 1). Never pushes.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
CONTRACT_KEYS = ("inputs", "provides", "artifacts")
SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


class ReleaseError(Exception):
    pass


def git(catalog: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=catalog, capture_output=True, text=True)


def newest_earlier_tag(catalog: Path, component_id: str) -> str | None:
    """The `<id>/X.Y.Z` tag with the highest version, compared numerically."""
    names = git(catalog, "tag", "-l", f"{component_id}/*").stdout.split()
    versions = []
    for name in names:
        m = SEMVER.match(name.split("/", 1)[1])
        if m:
            versions.append((tuple(map(int, m.groups())), name))
    return max(versions)[1] if versions else None


def contract(manifest: dict) -> dict:
    return {key: manifest.get(key) for key in CONTRACT_KEYS}


def has_upgrade_entry(upgrade_md: Path, version: str) -> bool:
    if not upgrade_md.is_file():
        return False
    heading = re.compile(rf"^##\s+{re.escape(version)}(\s|$)", re.M)
    return bool(heading.search(upgrade_md.read_text(encoding="utf-8")))


def release(catalog: Path, component_id: str, skip_checks: bool = False) -> str:
    catalog = Path(catalog)
    component = catalog / "components" / component_id
    manifest_path = component / "component.yaml"
    if not manifest_path.is_file():
        raise ReleaseError(f"components/{component_id}/component.yaml not found")
    manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    version = str(manifest.get("version", ""))
    if not SEMVER.match(version):
        raise ReleaseError(f"components/{component_id}/component.yaml: version {version!r} is not X.Y.Z")
    tag = f"{component_id}/{version}"

    dirty = git(catalog, "status", "--porcelain", "--", f"components/{component_id}").stdout.strip()
    if dirty:
        raise ReleaseError(f"uncommitted changes under components/{component_id}/:\n{dirty}")
    if git(catalog, "rev-parse", "-q", "--verify", f"refs/tags/{tag}").returncode == 0:
        raise ReleaseError(f"{tag} exists")

    earlier = newest_earlier_tag(catalog, component_id)
    if earlier:
        shown = git(catalog, "show", f"{earlier}:components/{component_id}/component.yaml")
        if shown.returncode != 0:
            raise ReleaseError(f"cannot read the manifest at {earlier}: {shown.stderr.strip()}")
        if contract(yaml.safe_load(shown.stdout)) != contract(manifest) and not has_upgrade_entry(
            component / "UPGRADE.md", version
        ):
            raise ReleaseError(
                f"the contract changed since {earlier}: add a '## {version}' entry to "
                f"components/{component_id}/UPGRADE.md"
            )

    if not skip_checks:
        script = catalog / "tools" / "check-all.sh"
        result = subprocess.run(["bash", str(script)], cwd=catalog, capture_output=True, text=True)
        if result.returncode != 0:
            tail = "\n".join((result.stdout + result.stderr).strip().splitlines()[-15:])
            raise ReleaseError(f"check-all failed (exit {result.returncode}):\n{tail}")

    made = git(catalog, "tag", "-a", tag, "-m", f"{component_id} {version}")
    if made.returncode != 0:
        raise ReleaseError(f"git tag failed: {made.stderr.strip()}")
    return tag


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Tag a component release (annotated tag <id>/<version> at HEAD).")
    parser.add_argument("id", help="component id")
    parser.add_argument("--skip-checks", action="store_true", help="do not run tools/check-all.sh first")
    args = parser.parse_args(argv)
    try:
        tag = release(REPO, args.id, skip_checks=args.skip_checks)
    except ReleaseError as exc:
        print(f"FAIL {exc}")
        return 1
    sha = git(REPO, "rev-parse", "--short", f"{tag}^{{commit}}").stdout.strip()
    print(f"tag {tag} at {sha}")
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
