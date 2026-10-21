"""Turn a component, as it is at its tag, into the files of a home and write them.

`plan_outputs` renders and collects every file a component puts into the home (in memory, with the
destination relative to the home root); `write_outputs` applies them under the ownership rules of
SPEC-002 section 1.4: a managed file edited by hand is refused, a file the lock gives to another
component is refused, a file nobody owns is taken over only when its bytes already equal the output.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import yaml

from catalog_check import install_dir, install_files
from domosenso_cli import stamps
from domosenso_cli.catalog import Catalog
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import ComponentEntry, HomeConfig
from domosenso_cli.lock import FileRecord, Lock
from domosenso_render import LANG_SUFFIX, RenderError, render_component

CACHE_DIR = Path(".domosenso") / "cache"
INSTANCE_DIR = "instance/"
BLUEPRINTS = "ha/blueprints/"
SHORT_SHA = 12


@dataclass
class Output:
    dest: str  # relative to the home root, POSIX form
    content: bytes
    from_: str  # the source inside the component
    layer: str = "managed"


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def open_catalog(home: HomeConfig) -> Catalog:
    return Catalog(home.catalog_source(), home.root / CACHE_DIR)


def git_short_head(path: Path) -> str:
    """The commit a catalog working tree is on, for the stamp of a `--catalog-dev` render."""
    done = subprocess.run(["git", "-C", str(path), "rev-parse", f"--short={SHORT_SHA}", "HEAD"], capture_output=True)
    if done.returncode != 0:
        raise DomosensoError(f"{path} is not a git repository with a commit: {done.stderr.decode().strip()}")
    return done.stdout.decode().strip()


def load_manifest(component_dir: Path) -> dict:
    path = Path(component_dir) / "component.yaml"
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise DomosensoError(f"{path}: {exc}") from exc
    if not isinstance(data, dict):
        raise DomosensoError(f"{path}: expected a mapping at the top level")
    return data


def load_inputs(entry: ComponentEntry) -> dict:
    try:
        data = yaml.safe_load(entry.inputs.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise DomosensoError(f"inputs file for {entry.id} not found: {entry.inputs}") from None
    except (OSError, yaml.YAMLError, UnicodeDecodeError) as exc:
        raise DomosensoError(f"inputs file {entry.inputs}: {exc}") from exc
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise DomosensoError(f"inputs file {entry.inputs}: expected a mapping at the top level")
    return data


def resource_urls(component_dir: Path) -> list[str]:
    """The Lovelace resources (type module) the component's cards need."""
    manifest = load_manifest(component_dir)
    target = install_dir(manifest)
    if not target:
        return []
    www = target.removeprefix("www/")
    return [f"/local/{www}{c}" for c in (manifest.get("artifacts") or {}).get("dashboard_cards") or [] if c.endswith(".js")]


def _config_prefix(home: HomeConfig) -> str:
    relative = Path(os.path.relpath(home.config_dir, home.root))
    if relative.parts[:1] == ("..",):
        raise DomosensoError(f"config_dir {home.config_dir} is outside the home {home.root}")
    return "" if relative == Path(".") else relative.as_posix() + "/"


def _template_destination(entry: ComponentEntry, key: str, lang: str | None) -> str:
    """Where a rendered template goes, relative to config_dir. `key` is the template's output name:
    `package.yaml`, `dashboard.<lang>.yaml`, ..."""
    chosen = entry.outputs.get(key)
    if chosen is None:
        if key == "package.yaml":
            chosen = f"packages/{entry.id}.yaml"
        elif key == "dashboard.<lang>.yaml":
            chosen = f"dashboards/{entry.id}.<lang>.yaml"
        else:
            chosen = f"packages/{entry.id}-{key}"
    return chosen.replace("<lang>", lang) if lang else chosen


def _read(component_dir: Path, rel: str) -> bytes:
    try:
        return (component_dir / rel).read_bytes()
    except OSError as exc:
        raise DomosensoError(f"{component_dir.name}: cannot read {rel}: {exc.strerror or exc}") from exc


def plan_outputs(
    home: HomeConfig,
    entry: ComponentEntry,
    component_dir: Path,
    version: str,
    sha: str,
    instance: bool = False,
    dirty: bool = False,
) -> list[Output]:
    component_dir = Path(component_dir)
    cid = entry.id
    manifest = load_manifest(component_dir)
    if manifest.get("version") != version:
        raise DomosensoError(f"{cid}/{version}: component.yaml says version {manifest.get('version')}")
    artifacts = manifest.get("artifacts") or {}
    prefix = _config_prefix(home)
    outputs: list[Output] = []

    def add(rel_dest: str, content: bytes, from_: str, layer: str = "managed") -> None:
        outputs.append(Output(prefix + rel_dest, content, from_, layer))

    templates_dir = component_dir / "templates"
    names = sorted(p.relative_to(templates_dir).as_posix() for p in templates_dir.rglob("*.j2")) if templates_dir.is_dir() else []
    wanted = [n for n in names if instance or not n.startswith(INSTANCE_DIR)]
    if wanted:
        with tempfile.TemporaryDirectory() as scratch:
            source = _renderable_copy(component_dir, Path(scratch) / "src", instance)
            out = Path(scratch) / "out"
            try:
                render_component(
                    source, load_inputs(entry), out, entry.langs,
                    stamp_text=stamps.stamp(cid, version, sha[:SHORT_SHA], dirty),
                )
            except RenderError as exc:
                raise DomosensoError(f"{cid}: render failed: {exc}") from exc
            except (TypeError, ValueError, OSError, yaml.YAMLError) as exc:
                notes = getattr(exc, "__notes__", [])
                raise DomosensoError(f"{cid}: render failed: {notes[0] + ': ' if notes else ''}{exc}") from exc
            for name in wanted:
                if name.endswith(LANG_SUFFIX):
                    stem = name[: -len(LANG_SUFFIX)]
                    produced = [(f"{stem}.<lang>.yaml", lang, f"{stem}.{lang}.yaml") for lang in entry.langs]
                else:
                    plain = name[: -len(".j2")]
                    produced = [(plain, None, plain)]
                for key, lang, rendered in produced:
                    content = (out / rendered).read_bytes()
                    if name.startswith(INSTANCE_DIR):  # the home's own once written: no stamp, it is not "do not edit"
                        text = stamps.body(content.decode("utf-8")).encode("utf-8")
                        add(_instance_destination(rendered), text, f"templates/{name}", "instance")
                    else:
                        add(_template_destination(entry, key, lang), content, f"templates/{name}")

    target = install_dir(manifest)
    if target:
        for rel in install_files(component_dir, manifest):
            add(f"{target}{rel}", _read(component_dir, rel), rel)
    for key in ("shell", "themes"):
        for rel in artifacts.get(key) or []:
            add(f"{key}/{Path(rel).name}", _read(component_dir, rel), rel)
    for rel in artifacts.get("ha_blueprints") or []:
        if not rel.startswith(BLUEPRINTS):
            raise DomosensoError(f"{cid}: blueprint {rel} is not under {BLUEPRINTS}<domain>/")
        add(f"blueprints/{rel[len(BLUEPRINTS):]}", _read(component_dir, rel), rel)

    seen: dict[str, str] = {}
    for output in outputs:
        if output.dest in seen:
            raise DomosensoError(f"{cid}: {seen[output.dest]} and {output.from_} both go to {output.dest}")
        seen[output.dest] = output.from_
    return sorted(outputs, key=lambda o: o.dest)


def _renderable_copy(component_dir: Path, destination: Path, instance: bool) -> Path:
    """Just what the renderer reads (templates, translations); `templates/instance/` only for an instance
    render, so that a template of the home's own layer cannot fail a managed render for want of an input."""
    templates = component_dir / "templates"

    def ignore(directory: str, names: list[str]) -> list[str]:
        return [INSTANCE_DIR.rstrip("/")] if not instance and Path(directory) == templates else []

    shutil.copytree(templates, destination / "templates", ignore=ignore)
    if (component_dir / "translations").is_dir():
        shutil.copytree(component_dir / "translations", destination / "translations")
    return destination


def _instance_destination(rendered: str) -> str:
    """`instance/<path>` renders into the home at `<path>` under config_dir."""
    return rendered[len(INSTANCE_DIR):]


def write_outputs(
    home: HomeConfig, lock: Lock, cid: str, outputs: list[Output], force: bool = False, dev: bool = False
) -> list[tuple[str, str]]:
    """Write `outputs`; returns `("write"|"same"|"dev", dest)` per file. Nothing is written when any file is refused.

    A differing file with no lock record is replaced when its first line is this component's own dirty
    stamp (a `--catalog-dev` render a tag now supersedes); other unmanaged differing files are refused.
    `dev` (a `--catalog-dev` render, whose files the lock does not describe) also skips the hand-edit
    check for this component's files, so that a second dev render can replace the first, and reports
    `dev` instead of `write` for a file it replaces that differs from the lock. Ownership by another
    component is always refused."""
    entry = lock.components.get(cid)
    records = entry.files if entry else {}
    plan: list[tuple[str, Output]] = []
    for output in outputs:
        other = lock.owner(output.dest)
        if other is not None and other != cid:
            raise DomosensoError(f"owned by {other}: {output.dest}")
        path = home.root / output.dest
        if path.exists() and not path.is_file():
            raise DomosensoError(f"not a file: {output.dest}")
        action = "write"
        if path.is_file():
            try:
                current = path.read_bytes()
            except OSError as exc:
                raise DomosensoError(f"cannot read {output.dest}: {exc.strerror or exc}") from exc
            if current == output.content:
                action = "same"
            else:
                record = records.get(output.dest)
                off_lock = record is None or sha256(current) != record.sha256
                if not force:
                    if record is None and not _own_dirty_stamp(current, cid):
                        raise DomosensoError(f"not managed, differs: {output.dest}")
                    if not dev and record is not None and off_lock:
                        raise DomosensoError(f"hand-edited: {output.dest}")
                if dev and off_lock:
                    action = "dev"
        plan.append((action, output))
    for action, output in plan:
        if action != "same":
            path = home.root / output.dest
            try:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(output.content)
            except OSError as exc:
                raise DomosensoError(f"cannot write {output.dest}: {exc.strerror or exc}") from exc
    return [(action, output.dest) for action, output in plan]


def file_sha(path: Path) -> str:
    try:
        return sha256(path.read_bytes())
    except OSError as exc:
        raise DomosensoError(f"cannot read {path}: {exc.strerror or exc}") from exc


def _own_dirty_stamp(content: bytes, cid: str) -> bool:
    first = content.split(b"\n", 1)[0].decode("utf-8", errors="replace")
    found = stamps.parse(first)
    return found is not None and found.dirty and found.cid == cid


def parse_spec(spec: str) -> tuple[str, str]:
    """`<id>@<version>` as given on the command line."""
    cid, at, version = spec.partition("@")
    if not at or not cid or not version or "@" in version:
        raise DomosensoError(f"expected <id>@<version>, got {spec!r}")
    return cid, version


def file_records(home: HomeConfig, outputs: list[Output]) -> dict[str, FileRecord]:
    """The lock's record of each file as it is on disk."""
    return {o.dest: FileRecord(sha256((home.root / o.dest).read_bytes()), o.from_, o.layer) for o in outputs}
