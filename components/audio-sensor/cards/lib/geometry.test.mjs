import test from "node:test";
import assert from "node:assert/strict";
import { wavePath, hGradient, capGain, at, WAVES } from "./geometry.js";
import { makePalette } from "./palette.js";
import { recordingContext, points } from "../testing/fake-ctx.mjs";

test("geometry: still follows the classic sines", () => {
  const ctx = recordingContext(400, 100);
  wavePath(ctx, 400, 0, 0, () => 100 * 0.34, () => 50);
  const pts = points(ctx);
  assert.deepEqual(pts[0], ["moveTo", 0, 50]);
  // x = 65 is the quarter period of the 260 px wave; the path steps by 2 px, so 66 is the nearest point.
  const p66 = pts.find(([, x]) => x === 66);
  assert.ok(Math.abs(p66[2] - (50 + 34 * Math.sin((66 / 260) * 2 * Math.PI) * 0.75)) < 0.01);
  assert.ok(Math.abs(p66[2] - (50 + 34 * 0.75)) < 0.1);
  assert.equal(WAVES.length, 3);
});

test("capGain, at and hGradient", () => {
  assert.ok(Math.abs(capGain(0.34) - (0.44 / 0.34 - 0.55)) < 1e-12);
  assert.equal(at([0, 10], 0.25), 2.5);
  assert.equal(at([0, 10], 2), 10);
  const palette = makePalette({ palette: "zones", neutral: 60, hot: 100 }, [3, 169, 244]);
  const ctx = recordingContext(400, 100);
  const g = hGradient(ctx, 400, (u) => u, (e) => 0.5, palette);
  assert.equal(g.stops.length, 33);
  assert.equal(g.stops[32].colour, palette.css(100, 0.5));
});
