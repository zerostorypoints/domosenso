import { test } from "node:test";
import assert from "node:assert/strict";
import { BANDS, wallSegments, pathLoss, crossings, rayTerms, priorParams, predict, coverage, isHandover, contextFor, cacheKey,
  wallSegmentAt, materialsFor, setWallMaterial, setWifiDefault, setOpeningMaterial, setAccessPoint, setFloorWifi,
  addReading, nextSpots } from "./wifi.js";
import table from "./materials.json" with { type: "json" };
import { widestRow } from "./geometry.js";

const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const two = () => ({ rooms: [{ area_id: "alex", polygon: sq(0, 0, 3, 3) }, { area_id: "sam", polygon: sq(3, 0, 3, 3) }] });
const L = { brick: { 5: 10 }, wood: { 5: 3 }, double: { 5: 3 }, interior: { 5: 5 }, exterior: { 5: 15 } };
const len = (s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
const onX = (s, x) => Math.abs(s.a[0] - x) < 1e-6 && Math.abs(s.b[0] - x) < 1e-6;

test("bands", () => assert.deepEqual(BANDS, ["2.4", "5", "6"]));

test("a wall shared by two rooms is one segment", () => {
  const segs = wallSegments(two(), undefined, {});
  assert.equal(segs.filter((s) => onX(s, 3)).length, 1);
  assert.equal(segs.length, 7);
});

test("a ray through the shared wall pays it once", () => {
  const floor = { ...two(), walls: [{ at: [3, 1.5], material: "brick" }] };
  const segs = wallSegments(floor, undefined, {});
  assert.equal(pathLoss(segs, [1.5, 1.5], [4.5, 1.5], "5", { brick: { 5: 10 } }), 10);
});

test("a ray through a corner pays one wall, not two", () => {
  const segs = wallSegments({ rooms: [{ area_id: "alex", polygon: sq(0, 0, 3, 3) }] }, undefined, {});
  const losses = { exterior: { 5: 10 } };
  // diagonal from inside to outside exactly through the corner (3, 3)
  assert.ok(Math.abs(pathLoss(segs, [2, 2], [4, 4], "5", losses) - 10 * Math.SQRT2) < 1e-9);
  // and the same corner from the other side of both walls
  assert.ok(Math.abs(pathLoss(segs, [4, 4], [2, 2], "5", losses) - 10 * Math.SQRT2) < 1e-9);
});

test("oblique crossing costs more, capped at twice", () => {
  const segs = [{ a: [0, -10], b: [0, 10], material: "brick", open: false, kind: "wall" }];
  const at = (deg) => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];
  const loss = (deg) => { const [x, y] = at(deg); return pathLoss(segs, [-x, -y], [x, y], "5", L); };
  assert.ok(Math.abs(loss(0) - 10) < 1e-9);
  assert.ok(Math.abs(loss(45) - 10 * Math.SQRT2) < 1e-9);
  assert.ok(Math.abs(loss(60) - 20) < 1e-9);
  assert.ok(Math.abs(loss(80) - 20) < 1e-9);
});

test("an open door costs nothing, a closed one its material", () => {
  const floor = { ...two(), walls: [{ at: [3, 0.5], material: "brick" }],
    openings: [{ kind: "door", rooms: ["alex", "sam"], at: [3, 1.5], entity: "binary_sensor.door" }] };
  const hass = (s) => ({ states: { "binary_sensor.door": { state: s, attributes: {} } } });
  const through = (s) => pathLoss(wallSegments(floor, undefined, hass(s)), [1.5, 1.5], [4.5, 1.5], "5", L);
  assert.equal(through("on"), 0);
  assert.equal(through("off"), 3);                       // wood, the door default
  const wall = pathLoss(wallSegments(floor, undefined, hass("off")), [1.5, 0.25], [4.5, 0.25], "5", L);
  assert.equal(wall, 10, "beside the door the wall remains");
  assert.equal(wallSegments(floor, undefined, hass("off")).filter((s) => s.kind === "opening").length, 1);
});

test("an opening's own material, a window's default, a doorway free", () => {
  const f = (o) => ({ ...two(), openings: [o] });
  const p = (floor) => pathLoss(wallSegments(floor, undefined, {}), [1.5, 1.5], [4.5, 1.5], "5", L);
  assert.equal(p(f({ kind: "door", rooms: ["alex", "sam"], at: [3, 1.5], state: "closed", material: "brick" })), 10);
  assert.equal(p(f({ kind: "window", rooms: ["alex", "sam"], at: [3, 1.5], state: "closed" })), 3);
  assert.equal(p(f({ kind: "opening", rooms: ["alex", "sam"], at: [3, 1.5] })), 0);
});

test("an edge inside an open space is no wall", () => {
  const floor = { ...two(), open_spaces: [["alex", "sam"]] };
  const segs = wallSegments(floor, undefined, {});
  assert.equal(segs.filter((s) => onX(s, 3)).length, 0);
  assert.equal(pathLoss(segs, [1.5, 1.5], [4.5, 1.5], "5", L), 0);
});

test("a long wall shared by two shorter rooms is split at the sharing", () => {
  const floor = { rooms: [{ area_id: "alex", polygon: sq(0, 0, 3, 6) },
    { area_id: "sam", polygon: sq(3, 0, 3, 2) }] };
  const segs = wallSegments(floor, undefined, {}).filter((s) => onX(s, 3));
  assert.equal(segs.length, 2);
  const shared = segs.find((s) => Math.max(s.a[1], s.b[1]) <= 2 + 1e-6);
  assert.equal(shared.material, "interior");
  assert.equal(segs.find((s) => s !== shared).material, "exterior");
  assert.ok(Math.abs(segs.reduce((n, s) => n + len(s), 0) - 6) < 1e-9, "the wall is covered once");
});

test("unset walls take the interior and exterior defaults", () => {
  const segs = wallSegments(two(), undefined, {});
  assert.equal(segs.find((s) => onX(s, 3)).material, "interior");
  assert.equal(segs.find((s) => onX(s, 0)).material, "exterior");
  const own = wallSegments(two(), { defaults: { interior: "drywall", exterior: "brick" } }, {});
  assert.equal(own.find((s) => onX(s, 3)).material, "drywall");
  assert.equal(own.find((s) => onX(s, 6)).material, "brick");
});

// ---- prediction ----
const room = (x, y, w, h, id = "alex") => ({ area_id: id, polygon: sq(x, y, w, h) });
const ap = (id, extra = {}) => ({ device_id: id, bands: ["2.4", "5", "6"], ...extra });
const pt = (id, x, y, extra = {}) => ({ device_id: id, x, y, placed: true, ...extra });
const docOf = (floors) => ({ schema: 1, floors });
const one = (rooms, aps, points) => docOf([{ floor_id: "f0", rooms, points, access_points: aps }]);
const ctxOf = (doc, floorId = "f0", hass = {}) => {
  const aps = doc.floors.flatMap((f) => f.access_points ?? []);
  return contextFor(doc, floorId, hass, table, priorParams(table, aps));
};
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("priorParams: band defaults, own tx, the table's losses", () => {
  const p = priorParams(table, [ap("a"), ap("b", { tx: { 5: 17 } })]);
  assert.equal(p.tx.a["5"], 23);
  assert.equal(p.tx.a["2.4"], 20);
  assert.equal(p.tx.b["5"], 17);
  assert.equal(p.tx.b["6"], 23);
  assert.equal(p.n, 2);
  assert.equal(p.loss.brick["5"], 10);
  assert.deepEqual(p.device, {});
});

test("free space at 1 m is T minus L0", () => {
  const ctx = ctxOf(one([room(-5, -5, 10, 10)], [ap("a")], [pt("a", 0, 0)]));
  near(predict(ctx, "a", "5", [1, 0]), 23 - 47.3);
});

test("each doubling of distance costs 6 dB with n = 2", () => {
  const ctx = ctxOf(one([room(-5, -5, 20, 10)], [ap("a")], [pt("a", 0, 0)]));
  const at = (d) => predict(ctx, "a", "5", [d, 0]);
  near(at(1) - at(2), 20 * Math.log10(2), 1e-9);
  near(at(2) - at(4), 6.0206, 1e-3);
});

test("a wall between costs its loss", () => {
  const doc = one([room(0, 0, 3, 3), room(3, 0, 3, 3, "sam")], [ap("a")], [pt("a", 1, 1.5)]);
  doc.floors[0].walls = [{ at: [3, 1.5], material: "brick" }];
  const ctx = ctxOf(doc);
  near(predict(ctx, "a", "5", [2, 1.5]) - predict(ctx, "a", "5", [4, 1.5]), 20 * Math.log10(3) + 10);
});

test("crossings: the closed segments a ray crosses with their oblique factor; pathLoss is their sum", () => {
  const floor = { ...two(), walls: [{ at: [3, 1.5], material: "brick" }],
    openings: [{ kind: "door", rooms: ["alex", "sam"], at: [3, 0.5], state: "open" }] };
  const segs = wallSegments(floor, undefined, {});
  const c = crossings(segs, [1.5, 1.5], [7, 4]);
  assert.deepEqual(c.map((x) => x.material), ["brick", "exterior"]);
  near(c[0].k, Math.hypot(5.5, 2.5) / 5.5);
  assert.equal(pathLoss(segs, [1.5, 1.5], [7, 4], "5", L), c.reduce((t, x) => t + L[x.material][5] * x.k, 0));
  assert.deepEqual(crossings(segs, [1.5, 0.5], [4.5, 0.5]), [], "an open door is no crossing");
});

test("rayTerms: the distance term, crossings and slabs predict depends on", () => {
  const doc = docOf([
    { floor_id: "f0", rooms: [room(0, 0, 3, 3), room(3, 0, 3, 3, "sam")], walls: [{ at: [3, 1.5], material: "brick" }],
      points: [pt("a", 1, 1.5)], access_points: [ap("a")] },
    { floor_id: "f1", rooms: [room(0, 0, 6, 3)] }]);
  const ctx = ctxOf(doc, "f1");
  const t = rayTerms(ctx, "a", "5", [4, 1.5]);
  near(t.logd, Math.log10(Math.hypot(3, 2.7)));
  assert.deepEqual(t.crossings, []);
  assert.deepEqual(t.slabs, ["slab"]);
  const t0 = rayTerms(ctxOf(doc, "f0"), "a", "5", [4, 1.5]);
  assert.deepEqual(t0.crossings.map((x) => x.material), ["brick"]);
  assert.deepEqual(t0.slabs, []);
  near(predict(ctxOf(doc, "f0"), "a", "5", [4, 1.5]), 23 - 47.3 - 20 * t0.logd - 10);
});

test("a slab between floors costs the slab's loss", () => {
  const doc = docOf([
    { floor_id: "f0", rooms: [room(-5, -5, 10, 10)], points: [pt("a", 0, 0)], access_points: [ap("a")], height: 3 },
    { floor_id: "f1", rooms: [room(-5, -5, 10, 10)], points: [] },
  ]);
  const ctx = ctxOf(doc, "f1");
  const d = Math.hypot(1, 3);                       // 1 m across, one floor (3 m) up, same mount and client height
  near(predict(ctx, "a", "5", [1, 0]), 23 - 47.3 - 20 * Math.log10(d) - 25);
  assert.deepEqual(ctx.floors.map((f) => f.z), [0, 3]);
});

test("serving is the strongest; handover where the top two are within 6 dB", () => {
  const doc = one([room(0, 0, 11, 4)], [ap("a"), ap("b")], [pt("a", 0.5, 2), pt("b", 10.5, 2)]);
  const { cells, aps } = coverage(ctxOf(doc), "5", 0.5);
  assert.deepEqual(aps.sort(), ["a", "b"]);
  const cell = (x) => cells.find((c) => Math.abs(c.x + 0.25 - x) < 0.01 && Math.abs(c.y - 1.5) < 0.01);
  const mid = cell(5.25);
  assert.ok(isHandover(mid));
  const nearA = cell(1.25);
  assert.equal(nearA.ap, "a");
  assert.ok(!isHandover(nearA));
  assert.equal(cell(9.75).ap, "b");
  assert.equal(nearA.room, 0);
  assert.ok(nearA.second < nearA.dbm);
});

test("a single access point has no second", () => {
  const { cells } = coverage(ctxOf(one([room(0, 0, 4, 4)], [ap("a")], [pt("a", 1, 1)])), "5", 0.5);
  assert.ok(cells.every((c) => c.second === null && !isHandover(c)));
});

test("no access point: hint and no cells", () => {
  const r = coverage(ctxOf(one([room(0, 0, 4, 4)], [], [])), "5", 0.5);
  assert.equal(r.hint, "no_access_points");
  assert.deepEqual(r.cells, []);
  assert.deepEqual(r.aps, []);
});

test("an unplaced access point is left out", () => {
  const doc = one([room(0, 0, 4, 4)], [ap("a"), ap("b")], [pt("a", 1, 1, { placed: false }), pt("b", 3, 3)]);
  const r = coverage(ctxOf(doc), "5", 0.5);
  assert.deepEqual(r.aps, ["b"]);
  assert.equal(r.hint, null);
  const none = one([room(0, 0, 4, 4)], [ap("a")], [pt("a", 1, 1, { placed: false })]);
  assert.equal(coverage(ctxOf(none), "5", 0.5).hint, "no_access_points");
});

test("a band no access point serves has no cells", () => {
  const doc = one([room(0, 0, 4, 4)], [ap("a", { bands: ["2.4"] })], [pt("a", 1, 1)]);
  const r = coverage(ctxOf(doc), "6", 0.5);
  assert.equal(r.hint, "no_access_points");
  assert.deepEqual(r.cells, []);
  assert.ok(coverage(ctxOf(doc), "2.4", 0.5).cells.length > 0);
});

test("an entity_id access point is found by its point", () => {
  const doc = one([room(0, 0, 4, 4)], [{ entity_id: "device_tracker.x", bands: ["5"] }],
    [{ entity_id: "device_tracker.x", x: 1, y: 1, placed: true }]);
  assert.deepEqual(coverage(ctxOf(doc), "5", 0.5).aps, ["device_tracker.x"]);
});

test("floors are ordered by level, null last, then id; z sums the heights below", () => {
  const doc = docOf([{ floor_id: "c", rooms: [], points: [], height: 2 }, { floor_id: "a", rooms: [], points: [] },
    { floor_id: "b", rooms: [], points: [], height: 3 }]);
  const ctx = contextFor(doc, "c", { floors: { a: { level: 1 }, b: { level: 0 } } }, table);
  assert.deepEqual(ctx.floors.map((f) => f.floor_id), ["b", "a", "c"]);
  assert.deepEqual(ctx.floors.map((f) => f.z), [0, 3, 5.7]);
  assert.equal(ctx.floors[0].slab, "slab");
});

test("200 m², 3 access points, one band at 0.15 m in under 300 ms", () => {
  const rooms = []; const pts = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) rooms.push(room(i * 6.25, j * 4, 6.25, 4, `r${i}${j}`));
  ["a", "b", "c"].forEach((id, k) => pts.push(pt(id, 3 + k * 9, 4)));
  const doc = one(rooms, ["a", "b", "c"].map((id) => ap(id)), pts);
  const ctx = ctxOf(doc);
  const t0 = performance.now();
  const { cells } = coverage(ctx, "5", 0.15);
  const ms = performance.now() - t0;
  assert.ok(cells.length > 8000, `${cells.length} cells`);
  assert.ok(ms < 300, `${ms} ms`);
});

test("same inputs give the same cache key and cells", () => {
  const mk = () => one([room(0, 0, 4, 4)], [ap("a")], [pt("a", 1, 1)]);
  const [d1, d2] = [mk(), mk()];
  const params = priorParams(table, d1.floors[0].access_points);
  assert.equal(cacheKey(d1, "f0", "5", params, 0.15), cacheKey(d2, "f0", "5", priorParams(table, d2.floors[0].access_points), 0.15));
  assert.notEqual(cacheKey(d1, "f0", "5", params, 0.15), cacheKey(d1, "f0", "2.4", params, 0.15));
  assert.notEqual(cacheKey(d1, "f0", "5", params, 0.15), cacheKey(d1, "f0", "5", params, 0.3));
  assert.deepEqual(coverage(ctxOf(d1), "5", 0.5), coverage(ctxOf(d2), "5", 0.5));
});

// ---- edits (SPEC-044 edit mode) ----

const groundOf = (floor) => ({ schema: 1, floors: [{ floor_id: "ground", points: [], ...floor }] });
const fl = (doc) => doc.floors[0];

test("materialsFor lists the materials whose `for` has the class", () => {
  assert.deepEqual(materialsFor("door"), ["wood", "glass", "metal"]);
  assert.deepEqual(materialsFor("window"), ["glass", "double", "low_e", "triple_low_e"]);
  assert.ok(materialsFor("wall").every((id) => table.materials[id].for.includes("wall")));
  assert.deepEqual(materialsFor("slab"), ["reinforced_concrete", "slab"]);
});

test("wallSegmentAt: the whole stretch between corners, through any opening on it", () => {
  const floor = { ...two(), openings: [{ kind: "door", rooms: ["alex", "sam"], at: [3, 1.5] }] };
  const seg = wallSegmentAt(floor, undefined, [3.02, 0.4], 0.1);
  assert.ok(onX(seg, 3) && Math.abs(len(seg) - 3) < 1e-9);
  assert.equal(seg.shared, true);
  assert.deepEqual(seg.at, [3, 1.5]);
  assert.equal(seg.material, "interior");
  assert.equal(wallSegmentAt(floor, undefined, [1.5, 1.5], 0.1), null);
});

test("setWallMaterial sets one wall; its class's default removes the entry", () => {
  const doc = groundOf(two());
  const brick = setWallMaterial(doc, "ground", [3, 1.5], "brick");
  assert.deepEqual(fl(brick).walls, [{ at: [3, 1.5], material: "brick" }]);
  assert.ok(!("walls" in fl(doc)), "a new doc");
  const again = setWallMaterial(brick, "ground", [3, 0.5], "concrete");
  assert.deepEqual(fl(again).walls, [{ at: [3, 0.5], material: "concrete" }], "one entry per stretch");
  assert.ok(!("walls" in fl(setWallMaterial(brick, "ground", [3, 1.5], "interior"))), "interior wall back to its default");
  const outer = setWallMaterial(doc, "ground", [0, 1.5], "interior");
  assert.deepEqual(fl(outer).walls, [{ at: [0, 1.5], material: "interior" }], "interior material on an exterior wall is kept");
  assert.ok(!("walls" in fl(setWallMaterial(outer, "ground", [0, 1.5], "exterior"))));
  const custom = { ...doc, wifi: { defaults: { interior: "drywall" } } };
  assert.ok(!("walls" in fl(setWallMaterial(custom, "ground", [3, 1.5], "drywall"))), "the plan's own default");
  assert.equal(setWallMaterial(doc, "ground", [3, 1.5], "low_e"), null, "not a wall material");
  assert.equal(setWallMaterial(doc, "ground", [1.5, 1.5], "brick"), null, "no wall there");
  assert.equal(setWallMaterial(doc, "upstairs", [3, 1.5], "brick"), null);
});

test("setWifiDefault sets interior or exterior; the table's default removes it", () => {
  const doc = groundOf(two());
  const a = setWifiDefault(doc, "interior", "brick");
  assert.deepEqual(a.wifi, { defaults: { interior: "brick" } });
  assert.ok(!("wifi" in doc));
  const b = setWifiDefault(a, "exterior", "concrete");
  assert.deepEqual(b.wifi.defaults, { interior: "brick", exterior: "concrete" });
  assert.ok(!("wifi" in setWifiDefault(a, "interior", "interior")));
  const kept = setWifiDefault({ ...a, wifi: { ...a.wifi, samples: [] } }, "interior", "interior");
  assert.deepEqual(kept.wifi, { samples: [] });
  assert.equal(setWifiDefault(doc, "slab", "brick"), null);
  assert.equal(setWifiDefault(doc, "interior", "glass"), null);
});

test("setOpeningMaterial fits the kind; the default or empty removes it; a doorway has none", () => {
  const doc = groundOf({ ...two(), openings: [
    { kind: "window", rooms: ["alex", null], at: [0, 1.5] },
    { rooms: ["alex", "sam"], at: [3, 1.5] },
    { kind: "opening", rooms: ["alex", null], at: [1.5, 0] },
    { kind: "fixed", rooms: ["sam", null], at: [6, 1.5] },
  ] });
  const w = setOpeningMaterial(doc, "ground", 0, "low_e");
  assert.equal(fl(w).openings[0].material, "low_e");
  assert.ok(!("material" in fl(doc).openings[0]));
  assert.ok(!("material" in fl(setOpeningMaterial(w, "ground", 0, "double")).openings[0]), "a window's default");
  assert.ok(!("material" in fl(setOpeningMaterial(w, "ground", 0, null)).openings[0]));
  assert.equal(setOpeningMaterial(doc, "ground", 0, "wood"), null, "wood is no window");
  assert.equal(fl(setOpeningMaterial(doc, "ground", 1, "metal")).openings[1].material, "metal", "a door without a kind");
  assert.ok(!("material" in fl(setOpeningMaterial(doc, "ground", 1, "wood")).openings[1]), "a door's default");
  assert.equal(setOpeningMaterial(doc, "ground", 1, "low_e"), null);
  assert.equal(setOpeningMaterial(doc, "ground", 2, "glass"), null, "a doorway");
  assert.equal(fl(setOpeningMaterial(doc, "ground", 3, "triple_low_e")).openings[3].material, "triple_low_e");
  assert.equal(setOpeningMaterial(doc, "ground", 9, "glass"), null);
});

test("setAccessPoint marks a point, patches bands, tx and mount, and unmarks it", () => {
  const doc = groundOf({ ...two(), points: [{ device_id: "d_node", x: 1, y: 1 }, { entity_id: "device_tracker.sam_ap", x: 4, y: 1 }] });
  const on = setAccessPoint(doc, "ground", "d_node", {});
  assert.deepEqual(fl(on).access_points, [{ device_id: "d_node", bands: ["2.4", "5"] }]);
  const ent = setAccessPoint(on, "ground", "device_tracker.sam_ap", { bands: ["6", "5", "6"] });
  assert.deepEqual(fl(ent).access_points[1], { entity_id: "device_tracker.sam_ap", bands: ["5", "6"] }, "known bands once, in order");
  const tx = setAccessPoint(on, "ground", "d_node", { tx: { "5": 20 }, mount: 2.2 });
  assert.deepEqual(fl(tx).access_points, [{ device_id: "d_node", bands: ["2.4", "5"], tx: { "5": 20 }, mount: 2.2 }]);
  const narrowed = setAccessPoint(tx, "ground", "d_node", { bands: ["2.4"] });
  assert.deepEqual(fl(narrowed).access_points, [{ device_id: "d_node", bands: ["2.4"], mount: 2.2 }], "tx limited to its bands");
  assert.equal(setAccessPoint(tx, "ground", "d_node", { tx: { "6": 20 } }), null, "tx on a band it does not serve");
  assert.deepEqual(fl(setAccessPoint(tx, "ground", "d_node", { tx: { "5": null }, mount: null })).access_points,
    [{ device_id: "d_node", bands: ["2.4", "5"] }], "empty values remove");
  assert.equal(setAccessPoint(on, "ground", "d_node", { bands: [] }), null);
  assert.equal(setAccessPoint(on, "ground", "d_node", { tx: { "5": 40 } }), null, "tx -10 to 36");
  assert.equal(setAccessPoint(on, "ground", "d_node", { mount: 6 }), null, "mount 0 to 5");
  assert.equal(setAccessPoint(doc, "ground", "d_gone", {}), null, "not a point of the floor");
  const off = setAccessPoint(tx, "ground", "d_node", null);
  assert.ok(!("access_points" in fl(off)), "unmarking removes it");
  assert.equal(setAccessPoint(doc, "ground", "d_node", null), null, "nothing to unmark");
});

test("setFloorWifi sets height and slab within range; defaults remove them", () => {
  const doc = groundOf(two());
  const a = setFloorWifi(doc, "ground", { height: 3.1, slab: "reinforced_concrete" });
  assert.equal(fl(a).height, 3.1);
  assert.equal(fl(a).slab, "reinforced_concrete");
  const b = setFloorWifi(a, "ground", { height: 2.7, slab: "slab" });
  assert.ok(!("height" in fl(b)) && !("slab" in fl(b)));
  assert.ok(!("height" in fl(setFloorWifi(a, "ground", { height: "" }))));
  assert.equal(setFloorWifi(doc, "ground", { height: 12 }), null);
  assert.equal(setFloorWifi(doc, "ground", { slab: "brick" }), null);
});

// ---- manual readings and the survey's next spots (SPEC-044 S3) ----

test("addReading adds a manual sample at the tap, in UTC; refuses what the plan would not hold", () => {
  const doc = groundOf({ ...two(), points: [pt("d_node", 1, 1)], access_points: [{ device_id: "d_node", bands: ["2.4", "5"] }] });
  const now = new Date("2026-11-11T19:30:12.345+01:00");
  const a = addReading(doc, "ground", { x: 1.23456, y: 2, band: "5", dbm: -61, ap: "d_node" }, now);
  assert.deepEqual(a.wifi.samples, [{ floor_id: "ground", x: 1.235, y: 2, t: "2026-11-11T18:30:12Z", band: "5", dbm: -61,
    ap: "d_node", source: "manual" }]);
  assert.deepEqual(doc.wifi, undefined, "the plan given is not changed");
  const b = addReading(a, "ground", { x: 4, y: 1, band: "2.4", dbm: -70, ap: null }, now);
  assert.equal(b.wifi.samples.length, 2);
  assert.ok(!("ap" in b.wifi.samples[1]), "unknown access point: no ap");
  const kept = addReading({ ...doc, wifi: { defaults: { interior: "brick" } } }, "ground", { x: 1, y: 1, band: "5", dbm: -50 }, now);
  assert.deepEqual(kept.wifi.defaults, { interior: "brick" }, "the defaults stay");
  assert.ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(addReading(doc, "ground", { x: 1, y: 1, band: "5", dbm: -50 }).wifi.samples[0].t));
  for (const [why, r] of [
    ["dBm above 0", { x: 1, y: 1, band: "5", dbm: 1 }],
    ["dBm below -110", { x: 1, y: 1, band: "5", dbm: -111 }],
    ["dBm not a number", { x: 1, y: 1, band: "5", dbm: Number.NaN }],
    ["a band no access point serves", { x: 1, y: 1, band: "6", dbm: -50 }],
    ["an unknown band", { x: 1, y: 1, band: "60", dbm: -50 }],
    ["not an access point", { x: 1, y: 1, band: "5", dbm: -50, ap: "d_other" }],
    ["no position", { x: null, y: 1, band: "5", dbm: -50 }],
  ]) assert.equal(addReading(doc, "ground", r, now), null, why);
  assert.equal(addReading(doc, "upstairs", { x: 1, y: 1, band: "5", dbm: -50 }, now), null, "not a floor of the plan");
  assert.equal(addReading(groundOf(two()), "ground", { x: 1, y: 1, band: "5", dbm: -50 }, now), null, "no access point at all");
  const full = { ...doc, wifi: { samples: Array.from({ length: 2000 }, () => ({ floor_id: "ground", x: 1, y: 1, band: "5", dbm: -50 })) } };
  assert.equal(addReading(full, "ground", { x: 1, y: 1, band: "5", dbm: -50 }, now), null, "at most 2000 samples");
  assert.deepEqual(addReading(doc, "ground", { x: 0, y: 0, band: "5", dbm: 0 }, now).wifi.samples[0].dbm, 0, "0 dBm is in range");
});

// Cells as coverage() gives them with x, y their centres: a 1 m grid over a 6 x 3 room pair.
const gridCells = (apAt = () => "a", second = () => null) => {
  const out = [];
  for (let x = 0.5; x < 6; x += 1) for (let y = 0.5; y < 3; y += 1) out.push({ x, y, room: x < 3 ? 0 : 1, dbm: -50, ap: apAt(x, y), second: second(x, y) });
  return out;
};
const obsAt = (x, y, ap = "a") => ({ floorId: "ground", x, y, band: "5", ap, dbm: -50, weight: 1, source: "survey" });

test("nextSpots: the cells farthest from a reading of their serving access point first, at most n, apart from each other", () => {
  const spots = nextSpots(gridCells(), [obsAt(0.5, 0.5)], two().rooms);
  assert.equal(spots.length, 3);
  assert.deepEqual(spots[0], { x: 5.5, y: 2.5, why: "far" }, "the far corner");
  assert.ok(spots.every((s) => s.why === "far"));
  for (const s of spots) for (const o of spots) if (s !== o) assert.ok(Math.hypot(s.x - o.x, s.y - o.y) >= 2, JSON.stringify(spots));
  assert.equal(nextSpots(gridCells(), [obsAt(0.5, 0.5)], two().rooms, 1).length, 1);
  assert.deepEqual(nextSpots(gridCells(), [obsAt(0.5, 0.5)], two().rooms), spots, "deterministic");
  // A reading of another access point does not count for cells served by "a".
  const other = nextSpots(gridCells(), [obsAt(5.5, 2.5, "b")], two().rooms, 1);
  assert.deepEqual(other[0], { x: 0.5, y: 0.5, why: "far" }, "nothing of a's: every cell as far, ties by x then y");
  // A reading without an access point counts for the one serving where it was taken.
  const unknown = nextSpots(gridCells(), [obsAt(5.5, 2.5, null)], two().rooms, 1);
  assert.deepEqual(unknown[0], { x: 0.5, y: 0.5, why: "far" });
  const placed = nextSpots(gridCells(), [obsAt(0.5, 0.5, null)], two().rooms, 1);
  assert.deepEqual(placed[0], { x: 5.5, y: 2.5, why: "far" });
});

test("nextSpots: then handover cells without a reading within 1 m, then rooms without any; a cell within 2 m is no far spot", () => {
  // A 3 m room and a 1 m one; the column at x = 2.5 is a handover zone.
  const rooms = [{ area_id: "alex", polygon: sq(0, 0, 3, 3) }, { area_id: "sam", polygon: sq(3, 0, 1, 3) }];
  const cells = gridCells(() => "a", (x) => (x === 2.5 ? -52 : null)).filter((c) => c.x < 4);
  // Every cell within 2 m of a reading; all readings in the first room; the zone's ends 1.1 m from one.
  const obs = [obsAt(1.4, 0.5), obsAt(1.4, 2.5), obsAt(2.9, 1.5)];
  const spots = nextSpots(cells, obs, rooms, 5);
  const middle = widestRow(rooms[1].polygon);
  assert.deepEqual(spots, [{ x: 2.5, y: 0.5, why: "handover" }, { x: 2.5, y: 2.5, why: "handover" },
    { x: middle.x, y: middle.y, why: "room" }]);
  assert.deepEqual(nextSpots(cells, obs, rooms, 2).map((s) => s.why), ["handover", "handover"], "at most n");
  // Without the reading at the top left, that corner is far: it comes first.
  const fewer = nextSpots(cells, [obsAt(1.4, 0.5), obsAt(2.9, 1.5)], rooms, 5);
  assert.deepEqual(fewer[0], { x: 0.5, y: 2.5, why: "far" });
  assert.deepEqual(fewer.slice(1).map((s) => s.why), ["handover", "handover", "room"]);
  assert.deepEqual(nextSpots([], [], rooms), [{ ...widestRow(rooms[0].polygon), why: "room" }, { ...widestRow(rooms[1].polygon), why: "room" }]
    .map(({ x, y, why }) => ({ x, y, why })), "no cells: the rooms");
});
