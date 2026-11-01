"""Device categories (SPEC-028 Amendment 5): what a device is for, catalog-wide.

`categories/<id>.yaml` define them with SPEC-010's rules (the same fields as `kinds/` and
`devices/`, which they may name). This module resolves them into one index, the form the floor plan
card ships as `lib/categories.json` (tools/category_index.py), and tells a device's category. The
card's `lib/categories.js` implements the same test; tests/fixtures/category-cases.json proves both
agree.

A device here is SPEC-010's scan form (`hwscan._devices`): `integrations`, `manufacturer`, `model`,
`model_id`, `entity_domains`, `device_classes`, `entity_names`, plus `is_hub` (other enabled devices
name it as `via_device_id`).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from domosenso_cli.hwscan import _list, matches

# Fields of a rule that say nothing about the device: kept out of the index.
_NOT_TESTS = ("note", "certainty")


def _rules(data: dict) -> list[dict]:
    # A config-entry rule (`entry`) tells an integration, not a device: it has no place here.
    return [{k: v for k, v in rule.items() if k not in _NOT_TESTS} for rule in data.get("match") or [] if "entry" not in rule]


def build(root: Path) -> dict[str, Any]:
    """The categories by `order`, each with every rule that puts a device in it, resolved."""
    def load(directory: str) -> dict[str, dict]:
        out = {}
        for path in sorted((root / directory).glob("*.yaml")):
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            out[data["id"]] = data
        return out

    kinds, devices, categories = load("kinds"), load("devices"), load("categories")
    index = []
    for data in sorted(categories.values(), key=lambda c: (c["order"], c["id"])):
        rules = [r for kid in data.get("kinds", []) for r in _rules(kinds[kid])]
        rules += [r for did in data.get("devices", []) for r in _rules(devices[did])]
        rules += _rules(data)
        index.append({
            "id": data["id"], "order": data["order"], "names": data["names"], "colour": data["colour"],
            "marker": data["marker"], "placeable": data.get("placeable", True),
            "fallback": data.get("fallback", False), "hub": data.get("hub", False), "rules": rules,
        })
    return {"categories": index}


def rule_matches(rule: dict, dev: dict) -> bool:
    """SPEC-010's test, plus `only_entity_domain`: the device has entities, all in these domains."""
    if "only_entity_domain" in rule:
        domains = set(dev["entity_domains"])
        if not domains or not domains <= set(_list(rule["only_entity_domain"])):
            return False
    return matches(rule, dev)


def category_of(dev: dict, index: dict[str, Any]) -> dict[str, str]:
    """{"id", "marker"} of the first category whose rules or hub test match, else the fallback."""
    for cat in index["categories"]:
        if cat["hub"] and dev.get("is_hub"):
            return {"id": cat["id"], "marker": cat["marker"]}
        for rule in cat["rules"]:
            if rule_matches(rule, dev):
                return {"id": cat["id"], "marker": rule.get("marker", cat["marker"])}
    fallback = next(c for c in index["categories"] if c["fallback"])
    return {"id": fallback["id"], "marker": fallback["marker"]}
