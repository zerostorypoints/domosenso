import { test } from "node:test";
import assert from "node:assert/strict";
import { MAPS, ruleOf, readingIds, labelClasses, figure, heat, colourAt, lampIndex, lampOf, formatValue } from "./maps.js";

const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const rooms = [sq(0, 0, 3, 3), sq(3, 0, 3, 3)];

test("each layer's maps and their 24-hour figures", () => {
  assert.deepEqual(MAPS.plants, [["illuminance", "max"], ["temperature", "min"], ["moisture", "min"]]);
  assert.deepEqual(MAPS.climate, [["temperature", "mean"], ["humidity", "mean"], ["carbon_dioxide", "max"]]);
  assert.deepEqual(MAPS.light, [["illuminance", "max"], ["lamps", null]]);
  assert.equal(ruleOf("plants", "temperature"), "min");
  assert.equal(ruleOf("climate", "illuminance"), "mean", "a reading without a map on the layer: its mean");
});

test("a point's readings: device classes, and a plant's named sensors", () => {
  const hass = { states: {
    "sensor.t": { state: "20", attributes: { device_class: "temperature" } },
    "sensor.t2": { state: "21", attributes: { device_class: "temperature" } },
    "sensor.v": { state: "3", attributes: { device_class: "voltage" } },
    "plant.fern": { state: "ok", attributes: { sensors: { temperature: "sensor.f_t", brightness: "sensor.f_lx", moisture: "sensor.f_m", conductivity: "sensor.f_c" } } },
  } };
  assert.deepEqual(readingIds(hass, ["sensor.t", "sensor.t2", "sensor.v"]), { temperature: "sensor.t" });
  assert.deepEqual(readingIds(hass, ["plant.fern"]), { temperature: "sensor.f_t", illuminance: "sensor.f_lx", moisture: "sensor.f_m" });
});

test("labels list a plant's three readings, the shown map's first; the light layer light only", () => {
  assert.deepEqual(labelClasses("plants", true, "moisture"), ["moisture", "temperature", "illuminance"]);
  assert.deepEqual(labelClasses("climate", false, "humidity"), ["humidity", "temperature", "carbon_dioxide", "illuminance"]);
  assert.deepEqual(labelClasses("light", true, "illuminance"), ["illuminance"]);
});

test("the 24-hour figure from hourly rows", () => {
  const rows = [{ mean: 20, min: 18, max: 22 }, { mean: 22, min: 21, max: 25 }, { mean: null, min: null, max: null }];
  assert.equal(figure(rows, "min"), 18);
  assert.equal(figure(rows, "max"), 25);
  assert.equal(figure(rows, "mean"), 21);
  assert.equal(figure([], "mean"), undefined, "no statistics: no figure");
  assert.equal(figure(undefined, "max"), undefined);
});

test("heat stays inside each room and a room without a sample is hatched", () => {
  const { cells, empty } = heat(rooms, [{ at: [1, 1], value: 20 }, { at: [2, 2], value: 22 }]);
  assert.deepEqual(empty, [1]);
  assert.ok(cells.length > 0);
  for (const c of cells) assert.ok(c.x < 3, `cell at ${c.x} left the first room`);
  for (const c of cells) assert.ok(c.value >= 20 && c.value <= 22);
  // A room's own readings only: the second room's sample does not reach the first.
  const both = heat(rooms, [{ at: [1, 1], value: 20 }, { at: [4, 1], value: 30 }]);
  assert.ok(both.cells.filter((c) => c.x < 3).every((c) => Math.abs(c.value - 20) < 1e-9));
  assert.deepEqual(both.empty, []);
});

test("colours run along the ramp and clamp at its ends", () => {
  assert.equal(colourAt("temperature", 10), colourAt("temperature", 17));
  assert.equal(colourAt("temperature", 30), colourAt("temperature", 24));
  assert.notEqual(colourAt("temperature", 17), colourAt("temperature", 24));
  assert.equal(colourAt("illuminance", 0), "rgb(27,31,58)");
  assert.equal(formatValue("temperature", 21.04), "21.0 °C");
  assert.equal(formatValue("illuminance", 1416.6), "1417 lx");
});

test("lamps: a device's light that is not a group, on with its brightness", () => {
  const hass = {
    entities: {
      "light.group": { device_id: "d1" },
      "light.lamp": { device_id: "d1" },
      "light.off": { device_id: "d2" },
    },
    states: {
      "light.group": { state: "on", attributes: { entity_id: ["light.lamp"] } },
      "light.lamp": { state: "on", attributes: { brightness: 128 } },
      "light.off": { state: "off", attributes: {} },
    },
  };
  const index = lampIndex(hass);
  assert.deepEqual(lampOf(hass, index, ["d1"]), { on: true, brightness: 50 });
  assert.deepEqual(lampOf(hass, index, ["d2"]), { on: false, brightness: 0 });
  assert.equal(lampOf(hass, index, ["d3"]), null);
});

test("an open space shares its readings: a grouped room without a sensor takes the group's heat", () => {
  const three = [sq(0, 0, 3, 3), sq(3, 0, 3, 3), sq(6, 0, 3, 3)];
  const samples = [{ at: [1, 1], value: 20 }];
  const apart = heat(three, samples);
  assert.deepEqual(apart.empty, [1, 2], "walls stop heat");
  const open = heat(three, samples, undefined, [[0, 1]]);
  assert.deepEqual(open.empty, [2], "the second room is open to the first; the third is not");
  assert.ok(open.cells.some((c) => c.room === 1 && Math.abs(c.value - 20) < 1e-9));
  // Two samples in a group: each grouped room blends both, by distance.
  const two = heat(three, [{ at: [1, 1], value: 20 }, { at: [5, 1], value: 24 }], undefined, [[0, 1]]);
  const near = two.cells.filter((c) => c.room === 0 && c.x < 1);
  assert.ok(near.every((c) => c.value > 20 && c.value < 24), "the first room feels the second's reading");
});
