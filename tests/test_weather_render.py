"""SPEC-053: the weather component's wind status.

The package renders; its Home Assistant templates are then evaluated here with a small stand-in for
Home Assistant's template functions (states, state_attr, is_state, now, as_datetime and the float,
is_number filters), so the judgement itself is tested: units, gusts, thresholds, the way down, the
official warning.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jinja2
import pytest
import yaml
from domosenso_render import render_component

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "components/weather"
NOW = datetime(2026, 11, 18, 0, 30, tzinfo=timezone.utc)


def render(tmp_path, **inputs):
    render_component(COMPONENT, {"weather": "weather.home", **inputs}, tmp_path, ["en"])
    return yaml.safe_load((tmp_path / "package.yaml").read_text())


class Entity(dict):
    """`this` as Home Assistant passes it: .state and .attributes."""

    def __init__(self, state, attributes=None):
        super().__init__(state=state, attributes=attributes or {})
        self.state, self.attributes = state, attributes or {}


def evaluate(template, states, this=None):
    """states: {entity_id: (state, {attributes})}."""
    env = jinja2.Environment(extensions=["jinja2.ext.loopcontrols"])
    missing = object()

    def as_float(value, default=missing):
        try:
            return float(value)
        except (TypeError, ValueError):
            if default is missing:
                raise
            return default

    def is_number(value):
        try:
            float(value)
            return True
        except (TypeError, ValueError):
            return False

    env.filters.update(float=as_float, is_number=is_number)
    env.tests["number"] = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)
    glob = {
        "states": lambda e: states.get(e, ("unknown", {}))[0],
        "state_attr": lambda e, a: states.get(e, ("unknown", {}))[1].get(a),
        "is_state": lambda e, s: states.get(e, ("unknown", {}))[0] == s,
        "is_state_attr": lambda e, a, v: states.get(e, ("unknown", {}))[1].get(a) == v,
        "now": lambda: NOW,
        "as_datetime": datetime.fromisoformat,
        "none": None,
        "true": True,
        "false": False,
    }
    if this is not None:
        glob["this"] = this
    return env.from_string(template).render(**glob).strip()


@pytest.fixture
def pkg(tmp_path):
    return render(tmp_path, alerts="binary_sensor.meteoalarm", gusts="open_meteo")


def level_sensor(pkg):
    return pkg["template"][0]["sensor"][0]


def world(speed, unit="km/h", gust=None):
    states = {
        "weather.home": ("cloudy", {"wind_speed": speed, "wind_speed_unit": unit, "wind_bearing": 210}),
        "input_number.weather_wind_breezy": ("29.0", {}),
        "input_number.weather_wind_strong": ("39.0", {}),
        "input_number.weather_wind_gale": ("62.0", {}),
        "sensor.weather_wind_gust": (str(gust) if gust is not None else "unavailable", {}),
    }
    return states


def test_package_without_options(tmp_path):
    pkg = render(tmp_path)
    assert "rest" not in pkg
    assert set(pkg["input_number"]) == {"weather_wind_breezy", "weather_wind_strong", "weather_wind_gale"}
    sensor = level_sensor(pkg)
    assert sensor["default_entity_id"] == "sensor.weather_wind_level"
    warning = pkg["template"][1]["binary_sensor"][0]
    assert warning["default_entity_id"] == "binary_sensor.weather_warning"
    assert warning["delay_off"] == {"minutes": 15}


def test_unavailable_until_seeded(pkg):
    availability = level_sensor(pkg)["availability"]
    states = world(20)
    assert evaluate(availability, states) == "False"
    states["input_boolean.weather_wind_seeded"] = ("on", {})
    assert evaluate(availability, states) == "True"
    assert "input_boolean.weather_wind_seeded" in pkg["template"][0]["triggers"][2]["entity_id"]


def test_seed_takes_the_inputs(tmp_path):
    pkg = render(tmp_path, wind_strong=45)
    values = {a["target"]["entity_id"]: a["data"]["value"] for a in pkg["automation"][0]["actions"] if "data" in a}
    assert values == {"input_number.weather_wind_breezy": 29, "input_number.weather_wind_strong": 45,
                      "input_number.weather_wind_gale": 62}


def test_open_meteo_rest_sensor(pkg):
    (rest,) = pkg["rest"]
    assert "api.open-meteo.com" in rest["resource_template"] and "round(2)" in rest["resource_template"]
    assert rest["scan_interval"] == 900
    assert rest["sensor"][0]["unique_id"] == "weather_wind_gust"


@pytest.mark.parametrize("speed, unit, expected", [
    (10, "km/h", "calm"), (29, "km/h", "breezy"), (39, "km/h", "strong"), (62, "km/h", "gale"),
    (8.8, "m/s", "breezy"), (11, "m/s", "strong"), (20, "mph", "breezy"), (25, "mph", "strong"), (34, "kn", "gale"),
])
def test_level_by_speed_and_unit(pkg, speed, unit, expected):
    assert evaluate(level_sensor(pkg)["state"], world(speed, unit)) == expected


@pytest.mark.parametrize("speed, gust, expected", [
    (20, 48.6, "breezy"),   # 48.6 / 1.5 = 32.4
    (20, 58.5, "strong"),   # 39 * 1.5
    (20, 40, "calm"),
    (45, 30, "strong"),     # a lower gust never lowers the level
])
def test_gust_counts_at_one_and_a_half_times(pkg, speed, gust, expected):
    sensor = level_sensor(pkg)
    states = world(speed, gust=gust)
    assert evaluate(sensor["state"], states) == expected
    assert evaluate(sensor["attributes"]["gust"], states) == str(float(gust))


def test_the_entity_s_own_gust_wins(pkg):
    states = world(20, gust=30)
    states["weather.home"][1]["wind_gust_speed"] = 60
    assert evaluate(level_sensor(pkg)["attributes"]["gust"], states) == "60.0"


def test_rises_at_once(pkg):
    assert evaluate(level_sensor(pkg)["state"], world(65), Entity("breezy")) == "gale"


def test_falls_one_step_only_after_fifteen_minutes(pkg):
    sensor = level_sensor(pkg)
    states = world(20)  # under 39 * 0.9
    fresh = Entity("strong")
    assert evaluate(sensor["state"], states, fresh) == "strong"
    assert evaluate(sensor["attributes"]["below_since"], states, fresh) == NOW.isoformat()
    early = Entity("strong", {"below_since": (NOW - timedelta(minutes=14)).isoformat()})
    assert evaluate(sensor["state"], states, early) == "strong"
    late = Entity("gale", {"below_since": (NOW - timedelta(minutes=16)).isoformat()})
    assert evaluate(sensor["state"], states, late) == "strong"
    assert evaluate(sensor["attributes"]["below_since"], states, late) == "None"


def test_within_ten_percent_holds(pkg):
    sensor = level_sensor(pkg)
    held = Entity("strong", {"below_since": (NOW - timedelta(hours=1)).isoformat()})
    states = world(36)  # below 39, above 35.1
    assert evaluate(sensor["state"], states, held) == "strong"
    assert evaluate(sensor["attributes"]["below_since"], states, held) == "None"


def test_warning_is_wind_or_any_official_warning(tmp_path):
    pkg = render(tmp_path, warnings={"country": "switzerland", "region": "Basel"})
    state = pkg["template"][1]["binary_sensor"][0]["state"]
    assert pkg["template"][1]["binary_sensor"][0]["default_entity_id"] == "binary_sensor.weather_warning"
    def warn(level, count):
        return evaluate(state, {"sensor.weather_wind_level": (level, {}), "sensor.weather_warnings": (count, {})})
    assert warn("breezy", "0") == "False"
    assert warn("strong", "0") == "True"
    assert warn("calm", "2") == "True"
    assert warn("calm", "unknown") == "False"
    (sensor,) = pkg["command_line"]
    assert sensor["sensor"]["command"] == 'python3 /config/shell/weather_warnings.py "switzerland" "Basel" "en"'
    assert sensor["sensor"]["json_attributes"] == ["warnings"]


def test_without_warnings_no_feed(tmp_path):
    pkg = render(tmp_path)
    assert "command_line" not in pkg
    assert "weather_warnings" not in pkg["template"][1]["binary_sensor"][0]["state"]


@pytest.mark.parametrize("region", ['Ba"sel', "Basel$(x)", "Ba`sel`", "Ba\\sel"])
def test_warnings_refuse_shell_characters(tmp_path, region):
    with pytest.raises(Exception, match="must not contain"):
        render(tmp_path, warnings={"country": "switzerland", "region": region})


def test_direction(pkg):
    states = world(20)
    assert evaluate(level_sensor(pkg)["attributes"]["direction"], states) == "SW"
    states["weather.home"][1]["wind_bearing"] = 350
    assert evaluate(level_sensor(pkg)["attributes"]["direction"], states) == "N"
