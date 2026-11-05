// The area page's All sensors (lib/sensor-list.js) and its part of the floor plan (lib/area-plan.js,
// the floorplan component's own card).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as room from "./area-page.js";
import { config, baseStates, hassOf, ctxOf, text, texts } from "../testing/demo-home.mjs";
import { planConfig } from "../lib/area-plan.js";
import { clearEntryDomains } from "../lib/sensors.js";

await import("../../../floorplan/cards/floorplan-card.js");

const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const PLAN = { schema: 1, floors: [{ floor_id: "ground", points: [{ device_id: "d_climate", x: 2, y: 2, placed: true }],
  rooms: [{ area_id: "living_room", polygon: sq(0, 0, 5, 4) }, { area_id: "kitchen", polygon: sq(5, 0, 3, 4) }] }] };
const DASHBOARD = { views: [{ path: "plan", type: "panel", cards: [{ type: "custom:floorplan-card", plan: PLAN }] }] };

// The demo home with registries: two climate entities and a presence sensor in the living room,
// a diagnostic one left out; the floor plan's dashboard answered over the websocket.
function registryHass() {
  const states = {
    ...baseStates(),
    "sensor.alex_humidity": { state: "48", attributes: { device_class: "humidity", unit_of_measurement: "%", friendly_name: "Living room Humidity" } },
    "sensor.alex_battery": { state: "90", attributes: { device_class: "battery", unit_of_measurement: "%" } },
    "binary_sensor.door": { state: "off", attributes: { device_class: "door", friendly_name: "Living room Door" } },
  };
  states["sensor.living_room_temperature"].attributes = { device_class: "temperature", unit_of_measurement: "°C",
    friendly_name: "Living room Temperature", state_class: "measurement" };
  const hass = hassOf(states);
  hass.ws = [];
  hass.callWS = async (msg) => {
    hass.ws.push(msg.type);
    if (msg.type === "lovelace/config") return structuredClone(DASHBOARD);
    if (msg.type === "config_entries/get") return [];
    return null;
  };
  hass.devices = { d_climate: { id: "d_climate", name: "Climate", area_id: "living_room" },
    d_door: { id: "d_door", name: "Door", area_id: "living_room" } };
  hass.entities = {
    "sensor.living_room_temperature": { entity_id: "sensor.living_room_temperature", device_id: "d_climate", platform: "zha" },
    "sensor.alex_humidity": { entity_id: "sensor.alex_humidity", device_id: "d_climate", platform: "zha" },
    "sensor.alex_battery": { entity_id: "sensor.alex_battery", device_id: "d_climate", platform: "zha", entity_category: "diagnostic" },
    "binary_sensor.door": { entity_id: "binary_sensor.door", device_id: "d_door", platform: "zha" },
  };
  hass.areas = { living_room: { area_id: "living_room", name: "Living room" }, kitchen: { area_id: "kitchen", name: "Kitchen" } };
  hass.user = { is_admin: true };
  return hass;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
function mount(ctx) {
  const el = room.render(ctx);
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  clearEntryDomains();
});

test("All sensors: collapsed under a 44 px header with the count, by category when opened", () => {
  const ctx = ctxOf({ hass: registryHass(), routeId: "living_room" });
  const el = mount(ctx);
  const head = el.querySelector(".sensors .head");
  assert.deepEqual([text(head.querySelector(".t")), text(head.querySelector(".n"))], ["All sensors", "3"]);
  assert.equal(head.getAttribute("aria-expanded"), "false");
  assert.ok(el.querySelector(".sensors .list").hidden);
  assert.match(el.querySelector("style").textContent, /\.sensors \.head \{[^}]*min-height: 44px/);
  assert.match(el.querySelector("style").textContent, /\.sensors \.row \{[^}]*min-height: 44px/);
  head.click();
  assert.equal(head.getAttribute("aria-expanded"), "true");
  assert.equal(el.querySelector(".sensors .list").hidden, false);
  assert.deepEqual(texts(el, ".sensors .cat"), ["Presence and security", "Climate"]);
  assert.deepEqual(texts(el, ".sensors .row .nm"), ["Door", "Humidity", "Temperature"]);
  assert.deepEqual(texts(el, ".sensors .row .v"), ["Off", "48 %", "21.7 °C"]);
});

test("a row with a number opens its trend sheet; an on/off sensor's opens nothing", () => {
  const ctx = ctxOf({ hass: registryHass(), routeId: "living_room" });
  const el = mount(ctx);
  el.querySelector(".sensors .head").click();
  const rows = [...el.querySelectorAll(".sensors .row")];
  assert.equal(rows[0].tagName, "DIV", "the door");
  rows[2].click();
  assert.deepEqual(ctx.sheets, [{ kind: "trend", entity: "sensor.living_room_temperature", title: "Temperature",
    subtitle: "Living room", reading: "temperature" }]);
  rows[1].click();
  assert.equal(ctx.sheets[1].reading, "humidity");
});

test("an update patches the values in place; a new entity rebuilds the rows", () => {
  const ctx = ctxOf({ hass: registryHass(), routeId: "living_room" });
  const el = mount(ctx);
  el.querySelector(".sensors .head").click();
  const row = el.querySelector('.sensors .row[data-entity="sensor.alex_humidity"]');
  const next = registryHass();
  next.states["sensor.alex_humidity"] = { ...next.states["sensor.alex_humidity"], state: "51" };
  ctx.hass = next;
  room.update(el, ctx);
  assert.equal(el.querySelector('.sensors .row[data-entity="sensor.alex_humidity"]'), row, "the same row");
  assert.equal(text(row.querySelector(".v")), "51 %");
  next.entities["sensor.alex_pressure"] = { entity_id: "sensor.alex_pressure", device_id: "d_climate", platform: "zha" };
  next.states["sensor.alex_pressure"] = { state: "1012", attributes: { unit_of_measurement: "hPa", friendly_name: "Pressure" } };
  ctx.hass = { ...next };
  room.update(el, ctx);
  assert.equal(text(el.querySelector(".sensors .head .n")), "4");
});

test("an area without sensors has no All sensors; a home without registries neither", () => {
  const el = mount(ctxOf({ hass: registryHass(), routeId: "office" }));
  assert.ok(el.querySelector(".sensors").hidden);
  assert.ok(mount(ctxOf({ routeId: "living_room" })).querySelector(".sensors").hidden);
});

test("All sensors in Polish and German", () => {
  for (const [lang, title] of [["pl", "Wszystkie czujniki"], ["de", "Alle Sensoren"]]) {
    const el = mount(ctxOf({ hass: registryHass(), routeId: "living_room", lang }));
    assert.equal(text(el.querySelector(".sensors .head .t")), title);
  }
});

test("the area's room on the floor plan's own card, with the home's floorplan", async () => {
  const ctx = ctxOf({ hass: registryHass(), routeId: "living_room", cfg: { ...config, floorplan: true } });
  const el = mount(ctx);
  const card = el.querySelector(".area-plan floorplan-card");
  assert.ok(card, "the floorplan component's element");
  assert.deepEqual(card._config, { edit: false, values: true, maps: false, zoom: false, chips: false, area: "living_room" });
  await settle();
  assert.equal(el.querySelector(".area-plan").hidden, false, "shown once the card says the room is on the plan");
  assert.equal(card.shadowRoot.querySelectorAll("polygon.room").length, 1);
  assert.equal(text(el.querySelector(".area-plan .t")), "Floor plan");
  el.querySelector(".area-plan .open").click();
  assert.deepEqual(ctx.routes, ["#/floorplan"]);
  card.dispatchEvent(new window.CustomEvent("room-tap", { detail: { area_id: "living_room" }, bubbles: true }));
  assert.deepEqual(ctx.routes, ["#/floorplan", "#/floorplan"]);
});

test("an area not on the plan hides its part; a home without the floorplan has none", async () => {
  const el = mount(ctxOf({ hass: registryHass(), routeId: "bedroom", cfg: { ...config, floorplan: true } }));
  await settle();
  assert.ok(el.querySelector(".area-plan").hidden);
  const without = mount(ctxOf({ hass: registryHass(), routeId: "living_room" }));
  assert.equal(without.querySelector(".area-plan"), null);
});

test("planConfig is the floor plan card's host options", () => {
  assert.deepEqual(planConfig("hall"), { area: "hall", edit: false, zoom: false, maps: false, chips: false, values: true });
});
