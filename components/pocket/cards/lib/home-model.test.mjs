import { test } from "node:test";
import assert from "node:assert/strict";
import { homeModel, orderedAreas } from "./home-model.js";
import { candidatesOf, kindOf, unclassifiedOf } from "./kinds.js";

const st = (state, attributes = {}) => ({ state: String(state), attributes });
const temp = (v) => st(v, { device_class: "temperature", state_class: "measurement", unit_of_measurement: "°C" });
const hum = (v) => st(v, { device_class: "humidity", state_class: "measurement", unit_of_measurement: "%" });

// The demo home's registries: a living room with two climate devices and an air monitor whose
// score has no device class, a bedroom with one, a hall with none, a garden outside.
function hassOf(extra = {}) {
  return {
    floors: { ground: { floor_id: "ground", level: 0 }, up: { floor_id: "up", level: 1 } },
    areas: {
      bedroom: { area_id: "bedroom", name: "Bedroom", floor_id: "up" },
      living_room: { area_id: "living_room", name: "Living room", floor_id: "ground" },
      hall: { area_id: "hall", name: "Hall", floor_id: "ground" },
      garden: { area_id: "garden", name: "Garden", floor_id: null },
    },
    devices: {
      lr_th: { id: "lr_th", name: "Living room sensor", area_id: "living_room" },
      lr_rack: { id: "lr_rack", name: "Rack sensor", area_id: "living_room" },
      lr_air: { id: "lr_air", name: "Air monitor", area_id: "living_room" },
      bed: { id: "bed", name: "Bedroom sensor", area_id: "bedroom" },
      garden: { id: "garden", name: "Garden sensor", area_id: "garden" },
    },
    entities: {
      "sensor.lr_t": { entity_id: "sensor.lr_t", device_id: "lr_th" },
      "sensor.lr_h": { entity_id: "sensor.lr_h", device_id: "lr_th" },
      "sensor.rack_t": { entity_id: "sensor.rack_t", device_id: "lr_rack" },
      "sensor.air_co2": { entity_id: "sensor.air_co2", device_id: "lr_air" },
      "sensor.air_score": { entity_id: "sensor.air_score", device_id: "lr_air" },
      "sensor.air_wifi": { entity_id: "sensor.air_wifi", device_id: "lr_air", entity_category: "diagnostic" },
      "sensor.bed_t": { entity_id: "sensor.bed_t", device_id: "bed" },
      "sensor.bed_battery_temperature": { entity_id: "sensor.bed_battery_temperature", device_id: "bed", entity_category: "diagnostic" },
      "sensor.garden_t": { entity_id: "sensor.garden_t", device_id: "garden" },
      "sensor.hall_temperature": { entity_id: "sensor.hall_temperature", area_id: "hall" },
      "light.lr": { entity_id: "light.lr", area_id: "living_room" },
      "light.lr_a": { entity_id: "light.lr_a", area_id: "living_room" },
      "light.lr_b": { entity_id: "light.lr_b", area_id: "living_room" },
      "light.hidden": { entity_id: "light.hidden", area_id: "living_room", hidden: true },
      "scene.evening": { entity_id: "scene.evening", area_id: "living_room" },
    },
    states: {
      "sensor.lr_t": temp(21.5), "sensor.lr_h": hum(45), "sensor.rack_t": temp(33),
      "sensor.air_co2": st(700, { device_class: "carbon_dioxide", state_class: "measurement" }),
      "sensor.air_score": st(81, { state_class: "measurement" }),
      "sensor.air_wifi": st(-60, { device_class: "signal_strength", state_class: "measurement" }),
      "sensor.bed_t": temp(20), "sensor.bed_battery_temperature": temp(25), "sensor.garden_t": temp(4),
      // Named like a temperature, with no device class: not a candidate (no name likeness, D4).
      "sensor.hall_temperature": st(19, { state_class: "measurement" }),
      "light.lr": st("on", { entity_id: ["light.lr_a", "light.lr_b"] }), "light.lr_a": st("on"), "light.lr_b": st("off"),
      "light.hidden": st("off"), "scene.evening": st("scening"),
    },
    ...extra,
  };
}

const roomOf = (model, id) => model.rooms.find((r) => r.id === id);

test("the areas are Home Assistant's, by floor level then HA's order, areas on no floor last", () => {
  assert.deepEqual(orderedAreas(hassOf()).map((a) => a.area_id), ["living_room", "hall", "bedroom", "garden"]);
  const model = homeModel(hassOf(), {});
  assert.deepEqual(model.rooms.map((r) => [r.id, r.name, r.type]),
    [["living_room", "Living room", "inside"], ["hall", "Hall", "inside"], ["bedroom", "Bedroom", "inside"], ["garden", "Garden", "inside"]],
    "every area is Inside by default");
  assert.equal(model.rooms[0].typeSource, "default");
});

test("candidates by area and device class only: diagnostic, hidden and unclassified sensors are not", () => {
  const hass = hassOf();
  const climate = kindOf("climate");
  assert.deepEqual(candidatesOf(hass, climate, "living_room").map((c) => [c.id, c.name, c.readings]), [
    ["lr_th", "Living room sensor", { temperature: "sensor.lr_t", humidity: "sensor.lr_h" }],
    ["lr_rack", "Rack sensor", { temperature: "sensor.rack_t" }],
  ]);
  assert.deepEqual(candidatesOf(hass, climate, "bedroom").map((c) => c.readings), [{ temperature: "sensor.bed_t" }]);
  assert.deepEqual(candidatesOf(hass, climate, "hall"), [], "a name is not a device class");
  assert.deepEqual(candidatesOf(hass, kindOf("air"), "living_room").map((c) => [c.id, c.readings]), [["lr_air", { co2: "sensor.air_co2" }]]);
  assert.deepEqual(unclassifiedOf(hass, "lr_air"), ["sensor.air_score"], "the score has no class; the Wi-Fi is diagnostic");
});

test("the only candidate is the main one, found automatically and waiting to be recorded", () => {
  const model = homeModel(hassOf(), {});
  const bedroom = roomOf(model, "bedroom");
  assert.deepEqual(bedroom.climate, { temperature: "sensor.bed_t" });
  assert.equal(bedroom.main.climate.source, "auto");
  assert.deepEqual(roomOf(model, "living_room").main.climate.source, null, "two candidates: no choice");
  assert.equal(roomOf(model, "living_room").climate, undefined);
  assert.deepEqual(model.pending.filter((p) => p.kind === "climate").map((p) => p.area), ["bedroom", "garden"]);
  assert.deepEqual(model.pending.find((p) => p.kind === "air"), { area: "living_room", kind: "air", choice: "lr_air",
    readings: { co2: "sensor.air_co2" } });
});

test("a recorded pick is never redone: a second sensor later, or a pick cleared, change nothing", () => {
  const hass = hassOf();
  // The bedroom's pick was recorded, then its HA field cleared: it stays without one.
  const model = homeModel(hass, {}, { areas: {}, picked: { bedroom: ["climate"] } });
  assert.equal(roomOf(model, "bedroom").climate, undefined);
  assert.equal(roomOf(model, "bedroom").main.climate.source, "pocket");
  assert.equal(model.pending.some((p) => p.area === "bedroom" && p.kind === "climate"), false);
});

test("precedence: Pocket's store, then HA's area field, then the inputs, then the only candidate", () => {
  const hass = hassOf();
  hass.areas.living_room.temperature_entity_id = "sensor.rack_t";
  const config = { rooms: [{ id: "lounge", area: "living_room", type: "inside", climate: { temperature: "sensor.lr_t", humidity: "sensor.lr_h" },
    air: { score: "sensor.air_score" } }] };
  let lr = roomOf(homeModel(hass, config), "living_room");
  assert.deepEqual([lr.climate, lr.main.climate.source, lr.main.climate.name], [{ temperature: "sensor.rack_t" }, "home-assistant", "Rack sensor"]);
  assert.deepEqual([lr.type, lr.typeSource], ["inside", "inputs"]);
  assert.deepEqual([lr.air, lr.main.air.source], [{ score: "sensor.air_score" }, "inputs"]);
  delete hass.areas.living_room.temperature_entity_id;
  lr = roomOf(homeModel(hass, config), "living_room");
  assert.deepEqual([lr.climate, lr.main.climate.source], [{ temperature: "sensor.lr_t", humidity: "sensor.lr_h" }, "inputs"]);
  const store = { areas: { living_room: { type: "outside", climate: "none", air: "lr_air" } }, picked: {} };
  lr = roomOf(homeModel(hass, config, store), "living_room");
  assert.deepEqual([lr.type, lr.typeSource], ["outside", "pocket"]);
  assert.deepEqual([lr.climate, lr.main.climate.source], [undefined, "pocket"], "None is a choice and it is kept");
  assert.deepEqual([lr.air, lr.main.air.source], [{ co2: "sensor.air_co2", score: "sensor.air_score" }, "pocket"],
    "the inputs' unclassified score of the same device joins the store's device");
});

test("an unclassified reading picked in Pocket; a device no longer in the area is kept, marked missing", () => {
  const store = { areas: { living_room: { air: "lr_air", air_readings: { score: "sensor.air_score" } },
    bedroom: { air: "gone_device" } }, picked: {} };
  const model = homeModel(hassOf(), {}, store);
  assert.deepEqual(roomOf(model, "living_room").air, { co2: "sensor.air_co2", score: "sensor.air_score" });
  const bedroom = roomOf(model, "bedroom").main.air;
  assert.deepEqual([bedroom.choice, bedroom.missing, roomOf(model, "bedroom").air], ["gone_device", true, undefined]);
});

test("the inputs' outside: its area defaults to Outside with its sensors; its range keyed by the area", () => {
  const config = { outside: { temperature: "sensor.garden_t", area: "garden" },
    thresholds: { rooms: { lounge: { temp_low: "a" } }, outside: { temp_low: "o" } },
    rooms: [{ id: "lounge", area: "living_room" }] };
  const model = homeModel(hassOf(), config);
  const garden = roomOf(model, "garden");
  assert.deepEqual([garden.type, garden.typeSource, garden.climate, garden.main.climate.source],
    ["outside", "inputs", { temperature: "sensor.garden_t" }, "inputs"]);
  assert.deepEqual(model.thresholds.rooms, { living_room: { temp_low: "a" }, garden: { temp_low: "o" } });
});

test("lights and scenes: the inputs' when given, else what HA places in the area, a group standing for its members", () => {
  const found = roomOf(homeModel(hassOf(), {}), "living_room");
  assert.deepEqual(found.lights, ["light.lr"], "the group, not its members; the hidden one left out");
  assert.deepEqual(found.scenes, ["scene.evening"]);
  const given = roomOf(homeModel(hassOf(), { rooms: [{ id: "living_room", lights: "light.lr_a", scenes: [] }] }), "living_room");
  assert.deepEqual([given.lights, given.scenes], ["light.lr_a", undefined]);
  assert.equal(roomOf(homeModel(hassOf(), {}), "hall").lights, undefined);
});

test("a room of the inputs with no HA area is not an area; without hass.areas the inputs' rooms stand in", () => {
  const model = homeModel(hassOf(), { rooms: [{ id: "cellar", name: "Cellar" }] });
  assert.equal(roomOf(model, "cellar"), undefined);
  const fallback = homeModel({ states: {} }, { rooms: [{ id: "cellar", name: "Cellar", type: "inside" }] });
  assert.deepEqual(fallback.rooms.map((r) => [r.id, r.name, r.type]), [["cellar", "Cellar", "inside"]]);
});

test("a pick recorded automatically still says so; once a person changes it, it is theirs", () => {
  const auto = homeModel(hassOf(), {}, { areas: { living_room: { air: "lr_air" } }, picked: { living_room: ["air"] } });
  assert.equal(roomOf(auto, "living_room").main.air.source, "auto");
  const theirs = homeModel(hassOf(), {}, { areas: { living_room: { air: "lr_air" } }, picked: {} });
  assert.equal(roomOf(theirs, "living_room").main.air.source, "pocket");
});
