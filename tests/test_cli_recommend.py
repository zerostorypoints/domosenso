"""`domosenso recommend`: which components a home's devices satisfy, read from the catalog's tags (SPEC-009)."""
import json
import subprocess
from pathlib import Path

import pytest
import yaml

from domosenso_cli import main as cli

RADAR = {"kind": "mmwave-radar", "recommend": ["hlk-ld2410c"]}


def git(repo: Path, *args: str) -> str:
    done = subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@localhost", "-C", str(repo), *args],
        capture_output=True, text=True, check=True,
    )
    return done.stdout.strip()


def manifest(cid: str, version: str, requires=(), optional=(), homes=1, artifacts=None) -> dict:
    data = {
        "id": cid, "version": version,
        "devices": {"requires": list(requires), **({"optional": list(optional)} if optional else {})},
        "artifacts": artifacts if artifacts is not None else {"templates": ["templates/package.yaml.j2"]},
        "tested": {"ha": ["2026.9.2"], **({"homes": homes} if homes is not None else {})},
    }
    return data


def release(repo: Path, data: dict, *, tag: bool = True) -> None:
    path = repo / "components" / data["id"] / "component.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data))
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", f"{data['id']} {data['version']}")
    if tag:
        name = f"{data['id']}/{data['version']}"
        git(repo, "tag", "-a", name, "-m", name)


@pytest.fixture
def catalog(tmp_path):
    repo = tmp_path / "catalog"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    release(repo, manifest("backup", "0.1.0"))
    release(repo, manifest("climate-air", "0.2.0",
                           requires=[{"kind": "temperature-humidity-sensor", "recommend": ["tapo-t315"]}],
                           optional=[{"kind": "air-quality-sensor", "recommend": ["ruuvi-air"], "feature": "air"},
                                     {"kind": "ble-proxy", "feature": "air"}]))
    release(repo, manifest("ramka", "0.1.0", requires=[{"kind": "android-tablet"}], homes=None))
    release(repo, manifest("ramka", "0.1.1", requires=[{"kind": "android-tablet"}, RADAR],
                           optional=[{"kind": "mains-meter"}], homes=None))
    release(repo, manifest("media", "0.1.0", requires=[{"kind": "network-audio-player", "recommend": ["hegel-h400"]}],
                           artifacts={"ha_packages": [], "services": []}))
    # A working-tree change with no tag is never read.
    release(repo, manifest("ramka", "0.2.0", homes=5), tag=False)
    return repo


def run(capsys, *argv: str) -> tuple[int, list[str]]:
    code = cli.main(list(argv))
    return code, capsys.readouterr().out.splitlines()


def test_lines_for_the_first_outside_home(catalog, tmp_path, capsys):
    code, lines = run(capsys, "--home", str(tmp_path / "nohome"), "recommend", "--catalog", str(catalog),
                      "--have", "tapo-t315", "network-audio-player")
    assert code == 0
    assert lines == [
        "fits backup@0.1.0 tested-homes 1",
        "fits climate-air@0.2.0 tested-homes 1",
        "optional climate-air@0.2.0 air air-quality-sensor lacks ruuvi-air",
        "optional climate-air@0.2.0 air ble-proxy lacks",
        "describes media@0.1.0",
        "missing ramka@0.1.1 tested-homes unknown needs 2",
        "needs ramka@0.1.1 android-tablet",
        "needs ramka@0.1.1 mmwave-radar hlk-ld2410c",
        "optional ramka@0.1.1 - mains-meter lacks",
        "ok",
    ]


def test_kind_or_device_id_satisfies(catalog, tmp_path, capsys):
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--have", "android-tablet", "hlk-ld2410c", "temperature-humidity-sensor", "ble-proxy")
    assert code == 0
    assert "fits ramka@0.1.1 tested-homes unknown" in lines
    assert "fits climate-air@0.2.0 tested-homes 1" in lines
    assert "optional climate-air@0.2.0 air ble-proxy have" in lines
    assert not [line for line in lines if line.startswith(("needs", "missing", "unknown"))]


def test_unknown_token_is_a_line_not_a_failure(catalog, tmp_path, capsys):
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--have", "tapo-t31", "ruuvi-air")
    assert code == 0
    assert "unknown tapo-t31 did-you-mean tapo-t315" in lines
    assert "unknown ruuvi-air" not in lines  # named by an optional device


def test_unknown_token_suggests_by_vendor_prefix(catalog, tmp_path, capsys):
    # A kind-like guess ("a Tapo sensor") points at the catalog's Tapo device id.
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--have", "tapo-sensor")
    assert code == 0
    [line] = [line for line in lines if line.startswith("unknown tapo-sensor")]
    assert line.split("did-you-mean ")[1].split(",")[0] == "tapo-t315"  # the vendor's id comes first


def test_unknown_token_without_a_near_match(catalog, tmp_path, capsys):
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--have", "zzz")
    assert "unknown zzz" in lines


def test_catalog_from_the_home(catalog, tmp_path, capsys):
    home = tmp_path / "home"
    home.mkdir()
    (home / "domosenso.yaml").write_text(
        f"catalog: {catalog}\nconfig_dir: home-assistant\nesphome_dir: esphome\ntargets: {{}}\ncomponents: {{}}\n")
    code, lines = run(capsys, "--home", str(home), "recommend")
    assert code == 0
    assert lines[0] == "fits backup@0.1.0 tested-homes 1"
    assert sorted(p.name for p in home.iterdir()) == ["domosenso.yaml"]  # writes nothing for a local catalog


def test_no_catalog_fails(tmp_path, capsys):
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--have", "x")
    assert code == 1
    assert lines[-1].startswith("FAIL ")
    assert "--catalog" in lines[-1]


def test_not_a_repository_fails(tmp_path, capsys):
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(tmp_path))
    assert code == 1
    assert lines[-1].startswith("FAIL ")


def test_json_data(catalog, tmp_path, capsys):
    code = cli.main(["--home", str(tmp_path), "recommend", "--json", "--catalog", str(catalog), "--have", "tapo-t315"])
    doc = json.loads(capsys.readouterr().out)
    assert code == 0 and doc["result"] == "ok"
    by_id = {c["id"]: c for c in doc["data"]}
    assert sorted(by_id) == ["backup", "climate-air", "media", "ramka"]
    assert by_id["climate-air"] == {
        "id": "climate-air", "version": "0.2.0", "fits": True, "describes": False, "tested_homes": 1,
        "needs": [],
        "optional": [
            {"feature": "air", "kind": "air-quality-sensor", "have": False, "recommend": ["ruuvi-air"]},
            {"feature": "air", "kind": "ble-proxy", "have": False, "recommend": []},
        ],
    }
    assert by_id["ramka"]["tested_homes"] is None
    assert by_id["ramka"]["optional"] == [{"feature": None, "kind": "mains-meter", "have": False, "recommend": []}]
    assert by_id["ramka"]["needs"] == [{"kind": "android-tablet", "recommend": []},
                                      {"kind": "mmwave-radar", "recommend": ["hlk-ld2410c"]}]
    assert by_id["media"]["describes"] is True and by_id["media"]["fits"] is None


def test_url_catalog_without_a_home_leaves_no_cache(catalog, tmp_path, capsys, monkeypatch):
    work = tmp_path / "empty"
    work.mkdir()
    monkeypatch.setenv("TMPDIR", str(tmp_path / "tmp"))
    (tmp_path / "tmp").mkdir()
    code, lines = run(capsys, "--home", str(work), "recommend", "--catalog", f"file://{catalog}")
    assert code == 0, lines
    assert lines[0] == "fits backup@0.1.0 tested-homes 1"
    assert list(work.iterdir()) == []
    assert list((tmp_path / "tmp").iterdir()) == []
