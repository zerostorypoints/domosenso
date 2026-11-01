// Registers a happy-dom window as the global DOM, so a card module can be imported and
// instantiated in `node --test`. Import this before the card.
import assertLoose from "node:assert";
import assertStrict from "node:assert/strict";
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost/" });
// A failing assert prints its operands in full, and a happy-dom node printed in full walks the whole
// window: gigabytes within a second, past any heap limit, and a runner killed on timeout leaves that
// process growing (it froze a Mac on 2026-11-01). The asserts the tests use compare a node by
// identity and name it `<tag>` when they fail; util.inspect prints it the same way.
const BRIEF = Symbol.for("nodejs.util.inspect.custom");
window.Node.prototype[BRIEF] = function brief() {
  return `<${String(this.nodeName).toLowerCase()}>`;
};
Object.defineProperty(window, BRIEF, { value: () => "[happy-dom Window]" });
const isDom = (v) => v === window || v instanceof window.Node;
const ids = new WeakMap();
let lastId = 0;
const token = (v) => {
  if (v === window) return "[happy-dom Window]";
  if (!ids.has(v)) ids.set(v, `<${String(v.nodeName).toLowerCase()} #${++lastId}>`);
  return ids.get(v);
};
// Arrays and plain objects with every node replaced by its token: the same node, the same token.
const tokens = (v, depth = 0) => {
  if (isDom(v)) return token(v);
  if (depth > 6 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => tokens(x, depth + 1));
  if (Object.getPrototypeOf(v) !== Object.prototype) return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tokens(x, depth + 1)]));
};
for (const mod of [assertLoose, assertStrict]) {
  for (const name of ["equal", "strictEqual", "notEqual", "notStrictEqual", "deepEqual", "deepStrictEqual",
    "notDeepEqual", "notDeepStrictEqual"]) {
    const original = mod[name];
    // Identity asserts swap only a node itself: a rebuilt array would never be the same array.
    const swap = /deep/i.test(name) ? tokens : (v) => (isDom(v) ? token(v) : v);
    // The message only when given: node's assert refuses an explicit undefined one.
    mod[name] = function guarded(actual, expected, ...message) {
      return original.call(this, swap(actual), swap(expected), ...message);
    };
  }
}
for (const name of ["window", "document", "customElements", "HTMLElement", "Event", "ResizeObserver", "getComputedStyle"]) {
  globalThis[name] = name === "window" ? window : window[name];
}
// Bound so `getComputedStyle(el)` works as a bare call.
globalThis.getComputedStyle = window.getComputedStyle.bind(window);

// Visible text of a card's shadow root.
export const shadowText = (card) => card.shadowRoot.textContent.replace(/\s+/g, " ").trim();

// Fake animation clock: tests drive frames by hand, so nothing depends on wall time.
const STEP = 16;
let now = 0;
let nextId = 1;
const queue = new Map();

globalThis.requestAnimationFrame = (cb) => {
  const id = nextId++;
  queue.set(id, cb);
  return id;
};
globalThis.cancelAnimationFrame = (id) => { queue.delete(id); };
window.requestAnimationFrame = globalThis.requestAnimationFrame;
window.cancelAnimationFrame = globalThis.cancelAnimationFrame;

export const raf = {
  // Runs queued callbacks in 16 ms steps up to `ms`; callbacks queued while flushing run in the next step.
  flush(ms = STEP) {
    for (let t = 0; t < ms; t += STEP) {
      now += STEP;
      const batch = [...queue.values()];
      queue.clear();
      for (const cb of batch) cb(now);
    }
  },
  pending: () => queue.size,
};

// Visible by default so cards start drawing; a test calls `intersect(false)` to hide them.
const observers = new Set();
class FakeIntersectionObserver {
  constructor(cb) { this.cb = cb; this.targets = new Set(); observers.add(this); }
  observe(target) { this.targets.add(target); this.cb([{ target, isIntersecting: true }], this); }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); observers.delete(this); }
}
globalThis.IntersectionObserver = FakeIntersectionObserver;
window.IntersectionObserver = FakeIntersectionObserver;

export const intersect = (isIntersecting) => {
  for (const o of observers) {
    o.cb([...o.targets].map((target) => ({ target, isIntersecting })), o);
  }
};
