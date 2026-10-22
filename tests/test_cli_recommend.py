"""`domosenso recommend`: which components a home's devices satisfy, read from the catalog's tags (SPEC-009)."""
import json
import subprocess
from pathlib import Path

import pytest
import yaml

from domosenso_cli import main as cli

RADAR = {"kind": "mmwave-radar", "recommend": ["hlk-ld2410c"]}


def git(repo: Path, *args: str) -> str:
    done = subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@localhost", "-C", str(repo), *args],
        capture_output=True, text=True, check=True,
    )
    return done.stdout.strip()


def manifest(cid: str, version: str, requires=(), optional=(), homes=1, artifacts=None) -> dict:
    data = {
        "id": cid, "version": version,
        "devices": {"requires": list(requires), **({"optional": list(optional)} if optional else {})},
        "artifacts": artifacts if artifacts is not None else {"templates": ["templates/package.yaml.j2"]},
        "tested": {"ha": ["2026.9.2"], **({"homes": homes} if homes is not None else {})},
    }
    return data


def release(repo: Path, data: dict, *, tag: bool = True) -> None:
    path = repo / "components" / data["id"] / "component.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data))
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", f"{data['id']} {data['version']}")
    if tag:
        name = f"{data['id']}/{data['version']}"
        git(repo, "tag", "-a", name, "-m", name)


@pytest.fixture
def catalog(tmp_path):
    repo = tmp_path / "catalog"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    release(repo, manifest("backup", "0.1.0"))
    release(repo, manifest("climate-air", "0.2.0",
                           requires=[{"kind": "temperature-humidity-sensor", "recommend": ["tapo-t315"]}],
                           optional=[{"kind": "air-quality-sensor", "recommend": ["ruuvi-air"], "feature": "air"},
                                     {"kind": "ble-proxy", "feature": "air"}]))
    release(repo, manifest("ramka", "0.1.0", requires=[{"kind": "android-tablet"}], homes=None))
    release(repo, manifest("ramka", "0.1.1", requires=[{"kind": "android-tablet"}, RADAR],
                           optional=[{"kind": "mains-meter"}], homes=None))
    release(repo, manifest("media", "0.1.0", requires=[{"kind": "network-audio-player", "recommend": ["hegel-h400"]}],
                           artifacts={"ha_packages": [], "services": []}))
    # A working-tree change with no tag is never read.
    release(repo, manifest("ramka", "0.2.0", homes=5), tag=False)
    return repo


def run(capsys, *argv: str) -> tuple[int, list[str]]:
    code = cli.main(list(argv))
    return code, capsys.readouterr().out.splitlines()


def test_lines_for_the_first_outside_home(catalog, tmp_path, capsys):
    code, lines = run(capsys, "--home", str(tmp_path / "nohome"), "recommend", "--catalog", str(catalog),
                      "--have", "tapo-t315", "network-audio-player")
    assert code == 0
    assert lines == [
        "fits backup@0.1.0 tested-homes 1",
        "fits climate-air@0.2.0 tested-homes 1",
        "optional climate-air@0.2.0 air air-quality-sensor lacks ruuvi-air",
        "optional climate-air@0.2.0 air ble-proxy lacks",
        "describes media@0.1.0",
        "missing ramka@0.1.1 tested-homes unknown needs 2",
        "needs ramka@0.1.1 android-tablet",
        "needs ramka@0.1.1 mmwave-radar hlk-ld2410c",
        "optional ramka@0.1.1 - mains-meter lacks",
        "ok",
    ]


def test_kind_or_device_id_satisfies(catalog, tmp_path, capsys):
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--have", "android-tablet", "hlk-ld2410c", "temperature-humidity-sensor", "ble-proxy")
    assert code == 0
    assert "fits ramka@0.1.1 tested-homes unknown" in lines
    assert "fits climate-air@0.2.0 tested-homes 1" in lines
    assert "optional climate-air@0.2.0 air ble-proxy have" in lines
    assert not [line for line in lines if line.startswith(("needs", "missing", "unknown"))]


def test_unknown_token_is_a_line_not_a_failure(catalog, tmp_path, capsys):
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--have", "tapo-t31", "ruuvi-air")
    assert code == 0
    assert "unknown tapo-t31 did-you-mean tapo-t315" in lines
    assert "unknown ruuvi-air" not in lines  # named by an optional device


def test_unknown_token_suggests_by_vendor_prefix(catalog, tmp_path, capsys):
    # A kind-like guess ("a Tapo sensor") points at the catalog's Tapo device id.
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--have", "tapo-sensor")
    assert code == 0
    [line] = [line for line in lines if line.startswith("unknown tapo-sensor")]
    assert line.split("did-you-mean ")[1].split(",")[0] == "tapo-t315"  # the vendor's id comes first


def test_unknown_token_without_a_near_match(catalog, tmp_path, capsys):
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--have", "zzz")
    assert "unknown zzz" in lines


def test_catalog_from_the_home(catalog, tmp_path, capsys):
    home = tmp_path / "home"
    home.mkdir()
    (home / "domosenso.yaml").write_text(
        f"catalog: {catalog}\nconfig_dir: home-assistant\nesphome_dir: esphome\ntargets: {{}}\ncomponents: {{}}\n")
    code, lines = run(capsys, "--home", str(home), "recommend")
    assert code == 0
    assert lines[0] == "fits backup@0.1.0 tested-homes 1"
    assert sorted(p.name for p in home.iterdir()) == ["domosenso.yaml"]  # writes nothing for a local catalog


def test_no_catalog_fails(tmp_path, capsys):
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--have", "x")
    assert code == 1
    assert lines[-1].startswith("FAIL ")
    assert "--catalog" in lines[-1]


def test_not_a_repository_fails(tmp_path, capsys):
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(tmp_path))
    assert code == 1
    assert lines[-1].startswith("FAIL ")


def test_json_data(catalog, tmp_path, capsys):
    code = cli.main(["--home", str(tmp_path), "recommend", "--json", "--catalog", str(catalog), "--have", "tapo-t315"])
    doc = json.loads(capsys.readouterr().out)
    assert code == 0 and doc["result"] == "ok"
    by_id = {c["id"]: c for c in doc["data"]}
    assert sorted(by_id) == ["backup", "climate-air", "media", "ramka"]
    assert by_id["climate-air"] == {
        "id": "climate-air", "version": "0.2.0", "fits": True, "describes": False, "tested_homes": 1,
        "needs": [],
        "optional": [
            {"feature": "air", "kind": "air-quality-sensor", "have": False, "recommend": ["ruuvi-air"]},
            {"feature": "air", "kind": "ble-proxy", "have": False, "recommend": []},
        ],
    }
    assert by_id["ramka"]["tested_homes"] is None
    assert by_id["ramka"]["optional"] == [{"feature": None, "kind": "mains-meter", "have": False, "recommend": []}]
    assert by_id["ramka"]["needs"] == [{"kind": "android-tablet", "recommend": []},
                                      {"kind": "mmwave-radar", "recommend": ["hlk-ld2410c"]}]
    assert by_id["media"]["describes"] is True and by_id["media"]["fits"] is None


def test_url_catalog_without_a_home_leaves_no_cache(catalog, tmp_path, capsys, monkeypatch):
    work = tmp_path / "empty"
    work.mkdir()
    monkeypatch.setenv("TMPDIR", str(tmp_path / "tmp"))
    (tmp_path / "tmp").mkdir()
    code, lines = run(capsys, "--home", str(work), "recommend", "--catalog", f"file://{catalog}")
    assert code == 0, lines
    assert lines[0] == "fits backup@0.1.0 tested-homes 1"
    assert list(work.iterdir()) == []
    assert list((tmp_path / "tmp").iterdir()) == []


# --- `--from-ha` (SPEC-010): the hardware scan ---------------------------------------------------

DEVICE_RULES = {
    "tapo-t315": [{"integration": ["tplink", "tapo"], "model": "T315*"}],
    "hue-bridge": [{"integration": "hue", "model_id": "BSB00*"}],
    "hlk-ld2410c": [{"integration": "esphome", "entity_names": ["Still distance", "Detection distance"]}],
    "m5stack-atom-lite": [{"integration": "esphome", "model": "m5stack-atom*"}],
}
KIND_RULES = {
    "mqtt-broker": [{"entry": "mqtt"}],
    "temperature-humidity-sensor": [{"integration": ["tplink", "tapo"], "model": "T31*"},
                                    {"device_classes": ["temperature", "humidity"], "certainty": "maybe"}],
    "ble-proxy": [{"integration": "bluetooth", "manufacturer": "esphome"}],
    "android-tablet": [{"integration": "mobile_app", "unless_manufacturer": "apple", "certainty": "maybe"}],
    "esp32-board": [{"integration": "esphome", "with_integration": "bluetooth"}],
}


def add_rules(repo: Path, devices=DEVICE_RULES, kinds=KIND_RULES) -> str:
    for sub, rules in (("devices", devices), ("kinds", kinds)):
        (repo / sub).mkdir(exist_ok=True)
        for token, match in rules.items():
            path = repo / sub / f"{token}.yaml"
            path.write_text(yaml.safe_dump({"id": token, "match": match}))
    (repo / "devices" / "no-rules.yaml").write_text(yaml.safe_dump({"id": "no-rules"}))
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "match rules")
    return git(repo, "rev-parse", "--short", "HEAD")


ENTRIES = [
    {"entry_id": "e-tp", "domain": "tplink", "disabled_by": None},
    {"entry_id": "e-hue", "domain": "hue", "disabled_by": None},
    {"entry_id": "e-esp", "domain": "esphome", "disabled_by": None},
    {"entry_id": "e-bt", "domain": "bluetooth", "disabled_by": None},
    {"entry_id": "e-mq", "domain": "mqtt", "disabled_by": None},
    {"entry_id": "e-app1", "domain": "mobile_app", "disabled_by": None},
    {"entry_id": "e-app2", "domain": "mobile_app", "disabled_by": None},
    {"entry_id": "e-sonos", "domain": "sonos", "disabled_by": None},
    {"entry_id": "e-old", "domain": "mqtt", "disabled_by": "user"},
]


def device(id, entries, manufacturer=None, model=None, model_id=None, name=None, **extra):
    return {"id": id, "config_entries": entries, "manufacturer": manufacturer, "model": model,
            "model_id": model_id, "name": name, "name_by_user": None, "entry_type": None,
            "disabled_by": None, **extra}


DEVICES = [
    device("d-t1", ["e-tp"], "TP-Link", "T315", name="Living room sensor"),
    device("d-t2", ["e-tp"], "TP-Link", "t315", name="Kitchen sensor"),
    device("d-t3", ["e-tp"], "TP-Link", "T310", name="Office sensor"),
    device("d-hub", ["e-tp"], "TP-Link", "H200", name="Tapo hub"),
    device("d-bridge", ["e-hue"], "Signify Netherlands B.V.", "Hue Bridge", "BSB002", name="Hue Bridge"),
    device("d-radar", ["e-esp"], "Espressif", "m5stack-atom", name="Hall radar"),
    device("d-atom-bt", ["e-bt"], "esphome", "m5stack-atom", name="Hall radar (bluetooth)"),
    device("d-tablet", ["e-app1"], "TCL", "9469X", name="Dining tablet"),
    device("d-phone", ["e-app2"], "Apple", "iPhone17,1", name="Alex's phone"),
    device("d-speaker", ["e-sonos"], "Sonos", "One", "S18", name="Kids' room speaker"),
    device("d-svc", ["e-hue"], "Signify", "Hue service", entry_type="service"),
    device("d-off", ["e-tp"], "TP-Link", "T315", name="Old sensor", disabled_by="user"),
]
ENTITIES = [
    {"entity_id": "sensor.living_room_temperature", "device_id": "d-t1", "original_name": "Temperature"},
    {"entity_id": "sensor.hall_still_distance", "device_id": "d-radar", "original_name": "Still distance"},
    {"entity_id": "sensor.hall_detection_distance", "device_id": "d-radar", "original_name": "Detection distance"},
    {"entity_id": "sensor.kids_room_temperature", "device_id": "d-speaker", "original_name": "Temperature",
     "original_device_class": "temperature"},
    {"entity_id": "sensor.kids_room_humidity", "device_id": "d-speaker", "original_name": "Humidity"},
    {"entity_id": "media_player.kids_room", "device_id": "d-speaker", "original_name": None},
]
STATES = [
    {"entity_id": "sensor.living_room_temperature", "state": "21.5", "attributes": {"device_class": "temperature"}},
    {"entity_id": "sensor.kids_room_humidity", "state": "40", "attributes": {"device_class": "humidity"}},
]


def scan_responses() -> dict:
    return {"config_entries/get": ENTRIES, "config/device_registry/list": DEVICES,
            "config/entity_registry/list": ENTITIES, "/api/states": STATES}


@pytest.fixture
def ha(monkeypatch):
    """Every way `recommend` opens Home Assistant returns one FakeHA; `opened` records how."""
    from domosenso_cli import recommend
    from fakes import FakeHA

    fake = FakeHA(scan_responses())
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


def scan_lines(lines: list[str]) -> list[str]:
    return [line for line in lines if line.split(" ", 1)[0] in ("rules", "scan", "found", "maybe", "unmatched")]


def test_scan_by_url_prints_what_it_found_and_assesses_it(catalog, tmp_path, capsys, ha):
    commit = add_rules(catalog)
    token = tmp_path / "token"
    token.write_text("secret-token\n")
    work = tmp_path / "empty"
    work.mkdir()
    code, lines = run(capsys, "--home", str(work), "recommend", "--catalog", str(catalog),
                      "--from-ha", "http://ha.local:8123", "--token-file", str(token))
    assert code == 0, lines
    assert ha.opened == [("url", "http://ha.local:8123", "secret-token")]
    assert scan_lines(lines) == [
        f"rules {commit} devices 4 kinds 5",
        "scan devices 10 integrations 6",
        "found ble-proxy 1 via bluetooth",
        "found hlk-ld2410c 1 via esphome",
        "found hue-bridge 1 via hue",
        "found m5stack-atom-lite 1 via esphome",
        "found mqtt-broker 1 via mqtt",
        "found tapo-t315 2 via tplink",
        "found temperature-humidity-sensor 3 via tplink",
        "maybe android-tablet 1 via mobile_app",
        "unmatched mobile_app 1",
        "unmatched sonos 1",
        "unmatched tplink 1",
    ]
    # `found` counts as `--have`; `maybe` does not.
    assert "fits climate-air@0.2.0 tested-homes 1" in lines
    assert "optional climate-air@0.2.0 air ble-proxy have" in lines
    assert "needs ramka@0.1.1 android-tablet" in lines
    assert not [line for line in lines if "secret-token" in line]
    assert list(work.iterdir()) == []


def test_found_wins_over_maybe_and_have_adds_to_the_scan(catalog, tmp_path, capsys, ha):
    add_rules(catalog)
    token = tmp_path / "token"
    token.write_text("t")
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--from-ha", "http://ha.local:8123", "--token-file", str(token), "--have", "android-tablet")
    assert code == 0
    # The speaker's temperature and humidity make it a `maybe`, but the Tapo sensors already found the kind.
    assert not [line for line in lines if line.startswith("maybe temperature-humidity-sensor")]
    assert "missing ramka@0.1.1 tested-homes unknown needs 1" not in lines  # radar found, tablet given
    assert "fits ramka@0.1.1 tested-homes unknown" in lines


def test_device_classes_from_registry_and_states(catalog, tmp_path, capsys, ha):
    add_rules(catalog, devices={}, kinds={"temperature-humidity-sensor": KIND_RULES["temperature-humidity-sensor"][1:]})
    token = tmp_path / "token"
    token.write_text("t")
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--from-ha", "http://ha.local:8123", "--token-file", str(token))
    assert code == 0
    # Only the speaker has both classes: temperature from its registry entry, humidity from its state.
    assert "maybe temperature-humidity-sensor 1 via sonos" in lines


def test_rules_read_from_head_not_the_working_tree(catalog, tmp_path, capsys, ha):
    commit = add_rules(catalog)
    (catalog / "kinds" / "mains-meter.yaml").write_text(yaml.safe_dump({"id": "mains-meter", "match": [{"entry": "sonos"}]}))
    token = tmp_path / "token"
    token.write_text("t")
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--from-ha", "http://ha.local:8123", "--token-file", str(token))
    assert code == 0
    assert f"rules {commit} devices 4 kinds 5" in lines
    assert not [line for line in lines if "mains-meter" in line and line.startswith("found")]


def test_scan_from_a_home_target(catalog, tmp_path, capsys, ha):
    add_rules(catalog)
    home = tmp_path / "home"
    home.mkdir()
    (tmp_path / "token").write_text("t")
    (home / "domosenso.yaml").write_text(
        f"catalog: {catalog}\nconfig_dir: home-assistant\nesphome_dir: esphome\n"
        "targets:\n  production:\n    kind: ssh-docker\n    host: ha@nas\n    container: ha\n"
        f"    config: /config\n    url: http://ha.local:8123\n    token_file: {tmp_path / 'token'}\n"
        "components: {}\n")
    code, lines = run(capsys, "--home", str(home), "recommend", "--from-ha", "production")
    assert code == 0, lines
    assert ha.opened == [("target", "production")]
    assert "found tapo-t315 2 via tplink" in lines
    assert sorted(p.name for p in home.iterdir()) == ["domosenso.yaml"]


def test_url_needs_a_token_file_and_a_target_refuses_one(catalog, tmp_path, capsys, ha):
    add_rules(catalog)
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--from-ha", "http://ha.local:8123")
    assert code == 1 and lines[-1].startswith("FAIL ") and "--token-file" in lines[-1]
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--from-ha", "production", "--token-file", str(tmp_path / "t"))
    assert code == 1 and lines[-1].startswith("FAIL ") and "--token-file" in lines[-1]
    assert ha.opened == []


def test_unknown_target_and_unreadable_token_fail(catalog, tmp_path, capsys, ha):
    add_rules(catalog)
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--from-ha", "production")
    assert code == 1 and lines[-1].startswith("FAIL ")
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--from-ha", "http://ha.local:8123", "--token-file", str(tmp_path / "missing"))
    assert code == 1 and lines[-1].startswith("FAIL ") and "token file" in lines[-1]


def test_home_assistant_failure_fails(catalog, tmp_path, capsys, ha):
    add_rules(catalog)
    del ha.responses["config/device_registry/list"]
    token = tmp_path / "token"
    token.write_text("t")
    code, lines = run(capsys, "--home", str(tmp_path), "recommend", "--catalog", str(catalog),
                      "--from-ha", "http://ha.local:8123", "--token-file", str(token))
    assert code == 1
    assert lines[-1].startswith("FAIL config/device_registry/list")


def test_scan_json(catalog, tmp_path, capsys, ha):
    commit = add_rules(catalog)
    token = tmp_path / "token"
    token.write_text("t")
    code = cli.main(["--home", str(tmp_path), "recommend", "--json", "--catalog", str(catalog),
                     "--from-ha", "http://ha.local:8123", "--token-file", str(token)])
    doc = json.loads(capsys.readouterr().out)
    assert code == 0 and doc["result"] == "ok"
    scan = doc["scan"]
    assert scan["rules_commit"] == commit
    assert sorted(c["id"] for c in doc["data"]) == ["backup", "climate-air", "media", "ramka"]
    names = [d["name"] for d in scan["devices"]]
    assert "Hue service" not in names and "Old sensor" not in names
    living = scan["devices"][names.index("Living room sensor")]
    assert living == {
        "name": "Living room sensor", "name_by_user": None, "manufacturer": "TP-Link", "model": "T315",
        "model_id": None, "integrations": ["tplink"],
        "matches": [{"token": "tapo-t315", "certainty": "found", "source": "devices/tapo-t315.yaml#0"},
                    {"token": "temperature-humidity-sensor", "certainty": "found",
                     "source": "kinds/temperature-humidity-sensor.yaml#0"}],
    }
    assert scan["found"]["tapo-t315"] == {"count": 2, "via": ["tplink"],
                                          "devices": [names.index("Living room sensor"), names.index("Kitchen sensor")]}
    assert scan["found"]["mqtt-broker"] == {"count": 1, "via": ["mqtt"], "devices": []}
    assert scan["maybe"]["android-tablet"]["devices"] == [names.index("Dining tablet")]
    assert scan["unmatched"] == {"mobile_app": [names.index("Alex's phone")],
                                 "sonos": [names.index("Kids' room speaker")], "tplink": [names.index("Tapo hub")]}


def test_rule_fields_all_have_to_match():
    from domosenso_cli.hwscan import matches

    dev = {"integrations": ["bluetooth", "esphome"], "manufacturer": "Espressif", "model": "M5Stack-Atom",
           "model_id": None, "entity_domains": {"sensor"}, "device_classes": {"distance"},
           "entity_names": ["Still distance"]}
    assert matches({"integration": "esphome", "with_integration": "bluetooth", "model": "m5stack-atom*"}, dev)
    assert not matches({"integration": "esphome", "with_integration": ["bluetooth", "mqtt"]}, dev)
    assert not matches({"model_id": "*"}, dev)  # a field the device lacks never matches
    assert not matches({"unless_manufacturer": "espressif"}, dev)
    assert matches({"entity_domain": ["media_player", "sensor"], "device_classes": ["distance"]}, dev)
    assert not matches({"entity_names": ["Still distance", "Moving distance"]}, dev)
