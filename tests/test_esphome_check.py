"""tools/esphome-check.sh: which files it hands to ESPHome. A stand-in `uvx` on PATH records them."""
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
SCRIPT = REPO / "tools" / "esphome-check.sh"


@pytest.fixture
def catalog(tmp_path):
    root = tmp_path / "catalog"
    (root / "components" / "radio" / "esphome").mkdir(parents=True)
    (root / "components" / "radio" / "component.yaml").write_text("id: radio\nversion: 1.2.3\n")
    (root / "components" / "radio" / "esphome" / "node.yaml").write_text("esphome: {}\n")
    (root / "components" / "radio" / "esphome" / "node.factory.yaml").write_text("esphome: {}\n")
    (root / "components" / "screen").mkdir()
    (root / "components" / "screen" / "component.yaml").write_text("id: screen\nversion: 0.1.0\n")
    home = root / "examples" / "demo-home" / "esphome"
    home.mkdir(parents=True)
    (home / "radio-hall.yaml").write_text(
        "packages:\n  node: github://zerostorypoints/domosenso/components/radio/esphome/node.yaml@radio/1.2.3\n")
    (home / "proxy-kitchen.yaml").write_text(
        "packages:\n  node: github://zerostorypoints/domosenso/components/other/esphome/x.yaml@other/0.1.0\n")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log = tmp_path / "uvx.log"
    (home / "radio-old.yaml").write_text(
        "packages:\n  node: github://domosenso/domosenso/components/radio/esphome/node.yaml@radio/1.2.3\n")
    (bin_dir / "uvx").write_text(f'#!/bin/sh\necho "$@" >> "{log}"\n')
    (bin_dir / "uvx").chmod(0o755)
    return root, bin_dir, log


def run(root, bin_dir, tmp, *args):
    env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "TMPDIR": str(tmp)}
    return subprocess.run(["bash", str(SCRIPT), *args], cwd=root, env=env, capture_output=True, text=True)


def test_component_without_esphome_has_nothing_to_check(catalog, tmp_path):
    root, bin_dir, log = catalog
    result = run(root, bin_dir, tmp_path, "screen")
    assert result.returncode == 0, result.stderr
    assert "nothing to check" in result.stdout
    assert not log.exists()


def test_only_device_files_using_the_component_are_checked(catalog, tmp_path):
    root, bin_dir, log = catalog
    result = run(root, bin_dir, tmp_path, "radio")
    assert result.returncode == 0, result.stdout + result.stderr
    checked = log.read_text().splitlines()
    assert len(checked) == 2
    assert any(line.endswith("factory/node.factory.yaml") for line in checked)
    assert any(line.endswith("home/radio-hall.yaml") for line in checked)
    assert "skipped      proxy-kitchen.yaml (no package of radio)" in result.stdout
    work = Path(next(l for l in result.stdout.splitlines() if l.startswith("work dir: ")).removeprefix("work dir: "))
    rewritten = (work / "home" / "radio-hall.yaml").read_text()
    assert "url: file://" in rewritten and "ref: radio/1.2.3" in rewritten


def test_old_url_form_is_skipped(catalog, tmp_path):
    root, bin_dir, log = catalog
    result = run(root, bin_dir, tmp_path, "radio")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "skipped      radio-old.yaml (no package of radio)" in result.stdout
    assert not any(line.endswith("home/radio-old.yaml") for line in log.read_text().splitlines())


def test_unknown_component(catalog, tmp_path):
    root, bin_dir, _ = catalog
    assert run(root, bin_dir, tmp_path, "ghost").returncode == 2


def test_real_catalog_ramka_has_no_esphome():
    result = subprocess.run(["bash", str(SCRIPT), "ramka"], cwd=REPO, capture_output=True, text=True)
    assert result.returncode == 0 and "nothing to check" in result.stdout


def _work_dir(result):
    return next(l for l in result.stdout.splitlines() if l.startswith("work dir: ")).removeprefix("work dir: ")


def test_work_dir_is_per_checkout(catalog, tmp_path):
    root, bin_dir, _ = catalog
    other = tmp_path / "other"
    shutil.copytree(root, other)
    first = _work_dir(run(root, bin_dir, tmp_path, "radio"))
    second = _work_dir(run(other, bin_dir, tmp_path, "radio"))
    again = _work_dir(run(root, bin_dir, tmp_path, "radio"))
    assert first != second
    assert first == again
    assert Path(first).parent.parent == Path(second).parent.parent == tmp_path / "domosenso-esphome-check"


def test_ha_check_work_dir_is_per_checkout(tmp_path):
    """ha-check creates its work dir before looking for the component; an unknown one stops there, without docker."""
    for name in ("one", "two"):
        (tmp_path / name).mkdir()
        env = {**os.environ, "TMPDIR": str(tmp_path / "tmp")}
        (tmp_path / "tmp").mkdir(exist_ok=True)
        result = subprocess.run(["bash", str(REPO / "tools" / "ha-check.sh"), "ghost"],
                                cwd=tmp_path / name, env=env, capture_output=True, text=True)
        assert result.returncode == 2
    dirs = sorted((tmp_path / "tmp" / "domosenso-ha-check").glob("*/ghost"))
    assert len(dirs) == 2


def test_external_components_url_points_at_the_local_remote(catalog, tmp_path):
    """The checked copy and the factory copy load a package's own external components from the local
    repo (the tag need not be published); the source is untouched, other urls and files stay."""
    root, bin_dir, _ = catalog
    esphome = root / "components" / "radio" / "esphome"
    github = "https://github.com/zerostorypoints/domosenso"
    ext = "external_components:\n  - source:\n      type: git\n      url: {}\n      ref: radio/1.2.3\n"
    (esphome / "node.yaml").write_text("esphome: {}\n" + ext.format(github))
    (esphome / "other.yaml").write_text("esphome: {}\n" + ext.format("https://github.com/someone/else"))
    before = {p.name: p.read_text() for p in esphome.glob("*.yaml")}
    result = run(root, bin_dir, tmp_path, "radio")
    assert result.returncode == 0, result.stdout + result.stderr
    work = Path(_work_dir(result))
    remote = f"url: file://{work}/remote"
    assert remote in (work / "remote/components/radio/esphome/node.yaml").read_text()
    assert remote in (work / "factory/node.yaml").read_text()
    assert "url: https://github.com/" not in (work / "factory/node.yaml").read_text()
    for copy in (work / "remote/components/radio/esphome", work / "factory"):
        assert (copy / "other.yaml").read_text() == before["other.yaml"]  # a different url is left alone
        assert (copy / "node.factory.yaml").read_text() == before["node.factory.yaml"]  # no url, no change
    assert {p.name: p.read_text() for p in esphome.glob("*.yaml")} == before  # the source is untouched
