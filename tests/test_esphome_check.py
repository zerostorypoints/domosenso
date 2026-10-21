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
        "packages:\n  node: github://domosenso/domosenso/components/radio/esphome/node.yaml@radio/1.2.3\n")
    (home / "proxy-kitchen.yaml").write_text(
        "packages:\n  node: github://domosenso/domosenso/components/other/esphome/x.yaml@other/0.1.0\n")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log = tmp_path / "uvx.log"
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
    rewritten = (tmp_path / "domosenso-esphome-check" / "radio" / "home" / "radio-hall.yaml").read_text()
    assert "url: file://" in rewritten and "ref: radio/1.2.3" in rewritten


def test_unknown_component(catalog, tmp_path):
    root, bin_dir, _ = catalog
    assert run(root, bin_dir, tmp_path, "ghost").returncode == 2


def test_real_catalog_ramka_has_no_esphome():
    result = subprocess.run(["bash", str(SCRIPT), "ramka"], cwd=REPO, capture_output=True, text=True)
    assert result.returncode == 0 and "nothing to check" in result.stdout
