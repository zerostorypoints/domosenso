import { test } from "node:test";
import assert from "node:assert/strict";
import { level, numberOf, toneOf, levelKey } from "./level.js";

const comfort = { low: 20, high: 24 };

test("range: within the comfort range is good, edges included", () => {
  assert.deepEqual(level(21, "range", comfort), { level: "good" });
  assert.deepEqual(level(20, "range", comfort), { level: "good" });
  assert.deepEqual(level(24, "range", comfort), { level: "good" });
});

test("range: outside is poor, with the side", () => {
  assert.deepEqual(level(19.5, "range", comfort), { level: "poor", side: "low" });
  assert.deepEqual(level(24.5, "range", comfort), { level: "poor", side: "high" });
});

test("rising: fair from the fair limit, poor from the poor limit (CO2)", () => {
  const co2 = { fair: 800, poor: 1200 };
  assert.deepEqual(level(799, "rising", co2), { level: "good" });
  assert.deepEqual(level(800, "rising", co2), { level: "fair" });
  assert.deepEqual(level(1199, "rising", co2), { level: "fair" });
  assert.deepEqual(level(1200, "rising", co2), { level: "poor" });
});

test("falling: lower is worse, fair below the fair limit, poor below the poor limit (score)", () => {
  const score = { fair: 80, poor: 60 };
  assert.deepEqual(level(80, "falling", score), { level: "good" });
  assert.deepEqual(level(79, "falling", score), { level: "fair" });
  assert.deepEqual(level(60, "falling", score), { level: "fair" });
  assert.deepEqual(level(59, "falling", score), { level: "poor" });
});

test("no number, no level", () => {
  assert.equal(level(null, "range", comfort), null);
  assert.equal(level(undefined, "rising", { fair: 800, poor: 1200 }), null);
  assert.equal(level(NaN, "range", comfort), null);
  assert.equal(level("21", "range", comfort), null);
  assert.equal(level(21, "range", { low: null, high: 24 }), null);
  assert.equal(level(21, "range", { low: 20, high: NaN }), null);
  assert.equal(level(900, "rising", { fair: 800, poor: null }), null);
  assert.equal(level(70, "falling", { fair: NaN, poor: 60 }), null);
  assert.equal(level(21, "range", null), null);
  assert.equal(level(21, "range", undefined), null);
});

test("an unknown kind has no level", () => {
  assert.equal(level(21, "sideways", comfort), null);
});

const hass = (states) => ({ states: Object.fromEntries(Object.entries(states).map(([id, state]) => [id, { state }])) });

test("numberOf reads a numeric state", () => {
  const h = hass({ "sensor.t": "21.5", "input_number.n": "800", "sensor.z": "0" });
  assert.equal(numberOf(h, "sensor.t"), 21.5);
  assert.equal(numberOf(h, "input_number.n"), 800);
  assert.equal(numberOf(h, "sensor.z"), 0);
});

test("numberOf is null without a number", () => {
  const h = hass({ "sensor.u": "unavailable", "sensor.k": "unknown", "sensor.e": "", "sensor.x": "12abc" });
  for (const id of ["sensor.u", "sensor.k", "sensor.e", "sensor.x", "sensor.missing"]) {
    assert.equal(numberOf(h, id), null, id);
  }
  assert.equal(numberOf(undefined, "sensor.t"), null);
  assert.equal(numberOf({}, "sensor.t"), null);
  assert.equal(numberOf(h, undefined), null);
});

test("toneOf: below a range cold, above it warm, else the level; levelKey names the side", () => {
  assert.equal(toneOf(level(5, "range", { low: 20, high: 24 })), "cold");
  assert.equal(toneOf(level(30, "range", { low: 20, high: 24 })), "warm");
  assert.equal(toneOf(level(22, "range", { low: 20, high: 24 })), "good");
  assert.equal(toneOf(level(900, "rising", { fair: 800, poor: 1200 })), "fair");
  assert.equal(toneOf(null), null);
  assert.equal(levelKey({ level: "poor", side: "low" }), "poor_low");
  assert.equal(levelKey({ level: "fair" }), "fair");
});
