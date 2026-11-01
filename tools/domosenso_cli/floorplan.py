"""`domosenso floorplan pull | push` (SPEC-027): the floor plan between the `floorplan` storage
dashboard in Home Assistant and `domosenso/floorplan.json` in the home repository.

The editor in Home Assistant saves into the dashboard, so the repository file is a copy that `pull`
refreshes. `push` writes it back, but never over a plan edited in Home Assistant since the last
`pull` (`.domosenso/floorplan/<target>.pulled.json`): that edit would be lost silently.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from domosenso_cli import cmd_deploy, floorplan_doc as doc
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.report import Reporter
from domosenso_cli.snapshot import pick_target

PLAN_FILE = Path("domosenso") / "floorplan.json"
STATE_DIR = Path(".domosenso") / "floorplan"
TITLE = "Floor plan"
EMPTY = {"schema": doc.SCHEMA_VERSION, "floors": []}


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("action", choices=("pull", "push"))
    parser.add_argument("target", help="a target named in domosenso.yaml")
    parser.add_argument("--out", type=Path, metavar="<file>", help=f"pull: where to write (default {PLAN_FILE})")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--plan", action="store_true", help="push: show what would change; write nothing")
    mode.add_argument("--apply", action="store_true", help="push: back up and write the plan to Home Assistant")
    parser.add_argument("--confirm", metavar="HASH", help="push --apply: the hash of the plan, instead of typing 'production'")


def _shown(home: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(home).as_posix()
    except ValueError:
        return str(path)


def _write(path: Path, value: dict) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    except OSError as exc:
        raise DomosensoError(f"cannot write {path}: {exc.strerror or exc}") from exc


def _read_json(path: Path) -> dict | None:
    if not path.is_file():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise DomosensoError(f"cannot read {path}: {exc}") from exc
    return value if isinstance(value, dict) else None


async def _dashboard(ha) -> tuple[bool, dict | None]:
    """Whether the dashboard exists, and its saved config (None while nothing was ever saved)."""
    listed = await ha.call("lovelace/dashboards/list")
    if not any(d.get("url_path") == doc.URL_PATH for d in listed):
        return False, None
    try:
        return True, await ha.call("lovelace/config", url_path=doc.URL_PATH)
    except DomosensoError:
        # Home Assistant answers "config not found" for a dashboard that was created and never saved.
        return True, None


def _digest(old: dict | None, new: dict) -> str:
    return hashlib.sha256(doc.canonical(old or {}) + b"\0" + doc.canonical(new)).hexdigest()[:12]


async def _pull(args: argparse.Namespace, rep: Reporter) -> int:
    home = HomeConfig.load(args.home)
    target = pick_target(home, args.target)
    async with cmd_deploy.connect(target) as ha:
        exists, config = await _dashboard(ha)
    if not exists:
        raise DomosensoError(f"no floorplan dashboard on {args.target}")
    plan = doc.extract(config)
    if plan is None:
        raise DomosensoError(f"no plan on {args.target}")
    doc.validate(plan)
    for floor in plan["floors"]:
        rep.line("read", "floor", "-" if floor["floor_id"] is None else floor["floor_id"],
                 "rooms", str(len(floor["rooms"])), "points", str(len(floor["points"])))
    out = args.out or args.home / PLAN_FILE
    kept = (_read_json(out) or {}).get("source")  # the traced image lives only in the repository's file
    _write(out, {**plan, **({"source": kept} if kept else {})})
    _write(args.home / STATE_DIR / f"{args.target}.pulled.json", doc.without_source(plan))
    rep.line("wrote", _shown(args.home, out))
    return rep.ok()


def _changed_since_pull(pulled: dict | None, current: dict | None) -> str | None:
    if doc.canonical(pulled or EMPTY) == doc.canonical(current or EMPTY):
        return None
    lines = doc.diff(pulled, current or EMPTY)
    rooms = sum(1 for line in lines if line[0] == "room")
    points = sum(1 for line in lines if line[0] == "point")
    return f"{rooms} rooms, {points} points"


async def _push(args: argparse.Namespace, rep: Reporter) -> int:
    home = HomeConfig.load(args.home)
    target = pick_target(home, args.target)
    new = _read_json(args.home / PLAN_FILE)
    if new is None:
        raise DomosensoError(f"no plan in {PLAN_FILE}; pull or write one first")
    doc.validate(new)
    async with cmd_deploy.connect(target) as ha:
        exists, config = await _dashboard(ha)
        current = doc.extract(config)
        changed = _changed_since_pull(_read_json(args.home / STATE_DIR / f"{args.target}.pulled.json"), current)
        if changed:
            raise DomosensoError(f"changed on target since pull: {changed}")
        known = {a["area_id"] for a in await ha.call("config/area_registry/list")}
        missing = list(dict.fromkeys(r["area_id"] for f in new["floors"] for r in f["rooms"] if r["area_id"] not in known))
        if not exists:
            rep.line("dashboard", "create", doc.URL_PATH)
        for line in doc.diff(current, new):
            rep.line(*line)
        for area in missing:
            rep.line("area", "missing", area)
        if missing:
            raise DomosensoError(f"area missing: {', '.join(missing)}")
        if current is not None and doc.canonical(current) == doc.canonical(new):
            rep.line("nothing to push")
            return rep.ok()
        digest = _digest(current, new)
        rep.line("hash", digest)
        if args.plan:
            return rep.ok()
        await cmd_deploy.confirm_production(digest, args.confirm, args.target, rep.json_mode, "floorplan")
        if config is not None:
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup = args.home / STATE_DIR / f"{args.target}-{stamp}.json"
            _write(backup, config)
            rep.line("backup", _shown(args.home, backup))
        if not exists:
            await ha.call("lovelace/dashboards/create", url_path=doc.URL_PATH, title=TITLE, icon="mdi:floor-plan",
                          show_in_sidebar=True, require_admin=False)
        await ha.call("lovelace/config/save", url_path=doc.URL_PATH, config=doc.dashboard_config(new))
    _write(args.home / STATE_DIR / f"{args.target}.pulled.json", doc.without_source(new))
    rep.line("pushed")
    return rep.ok()


def run(args: argparse.Namespace, rep: Reporter) -> int:
    if args.action == "pull":
        if args.plan or args.apply or args.confirm:
            raise DomosensoError("--plan, --apply and --confirm go with push")
        return asyncio.run(_pull(args, rep))
    if args.out:
        raise DomosensoError("--out goes with pull")
    if not (args.plan or args.apply):
        raise DomosensoError("push needs --plan or --apply")
    return asyncio.run(_push(args, rep))
