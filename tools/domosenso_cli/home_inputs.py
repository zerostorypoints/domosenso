"""The home's shared inputs (rooms, outside sensors, weather) named by `home_inputs:`."""
from __future__ import annotations

from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.schema import load_validated
from domosenso_render import room_id_problem

PREFIX = "home-inputs: "


def load_home_inputs(home: HomeConfig) -> dict | None:
    """The validated mapping, or None when `domosenso.yaml` names no file."""
    if home.home_inputs is None:
        return None
    try:
        data = load_validated(home.home_inputs, "home-inputs")
    except DomosensoError as exc:
        raise DomosensoError(f"{PREFIX}{exc}") from exc
    problem = room_id_problem(data)
    if problem is not None:
        raise DomosensoError(f"{PREFIX}{problem}")
    return data
