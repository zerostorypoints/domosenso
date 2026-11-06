import { test } from "node:test";
import assert from "node:assert/strict";
import { checksOf, readingsOf, entityOf, valueOf } from "./checks.js";
import { config, st, baseStates, hassOf, asAreas } from "../testing/demo-home.mjs";

// The outside as an area of type outside (SPEC-038), with a range: coloured, never in the inside filter.
const withOutside = asAreas({ ...config,
  outside: { temperature: "sensor.outside_temperature" },
  thresholds: { ...config.thresholds, outside: { temp_low: "input_number.out_temp_low", temp_high: "input_number.out_temp_high" } } });
const states = (extra = {}) => ({ ...baseStates(), "sensor.outside_temperature": st(5),
  "input_number.out_temp_low": st(20), "input_number.out_temp_high": st(24), ...extra });

const shape = (groups) => groups.map(({ area, rows }) =>
  [area.id, rows.map((r) => [r.reading, r.value, r.result ? r.result.level + (r.result.side ? `_${r.result.side}` : "") : null])]);

test("every reading of every judged area, problems first; an outside area, cold as it is, is never one", () => {
  const groups = checksOf(hassOf(states({ "sensor.living_room_co2": st(900) })), withOutside);
  assert.deepEqual(shape(groups), [
    ["living_room", [["co2", 900, "fair"], ["temperature", 21.7, "good"], ["humidity", 44, "good"], ["score", 81, "good"]]],
    ["bedroom", [["temperature", 21.9, "good"], ["humidity", 44, "good"]]],
  ]);
  assert.equal(groups[0].rows[0].entity, "sensor.living_room_co2");
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

test("readingsOf, entityOf, valueOf: climate then air, from the area's sensors", () => {
  const room = config.rooms[0];
  assert.deepEqual(readingsOf(room), ["temperature", "humidity", "score", "co2"]);
  assert.equal(entityOf(room, "co2"), "sensor.living_room_co2");
  assert.equal(valueOf(hassOf(), room, "co2"), 768);
  const bare = { id: "hall", climate: {} };
  assert.deepEqual(readingsOf(bare), []);
  assert.equal(valueOf(hassOf(), bare, "temperature"), null);
});

test("contract: the pills and the list behind them agree; with no pill, no row of the list is fair or poor", async () => {
  const { attention } = await import("./attention.js");
  const hass = hassOf(states());   // the outside area at 5°, below its range
  assert.deepEqual(attention(hass, withOutside), []);
  const levels = checksOf(hass, withOutside).flatMap((g) => g.rows).map((r) => r.result?.level).filter(Boolean);
  assert.ok(levels.every((level) => level === "good"), levels.join(" "));
});
