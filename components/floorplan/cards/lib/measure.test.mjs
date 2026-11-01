import { test } from "node:test";
import assert from "node:assert/strict";
import { gridLines, numberText } from "./measure.js";

const view = { x: -0.5, y: -0.5, w: 9, h: 5, max: { w: 9 } };

test("gridLines: a line every metre over the view, half metres only when they are 24 px apart", () => {
  const coarse = gridLines(view, 1 / 40);         // 40 px per metre: 0.5 m is 20 px
  assert.ok(coarse.every((l) => !l.minor));
  assert.deepEqual(coarse.filter((l) => l.x1 === l.x2).map((l) => l.x1), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(coarse.filter((l) => l.y1 === l.y2).map((l) => l.y1), [0, 1, 2, 3, 4]);
  const fine = gridLines(view, 1 / 48);           // 48 px per metre: 0.5 m is 24 px
  assert.deepEqual(fine.filter((l) => l.minor && l.x1 === l.x2).map((l) => l.x1), [-0.5, 0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5]);
});

test("numberText uses the dashboard language's decimal separator", () => {
  assert.equal(numberText({ language: "en" }, 12.44, 1), "12.4");
  assert.equal(numberText({ language: "pl" }, 3.456, 2), "3,46");
  assert.equal(numberText({ language: "de" }, 12.34, 1), "12,3");
});

test("wallDistances: straight to the nearest wall each way, inside an L-shaped room too", async () => {
  const { wallDistances } = await import("./measure.js");
  const sq = [[0, 0], [5, 0], [5, 4], [0, 4]];
  assert.deepEqual(wallDistances(sq, [2, 1]).map((d) => d.distance), [2, 3, 1, 3]);
  // An L: the notch's wall is nearer than the outer one.
  const l = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
  assert.deepEqual(wallDistances(l, [1, 1]).map((d) => d.distance), [1, 3, 1, 3]);
  assert.deepEqual(wallDistances(l, [3, 1]).map((d) => d.distance), [3, 1, 1, 1]);
  assert.deepEqual(wallDistances(l, [3, 1])[3].to, [3, 2]);
});
