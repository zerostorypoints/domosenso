"""`domosenso floorplan survey` (SPEC-044 S3): the laptop's Wi-Fi recorded where the owner taps."""
import asyncio
import http.client
import json
import shutil
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest
import yaml

from domosenso_cli import cmd_deploy, floorplan_doc as fd, floorplan_preview as fp, floorplan_survey as fs, wifi_link
from domosenso_cli.main import main
from domosenso_cli.wifi_link import Link
from fakes import FakeHA

RULES = Path(__file__).resolve().parents[1] / "components" / "floorplan" / "cards" / "lib" / "wifi-rules.json"
SQUARE = [[0, 0], [6, 0], [6, 4], [0, 4]]
PLAN = {"schema": 1, "floors": [{
    "floor_id": "ground", "rooms": [{"area_id": "living_room", "polygon": SQUARE}],
    "points": [{"device_id": "dev-ap", "x": 1, "y": 1, "placed": True},
               {"device_id": "dev-ap2", "x": 5, "y": 3, "placed": True}],
    "access_points": [{"device_id": "dev-ap", "bands": ["2.4", "5"]}],
}]}
SOURCE = {"image": "domosenso/floorplan/ground.svg", "metres_per_px": 0.01}
LAPTOP = "02:00:00:00:00:99"


def ent(entity_id, device_id, platform="tplink_deco"):
    return {"entity_id": entity_id, "device_id": device_id, "platform": platform, "area_id": None,
            "entity_category": None, "hidden_by": None, "disabled_by": None, "original_name": None, "name": None}


def tracker_state(entity_id, **attrs):
    return {"entity_id": entity_id, "state": "home", "attributes": attrs}


ALEX_LAPTOP = tracker_state("device_tracker.alex_laptop", device_type="client", mac="02-00-00-00-00-99",
                            deco_mac="02-00-00-00-00-01", connection_type="band5")
RAW = {
    "get_config": {"language": "en"},
    "config/area_registry/list": [{"area_id": "living_room", "name": "Living room", "floor_id": "ground"}],
    "config/floor_registry/list": [{"floor_id": "ground", "name": "Ground floor"}],
    "config/device_registry/list": [
        {"id": "dev-ap", "name": "Alex Deco", "config_entries": ["e1"], "entry_type": None, "disabled_by": None},
        {"id": "dev-ap2", "name": "Sam Deco", "config_entries": ["e1"], "entry_type": None, "disabled_by": None},
    ],
    "config/entity_registry/list": [
        ent("device_tracker.alex_deco", "dev-ap"),
        ent("sensor.alex_deco_bssid_5_ghz", "dev-ap"),
        ent("sensor.alex_deco_bssid_2_4_ghz", "dev-ap"),
        ent("device_tracker.sam_deco", "dev-ap2"),
        ent("sensor.sam_deco_bssid_5_ghz", "dev-ap2"),
        ent("device_tracker.alex_laptop", None),
        ent("device_tracker.sam_phone", None, platform="mobile_app"),
    ],
    "config_entries/get": [{"entry_id": "e1", "domain": "tplink_deco"}],
    "get_states": [
        tracker_state("device_tracker.alex_deco", device_type="deco", mac="02-00-00-00-00-01"),
        {"entity_id": "sensor.alex_deco_bssid_5_ghz", "state": "02-00-00-00-00-05", "attributes": {}},
        {"entity_id": "sensor.alex_deco_bssid_2_4_ghz", "state": "02-00-00-00-00-04", "attributes": {}},
        tracker_state("device_tracker.sam_deco", device_type="deco", mac="02-00-00-00-00-02"),
        {"entity_id": "sensor.sam_deco_bssid_5_ghz", "state": "02-00-00-00-00-25", "attributes": {}},
        ALEX_LAPTOP,
        # Not the router's: a phone app's tracker with the laptop's MAC must not count.
        tracker_state("device_tracker.sam_phone", device_type="client", mac=LAPTOP, deco_mac="02-00-00-00-00-02"),
    ],
}

FIVE = [Link("5", 36, d, -92.0, None) for d in (-58.0, -59.0, -57.0, -58.5, -58.6)]
NOW = datetime(2026, 11, 11, 19, 30, 0, tzinfo=timezone.utc)


def make_card(root):
    card = root / "home-assistant" / "www" / "domosenso" / "floorplan" / "0.1.0"
    (card / "cards" / "lib").mkdir(parents=True)
    (card / "cards" / "floorplan-card.js").write_text("export {};\n")
    shutil.copy(RULES, card / "cards" / "lib" / "wifi-rules.json")
    return card


@pytest.fixture
def survey(tmp_path):
    (tmp_path / "domosenso").mkdir()
    plan_file = tmp_path / "domosenso" / "floorplan.json"
    plan_file.write_text(json.dumps({**PLAN, "source": SOURCE}))
    card = make_card(tmp_path)
    lines = []
    fetched = []

    def fetch_states():
        fetched.append(1)
        return RAW["get_states"]

    s = fs.Survey(fp.build_hass(RAW), fp.entries(RAW), plan_file, card, lines.append,
                  reader=lambda: FIVE[0], mac=LAPTOP, fetch_states=fetch_states, clock=lambda: NOW)
    return s, plan_file, lines, fetched


def samples_of(plan_file):
    return (json.loads(plan_file.read_text()).get("wifi") or {}).get("samples", [])


# ---- averaging ------------------------------------------------------------------------------

def test_average_of_five_readings():
    got = fs.average(FIVE)
    assert (got.band, got.channel, got.dbm, got.noise, got.bssid) == ("5", 36, -58.2, -92.0, None)


def test_average_takes_the_majority_band_only():
    mixed = FIVE[:3] + [Link("2.4", 6, -40.0, -95.0, None), Link("2.4", 6, -41.0, -95.0, None)]
    got = fs.average(mixed)
    assert (got.band, got.channel, got.dbm) == ("5", 36, -58.0), "the mean of the three 5 GHz readings"


def test_average_needs_three_readings_of_the_band_and_ignores_a_link_down():
    assert fs.average(FIVE[:2]) is None
    assert fs.average([FIVE[0], None, FIVE[1], None, None]) is None
    assert fs.average([FIVE[0], None, FIVE[1], FIVE[2], None]).dbm == -58.0


def test_average_keeps_the_bssid_and_noise_when_given():
    links = [Link("2.4", 1, -60.0, None, "02-00-00-00-00-04")] * 3
    got = fs.average(links)
    assert got.noise is None and got.bssid == "02:00:00:00:00:04", "normalised: colons, lower case"


# ---- one sample -----------------------------------------------------------------------------

def test_five_readings_become_one_survey_sample(survey):
    s, plan_file, lines, _ = survey
    got = s.sample("ground", 1.23456, 2.0, FIVE, ALEX_LAPTOP)
    assert got == {"floor_id": "ground", "x": 1.235, "y": 2.0, "t": "2026-11-11T19:30:00Z", "band": "5",
                   "channel": 36, "dbm": -58.2, "noise": -92.0, "ap": "dev-ap", "source": "survey"}
    assert samples_of(plan_file) == [got]
    written = json.loads(plan_file.read_text())
    fd.validate(written)
    assert written["source"] == SOURCE, "the traced drawing stays"
    assert lines == [("sample", "ground", "1.235", "2", "5", "-58.2", "dBm", "dev-ap"),
                     ("wrote", "domosenso/floorplan.json")]


def test_each_write_validates_and_appends(survey):
    s, plan_file, _, _ = survey
    for i in range(3):
        s.sample("ground", float(i), 1.0, FIVE, None)
        fd.validate(json.loads(plan_file.read_text()))
    assert [x["x"] for x in samples_of(plan_file)] == [0.0, 1.0, 2.0]


def test_too_few_readings_write_nothing(survey):
    s, plan_file, lines, _ = survey
    before = plan_file.read_text()
    assert s.sample("ground", 1, 1, FIVE[:2], None) is None
    assert lines == [("sample", "skipped", "too few readings")]
    assert plan_file.read_text() == before


def test_the_bssid_names_the_access_point(survey):
    s, plan_file, lines, _ = survey
    links = [Link("5", 36, -50.0, -90.0, "02-00-00-00-00-05")] * 5
    got = s.sample("ground", 1, 1, links, None)
    assert got["ap"] == "dev-ap" and got["bssid"] == "02:00:00:00:00:05"


def test_a_bssid_of_an_unmarked_node_gives_no_ap(survey):
    s, _, lines, _ = survey
    links = [Link("5", 36, -50.0, -90.0, "02:00:00:00:00:25")] * 5
    got = s.sample("ground", 1, 1, links, None)
    assert "ap" not in got and got["bssid"] == "02:00:00:00:00:25"
    assert lines[0][-1] == "-"


def test_without_a_bssid_the_router_tracker_names_the_access_point(survey):
    s, _, _, _ = survey
    assert s.sample("ground", 1, 1, FIVE, ALEX_LAPTOP)["ap"] == "dev-ap"
    on_sam = {**ALEX_LAPTOP, "attributes": {**ALEX_LAPTOP["attributes"], "deco_mac": "02-00-00-00-00-02"}}
    assert "ap" not in s.sample("ground", 1, 1, FIVE, on_sam), "Sam's node is not a marked access point"
    assert "ap" not in s.sample("ground", 1, 1, FIVE, None)


def test_the_laptop_tracker_is_the_router_client_with_its_mac(survey):
    s, _, _, _ = survey
    assert s.laptop_tracker(RAW["get_states"]) == ALEX_LAPTOP, "dashes normalised; a phone app's tracker does not count"
    assert s.laptop_tracker([st for st in RAW["get_states"] if st is not ALEX_LAPTOP]) is None


def test_an_entity_access_point_counts_by_its_tracker(survey):
    s, plan_file, _, _ = survey
    plan = {**PLAN, "floors": [{**PLAN["floors"][0],
                                "points": [{"entity_id": "device_tracker.alex_deco", "x": 1, "y": 1, "placed": True}],
                                "access_points": [{"entity_id": "device_tracker.alex_deco", "bands": ["5"]}]}]}
    plan_file.write_text(json.dumps(plan))
    assert s.sample("ground", 1, 1, FIVE, ALEX_LAPTOP)["ap"] == "device_tracker.alex_deco"


def test_a_sample_on_an_unknown_floor_is_refused(survey):
    s, plan_file, _, _ = survey
    before = plan_file.read_text()
    with pytest.raises(fs.DomosensoError, match="sample 0: floor upstairs not in the plan"):
        s.sample("upstairs", 1, 1, FIVE, None)
    assert plan_file.read_text() == before


def test_at_most_2000_samples(survey):
    s, plan_file, lines, _ = survey
    full = [{"floor_id": "ground", "x": 1, "y": 1, "band": "5", "dbm": -60, "source": "survey"}] * 2000
    plan_file.write_text(json.dumps({**PLAN, "wifi": {"samples": full}}))
    assert s.sample("ground", 1, 1, FIVE, None) is None
    assert lines == [("sample", "skipped", "plan has 2000 samples")]
    assert len(samples_of(plan_file)) == 2000


# ---- the reader and taking a sample ---------------------------------------------------------

def test_take_waits_for_the_next_five_readings_and_reads_the_tracker_once(survey, monkeypatch):
    s, plan_file, lines, fetched = survey
    monkeypatch.setattr(fs, "INTERVAL_S", 0.01)
    feed = iter([Link("2.4", 1, -30.0, None, None)] * 2 + FIVE * 100)
    s.reader = lambda: next(feed)
    s.start()
    try:
        time.sleep(0.05)  # the reader has run; readings before the tap do not count
        got = s.take("ground", 2, 2)
    finally:
        s.stop()
    assert got["band"] == "5" and got["ap"] == "dev-ap"
    assert fetched == [1], "one read of the trackers per sample"
    assert samples_of(plan_file) == [got]


def test_take_with_a_bssid_reads_no_tracker(survey, monkeypatch):
    s, _, _, fetched = survey
    monkeypatch.setattr(fs, "INTERVAL_S", 0.01)
    s.reader = lambda: Link("5", 36, -50.0, -90.0, "02:00:00:00:00:05")
    s.start()
    try:
        assert s.take("ground", 2, 2)["ap"] == "dev-ap"
    finally:
        s.stop()
    assert fetched == []


def test_reader_prints_the_link_every_30_s(survey, monkeypatch):
    s, _, lines, _ = survey
    monkeypatch.setattr(fs, "INTERVAL_S", 0.01)
    monkeypatch.setattr(fs, "LINK_EVERY_S", 0.1)
    s.start()
    time.sleep(0.25)
    s.stop()
    said = [line for line in lines if line[0] == "link"]
    assert said and said[0] == ("link", "5", "36", "-58", "dBm")
    assert 2 <= len(said) <= 4, said
    assert s.reading() == {"band": "5", "channel": 36, "dbm": -58.0, "noise": -92.0, "bssid": None}


# ---- the server -----------------------------------------------------------------------------

@pytest.fixture
def served(survey, monkeypatch):
    s, plan_file, lines, fetched = survey
    monkeypatch.setattr(fs, "INTERVAL_S", 0.01)
    s.start()
    server = fp.start_server(s, 0)
    yield s, server, plan_file, lines
    server.shutdown()
    s.stop()


def request(server, method, path, body=None, cookie=None):
    conn = http.client.HTTPConnection(*server.server_address[:2], timeout=10)
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
    s, server, plan_file, _ = served
    before = plan_file.read_text()
    assert request(server, "GET", "/survey/link")[0] == 403
    assert request(server, "POST", "/survey/sample", {"floor_id": "ground", "x": 1, "y": 1})[0] == 403
    assert request(server, "POST", "/survey/sample?key=wrong", {"floor_id": "ground", "x": 1, "y": 1})[0] == 403
    assert plan_file.read_text() == before


def test_page_is_the_card_with_survey_on(served):
    s, server, _, _ = served
    status, headers, body = request(server, "GET", f"/?key={s.key}")
    assert status == 200 and b"floorplan-card" in body and b"survey: true" in body
    cookie = headers["Set-Cookie"].split(";")[0]
    link = json.loads(request(server, "GET", "/survey/link", cookie=cookie)[2])
    assert link == {"link": {"band": "5", "channel": 36, "dbm": -58.0, "noise": -92.0, "bssid": None}}


def test_preview_page_has_no_survey():
    assert "survey: true" not in fp.PAGE


def test_post_sample_answers_with_the_sample(served):
    s, server, plan_file, _ = served
    status, _, body = request(server, "POST", f"/survey/sample?key={s.key}", {"floor_id": "ground", "x": 3, "y": 1.5})
    assert status == 200
    got = json.loads(body)
    assert got["sample"]["x"] == 3 and got["sample"]["source"] == "survey"
    assert samples_of(plan_file) == [got["sample"]]


def test_post_sample_tells_why_it_was_skipped(served):
    s, server, plan_file, _ = served
    s.reader = lambda: None
    status, _, body = request(server, "POST", f"/survey/sample?key={s.key}", {"floor_id": "ground", "x": 3, "y": 1})
    assert status == 200 and json.loads(body) == {"sample": None, "skipped": "too few readings"}
    assert json.loads(request(server, "GET", f"/survey/link?key={s.key}")[2]) == {"link": None}


def test_post_sample_refuses_a_bad_body(served):
    s, server, _, _ = served
    for body in ({"floor_id": "ground", "x": "a", "y": 1}, {"x": 1, "y": 1}, [1], {"floor_id": 3, "x": 1, "y": 1}):
        assert request(server, "POST", f"/survey/sample?key={s.key}", body)[0] == 400, body
    status, _, text = request(server, "POST", f"/survey/sample?key={s.key}", {"floor_id": "upstairs", "x": 1, "y": 1})
    assert status == 400 and b"not in the plan" in text


# ---- the command ----------------------------------------------------------------------------

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
    make_card(tmp_path)
    ha = FakeHA({**RAW, "/api/states": RAW["get_states"]})
    monkeypatch.setattr(cmd_deploy, "connect", lambda t: ha)
    monkeypatch.setattr(fs, "INTERVAL_S", 0.01)
    seen = {}

    def read_link(system=None, interface=None, cache_dir=None):
        seen["read"] = (interface, cache_dir)
        return FIVE[0]

    monkeypatch.setattr(wifi_link, "read_link", read_link)
    monkeypatch.setattr(wifi_link, "mac_address", lambda interface, system=None: LAPTOP)
    real_start = fp.start_server
    monkeypatch.setattr(fp, "start_server", lambda page, port: seen.setdefault("server", real_start(page, port)))

    async def walk(ha, page):
        # The owner taps once; the command's loop keeps running meanwhile (the tracker read goes through it).
        status, _, body = await asyncio.to_thread(
            request, seen["server"], "POST", f"/survey/sample?key={page.key}", {"floor_id": "ground", "x": 2, "y": 2})
        seen["answer"] = (status, json.loads(body))

    monkeypatch.setattr(fp, "follow", walk)
    return tmp_path, ha, seen


WRITES = ("lovelace/config/save", "lovelace/dashboards/create", "call_service", "config/area_registry/create")


def test_command_records_a_sample_and_writes_nothing_to_home_assistant(home, capsys):
    root, ha, seen = home
    assert main(["--home", str(root), "floorplan", "survey", "production", "--no-open", "--port", "0",
                 "--interface", "en1"]) == 0
    out = capsys.readouterr().out
    port = seen["server"].server_address[1]
    assert "read production: areas 1 devices 2 entities 7 states 7" in out
    assert f"survey http://127.0.0.1:{port}/?key=" in out
    assert "sample ground 2 2 5 -58 dBm dev-ap" in out and "wrote domosenso/floorplan.json" in out
    assert out.rstrip().endswith("ok")
    assert seen["answer"][0] == 200 and seen["answer"][1]["sample"]["ap"] == "dev-ap"
    assert seen["read"] == ("en1", root / ".domosenso" / "wifi"), "the helper's cache is the home's, not the cwd"
    assert {k for k, _ in ha.calls} <= set(fp.READS) | {"subscribe_events", "/api/states"}, ha.calls
    assert not any(k in WRITES for k, _ in ha.calls)
    assert len(samples_of(root / "domosenso" / "floorplan.json")) == 1


def test_command_fails_without_a_wifi_interface(home, capsys, monkeypatch):
    root, ha, _ = home
    monkeypatch.setattr(wifi_link, "mac_address", lambda interface, system=None: None)
    monkeypatch.setattr(wifi_link, "read_link", lambda system=None, interface=None, cache_dir=None: None)
    assert main(["--home", str(root), "floorplan", "survey", "production", "--no-open"]) == 1
    assert "FAIL no Wi-Fi interface" in capsys.readouterr().out
    assert ha.calls == [], "the target is not read"


def test_command_fails_when_wifi_is_off(home, capsys, monkeypatch):
    root, ha, _ = home
    monkeypatch.setattr(wifi_link, "read_link", lambda system=None, interface=None, cache_dir=None: None)
    assert main(["--home", str(root), "floorplan", "survey", "production", "--no-open"]) == 1
    assert "FAIL Wi-Fi is off" in capsys.readouterr().out


def test_command_refuses_push_and_pull_options(home, capsys):
    root, _, _ = home
    assert main(["--home", str(root), "floorplan", "survey", "production", "--plan"]) == 1
    assert "FAIL --plan, --apply and --confirm go with push" in capsys.readouterr().out
    assert main(["--home", str(root), "floorplan", "preview", "production", "--interface", "en1"]) == 1
    assert "FAIL --interface goes with survey" in capsys.readouterr().out


def test_command_fails_without_rendered_rules(home, capsys):
    root, _, _ = home
    (root / "home-assistant" / "www" / "domosenso" / "floorplan" / "0.1.0" / "cards" / "lib" / "wifi-rules.json").unlink()
    assert main(["--home", str(root), "floorplan", "survey", "production", "--no-open"]) == 1
    assert "FAIL no floorplan card rendered:" in capsys.readouterr().out


# ---- fix round 1: the editor's save and the samples share the file ---------------------------

def test_a_stale_save_keeps_the_samples(survey):
    s, plan_file, lines, _ = survey
    got = s.sample("ground", 1, 1, FIVE, None)
    stale = json.loads(json.dumps(PLAN))  # the page's plan from before the sample
    stale["floors"][0]["points"][0]["x"] = 2.5
    stale["wifi"] = {"defaults": {"interior": "interior", "exterior": "exterior"}}
    s.save(fd.dashboard_config(stale))
    written = json.loads(plan_file.read_text())
    assert written["wifi"]["samples"] == [got], "R17: the file's samples stay"
    assert written["wifi"]["defaults"] == stale["wifi"]["defaults"] and written["floors"][0]["points"][0]["x"] == 2.5
    assert written["source"] == SOURCE and lines[-1] == ("wrote", "domosenso/floorplan.json")


def test_a_save_cannot_add_or_change_samples(survey):
    s, plan_file, _, _ = survey
    forged = {**PLAN, "wifi": {"samples": [{"floor_id": "ground", "x": 1, "y": 1, "band": "5", "dbm": -10}]}}
    s.save(fd.dashboard_config(forged))
    assert samples_of(plan_file) == [], "the file had none; the survey alone adds them"


def test_a_save_adds_the_manual_readings_the_file_lacks(survey):
    """Task 16: a reading typed on the survey page (Add reading) reaches the file; survey samples stay the
    survey's alone, and a manual reading already in the file is not added twice."""
    s, plan_file, lines, _ = survey
    got = s.sample("ground", 1, 1, FIVE, None)
    manual = {"floor_id": "ground", "x": 2.5, "y": 1.2, "t": "2026-11-11T19:31:00Z", "band": "5", "dbm": -63,
              "ap": "dev-ap", "source": "manual"}
    forged = {**got, "dbm": -10}
    page = {**PLAN, "wifi": {"samples": [manual, forged]}}  # loaded before the survey sample, then a reading added
    s.save(fd.dashboard_config(page))
    assert samples_of(plan_file) == [got, manual], "the file's samples, then the new manual one; the forged survey one dropped"
    assert lines[-1] == ("wrote", "domosenso/floorplan.json")
    s.save(fd.dashboard_config({**PLAN, "wifi": {"samples": [got, manual]}}))
    assert samples_of(plan_file) == [got, manual], "already in the file: not added again"
    s.save(fd.dashboard_config(PLAN))
    assert samples_of(plan_file) == [got, manual], "a save without them keeps them"


def test_a_plain_preview_save_writes_the_samples_as_given(tmp_path):
    plan_file = tmp_path / "floorplan.json"
    plan_file.write_text(json.dumps(PLAN))
    p = fp.Preview(fp.build_hass(RAW), fp.entries(RAW), plan_file, make_card(tmp_path), [].append)
    manual = {"floor_id": "ground", "x": 2.5, "y": 1.2, "band": "5", "dbm": -63, "source": "manual"}
    p.save(fd.dashboard_config({**PLAN, "wifi": {"samples": [manual]}}))
    assert samples_of(plan_file) == [manual]


def test_a_save_waits_for_a_sample_being_written(survey):
    s, plan_file, _, _ = survey
    done = []
    with s.file_lock:
        t = threading.Thread(target=lambda: (s.save(fd.dashboard_config(PLAN)), done.append(1)))
        t.start()
        time.sleep(0.05)
        assert done == [], "the save waits for the file lock"
        s.sample("ground", 1, 1, FIVE, None)
    t.join(5)
    assert done == [1] and len(samples_of(plan_file)) == 1


def test_a_reader_that_raises_keeps_the_loop_alive(survey, monkeypatch):
    s, _, _, _ = survey
    monkeypatch.setattr(fs, "INTERVAL_S", 0.01)
    calls = []

    def flaky():
        calls.append(1)
        if len(calls) <= 2:
            raise RuntimeError("tool crashed")
        return FIVE[0]

    s.reader = flaky
    s.start()
    try:
        time.sleep(0.1)
        assert len(calls) > 2 and s.reading()["dbm"] == -58.0
    finally:
        s.stop()
