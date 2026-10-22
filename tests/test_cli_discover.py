"""`domosenso discover`: what a running Home Assistant discovered and has set up (SPEC-011 section 4)."""
import json
import subprocess
from pathlib import Path

import pytest
import yaml

from domosenso_cli import main as cli


def git(repo: Path, *args: str) -> str:
    done = subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@localhost", "-C", str(repo), *args],
        capture_output=True, text=True, check=True,
    )
    return done.stdout.strip()


def flow(handler, source, **placeholders):
    return {"flow_id": f"f-{handler}-{source}", "handler": handler, "step_id": "discovery_confirm",
            "context": {"source": source, "title_placeholders": placeholders}}


# Home Assistant leaves `user` and `reconfigure` flows out of this list itself (verified on
# 2026.9.2), so the fake returns only discoveries.
FLOWS = [
    flow("esphome", "zeroconf", name="Hall radar"),
    flow("esphome", "dhcp", name="Kitchen node"),
    flow("cast", "zeroconf", name="Kids' room speaker", host="10.0.0.9"),
    flow("hue", "ssdp", host="10.0.0.2"),
]
ENTRIES = [
    {"entry_id": "e1", "domain": "tplink", "source": "dhcp", "state": "loaded", "disabled_by": None, "title": "Tapo hub"},
    {"entry_id": "e2", "domain": "mobile_app", "source": "registration", "state": "loaded", "disabled_by": None,
     "title": "Dining tablet"},
    {"entry_id": "e3", "domain": "mobile_app", "source": "registration", "state": "loaded", "disabled_by": None,
     "title": "Alex's phone"},
    {"entry_id": "e4", "domain": "dlna_dmr", "source": "ignore", "state": "not_loaded", "disabled_by": None,
     "title": "Living room speaker"},
    {"entry_id": "e5", "domain": "met", "source": "user", "state": "setup_retry", "disabled_by": None, "title": "Home"},
    {"entry_id": "e6", "domain": "sonos", "source": "user", "state": "setup_error", "disabled_by": "user", "title": "Sonos"},
]
MANIFESTS = {
    "esphome": {"domain": "esphome", "name": "ESPHome", "integration_type": "device", "iot_class": "local_push",
                "config_flow": True, "documentation": "https://www.home-assistant.io/integrations/esphome"},
    "cast": {"domain": "cast", "name": "Google Cast", "iot_class": "local_polling", "config_flow": True},
    "hue": {"domain": "hue", "name": "Philips Hue", "integration_type": "hub", "iot_class": "local_push",
            "config_flow": True},
    "workday": {"domain": "workday", "name": "Workday", "integration_type": "service", "iot_class": "calculated",
                "config_flow": True},
}


def manifest_get(fields):
    from domosenso_cli.errors import DomosensoError

    if fields["integration"] not in MANIFESTS:
        raise DomosensoError("manifest/get: not_found Integration not found")
    return MANIFESTS[fields["integration"]]


@pytest.fixture
def ha(monkeypatch):
    from domosenso_cli import recommend
    from fakes import FakeHA

    fake = FakeHA({"config_entries/flow/progress": FLOWS, "config_entries/get": ENTRIES, "manifest/get": manifest_get})
    fake.opened = []

    class StubHA:
        def __new__(cls, url, token, token_source=None):
            fake.opened.append(("url", url, token))
            return fake

        @classmethod
        def for_target(cls, target):
            fake.opened.append(("target", target.name))
            return fake

    monkeypatch.setattr(recommend, "HA", StubHA)
    return fake


@pytest.fixture
def token(tmp_path):
    path = tmp_path / "token"
    path.write_text("secret-token\n")
    return path


def run(capsys, *argv: str) -> tuple[int, list[str]]:
    code = cli.main(list(argv))
    return code, capsys.readouterr().out.splitlines()


def test_lines(tmp_path, capsys, ha, token):
    code, lines = run(capsys, "--home", str(tmp_path), "discover", "--from-ha", "http://ha.local:8123",
                      "--token-file", str(token), "--domain", "workday", "nosuch", "esphome")
    assert code == 0, lines
    assert ha.opened == [("url", "http://ha.local:8123", "secret-token")]
    assert lines == [
        "discovered cast 1 via zeroconf",
        "discovered esphome 2 via dhcp,zeroconf",
        "discovered hue 1 via ssdp",
        "ignored dlna_dmr 1",
        "configured met 1",
        "configured mobile_app 2",
        "configured sonos 1",
        "configured tplink 1",
        "failing met 1 setup_retry",
        "failing sonos 1 setup_error",
        "integration esphome local_push device config-flow yes",
        "absent nosuch",
        "integration workday calculated service config-flow yes",
        "ok",
    ]
    # Names and addresses never reach a text line.
    text = "\n".join(lines)
    for secret in ("Hall radar", "10.0.0", "Dining tablet", "Tapo hub", "secret-token"):
        assert secret not in text
    # Manifests are read for the discovered domains and the ones asked about, nothing else.
    asked = sorted(f["integration"] for key, f in ha.calls if key == "manifest/get")
    assert asked == ["cast", "esphome", "hue", "nosuch", "workday"]
    assert not [key for key, _ in ha.calls if not key.startswith(("config_entries/", "manifest/"))]


def test_json(tmp_path, capsys, ha, token):
    code = cli.main(["--home", str(tmp_path), "discover", "--json", "--from-ha", "http://ha.local:8123",
                     "--token-file", str(token), "--domain", "nosuch"])
    doc = json.loads(capsys.readouterr().out)
    assert code == 0 and doc["result"] == "ok"
    data = doc["data"]
    assert data["flows"][2] == {"handler": "cast", "source": "zeroconf", "step_id": "discovery_confirm",
                                "title_placeholders": {"name": "Kids' room speaker", "host": "10.0.0.9"}}
    assert data["entries"][3] == {"domain": "dlna_dmr", "source": "ignore", "state": "not_loaded",
                                  "disabled_by": None, "title": "Living room speaker"}
    assert data["manifests"]["cast"] == {"name": "Google Cast", "integration_type": "hub", "iot_class": "local_polling",
                                         "config_flow": True, "documentation": None}
    assert data["manifests"]["nosuch"] is None


def test_catalog_links(tmp_path, capsys, ha, token):
    repo = tmp_path / "catalog"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    for cid, integrations in (("ramka", ["mobile_app", "template"]), ("lights", ["hue"]), ("media", ["cast", "hue"])):
        path = repo / "components" / cid / "component.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(yaml.safe_dump({"id": cid, "version": "0.1.0",
                                        "integrations": [{"name": n, "source": "core"} for n in integrations]}))
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", cid)
        git(repo, "tag", "-a", f"{cid}/0.1.0", "-m", cid)
    code, lines = run(capsys, "--home", str(tmp_path / "nohome"), "discover", "--from-ha", "http://ha.local:8123",
                      "--token-file", str(token), "--catalog", str(repo))
    assert code == 0, lines
    assert [line for line in lines if line.startswith("catalog ")] == [
        "catalog cast media",
        "catalog hue lights,media",
        "catalog mobile_app ramka",
    ]
    assert not (tmp_path / "nohome").exists()


def test_target_from_the_home(tmp_path, capsys, ha, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    (home / "token").write_text("t")
    (home / "domosenso.yaml").write_text(yaml.safe_dump({
        "catalog": str(tmp_path / "nocatalog"), "config_dir": "home-assistant", "esphome_dir": "esphome",
        "targets": {"production": {"kind": "ssh-docker", "host": "u@h", "container": "ha", "config": "/c",
                                   "url": "http://ha.local:8123", "token_file": str(home / "token")}},
        "components": {}}))
    from domosenso_cli import discover

    linked = []
    monkeypatch.setattr(discover, "catalog_integrations", lambda catalog: linked.append(catalog) or {})
    code, lines = run(capsys, "--home", str(home), "discover", "--from-ha", "production")
    assert code == 0, lines
    assert ha.opened == [("target", "production")]
    assert len(linked) == 1  # the home's catalog is linked by default


def test_needs_from_ha_and_a_token_file(tmp_path, capsys, ha, token):
    code, lines = run(capsys, "--home", str(tmp_path), "discover")
    assert code == 1 and lines[-1] == "FAIL discover needs --from-ha <target or URL>"
    code, lines = run(capsys, "--home", str(tmp_path), "discover", "--from-ha", "http://ha.local:8123")
    assert code == 1 and lines[-1] == "FAIL --from-ha with a URL needs --token-file"


def test_home_assistant_failure_fails(tmp_path, capsys, ha, token):
    del ha.responses["config_entries/flow/progress"]
    code, lines = run(capsys, "--home", str(tmp_path), "discover", "--from-ha", "http://ha.local:8123",
                      "--token-file", str(token))
    assert code == 1
    assert lines[-1].startswith("FAIL config_entries/flow/progress")


def test_other_manifest_errors_fail(tmp_path, capsys, ha, token):
    from domosenso_cli.errors import DomosensoError

    def broken(fields):
        raise DomosensoError("manifest/get: unauthorized")

    ha.responses["manifest/get"] = broken
    code, lines = run(capsys, "--home", str(tmp_path), "discover", "--from-ha", "http://ha.local:8123",
                      "--token-file", str(token), "--domain", "esphome")
    assert code == 1 and lines[-1] == "FAIL manifest/get: unauthorized"
