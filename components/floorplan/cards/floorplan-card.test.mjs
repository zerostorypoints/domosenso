import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shadowText } from "./testing/dom-env.mjs";
import { withPlan } from "./lib/plan.js";

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
  assert.ok(!$(card, ".legend").hidden);
  assert.ok(shadowText(card).includes(EN("card.floorplan.maps.no_sensor")));
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
  const card = await make({ plan: planOf([pt("d_climate", 1, 1)]), layers: ["climate"] }, hass);
  await settle();
  click($(card, '.bar [data-action=day][data-day="1"]'));
  await settle();
  const call = hass.calls.find((c) => c.type === "recorder/statistics_during_period");
  assert.deepEqual(call.types, ["mean", "min", "max"]);
  assert.equal(call.period, "hour");
  assert.deepEqual(call.statistic_ids, ["sensor.alex_co2", "sensor.alex_humidity", "sensor.alex_temperature"]);
  assert.ok(Math.abs(Date.parse(call.start_time) - (Date.now() - 24 * 3600e3)) < 60e3);
  assert.deepEqual(lines(card, "d_climate"), [["21.0 °C", true], ["1200 ppm", false]],
    "temperature: the mean; CO2: the highest; humidity without statistics left out");
  click($(card, '.bar [data-map="carbon_dioxide"]'));
  assert.ok(shadowText(card).includes("24 h, highest"));
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
