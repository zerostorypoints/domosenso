import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { areaSensors, haAreaOf, isNumeric, sensorValue, loadEntryDomains, clearEntryDomains } from "./sensors.js";
import { categoryOf } from "./categories.js";

const here = (path) => new URL(path, import.meta.url);
const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

// A home's registries: a climate sensor and a plant sensor in the living room, a radar whose
// entity stands in the living room although its device is in the hall, a diagnostic, a hidden and a
// configuration entity, and a disabled device.
export const registryHass = () => ({
  locale: { language: "en" },
  devices: {
    d_climate: { id: "d_climate", name: "Climate sensor", area_id: "living_room" },
    d_plant: { id: "d_plant", name: "Plant sensor", area_id: "living_room" },
    d_radar: { id: "d_radar", name: "Radar", area_id: "hall" },
    d_off: { id: "d_off", name: "Old sensor", area_id: "living_room", disabled_by: "user" },
  },
  entities: {
    "sensor.lr_temperature": { entity_id: "sensor.lr_temperature", device_id: "d_climate", platform: "zha" },
    "sensor.lr_humidity": { entity_id: "sensor.lr_humidity", device_id: "d_climate", platform: "zha" },
    "sensor.lr_battery": { entity_id: "sensor.lr_battery", device_id: "d_climate", platform: "zha", entity_category: "diagnostic" },
    "sensor.lr_hidden": { entity_id: "sensor.lr_hidden", device_id: "d_climate", platform: "zha", hidden: true },
    "sensor.plant_moisture": { entity_id: "sensor.plant_moisture", device_id: "d_plant", platform: "xiaomi_ble" },
    "sensor.plant_conductivity": { entity_id: "sensor.plant_conductivity", device_id: "d_plant", platform: "xiaomi_ble" },
    "binary_sensor.radar": { entity_id: "binary_sensor.radar", device_id: "d_radar", area_id: "living_room", platform: "esphome" },
    "sensor.radar_distance": { entity_id: "sensor.radar_distance", device_id: "d_radar", platform: "esphome" },
    "sensor.old": { entity_id: "sensor.old", device_id: "d_off", platform: "zha" },
    "light.lr": { entity_id: "light.lr", device_id: null, area_id: "living_room", platform: "hue" },
  },
  states: {
    "sensor.lr_temperature": { state: "21.5", attributes: { device_class: "temperature", unit_of_measurement: "°C", friendly_name: "Living room Temperature", state_class: "measurement" } },
    "sensor.lr_humidity": { state: "48", attributes: { device_class: "humidity", unit_of_measurement: "%", friendly_name: "Living room Humidity" } },
    "sensor.lr_battery": { state: "90", attributes: { device_class: "battery" } },
    "sensor.lr_hidden": { state: "1", attributes: {} },
    "sensor.plant_moisture": { state: "33", attributes: { device_class: "moisture", unit_of_measurement: "%", friendly_name: "Monstera moisture" } },
    "sensor.plant_conductivity": { state: "410", attributes: { device_class: "conductivity", unit_of_measurement: "µS/cm", friendly_name: "Monstera conductivity" } },
    "binary_sensor.radar": { state: "on", attributes: { device_class: "occupancy", friendly_name: "Living room Presence" } },
    "sensor.radar_distance": { state: "1.2", attributes: { friendly_name: "Radar distance" } },
    "sensor.old": { state: "3", attributes: {} },
    "light.lr": { state: "on", attributes: {} },
  },
});

test("lib/categories.js, categories.json and shared.js are the floor plan's own files", () => {
  for (const name of ["categories.js", "categories.json", "shared.js"]) {
    assert.equal(readFileSync(here(name), "utf8"), readFileSync(here(`../../../floorplan/cards/lib/${name}`), "utf8"), name);
  }
});

test("an area's sensors by category, the entity's own area before its device's", () => {
  const groups = areaSensors(registryHass(), "living_room");
  assert.deepEqual(groups.map((g) => [g.category, g.entities]), [
    ["plants", ["sensor.plant_conductivity", "sensor.plant_moisture"]],
    ["security", ["binary_sensor.radar"]],
    ["climate", ["sensor.lr_humidity", "sensor.lr_temperature"]],
  ]);
  assert.equal(groups[0].name, "Plants");
  assert.match(groups[2].colour, /^var\(--floorplan-climate, #/);
  assert.deepEqual(areaSensors(registryHass(), "hall").map((g) => g.entities), [["sensor.radar_distance"]],
    "the radar's distance stays with its device's area");
});

test("the category is the device's, from all its usable entities, as the floor plan's", () => {
  // The radar device: an occupancy binary_sensor and a plain sensor; the floor plan's own test.
  const hass = registryHass();
  const expected = categoryOf({ integrations: ["esphome"], manufacturer: null, model: null, model_id: null,
    entity_domains: ["binary_sensor", "sensor"], device_classes: ["occupancy"], entity_names: [], is_hub: false }).id;
  assert.equal(areaSensors(hass, "hall")[0].category, expected);
});

test("hidden, disabled, diagnostic and configuration entities and a disabled device's are left out", () => {
  const hass = registryHass();
  hass.entities["sensor.lr_config"] = { entity_id: "sensor.lr_config", device_id: "d_climate", entity_category: "config" };
  hass.entities["sensor.lr_disabled"] = { entity_id: "sensor.lr_disabled", device_id: "d_climate", disabled_by: "user" };
  hass.entities["sensor.lr_hidden_by"] = { entity_id: "sensor.lr_hidden_by", device_id: "d_climate", hidden_by: "user" };
  for (const id of ["sensor.lr_config", "sensor.lr_disabled", "sensor.lr_hidden_by"]) hass.states[id] = { state: "1", attributes: {} };
  const ids = areaSensors(hass, "living_room").flatMap((g) => g.entities);
  for (const id of ["sensor.lr_battery", "sensor.lr_hidden", "sensor.old", "sensor.lr_config", "sensor.lr_disabled",
    "sensor.lr_hidden_by", "light.lr"]) {
    assert.ok(!ids.includes(id), id);
  }
});

test("an entity without a device is put in a category of its own", () => {
  const hass = registryHass();
  hass.entities["sensor.lr_avg"] = { entity_id: "sensor.lr_avg", device_id: null, area_id: "living_room", platform: "template" };
  hass.states["sensor.lr_avg"] = { state: "21", attributes: { device_class: "temperature" } };
  const climate = areaSensors(hass, "living_room").find((g) => g.category === "climate");
  assert.ok(climate.entities.includes("sensor.lr_avg"));
});

test("no area, no registries: nothing", () => {
  assert.deepEqual(areaSensors(registryHass(), null), []);
  assert.deepEqual(areaSensors({ states: {} }, "living_room"), []);
});

test("the HA area of a room is its area, else its id; the Outside's its outside.area", () => {
  assert.equal(haAreaOf({}, { id: "kitchen" }), "kitchen");
  assert.equal(haAreaOf({}, { id: "kitchen", area: "kuchnia" }), "kuchnia");
  assert.equal(haAreaOf({ outside: { area: "garden" } }, { id: "outside", outside: true }), "garden");
  assert.equal(haAreaOf({}, { id: "outside", outside: true }), null);
});

test("values as Home Assistant words them, else state and unit; unknown is a dash", () => {
  const hass = registryHass();
  assert.equal(sensorValue(hass, "sensor.lr_temperature", t), 'card.pocket.trend.value:{"value":"21.5","unit":"°C"}');
  assert.equal(sensorValue(hass, "binary_sensor.radar", t), "card.pocket.sensors.state.on");
  assert.equal(sensorValue(hass, "sensor.radar_distance", t), "1.2");
  hass.states["sensor.radar_distance"].state = "unavailable";
  assert.equal(sensorValue(hass, "sensor.radar_distance", t), "card.pocket.format.none");
  hass.formatEntityState = (st) => `HA ${st.state}`;
  assert.equal(sensorValue(hass, "binary_sensor.radar", t), "HA on");
});

test("a sensor with a number or a state_class has a trend; a binary sensor has none", () => {
  const hass = registryHass();
  assert.equal(isNumeric(hass, "sensor.lr_temperature"), true);
  assert.equal(isNumeric(hass, "sensor.radar_distance"), true);
  assert.equal(isNumeric(hass, "binary_sensor.radar"), false);
  hass.states["sensor.radar_distance"].state = "far";
  assert.equal(isNumeric(hass, "sensor.radar_distance"), false);
});

test("config entry domains are asked once; a failure answers {} and is asked again", async () => {
  clearEntryDomains();
  const calls = [];
  const ok = { callWS: async (msg) => { calls.push(msg.type); return [{ entry_id: "e1", domain: "zha" }]; } };
  assert.deepEqual(await loadEntryDomains(ok), { e1: "zha" });
  assert.deepEqual(await loadEntryDomains(ok), { e1: "zha" });
  assert.deepEqual(calls, ["config_entries/get"]);
  clearEntryDomains();
  const bad = { callWS: async () => { throw new Error("no"); } };
  assert.deepEqual(await loadEntryDomains(bad), {});
  assert.deepEqual(await loadEntryDomains(ok), { e1: "zha" });
  clearEntryDomains();
});
