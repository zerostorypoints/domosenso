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
COMPONENT_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


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

    def component_ids(self) -> list[str]:
        """Every component that has at least one `<id>/<semver>` tag."""
        self.ensure()
        names = self._run("tag", "--list", "*/*", error="list tags").stdout.decode().split()
        found = {cid for cid, _, version in (name.partition("/") for name in names)
                 if SEMVER.match(version) and COMPONENT_ID.match(cid)}
        return sorted(found)

    def show(self, cid: str, version: str, path: str) -> bytes:
        """One file of the component as it is at its tag, without extracting the component."""
        self.ensure()
        tag = f"{cid}/{version}"
        done = self._git("show", f"refs/tags/{tag}:components/{cid}/{path}")
        if done.returncode != 0:
            raise DomosensoError(f"tag {tag} has no components/{cid}/{path}")
        return done.stdout

    def commit_date(self, commit: str) -> str:
        """The committer date of `commit`, YYYY-MM-DD: a version's release date (SPEC-023)."""
        self.ensure()
        return self._run("log", "-1", "--format=%cs", commit, "--", error="read a commit date").stdout.decode().strip()

    def head_commit(self) -> str:
        """The commit the repository's HEAD names (a mirror's HEAD is the remote's default branch)."""
        self.ensure()
        return self._run("rev-parse", "--verify", "HEAD^{commit}", error="read HEAD").stdout.decode().strip()

    def head_files(self, directory: str) -> dict[str, bytes]:
        """Every `<directory>/*.yaml` as HEAD has it, by path; never the working tree."""
        commit = self.head_commit()
        names = self._run("ls-tree", "--name-only", commit, "--", f"{directory}/", error="list files").stdout.decode().split()
        return {name: self._run("show", f"{commit}:{name}", error=f"read {name}").stdout
                for name in sorted(names) if name.endswith(".yaml")}

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
        try:
            marker.unlink(missing_ok=True)
            staging = destination.with_name(version + ".partial")
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True)
            with tarfile.open(fileobj=io.BytesIO(archive.stdout)) as tar:
                tar.extractall(staging, filter="data")
            shutil.rmtree(destination, ignore_errors=True)  # a leftover shows up as the failure of the replace
            os.replace(staging, destination)
            marker.write_text(commit + "\n")
        except (OSError, tarfile.TarError) as exc:
            raise DomosensoError(f"cannot place {tag} in {destination}: {exc}") from exc
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
