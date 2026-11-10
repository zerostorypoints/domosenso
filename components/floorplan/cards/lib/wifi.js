// Wi-Fi coverage (SPEC-044): the walls of a floor as material segments and the loss a ray pays
// crossing them. Pure functions of the plan and hass; no DOM.

import materials from "./materials.json" with { type: "json" };
import { facingWalls } from "./plan.js";
import { openingShape, openingState, kindOf, SHARED_M } from "./openings.js";

export const BANDS = ["2.4", "5", "6"];

const EPS = 1e-9;
const MIN_M = 1e-6;                    // m: a stretch shorter than this is a rounding sliver
const OBLIQUE_CAP = 2;

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1];

// The stretch [t0, t1] of edge a-b (metres from a) that edge c-d covers: parallel, within SHARED_M.
function overlap(a, b, c, d) {
  const len = Math.hypot(...sub(b, a));
  const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const v = sub(d, c);
  const vl = Math.hypot(...v);
  if (vl < EPS || Math.abs(cross(u, v)) / vl > 1e-6) return null;
  if (Math.abs(cross(u, sub(c, a))) > SHARED_M || Math.abs(cross(u, sub(d, a))) > SHARED_M) return null;
  const t = [dot(u, sub(c, a)), dot(u, sub(d, a))];
  const t0 = Math.max(0, Math.min(...t));
  const t1 = Math.min(len, Math.max(...t));
  return t1 - t0 > MIN_M ? [t0, t1] : null;
}

// The distance from point p to segment a-b.
function distToSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const s = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + ab[0] * s), p[1] - (a[1] + ab[1] * s));
}

// Every room edge once, as stretches of one class: a long wall one room has and two shorter rooms
// share is cut where the sharing starts and ends. A shared stretch belongs to the first room that
// has it. {a, b, shared}
function stretches(floor) {
  const out = [];
  const rooms = floor.rooms || [];
  rooms.forEach((room, i) => {
    const poly = room.polygon;
    poly.forEach((a, k) => {
      const b = poly[(k + 1) % poly.length];
      const len = Math.hypot(...sub(b, a));
      if (len < MIN_M) return;
      const cover = [];                  // [t0, t1, other room index]
      rooms.forEach((other, j) => {
        if (j === i) return;
        other.polygon.forEach((c, m) => {
          const t = overlap(a, b, c, other.polygon[(m + 1) % other.polygon.length]);
          if (t) cover.push([...t, j]);
        });
      });
      const cuts = [...new Set([0, len, ...cover.flatMap((c) => [c[0], c[1]])])].sort((x, y) => x - y);
      const at = (t) => [a[0] + (b[0] - a[0]) * t / len, a[1] + (b[1] - a[1]) * t / len];
      for (let n = 0; n + 1 < cuts.length; n++) {
        const [t0, t1] = [cuts[n], cuts[n + 1]];
        if (t1 - t0 < MIN_M) continue;
        const mid = (t0 + t1) / 2;
        const by = cover.filter((c) => c[0] <= mid && mid <= c[1]).map((c) => c[2]);
        if (by.some((j) => j < i)) continue;           // that room emitted it
        out.push({ a: at(t0), b: at(t1), shared: by.length > 0 });
      }
    });
  });
  return out;
}

// The part of segment a-b that opening gap p-q lies on (collinear, within SHARED_M), or null.
function cutOf(a, b, gap) {
  const t = overlap(a, b, gap[0], gap[1]);
  return t && [t[0] / Math.hypot(...sub(b, a)), t[1] / Math.hypot(...sub(b, a))];
}

// A floor's walls as segments {a, b, material, open, kind}: every room edge once (shared edges
// merged), edges inside an open space dropped, every opening cut out of its wall as a segment of
// its own. `wifi` is the plan's `wifi` (its defaults), possibly undefined.
export function wallSegments(floor, wifi, hass) {
  const defaults = { ...materials.defaults, ...(wifi?.defaults || {}) };
  const facing = facingWalls(floor);
  const walls = floor.walls || [];
  let segs = stretches(floor).filter((s) => {
    const mid = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
    return !facing.some(([p, q]) => distToSegment(mid, p, q) <= SHARED_M);
  }).map((s) => {
    const set = walls.find((w) => distToSegment(w.at, s.a, s.b) <= SHARED_M);
    return { a: s.a, b: s.b, material: set?.material ?? (s.shared ? defaults.interior : defaults.exterior), open: false, kind: "wall" };
  });

  for (const o of floor.openings || []) {
    const shape = openingShape(floor, o);
    if (!shape) continue;
    const kind = kindOf(o);
    const material = kind === "opening" ? "opening"
      : o.material ?? (kind === "door" ? defaults.door : defaults.window);
    const { open } = openingState(o, hass);
    const next = [];
    for (const s of segs) {
      const cut = s.kind === "wall" && cutOf(s.a, s.b, shape.ends);
      if (!cut || cut[1] - cut[0] < MIN_M) { next.push(s); continue; }
      const at = (t) => [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
      if (cut[0] > MIN_M) next.push({ ...s, b: at(cut[0]) });
      next.push({ a: at(cut[0]), b: at(cut[1]), material, open, kind: "opening" });
      if (cut[1] < 1 - MIN_M) next.push({ ...s, a: at(cut[1]) });
    }
    segs = next;
  }
  return segs;
}

// The loss in dB of the open segment p-q: the sum over the closed segments it crosses of
// L(material, band) * min(1/cos(theta), 2), theta the angle to the wall's normal. A crossing at
// a segment's start counts, at its end it does not: a corner is paid once.
export function pathLoss(segments, p, q, band, losses) {
  const d = sub(q, p);
  const dl = Math.hypot(...d);
  if (dl < EPS) return 0;
  let total = 0;
  for (const s of segments) {
    if (s.open) continue;
    const e = sub(s.b, s.a);
    const el = Math.hypot(...e);
    const den = cross(d, e);
    if (el < EPS || Math.abs(den) < EPS * dl * el) continue;          // parallel: no crossing
    const w = sub(s.a, p);
    const t = cross(w, e) / den;                                       // along p-q
    const u = cross(w, d) / den;                                       // along the wall
    if (t <= EPS || t >= 1 - EPS || u < -EPS || u >= 1 - EPS) continue;
    const cos = Math.abs(cross(d, e)) / (dl * el);                    // |cos| to the normal = |sin| to the wall
    const loss = losses?.[s.material]?.[band] ?? 0;
    total += loss * Math.min(1 / cos, OBLIQUE_CAP);
  }
  return total;
}
