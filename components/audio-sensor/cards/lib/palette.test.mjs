import test from "node:test";
import assert from "node:assert/strict";
import { makePalette, parseColour } from "./palette.js";

test("palette: neutral below, hot at top", () => {
  const p = makePalette({ palette: "zones", neutral: 60, hot: 100 }, [3, 169, 244]);
  assert.equal(p.excess(50), 0);
  assert.equal(p.excess(100), 1);
  assert.equal(p.excess(80), 0.5);
  assert.deepEqual(p.colourAt(50), [3, 169, 244]);
  assert.deepEqual(p.colourAt(120), [229, 57, 53]);
  assert.equal(p.excess(NaN), 0);
  assert.deepEqual(p.colourAt(NaN), [3, 169, 244]);
  assert.equal(p.css(50, 0.5), "rgba(3, 169, 244, 0.5)");
  assert.equal(p.css(50), "rgb(3, 169, 244)");
});

test("palette: custom stops in source units", () => {
  const p = makePalette(
    { palette: [[18, "#03a9f4"], [28, "#e53935"]], neutral: 18, hot: 28 },
    [0, 0, 0]
  );
  assert.deepEqual(p.colourAt(23), [116, 113, 149]);
});

test("palette: neutral_color replaces the first stop", () => {
  const p = makePalette({ palette: "zones", neutral: 60, hot: 100 }, [0, 0, 255]);
  assert.deepEqual(p.colourAt(0), [0, 0, 255]);
});

test("parseColour", () => {
  assert.deepEqual(parseColour("#03a9f4"), [3, 169, 244]);
  assert.deepEqual(parseColour("#fff"), [255, 255, 255]);
  assert.deepEqual(parseColour("rgb(1, 2, 3)"), [1, 2, 3]);
  assert.equal(parseColour("nonsense"), null);
});
