import { test } from "node:test";
import assert from "node:assert/strict";
import { areasOf, comfortOf, climateReadings, climateValue, typed, isJudged } from "./areas.js";
import { roomLevels } from "./attention.js";

const st = (state, attributes = {}) => ({ state: String(state), attributes });
const rooms = [
  { id: "kitchen", name: "Kitchen", type: "inside", climate: { temperature: "sensor.k_t" } },
  { id: "bedroom", name: "Bedroom", type: "inside", climate: { temperature: "sensor.b_t", humidity: "sensor.b_h" } },
  { id: "hall", name: "Hall", type: "inside" },
  { id: "garden", name: "Garden", type: "outside", climate: { temperature: "sensor.g_t" } },
  { id: "garage", name: "Garage", type: null, climate: { temperature: "sensor.x_t" } },
];

test("the areas are the config's rooms; there is no Outside of the card's own", () => {
  assert.deepEqual(areasOf({ rooms }), rooms);
  assert.deepEqual(areasOf({}), []);
  assert.deepEqual(areasOf({ rooms: [], outside: { temperature: "sensor.o" }, weather: "weather.home" }), []);
});

test("comfort range: the area's own, keyed by its id", () => {
  const thresholds = { rooms: { kitchen: { temp_low: "a" } } };
  assert.deepEqual(comfortOf(thresholds, rooms[0]), { temp_low: "a" });
  assert.equal(comfortOf(thresholds, rooms[3]), undefined);
  assert.equal(comfortOf(undefined, rooms[0]), undefined);
});

test("climate readings and values come from the area's sensors only", () => {
  assert.deepEqual(climateReadings(rooms[1]), ["temperature", "humidity"]);
  assert.deepEqual(climateReadings(rooms[2]), []);
  const hass = { states: { "sensor.b_t": st(21.5), "sensor.b_h": st("unavailable") } };
  assert.equal(climateValue(hass, rooms[1], "temperature"), 21.5);
  assert.equal(climateValue(hass, rooms[1], "humidity"), null);
  assert.equal(climateValue(hass, rooms[2], "temperature"), null);
});

test("typed: the areas of one type, those with a main temperature, the range and the one sensor", () => {
  const hass = { states: { "sensor.k_t": st(20.5), "sensor.b_t": st(22.25), "sensor.g_t": st(6), "sensor.x_t": st(9) } };
  const inside = typed(hass, { rooms }, "inside");
  assert.deepEqual(inside.areas.map((a) => a.id), ["kitchen", "bedroom", "hall"]);
  assert.deepEqual(inside.measured.map((m) => [m.area.id, m.value]), [["kitchen", 20.5], ["bedroom", 22.25]]);
  assert.deepEqual(inside.unset.map((a) => a.id), ["hall"], "an inside area without a main sensor is listed");
  assert.equal(inside.min, 20.5);
  assert.equal(inside.max, 22.25);
  assert.equal(inside.entity, null, "two sensors: no single trend");
  const outside = typed(hass, { rooms }, "outside");
  assert.deepEqual([outside.min, outside.max, outside.entity], [6, 6, "sensor.g_t"]);
  const none = typed(hass, { rooms: rooms.filter((r) => r.type !== "outside") }, "outside");
  assert.deepEqual([none.areas.length, none.min], [0, null], "a not assigned area is in neither");
});

test("an outside area is never judged; its level still colours its own page", () => {
  assert.equal(isJudged(rooms[3]), false);
  assert.equal(isJudged(rooms[4]), true, "not assigned is judged when it has a range");
  const thresholds = { rooms: { garden: { temp_low: "input_number.lo", temp_high: "input_number.hi" } } };
  const hass = { states: { "sensor.g_t": st(30), "input_number.lo": st(20), "input_number.hi": st(24) } };
  assert.deepEqual(roomLevels(hass, rooms[3], thresholds), [{ reading: "temperature", result: { level: "poor", side: "high" } }]);
});
