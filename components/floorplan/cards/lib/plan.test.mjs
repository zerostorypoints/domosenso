import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POINT_CLASSES, SCHEMA_VERSION, supported, emptyPlan, candidates, autoPlace, tray, roomOf, roomLabel,
  movePoint, moveCorner, insertCorner, removeCorner, splitRoom, joinRooms, linkRoom, withPlan,
  extract, addPoint, addPoints, DERIVED_PLATFORMS, roomHint, trayGroups, candidateName,
} from "./plan.js";
import { joinPolygons, centroid, pointInPolygon } from "./geometry.js";

const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

const hass = {
  areas: {
    living_room: { area_id: "living_room", name: "Living room", floor_id: "ground" },
    kitchen: { area_id: "kitchen", name: "Kitchen", floor_id: "ground" },
  },
  devices: {
    d_temp: { id: "d_temp", area_id: "living_room" },
    d_light: { id: "d_light", area_id: "kitchen" },
    d_moved: { id: "d_moved", area_id: "kitchen" },
  },
  entities: {
    "sensor.temp": { entity_id: "sensor.temp", device_id: "d_temp" },
    "sensor.hum": { entity_id: "sensor.hum", device_id: "d_temp" },
    "light.lamp": { entity_id: "light.lamp", device_id: "d_light" },
    "sensor.moved": { entity_id: "sensor.moved", device_id: "d_moved", area_id: "living_room" },
    "plant.monstera": { entity_id: "plant.monstera", device_id: null, area_id: null },
    "sensor.garage_co2": { entity_id: "sensor.garage_co2", device_id: null, area_id: "office" },
  },
  states: {
    "sensor.temp": { state: "21", attributes: { device_class: "temperature" } },
    "sensor.hum": { state: "40", attributes: { device_class: "humidity" } },
    "light.lamp": { state: "on", attributes: {} },
    "sensor.moved": { state: "1", attributes: { device_class: "illuminance" } },
    "plant.monstera": { state: "ok", attributes: {} },
    "sensor.garage_co2": { state: "500", attributes: { device_class: "carbon_dioxide" } },
  },
};

const doc = () => ({
  schema: 1,
  floors: [{
    floor_id: "ground",
    rooms: [
      { area_id: "living_room", polygon: sq(0, 0, 4, 4) },
      { area_id: "kitchen", polygon: sq(4, 0, 3, 4) },
    ],
    points: [],
  }],
});

test("constants", () => {
  assert.deepEqual(POINT_CLASSES, ["temperature", "humidity", "illuminance", "moisture", "carbon_dioxide", "pm25"]);
  assert.equal(SCHEMA_VERSION, 1);
});

test("supported rejects another major and non-documents", () => {
  assert.equal(supported({ schema: 1, floors: [] }), true);
  assert.equal(supported({ schema: 2 }), false);
  assert.equal(supported(null), false);
});

test("emptyPlan has one empty floor per id, null included", () => {
  assert.deepEqual(emptyPlan([null]), { schema: 1, floors: [{ floor_id: null, rooms: [], points: [] }] });
});

test("candidates: device with two point entities is one candidate", () => {
  const c = candidates(hass).find((x) => x.key === "d_temp");
  assert.deepEqual(c, { key: "d_temp", kind: "device", area_id: "living_room", entities: ["sensor.hum", "sensor.temp"] });
});

test("candidates: a light-only device gives none", () => {
  assert.equal(candidates(hass).some((x) => x.key === "d_light"), false);
});

test("candidates: plant without a device, and a device-less sensor", () => {
  const all = candidates(hass);
  assert.deepEqual(all.find((x) => x.key === "plant.monstera"),
    { key: "plant.monstera", kind: "entity", area_id: null, entities: ["plant.monstera"] });
  assert.equal(all.find((x) => x.key === "sensor.garage_co2").area_id, "office");
});

test("candidates: an entity's own area overrides its device's", () => {
  assert.equal(candidates(hass).find((x) => x.key === "d_moved").area_id, "living_room");
});

test("autoPlace puts a lone candidate 0.6 m below its room centroid, under the labels, not placed", () => {
  const lone = autoPlace(doc(), { ...hass, entities: { "sensor.temp": hass.entities["sensor.temp"] } }, "ground");
  const p = lone.floors[0].points[0];
  const [cx, cy] = centroid(sq(0, 0, 4, 4));
  assert.deepEqual([p.device_id, p.x, p.y, p.placed], ["d_temp", cx, cy + 0.6, false]);
  assert.equal("entity_id" in p, false);
});

test("autoPlace: a room under 2 m tall keeps its sensors at the centroid", () => {
  const d = doc();
  d.floors[0].rooms[0].polygon = sq(0, 0, 4, 1.5);
  const lone = autoPlace(d, { ...hass, entities: { "sensor.temp": hass.entities["sensor.temp"] } }, "ground");
  assert.deepEqual([lone.floors[0].points[0].x, lone.floors[0].points[0].y], [2, 0.75]);
});

test("autoPlace spreads two sensors of one room 0.6 m apart on a circle below the labels", () => {
  // d_temp (its device's area) and d_moved (its entity's own area) are both in living_room.
  const out = autoPlace(doc(), hass, "ground");
  const pts = out.floors[0].points.filter((x) => x.device_id === "d_moved" || x.device_id === "d_temp");
  const [cx, cy] = centroid(sq(0, 0, 4, 4));
  assert.deepEqual(pts.map((p) => [p.device_id, p.x, p.y, p.placed]).sort(), [
    ["d_moved", cx + 0.3, cy + 0.6, false],     // by key: d_moved first, at angle 0
    ["d_temp", cx - 0.3, cy + 0.6, false],
  ]);
  assert.ok(Math.abs(Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) - 0.6) < 1e-9);
});

test("autoPlace leaves candidates without a room in the tray and keeps placed points", () => {
  const d = doc();
  d.floors[0].points.push({ device_id: "d_temp", x: 1, y: 1, placed: true });
  const out = autoPlace(d, hass, "ground");
  assert.deepEqual(out.floors[0].points.filter((x) => x.device_id === "d_temp"), [{ device_id: "d_temp", x: 1, y: 1, placed: true }]);
  assert.equal(out.floors[0].points.some((x) => x.entity_id === "plant.monstera"), false);
  assert.deepEqual(tray(out, hass, "ground").map((x) => x.key).sort(), ["plant.monstera", "sensor.garage_co2"]);
  assert.equal(d.floors[0].points.length, 1, "input untouched");
});

test("roomOf and roomLabel", () => {
  assert.equal(roomOf(doc(), "ground", [5, 1]), "kitchen");
  assert.equal(roomOf(doc(), "ground", [20, 1]), null);
  assert.deepEqual(roomLabel({ area_id: "kitchen" }, hass), { text: "Kitchen", missing: false });
  assert.deepEqual(roomLabel({ area_id: "office" }, hass), { text: "office", missing: true });
});

test("movePoint sets placed and refuses an unknown key", () => {
  const d = autoPlace(doc(), hass, "ground");
  const out = movePoint(d, "ground", "d_temp", [2, 3]);
  const p = out.floors[0].points.find((x) => x.device_id === "d_temp");
  assert.deepEqual([p.x, p.y, p.placed], [2, 3, true]);
  assert.equal(movePoint(d, "ground", "nope", [0, 0]), null);
});

test("removeCorner refuses below 3, otherwise removes", () => {
  const tri = { schema: 1, floors: [{ floor_id: "g", rooms: [{ area_id: "a", polygon: [[0, 0], [1, 0], [0, 1]] }], points: [] }] };
  assert.equal(removeCorner(tri, "g", "a", 0), null);
  const out = removeCorner(doc(), "ground", "kitchen", 3);
  assert.equal(out.floors[0].rooms[1].polygon.length, 3);
});

test("insertCorner adds a corner after the edge index", () => {
  const out = insertCorner(doc(), "ground", "living_room", 0, [2, 0]);
  assert.deepEqual(out.floors[0].rooms[0].polygon[1], [2, 0]);
  assert.equal(out.floors[0].rooms[0].polygon.length, 5);
});

test("moveCorner moves a corner and refuses unknown room or index", () => {
  const out = moveCorner(doc(), "ground", "living_room", 0, [-1, -1]);
  assert.deepEqual(out.floors[0].rooms[0].polygon[0], [-1, -1]);
  assert.equal(moveCorner(doc(), "ground", "nope", 0, [0, 0]), null);
  assert.equal(moveCorner(doc(), "ground", "kitchen", 9, [0, 0]), null);
});

test("moveCorner drags the coincident corner of a neighbour so rooms stay joinable", () => {
  const d = doc();
  const out = moveCorner(d, "ground", "living_room", 1, [4, 0.5]);   // shared corner (4,0)
  const [a, b] = out.floors[0].rooms;
  assert.deepEqual(b.polygon[0], [4, 0.5]);
  assert.ok(joinPolygons(a.polygon, b.polygon));
  assert.equal(joinRooms(out, "ground", "living_room", "kitchen") !== null, true);
  assert.deepEqual(d.floors[0].rooms[1].polygon[0], [4, 0], "input untouched");
});

test("joinRooms keeps keepAreaId and drops the other; refuses non-adjacent rooms", () => {
  const out = joinRooms(doc(), "ground", "kitchen", "living_room");
  assert.deepEqual(out.floors[0].rooms.map((r) => r.area_id), ["kitchen"]);
  assert.equal(out.floors[0].rooms[0].polygon.length, 4);
  const far = doc();
  far.floors[0].rooms[1].polygon = sq(10, 10, 2, 2);
  assert.equal(joinRooms(far, "ground", "kitchen", "living_room"), null);
});

test("splitRoom keeps the area on one half and gives the other the new area", () => {
  const out = splitRoom(doc(), "ground", "living_room", [2, -0.01], [2, 4.01], "office");
  const ids = out.floors[0].rooms.map((r) => r.area_id);
  assert.deepEqual(ids.sort(), ["kitchen", "living_room", "office"]);
  assert.equal(splitRoom(doc(), "ground", "living_room", [2, -0.01], [2, 4.01], "kitchen"), null);
  assert.equal(splitRoom(doc(), "ground", "living_room", [1, 1], [2, 2], "office"), null);
});

test("linkRoom re-links a room to another area; refuses a taken one", () => {
  const out = linkRoom(doc(), "ground", "living_room", "office");
  assert.deepEqual(out.floors[0].rooms.map((r) => r.area_id), ["office", "kitchen"]);
  assert.equal(linkRoom(doc(), "ground", "living_room", "kitchen"), null);
});

test("withPlan replaces only the card's plan", () => {
  const cfg = {
    title: "Floor plan", extra: 1,
    views: [
      { path: "other", cards: [{ type: "markdown", content: "x" }] },
      { path: "plan", type: "panel", extra: 2, cards: [{ type: "custom:floorplan-card", plan: { schema: 1, floors: [] }, k: 3 }] },
    ],
  };
  const out = withPlan(cfg, doc());
  assert.deepEqual(out.views[1].cards[0].plan, doc());
  assert.equal(out.views[1].cards[0].k, 3);
  assert.equal(out.extra, 1);
  assert.deepEqual(out.views[0], cfg.views[0]);
  assert.deepEqual(cfg.views[1].cards[0].plan, { schema: 1, floors: [] }, "input untouched");
});

test("extract returns the card's plan from a dashboard config, or null", () => {
  const plan = doc();
  const config = { views: [{ cards: [{ type: "markdown" }, { type: "custom:floorplan-card", plan }] }] };
  assert.equal(extract(config), plan);
  assert.equal(extract({ views: [{ cards: [{ type: "custom:floorplan-card" }] }] }), null);
  assert.equal(extract({ views: [] }), null);
  assert.equal(extract(null), null);
});

test("addPoint puts a tray candidate on the floor as placed; refuses one already there", () => {
  const d = addPoint(doc(), "ground", { key: "d_temp", kind: "device" }, [1, 2]);
  assert.deepEqual(d.floors[0].points, [{ device_id: "d_temp", x: 1, y: 2, placed: true }]);
  const e = addPoint(d, "ground", { key: "plant.monstera", kind: "entity" }, [3, 1]);
  assert.deepEqual(e.floors[0].points[1], { entity_id: "plant.monstera", x: 3, y: 1, placed: true });
  assert.equal(addPoint(e, "ground", { key: "d_temp", kind: "device" }, [2, 2]), null);
  assert.equal(addPoint(e, "upstairs", { key: "d_light", kind: "device" }, [2, 2]), null);
});

test("edits round coordinates to a millimetre", () => {
  const d = doc();
  const decimals = (v) => (String(v).split(".")[1] || "").length;
  const coords = (out) => out.floors[0].rooms.flatMap((r) => r.polygon.flat())
    .concat(out.floors[0].points.flatMap((p) => [p.x, p.y]));
  const moved = movePoint(addPoint(d, "ground", { key: "d_temp", kind: "device" }, [1.23456, 2.00049]),
    "ground", "d_temp", [1.98765, 0.1234567]);
  assert.deepEqual([moved.floors[0].points[0].x, moved.floors[0].points[0].y], [1.988, 0.123]);
  const added = addPoint(d, "ground", { key: "d_temp", kind: "device" }, [1.23456, 2.00049]);
  assert.deepEqual([added.floors[0].points[0].x, added.floors[0].points[0].y], [1.235, 2]);
  const corner = moveCorner(d, "ground", "living_room", 2, [4.0001234, 4.3333333]);
  assert.deepEqual(corner.floors[0].rooms[0].polygon[2], [4, 4.333]);
  assert.deepEqual(corner.floors[0].rooms[1].polygon[3], [4, 4.333], "the shared corner moves to the same rounded spot");
  const inserted = insertCorner(d, "ground", "living_room", 0, [1.11111, 0.0000004]);
  assert.deepEqual(inserted.floors[0].rooms[0].polygon[1], [1.111, 0]);
  const split = splitRoom(d, "ground", "living_room", [1.33333, -0.01], [1.66666, 4.01], "office");
  assert.ok(coords(split).every((v) => decimals(v) <= 3), coords(split).join(" "));
  const placed = autoPlace({ ...d, floors: [{ ...d.floors[0], rooms: [{ area_id: "living_room", polygon: [[0, 0], [1, 0], [0, 1]] }] }] },
    hass, "ground");
  assert.ok(coords(placed).every((v) => decimals(v) <= 3), coords(placed).join(" "));
});

// ---- Task 9: a shorter, grouped tray ----------------------------------------------------------

const derivedHass = {
  ...hass,
  entities: {
    ...hass.entities,
    "sensor.temp_min_3h": { entity_id: "sensor.temp_min_3h", device_id: null, area_id: "living_room", platform: "statistics" },
    "sensor.feels_like": { entity_id: "sensor.feels_like", device_id: null, area_id: "living_room", platform: "template" },
    "sensor.temp": { ...hass.entities["sensor.temp"], platform: "zha" },
    "plant.monstera": { ...hass.entities["plant.monstera"], platform: "template" },
  },
  states: {
    ...hass.states,
    "sensor.temp_min_3h": { state: "20", attributes: { device_class: "temperature" } },
    "sensor.feels_like": { state: "22", attributes: { device_class: "temperature" } },
    "sensor.unregistered": { state: "30", attributes: { device_class: "humidity" } },
  },
};

test("DERIVED_PLATFORMS", () => {
  assert.deepEqual(DERIVED_PLATFORMS, ["template", "statistics", "min_max", "derivative", "integration",
    "utility_meter", "filter", "trend", "threshold", "compensation", "group"]);
});

test("candidates skip derived platforms, keep plant.* and entities without a registry entry", () => {
  const keys = candidates(derivedHass).map((c) => c.key);
  assert.ok(!keys.includes("sensor.temp_min_3h"), keys.join(" "));
  assert.ok(!keys.includes("sensor.feels_like"), keys.join(" "));
  assert.ok(keys.includes("plant.monstera"));
  assert.ok(keys.includes("sensor.unregistered"));
  assert.ok(keys.includes("d_temp"));
});

const plantHass = (attributes, language = "en") => ({
  ...hass,
  language,
  locale: { language },
  states: { ...hass.states, "plant.monstera": { state: "ok", attributes } },
});
const monstera = { key: "plant.monstera", kind: "entity", area_id: null, entities: ["plant.monstera"] };

test("roomHint: the candidate's area first", () => {
  assert.deepEqual(roomHint(hass, { key: "d_temp", kind: "device", area_id: "living_room", entities: ["sensor.temp"] }),
    { key: "living_room", name: "Living room" });
  assert.deepEqual(roomHint(hass, { key: "x", kind: "entity", area_id: "office", entities: ["x"] }),
    { key: "office", name: "office" }, "an area Home Assistant no longer lists keeps its id");
});

test("roomHint: a plant without an area by its domosenso_room, per language when given", () => {
  assert.deepEqual(roomHint(plantHass({ domosenso_room: "Living room" }), monstera),
    { key: "label:Living room", name: "Living room" });
  const rooms = { domosenso_room: "Living room", domosenso_rooms: { en: "Living room", de: "Wohnzimmer" } };
  assert.deepEqual(roomHint(plantHass(rooms, "de"), monstera), { key: "label:Wohnzimmer", name: "Wohnzimmer" });
  assert.deepEqual(roomHint(plantHass(rooms, "pl"), monstera), { key: "label:Living room", name: "Living room" },
    "a language missing from the map falls back to domosenso_room");
});

test("candidates: a plant without an area gets the area its room names, in any language", () => {
  const rooms = { domosenso_room: "Pokój dzienny", domosenso_rooms: { pl: "Pokój dzienny", en: "Living room", de: "Wohnzimmer" } };
  const h = plantHass(rooms, "pl");
  const find = (hs) => candidates(hs).find((c) => c.key === "plant.monstera");
  assert.equal(find(h).area_id, "living_room", "the English name matches the area Living room");
  assert.deepEqual(roomHint(h, find(h)), { key: "living_room", name: "Living room" }, "grouped under the area's own name");
  // Case, spaces and diacritics do not matter: "Hobbyraum" names the area "Hobby Raum".
  const hobby = { ...plantHass({ domosenso_rooms: { de: "Hobbyraum" } }, "pl"),
    areas: { ...hass.areas, hobby_room: { area_id: "hobby_room", name: "Hobby Raum" } } };
  assert.equal(find(hobby).area_id, "hobby_room");
  // A room that names no area leaves the plant without one: it waits in the tray under its label.
  const nowhere = plantHass({ domosenso_room: "Attic" }, "pl");
  assert.equal(find(nowhere).area_id, null);
});

test("roomHint: null without an area or a plant room", () => {
  assert.equal(roomHint(plantHass({}), monstera), null);
  assert.equal(roomHint(hass, { key: "sensor.x", kind: "entity", area_id: null, entities: ["sensor.x"] }), null);
});

test("trayGroups: the tray by room, groups and items by name, the group without a room last", () => {
  const h = {
    ...plantHass({ friendly_name: "Monstera" }),
    areas: { ...hass.areas, office: { area_id: "office", name: "Office" } },
    devices: { ...hass.devices, d_temp: { id: "d_temp", area_id: "living_room", name: "Thermometer" },
      d_moved: { id: "d_moved", area_id: "kitchen", name: "Light sensor" } },
    states: { ...plantHass({ friendly_name: "Monstera" }).states,
      "sensor.garage_co2": { state: "500", attributes: { device_class: "carbon_dioxide", friendly_name: "Air" } } },
  };
  const groups = trayGroups(doc(), h);
  assert.deepEqual(groups.map((g) => [g.key, g.name, g.items.map((c) => candidateName(h, c))]), [
    ["living_room", "Living room", ["Light sensor", "Thermometer"]],
    ["office", "Office", ["Air"]],
    ["none", null, ["Monstera"]],
  ]);
  const placed = doc();
  placed.floors[0].points.push({ device_id: "d_temp", x: 1, y: 1, placed: true });
  assert.deepEqual(trayGroups(placed, h)[0].items.map((c) => c.key), ["d_moved"], "placed candidates are not in it");
});

test("addPoints puts candidates round a point, not placed, and refuses ones already on the plan", () => {
  const cs = candidates(hass).filter((c) => c.area_id === "living_room");     // d_moved, d_temp
  const out = addPoints(doc(), "ground", cs, [2, 2]);
  assert.deepEqual(out.floors[0].points, [
    { device_id: "d_moved", x: 2.3, y: 2, placed: false },
    { device_id: "d_temp", x: 1.7, y: 2, placed: false },
  ]);
  const one = addPoints(doc(), "ground", cs.filter((c) => c.key === "d_moved"), [2, 2]);
  assert.deepEqual(one.floors[0].points, [{ device_id: "d_moved", x: 2, y: 2, placed: false }]);
  assert.equal(addPoints(out, "ground", cs, [1, 1]), null);
  assert.equal(addPoints(doc(), "ground", [], [1, 1]), null);
});

test("trayGroups: a plant's room and an area of the same name (case and accents aside) are one group", () => {
  const h = {
    ...plantHass({ friendly_name: "Monstera", domosenso_room: "LIVING ROÓM" }),
    devices: { ...hass.devices, d_temp: { id: "d_temp", area_id: "living_room", name: "Thermometer" } },
  };
  const g = trayGroups(doc(), h).find((x) => x.key === "living_room");
  assert.equal(g.name, "Living room");
  assert.ok(g.items.some((c) => c.key === "plant.monstera"), g.items.map((c) => c.key).join(" "));
  assert.ok(!trayGroups(doc(), h).some((x) => x.key.startsWith("label:")));
});

const oneRoom = (polygon) => ({ schema: 1, floors: [{ floor_id: "ground", rooms: [{ area_id: "living_room", polygon }], points: [] }] });

test("autoPlace keeps sensors inside an L-shaped room whose centroid and shifted centre lie outside it", () => {
  const hall = [[3, 0], [4, 0], [4, 5], [0, 5], [0, 4], [3, 4]];
  assert.equal(pointInPolygon(centroid(hall), hall), false, "the premise: the centroid is outside");
  const out = autoPlace(oneRoom(hall), hass, "ground");
  const pts = out.floors[0].points;
  assert.equal(pts.length, 2);                               // d_moved and d_temp
  for (const p of pts) assert.ok(pointInPolygon([p.x, p.y], hall), JSON.stringify(p));
  assert.ok(Math.abs(Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) - 0.6) < 1e-9, "still spread");
});

test("autoPlace puts a sensor whose spread point leaves the room on the centre instead", () => {
  const narrow = [[0, 0], [0.4, 0], [0.4, 3], [0, 3]];
  const pts = autoPlace(oneRoom(narrow), hass, "ground").floors[0].points;
  assert.deepEqual(pts.map((p) => [p.x, p.y]), [[0.2, 2.1], [0.2, 2.1]]);
});
