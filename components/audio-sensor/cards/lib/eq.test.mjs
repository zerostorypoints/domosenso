import test from "node:test";
import assert from "node:assert/strict";
import { eqCurve, EQ_KEYS, EQ_CENTRES, EQ_RANGE } from "./eq.js";

test("the six ranges, their centres and the range", () => {
  assert.deepEqual(EQ_KEYS, ["sub", "bass", "low_mid", "mid", "presence", "air"]);
  assert.deepEqual(EQ_CENTRES, [31.5, 80, 315, 1000, 4000, 12500]);
  assert.deepEqual(EQ_RANGE, [-18, 12]);
});

test("no eq is 31 zeros", () => {
  for (const c of [eqCurve(), eqCurve({})]) {
    assert.equal(c.length, 31);
    assert.ok([...c].every((v) => v === 0));
  }
});

test("a centre band takes its range's value; the ends hold the outer values", () => {
  const c = eqCurve({ bass: -10 });
  assert.equal(c[6], -10);
  assert.equal(c[0], 0);
  assert.equal(c[1], 0);
  const a = eqCurve({ air: 5 });
  assert.equal(a[29], 5);
  assert.equal(a[30], 5);
});

test("between two centres the gain moves monotonically", () => {
  const c = eqCurve({ bass: -10, low_mid: 0 });
  for (let i = 6; i < 12; i++) assert.ok(c[i + 1] >= c[i], `band ${i}`);
});

test("values are clamped to the range", () => {
  const c = eqCurve({ bass: 40, sub: -30 });
  assert.equal(c[6], 12);
  assert.equal(c[2], -18);
});

test("a value that is not a number reads 0", () => {
  const c = eqCurve({ mid: "x", air: null });
  assert.ok([...c].every((v) => v === 0));
});
