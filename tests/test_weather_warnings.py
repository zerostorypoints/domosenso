"""SPEC-053 amendment 1: shell/weather_warnings.py picks a region's official warnings from the
MeteoAlarm feed. The feed below is made up in the feed's shape (fictional areas)."""
import importlib.util
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "components/weather/shell/weather_warnings.py"
spec = importlib.util.spec_from_file_location("weather_warnings", SCRIPT)
ww = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ww)
NOW = datetime(2026, 11, 18, 12, 0, tzinfo=timezone.utc)


def info(lang, event, level, kind=None, area="Lakeside", onset="2026-11-18T06:00:00+00:00",
         expires="2026-11-19T06:00:00+00:00", geocode="CH001"):
    params = [{"valueName": "awareness_level", "value": level}]
    if kind:
        params.append({"valueName": "awareness_type", "value": kind})
    return {"language": lang, "event": event, "headline": event, "onset": onset, "expires": expires,
            "parameter": params, "area": [{"areaDesc": area, "geocode": [{"valueName": "EMMA_ID", "value": geocode}]}]}


def feed(*alerts):
    return {"warnings": [{"alert": {"info": list(infos)}} for infos in alerts]}


FEED = feed(
    [info("de", "Stürmischer Wind", "2; yellow; Moderate", "1; wind"), info("en", "Gale force wind", "2; yellow; Moderate", "1; wind")],
    [info("en", "Thunderstorm", "3; orange; Severe", "3; thunderstorm", expires="2026-11-18T20:00:00+00:00")],
    [info("en", "Gale force wind", "1; green; Minor")],                                       # green: no type
    [info("en", "Heavy rain", "2; yellow; Moderate", "10; rain", onset="2026-11-19T00:00:00+00:00")],   # not yet
    [info("en", "Frost", "2; yellow; Moderate", "6; low-temperature", expires="2026-11-18T10:00:00+00:00")],  # over
    [info("en", "Snow", "4; red; Extreme", "2; snow-ice", area="Hillside", geocode="CH002")],  # another region
    [info("en", "Gale force wind", "2; yellow; Moderate", "1; wind")],                         # a repeat
)


def test_most_severe_first_in_effect_only():
    out = ww.warnings(FEED, "Lakeside", "en", NOW)
    assert out["count"] == 2
    assert [(w["type"], w["level"], w["event"]) for w in out["warnings"]] == [
        ("thunderstorm", "orange", "Thunderstorm"), ("wind", "yellow", "Gale force wind")]


def test_language_region_case_and_geocode():
    assert ww.warnings(FEED, "lakeside", "de", NOW)["warnings"][1]["event"] == "Stürmischer Wind"
    assert ww.warnings(FEED, "CH002", "pl", NOW)["warnings"] == [
        {"type": "snow_ice", "level": "red", "severity": 4, "event": "Snow", "headline": "Snow",
         "onset": "2026-11-18T06:00:00+00:00", "expires": "2026-11-19T06:00:00+00:00"}]
    assert ww.warnings(FEED, "Nowhere", "en", NOW) == {"count": 0, "warnings": []}


def test_cli_reads_a_file(tmp_path):
    path = tmp_path / "feed.json"
    path.write_text(json.dumps(feed([info("en", "Fog", "2; yellow; Moderate", "4; fog", expires="2999-01-01T00:00:00+00:00")])))
    run = subprocess.run([sys.executable, "-I", str(SCRIPT), "switzerland", "Lakeside", "en", "--file", str(path)],
                         capture_output=True, text=True, check=True)
    assert json.loads(run.stdout)["warnings"][0]["type"] == "fog"


def test_cli_fails_quietly_on_a_bad_feed(tmp_path):
    path = tmp_path / "feed.json"
    path.write_text("not json")
    run = subprocess.run([sys.executable, "-I", str(SCRIPT), "switzerland", "Lakeside", "--file", str(path)],
                         capture_output=True, text=True)
    assert run.returncode == 1 and run.stdout == ""
