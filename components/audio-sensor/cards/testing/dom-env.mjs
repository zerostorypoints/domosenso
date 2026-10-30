// Registers a happy-dom window as the global DOM, so a card module can be imported and
// instantiated in `node --test`. Import this before the card.
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost/" });
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
