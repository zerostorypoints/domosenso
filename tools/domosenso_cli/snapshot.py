"""`domosenso snapshot <target> [--out <file>]`: record what a running home is made of, read-only.

SPEC-002 section 3.1: entities and their `(platform, unique_id)`, automations and scripts with a hash of
their config, helper options, dashboards with a hash of their config, Lovelace resources, config
entries, ERROR entries of the system log and, on an ssh-docker target, the language of each kiosk
user's profile. `compare` sets two snapshots side by side; `verify` checks a running home against one.
Nothing here writes to Home Assistant.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from domosenso_cli.errors import DomosensoError
from domosenso_cli.ha_api import HA
from domosenso_cli.home import HomeConfig, Target
from domosenso_cli.report import Reporter
from domosenso_cli.schema import SCHEMAS
from domosenso_cli.targets import open_target

# Platforms whose entities come from the home's YAML files. Any entity with no config entry, or with
# no registry entry at all, counts as from files too.
FILE_PLATFORMS = {
    "template", "group", "input_boolean", "input_number", "input_select", "input_text", "input_datetime",
    "input_button", "timer", "counter", "automation", "script", "utility_meter", "history_stats",
    "statistics", "command_line", "mqtt", "plant", "folder", "min_max", "derivative", "integration",
    "threshold", "trend", "filter",
}
HELPER_DOMAINS = {
    "input_boolean", "input_number", "input_select", "input_text", "input_datetime", "input_button",
    "timer", "counter",
}
HELPER_KEYS = ("options", "min", "max", "step", "mode", "has_date", "has_time", "duration")
PROFILE_FILE = ".storage/frontend.user_data_{}"
NO_CONFIG = re.compile(r"^[a-z_/]+: (not_found|config_not_found)\b")


def canonical_sha(obj: Any) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _state_class(state: str | None) -> str:
    if state in ("unavailable", "unknown"):
        return state
    return "unavailable" if state is None else "available"


async def _config_sha(ha: HA, type: str, unwrap: bool, **fields: Any) -> str | None:
    """The hash of one config (`result["config"]` when `unwrap`), or None when Home Assistant has
    none to give: `not_found` for an automation or script it did not load (or a state posted over
    the REST API with nothing behind it), `config_not_found` for an auto-generated dashboard. Any
    other failure (a timeout) fails the snapshot rather than pass for a missing config."""
    try:
        result = await ha.call(type, **fields)
    except DomosensoError as exc:
        if NO_CONFIG.match(str(exc)):
            return None
        raise
    return canonical_sha(result.get("config") if unwrap and isinstance(result, dict) else result)


async def _mqtt_discovered(ha: HA, registry: list[dict]) -> list[str]:
    """Entity ids that MQTT discovery published, as `mqtt/device/debug_info` reports them per device:
    a discovered entity carries its `discovery_data` (topic and payload), a YAML `mqtt:` entity attached
    to the same device has it empty. A discovered entity with no device is not found this way and
    stays counted as from files."""
    devices = sorted({e["device_id"] for e in registry if e.get("platform") == "mqtt" and e.get("device_id")})
    discovered: set[str] = set()
    for device_id in devices:
        info = await ha.call("mqtt/device/debug_info", device_id=device_id)
        discovered |= {e["entity_id"] for e in (info or {}).get("entities", []) if e.get("discovery_data")}
    return sorted(discovered)


async def read_raw(ha: HA) -> dict[str, Any]:
    """Everything `build` needs, as Home Assistant returns it. Automation, script and dashboard
    configs are hashed here, one call each, so the raw configs are never kept."""
    raw: dict[str, Any] = {
        "config": await ha.call("get_config"),
        "registry": await ha.call("config/entity_registry/list"),
        "states": await ha.rest_get("/api/states"),
    }
    configs: dict[str, str | None] = {}
    for state in raw["states"]:
        entity_id = state["entity_id"]
        domain = entity_id.split(".", 1)[0]
        if domain in ("automation", "script") and state.get("state") != "unavailable":
            configs[entity_id] = await _config_sha(ha, f"{domain}/config", True, entity_id=entity_id)
    raw["configs"] = configs
    raw["mqtt_discovered"] = await _mqtt_discovered(ha, raw["registry"])
    panels = await ha.call("get_panels")
    dashboards = {}
    for url_path, panel in sorted(panels.items()):
        if panel.get("component_name") != "lovelace":
            continue
        # The default dashboard is the one with no url_path in `lovelace/config`.
        fields = {} if url_path == "lovelace" else {"url_path": url_path}
        dashboards[url_path] = {
            "title": panel.get("title"), "icon": panel.get("icon"), "require_admin": bool(panel.get("require_admin")),
            "config_sha256": await _config_sha(ha, "lovelace/config", False, **fields, force=False),
        }
    raw["dashboards"] = dashboards
    raw["resources"] = await ha.call("lovelace/resources")
    raw["config_entries"] = await ha.call("config_entries/get")
    raw["system_log"] = await ha.call("system_log/list")
    return raw


def build(raw: dict[str, Any], kiosk_profiles: dict[str, dict] | None = None) -> dict:
    registry = {entry["entity_id"]: entry for entry in raw["registry"]}
    states = {state["entity_id"]: state for state in raw["states"]}
    discovered = set(raw.get("mqtt_discovered", ()))
    entities, automations, scripts, helpers = {}, {}, {}, {}
    for entity_id in sorted(set(registry) | set(states)):
        reg, state = registry.get(entity_id), states.get(entity_id)
        domain, object_id = entity_id.split(".", 1)
        platform = reg["platform"] if reg else domain
        value = state.get("state") if state else None
        attributes = (state or {}).get("attributes") or {}
        entities[entity_id] = {
            "platform": platform,
            "unique_id": reg.get("unique_id") if reg else None,
            "state_class": _state_class(value),
            "from_files": entity_id not in discovered
            and (reg is None or platform in FILE_PLATFORMS or not reg.get("config_entry_id")),
        }
        if domain in ("automation", "script"):
            (automations if domain == "automation" else scripts)[entity_id] = {
                "id": attributes.get("id", object_id if domain == "script" else None),
                "state": value or "unavailable",
                # A state with no config behind it (staging's mirror posts production's) is not loaded.
                "loaded": value not in (None, "unavailable") and raw["configs"].get(entity_id) is not None,
                "config_sha256": raw["configs"].get(entity_id),
                "last_triggered": attributes.get("last_triggered"),
            }
        if domain in HELPER_DOMAINS:
            helpers[entity_id] = {key: attributes[key] for key in HELPER_KEYS if key in attributes}
    resources = sorted(
        ({"url_no_query": r["url"].split("?", 1)[0], "type": r.get("type", "module")} for r in raw["resources"]),
        key=lambda r: (r["url_no_query"], r["type"]),
    )
    config_entries = sorted(
        ({"domain": e["domain"], "title": e.get("title"), "state": e.get("state")} for e in raw["config_entries"]),
        key=lambda e: (e["domain"], str(e["title"])),
    )
    errors = [
        {key: entry.get(key) for key in ("name", "message", "source", "timestamp", "count")}
        for entry in raw["system_log"] if entry.get("level") == "ERROR"
    ]
    return {
        "taken_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ha_version": raw["config"].get("version"),
        "entities": entities,
        "automations": automations,
        "scripts": scripts,
        "helpers": helpers,
        "dashboards": raw["dashboards"],
        "resources": resources,
        "config_entries": config_entries,
        "errors": errors,
        "profiles": dict(kiosk_profiles or {}),
    }


async def take(ha: HA, kiosk_profiles: dict[str, dict] | None = None) -> dict:
    return build(await read_raw(ha), kiosk_profiles)


def profile_language(raw: bytes | None) -> str | None:
    """The language in a `frontend.user_data_<id>` file. Home Assistant 2026.9.2 stores it as
    `data.language.language` (verified on staging); a plain string under `data.language` is accepted as well."""
    if not raw:
        return None
    try:
        data = json.loads(raw).get("data") or {}
    except (ValueError, AttributeError) as exc:
        raise DomosensoError(f"kiosk profile is not a JSON object: {exc}") from exc
    language = data.get("language")
    if isinstance(language, dict):
        language = language.get("language")
    return language if isinstance(language, str) else None


async def read_kiosk_profiles(ha: HA, names: list[str], read: Callable[[str], bytes | None]) -> dict[str, dict]:
    """`{name: {user_id, language}}` for each kiosk user, matched by username or display name."""
    users = await ha.call("config/auth/list")
    profiles = {}
    for name in names:
        user = next((u for u in users if name in (u.get("username"), u.get("name"))), None)
        if user is None:
            raise DomosensoError(f"kiosk user {name}: not found in config/auth/list")
        raw = await asyncio.to_thread(read, PROFILE_FILE.format(user["id"]))
        profiles[name] = {"user_id": user["id"], "language": profile_language(raw)}
    return profiles


def pick_target(home: HomeConfig, name: str) -> Target:
    if name not in home.targets:
        raise DomosensoError(f"unknown target {name} (declared: {', '.join(sorted(home.targets)) or 'none'})")
    return home.targets[name]


async def target_profiles(home: HomeConfig, target: Target, ha: HA) -> dict[str, dict] | None:
    """The kiosk users' profiles where the target can be read over ssh (SPEC-002 decision 2: read-only)."""
    if target.kind == "ssh-docker" and home.kiosk_users:
        return await read_kiosk_profiles(ha, home.kiosk_users, open_target(target).read)
    return None


async def take_from(home: HomeConfig, target: Target) -> dict:
    async with HA.for_target(target) as ha:
        return await take(ha, await target_profiles(home, target, ha))


def validate(snapshot: dict) -> None:
    from jsonschema import Draft202012Validator

    schema = json.loads((SCHEMAS / "snapshot.schema.json").read_text(encoding="utf-8"))
    error = next(iter(Draft202012Validator(schema).iter_errors(snapshot)), None)
    if error is not None:
        where = ".".join(str(p) for p in error.absolute_path) or "(top level)"
        raise DomosensoError(f"snapshot does not match snapshot.schema.json at {where}: {error.message}")


def load(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise DomosensoError(f"{path}: not a readable snapshot: {exc}") from exc
    if not isinstance(data, dict):
        raise DomosensoError(f"{path}: not a snapshot (expected a JSON object)")
    validate(data)
    return data


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("target", help="a target declared in domosenso.yaml")
    parser.add_argument("--out", type=Path, metavar="<file>",
                        help="where to write it (default: .domosenso/snap/<target>.json in the home)")


def run(args: argparse.Namespace, rep: Reporter) -> int:
    home = HomeConfig.load(args.home)
    target = pick_target(home, args.target)
    result = asyncio.run(take_from(home, target))
    validate(result)
    out = args.out or args.home / ".domosenso" / "snap" / f"{target.name}.json"
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    except OSError as exc:
        raise DomosensoError(f"cannot write {out}: {exc.strerror or exc}") from exc
    for part in ("entities", "automations", "scripts", "helpers", "dashboards", "resources", "errors", "profiles"):
        rep.line("read", part, str(len(result[part])))
    rep.line("wrote", str(out))
    return rep.ok()
