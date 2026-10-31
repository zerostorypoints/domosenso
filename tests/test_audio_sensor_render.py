"""The audio-sensor component's Home Assistant package, rendered for the demo home (SPEC-018)."""
import copy
from pathlib import Path

import jinja2
import pytest
import yaml

import domosenso_render as dr

REPO = Path(__file__).resolve().parent.parent
COMP = REPO / "components" / "audio-sensor"
DEMO_INPUTS = REPO / "examples" / "demo-home" / "inputs" / "audio-sensor.yaml"


def demo_inputs() -> dict:
    return yaml.safe_load(DEMO_INPUTS.read_text(encoding="utf-8"))


def render_text(tmp_path, inputs) -> str:
    out = tmp_path / "out"
    dr.render_component(COMP, inputs, out)
    return (out / "package.yaml").read_text(encoding="utf-8")


def render(tmp_path, inputs) -> dict:
    return yaml.load(render_text(tmp_path, inputs), Loader=yaml.CSafeLoader)


def templates(package) -> dict:
    """Every template entity by unique_id."""
    found = {}
    for block in package.get("template", []):
        for kind in ("sensor", "binary_sensor"):
            for entity in block.get(kind, []):
                found[entity["unique_id"]] = entity
    return found


def evaluate(template, states_by_id) -> str:
    """A Home Assistant template run with stub states (an entity not listed is `unavailable`)."""
    env = jinja2.Environment()

    def states(entity_id):
        return states_by_id.get(entity_id, "unavailable")

    return env.from_string(template).render(states=states, is_state=lambda e, v: states(e) == v).strip()


LIVING = "sensor.living_room_audio_sensor_living_room_spectrum"
KIDS = "sensor.kids_room_audio_sensor_kids_room_spectrum"
LIVING_LEVEL = "sensor.living_room_audio_sensor_living_room_sound_level"
KIDS_LEVEL = "sensor.kids_room_audio_sensor_kids_room_sound_level"
SELECT = "input_select.audio_sensor_music_source"


@pytest.fixture(scope="module")
def demo(tmp_path_factory):
    return render(tmp_path_factory.mktemp("demo"), demo_inputs())


def test_render_aliases_follow_music_sensor(demo):
    found = templates(demo)
    spectrum = found["audio_sensor_music_spectrum"]
    assert LIVING in spectrum["state"]
    assert spectrum["default_entity_id"] == "sensor.music_spectrum"
    level = found["audio_sensor_music_level"]
    assert "sensor.living_room_audio_sensor_living_room_sound_level" in level["state"]
    assert "input_number.living_room_spl_offset" in level["state"]
    assert level["default_entity_id"] == "sensor.music_level"
    assert level["unit_of_measurement"] == "dB"
    offset = found["audio_sensor_music_spl_offset"]
    assert "input_number.living_room_spl_offset" in offset["state"]
    online = found["audio_sensor_music_sensor_online"]
    assert online["default_entity_id"] == "binary_sensor.music_sensor_online"
    assert "sensor.living_room_audio_sensor_living_room_spectrum" in online["state"]
    assert "unavailable" in online["state"] and "unknown" in online["state"]
    # The aliases follow the select, so every board is in their maps (test_aliases_follow_the_select).


def test_aliases_follow_a_different_music_board(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][0]["music"] = False
    inputs["sensors"][1]["music"] = True
    found = templates(render(tmp_path, inputs))
    assert "sensor.kids_room_audio_sensor_kids_room_spectrum" in found["audio_sensor_music_spectrum"]["state"]
    assert "input_number.kids_room_spl_offset" in found["audio_sensor_music_level"]["state"]


def test_entities_input_overrides_the_guessed_ids(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][0]["entities"] = {"spectrum": "sensor.lounge_mic_spectrum", "level": "sensor.lounge_mic_level"}
    package = render(tmp_path, inputs)
    found = templates(package)
    assert "sensor.lounge_mic_spectrum" in found["audio_sensor_music_spectrum"]["state"]
    assert "sensor.lounge_mic_level" in found["audio_sensor_music_level"]["state"]
    assert "sensor.lounge_mic_spectrum" in package["recorder"]["exclude"]["entities"]


def test_two_music_sensors_fail(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][1]["music"] = True
    with pytest.raises(dr.RenderError, match=r"two music sensors: living-room, kids-room"):
        render_text(tmp_path, inputs)


def test_no_music_sensor_no_aliases(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][0]["music"] = False
    package = render(tmp_path, inputs)
    assert templates(package).keys() == {"audio_sensor_living_room_spl_offset", "audio_sensor_kids_room_spl_offset"}
    assert "script" not in package
    assert "sensor.music_spectrum" not in package["recorder"]["exclude"]["entities"]
    assert "input_number" in package


def test_offset_helper_has_no_initial(demo):
    helpers = demo["input_number"]
    assert set(helpers) == {"living_room_spl_offset", "kids_room_spl_offset", "audio_sensor_measured_offset"}
    for helper in (helpers["living_room_spl_offset"], helpers["kids_room_spl_offset"]):
        assert "initial" not in helper
        assert (helper["min"], helper["max"], helper["step"]) == (0, 140, 0.1)
        assert helper["mode"] == "box"
        assert helper["unit_of_measurement"] == "dB"


def test_offset_sensor_per_board(demo):
    sensor = templates(demo)["audio_sensor_kids_room_spl_offset"]
    assert sensor["default_entity_id"] == "sensor.kids_room_spl_offset"
    assert "Kids' room" in sensor["name"]
    assert "input_number.kids_room_spl_offset" in sensor["state"]


def test_offset_sensor_carries_the_boards_calibrated_flag(demo):
    """room-meter-card drops its "estimated" note only for an offset entity with `calibrated: true`."""
    sensor = templates(demo)["audio_sensor_kids_room_spl_offset"]
    calibrated = sensor["attributes"]["calibrated"]
    assert "input_boolean.kids_room_spl_calibrated" in calibrated
    assert evaluate(calibrated, {"input_boolean.kids_room_spl_calibrated": "on"}) == "True"
    assert evaluate(calibrated, {"input_boolean.kids_room_spl_calibrated": "off"}) == "False"
    assert evaluate(calibrated, {}) == "False"  # the flag not there yet: an estimate


def test_music_offset_alias_carries_the_selected_boards_calibrated_flag(demo):
    calibrated = templates(demo)["audio_sensor_music_spl_offset"]["attributes"]["calibrated"]
    flags = {"input_boolean.living_room_spl_calibrated": "off", "input_boolean.kids_room_spl_calibrated": "on"}
    assert evaluate(calibrated, {**flags, SELECT: "Kids' room"}) == "True"
    assert evaluate(calibrated, {**flags, SELECT: "Living room"}) == "False"
    assert evaluate(calibrated, {**flags, SELECT: "unknown"}) == "False"  # the music: true board


def test_id_prefix_default_slugs_room(tmp_path):
    inputs = demo_inputs()
    package = render(tmp_path, inputs)
    assert "living_room_spl_offset" in package["input_number"]
    inputs["sensors"][0]["id_prefix"] = "lounge"
    package = render(tmp_path / "again", inputs)
    assert "lounge_spl_offset" in package["input_number"]
    assert "living_room_spl_offset" not in package["input_number"]


def test_kids_room_apostrophe_slugs_to_kids_room(demo):
    # The area "Kids' room" gives the guessed entity id its area slug.
    assert "sensor.kids_room_audio_sensor_kids_room_spectrum" in demo["recorder"]["exclude"]["entities"]


def test_recorder_excludes_every_spectrum_and_the_alias(demo):
    excluded = demo["recorder"]["exclude"]["entities"]
    assert sorted(excluded) == [
        "sensor.kids_room_audio_sensor_kids_room_spectrum",
        "sensor.living_room_audio_sensor_living_room_spectrum",
        "sensor.music_spectrum",
    ]


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda i: i["sensors"][1].update(room="living-room"), "duplicate room: living-room"),
        (lambda i: i["sensors"][1].update(id_prefix="living_room"), "duplicate id_prefix: living_room"),
        (lambda i: i["sensors"][0].update(entities={"volume": "sensor.x"}), "unknown entity key: volume"),
    ],
)
def test_input_validation_fails(tmp_path, mutate, message):
    inputs = copy.deepcopy(demo_inputs())
    mutate(inputs)
    with pytest.raises(dr.RenderError, match=message):
        render_text(tmp_path, inputs)


def test_alias_templates_stay_cheap(demo):
    # The spectrum changes five times a second: its alias is a lookup in a rendered map and two
    # states() calls (the select, then the picked board's spectrum), no loops or filters.
    state = templates(demo)["audio_sensor_music_spectrum"]["state"]
    assert state.count("states(") == 2
    assert "for " not in state and "split" not in state


def test_entities_carry_the_component_and_boards_their_area(demo):
    found = templates(demo)
    assert len(found) == 8
    for entity in found.values():
        assert entity["attributes"]["component"] == "audio-sensor"
    assert found["audio_sensor_kids_room_spl_offset"]["attributes"]["area"] == "Kids' room"
    assert found["audio_sensor_living_room_spl_offset"]["attributes"]["area"] == "Living room"
    assert "area" not in found["audio_sensor_music_level"]["attributes"]


# --- SPEC-021: the music source and the calibration helpers -----------------------------------


def test_music_source_select_options(tmp_path, demo):
    select = demo["input_select"]["audio_sensor_music_source"]
    assert select["options"] == ["Living room", "Kids' room"]
    assert "initial" not in select
    inputs = demo_inputs()
    inputs["sensors"][0]["music"] = False
    inputs["sensors"][1]["music"] = True
    inputs["sensors"].append({"room": "hall", "area": "Hall"})
    options = render(tmp_path, inputs)["input_select"]["audio_sensor_music_source"]["options"]
    assert options == ["Kids' room", "Living room", "Hall"]


def test_no_music_board_no_select(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][0]["music"] = False
    package = render(tmp_path, inputs)
    assert "input_select" not in package
    assert "script" not in package
    assert set(package["input_number"]) == {"living_room_spl_offset", "kids_room_spl_offset"}
    assert "audio_sensor_calibration_note" not in package.get("input_text", {})
    # The per-board flag and note exist for every board.
    assert set(package["input_boolean"]) == {"living_room_spl_calibrated", "kids_room_spl_calibrated"}
    assert set(package["input_text"]) == {"living_room_spl_note", "kids_room_spl_note"}


def test_one_board_one_option(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"] = inputs["sensors"][:1]
    package = render(tmp_path, inputs)
    assert package["input_select"]["audio_sensor_music_source"]["options"] == ["Living room"]
    assert "script" in package
    assert "sensor.music_spectrum" in package["recorder"]["exclude"]["entities"]


def test_duplicate_area_fails(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][1]["area"] = "Living room"
    with pytest.raises(dr.RenderError, match=r"duplicate area: Living room"):
        render_text(tmp_path, inputs)
    # Without a music board there is no select, so no collision to refuse.
    inputs["sensors"][0]["music"] = False
    render_text(tmp_path / "none", inputs)


def test_calibration_helpers_per_board(demo):
    for prefix, area in (("living_room", "Living room"), ("kids_room", "Kids' room")):
        flag = demo["input_boolean"][f"{prefix}_spl_calibrated"]
        assert area in flag["name"] and "initial" not in flag
        note = demo["input_text"][f"{prefix}_spl_note"]
        assert area in note["name"] and note["max"] == 255 and "initial" not in note
    measured = demo["input_number"]["audio_sensor_measured_offset"]
    assert (measured["min"], measured["max"], measured["step"]) == (0, 140, 0.1)
    assert measured["unit_of_measurement"] == "dB" and "initial" not in measured
    note = demo["input_text"]["audio_sensor_calibration_note"]
    assert note["max"] == 255 and "initial" not in note


def test_no_helper_has_an_initial(demo):
    for domain in ("input_number", "input_boolean", "input_text", "input_select"):
        for helper in demo[domain].values():
            assert "initial" not in helper


def test_aliases_follow_the_select(demo):
    found = templates(demo)
    states = {
        SELECT: "Kids' room",
        LIVING: "-40,-41", KIDS: "-50,-51",
        LIVING_LEVEL: "-30", KIDS_LEVEL: "-20",
        "input_number.living_room_spl_offset": "90", "input_number.kids_room_spl_offset": "100",
        "sensor.living_room_audio_sensor_living_room_mic_gain": "24DB",
        "sensor.kids_room_audio_sensor_kids_room_mic_gain": "18DB",
        "input_boolean.living_room_spl_calibrated": "off", "input_boolean.kids_room_spl_calibrated": "on",
        "input_text.living_room_spl_note": "estimate", "input_text.kids_room_spl_note": "measured with a phone app",
    }

    def value(uid, **changes):
        return evaluate(found[uid]["state"], {**states, **changes})

    # The select on the second board's area reads that board's entities.
    assert value("audio_sensor_music_spectrum") == "-50,-51"
    assert value("audio_sensor_music_spl_offset") == "100.0"
    assert value("audio_sensor_music_level") == "80.0"
    assert value("audio_sensor_music_sensor_online") == "True"
    assert value("audio_sensor_music_mic_gain") == "18DB"
    assert value("audio_sensor_music_spl_calibration") == "calibrated"
    assert evaluate(found["audio_sensor_music_spl_calibration"]["attributes"]["note"], states) == "measured with a phone app"
    # The first board's area, and `unknown` or `unavailable` (a first start, a lost helper): the
    # `music: true` board.
    for selected, spectrum, level, gain, calibration in (
        ("Living room", "-40,-41", "60.0", "24DB", "estimate"),
        ("unknown", "-40,-41", "60.0", "24DB", "estimate"),
        ("unavailable", "-40,-41", "60.0", "24DB", "estimate"),
    ):
        assert value("audio_sensor_music_spectrum", **{SELECT: selected}) == spectrum
        assert value("audio_sensor_music_level", **{SELECT: selected}) == level
        assert value("audio_sensor_music_mic_gain", **{SELECT: selected}) == gain
        assert value("audio_sensor_music_spl_calibration", **{SELECT: selected}) == calibration
    # A select state that is not an option behaves like unknown.
    assert value("audio_sensor_music_spectrum", **{SELECT: "Garage"}) == "-40,-41"
    # The online sensor follows the selected board's spectrum.
    assert value("audio_sensor_music_sensor_online", **{KIDS: "unavailable"}) == "False"
    assert value("audio_sensor_music_sensor_online", **{KIDS: "unavailable", SELECT: "Living room"}) == "True"


def test_aliases_follow_the_select_with_another_default(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][0]["music"] = False
    inputs["sensors"][1]["music"] = True
    found = templates(render(tmp_path, inputs))
    states = {LIVING: "a", KIDS: "b"}
    assert evaluate(found["audio_sensor_music_spectrum"]["state"], {**states, SELECT: "unknown"}) == "b"
    assert evaluate(found["audio_sensor_music_spectrum"]["state"], {**states, SELECT: "Living room"}) == "a"


def test_apostrophe_and_quote_in_an_area_stay_valid(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][1]["area"] = "Sam's \"den\""
    inputs["sensors"][1]["entities"] = {"spectrum": "sensor.sams_den_spectrum"}
    found = templates(render(tmp_path, inputs))
    states = {LIVING: "a", "sensor.sams_den_spectrum": "b", SELECT: 'Sam\'s "den"'}
    assert evaluate(found["audio_sensor_music_spectrum"]["state"], states) == "b"


def test_apply_calibration_targets_the_selected_board(demo):
    script = demo["script"]["audio_sensor_apply_calibration"]
    sequence = script["sequence"]
    guard = sequence[0]
    assert guard["condition"] == "template"
    variables = sequence[1]["variables"]
    assert list(variables) == ["board"]
    states = {
        "input_number.audio_sensor_measured_offset": "93.5",
        "input_text.audio_sensor_calibration_note": "pink noise, 70 dB on the meter",
    }
    for selected, prefix in (("Kids' room", "kids_room"), ("Living room", "living_room"),
                             ("unknown", "living_room"), ("unavailable", "living_room")):
        board = evaluate(variables["board"], {**states, SELECT: selected})
        assert board == prefix
        context = {"board": board}
        rendered = []
        assert evaluate_with(guard["value_template"], states, context) == "True"
        for step in sequence[2:]:
            target = evaluate_with(step["target"]["entity_id"], states, context)
            data = {k: evaluate_with(v, states, context) for k, v in step.get("data", {}).items()}
            rendered.append((step["action"], target, data))
        assert rendered == [
            ("input_number.set_value", f"input_number.{prefix}_spl_offset", {"value": "93.5"}),
            ("input_text.set_value", f"input_text.{prefix}_spl_note", {"value": "pink noise, 70 dB on the meter"}),
            ("input_boolean.turn_on", f"input_boolean.{prefix}_spl_calibrated", {}),
        ]


def test_apply_calibration_refuses_a_missing_measurement(demo):
    # Nothing is written (and the flag stays off) unless the measured offset is a number and the
    # note has a state: the script stops at its first step.
    guard = demo["script"]["audio_sensor_apply_calibration"]["sequence"][0]
    assert "float(0)" not in str(demo["script"])
    good = {
        "input_number.audio_sensor_measured_offset": "93.5",
        "input_text.audio_sensor_calibration_note": "",
        SELECT: "Living room",
    }
    assert evaluate_with(guard["value_template"], good, {}) == "True"
    for entity in ("input_number.audio_sensor_measured_offset", "input_text.audio_sensor_calibration_note"):
        for bad in ("unavailable", "unknown"):
            assert evaluate_with(guard["value_template"], {**good, entity: bad}, {}) == "False", (entity, bad)
    assert evaluate_with(guard["value_template"], {**good, "input_number.audio_sensor_measured_offset": "abc"}, {}) == "False"


def test_text_sensors_default_to_the_sensor_domain(tmp_path):
    # ESPHome text sensors appear in Home Assistant as sensor.*, so the guessed ids use that domain.
    found = templates(render(tmp_path, demo_inputs()))
    assert "sensor.living_room_audio_sensor_living_room_mic_gain" in found["audio_sensor_music_mic_gain"]["state"]
    assert "text_sensor." not in found["audio_sensor_music_mic_gain"]["state"]
    manifest = yaml.safe_load((COMP / "component.yaml").read_text(encoding="utf-8"))
    keys = next(i for i in manifest["inputs"]["sensors"].items() if i[0] == "item")[1]["entities"]["keys"]
    assert keys["mic_gain"] == "sensor.<..>_mic_gain"
    assert keys["bssid"] == "sensor.<..>_connected_ap_bssid"


def evaluate_with(template, states_by_id, context) -> str:
    env = jinja2.Environment()
    env.filters["is_number"] = lambda v: isinstance(v, str) and v.lstrip("-").replace(".", "", 1).isdigit()
    return env.from_string(template).render(states=lambda e: states_by_id.get(e, "unavailable"), **context).strip()


def test_calibration_entities_carry_the_component(demo):
    found = templates(demo)
    for uid, entity_id in (
        ("audio_sensor_music_mic_gain", "sensor.music_mic_gain"),
        ("audio_sensor_music_spl_calibration", "sensor.music_spl_calibration"),
    ):
        assert found[uid]["default_entity_id"] == entity_id
        assert found[uid]["attributes"]["component"] == "audio-sensor"


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda i: i.update(room_acoustics=True), "input room_acoustics was removed"),
        (lambda i: i.update(room_acoustics=False), "input room_acoustics was removed"),
        (lambda i: i.update(playing="media_player.living_room_speaker"), "input playing was removed"),
        (lambda i: i["sensors"][1].update(acoustics=True), "input sensors\\[\\].acoustics was removed"),
    ],
)
def test_removed_room_acoustics_inputs_fail(tmp_path, mutate, message):
    # Room acoustics was dropped before 0.1.0 shipped (SPEC-018, 2026-10-29): no bridge, a clear refusal.
    inputs = copy.deepcopy(demo_inputs())
    mutate(inputs)
    with pytest.raises(dr.RenderError, match=message):
        render_text(tmp_path, inputs)


def test_demo_inputs_and_manifest_carry_no_room_acoustics():
    manifest = yaml.safe_load((COMP / "component.yaml").read_text(encoding="utf-8"))
    assert not {"room_acoustics", "playing"} & set(manifest["inputs"])
    assert "acoustics" not in manifest["inputs"]["sensors"]["item"]
    assert not {"room_acoustics", "playing"} & set(demo_inputs())
    assert all("acoustics" not in board for board in demo_inputs()["sensors"])
    assert "apexcharts-card" not in [entry["name"] for entry in manifest["integrations"]]


# --- #99, #110: the spectrum rate choice, the watching flag and their forwarding --------------

RATE = "input_select.audio_sensor_music_spectrum_rate"
WATCHING = "input_boolean.audio_sensor_music_watching"
LIVING_RATE = "select.living_room_audio_sensor_living_room_spectrum_rate"
KIDS_RATE = "select.kids_room_audio_sensor_kids_room_spectrum_rate"


def rate_automation(package) -> dict:
    return next(a for a in package["automation"] if a["id"] == "audio_sensor_music_spectrum_rate")


def run_template(template, states_by_id, **context) -> str:
    """A Home Assistant template with stub states and extra variables (trigger, earlier variables)."""
    env = jinja2.Environment()

    def states(entity_id):
        return states_by_id.get(entity_id, "unavailable")

    return env.from_string(template).render(
        states=states, is_state=lambda e, v: states(e) == v, **context).strip()


def rate_calls(package, states_by_id, trigger) -> list:
    """The select.select_option calls the automation's actions make, run with stub states."""
    actions = rate_automation(package)["actions"]
    context = {"trigger": trigger}
    for name, template in actions[0]["variables"].items():
        context[name] = run_template(template, states_by_id, **context)
    calls = []
    for step in actions[1:]:
        if "if" in step:
            if all(run_template(c["value_template"], states_by_id, **context) == "True" for c in step["if"]):
                for inner in step["then"]:
                    calls.append((run_template(inner["target"]["entity_id"], states_by_id, **context),
                                  run_template(inner["data"]["option"], states_by_id, **context)))
        elif step.get("condition") == "template":
            if run_template(step["value_template"], states_by_id, **context) != "True":
                break
        else:
            assert step["action"] == "select.select_option"
            calls.append((run_template(step["target"]["entity_id"], states_by_id, **context),
                          run_template(step["data"]["option"], states_by_id, **context)))
    return calls


def test_spectrum_rate_helpers_with_a_music_board(demo):
    rate = demo["input_select"]["audio_sensor_music_spectrum_rate"]
    assert rate["options"] == ["normal", "eco", "fast"]  # a fresh helper takes the first
    assert "initial" not in rate
    watching = demo["input_boolean"]["audio_sensor_music_watching"]
    assert "initial" not in watching


def test_no_music_board_no_spectrum_rate(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][0]["music"] = False
    package = render(tmp_path, inputs)
    assert "input_select" not in package
    assert "audio_sensor_music_watching" not in package["input_boolean"]
    assert all(a["id"] != "audio_sensor_music_spectrum_rate" for a in package.get("automation") or [])


def test_spectrum_rate_automation_targets_the_selected_board(demo):
    automation = rate_automation(demo)
    assert automation["mode"] == "queued"
    target = automation["actions"][0]["variables"]["target"]
    # The same map and fallback as the aliases: the select's area, else the music: true board.
    assert SELECT in target
    for selected, board in (("Kids' room", KIDS_RATE), ("Living room", LIVING_RATE),
                            ("unknown", LIVING_RATE), ("unavailable", LIVING_RATE)):
        assert run_template(target, {SELECT: selected}) == board
    triggers = automation["triggers"]

    def has(**fields):
        return any(all(t.get(k) == v for k, v in fields.items()) for t in triggers)

    assert has(trigger="state", entity_id=RATE)
    assert has(trigger="state", entity_id=WATCHING, to="on")
    assert has(trigger="state", entity_id=WATCHING, to="off", **{"for": {"seconds": 10}})
    assert has(trigger="state", entity_id=SELECT)
    assert has(trigger="homeassistant", event="start")
    board = [t for t in triggers if t.get("id") == "board"]
    assert len(board) == 1
    assert set(board[0]["entity_id"]) == {LIVING_RATE, KIDS_RATE}


def test_spectrum_rate_reapplies_on_any_change_of_the_boards_select(demo):
    # The board's select coming back online and its own 60 min timeout (fast -> normal) both change
    # its state: one trigger without `from` re-applies the profile for both. Setting the option the
    # select already has changes no state, so it cannot loop.
    board = next(t for t in rate_automation(demo)["triggers"] if t.get("id") == "board")
    assert board["trigger"] == "state"
    assert "from" not in board and "to" not in board
    assert board["not_to"] == ["unavailable", "unknown"]


def test_spectrum_rate_fast_only_while_watching(demo):
    option = rate_automation(demo)["actions"][0]["variables"]["option"]
    for choice, watching, expected in (
        ("fast", "on", "fast"), ("fast", "off", "normal"), ("eco", "off", "eco"), ("eco", "on", "eco"),
        ("normal", "on", "normal"), ("unknown", "on", "normal"), ("unavailable", "off", "normal"),
    ):
        assert run_template(option, {RATE: choice, WATCHING: watching}) == expected, (choice, watching)
    # The whole run: the selected board gets the option, an offline board gets nothing (its
    # coming back is a trigger of its own).
    states = {RATE: "fast", WATCHING: "on", SELECT: "Living room", LIVING_RATE: "normal", KIDS_RATE: "normal"}
    trigger = {"id": "watching", "from_state": None}
    assert rate_calls(demo, states, trigger) == [(LIVING_RATE, "fast")]
    assert rate_calls(demo, {**states, LIVING_RATE: "unavailable"}, trigger) == []


def test_spectrum_rate_resets_the_previous_board(demo):
    states = {RATE: "fast", WATCHING: "on", SELECT: "Kids' room", LIVING_RATE: "fast", KIDS_RATE: "normal"}
    trigger = {"id": "source", "from_state": {"state": "Living room"}}
    assert rate_calls(demo, states, trigger) == [(LIVING_RATE, "normal"), (KIDS_RATE, "fast")]
    # The old board offline: it boots on normal anyway; only the new one is set.
    assert rate_calls(demo, {**states, LIVING_RATE: "unavailable"}, trigger) == [(KIDS_RATE, "fast")]
    # Any other trigger leaves the other board alone.
    assert rate_calls(demo, states, {"id": "choice", "from_state": {"state": "eco"}}) == [(KIDS_RATE, "fast")]
    # A source change that lands on the same board (unknown -> its own area) resets nothing.
    same = {**states, SELECT: "Living room"}
    assert rate_calls(demo, same, {"id": "source", "from_state": {"state": "unknown"}}) == [(LIVING_RATE, "fast")]


def test_entities_input_accepts_spectrum_rate(tmp_path):
    inputs = demo_inputs()
    inputs["sensors"][0]["entities"] = {"spectrum_rate": "select.lounge_mic_spectrum_rate"}
    package = render(tmp_path, inputs)
    target = rate_automation(package)["actions"][0]["variables"]["target"]
    assert run_template(target, {SELECT: "Living room"}) == "select.lounge_mic_spectrum_rate"
    assert any(t.get("entity_id") == "select.lounge_mic_spectrum_rate"
               or "select.lounge_mic_spectrum_rate" in (t.get("entity_id") or [])
               for t in rate_automation(package)["triggers"])
