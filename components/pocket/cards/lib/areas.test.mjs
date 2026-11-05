import { test } from "node:test";
import assert from "node:assert/strict";
import { OUTSIDE, areasOf, outsideArea, comfortOf, climateReadings, climateValue } from "./areas.js";
import { roomLevels } from "./attention.js";

const t = (key) => `<${key}>`;
const rooms = [{ id: "kitchen", name: "Kitchen", climate: { temperature: "sensor.k_t" } }];
const st = (state, attributes = {}) => ({ state: String(state), attributes });

test("the rooms, then the Outside when the home names outside or weather", () => {
  assert.deepEqual(areasOf({ rooms }), rooms);
  assert.deepEqual(areasOf({}), []);
  const withOutside = areasOf({ rooms, outside: { temperature: "sensor.o_t", humidity: "sensor.o_h", area: "garden" } }, t);
  assert.equal(withOutside.length, 2);
  assert.deepEqual(withOutside[1], { id: OUTSIDE, name: "<card.pocket.area.outside>", outside: true,
    climate: { temperature: "sensor.o_t", humidity: "sensor.o_h" } });
  assert.deepEqual(outsideArea({ weather: "weather.home" }, t),
    { id: "outside", name: "<card.pocket.area.outside>", outside: true, climate: {}, weather: "weather.home" });
  assert.equal(outsideArea({ rooms }), null);
  assert.equal(outsideArea({ outside: { temperature: "sensor.o_t" } }).name, "", "no t: no name");
});

test("comfort range: a room's own, the Outside's from thresholds.outside", () => {
  const thresholds = { rooms: { kitchen: { temp_low: "a" } }, outside: { temp_low: "b" } };
  assert.deepEqual(comfortOf(thresholds, rooms[0]), { temp_low: "a" });
  assert.deepEqual(comfortOf(thresholds, outsideArea({ outside: { temperature: "x" } })), { temp_low: "b" });
  assert.equal(comfortOf(undefined, rooms[0]), undefined);
});

test("climate readings and values: a sensor first, else the weather entity's attribute", () => {
  const area = outsideArea({ outside: { temperature: "sensor.o_t" }, weather: "weather.home" });
  assert.deepEqual(climateReadings(area), ["temperature", "humidity"]);
  assert.deepEqual(climateReadings(rooms[0]), ["temperature"]);
  assert.deepEqual(climateReadings(outsideArea({ outside: { temperature: "sensor.o_t" } })), ["temperature"]);
  const hass = { states: { "sensor.o_t": st(3.5), "weather.home": st("rainy", { temperature: 9, humidity: 88 }) } };
  assert.equal(climateValue(hass, area, "temperature"), 3.5);
  assert.equal(climateValue(hass, area, "humidity"), 88);
  assert.equal(climateValue({ states: { "weather.home": st("unavailable", {}) } }, area, "humidity"), null);
  assert.equal(climateValue(hass, rooms[0], "humidity"), null);
});

test("roomLevels gives the Outside its level against thresholds.outside", () => {
  const area = outsideArea({ outside: { temperature: "sensor.o_t" } });
  const thresholds = { rooms: {}, outside: { temp_low: "input_number.lo", temp_high: "input_number.hi" } };
  const hass = { states: { "sensor.o_t": st(30), "input_number.lo": st(20), "input_number.hi": st(24) } };
  assert.deepEqual(roomLevels(hass, area, thresholds), [{ reading: "temperature", result: { level: "poor", side: "high" } }]);
  assert.deepEqual(roomLevels(hass, area, { rooms: {} }), []);
});
