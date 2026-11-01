"""The catalog's own data: components, devices, scenes, and the demo home's states and media."""
import json
import re
from pathlib import Path

import pytest
import yaml
from PIL import Image

import catalog_check as cc
import domosenso_render as dr

REPO = Path(__file__).resolve().parent.parent
DEMO = REPO / "examples" / "demo-home"
MEDIA = DEMO / "media"

COMPONENTS = ["audio-sensor", "awnings", "backup", "bermuda-presence", "calendar", "climate-air", "floorplan", "lights", "media", "plants", "ramka", "remote-access", "weather"]
KINDS = ["air-quality-sensor", "android-tablet", "ble-proxy", "esp32-board", "mains-meter", "mqtt-broker",
         "network-audio-player", "plant-sensor", "rts-awning", "sound-sensor", "temperature-humidity-sensor", "wind-sensor"]
DEVICES = ["cc1101", "hegel-h400", "hlk-ld2410c", "hue-bridge", "m5stack-atom-echos3r", "m5stack-atom-lite", "mi-flora", "ruuvi-air", "shelly-pm-mini-gen3", "tapo-t315", "tcl-9469x"]

# id -> (time, tablet)
SCENES = {
    "morning": ("07:00", {"mode": "ambient", "page": "climate"}),
    "away": ("08:30", {"mode": "off"}),
    "sun": ("13:00", {"mode": "ambient", "page": "status"}),
    "wind": ("16:00", {"mode": "ambient", "page": "climate"}),
    "rain": ("18:00", None),
    "home": ("17:30", {"mode": "controls"}),
    "evening": ("20:00", {"mode": "ambient"}),
    "night": ("22:00", {"mode": "off"}),
}


class BlueprintLoader(yaml.SafeLoader):
    """Reads a Home Assistant blueprint: `!input name` is kept as the name."""


BlueprintLoader.add_constructor("!input", lambda loader, node: loader.construct_scalar(node))


def load(path):
    return yaml.load(Path(path).read_text(encoding="utf-8"), Loader=BlueprintLoader)


def scene(scene_id):
    return load(REPO / "scenes" / f"{scene_id}.yaml")


def demo_states():
    return load(DEMO / "states.yaml")


def ramka_inputs():
    return load(DEMO / "inputs" / "ramka.yaml")


def test_whole_catalog_passes_the_checker_strictly():
    assert cc.check_catalog(REPO) == ([], [])


def test_catalog_lists_the_expected_components_and_devices():
    assert sorted(p.parent.name for p in (REPO / "components").glob("*/component.yaml")) == COMPONENTS
    assert sorted(p.stem for p in (REPO / "devices").glob("*.yaml")) == DEVICES
    assert sorted(p.stem for p in (REPO / "kinds").glob("*.yaml")) == KINDS


def test_match_rules_are_one_language():
    """`devices/` and `kinds/` share the rule definition (SPEC-010); the two schemas keep equal copies."""
    device = json.loads((REPO / "schemas" / "device.schema.json").read_text())
    kind = json.loads((REPO / "schemas" / "kind.schema.json").read_text())
    assert device["$defs"] == kind["$defs"]
    for path in sorted((REPO / "kinds").glob("*.yaml")):
        assert cc.check_kind(path, REPO) == [], path.name


def scanned(integrations, manufacturer, model, model_id=None, domains=(), classes=(), names=()):
    """A device as `hwscan` hands it to the rules."""
    return {"integrations": sorted(integrations), "manufacturer": manufacturer, "model": model,
            "model_id": model_id, "entity_domains": set(domains), "device_classes": set(classes),
            "entity_names": list(names)}


def matched(device, certainty="found"):
    """The device ids and kinds whose rules in the catalog's working tree match `device`."""
    from domosenso_cli import hwscan
    tokens = set()
    for sub in hwscan.RULE_DIRS:
        for path in (REPO / sub).glob("*.yaml"):
            data = load(path)
            for rule in data.get("match") or []:
                if rule.get("certainty", "found") == certainty and "entry" not in rule and hwscan.matches(rule, device):
                    tokens.add(data["id"])
    return tokens


# Seen on HA 2026.9.2 through the core shelly integration (registry and states, read-only).
SHELLY_PM_MINI = scanned(["shelly"], "Shelly", "Shelly PM Mini Gen3", "S3PM-001PCEU16",
                         ["sensor", "binary_sensor", "button", "update"],
                         ["power", "voltage", "current", "frequency", "energy"], ["Power", "Voltage", "Energy"])
# The ESPSomfy node with the awnings package's wind sensor: an MQTT binary_sensor of class safety.
ESPSOMFY_WITH_WIND = scanned(["mqtt"], "rstrouse", "ESPSomfy-RTS", None, ["cover", "binary_sensor"],
                             ["awning", "safety"], ["Awnings wind"])
ESPSOMFY_WITHOUT_WIND = scanned(["mqtt"], "rstrouse", "ESPSomfy-RTS", None, ["cover"], ["awning"])


def test_shelly_pm_mini_is_found_as_a_mains_meter():
    assert {"shelly-pm-mini-gen3", "mains-meter"} <= matched(SHELLY_PM_MINI)


def test_awnings_wind_sensor_is_found_on_the_espsomfy_node():
    assert "wind-sensor" in matched(ESPSOMFY_WITH_WIND)
    assert "wind-sensor" not in matched(ESPSOMFY_WITHOUT_WIND)


def test_all_eight_scenes_valid():
    assert sorted(p.stem for p in (REPO / "scenes").glob("*.yaml")) == sorted(SCENES)
    for scene_id, (time, tablet) in SCENES.items():
        path = REPO / "scenes" / f"{scene_id}.yaml"
        assert cc.check_scene(path, REPO) == [], scene_id
        data = load(path)
        assert data["time"] == time, scene_id
        assert data["tablet"] == tablet, scene_id
        assert data["states"], scene_id


def test_rain_has_no_tablet_and_no_components():
    data = scene("rain")
    assert data["tablet"] is None
    assert data["components"] == [] and data["devices"] == []


@pytest.mark.parametrize("scene_id", ["away", "night"])
def test_away_and_night_list_no_roller_shutters(scene_id):
    data = scene(scene_id)
    assert not [x for x in data["components"] + data["devices"] if "shutter" in x or "roller" in x]
    assert not [e for e in data["states"] if "shutter" in e or "roller" in e]


def test_scene_states_are_strings_or_numbers_not_yaml_booleans():
    """Unquoted on/off parse as booleans in YAML 1.1; Home Assistant states are strings."""
    for path in sorted((REPO / "scenes").glob("*.yaml")):
        for entity, value in load(path)["states"].items():
            assert not isinstance(value, bool), f"{path.name}: {entity}"
    for entity, value in demo_states()["states"].items():
        assert not isinstance(value, bool), entity


def test_every_device_belongs_to_a_component():
    for path in sorted((REPO / "devices").glob("*.yaml")):
        data = load(path)
        assert cc.check_device(path, REPO) == [], path.name
        assert (REPO / "components" / data["component"] / "component.yaml").is_file(), path.name
        assert data["photo"] is None, f"{path.name}: placeholder until photos are supplied"


def test_scenes_reference_only_existing_things_and_the_index_is_derived():
    index = cc.scenes_for(REPO)
    assert set(index) <= set(COMPONENTS) | set(DEVICES)
    assert {"sun", "wind"} <= set(index["awnings"])
    assert "evening" in index["media"]
    assert "morning" in index["climate-air"]
    assert "rain" not in {s for scenes in index.values() for s in scenes}


def test_every_scene_entity_exists_in_demo_states():
    states = demo_states()["states"]
    for path in sorted((REPO / "scenes").glob("*.yaml")):
        missing = [e for e in load(path)["states"] if e not in states]
        assert not missing, f"{path.name}: {missing}"


def test_demo_states_cover_the_ramka_inputs():
    """A sensible baseline for every entity the demo Ramka reads."""
    inputs = ramka_inputs()
    wanted = {inputs["media_player"], inputs["wind_sensor"], inputs["weather"], inputs["calendar"],
              inputs["lights_all_off"], *inputs["radar"].values(), *inputs["mains"].values(), *inputs["air"].values(),
              inputs["pressure"], *inputs["outside"].values()}
    wanted |= {c["entity"] for c in inputs["covers"]} | {x["entity"] for x in inputs["lights"]}
    wanted |= {x["entity"] for x in inputs["plants"]}
    for room in inputs["climate"]:
        wanted |= {room["temperature"], room["humidity"]}
    for group in inputs["status"].values():
        wanted |= {x["entity"] for x in group}
    slug = inputs["tablet_device"]["sensors"]
    wanted |= {f"sensor.{slug}_{s}" for s in ("light_sensor", "battery_level", "app_importance", "charger_type", "battery_temperature")}
    wanted.add(f"binary_sensor.{slug}_is_charging")
    wanted |= {"input_select.ramka_mode", "input_select.ramka_ambient"}
    states = demo_states()["states"]
    assert sorted(wanted - set(states)) == []


def test_demo_attributes_belong_to_known_entities_and_pictures_exist():
    data = demo_states()
    assert set(data["attributes"]) <= set(data["states"])
    pictures = {e: a["entity_picture"] for e, a in data["attributes"].items() if "entity_picture" in a}
    assert {"media_player.living_room_speaker", "image.ramka_photo"} <= set(pictures)
    for entity, picture in pictures.items():
        assert (DEMO / picture).is_file(), entity


def scene_view(scene_id):
    """(states, attributes) of the demo home in a scene: the baseline with the scene's overrides."""
    base, data = demo_states(), scene(scene_id)
    states = {**base["states"], **data["states"]}
    attributes = {e: dict(a) for e, a in base["attributes"].items()}
    for entity, attrs in (data.get("attributes") or {}).items():
        attributes.setdefault(entity, {}).update(attrs)
    return states, attributes


# The entities the Ramka's package derives from others (scenes/README.md): the website computes
# them, a scene never sets them.
def derived(states):
    playing = "on" if states["media_player.living_room_speaker"] == "playing" else "off"
    music = "on" if playing == "on" and states["input_boolean.ramka_ambient_music"] == "on" else "off"
    return {"binary_sensor.ramka_media_playing": playing, "binary_sensor.ramka_music_view": music}


def test_derived_entities_are_never_set_by_a_scene_and_the_baseline_agrees():
    baseline = demo_states()["states"]
    assert {e: baseline[e] for e in derived(baseline)} == derived(baseline)
    for scene_id in SCENES:
        assert not set(derived(baseline)) & set(scene(scene_id)["states"]), scene_id
    assert derived(scene_view("evening")[0])["binary_sensor.ramka_music_view"] == "on"


@pytest.mark.parametrize("scene_id", sorted(SCENES))
def test_awning_positions_follow_their_state(scene_id):
    states, attributes = scene_view(scene_id)
    for entity in (e for e in states if e.startswith("cover.awning_")):
        position = attributes[entity]["current_position"]
        assert (states[entity] == "open") == (position > 0), f"{entity}: {states[entity]} at {position}"


@pytest.mark.parametrize("scene_id", sorted(SCENES))
def test_a_plant_that_is_ok_has_no_problem_and_enough_water(scene_id):
    defaults = load(REPO / "components" / "ramka" / "component.yaml")["inputs"]["plant_defaults"]["default"]
    bands = {p["entity"]: {**defaults, **p} for p in ramka_inputs()["plants"]}
    states, attributes = scene_view(scene_id)
    for entity, band in bands.items():
        attrs = attributes[entity]
        if states[entity] == "ok":
            assert attrs["problem"] == "none", entity
            assert band["min_moisture"] <= attrs["moisture"] <= band["max_moisture"], entity
        else:
            assert attrs["problem"] != "none", entity


def test_scene_attribute_overrides():
    assert scene_view("sun")[1]["cover.awning_kitchen"]["current_position"] == 100
    assert scene_view("wind")[1]["cover.awning_living_room"]["current_position"] == 0
    states, attributes = scene_view("morning")
    assert states["plant.basil"] == "ok" and attributes["plant.basil"]["problem"] == "none"
    assert attributes["plant.basil"]["moisture"] > 15


ENTITY_DOMAINS = ("sensor", "binary_sensor", "input_select", "input_boolean", "input_number", "input_text",
                  "input_button", "input_datetime", "timer", "script", "light", "cover", "media_player", "weather",
                  "calendar", "plant", "lock", "scene", "image", "automation", "switch", "climate", "fan")
ENTITY_ID = re.compile(rf"\b(?:{'|'.join(ENTITY_DOMAINS)})\.[a-z0-9_]+\b")
ACTION_KEYS = {"action", "service", "perform_action"}


def entity_reads(node, key=None):
    """Entity ids in a dashboard's string values, except the values of action keys (cover.open_cover)."""
    if isinstance(node, dict):
        for k, value in node.items():
            yield from entity_reads(value, k)
    elif isinstance(node, list):
        for item in node:
            yield from entity_reads(item, key)
    elif isinstance(node, str) and key not in ACTION_KEYS:
        yield from ENTITY_ID.findall(node)


def test_every_entity_the_demo_dashboard_reads_has_a_state_or_comes_from_the_package(tmp_path):
    """...or from a component the Ramka consumes (audio-sensor's music aliases, 0.4.0), whose own
    package creates it in the demo home."""
    out = tmp_path / "ramka"
    dr.render_component(REPO / "components" / "ramka", ramka_inputs(), out, ["en"])
    dashboard = yaml.safe_load((out / "dashboard.en.yaml").read_text(encoding="utf-8"))
    package = yaml.safe_load((out / "package.yaml").read_text(encoding="utf-8"))
    created = set()
    for domain in ("input_select", "input_boolean", "input_number", "input_text", "input_button", "timer", "script"):
        created |= {f"{domain}.{key}" for key in package.get(domain) or {}}
    for block in package["template"]:
        for kind, entities in block.items():
            if kind != "triggers":  # a trigger-based block's triggers, not entities
                created |= {e["default_entity_id"] for e in entities}
    manifest = yaml.safe_load((REPO / "components" / "ramka" / "component.yaml").read_text(encoding="utf-8"))
    consumed = {c["id"] for c in manifest["consumes"] if "id" in c}
    reads = set(entity_reads(dashboard))
    assert len(reads) > 40
    assert sorted(reads - set(demo_states()["states"]) - created - consumed) == []


def test_scene_values_agree_with_what_the_ramka_shows():
    inputs = ramka_inputs()
    assert scene("wind")["states"][inputs["wind_sensor"]] == "on"
    assert scene("sun")["states"]["cover.awning_living_room"] == "open"
    assert scene("evening")["states"][inputs["media_player"]] == "playing"
    for scene_id in ("morning", "away", "wind", "home", "evening", "night"):
        assert scene(scene_id)["states"].get("cover.awning_living_room", "closed") == "closed", scene_id


def test_scene_modes_and_pages_use_the_ramka_vocabulary():
    for scene_id in SCENES:
        tablet = scene(scene_id)["tablet"]
        if tablet:
            assert tablet["mode"] in cc.RAMKA_MODES
            assert tablet.get("page", "climate") in cc.RAMKA_PAGES


# Which component owns each entity of the demo home (None: hardware the catalog does not cover),
# and which entities each device has of its own. A device without entities here (the Hue bridge, the
# radio module, the Atom Lite proxy) follows its component.
ROOMS_TAPO = ["living_room", "kitchen", "office", "bedroom", "kids_room", "hall"]
ENTITY_OWNER = {
    "input_select.ramka_mode": "ramka", "input_select.ramka_ambient": "ramka",
    "input_boolean.ramka_ambient_music": "ramka", "input_boolean.ramka_near_enabled": "ramka",
    "binary_sensor.ramka_media_playing": "ramka", "binary_sensor.ramka_music_view": "ramka",
    "input_text.ramka_photo": "ramka", "image.ramka_photo": "ramka",
    "binary_sensor.dining_ble_proxy_dining_presence": "bermuda-presence",
    "sensor.dining_ble_proxy_dining_detection_distance": "bermuda-presence",
    "sensor.dining_tablet_light_sensor": "ramka", "sensor.dining_tablet_battery_level": "ramka",
    "sensor.dining_tablet_app_importance": "ramka", "sensor.dining_tablet_charger_type": "ramka",
    "sensor.dining_tablet_battery_temperature": "ramka", "binary_sensor.dining_tablet_is_charging": "ramka",
    "media_player.living_room_speaker": "media", "sensor.media_plug_power": "media", "sensor.media_plug_voltage": "media",
    "cover.awning_living_room": "awnings", "cover.awning_kitchen": "awnings", "binary_sensor.awnings_wind": "awnings",
    **{f"light.{room}": "lights" for room in ["living_room", "dining", "kitchen", "office", "bedroom", "kids_room", "hall"]},
    "scene.all_lights_off": "lights",
    **{f"sensor.{room}_{kind}": "climate-air" for room in ROOMS_TAPO for kind in ("temperature", "humidity")},
    "sensor.dining_air_temperature": "climate-air", "sensor.dining_air_humidity": "climate-air",
    "sensor.dining_air_quality_score": "climate-air", "sensor.dining_air_carbon_dioxide": "climate-air",
    "sensor.dining_air_pm2_5": "climate-air", "sensor.dining_air_voc_index": "climate-air",
    "sensor.dining_air_nox_index": "climate-air", "sensor.dining_air_pressure": "climate-air",
    "sensor.outside_temperature": "weather", "sensor.outside_humidity": "weather", "weather.forecast_home": "weather",
    "plant.monstera": "plants", "plant.ficus": "plants", "plant.basil": "plants",
    "binary_sensor.balcony_door_contact": None, "lock.front_door": None,
    "calendar.family": "calendar",
}
DEVICE_ENTITIES = {
    "hlk-ld2410c": ["binary_sensor.dining_ble_proxy_dining_presence", "sensor.dining_ble_proxy_dining_detection_distance"],
    "hegel-h400": ["media_player.living_room_speaker"],
    "shelly-pm-mini-gen3": ["sensor.media_plug_power", "sensor.media_plug_voltage"],
    "tapo-t315": [f"sensor.{room}_{kind}" for room in ROOMS_TAPO for kind in ("temperature", "humidity")],
    "ruuvi-air": [e for e in ENTITY_OWNER if e.startswith("sensor.dining_air_")],
    "mi-flora": ["plant.monstera", "plant.ficus", "plant.basil"],
}


def expected_listing(scene_id):
    """The listing rule: a component is listed when one of its entities has a state (or an attribute)
    other than the baseline's in this scene (the Ramka also whenever the tablet is not null); a device when its
    component is listed and, if it has entities of its own, one of them changed."""
    data, base = scene(scene_id), demo_states()
    baseline, base_attributes = base["states"], base["attributes"]
    changed = {e for e, value in data["states"].items() if value != baseline[e]}
    changed |= {e for e, attrs in (data.get("attributes") or {}).items()
                if any(base_attributes.get(e, {}).get(k) != v for k, v in attrs.items())}
    components = {ENTITY_OWNER[e] for e in changed} - {None}
    if data["tablet"] is not None:
        components.add("ramka")
    devices = set()
    for path in (REPO / "devices").glob("*.yaml"):
        device = load(path)
        if device["component"] not in components:
            continue
        own = DEVICE_ENTITIES.get(device["id"])
        if own is None or changed & set(own):
            devices.add(device["id"])
    return sorted(components), sorted(devices)


def test_entity_owner_map_covers_the_demo_states_and_known_components():
    assert set(ENTITY_OWNER) == set(demo_states()["states"])
    assert {c for c in ENTITY_OWNER.values() if c} <= set(COMPONENTS)
    assert set(DEVICE_ENTITIES) <= set(DEVICES)


@pytest.mark.parametrize("scene_id", sorted(SCENES))
def test_scene_lists_exactly_what_it_changes(scene_id):
    data = scene(scene_id)
    assert (sorted(data["components"]), sorted(data["devices"])) == expected_listing(scene_id)


def test_device_text_and_hue_wording():
    """pl uses one term for the Hue bridge, as in the device name."""
    pl = (REPO / "components" / "lights" / "translations" / "pl.json").read_text(encoding="utf-8")
    assert "entralk" not in pl and "Mostek" in pl
    assert "wiersz pogody" in (REPO / "components" / "weather" / "translations" / "pl.json").read_text(encoding="utf-8")
    atom = (REPO / "components" / "bermuda-presence" / "translations" / "en.json").read_text(encoding="utf-8")
    assert "ESPSomfy-RTS" in atom
    assert load(REPO / "components" / "media" / "component.yaml")["integrations"][0]["tested"] == "0.1.7"


def test_media_sources_listed():
    sources = (MEDIA / "SOURCES.md").read_text(encoding="utf-8").splitlines()
    files = sorted(p for p in MEDIA.iterdir() if p.name != "SOURCES.md")
    assert files
    for file in files:
        lines = [line for line in sources if file.name in line]
        assert lines, f"{file.name} is not in SOURCES.md"
        assert any(re.search(r"generated|CC0", line) for line in lines), f"{file.name}: no source named"
        with Image.open(file) as image:
            image.verify()
    for line in sources:
        for name in re.findall(r"`([^`]+\.(?:png|jpg))`", line):
            assert (MEDIA / name).is_file(), f"SOURCES.md names {name}, which is not there"


def test_bermuda_input_names_match_its_blueprint():
    manifest = load(REPO / "components" / "bermuda-presence" / "component.yaml")
    blueprint = load(REPO / "components" / "bermuda-presence" / "ha" / "blueprints" / "automation" / "domosenso" / "ble_proxy_offline.yaml")
    assert "minutes" in manifest["inputs"] and "offline_minutes" not in manifest["inputs"]
    assert "minutes" in blueprint["blueprint"]["input"]
    demo = load(DEMO / "inputs" / "bermuda-presence.yaml")
    assert demo["minutes"] == 10 and "offline_minutes" not in demo


# The Task 1 grep, word-bounded, plus the home's address and its tablet's entity prefix. Spelled
# out in pieces so that this file, which the scan reads too, does not contain what it looks for.
FORBIDDEN = [
    "".join(p) for p in (
        ("pio", "tr"), ("kas", "ia"), ("ja", "ś"), (r"\bjas", "_"), (r"\bew", r"a\b"), ("jadal", "nia"),
        ("sal", "on"), ("biu", "ro"), ("przed", "pok"), ("winter ", "garten"), ("sypial", "nia"),
        ("koryt", "arz"), ("pral", "nia"), ("zoll", "weg"), ("tablet_", "jadal"), (r"192\.", r"168"),
    )
]
SCANNED = ["components", "devices", "kinds", "scenes", "examples", "tools", "tests", "schemas", "docs", ".ai",
           "README.md", "CONTRIBUTING.md", "AGENTS.md", "CLAUDE.md", ".github", "website", "SECURITY.md"]
SKIPPED = {"node_modules", "__pycache__", ".venv", ".esphome", ".next", "out", "test-results", "playwright-report"}
# The framework's documents may name its author and the first outside user (Ruling 32), as whole
# words; the name inside a path or a longer word still counts.
DOC_ALLOWED = re.compile("|".join(["".join(("\\bPio", "tr(?:'s)?\\b")), "\u0141ukasz"]))
DOCS = ("docs", "README.md", "CONTRIBUTING.md")


def scanned_files():
    for top in SCANNED:
        path = REPO / top
        files = [path] if path.is_file() else sorted(path.rglob("*")) if path.is_dir() else []
        for f in files:
            if f.is_file() and not SKIPPED & set(f.parts):
                yield f


def privacy_hits(path: Path, text: str) -> list[str]:
    pattern = re.compile("|".join(FORBIDDEN), re.IGNORECASE)
    in_docs = path.relative_to(REPO).parts[0] in DOCS
    hits = []
    for n, line in enumerate(text.splitlines(), 1):
        if in_docs:
            line = DOC_ALLOWED.sub("", line)
        if pattern.search(line):
            hits.append(f"{path.relative_to(REPO)}:{n}")
    return hits


def test_privacy():
    hits = []
    for path in scanned_files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue  # an image
        hits += privacy_hits(path, text)
    assert hits == []


def test_privacy_scan_covers_docs_and_allows_only_the_names():
    files = {p.relative_to(REPO).as_posix() for p in scanned_files()}
    assert "README.md" in files and any(f.startswith("docs/") for f in files)
    assert "CONTRIBUTING.md" in files  # SPEC-013: the repository material moved there
    contributing = REPO / "CONTRIBUTING.md"
    assert privacy_hits(contributing, "".join(("Pio", "tr")) + " decided") == []
    assert {"AGENTS.md", "CLAUDE.md"} <= files and any(f.startswith(".ai/skills/") for f in files)
    doc, code = REPO / "docs" / "x.md", REPO / "tools" / "x.py"
    name = "".join(("Pio", "tr"))
    assert privacy_hits(doc, f"{name} decided; \u0141ukasz tests it; {name}'s home") == []
    assert privacy_hits(code, f"# {name} decided") == ["tools/x.py:1"]
    assert privacy_hits(doc, "~/" + "".join(("pio", "trdz")) + "/x") == ["docs/x.md:1"]
    for word in ("".join(("Zoll", "weg 12")), "".join(("Pral", "nia")), "".join(("tablet_", "jad", "alnia_mode"))):
        assert privacy_hits(doc, word) == ["docs/x.md:1"], word
