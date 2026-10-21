from pathlib import Path

import pytest
import yaml

from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import ComponentEntry, HomeConfig, Target
from domosenso_cli.lock import FileRecord, Lock, LockEntry

HOME_YAML = """\
catalog: ../domosenso
config_dir: home-assistant
esphome_dir: esphome
targets:
  staging: {kind: local-docker, container: ha-staging, config: staging/.data/config, url: "http://127.0.0.1:8124", token_file: ~/.secrets/staging.token}
  production: {kind: ssh-docker, host: alex@demo-host, docker: sudo docker, container: home-assistant, config: /srv/ha/config, url: "http://demo-host:8123", token_file: ~/.secrets/production.token}
components:
  ramka:
    inputs: domosenso/ramka.inputs.yaml
    langs: [en, de, pl]
    outputs:
      package.yaml: packages/ramka.yaml
      dashboard.<lang>.yaml: dashboards/ramka.<lang>.yaml
  weather:
    inputs: domosenso/weather.inputs.yaml
local:
  - packages/*.yaml
  - www/*.js
resources:
  - {url: /local/radar-card.js, type: module}
unmanaged_on_target:
  - automations.yaml
  - scripts.yaml
"""


def write_home(root: Path, text: str = HOME_YAML) -> None:
    (root / "domosenso.yaml").write_text(text)


def test_home_round_trip(tmp_path):
    write_home(tmp_path)
    home = HomeConfig.load(tmp_path)
    assert home.root == tmp_path
    assert home.catalog == "../domosenso"
    assert home.config_dir == tmp_path / "home-assistant"
    assert home.esphome_dir == tmp_path / "esphome"
    assert home.targets["staging"] == Target(
        name="staging", kind="local-docker", container="ha-staging", config="staging/.data/config",
        url="http://127.0.0.1:8124", token_file=Path("~/.secrets/staging.token").expanduser(),
    )
    production = home.targets["production"]
    assert production.host == "alex@demo-host" and production.docker == "sudo docker"
    assert production.token_file == Path("~/.secrets/production.token").expanduser()
    assert home.components["ramka"] == ComponentEntry(
        id="ramka", inputs=tmp_path / "domosenso/ramka.inputs.yaml", langs=["en", "de", "pl"],
        outputs={"package.yaml": "packages/ramka.yaml", "dashboard.<lang>.yaml": "dashboards/ramka.<lang>.yaml"},
    )
    assert home.local == ["packages/*.yaml", "www/*.js"]
    assert home.resources == [{"url": "/local/radar-card.js", "type": "module"}]
    assert home.unmanaged_on_target == ["automations.yaml", "scripts.yaml"]


def test_home_defaults(tmp_path):
    write_home(tmp_path)
    home = HomeConfig.load(tmp_path)
    weather = home.components["weather"]
    assert weather.outputs == {}
    assert weather.langs == ["en", "de", "pl"]
    assert home.targets["staging"].docker == "docker" and home.targets["staging"].host is None
    assert home.kiosk_users == [] and home.custom_integrations == {}


def test_home_optional_keys(tmp_path):
    write_home(tmp_path, HOME_YAML + "kiosk_users: [Kiosk]\ncustom_integrations: {bermuda: 0.9.1}\n")
    home = HomeConfig.load(tmp_path)
    assert home.kiosk_users == ["Kiosk"]
    assert home.custom_integrations == {"bermuda": "0.9.1"}


def test_home_relative_paths_follow_the_root(tmp_path):
    write_home(tmp_path)
    home = HomeConfig.load(tmp_path)
    assert all(p.is_absolute() for p in (home.config_dir, home.esphome_dir, home.components["ramka"].inputs))


def test_home_unknown_key_rejected(tmp_path):
    write_home(tmp_path, HOME_YAML + "colour: blue\n")
    with pytest.raises(DomosensoError, match="colour"):
        HomeConfig.load(tmp_path)


def test_home_unknown_nested_key_names_the_path(tmp_path):
    write_home(tmp_path, HOME_YAML.replace("langs: [en, de, pl]", "langs: [en, de, pl]\n    lang: fr"))
    with pytest.raises(DomosensoError, match=r"components\.ramka.*lang"):
        HomeConfig.load(tmp_path)


def test_home_missing_required_key_names_it(tmp_path):
    write_home(tmp_path, HOME_YAML.replace("catalog: ../domosenso\n", ""))
    with pytest.raises(DomosensoError, match="catalog"):
        HomeConfig.load(tmp_path)


def test_home_wrong_type_names_the_path(tmp_path):
    write_home(tmp_path, HOME_YAML.replace("langs: [en, de, pl]", "langs: en"))
    with pytest.raises(DomosensoError, match=r"components\.ramka\.langs"):
        HomeConfig.load(tmp_path)


def test_home_ssh_target_needs_host(tmp_path):
    write_home(tmp_path, HOME_YAML.replace("host: alex@demo-host, ", ""))
    with pytest.raises(DomosensoError, match=r"targets\.production.*host"):
        HomeConfig.load(tmp_path)


def test_home_bad_target_kind(tmp_path):
    write_home(tmp_path, HOME_YAML.replace("kind: local-docker", "kind: carrier-pigeon"))
    with pytest.raises(DomosensoError, match=r"targets\.staging\.kind"):
        HomeConfig.load(tmp_path)


def test_home_missing_file(tmp_path):
    with pytest.raises(DomosensoError, match="domosenso.yaml"):
        HomeConfig.load(tmp_path)


def test_home_not_yaml(tmp_path):
    write_home(tmp_path, "catalog: [unclosed\n")
    with pytest.raises(DomosensoError, match="domosenso.yaml"):
        HomeConfig.load(tmp_path)


def test_home_not_a_mapping(tmp_path):
    write_home(tmp_path, "- a\n- b\n")
    with pytest.raises(DomosensoError, match="domosenso.yaml"):
        HomeConfig.load(tmp_path)


def sample_lock() -> Lock:
    lock = Lock()
    lock.components["ramka"] = LockEntry(
        version="0.1.1", tag="ramka/0.1.1", commit="a" * 40,
        files={
            "home-assistant/packages/ramka.yaml": FileRecord("b" * 64, "templates/package.yaml.j2", "managed"),
            "domosenso/ramka.inputs.yaml": FileRecord("c" * 64, "inputs.example.yaml", "instance"),
        },
        resources=["/local/domosenso/ramka/0.1.1/cards/agenda-card.js"],
    )
    lock.components["weather"] = LockEntry(version="0.2.0", tag="weather/0.2.0", commit="d" * 40, files={}, resources=[])
    return lock


def test_lock_round_trip(tmp_path):
    lock = sample_lock()
    lock.save(tmp_path)
    text = (tmp_path / "domosenso.lock").read_text(encoding="utf-8")
    assert text.splitlines()[0] == "# Written by domosenso — do not edit"
    loaded = Lock.load(tmp_path)
    assert loaded.components == lock.components
    loaded.save(tmp_path)
    assert (tmp_path / "domosenso.lock").read_text(encoding="utf-8") == text


def test_lock_keys_sorted_and_layer_only_when_instance(tmp_path):
    sample_lock().save(tmp_path)
    data = yaml.safe_load((tmp_path / "domosenso.lock").read_text(encoding="utf-8"))
    assert list(data["components"]) == ["ramka", "weather"]
    files = data["components"]["ramka"]["files"]
    assert list(files) == sorted(files)
    assert files["home-assistant/packages/ramka.yaml"] == {"sha256": "b" * 64, "from": "templates/package.yaml.j2"}
    assert files["domosenso/ramka.inputs.yaml"]["layer"] == "instance"


def test_lock_absent_is_empty(tmp_path):
    assert Lock.load(tmp_path).components == {}


def test_lock_layer_defaults_to_managed(tmp_path):
    (tmp_path / "domosenso.lock").write_text(
        "# Written by domosenso — do not edit\ncomponents:\n  ramka:\n    version: 0.1.1\n    tag: ramka/0.1.1\n"
        f"    commit: {'a' * 40}\n    files:\n      x.yaml: {{sha256: {'b' * 64}, from: t.j2}}\n"
    )
    entry = Lock.load(tmp_path).components["ramka"]
    assert entry.files["x.yaml"] == FileRecord("b" * 64, "t.j2", "managed")
    assert entry.resources == []


def test_lock_owner(tmp_path):
    lock = sample_lock()
    assert lock.owner("home-assistant/packages/ramka.yaml") == "ramka"
    assert lock.owner("domosenso/ramka.inputs.yaml") == "ramka"
    assert lock.owner("home-assistant/packages/other.yaml") is None


def test_lock_rejects_bad_entry(tmp_path):
    (tmp_path / "domosenso.lock").write_text(
        "components:\n  ramka:\n    version: 0.1.1\n    tag: ramka/0.1.1\n    files: {}\n"
    )
    with pytest.raises(DomosensoError, match=r"components\.ramka.*commit"):
        Lock.load(tmp_path)


def test_lock_rejects_unknown_layer(tmp_path):
    (tmp_path / "domosenso.lock").write_text(
        f"components:\n  ramka:\n    version: 0.1.1\n    tag: t\n    commit: c\n    files:\n"
        f"      x.yaml: {{sha256: {'b' * 64}, from: t.j2, layer: local}}\n"
    )
    with pytest.raises(DomosensoError, match=r"files.*layer"):
        Lock.load(tmp_path)


@pytest.mark.parametrize("name", ["home", "lock"])
def test_schemas_are_valid_draft_2020_12(name):
    import json

    from jsonschema import Draft202012Validator

    from domosenso_cli.schema import SCHEMAS

    Draft202012Validator.check_schema(json.loads((SCHEMAS / f"{name}.schema.json").read_text()))
