import { test } from "node:test";
import assert from "node:assert/strict";
import { raf } from "./dom-env.mjs";
import { recordingContext, points } from "./fake-ctx.mjs";

test("recordingContext records a lineTo point", () => {
  const ctx = recordingContext(10, 10);
  ctx.lineTo(3, 4);
  assert.deepEqual(points(ctx), [["lineTo", 3, 4]]);
});

test("raf.flush runs queued frames on the fake clock", () => {
  const seen = [];
  requestAnimationFrame((t) => seen.push(t));
  assert.equal(raf.pending(), 1);
  raf.flush(32);
  assert.equal(raf.pending(), 0);
  assert.equal(seen.length, 1);
});

test("curves record their end point; transform calls do not throw", () => {
  const ctx = recordingContext(10, 10);
  ctx.bezierCurveTo(1, 2, 3, 4, 30, 40);
  assert.deepEqual(points(ctx), [["bezierCurveTo", 30, 40]]);
  ctx.translate(1, 1); ctx.scale(2, 2); ctx.clip();
  ctx.setLineDash([2, 3]);
  assert.deepEqual(ctx.getLineDash(), [2, 3]);
  assert.equal(ctx.createRadialGradient(0, 0, 1, 0, 0, 2).stops.length, 0);
});
