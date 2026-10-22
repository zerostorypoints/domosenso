"""The hardware scan behind `recommend --from-ha` (SPEC-010): a running Home Assistant's devices,
matched to catalog device ids and kinds by the `match:` rules in `devices/` and `kinds/`.

Read-only: four reads of Home Assistant, nothing written anywhere. The rules are read from the
catalog's HEAD, never its working tree; they say what hardware is, not what gets installed, so they
are not tied to a component's tag.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from fnmatch import fnmatchcase
from typing import Any

import yaml

from domosenso_cli.catalog import Catalog
from domosenso_cli.errors import DomosensoError

RULE_DIRS = ("devices", "kinds")


@dataclass
class Rules:
    commit: str
    # (source path, token, rules) in the order they are tried: devices/ then kinds/, each by token.
    files: list[tuple[str, str, list[dict]]] = field(default_factory=list)

    def count(self, directory: str) -> int:
        return sum(1 for path, _, _ in self.files if path.startswith(directory + "/"))


def load_rules(catalog: Catalog) -> Rules:
    rules = Rules(catalog.head_commit()[:7])
    for directory in RULE_DIRS:
        for path, raw in catalog.head_files(directory).items():
            try:
                data = yaml.safe_load(raw)
            except yaml.YAMLError as exc:
                raise DomosensoError(f"{path}: not valid YAML: {exc}") from exc
            if isinstance(data, dict) and data.get("match"):
                rules.files.append((path, data["id"], data["match"]))
    return rules


async def read(ha: Any) -> dict[str, Any]:
    return {
        "entries": await ha.call("config_entries/get"),
        "devices": await ha.call("config/device_registry/list"),
        "entities": await ha.call("config/entity_registry/list"),
        "states": await ha.rest_get("/api/states"),
    }


def _list(value: Any) -> list[str]:
    if value is None:
        return []
    return [str(v) for v in value] if isinstance(value, list) else [str(value)]


def _glob(value: str | None, patterns: Any) -> bool:
    return value is not None and any(fnmatchcase(value.lower(), p.lower()) for p in _list(patterns))


def matches(rule: dict, dev: dict) -> bool:
    """True when every field the rule gives matches the device (`dev` as `scan` builds it)."""
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
    return all(any(_glob(name, pattern) for name in dev["entity_names"]) for pattern in _list(rule.get("entity_names")))


def _devices(raw: dict[str, Any]) -> list[dict]:
    """The hardware devices: services and disabled devices left out, each with what the rules test."""
    domain = {e["entry_id"]: e["domain"] for e in raw["entries"]}
    state_class = {s["entity_id"]: (s.get("attributes") or {}).get("device_class") for s in raw["states"]}
    entities: dict[str, list[dict]] = {}
    for entity in raw["entities"]:
        if entity.get("device_id"):
            entities.setdefault(entity["device_id"], []).append(entity)
    found = []
    for dev in raw["devices"]:
        if dev.get("entry_type") == "service" or dev.get("disabled_by"):
            continue
        own = entities.get(dev["id"], [])
        classes = {e.get("device_class") or e.get("original_device_class") or state_class.get(e["entity_id"]) for e in own}
        found.append({
            "name": dev.get("name"), "name_by_user": dev.get("name_by_user"),
            "manufacturer": dev.get("manufacturer"), "model": dev.get("model"), "model_id": dev.get("model_id"),
            "integrations": sorted({domain[c] for c in dev.get("config_entries", []) if c in domain}),
            "entity_domains": {e["entity_id"].split(".", 1)[0] for e in own},
            "device_classes": classes - {None},
            "entity_names": [e.get("original_name") for e in own if e.get("original_name")],
            "matches": [],
        })
    return found


def scan(raw: dict[str, Any], rules: Rules, confirmed: set[str] = frozenset()) -> dict[str, Any]:
    """What `recommend` prints and counts: `found` and `maybe` per token (`count`, `via`, `devices`
    as indexes into `devices`), `unmatched` per integration, and the devices themselves. A `maybe`
    token in `confirmed` (given with `--have`) is not asked about again, and its devices are matched."""
    devices = _devices(raw)
    enabled_entries = [e["domain"] for e in raw["entries"] if not e.get("disabled_by")]
    tally: dict[str, dict[str, dict]] = {"found": {}, "maybe": {}}

    def hit(certainty: str, token: str, via: list[str], index: int | None, count: int = 1) -> None:
        entry = tally[certainty].setdefault(token, {"count": 0, "via": set(), "devices": []})
        if index is None or index not in entry["devices"]:
            entry["count"] += count
            entry["via"] |= set(via)
            if index is not None:
                entry["devices"].append(index)

    for path, token, rule_list in sorted(rules.files, key=lambda f: (RULE_DIRS.index(f[0].split("/")[0]), f[1])):
        for n, rule in enumerate(rule_list):
            certainty = rule.get("certainty", "found")
            if "entry" in rule:
                count = enabled_entries.count(rule["entry"])
                if count:
                    hit(certainty, token, [rule["entry"]], None, count)
                continue
            for index, dev in enumerate(devices):
                if matches(rule, dev):
                    if not any(m["token"] == token and m["certainty"] == certainty for m in dev["matches"]):
                        dev["matches"].append({"token": token, "certainty": certainty, "source": f"{path}#{n}"})
                    hit(certainty, token, dev["integrations"], index)

    for token in {*tally["found"], *confirmed}:
        tally["maybe"].pop(token, None)
    unmatched: dict[str, list[int]] = {}
    for index, dev in enumerate(devices):
        accounted = any(m["token"] in tally["found"] if m["certainty"] == "found"
                        else m["token"] in tally["maybe"] or m["token"] in confirmed for m in dev["matches"])
        if not accounted:
            for integration in dev["integrations"] or ["-"]:
                unmatched.setdefault(integration, []).append(index)
    public = [{k: dev[k] for k in ("name", "name_by_user", "manufacturer", "model", "model_id", "integrations", "matches")}
              for dev in devices]
    return {
        "rules_commit": rules.commit,
        "found": {t: {**e, "via": sorted(e["via"])} for t, e in sorted(tally["found"].items())},
        "maybe": {t: {**e, "via": sorted(e["via"])} for t, e in sorted(tally["maybe"].items())},
        "unmatched": dict(sorted(unmatched.items())),
        "devices": public,
    }
