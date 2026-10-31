import test from "node:test";
import assert from "node:assert/strict";
import {
  normaliseConfig, entitiesOf, resolveOptions, DEFAULTS, DEFAULT_FLAVOUR, DEFAULT_COLOUR,
} from "./config.js";
import { FLAVOUR_KINDS } from "./flavours/index.js";

const KINDS = { still: ["spectrum", "scalar"], swell: ["spectrum"], dune: ["spectrum"], tide: ["scalar"], centre: ["scalar"] };
const base = (extra = {}) => ({ source: { kind: "spectrum", entity: "sensor.x" }, ...extra });

test("config: minimal spectrum", () => {
  const c = normaliseConfig(base(), KINDS);
  assert.equal(c.flavour, "dune");
  assert.equal(c.dynamics.fall, 4);
  assert.equal(normaliseConfig({ source: { kind: "scalar", entity: "sensor.x" } }, KINDS).flavour, "centre");
});

test("config: errors name the option", () => {
  assert.throws(() => normaliseConfig({ source: { kind: "spectrum" } }, KINDS), /source\.entity/);
  assert.throws(() => normaliseConfig({ source: { entity: "sensor.x" } }, KINDS), /source\.kind/);
  assert.throws(() => normaliseConfig(base({ flavour: "tide" }), KINDS), /flavour/);
  assert.throws(() => normaliseConfig(base({ flavour: "nope" }), KINDS), /flavour/);
  assert.throws(() => normaliseConfig(base({ colour: { neutral: 80, hot: 70 } }), KINDS), /colour\.hot/);
  assert.throws(() => normaliseConfig(base({ fps: 0 }), KINDS), /fps/);
  assert.throws(() => normaliseConfig(base({ fps: 61 }), KINDS), /fps/);
  assert.doesNotThrow(() => normaliseConfig({ source: { kind: "spectrum", demo: true } }, KINDS));
});

test("config: entity-valued options pass validation", () => {
  const c = normaliseConfig(
    base({ flavour: "input_select.f", colour: { hot: "input_number.h" } }), KINDS);
  const ids = entitiesOf(c);
  assert.ok(ids.includes("input_select.f"));
  assert.ok(ids.includes("input_number.h"));
  assert.ok(ids.includes("sensor.x"));
});

const entityCfg = (o) => normaliseConfig(base(o), KINDS);

test("resolveOptions reads entity states", () => {
  const c = entityCfg({ flavour: "input_select.f", colour: { hot: "input_number.h" } });
  const r = resolveOptions(c, { "input_number.h": { state: "95" }, "input_select.f": { state: "dune" } }, KINDS);
  assert.equal(r.colour.hot, 95);
  assert.equal(r.flavour, "dune");
});

test("resolveOptions falls back when hot <= neutral", () => {
  const c = entityCfg({ colour: { neutral: "input_number.n", hot: "input_number.h" } });
  const r = resolveOptions(c, { "input_number.n": { state: "90" }, "input_number.h": { state: "80" } }, KINDS);
  assert.equal(r.colour.neutral, 30);
  assert.equal(r.colour.hot, 70);
});

test("config: colour defaults per kind", () => {
  const spectrum = normaliseConfig(base(), KINDS);
  assert.deepEqual([spectrum.colour.neutral, spectrum.colour.hot], [30, 70]);
  const scalar = normaliseConfig({ source: { kind: "scalar", entity: "sensor.x" } }, KINDS);
  assert.deepEqual([scalar.colour.neutral, scalar.colour.hot], [30, 70]);
  // An author's own value is kept; only the missing one is the kind's default.
  assert.equal(normaliseConfig(base({ colour: { hot: 90 } }), KINDS).colour.neutral, 30);
});

test("resolveOptions falls back to the kind's colour defaults", () => {
  const states = { "input_number.n": { state: "unavailable" }, "input_number.h": { state: "unknown" } };
  const colour = { neutral: "input_number.n", hot: "input_number.h" };
  const s = resolveOptions(entityCfg({ colour }), states, KINDS);
  assert.deepEqual([s.colour.neutral, s.colour.hot], [30, 70]);
  const c = normaliseConfig({ source: { kind: "scalar", entity: "sensor.x" }, colour }, KINDS);
  const r = resolveOptions(c, states, KINDS);
  assert.deepEqual([r.colour.neutral, r.colour.hot], [30, 70]);
  const inverted = { "input_number.n": { state: "90" }, "input_number.h": { state: "80" } };
  const i = resolveOptions(c, inverted, KINDS);
  assert.deepEqual([i.colour.neutral, i.colour.hot], [30, 70]);
});

test("resolveOptions falls back on an unknown flavour state", () => {
  const c = entityCfg({ flavour: "input_select.f" });
  for (const state of ["bogus", "tide", "unavailable"]) {
    assert.equal(resolveOptions(c, { "input_select.f": { state } }, KINDS).flavour, "dune");
  }
  assert.equal(resolveOptions(c, {}, KINDS).flavour, "dune");
});

test("resolveOptions: booleans, invalid numbers, missing entities", () => {
  const c = entityCfg({ dynamics: { tilt: "input_boolean.t", fall: "input_number.f" }, fps: "number.fps" });
  const r = resolveOptions(c, {
    "input_boolean.t": { state: "on" }, "input_number.f": { state: "abc" }, "number.fps": { state: "99" },
  }, KINDS);
  assert.equal(r.dynamics.tilt, true);
  assert.equal(r.dynamics.fall, 4);
  assert.equal(r.fps, 30);
});

// The engine has the 31 third-octave slots only, so any other axis is refused up front.
test("config: source.axis is third_octave only", () => {
  const src = (o) => ({ source: { kind: "spectrum", entity: "sensor.x", ...o } });
  assert.doesNotThrow(() => normaliseConfig(src({ axis: "third_octave" }), KINDS));
  for (const axis of ["none", ["a", "b", "c"], "input_select.axis"]) {
    assert.throws(() => normaliseConfig(src({ axis }), KINDS), /source\.axis/, JSON.stringify(axis));
  }
});

test("config: source.show is two frequencies at least one band apart, low first", () => {
  const src = (show) => ({ source: { kind: "spectrum", entity: "sensor.x", show } });
  assert.doesNotThrow(() => normaliseConfig(src([31.5, 16000]), KINDS));
  assert.doesNotThrow(() => normaliseConfig(src([100, 125]), KINDS));
  for (const show of [[16000, 31.5], [1000, 1050], [100], "100,200", [100, "x"]]) {
    assert.throws(() => normaliseConfig(src(show), KINDS), /source\.show/, JSON.stringify(show));
  }
});

test("config: a flavour named like an Object property is an unknown flavour, not a crash", () => {
  for (const flavour of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assert.throws(() => normaliseConfig(base({ flavour }), KINDS), /is unknown or does not suit/, flavour);
  }
  const c = entityCfg({ flavour: "input_select.f" });
  for (const state of ["constructor", "toString", "__proto__"]) {
    assert.equal(resolveOptions(c, { "input_select.f": { state } }, KINDS).flavour, "dune", state);
  }
});

test("config: a custom palette needs at least one stop at a number", () => {
  assert.doesNotThrow(() => normaliseConfig(base({ colour: { palette: [[60, "#03a9f4"], [100, "#e53935"]] } }), KINDS));
  assert.doesNotThrow(() => normaliseConfig(base({ colour: { palette: "input_select.p" } }), KINDS));
  for (const palette of [[], [["x", "#fff"]], [null], [[]], 7]) {
    assert.throws(() => normaliseConfig(base({ colour: { palette } }), KINDS), /colour\.palette/, JSON.stringify(palette));
  }
});

test("config: source.history must be above 0", () => {
  const src = (history) => ({ source: { kind: "scalar", entity: "sensor.x", history } });
  assert.doesNotThrow(() => normaliseConfig(src(10), KINDS));
  assert.doesNotThrow(() => normaliseConfig(src("input_number.h"), KINDS));
  for (const history of [0, -5, "abc", Infinity]) {
    assert.throws(() => normaliseConfig(src(history), KINDS), /source\.history/, String(history));
  }
  const c = normaliseConfig(src("input_number.h"), KINDS);
  assert.equal(resolveOptions(c, { "input_number.h": { state: "0" } }, KINDS).source.history, 40);
});

// style.line_width, CSS px, default 4, valid 0.5-12.
const lineWidthOf = (cfg, states = {}) => resolveOptions(normaliseConfig(base(cfg), KINDS), states, KINDS).style.line_width;

test("style.line_width defaults to 4", () => {
  assert.equal(lineWidthOf({}), 4);
  assert.equal(normaliseConfig(base(), KINDS).style.line_width, 4);
});

test("style.line_width takes a numeric literal", () => {
  assert.equal(lineWidthOf({ style: { line_width: 4.5 } }), 4.5);
  assert.equal(lineWidthOf({ style: { line_width: 0.5 } }), 0.5);
  assert.equal(lineWidthOf({ style: { line_width: 12 } }), 12);
});

test("style.line_width may be an entity, listed in entitiesOf", () => {
  const c = normaliseConfig(base({ style: { line_width: "input_number.lw" } }), KINDS);
  assert.ok(entitiesOf(c).includes("input_number.lw"));
  assert.equal(resolveOptions(c, { "input_number.lw": { state: "6.5" } }, KINDS).style.line_width, 6.5);
});

test("style.line_width falls back to 4 when invalid or out of range", () => {
  for (const state of ["abc", "0.4", "12.1", "-3", "0", "unavailable", "unknown", ""]) {
    assert.equal(lineWidthOf({ style: { line_width: "input_number.lw" } }, { "input_number.lw": { state } }), 4, state);
  }
  assert.equal(lineWidthOf({ style: { line_width: "input_number.lw" } }, {}), 4);
  for (const v of [0, 0.4, 12.1, -1, NaN, Infinity, "wide", true, null, [3]]) {
    assert.equal(lineWidthOf({ style: { line_width: v } }), 4, String(v));
  }
});

test("config: fallback is none by default, classic or none", () => {
  assert.equal(normaliseConfig(base(), KINDS).fallback, "none");
  assert.equal(normaliseConfig(base({ fallback: "classic" }), KINDS).fallback, "classic");
  assert.throws(() => normaliseConfig(base({ fallback: "wave" }), KINDS), /fallback/);
});

// The values the card was tuned to on a wall tablet, so every use looks that way without options.
test("defaults are the screenshot values", () => {
  assert.deepEqual(DEFAULT_FLAVOUR, { spectrum: "dune", scalar: "centre" });
  assert.deepEqual(DEFAULT_COLOUR, { spectrum: { neutral: 30, hot: 70 }, scalar: { neutral: 30, hot: 70 } });
  assert.equal(DEFAULTS.colour.palette, "series");
  assert.equal(DEFAULTS.dynamics.rise, 200);
  assert.equal(DEFAULTS.dynamics.fall, 4);
  assert.equal(DEFAULTS.dynamics.tilt, true);
  assert.equal(DEFAULTS.style.line_width, 4);
  const spectrum = resolveOptions(normaliseConfig({ source: { kind: "spectrum", entity: "sensor.demo_spectrum" } }, FLAVOUR_KINDS), {}, FLAVOUR_KINDS);
  const level = resolveOptions(normaliseConfig({ source: { kind: "scalar", entity: "sensor.demo_level" } }, FLAVOUR_KINDS), {}, FLAVOUR_KINDS);
  for (const [r, flavour] of [[spectrum, "dune"], [level, "centre"]]) {
    assert.equal(r.flavour, flavour);
    assert.deepEqual([r.colour.neutral, r.colour.hot], [30, 70], flavour);
    assert.equal(r.colour.palette, "series");
    assert.deepEqual([r.dynamics.rise, r.dynamics.fall], [200, 4]);
    assert.equal(r.style.line_width, 4);
    assert.equal(r.fallback, "none");
  }
  assert.equal(spectrum.dynamics.tilt, true);
});

test("config: dynamics.eq defaults to six flat ranges", () => {
  assert.deepEqual(DEFAULTS.dynamics.eq, { sub: 0, bass: 0, low_mid: 0, mid: 0, presence: 0, air: 0 });
});

test("resolveOptions reads an eq range from an entity", () => {
  const c = entityCfg({ dynamics: { eq: { bass: "input_number.x_eq_bass" } } });
  assert.ok(entitiesOf(c).includes("input_number.x_eq_bass"));
  assert.equal(resolveOptions(c, { "input_number.x_eq_bass": { state: "-6" } }, KINDS).dynamics.eq.bass, -6);
  assert.equal(resolveOptions(c, { "input_number.x_eq_bass": { state: "unavailable" } }, KINDS).dynamics.eq.bass, 0);
});

const LOOK = { rise: 50, fall: 0.3, hold: 0.5, tilt: false, eq: { bass: -4 },
  spectrum: { neutral: 35, hot: 78 }, level: { neutral: 20, hot: 60 } };
const lookState = (attributes, state = "on") => ({ "sensor.x_look": { state, attributes } });

test("look: lists the entity and overrides dynamics and colour", () => {
  const spec = entityCfg({ look: "sensor.x_look", dynamics: { rise: 200, fall: "input_number.f" } });
  assert.ok(entitiesOf(spec).includes("sensor.x_look"));
  const r = resolveOptions(spec, { ...lookState(LOOK), "input_number.f": { state: "9" } }, KINDS);
  assert.deepEqual(r.dynamics, { rise: 50, fall: 0.3, hold: 0.5, tilt: false,
    eq: { sub: 0, bass: -4, low_mid: 0, mid: 0, presence: 0, air: 0 } });
  assert.deepEqual([r.colour.neutral, r.colour.hot], [35, 78]);
  const scalar = normaliseConfig({ source: { kind: "scalar", entity: "sensor.x" }, look: "sensor.x_look" }, KINDS);
  const s = resolveOptions(scalar, lookState(LOOK), KINDS);
  assert.deepEqual([s.colour.neutral, s.colour.hot], [20, 60]);
});

test("look: unavailable or missing leaves the options as without it", () => {
  const plain = resolveOptions(entityCfg({}), {}, KINDS);
  const c = entityCfg({ look: "sensor.x_look" });
  assert.deepEqual(resolveOptions(c, lookState(LOOK, "unavailable"), KINDS), { ...plain, look: "sensor.x_look" });
  assert.deepEqual(resolveOptions(c, lookState(LOOK, "unknown"), KINDS), { ...plain, look: "sensor.x_look" });
  assert.deepEqual(resolveOptions(c, {}, KINDS), { ...plain, look: "sensor.x_look" });
});

test("look: an attribute of the wrong type leaves the option as configured", () => {
  const c = entityCfg({ look: "sensor.x_look", dynamics: { rise: 200 } });
  const r = resolveOptions(c, lookState({ rise: "fast", tilt: "yes", fall: NaN, hold: 2, eq: { bass: "loud" } }), KINDS);
  assert.equal(r.dynamics.rise, 200);
  assert.equal(r.dynamics.tilt, true);
  assert.equal(r.dynamics.fall, 4);
  assert.equal(r.dynamics.hold, 2);
  assert.equal(r.dynamics.eq.bass, 0);
});

test("look: a hot at or below neutral puts the kind's defaults back", () => {
  const c = entityCfg({ look: "sensor.x_look" });
  const r = resolveOptions(c, lookState({ spectrum: { neutral: 80, hot: 30 } }), KINDS);
  assert.deepEqual([r.colour.neutral, r.colour.hot], [30, 70]);
});
