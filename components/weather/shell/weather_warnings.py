#!/usr/bin/env python3
"""The official weather warnings in effect for one MeteoAlarm region, as JSON on stdout for the
weather component's command_line sensor (sensor.weather_warnings, SPEC-053 amendment 1).

Home Assistant's meteoalarm integration keeps one warning; a home with wind and rain at once needs
every one, and their severity, to show the most severe and a count. Standard library only: it runs
inside the Home Assistant container.

    python3 /config/shell/weather_warnings.py <country> <region> [<language>] [--file <feed.json>]

country: the feed's name (switzerland, germany, poland ...: feeds.meteoalarm.org); region: the
area's name as the feed spells it (a MeteoSwiss warning region such as Basel) or its EMMA_ID
geocode; language: the text's (en by default; the feed's first language when it lacks it).

Prints {"count": n, "warnings": [...]}: the warnings of level yellow and up in effect now, most
severe first (then the earliest end), each {type, level, severity, event, headline, onset, expires}.
type: wind, snow_ice, thunderstorm, fog, heat, cold, coastal, forest_fire, avalanche, rain, flood,
rain_flood or other; level: yellow, orange, red; severity 2, 3, 4. Exit 1, nothing printed, when the
feed cannot be read: the sensor goes unknown and the surfaces show no warning rather than a stale one.
"""
import json
import sys
import urllib.request
from datetime import datetime, timezone

FEED = "https://feeds.meteoalarm.org/api/v1/warnings/feeds-{country}"
# MeteoAlarm's awareness types (the number before the ';').
TYPES = {1: "wind", 2: "snow_ice", 3: "thunderstorm", 4: "fog", 5: "heat", 6: "cold", 7: "coastal",
         8: "forest_fire", 9: "avalanche", 10: "rain", 12: "flood", 13: "rain_flood"}
LEVELS = {2: "yellow", 3: "orange", 4: "red"}


def _code(value):
    try:
        return int(str(value).split(";")[0].strip())
    except (TypeError, ValueError):
        return None


def _time(value):
    try:
        moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _in_region(info, region):
    wanted = region.casefold()
    for area in info.get("area") or []:
        if str(area.get("areaDesc", "")).casefold() == wanted:
            return True
        if any(str(code.get("value", "")).casefold() == wanted for code in area.get("geocode") or []):
            return True
    return False


def _pick(infos, language):
    """The info block in the wanted language, else English, else the first."""
    for wanted in (language, "en"):
        for info in infos:
            if str(info.get("language", "")).lower().split("-")[0] == wanted:
                return info
    return infos[0] if infos else None


def warnings(feed, region, language="en", now=None):
    now = now or datetime.now(timezone.utc)
    found = {}
    for item in feed.get("warnings") or []:
        infos = [i for i in (item.get("alert") or {}).get("info") or [] if _in_region(i, region)]
        info = _pick(infos, language)
        if not info:
            continue
        params = {p.get("valueName"): p.get("value") for p in info.get("parameter") or []}
        severity = _code(params.get("awareness_level"))
        kind = _code(params.get("awareness_type"))
        if severity not in LEVELS or kind is None:
            continue  # green ("no danger") entries carry no type
        onset, expires = _time(info.get("onset") or info.get("effective")), _time(info.get("expires"))
        if (onset and onset > now) or (expires and expires <= now):
            continue
        entry = {"type": TYPES.get(kind, "other"), "level": LEVELS[severity], "severity": severity,
                 "event": info.get("event"), "headline": info.get("headline") or info.get("event"),
                 "onset": onset.isoformat() if onset else None, "expires": expires.isoformat() if expires else None}
        # The feed repeats a warning (one alert per language, updates): one entry each, in the
        # wanted language when any of the repeats has it.
        key = (entry["type"], severity, entry["onset"], entry["expires"])
        exact = str(info.get("language", "")).lower().split("-")[0] == language
        if key not in found or (exact and not found[key][1]):
            found[key] = (entry, exact)
    far = "9999-12-31T00:00:00+00:00"
    ordered = sorted((entry for entry, _ in found.values()), key=lambda w: (-w["severity"], _time(w["expires"] or far)))
    return {"count": len(ordered), "warnings": ordered}


def main(argv):
    args = [a for a in argv if a != "--file"]
    path = argv[argv.index("--file") + 1] if "--file" in argv else None
    if path:
        args.remove(path)
    if len(args) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    country, region = args[0], args[1]
    language = args[2] if len(args) > 2 else "en"
    try:
        if path:
            with open(path, encoding="utf-8") as handle:
                feed = json.load(handle)
        else:
            request = urllib.request.Request(FEED.format(country=country.lower()),
                                             headers={"User-Agent": "domosenso-weather/1 (Home Assistant)"})
            with urllib.request.urlopen(request, timeout=25) as response:
                feed = json.load(response)
    except (OSError, ValueError) as exc:
        print(f"weather_warnings: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(warnings(feed, region, language), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
