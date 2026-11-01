import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pointInPolygon, centroid, zoomAt, splitPolygon, joinPolygons, snapToEdge, polygonArea, wallLengths, interiorPoint,
} from './geometry.js';

const L = [[3, 0], [4, 0], [4, 5], [0, 5], [0, 4], [3, 4]];
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const area = (p) => Math.abs(p.reduce((s, [x, y], i) => {
  const [nx, ny] = p[(i + 1) % p.length];
  return s + x * ny - nx * y;
}, 0)) / 2;
const bbox = (p) => [Math.min(...p.map((v) => v[0])), Math.min(...p.map((v) => v[1])),
  Math.max(...p.map((v) => v[0])), Math.max(...p.map((v) => v[1]))];

test('pointInPolygon: inside, notch outside, edge counts as inside', () => {
  assert.equal(pointInPolygon([3.5, 2], L), true);
  assert.equal(pointInPolygon([1, 2], L), false);   // the notch
  assert.equal(pointInPolygon([1, 4.5], L), true);
  assert.equal(pointInPolygon([4, 2], L), true);    // on an edge
  assert.equal(pointInPolygon([2, 4], L), true);    // on the inner edge
  assert.equal(pointInPolygon([9, 9], L), false);
});

test('centroid: rectangle centre; degenerate gives the mean of vertices', () => {
  const c = centroid(rect(0, 0, 4, 2));
  assert.ok(Math.abs(c[0] - 2) < 1e-9 && Math.abs(c[1] - 1) < 1e-9);
  const d = centroid([[0, 0], [2, 0], [4, 0]]);
  assert.deepEqual(d, [2, 0]);
});

test('zoomAt keeps the point under the cursor and clamps w to [1, extent]', () => {
  const view = { x: 0, y: 0, w: 10, h: 5, max: { w: 20 } };
  const v = zoomAt(view, 0.5, [4, 2]);
  assert.equal(v.w, 5);
  assert.ok(Math.abs(v.h - 2.5) < 1e-9);
  assert.ok(Math.abs(v.x - 2) < 1e-9 && Math.abs(v.y - 1) < 1e-9);
  // the fraction of the cursor within the view is unchanged
  assert.ok(Math.abs((4 - v.x) / v.w - 0.4) < 1e-9);
  const tight = zoomAt(v, 0.01, [4, 2]);
  assert.equal(tight.w, 1);
  const wide = zoomAt(view, 100, [4, 2]);
  assert.equal(wide.w, 20);
  assert.ok(Math.abs(wide.h - 10) < 1e-9);
});

test('splitPolygon: a 4 x 2 rectangle at x = 1.5 gives areas 3 and 5', () => {
  const r = splitPolygon(rect(0, 0, 4, 2), [1.5, 0], [1.5, 2]);
  assert.ok(r);
  assert.deepEqual(r.map(area).sort((a, b) => a - b), [3, 5]);
});

test('splitPolygon snaps endpoints within 0.05 m; refuses a far point', () => {
  const r = splitPolygon(rect(0, 0, 4, 2), [1.5, 0.03], [1.5, 1.98]);
  assert.ok(r);
  assert.deepEqual(r.map(area).sort((a, b) => a - b), [3, 5]);
  assert.equal(splitPolygon(rect(0, 0, 4, 2), [1.5, 0.5], [1.5, 2]), null);
});

test('splitPolygon: a chord outside or crossing an edge of the L gives null', () => {
  // across the notch: midpoint outside
  assert.equal(splitPolygon(L, [0, 4.5], [3.5, 0]), null);
  assert.equal(splitPolygon(L, [0, 4.5], [3, 2]), null);
  // from the notch's left edge to the far right edge, through the notch: crosses nothing but the
  // midpoint (2, 4.25) is inside; use a chord that leaves the shape instead
  assert.equal(splitPolygon(L, [1.5, 4], [4, 1]), null);
  // a valid chord across the foot of the L
  const ok = splitPolygon(L, [0, 4.5], [4, 4.5]);
  assert.ok(ok);
  assert.equal(area(ok[0]) + area(ok[1]), area(L));
});

test('joinPolygons: two rectangles sharing a side give the 5 x 2 rectangle', () => {
  const j = joinPolygons(rect(0, 0, 2, 2), rect(2, 0, 5, 2));
  assert.ok(j);
  assert.equal(j.length, 4);
  assert.deepEqual(bbox(j), [0, 0, 5, 2]);
  assert.equal(area(j), 10);
});

test('joinPolygons: a partial shared side keeps the corner vertices', () => {
  const j = joinPolygons(rect(0, 0, 2, 2), rect(2, 1, 4, 3));
  assert.ok(j);
  assert.equal(area(j), 8);
  assert.equal(j.length, 8);       // an S-shaped union
});

test('joinPolygons: corner contact only gives null', () => {
  assert.equal(joinPolygons(rect(0, 0, 2, 2), rect(2, 2, 4, 4)), null);
  assert.equal(joinPolygons(rect(0, 0, 2, 2), rect(5, 5, 6, 6)), null);
});

test('joinPolygons: an L and the rectangle filling its notch give a rectangle', () => {
  const notch = rect(0, 0, 3, 4);
  const j = joinPolygons(L, notch);
  assert.ok(j);
  assert.equal(j.length, 4);
  assert.deepEqual(bbox(j), [0, 0, 4, 5]);
  assert.equal(area(j), 20);
  const j2 = joinPolygons(notch, L);
  assert.equal(j2.length, 4);
});

test('snapToEdge: nearest edge within tolerance', () => {
  const r = snapToEdge(rect(0, 0, 4, 2), [1, 0.04], 0.05);
  assert.ok(r);
  assert.equal(r.edge, 0);
  assert.ok(Math.abs(r.pt[0] - 1) < 1e-9 && Math.abs(r.pt[1]) < 1e-9);
  assert.equal(snapToEdge(rect(0, 0, 4, 2), [1, 1], 0.05), null);
});

test('polygonArea: a rectangle and the L-shaped room, either winding', () => {
  assert.equal(polygonArea(rect(0, 0, 4, 3)), 12);
  assert.equal(polygonArea(L), 8);
  assert.equal(polygonArea([...L].reverse()), 8);
});

test('wallLengths: one per wall, from each corner to the next', () => {
  assert.deepEqual(wallLengths(rect(0, 0, 4, 3)), [4, 3, 4, 3]);
  assert.deepEqual(wallLengths(L), [1, 5, 4, 1, 3, 4]);
  assert.equal(wallLengths([[0, 0], [3, 4], [0, 4]])[0], 5);
});

test('interiorPoint: inside the L-shaped room, whose centroid is outside it', () => {
  assert.equal(pointInPolygon(centroid(L), L), false);
  const p = interiorPoint(L);
  assert.ok(pointInPolygon(p, L), String(p));
  assert.deepEqual(p, [3.5, 3.25]);
});
