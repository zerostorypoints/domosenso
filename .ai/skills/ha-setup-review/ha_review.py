#!/usr/bin/env python3
"""Read-only review of a Home Assistant setup against community good practice (skill ha-setup-review).

    python3 ha_review.py --url ws://<host>:8123/api/websocket --token-file <file>
                         [--config-dir <dir>] [--json <out.json>]

Needs the `websockets` package (`uv run --with websockets python3 ha_review.py ...`). Sends only
read commands (registry lists, states, config entries, dashboards, backup info); writes nothing to
Home Assistant. It never prints or saves a secret: the backup configuration carries the backup
encryption key, and only the schedule, retention and locations are read from it. `--config-dir` also scans the YAML files of a configuration (a copy or a checkout).

One line per finding: `<level> <check>: <text>`, level PASS, INFO, WARN or FAIL; then
`summary pass <n> info <n> warn <n> fail <n>`. `--json` writes the findings and the counts the
lines rest on, for the report.
"""
from __future__ import annotations

import argparse
import asyncio
import collections
import json
import re
import sys
import time
from pathlib import Path

READS = {
    "areas": "config/area_registry/list", "floors": "config/floor_registry/list",
    "labels": "config/label_registry/list", "devices": "config/device_registry/list",
    "entities": "config/entity_registry/list", "states": "get_states", "config": "get_config",
    "entries": "config_entries/get", "dashboards": "lovelace/dashboards/list",
    "services": "get_services", "persons": "person/list", "backup": "backup/info",
    "backup_config": "backup/config/info",
}
YAML_PLATFORMS = {"template", "automation", "script", "input_number", "input_boolean", "input_select",
                  "input_text", "input_datetime", "input_button", "counter", "timer", "rest",
                  "command_line", "statistics", "history_stats", "utility_meter", "group", "integration"}
OPENING = re.compile(r"(door|window|contact|tur|fenster|drzwi|okno)", re.I)


async def collect(url: str, token: str) -> dict:
    import websockets
    out = {}
    async with websockets.connect(url, max_size=None) as ws:
        await ws.recv()
        await ws.send(json.dumps({"type": "auth", "access_token": token}))
        if json.loads(await ws.recv()).get("type") != "auth_ok":
            raise SystemExit("FAIL auth: the token was refused")
        for i, (key, cmd) in enumerate(READS.items(), 1):
            await ws.send(json.dumps({"id": i, "type": cmd}))
            while True:
                m = json.loads(await ws.recv())
                if m.get("id") == i:
                    out[key] = m.get("result") if m.get("success") else None
                    break
        cats = {}
        for i, scope in enumerate(("automation", "script", "helpers"), 100):
            await ws.send(json.dumps({"id": i, "type": "config/category_registry/list", "scope": scope}))
            while True:
                m = json.loads(await ws.recv())
                if m.get("id") == i:
                    cats[scope] = m.get("result") or []
                    break
        out["categories"] = cats
    return out


class Review:
    def __init__(self):
        self.findings, self.counts = [], {}

    def add(self, level, check, text):
        self.findings.append({"level": level, "check": check, "text": text})
        print(f"{level} {check}: {text}")


def review(d: dict, r: Review) -> None:
    areas, floors, labels = d["areas"] or [], d["floors"] or [], d["labels"] or []
    devices = [x for x in d["devices"] or [] if x.get("entry_type") != "service"]
    ents = {e["entity_id"]: e for e in d["entities"] or []}
    states = {s["entity_id"]: s for s in d["states"] or []}
    entries = d["entries"] or []
    dev_area = {x["id"]: x.get("area_id") for x in d["devices"] or []}
    area_of = lambda eid: (ents.get(eid) or {}).get("area_id") or dev_area.get((ents.get(eid) or {}).get("device_id"))
    domain = lambda eid: eid.split(".", 1)[0]
    r.counts.update(version=(d["config"] or {}).get("version"), areas=len(areas), floors=len(floors),
                    labels=len(labels), devices=len(devices), entities=len(ents), states=len(states))
    r.add("INFO", "version", f"Home Assistant {r.counts['version']}, {len(devices)} devices, {len(ents)} registry entries")

    # Structure: floors hold areas, devices sit in areas, areas name their climate sensors.
    if not floors:
        r.add("WARN", "floors", f"no floor: floor targets, triggers and dashboards cannot be used ({len(areas)} areas)")
    else:
        loose = [a["area_id"] for a in areas if not a.get("floor_id")]
        r.add("WARN" if loose else "PASS", "floors", f"{len(floors)} floors; areas without one: {loose or 'none'}")
    no_area = [x.get("name_by_user") or x.get("name") for x in devices
               if not x.get("area_id") and not x.get("via_device_id") and not x.get("disabled_by")]
    r.add("WARN" if no_area else "PASS", "device-areas",
          f"{len(no_area)} devices without an area{': ' + ', '.join(map(str, no_area[:12])) if no_area else ''}")
    used = collections.Counter(area_of(e) for e in ents if not ents[e].get("disabled_by"))
    empty = [a["area_id"] for a in areas if not used[a["area_id"]]]
    if empty:
        r.add("INFO", "empty-areas", f"areas with nothing in them: {', '.join(empty)}")
    for kind in ("temperature", "humidity"):
        # A room's sensor, not a device's own (a NAS's or a router's temperature is diagnostic).
        have = {area_of(k) for k, s in states.items()
                if domain(k) == "sensor" and s["attributes"].get("device_class") == kind and area_of(k)
                and not (ents.get(k) or {}).get("entity_category")}
        unset = [a["area_id"] for a in areas if a["area_id"] in have and not a.get(f"{kind}_entity_id")]
        r.add("WARN" if unset else "PASS", f"area-{kind}",
              f"areas with a {kind} sensor but none chosen for the area: {unset or 'none'}")
    yaml_no_area = sum(1 for e in ents.values() if e["platform"] in YAML_PLATFORMS and not e.get("disabled_by")
                       and not area_of(e["entity_id"]) and domain(e["entity_id"]) not in ("automation", "script"))
    r.counts["yaml_entities_without_area"] = yaml_no_area
    r.add("INFO", "helper-areas", f"{yaml_no_area} helper and template entities without an area "
          "(area dashboards, voice and area triggers do not see them)")

    # Organisation across rooms.
    lab_use = sum(len(e.get("labels", [])) for e in ents.values()) + sum(len(x.get("labels", [])) for x in devices)
    r.add("WARN" if not labels else "PASS", "labels", f"{len(labels)} labels, {lab_use} uses")
    autos = [e for e in ents.values() if e["platform"] == "automation"]
    sorted_autos = sum(1 for e in autos if e.get("categories") or e.get("labels") or e.get("area_id"))
    if len(autos) >= 20:
        r.add("WARN" if sorted_autos < len(autos) / 2 else "PASS", "automation-order",
              f"{sorted_autos} of {len(autos)} automations have a category, label or area")

    # Leftovers: registry entries of YAML platforms that nothing defines (restored at start).
    restored = [k for k, s in states.items() if s["attributes"].get("restored") and k in ents]
    left = [k for k in restored if ents[k]["platform"] in YAML_PLATFORMS]
    r.counts["restored"] = len(restored)
    r.add("WARN" if left else "PASS", "leftovers",
          f"{len(left)} YAML-defined entities restored without a definition (check each before removing; "
          f"a REST or command-line sensor of a device that is off looks the same){': ' + ', '.join(left[:15]) if left else ''}")
    orphan = [k for k, e in ents.items() if not e.get("disabled_by") and k not in states]
    if orphan:
        r.add("WARN", "registry-orphans", f"{len(orphan)} enabled registry entries with no state: {', '.join(orphan[:10])}")

    # Identity: YAML entities without a unique id cannot be managed in the UI.
    no_uid = [k for k in states if k not in ents and domain(k) not in ("zone", "sun", "conversation", "persistent_notification")]
    r.counts["no_unique_id"] = len(no_uid)
    r.add("WARN" if no_uid else "PASS", "unique-ids",
          f"{len(no_uid)} entities without a unique_id (no rename, area or label in the UI){': ' + ', '.join(no_uid[:10]) if no_uid else ''}")

    # Duplicates: one box seen by several integrations.
    by_name = collections.defaultdict(set)
    for k, s in states.items():
        if domain(k) == "media_player" and not (ents.get(k) or {}).get("disabled_by"):
            dev = next((x for x in devices if x["id"] == (ents.get(k) or {}).get("device_id")), None)
            # The same box under several integrations shares its device name (models differ:
            # "WiiM Ultra" over Cast, "WiiM Ultra Receiver" over DLNA).
            name = (dev or {}).get("name_by_user") or (dev or {}).get("name") or s["attributes"].get("friendly_name", k)
            key = re.sub(r"[^a-z0-9]", "", name.lower())
            by_name[key].add(k)
    dups = {k: sorted(v) for k, v in by_name.items() if len(v) > 1}
    players = sum(1 for k in states if domain(k) == "media_player" and not (ents.get(k) or {}).get("disabled_by"))
    r.add("WARN" if dups else "PASS", "duplicate-players",
          f"{players} media players; seen more than once: {'; '.join(', '.join(v) for v in dups.values()) or 'none'}")

    # People and phones.
    mobiles = [x for x in devices if any(c == e["entry_id"] for e in entries if e["domain"] == "mobile_app"
                                         for c in x.get("config_entries", []))]
    names = collections.Counter((x.get("name_by_user") or x.get("name")) for x in mobiles)
    same = [n for n, c in names.items() if c > 1]
    r.add("FAIL" if same else "PASS", "phone-names",
          f"mobile app devices sharing a name (they share one notify service): {same or 'none'}")
    for p in ((d["persons"] or {}).get("storage") or []):
        gone = [t for t in p.get("device_trackers", []) if t not in states]
        r.add("WARN" if gone else "PASS", "person-trackers",
              f"{p['name']}: {len(p.get('device_trackers', []))} trackers; missing: {gone or 'none'}")

    # Device classes and security.
    bs = {k: s["attributes"].get("device_class") for k, s in states.items() if domain(k) == "binary_sensor"}
    unnamed = [k for k, c in bs.items() if c is None and OPENING.search(k)]
    if unnamed:
        r.add("WARN", "opening-classes", f"door or window sensors without a door/window class: {', '.join(unnamed)}")
    classes = collections.Counter(bs.values())
    openings = sum(classes[c] for c in ("door", "window", "opening", "garage_door"))
    motion = sum(classes[c] for c in ("motion", "occupancy", "presence"))
    alarm = [k for k in states if domain(k) == "alarm_control_panel"]
    r.counts.update(openings=openings, motion=motion, alarm_panels=len(alarm))
    r.add("INFO", "security", f"{openings} door/window sensors, {motion} motion/presence, {len(alarm)} alarm panels"
          + (" — openings without an alarm panel or a group" if openings and not alarm else ""))
    r.add("INFO", "device-classes", f"{classes[None]} of {len(bs)} binary sensors have no device class")

    # Integration health.
    bad = [f"{e['domain']} ({e['title']}): {e['state']}" for e in entries if e["state"] not in ("loaded", "not_loaded")]
    r.add("WARN" if bad else "PASS", "integrations", f"{len(entries)} config entries; not loaded: {'; '.join(bad) or 'none'}")
    unavail = [k for k, s in states.items() if s["state"] == "unavailable"]
    share = len(unavail) / max(1, len(states))
    r.add("WARN" if share > 0.05 else "PASS", "unavailable", f"{len(unavail)} of {len(states)} entities unavailable ({share:.0%})")
    if any(e["domain"] == "hacs" for e in entries):
        r.add("INFO", "hacs", "HACS is installed: from 2026.11 it becomes the built-in Marketplace")

    # Backups.
    info, cfg = d.get("backup") or {}, d.get("backup_config") or {}
    backups = info.get("backups") or []
    newest = max((b.get("date", "") for b in backups), default="")
    agents = (cfg.get("config") or {}).get("create_backup", {}).get("agent_ids") or []
    schedule = ((cfg.get("config") or {}).get("schedule") or {}).get("recurrence")
    schedule = None if schedule in (None, "never") else schedule
    keep = (cfg.get("config") or {}).get("retention") or {}
    r.counts["backup_schedule"] = schedule
    r.add("INFO", "backups", f"{len(backups)} backups, newest {newest or 'none'}; automatic schedule: {schedule or 'off'}; "
          f"locations: {agents or 'none set'}; keeps {keep.get('copies') or keep.get('days') or 'all'}"
          + (" copies" if keep.get("copies") else " days" if keep.get("days") else ""))
    if backups and all(set(b.get("agents", {})) <= {"backup.local", "hassio.local"} for b in backups):
        r.add("WARN", "backup-copies", "every backup is on this machine only: no second location")


def scan_files(root: Path, r: Review) -> None:
    """The configuration's YAML: legacy syntax, friendly_name, a backup automation beside HA's schedule."""
    legacy, friendly, files, creates = collections.Counter(), 0, 0, []
    for path in root.rglob("*.yaml"):
        if any(part in (".storage", "www", "custom_components", "deps") for part in path.parts):
            continue
        text = path.read_text(errors="ignore")
        files += 1
        legacy["service:"] += len(re.findall(r"^\s+-?\s*service:\s", text, re.M))
        legacy["platform: (trigger)"] += len(re.findall(r"^\s+- platform: (state|time|numeric_state|event|homeassistant)\b", text, re.M))
        legacy["trigger: (list key)"] += len(re.findall(r"^\s+trigger:\s*$", text, re.M))
        friendly += len(re.findall(r"friendly_name", text))
        if re.search(r"action:\s*backup\.create", text):
            creates.append(path.relative_to(root).as_posix())
    old = {k: v for k, v in legacy.items() if v}
    r.add("WARN" if old else "PASS", "yaml-syntax", f"{files} YAML files; pre-2024.10 syntax: {old or 'none'}")
    if creates and r.counts.get("backup_schedule"):
        r.add("WARN", "backup-schedules", f"HA's automatic backups run {r.counts['backup_schedule']} and "
              f"{', '.join(creates)} calls backup.create too: two schedules and two retentions")
    r.add("WARN" if friendly else "PASS", "friendly-name",
          f"{friendly} uses of friendly_name (planned for deprecation in 2026.11: entity_name(), device_name(), area_name())")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--token-file", required=True, type=Path)
    ap.add_argument("--config-dir", type=Path)
    ap.add_argument("--json", type=Path)
    args = ap.parse_args()
    r = Review()
    data = asyncio.run(collect(args.url, args.token_file.read_text().strip()))
    review(data, r)
    if args.config_dir:
        scan_files(args.config_dir, r)
    tally = collections.Counter(f["level"] for f in r.findings)
    print(f"summary pass {tally['PASS']} info {tally['INFO']} warn {tally['WARN']} fail {tally['FAIL']}")
    if args.json:
        args.json.write_text(json.dumps({"taken_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "counts": r.counts,
                                         "findings": r.findings}, indent=2))
    return 1 if tally["FAIL"] else 0


if __name__ == "__main__":
    sys.exit(main())
