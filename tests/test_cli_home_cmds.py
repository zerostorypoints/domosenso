"""`domosenso init`, `add`, `update` and `status` against a temporary catalog repository and home."""
import hashlib
import json
import subprocess
from pathlib import Path

import pytest
import yaml

from domosenso_cli import main as cli
from domosenso_cli.home import HomeConfig
from domosenso_cli.lock import Lock
from domosenso_cli.upgrade_notes import sections_between

HA = "home-assistant"

MANIFEST = """\
id: panel
version: {version}
artifacts:
  templates: [templates/package.yaml.j2, templates/dashboard.lang.yaml.j2]
  install_path: www/domosenso/panel/<version>/
  dashboard_cards: [cards/panel-card.js]
inputs:
  prefix: {{type: slug, example: demo}}
  title: {{type: string, default: Hello, example: Hi}}
  rooms: {{type: "list[room]", default: null, example: [a, b]}}
  bare: {{type: string}}
"""

FILES = {
    "templates/package.yaml.j2": "sensor_prefix: [[ inputs.prefix ]]\n",
    "templates/dashboard.lang.yaml.j2": "title: [[ t('ui.title') ]]\n",
    "templates/instance/local.yaml.j2": "owned_by_home: [[ inputs.prefix ]]\n",
    "translations/en.json": '{"ui": {"title": "Panel"}}',
    "translations/de.json": '{"ui": {"title": "Tafel"}}',
    "translations/pl.json": '{"ui": {"title": "Panel pl"}}',
    "cards/panel-card.js": "export const v = 1;\n",
}

UPGRADE = """\
# panel: upgrade notes

## 1.1.0 (2026-10-21): the second

Card changed.

### What a home does

- Reload the tablet.

## 1.0.0 (2026-10-20): the first

Initial release.
"""


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@localhost", "-C", str(repo), *args],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def write_files(root: Path, files: dict[str, str]) -> None:
    for rel, text in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def release(repo: Path, version: str, extra: dict[str, str] | None = None) -> None:
    write_files(repo / "components" / "panel", {"component.yaml": MANIFEST.format(version=version), **(extra or {})})
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", f"panel {version}")
    git(repo, "tag", "-a", f"panel/{version}", "-m", f"panel/{version}")


@pytest.fixture
def catalog(tmp_path):
    repo = tmp_path / "catalog"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    write_files(repo / "components" / "panel", FILES)
    release(repo, "1.0.0")
    return repo


def release_110(repo: Path) -> None:
    release(repo, "1.1.0", {"cards/panel-card.js": "export const v = 2;\n", "UPGRADE.md": UPGRADE})


def run(home: Path, *argv: str, capsys) -> tuple[int, str]:
    capsys.readouterr()
    code = cli.main(["--home", str(home), *argv])
    return code, capsys.readouterr().out


@pytest.fixture
def home(tmp_path, catalog, capsys):
    root = tmp_path / "home"
    code, out = run(root, "init", "--catalog", str(catalog), capsys=capsys)
    assert code == 0, out
    return root


@pytest.fixture
def added(home, catalog, capsys):
    """The home after `add panel@1.0.0`."""
    code, out = run(home, "add", "panel@1.0.0", capsys=capsys)
    assert code == 0, out
    return home


def edit_home(home: Path, **changes) -> None:
    path = home / "domosenso.yaml"
    data = yaml.safe_load(path.read_text())
    data.update(changes)
    path.write_text(yaml.safe_dump(data))


# --- init -------------------------------------------------------------------------------------


def test_init_writes_declaration_and_empty_lock(home, catalog):
    config = HomeConfig.load(home)
    assert config.catalog == str(catalog) and config.catalog_source() == catalog
    assert config.targets == {} and config.components == {}
    assert (config.config_dir, config.esphome_dir) == (home / "home-assistant", home / "esphome")
    assert Lock.load(home).components == {}
    assert (home / "domosenso.lock").is_file()
    text = (home / "domosenso.yaml").read_text()
    assert "targets: {}" in text
    commented = [line for line in text.splitlines() if line.startswith("#")]
    for needle in ("staging:", "production:", "kind: local-docker", "kind: ssh-docker", "host:", "docker:",
                   "container:", "config:", "url:", "token_file:"):
        assert any(needle in line for line in commented), needle


def test_init_refuses_existing(home, catalog, capsys):
    before = (home / "domosenso.yaml").read_text()
    code, out = run(home, "init", "--catalog", str(catalog), capsys=capsys)
    assert code == 1
    assert out.splitlines()[-1] == f"FAIL domosenso.yaml exists: {home / 'domosenso.yaml'}"
    assert (home / "domosenso.yaml").read_text() == before


# --- add --------------------------------------------------------------------------------------


def test_add_writes_skeleton_and_instance_once(home, catalog, capsys):
    code, out = run(home, "add", "panel@1.0.0", capsys=capsys)
    lines = out.splitlines()
    assert (code, lines[-1]) == (0, "ok"), out

    data = yaml.safe_load((home / "domosenso.yaml").read_text())
    assert data["components"] == {"panel": {"inputs": "domosenso/panel.inputs.yaml"}}
    assert "#   staging:" in (home / "domosenso.yaml").read_text()  # the template of `init` survives

    skeleton = (home / "domosenso/panel.inputs.yaml").read_text().splitlines()
    assert "prefix: demo  # slug" in skeleton
    assert "# title: Hi  # string" in skeleton
    assert "# rooms: [a, b]  # list[room]" in skeleton
    assert "bare: null  # string" in skeleton  # required, no example: left for the home to fill
    assert yaml.safe_load("\n".join(skeleton)) == {"prefix": "demo", "bare": None}

    assert "instance home-assistant/local.yaml" in lines
    assert (home / HA / "local.yaml").read_text() == "owned_by_home: demo\n"
    entry = Lock.load(home).components["panel"]
    assert (entry.version, entry.tag) == ("1.0.0", "panel/1.0.0")
    assert entry.commit == git(catalog, "rev-parse", "panel/1.0.0^{commit}")
    assert entry.files[f"{HA}/local.yaml"].layer == "instance"
    assert entry.files[f"{HA}/packages/panel.yaml"].layer == "managed"
    assert (home / HA / "packages/panel.yaml").read_text().endswith("sensor_prefix: demo\n")
    assert (home / HA / "www/domosenso/panel/1.0.0/cards/panel-card.js").is_file()
    assert entry.resources == ["/local/domosenso/panel/1.0.0/cards/panel-card.js"]


def test_instance_files_are_the_homes_after_add(added, capsys):
    local = added / HA / "local.yaml"
    local.write_text("mine: edited\n")
    before = Lock.load(added).components["panel"].files[f"{HA}/local.yaml"]
    code, out = run(added, "render", capsys=capsys)  # neither hand-edited nor stale, and not re-rendered
    assert code == 0, out
    assert local.read_text() == "mine: edited\n"
    assert not any(line.startswith(("stale", "write", "same")) and "local.yaml" in line for line in out.splitlines())
    assert Lock.load(added).components["panel"].files[f"{HA}/local.yaml"] == before


def test_add_refuses_existing_instance(home, catalog, capsys):
    """A `--catalog-dev` add never overwrites an instance file; nothing of the refused add is left."""
    (home / HA).mkdir(parents=True)
    (home / HA / "local.yaml").write_text("the home's own\n")
    code, out = run(home, "add", "panel", "--catalog-dev", str(catalog), capsys=capsys)
    assert code == 1
    assert out.splitlines()[-1] == f"FAIL instance file exists: {HA}/local.yaml"
    assert (home / HA / "local.yaml").read_text() == "the home's own\n"
    assert yaml.safe_load((home / "domosenso.yaml").read_text())["components"] == {}
    assert Lock.load(home).components == {}
    assert not (home / "domosenso/panel.inputs.yaml").exists()
    assert not (home / HA / "packages").exists()


def test_tagged_add_keeps_an_instance_file_the_lock_does_not_record(home, catalog, capsys):
    (home / HA).mkdir(parents=True)
    (home / HA / "local.yaml").write_text("the home's own, edited\n")
    code, out = run(home, "add", "panel@1.0.0", capsys=capsys)
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    assert f"instance-kept {HA}/local.yaml" in out.splitlines()
    assert (home / HA / "local.yaml").read_text() == "the home's own, edited\n"
    record = Lock.load(home).components["panel"].files[f"{HA}/local.yaml"]
    assert record.layer == "instance"
    assert record.sha256 == hashlib.sha256(b"the home's own, edited\n").hexdigest()
    assert (home / HA / "packages/panel.yaml").is_file()


def test_tagged_add_after_dev_add_supersedes_it(home, catalog, capsys):
    code, out = run(home, "add", "panel", "--catalog-dev", str(catalog), capsys=capsys)
    assert code == 0, out
    assert (home / HA / "local.yaml").read_text() == "owned_by_home: demo\n"  # a dev add renders instance files too
    assert Lock.load(home).components == {}
    (home / HA / "local.yaml").write_text("owned_by_home: edited\n")
    code, out = run(home, "add", "panel@1.0.0", capsys=capsys)
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    assert f"instance-kept {HA}/local.yaml" in out.splitlines()
    assert "-dirty" not in (home / HA / "packages/panel.yaml").read_text().splitlines()[0]
    entry = Lock.load(home).components["panel"]
    assert entry.files[f"{HA}/local.yaml"].layer == "instance"
    assert (home / HA / "local.yaml").read_text() == "owned_by_home: edited\n"
    assert {r.layer for p, r in entry.files.items() if p != f"{HA}/local.yaml"} == {"managed"}
    assert f"{HA}/dashboards/panel.de.yaml" in entry.files and f"{HA}/www/domosenso/panel/1.0.0/cards/panel-card.js" in entry.files


def test_failed_tagged_add_leaves_no_lock_entry(home, catalog, capsys):
    (home / HA / "packages").mkdir(parents=True)
    (home / HA / "packages/panel.yaml").write_text("the home's own\n")  # unmanaged and differing: the render refuses
    code, out = run(home, "add", "panel@1.0.0", capsys=capsys)
    assert code == 1 and out.splitlines()[-1] == f"FAIL not managed, differs: {HA}/packages/panel.yaml"
    assert Lock.load(home).components == {}
    (home / HA / "packages/panel.yaml").unlink()
    code, out = run(home, "add", "panel@1.0.0", capsys=capsys)  # retry works: nothing says "already locked"
    assert code == 0, out


def test_add_keeps_an_inputs_file_the_home_prepared(home, capsys):
    (home / "domosenso").mkdir()
    (home / "domosenso/panel.inputs.yaml").write_text("prefix: mine\n")
    code, out = run(home, "add", "panel@1.0.0", capsys=capsys)
    assert code == 0 and "keep domosenso/panel.inputs.yaml" in out.splitlines()
    assert (home / "domosenso/panel.inputs.yaml").read_text() == "prefix: mine\n"
    assert (home / HA / "local.yaml").read_text() == "owned_by_home: mine\n"


def test_add_errors(added, capsys):
    code, out = run(added, "add", "panel@1.0.0", capsys=capsys)
    assert code == 1 and out.splitlines()[-1] == "FAIL panel is already locked at 1.0.0: use update"
    assert run(added, "add", "panel", capsys=capsys) == (1, "FAIL expected <id>@<version>, got 'panel'\n")
    assert run(added, "add", "ghost@1.0.0", capsys=capsys) == (1, "FAIL no tag ghost/1.0.0\n")
    assert run(added, "add", "Bad_Id@1.0.0", capsys=capsys)[1].startswith("FAIL ")


def test_add_into_a_flow_style_components_is_refused_not_mangled(tmp_path, catalog, capsys):
    root = tmp_path / "h2"
    root.mkdir()
    (root / "domosenso.yaml").write_text(
        f"catalog: {catalog}\nconfig_dir: ha\nesphome_dir: esphome\ntargets: {{}}\n"
        "components: {other: {inputs: domosenso/other.inputs.yaml}}\n"
    )
    before = (root / "domosenso.yaml").read_text()
    code, out = run(root, "add", "panel@1.0.0", capsys=capsys)
    assert code == 1 and "domosenso.yaml" in out.splitlines()[-1]
    assert (root / "domosenso.yaml").read_text() == before
    assert not (root / "domosenso").exists()


def test_add_appends_to_a_block_components_mapping(home, capsys):
    (home / "domosenso.yaml").write_text(
        (home / "domosenso.yaml").read_text().replace(
            "components: {}", "components:\n  other:\n    inputs: domosenso/other.inputs.yaml  # kept\n\nlocal: []"
        )
    )
    code, out = run(home, "add", "panel@1.0.0", capsys=capsys)
    assert code == 0, out
    text = (home / "domosenso.yaml").read_text()
    assert "inputs: domosenso/other.inputs.yaml  # kept" in text
    assert sorted(yaml.safe_load(text)["components"]) == ["other", "panel"]
    assert yaml.safe_load(text)["local"] == []


def test_add_catalog_dev_writes_no_lock_entry(home, catalog, capsys):
    code, out = run(home, "add", "panel", "--catalog-dev", str(catalog), capsys=capsys)
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    assert "panel" in yaml.safe_load((home / "domosenso.yaml").read_text())["components"]
    assert (home / "domosenso/panel.inputs.yaml").is_file()
    assert Lock.load(home).components == {}
    package = (home / HA / "packages/panel.yaml").read_text()
    assert package.startswith("# Rendered by Domosenso from panel/1.0.0 (") and "-dirty)" in package.splitlines()[0]


# --- update -----------------------------------------------------------------------------------


def test_update_prints_notes_and_removes_old_version_files(added, catalog, capsys):
    release_110(catalog)
    code, out = run(added, "update", "panel", capsys=capsys)
    lines = out.splitlines()
    assert (code, lines[-1]) == (0, "ok"), out
    assert "note ## 1.1.0 (2026-10-21): the second" in lines
    assert "note Card changed." in lines
    assert "note - Reload the tablet." in lines
    assert not any("1.0.0 (2026-10-20)" in line or "Initial release" in line for line in lines)
    assert lines.index("note ## 1.1.0 (2026-10-21): the second") < next(i for i, l in enumerate(lines) if l.startswith(("write", "same")))

    old, new = added / HA / "www/domosenso/panel/1.0.0", added / HA / "www/domosenso/panel/1.1.0"
    assert not old.exists()  # files and their emptied directories
    assert (new / "cards/panel-card.js").read_text() == "export const v = 2;\n"
    assert f"remove {HA}/www/domosenso/panel/1.0.0/cards/panel-card.js" in lines

    entry = Lock.load(added).components["panel"]
    assert (entry.version, entry.tag) == ("1.1.0", "panel/1.1.0")
    assert entry.commit == git(catalog, "rev-parse", "panel/1.1.0^{commit}")
    assert entry.resources == ["/local/domosenso/panel/1.1.0/cards/panel-card.js"]
    assert not any("/1.0.0/" in path for path in entry.files)
    assert entry.files[f"{HA}/local.yaml"].layer == "instance"  # the home's file is untouched
    assert (added / HA / "local.yaml").read_text() == "owned_by_home: demo\n"


def test_update_to_a_given_version_and_to_the_same_one(added, catalog, capsys):
    release_110(catalog)
    code, out = run(added, "update", "panel", "--to", "1.0.0", capsys=capsys)
    assert (code, out) == (0, "current panel 1.0.0\nok\n")
    code, out = run(added, "update", "panel", "--to", "1.1.0", capsys=capsys)
    assert code == 0 and Lock.load(added).components["panel"].version == "1.1.0"
    code, out = run(added, "update", "panel", "--to", "1.0.0", capsys=capsys)
    assert code == 1 and out.splitlines()[-1] == "FAIL panel: 1.0.0 is older than the locked 1.1.0"
    code, out = run(added, "update", "panel", "--to", "9.9.9", capsys=capsys)
    assert code == 1 and out.splitlines()[-1] == "FAIL no tag panel/9.9.9"


def test_update_refuses_a_hand_edited_file_it_would_remove(added, catalog, capsys):
    release_110(catalog)
    card = added / HA / "www/domosenso/panel/1.0.0/cards/panel-card.js"
    card.write_text("edited\n")
    code, out = run(added, "update", "panel", capsys=capsys)
    assert code == 1
    assert out.splitlines()[-1] == f"FAIL hand-edited: {HA}/www/domosenso/panel/1.0.0/cards/panel-card.js"
    assert Lock.load(added).components["panel"].version == "1.0.0"
    assert not (added / HA / "www/domosenso/panel/1.1.0").exists()  # nothing written
    code, out = run(added, "update", "panel", "--force", capsys=capsys)
    assert code == 0 and not card.exists()


def test_update_errors(home, added, catalog, capsys):
    code, out = run(added, "update", "ghost", capsys=capsys)
    assert code == 1 and out.splitlines()[-1] == "FAIL ghost is not in domosenso.yaml"
    edit_home(added, components={"panel": {"inputs": "domosenso/panel.inputs.yaml"}, "free": {"inputs": "domosenso/free.yaml"}})
    code, out = run(added, "update", "free", capsys=capsys)
    assert code == 1 and out.splitlines()[-1] == "FAIL free is not in domosenso.lock: add it first"


def test_update_refuses_a_moved_locked_tag(added, catalog, capsys):
    release_110(catalog)
    write_files(catalog / "components" / "panel", {"cards/panel-card.js": "moved\n"})
    git(catalog, "add", "-A")
    git(catalog, "commit", "-q", "-m", "move")
    git(catalog, "tag", "-a", "-f", "panel/1.0.0", "-m", "again")
    code, out = run(added, "update", "panel", capsys=capsys)
    assert code == 1 and "panel/1.0.0 moved" in out


def test_update_fails_before_writing_when_an_input_is_missing(added, catalog, capsys):
    release(catalog, "1.1.0", {"templates/package.yaml.j2": "x: [[ inputs.brand_new ]]\n"})
    code, out = run(added, "update", "panel", capsys=capsys)
    assert code == 1 and "brand_new" in out.splitlines()[-1]
    assert Lock.load(added).components["panel"].version == "1.0.0"
    assert (added / HA / "www/domosenso/panel/1.0.0/cards/panel-card.js").exists()


# --- sections_between -------------------------------------------------------------------------

NOTES = """\
# comp: upgrade notes

Intro line.

## 1.10.0 (2026-10-30): ten

ten body

## 1.9.0 (2026-10-29): nine

nine body
### Detail

detail body

```
## 1.99.0 (fenced, not a section)
```

## Unreleased

draft

## 1.0.0 (2026-10-20): first

first body
"""


def test_sections_between_order():
    found = sections_between(NOTES, "1.0.0", "1.10.0")
    assert [s.splitlines()[0] for s in found] == ["## 1.10.0 (2026-10-30): ten", "## 1.9.0 (2026-10-29): nine"]  # newest first, 1.10 after 1.9 numerically
    assert found[0] == "## 1.10.0 (2026-10-30): ten\n\nten body"
    assert "### Detail" in found[1] and "detail body" in found[1] and "## 1.99.0 (fenced, not a section)" in found[1]
    assert "draft" not in found[1]  # `## Unreleased` ends the section and is not one


def test_sections_between_bounds():
    assert sections_between(NOTES, "1.9.0", "1.10.0") == ["## 1.10.0 (2026-10-30): ten\n\nten body"]  # old excluded, new included
    assert sections_between(NOTES, "1.10.0", "1.10.0") == []
    assert sections_between(NOTES, "1.10.0", "1.9.0") == []
    assert [s.splitlines()[0] for s in sections_between(NOTES, "0.0.0", "1.0.0")] == ["## 1.0.0 (2026-10-20): first"]
    assert sections_between("no sections here\n", "0.0.0", "9.9.9") == []


# --- status -----------------------------------------------------------------------------------


def lines_of(out: str) -> list[str]:
    return out.splitlines()


def test_classify_returns_the_class_of_each_file(added):
    from domosenso_cli.cmd_home import classify

    (added / HA / "packages/mine.yaml").write_text("x: 1\n")
    (added / HA / "automations.yaml").write_text("[]\n")
    (added / HA / "stray.txt").write_text("?\n")
    edit_home(added, local=["packages/mine.yaml"], unmanaged_on_target=["automations.yaml"])
    classes = classify(HomeConfig.load(added), Lock.load(added))
    assert classes[f"{HA}/packages/panel.yaml"] == "managed"
    assert classes[f"{HA}/local.yaml"] == "instance"
    assert classes[f"{HA}/packages/mine.yaml"] == "local"
    assert classes[f"{HA}/automations.yaml"] == "unmanaged"
    assert classes[f"{HA}/stray.txt"] == "unclassified"


def test_status_classifies(added, capsys):
    (added / HA / "packages/mine.yaml").write_text("x: 1\n")
    (added / HA / "automations.yaml").write_text("[]\n")
    (added / HA / "configuration.yaml").write_text("homeassistant:\n  packages: !include_dir_named packages\n")
    (added / HA / "secrets.yaml").write_text("a: b\n")
    (added / HA / "stray.txt").write_text("?\n")
    (added / HA / "shell").mkdir()
    (added / HA / "shell/pick.py").write_text("print()\n")
    edited = added / HA / "www/domosenso/panel/1.0.0/cards/panel-card.js"
    edited.write_text("edited\n")
    edit_home(added, local=["packages/*.yaml"], unmanaged_on_target=["automations.yaml"],
              custom_integrations={"hacs_thing": "1.2.3"})
    (added / "esphome").mkdir()
    (added / "esphome/node.yaml").write_text("esphome: {}\n")
    # `packages/*.yaml` must not swallow the managed package, and `*` does not cross a directory
    (added / HA / "packages/sub").mkdir()
    (added / HA / "packages/sub/deep.yaml").write_text("x: 1\n")

    code, out = run(added, "status", capsys=capsys)
    lines = lines_of(out)
    assert code == 1 and lines[-1] == "FAIL 4 unclassified", out
    assert f"managed {HA}/packages/panel.yaml" in lines
    assert f"managed-modified {HA}/www/domosenso/panel/1.0.0/cards/panel-card.js" in lines
    assert f"instance {HA}/local.yaml" in lines
    assert f"unmanaged {HA}/automations.yaml" in lines
    assert f"unmanaged {HA}/configuration.yaml" in lines
    assert f"unmanaged {HA}/secrets.yaml" in lines
    assert f"unclassified {HA}/stray.txt" in lines
    assert f"unclassified {HA}/shell/pick.py" in lines
    assert f"unclassified {HA}/packages/sub/deep.yaml" in lines
    assert "unclassified esphome/node.yaml" in lines
    assert not any(line.endswith("packages/mine.yaml") for line in lines)  # local files are not listed
    assert "component panel 1.0.0 newest 1.0.0" in lines
    assert "integration hacs_thing 1.2.3 (manual)" in lines


def test_status_all_classified_is_ok(added, capsys):
    code, out = run(added, "status", capsys=capsys)
    lines = lines_of(out)
    assert (code, lines[-1]) == (0, "ok"), out
    assert not any(line.startswith("unclassified") for line in lines)
    assert not any(line.startswith("managed-modified") for line in lines)


def test_status_component_lines(added, catalog, capsys):
    release_110(catalog)
    edit_home(added, components={"panel": {"inputs": "domosenso/panel.inputs.yaml"}, "free": {"inputs": "domosenso/free.yaml"}})
    code, out = run(added, "status", capsys=capsys)
    lines = lines_of(out)
    assert "component panel 1.0.0 newest 1.1.0" in lines
    assert "component free not-locked newest none" in lines


def test_status_unclassified_in_json(added, capsys):
    (added / HA / "stray.txt").write_text("?\n")
    code, out = run(added, "status", "--json", capsys=capsys)
    document = json.loads(out)
    assert code == 1 and document["result"] == "FAIL" and document["reason"] == "1 unclassified"
    assert ["unclassified", f"{HA}/stray.txt"] in document["lines"]


CONFIGURATION = """\
homeassistant:
  packages: !include_dir_named packages
  external_url: !secret url
lovelace:
  mode: storage
  dashboards:
    panel-en:
      mode: yaml
      title: Panel
      filename: dashboards/panel.en.yaml
"""


def test_status_missing_dashboard_entry(added, capsys):
    (added / HA / "configuration.yaml").write_text(CONFIGURATION)
    code, out = run(added, "status", capsys=capsys)
    lines = lines_of(out)
    assert code == 0, out
    assert "missing-dashboard-entry dashboards/panel.de.yaml" in lines
    assert "missing-dashboard-entry dashboards/panel.pl.yaml" in lines
    assert "missing-dashboard-entry dashboards/panel.en.yaml" not in lines
    snippet = []
    for line in lines[lines.index("missing-dashboard-entry dashboards/panel.de.yaml") + 1:]:
        if not line.startswith("yaml "):
            break
        snippet.append(line[len("yaml "):])
    block = yaml.safe_load("\n".join(snippet))
    assert block["lovelace"]["dashboards"]["panel-de"] == {
        "mode": "yaml", "title": "panel de", "filename": "dashboards/panel.de.yaml", "show_in_sidebar": True,
    }


def test_status_without_a_configuration_file_names_every_dashboard(added, capsys):
    code, out = run(added, "status", capsys=capsys)
    assert code == 0
    assert [l for l in lines_of(out) if l.startswith("missing-dashboard-entry")] == [
        f"missing-dashboard-entry dashboards/panel.{lang}.yaml" for lang in ("de", "en", "pl")
    ]


def test_status_names_every_language_template_as_a_dashboard(home, catalog, capsys):
    # A second language template (ramka's settings dashboard, SPEC-021) is a dashboard too.
    write_files(catalog / "components" / "panel", {"templates/panel-settings.lang.yaml.j2": "title: [[ t('ui.title') ]]\n"})
    release(catalog, "1.1.0")
    code, out = run(home, "add", "panel@1.1.0", capsys=capsys)
    assert code == 0, out
    code, out = run(home, "status", capsys=capsys)
    assert code == 0, out
    missing = [l for l in lines_of(out) if l.startswith("missing-dashboard-entry")]
    for lang in ("de", "en", "pl"):
        assert f"missing-dashboard-entry dashboards/panel-settings.{lang}.yaml" in missing
        assert f"missing-dashboard-entry dashboards/panel.{lang}.yaml" in missing
    assert (home / HA / "dashboards/panel-settings.de.yaml").read_text().endswith("title: Tafel\n")


def test_status_included_dashboards_cannot_be_checked(added, capsys):
    (added / HA / "configuration.yaml").write_text("lovelace: !include lovelace.yaml\n")
    code, out = run(added, "status", capsys=capsys)
    lines = lines_of(out)
    assert code == 0 and "unchecked configuration.yaml: lovelace is included from another file" in lines
    assert not any(line.startswith("missing-dashboard-entry") for line in lines)


def test_status_broken_configuration_is_named(added, capsys):
    (added / HA / "configuration.yaml").write_text("lovelace: [unclosed\n")
    code, out = run(added, "status", capsys=capsys)
    assert code == 1 and "configuration.yaml" in lines_of(out)[-1] and lines_of(out)[-1].startswith("FAIL ")


# --- dev render inventory (SPEC-019 B) ---------------------------------------------------------

DEV_RENDER = ".domosenso/dev-render.json"
CARD_100 = "/local/domosenso/panel/1.0.0/cards/panel-card.js"


def dev_url(home, url):
    """A dev-rendered card's resource URL: its path plus ?v= and the hash of its version directory
    (resources.wanted)."""
    root = home / "home-assistant/www" / "/".join(url.removeprefix("/local/").split("/")[:3])
    files = sorted(f for f in root.rglob("*") if f.is_file())
    tree = "".join(f"{f.relative_to(root).as_posix()}\0{hashlib.sha256(f.read_bytes()).hexdigest()}\n" for f in files)
    return f"{url}?v={hashlib.sha256(tree.encode()).hexdigest()[:8]}"
CARD_110 = "/local/domosenso/panel/1.1.0/cards/panel-card.js"


def inventory(home: Path) -> dict:
    path = home / DEV_RENDER
    return json.loads(path.read_text()) if path.is_file() else {}


def dev_110(catalog: Path) -> None:
    """The working tree at 1.1.0 with a new card, not committed or tagged: what a maintainer tries."""
    write_files(catalog / "components" / "panel", {
        "component.yaml": MANIFEST.format(version="1.1.0"), "cards/panel-card.js": "export const v = 2;\n",
    })


class _Resources:
    """Home Assistant's `lovelace/resources`, enough for `deploy.apply`."""

    def __init__(self, items: list[dict] | None = None):
        self.items = [dict(i) for i in items or []]

    def ha(self):
        from fakes import FakeHA

        def create(f):
            self.items.append({"id": str(100 + len(self.items)), "url": f["url"], "type": f["res_type"]})

        def update(f):
            next(i for i in self.items if i["id"] == f["resource_id"]).update(url=f["url"], type=f["res_type"])

        return FakeHA({"lovelace/resources": lambda f: [dict(i) for i in self.items],
                       "lovelace/resources/create": create, "lovelace/resources/update": update})


def deploy_plan(home: Path, target_dir: Path, existing: list[dict] | None = None):
    from domosenso_cli import deploy
    from fakes import FakeTarget
    target_dir.mkdir(exist_ok=True)
    return deploy.make_plan(HomeConfig.load(home), Lock.load(home), FakeTarget(target_dir), existing or [])


def deploy_apply(home: Path, target_dir: Path, resources: _Resources) -> str:
    import asyncio

    from domosenso_cli import deploy
    from fakes import FakeTarget
    plan = deploy_plan(home, target_dir, resources.items)
    clean = json.dumps({"total_errors": 0, "total_warnings": 0, "errors": {}, "warnings": {}}, indent=2)
    return asyncio.run(deploy.apply(HomeConfig.load(home), Lock.load(home), plan, FakeTarget(target_dir, clean),
                                    resources.ha(), [], False, target="staging"))


def plan_text(plan) -> list[str]:
    from domosenso_cli import deploy
    return [" ".join(line) for line in deploy.plan_lines(plan)]


def test_dev_render_writes_inventory(added, catalog, capsys):
    lock_before = (added / "domosenso.lock").read_text()
    dev_110(catalog)
    code, out = run(added, "render", "--catalog-dev", str(catalog), capsys=capsys)
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    assert (added / "domosenso.lock").read_text() == lock_before  # SPEC-002: a dev render leaves the lock alone
    entry = inventory(added)["panel"]
    assert entry["version"] == "1.1.0"
    assert entry["commit"] == git(catalog, "rev-parse", "--short=12", "HEAD") + "-dirty"
    card = f"{HA}/www/domosenso/panel/1.1.0/cards/panel-card.js"
    assert entry["files"][card] == {
        "sha256": hashlib.sha256(b"export const v = 2;\n").hexdigest(), "layer": "managed",
    }
    package = f"{HA}/packages/panel.yaml"
    assert entry["files"][package]["sha256"] == hashlib.sha256((added / package).read_bytes()).hexdigest()
    assert f"{HA}/local.yaml" not in entry["files"]  # instance files of a locked component stay the lock's
    assert entry["resources"] == [CARD_110]


def test_dev_add_writes_inventory_with_its_instance_files(home, catalog, capsys):
    code, out = run(home, "add", "panel", "--catalog-dev", str(catalog), capsys=capsys)
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    entry = inventory(home)["panel"]
    assert entry["files"][f"{HA}/local.yaml"]["layer"] == "instance"
    assert entry["files"][f"{HA}/packages/panel.yaml"]["layer"] == "managed"
    assert entry["resources"] == [CARD_100]


def test_tag_render_drops_inventory_entry(added, catalog, capsys):
    dev_110(catalog)
    assert run(added, "render", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0
    assert "panel" in inventory(added)
    code, out = run(added, "render", capsys=capsys)  # back to the tag: the dev render's own files are replaced
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    assert "panel" not in inventory(added)


def test_tagged_add_and_update_drop_inventory_entry(home, catalog, capsys):
    assert run(home, "add", "panel", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0
    assert "panel" in inventory(home)
    code, out = run(home, "add", "panel@1.0.0", capsys=capsys)
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    assert "panel" not in inventory(home)
    assert run(home, "render", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0
    assert "panel" in inventory(home)
    release_110(catalog)
    code, out = run(home, "update", "panel", capsys=capsys)
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    assert "panel" not in inventory(home)


# --- a render from the tag replaces the dev render's own files (final review I1) -----------------


def dev_card(catalog: Path, text: str) -> None:
    """The working tree with a changed card and translation at the same version: no stamp on either."""
    write_files(catalog / "components" / "panel", {
        "cards/panel-card.js": text, "translations/de.json": '{"ui": {"title": "Tafel dev"}}',
    })


def test_tag_render_after_dev_render_of_a_card_needs_no_force(added, catalog, capsys):
    dev_card(catalog, "export const v = 9;\n")
    assert run(added, "render", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0
    card = added / HA / "www/domosenso/panel/1.0.0/cards/panel-card.js"
    assert card.read_text() == "export const v = 9;\n"
    code, out = run(added, "render", "panel", capsys=capsys)
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    assert card.read_text() == "export const v = 1;\n"
    assert "Tafel dev" not in (added / HA / "dashboards/panel.de.yaml").read_text()
    assert "panel" not in inventory(added)


def test_update_after_dev_render_needs_no_force(added, catalog, capsys):
    dev_110(catalog)
    write_files(catalog / "components" / "panel", {"cards/panel-card.js": "export const v = 3;\n"})
    assert run(added, "render", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0
    release_110(catalog)  # the tag's card differs from the dev render's
    code, out = run(added, "update", "panel", capsys=capsys)
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    assert (added / HA / "www/domosenso/panel/1.1.0/cards/panel-card.js").read_text() == "export const v = 2;\n"
    assert not (added / HA / "www/domosenso/panel/1.0.0/cards/panel-card.js").exists()
    assert "panel" not in inventory(added)


def test_update_removes_a_stale_dev_file_without_force(added, catalog, capsys):
    dev_card(catalog, "export const v = 9;\n")  # the 1.0.0 card, rendered from the working tree
    assert run(added, "render", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0
    release_110(catalog)  # 1.1.0 no longer produces the 1.0.0 card
    code, out = run(added, "update", "panel", capsys=capsys)
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    assert f"remove {HA}/www/domosenso/panel/1.0.0/cards/panel-card.js" in out.splitlines()
    assert "panel" not in inventory(added)


def test_update_still_refuses_a_stale_dev_file_edited_after_the_render(added, catalog, capsys):
    dev_card(catalog, "export const v = 9;\n")
    assert run(added, "render", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0
    card = added / HA / "www/domosenso/panel/1.0.0/cards/panel-card.js"
    card.write_text("export const v = 'mine';\n")
    release_110(catalog)
    code, out = run(added, "update", "panel", capsys=capsys)
    assert (code, out.splitlines()[-1]) == (1, f"FAIL hand-edited: {HA}/www/domosenso/panel/1.0.0/cards/panel-card.js")
    assert card.read_text() == "export const v = 'mine';\n"


@pytest.mark.parametrize("argv", [("render", "panel"), ("render", "--catalog-dev", "<catalog>")])
def test_a_dev_file_edited_after_the_render_is_still_refused(added, catalog, capsys, argv):
    dev_card(catalog, "export const v = 9;\n")
    assert run(added, "render", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0
    card = added / HA / "www/domosenso/panel/1.0.0/cards/panel-card.js"
    card.write_text("export const v = 'mine';\n")
    code, out = run(added, *[str(catalog) if a == "<catalog>" else a for a in argv], capsys=capsys)
    assert (code, out.splitlines()[-1]) == (1, f"FAIL hand-edited: {HA}/www/domosenso/panel/1.0.0/cards/panel-card.js")
    assert card.read_text() == "export const v = 'mine';\n"
    assert "panel" in inventory(added)


def test_a_corrupt_inventory_says_to_delete_it(added, catalog, capsys):
    (added / DEV_RENDER).parent.mkdir(exist_ok=True)
    (added / DEV_RENDER).write_text("[]")
    code, out = run(added, "render", "--catalog-dev", str(catalog), capsys=capsys)
    assert code == 1 and out.splitlines()[-1] == (
        f"FAIL {DEV_RENDER}: not an inventory of dev renders; delete {DEV_RENDER}, then render again with --catalog-dev")


def test_dev_render_reports_the_files_the_previous_one_wrote_as_stale(added, catalog, capsys):
    dev_card(catalog, "export const v = 9;\n")
    assert run(added, "render", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0
    dev_110(catalog)  # the working tree moves to 1.1.0: the 1.0.0 card is no longer produced
    code, out = run(added, "render", "--catalog-dev", str(catalog), capsys=capsys)
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    old_card = f"{HA}/www/domosenso/panel/1.0.0/cards/panel-card.js"
    assert f"stale {old_card}" in out.splitlines()  # neither the lock's nor the inventory's any more
    assert old_card not in inventory(added)["panel"]["files"]
    # the 1.0.0 files the lock still describes as they are (en, pl) are the lock's, not stale
    assert [line for line in out.splitlines() if line.startswith("stale ")] == [
        f"stale {old_card}", f"stale {HA}/www/domosenso/panel/1.0.0/translations/de.json"]


def test_status_lists_dev_render_files(home, catalog, capsys):
    assert run(home, "add", "panel", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0
    code, out = run(home, "status", capsys=capsys)
    lines = out.splitlines()
    assert f"managed-dev {HA}/www/domosenso/panel/1.0.0/cards/panel-card.js" in lines
    assert f"managed-dev {HA}/packages/panel.yaml" in lines
    assert f"instance {HA}/local.yaml" in lines
    assert not [line for line in lines if line.startswith("unclassified ")], out
    (home / HA / "packages/panel.yaml").write_text("# mine\n")  # edited after the render: not the dev render's
    lines = run(home, "status", capsys=capsys)[1].splitlines()
    assert f"unclassified {HA}/packages/panel.yaml" in lines


def test_deploy_carries_new_component_from_inventory(home, catalog, capsys, tmp_path):
    assert run(home, "add", "panel", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0
    assert Lock.load(home).components == {}
    lines = plan_text(deploy_plan(home, tmp_path / "target"))
    added_files = [line.removeprefix("add ") for line in lines if line.startswith("add ")]
    for rel in ("dashboards/panel.de.yaml", "packages/panel.yaml", "www/domosenso/panel/1.0.0/cards/panel-card.js",
                "local.yaml"):
        assert rel in added_files
    # every file of the dev render is a dev-render line; the instance file is the home's own
    managed = [rel for rel in added_files if rel != "local.yaml"]
    assert [line for line in lines if line.startswith("dev-render ")] == [f"dev-render {rel}" for rel in managed]
    assert f"resource create {dev_url(home, CARD_100)}" in lines


def test_deploy_new_version_moves_resources(added, catalog, capsys, tmp_path):
    target, resources = tmp_path / "target", _Resources()
    assert deploy_apply(added, target, resources)
    assert [i["url"] for i in resources.items] == [CARD_100]
    dev_110(catalog)
    assert run(added, "render", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0

    lines = plan_text(deploy_plan(added, target, resources.items))
    assert f"resource update {dev_url(added, CARD_110)} from {CARD_100}" in lines
    assert "remove www/domosenso/panel/1.0.0/cards/panel-card.js" in lines
    assert "add www/domosenso/panel/1.1.0/cards/panel-card.js" in lines
    assert "dev-render www/domosenso/panel/1.1.0/cards/panel-card.js" in lines
    assert "keep local.yaml" in lines  # the instance file is still the lock's

    assert deploy_apply(added, target, resources)
    assert not [p for p in (target / "www/domosenso/panel/1.0.0").rglob("*") if p.is_file()]
    assert (target / "www/domosenso/panel/1.1.0/cards/panel-card.js").read_text() == "export const v = 2;\n"
    assert [i["url"] for i in resources.items] == [dev_url(added, CARD_110)]
    record = json.loads((target / ".domosenso/deployed.json").read_text())
    assert "www/domosenso/panel/1.1.0/cards/panel-card.js" in record["dev_render"]["paths"]


def test_inventory_file_changed_fails(added, catalog, capsys, tmp_path):
    from domosenso_cli.errors import DomosensoError
    dev_110(catalog)
    assert run(added, "render", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0
    card = f"{HA}/www/domosenso/panel/1.1.0/cards/panel-card.js"
    (added / card).write_text("export const v = 3;\n")
    with pytest.raises(DomosensoError) as e:
        deploy_plan(added, tmp_path / "target")
    assert str(e.value) == f"dev render changed: {card.removeprefix(HA + '/')}: render again"  # config-relative
    (added / card).unlink()
    with pytest.raises(DomosensoError, match="dev render changed: .*: render again"):
        deploy_plan(added, tmp_path / "target")


def test_inventory_of_a_component_not_declared_fails(added, catalog, capsys, tmp_path):
    from domosenso_cli.errors import DomosensoError
    assert run(added, "render", "--catalog-dev", str(catalog), capsys=capsys)[0] == 0
    data = inventory(added)
    data["ghost"] = data["panel"]
    (added / DEV_RENDER).write_text(json.dumps(data))
    with pytest.raises(DomosensoError, match=r"^dev render of ghost, not in domosenso.yaml$"):
        deploy_plan(added, tmp_path / "target")
