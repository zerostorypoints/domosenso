"""`domosenso probe`: the page a tablet opens to report its screen (SPEC-011 section 7.3)."""
import json

import pytest
import yaml

from domosenso_cli import main as cli
from domosenso_cli import probe

REPORT = {"viewport": [1100, 720], "dpr": 2, "screen": [1100, 720], "orientation": "landscape",
          "chromium": 141, "webview": True, "dvh": True, "json_modules": True, "admin": False}


def entry(name, message):
    return {"event_type": "logbook_entry", "data": {"name": name, "message": message}}


class Lovelace:
    """Stateful dashboards and resources, as Home Assistant keeps them."""

    def __init__(self, dashboards=(), resources=()):
        self.dashboards = list(dashboards)
        self.resources = list(resources)
        self.configs = {}

    def responses(self):
        def create_dashboard(f):
            self.dashboards.append({"id": f["url_path"].replace("-", "_"), "mode": "storage", **f})

        def delete_dashboard(f):
            self.dashboards = [d for d in self.dashboards if d["id"] != f["dashboard_id"]]

        def create_resource(f):
            self.resources.append({"id": f"r{len(self.resources) + 1}", "url": f["url"], "type": f["res_type"]})

        def update_resource(f):
            for r in self.resources:
                if r["id"] == f["resource_id"]:
                    r["url"] = f["url"]

        def delete_resource(f):
            self.resources = [r for r in self.resources if r["id"] != f["resource_id"]]

        return {
            "lovelace/dashboards/list": lambda f: [dict(d) for d in self.dashboards],
            "lovelace/dashboards/create": create_dashboard,
            "lovelace/dashboards/delete": delete_dashboard,
            "lovelace/config/save": lambda f: self.configs.__setitem__(f["url_path"], f["config"]),
            "lovelace/resources": lambda f: [dict(r) for r in self.resources],
            "lovelace/resources/create": create_resource,
            "lovelace/resources/update": update_resource,
            "lovelace/resources/delete": delete_resource,
        }


@pytest.fixture
def home(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    (home / "token").write_text("t")
    (home / "domosenso.yaml").write_text(yaml.safe_dump({
        "catalog": str(tmp_path / "catalog"), "config_dir": "home-assistant", "esphome_dir": "esphome",
        "targets": {"staging": {"kind": "local-docker", "container": "ha", "config": str(tmp_path / "config"),
                                "url": "http://127.0.0.1:8124", "token_file": str(home / "token")}},
        "components": {}}))
    return home


@pytest.fixture
def ha(monkeypatch, tmp_path):
    """A FakeHA over a stateful Lovelace, and a FakeTarget for the files."""
    from domosenso_cli import recommend
    from fakes import FakeHA, FakeTarget

    lovelace = Lovelace()
    fake = FakeHA(lovelace.responses())
    fake.lovelace = lovelace
    fake.opened = []
    fake.target = FakeTarget(tmp_path / "config")

    class StubHA:
        def __new__(cls, url, token, token_source=None):
            fake.opened.append(("url", url))
            return fake

        @classmethod
        def for_target(cls, target):
            fake.opened.append(("target", target.name))
            return fake

    monkeypatch.setattr(recommend, "HA", StubHA)
    monkeypatch.setattr(probe, "open_target", lambda target: fake.target)
    return fake


def run(capsys, *argv):
    code = cli.main(list(argv))
    return code, capsys.readouterr().out.splitlines()


def test_install_copies_adds_a_resource_and_a_dashboard(home, ha, capsys, tmp_path):
    code, lines = run(capsys, "--home", str(home), "probe", "staging", "--install")
    assert code == 0, lines
    url = probe._resource_url()
    assert lines == ["copied 2", f"resource create {url}", "dashboard create domosenso-probe",
                     "open /domosenso-probe/0", "ok"]
    config = tmp_path / "config" / "www" / "domosenso" / "_probe"
    assert sorted(p.name for p in config.iterdir()) == ["probe-card.js", "probe.json"]
    assert ha.lovelace.resources == [{"id": "r1", "url": url, "type": "module"}]
    [dashboard] = ha.lovelace.dashboards
    assert dashboard["show_in_sidebar"] is False and dashboard["require_admin"] is False
    assert ha.lovelace.configs["domosenso-probe"]["views"][0]["cards"] == [{"type": "custom:domosenso-probe-card"}]
    assert ("http_status", {"path": url}) in ha.calls
    # Again: nothing new is created.
    code, lines = run(capsys, "--home", str(home), "probe", "staging", "--install")
    assert lines == ["copied 2", "open /domosenso-probe/0", "ok"]
    assert len(ha.lovelace.resources) == 1 and len(ha.lovelace.dashboards) == 1


def test_install_warns_when_local_is_not_served(home, ha, capsys):
    ha.http_statuses[probe._resource_url()] = 404
    code, lines = run(capsys, "--home", str(home), "probe", "staging", "--install")
    assert code == 0
    assert "warning /local/ is not served: www/ did not exist when Home Assistant started; restart it" in lines


def test_install_updates_an_old_probe_resource_in_place(home, ha, capsys):
    ha.lovelace.resources.append({"id": "r9", "url": "/local/domosenso/_probe/probe-card.js?v=old", "type": "module"})
    code, lines = run(capsys, "--home", str(home), "probe", "staging", "--install")
    assert code == 0
    assert f"resource update {probe._resource_url()} from /local/domosenso/_probe/probe-card.js?v=old" in lines
    assert [r["id"] for r in ha.lovelace.resources] == ["r9"]


def test_a_foreign_dashboard_at_the_path_is_refused(home, ha, capsys):
    ha.lovelace.dashboards.append({"id": "x", "url_path": "domosenso-probe", "title": "Mine", "mode": "storage"})
    for action in ("--install", "--remove"):
        code, lines = run(capsys, "--home", str(home), "probe", "staging", action)
        assert code == 1
        assert lines[-1] == "FAIL dashboard domosenso-probe exists and is not the probe's (title 'Mine')"
    assert ha.lovelace.dashboards == [{"id": "x", "url_path": "domosenso-probe", "title": "Mine", "mode": "storage"}]


def test_remove_takes_away_only_what_install_made(home, ha, capsys, tmp_path):
    other = {"id": "r0", "url": "/local/domosenso/ramka/0.1.2/cards/rooms-card.js", "type": "module"}
    ha.lovelace.resources.append(other)
    run(capsys, "--home", str(home), "probe", "staging", "--install")
    code, lines = run(capsys, "--home", str(home), "probe", "staging", "--remove")
    assert code == 0, lines
    assert lines == ["dashboard delete domosenso-probe", f"resource delete {probe._resource_url()}", "removed 2", "ok"]
    assert ha.lovelace.resources == [other] and ha.lovelace.dashboards == []
    assert not list((tmp_path / "config" / "www" / "domosenso" / "_probe").iterdir())


def test_install_and_remove_need_a_target(home, ha, capsys):
    code, lines = run(capsys, "--home", str(home), "probe", "http://ha.local:8123", "--token-file",
                      str(home / "token"), "--install")
    assert code == 1 and lines[-1] == "FAIL --install needs a target in domosenso.yaml, not a URL"


def test_read_prints_the_report_and_skips_other_entries(home, ha, capsys):
    ha.responses["events"] = [entry("Front door", "opened"), entry(probe.NAME, "not json"),
                              entry(probe.NAME, json.dumps(REPORT))]
    code, lines = run(capsys, "--home", str(home), "probe", "staging", "--read", "--wait", "5")
    assert code == 0, lines
    assert lines == [
        "warning unreadable probe report",
        "probe viewport 1100x720 dpr 2 screen 1100x720 orientation landscape webview 141 json-modules yes dvh yes user non-admin",
        "ok",
    ]
    assert ("subscribe_events", {"event_type": "logbook_entry"}) in ha.calls
    # Listening writes nothing.
    assert not [k for k, _ in ha.calls if k.startswith("lovelace/")]


def test_read_from_a_url_and_json(home, ha, capsys):
    ha.responses["events"] = [entry(probe.NAME, json.dumps({**REPORT, "webview": False, "admin": True}))]
    code = cli.main(["--home", str(home), "probe", "http://ha.local:8123", "--token-file", str(home / "token"),
                     "--read", "--json"])
    doc = json.loads(capsys.readouterr().out)
    assert code == 0 and doc["data"] == [{**REPORT, "webview": False, "admin": True}]
    assert doc["lines"][0][9:11] == ["chromium", "141"] and doc["lines"][0][-1] == "admin"
    assert ha.opened == [("url", "http://ha.local:8123")]


def test_read_without_a_report_fails(home, ha, capsys):
    code, lines = run(capsys, "--home", str(home), "probe", "staging", "--read", "--wait", "1")
    assert code == 1 and lines[-1] == "FAIL no report within 1 s"


def test_the_card_and_its_strings_ship_with_the_command():
    for name in probe.SOURCES:
        assert (probe.PROBE_DIR / name).is_file()
    strings = json.loads((probe.PROBE_DIR / "probe.json").read_text(encoding="utf-8"))
    assert sorted(strings) == ["de", "en", "pl"]
    assert all(sorted(strings[lang]) == sorted(strings["en"]) for lang in strings)
    assert "ß" not in strings["de"]["sent"] + strings["de"]["failed"]
