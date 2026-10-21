"""`domosenso verify`: a running home checked against a baseline snapshot and its silent automations."""
import asyncio
import copy
import json
from datetime import datetime, timezone
from pathlib import Path

from domosenso_cli import main as cli
from domosenso_cli import verify as verify_cmd
from domosenso_cli.home import HomeConfig
from domosenso_cli.snapshot import take
from domosenso_cli.verify import verify
from fakes import FakeHA

NOW = datetime(2026, 10, 22, 7, 0, tzinfo=timezone.utc)
CARD = "/local/domosenso/ramka/0.1.1/cards/agenda-card.js"


def states() -> list[dict]:
    return [
        {"entity_id": "automation.hall_light", "state": "on",
         "attributes": {"id": "hall_light_1", "last_triggered": "2026-10-22T05:00:00+00:00"},
         "last_updated": "2026-10-22T05:00:00+00:00"},
        {"entity_id": "automation.nightly_backup", "state": "on",
         "attributes": {"id": "nightly_backup", "last_triggered": "2026-10-20T02:00:00+00:00"},
         "last_updated": "2026-10-20T02:00:00+00:00"},
        {"entity_id": "script.good_night", "state": "off", "attributes": {}, "last_updated": "2026-10-21T20:00:00+00:00"},
        {"entity_id": "sensor.office_comfort", "state": "comfortable", "attributes": {},
         "last_updated": "2026-10-22T06:55:00+00:00"},
        {"entity_id": "sensor.wind_speed", "state": "12", "attributes": {}, "last_updated": "2026-10-22T06:00:00+00:00"},
        {"entity_id": "sensor.backup_last_success", "state": "2026-10-22T03:00:00+00:00", "attributes": {},
         "last_updated": "2026-10-22T03:00:01+00:00"},
        {"entity_id": "sensor.kitchen_power", "state": "unavailable", "attributes": {},
         "last_updated": "2026-10-22T06:00:00+00:00"},
    ]


def responses(state_list: list[dict] | None = None, **overrides) -> dict:
    base = {
        "get_config": {"version": "2026.9.2"},
        "config/entity_registry/list": [],
        "/api/states": state_list if state_list is not None else states(),
        "automation/config": lambda f: {"config": {"id": f["entity_id"]}},
        "script/config": lambda f: {"config": {"sequence": []}},
        "get_panels": {},
        "lovelace/resources": [
            {"id": "r1", "type": "module", "url": CARD},
            {"id": "r2", "type": "module", "url": "/local/radar-card.js?v=1a2b3c4d"},
        ],
        "config_entries/get": [],
        "system_log/list": [],
    }
    base.update(overrides)
    return base


def make_home(tmp_path: Path, equivalence: str | None = None, silent: str | None = None,
              configuration: str | None = None) -> HomeConfig:
    (tmp_path / "domosenso").mkdir(exist_ok=True)
    if equivalence is not None:
        (tmp_path / "domosenso" / "equivalence.yaml").write_text(equivalence)
    if silent is not None:
        (tmp_path / "domosenso" / "silent.yaml").write_text(silent)
    config_dir = tmp_path / "home-assistant"
    config_dir.mkdir(exist_ok=True)
    if configuration is not None:
        (config_dir / "configuration.yaml").write_text(configuration)
    return HomeConfig(root=tmp_path, catalog="c", config_dir=config_dir, esphome_dir=tmp_path / "esphome",
                      targets={}, components={})


BASELINE = asyncio.run(take(FakeHA(responses())))


def run_verify(tmp_path, ha: FakeHA, *, day_after=False, profiles=None, baseline=None, **home_files):
    home = make_home(tmp_path, **home_files)
    return asyncio.run(verify(ha, baseline or BASELINE, home, day_after, kiosk_profiles=profiles, now=NOW))


def kinds(diffs) -> list[tuple[str, str, str]]:
    return [(d.part, d.id, d.kind) for d in diffs]


def test_all_good_passes(tmp_path):
    ha = FakeHA(responses())
    assert run_verify(tmp_path, ha) == []
    assert ("http_status", {"path": CARD}) in ha.calls
    assert ("http_status", {"path": "/local/radar-card.js"}) in ha.calls


def test_newly_unavailable_fails(tmp_path):
    now = states()
    now[3]["state"] = "unavailable"
    del now[4]
    assert kinds(run_verify(tmp_path, FakeHA(responses(now)))) == [
        ("entities", "sensor.office_comfort", "newly-unavailable"),
        ("entities", "sensor.wind_speed", "newly-unavailable"),
    ]


def test_unavailable_in_baseline_not_reported(tmp_path):
    # sensor.kitchen_power was unavailable in the baseline already
    assert run_verify(tmp_path, FakeHA(responses())) == []


def test_after_restart_unknown_allowed(tmp_path):
    now = states()
    now[4]["state"] = "unknown"
    equivalence = "entries:\n  - {part: entities, id: sensor.wind_speed, after_restart: unknown, reason: next report}\n"
    assert run_verify(tmp_path, FakeHA(responses(now)), equivalence=equivalence) == []
    now[4]["state"] = "unavailable"
    assert kinds(run_verify(tmp_path, FakeHA(responses(now)), equivalence=equivalence)) == [
        ("entities", "sensor.wind_speed", "newly-unavailable"),
    ]


def test_automation_turned_off_fails(tmp_path):
    now = states()
    now[0]["state"] = "off"
    [d] = run_verify(tmp_path, FakeHA(responses(now)))
    assert (d.part, d.id, d.kind, d.detail) == ("automations", "automation.hall_light", "state-changed", "on → off")


def test_automation_not_loaded_fails(tmp_path):
    now = states()
    now[0]["state"] = "unavailable"
    del now[2]
    assert kinds(run_verify(tmp_path, FakeHA(responses(now)))) == [
        ("automations", "automation.hall_light", "not-loaded"),
        ("scripts", "script.good_night", "not-loaded"),
    ]


def test_log_error_fails(tmp_path):
    log = [
        {"name": "homeassistant.components.template.sensor", "message": ["TemplateError: x"], "level": "ERROR",
         "source": ["x.py", 1], "timestamp": 1.0, "count": 1},
        {"name": "homeassistant.components.hue", "message": ["Bridge unreachable"], "level": "ERROR",
         "source": ["hue.py", 1], "timestamp": 1.0, "count": 3},
        {"name": "homeassistant.config", "message": ["warning only"], "level": "WARNING",
         "source": ["c.py", 1], "timestamp": 1.0, "count": 1},
    ]
    [d] = run_verify(tmp_path, FakeHA(responses(**{"system_log/list": log})))
    assert (d.part, d.id, d.kind) == ("log", "homeassistant.components.template.sensor", "log-error")
    assert d.detail == "TemplateError: x"


def test_resource_404_fails(tmp_path):
    ha = FakeHA(responses(), http_statuses={CARD: 404})
    [d] = run_verify(tmp_path, ha)
    assert (d.part, d.id, d.kind, d.detail) == ("resources", CARD, "resource-missing", "HTTP 404")


def test_resource_duplicate_fails(tmp_path):
    resources = [
        {"id": "r1", "type": "module", "url": CARD},
        {"id": "r3", "type": "module", "url": "/local/agenda-card.js?v=6"},
        {"id": "r4", "type": "module", "url": "https://cdn.example/card.js"},
    ]
    ha = FakeHA(responses(**{"lovelace/resources": resources}))
    [d] = run_verify(tmp_path, ha)
    assert (d.part, d.id, d.kind) == ("resources", "agenda-card.js", "resource-duplicate")
    assert ("http_status", {"path": "https://cdn.example/card.js"}) not in ha.calls


CONFIGURATION = """\
homeassistant:
  packages: !include_dir_named packages
lovelace:
  dashboards:
    dashboard-ramka:
      mode: yaml
      filename: dashboards/ramka.de.yaml
      title: Ramka
"""


def test_profile_language_mismatch_fails(tmp_path):
    ha = FakeHA(responses())
    assert run_verify(tmp_path, ha, profiles={"ramka": {"user_id": "u1", "language": "de"}},
                      configuration=CONFIGURATION) == []
    [d] = run_verify(tmp_path, FakeHA(responses()), profiles={"ramka": {"user_id": "u1", "language": "pl"}},
                     configuration=CONFIGURATION)
    assert (d.part, d.id, d.kind) == ("profiles", "ramka", "profile-language")
    assert "pl" in d.detail and "dashboards/ramka.de.yaml" in d.detail


def test_profile_without_language_fails(tmp_path):
    [d] = run_verify(tmp_path, FakeHA(responses()), profiles={"ramka": {"user_id": "u1", "language": None}},
                     configuration=CONFIGURATION)
    assert d.kind == "profile-language" and "no language" in d.detail


SILENT = """\
entries:
  - entity: automation.nightly_backup
    checks:
      - loaded_on
      - triggered_within: 30
      - entity_fresh: {entity: sensor.backup_last_success, max_age: 26}
"""


def test_loaded_on_checked_right_after_restart(tmp_path):
    now = states()
    now[1]["state"] = "off"
    baseline = copy.deepcopy(BASELINE)
    baseline["automations"]["automation.nightly_backup"]["state"] = "off"  # off already: no state-changed
    [d] = run_verify(tmp_path, FakeHA(responses(now)), silent=SILENT, baseline=baseline)
    assert (d.part, d.id, d.kind) == ("silent", "automation.nightly_backup", "silent-failed")
    assert d.detail.startswith("loaded_on")


def test_triggered_within_only_day_after(tmp_path):
    # last triggered 2026-10-20 02:00, 53 h before NOW: fine right after a restart, failed the day after
    assert run_verify(tmp_path, FakeHA(responses()), silent=SILENT) == []
    [d] = run_verify(tmp_path, FakeHA(responses()), silent=SILENT, day_after=True)
    assert (d.id, d.kind) == ("automation.nightly_backup", "silent-failed")
    assert d.detail.startswith("triggered_within 30 h")


def test_entity_fresh_too_old_fails(tmp_path):
    now = states()
    now[1]["attributes"]["last_triggered"] = "2026-10-22T02:00:00+00:00"
    assert run_verify(tmp_path, FakeHA(responses(now)), silent=SILENT, day_after=True) == []
    now[5]["state"] = "2026-10-20T03:00:00+00:00"  # the sensor's value is the backup's time: 52 h old
    [d] = run_verify(tmp_path, FakeHA(responses(now)), silent=SILENT, day_after=True)
    assert d.detail.startswith("entity_fresh sensor.backup_last_success")
    now[5]["state"] = "done"  # not a time: its last update is used, 4 h ago
    now[5]["last_updated"] = "2026-10-22T03:00:00+00:00"
    assert run_verify(tmp_path, FakeHA(responses(now)), silent=SILENT, day_after=True) == []


def write_home(tmp_path: Path) -> Path:
    token = tmp_path / "token"
    token.write_text("t\n")
    (tmp_path / "domosenso.yaml").write_text(
        "catalog: ../catalog\nconfig_dir: home-assistant\nesphome_dir: esphome\n"
        "targets:\n  staging:\n    kind: local-docker\n    container: ha-staging\n    config: staging/config\n"
        f"    url: http://127.0.0.1:8124\n    token_file: {token}\n"
        "components: {}\n"
    )
    return tmp_path


def test_command_verified(tmp_path, monkeypatch, capsys):
    home = write_home(tmp_path)
    monkeypatch.setattr(verify_cmd.HA, "for_target", classmethod(lambda cls, t: FakeHA(responses())))
    baseline = tmp_path / "base.json"
    baseline.write_text(json.dumps(BASELINE))
    assert cli.main(["--home", str(home), "verify", "staging", "--baseline", str(baseline)]) == 0
    lines = capsys.readouterr().out.splitlines()
    assert "ok automations (2)" in lines
    assert lines[-2:] == ["verified", "ok"]


def test_command_not_verified(tmp_path, monkeypatch, capsys):
    home = write_home(tmp_path)
    now = states()
    now[0]["state"] = "off"
    monkeypatch.setattr(verify_cmd.HA, "for_target", classmethod(lambda cls, t: FakeHA(responses(now))))
    baseline = tmp_path / "base.json"
    baseline.write_text(json.dumps(BASELINE))
    assert cli.main(["--home", str(home), "verify", "staging", "--baseline", str(baseline)]) == 1
    lines = capsys.readouterr().out.splitlines()
    assert "FAIL automations: 1 differences" in lines
    assert "state-changed automations automation.hall_light on → off" in lines
    assert lines[-1] == "FAIL not verified: 1 failed"


def test_bad_silent_file_names_the_key(tmp_path):
    import pytest

    from domosenso_cli.errors import DomosensoError

    silent = "entries:\n  - entity: automation.nightly_backup\n    checks: [{triggered_within: -1}]\n"
    with pytest.raises(DomosensoError, match=r"silent\.yaml: entries\.0\.checks\.0"):
        run_verify(tmp_path, FakeHA(responses()), silent=silent)


def test_after_restart_entity_unknown_in_baseline_passes(tmp_path):
    """A stream sensor that had no value when the baseline was taken is not reported either way."""
    base_states = states()
    base_states.append({"entity_id": "sensor.amp_codec", "state": "unknown", "attributes": {},
                        "last_updated": "2026-10-21T20:00:00+00:00"})
    baseline = asyncio.run(take(FakeHA(responses(base_states))))
    equivalence = "entries:\n  - {part: entities, id: sensor.amp_codec, after_restart: unknown, reason: stream}\n"
    for now_state in ("unknown", "unavailable"):
        now = states()
        now.append({"entity_id": "sensor.amp_codec", "state": now_state, "attributes": {},
                    "last_updated": "2026-10-22T06:00:00+00:00"})
        assert run_verify(tmp_path, FakeHA(responses(now)), baseline=baseline, equivalence=equivalence) == []
