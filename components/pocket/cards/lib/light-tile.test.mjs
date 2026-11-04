import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import "./light-tile.js";
import { createT } from "./i18n.js";
import en from "../../translations/en.json" with { type: "json" };

const translate = createT({ en });
const t = (key, vars) => translate({ locale: { language: "en" } }, key, vars);

const light = (state, brightness) => ({ state, attributes: brightness == null ? {} : { brightness } });

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
  // happy-dom has no layout: the tile is 200 px wide from x = 0.
  tile.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 80, right: 200, bottom: 80 });
  return tile;
}

const pointer = (tile, type, x, y) =>
  tile.dispatchEvent(new window.PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, composed: true }));
const text = (tile) => [...tile.shadowRoot.querySelectorAll(".t1, .t2")].map((el) => el.textContent).join(" ").replace(/\s+/g, " ").trim();

beforeEach(() => { document.body.innerHTML = ""; });

test("shows the name and the brightness of a light that is on", () => {
  const tile = mount(hassOf({ "light.desk": light("on", 171) }));
  assert.match(text(tile), /Desk/);
  assert.match(text(tile), /67 %/);
  assert.ok(tile.shadowRoot.querySelector(".tile").classList.contains("on"));
  assert.equal(tile.shadowRoot.querySelector(".bar i").style.width, "67%");
});

test("a click toggles the light; off reads Off", () => {
  const hass = hassOf({ "light.desk": light("off") });
  const tile = mount(hass);
  assert.match(text(tile), /Desk Off/);
  tile.click();
  assert.deepEqual(hass.calls, [["light", "toggle", { entity_id: "light.desk" }]]);
});

test("a 60 px horizontal drag sends one turn_on with the brightness of the position, on release", () => {
  const hass = hassOf({ "light.desk": light("on", 128) });
  const tile = mount(hass);
  pointer(tile, "pointerdown", 40, 40);
  pointer(tile, "pointermove", 70, 41);
  pointer(tile, "pointermove", 100, 42);
  assert.deepEqual(hass.calls, [], "nothing is sent while dragging");
  assert.equal(tile.shadowRoot.querySelector(".bar i").style.width, "50%");
  pointer(tile, "pointerup", 100, 42);
  tile.click();     // the click that follows the drag is not a toggle
  assert.deepEqual(hass.calls, [["light", "turn_on", { entity_id: "light.desk", brightness_pct: 50 }]]);
});

test("a 60 px vertical move cancels: no call", () => {
  const hass = hassOf({ "light.desk": light("on", 128) });
  const tile = mount(hass);
  pointer(tile, "pointerdown", 40, 10);
  pointer(tile, "pointermove", 42, 40);
  pointer(tile, "pointermove", 70, 70);
  pointer(tile, "pointerup", 70, 70);
  tile.click();
  assert.deepEqual(hass.calls, []);
});

test("unavailable: muted, no call on click or drag", () => {
  const hass = hassOf({ "light.desk": light("unavailable") });
  const tile = mount(hass);
  assert.ok(tile.shadowRoot.querySelector(".tile").classList.contains("muted"));
  assert.match(text(tile), /—/);
  tile.click();
  pointer(tile, "pointerdown", 40, 40);
  pointer(tile, "pointermove", 100, 40);
  pointer(tile, "pointerup", 100, 40);
  assert.deepEqual(hass.calls, []);
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
  assert.deepEqual(hass.calls, []);
  assert.ok(tile.shadowRoot.querySelector("button").disabled);
});

test("a 600 ms press opens Home Assistant's more-info, without a toggle", async () => {
  const hass = hassOf({ "light.desk": light("on", 255) });
  const tile = mount(hass);
  const opened = [];
  document.body.addEventListener("hass-more-info", (e) => opened.push(e.detail.entityId));
  pointer(tile, "pointerdown", 40, 40);
  await new Promise((r) => setTimeout(r, 650));
  pointer(tile, "pointerup", 40, 40);
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
  assert.ok(!tile.shadowRoot.querySelector(".tile").classList.contains("on"));
});

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const fill = (tile) => tile.shadowRoot.querySelector(".bar i").style.width;
function drag(tile, from, to) {
  pointer(tile, "pointerdown", from, 40);
  pointer(tile, "pointermove", to, 40);
  pointer(tile, "pointerup", to, 40);
}

test("a rejected call drops the preview at once and fires pocket-error with a key", async () => {
  const hass = hassOf({ "light.desk": light("on", 255) });
  hass.callService = () => Promise.reject(new Error("no"));
  const tile = mount(hass);
  const errors = [];
  document.body.addEventListener("pocket-error", (e) => errors.push(e.detail.key));
  drag(tile, 180, 100);
  assert.equal(fill(tile), "50%");
  await tick();
  assert.equal(fill(tile), "100%", "back on the last known state");
  assert.deepEqual(errors, ["card.pocket.error.light"]);
});

test("a failed toggle fires pocket-error too", async () => {
  const hass = hassOf({ "light.desk": light("off") });
  hass.callService = () => { throw new Error("sync"); };
  const tile = mount(hass);
  const errors = [];
  document.body.addEventListener("pocket-error", (e) => errors.push(e.detail.key));
  tile.click();
  await tick();
  assert.deepEqual(errors, ["card.pocket.error.light"]);
  assert.ok(!tile.shadowRoot.querySelector(".tile").classList.contains("on"));
});

test("a sent brightness that never comes back is dropped after confirmMs", async () => {
  const hass = hassOf({ "light.desk": light("on", 255) });
  const tile = mount(hass);
  tile.confirmMs = 30;
  drag(tile, 180, 100);
  tile.hass = { ...hass, states: { ...hass.states } };     // an update that does not report it
  assert.equal(fill(tile), "50%");
  await tick(50);
  assert.equal(fill(tile), "100%");
});

test("the preview goes as soon as the real brightness matches it", () => {
  const hass = hassOf({ "light.desk": light("on", 255) });
  const tile = mount(hass);
  drag(tile, 180, 100);
  tile.hass = hassOf({ "light.desk": light("on", 128) });
  assert.equal(fill(tile), "50%");
  tile.hass = hassOf({ "light.desk": light("on", 255) });   // a later change shows, nothing is held
  assert.equal(fill(tile), "100%");
});
