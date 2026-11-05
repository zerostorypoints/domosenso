"""The home's shared inputs (rooms, outside sensors, weather) named by `home_inputs:`."""
from __future__ import annotations

import hashlib
import json

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


def digest(home: HomeConfig) -> str | None:
    """The sha256 of the home inputs' content (canonical JSON: a comment or YAML style is no change),
    or None when `domosenso.yaml` names no file. A consumer's lock entry records the one it was
    rendered from (decision record of #219, H1)."""
    data = load_home_inputs(home)
    if data is None:
        return None
    canonical = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def stale_consumers(home: HomeConfig, lock) -> list[str]:
    """The components rendered from home inputs other than the current ones: a dev render's record
    when it has one, else the lock's. A record without a digest (a lock from before) is not judged."""
    from domosenso_cli import dev_render  # noqa: PLC0415 (dev_render imports nothing of this module)
    current = digest(home)
    dev = dev_render.load(home.root)
    stale = []
    for cid in sorted(set(lock.components) | set(dev)):
        recorded = (dev.get(cid) or {}).get("home_inputs") if cid in dev else lock.components[cid].home_inputs
        if recorded is not None and recorded != current:
            stale.append(cid)
    return stale
