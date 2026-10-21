"""tools/domosenso_install.py and the install helpers in catalog_check."""
import shutil
import subprocess
import sys
from pathlib import Path

import yaml

import catalog_check as cc
import domosenso_install as di

REPO = Path(__file__).resolve().parent.parent
RAMKA = REPO / "components" / "ramka"


def manifest():
    return yaml.safe_load((RAMKA / "component.yaml").read_text(encoding="utf-8"))


def test_install_dir_carries_the_version():
    data = manifest()
    assert cc.install_dir(data) == f"www/domosenso/ramka/{data['version']}/"
    assert cc.install_dir({"version": "1.0.0", "artifacts": {}}) is None


def test_install_files_are_cards_lib_and_translations_without_tests():
    files = cc.install_files(RAMKA, manifest())
    assert "cards/lib/i18n.js" in files
    assert {f"translations/{lang}.json" for lang in ("en", "de", "pl")} <= set(files)
    assert set(manifest()["artifacts"]["dashboard_cards"]) <= set(files)
    assert not [f for f in files if f.endswith(".test.mjs") or "/testing/" in f]


def test_install_copies_keeping_the_layout(tmp_path):
    written, resources = di.install(RAMKA, tmp_path)
    version = manifest()["version"]
    base = tmp_path / "www" / "domosenso" / "ramka" / version
    assert (base / "cards" / "agenda-card.js").read_bytes() == (RAMKA / "cards" / "agenda-card.js").read_bytes()
    assert (base / "cards" / "lib" / "i18n.js").is_file() and (base / "translations" / "pl.json").is_file()
    assert (tmp_path / "shell" / "ramka_pick.py").is_file() and (tmp_path / "shell" / "ramka_index.py").is_file()
    assert (tmp_path / "themes" / "ramka.yaml").is_file()
    assert f"/local/domosenso/ramka/{version}/cards/agenda-card.js" in resources
    assert len(resources) == len(manifest()["artifacts"]["dashboard_cards"])
    # the imports resolve inside the version directory
    agenda = (base / "cards" / "agenda-card.js").read_text(encoding="utf-8")
    assert './lib/i18n.js' in agenda and '../translations/' in agenda


def test_dry_run_writes_nothing(tmp_path):
    run = subprocess.run([sys.executable, str(REPO / "tools" / "domosenso_install.py"), str(RAMKA), "--config",
                          str(tmp_path), "--dry-run"], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr
    assert "resource (module): /local/domosenso/ramka/" in run.stdout
    assert list(tmp_path.iterdir()) == []


def test_install_path_must_name_the_component(tmp_path):
    catalog = tmp_path / "catalog"
    shutil.copytree(REPO / "tests" / "fixtures" / "catalog", catalog)
    path = catalog / "components" / "demo-sensor" / "component.yaml"
    data = yaml.safe_load(path.read_text())
    data["artifacts"]["install_path"] = "www/domosenso/other/<version>/"
    path.write_text(yaml.safe_dump(data))
    assert any("install_path" in e for e in cc.check_component(path))
    data["artifacts"]["install_path"] = "www/domosenso/demo-sensor/0.1.0/"  # the placeholder is required
    path.write_text(yaml.safe_dump(data))
    assert any("install_path" in e for e in cc.check_component(path))
    data["artifacts"]["install_path"] = "www/domosenso/demo-sensor/<version>/"
    path.write_text(yaml.safe_dump(data))
    assert cc.check_component(path) == []
    data["artifacts"].pop("install_path")  # cards/card.yaml is no JavaScript module: none needed
    path.write_text(yaml.safe_dump(data))
    assert cc.check_component(path) == []
    data["artifacts"]["dashboard_cards"] = ["cards/card.yaml", "cards/x.js"]
    (path.parent / "cards" / "x.js").write_text("")
    path.write_text(yaml.safe_dump(data))
    assert any("install_path: required" in e for e in cc.check_component(path))
