"""`domosenso adopt <id>@<version>`: take over files that were rendered by hand from that tag.

Every file the component would write must already exist and equal the tag's output (a rendered
template is compared without its stamp line, so a file stamped in the old form passes). Nothing is
changed in the files; the lock records each as it is on disk. One difference and nothing is adopted.
"""
from __future__ import annotations

import argparse

from domosenso_cli.build import file_records, open_catalog, parse_spec, plan_outputs, resource_urls
from domosenso_cli import stamps
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.lock import Lock, LockEntry
from domosenso_cli.report import Reporter


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("spec", metavar="<id>@<version>", help="the component and the tag its files were rendered from")


def run(args: argparse.Namespace, rep: Reporter) -> int:
    cid, version = parse_spec(args.spec)
    home = HomeConfig.load(args.home)
    lock = Lock.load(args.home)
    if cid not in home.components:
        raise DomosensoError(f"{cid} is not in domosenso.yaml")
    if cid in lock.components:
        raise DomosensoError(f"{cid} is already locked at {lock.components[cid].version}: use update")
    catalog = open_catalog(home)
    commit = catalog.tag_commit(cid, version)
    component_dir = catalog.checkout(cid, version, commit)
    outputs = plan_outputs(home, home.components[cid], component_dir, version, commit)
    differing = []
    for output in outputs:
        other = lock.owner(output.dest)
        if other is not None:
            raise DomosensoError(f"owned by {other}: {output.dest}")
        path = home.root / output.dest
        if not path.is_file():
            differing.append(f"{output.dest} (missing)")
        elif not _same(output.from_, path.read_bytes(), output.content):
            differing.append(output.dest)
    if differing:
        raise DomosensoError(f"cannot adopt {cid}@{version}, differs from {cid}/{version}: {', '.join(differing)}")
    lock.components[cid] = LockEntry(
        version=version, tag=f"{cid}/{version}", commit=commit,
        files=file_records(home, outputs), resources=resource_urls(component_dir),
    )
    lock.save(args.home)
    for output in outputs:
        rep.line("adopt", output.dest)
    return rep.ok()


def _same(from_: str, on_disk: bytes, rendered: bytes) -> bool:
    if on_disk == rendered:
        return True
    if not from_.startswith("templates/"):
        return False
    try:
        return stamps.body(on_disk.decode("utf-8")) == stamps.body(rendered.decode("utf-8"))
    except UnicodeDecodeError:
        return False
