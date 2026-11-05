import { test } from "node:test";
import assert from "node:assert/strict";
import { checksOf, readingsOf, entityOf, valueOf } from "./checks.js";
import { config, st, baseStates, hassOf } from "../testing/demo-home.mjs";

const withOutside = { ...config,
  outside: { temperature: "sensor.outside_temperature" },
  thresholds: { ...config.thresholds, outside: { temp_low: "input_number.out_temp_low", temp_high: "input_number.out_temp_high" } } };
const states = (extra = {}) => ({ ...baseStates(), "sensor.outside_temperature": st(5),
  "input_number.out_temp_low": st(20), "input_number.out_temp_high": st(24), ...extra });

const shape = (groups) => groups.map(({ area, rows }) =>
  [area.id, rows.map((r) => [r.reading, r.value, r.result ? r.result.level + (r.result.side ? `_${r.result.side}` : "") : null])]);

test("every reading of every area, the Outside included, problems first", () => {
  const groups = checksOf(hassOf(states({ "sensor.living_room_co2": st(900) })), withOutside);
  assert.deepEqual(shape(groups), [
    ["outside", [["temperature", 5, "poor_low"]]],
    ["living_room", [["co2", 900, "fair"], ["temperature", 21.7, "good"], ["humidity", 44, "good"], ["score", 81, "good"]]],
    ["bedroom", [["temperature", 21.9, "good"], ["humidity", 44, "good"]]],
  ]);
  assert.equal(groups[1].rows[0].entity, "sensor.living_room_co2");
});

test("a reading without limits or without a number is listed last, without a level", () => {
  const cfg = { ...config, thresholds: { rooms: {}, air: {} } };
  const groups = checksOf(hassOf(states({ "sensor.bedroom_humidity": st("unavailable") })), cfg);
  const bedroom = groups.find((g) => g.area.id === "bedroom");
  assert.deepEqual(bedroom.rows.map((r) => [r.reading, r.value, r.result]),
    [["temperature", 21.9, null], ["humidity", null, null]]);
});

test("the inside filter: rooms only, the readings asked for", () => {
  const groups = checksOf(hassOf(states({ "sensor.bedroom_temperature": st(23) })), withOutside,
    { readings: ["temperature"], inside: true });
  assert.deepEqual(shape(groups), [
    ["bedroom", [["temperature", 23, "poor_high"]]],
    ["living_room", [["temperature", 21.7, "good"]]],
  ]);
});

test("readingsOf, entityOf, valueOf: climate then air, the Outside's weather attribute has no entity", () => {
  const room = config.rooms[0];
  assert.deepEqual(readingsOf(room), ["temperature", "humidity", "score", "co2"]);
  assert.equal(entityOf(room, "co2"), "sensor.living_room_co2");
  assert.equal(valueOf(hassOf(), room, "co2"), 768);
  const outside = { id: "outside", outside: true, climate: {}, weather: "weather.home" };
  const hass = hassOf({ "weather.home": st("sunny", { temperature: 4, humidity: 80 }) });
  assert.equal(entityOf(outside, "temperature"), undefined);
  assert.equal(valueOf(hass, outside, "temperature"), 4);
});
