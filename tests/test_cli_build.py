"""`domosenso render` and `adopt` against a temporary catalog repository and a temporary home."""
import hashlib
import json
import subprocess
from pathlib import Path

import pytest
import yaml

from domosenso_cli import main as cli
from domosenso_cli import inventory, stamps
from domosenso_cli.lock import Lock, LockEntry

MANIFEST = """\
id: {cid}
version: 1.0.0
artifacts:
  templates: [templates/package.yaml.j2, templates/dashboard.lang.yaml.j2]
  install_path: www/domosenso/{cid}/<version>/
  dashboard_cards: [cards/panel-card.js]
  shell: [shell/pick.py]
  themes: [themes/dark.yaml]
  ha_blueprints: [ha/blueprints/automation/domosenso/alert.yaml]
"""

PANEL_FILES = {
    "component.yaml": MANIFEST.format(cid="panel"),
    "templates/package.yaml.j2": "sensor_prefix: [[ inputs.prefix ]]\nnote: {{ states('sensor.x') }}\n",
    "templates/dashboard.lang.yaml.j2": "title: [[ t('ui.title') ]]\nlang: [[ lang ]]\n",
    "templates/instance/local.yaml.j2": "owned_by_home: [[ inputs.not_given ]]\n",
    "translations/en.json": '{"ui": {"title": "Panel"}}',
    "translations/de.json": '{"ui": {"title": "Tafel"}}',
    "translations/pl.json": '{"ui": {"title": "Panel pl"}}',
    "cards/panel-card.js": "import { t } from './lib/i18n.js';\n",
    "cards/lib/i18n.js": "export const t = (k) => k;\n",
    "cards/panel-card.test.mjs": "// never installed\n",
    "shell/pick.py": "print('pick')\n",
    "themes/dark.yaml": "dark:\n  primary-color: black\n",
    "ha/blueprints/automation/domosenso/alert.yaml": "blueprint:\n  name: alert\n",
}
OTHER_FILES = {
    "component.yaml": MANIFEST.format(cid="other").replace("  templates: [templates/package.yaml.j2, templates/dashboard.lang.yaml.j2]\n", "")
    .replace("  dashboard_cards: [cards/panel-card.js]\n", "").replace("  themes: [themes/dark.yaml]\n", "")
    .replace("  ha_blueprints: [ha/blueprints/automation/domosenso/alert.yaml]\n", "").replace("  install_path: www/domosenso/other/<version>/\n", ""),
    "shell/pick.py": "print('other pick')\n",
}


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


@pytest.fixture
def catalog(tmp_path):
    repo = tmp_path / "catalog"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    write_files(repo / "components" / "panel", PANEL_FILES)
    write_files(repo / "components" / "other", OTHER_FILES)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "components")
    for cid in ("panel", "other"):
        git(repo, "tag", "-a", f"{cid}/1.0.0", "-m", f"{cid}/1.0.0")
    return repo


def commit_of(catalog: Path, cid: str) -> str:
    return git(catalog, "rev-parse", f"{cid}/1.0.0^{{commit}}")


@pytest.fixture
def home(tmp_path, catalog):
    root = tmp_path / "home"
    (root / "domosenso").mkdir(parents=True)
    (root / "domosenso" / "panel.inputs.yaml").write_text("prefix: demo\n")
    (root / "domosenso" / "other.inputs.yaml").write_text("{}\n")
    (root / "domosenso.yaml").write_text(
        yaml.safe_dump({
            "catalog": str(catalog),
            "config_dir": "home-assistant",
            "esphome_dir": "esphome",
            "targets": {},
            "components": {
                "panel": {"inputs": "domosenso/panel.inputs.yaml", "langs": ["en", "de"]},
                "other": {"inputs": "domosenso/other.inputs.yaml"},
            },
        })
    )
    return root


def lock_in(home: Path, catalog: Path, *ids: str) -> None:
    lock = Lock.load(home)
    for cid in ids:
        lock.components[cid] = LockEntry("1.0.0", f"{cid}/1.0.0", commit_of(catalog, cid))
    lock.save(home)


def run(home: Path, *argv: str, capsys) -> tuple[int, str]:
    capsys.readouterr()
    code = cli.main(["--home", str(home), *argv])
    return code, capsys.readouterr().out


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


HA = "home-assistant"
PANEL_DESTS = [
    f"{HA}/blueprints/automation/domosenso/alert.yaml",
    f"{HA}/dashboards/panel.de.yaml",
    f"{HA}/dashboards/panel.en.yaml",
    f"{HA}/packages/panel.yaml",
    f"{HA}/shell/pick.py",
    f"{HA}/themes/dark.yaml",
    f"{HA}/www/domosenso/panel/1.0.0/cards/lib/i18n.js",
    f"{HA}/www/domosenso/panel/1.0.0/cards/panel-card.js",
    f"{HA}/www/domosenso/panel/1.0.0/translations/de.json",
    f"{HA}/www/domosenso/panel/1.0.0/translations/en.json",
    f"{HA}/www/domosenso/panel/1.0.0/translations/pl.json",
]


def test_render_writes_files_and_lock(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    code, out = run(home, "render", capsys=capsys)
    assert code == 0 and out.endswith("ok\n")

    lock = Lock.load(home).components["panel"]
    assert sorted(lock.files) == PANEL_DESTS
    for dest, record in lock.files.items():
        assert (home / dest).is_file()
        assert record.sha256 == sha(home / dest)
        assert record.layer == "managed"
    assert lock.files[f"{HA}/packages/panel.yaml"].from_ == "templates/package.yaml.j2"
    assert lock.files[f"{HA}/dashboards/panel.de.yaml"].from_ == "templates/dashboard.lang.yaml.j2"
    assert lock.files[f"{HA}/shell/pick.py"].from_ == "shell/pick.py"
    assert lock.resources == ["/local/domosenso/panel/1.0.0/cards/panel-card.js"]

    stamp_line = stamps.stamp("panel", "1.0.0", commit_of(catalog, "panel")[:12])
    package = (home / f"{HA}/packages/panel.yaml").read_text()
    assert package == stamp_line + "sensor_prefix: demo\nnote: {{ states('sensor.x') }}\n"
    assert (home / f"{HA}/dashboards/panel.de.yaml").read_text() == stamp_line + "title: Tafel\nlang: de\n"
    for dest in PANEL_DESTS:
        text = (home / dest).read_text()
        assert text.startswith("# Rendered by Domosenso") == (dest.startswith(f"{HA}/packages/") or dest.startswith(f"{HA}/dashboards/")), dest
    assert (home / f"{HA}/shell/pick.py").read_bytes() == PANEL_FILES["shell/pick.py"].encode()
    assert not (home / f"{HA}/www/domosenso/panel/1.0.0/cards/panel-card.test.mjs").exists()
    assert not (home / f"{HA}/local.yaml").exists()  # templates/instance/ is not a managed output


def test_render_outputs_setting_overrides_destination(home, catalog, capsys):
    data = yaml.safe_load((home / "domosenso.yaml").read_text())
    data["components"]["panel"]["outputs"] = {"package.yaml": "packages/mine.yaml", "dashboard.<lang>.yaml": "dash/<lang>.yaml"}
    (home / "domosenso.yaml").write_text(yaml.safe_dump(data))
    lock_in(home, catalog, "panel")
    assert run(home, "render", capsys=capsys)[0] == 0
    assert (home / HA / "packages/mine.yaml").is_file() and (home / HA / "dash/de.yaml").is_file()


def test_render_is_idempotent(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    run(home, "render", capsys=capsys)
    before = (home / "domosenso.lock").read_text()
    code, out = run(home, "render", capsys=capsys)
    assert code == 0
    lines = out.splitlines()
    assert lines[-1] == "ok"
    assert [line.split()[0] for line in lines[:-1]] == ["same"] * (len(PANEL_DESTS) + 1)  # and the inventory
    assert (home / "domosenso.lock").read_text() == before


def test_render_names_the_files_it_writes(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    code, out = run(home, "render", "panel", capsys=capsys)
    assert f"write {HA}/packages/panel.yaml" in out.splitlines()


def test_hand_edit_refused(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    run(home, "render", capsys=capsys)
    edited = home / HA / "packages/panel.yaml"
    edited.write_text(edited.read_text() + "extra: 1\n")
    code, out = run(home, "render", capsys=capsys)
    assert code == 1
    assert out.splitlines()[-1] == f"FAIL hand-edited: {HA}/packages/panel.yaml"
    assert "extra: 1" in edited.read_text()


def test_hand_edit_refusal_writes_nothing(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    run(home, "render", capsys=capsys)
    (home / HA / "shell/pick.py").write_text("changed\n")
    (home / HA / "themes/dark.yaml").write_text("hand edited\n")
    # the package would be rewritten if the inputs changed; the refusal must come first
    (home / "domosenso/panel.inputs.yaml").write_text("prefix: changed\n")
    code, out = run(home, "render", capsys=capsys)
    assert code == 1 and "hand-edited" in out
    assert "sensor_prefix: demo" in (home / HA / "packages/panel.yaml").read_text()


def test_force_overwrites(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    run(home, "render", capsys=capsys)
    edited = home / HA / "packages/panel.yaml"
    edited.write_text("mine\n")
    code, out = run(home, "render", "--force", capsys=capsys)
    assert code == 0
    assert "sensor_prefix: demo" in edited.read_text()
    assert Lock.load(home).components["panel"].files[f"{HA}/packages/panel.yaml"].sha256 == sha(edited)


def test_changed_inputs_rewrite_a_managed_file(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    run(home, "render", capsys=capsys)
    (home / "domosenso/panel.inputs.yaml").write_text("prefix: changed\n")
    code, out = run(home, "render", capsys=capsys)
    assert code == 0 and f"write {HA}/packages/panel.yaml" in out.splitlines()
    assert "sensor_prefix: changed" in (home / HA / "packages/panel.yaml").read_text()


def test_shell_collision_between_components(home, catalog, capsys):
    lock_in(home, catalog, "panel", "other")
    code, out = run(home, "render", "panel", capsys=capsys)
    assert code == 0
    code, out = run(home, "render", "other", capsys=capsys)
    assert code == 1
    assert out.splitlines()[-1] == f"FAIL owned by panel: {HA}/shell/pick.py"
    assert (home / HA / "shell/pick.py").read_text() == "print('pick')\n"


def test_unmanaged_identical_file_adopted_by_render(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    run(home, "render", capsys=capsys)
    lock = Lock.load(home)
    del lock.components["panel"].files[f"{HA}/shell/pick.py"]  # forget it: now an untracked file
    lock.save(home)
    pick = home / HA / "shell/pick.py"
    before = pick.stat().st_mtime_ns
    code, out = run(home, "render", capsys=capsys)
    assert code == 0 and f"same {HA}/shell/pick.py" in out.splitlines()
    assert pick.stat().st_mtime_ns == before
    assert Lock.load(home).components["panel"].files[f"{HA}/shell/pick.py"].sha256 == sha(pick)


def test_unmanaged_differing_file_refused(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    own = home / HA / "shell/pick.py"
    own.parent.mkdir(parents=True)
    own.write_text("the home's own\n")
    code, out = run(home, "render", capsys=capsys)
    assert code == 1 and out.splitlines()[-1] == f"FAIL not managed, differs: {HA}/shell/pick.py"
    assert own.read_text() == "the home's own\n"
    code, out = run(home, "render", "--force", capsys=capsys)
    assert code == 0 and own.read_text() == "print('pick')\n"


def test_render_without_lock_entry(home, catalog, capsys):
    code, out = run(home, "render", "panel", capsys=capsys)
    assert code == 1 and out.splitlines()[-1] == "FAIL panel is not in domosenso.lock: add it first"
    code, out = run(home, "render", "nope", capsys=capsys)
    assert code == 1 and out.splitlines()[-1] == "FAIL nope is not in domosenso.yaml"


def test_render_default_is_every_locked_component(home, catalog, capsys):
    lock_in(home, catalog, "panel")  # `other` is declared but not locked
    run(home, "render", capsys=capsys)
    assert (home / HA / "packages/panel.yaml").exists() and not (home / HA / "shell/other").exists()


def test_missing_inputs_file_is_named(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    (home / "domosenso/panel.inputs.yaml").unlink()
    code, out = run(home, "render", capsys=capsys)
    assert code == 1 and "panel.inputs.yaml" in out.splitlines()[-1] and out.startswith("FAIL")


def test_moved_tag_is_refused(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    write_files(catalog / "components" / "panel", {"shell/pick.py": "moved\n"})
    git(catalog, "add", "-A")
    git(catalog, "commit", "-q", "-m", "move")
    git(catalog, "tag", "-a", "-f", "panel/1.0.0", "-m", "again")
    code, out = run(home, "render", capsys=capsys)
    assert code == 1 and "moved" in out and "panel/1.0.0" in out


def test_json_output(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    code, out = run(home, "render", "--json", capsys=capsys)
    document = json.loads(out)
    assert code == 0 and document["result"] == "ok"
    assert ["write", f"{HA}/shell/pick.py"] in document["lines"]


def test_catalog_dev_is_dirty_and_leaves_the_lock(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    run(home, "render", capsys=capsys)
    before = (home / "domosenso.lock").read_text()
    write_files(catalog / "components" / "panel", {"templates/package.yaml.j2": "sensor_prefix: [[ inputs.prefix ]]\ndev: 1\n"})
    code, out = run(home, "render", "--catalog-dev", str(catalog), capsys=capsys)
    assert code == 0
    first = (home / HA / "packages/panel.yaml").read_text().splitlines()[0]
    parsed = stamps.parse(first)
    assert parsed and parsed.dirty and parsed.cid == "panel" and parsed.version == "1.0.0"
    assert (home / "domosenso.lock").read_text() == before
    write_files(catalog / "components" / "panel", {"templates/package.yaml.j2": "sensor_prefix: [[ inputs.prefix ]]\ndev: 2\n"})
    code, out = run(home, "render", "--catalog-dev", str(catalog), capsys=capsys)  # a second dev render replaces the first
    assert code == 0 and "dev: 2" in (home / HA / "packages/panel.yaml").read_text()


def render_by_hand(home: Path, catalog: Path, cid: str, old_stamp: bool = True) -> None:
    """Files as a home had them before `domosenso`: the same output, stamped in the old form."""
    lock_in(home, catalog, cid)
    run_cli = cli.main(["--home", str(home), "render", cid])
    assert run_cli == 0
    (home / "domosenso.lock").unlink()
    if old_stamp:
        for path in (home / HA).rglob("*.yaml"):
            text = path.read_text()
            if text.startswith("# Rendered by Domosenso"):
                path.write_text(f"# Rendered by Domosenso from {cid}@abc1234 — do not edit\n" + stamps.body(text))


def test_adopt_equal(home, catalog, capsys):
    render_by_hand(home, catalog, "panel")
    capsys.readouterr()
    listing = home / HA / inventory.PACKAGE
    snapshot = {p: p.read_bytes() for p in (home / HA).rglob("*") if p.is_file() and p != listing}
    code, out = run(home, "adopt", "panel@1.0.0", capsys=capsys)
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    assert listing.is_file()  # the one file adopt writes: the inventory
    assert {p: p.read_bytes() for p in (home / HA).rglob("*") if p.is_file() and p != listing} == snapshot
    entry = Lock.load(home).components["panel"]
    assert entry.version == "1.0.0" and entry.tag == "panel/1.0.0" and entry.commit == commit_of(catalog, "panel")
    assert sorted(entry.files) == PANEL_DESTS
    for dest, record in entry.files.items():
        assert record.sha256 == sha(home / dest)  # the file as it is on disk, old stamp included
    # a render now rewrites the stamp line only, and does not call the file hand-edited
    code, out = run(home, "render", capsys=capsys)
    assert code == 0
    assert f"write {HA}/packages/panel.yaml" in out.splitlines()
    assert (home / HA / "packages/panel.yaml").read_text().startswith("# Rendered by Domosenso from panel/1.0.0 (")


def test_adopt_unequal(home, catalog, capsys):
    render_by_hand(home, catalog, "panel")
    (home / HA / "shell/pick.py").write_text("print('changed')\n")
    code, out = run(home, "adopt", "panel@1.0.0", capsys=capsys)
    assert code == 1
    assert out.splitlines()[-1].startswith("FAIL ") and f"{HA}/shell/pick.py" in out.splitlines()[-1]
    assert not (home / "domosenso.lock").exists()
    assert (home / HA / "shell/pick.py").read_text() == "print('changed')\n"


def test_adopt_missing_file(home, catalog, capsys):
    render_by_hand(home, catalog, "panel")
    (home / HA / "themes/dark.yaml").unlink()
    code, out = run(home, "adopt", "panel@1.0.0", capsys=capsys)
    assert code == 1 and f"{HA}/themes/dark.yaml (missing)" in out
    assert not (home / "domosenso.lock").exists()


def test_adopt_unequal_template_body(home, catalog, capsys):
    render_by_hand(home, catalog, "panel")
    package = home / HA / "packages/panel.yaml"
    package.write_text(package.read_text() + "extra: 1\n")
    code, out = run(home, "adopt", "panel@1.0.0", capsys=capsys)
    assert code == 1 and f"{HA}/packages/panel.yaml" in out


def test_adopt_argument_and_state_errors(home, catalog, capsys):
    assert run(home, "adopt", "panel", capsys=capsys) == (1, "FAIL expected <id>@<version>, got 'panel'\n")
    assert run(home, "adopt", "panel@9.9.9", capsys=capsys) == (1, "FAIL no tag panel/9.9.9\n")
    assert run(home, "adopt", "nope@1.0.0", capsys=capsys) == (1, "FAIL nope is not in domosenso.yaml\n")
    lock_in(home, catalog, "panel")
    code, out = run(home, "adopt", "panel@1.0.0", capsys=capsys)
    assert code == 1 and "already locked at 1.0.0" in out


def test_dropped_language_is_reported_stale(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    run(home, "render", capsys=capsys)
    data = yaml.safe_load((home / "domosenso.yaml").read_text())
    data["components"]["panel"]["langs"] = ["en"]
    (home / "domosenso.yaml").write_text(yaml.safe_dump(data))
    code, out = run(home, "render", capsys=capsys)
    assert code == 0 and f"stale {HA}/dashboards/panel.de.yaml" in out.splitlines()
    assert f"{HA}/dashboards/panel.de.yaml" not in Lock.load(home).components["panel"].files
    assert (home / HA / "dashboards/panel.de.yaml").exists()  # left for the human to delete


def test_plan_outputs_instance_layer(home, catalog, tmp_path):
    from domosenso_cli.build import open_catalog, plan_outputs
    from domosenso_cli.home import HomeConfig

    config = HomeConfig.load(home)
    (home / "domosenso/panel.inputs.yaml").write_text("prefix: demo\nnot_given: 1\n")
    directory = open_catalog(config).checkout("panel", "1.0.0", None)
    plain = plan_outputs(config, config.components["panel"], directory, "1.0.0", "a" * 40)
    with_instance = plan_outputs(config, config.components["panel"], directory, "1.0.0", "a" * 40, instance=True)
    extra = [o for o in with_instance if o not in plain]
    assert [(o.dest, o.layer, o.content) for o in extra] == [(f"{HA}/local.yaml", "instance", b"owned_by_home: 1\n")]


def test_plan_outputs_leave_out_a_template_that_renders_empty(home, catalog, tmp_path):
    import shutil

    from domosenso_cli.build import open_catalog, plan_outputs
    from domosenso_cli.home import HomeConfig

    config = HomeConfig.load(home)
    directory = tmp_path / "panel"
    shutil.copytree(open_catalog(config).checkout("panel", "1.0.0", None), directory)
    (directory / "templates/extra.lang.yaml.j2").write_text("[% if inputs.extra is defined %]x: 1\n[% endif %]\n")
    dests = lambda: {o.dest for o in plan_outputs(config, config.components["panel"], directory, "1.0.0", "a" * 40)}
    assert not {d for d in dests() if "extra" in d}
    (home / "domosenso/panel.inputs.yaml").write_text("prefix: demo\nextra: true\n")
    assert {d for d in dests() if "extra" in d} == {f"{HA}/dashboards/extra.en.yaml", f"{HA}/dashboards/extra.de.yaml"}


# --- --catalog-dev on an unlocked component, and write failures (Task 7 findings) ----------------


def dev_render(home, catalog, capsys, *ids):
    return run(home, "render", "--catalog-dev", str(catalog), *ids, capsys=capsys)


def set_template(catalog, text):
    write_files(catalog / "components" / "panel", {"templates/package.yaml.j2": text})


def test_second_dev_render_of_an_unlocked_component_replaces_its_dirty_files(home, catalog, capsys):
    code, out = dev_render(home, catalog, capsys, "panel")
    assert code == 0 and not Lock.load(home).components
    set_template(catalog, "sensor_prefix: [[ inputs.prefix ]]\ndev: 2\n")
    code, out = dev_render(home, catalog, capsys, "panel")
    assert code == 0, out
    assert "dev: 2" in (home / HA / "packages/panel.yaml").read_text()
    assert f"dev {HA}/packages/panel.yaml" in out.splitlines()


def test_second_dev_render_replaces_its_unstamped_cards_and_translations(home, catalog, capsys):
    """Cards and translations carry no stamp: the inventory's sha256 says they are the dev render's own."""
    assert dev_render(home, catalog, capsys, "panel")[0] == 0
    write_files(catalog / "components" / "panel", {
        "cards/lib/i18n.js": "export const t = (k) => k + '!';\n", "translations/de.json": '{"ui": {"title": "Neu"}}',
    })
    code, out = dev_render(home, catalog, capsys, "panel")
    assert (code, out.splitlines()[-1]) == (0, "ok"), out
    assert "+ '!'" in (home / HA / "www/domosenso/panel/1.0.0/cards/lib/i18n.js").read_text()
    assert "Neu" in (home / HA / "dashboards/panel.de.yaml").read_text()


def test_second_dev_render_refuses_its_file_edited_by_hand(home, catalog, capsys):
    assert dev_render(home, catalog, capsys, "panel")[0] == 0
    i18n = home / HA / "www/domosenso/panel/1.0.0/cards/lib/i18n.js"
    i18n.write_text("// mine\n")
    write_files(catalog / "components" / "panel", {"cards/lib/i18n.js": "export const t = (k) => k + '!';\n"})
    code, out = dev_render(home, catalog, capsys, "panel")
    assert (code, out.splitlines()[-1]) == (1, f"FAIL hand-edited: {HA}/www/domosenso/panel/1.0.0/cards/lib/i18n.js")
    assert i18n.read_text() == "// mine\n"


def test_dev_render_still_refuses_a_file_that_is_not_its_own_dirty_output(home, catalog, capsys):
    package = home / HA / "packages/panel.yaml"
    package.parent.mkdir(parents=True)
    for first_line in (
        "# Rendered by Domosenso from other/1.0.0 (abcdef1-dirty) — do not edit",  # another component's
        "# Rendered by Domosenso from panel/1.0.0 (abcdef1) — do not edit",  # a clean render, not a dev one
        "# the home's own",
    ):
        package.write_text(first_line + "\nmine: 1\n")
        code, out = dev_render(home, catalog, capsys, "panel")
        assert code == 1 and out.splitlines()[-1] == f"FAIL not managed, differs: {HA}/packages/panel.yaml", first_line
        assert package.read_text() == first_line + "\nmine: 1\n"


def test_dev_render_names_a_file_that_differs_from_the_lock(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    run(home, "render", capsys=capsys)
    set_template(catalog, "sensor_prefix: [[ inputs.prefix ]]\ndev: 1\n")
    code, out = dev_render(home, catalog, capsys, "panel")
    assert code == 0 and f"write {HA}/packages/panel.yaml" in out.splitlines()  # still what the lock describes
    set_template(catalog, "sensor_prefix: [[ inputs.prefix ]]\ndev: 2\n")
    code, out = dev_render(home, catalog, capsys, "panel")
    lines = out.splitlines()
    assert code == 0 and f"dev {HA}/packages/panel.yaml" in lines  # the first dev render's file, not the lock's
    assert f"write {HA}/packages/panel.yaml" not in lines
    assert f"same {HA}/shell/pick.py" in lines


def test_write_oserror_names_the_destination(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    (home / HA).mkdir(parents=True)
    (home / HA / "shell").write_text("a file where a directory belongs\n")
    code, out = run(home, "render", capsys=capsys)
    last = out.splitlines()[-1]
    assert code == 1 and last.startswith(f"FAIL cannot write {HA}/shell/pick.py: ")


def test_default_package_destination_is_a_valid_package_name():
    # Home Assistant names a package after its file (`!include_dir_named`) and refuses a hyphen.
    from domosenso_cli.build import _template_destination
    from domosenso_cli.home import ComponentEntry

    entry = ComponentEntry("climate-air", Path("domosenso/climate-air.inputs.yaml"))
    assert _template_destination(entry, "package.yaml", None) == "packages/climate_air.yaml"
    assert _template_destination(entry, "dashboard.<lang>.yaml", "de") == "dashboards/climate-air.de.yaml"


def test_every_language_template_is_a_dashboard():
    # A *.lang.yaml.j2 is rendered per language because it has labels: a dashboard, never a package
    # (ramka's settings dashboard, SPEC-021).
    from domosenso_cli.build import _template_destination
    from domosenso_cli.home import ComponentEntry

    entry = ComponentEntry("ramka", Path("domosenso/ramka.inputs.yaml"))
    assert _template_destination(entry, "ramka-settings.<lang>.yaml", "de") == "dashboards/ramka-settings.de.yaml"
    assert _template_destination(entry, "dashboard.<lang>.yaml", "pl") == "dashboards/ramka.pl.yaml"
    entry.outputs["ramka-settings.<lang>.yaml"] = "dash/settings-<lang>.yaml"
    assert _template_destination(entry, "ramka-settings.<lang>.yaml", "en") == "dash/settings-en.yaml"


# --- the inventory, packages/domosenso.yaml (SPEC-023) -----------------------------------------------


def _listed(home: Path) -> tuple[dict, list[dict]]:
    """The inventory's sensor and its `components`, as Home Assistant would render the attribute."""
    import jinja2
    document = yaml.safe_load((home / HA / inventory.PACKAGE).read_text())
    sensor = document["template"][0]["sensor"][0]
    rendered = jinja2.Environment().from_string(sensor["attributes"]["components"]).render()
    import ast
    return sensor, ast.literal_eval(rendered)


def test_render_writes_the_inventory_and_released(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    assert Lock.load(home).components["panel"].released is None  # a lock from before SPEC-023
    code, out = run(home, "render", capsys=capsys)
    assert code == 0, out
    assert f"write {HA}/{inventory.PACKAGE}" in out.splitlines()
    date = git(catalog, "log", "-1", "--format=%cs", "panel/1.0.0")
    assert Lock.load(home).components["panel"].released == date
    assert yaml.safe_load((home / "domosenso.lock").read_text())["components"]["panel"]["released"] == date
    text = (home / HA / inventory.PACKAGE).read_text()
    assert text.startswith(inventory.STAMP) and stamps.parse(text.splitlines()[0]) is None
    sensor, listed = _listed(home)
    assert sensor["default_entity_id"] == "sensor.domosenso_components" and sensor["state"] == "1"
    assert sensor["attributes"]["component"] == "domosenso"
    assert listed == [
        {"id": cid, "version": "1.0.0", "tag": f"{cid}/1.0.0", "commit": commit_of(catalog, cid)[:12],
         "released": date, "dev": False, "package": ""}
        for cid in ("panel",)
    ]


def test_dev_render_marks_its_item(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    run(home, "render", capsys=capsys)
    before = (home / "domosenso.lock").read_text()
    code, out = run(home, "render", "--catalog-dev", str(catalog), "panel", capsys=capsys)
    assert code == 0, out
    assert (home / "domosenso.lock").read_text() == before  # a dev render leaves the lock alone
    _, listed = _listed(home)
    head = git(catalog, "rev-parse", "--short=12", "HEAD")
    assert listed == [{"id": "panel", "version": "1.0.0", "tag": "", "commit": f"{head}-dirty",
                       "released": git(catalog, "log", "-1", "--format=%cs", "HEAD"), "dev": True, "package": ""}]
    # the tag again: the dev item goes
    run(home, "render", "panel", capsys=capsys)
    assert _listed(home)[1][0]["dev"] is False


def test_status_classifies_the_inventory(home, catalog, capsys):
    lock_in(home, catalog, "panel")
    run(home, "render", capsys=capsys)
    code, out = run(home, "status", capsys=capsys)
    assert f"managed {HA}/{inventory.PACKAGE}" in out.splitlines()
    (home / HA / inventory.PACKAGE).write_text("changed\n")
    code, out = run(home, "status", capsys=capsys)
    assert f"managed-modified {HA}/{inventory.PACKAGE}" in out.splitlines()
    run(home, "render", capsys=capsys)  # derived: render puts it back without --force
    code, out = run(home, "status", capsys=capsys)
    assert f"managed {HA}/{inventory.PACKAGE}" in out.splitlines()


def test_lock_without_components_has_no_inventory(home, catalog, capsys):
    lock_in(home, catalog)
    (home / HA / "packages").mkdir(parents=True)
    (home / HA / inventory.PACKAGE).write_text("left over\n")
    code, out = run(home, "render", capsys=capsys)
    assert f"remove {HA}/{inventory.PACKAGE}" in out.splitlines()
    assert not (home / HA / inventory.PACKAGE).exists()



def test_render_dates_every_locked_component_and_sees_the_manifest(home, catalog, capsys):
    """`render panel` dates `other` too; the command's render has the `component` global (SPEC-023)."""
    panel = catalog / "components" / "panel"
    (panel / "component.yaml").write_text(MANIFEST.format(cid="panel").replace("version: 1.0.0", "version: 1.0.1"))
    (panel / "templates" / "about.yaml.j2").write_text("about: '[[ component.id ]] [[ component.version ]]'\n")
    git(catalog, "add", "-A")
    git(catalog, "commit", "-q", "-m", "about")
    git(catalog, "tag", "-a", "panel/1.0.1", "-m", "panel/1.0.1")
    lock = Lock.load(home)
    lock.components["panel"] = LockEntry("1.0.1", "panel/1.0.1", git(catalog, "rev-parse", "panel/1.0.1^{commit}"))
    lock.components["other"] = LockEntry("1.0.0", "other/1.0.0", commit_of(catalog, "other"))
    lock.save(home)
    code, out = run(home, "render", "panel", capsys=capsys)
    assert code == 0, out
    assert yaml.safe_load((home / HA / "packages/panel_about.yaml").read_text()) == {"about": "panel 1.0.1"}
    assert Lock.load(home).components["other"].released == git(catalog, "log", "-1", "--format=%cs", "other/1.0.0")
    assert all(item["released"] for item in _listed(home)[1])


def test_inventory_lists_a_borrowed_esphome_package(home, catalog, capsys):
    """A board that pulls a catalog component's ESPHome package, the component not locked (SPEC-023)."""
    lock_in(home, catalog, "panel")
    (home / "esphome").mkdir()
    (home / "esphome" / "proxy.yaml").write_text(
        "packages:\n  proxy: github://owner/repo/components/other/esphome/ble-proxy.yaml@other/0.2.1\n"
        "  self: github://owner/repo/components/panel/esphome/x.yaml@panel/1.0.0\n")
    code, out = run(home, "render", capsys=capsys)
    assert code == 0, out
    listed = {item["id"]: item for item in _listed(home)[1]}
    assert listed["other"] == {"id": "other", "version": "0.2.1", "tag": "other/0.2.1", "commit": "", "released": "",
                               "dev": False, "package": "proxy.yaml"}
    assert listed["panel"]["package"] == ""  # locked: listed from the lock, not as a package
