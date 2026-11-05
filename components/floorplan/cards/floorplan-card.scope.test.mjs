// The card's options for a host page (a phone): `area` (one area's room alone), `zoom: false`,
// `chips: false` with layerChips / pressLayer, and the room-tap and floorplan-status events.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shadowText } from "./testing/dom-env.mjs";

await import("./floorplan-card.js");
const en = JSON.parse(readFileSync(new URL("../translations/en.json", import.meta.url), "utf8"));

const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const RECT = { left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0 };

// Two rooms side by side on the ground floor, an office upstairs; a door between the two rooms
// whose first room is the kitchen.
const plan = () => ({
  schema: 1,
  floors: [
    { floor_id: "ground",
      rooms: [{ area_id: "living_room", polygon: sq(0, 0, 5, 4) }, { area_id: "kitchen", polygon: sq(5, 0, 3, 4) }],
      points: [
        { device_id: "d_climate", x: 2, y: 2, placed: true },
        { entity_id: "plant.monstera", x: 6, y: 2, placed: true },
      ],
      openings: [{ kind: "door", rooms: ["kitchen", "living_room"], at: [5, 2], width: 0.8 }],
      open_spaces: [["living_room", "kitchen"]] },
    { floor_id: "upper", rooms: [{ area_id: "office", polygon: sq(0, 0, 4, 3) }], points: [] },
  ],
});

function hassOf() {
  return {
    language: "en",
    locale: { language: "en" },
    user: { is_admin: true },
    areas: {
      living_room: { area_id: "living_room", name: "Living room" },
      kitchen: { area_id: "kitchen", name: "Kitchen" },
      office: { area_id: "office", name: "Office" },
    },
    floors: {},
    devices: { d_climate: { id: "d_climate", name: "Climate sensor", area_id: "living_room" } },
    entities: {
      "sensor.alex_temperature": { entity_id: "sensor.alex_temperature", device_id: "d_climate" },
      "plant.monstera": { entity_id: "plant.monstera", device_id: null, area_id: "kitchen" },
    },
    states: {
      "sensor.alex_temperature": { state: "21.5", attributes: { device_class: "temperature", unit_of_measurement: "°C" } },
      "plant.monstera": { state: "ok", attributes: { friendly_name: "Monstera" } },
    },
    async callWS() {
      return null;
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const $ = (card, sel) => card.shadowRoot.querySelector(sel);
const $$ = (card, sel) => [...card.shadowRoot.querySelectorAll(sel)];

async function make(config, events = []) {
  const card = document.createElement("floorplan-card");
  for (const type of ["room-tap", "floorplan-status"]) card.addEventListener(type, (e) => events.push([type, e.detail]));
  document.body.appendChild(card);
  card.setConfig(config);
  card.hass = hassOf();
  await settle();
  $(card, "svg").getBoundingClientRect = () => RECT;
  return card;
}
const pointer = (node, type, x, y, id = 1, pointerType = "mouse") => node.dispatchEvent(new window.PointerEvent(type, {
  bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, pointerId: id, button: 0, isPrimary: id === 1, pointerType,
}));
// A finger's tap: down and up at one spot, then the pointerleave touch fires after it.
const fingerTap = (card, node, x, y) => {
  pointer(node, "pointerdown", x, y, 1, "touch");
  pointer(node, "pointerup", x, y, 1, "touch");
  $(card, "ha-card").dispatchEvent(new window.PointerEvent("pointerleave", { pointerType: "touch" }));
};
function clientAt(card, px, py) {
  const [x, y, w, h] = $(card, "svg").getAttribute("viewBox").split(" ").map(Number);
  const s = Math.min(RECT.width / w, RECT.height / h);
  return [(px - x) * s + (RECT.width - w * s) / 2, (py - y) * s + (RECT.height - h * s) / 2];
}

test("area: only that room, its points and its door, fitted to it, with no Edit", async () => {
  const card = await make({ plan: plan(), area: "living_room" });
  assert.equal($$(card, "polygon.room").length, 1);
  assert.equal($(card, "polygon.room").getAttribute("data-area"), "living_room");
  assert.deepEqual($$(card, "g.marker").map((g) => g.getAttribute("data-key")), ["d_climate"]);
  assert.equal($$(card, "g.opening").length, 1, "the door the kitchen lists first is drawn from this room");
  assert.equal($$(card, "line.open-wall").length, 0, "no open space with a room that is not shown");
  const [x, , w] = $(card, "svg").getAttribute("viewBox").split(" ").map(Number);
  assert.ok(x < 0 && w < 6.1, `fitted to the 5 m room: ${$(card, "svg").getAttribute("viewBox")}`);
  assert.equal($(card, "[data-action=edit]"), null);
  assert.equal(card.getAttribute("data-status"), "ready");
});

test("area: a door turned round is drawn where the whole plan draws it", async () => {
  const leaf = (card) => ["x1", "y1", "x2", "y2"].map((k) => Number($(card, "g.opening line.leaf").getAttribute(k)));
  const whole = leaf(await make({ plan: plan() }));
  for (const area of ["living_room", "kitchen"]) {
    const scoped = leaf(await make({ plan: plan(), area }));
    scoped.forEach((v, i) => assert.ok(Math.abs(v - whole[i]) < 1e-9, `${area}: ${scoped} vs ${whole}`));
  }
});

test("area with context: the other rooms faded and named, untappable, without their points; the view wider", async () => {
  const card = await make({ plan: plan(), area: "living_room", context: true });
  const faded = $$(card, "g.context polygon.room");
  assert.equal(faded.length, 1, "the kitchen, faded");
  assert.equal(faded[0].getAttribute("data-area"), null, "a faded room is not a room to tap");
  assert.ok($(card, "g.context text.label").textContent.includes("Kitchen"));
  assert.deepEqual($$(card, "polygon.room[data-area]").map((r) => r.getAttribute("data-area")), ["living_room"]);
  assert.deepEqual($$(card, "g.marker").map((g) => g.getAttribute("data-key")), ["d_climate"], "no kitchen plant");
  const width = (c) => Number($(c, "svg").getAttribute("viewBox").split(" ")[2]);
  const alone = await make({ plan: plan(), area: "living_room" });
  assert.ok(Math.abs(width(card) - width(alone) - 3) < 1e-6, `1.5 m more on each side: ${width(card)} vs ${width(alone)}`);
});

test("context without area changes nothing", async () => {
  const card = await make({ plan: plan(), context: true });
  assert.equal($$(card, "g.context").length, 0);
  assert.equal($$(card, "polygon.room").length, 2);
});

test("area: a room on another floor shows that floor's room", async () => {
  const card = await make({ plan: plan(), area: "office", floor: "ground" });
  assert.deepEqual($$(card, "polygon.room").map((r) => r.getAttribute("data-area")), ["office"]);
});

test("area: an area with no room on the plan says so and reports no_area", async () => {
  const events = [];
  const card = await make({ plan: plan(), area: "garden" }, events);
  assert.ok(shadowText(card).includes(en.card.floorplan.no_area), shadowText(card));
  assert.equal(card.getAttribute("data-status"), "no_area");
  assert.deepEqual(events.filter(([type]) => type === "floorplan-status").at(-1), ["floorplan-status", { status: "no_area" }]);
  assert.equal($$(card, "polygon.room").length, 0);
});

test("without area the card draws every room as before", async () => {
  const card = await make({ plan: plan() });
  assert.equal($$(card, "polygon.room").length, 2);
  assert.ok($(card, "[data-action=edit]"));
  assert.equal($$(card, "line.open-wall").length > 0, true);
});

test("a tap on a room in view mode fires room-tap with its area; a drag does not", async () => {
  const events = [];
  const card = await make({ plan: plan() }, events);
  const svg = $(card, "svg");
  const [x, y] = clientAt(card, 6.5, 1);
  pointer($(card, "polygon.room"), "pointerdown", x, y);
  pointer(svg, "pointerup", x, y);
  assert.deepEqual(events.filter(([type]) => type === "room-tap"), [["room-tap", { area_id: "kitchen" }]]);
  pointer(svg, "pointerdown", x, y);
  pointer(svg, "pointermove", x + 40, y);
  pointer(svg, "pointerup", x + 40, y);
  assert.equal(events.filter(([type]) => type === "room-tap").length, 1);
});

test("zoom: false: no zoom buttons, no bar, a drag does not pan and a pinch does not zoom", async () => {
  const card = await make({ plan: plan(), zoom: false, maps: false, edit: false });
  assert.equal($(card, "[data-action=zoom_in]"), null);
  assert.equal($(card, ".bar").innerHTML, "");
  assert.ok($(card, "ha-card").classList.contains("fixed"));
  const svg = $(card, "svg");
  const before = svg.getAttribute("viewBox");
  pointer(svg, "pointerdown", 100, 100);
  pointer(svg, "pointermove", 200, 150);
  pointer(svg, "pointerup", 200, 150);
  pointer(svg, "pointerdown", 100, 100, 1);
  pointer(svg, "pointerdown", 200, 100, 2);
  pointer(svg, "pointermove", 300, 100, 2);
  pointer(svg, "pointerup", 300, 100, 2);
  pointer(svg, "pointerup", 100, 100, 1);
  assert.equal(svg.getAttribute("viewBox"), before);
});

test("zoom stays on by default", async () => {
  const card = await make({ plan: plan() });
  assert.ok($(card, "[data-action=zoom_in]"));
  assert.ok(!$(card, "ha-card").classList.contains("fixed"));
});

test("chips: false hides the layer chips; layerChips and pressLayer give them to a host", async () => {
  window.localStorage.clear();
  const card = await make({ plan: plan(), chips: false });
  assert.equal($(card, ".layers").innerHTML, "");
  const chips = card.layerChips;
  assert.deepEqual(chips.map((c) => [c.id, c.on]), [["plants", true], ["climate", true]]);
  assert.ok(chips.every((c) => c.name && c.colour.startsWith("var(--floorplan-")));
  card.pressLayer("plants");
  assert.deepEqual(card.layerChips.map((c) => [c.id, c.on]), [["plants", false], ["climate", true]]);
  assert.equal($(card, 'g.marker[data-key="plant.monstera"]'), null);
  card.pressLayer("plants");
  assert.ok($(card, 'g.marker[data-key="plant.monstera"]'));
});

test("chips stay in the card by default and press the same way", async () => {
  window.localStorage.clear();
  const card = await make({ plan: plan() });
  const chip = $(card, '.layers [data-layer="plants"]');
  assert.ok(chip);
  chip.dispatchEvent(new window.MouseEvent("click", { bubbles: true, composed: true }));
  assert.equal(card.layerChips.find((c) => c.id === "plants").on, false);
  window.localStorage.clear();
});

test("a finger's tap on a marker shows its tooltip until the next tap elsewhere, which opens no room", async () => {
  const events = [];
  const card = await make({ plan: plan() }, events);
  const tip = $(card, ".tip");
  const [mx, my] = clientAt(card, 2, 2);
  fingerTap(card, $(card, 'g.marker[data-key="d_climate"] .shape'), mx, my);
  assert.equal(tip.hidden, false, "shown, and kept after the finger leaves");
  assert.match(tip.textContent, /Climate sensor/);
  assert.match(tip.textContent, /21[.,]5/);
  assert.equal(events.filter(([type]) => type === "room-tap").length, 0, "a marker's tap opens no room");
  const [rx, ry] = clientAt(card, 6.5, 1);
  fingerTap(card, $(card, 'polygon.room[data-area="kitchen"]'), rx, ry);
  assert.equal(tip.hidden, true);
  assert.equal(events.filter(([type]) => type === "room-tap").length, 0, "the closing tap only closes");
  fingerTap(card, $(card, 'polygon.room[data-area="kitchen"]'), rx, ry);
  assert.deepEqual(events.filter(([type]) => type === "room-tap"), [["room-tap", { area_id: "kitchen" }]]);
});

test("a finger's drag after a tip drops it; the next tap opens its room", async () => {
  const events = [];
  const card = await make({ plan: plan() }, events);
  const [mx, my] = clientAt(card, 2, 2);
  fingerTap(card, $(card, 'g.marker[data-key="d_climate"] .shape'), mx, my);
  const svg = $(card, "svg");
  pointer(svg, "pointerdown", 100, 100, 1, "touch");
  pointer(svg, "pointermove", 160, 100, 1, "touch");
  pointer(svg, "pointerup", 160, 100, 1, "touch");
  assert.equal($(card, ".tip").hidden, true);
  const [rx, ry] = clientAt(card, 6.5, 1);
  fingerTap(card, $(card, 'polygon.room[data-area="kitchen"]'), rx, ry);
  assert.equal(events.filter(([type]) => type === "room-tap").length, 1);
});

test("a tooltip a tap pinned is gone when the card leaves the page and comes back", async () => {
  const card = await make({ plan: plan() });
  fingerTap(card, $(card, 'g.marker[data-key="d_climate"] .shape'), ...clientAt(card, 2, 2));
  assert.equal($(card, ".tip").hidden, false);
  const parent = card.parentNode;
  card.remove();
  parent.append(card);
  assert.equal($(card, ".tip").hidden, true);
  assert.equal(card._pinned, null, "the next tap is a plain tap, not the one that closes it");
});

test("a mouse click on a marker pins nothing (it has hover); tap_tips: false pins nothing either", async () => {
  const mouse = await make({ plan: plan() });
  const [mx, my] = clientAt(mouse, 2, 2);
  const shape = $(mouse, 'g.marker[data-key="d_climate"] .shape');
  pointer(shape, "pointerdown", mx, my);
  pointer(shape, "pointerup", mx, my);
  $(mouse, "ha-card").dispatchEvent(new window.PointerEvent("pointerleave", { pointerType: "mouse" }));
  assert.equal($(mouse, ".tip").hidden, true);
  const off = await make({ plan: plan(), tap_tips: false });
  fingerTap(off, $(off, 'g.marker[data-key="d_climate"] .shape'), ...clientAt(off, 2, 2));
  assert.equal($(off, ".tip").hidden, true);
});
