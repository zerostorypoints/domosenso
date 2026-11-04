// Registers a happy-dom window as the global DOM, so a card module can be imported and
// instantiated in `node --test`. Import this before the card.
import { Window } from "happy-dom";
import { guardAsserts } from "../../../../tools/testing/dom-guard.mjs";

const window = new Window({ url: "http://localhost/" });
guardAsserts(window);     // tools/testing/dom-guard.mjs: failing asserts never print a node in full
for (const name of ["window", "document", "customElements", "HTMLElement", "Event", "ResizeObserver", "getComputedStyle"]) {
  globalThis[name] = name === "window" ? window : window[name];
}
// Bound so `getComputedStyle(el)` works as a bare call.
globalThis.getComputedStyle = window.getComputedStyle.bind(window);

// Visible text of a card's shadow root.
export const shadowText = (card) => card.shadowRoot.textContent.replace(/\s+/g, " ").trim();
