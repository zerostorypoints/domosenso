#!/usr/bin/env python3
"""What the home's Domosenso components use, found strictly from Home Assistant's own files (SPEC-023).

Run by shell_command.<prefix>_discover inside the Home Assistant container: `domosenso_discover.py
/config`. Prints one JSON document for the About page's refresh, which a script turns into the
attributes of sensor.domosenso_related:

    {"refreshed": ISO time, "ha_version": "...",
     "found": [{"id", "version", "source"}],             components seen in HA: a rendered file's stamp,
                                                          or a board running a catalog firmware
     "uses": {"<id>": [entity ids]},                     what each component's rendered files reach
     "integrations": {"<domain>": {"name", "kind", "version", "update_entity"}},
     "declared_links": [{"device", "via"}],              links HA does not record, from the home's file
     "links": {"components": {"<id>": url},              the catalog's pages, from domosenso_catalog.json
               "devices": {"<device id>": {"id", "name", "url", "inference"}},  matched by its rules
               "integrations": {"<domain>": url}}}       the manifest's documentation

Strict only: an entity is used when a component's rendered file names it literally, or a template
entity in packages/*.yaml that is reached names it, or a rule in <config>/domosenso_discovery.yaml
adds it (a pattern the home's own templates resolve at runtime). Read-only: it writes nothing.
"""
from __future__ import annotations

import datetime
import fnmatch
import importlib.metadata
import json
import re
import sys
from pathlib import Path

import yaml

STAMP = re.compile(r"^# Rendered by Domosenso from (?P<cid>[a-z0-9][a-z0-9-]*)/(?P<version>[^\s/()]+) \(")
FIRMWARE = re.compile(r"^(?P<version>\d+\.\d+\.\d+)")
ID = re.compile(r"\b([a-z_]+\.[a-z0-9_]+)\b")
UNIQUE_ID = re.compile(r"^(\s*)(?:-\s*)?unique_id:\s*['\"]?([\w.-]+)", re.M)
# Entities that are not an integration's: the home's own logic, followed but not listed.
NOT_INTEGRATIONS = {"template", "input_boolean", "input_number", "input_select", "input_text", "input_button",
                    "input_datetime", "script", "automation", "timer", "counter", "group", "shell_command",
                    "rest_command", "image", "schedule", "person", "zone", "sun"}
RULES_FILE = "domosenso_discovery.yaml"
INDEX = Path(__file__).with_name("domosenso_catalog.json")  # tools/catalog_index.py, shipped beside this file
CORE = Path("/usr/src/homeassistant/homeassistant/components")


def storage(config: Path, name: str) -> dict:
    try:
        return json.loads((config / ".storage" / name).read_text(encoding="utf-8"))["data"]
    except (OSError, ValueError, KeyError):
        return {}


def blocks_of(config: Path) -> dict[str, str]:
    """unique_id -> the YAML list item that defines it, for every package (the home's and managed)."""
    found = {}
    for path in sorted((config / "packages").glob("*.yaml")):
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in UNIQUE_ID.finditer(text):
            indent = max(len(m.group(1)) - 2, 0)
            start = text.rfind("\n" + " " * indent + "- ", 0, m.start())
            end = len(text)
            for nxt in re.finditer(r"^(\s*)-\s", text[m.end():], re.M):
                if len(nxt.group(1)) <= indent:
                    end = m.end() + nxt.start()
                    break
            found[m.group(2)] = text[max(start, 0):end]
    return found


def manifest(domain: str, config: Path) -> tuple[dict, bool]:
    for base, core in ((CORE, True), (config / "custom_components", False)):
        try:
            return json.loads((base / domain / "manifest.json").read_text(encoding="utf-8")), core
        except (OSError, ValueError):
            continue
    return {}, False


def _list(value) -> list[str]:
    if value is None:
        return []
    return [str(v) for v in value] if isinstance(value, list) else [str(value)]


def _glob(value, patterns) -> bool:
    return value is not None and any(fnmatch.fnmatchcase(str(value).lower(), p.lower()) for p in _list(patterns))


def matches(rule: dict, dev: dict) -> bool:
    """A device rule of the catalog (SPEC-010), as tools/domosenso_cli/hwscan.py reads it."""
    if "integration" in rule and not set(_list(rule["integration"])) & set(dev["integrations"]):
        return False
    if not set(_list(rule.get("with_integration"))) <= set(dev["integrations"]):
        return False
    for key in ("manufacturer", "model", "model_id"):
        if key in rule and not _glob(dev[key], rule[key]):
            return False
    if "unless_manufacturer" in rule and _glob(dev["manufacturer"], rule["unless_manufacturer"]):
        return False
    if "entity_domain" in rule and not set(_list(rule["entity_domain"])) & dev["entity_domains"]:
        return False
    if not set(_list(rule.get("device_classes"))) <= dev["device_classes"]:
        return False
    return all(any(_glob(n, pattern) for n in dev["entity_names"]) for pattern in _list(rule.get("entity_names")))


def links(config: Path, devices: list[dict], entities: dict, integrations: dict) -> dict:
    """Pages for what was found: a component's on domosenso.org (else its folder in the repository),
    a device's when a catalog rule tells it as that device, an integration's documentation."""
    try:
        index = json.loads(INDEX.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        index = {"components": {}, "devices": []}
    site, repo = index.get("site", ""), index.get("repository", "")
    components = {cid: f"{site}/components/{cid}/" if c.get("page") else f"{repo}/tree/main/components/{cid}"
                  for cid, c in index.get("components", {}).items()}
    domains = {e["entry_id"]: e["domain"] for e in storage(config, "core.config_entries").get("entries", [])}
    owned: dict[str, list[dict]] = {}
    for entry in entities.values():
        if entry.get("device_id"):
            owned.setdefault(entry["device_id"], []).append(entry)
    found = {}
    for device in devices:
        if device.get("entry_type") == "service" or device.get("disabled_by"):
            continue
        own = owned.get(device["id"], [])
        record = {
            "manufacturer": device.get("manufacturer"), "model": device.get("model"), "model_id": device.get("model_id"),
            "integrations": sorted({domains[c] for c in device.get("config_entries", []) if c in domains}),
            "entity_domains": {e["entity_id"].split(".", 1)[0] for e in own},
            "device_classes": {e.get("device_class") or e.get("original_device_class") for e in own} - {None},
            "entity_names": [e.get("original_name") for e in own if e.get("original_name")],
        }
        for known in index.get("devices", []):
            rule = next((r for r in known.get("match", []) if matches(r, record)), None)
            if rule is not None:
                url = f"{site}/devices/{known['id']}/" if known.get("page") else f"{repo}/blob/main/devices/{known['id']}.yaml"
                found[device["id"]] = {"id": known["id"], "name": known.get("name", known["id"]), "url": url,
                                       "inference": rule.get("note") == "inference"}
                break
    docs = {}
    for domain in integrations:
        data, _ = manifest(domain, config)
        if data.get("documentation"):
            docs[domain] = data["documentation"]
    return {"components": components, "devices": found, "integrations": docs}


def main(config: Path) -> dict:
    entities = {e["entity_id"]: e for e in storage(config, "core.entity_registry").get("entities", [])}
    devices = storage(config, "core.device_registry").get("devices", [])
    known = set(entities)
    rules = {}
    try:
        rules = yaml.safe_load((config / RULES_FILE).read_text(encoding="utf-8")) or {}
    except OSError:
        pass

    def ids_in(text: str) -> set[str]:
        return {m for m in ID.findall(text) if m in known}

    # Components: the stamps of the rendered files, and boards that run a catalog firmware.
    found: dict[str, dict] = {}
    seeds: dict[str, set[str]] = {}
    for path in sorted(config.rglob("*.yaml")):
        if ".storage" in path.parts or "custom_components" in path.parts:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        stamp = STAMP.match(text)
        if stamp:
            cid = stamp["cid"]
            found.setdefault(cid, {"id": cid, "version": stamp["version"], "source": "rendered"})
            seeds.setdefault(cid, set()).update(ids_in(text))
    for device in devices:
        if (device.get("manufacturer") or "").lower() == "domosenso" and device.get("model"):
            version = FIRMWARE.match(device.get("sw_version") or "")
            cid = device["model"]
            item = found.setdefault(cid, {"id": cid, "version": version["version"] if version else "", "source": ""})
            item.setdefault("boards", []).append({"name": device.get("name_by_user") or device.get("name") or "",
                                                  "version": version["version"] if version else ""})

    # Rules: entity ids the home's own templates build at runtime, by a pattern they match. A rule
    # applies to a template entity whose definition contains one of its `when` strings (the macro).
    applied: list[tuple[list[str], set[str]]] = []
    for rule in rules.get("rules") or []:
        pattern, ids = re.compile(rule["match"]), set()
        for eid in sorted(known):
            match = pattern.match(eid)
            if match:
                ids.add(eid)
                for also in rule.get("also") or []:
                    other = also.format(**match.groupdict())
                    if other in known:
                        ids.add(other)
        applied.append((list(rule.get("when") or []), ids))

    blocks = blocks_of(config)
    uses = {}
    for cid, start in sorted(seeds.items()):
        seen, queue, leaves = set(), list(start), set()
        while queue:
            eid = queue.pop()
            if eid in seen or eid not in entities:
                continue
            seen.add(eid)
            entry = entities[eid]
            if entry.get("platform") not in NOT_INTEGRATIONS and not entry.get("disabled_by"):
                leaves.add(eid)
            block = blocks.get(entry.get("unique_id") or "")
            if block:
                refs = ids_in(block)
                for when, ids in applied:
                    if any(w in block for w in when):
                        refs |= ids
                queue.extend(refs - seen)
        uses[cid] = sorted(leaves)

    # Integrations: core (HA's version), custom, or from HACS with its update entity.
    hacs = {r.get("domain"): (rid, r) for rid, r in storage(config, "hacs.repositories").items() if r.get("domain")}
    updates = {e.get("unique_id"): eid for eid, e in entities.items() if eid.startswith("update.") and e.get("platform") == "hacs"}
    try:  # written by Home Assistant itself at every start
        ha_version = (config / ".HA_VERSION").read_text(encoding="utf-8").strip()
    except OSError:
        ha_version = importlib.metadata.version("homeassistant")
    integrations = {}
    for domain in sorted({entities[e]["platform"] for ids in uses.values() for e in ids}):
        data, core = manifest(domain, config)
        rid, repo = hacs.get(domain, (None, None))
        installed = repo.get("version_installed") if rid else None
        integrations[domain] = {
            "name": data.get("name", domain),
            "kind": "core" if core else "HACS" if rid else "custom",
            "version": ha_version if core else str(installed or data.get("version") or ""),
            "update_entity": updates.get(rid, "") if rid else "",
        }
    return {
        "refreshed": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "ha_version": ha_version,
        "found": [found[c] for c in sorted(found)],
        "uses": uses,
        "integrations": integrations,
        "declared_links": list(rules.get("declared_links") or []),
        "links": links(config, devices, entities, integrations),
    }


if __name__ == "__main__":
    print(json.dumps(main(Path(sys.argv[1] if len(sys.argv) > 1 else "/config")), ensure_ascii=False))
