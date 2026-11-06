"""`domosenso areas <target>`: the home's areas as Pocket sees them (SPEC-038 §3.8), read from the running
home: Home Assistant's area, floor, device and entity registries, the states, and Pocket's home store
(frontend system data `domosenso-pocket-home`). Reads only. One line per finding:

    area <id> "<name>" floor <floor|-> type <inside|outside|none> (<source>)
    unchecked <id> (<source>)     the area is left out of the checks (its setting; on by default)
    main <id> <kind> <entity> [<entity> ...] (<source>)
    candidates <id> <kind> <n>: choose one
    warn inputs room <room id>: no HA area <area>
    fail inputs <entity>: no such entity
    quick <item> (<inputs|default>)

`quick` lines are the home's default Quick actions on Home (SPEC-038 §3.11): Pocket's input
quick_actions, else each area with lights and All off; a person's own list lives in their own
settings and is not read here.

With `--json` the document's `data` has, per area, every kind's candidates with their device's name,
manufacturer, model and readings (entity and name), the choice and its source; and `quick`: the
default and every action that could be added, by group, with names and areas. That is what the skill
`set-up-areas` reads to suggest a main sensor and a list of Quick actions, for the owner to confirm.

A source is `pocket`, `home-assistant`, `inputs`, `auto` (the only candidate, recorded by an
administrator's Pocket the first time it sees it) or `default` (every area is Inside until set
otherwise; `none`, Not assigned, hides it from Pocket's views). It ends `ok`, or `FAIL <n> to resolve` when an input
names an entity Home Assistant does not have. `warn` lines never fail it: an empty new home passes.

The kinds come from Pocket's own declaration (components/pocket/cards/lib/kinds.json), so this
command, the app and the `set-up-areas` skill read one table; the precedence is Pocket's
(cards/lib/home-model.js): the store, then the area's own field (climate), then the inputs, then the
only candidate."""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from domosenso_cli.build import load_inputs
from domosenso_cli.ha_api import HA
from domosenso_cli.home import HomeConfig
from domosenso_cli.home_inputs import load_home_inputs
from domosenso_cli.report import Reporter
from domosenso_cli.snapshot import pick_target

KINDS_FILE = Path(__file__).resolve().parents[2] / "components" / "pocket" / "cards" / "lib" / "kinds.json"
QUICK_FILE = KINDS_FILE.with_name("quick-actions.json")
STORE_KEY = "domosenso-pocket-home"
READING_KINDS = ("climate", "air")
TYPES = ("inside", "outside", "none")


def load_kinds() -> list[dict]:
    return json.loads(KINDS_FILE.read_text(encoding="utf-8"))["kinds"]


def _shown(reg: dict) -> bool:
    return not (reg.get("hidden_by") or reg.get("hidden") or reg.get("disabled_by") or reg.get("entity_category"))


def _ordered(areas: list[dict], floors: list[dict]) -> list[dict]:
    level = {f["floor_id"]: f.get("level") for f in floors}

    def key(item: tuple[int, dict]) -> tuple[float, int]:
        i, area = item
        floor = area.get("floor_id")
        if floor not in level:
            return (float("inf"), i)
        value = level[floor]
        return (float(value) if isinstance(value, (int, float)) else float(2**53), i)

    return [a for _, a in sorted(enumerate(areas), key=key)]


def _candidates(kind: dict, area_id: str, sensors: list[dict], states: dict) -> list[dict]:
    def cls(reg: dict) -> str | None:
        return (states.get(reg["entity_id"]) or {}).get("attributes", {}).get("device_class")

    if kind["pick"] == "entity":
        return [{"id": r["entity_id"], "readings": {kind["id"]: r["entity_id"]}} for r in sensors if cls(r) in kind["classes"]]
    groups: dict[str, dict] = {}
    for reg in sensors:
        reading = next((r for r in kind["readings"] if cls(reg) in r["classes"]), None)
        if not reading:
            continue
        key = reg.get("device_id") or f"entity:{reg['entity_id']}"
        groups.setdefault(key, {"id": key, "readings": {}})["readings"].setdefault(reading["id"], reg["entity_id"])
    required = [r["id"] for r in kind["readings"] if r.get("required")]
    return [g for g in groups.values() if all(r in g["readings"] for r in required)]


def _name(states: dict, entities: dict, entity: str) -> str:
    reg = entities.get(entity) or {}
    return ((states.get(entity) or {}).get("attributes", {}).get("friendly_name") or reg.get("name")
            or reg.get("original_name") or entity)


def report(registry: dict, store: dict | None, home: dict | None, quick_inputs: list | None = None,
           data: list | None = None) -> tuple[list[tuple[str, ...]], int]:
    """The lines and how many `fail` lines, from the registries ({areas, floors, devices, entities,
    states}), the home store's value, the home inputs and Pocket's input quick_actions. `data`, when
    given, receives the structured details (per area, then one `quick` entry) for `--json`."""
    kinds = load_kinds()
    states = {s["entity_id"]: s for s in registry.get("states", [])}
    devices = {d["id"]: d for d in registry.get("devices", [])}
    areas = registry.get("areas", [])
    area_ids = {a["area_id"] for a in areas}
    floors = {f["floor_id"]: f for f in registry.get("floors", [])}
    store = store or {}
    stored_areas = store.get("areas") or {}
    picked = store.get("picked") or {}

    by_area: dict[str, list[dict]] = {}
    for reg in registry.get("entities", []):
        if not reg.get("entity_id", "").startswith("sensor.") or not _shown(reg):
            continue
        device = devices.get(reg.get("device_id")) if reg.get("device_id") else None
        if device and device.get("disabled_by"):
            continue
        area = reg.get("area_id") or (device or {}).get("area_id")
        if area:
            by_area.setdefault(area, []).append(reg)

    entities = {e["entity_id"]: e for e in registry.get("entities", []) if e.get("entity_id")}
    lit: list[str] = []
    defaults: dict[str, dict] = {}
    lines: list[tuple[str, ...]] = []
    fails = 0
    home = home or {}
    for room in home.get("rooms") or []:
        area = room.get("area") or room.get("id")
        defaults[area] = room
        if area not in area_ids:
            lines.append(("warn", "inputs", "room", f"{room.get('id')}:", "no", "HA", "area", str(area)))
    outside = home.get("outside") or {}
    if outside.get("area"):
        room = defaults.setdefault(outside["area"], {"id": outside["area"]})
        room.setdefault("type", "outside")
        if "climate" not in room and outside.get("temperature"):
            room["climate"] = {k: outside[k] for k in ("temperature", "humidity") if outside.get(k)}

    # Every entity the inputs name exists in Home Assistant.
    named: list[str] = []
    for room in defaults.values():
        for field in READING_KINDS:
            named += [e for e in (room.get(field) or {}).values() if isinstance(e, str)]
    for entity in dict.fromkeys(named):
        if entity not in states:
            lines.append(("fail", "inputs", f"{entity}:", "no", "such", "entity"))
            fails += 1

    for area in _ordered(areas, list(floors.values())):
        aid = area["area_id"]
        given = defaults.get(aid, {})
        stored = stored_areas.get(aid) or {}
        if stored.get("type") in TYPES:
            area_type, type_source = stored["type"], "pocket"
        elif given.get("type") in TYPES:
            area_type, type_source = given["type"], "inputs"
        else:
            area_type, type_source = "inside", "default"
        floor = area.get("floor_id") or "-"
        lines.append(("area", aid, json.dumps(area.get("name") or aid, ensure_ascii=False), "floor", floor, "type",
                      area_type, f"({type_source})"))
        # In the checks unless the home switched it off (SPEC-038 §3.2); the type never decides.
        if isinstance(stored.get("checked"), bool):
            checked, checked_source = stored["checked"], "pocket"
        elif isinstance(given.get("checked"), bool):
            checked, checked_source = given["checked"], "inputs"
        else:
            checked, checked_source = True, "default"
        if not checked:
            lines.append(("unchecked", aid, f"({checked_source})"))
        entry = {"area": aid, "name": area.get("name") or aid, "floor": area.get("floor_id"), "type": area_type,
                 "type_source": type_source, "checked": checked, "checked_source": checked_source, "kinds": {}}
        for kind in kinds:
            candidates = _candidates(kind, aid, by_area.get(aid, []), states)
            choice, source = _resolve(kind, area, given, stored, aid in picked and kind["id"] in picked[aid], candidates)
            if choice:
                lines.append(("main", aid, kind["id"], *choice, f"({source})"))
            elif source is None and len(candidates) > 1:
                lines.append(("candidates", aid, kind["id"], f"{len(candidates)}:", "choose", "one"))
            entry["kinds"][kind["id"]] = {"choice": list(choice), "source": source, "candidates": [
                {"id": c["id"], **_device_facts(devices.get(c["id"])),
                 "readings": {r: {"entity": e, "name": _name(states, entities, e)} for r, e in c["readings"].items()}}
                for c in candidates]}
        if data is not None:
            data.append(entry)
        if area_type != "none" and _has_lights(aid, given, registry, devices):
            lit.append(aid)

    # Quick actions: the home's default, and everything that could be added (for the skill).
    table = json.loads(QUICK_FILE.read_text(encoding="utf-8"))
    defaults_quick = list(quick_inputs or [])
    quick_source = "inputs" if defaults_quick else "default"
    if not defaults_quick:
        defaults_quick = [f"area:{a}" for a in lit] + ["all_off"]
    for item in defaults_quick:
        lines.append(("quick", item, f"({quick_source})"))
    if data is not None:
        domains = {d["domain"]: d["group"] for d in table["domains"]}
        groups: dict[str, list[dict]] = {g: [] for g in table["groups"]}
        groups["areas"] = [{"id": f"area:{a}"} for a in lit]
        for entity in sorted(states):
            group = domains.get(entity.split(".")[0])
            reg = entities.get(entity)
            if group and (reg is None or _shown(reg)):
                groups[group].append({"id": entity, "name": _name(states, entities, entity), "area": _area_of(reg, devices)})
        data.append({"quick": {"default": defaults_quick, "source": quick_source,
                               "candidates": {g: items for g, items in groups.items() if items}}})
    return lines, fails


def _device_facts(device: dict | None) -> dict:
    if not device:
        return {"device": None}
    return {"device": device.get("name_by_user") or device.get("name"), "manufacturer": device.get("manufacturer"),
            "model": device.get("model")}


def _area_of(reg: dict | None, devices: dict) -> str | None:
    if not reg:
        return None
    return reg.get("area_id") or (devices.get(reg.get("device_id")) or {}).get("area_id")


def _has_lights(area_id: str, given: dict, registry: dict, devices: dict) -> bool:
    """Pocket's default Quick tile for an area: it has lights (the inputs', else a shown light in it)."""
    if given.get("lights"):
        return True
    return any(r.get("entity_id", "").startswith("light.") and _shown(r) and _area_of(r, devices) == area_id
               for r in registry.get("entities", []))


def _resolve(kind: dict, area: dict, given: dict, stored: dict, was_picked: bool, candidates: list[dict]):
    """(entities, source) of the area's main sensor of a kind, as Pocket resolves it; ((), source)
    for a choice of None, ((), None) when nothing chose."""
    value = stored.get(kind["id"])
    if value == "none":
        return (), "pocket"
    if kind.get("ha"):
        fields = [area.get(f) for f in kind["fields"].values() if area.get(f)]
        if fields:
            return tuple(fields), "home-assistant"
    elif isinstance(value, str) and value:
        found = next((c for c in candidates if c["id"] == value), None)
        readings = dict(found["readings"]) if found else {}
        readings.update({k: v for k, v in (stored.get(f"{kind['id']}_readings") or {}).items() if v})
        return (tuple(readings.values()) or (value,)), "pocket"
    default = given.get(kind["id"])
    if isinstance(default, dict) and any(default.values()):
        return tuple(v for v in default.values() if v), "inputs"
    if isinstance(default, str) and default:
        return (default,), "inputs"
    if was_picked:
        return (), "pocket"
    if len(candidates) == 1:
        return tuple(candidates[0]["readings"].values()), "auto"
    return (), None


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("target", help="a target declared in domosenso.yaml")


async def _read(target) -> tuple[dict, dict | None]:
    async with HA.for_target(target) as ha:
        registry = {
            "areas": await ha.call("config/area_registry/list"),
            "floors": await ha.call("config/floor_registry/list"),
            "devices": await ha.call("config/device_registry/list"),
            "entities": await ha.call("config/entity_registry/list"),
            "states": await ha.call("get_states"),
        }
        stored = await ha.call("frontend/get_system_data", key=STORE_KEY)
    return registry, (stored or {}).get("value")


def run(args: argparse.Namespace, rep: Reporter) -> int:
    home = HomeConfig.load(args.home)
    target = pick_target(home, args.target)
    registry, store = asyncio.run(_read(target))
    entry = home.components.get("pocket")
    quick_inputs = (load_inputs(entry).get("quick_actions") if entry else None) or []
    lines, fails = report(registry, store, load_home_inputs(home), quick_inputs, rep.data)
    for line in lines:
        rep.line(*line)
    return rep.fail(f"{fails} to resolve") if fails else rep.ok()
