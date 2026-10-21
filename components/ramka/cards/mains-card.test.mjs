import { test } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { shadowText } from "./testing/dom-env.mjs";
import "./mains-card.js";

const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

const sensor = (state) => ({ state, attributes: {} });

// The voltage history comes from the REST API; a short series is enough to draw the range labels.
function makeCard({ lang = "pl", states, series = [] }) {
  const card = document.createElement("mains-card");
  card.setConfig({ power: "sensor.p", voltage: "sensor.v" });
  card.hass = { locale: { language: lang }, states, callApi: async () => [series] };
  return card;
}

test("power and voltage are rounded with their units", () => {
  const card = makeCard({ states: { "sensor.p": sensor("123.6"), "sensor.v": sensor("229.7") } });
  assert.equal(card.shadowRoot.querySelector(".power").textContent, "124W");
  assert.equal(card.shadowRoot.querySelector(".voltage").textContent, "230V");
});

test("a missing reading shows the common no-value dash in every language", () => {
  for (const lang of ["en", "de", "pl"]) {
    const card = makeCard({ lang, states: {} });
    assert.equal(card.shadowRoot.querySelector(".power").textContent, "–", lang);
    assert.equal(card.shadowRoot.querySelector(".voltage").textContent, "–", lang);
  }
});

test("the range tooltips come from the dictionary", async () => {
  // happy-dom has no canvas: give the drawing code a context that swallows every call.
  const ctx = new Proxy({ fillStyle: "#03a9f4" }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const proto = window.HTMLCanvasElement.prototype;
  const realGetContext = proto.getContext;
  proto.getContext = () => ctx;
  try {
    const now = Date.now();
    const series = [{ last_changed: new Date(now - 3000000).toISOString(), state: "230.04" }, { last_changed: new Date(now - 1000000).toISOString(), state: "230.04" }];
    const card = makeCard({ lang: "en", states: {}, series });
    const canvas = card.shadowRoot.querySelector("canvas");
    Object.defineProperty(canvas, "clientWidth", { value: 300 });
    Object.defineProperty(canvas, "clientHeight", { value: 100 });
    await card._fetch();
    assert.equal(card.shadowRoot.querySelector(".range.max").title, "max 230.0 V");
    assert.equal(card.shadowRoot.querySelector(".range.min").title, "min 230.0 V");
    assert.equal(card.shadowRoot.querySelector(".range.max").textContent, "232 V");
  } finally {
    proto.getContext = realGetContext;
  }
});

test("in English no Polish letter reaches the page", () => {
  assert.doesNotMatch(shadowText(makeCard({ lang: "en", states: {} })), POLISH);
});
