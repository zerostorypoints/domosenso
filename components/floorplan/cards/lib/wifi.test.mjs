import { test } from "node:test";
import assert from "node:assert/strict";
import { BANDS, wallSegments, pathLoss, priorParams, predict, coverage, isHandover, contextFor, cacheKey } from "./wifi.js";
import table from "./materials.json" with { type: "json" };

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
