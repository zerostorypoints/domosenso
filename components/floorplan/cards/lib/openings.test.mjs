import { test } from "node:test";
import assert from "node:assert/strict";
import {
  openingState, openingShape, wallAt, addOpening, moveOpening, setOpening, removeOpening, openingSensors,
  linkedSpots, widthOf, styleOf, wallSpan, swapHinge, swapSide, fillWall,
} from "./openings.js";

// Two rooms side by side sharing the wall x = 4; the outside is everywhere else.
const A = { area_id: "a", polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] };
const B = { area_id: "b", polygon: [[4, 0], [7, 0], [7, 3], [4, 3]] };
const floor = (openings) => ({ floor_id: "g", rooms: [A, B], points: [], ...(openings ? { openings } : {}) });
const doc = (openings) => ({ schema: 1, floors: [floor(openings)] });
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9;

test("defaults follow the kind", () => {
  assert.equal(widthOf({ rooms: ["a", "b"] }), 0.8);
  assert.equal(widthOf({ kind: "window", rooms: ["a", null] }), 1.0);
});

test("without a sensor: open between rooms, closed to the outside, unless state says", () => {
  assert.deepEqual(openingState({ rooms: ["a", "b"] }, {}), { open: true, linked: false, known: true });
  assert.equal(openingState({ rooms: ["a", null] }, {}).open, false);
  assert.equal(openingState({ rooms: ["a", "b"], state: "closed" }, {}).open, false);
  assert.equal(openingState({ kind: "opening", rooms: ["a", "b"], state: "closed" }, {}).open, true);
});

test("a linked sensor gives the live state; an unanswered one falls back and is unknown", () => {
  const o = { rooms: ["a", "b"], state: "closed", entity: "binary_sensor.door" };
  const hass = (state, attributes = {}) => ({ states: { [o.entity]: { state, attributes }, "cover.w": { state, attributes } } });
  assert.deepEqual(openingState(o, hass("on")), { open: true, linked: true, known: true });
  assert.equal(openingState(o, hass("off")).open, false);
  assert.deepEqual(openingState(o, hass("unavailable")), { open: false, linked: true, known: false });
  assert.deepEqual(openingState(o, {}), { open: false, linked: true, known: false });
  const w = { kind: "window", rooms: ["a", null], entity: "cover.w" };
  assert.equal(openingState(w, hass("open")).open, true);
  assert.equal(openingState(w, hass("closed")).open, false);
  assert.equal(openingState(w, hass("stopped", { current_position: 20 })).open, true);
});

test("the shape sits on its first room's nearest wall, the normal into that room", () => {
  const s = openingShape(floor(), { rooms: ["a", "b"], at: [4, 1.5], width: 1 });
  assert.ok(near(s.centre, [4, 1.5]));
  assert.ok(near(s.ends[0], [4, 1]) || near(s.ends[0], [4, 2]));
  assert.ok(near(s.normal, [-1, 0]));          // into room a
  const t = openingShape(floor(), { rooms: ["b", "a"], at: [4.02, 1.5] });
  assert.ok(near(t.normal, [1, 0]));           // into room b
  assert.equal(openingShape(floor(), { rooms: ["nowhere", null], at: [0, 0] }), null);
});

test("a wall point names both rooms on a shared wall, the outside on an outer one", () => {
  assert.deepEqual(wallAt(floor(), [4.01, 1.52], 0.1), { at: [4, 1.5], rooms: ["a", "b"] });
  assert.deepEqual(wallAt(floor(), [2.02, -0.03], 0.1).rooms, ["a", null]);
  assert.equal(wallAt(floor(), [2, 1.5], 0.1), null);
});

test("add, move, change and remove an opening", () => {
  let d = addOpening(doc(), "g", [4.01, 1.5], 0.1);
  assert.deepEqual(d.floors[0].openings, [{ kind: "door", rooms: ["a", "b"], at: [4, 1.5] }]);
  assert.equal(addOpening(doc(), "g", [2, 1.5], 0.1), null);
  d = moveOpening(d, "g", 0, [6, 3.02], 0.1);
  assert.deepEqual(d.floors[0].openings[0].rooms, ["b", null]);
  d = setOpening(d, "g", 0, { kind: "window", width: 1.2, entity: "cover.w" });
  assert.deepEqual(d.floors[0].openings[0], { kind: "window", rooms: ["b", null], at: [6, 3], width: 1.2, entity: "cover.w" });
  assert.equal(setOpening(d, "g", 0, { width: 0 }), null);
  d = setOpening(d, "g", 0, { width: "" });
  assert.equal(d.floors[0].openings[0].width, undefined);
  d = setOpening(d, "g", 0, { kind: "opening", state: "closed", entity: "cover.w" });
  assert.deepEqual(d.floors[0].openings[0], { kind: "opening", rooms: ["b", null], at: [6, 3] });
  d = removeOpening(d, "g", 0);
  assert.equal(d.floors[0].openings, undefined);
});

test("a sensor sits on one opening: linking it again moves it", () => {
  let d = doc([{ rooms: ["a", "b"], at: [4, 1], entity: "binary_sensor.x" }, { rooms: ["a", null], at: [2, 0] }]);
  d = setOpening(d, "g", 1, { entity: "binary_sensor.x" });
  assert.equal(d.floors[0].openings[0].entity, undefined);
  assert.equal(d.floors[0].openings[1].entity, "binary_sensor.x");
});

test("sensors to link: door and window kinds only, the opening's rooms first", () => {
  const hass = {
    states: {
      "binary_sensor.front": { state: "off", attributes: { device_class: "door", friendly_name: "Front" } },
      "binary_sensor.a_window": { state: "off", attributes: { device_class: "window", friendly_name: "Window" } },
      "binary_sensor.motion": { state: "off", attributes: { device_class: "motion" } },
      "cover.blind": { state: "open", attributes: { device_class: "shade" } },
      "cover.gate": { state: "closed", attributes: { device_class: "gate", friendly_name: "Gate" } },
    },
    entities: { "binary_sensor.a_window": { device_id: "d1" } },
    devices: { d1: { area_id: "a" } },
  };
  assert.deepEqual(openingSensors(hass, { rooms: ["a", null] }).map((s) => s.id),
    ["binary_sensor.a_window", "binary_sensor.front", "cover.gate"]);
});

test("a linked sensor's dot stands on its opening", () => {
  const spots = linkedSpots(floor([{ rooms: ["a", "b"], at: [4, 1.5], entity: "binary_sensor.x" }, { rooms: ["a", null], at: [1, 0] }]));
  assert.deepEqual([...spots.keys()], ["binary_sensor.x"]);
  assert.ok(near(spots.get("binary_sensor.x"), [4, 1.5]));
});

test("a door's hinge is left or right seen from the side it opens into; swapping turns it", () => {
  const o = { rooms: ["a", "b"], at: [4, 1.5], width: 1 };
  // From room a, facing the wall at x = 4, left is towards y = 0.
  assert.ok(near(openingShape(floor(), o).hinge, [4, 1]));
  assert.ok(near(openingShape(floor(), { ...o, hinge: "right" }).hinge, [4, 2]));
  const into = openingShape(floor(), { ...o, opens: "b" });
  assert.ok(near(into.normal, [1, 0]));
  assert.ok(near(into.hinge, [4, 2]));        // from room b, left is towards y = 3
  let d = doc([o]);
  d = swapHinge(d, "g", 0);
  assert.equal(d.floors[0].openings[0].hinge, "right");
  d = swapHinge(d, "g", 0);
  assert.equal(d.floors[0].openings[0].hinge, undefined, "left is the default");
  d = swapSide(d, "g", 0);
  assert.equal(d.floors[0].openings[0].opens, "b");
  d = swapSide(d, "g", 0);
  assert.equal(d.floors[0].openings[0].opens, undefined, "its first room is the default");
  let out = doc([{ rooms: ["a", null], at: [2, 0] }]);
  out = swapSide(out, "g", 0);
  assert.equal(out.floors[0].openings[0].opens, "outside");
  assert.ok(near(openingShape(floor(), out.floors[0].openings[0]).normal, [0, -1]));
});

test("sliding is a door's style; a window or doorway sheds a door's swing", () => {
  assert.equal(styleOf({ rooms: ["a", "b"], sliding: true }), "sliding");
  assert.equal(styleOf({ kind: "window", rooms: ["a", null], sliding: true }), "hinged");
  let d = doc([{ rooms: ["a", "b"], at: [4, 1.5] }]);
  d = setOpening(d, "g", 0, { sliding: true, hinge: "right", opens: "b" });
  assert.deepEqual(d.floors[0].openings[0], { rooms: ["a", "b"], at: [4, 1.5], sliding: true, hinge: "right", opens: "b" });
  assert.equal(setOpening(d, "g", 0, { sliding: false }).floors[0].openings[0].sliding, undefined);
  d = setOpening(d, "g", 0, { kind: "window" });
  assert.deepEqual(d.floors[0].openings[0], { kind: "window", rooms: ["a", "b"], at: [4, 1.5] });
  assert.equal(setOpening(doc([{ rooms: ["a", "b"], at: [4, 1.5] }]), "g", 0, { opens: "nowhere" }).floors[0].openings[0].opens, undefined);
});

test("fixed glass never opens and has no sensor", () => {
  const f = { kind: "fixed", rooms: ["a", null], at: [2, 0] };
  assert.deepEqual(openingState({ ...f, state: "open" }, {}), { open: false, linked: false, known: true });
  assert.equal(widthOf(f), 1.0);
  const d = setOpening(doc([{ rooms: ["a", null], at: [2, 0], entity: "binary_sensor.x", state: "open", hinge: "right" }]),
    "g", 0, { kind: "fixed" });
  assert.deepEqual(d.floors[0].openings[0], f);
});

test("the free wall either side runs to the nearest corner or junction; whole wall fills it", () => {
  const B1 = { area_id: "b1", polygon: [[4, 0], [7, 0], [7, 1.2], [4, 1.2]] };
  const B2 = { area_id: "b2", polygon: [[4, 1.2], [7, 1.2], [7, 3], [4, 3]] };
  const fl = { floor_id: "g", rooms: [A, B1, B2], points: [], openings: [{ rooms: ["a", "b2"], at: [4, 2], width: 0.8 }] };
  const span = wallSpan(fl, openingShape(fl, fl.openings[0]));
  const lengths = [span.before.length, span.after.length].sort();
  assert.ok(Math.abs(lengths[0] - 0.4) < 1e-9 && Math.abs(lengths[1] - 0.6) < 1e-9, String(lengths));
  const d = fillWall({ schema: 1, floors: [fl] }, "g", 0);
  assert.deepEqual(d.floors[0].openings[0], { rooms: ["a", "b2"], at: [4, 2.1], width: 1.8 });
});
