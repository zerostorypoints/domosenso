"""Where `deploy` puts files: a Home Assistant config directory behind one of two transports.

`LocalDocker` is a staging container whose `/config` is a directory on this machine: files are
read and written directly, only `exec` and `restart` go through `docker`. `SshDocker` is a container
on another host: every operation is one `ssh <host> <command>`, and the files are handled by tools
inside the container (`tar -x` runs as the container's user, so files owned by another uid on the
host can still be replaced). Paths are relative to `/config`, POSIX style.
"""
from __future__ import annotations

import io as _io
import os
import re
import shlex
import subprocess
import tarfile
import time
from pathlib import Path
from typing import Protocol

from domosenso_cli.build import file_sha
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import Target

CONTAINER_CONFIG = "/config"
# A deploy runs unattended between the backup and the restart; nothing in it may wait forever.
COMMAND_TIMEOUT_S = 120  # a file operation, or `exec` unless the caller gives its own (check_config does)
RESTART_SLACK_S = 60  # on top of `-t <timeout_s>`, which is how long docker waits before it kills
SSH_OPTIONS = [
    "-o", "BatchMode=yes",  # no password prompt: a missing key fails instead of hanging
    "-o", "ConnectTimeout=15",
    "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=4",  # a dead link ends in a minute
]
STDERR_TAIL = 400
MISSING = 44  # exit code of the remote `read` when the file is not there

# Prints one hash per path, or `-` for a path that is not a regular file; positional, so a name
# never has to be parsed back out of the output.
_HASHES_SCRIPT = (
    'cd /config || exit 1; for f in "$@"; do if [ -f "$f" ]; then '
    'h=$(sha256sum < "$f") || exit 1; echo "${h%% *}"; else echo -; fi; done'
)
_READ_SCRIPT = f'cd /config || exit 1; [ -f "$1" ] || exit {MISSING}; cat -- "$1"'
# `./` in front of each root: a name that starts with `-` is not an option to find. A root that is
# not there is no match; any other find failure is an error.
_GLOB_SCRIPT = (
    'cd /config || exit 1; rc=0; for d in "$@"; do '
    'if [ -e "$d" ]; then find "$d" -type f || rc=1; fi; done; exit $rc'
)
_DELETE_SCRIPT = 'cd /config || exit 1; rm -f -- "$@"'


class TargetIO(Protocol):
    def hashes(self, paths: list[str]) -> dict[str, str | None]: ...
    def glob(self, patterns: list[str]) -> list[str]: ...
    def read(self, path: str) -> bytes | None: ...
    def put(self, files: dict[str, bytes]) -> None: ...
    def delete(self, paths: list[str]) -> None: ...
    def exec(self, argv: list[str], timeout_s: float | None = None) -> tuple[int, str]: ...  # None: COMMAND_TIMEOUT_S
    def restart(self, timeout_s: int = 120) -> None: ...


def check_relative(path: str) -> str:
    """Defence in depth: nothing the tool builds should leave `/config`, so refuse it here."""
    if (not isinstance(path, str) or not path or path.startswith("/") or ".." in path.split("/")
            or "\0" in path):
        raise DomosensoError(
            f"{path!r}: a target path must be relative to /config, with no '..' segment and no NUL byte")
    return path


def glob_regex(pattern: str) -> re.Pattern[str]:
    """`*` and `?` stay inside one path segment (fnmatch would let `*` cross a `/`); `**/` is any
    number of directories, none included, and a bare `**` is anything."""
    out, i = [], 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif pattern[i] == "*":
            out.append("[^/]*")
            i += 1
        elif pattern[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(pattern[i]))
            i += 1
    return re.compile("".join(out) + r"\Z", re.DOTALL)


def glob_roots(patterns: list[str]) -> list[str]:
    """Where a listing has to look: the leading segments of each pattern that have no wildcard
    (`packages/*.yaml` -> `packages`, `top.yaml` -> `top.yaml`); a pattern that starts with a
    wildcard needs the whole tree (`.`)."""
    roots = set()
    for pattern in patterns:
        literal = []
        for segment in check_relative(pattern).split("/"):
            if "*" in segment or "?" in segment:
                break
            literal.append(segment)
        roots.add("/".join(literal) or ".")
    return sorted(roots)


def match_globs(paths: list[str], patterns: list[str]) -> list[str]:
    regexes = [glob_regex(check_relative(p)) for p in patterns]
    return sorted(p for p in paths if any(r.match(p) for r in regexes))


def _tail(text: bytes | str) -> str:
    if isinstance(text, bytes):
        text = text.decode("utf-8", "replace")
    return text.strip()[-STDERR_TAIL:]


def _run(argv: list[str], what: str, timeout: float, stdin: bytes | None = None,
         merge: bool = False) -> subprocess.CompletedProcess[bytes]:
    """`what` names the operation in an error; `merge`: stderr into stdout, for output read as one log."""
    try:
        return subprocess.run(
            argv, input=stdin, stdin=None if stdin is not None else subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT if merge else subprocess.PIPE,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as e:
        raise DomosensoError(f"{what} timed out after {timeout:g}s: {shlex.join(argv)}") from e
    except OSError as e:
        raise DomosensoError(f"{what}: cannot run {argv[0]}: {e}") from e


def _failed(what: str, argv: list[str], done: subprocess.CompletedProcess[bytes]) -> DomosensoError:
    return DomosensoError(f"{what}: {shlex.join(argv)} exited {done.returncode}: {_tail(done.stderr)}")


def _checked(argv: list[str], what: str, timeout: float, stdin: bytes | None = None) -> bytes:
    done = _run(argv, what, timeout, stdin)
    if done.returncode != 0:
        raise _failed(what, argv, done)
    return done.stdout


class LocalFiles:
    """The file half of `TargetIO` on a local directory (the local transport, and `FakeTarget`)."""

    def __init__(self, root: Path):
        self._root = Path(root)

    def hashes(self, paths: list[str]) -> dict[str, str | None]:
        out: dict[str, str | None] = {}
        for p in paths:
            f = self._root / check_relative(p)
            out[p] = file_sha(f) if f.is_file() else None
        return out

    def glob(self, patterns: list[str]) -> list[str]:
        for p in patterns:
            check_relative(p)
        found = []
        for base, _dirs, names in os.walk(self._root):
            rel = Path(base).relative_to(self._root).as_posix()
            found.extend(n if rel == "." else f"{rel}/{n}" for n in names if (Path(base) / n).is_file())
        return match_globs(found, patterns)

    def read(self, path: str) -> bytes | None:
        f = self._root / check_relative(path)
        try:
            return f.read_bytes() if f.is_file() else None
        except OSError as e:
            raise DomosensoError(f"{path}: {e}") from e

    def put(self, files: dict[str, bytes]) -> None:
        for p in files:
            check_relative(p)
        for p, data in files.items():
            f = self._root / p
            try:
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_bytes(data)
                f.chmod(0o644)
            except OSError as e:
                raise DomosensoError(f"{p}: {e}") from e

    def delete(self, paths: list[str]) -> None:
        for p in paths:
            check_relative(p)
        for p in paths:
            try:
                (self._root / p).unlink(missing_ok=True)
            except OSError as e:
                raise DomosensoError(f"{p}: {e}") from e


def _docker_argv(t: Target) -> list[str]:
    try:
        argv = shlex.split(t.docker)
    except ValueError as e:
        raise DomosensoError(f"target {t.name}: docker {t.docker!r}: {e}") from e
    if not argv:
        raise DomosensoError(f"target {t.name}: docker is empty")
    return argv


class LocalDocker(LocalFiles):
    def __init__(self, t: Target):
        super().__init__(Path(t.config))
        self._container = t.container
        self._docker = _docker_argv(t)

    def exec(self, argv: list[str], timeout_s: float | None = None) -> tuple[int, str]:
        done = _run([*self._docker, "exec", self._container, *argv], "exec", timeout_s or COMMAND_TIMEOUT_S, merge=True)
        return done.returncode, done.stdout.decode("utf-8", "replace")

    def restart(self, timeout_s: int = 120) -> None:
        _checked([*self._docker, "restart", "-t", str(timeout_s), self._container],
                 "restart", timeout_s + RESTART_SLACK_S)


class SshDocker:
    def __init__(self, t: Target):
        if not t.host:
            raise DomosensoError(f"target {t.name}: an ssh-docker target needs a host")
        self._host = t.host
        self._container = t.container
        self._docker = _docker_argv(t)

    def _remote(self, *docker_args: str) -> list[str]:
        """`ssh <host> <one string>`: the string is what the remote shell parses, so every word is quoted."""
        return ["ssh", *SSH_OPTIONS, self._host, shlex.join([*self._docker, *docker_args])]

    def _sh(self, script: str, args: list[str]) -> list[str]:
        return self._remote("exec", "-i", self._container, "sh", "-c", script, "sh", *args)

    def hashes(self, paths: list[str]) -> dict[str, str | None]:
        for p in paths:
            check_relative(p)
        if not paths:
            return {}
        lines = _checked(self._sh(_HASHES_SCRIPT, paths), "hashes", COMMAND_TIMEOUT_S).decode().split()
        if len(lines) != len(paths):
            raise DomosensoError(f"{self._host}: sha256sum answered {len(lines)} lines for {len(paths)} files")
        return {p: None if h == "-" else h for p, h in zip(paths, lines)}

    def glob(self, patterns: list[str]) -> list[str]:
        for p in patterns:
            check_relative(p)
        if not patterns:
            return []
        roots = [f"./{root}" if root != "." else "." for root in glob_roots(patterns)]
        out = _checked(self._sh(_GLOB_SCRIPT, roots), "glob", COMMAND_TIMEOUT_S)
        listing = out.decode("utf-8", "replace").splitlines()
        return match_globs(sorted({line.removeprefix("./") for line in listing}), patterns)

    def read(self, path: str) -> bytes | None:
        argv = self._sh(_READ_SCRIPT, [check_relative(path)])
        done = _run(argv, "read", COMMAND_TIMEOUT_S)
        if done.returncode == MISSING:
            return None
        if done.returncode != 0:
            raise _failed("read", argv, done)
        return done.stdout

    def put(self, files: dict[str, bytes]) -> None:
        for p in files:
            check_relative(p)
        if not files:
            return
        buf = _io.BytesIO()
        # ustar: the container's tar may be busybox, and this is the format every tar reads. A name
        # it cannot hold (over 100 bytes in the last segment, 255 in all) is refused before anything is sent.
        with tarfile.open(fileobj=buf, mode="w", format=tarfile.USTAR_FORMAT,
                          encoding="utf-8", errors="strict") as tar:
            now = time.time()
            for p, data in files.items():
                info = tarfile.TarInfo(p)
                info.size, info.mode, info.mtime = len(data), 0o644, now
                try:
                    tar.addfile(info, _io.BytesIO(data))
                except ValueError as e:  # includes UnicodeEncodeError
                    raise DomosensoError(f"{p}: cannot be sent in a ustar archive: {e}") from e
        _checked(self._remote("exec", "-i", self._container, "tar", "-x", "-C", CONTAINER_CONFIG),
                 "put", COMMAND_TIMEOUT_S, buf.getvalue())

    def delete(self, paths: list[str]) -> None:
        for p in paths:
            check_relative(p)
        if paths:
            _checked(self._sh(_DELETE_SCRIPT, paths), "delete", COMMAND_TIMEOUT_S)

    def exec(self, argv: list[str], timeout_s: float | None = None) -> tuple[int, str]:
        done = _run(self._remote("exec", self._container, *argv), "exec", timeout_s or COMMAND_TIMEOUT_S, merge=True)
        return done.returncode, done.stdout.decode("utf-8", "replace")

    def restart(self, timeout_s: int = 120) -> None:
        _checked(self._remote("restart", "-t", str(timeout_s), self._container),
                 "restart", timeout_s + RESTART_SLACK_S)


def open_target(t: Target) -> TargetIO:
    return LocalDocker(t) if t.kind == "local-docker" else SshDocker(t)
