#!/usr/bin/env python3
"""Copy a component's installable files into a Home Assistant config directory.

Usage: uv run tools/domosenso_install.py components/<id> --config <config dir> [--dry-run]

- the cards, what they import and translations/ go to <config>/<install_path>, i.e.
  www/domosenso/<id>/<version>/, keeping their paths from the component directory;
- artifacts.shell files go to <config>/shell/, artifacts.themes files to <config>/themes/.

Prints each file written and then the Lovelace resource URLs (type module) the cards need. An
existing home updates its resources to those URLs in place (lovelace/resources/update); an older
version directory can be deleted once nothing loads it. Templates are rendered separately
(tools/domosenso_render.py).
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

import yaml

from catalog_check import install_dir, install_files, install_version, versioned


def plan(component_dir: Path) -> tuple[list[tuple[Path, str, str | None]], list[str]]:
    """([(source, destination relative to the config dir, the version its imports get or None)],
    [resource URL])."""
    component_dir = Path(component_dir)
    manifest = yaml.safe_load((component_dir / "component.yaml").read_text(encoding="utf-8"))
    artifacts = manifest.get("artifacts") or {}
    copies: list[tuple[Path, str, str | None]] = []
    resources: list[str] = []
    target = install_dir(manifest)
    if target:
        version = install_version(component_dir, manifest)
        for rel in install_files(component_dir, manifest):
            copies.append((component_dir / rel, f"{target}{rel}", version))
        www = target.removeprefix("www/")
        resources = [f"/local/{www}{c}?v={version}" for c in artifacts.get("dashboard_cards") or [] if c.endswith(".js")]
    for key in ("shell", "themes"):
        for rel in artifacts.get(key) or []:
            copies.append((component_dir / rel, f"{key}/{Path(rel).name}", None))
    return copies, resources


def install(component_dir: Path, config: Path, dry_run: bool = False) -> tuple[list[Path], list[str]]:
    copies, resources = plan(component_dir)
    written = []
    for source, rel, version in copies:
        dest = Path(config) / rel
        if not dry_run:
            dest.parent.mkdir(parents=True, exist_ok=True)
            if version is None:
                shutil.copyfile(source, dest)
            else:
                dest.write_bytes(versioned(rel, source.read_bytes(), version))
        written.append(dest)
    return written, resources


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("component_dir", type=Path)
    parser.add_argument("--config", type=Path, required=True, help="the Home Assistant config directory")
    parser.add_argument("--dry-run", action="store_true", help="print what would be written")
    args = parser.parse_args(argv)
    if not (args.component_dir / "component.yaml").is_file():
        print(f"error: {args.component_dir}: no component.yaml", file=sys.stderr)
        return 1
    written, resources = install(args.component_dir, args.config, args.dry_run)
    for path in written:
        print(path)
    for url in resources:
        print(f"resource (module): {url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
