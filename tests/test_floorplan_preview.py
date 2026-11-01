"""`domosenso floorplan preview` (SPEC-028 Amendment 6): the editor against a real home, read-only."""
import http.client
import json
import threading

import pytest
import yaml

from domosenso_cli import cmd_deploy, floorplan_preview as fp
from domosenso_cli.errors import DomosensoError
from domosenso_cli.main import main
from fakes import FakeHA

SQUARE = [[0, 0], [4, 0], [4, 3], [0, 3]]
PLAN = {"schema": 1, "floors": [{"floor_id": "ground", "rooms": [{"area_id": "living_room", "polygon": SQUARE}],
                                 "points": [{"device_id": "d1", "x": 1, "y": 1, "placed": True}]}]}
SOURCE = {"image": "domosenso/floorplan/ground.svg", "metres_per_px": 0.01}

RAW = {
    "get_config": {"language": "de", "location_name": "Demo"},
    "config/area_registry/list": [{"area_id": "living_room", "name": "Living room", "floor_id": "ground"}],
    "config/floor_registry/list": [{"floor_id": "ground", "name": "Ground floor"}],
    "config/device_registry/list": [
        {"id": "d1", "name": "Thermometer", "name_by_user": None, "manufacturer": "Acme", "model": "T1",
         "model_id": None, "area_id": "living_room", "via_device_id": "hub", "config_entries": ["e1"],
         "entry_type": None, "disabled_by": None, "connections": [["mac", "aa:bb"]], "serial_number": "secret-ish"},
        {"id": "off", "name": "Disabled", "disabled_by": "user", "config_entries": [], "entry_type": None},
    ],
    "config/entity_registry/list": [
        {"entity_id": "sensor.t", "device_id": "d1", "platform": "acme", "area_id": None, "entity_category": None,
         "hidden_by": None, "disabled_by": None, "original_name": "Temperature", "name": None},
        {"entity_id": "sensor.h", "device_id": "d1", "platform": "acme", "area_id": None, "entity_category": None,
         "hidden_by": "user", "disabled_by": None, "original_name": "Hidden", "name": None},
        {"entity_id": "sensor.x", "device_id": "d1", "platform": "acme", "disabled_by": "integration"},
    ],
    "config_entries/get": [{"entry_id": "e1", "domain": "acme", "title": "Acme account"}],
    "get_states": [{"entity_id": "sensor.t", "state": "21", "attributes": {"device_class": "temperature"}}],
}


def test_reads_build_the_frontend_shapes_the_card_uses():
    hass = fp.build_hass(RAW)
    assert hass["language"] == "de" and hass["locale"] == {"language": "de"}
    assert hass["user"] == {"is_admin": True, "name": "preview"}
    assert hass["areas"] == {"living_room": {"area_id": "living_room", "name": "Living room", "floor_id": "ground"}}
    assert hass["floors"] == {"ground": {"floor_id": "ground", "name": "Ground floor"}}
    assert set(hass["devices"]) == {"d1"}, "a disabled device is left out"
    assert hass["devices"]["d1"]["via_device_id"] == "hub" and hass["devices"]["d1"]["config_entries"] == ["e1"]
    assert "serial_number" not in hass["devices"]["d1"], "only what the card reads goes to the page"
    assert set(hass["entities"]) == {"sensor.t", "sensor.h"}, "a disabled entity is left out"
    assert hass["entities"]["sensor.h"]["hidden"] is True and hass["entities"]["sensor.t"]["hidden"] is False
    assert hass["states"]["sensor.t"]["state"] == "21"
    assert fp.entries(RAW) == [{"entry_id": "e1", "domain": "acme"}], "only the domain, no titles"


@pytest.fixture
def served(tmp_path):
    """A preview of a home with a rendered card, its server on a free port."""
    (tmp_path / "domosenso").mkdir()
    plan_file = tmp_path / "domosenso" / "floorplan.json"
    plan_file.write_text(json.dumps({**PLAN, "source": SOURCE}))
    card = tmp_path / "home-assistant" / "www" / "domosenso" / "floorplan" / "0.1.0"
    (card / "cards" / "lib").mkdir(parents=True)
    (card / "translations").mkdir()
    (card / "cards" / "floorplan-card.js").write_text("export {};\n")
    (card / "translations" / "en.json").write_text("{}\n")
    lines = []
    preview = fp.Preview(fp.build_hass(RAW), fp.entries(RAW), plan_file, card, lines.append,
                         target_url="http://ha.example:8123")
    server = fp.start_server(preview, 0)
    yield preview, server, plan_file, lines
    server.shutdown()


def request(server, method, path, body=None, cookie=None):
    conn = http.client.HTTPConnection(*server.server_address[:2], timeout=5)
    headers = {"Content-Type": "application/json"} if body is not None else {}
    if cookie:
        headers["Cookie"] = cookie
    conn.request(method, path, body=json.dumps(body) if body is not None else None, headers=headers)
    resp = conn.getresponse()
    return resp.status, dict(resp.getheaders()), resp.read()


def test_binds_loopback_only(served):
    _, server, _, _ = served
    assert server.server_address[0] == "127.0.0.1"


def test_nothing_without_the_key(served):
    preview, server, plan_file, _ = served
    for method, path in (("GET", "/"), ("GET", "/data"), ("GET", "/plan"), ("GET", "/cards/floorplan-card.js")):
        assert request(server, method, path)[0] == 403, path
    assert request(server, "POST", "/save", fp_dashboard())[0] == 403
    assert request(server, "GET", "/?key=wrong")[0] == 403
    assert json.loads(plan_file.read_text())["floors"] == PLAN["floors"], "nothing written"


def fp_dashboard(plan=None):
    from domosenso_cli import floorplan_doc as fd
    return fd.dashboard_config(plan or PLAN)


def test_page_sets_a_cookie_and_serves_the_card_and_data(served):
    preview, server, _, _ = served
    status, headers, body = request(server, "GET", f"/?key={preview.key}")
    assert status == 200 and b"floorplan-card" in body
    cookie = headers["Set-Cookie"].split(";")[0]
    status, headers, body = request(server, "GET", "/cards/floorplan-card.js", cookie=cookie)
    assert status == 200 and headers["Content-Type"].startswith("text/javascript")
    status, headers, _ = request(server, "GET", "/translations/en.json", cookie=cookie)
    assert status == 200 and headers["Content-Type"].startswith("application/json")
    assert request(server, "GET", "/cards/../../../../domosenso/floorplan.json", cookie=cookie)[0] == 404
    data = json.loads(request(server, "GET", "/data", cookie=cookie)[2])
    assert data["hass"]["devices"]["d1"]["name"] == "Thermometer" and data["entries"] == [{"entry_id": "e1", "domain": "acme"}]
    plan = json.loads(request(server, "GET", "/plan", cookie=cookie)[2])
    assert plan == fp_dashboard(), "the file's plan as the dashboard the card reads, without source"


def test_save_writes_the_file_and_keeps_source(served):
    preview, server, plan_file, lines = served
    moved = json.loads(json.dumps(PLAN))
    moved["floors"][0]["points"][0]["x"] = 2.5
    status, _, _ = request(server, "POST", f"/save?key={preview.key}", fp_dashboard(moved))
    assert status == 200
    written = json.loads(plan_file.read_text())
    assert written["floors"][0]["points"][0]["x"] == 2.5 and written["source"] == SOURCE
    assert lines == [("wrote", "domosenso/floorplan.json")]


def test_save_refuses_an_invalid_plan_and_writes_nothing(served):
    preview, server, plan_file, lines = served
    bad = json.loads(json.dumps(PLAN))
    bad["floors"][0]["points"].append(dict(bad["floors"][0]["points"][0]))
    status, _, body = request(server, "POST", f"/save?key={preview.key}", fp_dashboard(bad))
    assert status == 400 and b"duplicate point" in body
    assert json.loads(plan_file.read_text())["floors"] == PLAN["floors"]
    assert lines == []


def test_a_refused_call_is_reported(served):
    preview, server, _, lines = served
    status, _, _ = request(server, "POST", f"/refused?key={preview.key}&type=config/area_registry/create")
    assert status == 200 and lines == [("refused", "config/area_registry/create")]


def test_states_follow_with_a_sequence(served):
    preview, server, _, _ = served
    preview.add_state({"entity_id": "sensor.t", "state": "22", "attributes": {}})
    changes = json.loads(request(server, "GET", f"/changes?key={preview.key}&since=0")[2])
    assert changes["seq"] == 1 and changes["states"][0]["state"] == "22"
    assert json.loads(request(server, "GET", f"/changes?key={preview.key}&since=1")[2])["states"] == []


# ---- the command --------------------------------------------------------------------------

@pytest.fixture
def home(tmp_path, monkeypatch):
    token = tmp_path / "token"
    token.write_text("t")
    (tmp_path / "domosenso.yaml").write_text(yaml.safe_dump({
        "catalog": "c", "config_dir": "home-assistant", "esphome_dir": "esphome",
        "targets": {"production": {"kind": "local-docker", "container": "p", "config": "../t", "url": "http://x",
                                   "token_file": str(token)}},
        "components": {},
    }))
    (tmp_path / "domosenso").mkdir()
    (tmp_path / "domosenso" / "floorplan.json").write_text(json.dumps(PLAN))
    card = tmp_path / "home-assistant" / "www" / "domosenso" / "floorplan" / "0.1.0" / "cards"
    card.mkdir(parents=True)
    (card / "floorplan-card.js").write_text("export {};\n")
    ha = FakeHA(dict(RAW))
    monkeypatch.setattr(cmd_deploy, "connect", lambda t: ha)
    started = {}

    async def no_follow(ha, preview):
        started["preview"] = preview

    monkeypatch.setattr(fp, "follow", no_follow)
    monkeypatch.setattr(fp, "start_server", lambda preview, port: started.setdefault("server", Stub(port)))
    return tmp_path, ha, started


class Stub:
    def __init__(self, port):
        self.server_address = ("127.0.0.1", port or 8130)
        self.stopped = False

    def shutdown(self):
        self.stopped = True


def test_command_reads_only_and_prints_its_lines(home, capsys):
    root, ha, started = home
    assert main(["--home", str(root), "floorplan", "preview", "production", "--no-open"]) == 0
    out = capsys.readouterr().out
    assert "read production: areas 1 devices 1 entities 2 states 1" in out
    assert f"preview http://127.0.0.1:8130/?key={started['preview'].key}" in out
    assert out.rstrip().endswith("ok")
    assert {k for k, _ in ha.calls} <= set(fp.READS) | {"subscribe_events"}, ha.calls
    assert started["server"].stopped


def test_command_fails_without_a_rendered_card(home, capsys):
    root, _, _ = home
    import shutil
    shutil.rmtree(root / "home-assistant" / "www")
    assert main(["--home", str(root), "floorplan", "preview", "production", "--no-open"]) == 1
    assert "FAIL no floorplan card rendered" in capsys.readouterr().out


def test_command_refuses_push_and_pull_options(home, capsys):
    root, _, _ = home
    assert main(["--home", str(root), "floorplan", "preview", "production", "--plan"]) == 1
    assert "FAIL --plan, --apply and --confirm go with push" in capsys.readouterr().out
    assert main(["--home", str(root), "floorplan", "preview", "production", "--out", "x.json"]) == 1
    assert "FAIL --out goes with pull" in capsys.readouterr().out


def test_card_dir_prefers_the_locked_version(tmp_path):
    base = tmp_path / "www" / "domosenso" / "floorplan"
    for v in ("0.1.0", "0.2.0"):
        (base / v / "cards").mkdir(parents=True)
        (base / v / "cards" / "floorplan-card.js").write_text("")
    assert fp.card_dir(tmp_path, "0.1.0").name == "0.1.0"
    with pytest.raises(DomosensoError, match="no floorplan card rendered"):
        fp.card_dir(tmp_path, None)   # two versions and no lock: which one is meant is not known
    (base / "0.2.0" / "cards" / "floorplan-card.js").unlink()
    assert fp.card_dir(tmp_path, None).name == "0.1.0", "one rendered version and no lock: that one"


def test_local_files_come_from_the_target_without_a_token(served, monkeypatch):
    preview, server, _, _ = served
    asked = []

    def fetch(url):
        asked.append(url)
        return (b"JPEG", "image/jpeg") if url.endswith("/a.jpg") else None

    monkeypatch.setattr(fp, "fetch_local", fetch)
    status, headers, body = request(server, "GET", f"/local/plants/a.jpg?key={preview.key}")
    assert (status, headers["Content-Type"], body) == (200, "image/jpeg", b"JPEG")
    assert asked == ["http://ha.example:8123/local/plants/a.jpg"]
    assert request(server, "GET", f"/local/plants/missing.jpg?key={preview.key}")[0] == 404
    assert request(server, "GET", f"/local/../api/states?key={preview.key}")[0] == 404
    assert len(asked) == 2, "a path leaving /local/ is never fetched"
    assert request(server, "GET", "/local/plants/a.jpg")[0] == 403


def test_fetch_local_sends_no_authorization(monkeypatch):
    seen = {}

    class Response:
        status = 200
        headers = {"Content-Type": "image/png"}

        def read(self):
            return b"PNG"

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def urlopen(req, timeout):
        seen["headers"] = dict(req.header_items())
        seen["url"] = req.full_url
        return Response()

    monkeypatch.setattr(fp.urllib.request, "urlopen", urlopen)
    assert fp.fetch_local("http://ha.example:8123/local/x.png") == (b"PNG", "image/png")
    assert not any(k.lower() == "authorization" for k in seen["headers"])
