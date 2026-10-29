import test from "node:test";
import assert from "node:assert/strict";
import { parseSpectrum, energySum, readSource, Demo, SCENARIOS } from "./sources.js";

const hassOf = (state, attributes = {}) => ({ states: { "sensor.x": { state, attributes, last_updated: "2026-01-15T10:00:00Z" } } });

test("parseSpectrum", () => {
  assert.deepEqual(parseSpectrum("-42.1,-40.3"), [-42.1, -40.3]);
  assert.equal(parseSpectrum("unavailable"), null);
  assert.equal(parseSpectrum(undefined), null);
  assert.ok(Number.isNaN(parseSpectrum("1,nan,3")[1]), "nan becomes NaN");
});

test("energySum", () => {
  assert.ok(Math.abs(energySum([0, 0]) - 3.0103) < 1e-3);
  assert.equal(energySum([0, NaN]), 0);
});

test("readSource adds the offset", () => {
  const hass = hassOf(Array(31).fill("-50.0").join(","));
  const r = readSource({ kind: "spectrum", entity: "sensor.x", offset: 95, axis: "third_octave" }, hass);
  assert.equal(r.values.length, 31);
  assert.ok(r.values.every((v) => v === 45));
  assert.equal(r.updated, Date.parse("2026-01-15T10:00:00Z"));
});

test("parseSpectrum: wrong count", () => {
  const hass = hassOf(Array(30).fill("-50.0").join(","));
  const r = readSource({ kind: "spectrum", entity: "sensor.x", offset: 0, axis: "third_octave" }, hass);
  assert.equal(r.error, "count");
});

test("readSource scalar from an attribute", () => {
  const r = readSource({ kind: "scalar", entity: "sensor.x", attribute: "t", offset: 0 }, hassOf("on", { t: 21.5 }));
  assert.equal(r.value, 21.5);
});

test("Demo is deterministic and plausible", () => {
  const d = new Demo("electronic");
  const a = d.bands(10), b = d.bands(10);
  assert.deepEqual(a, b);
  assert.equal(a.length, 31);
  assert.ok(a.every(Number.isFinite));
  const l = d.level(10);
  assert.ok(l > 80 && l < 100, `level ${l}`);
});

test("parseSpectrum: empty tokens become NaN", () => {
  const a = parseSpectrum("1,,3");
  assert.equal(a.length, 3);
  assert.ok(Number.isNaN(a[1]));
  assert.ok(Number.isNaN(parseSpectrum("1,2,")[2]));
  assert.ok(Number.isNaN(parseSpectrum("1, ,3")[1]));
  const list = new Array(31).fill(1);
  list[1] = null;
  const q = readSource({ kind: "spectrum", entity: "sensor.x", attribute: "s", offset: 0 }, hassOf("x", { s: list }));
  assert.ok(Number.isNaN(q.values[1]));
  assert.equal(q.values[2], 1);
});

test("every scenario gives finite bands", () => {
  for (const [name, fn] of Object.entries(SCENARIOS)) {
    for (const t of [0, 7.3, 33]) {
      assert.ok(new Demo(name).bands(t).every(Number.isFinite), `${name} at ${t}`);
    }
  }
});

// The frontend's entity objects carry last_changed and last_updated only, never last_reported.
test("readSource stamps with last_updated and reports the count it got", () => {
  const hass = { states: { "sensor.x": { state: "1,2", attributes: {}, last_changed: "2026-01-15T09:00:00Z", last_updated: "2026-01-15T10:00:07Z" } } };
  const r = readSource({ kind: "spectrum", entity: "sensor.x", offset: 0, axis: "third_octave" }, hass);
  assert.equal(r.updated, Date.parse("2026-01-15T10:00:07Z"));
  assert.equal(r.count, 2);
});

test("readSource scalar: non-numeric is NaN, unavailable is no reading", () => {
  const src = { kind: "scalar", entity: "sensor.x", offset: 0 };
  assert.ok(Number.isNaN(readSource(src, hassOf("abc")).value));
  assert.equal(readSource(src, hassOf("unavailable")), null);
  assert.equal(readSource(src, hassOf("unknown")), null);
  assert.equal(readSource(src, { states: {} }), null);
});

test("readSource: a spectrum without a unit is in dB, an entity's own unit wins", () => {
  const csv = Array(31).fill("-50.0").join(",");
  const src = { kind: "spectrum", entity: "sensor.x", offset: 0, axis: "third_octave" };
  assert.equal(readSource(src, hassOf(csv)).unit, "dB");
  assert.equal(readSource(src, hassOf(csv, { unit_of_measurement: "dBFS" })).unit, "dBFS");
  assert.equal(readSource({ kind: "scalar", entity: "sensor.x" }, hassOf("21")).unit, undefined);
});
