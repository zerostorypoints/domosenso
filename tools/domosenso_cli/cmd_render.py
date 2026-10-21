"""`domosenso render [<id>...] [--force] [--catalog-dev <path>]`: write the locked components into the home.

A component is read from the tag the lock names (the lock's commit must still be what the tag resolves
to). With `--catalog-dev` it is read from a catalog working tree instead, stamped `-dirty`, and the lock
is left alone: that is how a catalog change is tried in a home before it is tagged.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from domosenso_cli.build import (
    file_records, git_short_head, load_manifest, open_catalog, plan_outputs, resource_urls, write_outputs,
)
from domosenso_cli.catalog import dev_dir
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.lock import Lock
from domosenso_cli.report import Reporter


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("ids", nargs="*", metavar="<id>", help="components to render (default: every locked one)")
    parser.add_argument("--force", action="store_true", help="overwrite hand-edited and unmanaged files")
    parser.add_argument("--catalog-dev", type=Path, metavar="<path>",
                        help="read components from a catalog working tree: dirty stamp, lock untouched")


def run(args: argparse.Namespace, rep: Reporter) -> int:
    home = HomeConfig.load(args.home)
    lock = Lock.load(args.home)
    dev = args.catalog_dev
    ids = list(args.ids) or [cid for cid in home.components if cid in lock.components]
    for cid in ids:
        if cid not in home.components:
            raise DomosensoError(f"{cid} is not in domosenso.yaml")
        if cid not in lock.components and dev is None:
            raise DomosensoError(f"{cid} is not in domosenso.lock: add it first")
    catalog = None if dev else open_catalog(home)
    for cid in ids:
        entry = home.components[cid]
        if dev:
            component_dir = dev_dir(dev, cid)
            version = load_manifest(component_dir).get("version")
            outputs = plan_outputs(home, entry, component_dir, version, git_short_head(dev), dirty=True)
            _report(rep, write_outputs(home, lock, cid, outputs, args.force, dev=True))
            continue
        locked = lock.components[cid]
        component_dir = catalog.checkout(cid, locked.version, locked.commit)
        outputs = plan_outputs(home, entry, component_dir, locked.version, locked.commit)
        _report(rep, write_outputs(home, lock, cid, outputs, args.force))
        for stale in sorted(set(locked.files) - {o.dest for o in outputs}):
            rep.line("stale", stale)
        locked.files = file_records(home, outputs)
        locked.resources = resource_urls(component_dir)
        lock.save(args.home)  # per component: files already written stay described if a later one fails
    return rep.ok()


def _report(rep: Reporter, actions: list[tuple[str, str]]) -> None:
    for action, dest in actions:
        rep.line(action, dest)
