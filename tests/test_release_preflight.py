"""tools/release_preflight.py: release.py's refusals, found before a merge, on a throwaway git repository."""
import subprocess
from pathlib import Path

import pytest

import release_preflight

GIT = ["git", "-c", "user.name=t", "-c", "user.email=t@localhost"]


def git(repo: Path, *args: str) -> str:
    return subprocess.run([*GIT, *args], cwd=repo, check=True, capture_output=True, text=True).stdout.strip()


def manifest(version: str, provides: str = "sensor.radio_level") -> str:
    return (
        f"id: radio\nversion: {version}\nsummary: A radio\n"
        f"inputs: {{}}\nprovides:\n  entities:\n    - id: {provides}\nartifacts: {{}}\n"
    )


def write(repo: Path, version: str, provides: str = "sensor.radio_level", upgrade: str | None = None) -> None:
    (repo / "components" / "radio" / "component.yaml").write_text(manifest(version, provides))
    if upgrade is not None:
        (repo / "components" / "radio" / "UPGRADE.md").write_text(upgrade)
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", f"radio {version}")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / "components" / "radio").mkdir(parents=True)
    git(tmp_path, "init", "-q", "-b", "main")
    write(tmp_path, "1.0.0")
    git(tmp_path, "tag", "-a", "radio/1.0.0", "-m", "radio 1.0.0")
    return tmp_path


def test_unchanged_contract_under_the_tagged_version_passes(repo):
    write(repo, "1.0.0", upgrade="# radio\n")
    assert release_preflight.problems(repo, "radio") == []


def test_never_tagged_component_passes(tmp_path):
    (tmp_path / "components" / "radio").mkdir(parents=True)
    git(tmp_path, "init", "-q", "-b", "main")
    write(tmp_path, "0.1.0")
    assert release_preflight.problems(tmp_path, "radio") == []


def test_contract_change_under_the_tagged_version_is_refused(repo):
    write(repo, "1.0.0", provides="sensor.radio_volume")
    assert release_preflight.problems(repo, "radio") == [
        "the contract changed since radio/1.0.0, but the version is still 1.0.0: raise it"]


def test_raised_version_needs_a_heading_release_py_recognises(repo):
    # The heading of zerostorypoints/domosenso#303: a colon right after the version.
    write(repo, "1.1.0", provides="sensor.radio_volume", upgrade="# radio\n\n## 1.1.0: volume\n")
    [reason] = release_preflight.problems(repo, "radio")
    assert "add a '## 1.1.0' heading" in reason
    write(repo, "1.1.0", provides="sensor.radio_volume", upgrade="# radio\n\n## 1.1.0 (2026-11-15): volume\n")
    assert release_preflight.problems(repo, "radio") == []


def test_version_below_the_newest_tag_is_refused(repo):
    write(repo, "0.9.0")
    assert release_preflight.problems(repo, "radio") == ["version 0.9.0 is lower than the newest tag radio/1.0.0"]


def test_unreleased_heading_of_a_tagged_version_is_refused(repo):
    write(repo, "1.0.0", upgrade="# radio\n\n## 1.0.0 (unreleased): first\n")
    [reason] = release_preflight.problems(repo, "radio")
    assert reason.startswith("UPGRADE.md calls 1.0.0 unreleased, but radio/1.0.0 is tagged")
    write(repo, "1.1.0", upgrade="# radio\n\n## 1.1.0 (unreleased): next\n\n## 1.0.0 (2026-11-02): first\n")
    assert release_preflight.problems(repo, "radio") == []


def test_changed_since_checks_only_the_touched_components(repo, capsys):
    (repo / "components" / "tuner").mkdir()
    (repo / "components" / "tuner" / "component.yaml").write_text(manifest("1.0.0").replace("radio", "tuner"))
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "tuner")
    git(repo, "tag", "-a", "tuner/1.0.0", "-m", "tuner 1.0.0")
    base = git(repo, "rev-parse", "HEAD")
    write(repo, "1.0.0", provides="sensor.radio_volume")  # radio refused, tuner untouched
    assert release_preflight.main(["--root", str(repo), "--changed-since", base]) == 1
    out = capsys.readouterr().out
    assert "FAIL radio:" in out and "tuner" not in out
    assert release_preflight.main(["--root", str(repo), "--changed-since", base, "--hold", "radio"]) == 0
