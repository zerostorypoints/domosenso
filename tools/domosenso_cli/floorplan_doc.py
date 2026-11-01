"""The floor plan document (SPEC-027): validation, its place in a dashboard config, a canonical
form for comparing and the diff `floorplan push` prints."""
from __future__ import annotations

import json

from jsonschema import Draft202012Validator

from domosenso_cli.errors import DomosensoError
from domosenso_cli.schema import SCHEMAS, describe, key_path

SCHEMA_VERSION = 1
URL_PATH = "floorplan"
CARD_TYPE = "custom:floorplan-card"

_DECIMALS = 3  # a millimetre; finer values are drag noise and would make every push look changed


def validate(doc: dict) -> None:
    # The major is checked before the schema so a newer document gets a clear message, not a
    # string of unknown-key errors.
    major = doc.get("schema") if isinstance(doc, dict) else None
    if isinstance(major, int) and not isinstance(major, bool) and major != SCHEMA_VERSION:
        raise DomosensoError(f"schema {major} not supported")
    schema = json.loads((SCHEMAS / "floorplan.schema.json").read_text(encoding="utf-8"))
    errors = sorted(
        Draft202012Validator(schema).iter_errors(doc),
        key=lambda e: (len(e.absolute_path), key_path(e.absolute_path)),
    )
    if errors:
        raise DomosensoError(describe(errors[0]))


def without_source(doc: dict) -> dict:
    return {key: value for key, value in doc.items() if key != "source"}


def dashboard_config(doc: dict) -> dict:
    return {
        "title": "Floor plan",
        "views": [{"path": "plan", "type": "panel",
                   "cards": [{"type": CARD_TYPE, "plan": without_source(doc)}]}],
    }


def extract(dashboard_config: dict | None) -> dict | None:
    """The `plan` of the card of type CARD_TYPE, or None."""
    if not isinstance(dashboard_config, dict):
        return None
    for view in dashboard_config.get("views") or []:
        for card in (view or {}).get("cards") or []:
            if isinstance(card, dict) and card.get("type") == CARD_TYPE:
                plan = card.get("plan")
                return plan if isinstance(plan, dict) else None
    return None


def _round(value):
    if isinstance(value, float):
        return round(value, _DECIMALS) + 0.0  # + 0.0 turns -0.0 into 0.0
    if isinstance(value, list):
        return [_round(item) for item in value]
    if isinstance(value, dict):
        return {key: _round(item) for key, item in value.items()}
    return value


def canonical(doc: dict) -> bytes:
    return json.dumps(_round(without_source(doc)), sort_keys=True, separators=(",", ":")).encode()


def point_key(point: dict) -> str:
    return point.get("device_id") or point["entity_id"]


def _floors(doc: dict | None) -> dict:
    return {floor["floor_id"]: floor for floor in (doc or {}).get("floors", [])}


def diff(old: dict | None, new: dict) -> list[tuple[str, ...]]:
    old_floors, new_floors = _floors(old), _floors(new)
    # Floors of the new document in its order; a floor only in the old one goes last, as all removals.
    order = list(new_floors) + [fid for fid in old_floors if fid not in new_floors]
    lines: list[tuple[str, ...]] = []
    for floor_id in order:
        label = "-" if floor_id is None else floor_id
        old_floor = old_floors.get(floor_id, {"rooms": [], "points": []})
        new_floor = new_floors.get(floor_id, {"rooms": [], "points": []})
        lines += _compare("room", "area_id", "change", old_floor["rooms"], new_floor["rooms"],
                          label, lambda r: _round(r["polygon"]))
        lines += _compare("point", None, "move", old_floor["points"], new_floor["points"], label,
                          lambda p: (_round(p["x"]), _round(p["y"]), p["placed"]))
    return lines


def _compare(kind, id_field, changed, old_items, new_items, floor, signature):
    key = (lambda item: item[id_field]) if id_field else point_key
    old_by, new_by = {key(i): i for i in old_items}, {key(i): i for i in new_items}
    lines = []
    for name, item in old_by.items():
        if name not in new_by:
            lines.append((kind, "remove", floor, name))
        elif signature(item) != signature(new_by[name]):
            lines.append((kind, changed, floor, name))
    lines += [(kind, "add", floor, name) for name in new_by if name not in old_by]
    return lines
