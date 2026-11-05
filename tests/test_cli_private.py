"""`domosenso private link | adopt`, the home id and the private lines of `status` (SPEC-035)."""
import json
import os
import stat
import subprocess
from pathlib import Path

import pytest
import yaml

from domosenso_cli import main as cli
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig

GITIGNORE = "secrets.yaml\n*.code.yaml\n.domosenso/\n"


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@localhost", "-C", str(repo), *args],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def run(home: Path, *argv: str, capsys) -> tuple[int, list[str]]:
    capsys.readouterr()
    code = cli.main(["--home", str(home), *argv])
    return code, capsys.readouterr().out.splitlines()


def mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


@pytest.fixture
def xdg(tmp_path) -> Path:
    return Path(os.environ["XDG_CONFIG_HOME"])  # set for every test by conftest


@pytest.fixture
def home(tmp_path, capsys) -> Path:
    """A home in a git repository with the template's ignores, `id: alex-and-sam`, an ESPHome
    secrets file and a gate code, neither committed."""
    root = tmp_path / "home"
    root.mkdir()
    git(root, "init", "-q", "-b", "main")
    code, out = run(root, "init", "--catalog", "../catalog", "--id", "alex-and-sam", capsys=capsys)
    assert code == 0, out
    (root / ".gitignore").write_text(GITIGNORE)
    path = root / "domosenso.yaml"
    path.write_text(path.read_text() + "local: [esphome/node.yaml]\n")
    (root / "esphome").mkdir()
    (root / "esphome/node.yaml").write_text("esphome: {name: node}\n")
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "home")
    (root / "esphome/secrets.yaml").write_text("wifi_ssid: net\n")
    (root / "esphome/gate-remote-garage.code.yaml").write_text("[1016, -1016]\n")
    return root


def folder(xdg: Path) -> Path:
    return xdg / "domosenso" / "homes" / "alex-and-sam"


# --- the id -----------------------------------------------------------------------------------


def test_init_writes_an_id_from_the_directory_name(tmp_path, capsys):
    root = tmp_path / "Alex & Sam's Home"
    code, out = run(root, "init", "--catalog", "x", capsys=capsys)
    assert code == 0, out
    assert HomeConfig.load(root).id == "alex-sam-s-home"
    assert "~/.config/domosenso/homes/<id>/" in (root / "domosenso.yaml").read_text()


def test_init_id_option_and_its_check(tmp_path, capsys):
    code, out = run(tmp_path / "a", "init", "--catalog", "x", "--id", "flat-3", capsys=capsys)
    assert code == 0 and HomeConfig.load(tmp_path / "a").id == "flat-3"
    code, out = run(tmp_path / "b", "init", "--catalog", "x", "--id", "Flat 3", capsys=capsys)
    assert code == 1 and out[-1] == "FAIL 'Flat 3' is not an id (lower case, digits and hyphens)"
    assert not (tmp_path / "b" / "domosenso.yaml").exists()


def test_the_schema_refuses_an_id_that_is_not_a_slug(home):
    path = home / "domosenso.yaml"
    data = yaml.safe_load(path.read_text())
    data["id"] = "Alex_and_Sam"
    path.write_text(yaml.safe_dump(data))
    with pytest.raises(DomosensoError):
        HomeConfig.load(home)


def test_without_an_id_private_fails_and_status_says_nothing(home, capsys):
    path = home / "domosenso.yaml"
    data = yaml.safe_load(path.read_text())
    del data["id"]
    path.write_text(yaml.safe_dump(data))
    code, out = run(home, "private", "link", capsys=capsys)
    assert (code, out[-1]) == (1, "FAIL no id in domosenso.yaml")
    code, out = run(home, "status", capsys=capsys)
    assert code == 0 and not any(line.startswith("private") for line in out), out


# --- adopt ------------------------------------------------------------------------------------


def test_adopt_moves_files_out_and_leaves_links(home, xdg, capsys):
    code, out = run(home, "private", "adopt", "esphome/secrets.yaml", "esphome/gate-remote-garage.code.yaml",
                    capsys=capsys)
    assert code == 0, out
    assert out == ["adopt esphome/secrets.yaml", "adopt esphome/gate-remote-garage.code.yaml", "ok"]
    private = folder(xdg)
    for rel, text in (("esphome/secrets.yaml", "wifi_ssid: net\n"),
                      ("esphome/gate-remote-garage.code.yaml", "[1016, -1016]\n")):
        assert (private / rel).read_text() == text
        assert mode(private / rel) == 0o600
        link = home / rel
        assert link.is_symlink() and Path(os.readlink(link)) == private / rel
        assert link.read_text() == text
    for made in (xdg / "domosenso", xdg / "domosenso/homes", private, private / "esphome"):
        assert mode(made) == 0o700, made
    assert git(home, "status", "--porcelain") == ""  # the links are ignored like the files were


def test_adopt_refuses_before_moving_anything(home, xdg, capsys):
    git(home, "add", "-f", "esphome/secrets.yaml")
    code, out = run(home, "private", "adopt", "esphome/gate-remote-garage.code.yaml", "esphome/secrets.yaml",
                    capsys=capsys)
    assert out == ["tracked esphome/secrets.yaml", "FAIL 1 not adopted"]
    assert code == 1
    assert not (home / "esphome/gate-remote-garage.code.yaml").is_symlink()  # the other one stayed too
    assert not folder(xdg).exists()


def test_adopt_refuses_other_content_but_takes_the_same(home, xdg, capsys):
    target = folder(xdg) / "esphome/secrets.yaml"
    target.parent.mkdir(parents=True)
    target.write_text("wifi_ssid: other\n")
    code, out = run(home, "private", "adopt", "esphome/secrets.yaml", capsys=capsys)
    assert (code, out) == (1, ["exists esphome/secrets.yaml", "FAIL 1 not adopted"])
    target.write_text("wifi_ssid: net\n")
    code, out = run(home, "private", "adopt", "esphome/secrets.yaml", capsys=capsys)
    assert (code, out) == (0, ["adopt esphome/secrets.yaml", "ok"])
    assert (home / "esphome/secrets.yaml").is_symlink()


@pytest.mark.parametrize("given, reason", [
    ("../elsewhere.yaml", "outside the home: ../elsewhere.yaml"),
    ("home-assistant/secrets.yaml", "inside config_dir: home-assistant/secrets.yaml"),
    ("esphome/missing.yaml", "not a file: esphome/missing.yaml"),
])
def test_adopt_errors(home, capsys, given, reason):
    (home / "home-assistant").mkdir()
    (home / "home-assistant/secrets.yaml").write_text("a: b\n")
    code, out = run(home, "private", "adopt", given, capsys=capsys)
    assert (code, out[-1]) == (1, f"FAIL {reason}")


def test_adopt_refuses_a_link(home, capsys):
    run(home, "private", "adopt", "esphome/secrets.yaml", capsys=capsys)
    code, out = run(home, "private", "adopt", "esphome/secrets.yaml", capsys=capsys)
    assert (code, out[-1]) == (1, "FAIL a link: esphome/secrets.yaml")


# --- link -------------------------------------------------------------------------------------


def test_link_gives_a_new_worktree_its_files_and_removing_it_keeps_them(home, xdg, capsys):
    run(home, "private", "adopt", "esphome/secrets.yaml", "esphome/gate-remote-garage.code.yaml", capsys=capsys)
    tree = home.parent / "worktree"
    git(home, "worktree", "add", "-q", str(tree))

    code, out = run(tree, "status", capsys=capsys)
    assert "private-link esphome/secrets.yaml missing" in out
    assert "private-link esphome/gate-remote-garage.code.yaml missing" in out

    code, out = run(tree, "private", "link", capsys=capsys)
    assert (code, out) == (0, ["link esphome/gate-remote-garage.code.yaml", "link esphome/secrets.yaml", "ok"])
    assert (tree / "esphome/secrets.yaml").read_text() == "wifi_ssid: net\n"
    code, out = run(tree, "private", "link", capsys=capsys)
    assert (code, out) == (0, ["linked esphome/gate-remote-garage.code.yaml", "linked esphome/secrets.yaml", "ok"])
    code, out = run(tree, "status", capsys=capsys)
    assert code == 0 and not any(line.startswith(("private-link", "private-file")) for line in out), out

    git(home, "worktree", "remove", "--force", str(tree))
    assert (folder(xdg) / "esphome/secrets.yaml").read_text() == "wifi_ssid: net\n"


def test_link_reports_conflicts_tracked_and_config_dir(home, xdg, capsys):
    private = folder(xdg)
    for rel in ("esphome/secrets.yaml", "esphome/tracked.yaml", "home-assistant/secrets.yaml", "notes.txt",
                ".DS_Store"):
        (private / rel).parent.mkdir(parents=True, exist_ok=True)
        (private / rel).write_text("x\n")
    (home / "esphome/tracked.yaml").write_text("y\n")
    git(home, "add", "esphome/tracked.yaml")
    code, out = run(home, "private", "link", capsys=capsys)
    assert out == [
        "conflict esphome/secrets.yaml",  # the home's own regular file stays
        "tracked esphome/tracked.yaml",
        "refused home-assistant/secrets.yaml: inside config_dir",
        "link notes.txt",  # any file the home keeps there; dot files are not the home's
        "FAIL 3 not linked",
    ]
    assert code == 1
    assert (home / "esphome/secrets.yaml").read_text() == "wifi_ssid: net\n"
    assert not (home / ".DS_Store").exists()


def test_a_private_folder_inside_a_git_repository_is_refused(home, tmp_path, monkeypatch, capsys):
    xdg = tmp_path / "dotfiles"
    xdg.mkdir()
    git(xdg, "init", "-q")
    monkeypatch.setenv("XDG_CONFIG_HOME", str(xdg))
    code, out = run(home, "private", "adopt", "esphome/secrets.yaml", capsys=capsys)
    assert code == 1 and out[-1].startswith("FAIL the private folder is inside a git repository: ")
    assert not (home / "esphome/secrets.yaml").is_symlink()


def test_a_relative_xdg_config_home_is_ignored(home, tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("XDG_CONFIG_HOME", "relative/config")
    monkeypatch.setenv("HOME", str(tmp_path / "user"))
    code, out = run(home, "private", "adopt", "esphome/secrets.yaml", capsys=capsys)
    assert code == 0, out
    assert (tmp_path / "user/.config/domosenso/homes/alex-and-sam/esphome/secrets.yaml").is_file()
    code, out = run(home, "status", capsys=capsys)
    assert "private ~/.config/domosenso/homes/alex-and-sam" in out


# --- status -----------------------------------------------------------------------------------


def test_status_names_secrets_in_the_repository_and_loose_modes(home, xdg, capsys):
    code, out = run(home, "status", capsys=capsys)
    assert code == 0, out  # the code file is unmanaged like secrets.yaml, not unclassified
    assert "unmanaged esphome/gate-remote-garage.code.yaml" in out
    assert "unmanaged esphome/secrets.yaml" in out
    assert "private-file esphome/gate-remote-garage.code.yaml in repository" in out
    assert "private-file esphome/secrets.yaml in repository" in out

    run(home, "private", "adopt", "esphome/secrets.yaml", capsys=capsys)
    (folder(xdg) / "esphome/secrets.yaml").chmod(0o644)
    code, out = run(home, "status", capsys=capsys)
    assert "private-file esphome/secrets.yaml in repository" not in out
    assert any(line.startswith("private-mode ") and line.endswith("/esphome/secrets.yaml 644") for line in out), out


def test_status_json_carries_the_private_lines(home, capsys):
    capsys.readouterr()
    assert cli.main(["--home", str(home), "status", "--json"]) == 0
    document = json.loads(capsys.readouterr().out)
    assert ["private-file", "esphome/secrets.yaml", "in", "repository"] in [
        [line[0], *" ".join(line[1:]).split()] for line in document["lines"]
    ]
