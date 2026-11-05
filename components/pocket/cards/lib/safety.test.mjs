// The Safety page's data (lib/safety.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { alarmsOf, issuesOf, occupiedAreas, peopleOf, reporting, sirensOf } from "./safety.js";
import { config, st } from "../testing/demo-home.mjs";

function safetyHass(extra = {}) {
  const hass = { states: {
    "binary_sensor.kitchen_smoke": st("off", { friendly_name: "Kitchen smoke", device_class: "smoke" }),
    "binary_sensor.bathroom_leak": st("on", { friendly_name: "Bathroom leak", device_class: "moisture" }),
    "binary_sensor.hall_co": st("unavailable", { friendly_name: "Hall CO", device_class: "carbon_monoxide" }),
    "binary_sensor.old_too_humid": st("unavailable", { friendly_name: "Old too humid", device_class: "moisture", restored: true }),
    "binary_sensor.nas_drive_1": st("off", { friendly_name: "NAS drive", device_class: "safety" }),
    "binary_sensor.bathroom_humidity_high": st("on", { friendly_name: "Bathroom humidity high", device_class: "moisture", component: "climate-air" }),
    "binary_sensor.front_door": st("on", { friendly_name: "Front door", device_class: "door" }),
    "binary_sensor.bedroom_window": st("off", { friendly_name: "Bedroom window", device_class: "window" }),
    "lock.front_door": st("unlocked", { friendly_name: "Front door lock" }),
    "lock.garden_gate": st("locked", { friendly_name: "Garden gate" }),
    "cover.bedroom_blind": st("open", { friendly_name: "Bedroom blind" }),
    "siren.hall": st("off", { friendly_name: "Hall siren" }),
    "person.alex": st("home", { friendly_name: "Alex" }),
    "person.sam": st("not_home", { friendly_name: "Sam" }),
    "person.wall": st("home", { friendly_name: "Wall", person_role: "kiosk" }),
    "binary_sensor.living_room_presence": st("on", { friendly_name: "Living room presence", device_class: "occupancy" }),
    "binary_sensor.office_presence": st("off", { friendly_name: "Office presence", device_class: "occupancy" }),
    "binary_sensor.radar_engineering": st("on", { friendly_name: "Radar engineering", device_class: "occupancy" }),
    ...extra,
  } };
  hass.entities = {
    "binary_sensor.living_room_presence": { entity_id: "binary_sensor.living_room_presence", area_id: "living_room" },
    "binary_sensor.office_presence": { entity_id: "binary_sensor.office_presence", area_id: "office" },
    "binary_sensor.radar_engineering": { entity_id: "binary_sensor.radar_engineering", area_id: "living_room", entity_category: "diagnostic" },
  };
  return hass;
}

test("alarms: smoke, gas, CO, leaks and tamper; a restored leftover, a drive's health and a component's flag left out", () => {
  assert.deepEqual(alarmsOf(safetyHass()), ["binary_sensor.bathroom_leak", "binary_sensor.hall_co", "binary_sensor.kitchen_smoke"]);
});

test("sirens, people and the rooms that sense someone now", () => {
  const hass = safetyHass();
  assert.deepEqual(sirensOf(hass), ["siren.hall"]);
  assert.deepEqual(peopleOf(hass), ["person.alex", "person.sam"]);
  const t = (key) => key;
  assert.deepEqual(occupiedAreas(hass, config, t).map((g) => [g.name, g.ids]),
    [["Living room", ["binary_sensor.living_room_presence"]]], "a diagnostic radar target is no presence");
});

test("issues: alarms, sirens, open doors and windows, unlocked locks, open covers; not reporting is no issue", () => {
  const hass = safetyHass();
  assert.deepEqual(issuesOf(hass, config), [
    { kind: "alarm", id: "binary_sensor.bathroom_leak" },
    { kind: "open", id: "binary_sensor.front_door" },
    { kind: "unlocked", id: "lock.front_door" },
    { kind: "cover", id: "cover.bedroom_blind" },
  ]);
  const quiet = safetyHass({ "binary_sensor.bathroom_leak": st("off", { device_class: "moisture" }),
    "binary_sensor.front_door": st("off", { device_class: "door" }), "lock.front_door": st("locked"),
    "cover.bedroom_blind": st("closed"), "siren.hall": st("on", { friendly_name: "Hall siren" }) });
  assert.deepEqual(issuesOf(quiet, config), [{ kind: "siren", id: "siren.hall" }]);
  assert.equal(reporting(hass.states["binary_sensor.hall_co"]), false);
  assert.equal(reporting(hass.states["binary_sensor.kitchen_smoke"]), true);
});
