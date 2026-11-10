import { test } from "node:test";
import assert from "node:assert/strict";
import { BANDS, wallSegments, pathLoss } from "./wifi.js";

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
