"""The files a home repository starts from (examples/home-template/)."""
import re
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
COMPOSE = REPO / "examples" / "home-template" / "services" / "home-assistant" / "compose.yaml"


def test_home_assistant_compose_runs_the_checked_version_with_discovery():
    """SPEC-011 section 3: the install pins the version the checks run, on the host network."""
    service = yaml.safe_load(COMPOSE.read_text())["services"]["homeassistant"]
    checked = re.search(r"HA_VERSION=\$\{HA_VERSION:-([0-9.]+)\}", (REPO / "tools" / "ha-check.sh").read_text())[1]
    assert service["image"] == f"homeassistant/home-assistant:{checked}"
    assert service["network_mode"] == "host"
    assert service["container_name"] == "homeassistant"
    assert "${HA_CONFIG:-./config}:/config" in service["volumes"]
    assert service["restart"] == "unless-stopped"


def test_cloudflared_compose_is_pinned_on_the_host_network_and_reads_the_token_from_a_file():
    """SPEC-012: the connector next to Home Assistant; the token never in the compose file."""
    path = REPO / "components" / "remote-access" / "services" / "cloudflared" / "compose.yaml"
    service = yaml.safe_load(path.read_text())["services"]["cloudflared"]
    assert re.fullmatch(r"cloudflare/cloudflared:\d{4}\.\d+\.\d+", service["image"])
    assert service["network_mode"] == "host"
    assert service["environment"] == {"TUNNEL_TOKEN_FILE": "/run/secrets/tunnel-token"}
    assert service["volumes"][0].endswith(":/run/secrets/tunnel-token:ro")
    assert "--no-autoupdate" in service["command"]


def test_mosquitto_compose_is_pinned_on_the_host_network_without_anonymous_clients():
    """SPEC-015: the broker a home copies when a component needs one."""
    base = REPO / "examples" / "home-template" / "services" / "mosquitto"
    service = yaml.safe_load((base / "compose.yaml").read_text())["services"]["mosquitto"]
    assert re.fullmatch(r"eclipse-mosquitto:\d+\.\d+\.\d+(-alpine)?", service["image"])
    assert service["network_mode"] == "host"
    conf = (base / "config" / "mosquitto.conf").read_text().splitlines()
    assert "allow_anonymous false" in conf
    assert "password_file /mosquitto/config/passwd" in conf
