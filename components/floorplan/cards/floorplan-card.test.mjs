import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shadowText } from "./testing/dom-env.mjs";
import { withPlan } from "./lib/plan.js";
import { colourAt } from "./lib/maps.js";
import materials from "./lib/materials.json" with { type: "json" };

await import("./floorplan-card.js");
const load = (lang) => JSON.parse(readFileSync(new URL(`../translations/${lang}.json`, import.meta.url), "utf8"));
const LANGS = { en: load("en"), de: load("de"), pl: load("pl") };
const at = (dict, key) => key.split(".").reduce((node, part) => node?.[part], dict);
const EN = (key) => at(LANGS.en, key);

const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

// The demo home: a living room and a kitchen side by side, an office upstairs.
const planOf = (points = []) => ({
  schema: 1,
  floors: [{
    floor_id: "ground",
    rooms: [
      { area_id: "living_room", polygon: sq(0, 0, 5, 4) },
      { area_id: "kitchen", polygon: sq(5, 0, 3, 4) },
    ],
    points,
  }],
});
const dashboardOf = (plan) => ({
  title: "Floor plan",
  views: [{ path: "plan", type: "panel", cards: [{ type: "custom:floorplan-card", ...(plan ? { plan } : {}) }] }],
});

// A fake hass whose callWS records every call and answers from `answers` (a function or a value per type).
function hassOf({ admin = true, language = "en", dashboard, answers = {} } = {}) {
  const calls = [];
  return {
    calls,
    language,
    locale: { language },
    user: { is_admin: admin },
    areas: {
      living_room: { area_id: "living_room", name: "Living room" },
      kitchen: { area_id: "kitchen", name: "Kitchen" },
      office: { area_id: "office", name: "Office" },
    },
    floors: {},
    devices: {
      d_climate: { id: "d_climate", name: "Climate sensor", area_id: "living_room" },
      d_office: { id: "d_office", name: "Office sensor", area_id: "office" },
    },
    entities: {
      "sensor.alex_temperature": { entity_id: "sensor.alex_temperature", device_id: "d_climate" },
      "sensor.alex_humidity": { entity_id: "sensor.alex_humidity", device_id: "d_climate" },
      "sensor.office_temperature": { entity_id: "sensor.office_temperature", device_id: "d_office" },
      "plant.monstera": { entity_id: "plant.monstera", device_id: null, area_id: "kitchen" },
    },
    states: {
      "sensor.alex_temperature": { state: "21.5", attributes: { device_class: "temperature", unit_of_measurement: "°C" } },
      "sensor.alex_humidity": { state: "48", attributes: { device_class: "humidity", unit_of_measurement: "%" } },
      "sensor.office_temperature": { state: "19", attributes: { device_class: "temperature", unit_of_measurement: "°C" } },
      "plant.monstera": { state: "ok", attributes: { friendly_name: "Monstera" } },
    },
    async callWS(msg) {
      calls.push(msg);
      const answer = answers[msg.type];
      if (typeof answer === "function") return answer(msg);
      if (answer !== undefined) return answer;
      if (msg.type === "lovelace/config") {
        if (!dashboard) throw { code: "config_not_found", message: "not found" };
        return structuredClone(dashboard);
      }
      return null;
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
// The dashboard's calls: the card also reads config_entries/get once, for device categories.
const dashboardCalls = (hass) => hass.calls.filter((c) => c.type !== "config_entries/get");
const RECT = { left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0 };

async function make(config, hass) {
  const card = document.createElement("floorplan-card");
  document.body.appendChild(card);
  card.setConfig(config);
  card.hass = hass;
  await settle();
  card.shadowRoot.querySelector("svg").getBoundingClientRect = () => RECT;
  return card;
}
const $ = (card, sel) => card.shadowRoot.querySelector(sel);
const click = (node) => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, composed: true }));
const pointer = (node, type, x, y, id = 1, isPrimary = false) => node.dispatchEvent(new window.PointerEvent(type, {
  bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, pointerId: id, button: 0, isPrimary,
}));
// The plan point under a client point, from the svg's viewBox and the rectangle it fills (meet).
function planAt(card, cx, cy) {
  const [x, y, w, h] = $(card, "svg").getAttribute("viewBox").split(" ").map(Number);
  const s = Math.min(RECT.width / w, RECT.height / h);
  return [x + (cx - (RECT.width - w * s) / 2) / s, y + (cy - (RECT.height - h * s) / 2) / s];
}
function clientAt(card, px, py) {
  const [x, y, w, h] = $(card, "svg").getAttribute("viewBox").split(" ").map(Number);
  const s = Math.min(RECT.width / w, RECT.height / h);
  return [(px - x) * s + (RECT.width - w * s) / 2, (py - y) * s + (RECT.height - h * s) / 2];
}

test("registers once and offers itself in the picker from translations", () => {
  assert.ok(customElements.get("floorplan-card"));
  const entries = window.customCards.filter((c) => c.type === "floorplan-card");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, EN("card.floorplan.name"));
});

test("loads the plan from the dashboard when config has none", async () => {
  const hass = hassOf({ dashboard: dashboardOf(planOf()) });
  const card = await make({}, hass);
  assert.deepEqual(dashboardCalls(hass)[0], { type: "lovelace/config", url_path: "floorplan" });
  assert.equal(card.shadowRoot.querySelectorAll("polygon.room").length, 2);
  const text = shadowText(card);
  assert.ok(text.includes("Living room") && text.includes("Kitchen"), text);
});

test("a plan in the config is drawn without asking the dashboard", async () => {
  const hass = hassOf();
  const card = await make({ plan: planOf() }, hass);
  assert.equal(dashboardCalls(hass).length, 0);
  assert.equal(card.shadowRoot.querySelectorAll("polygon.room").length, 2);
});

for (const [lang, dict] of Object.entries(LANGS)) {
  test(`no plan message in ${lang}`, async () => {
    const noDashboard = await make({}, hassOf({ language: lang }));
    assert.ok(shadowText(noDashboard).includes(at(dict, "card.floorplan.no_plan")), shadowText(noDashboard));
    const noPlan = await make({}, hassOf({ language: lang, dashboard: dashboardOf(null) }));
    assert.ok(shadowText(noPlan).includes(at(dict, "card.floorplan.no_plan")));
    assert.equal(noPlan.shadowRoot.querySelector("[data-action=edit]"), null);
  });
}

test("an unknown schema is refused with a message", async () => {
  const card = await make({ plan: { schema: 2, floors: [] } }, hassOf());
  assert.ok(shadowText(card).includes(EN("card.floorplan.unsupported")), shadowText(card));
  assert.equal(card.shadowRoot.querySelectorAll("polygon.room").length, 0);
});

test("non-admin has no edit button", async () => {
  const card = await make({ plan: planOf() }, hassOf({ admin: false }));
  assert.equal($(card, "[data-action=edit]"), null);
  assert.ok($(card, "[data-action=zoom_in]"));
});

test("edit: false hides it for an admin", async () => {
  const admin = await make({ plan: planOf() }, hassOf());
  assert.ok($(admin, "[data-action=edit]"));
  const embedded = await make({ plan: planOf(), edit: false }, hassOf());
  assert.equal($(embedded, "[data-action=edit]"), null);
});

test("view mode: a tap on a room selects nothing and changes nothing", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  const room = $(card, "polygon.room");
  pointer(room, "pointerdown", 100, 100);
  pointer(room, "pointerup", 100, 100);
  assert.equal(card.shadowRoot.querySelector(".selected"), null);
  assert.equal($(card, ".area-panel select"), null);
});

test("entering edit mode puts unplaced points at their room's centre", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  const points = card._doc.floors[0].points;
  assert.deepEqual(points.map((p) => [p.device_id ?? p.entity_id, p.x, p.y, p.placed]), [
    ["d_climate", 2.5, 2.6, false],
    ["plant.monstera", 6.5, 2.6, false],
  ]);
  assert.equal(card.shadowRoot.querySelectorAll("g.marker.unplaced").length, 2);
});

test("drag sets placed and moves the marker", async () => {
  const card = await make({ plan: planOf([{ device_id: "d_climate", x: 1, y: 1, placed: false }]) }, hassOf());
  click($(card, "[data-action=edit]"));
  const marker = $(card, 'g.marker[data-key="d_climate"]');
  const [sx, sy] = clientAt(card, 1, 1);
  const [ex, ey] = clientAt(card, 3, 2.5);
  pointer(marker, "pointerdown", sx, sy);
  pointer($(card, "svg"), "pointermove", ex, ey);
  pointer($(card, "svg"), "pointerup", ex, ey);
  const point = card._doc.floors[0].points.find((p) => p.device_id === "d_climate");
  assert.ok(Math.abs(point.x - 3) < 1e-9 && Math.abs(point.y - 2.5) < 1e-9, JSON.stringify(point));
  assert.equal(point.placed, true);
  assert.equal($(card, 'g.marker[data-key="d_climate"]').getAttribute("transform"), "translate(3 2.5)");
});

// `via`: a detour first, for a drop closer to the start than a tap's few pixels.
const drag = (card, from, to, node, via) => {
  const [sx, sy] = clientAt(card, ...from);
  const [ex, ey] = clientAt(card, ...to);
  pointer(node, "pointerdown", sx, sy);
  if (via) pointer($(card, "svg"), "pointermove", ...clientAt(card, ...via));
  pointer($(card, "svg"), "pointermove", ex, ey);
  pointer($(card, "svg"), "pointerup", ex, ey);
};
const corner = (card, area, index) => $(card, `circle.corner[data-area="${area}"][data-index="${index}"]`);
const round = (pt) => pt.map((v) => Math.round(v * 1e6) / 1e6);

test("dragging a corner moves the neighbour's shared corner with it", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  // living_room corner 1 is (5, 0), shared with the kitchen's corner 0.
  drag(card, [5, 0], [5.5, 0], corner(card, "living_room", 1));
  const [living, kitchen] = card._doc.floors[0].rooms;
  assert.deepEqual(round(living.polygon[1]), [5.5, 0]);
  assert.deepEqual(kitchen.polygon[0], living.polygon[1]);
});

test("a corner dropped within 0.05 m of another room's corner or wall snaps onto it", async () => {
  const plan = planOf();
  plan.floors[0].rooms[1].polygon = sq(5.02, 0, 3, 4);           // a 2 cm gap between the rooms
  const card = await make({ plan }, hassOf());
  click($(card, "[data-action=edit]"));
  drag(card, [5, 0], [5.01, 0.01], corner(card, "living_room", 1), [5.5, 1]);
  assert.deepEqual(card._doc.floors[0].rooms[0].polygon[1], [5.02, 0]);
  drag(card, [5, 4], [5.01, 3.9], corner(card, "living_room", 2), [5.5, 3]);
  assert.deepEqual(round(card._doc.floors[0].rooms[0].polygon[2]), [5.02, 3.9]);
});

test("double-click inserts a corner on an edge and removes a corner", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  const edge = $(card, 'line.edge[data-area="kitchen"][data-edge="0"]');   // (5,0)–(8,0)
  const [cx, cy] = clientAt(card, 6, 0);
  edge.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, composed: true, clientX: cx, clientY: cy }));
  const kitchen = () => card._doc.floors[0].rooms[1].polygon;
  assert.equal(kitchen().length, 5);
  assert.ok(Math.abs(kitchen()[1][0] - 6) < 1e-9 && Math.abs(kitchen()[1][1]) < 1e-9, JSON.stringify(kitchen()));
  $(card, 'circle.corner[data-area="kitchen"][data-index="1"]')
    .dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, composed: true }));
  assert.deepEqual(kitchen(), sq(5, 0, 3, 4));
});

const tap = (card, px, py, target) => {
  const [x, y] = clientAt(card, px, py);
  const node = target || $(card, "svg");
  pointer(node, "pointerdown", x, y);
  pointer($(card, "svg"), "pointerup", x, y);
};

test("join: two rooms become one, keeping the first one's area", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="join"]'));
  tap(card, 2, 2, $(card, 'polygon.room[data-area="living_room"]'));
  tap(card, 6, 2, $(card, 'polygon.room[data-area="kitchen"]'));
  const rooms = card._doc.floors[0].rooms;
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].area_id, "living_room");
});

test("split: two wall points and an area for the new half", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="split"]'));
  tap(card, 2, 0.01);
  tap(card, 2, 3.99);
  const select = $(card, ".area-panel select");
  assert.ok(select, "an area select for the new room");
  assert.ok(shadowText(card).includes(EN("card.floorplan.area.for_split")));
  select.value = "office";
  select.dispatchEvent(new window.Event("change", { bubbles: true, composed: true }));
  const rooms = card._doc.floors[0].rooms;
  assert.deepEqual(rooms.map((r) => r.area_id), ["living_room", "office", "kitchen"]);
});

test("link: a tapped room gets another area, or a new one created by name", async () => {
  const hass = hassOf({ answers: { "config/area_registry/create": (msg) => ({ area_id: "pantry", name: msg.name }) } });
  const card = await make({ plan: planOf() }, hass);
  click($(card, "[data-action=edit]"));
  tap(card, 6, 2, $(card, 'polygon.room[data-area="kitchen"]'));
  const select = $(card, ".area-panel select");
  assert.ok(select);
  const living = [...select.options].find((o) => o.value === "living_room");
  assert.ok(living.disabled, "an area with a room on this floor is not offered");
  $(card, ".area-panel input").value = "Pantry";
  click($(card, "[data-action=create_area]"));
  await settle();
  assert.deepEqual(hass.calls.at(-1), { type: "config/area_registry/create", name: "Pantry" });
  assert.equal(card._doc.floors[0].rooms[1].area_id, "pantry");
  assert.ok(!hass.calls.some((c) => /delete|device_registry/.test(c.type)));
});

test("wheel zoom keeps the point under the cursor", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  const before = planAt(card, 300, 120);
  const wheel = new window.WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
  Object.defineProperties(wheel, { clientX: { value: 300 }, clientY: { value: 120 } });
  $(card, "svg").dispatchEvent(wheel);
  const w0 = Number($(card, "svg").getAttribute("viewBox").split(" ")[2]);
  const after = planAt(card, 300, 120);
  assert.ok(Math.abs(before[0] - after[0]) < 1e-9 && Math.abs(before[1] - after[1]) < 1e-9, `${before} ${after}`);
  assert.ok(wheel.defaultPrevented);
  click($(card, "[data-action=zoom_out]"));
  assert.ok(Number($(card, "svg").getAttribute("viewBox").split(" ")[2]) > w0);
  click($(card, "[data-action=fit]"));
  click($(card, "[data-action=zoom_in]"));
  assert.ok(Number($(card, "svg").getAttribute("viewBox").split(" ")[2]) < 9);
});

test("dragging the background pans", async () => {
  const card = await make({ plan: planOf() }, hassOf({ admin: false }));
  const [x0, y0] = $(card, "svg").getAttribute("viewBox").split(" ").map(Number);
  const room = $(card, "polygon.room");
  pointer(room, "pointerdown", 400, 200);
  pointer($(card, "svg"), "pointermove", 450, 200);
  pointer($(card, "svg"), "pointerup", 450, 200);
  const [x1, y1] = $(card, "svg").getAttribute("viewBox").split(" ").map(Number);
  assert.ok(x1 < x0, `${x0} -> ${x1}`);
  assert.equal(y1, y0);
});

test("save sends withPlan", async () => {
  const plan = planOf([{ device_id: "d_climate", x: 1, y: 1, placed: true }, { entity_id: "plant.monstera", x: 6, y: 1, placed: true }]);
  const dashboard = dashboardOf(plan);
  const hass = hassOf({ dashboard });
  const card = await make({}, hass);
  click($(card, "[data-action=edit]"));
  const marker = $(card, 'g.marker[data-key="d_climate"]');
  const [sx, sy] = clientAt(card, 1, 1);
  const [ex, ey] = clientAt(card, 2, 3);
  pointer(marker, "pointerdown", sx, sy);
  pointer($(card, "svg"), "pointermove", ex, ey);
  pointer($(card, "svg"), "pointerup", ex, ey);
  click($(card, "[data-action=save]"));
  await settle();
  const types = dashboardCalls(hass).map((c) => c.type);
  assert.deepEqual(types, ["lovelace/config", "lovelace/config", "lovelace/config/save"]);
  const save = hass.calls.at(-1);
  assert.equal(save.url_path, "floorplan");
  assert.deepEqual(save.config, withPlan(dashboard, card._doc));
  assert.equal(save.config.views[0].cards[0].plan.floors[0].points[0].placed, true);
  assert.ok(shadowText(card).includes(EN("card.floorplan.saved")), shadowText(card));
});

test("save refuses a changed dashboard", async () => {
  let current = dashboardOf(planOf());
  const hass = hassOf({ answers: { "lovelace/config": () => structuredClone(current) } });
  const card = await make({}, hass);
  click($(card, "[data-action=edit]"));
  current = dashboardOf(planOf([{ entity_id: "plant.monstera", x: 7, y: 3, placed: true }]));
  click($(card, "[data-action=save]"));
  await settle();
  assert.ok(!hass.calls.some((c) => c.type === "lovelace/config/save"));
  assert.ok(shadowText(card).includes(EN("card.floorplan.changed_elsewhere")), shadowText(card));
});

test("empty plan shows the tray and the hint", async () => {
  const card = await make({ plan: { schema: 1, floors: [{ floor_id: null, rooms: [], points: [] }] } }, hassOf());
  assert.ok(shadowText(card).includes(EN("card.floorplan.hint.empty")), shadowText(card));
  click($(card, "[data-action=edit]"));
  const items = [...card.shadowRoot.querySelectorAll(".tray [data-key]")].map((n) => n.getAttribute("data-key"));
  assert.deepEqual(items.sort(), ["d_climate", "d_office", "plant.monstera"]);
  assert.ok(shadowText(card).includes(EN("card.floorplan.tray.title")));
  assert.ok(shadowText(card).includes(EN("card.floorplan.hint.empty")));
});

// ---- staging feedback: drag feedback, marker names, distances to the walls ------------------

test("a tray drag starts no text selection or native drag", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  const item = $(card, '.tray [data-key="d_office"]');
  assert.equal(pointer(item, "pointerdown", 790, 390), false, "pointerdown on a tray item is default-prevented");
  pointer(item, "pointerup", 790, 390);
  assert.match(card.shadowRoot.querySelector("style").textContent, /\.tray \{[^}]*user-select: none/);
});

test("a tray drag shows a ghost marker under the pointer, gone after the drop", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  const item = $(card, '.tray [data-key="d_office"]');
  const [ex, ey] = clientAt(card, 6, 3);
  pointer(item, "pointerdown", 790, 390);
  pointer(item, "pointermove", 900, 395);     // right of the plan's 800 px
  assert.ok(!$(card, "g.ghost"), "no ghost while the pointer is outside the plan");
  pointer(item, "pointermove", ex, ey);
  const ghost = $(card, "g.ghost");
  assert.ok(ghost, "a ghost follows the pointer over the plan");
  const [, gx, gy] = ghost.getAttribute("transform").match(/translate\(([-\d.]+) ([-\d.]+)\)/).map(Number);
  assert.ok(Math.abs(gx - 6) < 1e-6 && Math.abs(gy - 3) < 1e-6, ghost.getAttribute("transform"));
  assert.ok(ghost.textContent.includes("Office sensor"), ghost.textContent);
  pointer(item, "pointerup", ex, ey);
  assert.ok(!$(card, "g.ghost"));
});

test("markers carry no names on the plan, only readings: the name is in the tooltip", async () => {
  const hass = photoHass();
  hass.states["sensor.office_temperature"] = { state: "unavailable", attributes: { device_class: "temperature" } };
  const pts = [{ device_id: "d_climate", x: 1, y: 1, placed: true }, { device_id: "d_office", x: 6, y: 1, placed: true },
    { entity_id: "plant.monstera", x: 6, y: 3, placed: true }];
  const card = await make({ plan: planOf(pts) }, hass);
  const lines = (key) => [...$(card, `g.marker[data-key="${key}"]`).querySelectorAll("text")].map((n) => n.textContent);
  for (const editing of [false, true]) {
    if (editing) click($(card, "[data-action=edit]"));
    assert.deepEqual(lines("d_climate").map((l) => l.replace(/\s/g, "")), ["21.5°C", "48%"], `climate, editing ${editing}`);
    assert.deepEqual(lines("d_office"), [], "no reading: no text, no dash");
    assert.deepEqual(lines("plant.monstera"), [], "a plant's value is its name: no text");
  }
});

test("a room's name sits at the widest spot inside it, shrunk to fit a narrow room", async () => {
  // An L-shaped hall whose centroid falls outside it, and a narrow room with a long name.
  const plan = { schema: 1, floors: [{ floor_id: "ground", points: [], rooms: [
    { area_id: "living_room", polygon: [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]] },
    { area_id: "kitchen", polygon: [[5, 0], [6, 0], [6, 4], [5, 4]] },
  ] }] };
  const hass = hassOf();
  hass.areas.kitchen.name = "A very long kitchen name";
  const card = await make({ plan }, hass);
  const label = (area) => [...card.shadowRoot.querySelectorAll("text.label")]
    .find((n) => n.textContent === hass.areas[area].name);
  const hall = label("living_room");
  const [hx, hy] = [Number(hall.getAttribute("x")), Number(hall.getAttribute("y"))];
  assert.ok(hy > 0 && hy < 1 && hx > 0 && hx < 4, `in the hall's wide arm: ${hx}, ${hy}`);
  const kitchen = label("kitchen");
  const living = Number(hall.getAttribute("font-size"));
  assert.ok(Number(kitchen.getAttribute("font-size")) < living, "the long name in the 1 m room is smaller");
});

test("a dragged or tapped point shows its distance to the room's walls", async () => {
  const card = await make({ plan: planOf([{ device_id: "d_climate", x: 1, y: 1.5, placed: true }]) }, hassOf());
  click($(card, "[data-action=edit]"));
  assert.equal(card.shadowRoot.querySelectorAll(".dim.to-wall").length, 0, "nothing before a point is picked");
  const node = $(card, 'g.marker[data-key="d_climate"]');
  const [sx, sy] = clientAt(card, 1, 1.5);
  const [ex, ey] = clientAt(card, 2, 1);
  pointer(node, "pointerdown", sx, sy);
  pointer(node, "pointermove", ex, ey);
  // Living room is 5 × 4 m from (0, 0): at (2, 1) the walls are 2, 3, 1 and 3 m away.
  const texts = () => [...card.shadowRoot.querySelectorAll("text.dim.to-wall")].map((n) => n.textContent).sort();
  assert.deepEqual(texts(), ["1.00 m", "2.00 m", "3.00 m", "3.00 m"]);
  pointer(node, "pointerup", ex, ey);
  assert.deepEqual(texts(), ["1.00 m", "2.00 m", "3.00 m", "3.00 m"], "stays after the drop: the point is selected");
  assert.equal(card.shadowRoot.querySelectorAll("line.to-wall").length, 4);
});

// A plant with a photo, as the plants component gives it (entity_picture).
function photoHass(opts) {
  const hass = hassOf(opts);
  hass.states["plant.monstera"] = { state: "ok", attributes: { friendly_name: "Monstera", entity_picture: "/local/plants/monstera.jpg" } };
  return hass;
}
const tip = (card) => $(card, ".tip");
const tipShown = (card) => tip(card) && !tip(card).hidden;

test("hovering a plant on the plan shows a tooltip with its photo and name", async () => {
  const card = await make({ plan: planOf([{ entity_id: "plant.monstera", x: 6, y: 2, placed: true }]) }, photoHass());
  assert.ok(!tipShown(card), "no tooltip before hovering");
  const [mx, my] = clientAt(card, 6, 2);
  pointer($(card, 'g.marker[data-key="plant.monstera"]'), "pointermove", mx, my);
  assert.ok(tipShown(card), "the tooltip shows over the marker");
  assert.equal(tip(card).querySelector("img")?.getAttribute("src"), "/local/plants/monstera.jpg");
  assert.ok(tip(card).textContent.includes("Monstera"), tip(card).textContent);
  const [ex, ey] = clientAt(card, 2, 2);
  pointer($(card, "polygon.room"), "pointermove", ex, ey);
  assert.ok(!tipShown(card), "gone once the pointer leaves the marker");
});

test("a sensor without a photo gets a tooltip with its name and readings, no image", async () => {
  const card = await make({ plan: planOf([{ device_id: "d_climate", x: 1, y: 1, placed: true }]) }, photoHass());
  const [mx, my] = clientAt(card, 1, 1);
  pointer($(card, 'g.marker[data-key="d_climate"]'), "pointermove", mx, my);
  assert.ok(tipShown(card));
  assert.ok(!tip(card).querySelector("img"));
  assert.ok(tip(card).textContent.includes("Climate sensor") && tip(card).textContent.includes("21.5"), tip(card).textContent);
});

test("hovering a plant in the tray shows its photo; a drag hides the tooltip", async () => {
  const hass = photoHass();
  hass.entities["plant.monstera"] = { entity_id: "plant.monstera", device_id: null, area_id: null };
  const card = await make({ plan: planOf() }, hass);
  click($(card, "[data-action=edit]"));
  const item = $(card, '.tray [data-key="plant.monstera"]');
  assert.ok(item, "the plant is in the tray");
  pointer(item, "pointermove", 790, 390);
  assert.equal(tip(card)?.querySelector("img")?.getAttribute("src"), "/local/plants/monstera.jpg");
  pointer(item, "pointerdown", 790, 390);
  assert.ok(!tipShown(card), "a drag hides it");
  pointer(item, "pointerup", 790, 390);
});

test("a photo URL that is not a path or http(s) is not used", async () => {
  const hass = photoHass();
  hass.states["plant.monstera"].attributes.entity_picture = "javascript:alert(1)";
  const card = await make({ plan: planOf([{ entity_id: "plant.monstera", x: 6, y: 2, placed: true }]) }, hass);
  const [mx, my] = clientAt(card, 6, 2);
  pointer($(card, 'g.marker[data-key="plant.monstera"]'), "pointermove", mx, my);
  assert.ok(tipShown(card));
  assert.ok(!tip(card).querySelector("img"));
});

// ---- Amendment 5: categories, colours, layers ------------------------------------------------

// The demo home plus a lamp, a dimmer, a mesh access point (its integration from its config entry).
function categoryHass(opts) {
  const hass = hassOf({ ...opts, answers: { "config_entries/get": [{ entry_id: "e_mesh", domain: "tplink_deco" }], ...(opts?.answers || {}) } });
  Object.assign(hass.devices, {
    d_lamp: { id: "d_lamp", name: "Lamp", area_id: "office" },     // no room on the plan: stays in the tray
    d_dimmer: { id: "d_dimmer", name: "Dimmer", area_id: "living_room" },
    d_mesh: { id: "d_mesh", name: "Mesh node", area_id: "kitchen", config_entries: ["e_mesh"] },
  });
  Object.assign(hass.entities, {
    "light.lamp": { entity_id: "light.lamp", device_id: "d_lamp", platform: "hue" },
    "event.dimmer": { entity_id: "event.dimmer", device_id: "d_dimmer", platform: "hue" },
    "switch.mesh_led": { entity_id: "switch.mesh_led", device_id: "d_mesh", platform: "tplink_deco" },
  });
  Object.assign(hass.states, {
    "light.lamp": { state: "on", attributes: {} },
    "event.dimmer": { state: "unknown", attributes: {} },
    "switch.mesh_led": { state: "on", attributes: {} },
  });
  return hass;
}
const pt = (key, x, y) => ({ device_id: key, x, y, placed: true });
const markerOf = (card, key) => $(card, `g.marker[data-key="${key}"]`);

test("a marker's colour and shape come from its category", async () => {
  const pts = [pt("d_climate", 1, 1), pt("d_lamp", 2, 1), pt("d_dimmer", 3, 1), pt("d_mesh", 6, 1)];
  const card = await make({ plan: planOf(pts) }, categoryHass());
  await settle();
  const shape = (key) => markerOf(card, key).firstElementChild;
  assert.ok(markerOf(card, "d_climate").classList.contains("cat-climate"));
  assert.match(shape("d_climate").getAttribute("style"), /var\(--floorplan-climate, #[0-9a-f]{6}\)/);
  assert.equal(shape("d_lamp").tagName.toLowerCase(), "circle");
  assert.equal(shape("d_dimmer").tagName.toLowerCase(), "rect", "a switch is a square");
  assert.ok(markerOf(card, "d_mesh").classList.contains("cat-radio"), "its integration read from config_entries/get");
  assert.equal(shape("d_mesh").tagName.toLowerCase(), "polygon", "a radio is a diamond");
});

test("layer chips hide and show a category's markers; the choice is remembered", async () => {
  window.localStorage.clear();
  const pts = [pt("d_climate", 1, 1), pt("d_lamp", 2, 1)];
  const card = await make({ plan: planOf(pts) }, categoryHass());
  await settle();
  const chip = (id) => $(card, `.layers [data-layer="${id}"]`);
  assert.ok(chip("climate") && chip("light"), "a chip per category on the plan");
  assert.ok(!chip("shading"), "none for a category with no point");
  click(chip("light"));
  assert.ok(!markerOf(card, "d_lamp"), "light hidden");
  assert.ok(markerOf(card, "d_climate"));
  assert.equal(chip("light").getAttribute("aria-pressed"), "false");
  const again = await make({ plan: planOf(pts) }, categoryHass());
  await settle();
  assert.ok(!markerOf(again, "d_lamp"), "remembered per browser");
  click($(again, '.layers [data-layer="light"]'));
  assert.ok(markerOf(again, "d_lamp"));
  window.localStorage.clear();
});

test("config layers fixes the categories shown, without chips", async () => {
  const pts = [pt("d_climate", 1, 1), pt("d_lamp", 2, 1)];
  const card = await make({ plan: planOf(pts), layers: ["climate"] }, categoryHass());
  await settle();
  assert.ok(markerOf(card, "d_climate"));
  assert.ok(!markerOf(card, "d_lamp"));
  assert.ok(!$(card, ".layers [data-layer]"));
});

test("layer_choice one: a chip per listed layer, exactly one on, the choice remembered", async () => {
  window.localStorage.clear();
  const pts = [pt("d_climate", 1, 1), pt("d_lamp", 2, 1), pt("d_dimmer", 3, 1)];
  const config = { plan: planOf(pts), layers: ["climate", "light"], layer_choice: "one" };
  const card = await make(config, categoryHass());
  await settle();
  const chip = (id) => $(card, `.layers [data-layer="${id}"]`);
  assert.ok(chip("climate") && chip("light") && !chip("plants"), "chips for the listed layers only");
  assert.equal(chip("climate").getAttribute("aria-pressed"), "true", "the first one is on");
  assert.equal(chip("light").getAttribute("aria-pressed"), "false");
  assert.ok(markerOf(card, "d_climate") && !markerOf(card, "d_lamp"));
  assert.ok(chip("light").hasAttribute("data-own-tap"), "the chips keep their taps to themselves");
  click(chip("light"));
  assert.ok(!markerOf(card, "d_climate") && markerOf(card, "d_lamp") && markerOf(card, "d_dimmer"));
  assert.equal(chip("light").getAttribute("aria-pressed"), "true");
  click(chip("light"));
  assert.ok(markerOf(card, "d_lamp"), "tapping the chosen one keeps it: always one layer");
  const again = await make(config, categoryHass());
  await settle();
  assert.ok(markerOf(again, "d_lamp") && !markerOf(again, "d_climate"), "remembered");
  window.localStorage.clear();
});

test("tray items carry their category's coloured dot", async () => {
  const card = await make({ plan: planOf() }, categoryHass());
  await settle();
  click($(card, "[data-action=edit]"));
  for (const d of card.shadowRoot.querySelectorAll(".tray details")) d.open = true;
  const dot = $(card, '.tray [data-key="d_lamp"] .dot');
  assert.ok(dot, card.shadowRoot.querySelector(".tray").innerHTML);
  assert.match(dot.getAttribute("style"), /--floorplan-light/);
});

test("a tapped point's category can be overridden, and set back to what it is", async () => {
  const card = await make({ plan: planOf([pt("d_climate", 1, 1)]) }, categoryHass());
  await settle();
  click($(card, "[data-action=edit]"));
  const [x, y] = clientAt(card, 1, 1);
  pointer(markerOf(card, "d_climate"), "pointerdown", x, y);
  pointer(markerOf(card, "d_climate"), "pointerup", x, y);
  const select = $(card, ".point-panel select.category");
  assert.ok(select, "a category select for the tapped point");
  // The selected option (happy-dom misreads select.value after innerHTML).
  assert.equal(select.querySelector("option[selected]")?.value, "climate");
  select.value = "security";
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(card._doc.floors[0].points[0].category, "security");
  assert.ok(markerOf(card, "d_climate").classList.contains("cat-security"));
  const again = $(card, ".point-panel select.category");
  again.value = "climate";
  again.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.ok(!("category" in card._doc.floors[0].points[0]), "its own category: no override stored");
});

test("a point whose device is gone keeps a fallback marker", async () => {
  const card = await make({ plan: planOf([pt("d_gone", 1, 1)]) }, categoryHass());
  await settle();
  assert.ok(markerOf(card, "d_gone").classList.contains("cat-other"));
});

// ---- Amendment 5, stage 2: one point per physical device, registry links --------------------

// categoryHass plus an amplifier's Cast device (no room on the plan: it waits in the tray) and two
// bulbs behind the mesh node standing in as a bridge.
function stage2Hass() {
  const hass = categoryHass();
  Object.assign(hass.devices, {
    d_amp_cast: { id: "d_amp_cast", name: "Speaker (Cast)", area_id: "office" },
    d_bulb1: { id: "d_bulb1", name: "Bulb 1", area_id: "living_room", via_device_id: "d_mesh" },
    d_bulb2: { id: "d_bulb2", name: "Bulb 2", area_id: "living_room", via_device_id: "d_mesh" },
  });
  Object.assign(hass.entities, {
    "media_player.amp_cast": { entity_id: "media_player.amp_cast", device_id: "d_amp_cast", platform: "cast" },
    "light.bulb1": { entity_id: "light.bulb1", device_id: "d_bulb1", platform: "hue" },
    "light.bulb2": { entity_id: "light.bulb2", device_id: "d_bulb2", platform: "hue" },
  });
  Object.assign(hass.states, {
    "media_player.amp_cast": { state: "idle", attributes: {} },
    "light.bulb1": { state: "on", attributes: {} }, "light.bulb2": { state: "on", attributes: {} },
  });
  return hass;
}

test("a device dropped from the tray onto a marker joins that point as the same hardware", async () => {
  const card = await make({ plan: planOf([pt("d_climate", 1, 1)]) }, stage2Hass());
  await settle();
  click($(card, "[data-action=edit]"));
  for (const d of card.shadowRoot.querySelectorAll(".tray details")) d.open = true;
  const item = $(card, '.tray [data-key="d_amp_cast"]');
  assert.ok(item, "the Cast device waits in the tray");
  const [x, y] = clientAt(card, 1, 1);
  pointer(item, "pointerdown", 790, 390);
  pointer(item, "pointermove", x + 2, y + 1);
  pointer(item, "pointerup", x + 2, y + 1);
  const point = card._doc.floors[0].points.find((p) => p.device_id === "d_climate");
  assert.deepEqual(point.also, ["d_amp_cast"]);
  assert.ok(!card._doc.floors[0].points.some((p) => p.device_id === "d_amp_cast"), "not a point of its own");
  assert.ok(!$(card, '.tray [data-key="d_amp_cast"]'));
});

test("the point panel lists joined devices; separating one puts it back in the tray", async () => {
  const card = await make({ plan: planOf([{ ...pt("d_climate", 1, 1), also: ["d_amp_cast"] }]) }, stage2Hass());
  await settle();
  click($(card, "[data-action=edit]"));
  const [x, y] = clientAt(card, 1, 1);
  pointer(markerOf(card, "d_climate"), "pointerdown", x, y);
  pointer(markerOf(card, "d_climate"), "pointerup", x, y);
  const button = $(card, '.point-panel [data-action="separate"][data-device="d_amp_cast"]');
  assert.ok(button, $(card, ".point-panel")?.innerHTML);
  assert.ok($(card, ".point-panel").textContent.includes("Speaker (Cast)"));
  click(button);
  assert.ok(!("also" in card._doc.floors[0].points[0]));
  for (const d of card.shadowRoot.querySelectorAll(".tray details")) d.open = true;
  assert.ok($(card, '.tray [data-key="d_amp_cast"]'), "back in the tray");
});

test("hovering or tapping a point draws its registry links; nothing else does", async () => {
  const pts = [pt("d_mesh", 6, 1), pt("d_bulb1", 1, 1), pt("d_bulb2", 3, 1), pt("d_climate", 2, 3)];
  const card = await make({ plan: planOf(pts) }, stage2Hass());
  await settle();
  const links = () => card.shadowRoot.querySelectorAll("line.link").length;
  assert.equal(links(), 0, "no links until a point is hovered");
  const [mx, my] = clientAt(card, 6, 1);
  pointer(markerOf(card, "d_mesh"), "pointermove", mx, my);
  assert.equal(links(), 2, "the hub to both bulbs");
  const [bx, by] = clientAt(card, 1, 1);
  pointer(markerOf(card, "d_bulb1"), "pointermove", bx, by);
  assert.equal(links(), 1, "a bulb to its hub");
  const [cx, cy] = clientAt(card, 2, 3);
  pointer(markerOf(card, "d_climate"), "pointermove", cx, cy);
  assert.equal(links(), 0, "a point with no registry link");
  click($(card, "[data-action=edit]"));
  pointer(markerOf(card, "d_mesh"), "pointerdown", mx, my);
  pointer(markerOf(card, "d_mesh"), "pointerup", mx, my);
  assert.equal(links(), 2, "a tapped point keeps its links while picked");
});

test("a joined point's tooltip names every device it stands for", async () => {
  const card = await make({ plan: planOf([{ ...pt("d_climate", 1, 1), also: ["d_amp_cast"] }]) }, stage2Hass());
  await settle();
  const [x, y] = clientAt(card, 1, 1);
  pointer(markerOf(card, "d_climate"), "pointermove", x, y);
  const text = $(card, ".tip").textContent;
  assert.ok(text.includes("Climate sensor") && text.includes("Speaker (Cast)"), text);
});

// ---- clusters: a room's unplaced devices as one dot that opens into their list ----------------

const clusterOf = (card, area) => $(card, `g.cluster[data-cluster="${area}"]`);

test("a room's unplaced devices are one dot with their count; placed ones and a lone one are not", async () => {
  const card = await make({ plan: planOf([pt("d_bulb2", 1, 3)]) }, stage2Hass());
  await settle();
  click($(card, "[data-action=edit]"));
  // Living room: climate, dimmer, bulb 1 put down by edit mode (bulb 2 is placed); kitchen: the mesh node and the plant.
  const living = clusterOf(card, "living_room");
  assert.ok(living, card.shadowRoot.querySelector("svg").innerHTML.slice(0, 300));
  assert.equal(living.querySelector("text").textContent, "3");
  for (const key of ["d_climate", "d_dimmer", "d_bulb1"]) assert.ok(!markerOf(card, key), `${key} is in the cluster`);
  assert.ok(markerOf(card, "d_bulb2"), "a placed device keeps its own marker");
  assert.equal(clusterOf(card, "kitchen").querySelector("text").textContent, "2");
  const lone = await make({ plan: planOf([{ device_id: "d_climate", x: 1, y: 1, placed: false }]) }, hassOf());
  assert.ok(markerOf(lone, "d_climate") && !$(lone, "g.cluster"), "one unplaced device is its own marker");
});

test("tapping a cluster lists its devices; dragging one out places it and the count drops", async () => {
  const card = await make({ plan: planOf() }, stage2Hass());
  await settle();
  click($(card, "[data-action=edit]"));
  const living = clusterOf(card, "living_room");
  const [cx, cy] = living.getAttribute("transform").match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
  const [sx, sy] = clientAt(card, cx, cy);
  pointer(living, "pointerdown", sx, sy);
  pointer(living, "pointerup", sx, sy);
  const items = [...card.shadowRoot.querySelectorAll(".cluster-list [data-point]")];
  assert.deepEqual(items.map((n) => n.getAttribute("data-point")).sort(), ["d_bulb1", "d_bulb2", "d_climate", "d_dimmer"]);
  assert.ok(items.every((n) => n.querySelector(".dot")), "each with its category's dot");
  assert.ok($(card, ".cluster-list").textContent.includes("Climate sensor"));
  const item = $(card, '.cluster-list [data-point="d_climate"]');
  const [ex, ey] = clientAt(card, 4, 3);
  pointer(item, "pointerdown", 100, 100);
  pointer(item, "pointermove", ex, ey);
  assert.ok($(card, ".cluster-list").hidden, "the list is out of the way while a device is dragged");
  pointer(item, "pointerup", ex, ey);
  assert.ok(!$(card, ".cluster-list").hidden, "and back after the drop");
  const climate = card._doc.floors[0].points.find((p) => p.device_id === "d_climate");
  assert.ok(climate.placed && Math.abs(climate.x - 4) < 1e-6 && Math.abs(climate.y - 3) < 1e-6, JSON.stringify(climate));
  assert.ok(markerOf(card, "d_climate"), "placed: its own marker now");
  assert.equal(clusterOf(card, "living_room").querySelector("text").textContent, "3");
  assert.equal(card.shadowRoot.querySelectorAll(".cluster-list [data-point]").length, 3, "the list stays open, shorter");
});

test("a link to a device inside a cluster ends at the cluster's dot, named", async () => {
  // The hub is placed; both bulbs wait unplaced in the living room's cluster with the climate sensor.
  const plan = planOf([pt("d_mesh", 6, 1), { device_id: "d_bulb1", x: 2, y: 2, placed: false },
    { device_id: "d_bulb2", x: 2.2, y: 2, placed: false }, { device_id: "d_climate", x: 2.4, y: 2, placed: false }]);
  const card = await make({ plan }, stage2Hass());
  await settle();
  const [mx, my] = clientAt(card, 6, 1);
  pointer(markerOf(card, "d_mesh"), "pointermove", mx, my);
  const lines = [...card.shadowRoot.querySelectorAll("line.link")];
  assert.equal(lines.length, 1, "one line to the cluster, not one per hidden bulb");
  const [cx, cy] = clusterOf(card, "living_room").getAttribute("transform").match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
  assert.ok(Math.abs(Number(lines[0].getAttribute("x2")) - cx) < 1e-6 && Math.abs(Number(lines[0].getAttribute("y2")) - cy) < 1e-6);
  const label = $(card, "text.link-label");
  assert.ok(label && label.textContent.includes("Bulb 1") && label.textContent.includes("Bulb 2"), label?.textContent);
});

test("a link label names two devices of a cluster, then counts the rest", async () => {
  const hass = stage2Hass();
  for (const n of [3, 4, 5]) {
    hass.devices[`d_bulb${n}`] = { id: `d_bulb${n}`, name: `Bulb ${n}`, area_id: "living_room", via_device_id: "d_mesh" };
    hass.entities[`light.bulb${n}`] = { entity_id: `light.bulb${n}`, device_id: `d_bulb${n}`, platform: "hue" };
    hass.states[`light.bulb${n}`] = { state: "on", attributes: {} };
  }
  const bulbs = [1, 2, 3, 4, 5].map((n, i) => ({ device_id: `d_bulb${n}`, x: 2 + i * 0.1, y: 2, placed: false }));
  const card = await make({ plan: planOf([pt("d_mesh", 6, 1), ...bulbs]) }, hass);
  await settle();
  const [mx, my] = clientAt(card, 6, 1);
  pointer(markerOf(card, "d_mesh"), "pointermove", mx, my);
  assert.equal($(card, "text.link-label").textContent, "Bulb 1, Bulb 2 +3");
});

test("a tap elsewhere closes the cluster list; hovering a cluster names its devices", async () => {
  const card = await make({ plan: planOf() }, stage2Hass());
  await settle();
  click($(card, "[data-action=edit]"));
  const living = clusterOf(card, "living_room");
  const [cx, cy] = living.getAttribute("transform").match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
  const [sx, sy] = clientAt(card, cx, cy);
  pointer(living, "pointermove", sx, sy);
  assert.ok($(card, ".tip").textContent.includes("Bulb 1"), $(card, ".tip").textContent);
  pointer(clusterOf(card, "living_room"), "pointerdown", sx, sy);
  pointer(clusterOf(card, "living_room"), "pointerup", sx, sy);
  assert.ok($(card, ".cluster-list [data-point]"));
  const [rx, ry] = clientAt(card, 6.5, 3.5);
  pointer($(card, "polygon.room"), "pointerdown", rx, ry);
  pointer($(card, "polygon.room"), "pointerup", rx, ry);
  assert.ok(!$(card, ".cluster-list [data-point]"), "closed");
});

// ---- roles: a radar wired to a Bluetooth proxy ------------------------------------------------

function radarHass() {
  const hass = categoryHass();
  hass.devices.d_proxy = { id: "d_proxy", name: "Office proxy", area_id: "kitchen" };
  hass.devices.d_adapter = { id: "d_adapter", name: "Adapter", via_device_id: "d_proxy" };
  Object.assign(hass.entities, {
    "binary_sensor.proxy_presence": { entity_id: "binary_sensor.proxy_presence", device_id: "d_proxy", platform: "esphome", original_name: "Presence" },
    "light.proxy_led": { entity_id: "light.proxy_led", device_id: "d_proxy", platform: "esphome" },
  });
  Object.assign(hass.states, {
    "binary_sensor.proxy_presence": { state: "on", attributes: { device_class: "occupancy" } },
    "light.proxy_led": { state: "off", attributes: {} },
  });
  return hass;
}

test("a further role is a ring in its colour around the dot", async () => {
  const card = await make({ plan: planOf([pt("d_proxy", 6, 1), pt("d_climate", 1, 1)]) }, radarHass());
  await settle();
  const proxy = markerOf(card, "d_proxy");
  assert.equal(proxy.firstElementChild.tagName.toLowerCase(), "polygon", "still a radio's diamond");
  const rings = [...proxy.querySelectorAll("circle.role-ring")];
  assert.equal(rings.length, 1);
  assert.match(rings[0].getAttribute("style"), /--floorplan-security/);
  assert.equal(markerOf(card, "d_climate").querySelectorAll("circle.role-ring").length, 0);
});

test("a dot shows while any of its roles' layers is on; the chips list every role", async () => {
  window.localStorage.clear();
  const card = await make({ plan: planOf([pt("d_proxy", 6, 1)]) }, radarHass());
  await settle();
  const chip = (id) => $(card, `.layers [data-layer="${id}"]`);
  assert.ok(chip("radio") && chip("security"), "both of its roles have a chip");
  click(chip("radio"));
  assert.ok(markerOf(card, "d_proxy"), "radio off, presence on: still shown");
  click(chip("security"));
  assert.ok(!markerOf(card, "d_proxy"), "both off: hidden");
  window.localStorage.clear();
});

test("the tooltip lists a device's presence sensors with their state", async () => {
  const card = await make({ plan: planOf([pt("d_proxy", 6, 1)]) }, radarHass());
  await settle();
  const [x, y] = clientAt(card, 6, 1);
  pointer(markerOf(card, "d_proxy"), "pointermove", x, y);
  assert.ok($(card, ".tip").textContent.includes("Presence: on"), $(card, ".tip").textContent);
});

test("the tooltip names a dot's category and what its ring means", async () => {
  const card = await make({ plan: planOf([pt("d_proxy", 6, 1), pt("d_climate", 1, 1)]) }, radarHass());
  await settle();
  const [x, y] = clientAt(card, 6, 1);
  pointer(markerOf(card, "d_proxy"), "pointermove", x, y);
  const tip = $(card, ".tip");
  assert.ok(tip.textContent.includes("Radios and hubs"), tip.textContent);
  assert.ok(tip.textContent.includes(`${EN("card.floorplan.roles.also")} Presence and security`), tip.textContent);
  assert.match(tip.querySelector(".tip-roles .ring").getAttribute("style"), /--floorplan-security/);
  const [cx, cy] = clientAt(card, 1, 1);
  pointer(markerOf(card, "d_climate"), "pointermove", cx, cy);
  assert.ok(tip.textContent.includes("Climate") && !tip.querySelector(".tip-roles .ring"), "no ring, no ring line");
});

test("the layer bar explains the rings when a dot has one", async () => {
  const card = await make({ plan: planOf([pt("d_proxy", 6, 1)]) }, radarHass());
  await settle();
  assert.ok($(card, ".layers .ring-legend")?.textContent.includes(EN("card.floorplan.roles.legend")));
  const plain = await make({ plan: planOf([pt("d_climate", 1, 1)]) }, radarHass());
  await settle();
  assert.ok(!$(plain, ".layers .ring-legend"), "no ring on the plan, no legend");
});

// ---- reading labels laid out clear of walls and each other ------------------------------------

test("a dot's readings go above it when below would cross a wall", async () => {
  const card = await make({ plan: planOf([pt("d_climate", 2, 3.95)]) }, hassOf());
  const texts = [...markerOf(card, "d_climate").querySelectorAll("text.value")];
  assert.equal(texts.length, 2);
  assert.ok(texts.every((t) => Number(t.getAttribute("y")) < 0), texts.map((t) => t.getAttribute("y")).join());
});

test("readings that cannot stay beside their dot get a leader line to it", async () => {
  // The climate sensor's two readings in a ring of eight unrelated dots, apart enough not to stack.
  const ring = [[2, 1.75], [2, 2.25], [1.75, 2], [2.25, 2], [1.82, 1.82], [2.18, 2.18], [1.82, 2.18], [2.18, 1.82]];
  const hass = hassOf();
  ring.forEach((_, i) => {
    hass.devices[`d_r${i}`] = { id: `d_r${i}`, name: `Dot ${i}`, area_id: "living_room" };
    hass.entities[`light.r${i}`] = { entity_id: `light.r${i}`, device_id: `d_r${i}`, platform: "hue" };
    hass.states[`light.r${i}`] = { state: "on", attributes: {} };
  });
  const card = await make({ plan: planOf([pt("d_climate", 2, 2), ...ring.map((at, i) => pt(`d_r${i}`, ...at))]) }, hass);
  await settle();
  assert.ok(markerOf(card, "d_climate").querySelector("line.leader"), "a leader to the dot");
});

// ---- dots stay in rooms; a dot dropped on a dot stacks --------------------------------------

function dragMarker(card, key, from, to) {
  const [sx, sy] = clientAt(card, ...from);
  const [ex, ey] = clientAt(card, ...to);
  pointer(markerOf(card, key), "pointerdown", sx, sy);
  pointer($(card, "svg"), "pointermove", ex, ey);
  pointer($(card, "svg"), "pointerup", ex, ey);
}
const pointAt = (card, key) => card._doc.floors[0].points.find((p) => (p.device_id ?? p.entity_id) === key);

test("a dot dragged out of every room stays on the nearest wall, during the drag and after", async () => {
  const card = await make({ plan: planOf([pt("d_climate", 1, 1)]) }, hassOf());
  click($(card, "[data-action=edit]"));
  const [sx, sy] = clientAt(card, 1, 1);
  const [ox, oy] = clientAt(card, -1, 2);
  pointer(markerOf(card, "d_climate"), "pointerdown", sx, sy);
  pointer($(card, "svg"), "pointermove", ox, oy);
  assert.deepEqual([pointAt(card, "d_climate").x, pointAt(card, "d_climate").y], [0, 2], "held at the wall while dragged");
  pointer($(card, "svg"), "pointerup", ox, oy);
  assert.deepEqual([pointAt(card, "d_climate").x, pointAt(card, "d_climate").y], [0, 2]);
  dragMarker(card, "d_climate", [0, 2], [3, 6]);
  assert.deepEqual([pointAt(card, "d_climate").x, pointAt(card, "d_climate").y], [3, 4]);
  dragMarker(card, "d_climate", [3, 4], [6, 2]);
  assert.deepEqual([pointAt(card, "d_climate").x, pointAt(card, "d_climate").y], [6, 2], "into another room is fine");
});

test("a device dropped from the tray outside every room lands on the nearest wall", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  for (const d of card.shadowRoot.querySelectorAll(".tray details")) d.open = true;
  const item = $(card, '.tray [data-key="d_office"]');
  const [ex, ey] = clientAt(card, 9, 2);
  pointer(item, "pointerdown", 790, 390);
  pointer(item, "pointermove", ex, ey);
  pointer(item, "pointerup", ex, ey);
  assert.deepEqual([pointAt(card, "d_office").x, pointAt(card, "d_office").y], [8, 2]);
});

test("a dot dropped on another dot snaps onto it and the two become one dot with their list", async () => {
  const card = await make({ plan: planOf([pt("d_climate", 1, 1), pt("d_lamp", 3, 2)]) }, categoryHass());
  await settle();
  click($(card, "[data-action=edit]"));
  dragMarker(card, "d_climate", [1, 1], [3.05, 2.03]);
  assert.deepEqual([pointAt(card, "d_climate").x, pointAt(card, "d_climate").y], [3, 2], "snapped onto the other dot");
  assert.ok(pointAt(card, "d_climate").placed);
  const stack = $(card, 'g.cluster[data-cluster^="at:"]');
  assert.ok(stack, "one dot for both");
  assert.equal(stack.querySelector("text").textContent, "2");
  assert.ok(!markerOf(card, "d_climate") && !markerOf(card, "d_lamp"));
  const [cx, cy] = clientAt(card, 3, 2);
  pointer(stack, "pointerdown", cx, cy);
  pointer(stack, "pointerup", cx, cy);
  assert.deepEqual([...card.shadowRoot.querySelectorAll(".cluster-list [data-point]")].map((n) => n.getAttribute("data-point")).sort(),
    ["d_climate", "d_lamp"]);
  const item = $(card, '.cluster-list [data-point="d_lamp"]');
  const [ex, ey] = clientAt(card, 4, 3);
  pointer(item, "pointerdown", 100, 100);
  pointer(item, "pointermove", ex, ey);
  pointer(item, "pointerup", ex, ey);
  assert.ok(markerOf(card, "d_lamp") && markerOf(card, "d_climate"), "dragged out: two markers again");
  assert.ok(!$(card, 'g.cluster[data-cluster^="at:"]'));
});

test("placed dots too close to tell apart on screen are one dot; zoomed in they part", async () => {
  // Two lamps on one spot and a third 7 mm off: the third used to hide under the stack's dot.
  const pts = [pt("d_lamp", 2.071, 3.528), pt("d_dimmer", 2.071, 3.528), pt("d_climate", 2.078, 3.527)];
  const card = await make({ plan: planOf(pts) }, categoryHass());
  await settle();
  const stack = $(card, 'g.cluster[data-cluster^="at:"]');
  assert.equal(stack?.querySelector("text").textContent, "3");
  assert.ok(!markerOf(card, "d_climate"), "no marker hidden under the dot");
  const far = await make({ plan: planOf([pt("d_lamp", 2, 2), pt("d_climate", 2.1, 2)]) }, categoryHass());
  await settle();
  assert.ok($(far, 'g.cluster[data-cluster^="at:"]'), "10 cm at the fitted zoom (about 10 px): one dot");
  for (let i = 0; i < 12; i++) click($(far, "[data-action=zoom_in]"));
  assert.ok(!$(far, 'g.cluster[data-cluster^="at:"]') && markerOf(far, "d_lamp") && markerOf(far, "d_climate"),
    "zoomed in: two markers");
});

test("a dot dropped near, not on, another dot keeps its place", async () => {
  const card = await make({ plan: planOf([pt("d_climate", 1, 1), pt("d_lamp", 3, 2)]) }, categoryHass());
  await settle();
  click($(card, "[data-action=edit]"));
  dragMarker(card, "d_climate", [1, 1], [3.6, 2]);
  assert.deepEqual([pointAt(card, "d_climate").x, pointAt(card, "d_climate").y], [3.6, 2]);
  assert.ok(!$(card, 'g.cluster[data-cluster^="at:"]'));
});

test("a sensor dragged from the tray lands on the plan, placed", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  const item = $(card, '.tray [data-key="d_office"]');
  const [ex, ey] = clientAt(card, 6, 3);
  pointer(item, "pointerdown", 790, 390);
  pointer(item, "pointermove", ex, ey);
  pointer(item, "pointerup", ex, ey);
  const point = card._doc.floors[0].points.find((p) => p.device_id === "d_office");
  assert.ok(point && point.placed && Math.abs(point.x - 6) < 1e-9 && Math.abs(point.y - 3) < 1e-9, JSON.stringify(point));
  assert.equal($(card, '.tray [data-key="d_office"]'), null);
});

test("values show the temperature and humidity of one device on one marker", async () => {
  const card = await make({ plan: planOf([{ device_id: "d_climate", x: 1, y: 1, placed: true }]) }, hassOf({ admin: false }));
  const markers = card.shadowRoot.querySelectorAll("g.marker");
  assert.equal(markers.length, 1);
  const text = markers[0].textContent;
  assert.ok(text.includes("21.5 °C") && text.includes("48 %"), text);
  const quiet = await make({ plan: planOf([{ device_id: "d_climate", x: 1, y: 1, placed: true }]), values: false }, hassOf());
  assert.ok(!quiet.shadowRoot.querySelector("g.marker").textContent.includes("21.5"));
});

test("a floor select appears in edit mode when the plan has more than one floor", async () => {
  const plan = planOf();
  plan.floors.push({ floor_id: "upstairs", rooms: [{ area_id: "office", polygon: sq(0, 0, 4, 3) }], points: [] });
  const card = await make({ plan, floor: "upstairs" }, hassOf());
  assert.equal(card.shadowRoot.querySelectorAll("polygon.room").length, 1);
  click($(card, "[data-action=edit]"));
  const select = $(card, "select.floor");
  assert.ok(select);
  select.value = "ground";
  select.dispatchEvent(new window.Event("change", { bubbles: true, composed: true }));
  assert.equal(card.shadowRoot.querySelectorAll("polygon.room").length, 2);
});

test("a plan with no floors shows the hint and edits as one empty floor", async () => {
  const card = await make({ plan: { schema: 1, floors: [] } }, hassOf());
  assert.ok(shadowText(card).includes(EN("card.floorplan.hint.empty")), shadowText(card));
  click($(card, "[data-action=edit]"));
  assert.ok($(card, '.tray [data-key="d_climate"]'));
  click($(card, '[data-action=tool][data-tool="split"]'));
  tap(card, 1, 1);
  tap(card, 2, 2);
  assert.equal($(card, ".area-panel select"), null);
  click($(card, "[data-action=cancel]"));
  assert.ok(shadowText(card).includes(EN("card.floorplan.hint.empty")));
});

test("a pointerup that never came does not leave the card pinching", async () => {
  const card = await make({ plan: planOf() }, hassOf({ admin: false }));
  const svg = $(card, "svg");
  pointer(svg, "pointerdown", 100, 100, 7, true);              // its pointerup is lost
  const [x0, , w0] = svg.getAttribute("viewBox").split(" ").map(Number);
  pointer(svg, "pointerdown", 400, 200, 8, true);
  pointer(svg, "pointermove", 450, 200, 8);
  pointer(svg, "pointerup", 450, 200, 8);
  const [x1, , w1] = svg.getAttribute("viewBox").split(" ").map(Number);
  assert.equal(w1, w0, "no zoom");
  assert.ok(x1 < x0, `panned: ${x0} -> ${x1}`);
});

test("lostpointercapture ends a drag", async () => {
  const card = await make({ plan: planOf() }, hassOf({ admin: false }));
  const svg = $(card, "svg");
  pointer(svg, "pointerdown", 100, 100, 3);
  pointer(svg, "lostpointercapture", 100, 100, 3);
  assert.equal(card._pointers.size, 0);
  assert.equal(card._drag, null);
});

test("a new reading while editing keeps the typed area name and redraws the value", async () => {
  const hass = hassOf();
  const card = await make({ plan: planOf([{ device_id: "d_climate", x: 1, y: 1, placed: true }]) }, hass);
  click($(card, "[data-action=edit]"));
  tap(card, 6, 2, $(card, 'polygon.room[data-area="kitchen"]'));
  const input = $(card, ".area-panel input");
  input.value = "Pan";
  card.hass = { ...hass, states: { ...hass.states,
    "sensor.alex_temperature": { ...hass.states["sensor.alex_temperature"], state: "22.0" } } };
  assert.equal($(card, ".area-panel input"), input);
  assert.equal(input.value, "Pan");
  assert.ok($(card, 'g.marker[data-key="d_climate"]').textContent.includes("22.0 °C"));
});

test("an area created from the card shows by name once Home Assistant lists it", async () => {
  const hass = hassOf({ answers: { "config/area_registry/create": (msg) => ({ area_id: "pantry", name: msg.name }) } });
  const card = await make({ plan: planOf() }, hass);
  click($(card, "[data-action=edit]"));
  tap(card, 6, 2, $(card, 'polygon.room[data-area="kitchen"]'));
  $(card, ".area-panel input").value = "Pantry";
  click($(card, "[data-action=create_area]"));
  await settle();
  card.hass = { ...hass, areas: { ...hass.areas, pantry: { area_id: "pantry", name: "Pantry" } } };
  assert.ok($(card, "svg").textContent.includes("Pantry"), $(card, "svg").textContent);
});

test("cancel is disabled while saving", async () => {
  let release;
  const dashboard = dashboardOf(planOf());
  const hass = hassOf({ answers: { "lovelace/config": () => structuredClone(dashboard),
    "lovelace/config/save": () => new Promise((resolve) => { release = resolve; }) } });
  const card = await make({}, hass);
  click($(card, "[data-action=edit]"));
  tap(card, 6, 2, $(card, 'polygon.room[data-area="kitchen"]'));
  click($(card, '[data-action=tool][data-tool="join"]'));
  tap(card, 2, 2, $(card, 'polygon.room[data-area="living_room"]'));
  tap(card, 6, 2, $(card, 'polygon.room[data-area="kitchen"]'));
  assert.ok(!$(card, "[data-action=save]").disabled, "the join made the plan dirty");
  click($(card, "[data-action=save]"));
  await settle();
  assert.ok($(card, "[data-action=cancel]").disabled);
  release();
  await settle();
});

// ---- Task 9: grouped tray, grid, dimensions --------------------------------------------------

const EMPTY_PLAN = () => ({ schema: 1, floors: [{ floor_id: "ground", rooms: [], points: [] }] });
// A second sensor in the office, so its tray group holds two.
function officeHass(opts) {
  const hass = hassOf(opts);
  hass.devices.d_office2 = { id: "d_office2", name: "Desk sensor", area_id: "office" };
  hass.entities["sensor.desk_co2"] = { entity_id: "sensor.desk_co2", device_id: "d_office2" };
  hass.states["sensor.desk_co2"] = { state: "600", attributes: { device_class: "carbon_dioxide", unit_of_measurement: "ppm" } };
  return hass;
}
const group = (card, key) => $(card, `.tray details[data-group="${key}"]`);
const summary = (card, key) => $(card, `.tray summary[data-group="${key}"]`);
const tapNode = (node) => {
  pointer(node, "pointerdown", 790, 390);
  pointer(node, "pointerup", 790, 390);
};

test("the tray groups sensors by room, collapsed, with counts", async () => {
  const card = await make({ plan: EMPTY_PLAN() }, officeHass());
  click($(card, "[data-action=edit]"));
  const groups = [...card.shadowRoot.querySelectorAll(".tray details[data-group]")];
  assert.deepEqual(groups.map((g) => g.getAttribute("data-group")), ["kitchen", "living_room", "office"]);
  assert.ok(groups.every((g) => !g.hasAttribute("open")), "all collapsed when there are several");
  assert.ok(summary(card, "office").textContent.includes("Office"));
  assert.ok(summary(card, "office").textContent.includes("2"), summary(card, "office").textContent);
  assert.deepEqual([...group(card, "office").querySelectorAll("[data-key]")].map((n) => n.getAttribute("data-key")),
    ["d_office2", "d_office"], "items by name: Desk sensor, Office sensor");
});

test("one group starts open; sensors without a room are grouped last under the no-room name", async () => {
  const hass = hassOf();
  hass.entities["sensor.alex_temperature"].device_id = null;
  hass.entities["sensor.alex_humidity"].device_id = null;
  delete hass.entities["sensor.office_temperature"];
  delete hass.states["sensor.office_temperature"];
  const card = await make({ plan: planOf() }, hass);
  click($(card, "[data-action=edit]"));
  const groups = [...card.shadowRoot.querySelectorAll(".tray details[data-group]")];
  assert.deepEqual(groups.map((g) => g.getAttribute("data-group")), ["none"]);
  assert.ok(groups[0].hasAttribute("open"));
  assert.ok(groups[0].textContent.includes(EN("card.floorplan.tray.no_room")), groups[0].textContent);
});

test("a tap on a group's summary opens it, and it stays open through a hass update", async () => {
  const hass = officeHass();
  const card = await make({ plan: EMPTY_PLAN() }, hass);
  click($(card, "[data-action=edit]"));
  tapNode(summary(card, "office"));
  assert.ok(group(card, "office").hasAttribute("open"));
  assert.ok(!group(card, "kitchen").hasAttribute("open"));
  // A renamed area changes the stamp's first line: a full render.
  card.hass = { ...hass, areas: { ...hass.areas, kitchen: { area_id: "kitchen", name: "Galley" } } };
  assert.ok(summary(card, "kitchen").textContent.includes("Galley"), "re-rendered");
  assert.ok(group(card, "office").hasAttribute("open"));
  tapNode(summary(card, "office"));
  assert.ok(!group(card, "office").hasAttribute("open"));
  const press = new window.MouseEvent("click", { bubbles: true, composed: true, cancelable: true, detail: 0 });
  summary(card, "office").dispatchEvent(press);
  assert.ok(group(card, "office").hasAttribute("open"), "a keyboard click (detail 0) toggles it too");
  assert.ok(press.defaultPrevented, "the details element does not toggle itself as well");
});

test("a group dragged onto the plan places all its sensors round the drop point, not placed", async () => {
  const card = await make({ plan: EMPTY_PLAN() }, officeHass());
  click($(card, "[data-action=edit]"));
  const node = summary(card, "office");
  const [ex, ey] = clientAt(card, 3, 2);
  pointer(node, "pointerdown", 790, 390);
  pointer(node, "pointermove", ex, ey);
  pointer(node, "pointerup", ex, ey);
  const points = card._doc.floors[0].points;
  assert.deepEqual(points.map((p) => p.device_id).sort(), ["d_office", "d_office2"]);
  assert.ok(points.every((p) => p.placed === false));
  for (const p of points) assert.ok(Math.abs(Math.hypot(p.x - 3, p.y - 2) - 0.3) < 0.002, JSON.stringify(p));
  assert.equal(group(card, "office"), null, "the group left the tray");
  assert.ok(group(card, "kitchen"));
});

test("a corner dropped with nothing near snaps to the 5 cm grid", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  drag(card, [0, 4], [0.12, 4.33], corner(card, "living_room", 3));
  assert.deepEqual(card._doc.floors[0].rooms[0].polygon[3], [0.1, 4.35]);
});

test("an inserted corner and the ends of a split go to the grid along their wall", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  const edge = $(card, 'line.edge[data-area="kitchen"][data-edge="0"]');   // (5,0)–(8,0)
  const [cx, cy] = clientAt(card, 6.03, 0);
  edge.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, composed: true, clientX: cx, clientY: cy }));
  assert.deepEqual(card._doc.floors[0].rooms[1].polygon[1], [6.05, 0]);
  click($(card, '[data-action=tool][data-tool="split"]'));
  tap(card, 2.52, 0.01);
  tap(card, 2.52, 3.99);
  assert.deepEqual(card._pendingSplit.a.map((v) => Math.round(v * 1e6) / 1e6), [2.5, 0]);
  assert.deepEqual(card._pendingSplit.b.map((v) => Math.round(v * 1e6) / 1e6), [2.5, 4]);
});

const texts = (card, sel) => [...card.shadowRoot.querySelectorAll(sel)].map((n) => n.textContent);

test("edit mode: a grid, every room's floor area, and the selected room's wall lengths (pl: comma)", async () => {
  const card = await make({ plan: planOf() }, hassOf({ language: "pl" }));
  assert.equal(card.shadowRoot.querySelectorAll("line.grid").length, 0, "no grid in view mode");
  assert.deepEqual(texts(card, "text.dim"), [], "no dimensions in view mode");
  click($(card, "[data-action=edit]"));
  assert.ok(card.shadowRoot.querySelectorAll("line.grid").length > 0);
  const m2 = at(LANGS.pl, "card.floorplan.units.m2");
  assert.deepEqual(texts(card, "text.dim.area"), [`20,0 ${m2}`, `12,0 ${m2}`]);
  assert.deepEqual(texts(card, "text.dim.wall"), [], "no room selected yet");
  tap(card, 2, 2, $(card, 'polygon.room[data-area="living_room"]'));
  const m = at(LANGS.pl, "card.floorplan.units.m");
  assert.deepEqual(texts(card, "text.dim.wall"), [`5,00 ${m}`, `4,00 ${m}`, `5,00 ${m}`, `4,00 ${m}`]);
});

test("while a corner is dragged its room's wall lengths follow it", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  const [sx, sy] = clientAt(card, 5, 0);
  const [ex, ey] = clientAt(card, 5.5, 0);
  pointer(corner(card, "living_room", 1), "pointerdown", sx, sy);
  pointer($(card, "svg"), "pointermove", ex, ey);
  assert.deepEqual(texts(card, "text.dim.wall"), ["5.50 m", "4.03 m", "5.00 m", "4.00 m"]);
  assert.ok(texts(card, "text.dim.area").includes("21.0 m²"), texts(card, "text.dim.area").join(" "));
  pointer($(card, "svg"), "pointerup", ex, ey);
  assert.deepEqual(texts(card, "text.dim.wall"), [], "nothing selected once the drag is over");
});

test("a group tap keeps a half-typed area name", async () => {
  const card = await make({ plan: planOf() }, officeHass());
  click($(card, "[data-action=edit]"));
  tap(card, 2, 2, $(card, 'polygon.room[data-area="living_room"]'));
  const input = $(card, ".area-panel input");
  input.value = "Pantr";
  const wasOpen = group(card, "office").hasAttribute("open");     // the lone group starts open
  tapNode(summary(card, "office"));
  assert.equal(group(card, "office").hasAttribute("open"), !wasOpen);
  // ok, not equal: a failing equal on a DOM node renders the whole happy-dom graph and never ends.
  assert.ok($(card, ".area-panel input") === input, "the panel was not rebuilt");
  assert.equal(input.value, "Pantr");
  tapNode(summary(card, "office"));
  assert.equal($(card, ".area-panel input").value, "Pantr");
});

// ---- maps (Amendment 7) ------------------------------------------------------------------------

function mapsHass(opts) {
  const hass = categoryHass(opts);
  Object.assign(hass.entities, {
    "sensor.alex_co2": { entity_id: "sensor.alex_co2", device_id: "d_climate" },
    "light.dimmer_lamp": { entity_id: "light.dimmer_lamp", device_id: "d_dimmer", platform: "hue" },
  });
  Object.assign(hass.states, {
    "sensor.alex_co2": { state: "900", attributes: { device_class: "carbon_dioxide", unit_of_measurement: "ppm", state_class: "measurement" } },
    "light.lamp": { state: "on", attributes: { brightness: 255 } },
    "light.dimmer_lamp": { state: "off", attributes: {} },
    "plant.monstera": { state: "ok", attributes: { friendly_name: "Monstera",
      sensors: { temperature: "sensor.m_t", brightness: "sensor.m_lx", moisture: "sensor.m_m" } } },
    "sensor.m_t": { state: "19.2", attributes: { device_class: "temperature" } },
    "sensor.m_lx": { state: "640", attributes: { device_class: "illuminance" } },
    "sensor.m_m": { state: "31", attributes: { device_class: "moisture" } },
  });
  return hass;
}
const plantPt = (x, y) => ({ entity_id: "plant.monstera", x, y, placed: true });
const lines = (card, key) => [...markerOf(card, key).querySelectorAll("text.value")].map((n) => [n.textContent, n.classList.contains("main")]);

test("maps: a reading map is heat inside each room, hatched where a room has no sensor", async () => {
  window.localStorage.clear();
  const card = await make({ plan: planOf([pt("d_climate", 1, 1)]), layers: ["climate"] }, mapsHass());
  await settle();
  const chips = [...card.shadowRoot.querySelectorAll(".bar [data-action=map]")].map((b) => b.getAttribute("data-map"));
  assert.deepEqual(chips, ["temperature", "humidity", "carbon_dioxide"]);
  const cells = card.shadowRoot.querySelectorAll(".heat rect");
  assert.ok(cells.length > 0);
  for (const c of cells) assert.ok(Number(c.getAttribute("x")) < 5, "heat stays in the living room");
  assert.equal(card.shadowRoot.querySelectorAll(".heat .no-sensor").length, 1, "the kitchen is hatched");
  const legend = $(card, ".bar .legend");
  assert.ok(legend, "the legend sits in the bar, never over the plan");
  assert.ok(!$(card, ".body .legend"));
  assert.ok(legend.textContent.includes("17.0 °C") && legend.textContent.includes("24.0 °C"), legend.textContent);
  assert.ok(legend.textContent.includes(EN("card.floorplan.maps.no_sensor")));
  assert.deepEqual(lines(card, "d_climate")[0], ["21.5 °C", true], "the map's reading first, marked");
  click($(card, '.bar [data-map="carbon_dioxide"]'));
  assert.deepEqual(lines(card, "d_climate")[0], ["900 ppm", true]);
  const again = await make({ plan: planOf([pt("d_climate", 1, 1)]), layers: ["climate"] }, mapsHass());
  await settle();
  assert.equal($(again, '.bar [data-map="carbon_dioxide"]').getAttribute("aria-pressed"), "true", "remembered");
  window.localStorage.clear();
});

test("maps: a plant shows its three readings, and a point of another layer counts on the map", async () => {
  window.localStorage.clear();
  const card = await make({ plan: planOf([plantPt(6, 1), pt("d_climate", 1, 1)]), layers: ["plants"] }, mapsHass());
  await settle();
  assert.deepEqual(lines(card, "plant.monstera"), [["640 lx", true], ["19.2 °C", false], ["31 %", false]]);
  click($(card, '.bar [data-map="temperature"]'));
  assert.ok(markerOf(card, "d_climate"), "a room thermometer counts on the plants' temperature map");
  assert.equal(card.shadowRoot.querySelectorAll(".heat .no-sensor").length, 0, "both rooms have a temperature");
  window.localStorage.clear();
});

test("maps: 24 h shows each reading's figure from the hourly statistics", async () => {
  window.localStorage.clear();
  const rows = (vals) => vals.map(([mean, min, max]) => ({ start: 0, mean, min, max }));
  const hass = mapsHass({ answers: { "recorder/statistics_during_period": {
    "sensor.alex_temperature": rows([[20, 18, 22], [22, 21, 24]]),
    "sensor.alex_co2": rows([[700, 500, 1200]]),
  } } });
  const card = await make({ plan: planOf([pt("d_climate", 1, 1), { ...pt("d_office", 6, 1), placed: false }]), layers: ["climate"] }, hass);
  await settle();
  click($(card, '.bar [data-action=day][data-day="1"]'));
  await settle();
  const call = hass.calls.find((c) => c.type === "recorder/statistics_during_period");
  assert.deepEqual(call.types, ["mean", "min", "max"]);
  assert.equal(call.period, "hour");
  assert.deepEqual(call.statistic_ids, ["sensor.alex_co2", "sensor.alex_humidity", "sensor.alex_temperature",
    "sensor.office_temperature"], "an unplaced point's too: its label shows the figure");
  assert.ok(Math.abs(Date.parse(call.start_time) - (Date.now() - 24 * 3600e3)) < 60e3);
  assert.deepEqual(lines(card, "d_climate"), [["21.0 °C", true], ["1200 ppm", false]],
    "temperature: the mean; CO2: the highest; humidity without statistics left out");
  click($(card, '.bar [data-map="carbon_dioxide"]'));
  assert.ok(shadowText(card).includes("24 h, highest"));
  window.localStorage.clear();
});

// The living room names its own sensor; a thermometer on an amplifier stands in its corner.
function roomSensorHass(opts) {
  const hass = mapsHass(opts);
  hass.areas.living_room.temperature_entity_id = "sensor.alex_temperature";
  hass.entities["sensor.amp_temperature"] = { entity_id: "sensor.amp_temperature", device_id: null, area_id: "living_room" };
  hass.states["sensor.amp_temperature"] = { state: "33", attributes: { device_class: "temperature", unit_of_measurement: "°C", state_class: "measurement" } };
  return hass;
}
const ampPt = { entity_id: "sensor.amp_temperature", x: 4.5, y: 3.5, placed: true };
const fills = (card, pred) => [...card.shadowRoot.querySelectorAll(".heat rect")]
  .filter((r) => pred(Number(r.getAttribute("x")), Number(r.getAttribute("y")))).map((r) => r.getAttribute("fill"));

test("maps: a room's own sensor colours the room, another sensor in it is a spot", async () => {
  window.localStorage.clear();
  const plan = planOf([pt("d_climate", 1, 1), ampPt]);
  plan.floors[0].open_spaces = [["living_room", "kitchen"]];
  const card = await make({ plan, layers: ["climate"] }, roomSensorHass());
  await settle();
  const far = fills(card, (x, y) => x < 3);
  assert.ok(far.length > 0 && far.every((f) => f === colourAt("temperature", 21.5)), "the room's value away from the amplifier");
  assert.ok(fills(card, (x, y) => x > 4.3 && x < 4.6 && y > 3.3 && y < 3.6).includes(colourAt("temperature", 33)), "hot at the amplifier");
  assert.ok(fills(card, (x) => x > 5 && x < 5.5).length > 0, "the kitchen, open to it, is coloured");
  const [mx, my] = clientAt(card, 1, 1);
  pointer($(card, 'g.marker[data-key="d_climate"]'), "pointermove", mx, my);
  assert.ok(tip(card).textContent.includes(EN("card.floorplan.maps.room_sensor")), tip(card).textContent);
  // Without the area's sensor the amplifier's heat spreads over the room, as before.
  const before = roomSensorHass();
  delete before.areas.living_room.temperature_entity_id;
  const old = await make({ plan, layers: ["climate"] }, before);
  await settle();
  assert.ok(fills(old, (x) => x < 3).some((f) => f !== colourAt("temperature", 21.5)));
  window.localStorage.clear();
});

// Decision record of #219 (agreement 11): the home inputs' selected sensor for a room (option
// `rooms`, as Pocket passes them) is the room's own, ahead of the one its HA area names; the
// home's room name replaces the area's.
test("maps and names: the home inputs' room gives its own sensor and its name", async () => {
  window.localStorage.clear();
  const hass = roomSensorHass();
  delete hass.areas.living_room.temperature_entity_id;
  const rooms = [{ id: "lounge", area: "living_room", name: "Lounge", climate: { temperature: "sensor.alex_temperature" } }];
  const card = await make({ plan: planOf([pt("d_climate", 1, 1), ampPt]), layers: ["climate"], rooms }, hass);
  await settle();
  const far = fills(card, (x, y) => x < 3);
  assert.ok(far.length > 0 && far.every((f) => f === colourAt("temperature", 21.5)), "the selected sensor colours the room");
  assert.ok(shadowText(card).includes("Lounge"), "the home's name for the room");
  window.localStorage.clear();
});

test("maps: a room whose own sensor is unavailable is hatched", async () => {
  window.localStorage.clear();
  const hass = roomSensorHass();
  hass.states["sensor.alex_temperature"] = { state: "unavailable", attributes: { device_class: "temperature" } };
  const card = await make({ plan: planOf([pt("d_climate", 1, 1), ampPt]), layers: ["climate"] }, hass);
  await settle();
  assert.equal(card.shadowRoot.querySelectorAll(".heat .no-sensor").length, 2, "the living room and the kitchen");
  assert.equal(card.shadowRoot.querySelectorAll(".heat rect").length, 0, "no amplifier heat as the room's");
  window.localStorage.clear();
});

test("maps: 24 h takes the room sensor's mean, and fetches it though it is not placed", async () => {
  window.localStorage.clear();
  const rows = (vals) => vals.map((mean) => ({ start: 0, mean, min: mean, max: mean }));
  const hass = roomSensorHass({ answers: { "recorder/statistics_during_period": {
    "sensor.alex_temperature": rows([20, 22]), "sensor.amp_temperature": rows([33]) } } });
  const card = await make({ plan: planOf([ampPt]), layers: ["climate"] }, hass);
  await settle();
  click($(card, '.bar [data-action=day][data-day="1"]'));
  await settle();
  const call = hass.calls.find((c) => c.type === "recorder/statistics_during_period");
  assert.ok(call.statistic_ids.includes("sensor.alex_temperature"), call.statistic_ids.join());
  assert.ok(fills(card, (x) => x < 3).every((f) => f === colourAt("temperature", 21)));
  window.localStorage.clear();
});

test("maps: lamps glow when on and are grey when off, with no 24 h switch", async () => {
  window.localStorage.clear();
  const card = await make({ plan: planOf([pt("d_lamp", 2, 1), pt("d_dimmer", 3, 1)]), layers: ["light"] }, mapsHass());
  await settle();
  click($(card, '.bar [data-map="lamps"]'));
  assert.ok(markerOf(card, "d_lamp").querySelector("circle.glow"));
  assert.ok(!markerOf(card, "d_dimmer").querySelector("circle.glow"));
  assert.match(markerOf(card, "d_dimmer").querySelector(".shape").getAttribute("style"), /disabled-text-color/);
  assert.deepEqual(lines(card, "d_lamp"), [["100 %", false]]);
  assert.deepEqual(lines(card, "d_dimmer"), [["off", false]]);
  assert.ok(!$(card, ".bar [data-action=day]"), "no 24-hour figure for lamps");
  assert.equal(card.shadowRoot.querySelectorAll(".heat").length, 0);
  window.localStorage.clear();
});

test("maps: none in edit mode, with maps: false, or with several layers shown", async () => {
  window.localStorage.clear();
  const pts = [pt("d_climate", 1, 1), pt("d_lamp", 2, 1)];
  const off = await make({ plan: planOf(pts), layers: ["climate"], maps: false }, mapsHass());
  await settle();
  assert.ok(!$(off, ".bar [data-action=map]") && !$(off, ".heat"));
  const several = await make({ plan: planOf(pts) }, mapsHass());
  await settle();
  assert.ok(!$(several, ".bar [data-action=map]"), "climate and light both on: no map");
  click($(several, '.layers [data-layer="light"]'));
  assert.ok($(several, ".bar [data-action=map]"), "climate alone: its maps");
  click($(several, "[data-action=edit]"));
  assert.ok(!$(several, ".heat") && !$(several, ".bar [data-action=map]"));
  window.localStorage.clear();
});

test("layer_choice one: the bars keep their taps; fill sizes the card to the screen", async () => {
  window.localStorage.clear();
  const card = await make({ plan: planOf([pt("d_climate", 1, 1)]), layers: ["climate", "light"], layer_choice: "one", fill: true }, mapsHass());
  await settle();
  assert.ok($(card, ".bar").hasAttribute("data-own-tap"), "zoom, fit and the maps");
  assert.ok($(card, ".layers").hasAttribute("data-own-tap"));
  assert.equal(card.style.height, `${Math.max(280, window.innerHeight - 8)}px`);
  assert.equal(card.getGridOptions().rows, "auto");
  const plain = await make({ plan: planOf() }, mapsHass());
  assert.ok(!$(plain, ".bar").hasAttribute("data-own-tap"));
  assert.equal(plain.style.height, "");
  window.localStorage.clear();
});

test("view mode: a room's name moves off a reading laid over it; edit mode keeps it in the middle", async () => {
  window.localStorage.clear();
  const nameAt = (card, text) => {
    const n = [...card.shadowRoot.querySelectorAll("text.label")].find((x) => x.textContent === text);
    return [Number(n.getAttribute("x")), Number(n.getAttribute("y"))];
  };
  // The kitchen (5..8 x 0..4): its name sits mid-room; a thermometer just above that spot.
  const plan = planOf([pt("d_climate", 6.5, 1.7)]);
  plan.floors[0].points[0].device_id = "d_climate";
  const card = await make({ plan, layers: ["climate"] }, mapsHass());
  await settle();
  const [x, y] = nameAt(card, "Kitchen");
  assert.ok(Math.abs(x - 6.5) > 0.3 || Math.abs(y - 2) > 0.5, `moved off the middle: ${x}, ${y}`);
  click($(card, "[data-action=edit]"));
  const [ex, ey] = nameAt(card, "Kitchen");
  assert.ok(Math.abs(ex - 6.5) < 0.01, `edit mode: in the middle, ${ex}, ${ey}`);
  window.localStorage.clear();
});

test("the plan is laid out again when its size changes, not when it stays", async () => {
  const card = await make({ plan: planOf([pt("d_climate", 1, 1)]) }, mapsHass());
  await settle();
  let draws = 0;
  const draw = card._drawSvg.bind(card);
  card._drawSvg = (...a) => { draws += 1; return draw(...a); };
  card._drawSvg(false);       // drawn at RECT
  draws = 0;
  card._resized();
  assert.equal(draws, 0, "same size: no redraw");
  $(card, "svg").getBoundingClientRect = () => ({ ...RECT, width: 1100, height: 600, right: 1100, bottom: 600 });
  card._resized();
  assert.equal(draws, 1, "a new size: laid out again");
  card._resized();
  assert.equal(draws, 1);
});

test("open spaces: the Open tool joins two rooms' heat; the walls between them are dashed; Close off parts them", async () => {
  window.localStorage.clear();
  const plan = planOf([pt("d_climate", 1, 1)]);
  const card = await make({ plan }, mapsHass());
  await settle();
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="open"]'));
  tap(card, 2, 2, $(card, 'polygon.room[data-area="living_room"]'));
  tap(card, 6, 2, $(card, 'polygon.room[data-area="kitchen"]'));
  assert.deepEqual(card._doc.floors[0].open_spaces, [["living_room", "kitchen"]]);
  assert.equal(card.shadowRoot.querySelectorAll("line.wall-line.none").length, 1, "the shared wall once, as no wall");
  // The plan view of the climate layer: the kitchen has no sensor but shares the living room's.
  click($(card, '[data-action=tool][data-tool="move"]'));
  tap(card, 6, 3, $(card, 'polygon.room[data-area="kitchen"]'));
  assert.ok(shadowText(card).includes("Open to: Living room"), shadowText(card));
  click($(card, "[data-action=close_room]"));
  assert.ok(!("open_spaces" in card._doc.floors[0]), "closed off: no open space left");
  window.localStorage.clear();
});

test("open spaces: a grouped room without a sensor takes the group's heat on the map", async () => {
  window.localStorage.clear();
  const plan = planOf([pt("d_climate", 1, 1)]);
  plan.floors[0].open_spaces = [["living_room", "kitchen"]];
  const card = await make({ plan, layers: ["climate"] }, mapsHass());
  await settle();
  assert.equal(card.shadowRoot.querySelectorAll(".heat .no-sensor").length, 0, "the kitchen is not hatched");
  assert.ok([...card.shadowRoot.querySelectorAll(".heat rect")].some((c) => Number(c.getAttribute("x")) > 5));
  window.localStorage.clear();
});

// ---- openings: doors, windows and doorways (SPEC-028 Amendment 9) ---------------------------

function doorHass(state = "off") {
  const hass = hassOf();
  hass.devices.d_door = { id: "d_door", name: "Door sensor", area_id: "kitchen" };
  hass.entities["binary_sensor.kitchen_door"] = { entity_id: "binary_sensor.kitchen_door", device_id: "d_door" };
  hass.states["binary_sensor.kitchen_door"] = { state, attributes: { device_class: "door", friendly_name: "Kitchen door" } };
  return hass;
}
const withOpenings = (openings, points = []) => {
  const plan = planOf(points);
  plan.floors[0].openings = openings;
  return plan;
};
const DOOR = { rooms: ["kitchen", "living_room"], at: [5, 2], entity: "binary_sensor.kitchen_door" };

test("openings are drawn by kind and state: a door's leaf and swing, a window's panes, a doorway's gap", async () => {
  const plan = withOpenings([
    { rooms: ["living_room", "kitchen"], at: [5, 1] },
    { rooms: ["living_room", "kitchen"], at: [5, 3], state: "closed" },
    { kind: "window", rooms: ["living_room", null], at: [2, 0] },
    { kind: "opening", rooms: ["kitchen", null], at: [6.5, 4] },
  ]);
  const card = await make({ plan }, hassOf());
  const g = [...card.shadowRoot.querySelectorAll("g.opening")];
  assert.deepEqual(g.map((n) => n.getAttribute("class")),
    ["opening door open", "opening door closed", "opening window closed", "opening opening open"]);
  assert.ok(g[0].querySelector("line.leaf") && g[0].querySelector("path.swing"), "an open door swings");
  assert.ok(g[1].querySelector("line.leaf") && !g[1].querySelector("path.swing"), "a closed one lies in its gap");
  assert.equal(g[2].querySelectorAll("line.pane").length, 2);
  assert.ok(g[3].querySelector("line.gap") && !g[3].querySelector("line.leaf"));
});

test("a linked opening follows its sensor live; an unavailable one is drawn unknown", async () => {
  const hass = doorHass("off");
  const card = await make({ plan: withOpenings([DOOR]) }, hass);
  assert.equal($(card, "g.opening").getAttribute("class"), "opening door closed linked");
  card.hass = { ...hass, states: { ...hass.states, "binary_sensor.kitchen_door": { ...hass.states["binary_sensor.kitchen_door"], state: "on" } } };
  assert.equal($(card, "g.opening").getAttribute("class"), "opening door open linked");
  card.hass = { ...hass, states: { ...hass.states, "binary_sensor.kitchen_door": { state: "unavailable", attributes: {} } } };
  assert.equal($(card, "g.opening").getAttribute("class"), "opening door open linked unknown");
});

test("a linked sensor's dot stands on its opening and is not dragged off it", async () => {
  const card = await make({ plan: withOpenings([DOOR], [pt("d_door", 6, 3)]) }, doorHass());
  const marker = $(card, 'g.marker[data-key="d_door"]');
  assert.equal(marker.getAttribute("transform"), "translate(5 2)");
  click($(card, "[data-action=edit]"));
  const [sx, sy] = clientAt(card, 5, 2);
  const [ex, ey] = clientAt(card, 6.5, 1);
  pointer($(card, 'g.marker[data-key="d_door"]'), "pointerdown", sx, sy);
  pointer($(card, "svg"), "pointermove", ex, ey);
  pointer($(card, "svg"), "pointerup", ex, ey);
  assert.deepEqual([card._doc.floors[0].points[0].x, card._doc.floors[0].points[0].y], [6, 3], "the plan's point is untouched");
});

test("the Doors & windows tool: a wall tap adds a door; its panel sets kind, width and sensor; drag slides it; remove", async () => {
  const card = await make({ plan: planOf() }, doorHass());
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="openings"]'));
  tap(card, 5, 2, $(card, 'polygon.room[data-area="living_room"]'));
  const opening = () => card._doc.floors[0].openings?.[0];
  assert.deepEqual(opening(), { kind: "door", rooms: ["living_room", "kitchen"], at: [5, 2] });
  const field = (name) => $(card, `.opening-panel [data-field="${name}"]`);
  const change = (node, value) => {
    node.value = value;
    node.dispatchEvent(new window.Event("change", { bubbles: true, composed: true }));
  };
  assert.equal(field("entity").options[1].value, "binary_sensor.kitchen_door", "the rooms' door sensor offered first");
  change(field("entity"), "binary_sensor.kitchen_door");
  change(field("width"), "0.9");
  assert.deepEqual(opening(), { kind: "door", rooms: ["living_room", "kitchen"], at: [5, 2], entity: "binary_sensor.kitchen_door", width: 0.9 });
  change(field("kind"), "opening");
  assert.equal(opening().entity, undefined, "a doorway has no sensor");
  assert.equal(field("entity"), null);
  // Slid along the shared wall, then onto the kitchen's outer wall.
  const [sx, sy] = clientAt(card, 5, 2);
  const [ex, ey] = clientAt(card, 6.5, 4.02);
  pointer($(card, "g.opening line.hit"), "pointerdown", sx, sy);
  pointer($(card, "svg"), "pointermove", ex, ey);
  pointer($(card, "svg"), "pointerup", ex, ey);
  assert.deepEqual(opening().rooms, ["kitchen", null]);
  click($(card, "[data-action=remove_opening]"));
  assert.ok(!("openings" in card._doc.floors[0]));
});

test("a door's panel swaps its hinge and side and makes it sliding; a selected opening measures its wall", async () => {
  const card = await make({ plan: withOpenings([{ rooms: ["living_room", "kitchen"], at: [5, 2] }]) }, doorHass());
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="openings"]'));
  const opening = () => card._doc.floors[0].openings[0];
  const [sx, sy] = clientAt(card, 5, 2);
  pointer($(card, "g.opening line.hit"), "pointerdown", sx, sy);
  pointer($(card, "svg"), "pointerup", sx, sy);
  assert.ok($(card, "g.opening.selected"));
  assert.equal(card.shadowRoot.querySelectorAll("text.dim.to-wall").length, 2, "the free wall either side");
  click($(card, "[data-action=swap_hinge]"));
  assert.equal(opening().hinge, "right");
  click($(card, "[data-action=swap_side]"));
  assert.equal(opening().opens, "kitchen");
  const style = $(card, '.opening-panel [data-field="sliding"]');
  style.value = "true";
  style.dispatchEvent(new window.Event("change", { bubbles: true, composed: true }));
  assert.equal(opening().sliding, true);
  assert.ok($(card, "g.opening.sliding line.track"));
  click($(card, "[data-action=fill_wall]"));
  assert.ok(opening().width > 0.8, "across the free wall");
  const kind = $(card, '.opening-panel [data-field="kind"]');
  kind.value = "fixed";
  kind.dispatchEvent(new window.Event("change", { bubbles: true, composed: true }));
  assert.deepEqual(Object.keys(opening()).sort(), ["at", "kind", "rooms", "width"]);
  assert.equal($(card, '.opening-panel [data-field="entity"]'), null, "fixed glass has no sensor");
  assert.equal($(card, "[data-action=swap_hinge]"), null);
});

// ---- Wi-Fi maps on the radio layer (SPEC-044) --------------------------------------------------

// Two mesh nodes: one in the kitchen on 2.4 and 5 GHz, one in the living room on 5 GHz only.
function wifiHass(opts) {
  const hass = categoryHass(opts);
  hass.devices.d_mesh2 = { id: "d_mesh2", name: "Mesh satellite", area_id: "living_room", config_entries: ["e_mesh"] };
  hass.entities["switch.mesh2_led"] = { entity_id: "switch.mesh2_led", device_id: "d_mesh2", platform: "tplink_deco" };
  hass.states["switch.mesh2_led"] = { state: "on", attributes: {} };
  hass.states["binary_sensor.door"] = { state: "off", attributes: { device_class: "door" } };
  return hass;
}
const APS = [{ device_id: "d_mesh", bands: ["2.4", "5"] }, { device_id: "d_mesh2", bands: ["5"] }];
function wifiPlan(aps = APS) {
  const plan = planOf([pt("d_mesh", 6.5, 2), pt("d_mesh2", 1, 2)]);
  plan.floors[0].access_points = aps;
  plan.floors[0].openings = [{ kind: "door", rooms: ["living_room", "kitchen"], at: [5, 2], entity: "binary_sensor.door" }];
  return plan;
}
const mapChips = (card) => [...card.shadowRoot.querySelectorAll(".bar [data-action=map]")].map((b) => b.getAttribute("data-map"));
const cellsOf = (card) => [...card.shadowRoot.querySelectorAll(".heat rect[data-dbm]")];

test("wifi maps: the radio layer offers the bands its access points serve, then Serving, without Now / 24 h", async () => {
  window.localStorage.clear();
  const card = await make({ plan: wifiPlan(), layers: ["radio"] }, wifiHass());
  await settle();
  assert.deepEqual(mapChips(card), ["wifi_24", "wifi_5", "serving", "confidence"], "nobody serves 6 GHz");
  assert.equal($(card, '.bar [data-map="wifi_24"]').getAttribute("aria-pressed"), "true", "the first band by default");
  assert.equal($(card, '.bar [data-map="wifi_5"]').textContent, EN("card.floorplan.maps.wifi_5"));
  assert.ok(!$(card, ".bar [data-action=day]"), "no Now / 24 h on a radio map");
  window.localStorage.clear();
});

test("wifi maps: 5 GHz draws cells with their dBm; the legend is -90 to -30 dBm with marks at -67 and -75", async () => {
  window.localStorage.clear();
  const card = await make({ plan: wifiPlan(), layers: ["radio"] }, wifiHass());
  await settle();
  click($(card, '.bar [data-map="wifi_5"]'));
  const cells = cellsOf(card);
  assert.ok(cells.length > 0);
  const dbm = (x, y) => Number(cells.find((c) => Math.abs(Number(c.getAttribute("x")) - x) < 0.1
    && Math.abs(Number(c.getAttribute("y")) - y) < 0.1).getAttribute("data-dbm"));
  assert.ok(dbm(1.05, 1.95) > dbm(3.45, 3.75), "stronger beside an access point");
  assert.ok(cells.every((c) => c.getAttribute("fill").startsWith("rgb(")));
  const legend = $(card, ".bar .legend");
  assert.ok(legend.textContent.includes("-90 dBm") && legend.textContent.includes("-30 dBm"), legend.textContent);
  assert.deepEqual([...legend.querySelectorAll(".mark")].map((m) => m.getAttribute("data-mark")), ["-67", "-75"]);
  assert.ok(!legend.textContent.includes(EN("card.floorplan.maps.no_sensor")), "every room has a prediction");
  window.localStorage.clear();
});

test("wifi maps: Serving colours each cell by its access point on the band chosen beside it and hatches handover", async () => {
  window.localStorage.clear();
  const card = await make({ plan: wifiPlan(), layers: ["radio"] }, wifiHass());
  await settle();
  click($(card, '.bar [data-map="serving"]'));
  const bands = [...card.shadowRoot.querySelectorAll(".bar [data-action=band]")];
  assert.deepEqual(bands.map((b) => b.getAttribute("data-band")), ["2.4", "5"]);
  assert.equal(bands[0].getAttribute("aria-pressed"), "true", "the first offered band by default");
  const aps = () => new Set(cellsOf(card).map((c) => c.getAttribute("data-ap")));
  assert.deepEqual([...aps()], ["d_mesh"], "2.4 GHz: one access point serves everything");
  assert.equal(card.shadowRoot.querySelectorAll(".heat .handover").length, 0);
  click($(card, '.bar [data-band="5"]'));
  assert.deepEqual([...aps()].sort(), ["d_mesh", "d_mesh2"]);
  const fills = new Map(cellsOf(card).map((c) => [c.getAttribute("data-ap"), c.getAttribute("fill")]));
  assert.notEqual(fills.get("d_mesh"), fills.get("d_mesh2"));
  const handover = card.shadowRoot.querySelectorAll(".heat .handover").length;
  assert.ok(handover > 0 && handover < cellsOf(card).length, "a zone between them, not everywhere");
  const legend = $(card, ".bar .legend");
  assert.ok(legend.textContent.includes("Mesh node") && legend.textContent.includes("Mesh satellite"), legend.textContent);
  assert.ok(legend.textContent.includes(EN("card.floorplan.wifi.handover")));
  const again = await make({ plan: wifiPlan(), layers: ["radio"] }, wifiHass());
  await settle();
  assert.equal($(again, '.bar [data-band="5"]').getAttribute("aria-pressed"), "true", "the band is remembered");
  window.localStorage.clear();
});

test("wifi maps: an access point's label lists its bands", async () => {
  window.localStorage.clear();
  const card = await make({ plan: wifiPlan(), layers: ["radio"] }, wifiHass());
  await settle();
  assert.deepEqual(lines(card, "d_mesh"), [["2.4 · 5 GHz", true]]);
  assert.deepEqual(lines(card, "d_mesh2"), [["5 GHz", true]]);
  const pl = await make({ plan: wifiPlan(), layers: ["radio"] }, Object.assign(wifiHass(), { language: "pl", locale: { language: "pl" } }));
  await settle();
  assert.deepEqual(lines(pl, "d_mesh"), [["2,4 · 5 GHz", true]]);
  window.localStorage.clear();
});

test("wifi maps: wifi false offers none; without access points the bar says how to get one", async () => {
  window.localStorage.clear();
  const off = await make({ plan: wifiPlan(), layers: ["radio"], wifi: false }, wifiHass());
  await settle();
  assert.ok(!$(off, ".bar [data-action=map]") && !$(off, ".heat"));
  assert.ok(!$(off, ".bar").textContent.includes(EN("card.floorplan.wifi.hint.no_access_points")));
  const none = await make({ plan: wifiPlan([]), layers: ["radio"] }, wifiHass());
  await settle();
  assert.ok(!$(none, ".bar [data-action=map]") && !$(none, ".heat rect"));
  assert.ok($(none, ".bar").textContent.includes(EN("card.floorplan.wifi.hint.no_access_points")));
  window.localStorage.clear();
});

test("wifi maps: the coverage is computed once per cache key; a door opening computes it again", async () => {
  window.localStorage.clear();
  const hass = wifiHass();
  const card = await make({ plan: wifiPlan(), layers: ["radio"] }, hass);
  await settle();
  let runs = 0;
  const predict = card._predict.bind(card);
  card._predict = (...args) => (runs++, predict(...args));
  click($(card, '.bar [data-map="wifi_5"]'));
  assert.equal(runs, 1);
  pointer(markerOf(card, "d_mesh"), "pointerover", 10, 10);
  card.hass = { ...hass, states: { ...hass.states, "switch.mesh_led": { state: "off", attributes: {} } } };
  assert.equal(runs, 1, "a redraw, another state: the same cells");
  click($(card, '.bar [data-map="serving"]'));
  assert.equal(runs, 2, "Serving on its first band, 2.4 GHz");
  click($(card, '.bar [data-band="5"]'));
  click($(card, '.bar [data-map="wifi_24"]'));
  click($(card, '.bar [data-map="wifi_5"]'));
  assert.equal(runs, 2, "Serving on 5 GHz and both band maps: from the cache");
  const before = cellsOf(card).map((c) => c.getAttribute("data-dbm")).join();
  card.hass = { ...card._hass, states: { ...card._hass.states, "binary_sensor.door": { state: "on", attributes: { device_class: "door" } } } };
  assert.equal(runs, 3, "an open door is a new prediction");
  assert.notEqual(cellsOf(card).map((c) => c.getAttribute("data-dbm")).join(), before);
  window.localStorage.clear();
});

test("wifi maps: a card narrower than 600 px draws 0.3 m cells", async () => {
  window.localStorage.clear();
  const card = await make({ plan: wifiPlan(), layers: ["radio"] }, wifiHass());
  await settle();
  const width = () => Number(cellsOf(card)[0].getAttribute("width"));
  click($(card, '.bar [data-map="wifi_5"]'));
  assert.ok(Math.abs(width() - 0.16) < 1e-9, String(width()));
  $(card, "svg").getBoundingClientRect = () => ({ ...RECT, width: 500, right: 500 });
  click($(card, '.bar [data-map="wifi_24"]'));
  assert.ok(Math.abs(width() - 0.31) < 1e-9, String(width()));
  window.localStorage.clear();
});

// ---- Wi-Fi edit tools (SPEC-044): walls, opening materials, access points, floors ---------------

const change = (node, value) => {
  node.value = value;
  node.dispatchEvent(new window.Event("change", { bubbles: true, composed: true }));
};
const optionValues = (select) => [...select.querySelectorAll("option")].map((o) => o.value);
const materialIds = (cls) => Object.keys(materials.materials).filter((id) => materials.materials[id].for.includes(cls));

test("the Walls tool: a tap on a wall selects its segment; its material, the defaults and the floor", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="walls"]'));
  assert.ok($(card, ".hint").textContent.includes(EN("card.floorplan.hint.walls")));
  assert.equal($(card, ".wall-panel [data-field=wall]"), null, "no wall yet");
  tap(card, 5.02, 1, $(card, 'polygon.room[data-area="living_room"]'));
  const sel = $(card, "line.wall-selected");
  assert.ok(sel, "the tapped segment is drawn selected");
  assert.deepEqual(["x1", "y1", "x2", "y2"].map((a) => Number(sel.getAttribute(a))).sort(), [0, 4, 5, 5]);
  const field = (name) => $(card, `.wall-panel [data-field="${name}"]`);
  assert.deepEqual(optionValues(field("wall")), materialIds("wall"), "only wall materials");
  assert.equal(field("wall").querySelector("option[selected]").value, "concrete_thin", "thin concrete inside by default");
  for (const id of ["concrete_thin", "concrete_thick", "glass", "double", "low_e", "triple_low_e"]) {
    assert.ok(optionValues(field("wall")).includes(id), `the wall picker offers ${id}`);
  }
  change(field("wall"), "brick");
  assert.deepEqual(card._doc.floors[0].walls, [{ at: [5, 2], material: "brick" }]);
  click($(card, '[data-action=wall_default][data-which="interior"]'));
  assert.deepEqual(card._doc.wifi, { defaults: { interior: "brick" } });
  assert.ok(!("walls" in card._doc.floors[0]), "the wall now has the default");
  change(field("height"), "3.1");
  change(field("slab"), "reinforced_concrete");
  assert.equal(card._doc.floors[0].height, 3.1);
  assert.equal(card._doc.floors[0].slab, "reinforced_concrete");
  assert.deepEqual(optionValues(field("slab")), materialIds("slab"));
  tap(card, 2.5, 2, $(card, 'polygon.room[data-area="living_room"]'));
  assert.equal($(card, "line.wall-selected"), null, "a tap inside a room selects no wall");
});

test("wifi false: no Walls tool, no material or access point fields", async () => {
  const card = await make({ plan: withOpenings([{ kind: "window", rooms: ["living_room", null], at: [0, 2] }]), wifi: false }, hassOf());
  click($(card, "[data-action=edit]"));
  assert.equal($(card, '[data-tool="walls"]'), null);
  click($(card, '[data-action=tool][data-tool="openings"]'));
  const [sx, sy] = clientAt(card, 0, 2);
  pointer($(card, "g.opening line.hit"), "pointerdown", sx, sy);
  pointer($(card, "svg"), "pointerup", sx, sy);
  assert.ok($(card, ".opening-panel"));
  assert.equal($(card, '.opening-panel [data-field="material"]'), null);
});

test("the opening panel's Material: window materials for a window, door materials for a door, none for a doorway", async () => {
  const card = await make({ plan: withOpenings([{ kind: "window", rooms: ["living_room", null], at: [0, 2] }]) }, hassOf());
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="openings"]'));
  const [sx, sy] = clientAt(card, 0, 2);
  pointer($(card, "g.opening line.hit"), "pointerdown", sx, sy);
  pointer($(card, "svg"), "pointerup", sx, sy);
  const field = (name) => $(card, `.opening-panel [data-field="${name}"]`);
  assert.deepEqual(optionValues(field("material")), ["glass", "double", "low_e", "triple_low_e"]);
  assert.equal(field("material").querySelector("option[selected]").value, "double", "the window's default");
  change(field("material"), "low_e");
  assert.equal(card._doc.floors[0].openings[0].material, "low_e");
  change(field("kind"), "door");
  assert.equal(card._doc.floors[0].openings[0].material, "low_e", "a glazed door keeps its glazing");
  assert.deepEqual(optionValues(field("material")), ["wood", "glass", "double", "low_e", "triple_low_e", "metal"]);
  change(field("material"), "metal");
  assert.equal(card._doc.floors[0].openings[0].material, "metal");
  change(field("kind"), "window");
  assert.ok(!("material" in card._doc.floors[0].openings[0]), "metal is no window: dropped");
  change(field("kind"), "door");
  change(field("kind"), "opening");
  assert.equal(field("material"), null, "a doorway has no material");
  assert.ok(!("material" in card._doc.floors[0].openings[0]));
});

test("the Walls tool: an outdoor room's own edge is No wall until a material is chosen; No wall again removes it", async () => {
  const plan = planOf();
  plan.wifi = { outdoor: ["kitchen"] };
  const card = await make({ plan }, hassOf());
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="walls"]'));
  tap(card, 7.98, 2, $(card, 'polygon.room[data-area="kitchen"]'));      // the kitchen's east edge
  const field = () => $(card, '.wall-panel [data-field="wall"]');
  assert.deepEqual(optionValues(field()), ["", ...materialIds("wall")]);
  assert.equal(field().querySelector("option[selected]").value, "");
  assert.equal(field().querySelector('option[value=""]').textContent, EN("card.floorplan.wall.none"));
  assert.equal($(card, "[data-action=wall_default]"), null, "no wall is no default for the others");
  change(field(), "glass");
  assert.deepEqual(card._doc.floors[0].walls, [{ at: [8, 2], material: "glass" }]);
  change(field(), "");
  assert.ok(!("walls" in card._doc.floors[0]));
  tap(card, 5.02, 1, $(card, 'polygon.room[data-area="living_room"]'));    // the wall to the outdoor kitchen
  assert.ok(!optionValues(field()).includes(""), "an indoor room's wall is always some material");
});

test("the Walls tool's floor panel: an Outdoors switch per room marks it; the Wi-Fi map changes", async () => {
  window.localStorage.clear();
  const plan = wifiPlan();
  plan.floors[0].openings = [];
  const card = await make({ plan, layers: ["radio"] }, wifiHass());
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="walls"]'));
  const boxes = () => [...card.shadowRoot.querySelectorAll('.wall-panel input[data-field="outdoor"]')];
  assert.deepEqual(boxes().map((b) => b.getAttribute("data-area")), ["living_room", "kitchen"]);
  assert.ok($(card, ".wall-panel").textContent.includes(EN("card.floorplan.wall.outdoor")));
  assert.ok(boxes().every((b) => !b.checked));
  const box = boxes()[1];
  box.checked = true;
  box.dispatchEvent(new window.Event("change", { bubbles: true, composed: true }));
  assert.deepEqual(card._doc.wifi, { outdoor: ["kitchen"] });
  assert.ok(boxes()[1].checked, "drawn on");
  tap(card, 5.02, 1, $(card, 'polygon.room[data-area="living_room"]'));
  assert.equal($(card, '.wall-panel [data-field="wall"]').querySelector("option[selected]").value, "concrete_thick",
    "the wall to an outdoor room is exterior");
  const dbm = async (doc) => {
    const view = await make({ plan: doc, layers: ["radio"] }, wifiHass());
    await settle();
    click($(view, '.bar [data-map="wifi_24"]'));          // the kitchen's node alone serves 2.4 GHz
    return cellsOf(view).map((c) => c.getAttribute("data-dbm")).join();
  };
  assert.notEqual(await dbm(card._doc), await dbm(plan), "an outdoor kitchen: its wall is exterior, the living room darker");
  const off = boxes()[1];
  off.checked = false;
  off.dispatchEvent(new window.Event("change", { bubbles: true, composed: true }));
  assert.ok(!("wifi" in card._doc));
  window.localStorage.clear();
});

test("the opening panel: a door to an outdoor room shows double glazing and closed as its defaults", async () => {
  const plan = withOpenings([{ rooms: ["living_room", "kitchen"], at: [5, 2] }]);
  plan.wifi = { outdoor: ["kitchen"] };
  const card = await make({ plan }, hassOf());
  assert.ok($(card, "g.opening").classList.contains("closed"), "drawn closed, as predicted");
  const indoor = await make({ plan: withOpenings([{ rooms: ["living_room", "kitchen"], at: [5, 2] }]) }, hassOf());
  assert.ok($(indoor, "g.opening").classList.contains("open"), "between two indoor rooms: open");
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="openings"]'));
  const [sx, sy] = clientAt(card, 5, 2);
  pointer($(card, "g.opening line.hit"), "pointerdown", sx, sy);
  pointer($(card, "svg"), "pointerup", sx, sy);
  const field = (name) => $(card, `.opening-panel [data-field="${name}"]`);
  assert.equal(field("material").querySelector("option[selected]").value, "double");
  assert.equal(field("state").querySelector("option[selected]").value, "closed");
  change(field("material"), "wood");
  assert.equal(card._doc.floors[0].openings[0].material, "wood", "wood is a choice of its own here");
});

const OFFER_KEY = "domosenso.floorplan.ap_offered";
function nodeHass() {
  const hass = wifiHass();
  hass.entities["device_tracker.mesh_node"] = { entity_id: "device_tracker.mesh_node", device_id: "d_mesh", platform: "tplink_deco" };
  hass.states["device_tracker.mesh_node"] = { state: "home", attributes: { device_type: "deco" } };
  return hass;
}

test("a Deco node point is offered 'Use as access point?' once; accepting marks it", async () => {
  window.localStorage.clear();
  const plan = planOf([pt("d_mesh", 6.5, 2), pt("d_climate", 1, 1)]);
  const card = await make({ plan }, nodeHass());
  click($(card, "[data-action=edit]"));
  const offer = $(card, ".ap-offer");
  assert.ok(offer && offer.textContent.includes(EN("card.floorplan.wifi.offer").replace("{name}", "Mesh node")), offer?.textContent);
  click($(card, '.ap-offer [data-answer="yes"]'));
  assert.deepEqual(card._doc.floors[0].access_points, [{ device_id: "d_mesh", bands: ["2.4", "5"] }]);
  assert.equal($(card, ".ap-offer"), null);
  // Unmarked again in a new card: not offered a second time in this browser.
  const again = await make({ plan }, nodeHass());
  click($(again, "[data-action=edit]"));
  assert.equal($(again, ".ap-offer"), null);
  window.localStorage.clear();
  const declined = await make({ plan }, nodeHass());
  click($(declined, "[data-action=edit]"));
  click($(declined, '.ap-offer [data-answer="no"]'));
  assert.ok(!("access_points" in declined._doc.floors[0]));
  assert.deepEqual(JSON.parse(window.localStorage.getItem(OFFER_KEY)), ["d_mesh"]);
  assert.equal($(declined, ".ap-offer"), null);
  window.localStorage.clear();
});

test("a corrupt stored offer list (not a list) is read as none: the card still starts and offers", async () => {
  for (const bad of ["5", "{\"d_mesh\": true}", "null"]) {
    window.localStorage.clear();
    window.localStorage.setItem(OFFER_KEY, bad);
    const card = await make({ plan: planOf([pt("d_mesh", 6.5, 2)]) }, nodeHass());
    click($(card, "[data-action=edit]"));
    assert.ok($(card, ".ap-offer"), `offered after ${bad}`);
  }
  window.localStorage.clear();
});

test("German confidence levels: hoch, mittel, niedrig (not tief)", () => {
  assert.deepEqual(at(LANGS.de, "card.floorplan.wifi.confidence"), { high: "hoch", medium: "mittel", low: "niedrig" });
  assert.ok(!at(LANGS.de, "card.floorplan.wifi.confidence_legend").includes("tief"));
});

test("a point's panel marks it as access point with its bands, transmit power and mount height", async () => {
  window.localStorage.clear();
  window.localStorage.setItem(OFFER_KEY, JSON.stringify(["d_mesh"]));
  const card = await make({ plan: planOf([pt("d_mesh", 6.5, 2)]) }, nodeHass());
  click($(card, "[data-action=edit]"));
  const [x, y] = clientAt(card, 6.5, 2);
  pointer(markerOf(card, "d_mesh"), "pointerdown", x, y);
  pointer(markerOf(card, "d_mesh"), "pointerup", x, y);
  const ap = () => card._doc.floors[0].access_points?.[0];
  const check = (sel, on) => {
    const box = $(card, sel);
    box.checked = on;
    box.dispatchEvent(new window.Event("change", { bubbles: true, composed: true }));
  };
  assert.equal($(card, '.point-panel [data-field="ap_tx"]'), null, "not an access point yet");
  check('.point-panel [data-field="ap"]', true);
  assert.deepEqual(ap(), { device_id: "d_mesh", bands: ["2.4", "5"] });
  check('.point-panel [data-field="ap_band"][data-band="6"]', true);
  assert.deepEqual(ap().bands, ["2.4", "5", "6"]);
  change($(card, '.point-panel [data-field="ap_tx"][data-band="5"]'), "20");
  change($(card, '.point-panel [data-field="ap_mount"]'), "2.2");
  assert.deepEqual(ap(), { device_id: "d_mesh", bands: ["2.4", "5", "6"], tx: { "5": 20 }, mount: 2.2 });
  check('.point-panel [data-field="ap_band"][data-band="5"]', false);
  assert.deepEqual(ap(), { device_id: "d_mesh", bands: ["2.4", "6"], mount: 2.2 }, "tx kept only for its bands");
  change($(card, '.point-panel [data-field="ap_mount"]'), "9");
  assert.equal(ap().mount, 2.2, "out of range: refused");
  assert.ok($(card, ".message").textContent.includes(EN("card.floorplan.refused")));
  check('.point-panel [data-field="ap"]', false);
  assert.ok(!("access_points" in card._doc.floors[0]));
  window.localStorage.clear();
});

test("after an edit the Wi-Fi map shows the change", async () => {
  window.localStorage.clear();
  // One access point in the kitchen: the living room's cells are behind the shared wall.
  const card = await make({ plan: wifiPlan([APS[0]]), layers: ["radio"] }, wifiHass());
  await settle();
  click($(card, '.bar [data-map="wifi_5"]'));
  const before = cellsOf(card).map((c) => c.getAttribute("data-dbm")).join();
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="walls"]'));
  tap(card, 5.02, 1, $(card, 'polygon.room[data-area="living_room"]'));
  change($(card, '.wall-panel [data-field="wall"]'), "metal");
  card._leaveEdit(card._doc);
  card._render();
  assert.ok(cellsOf(card).map((c) => c.getAttribute("data-dbm")).join() !== before, "a metal wall: other cells");
  window.localStorage.clear();
});

// ---- Wi-Fi calibration from the devices' signal sensors (SPEC-044 S2) ---------------------------

const DBM = { device_class: "signal_strength", unit_of_measurement: "dBm", state_class: "measurement" };
const BSSID_24 = "02:00:00:00:00:01";
const BSSID_5 = "02:00:00:00:00:02";
// wifiHass, the kitchen node's BSSIDs, and an ESPHome sensor reporting its Wi-Fi signal and the BSSID it is on.
function sourceHass({ dbm = "-52", bssid = BSSID_24, ...opts } = {}) {
  const hass = wifiHass(opts);
  hass.devices.d_atom = { id: "d_atom", name: "Alex's sensor", area_id: "kitchen" };
  hass.devices.d_sam = { id: "d_sam", name: "Sam's sensor", area_id: "living_room" };
  const add = (id, device_id, platform, state, attributes = {}) => {
    hass.entities[id] = { entity_id: id, device_id, platform };
    hass.states[id] = { state, attributes };
  };
  add("sensor.mesh_bssid_2_4_ghz", "d_mesh", "tplink_deco", BSSID_24);
  add("sensor.mesh_bssid_5_ghz", "d_mesh", "tplink_deco", BSSID_5);
  add("sensor.atom_wi_fi_signal", "d_atom", "esphome", dbm, DBM);
  if (bssid) add("sensor.atom_connected_ap_bssid", "d_atom", "esphome", bssid);
  return hass;
}
const ATOM = pt("d_atom", 7, 3.5);
const sourcePlan = (extra = []) => {
  const plan = wifiPlan();
  plan.floors[0].points.push(ATOM, ...extra);
  return plan;
};
const calibChips = (card) => [...card.shadowRoot.querySelectorAll(".bar [data-action=calib]")];
const pressed = (card, sel) => $(card, sel)?.getAttribute("aria-pressed");
const dbmNear = (card, x, y) => Number(cellsOf(card).find((c) => Math.abs(Number(c.getAttribute("x")) - x) < 0.1
  && Math.abs(Number(c.getAttribute("y")) - y) < 0.1).getAttribute("data-dbm"));

test("calibration: Predicted / Calibrated replaces nothing without observations; with one, Calibrated is the default and remembered", async () => {
  window.localStorage.clear();
  const plain = await make({ plan: wifiPlan(), layers: ["radio"] }, wifiHass());
  await settle();
  assert.deepEqual(calibChips(plain), [], "nothing to calibrate with: no switch");
  const card = await make({ plan: sourcePlan(), layers: ["radio"] }, sourceHass({ dbm: "-75" }));
  await settle();
  assert.deepEqual(calibChips(card).map((b) => b.getAttribute("data-calib")), ["predicted", "calibrated"]);
  assert.equal(calibChips(card)[0].textContent, EN("card.floorplan.wifi.predicted"));
  assert.equal(pressed(card, '.bar [data-calib="calibrated"]'), "true", "Calibrated by default");
  assert.ok(!$(card, ".bar [data-action=day]"), "no Now / 24 h");
  click($(card, '.bar [data-map="wifi_24"]'));     // drawn again at the card's width: 0.15 m cells
  const calibrated = dbmNear(card, 6.9, 3.45);
  click($(card, '.bar [data-calib="predicted"]'));
  assert.equal(pressed(card, '.bar [data-calib="predicted"]'), "true");
  const predicted = dbmNear(card, 6.9, 3.45);
  assert.ok(Math.abs(calibrated + 75) < Math.abs(predicted + 75), `calibrated ${calibrated} nearer -75 dBm than predicted ${predicted}`);
  click($(card, '.bar [data-map="serving"]'));
  assert.equal(calibChips(card).length, 2, "Serving has the switch too");
  click($(card, '.bar [data-map="confidence"]'));
  assert.deepEqual(calibChips(card), [], "Confidence has none");
  const again = await make({ plan: sourcePlan(), layers: ["radio"] }, sourceHass());
  await settle();
  click($(again, '.bar [data-map="wifi_24"]'));
  assert.equal(pressed(again, '.bar [data-calib="predicted"]'), "true", "the choice is remembered");
  window.localStorage.clear();
});

test("calibration: Confidence draws high, medium and low in three fills on the band chosen beside it, with a legend", async () => {
  window.localStorage.clear();
  // On the kitchen node's 5 GHz, some 30 dB below its prediction: high beside the reading, medium where that node
  // serves, low where the living room's node serves.
  const card = await make({ plan: sourcePlan(), layers: ["radio"] }, sourceHass({ dbm: "-60", bssid: BSSID_5 }));
  await settle();
  click($(card, '.bar [data-map="confidence"]'));
  click($(card, '.bar [data-band="5"]'));
  const cells = cellsOf(card);
  const levels = new Map(cells.map((c) => [c.getAttribute("data-conf"), c.getAttribute("fill")]));
  assert.deepEqual([...levels.keys()].sort(), ["high", "low", "medium"]);
  assert.equal(new Set(levels.values()).size, 3, "three distinct fills");
  const near = cells.find((c) => Math.abs(Number(c.getAttribute("x")) - 6.9) < 0.1 && Math.abs(Number(c.getAttribute("y")) - 3.45) < 0.1);
  assert.equal(near.getAttribute("data-conf"), "high");
  const legend = $(card, ".bar .legend");
  for (const level of ["high", "medium", "low"]) {
    assert.ok(legend.textContent.includes(EN(`card.floorplan.wifi.confidence.${level}`)), legend.textContent);
  }
  assert.equal(legend.querySelectorAll(".swatch").length, 3);
  window.localStorage.clear();
});

test("calibration: the fit runs once per plan and readings, not per band nor on an unrelated update; a changed reading fits again", async () => {
  window.localStorage.clear();
  const hass = sourceHass();
  const card = await make({ plan: sourcePlan(), layers: ["radio"] }, hass);
  await settle();
  let fits = 0;
  const run = card._runFit.bind(card);
  card._runFit = (...args) => (fits++, run(...args));
  card._wifiMemo.clear();
  card._fitMemo = null;
  click($(card, '.bar [data-map="wifi_5"]'));
  assert.equal(fits, 1);
  click($(card, '.bar [data-map="wifi_24"]'));
  click($(card, '.bar [data-map="serving"]'));
  click($(card, '.bar [data-map="confidence"]'));
  assert.equal(fits, 1, "one fit for every band and map");
  const setState = (id, state) => {
    card.hass = { ...card._hass, states: { ...card._hass.states, [id]: { ...card._hass.states[id], state } } };
  };
  setState("switch.mesh_led", "off");
  assert.equal(fits, 1, "another entity's state: no new fit");
  setState("sensor.atom_wi_fi_signal", "-52.1");
  assert.equal(fits, 1, "within 0.5 dB: the same fit");
  setState("sensor.atom_wi_fi_signal", "-58");
  assert.equal(fits, 2, "a changed reading: a new fit");
  window.localStorage.clear();
});

test("calibration: the observations are built again for a signal, BSSID or tracker state, not for another entity's", async () => {
  window.localStorage.clear();
  const hass = sourceHass();
  hass.entities["device_tracker.atom"] = { entity_id: "device_tracker.atom", device_id: null, platform: "tplink_deco" };
  hass.states["device_tracker.atom"] = { state: "home", attributes: { mac: "02:00:00:00:00:aa", connection_type: "band5" } };
  const card = await make({ plan: sourcePlan(), layers: ["radio"] }, hass);
  await settle();
  let builds = 0;
  const build = card._buildObservations.bind(card);
  card._buildObservations = (...args) => (builds++, build(...args));
  const setState = (id, state) => {
    card.hass = { ...card._hass, states: { ...card._hass.states, [id]: { ...card._hass.states[id], state } } };
    card._observations();
  };
  card._observations();
  setState("switch.mesh_led", "off");
  assert.equal(builds, 0, "another entity's state: the same observations");
  setState("sensor.atom_wi_fi_signal", "-60");
  assert.equal(builds, 1, "a signal sensor");
  setState("sensor.atom_connected_ap_bssid", BSSID_5);
  assert.equal(builds, 2, "the device's BSSID");
  setState("sensor.mesh_bssid_5_ghz", "02:00:00:00:00:03");
  assert.equal(builds, 3, "an access point's BSSID");
  setState("device_tracker.atom", "not_home");
  assert.equal(builds, 4, "a router tracker");
  window.localStorage.clear();
});

test("calibration: a signal source's label shows its dBm, band and access point; its 24 h mean once the statistics arrive", async () => {
  window.localStorage.clear();
  const card = await make({ plan: sourcePlan(), layers: ["radio"] }, sourceHass());
  await settle();
  assert.deepEqual(lines(card, "d_atom"), [["−52 dBm · 2.4 · Mesh node", true]]);
  assert.deepEqual(lines(card, "d_mesh"), [["2.4 · 5 GHz", true]], "an access point still lists its bands");
  const unknown = await make({ plan: sourcePlan(), layers: ["radio"] }, sourceHass({ bssid: null }));
  await settle();
  assert.deepEqual(lines(unknown, "d_atom"), [["−52 dBm · 2.4 · —", true]], "access point unknown");
  const pl = await make({ plan: sourcePlan(), layers: ["radio"] }, sourceHass({ language: "pl" }));
  await settle();
  assert.deepEqual(lines(pl, "d_atom"), [["−52 dBm · 2,4 · Mesh node", true]]);
  const hass = sourceHass({ answers: { "recorder/statistics_during_period": { "sensor.atom_wi_fi_signal": [{ mean: -60 }, { mean: -62 }] } } });
  const day = await make({ plan: sourcePlan(), layers: ["radio"] }, hass);
  await settle();
  const stats = hass.calls.find((c) => c.type === "recorder/statistics_during_period");
  assert.ok(stats && stats.statistic_ids.includes("sensor.atom_wi_fi_signal") && stats.period === "hour", JSON.stringify(stats));
  assert.ok(Date.now() - Date.parse(stats.start_time) - 24 * 3600 * 1000 < 60 * 1000, "the last 24 hours");
  assert.deepEqual(lines(day, "d_atom"), [["−61 dBm · 2.4 · Mesh node", true]], "the mean of the hourly means");
  window.localStorage.clear();
});

const registryCalls = (hass) => hass.calls.filter((c) => c.type === "config/entity_registry/list");
const DISABLED = [
  { entity_id: "sensor.sam_wi_fi_signal", device_id: "d_sam", platform: "esphome", disabled_by: "integration" },
  { entity_id: "sensor.sam_uptime", device_id: "d_sam", platform: "esphome", disabled_by: "integration" },
];

test("disabled sources: in edit mode an admin's card lists the plan's switched-off Wi-Fi signal sensors, read once per edit session", async () => {
  window.localStorage.clear();
  const hass = sourceHass({ answers: { "config/entity_registry/list": DISABLED } });
  const card = await make({ plan: sourcePlan([pt("d_sam", 2, 2)]), layers: ["radio"] }, hass);
  await settle();
  assert.equal(registryCalls(hass).length, 0, "view mode never asks");
  click($(card, "[data-action=edit]"));
  await settle();
  const list = $(card, ".area-panel .wifi-disabled");
  assert.ok(list, $(card, ".area-panel").innerHTML);
  assert.ok(list.textContent.includes(EN("card.floorplan.wifi.disabled")), list.textContent);
  assert.ok(list.textContent.includes("Sam's sensor") && list.textContent.includes("sensor.sam_wi_fi_signal"), list.textContent);
  assert.ok(!list.textContent.includes("sensor.sam_uptime"));
  click($(card, '[data-action=tool][data-tool="walls"]'));
  card.hass = { ...card._hass, states: { ...card._hass.states } };
  await settle();
  assert.equal(registryCalls(hass).length, 1, "once per edit session");
  click($(card, "[data-action=cancel]"));
  click($(card, "[data-action=edit]"));
  await settle();
  assert.equal(registryCalls(hass).length, 2, "a new edit session reads it again");
  window.localStorage.clear();
});

test("disabled sources: view mode and a non-admin (the kiosk user) never read the entity registry", async () => {
  window.localStorage.clear();
  for (const admin of [true, false]) {
    const hass = sourceHass({ admin, answers: { "config/entity_registry/list": DISABLED } });
    const card = await make({ plan: sourcePlan([pt("d_sam", 2, 2)]), layers: ["radio"] }, hass);
    await settle();
    for (const map of ["wifi_24", "serving", "confidence"]) click($(card, `.bar [data-map="${map}"]`));
    card.hass = { ...card._hass, states: { ...card._hass.states } };
    await settle();
    assert.equal(registryCalls(hass).length, 0, `admin ${admin}`);
    assert.equal($(card, ".wifi-disabled"), null);
  }
  window.localStorage.clear();
});

// ---- survey panel, next spots and manual readings (SPEC-044 S3) --------------------------------

// The survey page's server: `routes` answers a path with a value (as JSON), or {status, text} for an error.
function surveyFetch(routes) {
  const calls = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), method: options.method ?? "GET", body: options.body ? JSON.parse(options.body) : null };
    calls.push(call);
    const answer = await routes[call.url]?.(call);
    const failed = answer && typeof answer.status === "number";
    return { ok: !failed, status: failed ? answer.status : 200, json: async () => answer, text: async () => (failed ? answer.text : "") };
  };
  return { calls, restore: () => { globalThis.fetch = saved; } };
}
const LINK = { band: "5", channel: 36, dbm: -58.2, noise: -92, bssid: null };
const SAMPLE = { floor_id: "ground", x: 2, y: 1, t: "2026-11-11T19:30:00Z", band: "5", channel: 36, dbm: -58.2, noise: -92, source: "survey" };
const MANUAL = { floor_id: "ground", x: 3, y: 3, t: "2026-11-11T19:31:00Z", band: "2.4", dbm: -63, source: "manual" };
const sampleDots = (card) => [...card.shadowRoot.querySelectorAll("g.sample")];

test("survey: the panel shows the laptop's live link from /survey/link every 2 s; without one it says so", async () => {
  window.localStorage.clear();
  let link = LINK;
  const f = surveyFetch({ "survey/link": () => ({ link }) });
  const every = [];
  const setI = globalThis.setInterval;
  globalThis.setInterval = (fn, ms) => (every.push(ms), setI(fn, ms));
  try {
    const card = await make({ plan: wifiPlan(), survey: true }, wifiHass());
    await settle();
    await settle();
    assert.deepEqual(every, [2000], "one poll, every 2 s");
    assert.ok(f.calls.some((c) => c.url === "survey/link" && c.method === "GET"));
    const text = $(card, ".survey .survey-link").textContent;
    assert.equal(text, "5 GHz · channel 36 · −58 dBm · noise −92 dBm");
    assert.ok($(card, ".survey .survey-help").textContent.includes("10 s"));
    // A poll still waiting for its answer is not doubled.
    let release;
    f.calls.length = 0;
    const slow = surveyFetch({ "survey/link": () => new Promise((r) => { release = r; }) });
    const first = card._pollLink();
    await card._pollLink();
    assert.equal(slow.calls.length, 1, "one request in flight at a time");
    release({ link: null });
    await first;
    slow.restore();
    link = null;
    await card._pollLink();
    assert.equal($(card, ".survey-link").textContent, EN("card.floorplan.survey.no_link"));
    card.remove();
    const before = f.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(f.calls.length, before, "a removed card stops polling");
    const plain = await make({ plan: wifiPlan(), layers: ["radio"] }, wifiHass());
    await settle();
    assert.equal($(plain, ".survey").innerHTML, "", "no Survey panel without survey: true");
    assert.equal(f.calls.filter((c) => c.url === "survey/link").length, before, "and no polling");
    plain.remove();
  } finally {
    globalThis.setInterval = setI;
    f.restore();
    window.localStorage.clear();
  }
});

test("survey: a tap marks the spot, I'm here posts it and waits 10 s, then the sample is drawn or the skip shown", async () => {
  window.localStorage.clear();
  let answer;
  const f = surveyFetch({ "survey/link": () => ({ link: LINK }), "survey/sample": () => new Promise((r) => { answer = r; }) });
  try {
    const card = await make({ plan: wifiPlan(), survey: true }, wifiHass());
    await settle();
    const here = () => $(card, "[data-action=survey_here]");
    assert.ok(here().disabled, "no spot yet");
    assert.equal(sampleDots(card).length, 0);
    let tapped = 0;
    card.addEventListener("room-tap", () => tapped++);
    tap(card, 2, 1);
    assert.equal(tapped, 0, "a survey tap is a spot, not a room");
    assert.ok($(card, "circle.survey-spot"));
    assert.ok(!here().disabled);
    click(here());
    await settle();
    const post = f.calls.find((c) => c.url === "survey/sample");
    assert.equal(post.method, "POST");
    assert.equal(post.body.floor_id, "ground");
    assert.ok(Math.abs(post.body.x - 2) < 0.01 && Math.abs(post.body.y - 1) < 0.01, JSON.stringify(post.body));
    assert.ok($(card, ".survey .survey-progress"), "the 10 s wait shows");
    assert.ok(here().disabled, "one sample at a time");
    answer({ sample: SAMPLE });
    await settle();
    await settle();
    assert.equal($(card, ".survey-progress"), null);
    assert.deepEqual(card._doc.wifi.samples, [SAMPLE]);
    assert.deepEqual(card._loaded.wifi.samples, [SAMPLE], "the file has it: a later save is not refused");
    assert.ok($(card, ".survey-note").textContent.includes("−58 dBm"), $(card, ".survey-note").textContent);
    assert.ok($(card, '.bar [data-map="wifi_24"][aria-pressed="true"]'), "the survey page opens on a band map");
    assert.equal(sampleDots(card).length, 0, "a band map shows no sample dots, on the survey page too");
    click($(card, '.bar [data-map="confidence"]'));
    assert.equal(sampleDots(card).length, 1, "the new sample on the Confidence map");
    assert.equal(sampleDots(card)[0].querySelector("text").textContent, "−58");
    assert.equal($(card, "circle.survey-spot"), null, "the next stop is tapped again");
    tap(card, 3, 3);
    click(here());
    await settle();
    answer({ sample: null, skipped: "too few readings" });
    await settle();
    await settle();
    assert.ok($(card, ".survey-note").textContent.includes("too few readings"));
    assert.equal(card._doc.wifi.samples.length, 1);
    f.calls.length = 0;
    click(here());
    await settle();
    answer({ status: 400, text: "plan has 2000 samples" });
    await settle();
    await settle();
    assert.ok($(card, ".survey-note").textContent.includes("plan has 2000 samples"));
    card.remove();
  } finally {
    f.restore();
    window.localStorage.clear();
  }
});

test("survey: the next spots are drawn and listed: rooms without a reading before far cells", async () => {
  window.localStorage.clear();
  const f = surveyFetch({ "survey/link": () => ({ link: LINK }) });
  try {
    const card = await make({ plan: wifiPlan(), survey: true }, wifiHass());
    await settle();
    assert.equal(card.shadowRoot.querySelectorAll("circle.next-spot").length, 3);
    const items = [...card.shadowRoot.querySelectorAll(".survey-next li")];
    assert.equal(items.length, 3);
    // No reading yet, one access point on 2.4 GHz (no handover): both rooms, then a far cell.
    assert.deepEqual(items.map((li) => li.textContent), ["room", "room", "far"].map((w) => EN(`card.floorplan.survey.why.${w}`)));
    assert.deepEqual([...card.shadowRoot.querySelectorAll("circle.next-spot")].map((c) => c.getAttribute("data-why")), ["room", "room", "far"]);
    card.remove();
  } finally {
    f.restore();
    window.localStorage.clear();
  }
});

test("samples: dots with their dBm on the Confidence map and in edit mode only; every floor's samples calibrate", async () => {
  window.localStorage.clear();
  const plan = wifiPlan();
  plan.floors.push({ floor_id: "upstairs", rooms: [], points: [] });
  plan.wifi = { samples: [MANUAL, { ...SAMPLE, floor_id: "upstairs" }] };
  const card = await make({ plan, layers: ["radio"] }, wifiHass());
  await settle();
  assert.equal(sampleDots(card).length, 0, "not on a band map");
  assert.deepEqual(calibChips(card).map((b) => b.getAttribute("data-calib")), ["predicted", "calibrated"], "samples calibrate");
  assert.deepEqual(card._observations().list.map((o) => [o.floorId, o.source]), [["ground", "manual"], ["upstairs", "survey"]]);
  click($(card, '.bar [data-map="confidence"]'));
  assert.equal(sampleDots(card).length, 1, "this floor's");
  assert.equal(sampleDots(card)[0].querySelector("text").textContent, "−63");
  click($(card, "[data-action=edit]"));
  assert.equal(sampleDots(card).length, 1, "edit mode");
  window.localStorage.clear();
});

test("add reading: a tap places a manual reading; dBm, band and access point go into the plan and are saved", async () => {
  window.localStorage.clear();
  const hass = wifiHass({ dashboard: dashboardOf(wifiPlan()) });
  const card = await make({ layers: ["radio"] }, hass);
  await settle();
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="reading"]'));
  assert.equal($(card, '[data-tool="reading"]').textContent, EN("card.floorplan.tool.reading"));
  assert.equal($(card, ".hint").textContent, EN("card.floorplan.hint.reading"));
  assert.equal($(card, ".reading-panel"), null, "nothing tapped yet");
  tap(card, 2, 1);
  assert.ok($(card, "circle.reading-spot"));
  const field = (name) => $(card, `.reading-panel [data-field="${name}"]`);
  assert.deepEqual([...field("band").options].map((o) => o.value), ["2.4", "5"]);
  assert.deepEqual([...field("ap").options].map((o) => o.value), ["", "d_mesh", "d_mesh2"]);
  field("dbm").value = "5";
  click($(card, "[data-action=add_reading]"));
  assert.equal(card._doc.wifi, undefined, "5 dBm is refused");
  assert.ok($(card, ".message").textContent.includes(EN("card.floorplan.refused")));
  field("dbm").value = "-63";
  field("band").value = "5";
  field("ap").value = "d_mesh2";
  click($(card, "[data-action=add_reading]"));
  const [got] = card._doc.wifi.samples;
  assert.deepEqual({ ...got, x: 0, y: 0, t: 0 }, { floor_id: "ground", x: 0, y: 0, t: 0, band: "5", dbm: -63, ap: "d_mesh2", source: "manual" });
  assert.ok(Math.abs(got.x - 2) < 0.01 && Math.abs(got.y - 1) < 0.01);
  assert.equal(sampleDots(card).length, 1, "drawn at once");
  assert.equal($(card, ".reading-panel"), null, "the next reading is tapped again");
  click($(card, "[data-action=save]"));
  await settle();
  await settle();
  const saved = hass.calls.find((c) => c.type === "lovelace/config/save");
  assert.deepEqual(saved.config.views[0].cards[0].plan.wifi.samples, [got]);
  window.localStorage.clear();
});

// ---- Amendment 3: wall weights, half-height walls, ranges -----------------------------------------

const all = (card, sel) => [...card.shadowRoot.querySelectorAll(sel)];
const onLine = (l, x) => Number(l.getAttribute("x1")) === x && Number(l.getAttribute("x2")) === x;

test("wall weights: walls are lines by weight on the plan and every map; rooms keep their fill unstroked; the key", async () => {
  window.localStorage.clear();
  const card = await make({ plan: wifiPlan(), layers: ["radio"] }, wifiHass());
  await settle();
  assert.ok(all(card, "polygon.room").every((r) => r.classList.contains("walled")));
  assert.equal(all(card, "line.wall-line.heavy").length, 6, "thick concrete outside by default");
  assert.deepEqual(all(card, "line.wall-line.solid").filter((l) => onLine(l, 5)).length, 2, "thin concrete inside, the door cut out");
  click($(card, '.bar [data-map="wifi_5"]'));
  assert.equal(all(card, ".heat polygon.wall").length, 0, "no room outlines over the heat");
  assert.ok(all(card, "line.wall-line").length >= 8, "the walls over the map");
  const key = $(card, ".bar .wall-key");
  assert.deepEqual(all(card, ".bar .wall-key .wall-swatch").map((s) => s.className), ["wall-swatch light", "wall-swatch solid", "wall-swatch heavy"]);
  for (const w of ["light", "solid", "heavy"]) assert.ok(key.textContent.includes(EN(`card.floorplan.wall.weight.${w}`)));
  click($(card, '.bar [data-map="serving"]'));
  assert.ok($(card, ".bar .wall-key"), "on every Wi-Fi map");
  click($(card, "[data-action=edit]"));
  assert.ok($(card, ".bar .wall-key"), "in edit mode");
  const glass = wifiPlan();
  glass.floors[0].walls = [{ at: [5, 0.5], material: "low_e", height: "half" }, { at: [8, 2], material: "double" }];
  const other = await make({ plan: glass, layers: ["radio"] }, wifiHass());
  await settle();
  const inner = all(other, "line.wall-line").filter((l) => onLine(l, 5));
  assert.ok(inner.length === 2 && inner.every((l) => l.getAttribute("class") === "wall-line solid glass half"), inner.map((l) => l.getAttribute("class")).join());
  assert.deepEqual(all(other, "line.wall-line").filter((l) => onLine(l, 8)).map((l) => l.getAttribute("class")), ["wall-line light glass"]);
  const off = await make({ plan: wifiPlan(), layers: ["radio"], wifi: false }, wifiHass());
  await settle();
  assert.equal(all(off, "line.wall-line").length + all(off, ".wall-key").length, 0, "wifi false: outlines as before");
  window.localStorage.clear();
});

test("the Walls tool: Half height lowers the selected wall; its material stays; no wall has nothing to lower", async () => {
  const card = await make({ plan: planOf() }, hassOf());
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="walls"]'));
  tap(card, 5.02, 1, $(card, 'polygon.room[data-area="living_room"]'));
  const half = () => $(card, '.wall-panel input[data-field="half"]');
  assert.ok(half() && !half().checked);
  assert.ok($(card, ".wall-panel").textContent.includes(EN("card.floorplan.wall.half")));
  half().checked = true;
  half().dispatchEvent(new window.Event("change", { bubbles: true, composed: true }));
  assert.deepEqual(card._doc.floors[0].walls, [{ at: [5, 2], material: "concrete_thin", height: "half" }]);
  assert.ok(half().checked);
  assert.deepEqual(all(card, "line.wall-line").filter((l) => onLine(l, 5)).map((l) => l.getAttribute("class")), ["wall-line light half"],
    "14 dB halved: light, dashed");
  change($(card, '.wall-panel [data-field="wall"]'), "brick");
  assert.deepEqual(card._doc.floors[0].walls, [{ at: [5, 2], material: "brick", height: "half" }]);
  const balcony = planOf();
  balcony.wifi = { outdoor: ["kitchen"] };
  const open = await make({ plan: balcony }, hassOf());
  click($(open, "[data-action=edit]"));
  click($(open, '[data-action=tool][data-tool="walls"]'));
  tap(open, 7.98, 2, $(open, 'polygon.room[data-area="kitchen"]'));
  assert.equal($(open, '.wall-panel [data-field="wall"]').value, "");
  assert.equal($(open, '.wall-panel input[data-field="half"]'), null, "the balcony's open edge: no wall to lower");
  assert.ok(all(open, "line.wall-line.none").length >= 3, "its open edges dotted");
});

test("ranges: the band maps outline each access point at -67 and -75 dBm in its colour, ringed and named", async () => {
  window.localStorage.clear();
  const aps = [{ device_id: "d_mesh", bands: ["2.4", "5"], tx: { 5: -10 } }, { device_id: "d_mesh2", bands: ["5"], tx: { 5: -10 } }];
  const card = await make({ plan: wifiPlan(aps), layers: ["radio"] }, wifiHass());
  await settle();
  let runs = 0;
  const levels = card._levels.bind(card);
  card._levels = (...args) => (runs++, levels(...args));
  click($(card, '.bar [data-map="wifi_5"]'));
  const chip = () => $(card, ".bar [data-action=ranges]");
  assert.equal(chip().getAttribute("aria-pressed"), "false");
  assert.equal(chip().textContent, EN("card.floorplan.wifi.ranges"));
  assert.equal($(card, ".ranges"), null, "off by default");
  click(chip());
  assert.equal(chip().getAttribute("aria-pressed"), "true");
  const paths = (ap, cls) => all(card, `.ranges path.range.${cls}[data-ap="${ap}"]`);
  for (const ap of ["d_mesh", "d_mesh2"]) {
    assert.ok(paths(ap, "call").length >= 1 && paths(ap, "weak").length >= 1, ap);
    // 3 m round each access point runs out of the 8 x 4 m home: open lines, ending where the rooms do
    assert.ok(paths(ap, "call").every((p) => p.getAttribute("data-dbm") === "-67" && p.getAttribute("d").startsWith("M ")));
  }
  assert.notEqual(paths("d_mesh", "call")[0].getAttribute("stroke"), paths("d_mesh2", "call")[0].getAttribute("stroke"));
  const rings = all(card, ".ranges circle.range-ring");
  assert.deepEqual(rings.map((r) => r.getAttribute("data-ap")), ["d_mesh", "d_mesh2"]);
  assert.equal(rings[0].getAttribute("stroke"), paths("d_mesh", "call")[0].getAttribute("stroke"), "the ring in the outline's colour");
  assert.deepEqual(all(card, ".ranges text.range-name").map((n) => n.textContent), ["Mesh node", "Mesh satellite"]);
  const legend = $(card, ".bar .ranges-legend");
  assert.ok(legend.textContent.includes("Mesh node") && legend.textContent.includes(EN("card.floorplan.wifi.ranges_legend")
    .replace("{call}", "-67").replace("{weak}", "-75")), legend.textContent);
  assert.equal(runs, 1);
  card._render();
  assert.equal(runs, 1, "a redraw: the same outlines");
  click($(card, '.bar [data-map="wifi_24"]'));
  assert.deepEqual(all(card, ".ranges circle.range-ring").map((r) => r.getAttribute("data-ap")), ["d_mesh"], "2.4 GHz: one access point");
  click($(card, '.bar [data-map="serving"]'));
  assert.equal(chip(), null, "not on Serving");
  assert.equal($(card, ".ranges"), null);
  const again = await make({ plan: wifiPlan(aps), layers: ["radio"] }, wifiHass());
  await settle();
  click($(again, '.bar [data-map="wifi_5"]'));
  assert.equal($(again, ".bar [data-action=ranges]").getAttribute("aria-pressed"), "true", "remembered");
  window.localStorage.clear();
});

// ---- Amendment 3 review fixes ----

// The living room and the kitchen traced with a 0.5 m wall between them.
const thickPlan = () => {
  const plan = planOf();
  plan.floors[0].rooms[1] = { area_id: "kitchen", polygon: sq(5.5, 0, 3, 4) };
  return plan;
};

test("a thick wall is picked on its drawn middle line by the Walls tool and the Openings tool", async () => {
  const card = await make({ plan: thickPlan() }, hassOf());
  click($(card, "[data-action=edit]"));
  assert.ok(12 * card._px() < 0.25, "zoomed in enough that the edges are out of reach from the middle");
  const mid = all(card, "line.wall-line").filter((l) => onLine(l, 5.25));
  assert.equal(mid.length, 1, "drawn once, on the middle line");
  click($(card, '[data-action=tool][data-tool="walls"]'));
  tap(card, 5.25, 1);
  const sel = $(card, "line.wall-selected");
  assert.ok(sel && Number(sel.getAttribute("x1")) === 5.25, "selected where it is drawn");
  click($(card, '[data-action=tool][data-tool="openings"]'));
  tap(card, 5.25, 2);
  assert.deepEqual(card._doc.floors[0].openings, [{ kind: "door", rooms: ["living_room", "kitchen"], at: [5, 2] }],
    "on the living room's edge, between the two rooms, not to the outside");
  const door = $(card, 'g.opening[data-index="0"]');
  assert.equal(door.getAttribute("transform"), "translate(0.25 0)", "drawn on the wall's middle line");
  const gap = all(card, "line.wall-line").filter((l) => onLine(l, 5.25)).map((l) => [Number(l.getAttribute("y1")), Number(l.getAttribute("y2"))]);
  assert.equal(gap.length, 2, "the wall line has the door's gap");
});

test("a card showing one room draws its walls as the whole floor has them", async () => {
  const plan = planOf();
  plan.floors[0].rooms.push({ area_id: "hall", polygon: sq(0, 4, 5, 2) });
  plan.floors[0].open_spaces = [["living_room", "kitchen"]];
  const whole = await make({ plan }, hassOf());
  const room = await make({ plan, area: "living_room" }, hassOf());
  const weights = (card) => Object.fromEntries(all(card, "line.wall-line").map((l) =>
    [[l.getAttribute("x1"), l.getAttribute("y1"), l.getAttribute("x2"), l.getAttribute("y2")].join(), l.getAttribute("data-weight")]));
  const mine = weights(room);
  const full = weights(whole);
  assert.equal(Object.keys(mine).length, 4, "the living room's four walls alone");
  for (const [k, w] of Object.entries(mine)) assert.equal(w, full[k], k);
  assert.deepEqual(Object.values(mine).sort(), ["heavy", "heavy", "none", "solid"], "the open space none, the hall's wall interior");
});

test("the wall key shows wherever the walls are weighted: the plain plan and every map", async () => {
  window.localStorage.clear();
  const plain = await make({ plan: planOf() }, hassOf());
  assert.ok($(plain, ".bar .wall-key"), "no map");
  const climate = await make({ plan: planOf([pt("d_climate", 1, 1)]), layers: ["climate"] }, mapsHass());
  await settle();
  assert.ok($(climate, ".bar .legend:not(.wall-key)") && $(climate, ".bar .wall-key"), "beside a climate map's scale");
  assert.equal(all(climate, ".bar .wall-key").length, 1);
  const off = await make({ plan: planOf(), wifi: false }, hassOf());
  assert.equal($(off, ".wall-key"), null, "wifi false: outlines, no key");
  window.localStorage.clear();
});

test("ranges: the name's halo is 3 px at any zoom, a stroke in plan metres", async () => {
  window.localStorage.clear();
  const aps = [{ device_id: "d_mesh", bands: ["2.4", "5"], tx: { 5: -10 } }];
  const card = await make({ plan: wifiPlan(aps), layers: ["radio"] }, wifiHass());
  await settle();
  click($(card, '.bar [data-map="wifi_5"]'));
  click($(card, ".bar [data-action=ranges]"));
  const halo = () => Number($(card, ".ranges text.range-name").getAttribute("stroke-width"));
  assert.ok(Math.abs(halo() - 3 * card._px()) < 1e-6, String(halo()));
  assert.ok(halo() < 0.1, "metres, not 3 m");
  const before = halo();
  click($(card, "[data-action=zoom_in]"));
  assert.ok(halo() < before, "scales with the zoom");
  window.localStorage.clear();
});

// ---- the survey API for a phone survey in a host (SPEC-045: Pocket) ----------------------------

test("phone survey: spots drawn, a tap is the spot and a floorplan-tap in metres; no Survey panel and no polling", async () => {
  window.localStorage.clear();
  const f = surveyFetch({});
  try {
    const card = await make({ plan: wifiPlan(), survey: "phone" }, wifiHass());
    await settle();
    assert.equal($(card, ".survey").innerHTML, "", "the host draws its own panel");
    assert.equal(f.calls.length, 0, "no laptop link is read");
    const spots = card.surveySpots();
    assert.ok(spots.length > 0 && spots.length <= 3, `up to 3 spots, got ${spots.length}`);
    assert.ok(spots.every((s) => s.floor_id === "ground" && ["handover", "room"].includes(s.why)), "no far spots on a phone");
    assert.equal(card.shadowRoot.querySelectorAll("circle.next-spot").length, spots.length);
    const taps = [];
    let rooms = 0;
    card.addEventListener("floorplan-tap", (e) => taps.push(e.detail));
    card.addEventListener("room-tap", () => rooms++);
    tap(card, 2, 1);
    assert.equal(rooms, 0);
    assert.equal(taps.length, 1);
    assert.equal(taps[0].floor_id, "ground");
    assert.ok(Math.abs(taps[0].x - 2) < 0.1 && Math.abs(taps[0].y - 1) < 0.1, JSON.stringify(taps[0]));
    assert.ok($(card, "circle.survey-spot"));
    card.setSurveySpot(null);
    assert.equal($(card, "circle.survey-spot"), null);
    card.setSurveySpot({ floor_id: "ground", x: 6, y: 3 });
    assert.equal($(card, "circle.survey-spot").getAttribute("cx"), "6");
  } finally {
    f.restore();
  }
});

test("phone survey: addSamples reads the dashboard again and appends to that plan, then shows it", async () => {
  window.localStorage.clear();
  const fresh = wifiPlan();
  fresh.floors[0].points.push(pt("d_office", 1, 3));                       // edited on a laptop meanwhile
  const hass = hassOf({ dashboard: dashboardOf(fresh) });
  Object.assign(hass.devices, wifiHass().devices);
  const card = await make({ plan: wifiPlan(), survey: "phone" }, hass);
  const sample = { floor_id: "ground", x: 2, y: 1, t: "2026-11-11T18:05:31Z", band: "5", dbm: -61, source: "phone", phone: "ios",
    method: "shortcut", spread: 1, scans: [{ t: "2026-11-11T18:05:27+01:00", dbm: -61 }] };
  await card.addSamples([sample]);
  const save = hass.calls.find((c) => c.type === "lovelace/config/save");
  const saved = save.config.views[0].cards[0].plan;
  assert.ok(saved.floors[0].points.some((p) => p.device_id === "d_office"), "the fresh plan, not the card's");
  assert.deepEqual(saved.wifi.samples, [sample]);
  assert.deepEqual(card._doc.wifi.samples, [sample], "the card shows the saved plan");
  assert.deepEqual(card.surveySamples(), [sample], "the plan's phone readings, newest first");
  await card.removeSample(sample.t, "ios");
  const again = hass.calls.filter((c) => c.type === "lovelace/config/save").at(-1).config.views[0].cards[0].plan;
  assert.deepEqual(again.wifi?.samples ?? [], []);
});

test("phone survey: a non-administrator cannot save samples", async () => {
  const hass = hassOf({ admin: false, dashboard: dashboardOf(wifiPlan()) });
  const card = await make({ plan: wifiPlan(), survey: "phone" }, hass);
  await assert.rejects(card.addSamples([{ floor_id: "ground", x: 1, y: 1, band: "5", dbm: -60 }]), /not admin/);
  assert.ok(!hass.calls.some((c) => c.type === "lovelace/config/save"));
});

test("phone survey: resolveReading and predictionAt answer from the card's plan and hass", async () => {
  const card = await make({ plan: wifiPlan(), survey: "phone" }, wifiHass());
  assert.deepEqual(card.resolveReading({ bssid: "02:00:00:00:00:77", channel: 44 }), { ap: null, band: "5", via: "channel" });
  const near = card.predictionAt({ floor_id: "ground", x: 6.5, y: 2.5 }, "d_mesh", "5");
  const far = card.predictionAt({ floor_id: "ground", x: 0.5, y: 0.5 }, "d_mesh", "5");
  assert.ok(Number.isFinite(near) && near > far && near > -50, `${near} vs ${far}`);
  assert.equal(card.predictionAt({ floor_id: "ground", x: 1, y: 1 }, "d_mesh2", "2.4"), null, "a band it does not serve");
});

test("phone survey: focusRoom shows one room as the area view does, neighbours faded; spots, map and taps in it alone", async () => {
  window.localStorage.clear();
  const card = await make({ plan: wifiPlan(), survey: "phone" }, wifiHass());
  await settle();
  const box = () => $(card, "svg").getAttribute("viewBox").split(" ").map(Number);
  const whole = box();
  card.focusRoom("kitchen");                                   // the kitchen: x 5..8, y 0..4
  await settle();
  assert.ok($(card, "g.context"), "the other rooms, faded");
  const [x, y] = box();
  assert.ok(x < 5 && x > 2 && y < 0, `fitted to the kitchen with its context: ${box()}`);
  const inKitchen = (px, py) => px >= 5 - 1e-6 && px <= 8 + 1e-6 && py >= -1e-6 && py <= 4 + 1e-6;
  const spots = card.surveySpots();
  assert.ok(spots.length > 0 && spots.every((p) => inKitchen(p.x, p.y)), JSON.stringify(spots));
  const cells = [...card.shadowRoot.querySelectorAll(".heat rect[data-dbm]")];
  assert.ok(cells.length > 0 && cells.every((c) => inKitchen(Number(c.getAttribute("x")), Number(c.getAttribute("y")))),
    "the map in the kitchen only");
  const taps = [];
  card.addEventListener("floorplan-tap", (e) => taps.push(e.detail));
  tap(card, 2, 1);                                             // the living room, faded
  assert.equal(taps.length, 0);
  tap(card, 6, 1);
  assert.equal(taps.length, 1);
  card.focusRoom(null);
  await settle();
  assert.equal($(card, "g.context"), null);
  assert.deepEqual(box(), whole);
  assert.ok(card.surveySpots().some((p) => !inKitchen(p.x, p.y)), "the whole floor's spots again");
});

test("phone survey: the readings follow the Readings switch too (opt-in), the map's band only", async () => {
  window.localStorage.clear();
  const plan = wifiPlan();
  const phone = (x, band, dbm) => ({ floor_id: "ground", x, y: 1, t: `2026-11-11T18:2${x}:00Z`, band, dbm, source: "phone", phone: "ios",
    method: "shortcut", spread: 1, scans: [{ t: "2026-11-11T18:26:24Z", dbm }] });
  plan.wifi = { samples: [phone(2, "5", -48), phone(6, "2.4", -73)] };
  const card = await make({ plan, survey: "phone" }, wifiHass());
  await settle();
  assert.equal(sampleDots(card).length, 0, "off until chosen, on the phone too");
  click($(card, ".bar [data-action=readings]"));
  click($(card, '.bar [data-map="wifi_5"]'));
  assert.deepEqual(sampleDots(card).map((d) => d.querySelector(".sample-label").textContent), ["−48", "≤−75"],
    "the 5 GHz map: its readings, and the 2.4 GHz one as the ceiling it is (Amendment 4)");
  click($(card, '.bar [data-map="wifi_24"]'));
  assert.deepEqual(sampleDots(card).map((d) => d.querySelector(".sample-label").textContent), ["−73"]);
  window.localStorage.clear();
});

test("phone survey: focusRoom from one room straight to another shows the other (the scoped floor is per room)", async () => {
  window.localStorage.clear();
  const card = await make({ plan: wifiPlan(), survey: "phone" }, wifiHass());
  await settle();
  card.focusRoom("kitchen");
  await settle();
  card.focusRoom("living_room");                               // x 0..5, y 0..4
  await settle();
  const inLiving = (px, py) => px >= -1e-6 && px <= 5 + 1e-6 && py >= -1e-6 && py <= 4 + 1e-6;
  const cells = [...card.shadowRoot.querySelectorAll(".heat rect[data-dbm]")];
  assert.ok(cells.length > 0 && cells.every((c) => inLiving(Number(c.getAttribute("x")), Number(c.getAttribute("y")))),
    "the living room's map, not the kitchen's");
  assert.ok(card.surveySpots().every((p) => inLiving(p.x, p.y)), JSON.stringify(card.surveySpots()));
  const [x] = $(card, "svg").getAttribute("viewBox").split(" ").map(Number);
  assert.ok(x < 0, `fitted to the living room: ${x}`);
});

test("wifi maps: Readings (opt-in, remembered) shows the survey readings as dots on any Wi-Fi map", async () => {
  window.localStorage.clear();
  const plan = wifiPlan();
  plan.wifi = { samples: [
    { floor_id: "ground", x: 2, y: 1, t: "2026-11-11T18:26:28Z", band: "5", dbm: -48, source: "phone", phone: "ios", method: "shortcut",
      spread: 1, scans: [{ t: "2026-11-11T18:26:24Z", dbm: -48 }] },
    { floor_id: "ground", x: 6, y: 3, t: "2026-11-11T19:31:00Z", band: "2.4", dbm: -63, source: "manual" }] };
  const card = await make({ plan, layers: ["radio"] }, wifiHass());
  await settle();
  const chip = () => $(card, ".bar [data-action=readings]");
  assert.equal(chip().getAttribute("aria-pressed"), "false", "off until chosen");
  assert.equal(sampleDots(card).length, 0);
  click(chip());
  assert.equal(sampleDots(card).length, 1, "the 2.4 GHz map: its reading");
  click($(card, '.bar [data-map="wifi_5"]'));
  assert.equal(sampleDots(card).length, 1, "the 5 GHz map: its reading");
  click($(card, '.bar [data-map="serving"]'));
  assert.equal(sampleDots(card).length, 1, "Serving: the band beside it");
  const again = await make({ plan, layers: ["radio"] }, wifiHass());
  await settle();
  assert.equal($(again, ".bar [data-action=readings]").getAttribute("aria-pressed"), "true", "remembered");
  click($(again, ".bar [data-action=readings]"));
  assert.equal(sampleDots(again).length, 0);
  const none = await make({ plan: wifiPlan(), layers: ["radio"] }, wifiHass());
  await settle();
  assert.equal($(none, ".bar [data-action=readings]"), null, "no readings in the plan: no switch");
  window.localStorage.clear();
});

test("wifi maps: a reading's dot tells its data on hover (its title)", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("domosenso.floorplan.readings", "true");
  const plan = wifiPlan();
  plan.wifi = { samples: [{ floor_id: "ground", x: 2, y: 1, t: "2026-11-11T18:26:28Z", band: "2.4", channel: 6, dbm: -48, noise: -96,
    ap: "d_mesh", source: "phone", phone: "ios", method: "shortcut", spread: 2, scans: [{ t: "2026-11-11T18:26:24Z", dbm: -48 }, { t: "2026-11-11T18:26:25Z", dbm: -49 }] }] };
  const card = await make({ plan, layers: ["radio"] }, wifiHass());
  await settle();
  const title = sampleDots(card)[0].querySelector("title").textContent;
  for (const part of ["−48 dBm", "2.4 GHz", "channel 6", "Mesh", "noise −96 dBm", "spread 2 dB", "2 scans"]) {
    assert.ok(title.includes(part), `${part} in ${title}`);
  }
  window.localStorage.clear();
});

test("steering (Amendment 4): the Walls panel sets Band steering below; on the 5 GHz map a 2.4 GHz reading is a hollow ≤ dot and the map is held under it", async () => {
  window.localStorage.clear();
  const plan = wifiPlan();
  plan.wifi = { samples: [{ floor_id: "ground", x: 1, y: 3, t: "2026-11-11T18:56:28Z", band: "2.4", dbm: -79, source: "phone", phone: "ios",
    method: "shortcut", spread: 1, scans: [{ t: "2026-11-11T18:56:24Z", dbm: -79 }] }] };
  const card = await make({ plan, layers: ["radio"] }, wifiHass());
  await settle();
  assert.ok(card._calibration().residuals.some((e) => e.kind === "ceiling" && e.obs.dbm === -75), "the default threshold reaches the fit");
  click($(card, ".bar [data-action=readings]"));
  click($(card, '.bar [data-map="wifi_5"]'));
  const dot = $(card, "g.sample.ceiling");
  assert.ok(dot, "a hollow dot on the 5 GHz map");
  assert.equal(dot.querySelector(".sample-label").textContent, "≤−75");
  assert.ok(dot.querySelector("title").textContent.includes("2.4 GHz"), dot.querySelector("title").textContent);
  click($(card, '.bar [data-map="wifi_24"]'));
  assert.equal($(card, "g.sample.ceiling"), null, "on 2.4 GHz it is the reading itself");
  click($(card, "[data-action=edit]"));
  click($(card, '[data-action=tool][data-tool="walls"]'));
  const field = $(card, '.wall-panel [data-field="steering"]');
  assert.equal(field.value, "-75");
  change(field, "-70");
  assert.equal(card._doc.wifi.steering_dbm, -70);
  window.localStorage.clear();
});
