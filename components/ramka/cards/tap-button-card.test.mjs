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

// The Ramka's way out (0.13.0): a tap goes to one page, a long press to another, each a full load
// inside the WebView (pushState, then reload).
function navCard(config) {
  const { card, calls } = makeCard({ lang: "en", config: { action: undefined, navigate: "/lovelace/0", hold_navigate: "/dashboard-ramka/ramka?disable_km", taps: 1, ...config } });
  const went = [];
  window.history.pushState = (_s, _t, url) => went.push(url);
  window.location.reload = () => went.push("reload");
  return { card, calls, went };
}
const press = (card, type) => card.shadowRoot.querySelector("ha-card").dispatchEvent(new window.Event(type));

test("navigate: a tap loads that page and calls no service", () => {
  const { card, calls, went } = navCard({});
  tap(card);
  assert.deepEqual(went, ["/lovelace/0", "reload"]);
  assert.equal(calls.length, 0);
});

test("hold_navigate: a press held 600 ms loads the other page; the click that ends it does nothing more", () => {
  const { card, went } = navCard({});
  press(card, "pointerdown");
  mock.timers.tick(650);
  assert.deepEqual(went, ["/dashboard-ramka/ramka?disable_km", "reload"]);
  press(card, "pointerup");
  tap(card);
  assert.equal(went.length, 2, "the tap after a long press is swallowed");
});

test("a press let go early is a tap; a cancelled press does nothing", () => {
  const early = navCard({});
  press(early.card, "pointerdown");
  mock.timers.tick(200);
  press(early.card, "pointerup");
  tap(early.card);
  assert.deepEqual(early.went, ["/lovelace/0", "reload"]);
  const cancelled = navCard({});
  press(cancelled.card, "pointerdown");
  press(cancelled.card, "pointercancel");
  mock.timers.tick(700);
  assert.deepEqual(cancelled.went, []);
});

test("a button needs an action or a page to go to", () => {
  const card = document.createElement("tap-button-card");
  assert.throws(() => card.setConfig({ name: "x" }), /action or navigate/);
});
