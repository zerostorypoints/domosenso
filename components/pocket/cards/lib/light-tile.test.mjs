import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import "./light-tile.js";
import { createOptimistic } from "./optimistic.js";
import { createT } from "./i18n.js";
import en from "../../translations/en.json" with { type: "json" };

const translate = createT({ en });
const t = (key, vars) => translate({ locale: { language: "en" } }, key, vars);

const light = (state, brightness, extra = {}) =>
  ({ state, attributes: { ...(brightness == null ? {} : { brightness }), ...extra } });

function hassOf(states) {
  const calls = [];
  return { calls, states, callService: (domain, service, data) => { calls.push([domain, service, data]); return Promise.resolve(); } };
}

function mount(hass, { entities = ["light.desk"], offline = false } = {}) {
  const tile = document.createElement("pocket-light-tile");
  tile.t = t;
  tile.config = { name: "Desk", entities };
  tile.offline = offline;
  tile.hass = hass;
  document.body.appendChild(tile);
  // happy-dom has no layout: the brightness strip is 200 px wide from x = 0.
  strip(tile).getBoundingClientRect = () => ({ left: 0, top: 80, width: 200, height: 44, right: 200, bottom: 124 });
  return tile;
}

const strip = (tile) => tile.shadowRoot.querySelector(".bar");
const body = (tile) => tile.shadowRoot.querySelector(".t1");
const pointer = (target, type, x, y) =>
  target.dispatchEvent(new window.PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, composed: true }));
const text = (tile) => [...tile.shadowRoot.querySelectorAll(".t1, .t2")].map((el) => el.textContent).join(" ").replace(/\s+/g, " ").trim();
const fill = (tile) => tile.shadowRoot.querySelector(".bar i").style.width;
const lit = (tile) => tile.shadowRoot.querySelector(".tile").classList.contains("on");
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
function drag(target, from, to, y = 100) {
  pointer(target, "pointerdown", from, y);
  pointer(target, "pointermove", (from + to) / 2, y);
  pointer(target, "pointermove", to, y);
  pointer(target, "pointerup", to, y);
}
const errorsOn = (node) => {
  const errors = [];
  node.addEventListener("pocket-error", (e) => errors.push(e.detail.key));
  return errors;
};

beforeEach(() => { document.body.innerHTML = ""; });

test("shows the name and the brightness of a light that is on", () => {
  const tile = mount(hassOf({ "light.desk": light("on", 171) }));
  assert.match(text(tile), /Desk/);
  assert.match(text(tile), /67 %/);
  assert.ok(lit(tile));
  assert.equal(fill(tile), "67%");
});

test("a tap switches the light: on when it shows off, off when it shows on", () => {
  const hass = hassOf({ "light.desk": light("off") });
  const tile = mount(hass);
  assert.match(text(tile), /Desk Off/);
  tile.click();
  hass.states = { "light.desk": light("on", 255) };
  tile.hass = { ...hass };
  tile.click();
  assert.deepEqual(hass.calls, [
    ["light", "turn_on", { entity_id: "light.desk" }],
    ["light", "turn_off", { entity_id: "light.desk" }],
  ]);
});

test("snappy: a tap shows the new state at once; Home Assistant's report confirms it", () => {
  const hass = hassOf({ "light.desk": light("off") });
  const tile = mount(hass);
  tile.click();
  assert.ok(lit(tile), "on before Home Assistant answers");
  assert.equal(tile.shadowRoot.querySelector(".main").getAttribute("aria-pressed"), "true");
  tile.hass = hassOf({ "light.desk": light("off") });       // an update that does not report it yet
  assert.ok(lit(tile));
  tile.hass = hassOf({ "light.desk": light("on", 128) });   // the report
  assert.ok(lit(tile));
  assert.equal(fill(tile), "50%");
  tile.hass = hassOf({ "light.desk": light("off") });       // a later change shows, nothing is held
  assert.ok(!lit(tile));
});

test("a drag along the strip sends one turn_on with the brightness of the position, on release", () => {
  const hass = hassOf({ "light.desk": light("on", 128) });
  const tile = mount(hass);
  pointer(strip(tile), "pointerdown", 40, 100);
  pointer(strip(tile), "pointermove", 70, 101);
  pointer(strip(tile), "pointermove", 100, 102);
  assert.deepEqual(hass.calls, [], "nothing is sent while dragging");
  assert.equal(fill(tile), "50%");
  pointer(strip(tile), "pointerup", 100, 102);
  tile.click();     // the click that follows the drag is not a toggle
  assert.deepEqual(hass.calls, [["light", "turn_on", { entity_id: "light.desk", brightness_pct: 50 }]]);
  assert.equal(fill(tile), "50%", "the sent brightness shows until Home Assistant reports it");
});

test("a tap on the strip sends the brightness of that point, not a toggle", () => {
  const hass = hassOf({ "light.desk": light("off") });
  const tile = mount(hass);
  pointer(strip(tile), "pointerdown", 150, 100);
  pointer(strip(tile), "pointerup", 150, 100);
  strip(tile).click();
  assert.deepEqual(hass.calls, [["light", "turn_on", { entity_id: "light.desk", brightness_pct: 75 }]]);
  assert.ok(lit(tile));
  assert.equal(fill(tile), "75%");
});

test("a sideways move on the tile's body is not the tile's: no brightness, no toggle, the event goes on", () => {
  const hass = hassOf({ "light.desk": light("on", 128) });
  const tile = mount(hass);
  const seen = [];
  document.body.addEventListener("pointerup", () => seen.push("up"));
  drag(body(tile), 180, 20, 40);
  tile.click();
  assert.deepEqual(hass.calls, []);
  assert.equal(fill(tile), "50%");
  assert.deepEqual(seen, ["up"], "the page gets the gesture");
});

test("a vertical move cancels, on the body and on the strip: no call", () => {
  const hass = hassOf({ "light.desk": light("on", 128) });
  const tile = mount(hass);
  for (const target of [body(tile), strip(tile)]) {
    pointer(target, "pointerdown", 40, 10);
    pointer(target, "pointermove", 42, 40);
    pointer(target, "pointermove", 70, 70);
    pointer(target, "pointerup", 70, 70);
    tile.click();
  }
  assert.deepEqual(hass.calls, []);
});

test("the strip is a slider a thumb can hold: 44 px tall, marked data-drag, labelled", () => {
  const tile = mount(hassOf({ "light.desk": light("on", 128) }));
  const bar = strip(tile);
  assert.equal(bar.getAttribute("role"), "slider");
  assert.ok(bar.hasAttribute("data-drag"), "the area swipe leaves it alone");
  assert.equal(bar.getAttribute("aria-label"), "Desk brightness");
  assert.equal(bar.getAttribute("aria-valuenow"), "50");
  const css = tile.shadowRoot.querySelector("style").textContent;
  assert.match(css, /\.bar \{[^}]*height: 44px/);
});

test("arrow keys on the strip step the brightness", () => {
  const hass = hassOf({ "light.desk": light("on", 128) });
  const tile = mount(hass);
  strip(tile).dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, composed: true }));
  assert.deepEqual(hass.calls, [["light", "turn_on", { entity_id: "light.desk", brightness_pct: 60 }]]);
});

test("a light without a dimmer has no strip", () => {
  const tile = mount(hassOf({ "light.desk": light("on", null, { supported_color_modes: ["onoff"] }) }));
  assert.ok(strip(tile).hidden);
  const dimmable = mount(hassOf({ "light.desk": light("on", 10, { supported_color_modes: ["brightness"] }) }));
  assert.ok(!strip(dimmable).hidden);
});

test("unavailable: muted, no call on click or drag", () => {
  const hass = hassOf({ "light.desk": light("unavailable") });
  const tile = mount(hass);
  assert.ok(tile.shadowRoot.querySelector(".tile").classList.contains("muted"));
  assert.match(text(tile), /—/);
  tile.click();
  drag(strip(tile), 40, 100);
  assert.deepEqual(hass.calls, []);
  assert.equal(strip(tile).getAttribute("aria-disabled"), "true");
});

test("a missing entity is unavailable too", () => {
  const hass = hassOf({});
  const tile = mount(hass);
  tile.click();
  assert.ok(tile.shadowRoot.querySelector(".tile").classList.contains("muted"));
  assert.deepEqual(hass.calls, []);
});

test("offline: no call", () => {
  const hass = hassOf({ "light.desk": light("off") });
  const tile = mount(hass, { offline: true });
  tile.click();
  drag(strip(tile), 40, 100);
  assert.deepEqual(hass.calls, []);
  assert.ok(tile.shadowRoot.querySelector("button").disabled);
});

test("a 600 ms press opens Home Assistant's more-info, without a toggle", async () => {
  const hass = hassOf({ "light.desk": light("on", 255) });
  const tile = mount(hass);
  const opened = [];
  document.body.addEventListener("hass-more-info", (e) => opened.push(e.detail.entityId));
  pointer(body(tile), "pointerdown", 40, 40);
  await tick(650);
  pointer(body(tile), "pointerup", 40, 40);
  tile.click();
  assert.deepEqual(opened, ["light.desk"]);
  assert.deepEqual(hass.calls, []);
});

test("several lights: on when any is on; a tap turns them all off, or all on", () => {
  const hass = hassOf({ "light.a": light("on", 255), "light.b": light("off") });
  const tile = mount(hass, { entities: ["light.a", "light.b"] });
  tile.click();
  hass.states = { "light.a": light("off"), "light.b": light("off") };
  tile.hass = { ...hass };
  tile.click();
  assert.deepEqual(hass.calls, [
    ["light", "turn_off", { entity_id: ["light.a", "light.b"] }],
    ["light", "turn_on", { entity_id: ["light.a", "light.b"] }],
  ]);
});

test("a hass update patches the tile, it does not rebuild it", () => {
  const hass = hassOf({ "light.desk": light("on", 255) });
  const tile = mount(hass);
  const button = tile.shadowRoot.querySelector("button");
  tile.hass = hassOf({ "light.desk": light("off") });
  assert.equal(tile.shadowRoot.querySelector("button"), button);
  assert.ok(!lit(tile));
});

test("a rejected call rolls back at once and fires pocket-error with a key", async () => {
  const hass = hassOf({ "light.desk": light("on", 255) });
  hass.callService = () => Promise.reject(new Error("no"));
  const tile = mount(hass);
  const errors = errorsOn(document.body);
  drag(strip(tile), 180, 100);
  assert.equal(fill(tile), "50%");
  await tick();
  assert.equal(fill(tile), "100%", "back on the last known state");
  assert.deepEqual(errors, ["card.pocket.error.light"]);
});

test("a failed toggle rolls back and fires pocket-error too", async () => {
  const hass = hassOf({ "light.desk": light("off") });
  hass.callService = () => { throw new Error("sync"); };
  const tile = mount(hass);
  const errors = errorsOn(document.body);
  tile.click();
  await tick();
  assert.deepEqual(errors, ["card.pocket.error.light"]);
  assert.ok(!lit(tile));
});

test("a sent brightness that never comes back rolls back after confirmMs, with the toast", async () => {
  const hass = hassOf({ "light.desk": light("on", 255) });
  const tile = mount(hass);
  const errors = errorsOn(document.body);
  tile.confirmMs = 30;
  drag(strip(tile), 180, 100);
  tile.hass = { ...hass, states: { ...hass.states } };     // an update that does not report it
  assert.equal(fill(tile), "50%");
  await tick(50);
  assert.equal(fill(tile), "100%");
  assert.deepEqual(errors, ["card.pocket.error.light"]);
});

test("the sent brightness goes as soon as the real one matches it", () => {
  const hass = hassOf({ "light.desk": light("on", 255) });
  const tile = mount(hass);
  drag(strip(tile), 180, 100);
  tile.hass = hassOf({ "light.desk": light("on", 128) });
  assert.equal(fill(tile), "50%");
  tile.hass = hassOf({ "light.desk": light("on", 255) });   // a later change shows, nothing is held
  assert.equal(fill(tile), "100%");
});

test("a click that does not follow the gesture is not swallowed (keyboard Enter)", async () => {
  const hass = hassOf({ "light.desk": light("on", 128) });
  const tile = mount(hass);
  pointer(body(tile), "pointerdown", 40, 10);
  pointer(body(tile), "pointermove", 42, 40);   // a scroll: the click that may follow is dropped
  pointer(body(tile), "pointerup", 42, 40);
  await tick(350);
  tile.click();
  assert.equal(hass.calls.length, 1, "the later click switches");
});

test("a group that is off with a brightness attribute: off, no percent, unlit, empty bar", () => {
  const tile = mount(hassOf({ "light.group": light("off", 107) }), { entities: ["light.group"] });
  assert.equal(text(tile), "Desk Off");
  assert.doesNotMatch(text(tile), /%/);
  assert.ok(!lit(tile), "the icon is not lit");
  assert.equal(tile.shadowRoot.querySelector(".main").getAttribute("aria-pressed"), "false");
  assert.equal(fill(tile), "0%");
});

test("a group that takes the brightness and stays off: shown on until the wait ends, then off with the toast", async () => {
  const hass = hassOf({ "light.group": light("off") });
  const tile = mount(hass, { entities: ["light.group"] });
  const errors = errorsOn(document.body);
  tile.confirmMs = 30;
  drag(strip(tile), 0, 84);
  assert.equal(fill(tile), "42%");
  // Home Assistant takes the brightness (42 % = 107) and the group stays off.
  tile.hass = hassOf({ "light.group": light("off", 107) });
  assert.equal(fill(tile), "42%", "still the state before the call: it may yet come on");
  await tick(50);
  assert.equal(text(tile), "Desk Off");
  assert.ok(!lit(tile));
  assert.equal(fill(tile), "0%");
  assert.deepEqual(errors, ["card.pocket.error.light"]);
});

test("a shared store: the tile sends through the page's, which redraws the page", () => {
  const store = createOptimistic();
  let redraws = 0;
  store.onChange = () => { redraws += 1; };
  const hass = hassOf({ "light.desk": light("off") });
  const tile = mount(hass);
  tile.optimistic = store;
  tile.click();
  assert.equal(redraws, 1);
  assert.ok(store.pending("light.desk"));
  tile.hass = store.view(hass);      // the page passes the store's view
  assert.ok(lit(tile));
});
