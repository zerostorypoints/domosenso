"""tools/release_status.py: what still waits for a tag or the website, on a throwaway repository."""
import json
import subprocess
from pathlib import Path

import pytest

import release_status

GIT = ["git", "-c", "user.name=t", "-c", "user.email=t@localhost"]


def git(repo: Path, *args: str) -> None:
    subprocess.run([*GIT, *args], cwd=repo, check=True, capture_output=True)


def component(repo: Path, cid: str, version: str) -> None:
    (repo / "components" / cid).mkdir(parents=True, exist_ok=True)
    (repo / "components" / cid / "component.yaml").write_text(f"id: {cid}\nversion: {version}\n")


def site(repo: Path, **versions: str) -> None:
    (repo / "website/content").mkdir(parents=True, exist_ok=True)
    components = [{"id": cid.replace("_", "-"), "version": v} for cid, v in versions.items()]
    (repo / "website/content/publication.json").write_text(json.dumps({"components": components}))


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    component(tmp_path, "radio", "1.1.0")
    site(tmp_path, radio="1.0.0")
    git(tmp_path, "init", "-q", "-b", "main")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-q", "-m", "radio")
    git(tmp_path, "tag", "radio/1.0.0")
    return tmp_path


def run(repo: Path, capsys, *args: str) -> tuple[int, list[str]]:
    code = release_status.main(["--root", str(repo), *args])
    return code, capsys.readouterr().out.splitlines()


def test_a_merged_version_without_a_tag_is_pending(repo, capsys):
    assert run(repo, capsys) == (1, ["untagged radio 1.1.0", "FAIL 1 pending"])


def test_a_tag_the_site_does_not_show_is_pending(repo, capsys):
    git(repo, "tag", "radio/1.1.0")
    assert run(repo, capsys) == (1, ["unpublished radio 1.1.0 (site 1.0.0)", "FAIL 1 pending"])


def test_tagged_and_published_is_ok(repo, capsys):
    git(repo, "tag", "radio/1.1.0")
    site(repo, radio="1.1.0")
    assert run(repo, capsys) == (0, ["released radio 1.1.0", "ok"])


def test_a_new_component_is_untagged_until_its_first_tag(repo, capsys):
    git(repo, "tag", "radio/1.1.0")
    site(repo, radio="1.1.0")
    component(repo, "lamp", "0.1.0")
    assert run(repo, capsys) == (1, ["untagged lamp 0.1.0", "released radio 1.1.0", "FAIL 1 pending"])


def test_held_components_are_listed_not_counted(repo, capsys):
    git(repo, "tag", "radio/1.1.0")
    site(repo, radio="1.1.0")
    component(repo, "lamp", "0.1.0")
    code, out = run(repo, capsys, "--hold", "lamp")
    assert (code, out) == (0, ["hold lamp 0.1.0", "released radio 1.1.0", "ok"])


def test_markdown_lists_every_component(repo, capsys):
    code, out = run(repo, capsys, "--format", "markdown")
    assert code == 1 and "| untagged | `radio 1.1.0` |" in out and out[-1] == "FAIL 1 pending"


def test_the_catalog_itself_runs(capsys):
    """The real catalog: every line has a known state and the last one is ok or FAIL."""
    code = release_status.main([])
    out = capsys.readouterr().out.splitlines()
    assert all(l.split()[0] in ("untagged", "unpublished", "hold", "released") for l in out[:-1])
    assert out[-1] == "ok" if code == 0 else out[-1].startswith("FAIL")
