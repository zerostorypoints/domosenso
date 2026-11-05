import { test } from "node:test";
import assert from "node:assert/strict";
import { adviceOf, bandOf, readingBand, VIEWS } from "./climate.js";
import { config, baseStates, st } from "../testing/demo-home.mjs";

const hassWith = (changes = {}) => ({ states: { ...baseStates(), ...changes } });
const advice = (changes) => adviceOf(hassWith(changes), config).map((a) => [a.area.id, a.advice, a.reading]);

test("the views of the switch", () => {
  assert.deepEqual(VIEWS, ["temperature", "humidity", "air"]);
});

test("advice: nothing while every reading is within its limits, a fair reading included", () => {
  assert.deepEqual(advice(), []);
  assert.deepEqual(advice({ "sensor.living_room_co2": st(900) }), [], "fair CO2 is not advice yet");
});

test("advice: a poor CO2 or VOC opens a window; the score that follows it is not told twice", () => {
  assert.deepEqual(advice({ "sensor.living_room_co2": st(1300) }), [["living_room", "open_window", "co2"]]);
  assert.deepEqual(advice({ "sensor.living_room_co2": st(1300), "sensor.living_room_air_quality_score": st(50) }),
    [["living_room", "open_window", "co2"]]);
});

test("advice: a poor score alone is told by name", () => {
  assert.deepEqual(advice({ "sensor.living_room_air_quality_score": st(50) }), [["living_room", "air_poor", "score"]]);
});

test("advice: each side of a comfort range, air before comfort, the home's order within", () => {
  assert.deepEqual(advice({ "sensor.bedroom_temperature": st(23) }), [["bedroom", "too_warm", "temperature"]]);
  assert.deepEqual(advice({ "sensor.bedroom_temperature": st(16) }), [["bedroom", "too_cold", "temperature"]]);
  assert.deepEqual(advice({ "sensor.living_room_humidity": st(30) }), [["living_room", "too_dry", "humidity"]]);
  assert.deepEqual(advice({ "sensor.living_room_humidity": st(70), "sensor.bedroom_temperature": st(16),
    "sensor.living_room_co2": st(1500) }), [
    ["living_room", "open_window", "co2"], ["living_room", "too_humid", "humidity"], ["bedroom", "too_cold", "temperature"]]);
});

test("advice: an unavailable reading or a missing limit gives none; the Outside is not advised", () => {
  assert.deepEqual(advice({ "sensor.living_room_co2": st("unavailable") }), []);
  assert.deepEqual(adviceOf({ states: { ...baseStates(), "input_number.co2_poor": st("unknown"),
    "sensor.living_room_co2": st(2000) } }, config), []);
  const cfg = { ...config, outside: { temperature: "sensor.out_t" },
    thresholds: { ...config.thresholds, outside: { temp_low: "input_number.lr_temp_low", temp_high: "input_number.lr_temp_high" } } };
  assert.deepEqual(adviceOf({ states: { ...baseStates(), "sensor.out_t": st(-5) } }, cfg), []);
  assert.deepEqual(adviceOf(undefined, config), []);
});

test("band of a comfort range: the range in the middle half, the value marked, the bar stretched to it", () => {
  assert.deepEqual(bandOf(22, { kind: "range", low: 20, high: 24 }),
    { zones: [{ from: 25, to: 75, level: "good" }], marks: [], at: 50 });
  assert.equal(bandOf(20, { kind: "range", low: 20, high: 24 }).at, 25);
  const cold = bandOf(10, { kind: "range", low: 20, high: 24 });
  assert.equal(cold.at, 0, "below the bar: it starts at the value");
  assert.ok(cold.zones[0].from > 0 && cold.zones[0].to < 100);
  assert.equal(bandOf(40, { kind: "range", low: 20, high: 24 }).at, 100);
  assert.equal(bandOf(null, { kind: "range", low: 20, high: 24 }).at, null);
});

test("band of an air reading: good, fair and poor zones with marks at fair and poor", () => {
  const co2 = bandOf(1000, { kind: "rising", fair: 800, poor: 1200 });
  assert.deepEqual(co2.zones.map((z) => z.level), ["good", "fair", "poor"]);
  assert.deepEqual(co2.marks, [{ at: 33.3, level: "fair" }, { at: 66.7, level: "poor" }]);
  assert.equal(co2.at, 50);
  const score = bandOf(90, { kind: "falling", fair: 80, poor: 60 });
  assert.deepEqual(score.zones.map((z) => z.level), ["poor", "fair", "good"]);
  assert.deepEqual(score.marks, [{ at: 66.7, level: "fair" }, { at: 33.3, level: "poor" }]);
  assert.equal(score.at, 83.3);
});

test("band: limits that are not numbers, a range without width or an unknown kind give none", () => {
  assert.equal(bandOf(5, { kind: "range", low: null, high: 4 }), null);
  assert.equal(bandOf(5, { kind: "range", low: 4, high: 4 }), null);
  assert.equal(bandOf(5, { kind: "rising", fair: 4, poor: 4 }), null);
  assert.equal(bandOf(5, { kind: "other" }), null);
  assert.equal(bandOf(5, null), null);
});

test("readingBand reads the area's helpers: a comfort range, an air limit, none without limits", () => {
  const hass = hassWith();
  const [living, bedroom, office] = config.rooms;
  assert.equal(readingBand(hass, config, living, "temperature").zones[0].from, 25);
  assert.equal(readingBand(hass, config, bedroom, "temperature").at, 73.7);
  assert.equal(readingBand(hass, config, living, "co2").marks.length, 2);
  assert.equal(readingBand(hass, config, office, "temperature"), null);
  assert.equal(readingBand(hass, { ...config, thresholds: {} }, living, "co2"), null);
});
