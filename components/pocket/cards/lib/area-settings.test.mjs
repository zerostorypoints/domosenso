import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import { render, update } from "./area-settings.js";
import { homeModel } from "./home-model.js";
import { normalize, saveArea, markPicked, KEY } from "./home-store.js";
import { typedSheet } from "./detail-sheets.js";
import { createT } from "./i18n.js";
import en from "../../translations/en.json" with { type: "json" };

const translate = createT({ en });
const st = (state, attributes = {}) => ({ state: String(state), attributes });
const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el) => el.textContent.replace(/\s+/g, " ").trim();

function hassOf(admin = true) {
  return {
    user: { is_admin: admin },
    areas: { living_room: { area_id: "living_room", name: "Living room" }, hall: { area_id: "hall", name: "Hall" } },
    devices: { a: { id: "a", name: "Sensor A", area_id: "living_room" }, b: { id: "b", name: "Sensor B", area_id: "living_room" },
      air: { id: "air", name: "Air monitor", area_id: "living_room" } },
    entities: { "sensor.a_t": { entity_id: "sensor.a_t", device_id: "a" }, "sensor.b_t": { entity_id: "sensor.b_t", device_id: "b" },
      "sensor.air_co2": { entity_id: "sensor.air_co2", device_id: "air" }, "sensor.air_score": { entity_id: "sensor.air_score", device_id: "air" } },
    states: { "sensor.a_t": st(21, { device_class: "temperature" }), "sensor.b_t": st(30, { device_class: "temperature" }),
      "sensor.air_co2": st(600, { device_class: "carbon_dioxide" }), "sensor.air_score": st(80, { state_class: "measurement" }) },
  };
}

function ctxOf({ admin = true, store } = {}) {
  const hass = hassOf(admin);
  const sets = [];
  const model = homeModel(hass, {}, store);
  const ctx = { hass, t: (k, v) => translate({ locale: { language: "en" } }, k, v), sets, sheets: [], routes: [],
    config: { rooms: model.rooms, thresholds: model.thresholds },
    openSheet: (spec) => ctx.sheets.push(spec), closeSheet: () => {}, navigate: (r) => ctx.routes.push(r),
    home: { model, admin, set: (area, change) => { sets.push([area, change]); return Promise.resolve(); } } };
  return ctx;
}

beforeEach(() => { document.body.innerHTML = ""; });

test("the sheet: the type, then one picker per kind, each with its candidates by device name and None", () => {
  const el = render(ctxOf(), { area: "living_room" });
  document.body.append(el);
  assert.equal(text(el.querySelector(".dtitle b")), "Living room");
  assert.deepEqual([...el.querySelectorAll(".seg button")].map(text), ["Inside", "Outside", "Not assigned"]);
  assert.deepEqual([...el.querySelectorAll(".seg button")].map((b) => b.getAttribute("aria-checked")), ["false", "false", "true"]);
  assert.deepEqual([...el.querySelectorAll(".kind h4")].map(text),
    ["Temperature and humidity", "Air quality", "Light level", "Sound level", "Air pressure"]);
  const climate = el.querySelector('[data-kind="climate"] select');
  assert.deepEqual([...climate.options].map((o) => [o.value, o.textContent]), [["", "None"], ["a", "Sensor A"], ["b", "Sensor B"]]);
  assert.equal(text(el.querySelector('[data-kind="climate"] .src')), "2 sensors here: choose the main one");
  assert.equal(text(el.querySelector('[data-kind="air"] .src')), "Found automatically: the only one here");
  assert.equal(el.querySelector(".admin").hidden, true);
});

test("a pick and a type are saved through ctx.home.set, the readings of the chosen device with it", async () => {
  const ctx = ctxOf();
  const el = render(ctx, { area: "living_room" });
  document.body.append(el);
  const climate = el.querySelector('[data-kind="climate"] select');
  climate.value = "b";
  climate.dispatchEvent(new Event("change"));
  el.querySelectorAll(".seg button")[0].click();
  assert.equal(el.querySelectorAll(".seg button")[0].getAttribute("aria-checked"), "true", "shown at once");
  await tick();
  assert.deepEqual(ctx.sets, [["living_room", { kind: "climate", choice: "b", readings: { temperature: "sensor.b_t" } }],
    ["living_room", { type: "inside" }]]);
});

test("a reading the device has no class for is picked among its unclassified sensors", async () => {
  const ctx = ctxOf();
  const el = render(ctx, { area: "living_room" });
  document.body.append(el);
  const rows = [...el.querySelectorAll('[data-kind="air"] .reading')];
  assert.deepEqual(rows.map((r) => text(r.querySelector("small"))),
    ["Air score: choose a sensor", "PM2.5: choose a sensor", "VOC: choose a sensor", "NOx: choose a sensor"].filter((_, i) => rows[i]));
  const score = rows[0].querySelector("select");
  assert.deepEqual([...score.options].map((o) => o.value), ["", "sensor.air_score"]);
  score.value = "sensor.air_score";
  score.dispatchEvent(new Event("change"));
  await tick();
  assert.deepEqual(ctx.sets.at(-1), ["living_room", { kind: "air", choice: "air",
    readings: { co2: "sensor.air_co2", score: "sensor.air_score" } }]);
});

test("not an administrator: everything shown, nothing changeable, and why", () => {
  const ctx = ctxOf({ admin: false });
  const el = render(ctx, { area: "living_room" });
  document.body.append(el);
  assert.equal(el.querySelector(".admin").hidden, false);
  assert.equal(text(el.querySelector(".admin")), "Only an administrator can change these.");
  assert.ok([...el.querySelectorAll("select, .seg button")].every((c) => c.disabled));
});

test("a source shows where a choice came from; the sheet follows the model on update", () => {
  const store = { areas: { living_room: { type: "outside", climate: "none" } }, picked: {} };
  const el = render(ctxOf({ store }), { area: "living_room" });
  document.body.append(el);
  assert.equal(text(el.querySelector(".type .src")), "Set in Pocket");
  assert.equal(el.querySelector('[data-kind="climate"] select').value, "");
  update(el, ctxOf());
  assert.equal(text(el.querySelector(".type .src")), "");
});

test("the areas of a type: each with its reading, then those without a main sensor; none, a way to Settings", () => {
  const ctx = ctxOf();
  // The living room's climate from HA's own area field, both areas Inside.
  ctx.hass.areas.living_room.temperature_entity_id = "sensor.a_t";
  const model = homeModel(ctx.hass, {}, { areas: { living_room: { type: "inside" }, hall: { type: "inside" } }, picked: {} });
  ctx.config = { rooms: model.rooms, thresholds: model.thresholds };
  const el = typedSheet.render(ctx, { kind: "typed", type: "inside", title: "Inside" });
  document.body.append(el);
  assert.deepEqual([...el.querySelectorAll(".gname")].map(text), ["Living room"]);
  assert.deepEqual([...el.querySelectorAll(".unset .drow")].map((r) => [text(r.querySelector(".r")), text(r.querySelector(".lt"))]),
    [["Hall", "Main sensor not set"]]);
  el.querySelector(".unset .drow").click();
  assert.deepEqual(ctx.sheets.at(-1), { kind: "area-settings", area: "hall", title: "Area settings" });
  const none = typedSheet.render(ctx, { kind: "typed", type: "outside", title: "Outside" });
  assert.equal(text(none.querySelector(".empty")), "No areas assigned");
  none.querySelector(".assign").click();
  assert.deepEqual(ctx.routes, ["#/settings/areas"]);
});

test("the home store: read, merged per area, written whole; a recorded pick once", async () => {
  let value = { areas: { hall: { type: "inside" } }, picked: {} };
  const calls = [];
  const hass = { callWS: (msg) => { calls.push(msg.type);
    if (msg.type === "frontend/get_system_data") return Promise.resolve({ value });
    value = msg.value; return Promise.resolve(null); } };
  await saveArea(hass, "garden", { type: "outside", air: "none" });
  await saveArea(hass, "hall", { type: undefined });
  assert.deepEqual(value.areas, { hall: {}, garden: { type: "outside", air: "none" } });
  await markPicked(hass, "garden", "illuminance", "sensor.lux");
  await markPicked(hass, "garden", "illuminance", "sensor.other");
  assert.deepEqual(value.picked, { garden: ["illuminance"] });
  assert.equal(value.areas.garden.illuminance, "sensor.lux", "the second is not recorded");
  assert.equal(KEY, "domosenso-pocket-home");
  assert.deepEqual(normalize({ areas: { x: { type: "attic" } }, picked: { x: "no" } }), { areas: { x: {} }, picked: {} });
  await assert.rejects(saveArea({}, "x", {}));
});
