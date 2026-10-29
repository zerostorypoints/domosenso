"""`domosenso render [<id>...] [--force] [--catalog-dev <path>]`: write the locked components into the home.

A component is read from the tag the lock names (the lock's commit must still be what the tag resolves
to). With `--catalog-dev` it is read from a catalog working tree instead, stamped `-dirty`, and the lock
is left alone: that is how a catalog change is tried in a home before it is tagged. What such a render
wrote goes into `.domosenso/dev-render.json` instead, for `deploy` (SPEC-019 B); a render from the tag
removes the component's entry there.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from domosenso_cli import dev_render
from domosenso_cli.build import (
    file_records, file_sha, git_short_head, load_manifest, open_catalog, own_dev_files, plan_outputs, resource_urls,
    sha256,
    write_outputs,
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
    render_ids(home, lock, ids, args.force, dev, rep)
    return rep.ok()


def render_ids(home: HomeConfig, lock: Lock, ids: list[str], force: bool, dev: Path | None, rep: Reporter) -> None:
    """Render each of `ids` (declared in domosenso.yaml; locked unless `dev`) at its locked tag, or from `dev`."""
    catalog = None if dev else open_catalog(home)
    for cid in ids:
        if dev:
            component_dir = dev_dir(dev, cid)
            version = load_manifest(component_dir).get("version")
            head = git_short_head(dev)
            outputs = plan_outputs(home, home.components[cid], component_dir, version, head, dirty=True)
            _report(rep, write_outputs(home, lock, cid, outputs, force, dev=True))
            dev_render.record(home.root, cid, version, f"{head}-dirty",
                              {o.dest: {"sha256": sha256(o.content), "layer": o.layer} for o in outputs},
                              resource_urls(component_dir))
            continue
        locked = lock.components[cid]
        component_dir = catalog.checkout(cid, locked.version, locked.commit)
        apply_component(home, lock, cid, component_dir, locked.version, locked.commit, force, rep)


def apply_component(
    home: HomeConfig, lock: Lock, cid: str, component_dir: Path, version: str, commit: str,
    force: bool, rep: Reporter, remove_stale: bool = False,
) -> None:
    """Write the component as it is at `version`/`commit` and move its lock entry there.

    A managed file the lock holds that this version no longer produces is reported `stale` and left
    (the lock forgets it), or with `remove_stale` (an update) deleted, refusing a hand-edited one
    first. Instance files (the home's own, written once by `add`) are never rendered, checked or
    reported stale here; their lock records are kept as they are."""
    locked = lock.components[cid]
    outputs = plan_outputs(home, home.components[cid], component_dir, version, commit)
    produced = {o.dest for o in outputs}
    stale = sorted(p for p, r in locked.files.items() if r.layer == "managed" and p not in produced)
    if remove_stale and not force:
        dev_files = own_dev_files(home, cid)  # a dev render's own output is not a hand edit
        for dest in stale:
            path = home.root / dest
            if path.is_file() and file_sha(path) not in (locked.files[dest].sha256, dev_files.get(dest)):
                raise DomosensoError(f"hand-edited: {dest}")
    _report(rep, write_outputs(home, lock, cid, outputs, force))
    for dest in stale:
        if remove_stale:
            _remove(home, dest)
            rep.line("remove", dest)
        else:
            rep.line("stale", dest)
    locked.version, locked.tag, locked.commit = version, f"{cid}/{version}", commit
    locked.files = {
        **{p: r for p, r in locked.files.items() if r.layer == "instance"}, **file_records(home, outputs),
    }
    locked.resources = resource_urls(component_dir)
    lock.save(home.root)  # per component: files already written stay described if a later one fails
    dev_render.drop(home.root, cid)


def _remove(home: HomeConfig, dest: str) -> None:
    """Delete a managed file and the directories it leaves empty inside config_dir."""
    path = home.root / dest
    try:
        path.unlink(missing_ok=True)
        parent = path.parent
        while parent != home.config_dir and parent.is_relative_to(home.config_dir):
            try:
                parent.rmdir()
            except OSError:
                break  # not empty: something else lives there
            parent = parent.parent
    except OSError as exc:
        raise DomosensoError(f"cannot remove {dest}: {exc.strerror or exc}") from exc


def _report(rep: Reporter, actions: list[tuple[str, str]]) -> None:
    for action, dest in actions:
        rep.line(action, dest)
