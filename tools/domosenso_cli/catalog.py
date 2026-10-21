"""The catalog as the home sees it: components read from their annotated tag, never a working tree.

A tag `<component>/<version>` is the only way a component enters a home. The lock records the commit
the tag resolved to; `checkout` refuses a tag that now resolves elsewhere (SPEC-002 section 1.3).
"""
from __future__ import annotations

import io
import os
import re
import shutil
import subprocess
import tarfile
from pathlib import Path

from domosenso_cli.errors import DomosensoError

SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


class TagMoved(DomosensoError):
    """A tag resolves to another commit than the one the lock recorded."""

    def __init__(self, tag: str, locked: str, now: str):
        super().__init__(f"tag {tag} moved: locked {locked}, now {now}")
        self.tag, self.locked, self.now = tag, locked, now


def is_url(source: str) -> bool:
    return "://" in source or source.startswith("git@")


def dev_dir(path: Path, cid: str) -> Path:
    """The component's directory in a catalog working tree (`--catalog-dev`)."""
    directory = Path(path) / "components" / cid
    if not directory.is_dir():
        raise DomosensoError(f"no components/{cid} in {path}")
    return directory


class Catalog:
    """`source` is a local repository path (used as is) or a URL (mirrored into `<cache>/catalog.git`)."""

    dev_dir = staticmethod(dev_dir)

    def __init__(self, source: str | Path, cache: Path):
        self.cache = Path(cache)
        self._url = str(source) if isinstance(source, str) and is_url(source) else None
        self.repo = self.cache / "catalog.git" if self._url else Path(source)
        self._ready = False

    def ensure(self) -> None:
        """Make the repository readable; for a URL, clone it or fetch its tags (once per instance)."""
        if self._ready:
            return
        if self._url:
            if (self.repo / "HEAD").exists():
                self._run("fetch", "--tags", "--prune", "--quiet", error="fetch")
            else:
                self.cache.mkdir(parents=True, exist_ok=True)
                self._run("clone", "--mirror", "--quiet", self._url, str(self.repo), cwd=self.cache, error="clone")
        elif self._git("rev-parse", "--git-dir").returncode != 0:
            raise DomosensoError(f"catalog {self.repo} is not a git repository")
        self._ready = True

    def tag_commit(self, cid: str, version: str) -> str:
        self.ensure()
        tag = f"{cid}/{version}"
        found = self._git("rev-parse", "--verify", "--quiet", f"refs/tags/{tag}^{{commit}}")
        if found.returncode != 0:
            raise DomosensoError(f"no tag {tag}")
        return found.stdout.decode().strip()

    def versions(self, cid: str) -> list[str]:
        self.ensure()
        names = self._run("tag", "--list", f"{cid}/*", error="list tags").stdout.decode().split()
        found = [name[len(cid) + 1:] for name in names]
        return sorted((v for v in found if SEMVER.match(v)), key=lambda v: tuple(map(int, v.split("."))))

    def checkout(self, cid: str, version: str, expect_commit: str | None) -> Path:
        """The component as it is at its tag, extracted into `<cache>/components/<cid>/<version>/`."""
        commit = self.tag_commit(cid, version)
        tag = f"{cid}/{version}"
        if expect_commit is not None and expect_commit != commit:
            raise TagMoved(tag, expect_commit, commit)
        destination = self.cache / "components" / cid / version
        marker = destination.with_name(version + ".commit")  # beside the directory, which holds only the component
        if destination.is_dir() and marker.exists() and marker.read_text().strip() == commit:
            return destination
        archive = self._git("archive", "--format=tar", f"refs/tags/{tag}:components/{cid}")
        if archive.returncode != 0:
            raise DomosensoError(f"tag {tag} has no components/{cid}: {archive.stderr.decode().strip()}")
        marker.unlink(missing_ok=True)
        staging = destination.with_name(version + ".partial")
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True)
        with tarfile.open(fileobj=io.BytesIO(archive.stdout)) as tar:
            tar.extractall(staging, filter="data")
        shutil.rmtree(destination, ignore_errors=True)
        os.replace(staging, destination)
        marker.write_text(commit + "\n")
        return destination

    def _git(self, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        try:
            return subprocess.run(["git", *args] if cwd else ["git", "-C", str(self.repo), *args],
                                  cwd=cwd, capture_output=True, env=env)
        except OSError as exc:
            raise DomosensoError(f"git: {exc}") from exc

    def _run(self, *args: str, cwd: Path | None = None, error: str) -> subprocess.CompletedProcess:
        done = self._git(*args, cwd=cwd)
        if done.returncode != 0:
            raise DomosensoError(f"git {error} failed for {self._url or self.repo}: {done.stderr.decode().strip()}")
        return done
