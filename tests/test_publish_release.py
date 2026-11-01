"""tools/publish_release.py: the website's mechanical update for a new tag, on a throwaway repository."""
import json
import subprocess
from pathlib import Path

import pytest

import publish_release

GIT = ["git", "-c", "user.name=t", "-c", "user.email=t@localhost"]
CONDITION = "Provide the radio input; swipe to change the station."


def git(repo: Path, *args: str) -> str:
    return subprocess.run([*GIT, *args], cwd=repo, check=True, capture_output=True, text=True).stdout.strip()


def write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def read(repo: Path, rel: str) -> dict:
    return json.loads((repo / "website/content" / rel).read_text(encoding="utf-8"))


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / "components/radio").mkdir(parents=True)
    (tmp_path / "components/radio/component.yaml").write_text("id: radio\nversion: 1.0.0\n")
    content = tmp_path / "website/content"
    write(content / "publication.json", {"frameworkCommit": "f" * 40, "components": [
        {"id": "radio", "version": "1.0.0", "tag": "radio/1.0.0", "commit": "0" * 40, "limitations": ["Tested in one home."]},
        {"id": "lamp", "version": "0.1.0", "tag": "lamp/0.1.0", "commit": "1" * 40}]})
    write(content / "components/radio.json", {"id": "radio", "version": "1.0.0", "sourceCommit": "0" * 40, "views": [
        {"id": "station", "owner": "radio", "condition": CONDITION, "sourceCommit": "0" * 40}]})
    write(content / "components/lamp.json", {"id": "lamp", "version": "0.1.0", "sourceCommit": "1" * 40, "views": [
        {"id": "glow", "owner": "lamp", "sourceCommit": "1" * 40},
        {"id": "station", "owner": "radio", "condition": CONDITION, "sourceCommit": "0" * 40}]})
    write(content / "devices/tuner.json", {"id": "tuner", "title": "Tuner – FM", "compatibility": [
        {"id": "radio", "version": "1.0.0"}, {"id": "lamp", "version": "0.1.0"}]})
    write(content / "devices/bulb.json", {"id": "bulb", "compatibility": [{"id": "lamp", "version": "0.1.0"}]})
    git(tmp_path, "init", "-q", "-b", "main")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-q", "-m", "radio 1.0.0")
    git(tmp_path, "tag", "-a", "radio/1.0.0", "-m", "radio 1.0.0")
    (tmp_path / "components/radio/component.yaml").write_text("id: radio\nversion: 1.1.0\n")
    git(tmp_path, "commit", "-qam", "radio 1.1.0")
    git(tmp_path, "tag", "-a", "radio/1.1.0", "-m", "radio 1.1.0")
    return tmp_path


def run(repo: Path, capsys, *args: str) -> tuple[int, list[str]]:
    code = publish_release.main(["--root", str(repo), "--no-export", *args])
    return code, capsys.readouterr().out.splitlines()


def test_the_newest_tag_is_selected_and_cited_everywhere(repo, capsys):
    commit = git(repo, "rev-parse", "radio/1.1.0^{commit}")
    code, lines = run(repo, capsys, "radio")
    assert code == 0 and lines == [
        "change website/content/components/lamp.json", "change website/content/components/radio.json",
        "change website/content/devices/tuner.json", "change website/content/publication.json", "ok"]
    radio = next(c for c in read(repo, "publication.json")["components"] if c["id"] == "radio")
    assert radio == {"id": "radio", "version": "1.1.0", "tag": "radio/1.1.0", "commit": commit, "limitations": ["Tested in one home."]}
    record = read(repo, "components/radio.json")
    assert (record["version"], record["sourceCommit"], record["views"][0]["sourceCommit"]) == ("1.1.0", commit, commit)
    lamp = read(repo, "components/lamp.json")
    assert [v["sourceCommit"] for v in lamp["views"]] == ["1" * 40, commit]   # only radio's own views
    assert (lamp["version"], lamp["sourceCommit"]) == ("0.1.0", "1" * 40)
    assert read(repo, "devices/tuner.json")["compatibility"] == [{"id": "radio", "version": "1.1.0"}, {"id": "lamp", "version": "0.1.0"}]


def test_no_text_changes_and_the_format_is_kept(repo, capsys):
    before = {p: p.read_text(encoding="utf-8") for p in (repo / "website/content").rglob("*.json")}
    run(repo, capsys, "radio")
    for path, text in before.items():
        after = path.read_text(encoding="utf-8")
        assert after.count(CONDITION) == text.count(CONDITION)
        assert after.count("Tuner – FM") == text.count("Tuner – FM")   # UTF-8 kept, not escaped
        assert after.endswith("}\n") and "\n  " in after
    assert (repo / "website/content/devices/bulb.json").read_text(encoding="utf-8") == before[repo / "website/content/devices/bulb.json"]


def test_a_second_run_changes_nothing(repo, capsys):
    run(repo, capsys, "radio")
    assert run(repo, capsys, "radio") == (0, ["ok"])


def test_a_component_without_a_tag_or_a_website_record_fails(repo, capsys):
    assert run(repo, capsys, "lamp") == (1, ["FAIL no tag lamp/<version>: fetch the tags, or release first"])
    (repo / "components/fan").mkdir()
    git(repo, "tag", "-a", "fan/0.1.0", "-m", "fan")
    assert run(repo, capsys, "fan") == (1, ["FAIL fan is not on the website yet: its first record is editorial work"])
