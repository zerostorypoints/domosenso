"""`domosenso thresholds`: the Ramka's live limits and comfort ranges beside climate-air's (P3.4)."""
from domosenso_cli.thresholds import compare

HOME = {"rooms": [{"id": "living_room", "name": "Living room",
                   "climate": {"temperature": "sensor.living_room_temperature", "humidity": "sensor.living_room_humidity"}},
                  {"id": "office", "name": "Office", "climate": {"temperature": "sensor.office_temperature"}}]}


def n(value):
    return {"state": str(value), "attributes": {}}


def states(**extra):
    base = {
        "input_number.ramka_air_co2_raised": n(800), "input_number.ramka_air_co2_high": n(1200),
        "input_number.climate_air_co2_fair": n(800), "input_number.climate_air_co2_poor": n(1500),
        "sensor.ramka_climate_rooms": {"state": "2", "attributes": {"rooms": [
            {"type": "temperature", "label": "Living", "main": "sensor.living_room_temperature",
             "extra": "sensor.living_room_humidity", "temp_low": 21, "temp_high": 24},
            {"type": "air", "label": "Air", "main": "sensor.living_room_co2"},
            {"type": "temperature", "label": "Office", "main": "sensor.office_temperature", "extra": ""}]}},
    }
    for room, keys in {"living_room": ("temp_low", "temp_high", "humidity_low", "humidity_high"),
                       "office": ("temp_low", "temp_high")}.items():
        for key in keys:
            base[f"input_number.climate_air_{room}_{key}"] = n({"temp_low": 20, "temp_high": 24, "humidity_low": 40, "humidity_high": 60}[key])
    return {**base, **extra}


def test_equal_and_conflicting_pairs():
    lines, problems = compare(states(), HOME, "ramka")
    assert ("limit", "co2", "fair", "ramka", "800", "climate-air", "800", "equal") in lines
    assert ("limit", "co2", "poor", "ramka", "1200", "climate-air", "1500", "conflict") in lines
    assert ("comfort", "living_room", "temp_low", "ramka", "21", "climate-air", "20", "conflict") in lines
    assert ("comfort", "living_room", "hum_low", "ramka", "40", "climate-air", "40", "equal") in lines, "a widget's default range"
    assert not any(l[:3] == ("comfort", "office", "hum_low") for l in lines), "no humidity, no humidity range"
    assert not any(l[0] == "limit" and l[1] == "pm2_5" for l in lines), "a reading the Ramka does not show"
    assert problems == 2


def test_missing_helpers_and_unmatched_widgets_need_a_choice():
    s = states()
    del s["input_number.climate_air_co2_poor"]
    home = {"rooms": [HOME["rooms"][0]]}
    lines, problems = compare(s, home, "ramka")
    assert ("missing", "input_number.climate_air_co2_poor") in lines
    assert ("unmatched", "Office") in lines
    assert problems == 3   # the missing helper, the living room's temp_low, the office widget


def test_all_equal_is_nothing_to_resolve():
    s = states(**{"input_number.climate_air_co2_poor": n(1200)})
    s["sensor.ramka_climate_rooms"]["attributes"]["rooms"][0]["temp_low"] = 20
    assert compare(s, HOME, "ramka")[1] == 0


def test_the_outside_widget_matches_the_home_inputs_outside():
    home = {**HOME, "outside": {"temperature": "sensor.balcony_temperature"}}
    s = states(**{"input_number.climate_air_outside_temp_low": n(20), "input_number.climate_air_outside_temp_high": n(24)})
    s["sensor.ramka_climate_rooms"]["attributes"]["rooms"].append(
        {"type": "temperature", "label": "Outside", "main": "sensor.balcony_temperature", "extra": ""})
    lines, _ = compare(s, home, "ramka")
    assert ("comfort", "outside", "temp_low", "ramka", "20", "climate-air", "20", "equal") in lines
    assert ("unmatched", "Outside") not in lines
