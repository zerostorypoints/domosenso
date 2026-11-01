"""`domosenso floorplan pull | push` against `FakeHA` (SPEC-027)."""
import io
import json
import re

import pytest
import yaml

from domosenso_cli import cmd_deploy, floorplan, floorplan_doc as fd
from domosenso_cli.errors import DomosensoError
from domosenso_cli.main import main
from fakes import FakeHA

SQUARE = [[0, 0], [4, 0], [4, 3], [0, 3]]
PLAN = {"schema": 1, "floors": [{
    "floor_id": "ground",
    "rooms": [{"area_id": "living_room", "polygon": SQUARE}, {"area_id": "kitchen", "polygon": SQUARE}],
    "points": [{"device_id": "d1", "x": 1, "y": 1, "placed": True},
               {"device_id": "d2", "x": 2, "y": 1, "placed": True},
               {"entity_id": "plant.monstera", "x": 3, "y": 2, "placed": False}],
}]}
SOURCE = {"image": "domosenso/floorplan/ground.jpg", "metres_per_px": 0.01}
AREAS = [{"area_id": "living_room"}, {"area_id": "kitchen"}]


class Dashboards:
    """Home Assistant's dashboards and the config of `floorplan`, for FakeHA."""

    def __init__(self, plan=None, exists=True, areas=AREAS):
        self.exists = exists
        self.config = fd.dashboard_config(plan) if plan else None
        self.areas = areas
        self.ha = FakeHA({
            "lovelace/dashboards/list": lambda f: [{"url_path": "floorplan"}] if self.exists else [{"url_path": "other"}],
            "lovelace/config": self._read,
            "lovelace/dashboards/create": self._create,
            "lovelace/config/save": self._save,
            "config/area_registry/list": lambda f: self.areas,
        })

    def _read(self, f):
        assert f == {"url_path": "floorplan"}
        if self.config is None:
            raise DomosensoError("lovelace/config: config_not_found Config not found.")
        return self.config

    def _create(self, f):
        # HA 2026.9.2 (lovelace/dashboard.py): a single-word url_path needs allow_single_word.
        if "-" not in f["url_path"] and not f.get("allow_single_word"):
            raise DomosensoError("lovelace/dashboards/create: invalid_format Url path needs to contain a hyphen (-)")
        self.exists = True

    def _save(self, f):
        assert self.exists
        self.config = f["config"]

    @property
    def writes(self):
        return [k for k, _ in self.ha.calls if k in ("lovelace/dashboards/create", "lovelace/config/save")]


@pytest.fixture
def home(tmp_path, monkeypatch):
    token = tmp_path / "token"
    token.write_text("t")
    declaration = {
        "catalog": "c", "config_dir": "home-assistant", "esphome_dir": "esphome",
        "targets": {name: {"kind": "local-docker", "container": name, "config": "../target", "url": "http://x",
                           "token_file": str(token)} for name in ("staging", "production")},
        "components": {},
    }
    (tmp_path / "domosenso.yaml").write_text(yaml.safe_dump(declaration))
    box = {}
    monkeypatch.setattr(cmd_deploy, "connect", lambda t: box["ha"])
    return tmp_path, box


def cli(root, *argv):
    return main(["--home", str(root), "floorplan", *argv])


def out(capsys):
    return capsys.readouterr().out.splitlines()


def write_plan(root, plan):
    (root / "domosenso").mkdir(exist_ok=True)
    (root / "domosenso" / "floorplan.json").write_text(json.dumps(plan))


def record(root, target, plan):
    path = root / ".domosenso" / "floorplan" / f"{target}.pulled.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(plan))


def moved(plan):
    new = json.loads(json.dumps(plan))
    new["floors"][0]["points"][0]["x"] = 1.5
    new["floors"][0]["rooms"].pop(1)
    new["floors"][0]["points"].append({"entity_id": "plant.fern", "x": 1, "y": 2, "placed": False})
    return new


def test_pull_writes_file_and_keeps_source(home, capsys):
    root, box = home
    box["ha"] = Dashboards(PLAN).ha
    write_plan(root, {**PLAN, "source": SOURCE, "floors": []})
    assert cli(root, "pull", "staging") == 0
    assert out(capsys) == ["read floor ground rooms 2 points 3", "wrote domosenso/floorplan.json", "ok"]
    written = json.loads((root / "domosenso/floorplan.json").read_text())
    assert written == {**PLAN, "source": SOURCE}
    assert json.loads((root / ".domosenso/floorplan/staging.pulled.json").read_text()) == PLAN


def test_pull_no_dashboard(home, capsys):
    root, box = home
    box["ha"] = Dashboards(exists=False).ha
    assert cli(root, "pull", "staging") == 1
    assert out(capsys) == ["FAIL no floorplan dashboard on staging"]


def test_pull_empty_dashboard(home, capsys):
    root, box = home
    box["ha"] = Dashboards(None).ha
    assert cli(root, "pull", "staging") == 1
    assert out(capsys) == ["FAIL no plan on staging"]


def test_pull_refuses_push_flags(home, capsys):
    root, box = home
    box["ha"] = Dashboards(PLAN).ha
    assert cli(root, "pull", "staging", "--apply") == 1
    assert out(capsys) == ["FAIL --plan, --apply and --confirm go with push"]
    assert cli(root, "push", "staging") == 1
    assert out(capsys) == ["FAIL push needs --plan or --apply"]


def test_push_plan_lines(home, capsys):
    root, box = home
    dash = Dashboards(PLAN)
    box["ha"] = dash.ha
    record(root, "staging", PLAN)
    write_plan(root, {**moved(PLAN), "source": SOURCE})
    assert cli(root, "push", "staging", "--plan") == 0
    lines = out(capsys)
    digest = floorplan._digest(PLAN, moved(PLAN))
    assert lines == ["room remove ground kitchen", "point move ground d1", "point add ground plant.fern",
                     f"hash {digest}", "ok"]
    assert dash.writes == [] and dash.config == fd.dashboard_config(PLAN)


def test_push_creates_dashboard(home, capsys):
    root, box = home
    dash = Dashboards(exists=False)
    box["ha"] = dash.ha
    write_plan(root, PLAN)
    assert cli(root, "push", "staging", "--apply") == 0
    lines = out(capsys)
    assert lines[0] == "dashboard create floorplan" and lines[-2:] == ["pushed", "ok"]
    assert not any(line.startswith("backup") for line in lines)
    created = next(f for k, f in dash.ha.calls if k == "lovelace/dashboards/create")
    assert created["url_path"] == "floorplan" and created["require_admin"] is False
    assert created["show_in_sidebar"] is True and created["allow_single_word"] is True
    assert dash.writes == ["lovelace/dashboards/create", "lovelace/config/save"]
    assert fd.extract(dash.config) == PLAN


def test_push_to_a_dashboard_never_saved(home, capsys):
    root, box = home
    dash = Dashboards(None)
    box["ha"] = dash.ha
    write_plan(root, PLAN)
    assert cli(root, "push", "staging", "--apply") == 0
    assert "lovelace/dashboards/create" not in dash.writes and fd.extract(dash.config) == PLAN


def test_push_area_missing(home, capsys):
    root, box = home
    dash = Dashboards(exists=False, areas=[{"area_id": "living_room"}])
    box["ha"] = dash.ha
    plan = json.loads(json.dumps(PLAN))
    plan["floors"][0]["rooms"][1]["area_id"] = "office"
    write_plan(root, plan)
    assert cli(root, "push", "staging", "--apply") == 1
    lines = out(capsys)
    assert "area missing office" in lines and lines[-1] == "FAIL area missing: office"
    assert dash.writes == []


def test_push_changed_on_target(home, capsys):
    root, box = home
    dash = Dashboards(moved(PLAN))
    box["ha"] = dash.ha
    record(root, "staging", PLAN)
    write_plan(root, PLAN)
    assert cli(root, "push", "staging", "--apply") == 1
    assert out(capsys) == ["FAIL changed on target since pull: 1 rooms, 2 points"]
    assert dash.writes == []


def test_push_apply_backup_and_record(home, capsys):
    root, box = home
    dash = Dashboards(PLAN)
    box["ha"] = dash.ha
    old_config = json.loads(json.dumps(dash.config))
    record(root, "staging", PLAN)
    write_plan(root, {**moved(PLAN), "source": SOURCE})
    assert cli(root, "push", "staging", "--apply") == 0
    lines = out(capsys)
    backup = next(line for line in lines if line.startswith("backup "))
    assert re.fullmatch(r"backup \.domosenso/floorplan/staging-\d{8}T\d{6}Z\.json", backup)
    assert json.loads((root / backup.removeprefix("backup ")).read_text()) == old_config
    assert lines[-2:] == ["pushed", "ok"]
    assert fd.extract(dash.config) == moved(PLAN)  # without the file's source
    assert json.loads((root / ".domosenso/floorplan/staging.pulled.json").read_text()) == moved(PLAN)
    assert cli(root, "push", "staging", "--plan") == 0  # the record follows the push, so no "changed on target"


def test_push_nothing(home, capsys):
    root, box = home
    dash = Dashboards(PLAN)
    box["ha"] = dash.ha
    record(root, "staging", PLAN)
    write_plan(root, {**PLAN, "source": SOURCE})
    assert cli(root, "push", "staging", "--apply") == 0
    assert out(capsys) == ["nothing to push", "ok"]
    assert dash.writes == []


def test_push_production_needs_confirm(home, capsys, monkeypatch):
    root, box = home
    dash = Dashboards(PLAN)
    box["ha"] = dash.ha
    record(root, "production", PLAN)
    write_plan(root, moved(PLAN))
    digest = floorplan._digest(PLAN, moved(PLAN))
    assert cli(root, "push", "production", "--apply") == 1  # pytest's stdin is not a terminal
    assert out(capsys)[-1] == f"FAIL floorplan production needs --confirm {digest} when it does not run on a terminal"
    assert cli(root, "push", "production", "--apply", "--confirm", "000000000000") == 1
    assert out(capsys)[-1] == f"FAIL the plan changed: its hash is now {digest}, not 000000000000"
    assert dash.writes == []

    class Terminal(io.StringIO):
        def isatty(self):
            return True

    monkeypatch.setattr("sys.stdin", Terminal("production\n"))
    assert cli(root, "push", "production", "--apply") == 0
    assert dash.writes == ["lovelace/config/save"]


def test_a_failed_read_is_not_no_plan(home, capsys):
    root, box = home
    dash = Dashboards(PLAN)
    dash.ha.responses["lovelace/config"] = lambda f: (_ for _ in ()).throw(DomosensoError("lovelace/config: timed out after 30 s"))
    box["ha"] = dash.ha
    write_plan(root, moved(PLAN))
    assert cli(root, "push", "staging", "--apply") == 1
    assert out(capsys) == ["FAIL lovelace/config: timed out after 30 s"]
    assert dash.writes == []
    assert cli(root, "pull", "staging") == 1
    assert out(capsys) == ["FAIL lovelace/config: timed out after 30 s"]
