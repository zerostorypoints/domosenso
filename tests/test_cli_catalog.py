import subprocess
from pathlib import Path

import pytest

from domosenso_cli.catalog import Catalog, TagMoved, dev_dir
from domosenso_cli.errors import DomosensoError


def git(repo: Path, *args: str) -> str:
    done = subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@localhost", "-C", str(repo), *args],
        capture_output=True, text=True, check=True,
    )
    return done.stdout.strip()


def commit(repo: Path, relative: str, text: str) -> str:
    path = repo / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", f"write {relative}")
    return git(repo, "rev-parse", "HEAD")


def tag(repo: Path, name: str, *, force: bool = False) -> None:
    git(repo, "tag", "-a", *(["-f"] if force else []), name, "-m", name)


@pytest.fixture
def repo(tmp_path):
    path = tmp_path / "catalog"
    path.mkdir()
    git(path, "init", "-q", "-b", "main")
    return path


def test_checkout_tag_contents(repo, tmp_path):
    first = commit(repo, "components/ramka/component.yaml", "version: 0.1.0\n")
    commit(repo, "components/ramka/templates/a.j2", "a\n")
    tag(repo, "ramka/0.1.0")
    commit(repo, "components/ramka/component.yaml", "version: 0.2.0\n")
    commit(repo, "components/other/component.yaml", "other\n")
    cache = tmp_path / "cache"
    catalog = Catalog(str(repo), cache)

    directory = catalog.checkout("ramka", "0.1.0", None)

    assert directory == cache / "components" / "ramka" / "0.1.0"
    assert (directory / "component.yaml").read_text() == "version: 0.1.0\n"
    assert (directory / "templates" / "a.j2").read_text() == "a\n"
    assert not (cache / "components" / "other").exists()
    assert catalog.tag_commit("ramka", "0.1.0") != first  # annotated tag peeled to the tagged commit
    assert catalog.tag_commit("ramka", "0.1.0") == git(repo, "rev-parse", "ramka/0.1.0^{commit}")
    assert len(catalog.tag_commit("ramka", "0.1.0")) == 40


def test_missing_tag(repo, tmp_path):
    commit(repo, "components/ramka/component.yaml", "x\n")
    catalog = Catalog(str(repo), tmp_path / "cache")
    with pytest.raises(DomosensoError, match="no tag ramka/0.1.0"):
        catalog.tag_commit("ramka", "0.1.0")
    with pytest.raises(DomosensoError, match="no tag ramka/0.1.0"):
        catalog.checkout("ramka", "0.1.0", None)


def test_tag_without_the_component_directory(repo, tmp_path):
    commit(repo, "components/other/component.yaml", "x\n")
    tag(repo, "ramka/0.1.0")
    with pytest.raises(DomosensoError, match="components/ramka"):
        Catalog(str(repo), tmp_path / "cache").checkout("ramka", "0.1.0", None)


def test_versions_sorted(repo, tmp_path):
    commit(repo, "components/ramka/component.yaml", "x\n")
    for name in ["ramka/0.10.0", "ramka/0.2.0", "ramka/1.0.0", "ramka/0.2.0-rc1", "ramka/latest",
                 "ramka-extra/0.3.0", "other/0.4.0"]:
        tag(repo, name)
    catalog = Catalog(str(repo), tmp_path / "cache")
    assert catalog.versions("ramka") == ["0.2.0", "0.10.0", "1.0.0"]
    assert catalog.versions("nothing") == []


def test_moved_tag_refused(repo, tmp_path):
    commit(repo, "components/ramka/component.yaml", "v1\n")
    tag(repo, "ramka/0.1.0")
    locked = git(repo, "rev-parse", "ramka/0.1.0^{commit}")
    commit(repo, "components/ramka/component.yaml", "v2\n")
    tag(repo, "ramka/0.1.0", force=True)
    now = git(repo, "rev-parse", "ramka/0.1.0^{commit}")
    assert now != locked
    catalog = Catalog(str(repo), tmp_path / "cache")

    with pytest.raises(TagMoved) as caught:
        catalog.checkout("ramka", "0.1.0", locked)

    assert isinstance(caught.value, DomosensoError)
    assert str(caught.value) == f"tag ramka/0.1.0 moved: locked {locked}, now {now}"
    assert catalog.checkout("ramka", "0.1.0", now).joinpath("component.yaml").read_text() == "v2\n"


def test_checkout_reuses_cache_only_for_the_same_commit(repo, tmp_path):
    commit(repo, "components/ramka/component.yaml", "v1\n")
    tag(repo, "ramka/0.1.0")
    cache = tmp_path / "cache"
    directory = Catalog(str(repo), cache).checkout("ramka", "0.1.0", None)
    marker = directory / "added-by-hand"
    marker.write_text("x")

    assert Catalog(str(repo), cache).checkout("ramka", "0.1.0", None) == directory
    assert marker.exists()  # same commit: reused

    commit(repo, "components/ramka/component.yaml", "v2\n")
    tag(repo, "ramka/0.1.0", force=True)
    again = Catalog(str(repo), cache).checkout("ramka", "0.1.0", None)
    assert again.joinpath("component.yaml").read_text() == "v2\n"
    assert not marker.exists()  # another commit: re-extracted


def test_extraction_oserror_names_the_destination(repo, tmp_path, monkeypatch):
    commit(repo, "components/ramka/component.yaml", "v1\n")
    tag(repo, "ramka/0.1.0")
    cache = tmp_path / "cache"

    def refuse(*args):
        raise PermissionError(13, "Permission denied")

    monkeypatch.setattr("domosenso_cli.catalog.os.replace", refuse)
    with pytest.raises(DomosensoError, match=r"ramka/0\.1\.0.*cache.*0\.1\.0"):
        Catalog(str(repo), cache).checkout("ramka", "0.1.0", None)


def test_tags_are_fetched_once_per_instance(repo, tmp_path):
    commit(repo, "components/ramka/component.yaml", "x\n")
    tag(repo, "ramka/0.1.0")
    mirror = tmp_path / "cache" / "catalog.git"
    catalog = Catalog(repo.as_uri(), tmp_path / "cache")
    catalog.versions("ramka")
    tag(repo, "ramka/0.2.0")
    assert catalog.versions("ramka") == ["0.1.0"]  # no second fetch in the same run
    assert Catalog(repo.as_uri(), tmp_path / "cache").versions("ramka") == ["0.1.0", "0.2.0"]
    assert mirror.is_dir()


def test_mirror_from_url(repo, tmp_path):
    commit(repo, "components/ramka/component.yaml", "from the mirror\n")
    tag(repo, "ramka/0.1.0")
    cache = tmp_path / "cache"
    catalog = Catalog(repo.as_uri(), cache)

    directory = catalog.checkout("ramka", "0.1.0", None)

    assert (cache / "catalog.git").is_dir()
    assert (directory / "component.yaml").read_text() == "from the mirror\n"
    # a later run fetches: a tag added upstream appears, a deleted one goes away (--prune)
    tag(repo, "ramka/0.2.0")
    git(repo, "tag", "-d", "ramka/0.1.0")
    assert Catalog(repo.as_uri(), cache).versions("ramka") == ["0.2.0"]


def test_local_path_is_used_as_is(repo, tmp_path):
    commit(repo, "components/ramka/component.yaml", "x\n")
    tag(repo, "ramka/0.1.0")
    cache = tmp_path / "cache"
    catalog = Catalog(repo, cache)  # a Path is accepted
    assert catalog.versions("ramka") == ["0.1.0"]
    assert not (cache / "catalog.git").exists()


def test_source_that_is_not_a_repository(tmp_path):
    (tmp_path / "plain").mkdir()
    with pytest.raises(DomosensoError, match="plain"):
        Catalog(tmp_path / "plain", tmp_path / "cache").versions("ramka")


def test_unreachable_url(tmp_path):
    with pytest.raises(DomosensoError, match="clone"):
        Catalog((tmp_path / "nowhere").as_uri(), tmp_path / "cache").versions("ramka")


def test_dev_dir(tmp_path):
    (tmp_path / "components" / "ramka").mkdir(parents=True)
    assert dev_dir(tmp_path, "ramka") == tmp_path / "components" / "ramka"
    assert Catalog.dev_dir(tmp_path, "ramka") == tmp_path / "components" / "ramka"
    with pytest.raises(DomosensoError, match="components/other"):
        dev_dir(tmp_path, "other")
