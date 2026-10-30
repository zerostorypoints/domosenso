import test from "node:test";
import assert from "node:assert/strict";
import { FLAVOURS } from "./index.js";
import { Engine } from "../engine.js";
import { Demo } from "../sources.js";
import { makePalette, parseColour } from "../palette.js";
import { masks } from "./voices.js";
import { WAVES, NEUTRAL_AMP, MAX_AMP, DEFAULT_LINE_WIDTH } from "../geometry.js";
import { recordingContext, points } from "../../testing/fake-ctx.mjs";

const W = 480, H = 110;
const palette = makePalette({ palette: "zones", neutral: 60, hot: 100 }, [3, 169, 244]);
const opts = { rise: 250, fall: 4, hold: 1.5, tilt: false, historyS: 40, showFrom: 2, showTo: 29,
  unit: "dBFS", windows: [30, 5, 1] };

// The card maps source.show to bands 2..29, so u = 0..1 spans 31.5 Hz .. 16 kHz.
const uOf = (hz) => (3 * Math.log2(hz / 1000) + 17 - 2) / 27;

function demoFrame() {
  const e = new Engine("spectrum");
  const demo = new Demo("electronic");
  let now = 0;
  for (let i = 0; i < 100; i++) { // 10 s at 10 Hz
    e.push(demo.bands(now / 1000), now);
    now += 100;
    e.step(0.1, now, palette, opts);
  }
  return e.frame;
}

function bassFrame() {
  const e = new Engine("spectrum");
  const v = new Array(31).fill(60);
  v[5] = 100; // 63 Hz
  let now = 0;
  for (let i = 0; i < 100; i++) { e.push(v, now); now += 100; e.step(0.1, now, palette, opts); }
  return e.frame;
}

// Every band at `hot` (loud broadband music): the soft maximum sums neighbours, the cap must hold.
function hotFrame() {
  const e = new Engine("spectrum");
  const v = new Array(31).fill(100);
  let now = 0;
  for (let i = 0; i < 100; i++) { e.push(v, now); now += 100; e.step(0.1, now, palette, opts); }
  return e.frame;
}

// A °C room: 18..30 over a minute, with the palette of a thermometer.
const tempPalette = makePalette({ palette: "zones", neutral: 21, hot: 28 }, [3, 169, 244]);
const tempOpts = { ...opts, unit: "°C" };

function levelFrame() {
  const e = new Engine("scalar");
  const demo = new Demo("orchestra");
  let now = 0;
  for (let i = 0; i < 600; i++) { // 60 s at 10 Hz fills the 40 s history
    e.push(demo.level(now / 1000), now);
    now += 100;
    e.step(0.1, now, palette, { ...opts, unit: "dB" });
  }
  return e.frame;
}

function tempFrame() {
  const e = new Engine("scalar");
  let now = 0;
  for (let i = 0; i < 600; i++) {
    e.push(24 + 6 * Math.sin(i / 40) * (i < 300 ? 1 : -1), now);
    now += 100;
    e.step(0.1, now, tempPalette, tempOpts);
  }
  return e.frame;
}

const byKind = (kind) => Object.values(FLAVOURS).filter((f) => f.kinds.includes(kind));
const spectrum = byKind("spectrum");
const draw = (flavour, frame, t = 3, extra = {}) => {
  const ctx = recordingContext(W, H);
  flavour.draw(ctx, W, H, t, frame, { ...flavour.defaults, ...extra });
  return ctx;
};

test("the six spectrum flavours are registered with their defaults", () => {
  const want = { swell: { gain: 0.8 }, dune: { lift: 0.34 }, veil: { opacity: 0.2 },
    voices: { split: [250, 2500] }, halo: { glow: 0.4 }, afterglow: {} };
  for (const [id, defaults] of Object.entries(want)) {
    assert.ok(FLAVOURS[id], id);
    assert.deepEqual(FLAVOURS[id].defaults, defaults, id);
    assert.ok(FLAVOURS[id].kinds.includes("spectrum"), id);
  }
});

const cases = [
  ...spectrum.map((f) => [f, [["demo", demoFrame()], ["bass", bassFrame()]]]),
  ...byKind("scalar").map((f) => [f, [["level", levelFrame()], ["°C", tempFrame()]]]),
];

for (const [flavour, frames] of cases) {
  const kind = frames[0][0] === "demo" ? "spectrum" : "scalar";
  for (const [label, frame] of frames) {
    test(`${flavour.id} (${kind}): no NaN and inside the canvas (${label})`, () => {
      const ctx = draw(flavour, frame);
      const pts = points(ctx);
      assert.ok(pts.length > 0);
      const lw = DEFAULT_LINE_WIDTH;
      for (const [name, x, y] of pts) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y), `${name} ${x} ${y}`);
        assert.ok(x >= 0 && x <= W, `x ${x}`);
        assert.ok(y >= -lw && y <= H + lw, `y ${y}`);
      }
      for (const g of ctx.gradients) for (const s of g.stops) assert.ok(parseColour(s.colour) || /^rgba\(/.test(s.colour), s.colour);
    });
  }

  if (kind === "spectrum" && flavour.id !== "still" && flavour.id !== "bars") {
    test(`${flavour.id}: crest colour follows the loudest band`, () => {
      const ctx = draw(flavour, bassFrame());
      const u = uOf(63);
      const reds = ctx.gradients.map((g) => {
        const s = g.stops.reduce((a, b) => (Math.abs(b.offset - u) < Math.abs(a.offset - u) ? b : a));
        return Number(/rgba?\(\s*(\d+)/.exec(s.colour)[1]);
      });
      assert.ok(reds.length > 0);
      assert.ok(Math.max(...reds) >= 200, String(reds));
    });
  }
}

test("voices: only the long wave swells for bass", () => {
  const ctx = draw(FLAVOURS.voices, bassFrame());
  const groups = [];
  for (const [name, , y] of points(ctx)) {
    if (name === "moveTo") groups.push([]);
    groups.at(-1).push(y);
  }
  assert.equal(groups.length, WAVES.length);
  for (const k of [1, 2]) {
    const A = WAVES[k][2];
    const extent = Math.max(...groups[k].map((y) => Math.abs(y - H / 2)));
    assert.ok(extent <= NEUTRAL_AMP * A * H * 1.01, `wave ${k}: ${extent}`);
  }
  const long = Math.max(...groups[0].map((y) => Math.abs(y - H / 2)));
  assert.ok(long > NEUTRAL_AMP * WAVES[0][2] * H * 1.2, `long wave ${long}`);
});

test("the scalar flavours are registered with their defaults", () => {
  const want = { tide: { gain: 0.8 }, centre: { width: 0.2 }, timeline: {},
    clocks: { windows: [30, 5, 1], energy: "auto" }, ripples: { travel: 12 }, tint: {} };
  for (const [id, defaults] of Object.entries(want)) {
    assert.deepEqual(FLAVOURS[id]?.defaults, defaults, id);
    assert.deepEqual(FLAVOURS[id].kinds, ["scalar"], id);
  }
  assert.deepEqual(FLAVOURS.bars.defaults, { raw: true, line: true, peaks: false });
  assert.deepEqual(FLAVOURS.bars.kinds, ["spectrum", "scalar"]);
});

const scalarFrame = (history) => ({ kind: "scalar", palette, history, historyValues: history.map((e) => 60 + 40 * e),
  value: 60, smoothValue: 60, excess: 0, clocks: [0, 0, 0] });

test("timeline: newest at the right", () => {
  const history = new Float32Array(160);
  history[159] = 1;
  const ctx = draw(FLAVOURS.timeline, scalarFrame(history));
  const reds = ctx.gradients.flatMap((g) => g.stops.map((s) => [Number(/rgba?\(\s*(\d+)/.exec(s.colour)[1]), s.offset]));
  const [, offset] = reds.reduce((a, b) => (b[0] > a[0] ? b : a));
  assert.ok(offset >= 0.97, String(offset));
});

test("bars: one bar per band shown", () => {
  const ctx = recordingContext(W, H);
  const frame = demoFrame();
  FLAVOURS.bars.draw(ctx, W, H, 3, { ...frame, showFrom: 2, showTo: 29 }, { ...FLAVOURS.bars.defaults });
  assert.equal(ctx.calls.filter((c) => c.name === "fillRect" || c.name === "roundRect").length, 28);
  const narrow = recordingContext(W, H);
  FLAVOURS.bars.draw(narrow, W, H, 3, { ...frame, showFrom: 5, showTo: 26 }, { ...FLAVOURS.bars.defaults });
  assert.equal(narrow.calls.filter((c) => c.name === "fillRect" || c.name === "roundRect").length, 22);
});

test("bars: scalar draws recent readings, newest bar at the right and tallest when hottest", () => {
  const frame = tempFrame();
  frame.historyValues.fill(20);
  frame.historyValues[frame.historyValues.length - 1] = 30;
  const ctx = recordingContext(W, H);
  FLAVOURS.bars.draw(ctx, W, H, 3, frame, { ...FLAVOURS.bars.defaults });
  const bars = ctx.calls.filter((c) => c.name === "roundRect" || c.name === "fillRect");
  assert.ok(bars.length > 1);
  const [x, y] = bars.at(-1).args;
  assert.ok(x > W * 0.9, `x ${x}`);
  assert.ok(bars.slice(0, -1).every((b) => b.args[1] > y), "newest bar is the highest");
});

test("tint: shape is the classic wave's", () => {
  const ys = (f) => points(draw(f, scalarFrame(new Float32Array(160)), 7)).map((p) => p[2]);
  assert.deepEqual(ys(FLAVOURS.tint), ys(FLAVOURS.still));
});

test("tint: colour follows the level", () => {
  const hot = { ...scalarFrame(new Float32Array(160)), smoothValue: 100, excess: 1 };
  const ctx = draw(FLAVOURS.tint, hot);
  assert.ok(ctx.strokeStyles.some((c) => /^rgba?\(2[0-9]{2}/.test(c)), ctx.strokeStyles.join());
});

test("voices: the split follows the shown range", () => {
  const split = [250, 2500];
  const at250 = (from, to) => masks(split, from, to)[0]((17 + 3 * Math.log2(0.25) - from) / (to - from));
  assert.ok(Math.abs(at250(2, 29) - 0.5) < 0.01);
  assert.ok(Math.abs(at250(5, 26) - 0.5) < 0.01);
  const frame = bassFrame();
  const stops = (f) => draw(FLAVOURS.voices, f).gradients.map((g) => g.stops.map((s) => s.colour).join());
  assert.notDeepEqual(stops({ ...frame, showFrom: 5, showTo: 26 }), stops({ ...frame, showFrom: 2, showTo: 29 }));
});

// At full swell no wave passes MAX_AMP (0.44) of the height from the centre line.
// `bars` is not a wave (it fills the canvas to its padding) and is checked by the canvas test above.
for (const flavour of spectrum.filter((f) => f.id !== "bars")) {
  test(`${flavour.id}: every band at hot stays within ${MAX_AMP} h`, () => {
    const frame = hotFrame();
    assert.ok(Math.max(...frame.env) <= 1, `envelope ${Math.max(...frame.env)}`);
    // t = 1.5π: breathe() is at its maximum of 1.
    for (const t of [1.5 * Math.PI, 3]) {
      const pts = points(draw(flavour, frame, t));
      assert.ok(pts.length > 0);
      for (const [name, x, y] of pts) {
        assert.ok(Math.abs(y - H / 2) <= MAX_AMP * H + 1e-9, `${name} at x ${x}: ${(Math.abs(y - H / 2) / H).toFixed(4)} h`);
      }
    }
  });
}

// Every wave flavour strokes with options.lineWidth (CSS px); halo's glow is 5x it, afterglow's
// trail uses it too. Bars keep their own grid and outline strokes.
const waveFlavours = Object.values(FLAVOURS).filter((f) => f.id !== "bars");
const frameFor = (f) => (f.kinds.includes("spectrum") ? bassFrame() : levelFrame());

test("the default line width is 4", () => {
  assert.equal(DEFAULT_LINE_WIDTH, 4);
});

for (const f of waveFlavours) {
  test(`${f.id}: strokes with the configured line width`, () => {
    const widths = new Set(draw(f, frameFor(f), 3, { lineWidth: 7 }).strokes.map((s) => s.lineWidth));
    assert.ok(widths.has(7), [...widths].join());
    const dflt = new Set(draw(f, frameFor(f)).strokes.map((s) => s.lineWidth));
    assert.ok(dflt.has(DEFAULT_LINE_WIDTH), [...dflt].join());
  });
}

test("halo's glow is five times the line", () => {
  const widths = draw(FLAVOURS.halo, bassFrame(), 3, { lineWidth: 3 }).strokes.map((s) => s.lineWidth);
  assert.deepEqual([...new Set(widths)].sort((a, b) => a - b), [3, 15]);
});

test("afterglow's dotted trail uses the line width", () => {
  const dotted = draw(FLAVOURS.afterglow, bassFrame(), 3, { lineWidth: 5 }).strokes.filter((s) => s.dash.length);
  assert.ok(dotted.length > 0);
  assert.ok(dotted.every((s) => s.lineWidth === 5));
});

test("bars keep their grid and outline strokes whatever the line width", () => {
  const widths = (extra) => draw(FLAVOURS.bars, bassFrame(), 3, extra).strokes.map((s) => s.lineWidth);
  assert.deepEqual(widths({ lineWidth: 9 }), widths({}));
});
