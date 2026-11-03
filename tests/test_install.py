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
    version_query = cc.install_version(RAMKA, manifest())
    assert (base / "cards" / "agenda-card.js").read_bytes() == cc.versioned(
        "cards/agenda-card.js", (RAMKA / "cards" / "agenda-card.js").read_bytes(), version_query)
    assert (base / "translations" / "pl.json").read_bytes() == (RAMKA / "translations" / "pl.json").read_bytes()
    assert (base / "cards" / "lib" / "i18n.js").is_file() and (base / "translations" / "pl.json").is_file()
    assert (tmp_path / "shell" / "ramka_pick.py").is_file() and (tmp_path / "shell" / "ramka_index.py").is_file()
    assert (tmp_path / "themes" / "ramka.yaml").is_file()
    assert f"/local/domosenso/ramka/{version}/cards/agenda-card.js?v={version_query}" in resources
    assert len(resources) == len(manifest()["artifacts"]["dashboard_cards"])
    # the imports resolve inside the version directory
    agenda = (base / "cards" / "agenda-card.js").read_text(encoding="utf-8")
    assert f'./lib/i18n.js?v={version_query}' in agenda and '../translations/' in agenda


def test_install_version_covers_every_installed_file(tmp_path):
    """One hash for the whole version directory: a change to a lib module or a translation alone changes
    it, so that every card of the version gets new URLs for what it imports."""
    component = tmp_path / "c"
    files = {"component.yaml": "id: c\nversion: 1.0.0\nartifacts:\n  install_path: www/domosenso/c/<version>/\n"
                               "  dashboard_cards: [cards/a-card.js]\n",
             "cards/a-card.js": "import './lib/x.js';\n", "cards/lib/x.js": "export {};\n",
             "translations/en.json": "{}", "cards/a-card.test.mjs": "// not installed\n"}
    for rel, text in files.items():
        (component / rel).parent.mkdir(parents=True, exist_ok=True)
        (component / rel).write_text(text)
    data = yaml.safe_load(files["component.yaml"])
    seen = {cc.install_version(component, data)}
    for rel, text in (("cards/a-card.test.mjs", "// changed\n"),):  # not installed: no new version
        (component / rel).write_text(text)
        assert cc.install_version(component, data) in seen
    for rel, text in (("cards/lib/x.js", "export const y = 1;\n"), ("translations/en.json", '{"k": 1}')):
        (component / rel).write_text(text)
        seen.add(cc.install_version(component, data))
    assert len(seen) == 3 and all(len(v) == 8 for v in seen)
    # Not the hash a dev render gave the same files before the imports were versioned: that URL is in
    # browsers' caches with the unversioned contents.
    import hashlib
    before = "".join(f"{rel}\0{hashlib.sha256((component / rel).read_bytes()).hexdigest()}\n"
                     for rel in cc.install_files(component, data))
    assert cc.install_version(component, data) != hashlib.sha256(before.encode()).hexdigest()[:8]


def test_versioned_adds_the_version_to_relative_static_imports():
    source = (
        'import en from "../translations/en.json" with { type: "json" };\n'
        "import { a,\n  b } from './lib/a.js';\n"
        'import "./lib/side.js";\n'
        'export { c } from "./lib/c.js";\n'
        'export * from "../shared/d.js";\n'
        'import { html } from "lit";\n'  # a bare specifier is no file of ours
        'import x from "/local/other/x.js";\n'
        'import y from "./lib/y.js?v=given";\n'  # already versioned
        'const z = await import(new URL("./lib/z.js", import.meta.url).href + version);\n'  # adds its own
    )
    got = cc.versioned("cards/a-card.js", source.encode(), "abcd1234").decode()
    assert got == (
        'import en from "../translations/en.json?v=abcd1234" with { type: "json" };\n'
        "import { a,\n  b } from './lib/a.js?v=abcd1234';\n"
        'import "./lib/side.js?v=abcd1234";\n'
        'export { c } from "./lib/c.js?v=abcd1234";\n'
        'export * from "../shared/d.js?v=abcd1234";\n'
        'import { html } from "lit";\n'
        'import x from "/local/other/x.js";\n'
        'import y from "./lib/y.js?v=given";\n'
        'const z = await import(new URL("./lib/z.js", import.meta.url).href + version);\n'
    )
    assert cc.versioned("translations/en.json", b'{"from": "./x.js"}', "abcd1234") == b'{"from": "./x.js"}'


def test_every_installed_card_module_imports_with_its_version(tmp_path):
    """Across the catalog: no static import of a file of the version directory is left without the
    version, or a browser keeps that file for the 31 days Home Assistant caches /local/."""
    import re
    unversioned = re.compile(r"""\b(?:from|import)\s*["'](\.\.?/[^"'?]+)["']""")
    checked = 0
    for path in sorted((REPO / "components").glob("*/component.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not cc.install_dir(data):
            continue
        version_query = cc.install_version(path.parent, data)
        for rel in cc.install_files(path.parent, data):
            text = cc.versioned(rel, (path.parent / rel).read_bytes(), version_query).decode("utf-8")
            assert not unversioned.findall(text), f"{path.parent.name}/{rel}"
            checked += rel.endswith(".js")
    assert checked > 20


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
