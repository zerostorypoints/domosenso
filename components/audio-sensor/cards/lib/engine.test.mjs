import test from "node:test";
import assert from "node:assert/strict";
import { approach, spread, Engine, WIDTH_POINTS } from "./engine.js";
import { makePalette } from "./palette.js";

const palette = makePalette({ palette: "zones", neutral: 60, hot: 100 }, [3, 169, 244]);
const opts = (o = {}) => ({ rise: 250, fall: 4, hold: 1.5, tilt: false, historyS: 40, showFrom: 0, showTo: 30,
  unit: "dBFS", windows: [30, 5, 1], ...o });
const fill = (v) => new Array(31).fill(v);

test("approach reaches 90 % in the set time", () => {
  let v = 50;
  for (let i = 0; i < 250; i++) v = approach(v, 90, 0.001, 0.25, 4);
  assert.ok(v >= 85.9, String(v)); // exactly 90 % is 85.98 (e^-2.3 = 0.100)
  v = 90;
  for (let i = 0; i < 4000; i++) v = approach(v, 50, 0.001, 0.25, 4);
  assert.ok(v <= 54.1, String(v));
});

test("rise or fall of 0 jumps to the target instead of poisoning the smoothing", () => {
  assert.equal(approach(50, 90, 0, 0, 4), 50, "dt 0 moves nothing");
  assert.ok(Math.abs(approach(50, 90, 0.016, 0, 4) - 90) < 1e-6);
  assert.ok(Math.abs(approach(90, 50, 0.016, 0.25, 0) - 50) < 1e-6);
  const e = new Engine("spectrum");
  let now = 0;
  for (let i = 0; i < 20; i++) {
    e.push(fill(i % 2 ? 90 : 50), now);
    e.step(i % 3 ? 0.1 : 0, now, palette, opts({ rise: 0, fall: 0 }));
    now += 100;
  }
  for (const a of [e.frame.smooth, e.frame.peak, e.frame.env]) assert.ok([...a].every(Number.isFinite));
  assert.ok(Number.isFinite(e.frame.smoothValue));
});

test("spread keeps a lone band's peak", () => {
  const e = new Array(31).fill(0);
  e[17] = 0.8;
  const out = new Float32Array(WIDTH_POINTS);
  spread(e, out, 0, 30);
  const max = Math.max(...out);
  assert.ok(Math.abs(max - 0.8) < 0.02, String(max));
  assert.equal(out.indexOf(max), Math.round((17 / 30) * (WIDTH_POINTS - 1)));
});

test("spread never exceeds 1 when many neighbours are hot", () => {
  const out = new Float32Array(WIDTH_POINTS);
  spread(new Array(31).fill(1), out, 0, 30);
  assert.ok(Math.max(...out) <= 1, String(Math.max(...out)));
  assert.ok(Math.min(...out) > 0.99, String(Math.min(...out)));
});

test("stale spectrum falls back to neutral", () => {
  const e = new Engine("spectrum");
  e.push(fill(95), 0);
  let now = 0;
  for (let i = 0; i < 100; i++) { now += 100; e.step(0.1, now, palette, opts()); }
  assert.equal(e.frame.stale, true);
  for (const s of e.frame.smooth) assert.ok(s < 63, String(s));
});

test("afterglow holds then sinks", () => {
  const e = new Engine("spectrum");
  e.push(fill(95), 0);
  let now = 0;
  const run = (secs, pushEvery) => {
    for (let i = 0; i < secs * 10; i++) {
      now += 100;
      if (pushEvery && i % 2 === 1) e.push(fill(60), now);
      e.step(0.1, now, palette, opts());
    }
  };
  run(1, false);
  run(1, true);
  for (const p of e.frame.peak) assert.ok(p >= 94, String(p));
  run(8.5, true);
  for (const p of e.frame.peak) assert.ok(p < 66, String(p));
});

test("history stays bounded", () => {
  const e = new Engine("spectrum");
  const h0 = e.frame.history;
  for (let i = 0; i < 10000; i++) {
    const now = i * 1080; // 3 h
    e.push(fill(70), now);
    e.step(1.08, now, palette, opts());
  }
  assert.equal(e.frame.history.length, 160);
  assert.equal(e.frame.historyValues.length, 160);
  assert.equal(e.frame.history, h0);
  e.step(0.1, 10000 * 1080, palette, opts({ historyS: 20 }));
  assert.equal(e.frame.history.length, 80);
});

test("clocks average plainly without a dB unit", () => {
  const p = makePalette({ palette: "zones", neutral: 0, hot: 40 }, [3, 169, 244]);
  const run = (unit) => {
    const e = new Engine("scalar");
    let now = 0;
    for (let s = 0; s < 120; s++) {
      e.push(s % 2 ? 30 : 20, now);
      for (let i = 0; i < 10; i++) { now += 100; e.step(0.1, now, p, opts({ unit })); }
    }
    return e.frame.clocks;
  };
  assert.ok(Math.abs(run("°C")[0] - p.excess(25)) <= 0.03);
  assert.ok(run("dB")[0] >= p.excess(27));
});

// The frontend sends a scalar only when it changes, so silence means "unchanged", not "dead".
test("scalar keeps an unchanged value; stale only before a reading or while unavailable", () => {
  const e = new Engine("scalar");
  e.step(0.1, 0, palette, opts());
  assert.equal(e.frame.stale, true, "no reading yet");
  e.push(80, 0);
  for (const now of [29000, 31000, 600000]) {
    e.step(0.1, now, palette, opts());
    assert.equal(e.frame.stale, false, `at ${now} ms`);
  }
  assert.ok(e.frame.smoothValue > 79, String(e.frame.smoothValue));
  e.push(NaN, 600000); // the card's push for unavailable/unknown
  e.step(0.1, 600100, palette, opts());
  assert.equal(e.frame.stale, true);
});

test("spectrum still goes stale after 5 s", () => {
  const e = new Engine("spectrum");
  e.push(fill(80), 0);
  e.step(0.1, 4900, palette, opts());
  assert.equal(e.frame.stale, false);
  e.step(0.1, 5100, palette, opts());
  assert.equal(e.frame.stale, true);
});

test("a fresh scalar card has neutral history, not zeros", () => {
  const p = makePalette({ palette: "zones", neutral: 21, hot: 28 }, [3, 169, 244]);
  const o = opts({ unit: "°C" });
  const e = new Engine("scalar");
  e.step(0.1, 0, p, o); // no reading yet
  assert.ok(e.frame.historyValues.every((v) => v === 21));
  assert.ok(e.frame.history.every((v) => v === 0));
  e.push(26, 100);
  for (let i = 0; i < 20; i++) e.step(0.1, 100 + i * 100, p, o);
  const hv = e.frame.historyValues;
  assert.ok(hv[hv.length - 1] > 21, "newest sample is the reading");
  assert.equal(hv[0], 21, "older samples stay neutral rather than 0 °C");
});

test("the frame carries the shown band range", () => {
  const e = new Engine("spectrum");
  assert.equal(e.frame.showFrom, 0);
  assert.equal(e.frame.showTo, 30);
  e.step(0.1, 0, palette, opts({ showFrom: 2, showTo: 29 }));
  assert.equal(e.frame.showFrom, 2);
  assert.equal(e.frame.showTo, 29);
});
