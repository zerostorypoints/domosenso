"""`domosenso floorplan pull | push | preview` (SPEC-028): the floor plan between the `floorplan`
storage dashboard in Home Assistant and `domosenso/floorplan.json` in the home repository, and the
editor against a home's real data (`preview`, Amendment 6: floorplan_preview.py).

The editor in Home Assistant saves into the dashboard, so the repository file is a copy that `pull`
refreshes. `push` writes it back, but never over a plan edited in Home Assistant since the last
`pull` (`.domosenso/floorplan/<target>.pulled.json`): that edit would be lost silently.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

from domosenso_cli import cmd_deploy, floorplan_doc as doc, floorplan_preview as preview
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.lock import Lock
from domosenso_cli.report import Reporter
from domosenso_cli.snapshot import NO_CONFIG, pick_target

PLAN_FILE = Path("domosenso") / "floorplan.json"
STATE_DIR = Path(".domosenso") / "floorplan"
TITLE = "Floor plan"
EMPTY = {"schema": doc.SCHEMA_VERSION, "floors": []}


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("action", choices=("pull", "push", "preview"))
    parser.add_argument("target", help="a target named in domosenso.yaml")
    parser.add_argument("--out", type=Path, metavar="<file>", help=f"pull: where to write (default {PLAN_FILE})")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--plan", action="store_true", help="push: show what would change; write nothing")
    mode.add_argument("--apply", action="store_true", help="push: back up and write the plan to Home Assistant")
    parser.add_argument("--confirm", metavar="HASH", help="push --apply: the hash of the plan, instead of typing 'production'")
    parser.add_argument("--port", type=int, default=8130, help="preview: the port on 127.0.0.1 (default 8130)")
    parser.add_argument("--no-open", action="store_true", help="preview: do not open the page in a browser")


def _shown(home: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(home).as_posix()
    except ValueError:
        return str(path)


async def _dashboard(ha) -> tuple[bool, dict | None]:
    """Whether the dashboard exists, and its saved config (None while nothing was ever saved)."""
    listed = await ha.call("lovelace/dashboards/list")
    if not any(d.get("url_path") == doc.URL_PATH for d in listed):
        return False, None
    try:
        return True, await ha.call("lovelace/config", url_path=doc.URL_PATH)
    except DomosensoError as exc:
        # Home Assistant answers config_not_found for a dashboard that was created and never saved;
        # any other failure (a timeout, a dropped socket) must not read as "no plan", or push would
        # overwrite a plan it could not read.
        if not NO_CONFIG.match(str(exc)):
            raise
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
    doc.write_plan_file(out, plan)
    doc.write_json(args.home / STATE_DIR / f"{args.target}.pulled.json", doc.without_source(plan))
    rep.line("wrote", _shown(args.home, out))
    return rep.ok()


def _plan_on_target(config: dict | None, target: str) -> dict | None:
    plan = doc.extract(config)
    if plan is not None:
        try:
            doc.validate(plan)
        except DomosensoError as exc:
            raise DomosensoError(f"plan on {target}: {exc}") from exc
    return plan


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
    new = doc.read_json(args.home / PLAN_FILE)
    if new is None:
        raise DomosensoError(f"no plan in {PLAN_FILE}; pull or write one first")
    doc.validate(new)
    async with cmd_deploy.connect(target) as ha:
        exists, config = await _dashboard(ha)
        current = _plan_on_target(config, args.target)
        changed = _changed_since_pull(doc.read_json(args.home / STATE_DIR / f"{args.target}.pulled.json"), current)
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
        # The card may have saved while the human read the plan or typed `production`; read again so
        # that save is neither overwritten nor missing from the backup.
        exists, config = await _dashboard(ha)
        changed = _changed_since_pull(current, _plan_on_target(config, args.target))
        if changed:
            raise DomosensoError(f"changed on target since pull: {changed}")
        if config is not None:
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup = args.home / STATE_DIR / f"{args.target}-{stamp}.json"
            doc.write_json(backup, config)
            rep.line("backup", _shown(args.home, backup))
        if not exists:
            await ha.call("lovelace/dashboards/create", url_path=doc.URL_PATH, title=TITLE, icon="mdi:floor-plan",
                          show_in_sidebar=True, require_admin=False,
                          allow_single_word=True)  # HA wants a hyphen in url_path otherwise
        await ha.call("lovelace/config/save", url_path=doc.URL_PATH, config=doc.dashboard_config(new))
    doc.write_json(args.home / STATE_DIR / f"{args.target}.pulled.json", doc.without_source(new))
    rep.line("pushed")
    return rep.ok()


async def _preview(args: argparse.Namespace, rep: Reporter) -> int:
    home = HomeConfig.load(args.home)
    target = pick_target(home, args.target)
    plan = doc.read_json(args.home / PLAN_FILE)
    if plan is None:
        raise DomosensoError(f"no plan in {PLAN_FILE}; pull or write one first")
    doc.validate(plan)
    locked = Lock.load(args.home).components.get("floorplan")
    card = preview.card_dir(home.config_dir, locked.version if locked else None)
    async with cmd_deploy.connect(target) as ha:
        raw = await preview.read_home(ha)
        hass = preview.build_hass(raw)
        rep.line(f"read {args.target}:", "areas", str(len(hass["areas"])), "devices", str(len(hass["devices"])),
                 "entities", str(len(hass["entities"])), "states", str(len(hass["states"])))
        page = preview.Preview(hass, preview.entries(raw), args.home / PLAN_FILE, card, lambda line: rep.line(*line),
                               PLAN_FILE.as_posix(), target_url=target.url)
        try:
            server = preview.start_server(page, args.port)
        except OSError as exc:
            raise DomosensoError(f"port {args.port} in use") from exc
        url = f"http://127.0.0.1:{server.server_address[1]}/?key={page.key}"
        rep.line("preview", url)
        if not args.no_open:
            webbrowser.open(url)
        try:
            await preview.follow(ha, page)
        finally:
            server.shutdown()
    return rep.ok()


def run(args: argparse.Namespace, rep: Reporter) -> int:
    if args.action == "preview":
        if args.plan or args.apply or args.confirm:
            raise DomosensoError("--plan, --apply and --confirm go with push")
        if args.out:
            raise DomosensoError("--out goes with pull")
        try:
            return asyncio.run(_preview(args, rep))
        except KeyboardInterrupt:
            rep.line("stopped")
            return rep.ok()
    if args.action == "pull":
        if args.plan or args.apply or args.confirm:
            raise DomosensoError("--plan, --apply and --confirm go with push")
        return asyncio.run(_pull(args, rep))
    if args.out:
        raise DomosensoError("--out goes with pull")
    if not (args.plan or args.apply):
        raise DomosensoError("push needs --plan or --apply")
    return asyncio.run(_push(args, rep))
