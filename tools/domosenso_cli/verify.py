"""`domosenso verify <target> --baseline <snapshot> [--day-after]`: a running home checked against a baseline.

SPEC-002 section 3.4. Run right after a restart, again after 10 minutes, and with `--day-after` the
next morning. Every automation and script loaded in the baseline is loaded, with the same on / off;
no entity that had a value is unavailable or unknown (except `after_restart: unknown` entries of
`domosenso/equivalence.yaml`, and then only `unknown`); no ERROR in the system log from
configuration, templates, automations or scripts; every resource answers 200 and no two share a file
name; each kiosk profile has the language of the dashboards `configuration.yaml` loads; every entry of
`domosenso/silent.yaml` passes (`triggered_within` and `entity_fresh` only with `--day-after`).
Read-only, like `snapshot`.
"""
from __future__ import annotations

import argparse
import asyncio
import posixpath
import re
from fnmatch import fnmatchcase
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from domosenso_cli.cmd_home import _named_dashboard_files
from domosenso_cli.compare import EQUIVALENCE_FILE, Diff, report
from domosenso_cli.ha_api import HA
from domosenso_cli.home import HomeConfig
from domosenso_cli.report import Reporter
from domosenso_cli.schema import load_validated
from domosenso_cli.snapshot import build, load, pick_target, read_raw, target_profiles

SILENT_FILE = Path("domosenso") / "silent.yaml"
# **(inference)** The loggers an error of the home's own configuration comes from: config validation,
# setup, templates, automations, scripts, the YAML-defined helpers and Lovelace. Integration errors
# (a bridge that does not answer) are not the home's files and are left out.
LOG_SOURCES = (
    "homeassistant.config", "homeassistant.setup", "homeassistant.helpers.template",
    "homeassistant.helpers.config_validation", "homeassistant.helpers.script",
    "homeassistant.components.automation", "homeassistant.components.script",
    "homeassistant.components.template", "homeassistant.components.lovelace",
)
LANG_FILE = re.compile(r"\.([a-z]{2})\.ya?ml$")


def _runnables(part: str, base: dict, now: dict, compare_state: bool = True) -> list[Diff]:
    """Loaded or not, and for automations their on/off (a switched-off automation is a failure). A
    script's on/off only says whether it is running right now, so scripts are checked for loading
    only, as `compare` does."""
    out = []
    for eid, was in sorted(base.items()):
        if not was["loaded"]:
            continue
        cur = now.get(eid)
        if cur is None or not cur["loaded"]:
            out.append(Diff(part, eid, "not-loaded", "missing" if cur is None else f"state {cur['state']}"))
        elif compare_state and cur["state"] != was["state"]:
            out.append(Diff(part, eid, "state-changed", f"{was['state']} → {cur['state']}"))
    return out


def _entities(base: dict, now: dict, may_be_unknown: set[str]) -> list[Diff]:
    out = []
    for eid, was in sorted(base.items()):
        if was["state_class"] != "available" or eid.split(".", 1)[0] in ("automation", "script"):
            continue  # automations and scripts are checked as such above
        cur = now.get(eid)
        if cur is None:
            out.append(Diff("entities", eid, "newly-unavailable", "missing"))
        elif cur["state_class"] == "unknown" and any(fnmatchcase(eid, pattern) for pattern in may_be_unknown):
            continue
        elif cur["state_class"] != "available":
            out.append(Diff("entities", eid, "newly-unavailable", cur["state_class"]))
    return out


def _log(errors: list[dict]) -> list[Diff]:
    out = []
    for entry in errors:
        name = entry.get("name") or ""
        if not any(name == src or name.startswith(src + ".") for src in LOG_SOURCES):
            continue
        message = entry.get("message")
        first = message[0] if isinstance(message, list) and message else str(message or "")
        out.append(Diff("log", name, "log-error", first.splitlines()[0] if first else ""))
    return out


async def _resources(ha: HA, resources: list[dict]) -> list[Diff]:
    out = []
    by_name: dict[str, list[str]] = {}
    for r in resources:
        url = r["url_no_query"]
        by_name.setdefault(posixpath.basename(url), []).append(url)
        if url.startswith("/"):  # served by this Home Assistant; a CDN URL is not ours to probe
            status = await ha.http_status(url)
            if status != 200:
                out.append(Diff("resources", url, "resource-missing", f"HTTP {status}"))
    for name, urls in sorted(by_name.items()):
        if len(urls) > 1:
            out.append(Diff("resources", name, "resource-duplicate", ", ".join(sorted(urls))))
    return out


def _profiles(home: HomeConfig, profiles: dict[str, dict]) -> list[Diff]:
    if not profiles:
        return []
    sink = Reporter(json_mode=True)  # collects the `unchecked` lines instead of printing them
    files = _named_dashboard_files(home, sink)
    if files is None:
        return [Diff("profiles", name, "profile-language", "unchecked: " + " ".join(sink.lines[-1][1:]))
                for name in sorted(profiles)]
    langs = {f: m.group(1) for f in sorted(files) if (m := LANG_FILE.search(f))}
    if not langs:
        return []
    out = []
    loaded = ", ".join(f"{f} ({lang})" for f, lang in langs.items())
    for name, profile in sorted(profiles.items()):
        language = profile.get("language")
        if language is None:
            out.append(Diff("profiles", name, "profile-language", f"no language in the profile; dashboards {loaded}"))
        elif language not in langs.values():
            out.append(Diff("profiles", name, "profile-language", f"profile {language}; dashboards {loaded}"))
    return out


def _time(value) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        t = datetime.fromisoformat(value)
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _hours(now: datetime, then: datetime) -> float:
    return (now - then).total_seconds() / 3600


def _silent(entries: list[dict], current: dict, states: dict[str, dict], day_after: bool, now: datetime) -> list[Diff]:
    out = []
    for entry in entries:
        eid = entry["entity"]
        runnable = current["automations"].get(eid) or current["scripts"].get(eid)
        for check in entry["checks"]:
            failed = None
            if check == "loaded_on":
                if runnable is None or not runnable["loaded"]:
                    failed = f"loaded_on: {'missing' if runnable is None else 'not loaded'}"
                elif eid.startswith("automation.") and runnable["state"] != "on":
                    failed = f"loaded_on: state {runnable['state']}"
            elif "triggered_within" in check and day_after:
                hours = check["triggered_within"]
                last = _time((runnable or {}).get("last_triggered"))
                if last is None:
                    failed = f"triggered_within {hours:g} h: never triggered"
                elif _hours(now, last) > hours:
                    failed = f"triggered_within {hours:g} h: last triggered {last.isoformat()} ({_hours(now, last):.1f} h ago)"
            elif "entity_fresh" in check and day_after:
                sensor, max_age = check["entity_fresh"]["entity"], check["entity_fresh"]["max_age"]
                state = states.get(sensor)
                # A sensor whose value is a time (a backup's) is as old as that time; any other, as its last update.
                then = (_time(state.get("state")) or _time(state.get("last_updated"))) if state else None
                if then is None:
                    failed = f"entity_fresh {sensor}: {'missing' if state is None else 'no time to measure'}"
                elif _hours(now, then) > max_age:
                    failed = f"entity_fresh {sensor} {max_age:g} h: {_hours(now, then):.1f} h old"
            if failed:
                out.append(Diff("silent", eid, "silent-failed", failed))
    return out


def _entries(home: HomeConfig, rel: Path, schema: str) -> list[dict]:
    data = load_validated(home.root / rel, schema, missing_ok=True)
    return list((data or {}).get("entries") or [])


async def check(
    ha: HA, baseline: dict, home: HomeConfig, day_after: bool,
    kiosk_profiles: dict[str, dict] | None = None, now: datetime | None = None,
) -> tuple[list[Diff], dict[str, int]]:
    """The failures and, per part, how many things were checked."""
    now = now or datetime.now(timezone.utc)
    may_be_unknown = {e["id"] for e in _entries(home, EQUIVALENCE_FILE, "equivalence") if e.get("after_restart") == "unknown"}
    silent = _entries(home, SILENT_FILE, "silent")
    raw = await read_raw(ha)
    current = build(raw, kiosk_profiles)
    states = {s["entity_id"]: s for s in raw["states"]}
    diffs = [
        *_runnables("automations", baseline["automations"], current["automations"]),
        *_runnables("scripts", baseline["scripts"], current["scripts"], compare_state=False),
        *_entities(baseline["entities"], current["entities"], may_be_unknown),
        *_log(current["errors"]),
        *await _resources(ha, current["resources"]),
        *_profiles(home, current["profiles"]),
        *_silent(silent, current, states, day_after, now),
    ]
    sizes = {
        "automations": sum(1 for a in baseline["automations"].values() if a["loaded"]),
        "scripts": sum(1 for s in baseline["scripts"].values() if s["loaded"]),
        "entities": sum(1 for e in baseline["entities"].values() if e["state_class"] == "available"),
        "log": len(current["errors"]),
        "resources": len(current["resources"]),
        "profiles": len(current["profiles"]),
        "silent": len(silent),
    }
    return diffs, sizes


async def verify(
    ha: HA, baseline: dict, home: HomeConfig, day_after: bool,
    kiosk_profiles: dict[str, dict] | None = None, now: datetime | None = None,
) -> list[Diff]:
    return (await check(ha, baseline, home, day_after, kiosk_profiles, now))[0]


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("target", help="a target declared in domosenso.yaml")
    parser.add_argument("--baseline", type=Path, required=True, metavar="<snapshot>",
                        help="the snapshot taken before the change")
    parser.add_argument("--day-after", action="store_true",
                        help="also check triggered_within and entity_fresh of silent.yaml")


async def _run(home: HomeConfig, target_name: str, baseline: dict, day_after: bool):
    target = pick_target(home, target_name)
    async with HA.for_target(target) as ha:
        return await check(ha, baseline, home, day_after, await target_profiles(home, target, ha))


def run(args: argparse.Namespace, rep: Reporter) -> int:
    home = HomeConfig.load(args.home)
    baseline = load(args.baseline)
    diffs, sizes = asyncio.run(_run(home, args.target, baseline, args.day_after))
    rep.data.append({"failed": [asdict(d) for d in diffs]})
    n = report(rep, sizes, diffs, [])
    if n:
        return rep.fail(f"not verified: {n} failed")
    rep.line("verified")
    return rep.ok()

