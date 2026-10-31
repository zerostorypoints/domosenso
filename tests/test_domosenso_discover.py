"""The About page's discovery (components/ramka/shell/domosenso_discover.py, SPEC-023) on a config in
the storage format Home Assistant 2026.9.2 writes (each device has one `config_entry_id`)."""
import importlib.util
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCRIPT = REPO / "components" / "ramka" / "shell" / "domosenso_discover.py"


def load():
    spec = importlib.util.spec_from_file_location("domosenso_discover", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def store(config: Path, name: str, data) -> None:
    (config / ".storage").mkdir(parents=True, exist_ok=True)
    (config / ".storage" / name).write_text(json.dumps({"version": 1, "data": data}))


def demo_config(tmp_path: Path) -> Path:
    config = tmp_path / "config"
    (config / "packages").mkdir(parents=True)
    (config / ".HA_VERSION").write_text("2026.9.2")
    (config / "packages" / "ramka.yaml").write_text(
        "# Rendered by Domosenso from ramka/0.7.0 (abc) — do not edit\n"
        "notify: notify.mobile_app_tablet\nsensor: sensor.tablet_battery_level\n")
    store(config, "core.config_entries", {"entries": [{"entry_id": "E1", "domain": "mobile_app"},
                                                      {"entry_id": "E2", "domain": "esphome"}]})
    store(config, "core.device_registry", {"devices": [
        {"id": "D1", "config_entry_id": "E1", "primary_config_entry": "E1", "manufacturer": "TCL", "model": "9469X",
         "name": "Tablet", "sw_version": "36", "entry_type": None, "disabled_by": None},
        {"id": "D2", "config_entry_id": "E2", "primary_config_entry": "E2", "manufacturer": "domosenso",
         "model": "bermuda-presence", "name": "Proxy", "sw_version": "0.2.1 (ESPHome 2026.9.1)", "entry_type": None,
         "disabled_by": None},
    ]})
    store(config, "core.entity_registry", {"entities": [
        {"entity_id": "sensor.tablet_battery_level", "platform": "mobile_app", "device_id": "D1", "unique_id": "u1"},
        {"entity_id": "sensor.proxy_uptime", "platform": "esphome", "device_id": "D2", "unique_id": "u2"},
    ]})
    return config


def test_storage_format_links_the_devices(tmp_path):
    found = load().main(demo_config(tmp_path))
    assert found["uses"] == {"ramka": ["sensor.tablet_battery_level"]}
    assert found["links"]["devices"]["D1"] == {"id": "tcl-9469x", "name": "TCL tablet 9469X", "inference": False,
                                               "url": "https://domosenso.org/devices/tcl-9469x/"}
    assert found["links"]["devices"]["D2"]["id"] == "m5stack-atom-lite"  # the catalog's own inference rule
    assert found["links"]["components"]["ramka"] == "https://domosenso.org/components/ramka/"
    by_id = {c["id"]: c for c in found["found"]}
    assert by_id["ramka"]["version"] == "0.7.0" and by_id["bermuda-presence"]["boards"][0]["version"] == "0.2.1"
