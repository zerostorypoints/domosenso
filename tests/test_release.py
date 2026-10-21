"""tools/release.py: annotated tags `<id>/<version>`, each test on a throwaway git repository."""
import subprocess
from pathlib import Path

import pytest

import release

GIT = ["git", "-c", "user.name=t", "-c", "user.email=t@localhost"]


def git(repo: Path, *args: str) -> str:
    return subprocess.run([*GIT, *args], cwd=repo, check=True, capture_output=True, text=True).stdout.strip()


def manifest(version: str, provides: str = "sensor.radio_level") -> str:
    return (
        f"id: radio\nversion: {version}\nsummary: A radio\n"
        f"inputs: {{}}\nprovides:\n  entities:\n    - id: {provides}\nartifacts: {{}}\n"
    )


@pytest.fixture(autouse=True)
def tagger(monkeypatch):
    """release.py tags with the configured identity; the tests bring their own."""
    for role in ("AUTHOR", "COMMITTER"):
        monkeypatch.setenv(f"GIT_{role}_NAME", "t")
        monkeypatch.setenv(f"GIT_{role}_EMAIL", "t@localhost")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / "components" / "radio").mkdir(parents=True)
    (tmp_path / "components" / "radio" / "component.yaml").write_text(manifest("1.0.0"))
    git(tmp_path, "init", "-q")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-q", "-m", "radio")
    return tmp_path


def commit_all(repo: Path, message: str) -> None:
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", message)


def test_creates_annotated_tag(repo):
    assert release.release(repo, "radio", skip_checks=True) == "radio/1.0.0"
    assert git(repo, "cat-file", "-t", "radio/1.0.0") == "tag"
    assert git(repo, "tag", "-l", "--format=%(contents)", "radio/1.0.0") == "radio 1.0.0"


def test_refuses_existing_version(repo):
    release.release(repo, "radio", skip_checks=True)
    with pytest.raises(release.ReleaseError, match="radio/1.0.0 exists"):
        release.release(repo, "radio", skip_checks=True)


def test_refuses_dirty_component(repo):
    (repo / "components" / "radio" / "README.md").write_text("notes\n")
    with pytest.raises(release.ReleaseError, match="uncommitted"):
        release.release(repo, "radio", skip_checks=True)


def test_needs_upgrade_entry_when_contract_changed(repo):
    release.release(repo, "radio", skip_checks=True)
    component = repo / "components" / "radio"
    (component / "component.yaml").write_text(manifest("1.1.0", provides="sensor.radio_volume"))
    commit_all(repo, "change provides")
    with pytest.raises(release.ReleaseError, match="UPGRADE.md"):
        release.release(repo, "radio", skip_checks=True)
    (component / "UPGRADE.md").write_text("# Upgrade\n\n## 1.1.0\n\nProvides changed.\n")
    commit_all(repo, "upgrade notes")
    assert release.release(repo, "radio", skip_checks=True) == "radio/1.1.0"


def test_unchanged_contract_needs_no_upgrade_entry(repo):
    release.release(repo, "radio", skip_checks=True)
    (repo / "components" / "radio" / "component.yaml").write_text(manifest("1.0.1"))
    commit_all(repo, "patch")
    assert release.release(repo, "radio", skip_checks=True) == "radio/1.0.1"


def test_newest_earlier_tag_is_numeric(repo):
    # 1.10.0 is newer than 1.9.0 although it sorts before it as text
    component = repo / "components" / "radio"
    for version in ("1.9.0", "1.10.0"):
        (component / "component.yaml").write_text(manifest(version))
        commit_all(repo, version)
        release.release(repo, "radio", skip_checks=True)
    (component / "component.yaml").write_text(manifest("1.10.1", provides="sensor.other"))
    commit_all(repo, "change provides")
    with pytest.raises(release.ReleaseError, match="UPGRADE.md"):
        release.release(repo, "radio", skip_checks=True)


def test_runs_check_all_unless_skipped(repo):
    script = repo / "tools" / "check-all.sh"
    script.parent.mkdir()
    script.write_text("#!/usr/bin/env bash\necho boom\nexit 1\n")
    script.chmod(0o755)
    commit_all(repo, "stub")
    with pytest.raises(release.ReleaseError, match="check-all"):
        release.release(repo, "radio")
    assert git(repo, "tag", "-l") == ""
