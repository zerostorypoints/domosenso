import { test } from "node:test";
import assert from "node:assert/strict";
import { plantsOf, needing, sensorOf, REASONS, LOW_BATTERY } from "./plants.js";
import { config, plantsHass, hassOf, baseStates, st } from "../testing/demo-home.mjs";

const find = (groups, id) => groups.flatMap((g) => g.plants).find((p) => p.id === id);

test("a home with many plants: grouped by area, the area with the worst plant first, plants worst first", () => {
  const groups = plantsOf(plantsHass(), config);
  assert.deepEqual(groups.map((g) => [g.areaId, g.label, g.plants.map((p) => p.id)]), [
    ["bedroom", null, ["plant.fern", "plant.cactus"]],
    ["living_room", null, ["plant.palm", "plant.yucca"]],
    ["office", null, ["plant.ivy", "plant.orchid"]],
    ["kitchen", null, ["plant.herbs"]],
    [null, null, ["plant.bonsai", "plant.new_pot"]],
  ]);
  assert.equal(groups[0].area.id, "bedroom", "a pocket room");
  assert.equal(groups[3].area, null, "an HA area no room of the pocket reads");
  assert.equal(needing(groups), 5);
});

test("the area: the Mi Flora's device before the component's room; the room by name to a pocket room or an HA area", () => {
  const hass = plantsHass();
  assert.equal(plantsOf(hass, config).find((g) => g.plants.some((p) => p.id === "plant.fern")).areaId, "bedroom");
  delete hass.areas.kitchen;
  const herbs = plantsOf(hass, config).find((g) => g.plants.some((p) => p.id === "plant.herbs"));
  assert.deepEqual([herbs.areaId, herbs.label], [null, "Kitchen"], "no such area: the room's label");
  hass.entities["plant.bonsai"] = { entity_id: "plant.bonsai", area_id: "hall" };
  assert.equal(plantsOf(hass, config).find((g) => g.plants.some((p) => p.id === "plant.bonsai")).areaId, "hall");
});

test("why, in plain words: each reason from the bands, the day's brightest light and the integration's problem", () => {
  const groups = plantsOf(plantsHass(), config);
  assert.deepEqual(find(groups, "plant.fern").reasons, ["thirsty"]);
  assert.deepEqual(find(groups, "plant.palm").reasons, ["needs_light"], "the 24 h peak, not the dark now");
  assert.deepEqual(find(groups, "plant.cactus").reasons, ["too_wet", "cold", "needs_fertiliser"]);
  assert.deepEqual(find(groups, "plant.orchid").reasons, ["needs_light", "warm"], "the problem attribute alone");
  assert.deepEqual(find(groups, "plant.ivy").reasons, ["low_battery"]);
  assert.deepEqual(find(groups, "plant.herbs").reasons, []);
  assert.deepEqual([0, 1, 2, 3, 4].map((rank) => ["plant.fern", "plant.cactus", "plant.palm", "plant.herbs", "plant.new_pot"]
    .map((id) => find(groups, id).rank)[rank]), [0, 1, 2, 3, 4]);
  assert.equal(REASONS.length, 9);
  assert.equal(LOW_BATTERY, 15);
});

test("too much light against a max band; a light reading now without a peak judges nothing", () => {
  const hass = plantsHass({ "plant.herbs": st("ok", { friendly_name: "Herbs", brightness: 4000, max_brightness: 60000,
    domosenso_bands: { max_brightness: 30000 } }) });
  assert.deepEqual(find(plantsOf(hass, config), "plant.herbs").reasons, ["too_much_light"]);
  const cactus = find(plantsOf(plantsHass(), config), "plant.cactus");
  assert.equal(cactus.readings.find((r) => r.reading === "illuminance").tone, null);
});

test("readings: the plant's sensors first (its sensors map, else sensor.<plant>_<reading>), else its attributes, with tones", () => {
  const hass = plantsHass();
  const fern = find(plantsOf(hass, config), "plant.fern");
  assert.deepEqual(fern.readings.map((r) => [r.reading, r.entity, r.value, r.tone]), [
    ["moisture", "sensor.fern_moisture", 9, "poor"],
    ["conductivity", "sensor.fern_conductivity", 500, "good"],
    ["illuminance", "sensor.fern_illuminance", 300, "good"],
    ["temperature", "sensor.fern_temperature", 21, null],
    ["battery", "sensor.fern_battery", 80, "good"],
  ]);
  const cactus = find(plantsOf(hass, config), "plant.cactus");
  assert.deepEqual(cactus.readings.map((r) => [r.reading, r.entity, r.tone]), [
    ["moisture", null, "fair"], ["conductivity", null, "fair"], ["illuminance", null, null], ["temperature", null, "cold"]]);
  hass.states["plant.palm"].attributes.sensors = { moisture: "sensor.pot_7_moisture" };
  hass.states["sensor.pot_7_moisture"] = st(12, { unit_of_measurement: "%" });
  assert.equal(sensorOf(hass, "plant.palm", "moisture"), "sensor.pot_7_moisture");
  assert.deepEqual(find(plantsOf(hass, config), "plant.palm").reasons, ["thirsty", "needs_light"]);
  assert.deepEqual(find(plantsOf(hass, config), "plant.orchid").readings, [], "no value and no sensor: no reading");
});

test("an unavailable sensor falls back to the plant's attribute", () => {
  const hass = plantsHass({ "sensor.fern_moisture": st("unavailable") });
  const row = find(plantsOf(hass, config), "plant.fern").readings[0];
  assert.deepEqual([row.entity, row.value], ["sensor.fern_moisture", 9]);
});

test("a home without plants, or a hidden one: nothing", () => {
  assert.deepEqual(plantsOf(hassOf(baseStates()), config), []);
  assert.deepEqual(plantsOf(undefined, config), []);
  const hass = plantsHass();
  hass.entities["plant.yucca"] = { entity_id: "plant.yucca", hidden_by: "user" };
  assert.equal(find(plantsOf(hass, config), "plant.yucca"), undefined);
});

test("hydroculture (SPEC-048): no moisture or fertiliser reading, never thirsty, judged on light", () => {
  const hass = plantsHass();
  const id = Object.keys(hass.states).find((e) => e.startsWith("plant.") && find(plantsOf(hass, config), e)?.reasons.includes("thirsty"));
  assert.ok(id, "the demo has a thirsty plant");
  hass.states[id].attributes = { ...hass.states[id].attributes, domosenso_medium: "hydroculture" };
  const plant = find(plantsOf(hass, config), id);
  assert.equal(plant.hydro, true);
  assert.ok(!plant.reasons.includes("thirsty") && !plant.reasons.includes("too_wet"));
  assert.ok(!plant.readings.some((r) => r.reading === "moisture" || r.reading === "conductivity"));
  assert.ok(plant.readings.some((r) => r.reading === "illuminance"));
  assert.notEqual(plant.rank, 0);
});
