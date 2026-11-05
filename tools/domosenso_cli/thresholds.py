"""`domosenso thresholds <target>`: before a home sets the Ramka's `thresholds: climate-air` (P3, decision
D2 of docs/2026-11-05-shared-home-decisions.md), the Ramka's live limits and comfort ranges beside
climate-air's, read from the running home. Reads only.

    limit <reading> <fair|poor> ramka <value> climate-air <value> equal|conflict
    comfort <room> <temp_low|temp_high|hum_low|hum_high> ramka <value> climate-air <value> equal|conflict
    missing <entity>          climate-air has no helper for something the Ramka uses
    unmatched <widget label>  a Ramka temperature widget no home room names as its temperature

It ends `ok` when every pair is equal, else `FAIL <n> to resolve`: set climate-air's helper to the
value the household chose (or the Ramka's), then run it again. Seed-once never overwrites a helper
that exists, so a conflict is never resolved by a render."""
from __future__ import annotations

import argparse
import asyncio

from domosenso_cli.build import load_inputs
from domosenso_cli.ha_api import HA
from domosenso_cli.home import HomeConfig
from domosenso_cli.home_inputs import load_home_inputs
from domosenso_cli.report import Reporter
from domosenso_cli.snapshot import pick_target

# The Ramka's helper keys per reading (templates/_air-policy.jinja): the first is fair from, the
# second poor from; the score's are named fair and poor, the others raised and high.
RAMKA_KEYS = {"score": ("fair", "poor"), "co2": ("raised", "high"), "pm2_5": ("raised", "high"),
              "voc": ("raised", "high"), "nox": ("raised", "high")}
# A widget without its own range shows these (cards/lib/climate-widgets.js COMFORT).
COMFORT = {"temp_low": 20.0, "temp_high": 24.0, "hum_low": 40.0, "hum_high": 60.0}
CLIMATE_AIR_KEY = {"temp_low": "temp_low", "temp_high": "temp_high", "hum_low": "humidity_low", "hum_high": "humidity_high"}


def _number(state: dict | None) -> float | None:
    try:
        return float(state["state"]) if state else None
    except (KeyError, TypeError, ValueError):
        return None


def _shown(value: float | None) -> str:
    return "-" if value is None else (f"{value:g}")


def compare(states: dict[str, dict], home: dict | None, prefix: str) -> tuple[list[tuple[str, ...]], int]:
    """The report's lines and how many need a choice, from Home Assistant's states."""
    lines: list[tuple[str, ...]] = []
    problems = 0
    for reading, keys in RAMKA_KEYS.items():
        for i, which in enumerate(("fair", "poor")):
            ramka_id = f"input_number.{prefix}_air_{reading}_{keys[i]}"
            shared_id = f"input_number.climate_air_{reading}_{which}"
            if ramka_id not in states:
                continue  # the Ramka does not show this reading
            if shared_id not in states:
                lines.append(("missing", shared_id))
                problems += 1
                continue
            ramka, shared = _number(states[ramka_id]), _number(states[shared_id])
            same = ramka is not None and ramka == shared
            lines.append(("limit", reading, which, "ramka", _shown(ramka), "climate-air", _shown(shared),
                          "equal" if same else "conflict"))
            problems += 0 if same else 1
    widgets = (states.get(f"sensor.{prefix}_climate_rooms") or {}).get("attributes", {}).get("rooms") or []
    rooms = {r["climate"]["temperature"]: r["id"] for r in (home or {}).get("rooms", []) if r.get("climate")}
    outside = (home or {}).get("outside") or {}
    if outside.get("temperature"):
        rooms[outside["temperature"]] = "outside"  # climate-air's outside range: climate_air_outside_*
    for widget in widgets:
        if not isinstance(widget, dict) or widget.get("type", "temperature") != "temperature" or not widget.get("main"):
            continue
        room = rooms.get(widget["main"])
        if room is None:
            lines.append(("unmatched", str(widget.get("label") or widget["main"])))
            problems += 1
            continue
        for key, default in COMFORT.items():
            shared_id = f"input_number.climate_air_{room}_{CLIMATE_AIR_KEY[key]}"
            if shared_id not in states:
                if key.startswith("hum") and not widget.get("extra"):
                    continue  # a widget without humidity has no humidity range to keep
                lines.append(("missing", shared_id))
                problems += 1
                continue
            own = widget.get(key)
            ramka = float(own) if isinstance(own, (int, float)) and not isinstance(own, bool) else default
            shared = _number(states[shared_id])
            same = shared is not None and ramka == shared
            lines.append(("comfort", room, key, "ramka", _shown(ramka), "climate-air", _shown(shared),
                          "equal" if same else "conflict"))
            problems += 0 if same else 1
    return lines, problems


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("target", help="a target declared in domosenso.yaml")
    parser.add_argument("--prefix", help="the Ramka's prefix (default: its inputs' `prefix`, else ramka)")


async def _states(target) -> dict[str, dict]:
    async with HA.for_target(target) as ha:
        return {s["entity_id"]: s for s in await ha.call("get_states")}


def run(args: argparse.Namespace, rep: Reporter) -> int:
    home = HomeConfig.load(args.home)
    target = pick_target(home, args.target)
    prefix = args.prefix
    if prefix is None:
        entry = home.components.get("ramka")
        prefix = (load_inputs(entry).get("prefix") if entry else None) or "ramka"
    lines, problems = compare(asyncio.run(_states(target)), load_home_inputs(home), prefix)
    for line in lines:
        rep.line(*line)
    return rep.fail(f"{problems} to resolve") if problems else rep.ok()
