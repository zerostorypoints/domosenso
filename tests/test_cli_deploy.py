"""`domosenso deploy` and `rollback` against `FakeTarget` and `FakeHA` (SPEC-002 sections 1.6 and 4.3)."""
import asyncio
import io
import json
import re
import tarfile
from pathlib import Path

import pytest
import yaml

from domosenso_cli import cmd_deploy, deploy, inventory
from domosenso_cli.build import sha256
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.lock import FileRecord, Lock, LockEntry
from domosenso_cli.main import main
from domosenso_cli.resources import Action
from domosenso_cli.stamps import stamp
from fakes import FakeHA, FakeTarget

CONFIG = "home-assistant"
COMMIT = "a" * 40
CARD = "/local/domosenso/ramka/0.1.1/cards/agenda-card.js"
BLUEPRINT_LINE = "ERROR:homeassistant.components.automation:Blueprint 'x' generated invalid automation with inputs {}"
CLEAN = json.dumps({"total_errors": 0, "total_warnings": 0, "errors": {}, "warnings": {}}, indent=2)


class Resources:
    """Home Assistant's `lovelace/resources` collection, for FakeHA."""

    def __init__(self, items: list[dict]):
        self.items = [dict(i) for i in items]
        self.next_id = 100

    def _update(self, f):
        item = next(i for i in self.items if i["id"] == f["resource_id"])
        item.update(url=f["url"], type=f["res_type"])

    def _create(self, f):
        self.next_id += 1
        item = {"id": str(self.next_id), "url": f["url"], "type": f["res_type"]}
        self.items.append(item)
        return item

    def _delete(self, f):
        self.items = [i for i in self.items if i["id"] != f["resource_id"]]

    def ha(self, **http) -> FakeHA:
        return FakeHA({
            "lovelace/resources": lambda f: [dict(i) for i in self.items],
            "lovelace/resources/update": self._update,
            "lovelace/resources/create": self._create,
            "lovelace/resources/delete": self._delete,
        }, **http)

    def urls(self) -> dict[str, str]:
        return {i["id"]: i["url"] for i in self.items}


class Home:
    """A home repository in a temporary directory: config files, a lock, and a declaration."""

    def __init__(self, tmp_path: Path, local=("packages/*.yaml", "dashboards/*.yaml", "www/*.js"),
                 unmanaged=("automations.yaml",)):
        self.root = tmp_path / "home"
        self.config = self.root / CONFIG
        self.config.mkdir(parents=True)
        self.local, self.unmanaged = list(local), list(unmanaged)
        self.lock = Lock()
        self.target_dir = tmp_path / "target"
        self.target_dir.mkdir()

    def write(self, rel: str, text: str) -> Path:
        path = self.config / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def managed(self, rel: str, text: str, cid: str = "ramka", layer: str = "managed") -> None:
        path = self.write(rel, text)
        entry = self.lock.components.setdefault(cid, LockEntry("0.1.1", f"{cid}/0.1.1", COMMIT))
        entry.files[f"{CONFIG}/{rel}"] = FileRecord(sha256(path.read_bytes()), "templates/x.j2", layer)

    def sync_inventory(self) -> None:
        """packages/domosenso.yaml as `render` would leave it for this lock and these dev renders (SPEC-022)."""
        inventory.write(self.config_obj(), self.lock)

    def config_obj(self) -> HomeConfig:
        return HomeConfig(
            root=self.root, catalog="c", config_dir=self.config, esphome_dir=self.root / "esphome",
            targets={}, components={}, local=self.local, unmanaged_on_target=self.unmanaged,
        )

    def declare(self, targets=("staging", "production")) -> None:
        """domosenso.yaml and domosenso.lock on disk, for runs through `main`."""
        token = self.root / "token"
        token.write_text("t")
        declaration = {
            "catalog": "c", "config_dir": CONFIG, "esphome_dir": "esphome",
            "targets": {
                name: {"kind": "local-docker", "container": name, "config": "../target", "url": "http://x",
                       "token_file": str(token)}
                for name in targets
            },
            "components": {}, "local": self.local, "unmanaged_on_target": self.unmanaged,
        }
        (self.root / "domosenso.yaml").write_text(yaml.safe_dump(declaration))
        self.lock.save(self.root)
        self.sync_inventory()


def on_target(target: FakeTarget, rel: str, text: str) -> None:
    target.put({rel: text.encode()})


def target_files(target_dir: Path) -> dict[str, str]:
    """Every file on the target except the deploy backups, with its sha256."""
    out = {}
    for path in sorted(target_dir.rglob("*")):
        rel = path.relative_to(target_dir).as_posix()
        if path.is_file() and not rel.startswith(".domosenso/predeploy-"):
            out[rel] = sha256(path.read_bytes())
    return out


def record(target_dir: Path) -> dict | None:
    path = target_dir / deploy.RECORD
    return json.loads(path.read_text()) if path.is_file() else None


def plan_for(home: Home, target: FakeTarget, existing: list[dict] | None = None) -> deploy.Plan:
    home.sync_inventory()
    return deploy.make_plan(home.config_obj(), home.lock, target, existing or [])


def run_apply(home: Home, target: FakeTarget, ha: FakeHA, plan: deploy.Plan, remove_orphans=(), prune=False,
              name: str = "staging") -> str:
    return asyncio.run(deploy.apply(home.config_obj(), home.lock, plan, target, ha, list(remove_orphans), prune,
                                    target=name))


def run_rollback(home: Home, target: FakeTarget, ha: FakeHA, deploy_id: str | None = None) -> str:
    return asyncio.run(deploy.rollback(home.config_obj(), target, ha, deploy_id, target="staging"))


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    """A deploy id per call, one second apart: tests deploy several times within one real second."""
    ticks = iter(range(10**6))
    monkeypatch.setattr(deploy, "_new_id", lambda: f"20261021T12{next(ticks):04d}Z")


@pytest.fixture
def fakes(monkeypatch):
    """Route the command's target and Home Assistant to fakes; returns a dict to fill per test."""
    box: dict = {}
    monkeypatch.setattr(cmd_deploy, "open_target", lambda t: box["target"])
    monkeypatch.setattr(cmd_deploy, "connect", lambda t: box["ha"])
    return box


def cli(home: Home, *argv: str) -> int:
    return main(["--home", str(home.root), *argv])


# --- plan -------------------------------------------------------------------------------------


def test_plan_lines(tmp_path, fakes, capsys):
    home = Home(tmp_path)
    home.managed("packages/ramka.yaml", "a: 2\n")
    home.managed("dashboards/ramka.en.yaml", "views: []\n")
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir)
    on_target(target, "packages/ramka.yaml", "a: 1\n")
    on_target(target, "dashboards/ramka.en.yaml", "views: []\n")

    plan = plan_for(home, target)
    assert plan.add == ["packages/domosenso.yaml", "packages/mine.yaml"]
    assert plan.change == ["packages/ramka.yaml"]
    assert plan.keep == ["dashboards/ramka.en.yaml"]
    assert plan.remove == [] and plan.orphan == []
    assert plan.restart is True
    assert len(plan.hash) == deploy.HASH_LENGTH

    home.declare()
    fakes.update(target=target, ha=Resources([]).ha())
    assert cli(home, "deploy", "staging", "--plan") == 0
    lines = capsys.readouterr().out.splitlines()
    assert lines == [
        "add packages/domosenso.yaml",
        "add packages/mine.yaml",
        "change packages/ramka.yaml",
        "keep dashboards/ramka.en.yaml",
        "restart: yes",
        f"hash {plan.hash}",
        "ok",
    ]
    assert target.execs == [] and target.restarts == 0  # a plan writes nothing


def test_plan_lists_resource_actions(tmp_path):
    home = Home(tmp_path)
    home.lock.components["ramka"] = LockEntry("0.1.1", "ramka/0.1.1", COMMIT, resources=[CARD])
    plan = plan_for(home, FakeTarget(home.target_dir), [{"id": "r1", "url": "/local/agenda-card.js?v=6", "type": "module"}])
    assert plan.resources == [Action("update", CARD, "r1", "/local/agenda-card.js?v=6")]
    assert ["resource", "update", CARD, "from", "/local/agenda-card.js?v=6"] in deploy.plan_lines(plan)


def test_change_limited_to_www_and_dashboards_needs_no_restart(tmp_path):
    home = Home(tmp_path)
    home.write("www/radar-card.js", "x")
    home.write("dashboards/home.yaml", "views: []\n")
    assert plan_for(home, FakeTarget(home.target_dir)).restart is False


def test_plan_hash_changes_with_content(tmp_path):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir)
    first = plan_for(home, target).hash
    home.write("packages/mine.yaml", "b: 2\n")
    assert plan_for(home, target).hash != first


def test_esphome_files_in_the_lock_are_not_carried(tmp_path):
    home = Home(tmp_path)
    device = home.root / "esphome" / "ramka.yaml"
    device.parent.mkdir()
    device.write_text("esphome: {}\n")
    entry = home.lock.components.setdefault("ramka", LockEntry("0.1.1", "ramka/0.1.1", COMMIT))
    entry.files["esphome/ramka.yaml"] = FileRecord(sha256(device.read_bytes()), "esphome/x.yaml", "instance")
    plan = plan_for(home, FakeTarget(home.target_dir))
    assert plan.add == [inventory.PACKAGE]  # the inventory, not the device file


def test_hand_edited_managed_file_is_refused(tmp_path):
    home = Home(tmp_path)
    home.managed("packages/ramka.yaml", "a: 1\n")
    home.write("packages/ramka.yaml", "a: edited\n")
    with pytest.raises(DomosensoError, match=f"hand-edited: {CONFIG}/packages/ramka.yaml"):
        plan_for(home, FakeTarget(home.target_dir))


def test_dev_render_goes_to_staging_but_not_production(tmp_path):
    home = Home(tmp_path)
    home.managed("packages/ramka.yaml", "a: 1\n")
    home.write("packages/ramka.yaml", stamp("ramka", "0.1.1", "abcdef1", dirty=True) + "a: 2\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    plan = plan_for(home, target)
    assert plan.dirty == ["packages/ramka.yaml"]
    with pytest.raises(DomosensoError, match="dev render: packages/ramka.yaml"):
        run_apply(home, target, Resources([]).ha(), plan, name="production")
    assert target_files(home.target_dir) == {}
    run_apply(home, target, Resources([]).ha(), plan, name="staging")
    assert (home.target_dir / "packages/ramka.yaml").read_text().endswith("a: 2\n")


# --- --allow-dirty (SPEC-019 A) ---------------------------------------------------------------

DIRTY = "packages/ramka.yaml"


def dirty_home(tmp_path) -> Home:
    home = Home(tmp_path)
    home.managed(DIRTY, "a: 1\n")
    home.write(DIRTY, stamp("ramka", "0.1.1", "abcdef1", dirty=True) + "a: 2\n")
    home.declare()
    return home


class Terminal(io.StringIO):
    def isatty(self):
        return True


def plan_hash(capsys, home: Home) -> str:
    assert cli(home, "deploy", "production", "--plan") == 0
    return capsys.readouterr().out.splitlines()[-2].removeprefix("hash ")


def test_production_refuses_dirty_without_flag(tmp_path, fakes, capsys):
    home = dirty_home(tmp_path)
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    fakes.update(target=target, ha=Resources([]).ha())
    digest = plan_hash(capsys, home)
    assert cli(home, "deploy", "production", "--apply", "--confirm", digest) == 1
    assert f"FAIL dev render: {DIRTY}: production takes only files rendered from a tag" in capsys.readouterr().out
    assert target_files(home.target_dir) == {}


def test_allow_dirty_needs_confirm(tmp_path, fakes, capsys, monkeypatch):
    home = dirty_home(tmp_path)
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    fakes.update(target=target, ha=Resources([]).ha())
    assert cli(home, "deploy", "production", "--apply", "--allow-dirty") == 1
    assert "FAIL dev render needs --confirm" in capsys.readouterr().out
    monkeypatch.setattr("sys.stdin", Terminal("production\n"))  # typing the word is not enough
    assert cli(home, "deploy", "production", "--apply", "--allow-dirty") == 1
    assert "FAIL dev render needs --confirm" in capsys.readouterr().out
    assert target_files(home.target_dir) == {}


def test_allow_dirty_with_confirm_deploys(tmp_path, fakes, capsys):
    home = dirty_home(tmp_path)
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    fakes.update(target=target, ha=Resources([]).ha())
    digest = plan_hash(capsys, home)
    assert cli(home, "deploy", "production", "--apply", "--allow-dirty", "--confirm", digest) == 0
    out = capsys.readouterr().out
    assert f"dev-render {DIRTY}" in out
    assert (home.target_dir / DIRTY).read_text().endswith("a: 2\n")
    deployed = record(home.target_dir)
    assert deployed["dev_render"] == {"paths": [DIRTY], "allowed": True}
    plan_json = json.loads((home.target_dir / f".domosenso/predeploy-{deployed['deploy_id']}/plan.json").read_text())
    assert plan_json["dev_render"] == {"paths": [DIRTY], "allowed": True}
    assert plan_json["allow_dirty"] is True
    local = home.root / ".domosenso/deploys/production" / deployed["deploy_id"] / "plan.json"
    assert json.loads(local.read_text())["dev_render"] == {"paths": [DIRTY], "allowed": True}


def test_allow_dirty_stale_hash(tmp_path, fakes, capsys):
    home = dirty_home(tmp_path)
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    fakes.update(target=target, ha=Resources([]).ha())
    assert cli(home, "deploy", "production", "--apply", "--allow-dirty", "--confirm", "000000000000") == 1
    assert "FAIL the plan changed" in capsys.readouterr().out
    assert target_files(home.target_dir) == {}


def test_allow_dirty_on_a_clean_plan_changes_nothing(tmp_path, fakes, capsys):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    home.declare()
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    fakes.update(target=target, ha=Resources([]).ha())
    assert cli(home, "deploy", "production", "--apply", "--allow-dirty", "--confirm", plan_hash(capsys, home)) == 0
    assert "dev_render" not in record(home.target_dir)


def test_clean_plan_hash_unchanged(tmp_path):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    # Recorded before SPEC-019 and SPEC-022 (no component, so no inventory): a plan without dev renders
    # keeps the hash it had.
    assert plan_for(home, FakeTarget(home.target_dir)).hash == "b3f0f3391221"


def test_dirty_keep_changes_hash(tmp_path):
    home = Home(tmp_path)
    home.managed(DIRTY, "a: 1\n")
    target = FakeTarget(home.target_dir)
    on_target(target, DIRTY, "a: 1\n")
    clean = plan_for(home, target)
    assert clean.keep == [DIRTY] and clean.dirty == []
    text = stamp("ramka", "0.1.1", "abcdef1", dirty=True) + "a: 2\n"
    home.write(DIRTY, text)
    on_target(target, DIRTY, text)  # already on the target: still `keep`, but the human must read it
    dirty = plan_for(home, target)
    assert dirty.keep == [DIRTY] and dirty.dirty == [DIRTY]
    assert dirty.hash != clean.hash


def test_plan_warns_target_runs_dev_render(tmp_path, fakes, capsys):
    home = dirty_home(tmp_path)
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    fakes.update(target=target, ha=Resources([]).ha())
    assert cli(home, "deploy", "staging", "--apply") == 0
    deploy_id = record(home.target_dir)["deploy_id"]
    capsys.readouterr()
    assert cli(home, "deploy", "staging", "--plan") == 0
    lines = capsys.readouterr().out.splitlines()
    warning = f"warning target runs a dev render: 1 files (deploy {deploy_id})"
    assert warning in lines
    assert lines[lines.index(warning) + 1].startswith("restart:")
    assert record(home.target_dir)["dev_render"] == {"paths": [DIRTY], "allowed": False}


def test_clean_deploy_clears_dev_render(tmp_path, fakes, capsys):
    home = dirty_home(tmp_path)
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    fakes.update(target=target, ha=Resources([]).ha())
    assert cli(home, "deploy", "staging", "--apply") == 0
    home.managed(DIRTY, "a: 3\n")  # a render from a tag replaces the dev render
    home.declare()
    assert cli(home, "deploy", "staging", "--apply") == 0
    assert "dev_render" not in record(home.target_dir)
    capsys.readouterr()
    assert cli(home, "deploy", "staging", "--plan") == 0
    assert "target runs a dev render" not in capsys.readouterr().out


def test_allow_dirty_with_plan_fails(tmp_path, fakes, capsys):
    home = dirty_home(tmp_path)
    fakes.update(target=FakeTarget(home.target_dir), ha=Resources([]).ha())
    assert cli(home, "deploy", "production", "--plan", "--allow-dirty") == 1
    assert "FAIL --allow-dirty goes with --apply" in capsys.readouterr().out


def test_staging_takes_dirty_without_flag(tmp_path, fakes, capsys):
    home = dirty_home(tmp_path)
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    fakes.update(target=target, ha=Resources([]).ha())
    assert cli(home, "deploy", "staging", "--apply") == 0
    assert (home.target_dir / DIRTY).read_text().endswith("a: 2\n")
    assert cli(home, "deploy", "staging", "--apply", "--allow-dirty") == 0


# --- remove, orphan, unmanaged -----------------------------------------------------------------


def test_plan_removes_file_dropped_from_record(tmp_path):
    """A component's old files, and a local package a component replaced, leave the target."""
    home = Home(tmp_path)
    home.managed("www/domosenso/ramka/0.1.1/cards/agenda-card.js", "new")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    on_target(target, "www/domosenso/ramka/0.1.0/cards/agenda-card.js", "old")
    on_target(target, "packages/presence.yaml", "sensor: []\n")
    target.put({deploy.RECORD: json.dumps({"deploy_id": "20261001T000000Z", "files": {
        "www/domosenso/ramka/0.1.0/cards/agenda-card.js": {"sha256": sha256(b"old"), "layer": "managed", "component": "ramka"},
        "packages/presence.yaml": {"sha256": sha256(b"sensor: []\n"), "layer": "local", "component": None},
    }}).encode()})

    plan = plan_for(home, target)
    assert plan.remove == ["packages/presence.yaml", "www/domosenso/ramka/0.1.0/cards/agenda-card.js"]
    assert plan.orphan == []
    assert plan.restart is True  # a package leaves

    deploy_id = run_apply(home, target, Resources([]).ha(), plan)
    files = target_files(home.target_dir)
    assert "packages/presence.yaml" not in files
    assert "www/domosenso/ramka/0.1.0/cards/agenda-card.js" not in files
    assert record(home.target_dir) == {"deploy_id": deploy_id, "files": {
        "www/domosenso/ramka/0.1.1/cards/agenda-card.js": {"sha256": sha256(b"new"), "layer": "managed", "component": "ramka"},
        inventory.PACKAGE: {"sha256": sha256(inventory.content(home.lock, {})), "layer": "managed", "component": None},
    }}


def test_unmanaged_on_target_never_touched(tmp_path):
    home = Home(tmp_path, local=("*.yaml", "packages/*.yaml"), unmanaged=("automations.yaml", "scripts.yaml"))
    home.write("automations.yaml", "[]\n")  # the repository's copy matches a local glob, but is unmanaged
    home.write("secrets.yaml", "token: repo\n")  # Home Assistant's: never written by any command
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    on_target(target, "automations.yaml", "- id: '1'\n")
    on_target(target, "scripts.yaml", "{}\n")
    on_target(target, "secrets.yaml", "token: real\n")
    before = target_files(home.target_dir)

    plan = plan_for(home, target)
    assert plan.add == ["packages/mine.yaml"]
    assert plan.change == [] and plan.orphan == [] and plan.remove == []
    assert {"automations.yaml", "scripts.yaml", "secrets.yaml"} <= set(plan.keep)

    run_apply(home, target, Resources([]).ha(), plan)
    after = target_files(home.target_dir)
    for rel in ("automations.yaml", "scripts.yaml", "secrets.yaml"):
        assert after[rel] == before[rel]
    assert set(record(home.target_dir)["files"]) == {"packages/mine.yaml"}


def test_lock_file_under_unmanaged_on_target_is_refused(tmp_path):
    home = Home(tmp_path, unmanaged=("packages/*.yaml",))
    home.managed("packages/ramka.yaml", "a: 1\n")
    with pytest.raises(DomosensoError, match="packages/ramka.yaml.*unmanaged_on_target"):
        plan_for(home, FakeTarget(home.target_dir))


def test_orphan_blocks_apply(tmp_path, fakes, capsys):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    on_target(target, "packages/old.yaml", "sensor: []\n")
    before = target_files(home.target_dir)

    assert plan_for(home, target).orphan == ["packages/old.yaml"]
    home.declare()
    fakes.update(target=target, ha=Resources([]).ha())
    assert cli(home, "deploy", "staging", "--apply") == 1
    out = capsys.readouterr().out.splitlines()
    assert "orphan packages/old.yaml" in out
    assert out[-1] == "FAIL orphan packages/old.yaml"
    assert target_files(home.target_dir) == before  # nothing written, not even a backup
    assert not (home.target_dir / ".domosenso").exists()
    assert target.execs == [] and target.restarts == 0


def test_remove_orphans_flag(tmp_path):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    on_target(target, "packages/old.yaml", "sensor: []\n")
    on_target(target, "packages/other.yaml", "x: 1\n")
    plan = plan_for(home, target)

    with pytest.raises(DomosensoError, match="not an orphan: packages/mine.yaml"):
        run_apply(home, target, Resources([]).ha(), plan, ["packages/old.yaml", "packages/other.yaml", "packages/mine.yaml"])
    with pytest.raises(DomosensoError, match="^orphan packages/other.yaml$"):
        run_apply(home, target, Resources([]).ha(), plan, ["packages/old.yaml"])

    deploy_id = run_apply(home, target, Resources([]).ha(), plan, ["packages/old.yaml", "packages/other.yaml"])
    assert set(target_files(home.target_dir)) == {"packages/mine.yaml", deploy.RECORD}
    backup = tarfile.open(fileobj=io.BytesIO((home.target_dir / f".domosenso/predeploy-{deploy_id}/files.tar").read_bytes()))
    assert sorted(backup.getnames()) == ["packages/old.yaml", "packages/other.yaml"]


# --- apply ------------------------------------------------------------------------------------


def test_apply_writes_backup_record_and_restarts(tmp_path):
    home = Home(tmp_path)
    home.managed("packages/ramka.yaml", "a: 2\n")
    home.lock.components["ramka"].resources = [CARD]
    target = FakeTarget(home.target_dir, check_output=f"INFO: starting\n{CLEAN}\n")
    on_target(target, "packages/ramka.yaml", "a: 1\n")
    store = Resources([{"id": "r1", "url": "/local/agenda-card.js?v=6", "type": "module"}])
    ha = store.ha()

    plan = plan_for(home, target, store.items)
    deploy_id = run_apply(home, target, ha, plan)

    assert (home.target_dir / "packages/ramka.yaml").read_text() == "a: 2\n"
    assert record(home.target_dir)["deploy_id"] == deploy_id
    remote = home.target_dir / f".domosenso/predeploy-{deploy_id}"
    local = home.root / ".domosenso" / "deploys" / "staging" / deploy_id
    for directory in (remote, local):
        assert sorted(p.name for p in directory.iterdir()) == sorted(deploy.BACKUP_FILES)
        assert json.loads((directory / "added.json").read_text()) == [deploy.RECORD, inventory.PACKAGE]
        assert json.loads((directory / "resources.json").read_text()) == [
            {"id": "r1", "url": "/local/agenda-card.js?v=6", "type": "module"}]
        files = tarfile.open(fileobj=io.BytesIO((directory / "files.tar").read_bytes()))
        assert files.extractfile("packages/ramka.yaml").read() == b"a: 1\n"
    assert target.execs == [deploy.CHECK_CONFIG]
    assert target.exec_timeouts == [deploy.CHECK_CONFIG_TIMEOUT_S]
    assert store.urls() == {"r1": CARD}
    assert target.restarts == 1
    assert ("http_status", {"path": "/api/"}) in ha.calls


def test_check_config_errors_restore(tmp_path, fakes, capsys):
    home = Home(tmp_path)
    home.managed("packages/ramka.yaml", "a: 2\n")
    home.write("packages/mine.yaml", "b: 1\n")
    home.lock.components["ramka"].resources = [CARD]
    target = FakeTarget(home.target_dir, check_output=f"{BLUEPRINT_LINE}\n{CLEAN}\n")
    on_target(target, "packages/ramka.yaml", "a: 1\n")
    before = target_files(home.target_dir)
    store = Resources([])

    home.declare()
    fakes.update(target=target, ha=store.ha())
    assert cli(home, "deploy", "staging", "--apply") == 1
    out = capsys.readouterr().out.splitlines()
    assert out[-1] == "FAIL check_config: 1 errors"
    assert f"error [log] {BLUEPRINT_LINE}" in out
    assert target_files(home.target_dir) == before  # the change undone, the added file and the record gone
    assert target.restarts == 0
    assert store.items == []  # resources come after check_config


def test_check_config_exit_code_alone_fails(tmp_path):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    target.exec = lambda argv, timeout_s=0: (1, CLEAN)
    with pytest.raises(DomosensoError, match=r"check_config: 0 errors \(exit 1\)"):
        run_apply(home, target, Resources([]).ha(), plan_for(home, target))
    assert target_files(home.target_dir) == {}


def test_copy_failure_restores_backup(tmp_path):
    """The copy is cut off after the backup and one file: the target is put back as it was."""
    home = Home(tmp_path)
    home.managed("packages/a.yaml", "a: 2\n")
    home.managed("packages/b.yaml", "b: 2\n")
    home.write("packages/new.yaml", "n: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    on_target(target, "packages/a.yaml", "a: 1\n")
    on_target(target, "packages/b.yaml", "b: 1\n")
    target.put({deploy.RECORD: json.dumps({"deploy_id": "20261001T000000Z", "files": {}}).encode()})
    target.fail_put_after = target.files_put + len(deploy.BACKUP_FILES) + 1  # the backup, then one file
    before = target_files(home.target_dir)

    with pytest.raises(DomosensoError, match="copy failed.*interrupted.*restored"):
        run_apply(home, target, Resources([]).ha(), plan_for(home, target))
    assert target_files(home.target_dir) == before
    assert target.execs == [] and target.restarts == 0


def test_restore_failure_says_where_the_backup_is(tmp_path):
    home = Home(tmp_path)
    home.write("packages/new.yaml", "n: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    target.exec = lambda argv, timeout_s=0: (_ for _ in ()).throw(DomosensoError("exec timed out"))
    target.delete = lambda paths: (_ for _ in ()).throw(DomosensoError("ssh died"))
    with pytest.raises(DomosensoError,
                       match=r"restore failed.*ssh died.*domosenso rollback staging \d{8}T\d{6}Z.*predeploy-"):
        run_apply(home, target, Resources([]).ha(), plan_for(home, target))


def test_dashboard_yaml_parse_error_stops_before_copy(tmp_path):
    home = Home(tmp_path)
    home.write("dashboards/home.yaml", "views: [\n")
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    with pytest.raises(DomosensoError, match="dashboards/home.yaml"):
        run_apply(home, target, Resources([]).ha(), plan_for(home, target))
    assert target_files(home.target_dir) == {}
    assert not (home.target_dir / ".domosenso").exists()
    assert not (home.root / ".domosenso").exists()


def test_dashboard_with_home_assistant_tags_parses(tmp_path):
    home = Home(tmp_path)
    home.write("dashboards/home.yaml", "views: !include views.yaml\ntitle: !secret t\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    run_apply(home, target, Resources([]).ha(), plan_for(home, target))
    assert (home.target_dir / "dashboards/home.yaml").is_file()


def test_resources_failure_restores_files_and_resources(tmp_path):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    home.lock.components["ramka"] = LockEntry("0.1.1", "ramka/0.1.1", COMMIT, resources=[CARD, "/local/x/two.js"])
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    store = Resources([])
    ha = store.ha()
    created = ha.responses["lovelace/resources/create"]

    def create_once(fields):  # the second create fails
        if store.items:
            raise DomosensoError("lovelace/resources/create: unknown_error")
        return created(fields)

    ha.responses["lovelace/resources/create"] = create_once
    with pytest.raises(DomosensoError, match="resources.*unknown_error.*restored"):
        run_apply(home, target, ha, plan_for(home, target))
    assert target_files(home.target_dir) == {}
    assert store.items == []
    assert target.restarts == 0


def test_api_that_never_answers_fails_after_the_wait(tmp_path, monkeypatch):
    monkeypatch.setattr(deploy, "API_WAIT_S", 0.05)
    monkeypatch.setattr(deploy, "API_POLL_S", 0.01)
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    ha = Resources([]).ha(http_statuses={"/api/": 502})
    with pytest.raises(DomosensoError, match=r"did not answer /api/.*HTTP 502.*rollback staging \d{8}T\d{6}Z"):
        run_apply(home, target, ha, plan_for(home, target))
    assert record(home.target_dir) is not None  # the files are deployed: the record says so, rollback can work


def test_production_needs_confirmation(tmp_path, fakes, capsys, monkeypatch):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    home.declare()
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    fakes.update(target=target, ha=Resources([]).ha())

    assert cli(home, "deploy", "production", "--apply") == 1  # pytest's stdin is not a terminal
    assert capsys.readouterr().out.splitlines()[-1].startswith("FAIL deploy production needs --confirm")
    assert cli(home, "deploy", "production", "--apply", "--confirm", "000000000000") == 1
    assert "FAIL the plan changed" in capsys.readouterr().out
    assert target_files(home.target_dir) == {}

    class Terminal(io.StringIO):
        def isatty(self):
            return True

    monkeypatch.setattr("sys.stdin", Terminal("yes\n"))
    assert cli(home, "deploy", "production", "--apply") == 1
    assert target_files(home.target_dir) == {}

    monkeypatch.setattr("sys.stdin", Terminal("production\n"))
    assert cli(home, "deploy", "production", "--apply") == 0
    assert (home.target_dir / "packages/mine.yaml").is_file()


def test_production_confirm_with_the_plan_hash(tmp_path, fakes, capsys):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    home.declare()
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    fakes.update(target=target, ha=Resources([]).ha())
    assert cli(home, "deploy", "production", "--plan") == 0
    digest = capsys.readouterr().out.splitlines()[-2].removeprefix("hash ")
    assert cli(home, "deploy", "production", "--apply", "--confirm", digest) == 0
    assert capsys.readouterr().out.splitlines()[-2].startswith("deployed ")


# --- rollback ---------------------------------------------------------------------------------


def test_rollback_round_trip(tmp_path, fakes, capsys):
    home = Home(tmp_path)
    home.managed("packages/ramka.yaml", "a: 2\n")
    home.managed("www/domosenso/ramka/0.1.1/cards/agenda-card.js", "card")
    home.write("packages/mine.yaml", "b: 1\n")
    home.lock.components["ramka"].resources = [CARD, "/local/domosenso/ramka/0.1.1/cards/clock-card.js"]
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    on_target(target, "packages/ramka.yaml", "a: 1\n")
    on_target(target, "packages/old.yaml", "sensor: []\n")
    on_target(target, "automations.yaml", "[]\n")
    store = Resources([
        {"id": "r1", "url": "/local/agenda-card.js?v=6", "type": "module"},
        {"id": "r2", "url": "/local/unwanted.js", "type": "module"},
    ])
    start_files, start_urls = target_files(home.target_dir), store.urls()

    home.declare(targets=("staging",))
    fakes.update(target=target, ha=store.ha())
    assert cli(home, "deploy", "staging", "--apply", "--remove-orphans", "packages/old.yaml", "--prune-resources") == 0
    assert target_files(home.target_dir) != start_files
    assert store.urls() != start_urls
    capsys.readouterr()

    assert cli(home, "rollback", "staging") == 0
    assert target_files(home.target_dir) == start_files
    assert sorted(store.urls().values()) == sorted(start_urls.values())
    assert store.urls()["r1"] == start_urls["r1"]  # updated back in place, under its id
    assert target.restarts == 2


def test_rollback_restores_the_previous_record(tmp_path):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    store = Resources([])
    first = run_apply(home, target, store.ha(), plan_for(home, target))
    first_record = (home.target_dir / deploy.RECORD).read_bytes()
    home.write("packages/mine.yaml", "b: 2\n")
    second = run_apply(home, target, store.ha(), plan_for(home, target))
    assert second != first

    assert run_rollback(home, target, store.ha()) == second
    assert (home.target_dir / deploy.RECORD).read_bytes() == first_record
    assert (home.target_dir / "packages/mine.yaml").read_text() == "b: 1\n"


def test_rollback_refuses_a_deploy_that_is_not_the_last(tmp_path):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    store = Resources([])
    first = run_apply(home, target, store.ha(), plan_for(home, target))
    home.write("packages/mine.yaml", "b: 2\n")
    second = run_apply(home, target, store.ha(), plan_for(home, target))
    with pytest.raises(DomosensoError, match=f"{first} is not the last deploy on staging.*{second}"):
        run_rollback(home, target, store.ha(), first)
    run_rollback(home, target, store.ha(), second)
    run_rollback(home, target, store.ha(), first)
    assert target_files(home.target_dir) == {}


def test_rollback_reads_the_target_backup_when_the_local_copy_is_gone(tmp_path):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    store = Resources([])
    deploy_id = run_apply(home, target, store.ha(), plan_for(home, target))
    for path in (home.root / ".domosenso" / "deploys" / "staging" / deploy_id).iterdir():
        path.unlink()
    (home.root / ".domosenso" / "deploys" / "staging" / deploy_id).rmdir()
    run_rollback(home, target, store.ha())
    assert target_files(home.target_dir) == {}


def test_rollback_rejects_a_malformed_deploy_id(tmp_path):
    home = Home(tmp_path)
    with pytest.raises(DomosensoError, match="deploy id"):
        run_rollback(home, FakeTarget(home.target_dir), Resources([]).ha(), "../../etc")


def test_rollback_without_a_record_fails(tmp_path):
    home = Home(tmp_path)
    with pytest.raises(DomosensoError, match="no deploy recorded"):
        run_rollback(home, FakeTarget(home.target_dir), Resources([]).ha())


def test_a_second_deploy_in_the_same_second_waits_for_a_new_id(tmp_path, monkeypatch):
    ids = iter(["20261021T120000Z", "20261021T120000Z", "20261021T120001Z"])
    monkeypatch.setattr(deploy, "_new_id", lambda: next(ids))
    monkeypatch.setattr(deploy, "ID_WAIT_S", 0)
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    assert run_apply(home, target, Resources([]).ha(), plan_for(home, target)) == "20261021T120000Z"
    home.write("packages/mine.yaml", "b: 2\n")
    assert run_apply(home, target, Resources([]).ha(), plan_for(home, target)) == "20261021T120001Z"


def test_production_in_json_mode_needs_confirm_even_on_a_terminal(tmp_path, fakes, capsys, monkeypatch):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    home.declare()
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    fakes.update(target=target, ha=Resources([]).ha())

    class Terminal(io.StringIO):
        def isatty(self):
            return True

    monkeypatch.setattr("sys.stdin", Terminal("production\n"))
    assert cli(home, "deploy", "production", "--apply", "--json") == 1
    document = json.loads(capsys.readouterr().out)
    assert document["result"] == "FAIL" and "--confirm" in document["reason"]
    assert document["data"][0]["plan"]["add"] == ["packages/mine.yaml"]
    assert target_files(home.target_dir) == {}


def test_a_file_that_appears_after_the_plan_is_backed_up(tmp_path):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=f"{BLUEPRINT_LINE}\n{CLEAN}")
    plan = plan_for(home, target)
    assert plan.add == ["packages/mine.yaml"]
    on_target(target, "packages/mine.yaml", "someone else's\n")
    with pytest.raises(DomosensoError, match="check_config"):
        run_apply(home, target, Resources([]).ha(), plan)
    assert (home.target_dir / "packages/mine.yaml").read_text() == "someone else's\n"


def test_resources_that_cannot_be_restored_still_restore_files(tmp_path):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    home.lock.components["ramka"] = LockEntry("0.1.1", "ramka/0.1.1", COMMIT, resources=[CARD])
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    ha = Resources([]).ha()
    ha.responses.pop("lovelace/resources/create")  # create fails; the restore's list call works, then
    listing = ha.responses["lovelace/resources"]
    calls = iter(range(10))
    ha.responses["lovelace/resources"] = lambda f: listing(f) if next(calls) == 0 else (_ for _ in ()).throw(
        DomosensoError("connection lost"))
    with pytest.raises(DomosensoError, match=r"resources failed.*files are restored; resources are not.*rollback staging"):
        run_apply(home, target, ha, plan_for(home, target))
    assert target_files(home.target_dir) == {}


def test_rollback_refuses_a_record_with_a_malformed_deploy_id(tmp_path):
    home = Home(tmp_path)
    target = FakeTarget(home.target_dir)
    target.put({deploy.RECORD: json.dumps({"deploy_id": "../../x", "files": {}}).encode()})
    with pytest.raises(DomosensoError, match="not a deploy id"):
        run_rollback(home, target, Resources([]).ha())


def test_configuration_yaml_is_carried(tmp_path):
    """The home's own configuration.yaml: copied like any declared file, never generated or edited."""
    home = Home(tmp_path, local=("packages/*.yaml",), unmanaged=())  # no glob names it
    home.write("configuration.yaml", "homeassistant: {packages: !include_dir_named packages}\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    on_target(target, "configuration.yaml", "homeassistant: {}\n")
    plan = plan_for(home, target)
    assert plan.change == ["configuration.yaml"] and plan.restart is True
    assert ["change", "configuration.yaml"] in deploy.plan_lines(plan)
    run_apply(home, target, Resources([]).ha(), plan)
    assert (home.target_dir / "configuration.yaml").read_text() == "homeassistant: {packages: !include_dir_named packages}\n"
    assert record(home.target_dir)["files"]["configuration.yaml"] == {
        "sha256": sha256(b"homeassistant: {packages: !include_dir_named packages}\n"), "layer": "instance",
        "component": None}
    again = plan_for(home, target)
    assert again.change == [] and again.add == [] and "configuration.yaml" in again.keep


def test_cut_off_copy_whose_restore_fails_rolls_back_by_id(tmp_path, monkeypatch):
    """ssh drops mid-copy and the restore fails too: the half-copied deploy never wrote its record,
    yet `rollback <its id>` (and the default rollback) must put the target back as it was before it."""
    home = Home(tmp_path)
    home.managed("packages/ramka.yaml", "a: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    store = Resources([{"id": "r1", "url": "/local/x.js", "type": "module"}])
    first = run_apply(home, target, store.ha(), plan_for(home, target))
    start_files, start_record, start_urls = target_files(home.target_dir), record(home.target_dir), store.urls()

    home.managed("packages/ramka.yaml", "a: 2\n")
    home.write("packages/new.yaml", "n: 1\n")
    home.write("packages/zz.yaml", "z: 1\n")  # written after new.yaml; the record comes last of all
    target.fail_put_after = target.files_put + len(deploy.BACKUP_FILES) + 1
    real_delete, broken = target.delete, {"left": 1}

    def delete(paths):  # the link is still down when the restore deletes the added files
        if broken["left"]:
            broken["left"] -= 1
            raise DomosensoError("ssh died")
        real_delete(paths)

    monkeypatch.setattr(target, "delete", delete)
    with pytest.raises(DomosensoError, match=r"restore failed.*domosenso rollback staging (\d{8}T\d{6}Z)") as failed:
        run_apply(home, target, store.ha(), plan_for(home, target))
    second = re.search(r"rollback staging (\d{8}T\d{6}Z)", str(failed.value))[1]
    assert record(home.target_dir) == start_record  # the record never got there
    assert target_files(home.target_dir) != start_files  # half copied

    assert run_rollback(home, target, store.ha()) == second  # the default finds the deploy that never completed
    assert target_files(home.target_dir) == start_files
    assert record(home.target_dir) == start_record and record(home.target_dir)["deploy_id"] == first
    assert store.urls() == start_urls

    with pytest.raises(DomosensoError, match="already rolled back"):
        run_rollback(home, target, store.ha(), second)
    assert run_rollback(home, target, store.ha()) == first  # the default is the record's deploy again


def test_cut_off_copy_whose_restore_fails_rolls_back_by_explicit_id(tmp_path, monkeypatch):
    home = Home(tmp_path)
    home.write("packages/a.yaml", "a: 1\n")
    home.write("packages/b.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    target.fail_put_after = len(deploy.BACKUP_FILES) + 1
    monkeypatch.setattr(target, "delete", lambda paths: (_ for _ in ()).throw(DomosensoError("ssh died")))
    with pytest.raises(DomosensoError, match="restore failed") as failed:
        run_apply(home, target, Resources([]).ha(), plan_for(home, target))
    deploy_id = re.search(r"rollback staging (\d{8}T\d{6}Z)", str(failed.value))[1]
    monkeypatch.undo()
    assert run_rollback(home, target, Resources([]).ha(), deploy_id) == deploy_id
    assert target_files(home.target_dir) == {}  # a first deploy: nothing was there, no record either


def test_restored_deploy_is_not_the_default_rollback(tmp_path):
    """A failed deploy that restored itself is done with: the default rollback is the record's deploy."""
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    first = run_apply(home, target, Resources([]).ha(), plan_for(home, target))
    home.write("packages/mine.yaml", "b: 2\n")
    target.check_output = f"{BLUEPRINT_LINE}\n{CLEAN}"
    with pytest.raises(DomosensoError, match="check_config"):
        run_apply(home, target, Resources([]).ha(), plan_for(home, target))
    assert run_rollback(home, target, Resources([]).ha()) == first


def test_prune_is_part_of_the_plan(tmp_path, fakes, capsys):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    existing = [{"id": "z", "url": "/local/unwanted.js", "type": "module"}]
    kept = deploy.make_plan(home.config_obj(), home.lock, target, existing)
    pruned = deploy.make_plan(home.config_obj(), home.lock, target, existing, prune=True)
    assert ["resource", "unwanted", "/local/unwanted.js"] in deploy.plan_lines(kept)
    assert ["resource", "delete", "/local/unwanted.js"] in deploy.plan_lines(pruned)
    assert kept.hash != pruned.hash
    with pytest.raises(DomosensoError, match="prune"):
        run_apply(home, target, Resources(existing).ha(), kept, prune=True)

    home.declare()
    store = Resources(existing)
    fakes.update(target=target, ha=store.ha())
    assert cli(home, "deploy", "production", "--plan") == 0
    digest = capsys.readouterr().out.splitlines()[-2].removeprefix("hash ")
    assert cli(home, "deploy", "production", "--apply", "--prune-resources", "--confirm", digest) == 1
    assert "FAIL the plan changed" in capsys.readouterr().out
    assert store.urls() == {"z": "/local/unwanted.js"} and target_files(home.target_dir) == {}


def test_noop_deploy_writes_nothing(tmp_path, fakes, capsys):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    home.declare(targets=("staging",))
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    fakes.update(target=target, ha=Resources([]).ha())
    assert cli(home, "deploy", "staging", "--apply") == 0
    capsys.readouterr()
    files, execs, puts = target_files(home.target_dir), list(target.execs), target.files_put
    backups = sorted((home.target_dir / ".domosenso").iterdir())

    assert cli(home, "deploy", "staging", "--apply") == 0
    out = capsys.readouterr().out.splitlines()
    assert out[-2:] == ["nothing to deploy", "ok"]
    assert target_files(home.target_dir) == files and target.files_put == puts
    assert target.execs == execs and target.restarts == 1
    assert sorted((home.target_dir / ".domosenso").iterdir()) == backups


def test_equal_files_without_a_record_still_write_the_record(tmp_path):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    on_target(target, "packages/mine.yaml", "b: 1\n")
    plan = plan_for(home, target)
    assert plan.add == [] and plan.change == []
    deploy_id = run_apply(home, target, Resources([]).ha(), plan)
    assert record(home.target_dir)["deploy_id"] == deploy_id
    assert target.restarts == 0  # only the record changed


def test_target_configuration_yaml_is_never_an_orphan(tmp_path):
    """A broad glob and no repository copy: the target's configuration.yaml is kept, not offered for deletion."""
    home = Home(tmp_path, local=("*.yaml",), unmanaged=())
    home.write("other.yaml", "x: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    on_target(target, "configuration.yaml", "homeassistant: {}\n")
    plan = plan_for(home, target)
    assert plan.orphan == [] and "configuration.yaml" in plan.keep
    with pytest.raises(DomosensoError, match="not an orphan: configuration.yaml"):
        run_apply(home, target, Resources([]).ha(), plan, ["configuration.yaml"])
    run_apply(home, target, Resources([]).ha(), plan)
    assert (home.target_dir / "configuration.yaml").read_text() == "homeassistant: {}\n"


def test_configuration_yaml_dropped_from_the_repository_is_not_removed(tmp_path):
    home = Home(tmp_path)
    home.write("configuration.yaml", "homeassistant: {}\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    run_apply(home, target, Resources([]).ha(), plan_for(home, target))
    assert "configuration.yaml" in record(home.target_dir)["files"]
    (home.config / "configuration.yaml").unlink()
    plan = plan_for(home, target)
    assert plan.remove == [] and plan.orphan == [] and "configuration.yaml" in plan.keep


def test_target_record_corrupted_after_the_plan_stops_before_the_backup(tmp_path):
    home = Home(tmp_path)
    home.write("packages/mine.yaml", "b: 1\n")
    target = FakeTarget(home.target_dir, check_output=CLEAN)
    plan = plan_for(home, target)
    target.put({deploy.RECORD: b"{not json"})
    with pytest.raises(DomosensoError, match="target record changed or unreadable: re-run --plan"):
        run_apply(home, target, Resources([]).ha(), plan)
    assert not (home.root / ".domosenso").exists()
    assert set(target_files(home.target_dir)) == {deploy.RECORD}


def test_stale_inventory_blocks_the_plan(tmp_path):
    """packages/domosenso.yaml is derived from the lock: a copy that differs is out of date (SPEC-022)."""
    home = Home(tmp_path)
    home.managed("packages/ramka.yaml", "a: 1\n")
    home.sync_inventory()
    home.lock.components["ramka"].version = "0.1.2"  # the lock moved, the file did not
    with pytest.raises(DomosensoError, match=r"inventory out of date: packages/domosenso\.yaml: run domosenso render"):
        deploy.make_plan(home.config_obj(), home.lock, FakeTarget(home.target_dir), [])


def test_inventory_with_a_dev_item_is_a_dev_render(tmp_path):
    home = Home(tmp_path)
    home.managed("packages/ramka.yaml", "a: 1\n")
    (home.root / ".domosenso").mkdir()
    (home.root / ".domosenso" / "dev-render.json").write_text(json.dumps(
        {"ramka": {"version": "0.2.0", "commit": "abc-dirty", "released": "2026-10-30", "files": {}, "resources": []}}))
    home.sync_inventory()
    record, _, dirty = deploy._carried(home.config_obj(), home.lock, deploy.dev_render.load(home.root))
    assert inventory.PACKAGE in record and inventory.PACKAGE in dirty
