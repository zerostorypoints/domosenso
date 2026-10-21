import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import "./tap-button-card.js";

afterEach(() => mock.timers.reset());

function makeCard({ lang = "pl", config = {} } = {}) {
  mock.timers.reset();
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  const card = document.createElement("tap-button-card");
  card.setConfig({ action: "cover.open_cover", target: { entity_id: "cover.awning" }, name: "Open", ...config });
  const calls = [];
  card.hass = { locale: { language: lang }, callService: (...args) => calls.push(args) };
  return { card, calls };
}

const nameText = (card) => card.shadowRoot.querySelector(".name").textContent;
const tap = (card) => card.shadowRoot.querySelector("ha-card").dispatchEvent(new window.Event("click"));

test("a lone tap shows the hint: Tap twice / Zweimal tippen / Dotknij dwa razy", () => {
  for (const [lang, hint] of [["en", "Tap twice"], ["de", "Zweimal tippen"], ["pl", "Dotknij dwa razy"]]) {
    const { card, calls } = makeCard({ lang });
    tap(card);
    mock.timers.tick(450);
    assert.equal(nameText(card), hint, lang);
    assert.equal(calls.length, 0, lang);
    mock.timers.tick(1500);
    assert.equal(nameText(card), "Open", `${lang}: the name comes back`);
  }
});

test("a configured hint wins over the default", () => {
  const { card } = makeCard({ lang: "en", config: { hint: "Again" } });
  tap(card);
  mock.timers.tick(450);
  assert.equal(nameText(card), "Again");
});

test("the hint follows the language of the moment, not of setConfig", () => {
  const { card } = makeCard({ lang: "en" });
  card.hass = { locale: { language: "de" }, callService: () => {} };
  tap(card);
  mock.timers.tick(450);
  assert.equal(nameText(card), "Zweimal tippen");
});

test("a double tap calls the service; taps: 1 calls on a single tap", () => {
  const two = makeCard({ lang: "en" });
  tap(two.card);
  mock.timers.tick(100);
  tap(two.card);
  assert.deepEqual(two.calls, [["cover", "open_cover", {}, { entity_id: "cover.awning" }]]);
  const one = makeCard({ lang: "en", config: { taps: 1 } });
  tap(one.card);
  assert.equal(one.calls.length, 1);
});

test("the 2× badge shows on double-tap buttons only", () => {
  assert.ok(makeCard().card.shadowRoot.querySelector(".badge"));
  assert.equal(makeCard({ config: { taps: 1 } }).card.shadowRoot.querySelector(".badge"), null);
});
