import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drawClassic } from "./classic.js";
import { recordingContext } from "../testing/fake-ctx.mjs";

// Ramka's now-playing wave, step for step as its _waveStart draws one frame: the reference the
// fallback must not drift from.
function nowPlayingFrame(g, w, h, t, color) {
  const mid = h / 2;
  for (const [period, speed, amp, alpha] of [[260, 28, 0.34, 0.55], [170, -40, 0.22, 0.35], [110, 55, 0.12, 0.22]]) {
    g.beginPath();
    g.lineWidth = Math.max(1.5, h * 0.045);
    g.strokeStyle = color;
    g.globalAlpha = alpha;
    for (let x = 0; x <= w; x += 2) {
      const y = mid + Math.sin((x + speed * t) / period * 2 * Math.PI) * amp * h * (0.75 + 0.25 * Math.sin(t / 3));
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

for (const [w, h, t] of [[400, 63, 0], [1100, 63, 7.3], [320, 20, 2.5]]) {
  test(`classic: draws exactly the now-playing wave (${w}x${h}, t ${t})`, () => {
    const got = recordingContext(w, h);
    const want = recordingContext(w, h);
    drawClassic(got, w, h, t, "#ff9800");
    nowPlayingFrame(want, w, h, t, "#ff9800");
    assert.deepEqual(got.calls, want.calls);
    assert.deepEqual(got.strokes, want.strokes);
    assert.deepEqual(got.strokeStyles, want.strokeStyles);
    assert.equal(got.globalAlpha, 1);
  });
}

test("classic: the line is never thinner than 1.5 px", () => {
  const ctx = recordingContext(200, 10);
  drawClassic(ctx, 200, 10, 0, "#000");
  assert.deepEqual(ctx.strokes.map((s) => s.lineWidth), [1.5, 1.5, 1.5]);
});

test("classic: Ramka's now-playing card still draws these waves", () => {
  // Two components, one look: if Ramka's wave changes, the fallback and this reference follow it.
  const source = readFileSync(new URL("../../../ramka/cards/now-playing-card.js", import.meta.url), "utf8");
  assert.ok(source.includes("[[260, 28, 0.34, 0.55], [170, -40, 0.22, 0.35], [110, 55, 0.12, 0.22]]"));
  assert.ok(source.includes("Math.max(1.5, h * 0.045)"));
  assert.ok(source.includes("amp * h * (0.75 + 0.25 * Math.sin(t / 3))"));
  assert.ok(source.includes('getPropertyValue("--primary-color") || "#03a9f4"'));
});
