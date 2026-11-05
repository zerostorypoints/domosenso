// The floor plan view and its layers sheet, with the floorplan component's own card.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as page from "./floorplan-page.js";
import { pages } from "./index.js";
import * as layerSheet from "../lib/layer-sheet.js";
import { forgetPlan } from "../lib/plan-cache.js";
import { config, hassOf, ctxOf, text, texts } from "../testing/demo-home.mjs";

await import("../../../floorplan/cards/floorplan-card.js");

const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const PLAN = { schema: 1, floors: [{ floor_id: "ground",
  points: [{ device_id: "d_climate", x: 2, y: 2, placed: true }, { entity_id: "plant.monstera", x: 6, y: 2, placed: true }],
  rooms: [{ area_id: "living_room", polygon: sq(0, 0, 5, 4) }, { area_id: "bath", polygon: sq(5, 0, 3, 4) }] }] };
const DASHBOARD = { views: [{ path: "plan", type: "panel", cards: [{ type: "custom:floorplan-card", plan: PLAN }] }] };
const RECT = { left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0 };

function planHass() {
  const hass = hassOf({
    "sensor.alex_temperature": { state: "21.5", attributes: { device_class: "temperature", unit_of_measurement: "°C" } },
    "plant.monstera": { state: "ok", attributes: { friendly_name: "Monstera" } },
  });
  hass.language = "en";
  hass.user = { is_admin: true };
  hass.areas = { living_room: { area_id: "living_room", name: "Living room" }, bath: { area_id: "bath", name: "Bath" } };
  hass.devices = { d_climate: { id: "d_climate", name: "Climate", area_id: "living_room" } };
  hass.entities = {
    "sensor.alex_temperature": { entity_id: "sensor.alex_temperature", device_id: "d_climate" },
    "plant.monstera": { entity_id: "plant.monstera", device_id: null, area_id: "bath" },
  };
  hass.callWS = async (msg) => (msg.type === "lovelace/config" ? structuredClone(DASHBOARD) : null);
  return hass;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const cfg = { ...config, floorplan: true };

beforeEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  forgetPlan();
});

async function mount(ctx) {
  const el = page.render(ctx);
  document.body.appendChild(el);
  await settle();
  page.update(el, ctx);
  return el;
}

test("the shell's floor plan is this page", () => {
  assert.equal(pages.floorplan, page);
});

test("the floorplan component's card, read-only, its chips moved out, zoom kept, 44 px targets", async () => {
  const ctx = ctxOf({ hass: planHass(), cfg });
  const el = await mount(ctx);
  const card = el.querySelector(".box floorplan-card");
  assert.ok(card);
  assert.deepEqual(card._config, { edit: false, values: true, maps: true, zoom: true, chips: false, tap_tips: true, plan: PLAN });
  assert.equal(card.shadowRoot.querySelectorAll("polygon.room").length, 2);
  assert.ok(card.shadowRoot.querySelector("[data-action=zoom_in]"), "pinch, pan and the zoom buttons are the card's");
  assert.equal(card.shadowRoot.querySelector(".layers").innerHTML, "");
  assert.match(el.querySelector("style").textContent, /\.box \{ --floorplan-target: 44px;/);
  assert.equal(text(el.querySelector(".top b")), "Floor plan");
  assert.equal(el.querySelector(".layers").hidden, false);
});

test("a tap on a room opens its area's page; a room no area reads opens nothing", async () => {
  const ctx = ctxOf({ hass: planHass(), cfg: { ...cfg, rooms: [...cfg.rooms, { id: "bathroom", name: "Bathroom", area: "bath" }] } });
  const el = await mount(ctx);
  const card = el.querySelector("floorplan-card");
  card.shadowRoot.querySelector("svg").getBoundingClientRect = () => RECT;
  const tap = (x, y) => {
    const svg = card.shadowRoot.querySelector("svg");
    for (const type of ["pointerdown", "pointerup"]) {
      svg.dispatchEvent(new window.PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, bubbles: true, composed: true }));
    }
  };
  tap(700, 200);    // the bath, at the plan's right
  tap(200, 200);    // the living room
  assert.deepEqual(ctx.routes, ["#/area/bathroom", "#/area/living_room"]);
  card.dispatchEvent(new window.CustomEvent("room-tap", { detail: { area_id: "garage" } }));
  assert.equal(ctx.routes.length, 2);
});

test("Layers opens the sheet of the card's chips; a tap presses the card's layer", async () => {
  const ctx = ctxOf({ hass: planHass(), cfg });
  const el = await mount(ctx);
  const card = el.querySelector("floorplan-card");
  el.querySelector(".layers").click();
  assert.equal(ctx.sheets.length, 1);
  const spec = ctx.sheets[0];
  assert.equal(spec.kind, "layers");
  assert.equal(spec.card, card);
  const sheet = layerSheet.render(ctx, spec);
  assert.deepEqual(texts(sheet, ".chip"), ["Plants", "Climate"]);
  assert.deepEqual([...sheet.querySelectorAll(".chip")].map((c) => c.getAttribute("aria-pressed")), ["true", "true"]);
  assert.match(sheet.querySelector("style").textContent, /\.chip \{[^}]*min-height: 44px/);
  sheet.querySelector('.chip[data-layer="plants"]').click();
  assert.equal(card.layerChips.find((c) => c.id === "plants").on, false);
  assert.equal(sheet.querySelector('.chip[data-layer="plants"]').getAttribute("aria-pressed"), "false");
  assert.equal(card.shadowRoot.querySelector('g.marker[data-key="plant.monstera"]'), null);
});

test("without the floorplan component: no card, a line saying so, no Layers", async () => {
  const el = await mount(ctxOf({ hass: planHass() }));
  assert.equal(el.querySelector("floorplan-card"), null);
  assert.equal(text(el.querySelector(".none")), "This home has no floor plan yet.");
  assert.ok(el.querySelector(".layers").hidden);
  assert.ok(el.querySelector(".box").hidden);
});

test("the page in Polish and German", async () => {
  for (const [lang, title, layers] of [["pl", "Rzut", "Warstwy"], ["de", "Grundriss", "Ebenen"]]) {
    const el = await mount(ctxOf({ hass: planHass(), cfg, lang }));
    assert.equal(text(el.querySelector(".top b")), title);
    assert.equal(text(el.querySelector(".layers span")), layers);
  }
});

test("a home with the floorplan component but no plan says there is none", async () => {
  const hass = planHass();
  hass.callWS = async () => { throw { code: "config_not_found" }; };
  const el = await mount(ctxOf({ hass, cfg }));
  assert.equal(el.querySelector("floorplan-card"), null);
  assert.equal(el.querySelector(".none").hidden, false);
});
