// Plane geometry for the floor plan card: rooms are polygons in metres (floats, y down). Kept free of
// the DOM so the editor's shape operations are testable with `node --test`.

const EPS = 1e-9;          // equality of two coordinates or a point on a line
const SNAP = 0.05;         // m: how far a split endpoint may sit from the edge it snaps to
const MIN_SHARED = 0.05;   // m: the shortest shared boundary that lets two rooms join

const same = (p, q) => Math.abs(p[0] - q[0]) <= EPS && Math.abs(p[1] - q[1]) <= EPS;
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x, y] = poly[i];
    const [nx, ny] = poly[(i + 1) % poly.length];
    s += x * ny - nx * y;
  }
  return s / 2;
}

// The floor area in m², whichever way the corners run.
export function polygonArea(poly) {
  return Math.abs(signedArea(poly));
}

// The length of each wall, from corner i to corner i + 1.
export function wallLengths(poly) {
  return poly.map((p, i) => dist(p, poly[(i + 1) % poly.length]));
}

// A point inside any simple polygon, for when the centroid is not (an L-shaped room): the middle of
// the widest stretch of the horizontal line through the centroid's height that lies inside.
export function interiorPoint(poly) {
  const ys = poly.map((p) => p[1]);
  let y = centroid(poly)[1];
  if (poly.some((p) => Math.abs(p[1] - y) <= EPS)) y = (Math.min(...ys) + Math.max(...ys)) / 2 + EPS * 10;
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  xs.sort((p, q) => p - q);
  let best = null;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  }
  return best ? [(best[0] + best[1]) / 2, y] : centroid(poly);
}

// Closest point on segment ab to p, with its parameter t in [0, 1].
function project(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 < EPS ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return { pt: [a[0] + t * dx, a[1] + t * dy], t };
}

export function snapToEdge(polygon, pt, tol) {
  let best = null;
  for (let i = 0; i < polygon.length; i++) {
    const { pt: q } = project(pt, polygon[i], polygon[(i + 1) % polygon.length]);
    const d = dist(pt, q);
    if (d <= tol && (!best || d < best.d)) best = { pt: q, edge: i, d };
  }
  return best && { pt: best.pt, edge: best.edge };
}

export function pointInPolygon([x, y], polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    // On the edge counts as inside; the even-odd test alone is unreliable there.
    if (dist([x, y], project([x, y], a, b).pt) <= EPS) return true;
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

export function centroid(polygon) {
  const a = signedArea(polygon);
  const n = polygon.length;
  if (Math.abs(a) < EPS) {
    return [polygon.reduce((s, p) => s + p[0], 0) / n, polygon.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = polygon[i];
    const [nx, ny] = polygon[(i + 1) % n];
    const f = x * ny - nx * y;
    cx += (x + nx) * f;
    cy += (y + ny) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

// view = {x, y, w, h, max: {w}} in metres; max.w is the whole plan's width, the widest the view may be.
export function zoomAt(view, factor, [cx, cy]) {
  const w = Math.max(1, Math.min(view.max.w, view.w * factor));
  const k = w / view.w;
  return { ...view, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, w, h: view.h * k };
}

// Vertices of `poly` with the given points inserted into the edges they lie on (interior only).
function insertOnEdges(poly, pts) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    out.push(a);
    const hits = [];
    for (const p of pts) {
      if (same(p, a) || same(p, b)) continue;
      const { pt, t } = project(p, a, b);
      if (dist(p, pt) <= EPS) hits.push({ p, t });
    }
    hits.sort((u, v) => u.t - v.t);
    for (const h of hits) if (!out.length || !same(out[out.length - 1], h.p)) out.push(h.p);
  }
  return out;
}

export function splitPolygon(polygon, a, b) {
  const sa = snapToEdge(polygon, a, SNAP);
  const sb = snapToEdge(polygon, b, SNAP);
  if (!sa || !sb) return null;
  const n = polygon.length;
  // A snapped point at a corner is that corner, not a new vertex.
  const asCorner = (s) => {
    if (same(s.pt, polygon[s.edge])) return s.edge;
    if (same(s.pt, polygon[(s.edge + 1) % n])) return (s.edge + 1) % n;
    return -1;
  };
  const ca = asCorner(sa);
  const cb = asCorner(sb);
  const pa = ca >= 0 ? polygon[ca] : sa.pt;
  const pb = cb >= 0 ? polygon[cb] : sb.pt;
  if (dist(pa, pb) <= EPS) return null;

  // The chord must lie inside and touch the boundary only at its ends.
  const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
  if (!pointInPolygon(mid, polygon) || snapToEdge(polygon, mid, EPS)) return null;
  for (let i = 0; i < n; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % n];
    const d1 = cross(pa, pb, p);
    const d2 = cross(pa, pb, q);
    const d3 = cross(p, q, pa);
    const d4 = cross(p, q, pb);
    if (d1 * d2 < -EPS && d3 * d4 < -EPS) return null;       // a proper crossing
    if (!same(p, pa) && !same(p, pb)) {                       // a corner on the chord's inside
      const { pt } = project(p, pa, pb);
      if (dist(p, pt) <= EPS) return null;
    }
  }

  const ring = insertOnEdges(polygon, [pa, pb]);
  const ia = ring.findIndex((p) => same(p, pa));
  const ib = ring.findIndex((p) => same(p, pb));
  const walk = (from, to) => {
    const out = [];
    for (let i = from; ; i = (i + 1) % ring.length) {
      out.push(ring[i]);
      if (i === to) break;
    }
    return out;
  };
  const p1 = walk(ia, ib);
  const p2 = walk(ib, ia);
  if (p1.length < 3 || p2.length < 3) return null;
  return [p1, p2];
}

export function joinPolygons(p, q) {
  // Same winding for both, so a shared boundary runs in opposite directions.
  const orient = (poly) => (signedArea(poly) < 0 ? [...poly].reverse() : poly);
  const P = insertOnEdges(orient(p), q);
  const Q = insertOnEdges(orient(q), p);
  const edges = (poly) => poly.map((a, i) => [a, poly[(i + 1) % poly.length]]);
  const ep = edges(P);
  const eq = edges(Q);
  const matches = (e, f) => same(e[0], f[0]) && same(e[1], f[1]);
  const reversed = (e, f) => same(e[0], f[1]) && same(e[1], f[0]);

  if (ep.some((e) => eq.some((f) => matches(e, f)))) return null;   // overlapping, not touching
  let shared = 0;
  const keep = [];
  for (const e of ep) {
    if (eq.some((f) => reversed(e, f))) shared += dist(e[0], e[1]);
    else keep.push(e);
  }
  if (shared <= MIN_SHARED) return null;
  for (const f of eq) if (!ep.some((e) => reversed(e, f))) keep.push(f);

  // Chain the directed edges into one loop from the lowest-left vertex.
  let start = keep[0][0];
  for (const e of keep) {
    if (e[0][0] < start[0] - EPS || (Math.abs(e[0][0] - start[0]) <= EPS && e[0][1] < start[1])) start = e[0];
  }
  const used = new Set();
  const loop = [start];
  let cur = start;
  for (;;) {
    const i = keep.findIndex((e, k) => !used.has(k) && same(e[0], cur));
    if (i < 0) return null;
    used.add(i);
    cur = keep[i][1];
    if (same(cur, start)) break;
    loop.push(cur);
  }
  if (used.size !== keep.length) return null;                      // two loops: a hole or a pinch

  // Merge collinear runs: a vertex on the straight line between its neighbours goes.
  const merged = loop.filter((v, i) => {
    const prev = loop[(i + loop.length - 1) % loop.length];
    const next = loop[(i + 1) % loop.length];
    const straight = Math.abs(cross(prev, v, next)) <= EPS * Math.max(1, dist(prev, next));
    const ahead = (v[0] - prev[0]) * (next[0] - v[0]) + (v[1] - prev[1]) * (next[1] - v[1]) > 0;
    return !(straight && ahead);
  });
  return merged.length >= 3 ? merged : null;
}

// Where a room's name fits best: the longest horizontal run inside the polygon over `rows` sampled
// heights, the one nearest the middle on a tie. {x, y} is the run's middle, `width` its length.
export function widestRow(polygon, rows = 24) {
  const ys = polygon.map((p) => p[1]);
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const mid = (y0 + y1) / 2;
  let best = null;
  for (let i = 0; i < rows; i++) {
    const y = y0 + ((i + 0.5) * (y1 - y0)) / rows;
    const xs = [];
    polygon.forEach((a, k) => {
      const b = polygon[(k + 1) % polygon.length];
      if ((a[1] <= y && y < b[1]) || (b[1] <= y && y < a[1])) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    });
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const width = xs[k + 1] - xs[k];
      const better = !best || width > best.width + 1e-9
        || (Math.abs(width - best.width) <= 1e-9 && Math.abs(y - mid) < Math.abs(best.y - mid));
      if (better) best = { x: (xs[k] + xs[k + 1]) / 2, y, width };
    }
  }
  if (best) return best;
  const [x, y] = centroid(polygon);
  return { x, y, width: 0 };
}

// Where a sensor may stand: inside a room. A point in some room stays; one outside every room (in a
// wall, outside the flat) goes to the nearest point of a room's walls. A floor without rooms keeps it.
export function insideRooms(pt, polygons) {
  if (!polygons.length || polygons.some((poly) => pointInPolygon(pt, poly))) return pt;
  let best = null;
  let bestD = Infinity;
  for (const poly of polygons) {
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2)) : 0;
      const q = [a[0] + t * dx, a[1] + t * dy];
      const d = Math.hypot(pt[0] - q[0], pt[1] - q[1]);
      if (d < bestD) [best, bestD] = [q, d];
    });
  }
  return best;
}
