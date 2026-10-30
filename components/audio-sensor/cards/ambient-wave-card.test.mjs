import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { raf, intersect } from "./testing/dom-env.mjs";
import { recordingContext } from "./testing/fake-ctx.mjs";

const BASE = ".";
await import(`${BASE}/ambient-wave-card.js`);
const { FLAVOURS, FLAVOUR_KINDS, flavoursFor } = await import(`${BASE}/lib/flavours/index.js`);
const load = (lang) => JSON.parse(readFileSync(new URL(`../translations/${lang}.json`, import.meta.url), "utf8"));

// happy-dom has no layout and no 2D context: give every element a size and every canvas a recorder.
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 120 });
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  this._rec ??= recordingContext(this.width, this.height);
  return this._rec;
};

const Card = () => customElements.get("ambient-wave-card");
const make = (config) => {
  const card = document.createElement("ambient-wave-card");
  card.setConfig(config);
  return card;
};
const csv = (n, v = 50) => Array.from({ length: n }, () => v).join(",");
const hassOf = (states, language = "en") => ({ language, locale: { language }, states });
// Shaped like the frontend's entity objects: last_changed and last_updated, never last_reported.
const entity = (state, extra = {}) => ({ state, attributes: {}, last_changed: "2026-01-15T10:00:00Z", last_updated: "2026-01-15T10:00:00Z", ...extra });

const setVisibility = (v) => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });

beforeEach(() => { setVisibility("visible"); intersect(true); });
afterEach(() => { document.body.innerHTML = ""; raf.flush(16); });

test("registers and offers itself in the picker", () => {
  assert.ok(Card());
  const entry = window.customCards.find((c) => c.type === "ambient-wave-card");
  assert.ok(entry);
  assert.equal(entry.preview, true);
  assert.ok(entry.name && entry.description);
});

test("setConfig rejects a flavour of the other kind", () => {
  assert.throws(() => make({ source: { kind: "scalar", demo: true }, flavour: "swell" }), /flavour/);
});

test("stub config renders a demo without hass", () => {
  const card = make(Card().getStubConfig());
  document.body.appendChild(card);
  assert.doesNotThrow(() => raf.flush(1000));
  const canvas = card.shadowRoot.querySelector("ha-card canvas[role=img]");
  assert.ok(canvas);
  // The demo pushed readings: the frame is live, not stale.
  assert.equal(card._engine.frame.stale, false);
  assert.ok(canvas._rec.calls.length > 0, "something was drawn");
  assert.ok(canvas.getAttribute("aria-label"));
});

test("an unregistered flavour draws still", () => {
  const calls = [];
  const orig = FLAVOURS.still.draw;
  const bars = FLAVOURS.bars; // every id is drawn now; take one out to see the fallback
  delete FLAVOURS.bars;
  FLAVOURS.still.draw = (...a) => { calls.push(a); };
  try {
    const card = make({ source: { kind: "spectrum", demo: true }, flavour: "bars" });
    document.body.appendChild(card);
    raf.flush(200);
    assert.ok(calls.length > 0);
  } finally {
    FLAVOURS.still.draw = orig;
    FLAVOURS.bars = bars;
  }
});

test("getConfigForm is a valid schema", () => {
  const names = [];
  const walk = (schema) => {
    for (const s of schema) {
      assert.ok(s.name, JSON.stringify(s));
      names.push(s.name);
      if (s.schema) walk(s.schema);
    }
  };
  for (const lang of ["en", "de", "pl"]) {
    const form = Card().getConfigForm(hassOf({}, lang));
    assert.ok(Array.isArray(form.schema));
    names.length = 0;
    walk(form.schema);
    for (const name of names) {
      const label = form.computeLabel({ name });
      assert.equal(typeof label, "string");
      assert.ok(label.length > 0 && !label.startsWith("card."), `${lang}: ${name} -> ${label}`);
    }
  }
  const flavour = Card().getConfigForm().schema.find((s) => s.name === "flavour");
  assert.deepEqual(flavour.selector.select.options.map((o) => o.value).sort(), Object.keys(FLAVOUR_KINDS).sort());
});

test("grid options and card size", () => {
  const card = make(Card().getStubConfig());
  assert.deepEqual(card.getGridOptions(), { columns: 12, rows: 2, min_rows: 1 });
  assert.equal(card.getCardSize(), 2);
});

test("wrong count shows the message", () => {
  const card = make({ source: { kind: "spectrum", entity: "sensor.s" } });
  const message = card.shadowRoot.querySelector(".message");
  assert.equal(message.hidden, true);
  card.hass = hassOf({ "sensor.s": entity(csv(30)) });
  assert.equal(message.hidden, false);
  const en = load("en").card.ambient_wave.message.count;
  assert.equal(message.textContent, en.replace("{expected}", "31").replace("{count}", "30"));
  card.hass = hassOf({ "sensor.s": entity(csv(31), { last_updated: "2026-01-15T10:00:01Z" }) });
  assert.equal(message.hidden, true);
});

test("a reading is pushed only when new, stamped at receipt", () => {
  const card = make({ source: { kind: "spectrum", entity: "sensor.s" } });
  const pushes = [];
  const orig = card._engine.push.bind(card._engine);
  card._engine.push = (v, at) => { pushes.push([v, at]); orig(v, at); };
  const before = Date.now();
  const s = entity(csv(31), { last_updated: "2020-01-01T00:00:00Z" });
  card.hass = hassOf({ "sensor.s": s });
  assert.equal(pushes.length, 1);
  assert.ok(pushes[0][1] >= before, "browser clock, not the server's");
  // Same stamp in a new state object: no push.
  card.hass = hassOf({ "sensor.s": { ...s } });
  assert.equal(pushes.length, 1);
  card.hass = hassOf({ "sensor.s": { ...s, state: csv(31, 51), last_updated: "2020-01-01T00:00:01Z" } });
  assert.equal(pushes.length, 2);
  // Unavailable: NaN once per transition.
  card.hass = hassOf({ "sensor.s": entity("unavailable") });
  card.hass = hassOf({ "sensor.s": entity("unavailable", { last_updated: "2026-01-15T10:00:05Z" }) });
  assert.equal(pushes.length, 3);
  assert.equal(pushes[2][0].length, 31);
  assert.ok(pushes[2][0].every(Number.isNaN));
});

test("a scalar that does not change stays on screen (no timeout)", () => {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    const card = make({ source: { kind: "scalar", entity: "sensor.t" }, flavour: "tide", colour: { neutral: 21, hot: 28 } });
    card.hass = hassOf({ "sensor.t": entity("24.5") });
    document.body.appendChild(card);
    raf.flush(500);
    // Ten minutes without a state_changed: the frontend sends nothing for an unchanged value.
    for (let i = 0; i < 600; i++) { clock += 1000; raf.flush(16); }
    assert.equal(card._engine.frame.stale, false);
    assert.ok(Math.abs(card._engine.frame.smoothValue - 24.5) < 0.01, String(card._engine.frame.smoothValue));
    card.hass = hassOf({ "sensor.t": entity("unavailable", { last_updated: "2026-01-15T10:10:00Z" }) });
    raf.flush(16);
    assert.equal(card._engine.frame.stale, true);
  } finally {
    Date.now = realNow;
  }
});

test("the first draw, before any frame has run, has no NaN", () => {
  const card = make({ source: { kind: "spectrum", demo: true } });
  // Connected in a hidden tab: the loop does not start, connectedCallback measures and draws once.
  setVisibility("hidden");
  document.body.appendChild(card);
  assert.equal(raf.pending(), 0);
  const rec = card.shadowRoot.querySelector("canvas")._rec;
  assert.ok(rec && rec.calls.length > 0, "drawn on connect");
  for (const c of rec.calls) assert.ok(c.args.every(Number.isFinite), `${c.name} ${c.args}`);
});

test("the spectrum's aria label carries dB when the entity has no unit", () => {
  const card = make({ source: { kind: "spectrum", entity: "sensor.s" } });
  card.hass = hassOf({ "sensor.s": entity(csv(31, 50)) });
  document.body.appendChild(card);
  raf.flush(100);
  assert.match(card.shadowRoot.querySelector("canvas").getAttribute("aria-label"), / dB$/);
});

test("a console neutral above a later helper hot falls back to an ordered pair", () => {
  const states = (hot) => ({ "input_number.n": entity("40"), "input_number.h": entity(String(hot)) });
  const card = make({ source: { kind: "spectrum", demo: true }, controls: true,
    colour: { neutral: "input_number.n", hot: "input_number.h" } });
  card.hass = hassOf(states(80));
  document.body.appendChild(card);
  const neutral = card.shadowRoot.querySelector("#aw-neutral");
  neutral.value = "70";
  neutral.dispatchEvent(new window.Event("input"));
  assert.equal(card._resolved.colour.neutral, 70);
  card.hass = hassOf(states(60));
  const { neutral: n, hot: h } = card._resolved.colour;
  assert.ok(h > n, `neutral ${n}, hot ${h}`);
  assert.ok(card._palette.hot > card._palette.neutral);
});

test("loop stops when hidden and when disconnected", () => {
  const card = make(Card().getStubConfig());
  document.body.appendChild(card);
  raf.flush(100);
  assert.ok(raf.pending() > 0);
  setVisibility("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  raf.flush(16);
  assert.equal(raf.pending(), 0);
  setVisibility("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  assert.ok(raf.pending() > 0);
  intersect(false);
  raf.flush(16);
  assert.equal(raf.pending(), 0);
  intersect(true);
  assert.ok(raf.pending() > 0);
  card.remove();
  raf.flush(16);
  assert.equal(raf.pending(), 0);
});

test("active off settles to still and stops", () => {
  const card = make({ source: { kind: "spectrum", demo: true }, active: "binary_sensor.p" });
  card.hass = hassOf({ "binary_sensor.p": entity("off") });
  document.body.appendChild(card);
  raf.flush(3000);
  assert.equal(raf.pending(), 0);
  card.hass = hassOf({ "binary_sensor.p": entity("on") });
  assert.ok(raf.pending() > 0);
});

test("a resize while asleep redraws the cleared canvas", () => {
  // Capture the card's ResizeObserver callback; happy-dom has no layout to fire it.
  const RealRO = globalThis.ResizeObserver;
  let resized;
  globalThis.ResizeObserver = class { constructor(cb) { resized = cb; } observe() {} disconnect() {} };
  const widthGetter = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "clientWidth");
  const orig = FLAVOURS.still.draw;
  let draws = 0;
  FLAVOURS.still.draw = (...a) => { draws++; orig(...a); };
  try {
    const card = make({ source: { kind: "spectrum", demo: true }, active: "binary_sensor.p" });
    card.hass = hassOf({ "binary_sensor.p": entity("off") });
    document.body.appendChild(card);
    raf.flush(3000);
    assert.equal(raf.pending(), 0, "asleep");
    draws = 0;
    Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 500 });
    resized([]);
    assert.equal(card.shadowRoot.querySelector("canvas").width, Math.round(500 * (window.devicePixelRatio || 1)));
    assert.equal(draws, 1);
    assert.equal(raf.pending(), 0, "still asleep");
  } finally {
    FLAVOURS.still.draw = orig;
    Object.defineProperty(window.HTMLElement.prototype, "clientWidth", widthGetter);
    globalThis.ResizeObserver = RealRO;
  }
});

test("flavour registry: every flavour suits its kinds, still serves both", () => {
  assert.deepEqual(FLAVOURS.still.kinds.sort(), ["scalar", "spectrum"]);
  for (const [id, f] of Object.entries(FLAVOURS)) {
    assert.equal(f.id, id);
    assert.deepEqual([...f.kinds].sort(), [...FLAVOUR_KINDS[id]].sort());
    assert.equal(typeof f.draw, "function");
  }
  assert.equal(flavoursFor("spectrum")[0], "still");
  assert.ok(flavoursFor("spectrum").includes("swell") && !flavoursFor("spectrum").includes("tide"));
  assert.ok(flavoursFor("scalar").includes("tide") && flavoursFor("scalar").includes("bars"));
});

test("still draws the three classic waves in the neutral colour", async () => {
  const { makePalette } = await import(`${BASE}/lib/palette.js`);
  const { WAVES } = await import(`${BASE}/lib/geometry.js`);
  const palette = makePalette({ palette: "zones", neutral: 60, hot: 100 }, [3, 169, 244]);
  const ctx = recordingContext(400, 100);
  FLAVOURS.still.draw(ctx, 400, 100, 0, { palette }, {});
  assert.deepEqual(ctx.strokeStyles, [palette.css(60), palette.css(60), palette.css(60)]);
  // Wave 0 at x = 66 (near its quarter period), breathing 0.75 at t = 0: full amplitude 0.34·h.
  const p = ctx.calls.find((c) => c.name === "lineTo" && c.args[0] === 66);
  assert.ok(Math.abs(p.args[1] - (50 + 34 * Math.sin((66 / 260) * 2 * Math.PI) * 0.75)) < 0.01);
  assert.equal(ctx.calls.filter((c) => c.name === "moveTo").length, WAVES.length);
});

test("translations: every key in en exists in de and pl", () => {
  const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) =>
    (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  const en = keys(load("en"));
  for (const lang of ["de", "pl"]) {
    const other = new Set(keys(load(lang)));
    assert.deepEqual(en.filter((k) => !other.has(k)), [], lang);
  }
  assert.ok(!JSON.stringify(load("de")).includes("ß"));
});

// ---- Fallback to the classic wave ----------------------------------------------------------------
const NO_DATA = (lang) => load(lang).card.ambient_wave.fallback.no_data;
const icon = (card) => card.shadowRoot.querySelector("ha-icon.fallback-icon");
// One flush of 50 ms runs at least one frame at the 30 fps cap.
const recorder = (card) => card.shadowRoot.querySelector("canvas")._rec;
// The classic wave as the now-playing card draws it: --primary-color (here its default, happy-dom
// has no theme) and a line of max(1.5, h * 0.045) on the 120 px stage.
const CLASSIC = { colour: "#03a9f4", lineWidth: Math.max(1.5, 120 * 0.045) };
// Strokes recorded since `from`: [lineWidth, strokeStyle] per stroke.
const strokesSince = (rec, from) => rec.strokes.slice(from.strokes).map((s, i) => [s.lineWidth, rec.strokeStyles[from.styles + i]]);
const mark = (rec) => ({ strokes: rec.strokes.length, styles: rec.strokeStyles.length });
const isClassic = (strokes) => strokes.length > 0 && strokes.every(([w, c]) => w === CLASSIC.lineWidth && c === CLASSIC.colour);
const spectrumCard = (extra = {}) => make({ source: { kind: "spectrum", entity: "sensor.demo_spectrum" }, flavour: "swell", ...extra });

test("fallback classic: unknown source at start draws classic and shows the icon", () => {
  const card = spectrumCard({ fallback: "classic" });
  // An alias template whose board has not reported since Home Assistant started reads `unknown`.
  card.hass = hassOf({ "sensor.demo_spectrum": entity("unknown") });
  document.body.appendChild(card);
  raf.flush(100);
  const i = icon(card);
  assert.ok(i, "icon shown at once");
  assert.equal(i.getAttribute("icon"), "mdi:information-outline");
  assert.equal(i.getAttribute("title"), NO_DATA("en"));
  assert.equal(i.getAttribute("aria-label"), NO_DATA("en"));
  const rec = recorder(card);
  const from = mark(rec);
  raf.flush(32);
  assert.ok(isClassic(strokesSince(rec, from)), JSON.stringify(strokesSince(rec, from)));
});

test("fallback classic: a source missing from the states draws classic at once", () => {
  const card = spectrumCard({ fallback: "classic" });
  card.hass = hassOf({});
  document.body.appendChild(card);
  raf.flush(50);
  assert.ok(icon(card));
});

test("fallback classic: unavailable switches to classic", () => {
  const card = spectrumCard({ fallback: "classic" });
  card.hass = hassOf({ "sensor.demo_spectrum": entity(csv(31)) });
  document.body.appendChild(card);
  raf.flush(100);
  assert.equal(icon(card), null);
  card.hass = hassOf({ "sensor.demo_spectrum": entity("unavailable", { last_updated: "2026-01-15T10:00:05Z" }) });
  raf.flush(50);
  assert.ok(icon(card));
  const rec = recorder(card);
  const from = mark(rec);
  raf.flush(32);
  assert.ok(isClassic(strokesSince(rec, from)));
});

test("fallback classic: spectrum stale 5 s switches to classic", () => {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    const card = spectrumCard({ fallback: "classic" });
    card.hass = hassOf({ "sensor.demo_spectrum": entity(csv(31)) });
    document.body.appendChild(card);
    raf.flush(100);
    assert.equal(icon(card), null);
    clock += 4900;
    raf.flush(50);
    assert.equal(icon(card), null, "not yet: 4.9 s");
    clock += 200;
    raf.flush(50);
    assert.ok(icon(card), "5.1 s without a report");
    const rec = recorder(card);
    const from = mark(rec);
    raf.flush(32);
    assert.ok(isClassic(strokesSince(rec, from)));
  } finally {
    Date.now = realNow;
  }
});

test("fallback classic: data back removes the icon and draws live", () => {
  const orig = FLAVOURS.swell.draw;
  let live = 0;
  FLAVOURS.swell.draw = (...a) => { live++; orig(...a); };
  try {
    const card = spectrumCard({ fallback: "classic" });
    card.hass = hassOf({ "sensor.demo_spectrum": entity("unavailable") });
    document.body.appendChild(card);
    raf.flush(100);
    assert.ok(icon(card));
    assert.equal(live, 0, "the live flavour does not draw while falling back");
    // Same element, no new config: what a returning board looks like to the card.
    card.hass = hassOf({ "sensor.demo_spectrum": entity(csv(31, 60), { last_updated: "2026-01-15T10:00:09Z" }) });
    raf.flush(32);
    assert.equal(icon(card), null);
    assert.ok(live > 0, "the live flavour draws again");
  } finally {
    FLAVOURS.swell.draw = orig;
  }
});

test("fallback classic: a demo source never falls back", () => {
  const card = make({ source: { kind: "spectrum", demo: true }, fallback: "classic" });
  document.body.appendChild(card);
  raf.flush(300);
  assert.equal(icon(card), null);
});

test("fallback none: unavailable stays calm without icon", () => {
  const orig = FLAVOURS.swell.draw;
  let calm = 0;
  FLAVOURS.swell.draw = (...a) => { calm++; orig(...a); };
  try {
    for (const config of [{}, { fallback: "none" }]) {
      calm = 0;
      const card = spectrumCard(config);
      card.hass = hassOf({ "sensor.demo_spectrum": entity("unavailable") });
      document.body.appendChild(card);
      raf.flush(100);
      assert.equal(icon(card), null);
      // Without the fallback the configured flavour keeps drawing and calms at the fall speed.
      assert.ok(calm > 0, "the configured flavour draws");
      card.remove();
    }
  } finally {
    FLAVOURS.swell.draw = orig;
  }
});

test("icon text comes from i18n in en, de, pl", () => {
  const card = spectrumCard({ fallback: "classic" });
  document.body.appendChild(card);
  for (const lang of ["en", "de", "pl"]) {
    card.hass = hassOf({ "sensor.demo_spectrum": entity("unknown") }, lang);
    raf.flush(50);
    const text = NO_DATA(lang);
    assert.ok(text && !text.startsWith("card."), lang);
    assert.equal(icon(card).getAttribute("title"), text, lang);
    assert.equal(icon(card).getAttribute("aria-label"), text, lang);
  }
  assert.notEqual(NO_DATA("de"), NO_DATA("en"));
  assert.notEqual(NO_DATA("pl"), NO_DATA("en"));
});

test("the editor offers the fallback choice", () => {
  const fallback = Card().getConfigForm(hassOf({})).schema.find((s) => s.name === "fallback");
  assert.ok(fallback);
  assert.deepEqual(fallback.selector.select.options.map((o) => o.value), ["none", "classic"]);
});
