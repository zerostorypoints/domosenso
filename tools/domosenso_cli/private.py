"""`domosenso private link | adopt`: a home's private files outside its repository (SPEC-035).

The files git must not hold (ESPHome's `secrets.yaml`, gate-remote's `*.code.yaml`) live in
`<config home>/domosenso/homes/<id>/`, laid out as in the home, and the home holds symlinks to them.
A worktree or a clone then loses only links, and `private link` gives a new one back what it lacks.
`<config home>` is `$XDG_CONFIG_HOME` when it is an absolute path, else `~/.config`.
"""
from __future__ import annotations

import argparse
import os
import stat
import subprocess
from pathlib import Path

from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.report import Reporter

FOLDER_MODE = 0o700
FILE_MODE = 0o600


def config_home() -> Path:
    raw = os.environ.get("XDG_CONFIG_HOME", "")
    # The XDG spec ignores a relative value; so does this.
    return Path(raw) if raw and os.path.isabs(raw) else Path.home() / ".config"


def folder_of(home: HomeConfig) -> Path | None:
    """The home's private folder, or None for a home without `id`."""
    return config_home() / "domosenso" / "homes" / home.id if home.id else None


def shown(path: Path) -> str:
    """The path with the user's home directory written as `~`: what lines print."""
    try:
        return "~/" + path.relative_to(Path.home()).as_posix()
    except ValueError:
        return str(path)


def private_files(folder: Path) -> list[str]:
    """The regular files under the folder, as home-relative POSIX paths. Names starting with a dot
    (`.DS_Store` and the like) are not the home's and are skipped, folders too."""
    if not folder.is_dir():
        return []
    found = []
    for directory, subdirectories, names in os.walk(folder):
        subdirectories[:] = sorted(d for d in subdirectories if not d.startswith("."))
        for name in sorted(names):
            path = Path(directory) / name
            if not name.startswith(".") and path.is_file() and not path.is_symlink():
                found.append(path.relative_to(folder).as_posix())
    return sorted(found)


def is_link_to(path: Path, target: Path) -> bool:
    return path.is_symlink() and Path(os.path.realpath(path)) == Path(os.path.realpath(target))


def loose_modes(folder: Path) -> list[tuple[Path, int]]:
    """Folders and files under the folder (itself included) that group or others may read."""
    if not folder.is_dir():
        return []
    loose = []
    for directory, subdirectories, names in os.walk(folder):
        subdirectories.sort()
        for path in [Path(directory), *(Path(directory) / n for n in sorted(names))]:
            if path.is_symlink():
                continue
            mode = stat.S_IMODE(path.stat().st_mode)
            if mode & 0o077:
                loose.append((path, mode))
    return loose


def _git(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)


def _tracked(root: Path, rel: str) -> bool:
    """Whether git tracks the path; a home that is not a git repository tracks nothing."""
    return _git(root, "ls-files", "--error-unmatch", "--", rel).returncode == 0


def _inside_git(path: Path) -> bool:
    probe = path
    while not probe.exists():
        probe = probe.parent
    return _git(probe, "rev-parse", "--is-inside-work-tree").stdout.strip() == "true"


def _in_config_dir(home: HomeConfig, rel: str) -> bool:
    return (home.root / rel).is_relative_to(home.config_dir)


def _setup(home: HomeConfig) -> Path:
    if os.name == "nt":
        raise DomosensoError("symlinks unsupported")
    folder = folder_of(home)
    if folder is None:
        raise DomosensoError("no id in domosenso.yaml")
    if _inside_git(folder):
        raise DomosensoError(f"the private folder is inside a git repository: {shown(folder)}")
    return folder


def _make_folders(parent: Path) -> None:
    """`parent` and the folders above it up to `<config home>/domosenso`, each created 700."""
    top = config_home() / "domosenso"
    missing = []
    probe = parent
    while not probe.exists():
        missing.append(probe)
        probe = probe.parent
    for path in reversed(missing):
        path.mkdir()
        if path == top or path.is_relative_to(top):
            path.chmod(FOLDER_MODE)


# --- status -----------------------------------------------------------------------------------


def in_repository(home: HomeConfig) -> list[str]:
    """ESPHome's secrets and gate-remote's codes that sit in the home as regular files: what
    `private adopt` should move."""
    base = home.esphome_dir
    candidates = [base / "secrets.yaml", *sorted(base.glob("*.code.yaml"))] if base.is_dir() else []
    return [p.relative_to(home.root).as_posix() for p in candidates if p.is_file() and not p.is_symlink()]


def report(home: HomeConfig, rep: Reporter) -> None:
    """The `status` lines of SPEC-035; nothing for a home without `id`."""
    folder = folder_of(home)
    if folder is None:
        return
    rep.line("private", shown(folder))
    for rel in private_files(folder):
        if not _in_config_dir(home, rel) and not is_link_to(home.root / rel, folder / rel):
            rep.line("private-link", rel, "missing")
    for rel in in_repository(home):
        rep.line("private-file", rel, "in repository")
    for path, mode in loose_modes(folder):
        rep.line("private-mode", shown(path), f"{mode:03o}")


# --- link -------------------------------------------------------------------------------------


def _link(home: HomeConfig, rep: Reporter) -> int:
    folder = _setup(home)
    failed = 0
    for rel in private_files(folder):
        source, dest = folder / rel, home.root / rel
        if _in_config_dir(home, rel):
            rep.line("refused", f"{rel}: inside config_dir")
        elif _tracked(home.root, rel):
            rep.line("tracked", rel)
        elif is_link_to(dest, source):
            rep.line("linked", rel)
            continue
        elif os.path.lexists(dest):
            rep.line("conflict", rel)
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.symlink_to(source)
            rep.line("link", rel)
            continue
        failed += 1
    return rep.fail(f"{failed} not linked") if failed else rep.ok()


# --- adopt ------------------------------------------------------------------------------------


def _adopt(home: HomeConfig, paths: list[str], rep: Reporter) -> int:
    folder = _setup(home)
    chosen: list[tuple[str, Path, Path]] = []
    seen: set[str] = set()
    refused = 0
    # Every path is checked before any moves: a refusal leaves the home and the folder as they were.
    for raw in paths:
        given = Path(raw)
        path = Path(os.path.abspath(given if given.is_absolute() else home.root / given))
        try:
            rel = path.relative_to(home.root).as_posix()
        except ValueError:
            raise DomosensoError(f"outside the home: {raw}") from None
        if _in_config_dir(home, rel):
            raise DomosensoError(f"inside config_dir: {rel}")
        if path.is_symlink():
            raise DomosensoError(f"a link: {rel}")
        if not path.is_file():
            raise DomosensoError(f"not a file: {rel}")
        if rel in seen:
            continue
        seen.add(rel)
        target = folder / rel
        if _tracked(home.root, rel):
            rep.line("tracked", rel)
            refused += 1
        elif target.exists() and target.read_bytes() != path.read_bytes():
            rep.line("exists", rel)
            refused += 1
        else:
            chosen.append((rel, path, target))
    if refused:
        return rep.fail(f"{refused} not adopted")
    for rel, path, target in chosen:
        if not target.exists():
            _make_folders(target.parent)
            temporary = target.with_name(f".{target.name}.adopting")
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, FILE_MODE)
            with os.fdopen(descriptor, "wb") as out:
                out.write(path.read_bytes())
                out.flush()
                os.fsync(out.fileno())
            os.replace(temporary, target)
        if target.read_bytes() != path.read_bytes():
            raise DomosensoError(f"copy differs: {rel}")  # nothing removed yet: the home keeps its file
        path.unlink()
        path.symlink_to(target)
        rep.line("adopt", rel)
    return rep.ok()


# --- command ----------------------------------------------------------------------------------


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("action", choices=("link", "adopt"),
                        help="link: link every private file into the home; adopt: move files there")
    parser.add_argument("paths", nargs="*", metavar="<path>", help="adopt: the home's files to move")


def run(args: argparse.Namespace, rep: Reporter) -> int:
    home = HomeConfig.load(args.home)
    if args.action == "link":
        if args.paths:
            raise DomosensoError("link takes no paths")
        return _link(home, rep)
    if not args.paths:
        raise DomosensoError("adopt needs at least one path")
    return _adopt(home, args.paths, rep)
