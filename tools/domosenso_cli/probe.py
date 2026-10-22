"""`domosenso probe`: a page a wall tablet opens to measure its screen and WebView (SPEC-011
section 7.3).

`--install` copies the probe card (`tools/probe/`) to `www/domosenso/_probe/`, adds it as a Lovelace
resource and puts it on a dashboard of its own, `domosenso-probe`; the person opens that page in the
tablet's Companion app. The card reports through `logbook.log`, and `--read` waits for that logbook
entry. `--remove` takes away exactly what `--install` made. Install and remove write to Home
Assistant (the skill asks first); `--read` only listens.
"""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from domosenso_cli import recommend
from domosenso_cli.build import file_sha
from domosenso_cli.catalog import is_url
from domosenso_cli.errors import DomosensoError
from domosenso_cli.ha_api import HA
from domosenso_cli.home import HOME_FILE, HomeConfig
from domosenso_cli.report import Reporter
from domosenso_cli.snapshot import pick_target
from domosenso_cli.targets import open_target

PROBE_DIR = Path(__file__).resolve().parent.parent / "probe"
SOURCES = ("probe-card.js", "probe.json")
# `_probe` cannot be a component id (ids have no `_`), so it never meets a component's cards.
TARGET_DIR = "www/domosenso/_probe"
RESOURCE = "/local/domosenso/_probe/probe-card.js"
NAME = "domosenso-probe"  # the logbook entry's name, and the dashboard's url_path
TITLE = "Domosenso probe"
CARD = {"type": "custom:domosenso-probe-card"}
WAIT_S = 300


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("target", metavar="<target or URL>",
                        help="a target in domosenso.yaml (install and remove need one), or a URL with --token-file")
    parser.add_argument("--token-file", metavar="<file>", help="the long-lived access token for a URL")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--install", action="store_true", help="put the probe page on the target")
    action.add_argument("--read", action="store_true", help="wait for the tablet's report")
    action.add_argument("--remove", action="store_true", help="take the probe page away again")
    parser.add_argument("--wait", type=float, default=WAIT_S, metavar="<seconds>",
                        help=f"how long --read waits for a report (default {WAIT_S})")


def _bare(url: str) -> str:
    return url.split("?", 1)[0]


def _resource_url() -> str:
    return f"{RESOURCE}?v={file_sha(PROBE_DIR / SOURCES[0])[:8]}"


def _dashboard_config() -> dict:
    return {"title": TITLE, "views": [{"title": TITLE, "path": "0", "type": "panel", "cards": [CARD]}]}


def _ha(args: argparse.Namespace) -> HA:
    args.from_ha = args.target
    return recommend.open_ha(args)


def _io(args: argparse.Namespace):
    if is_url(args.target):
        raise DomosensoError(f"--{'install' if args.install else 'remove'} needs a target in {HOME_FILE}, not a URL")
    if not (args.home / HOME_FILE).exists():
        raise DomosensoError(f"no {HOME_FILE} in {args.home}")
    return open_target(pick_target(HomeConfig.load(args.home), args.target))


async def _probe_dashboard(ha) -> dict | None:
    """The dashboard at the probe's url_path; one that is not the probe's is refused, never touched."""
    for dashboard in await ha.call("lovelace/dashboards/list"):
        if dashboard.get("url_path") == NAME:
            if dashboard.get("title") != TITLE or dashboard.get("mode", "storage") != "storage":
                raise DomosensoError(f"dashboard {NAME} exists and is not the probe's (title {dashboard.get('title')!r})")
            return dashboard
    return None


async def _install(ha, rep: Reporter) -> None:
    async with ha:
        url = _resource_url()
        mine = [r for r in await ha.call("lovelace/resources") if _bare(r["url"]) == RESOURCE]
        if not mine:
            await ha.call("lovelace/resources/create", url=url, res_type="module")
            rep.line("resource", "create", url)
        elif mine[0]["url"] != url:
            await ha.call("lovelace/resources/update", resource_id=mine[0]["id"], url=url, res_type="module")
            rep.line("resource", "update", url, "from", mine[0]["url"])
        if await _probe_dashboard(ha) is None:
            await ha.call("lovelace/dashboards/create", url_path=NAME, title=TITLE, icon="mdi:ruler-square",
                          show_in_sidebar=False, require_admin=False)
            rep.line("dashboard", "create", NAME)
        await ha.call("lovelace/config/save", url_path=NAME, config=_dashboard_config())
        # Home Assistant serves /local/ only if www/ existed when it started (seen on 2026.9.2).
        if await ha.http_status(url) == 404:
            rep.line("warning", "/local/ is not served: www/ did not exist when Home Assistant started; restart it")
    rep.line("open", f"/{NAME}/0")


async def _remove(ha, rep: Reporter) -> None:
    async with ha:
        dashboard = await _probe_dashboard(ha)
        if dashboard is not None:
            await ha.call("lovelace/dashboards/delete", dashboard_id=dashboard["id"])
            rep.line("dashboard", "delete", NAME)
        for resource in await ha.call("lovelace/resources"):
            if _bare(resource["url"]) == RESOURCE:
                await ha.call("lovelace/resources/delete", resource_id=resource["id"])
                rep.line("resource", "delete", resource["url"])


def report_line(report: dict) -> list[str]:
    """`probe viewport <w>x<h> dpr <r> screen <W>x<H> orientation <o> webview|chromium <major> ...`"""
    def size(pair) -> str:
        return "x".join("-" if v is None else str(v) for v in pair) if isinstance(pair, list) else "-"

    browser = "webview" if report.get("webview") else "chromium"
    yes = {True: "yes", False: "no"}
    return ["viewport", size(report.get("viewport")), "dpr", str(report.get("dpr", "-")),
            "screen", size(report.get("screen")), "orientation", str(report.get("orientation") or "-"),
            browser, str(report.get("chromium") or "-"),
            "json-modules", yes.get(report.get("json_modules"), "-"), "dvh", yes.get(report.get("dvh"), "-"),
            "user", "admin" if report.get("admin") else "non-admin"]


async def _read(ha, wait: float, rep: Reporter) -> bool:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + wait
    async with ha:
        subscription = await ha.subscribe("logbook_entry")
        while (left := deadline - loop.time()) > 0:
            event = await ha.next_event(subscription, left)
            if event is None:
                break
            data = event.get("data") or {}
            if data.get("name") != NAME:
                continue
            try:
                report = json.loads(data.get("message") or "")
            except ValueError:
                rep.line("warning", "unreadable probe report")
                continue
            if not isinstance(report, dict):
                rep.line("warning", "unreadable probe report")
                continue
            rep.line("probe", *report_line(report))
            rep.data.append(report)
            return True
    return False


def run(args: argparse.Namespace, rep: Reporter) -> int:
    if args.install:
        io = _io(args)
        ha = _ha(args)
        io.put({f"{TARGET_DIR}/{name}": (PROBE_DIR / name).read_bytes() for name in SOURCES})
        rep.line("copied", str(len(SOURCES)))
        asyncio.run(_install(ha, rep))
    elif args.remove:
        io = _io(args)
        ha = _ha(args)
        asyncio.run(_remove(ha, rep))
        io.delete([f"{TARGET_DIR}/{name}" for name in SOURCES])
        rep.line("removed", str(len(SOURCES)))
    elif not asyncio.run(_read(_ha(args), args.wait, rep)):
        return rep.fail(f"no report within {args.wait:g} s")
    return rep.ok()
