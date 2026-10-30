import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { raf, intersect } from "../testing/dom-env.mjs";
import { recordingContext } from "../testing/fake-ctx.mjs";

const BASE = "..";
await import(`${BASE}/ambient-wave-card.js`);
const { FLAVOURS } = await import(`${BASE}/lib/flavours/index.js`);

Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 120 });
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  this._rec ??= recordingContext(this.width, this.height);
  return this._rec;
};

const make = (config, hass) => {
  const card = document.createElement("ambient-wave-card");
  card.setConfig(config);
  if (hass) card.hass = hass;
  return card;
};
const hassOf = (states, extra = {}) => ({
  language: "en", locale: { language: "en" }, states, callService: () => { throw new Error("no service calls"); }, ...extra,
});
const entity = (state) => ({ state, attributes: {}, last_updated: "2026-01-15T10:00:00Z" });
const q = (card, sel) => card.shadowRoot.querySelector(sel);
const change = (node, value) => {
  if (typeof value === "boolean") node.checked = value; else node.value = value;
  node.dispatchEvent(new window.Event("input"));
  node.dispatchEvent(new window.Event("change"));
};

beforeEach(() => { intersect(true); });
afterEach(() => { document.body.innerHTML = ""; raf.flush(16); });

test("console changes the flavour for this card only", () => {
  const hass = hassOf({});
  let calls = 0;
  hass.callService = () => { calls++; };
  const draw = FLAVOURS.dune.draw;
  let dune = 0;
  FLAVOURS.dune.draw = function (...a) { dune++; return draw.apply(this, a); };
  try {
    const card = make({ source: { kind: "spectrum", demo: true }, flavour: "swell", controls: true }, hass);
    const other = make({ source: { kind: "spectrum", demo: true }, flavour: "swell" }, hass);
    document.body.append(card, other);
    raf.flush(100);
    assert.equal(dune, 0);
    change(q(card, "#aw-flavour"), "dune");
    raf.flush(100);
    assert.ok(dune > 0, "dune drew after the change");
    assert.equal(card._resolved.flavour, "dune");
    assert.equal(other._resolved.flavour, "swell");
    assert.equal(calls, 0, "no service call");
    // A later hass update keeps the session choice and the config is untouched.
    card.hass = hassOf({ "sensor.x": entity("1") });
    assert.equal(card._resolved.flavour, "dune");
    assert.equal(card._config.flavour, "swell");
  } finally {
    FLAVOURS.dune.draw = draw;
  }
});

test("console starts from entity-bound values", () => {
  const card = make(
    { source: { kind: "spectrum", demo: true }, colour: { hot: "input_number.h" }, controls: true },
    hassOf({ "input_number.h": entity("95") }),
  );
  document.body.appendChild(card);
  assert.equal(q(card, "#aw-hot").value, "95");
  assert.match(q(card, "label[for=aw-hot]").textContent, /95/);
});

test("controls false mounts nothing", () => {
  const card = make({ source: { kind: "spectrum", demo: true } });
  document.body.appendChild(card);
  assert.equal(q(card, ".console"), null);
  assert.equal(q(card, ".controls").hidden, true);
});

test("the console shows only what suits the kind and keeps hot above neutral", () => {
  const card = make({ source: { kind: "scalar", demo: true }, flavour: "tide", controls: true });
  document.body.appendChild(card);
  assert.equal(q(card, "#aw-tilt"), null);
  const options = [...q(card, "#aw-flavour").options].map((o) => o.value);
  assert.ok(options.includes("tide") && !options.includes("swell"));
  change(q(card, "#aw-neutral"), "50");
  assert.equal(card._resolved.colour.neutral, 50);
  assert.ok(Number(q(card, "#aw-hot").min) > 50);
});

test("setConfig resets the session, reconnecting keeps it", () => {
  const card = make({ source: { kind: "spectrum", demo: true }, controls: true });
  document.body.appendChild(card);
  change(q(card, "#aw-flavour"), "veil");
  card.remove();
  document.body.appendChild(card);
  assert.equal(card._resolved.flavour, "veil");
  assert.equal(q(card, "#aw-flavour").value, "veil");
  card.setConfig({ source: { kind: "spectrum", demo: true }, controls: true });
  assert.equal(card._resolved.flavour, "dune");
  assert.equal(q(card, "#aw-flavour").value, "dune");
  assert.equal(card.shadowRoot.querySelectorAll(".console").length, 1);
});

test("the monitor draws and the readout follows the frame", () => {
  const card = make({ source: { kind: "spectrum", demo: true }, controls: true });
  document.body.appendChild(card);
  raf.flush(1000);
  const canvas = q(card, ".monitor canvas");
  assert.ok(canvas._rec.calls.length > 0);
  assert.notEqual(q(card, "#aw-level").textContent, "–");
});

test("getGridOptions follows controls", () => {
  const plain = make({ source: { kind: "spectrum", demo: true } });
  assert.deepEqual(plain.getGridOptions(), { columns: 12, rows: 2, min_rows: 1 });
  const withConsole = make({ source: { kind: "spectrum", demo: true }, controls: true });
  assert.deepEqual(withConsole.getGridOptions(), { columns: 12, rows: "auto", min_rows: 2 });
});

test("console line width starts from the entity and strokes the canvas for this card", () => {
  const card = make(
    { source: { kind: "spectrum", demo: true }, flavour: "swell", style: { line_width: "input_number.lw" }, controls: true },
    hassOf({ "input_number.lw": entity("6") }),
  );
  document.body.appendChild(card);
  assert.equal(q(card, "#aw-line-width").value, "6");
  change(q(card, "#aw-line-width"), "9.5");
  raf.flush(16);
  const widths = q(card, "canvas")._rec.strokes.map((s) => s.lineWidth);
  assert.equal(widths.at(-1), 9.5);
});
