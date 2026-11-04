"""The home's shared inputs (rooms, outside sensors, weather) named by `home_inputs:`."""
from __future__ import annotations

from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.schema import load_validated

PREFIX = "home-inputs: "


def load_home_inputs(home: HomeConfig) -> dict | None:
    """The validated mapping, or None when `domosenso.yaml` names no file."""
    if home.home_inputs is None:
        return None
    try:
        data = load_validated(home.home_inputs, "home-inputs")
    except DomosensoError as exc:
        raise DomosensoError(f"{PREFIX}{exc}") from exc
    seen: set[str] = set()
    for room in data.get("rooms", []):
        if room["id"] in seen:
            raise DomosensoError(f"{PREFIX}rooms: duplicate id {room['id']}")
        seen.add(room["id"])
    return data
