import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import "./corner-taps-card.js";

afterEach(() => {
  mock.timers.reset();
  const page = window.__cornerTapsPage;
  if (page) {
    for (const el of page.els) el.remove();
    page.card && page.card._lowerShield();
  }
  for (const el of [...document.body.children]) el.remove();
  delete window.__cornerTapsPage;
  delete window.__cornerTapsReloadSeen;
});

const MODE = "input_select.ramka_mode";

function makeCard(config, state = "ambient", extra = {}) {
  const card = document.createElement("corner-taps-card");
  card.setConfig(config);
  const calls = [];
  const hass = { states: { [MODE]: { state }, ...extra }, callService: (domain, service, data) => calls.push([domain, service, data]) };
  card.hass = hass;
  return { card, calls, hass };
}

const fire = (type, props = {}) => {
  const ev = new window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, props);
  document.dispatchEvent(ev);
};
const swipe = (dy, dx = 0) => {
  fire("touchstart", { changedTouches: [{ clientX: 300, clientY: 400 }] });
  fire("touchend", { changedTouches: [{ clientX: 300 + dx, clientY: 400 + dy }] });
};

const TAP = { entity: MODE, states: ["ambient", "controls"], script: "script.ramka_show_controls" };

test("a corner target exists per configured side, sized by `size`, and the card hides itself", () => {
  const { card } = makeCard({ left: "/lovelace/0", right: "/dashboard-ramka/ramka?disable_km", size: 60 });
  assert.equal(window.__cornerTapsPage.els.length, 2);
  assert.equal(document.body.children.length, 2);
  const [left, right] = window.__cornerTapsPage.els;
  assert.equal(left.style.left, "0px");
  assert.equal(right.style.right, "0px");
  assert.equal(left.style.width, "60px");
  card.connectedCallback();
  assert.equal(card.hidden, true);
  assert.deepEqual(card.getGridOptions(), { columns: "full", rows: 1 });
});

test("only the configured sides get a target; the default size is 72 px", () => {
  makeCard({ left: "/lovelace/0" });
  assert.equal(window.__cornerTapsPage.els.length, 1);
  assert.equal(window.__cornerTapsPage.els[0].style.width, "72px");
});

test("a tap runs the script while the entity is in one of the listed states", () => {
  const { calls } = makeCard({ tap: TAP });
  fire("click");
  assert.deepEqual(calls, [["script", "ramka_show_controls", {}]]);
});

test("a tap on an element that keeps its own taps (data-own-tap) runs nothing, even inside a shadow root", () => {
  const { calls } = makeCard({ tap: TAP });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = '<div class="layers"><button data-own-tap><span>Light</span></button></div><p>plan</p>';
  root.querySelector("span").dispatchEvent(new window.Event("click", { bubbles: true, composed: true, cancelable: true }));
  assert.deepEqual(calls, [], "the chip's tap is the chip's");
  root.querySelector("p").dispatchEvent(new window.Event("click", { bubbles: true, composed: true, cancelable: true }));
  assert.deepEqual(calls, [["script", "ramka_show_controls", {}]], "anywhere else still goes back");
});

test("a tap does nothing while the entity is in another state", () => {
  const { calls } = makeCard({ tap: TAP }, "other");
  fire("click");
  assert.deepEqual(calls, []);
});

test("one listener per page: a second instance does not make a tap run twice", () => {
  const first = makeCard({ tap: TAP });
  const second = makeCard({ tap: TAP });
  fire("click");
  assert.equal(first.calls.length + second.calls.length, 1);
  assert.equal(second.calls.length, 1, "the instance fed hass last handles it");
});

test("taps are limited to one per second", () => {
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const { calls } = makeCard({ tap: TAP });
  fire("click");
  mock.timers.tick(500);
  fire("click");
  assert.equal(calls.length, 1);
  mock.timers.tick(600);
  fire("click");
  assert.equal(calls.length, 2);
});

test("a vertical swipe runs the rule's up or down script; short or horizontal ones do not", () => {
  const rule = { conditions: [{ entity: MODE, states: ["controls"] }], up: "script.ramka_up", down: "script.ramka_down" };
  const { calls } = makeCard({ swipe: rule }, "controls");
  swipe(-120);
  assert.deepEqual(calls.pop(), ["script", "ramka_up", {}]);
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 5000 });
  swipe(120);
  assert.deepEqual(calls.pop(), ["script", "ramka_down", {}]);
  mock.timers.tick(5000);
  swipe(-40);
  swipe(-100, 100);
  assert.deepEqual(calls, []);
});

test("a horizontal swipe runs the rule's left or right script; diagonal or rule-less ones nothing", () => {
  const rule = { conditions: [{ entity: MODE, states: ["ambient"] }], up: "script.ramka_up", left: "script.ramka_next", right: "script.ramka_prev" };
  const { calls } = makeCard({ swipe: rule });
  swipe(10, -150);
  assert.deepEqual(calls.pop(), ["script", "ramka_next", {}]);
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 5000 });
  swipe(-20, 150);
  assert.deepEqual(calls.pop(), ["script", "ramka_prev", {}]);
  mock.timers.tick(5000);
  swipe(-90, 100);   // neither 1.5 times more across than along
  swipe(0, 60);      // too short
  assert.deepEqual(calls, []);
  const { calls: none } = makeCard({ swipe: { conditions: [{ entity: MODE, states: ["ambient"] }], up: "script.ramka_up" } });
  mock.timers.tick(5000);
  swipe(0, -150);
  assert.deepEqual(none, []);
});

const PAUSED = "input_boolean.ramka_paused";
const PAUSE = { entity: PAUSED, conditions: [{ entity: MODE, states: ["ambient"] }], pause: "script.ramka_pause", resume: "script.ramka_resume" };

test("the pause corner sits bottom right while its conditions hold, and its play button only while paused", () => {
  const { card, hass } = makeCard({ pause: PAUSE, size: 60 }, "ambient", { [PAUSED]: { state: "off" } });
  const el = window.__cornerTapsPage.pause;
  assert.equal(el.style.bottom, "0px");
  assert.equal(el.style.right, "0px");
  assert.equal(el.style.width, "60px");
  assert.equal(el.style.display, "flex");
  assert.equal(el.firstElementChild.style.visibility, "hidden");
  card.hass = { ...hass, states: { ...hass.states, [PAUSED]: { state: "on" } } };
  assert.equal(el.firstElementChild.style.visibility, "visible");
  card.hass = { ...hass, states: { [MODE]: { state: "controls" }, [PAUSED]: { state: "on" } } };
  assert.equal(el.style.display, "none");
});

test("a tap on the pause corner pauses, or resumes while paused, and never opens the controls", () => {
  const { card, calls, hass } = makeCard({ pause: PAUSE, tap: TAP }, "ambient", { [PAUSED]: { state: "off" } });
  const el = window.__cornerTapsPage.pause;
  el.click();
  assert.deepEqual(calls, [["script", "ramka_pause", {}]]);
  card.hass = { ...hass, states: { ...hass.states, [PAUSED]: { state: "on" } } };
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 5000 });
  el.firstElementChild.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.deepEqual(calls, [["script", "ramka_pause", {}], ["script", "ramka_resume", {}]]);
});

test("the first swipe rule whose conditions hold wins", () => {
  const rules = [
    { conditions: [{ entity: MODE, states: ["controls"] }], up: "script.ramka_a" },
    { conditions: [{ entity: MODE, states: ["ambient"] }], up: "script.ramka_b" },
  ];
  const { calls } = makeCard({ swipe: rules }, "ambient");
  swipe(-120);
  assert.deepEqual(calls, [["script", "ramka_b", {}]]);
});

test("a tap that opens the controls raises a shield, lifted shield_ms after the entity reaches `shows`", () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  const { card, hass } = makeCard({ tap: { ...TAP, shows: "controls", shield_ms: 700 } });
  fire("click");
  assert.equal(document.body.children.length, 1, "shield raised");
  hass.states[MODE] = { state: "controls" };
  card.hass = { ...hass };
  mock.timers.tick(699);
  assert.equal(document.body.children.length, 1);
  mock.timers.tick(2);
  assert.equal(document.body.children.length, 0, "shield lifted");
});

test("the shield lifts by itself after 3 s if the entity never reaches `shows`", () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  makeCard({ tap: { ...TAP, shows: "controls" } });
  fire("click");
  assert.equal(document.body.children.length, 1);
  mock.timers.tick(3001);
  assert.equal(document.body.children.length, 0);
});

test("the reload button reloads only on a change after the page's baseline state", () => {
  const reloads = [];
  window.location.reload = () => reloads.push(1);
  // The state when the page loads is the baseline.
  const { card, hass } = makeCard({ reload: "input_button.ramka_reload" }, "ambient",
    { "input_button.ramka_reload": { state: "2026-10-20T10:00:00" } });
  card.hass = { ...hass };
  assert.equal(reloads.length, 0);
  hass.states["input_button.ramka_reload"] = { state: "unavailable" };
  card.hass = { ...hass };
  assert.equal(reloads.length, 0);
  hass.states["input_button.ramka_reload"] = { state: "2026-10-20T10:05:00" };
  card.hass = { ...hass };
  assert.equal(reloads.length, 1);
});
