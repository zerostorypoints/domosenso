"""SPEC-015: what `add` writes and `status` says about the parts of a component outside Home Assistant's
config: ESPHome device files, container services, firmware, ESPHome secrets."""
from pathlib import Path

import pytest

from domosenso_cli.lock import Lock
from test_cli_home_cmds import git, run, write_files

MANIFEST = """\
id: nodes
version: 1.0.0
inputs:
  boards: {type: "list[{room: slug, area: string, radar: bool}]", example: [{room: hall, area: Hall, radar: false}]}
artifacts:
  esphome:
    packages: [{file: esphome/node.yaml}]
    devices: {template: esphome/device.yaml.j2, each: boards, file: node-<room>.yaml}
    secrets: [wifi_ssid, api_key]
  services:
    - {name: bridge, kind: container, compose: services/bridge/compose.yaml,
       files: [services/bridge/Dockerfile], env_example: services/bridge/bridge.env.example, build: true}
    - {name: tunnel, kind: container, compose: services/tunnel/compose.yaml, image: "example/tunnel:1.2.3"}
    - {name: radio, kind: firmware, repo: example/radio, version: "2.4.6", asset: radio.bin,
       flash: "esptool --port <port> write-flash 0x0 <asset>"}
    - services/legacy/compose.yaml
"""

FILES = {
    "esphome/node.yaml": "esphome: {name: node}\n",
    "esphome/device.yaml.j2": (
        "substitutions: {room: [[ item.room | yaml ]], area: [[ item.area | yaml ]]}\n"
        "packages:\n"
        "  node: github://example/c/[[ component.id ]]/node.yaml@[[ component.id ]]/[[ component.version ]]\n"
        "[%- if item.radar %]\n  radar: radar.yaml\n[%- endif %]\n"
    ),
    "services/bridge/compose.yaml": "services: {bridge: {build: .}}\n",
    "services/bridge/Dockerfile": "FROM python:3.14-slim\n",
    "services/bridge/bridge.env.example": "HOST=\n",
    "services/tunnel/compose.yaml": "services: {tunnel: {image: example/tunnel:1.2.3}}\n",
    "services/legacy/compose.yaml": "services: {}\n",
}

INPUTS = """\
boards:
  - {room: hall, area: Hall, radar: false}
  - {room: office, area: Office, radar: true}
"""


@pytest.fixture
def home(tmp_path, capsys):
    repo = tmp_path / "catalog"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    write_files(repo / "components" / "nodes", {"component.yaml": MANIFEST, **FILES})
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "nodes 1.0.0")
    git(repo, "tag", "-a", "nodes/1.0.0", "-m", "nodes/1.0.0")
    root = tmp_path / "home"
    code, out = run(root, "init", "--catalog", str(repo), capsys=capsys)
    assert code == 0, out
    write_files(root, {"domosenso/nodes.inputs.yaml": INPUTS})
    return root


def test_add_writes_a_device_file_per_item_and_copies_container_services(home, capsys):
    code, out = run(home, "add", "nodes@1.0.0", capsys=capsys)
    assert code == 0, out
    for path in ("esphome/node-hall.yaml", "esphome/node-office.yaml", "services/bridge/compose.yaml",
                 "services/bridge/Dockerfile", "services/bridge/bridge.env.example", "services/tunnel/compose.yaml"):
        assert f"instance {path}" in out
        assert Lock.load(home).components["nodes"].files[path].layer == "instance"
    office = (home / "esphome/node-office.yaml").read_text()
    assert "node.yaml@nodes/1.0.0" in office and "radar: radar.yaml" in office
    assert "radar" not in (home / "esphome/node-hall.yaml").read_text()
    assert not (home / "services/legacy").exists()  # a bare path is a pre-SPEC-015 tag's: nothing to copy
    assert not (home / "services/radio").exists()  # firmware is no file of the home


def test_add_keeps_a_device_file_the_home_already_has(home, capsys):
    write_files(home, {"esphome/node-hall.yaml": "# the home's own\n"})
    code, out = run(home, "add", "nodes@1.0.0", capsys=capsys)
    assert code == 0, out
    assert "instance-kept esphome/node-hall.yaml" in out
    assert (home / "esphome/node-hall.yaml").read_text() == "# the home's own\n"


def test_add_refuses_a_device_file_name_that_is_not_a_slug(home, capsys):
    write_files(home, {"domosenso/nodes.inputs.yaml": "boards: [{room: Hall Way, area: Hall, radar: false}]\n"})
    code, out = run(home, "add", "nodes@1.0.0", capsys=capsys)
    assert code == 1
    assert "boards[0].room must be a slug" in out
    assert "nodes" not in Lock.load(home).components


def test_status_names_services_firmware_and_missing_secrets(home, capsys):
    run(home, "add", "nodes@1.0.0", capsys=capsys)
    write_files(home, {"esphome/secrets.yaml": 'wifi_ssid: "net"\napi_key: ""\n'})
    code, out = run(home, "status", capsys=capsys)
    assert code == 0, out
    lines = out.splitlines()
    assert "service nodes bridge build (manual)" in lines
    assert "service nodes tunnel image example/tunnel:1.2.3 (manual)" in lines
    assert "firmware nodes radio 2.4.6 (manual)" in lines
    assert "esphome-secret api_key missing" in lines  # empty counts as missing
    assert not any("wifi_ssid" in line for line in lines)
    assert "net" not in out  # a secret's value is never printed
    assert not any("legacy" in line for line in lines)


def test_status_without_a_secrets_file_names_every_secret(home, capsys):
    run(home, "add", "nodes@1.0.0", capsys=capsys)
    code, out = run(home, "status", capsys=capsys)
    assert code == 0, out
    assert "esphome-secret api_key missing" in out.splitlines()
    assert "esphome-secret wifi_ssid missing" in out.splitlines()


def test_device_files_render_the_demo_homes_files():
    """bermuda-presence's device template, with the demo home's inputs, gives the committed device files
    that esphome-check validates."""
    import yaml
    from domosenso_render import render_device_files

    repo = Path(__file__).resolve().parent.parent
    comp = repo / "components" / "bermuda-presence"
    manifest = yaml.safe_load((comp / "component.yaml").read_text())
    inputs = yaml.safe_load((repo / "examples/demo-home/inputs/bermuda-presence.yaml").read_text())
    rendered = dict(render_device_files(comp, inputs))
    committed_dir = repo / Path(manifest["artifacts"]["esphome"]["instance"]).parent
    committed = {p.name: p.read_text() for p in committed_dir.glob("ble-proxy-*.yaml")}
    assert rendered == committed


@pytest.mark.parametrize("service, valid", [
    ({"name": "a", "kind": "container", "compose": "c.yaml", "build": True}, True),
    ({"name": "a", "kind": "container", "compose": "c.yaml", "image": "x/y:1"}, True),
    ({"name": "a", "kind": "container", "compose": "c.yaml"}, False),  # neither image nor build
    ({"name": "a", "kind": "container", "compose": "c.yaml", "image": "x/y"}, False),  # image not pinned
    ({"name": "a", "kind": "firmware", "repo": "o/r", "version": "1", "asset": "a.bin", "flash": "f"}, True),
    ({"name": "a", "kind": "firmware", "repo": "o/r", "version": "1"}, False),  # no asset, no flash command
    ("services/a/compose.yaml", True),  # a tag from before SPEC-015
])
def test_service_schema(service, valid):
    from catalog_check import _schema_errors

    manifest = {"id": "x", "version": "1.0.0", "summary": "s", "description_key": "meta.description",
                "devices": {}, "host": {"installs": ["container"]}, "integrations": [],
                "artifacts": {"services": [service]}, "tested": {"ha": ["2026.9.2"]}}
    assert (not _schema_errors("component", manifest, "x")) == valid
