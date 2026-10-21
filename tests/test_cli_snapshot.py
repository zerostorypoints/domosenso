"""`domosenso snapshot`: what a running home is made of, read over its APIs."""
import asyncio
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from domosenso_cli import main as cli
from domosenso_cli import snapshot
from domosenso_cli.errors import DomosensoError
from domosenso_cli.snapshot import canonical_sha, profile_language, read_kiosk_profiles, take
from fakes import FakeHA, FakeTarget

SCHEMA = Path(__file__).resolve().parent.parent / "schemas" / "snapshot.schema.json"

REGISTRY = [
    {"entity_id": "sensor.living_room_temperature", "platform": "hue", "unique_id": "hue-1",
     "config_entry_id": "e1", "disabled_by": None},
    {"entity_id": "sensor.office_comfort", "platform": "template", "unique_id": "office_comfort",
     "config_entry_id": None, "disabled_by": None},
    {"entity_id": "automation.hall_light", "platform": "automation", "unique_id": "hall_light_1",
     "config_entry_id": None, "disabled_by": None},
    {"entity_id": "input_select.house_mode", "platform": "input_select", "unique_id": "house_mode",
     "config_entry_id": None, "disabled_by": None},
    {"entity_id": "sensor.kitchen_power", "platform": "mqtt", "unique_id": "kitchen_power",
     "config_entry_id": "e2", "disabled_by": None},
]

STATES = [
    {"entity_id": "sensor.living_room_temperature", "state": "21.5", "attributes": {}},
    {"entity_id": "sensor.office_comfort", "state": "unknown", "attributes": {"component": "comfort"}},
    {"entity_id": "automation.hall_light", "state": "on",
     "attributes": {"id": "hall_light_1", "last_triggered": "2026-10-21T06:00:00+00:00"}},
    {"entity_id": "script.good_night", "state": "off", "attributes": {}},
    {"entity_id": "input_select.house_mode", "state": "home",
     "attributes": {"options": ["home", "away", "night"], "friendly_name": "House mode", "icon": "mdi:home"}},
    {"entity_id": "sensor.kitchen_power", "state": "unavailable", "attributes": {}},
    {"entity_id": "sun.sun", "state": "above_horizon", "attributes": {}},
]

HALL_LIGHT = {"id": "hall_light_1", "alias": "Hall light", "triggers": [{"trigger": "state", "entity_id": "binary_sensor.hall_motion"}],
              "actions": [{"action": "light.turn_on", "target": {"entity_id": "light.hall"}}]}


def responses(**overrides) -> dict:
    base = {
        "get_config": {"version": "2026.9.2"},
        "config/entity_registry/list": REGISTRY,
        "/api/states": STATES,
        "automation/config": lambda f: {"config": HALL_LIGHT},
        "script/config": lambda f: {"config": {"sequence": [{"action": "light.turn_off"}]}},
        "get_panels": {
            "lovelace": {"component_name": "lovelace", "url_path": "lovelace", "title": None, "icon": None,
                         "require_admin": False},
            "dashboard-ramka": {"component_name": "lovelace", "url_path": "dashboard-ramka", "title": "Ramka",
                                "icon": "mdi:tablet", "require_admin": False},
            "config": {"component_name": "config", "url_path": "config", "title": None, "icon": None,
                       "require_admin": True},
        },
        "lovelace/config": lambda f: {"views": [{"title": f.get("url_path") or "Home", "cards": []}]},
        "lovelace/resources": [
            {"id": "r1", "type": "module", "url": "/local/domosenso/ramka/0.1.1/cards/agenda-card.js"},
            {"id": "r2", "type": "module", "url": "/local/radar-card.js?v=1a2b3c4d"},
        ],
        "config_entries/get": [{"entry_id": "e1", "domain": "hue", "title": "Hue Bridge", "state": "loaded"}],
        "system_log/list": [
            {"name": "homeassistant.components.template", "message": ["Template error"], "level": "ERROR",
             "source": ["helpers/template.py", 1], "timestamp": 1761000000.0, "count": 1},
            {"name": "homeassistant.components.hue", "message": ["Slow"], "level": "WARNING",
             "source": ["hue.py", 1], "timestamp": 1761000000.0, "count": 1},
        ],
    }
    base.update(overrides)
    return base


def snap(**overrides) -> dict:
    return asyncio.run(take(FakeHA(responses(**overrides))))


def test_integration_entities_not_from_files():
    entities = snap()["entities"]
    assert entities["sensor.living_room_temperature"]["from_files"] is False
    assert entities["sensor.office_comfort"]["from_files"] is True
    assert entities["sensor.kitchen_power"]["from_files"] is True  # mqtt is a file platform despite its entry
    assert entities["script.good_night"]["from_files"] is True  # no registry entry
    assert entities["sensor.office_comfort"]["state_class"] == "unknown"
    assert entities["sensor.kitchen_power"]["state_class"] == "unavailable"
    assert entities["sensor.living_room_temperature"] == {
        "platform": "hue", "unique_id": "hue-1", "state_class": "available", "from_files": False,
    }
    assert entities["sun.sun"]["platform"] == "sun" and entities["sun.sun"]["unique_id"] is None


def test_automation_config_hashed():
    ha = FakeHA(responses())
    result = asyncio.run(take(ha))
    assert result["automations"]["automation.hall_light"] == {
        "id": "hall_light_1", "state": "on", "loaded": True, "config_sha256": canonical_sha(HALL_LIGHT),
        "last_triggered": "2026-10-21T06:00:00+00:00",
    }
    assert ("automation/config", {"entity_id": "automation.hall_light"}) in ha.calls
    assert result["scripts"]["script.good_night"]["id"] == "good_night"


def test_unloaded_automation_has_no_config_hash():
    states = [s for s in STATES if s["entity_id"] != "automation.hall_light"]
    states.append({"entity_id": "automation.hall_light", "state": "unavailable", "attributes": {"restored": True}})

    def missing(fields):
        raise DomosensoError("automation/config: not_found Entity not found")

    result = snap(**{"/api/states": states, "automation/config": missing})
    assert result["automations"]["automation.hall_light"]["loaded"] is False
    assert result["automations"]["automation.hall_light"]["config_sha256"] is None


def test_helper_attributes_kept():
    helpers = snap()["helpers"]
    assert helpers["input_select.house_mode"] == {"options": ["home", "away", "night"]}


def test_dashboard_hash_ignores_key_order():
    one = snap(**{"lovelace/config": lambda f: {"title": "A", "views": [{"path": "x", "cards": []}]}})
    two = snap(**{"lovelace/config": lambda f: {"views": [{"cards": [], "path": "x"}], "title": "A"}})
    assert one["dashboards"] == two["dashboards"]
    assert set(one["dashboards"]) == {"lovelace", "dashboard-ramka"}
    assert one["dashboards"]["dashboard-ramka"]["title"] == "Ramka"
    assert canonical_sha({"b": 1, "a": [1, 2]}) == canonical_sha({"a": [1, 2], "b": 1})


def test_default_dashboard_read_without_url_path():
    ha = FakeHA(responses())
    asyncio.run(take(ha))
    lovelace_calls = [fields for key, fields in ha.calls if key == "lovelace/config"]
    assert {"force": False} in lovelace_calls
    assert {"url_path": "dashboard-ramka", "force": False} in lovelace_calls


def test_dashboard_without_config_recorded_as_none():
    def config(fields):
        if fields.get("url_path") is None:
            raise DomosensoError("lovelace/config: config_not_found No config found.")
        return {"views": []}

    assert snap(**{"lovelace/config": config})["dashboards"]["lovelace"]["config_sha256"] is None


def test_resources_without_query():
    assert snap()["resources"] == [
        {"url_no_query": "/local/domosenso/ramka/0.1.1/cards/agenda-card.js", "type": "module"},
        {"url_no_query": "/local/radar-card.js", "type": "module"},
    ]


def test_errors_and_config_entries():
    result = snap()
    assert [e["name"] for e in result["errors"]] == ["homeassistant.components.template"]
    assert result["config_entries"] == [{"domain": "hue", "title": "Hue Bridge", "state": "loaded"}]
    assert result["ha_version"] == "2026.9.2"


def test_snapshot_validates_against_schema():
    schema = json.loads(SCHEMA.read_text())
    profiles = {"ramka": {"user_id": "u1", "language": "de"}}
    result = asyncio.run(take(FakeHA(responses()), profiles))
    assert list(Draft202012Validator(schema).iter_errors(result)) == []
    assert result["profiles"] == profiles
    json.dumps(result)  # serialisable as it is


def test_profile_language_forms():
    assert profile_language(None) is None
    assert profile_language(b"") is None
    doc = {"version": 1, "key": "frontend.user_data_u1", "data": {"language": {"language": "pl", "number_format": "language"}}}
    assert profile_language(json.dumps(doc).encode()) == "pl"
    assert profile_language(json.dumps({"data": {"language": "de"}}).encode()) == "de"
    assert profile_language(json.dumps({"data": {}}).encode()) is None


def test_kiosk_profiles_read_by_user_id():
    ha = FakeHA({"config/auth/list": [{"id": "u1", "username": "ramka", "name": "Ramka"},
                                      {"id": "u2", "username": "alex", "name": "Alex"}]})
    read = []

    def reader(rel):
        read.append(rel)
        return json.dumps({"data": {"language": {"language": "de"}}}).encode()

    assert asyncio.run(read_kiosk_profiles(ha, ["Ramka"], reader)) == {"Ramka": {"user_id": "u1", "language": "de"}}
    assert read == [".storage/frontend.user_data_u1"]


def test_kiosk_user_unknown_fails():
    ha = FakeHA({"config/auth/list": []})
    with pytest.raises(DomosensoError, match="kiosk user ramka"):
        asyncio.run(read_kiosk_profiles(ha, ["ramka"], lambda rel: None))


def write_home(tmp_path: Path, kind: str = "local-docker") -> Path:
    token = tmp_path / "token"
    token.write_text("t\n")
    extra = "host: ha@nas\n    " if kind == "ssh-docker" else ""
    (tmp_path / "domosenso.yaml").write_text(
        "catalog: ../catalog\nconfig_dir: home-assistant\nesphome_dir: esphome\n"
        f"targets:\n  staging:\n    kind: {kind}\n    {extra}container: ha-staging\n    config: staging/config\n"
        f"    url: http://127.0.0.1:8124\n    token_file: {token}\n"
        "components: {}\nkiosk_users: [ramka]\n"
    )
    return tmp_path


def test_command_writes_snapshot(tmp_path, monkeypatch, capsys):
    home = write_home(tmp_path)
    ha = FakeHA(responses())
    monkeypatch.setattr(snapshot.HA, "for_target", classmethod(lambda cls, t: ha))
    out = tmp_path / "s.json"
    assert cli.main(["--home", str(home), "snapshot", "staging", "--out", str(out)]) == 0
    written = json.loads(out.read_text())
    assert written["profiles"] == {}  # kiosk profiles are read on ssh-docker targets only
    assert "automation.hall_light" in written["automations"]
    lines = capsys.readouterr().out.splitlines()
    assert lines[-1] == "ok"
    assert f"wrote {out}" in lines


def test_command_reads_kiosk_profiles_on_ssh_target(tmp_path, monkeypatch, capsys):
    home = write_home(tmp_path, "ssh-docker")
    ha = FakeHA(responses(**{"config/auth/list": [{"id": "u1", "username": "ramka", "name": "Ramka"}]}))
    monkeypatch.setattr(snapshot.HA, "for_target", classmethod(lambda cls, t: ha))
    remote = FakeTarget(tmp_path / "remote")
    remote.put({".storage/frontend.user_data_u1": json.dumps({"data": {"language": {"language": "pl"}}}).encode()})
    seen = []
    monkeypatch.setattr(snapshot, "open_target", lambda t: seen.append(t.host) or remote)
    out = tmp_path / "s.json"
    assert cli.main(["--home", str(home), "snapshot", "staging", "--out", str(out)]) == 0
    assert json.loads(out.read_text())["profiles"] == {"ramka": {"user_id": "u1", "language": "pl"}}
    assert seen == ["ha@nas"]


def test_command_unknown_target(tmp_path, capsys):
    home = write_home(tmp_path)
    assert cli.main(["--home", str(home), "snapshot", "production", "--out", str(tmp_path / "s.json")]) == 1
    assert capsys.readouterr().out.splitlines()[-1] == "FAIL unknown target production (declared: staging)"
