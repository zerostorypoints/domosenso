import { test } from "node:test";
import assert from "node:assert/strict";
import { MAPS, SCALES, ruleOf, readingIds, labelClasses, figure, heat, colourAt, lampIndex, lampOf, formatValue, SPOT_M, areaSensorField,
  BAND_OF, accessPoints, offeredBands, radioMaps, bandsText, servingColour, CONFIDENCE } from "./maps.js";

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

// A room's own sensor (its area's temperature or humidity sensor) is the room; the others are spots.
const room = [sq(0, 0, 6, 4)];
const air = { at: [1, 1], value: 22, id: "sensor.room" };
const amp = { at: [5, 3], value: 33, id: "sensor.amp" };
const cellAt = (cells, [x, y]) => cells.find((c) => x >= c.x && x < c.x + 0.15 && y >= c.y && y < c.y + 0.15);

test("a room with its own sensor takes that value, and another sensor is a spot within SPOT_M", () => {
  const { cells, empty } = heat(room, [air, amp], undefined, [], [{ id: "sensor.room", value: 22 }]);
  assert.deepEqual(empty, []);
  const far = cells.filter((c) => Math.hypot(c.x + 0.075 - 5, c.y + 0.075 - 3) >= SPOT_M);
  assert.ok(far.length > 0 && far.every((c) => c.value === 22), "the room's value beyond the spot");
  assert.ok(cellAt(cells, [5, 3]).value > 30, "the spot is hot at the sensor");
  const ring = cells.filter((c) => { const d = Math.hypot(c.x + 0.075 - 5, c.y + 0.075 - 3); return d > 0.6 && d < SPOT_M; });
  assert.ok(ring.every((c) => c.value > 22 && c.value < 27.5), "and falls off towards SPOT_M");
});

test("a room's own sensor counts placed or not; without a value the room is hatched", () => {
  const unplaced = heat(room, [amp], undefined, [], [{ id: "sensor.room", value: 22 }]);
  assert.equal(cellAt(unplaced.cells, [1, 1]).value, 22);
  const gone = heat(room, [air, amp], undefined, [], [{ id: "sensor.room", value: null }]);
  assert.deepEqual(gone.empty, [0], "unavailable: hatched, not the other sensors' heat");
  assert.equal(gone.cells.length, 0);
});

test("without a room sensor the heat is as before", () => {
  const before = heat(room, [air, amp]);
  assert.deepEqual(heat(room, [air, amp], undefined, [], [undefined]), before);
  assert.deepEqual(heat(room, [air, amp], undefined, [], []), before);
});

test("an open space's room without its own sensor takes the group's", () => {
  const two = [sq(0, 0, 3, 3), sq(3, 0, 3, 3)];
  const out = heat(two, [{ at: [1, 1], value: 21, id: "sensor.room" }], undefined, [[0, 1]], [{ id: "sensor.room", value: 21 }]);
  assert.deepEqual(out.empty, []);
  assert.ok(out.cells.filter((c) => c.room === 1).every((c) => c.value === 21));
});

test("only the climate layer's temperature and humidity maps use the area's sensor", () => {
  assert.equal(areaSensorField("climate", "temperature"), "temperature_entity_id");
  assert.equal(areaSensorField("climate", "humidity"), "humidity_entity_id");
  assert.equal(areaSensorField("climate", "carbon_dioxide"), null);
  assert.equal(areaSensorField("plants", "temperature"), null);
});

// ---- Wi-Fi maps on the radio layer (SPEC-044) ----

const wifiDoc = (aps, points) => ({ schema: 1, floors: [{ floor_id: "ground", rooms: [{ area_id: "alex", polygon: sq(0, 0, 3, 3) }],
  points, access_points: aps }] });

test("the radio layer's maps: a map per band, then Serving; none has a 24-hour figure", () => {
  assert.deepEqual(MAPS.radio, [["wifi_24", null], ["wifi_5", null], ["wifi_6", null], ["serving", null], ["confidence", null], ["traffic_heat", null], ["traffic_links", null]]);
  assert.deepEqual(BAND_OF, { wifi_24: "2.4", wifi_5: "5", wifi_6: "6" });
  assert.deepEqual(SCALES.dbm.marks, [-67, -75]);
  assert.equal(SCALES.dbm.lo, -90);
  assert.equal(SCALES.dbm.hi, -30);
  assert.equal(formatValue("dbm", -67.4), "-67 dBm");
  assert.equal(colourAt("dbm", -90), colourAt("dbm", -120), "clamped at the weak end");
  assert.notEqual(colourAt("dbm", -90), colourAt("dbm", -30));
});

test("only the bands a placed access point serves are offered; Serving with any", () => {
  const doc = wifiDoc([{ device_id: "d1", bands: ["5", "2.4"] }, { device_id: "d2", bands: ["6"] }],
    [{ device_id: "d1", x: 1, y: 1, placed: true }, { device_id: "d2", x: 2, y: 2, placed: false }]);
  assert.deepEqual(accessPoints(doc).map((a) => a.key), ["d1"], "an auto-placed point is not drawn");
  assert.deepEqual(offeredBands(doc), ["2.4", "5"], "in band order");
  assert.deepEqual(radioMaps(offeredBands(doc)).map(([c]) => c), ["wifi_24", "wifi_5", "serving", "confidence"]);
  assert.deepEqual(radioMaps([]), [], "no access point: no map");
  assert.deepEqual(radioMaps(offeredBands(doc), false).map(([c]) => c), ["wifi_24", "wifi_5", "serving", "confidence"]);
  const anyBand = wifiDoc([{ entity_id: "switch.ap" }], [{ entity_id: "switch.ap", x: 1, y: 1, placed: true }]);
  assert.deepEqual(offeredBands(anyBand), ["2.4", "5", "6"], "no bands listed: every band, as the prediction does");
});

test("an access point's bands as its label; serving colours differ", () => {
  assert.equal(bandsText(["5", "2.4"]), "2.4 · 5");
  assert.equal(bandsText(["2.4"], (b) => b.replace(".", ",")), "2,4");
  assert.notEqual(servingColour(0), servingColour(1));
  assert.equal(servingColour(0), servingColour(8), "the palette repeats");
});

test("the Confidence map's three levels have three distinct fills", () => {
  assert.deepEqual(Object.keys(CONFIDENCE), ["high", "medium", "low"]);
  assert.equal(new Set(Object.values(CONFIDENCE)).size, 3);
});

test("mbps colours: 0.1 and below the first ramp colour, 1000 and above the last, 10 the middle", () => {
  const r = SCALES.mbps.ramp, rgb = (c) => `rgb(${[16, 8, 0].map((s) => (parseInt(c.slice(1), 16) >> s) & 255).join(",")})`;
  assert.equal(colourAt("mbps", 0.1), rgb(r[0]));
  assert.equal(colourAt("mbps", 0), rgb(r[0]));
  assert.equal(colourAt("mbps", 5000), rgb(r[4]));
  assert.equal(colourAt("mbps", 10), rgb(r[2]));
  assert.deepEqual(SCALES.mbps.marks, [1, 10, 100]);
});

test("radioMaps(bands, true) appends traffic_heat and traffic_links; radioMaps([], true) has only them", () => {
  assert.deepEqual(radioMaps(["5"], true).map(([c]) => c), ["wifi_5", "serving", "confidence", "traffic_heat", "traffic_links"]);
  assert.deepEqual(radioMaps([], true).map(([c]) => c), ["traffic_heat", "traffic_links"]);
  assert.deepEqual(radioMaps([], false), []);
});
