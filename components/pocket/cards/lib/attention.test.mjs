import { test } from "node:test";
import assert from "node:assert/strict";
import { attention } from "./attention.js";

const st = (state) => ({ state: String(state), attributes: {} });

const config = {
  rooms: [
    { id: "living", name: "Living", climate: { temperature: "sensor.living_t", humidity: "sensor.living_h" },
      air: { score: "sensor.living_score", co2: "sensor.living_co2" } },
    { id: "bed", name: "Bed", climate: { temperature: "sensor.bed_t" } },
    { id: "office", name: "Office", lights: "light.office" },
  ],
  thresholds: {
    rooms: {
      living: { temp_low: "input_number.l_tl", temp_high: "input_number.l_th",
                humidity_low: "input_number.l_hl", humidity_high: "input_number.l_hh" },
      bed: { temp_low: "input_number.b_tl", temp_high: "input_number.b_th" },
    },
    air: { score: { fair: "input_number.s_f", poor: "input_number.s_p" },
           co2: { fair: "input_number.c_f", poor: "input_number.c_p" } },
  },
};

const helpers = {
  "input_number.l_tl": st(20), "input_number.l_th": st(24), "input_number.l_hl": st(35), "input_number.l_hh": st(60),
  "input_number.b_tl": st(18), "input_number.b_th": st(24),
  "input_number.s_f": st(80), "input_number.s_p": st(60),
  "input_number.c_f": st(800), "input_number.c_p": st(1200),
};
const good = {
  "sensor.living_t": st(21), "sensor.living_h": st(45), "sensor.living_score": st(90), "sensor.living_co2": st(600),
  "sensor.bed_t": st(20),
};
const hassOf = (states) => ({ states: { ...helpers, ...good, ...states } });

test("everything within its limits: no items", () => {
  assert.deepEqual(attention(hassOf({}), config), []);
});

test("CO2 at 1250 with poor from 1200: one poor item for the room", () => {
  assert.deepEqual(attention(hassOf({ "sensor.living_co2": st(1250) }), config),
    [{ room: "living", reading: "co2", level: "poor", target: "#/area/living" }]);
});

test("temperature 25 with high 24: poor on the high side", () => {
  assert.deepEqual(attention(hassOf({ "sensor.bed_t": st(25) }), config),
    [{ room: "bed", reading: "temperature", level: "poor", side: "high", target: "#/area/bed" }]);
});

test("humidity below its range: poor low; the score below fair: fair", () => {
  const items = attention(hassOf({ "sensor.living_h": st(30), "sensor.living_score": st(70) }), config);
  assert.deepEqual(items.map((i) => [i.reading, i.level, i.side]),
    [["humidity", "poor", "low"], ["score", "fair", undefined]]);
});

test("poor before fair, then the home's order", () => {
  const items = attention(hassOf({
    "sensor.living_co2": st(900),          // fair
    "sensor.living_t": st(26),             // poor high
    "sensor.bed_t": st(10),                // poor low
  }), config);
  assert.deepEqual(items.map((i) => `${i.room}/${i.reading}/${i.level}`),
    ["living/temperature/poor", "bed/temperature/poor", "living/co2/fair"]);
});

test("helpers missing: no items, whatever the readings", () => {
  const hass = { states: { "sensor.living_co2": st(5000), "sensor.bed_t": st(40) } };
  assert.deepEqual(attention(hass, config), []);
});

test("an unavailable reading gives no item; no thresholds in the config gives none", () => {
  assert.deepEqual(attention(hassOf({ "sensor.living_co2": st("unavailable") }), config), []);
  assert.deepEqual(attention(hassOf({ "sensor.living_co2": st(5000) }), { rooms: config.rooms }), []);
  assert.deepEqual(attention(undefined, config), []);
  assert.deepEqual(attention(hassOf({}), {}), []);
});
