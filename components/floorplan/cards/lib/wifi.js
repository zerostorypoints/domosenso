// Wi-Fi coverage (SPEC-044): the walls of a floor as material segments and the loss a ray pays
// crossing them. Pure functions of the plan and hass; no DOM.

import materials from "./materials.json" with { type: "json" };
import { facingWalls, editFloor, openSpaces } from "./plan.js";
import { pointInPolygon, widestRow } from "./geometry.js";
import { openingShape, openingState, toOutdoorRoom, kindOf, outside, SHARED_M } from "./openings.js";

export const BANDS = ["2.4", "5", "6"];

const EPS = 1e-9;
const MIN_M = 1e-6;                    // m: a stretch shorter than this is a rounding sliver
const OBLIQUE_CAP = 2;
// Amendment 3: a plan traced with real wall thickness leaves a gap between two rooms; their edges that
// face each other across it, parallel within 10 degrees, are one interior wall, not two exterior ones.
export const WALL_GAP_M = 0.6;
const PARALLEL_SIN = Math.sin((10 * Math.PI) / 180);
// A half-height wall (a balcony frame, a staircase's balustrade) costs this share of its material's
// loss on every band: a working assumption that part of the signal passes over it. The fit moves the
// material, never this factor.
export const HALF_WALL = 0.5;
const GLAZING = new Set(["glass", "double", "low_e", "triple_low_e"]);
const GAP_PROBE_M = 0.1;               // m: how often the gap of a thick wall is probed for a room standing in it

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

// The stretches of edge a-b that edge c-d faces across a gap of at most WALL_GAP_M: parallel within 10
// degrees, on one side of a-b, with no room standing in the gap. Both edges are cut across the bisector
// of their directions, so either room splits the overlap at the same points (no sliver one room charges
// and the other drops). The gap is probed every GAP_PROBE_M half-way across; where a room stands in it
// (a shaft, a duct) the pair is split. [[t0, t1, p0, p1], ...]: t metres along a-b, p0 and p1 the points
// of c-d across from t0 and t1.
function across(a, b, c, d, rooms) {
  const len = Math.hypot(...sub(b, a));
  const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const v = sub(d, c);
  const vl = Math.hypot(...v);
  if (vl < EPS || Math.abs(cross(u, v)) / vl > PARALLEL_SIN) return [];
  const sign = dot(u, v) < 0 ? -1 : 1;
  const w0 = [u[0] + sign * v[0] / vl, u[1] + sign * v[1] / vl];
  const wl = Math.hypot(...w0);
  const w = [w0[0] / wl, w0[1] / wl];
  const [sa, sb, sc, sd] = [a, b, c, d].map((q) => dot(q, w));
  if (Math.abs(sd - sc) < EPS) return [];
  const lo = Math.max(sa, Math.min(sc, sd));
  const hi = Math.min(sb, Math.max(sc, sd));
  if (hi - lo <= MIN_M) return [];
  const onAB = (x) => lerp(a, b, (x - sa) / (sb - sa));
  const onCD = (x) => lerp(c, d, (x - sc) / (sd - sc));
  const side = (x) => cross(u, sub(onCD(x), a));
  const [o0, o1] = [side(lo), side(hi)];
  if (Math.hypot(...sub(onCD(lo), onAB(lo))) > WALL_GAP_M || Math.hypot(...sub(onCD(hi), onAB(hi))) > WALL_GAP_M
    || o0 * o1 < -EPS) return [];
  const n = Math.max(1, Math.ceil((hi - lo) / GAP_PROBE_M));
  const free = [];
  for (let k = 0; k < n; k++) {
    const x = lo + ((hi - lo) * (k + 0.5)) / n;
    const [mine, theirs] = [onAB(x), onCD(x)];
    const probe = lerp(mine, theirs, 0.5);
    free.push(Math.hypot(...sub(theirs, mine)) <= SHARED_M || !rooms.some((r) => pointInPolygon(probe, r.polygon)));
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    if (!free[k] || (k > 0 && free[k - 1])) continue;
    let e = k;
    while (e + 1 < n && free[e + 1]) e++;
    const [x0, x1] = [lo + ((hi - lo) * k) / n, lo + ((hi - lo) * (e + 1)) / n];
    out.push([(len * (x0 - sa)) / (sb - sa), (len * (x1 - sa)) / (sb - sa), onCD(x0), onCD(x1)]);
  }
  return out;
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
// has it. {a, b, shared, rooms, pair}: `rooms` the indices of the rooms that have it, its owner first.
// Two rooms' edges facing each other across a gap no room fills (`across`) share the stretch where
// they overlap like touching edges do (Amendment 3); `pair` is then the other room's edge across from
// a and b, the stretch charged once, on the owner's edge.
// A stub (`stub: true`): a piece of one room's edge no longer than WALL_GAP_M between two such pairs, or
// between a pair and another room's edge (where traced walls meet in a T), is interior too; its `pair`
// is its own edge moved as far as its paired neighbour's, so it is drawn on the same middle line.
function stretches(floor) {
  const out = [];
  const rooms = floor.rooms || [];
  rooms.forEach((room, i) => {
    const poly = room.polygon;
    poly.forEach((a, k) => {
      const b = poly[(k + 1) % poly.length];
      const len = Math.hypot(...sub(b, a));
      if (len < MIN_M) return;
      const cover = [];                  // [t0, t1, other room index, across's stretch or null]
      rooms.forEach((other, j) => {
        if (j === i) return;
        other.polygon.forEach((c, m) => {
          const d = other.polygon[(m + 1) % other.polygon.length];
          const t = overlap(a, b, c, d);
          if (t) return void cover.push([...t, j, null]);
          for (const g of across(a, b, c, d, rooms)) cover.push([g[0], g[1], j, g]);
        });
      });
      const cuts = [...new Set([0, len, ...cover.flatMap((c) => [c[0], c[1]])])].sort((x, y) => x - y);
      const at = (t) => [a[0] + (b[0] - a[0]) * t / len, a[1] + (b[1] - a[1]) * t / len];
      const pieces = [];
      for (let n = 0; n + 1 < cuts.length; n++) {
        const [t0, t1] = [cuts[n], cuts[n + 1]];
        if (t1 - t0 < MIN_M) continue;
        const mid = (t0 + t1) / 2;
        pieces.push({ t0, t1, covering: cover.filter((c) => c[0] <= mid && mid <= c[1]) });
      }
      const gapOf = (p) => p?.covering.find((c) => c[3])?.[3];
      const pairAt = (gap, t) => lerp(gap[2], gap[3], (t - gap[0]) / (gap[1] - gap[0]));
      // Another room's edge within WALL_GAP_M of the edge's end `pt`, not one of the rooms in `skip`.
      const meets = (pt, skip) => rooms.some((r, j) => j !== i && !skip.includes(j) && r.polygon.some((c, m) =>
        distToSegment(pt, c, r.polygon[(m + 1) % r.polygon.length]) <= WALL_GAP_M));
      pieces.forEach((piece, n) => {
        const { t0, t1, covering } = piece;
        const by = covering.map((c) => c[2]);
        if (by.some((j) => j < i)) return;           // that room emitted it
        const gap = gapOf(piece);
        if (gap) {
          const pair = [t0, t1].map((t) => pairAt(gap, t));
          return void out.push({ a: at(t0), b: at(t1), shared: true, rooms: [i, ...by], pair });
        }
        if (!covering.length && t1 - t0 <= WALL_GAP_M + MIN_M) {
          const [before, after] = [pieces[n - 1], pieces[n + 1]];
          const near = [before, after].filter(Boolean).flatMap((p) => p.covering.map((c) => c[2]));
          const sideOk = (p, t) => (p ? p.covering.length > 0 : meets(at(t), near));
          const paired = gapOf(before) ? before : gapOf(after) ? after : null;
          if (paired && sideOk(before, t0) && sideOk(after, t1)) {
            const g = gapOf(paired);
            const end = paired === before ? t0 : t1;
            const off = sub(pairAt(g, end), at(end));
            const pair = [at(t0), at(t1)].map((q) => [q[0] + off[0], q[1] + off[1]]);
            return void out.push({ a: at(t0), b: at(t1), shared: true, rooms: [i, ...new Set(near.filter((j) => j !== i))], pair, stub: true });
          }
        }
        out.push({ a: at(t0), b: at(t1), shared: by.length > 0, rooms: [i, ...by] });
      });
    });
  });
  return out;
}

const lerp = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];

// Whether `pt` is within `tol` of a wall stretch: of its own edge or of the edge across its gap.
const nearStretch = (pt, s, tol) => distToSegment(pt, s.a, s.b) <= tol || (!!s.pair && distToSegment(pt, s.pair[0], s.pair[1]) <= tol);

// Part f0..f1 of a wall segment, its pair cut alike.
function slice(s, f0, f1) {
  const out = { ...s, a: lerp(s.a, s.b, f0), b: lerp(s.a, s.b, f1) };
  if (s.pair) out.pair = [lerp(s.pair[0], s.pair[1], f0), lerp(s.pair[0], s.pair[1], f1)];
  return out;
}

// The part of segment a-b that opening gap p-q lies on (collinear, within SHARED_M), or null.
function cutOf(a, b, gap) {
  const t = overlap(a, b, gap[0], gap[1]);
  return t && [t[0] / Math.hypot(...sub(b, a)), t[1] / Math.hypot(...sub(b, a))];
}

// What an opening is without its own `material` and `state`: glazing on a window, fixed glass and a door
// to an outdoor room, wood on any other door, none on a doorway; closed to the outside or to an outdoor
// room, else open (a doorway always).
export function openingDefaults(wifi, o) {
  const kind = kindOf(o);
  const boundary = toOutdoorRoom(o, wifi?.outdoor);
  if (kind === "opening") return { material: null, state: "open" };
  const material = kind === "door" && !boundary ? materials.defaults.door : materials.defaults.window;
  return { material, state: outside(o) || boundary ? "closed" : "open" };
}

// A floor's walls as segments {a, b, material, open, kind}: every room edge once (shared edges
// merged), edges inside an open space dropped, every opening cut out of its wall as a segment of
// its own. A wall is `cls` interior when two rooms share it, exterior when one room has it alone or it
// parts an indoor from an outdoor room, outdoor when it is an outdoor room's own (a balcony's railing
// side): that one is no wall (open, material null) until the owner sets a material for it (R24).
// Two rooms' edges across a gap of at most WALL_GAP_M share it like touching ones (Amendment 3): the
// segment lies on the first room's edge and carries `pair`, the other's edge across from it. `half`: a
// half-height wall (`walls[].height`), which costs HALF_WALL of its material.
// `wifi` is the plan's `wifi` (its defaults and outdoor rooms), possibly undefined.
export function wallSegments(floor, wifi, hass) {
  return segmentsOf(floor, wifi, hass, false);
}

// wallSegments, with `space` true the edges inside an open space kept as no wall (`space: true`), for drawing.
function segmentsOf(floor, wifi, hass, space) {
  const defaults = { ...materials.defaults };
  for (const k of ["interior", "exterior"]) if (wifi?.defaults?.[k]) defaults[k] = wifi.defaults[k];
  const outdoor = new Set(wifi?.outdoor ?? []);
  const rooms = floor.rooms || [];
  const isOut = (i) => outdoor.has(rooms[i].area_id);
  const facing = facingWalls(floor);
  const group = new Map(openSpaces(floor).flatMap((g, n) => g.map((area) => [area, n])));
  const together = (s) => s.rooms.length > 1 && s.rooms.every((i) => group.has(rooms[i].area_id)
    && group.get(rooms[i].area_id) === group.get(rooms[s.rooms[0]].area_id));
  const walls = floor.walls || [];
  let segs = [];
  for (const s of stretches(floor)) {
    const mid = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
    // An edge inside an open space is no wall; across a gap too, though FACING_M does not reach it.
    const areas = s.rooms.map((i) => rooms[i].area_id);
    if (facing.some(([p, q]) => distToSegment(mid, p, q) <= SHARED_M) || ((s.pair || s.stub) && together(s))) {
      if (space) segs.push({ a: s.a, b: s.b, ...(s.pair ? { pair: s.pair } : {}), material: null, open: true, kind: "wall", shared: true, cls: "interior", half: false, space: true, areas });
      continue;
    }
    const set = walls.find((w) => nearStretch(w.at, s, SHARED_M));
    const cls = !s.shared && isOut(s.rooms[0]) ? "outdoor"
      : s.shared && (s.rooms.every(isOut) || !s.rooms.some(isOut)) ? "interior" : "exterior";
    const material = set?.material ?? defaults[cls] ?? null;
    segs.push({ a: s.a, b: s.b, ...(s.pair ? { pair: s.pair } : {}), material, open: material === null, kind: "wall",
      shared: s.shared, cls, half: set?.height === "half", areas });
  }

  for (const o of floor.openings || []) {
    const shape = openingShape(floor, o);
    if (!shape) continue;
    const kind = kindOf(o);
    const material = kind === "opening" ? "opening" : o.material ?? openingDefaults(wifi, o).material;
    const { open } = openingState(o, hass, wifi?.outdoor);
    const next = [];
    for (const s of segs) {
      // An opening on the other room's edge of a thick wall cuts it too.
      const cut = s.kind === "wall" && (cutOf(s.a, s.b, shape.ends) || (s.pair && cutOf(s.pair[0], s.pair[1], shape.ends)));
      if (!cut || cut[1] - cut[0] < MIN_M) { next.push(s); continue; }
      if (cut[0] > MIN_M) next.push(slice(s, 0, cut[0]));
      const at = (t) => lerp(s.a, s.b, t);
      next.push({ a: at(cut[0]), b: at(cut[1]), material, open, kind: "opening" });
      if (cut[1] < 1 - MIN_M) next.push(slice(s, cut[1], 1));
    }
    segs = next;
  }
  return segs;
}

// How heavy a wall reads on the plan (Amendment 3), by its 5 GHz loss after the half-height factor:
// light below 10 dB, solid 10 to 25 dB, heavy above; `glass` for a glazing material; "none" for no wall.
export function wallWeight(material, half = false) {
  if (material === null || material === undefined) return { weight: "none", glass: false };
  const db = (materials.materials[material]?.loss?.["5"] ?? 0) * (half ? HALF_WALL : 1);
  return { weight: db < 10 ? "light" : db <= 25 ? "solid" : "heavy", glass: GLAZING.has(material) };
}

// The floor's walls as the plan draws them: every wall piece once (openings cut out, the card draws
// those), a thick wall on the middle line of its gap, an edge inside an open space and an outdoor
// room's open edge as no wall. [{a, b, weight, glass, half, areas}], `areas` the rooms that have the wall
// (a card showing one room draws the full floor's walls of that room, classified among its neighbours).
export function wallLines(floor, wifi, hass) {
  return segmentsOf(floor, wifi, hass, true).filter((s) => s.kind === "wall").map((s) => {
    const { weight, glass } = s.space ? { weight: "none", glass: false } : wallWeight(s.material, s.half);
    const [a, b] = midLine(s);
    return { a, b, weight, glass, half: weight !== "none" && s.half, areas: s.areas };
  });
}

// Where a wall segment is drawn: a thick wall on the middle line of its gap, any other on its edge.
const midLine = (s) => (s.pair ? [lerp(s.a, s.pair[0], 0.5), lerp(s.b, s.pair[1], 0.5)] : [s.a, s.b]);

// The point on a room's edge to put an opening at for a tap at `pt`: on a thick wall (picked on its
// drawn middle line or on either edge, within `tol`) the point across on its owner's edge; else `pt`.
export function wallPickPoint(floor, wifi, pt, tol) {
  const seg = wallSegmentAt(floor, wifi, pt, tol);
  if (!seg?.pair) return pt;
  const ab = sub(seg.b, seg.a);
  const f = Math.max(0, Math.min(1, dot(sub(pt, seg.a), ab) / dot(ab, ab)));
  return lerp(seg.a, seg.b, f);
}

// How far to move an opening's drawing (its leaf, jambs and panes) from the room edge it sits on to the
// middle line its thick wall is drawn on: [dx, dy], [0, 0] off a thick wall. `segments` the floor's
// wallSegments without openings, `centre` the opening's (openingShape).
export function openingShift(segments, centre) {
  for (const s of segments) {
    if (!s.pair || s.kind !== "wall") continue;
    for (const [p, q, o0, o1] of [[s.a, s.b, s.pair[0], s.pair[1]], [s.pair[0], s.pair[1], s.a, s.b]]) {
      if (distToSegment(centre, p, q) > SHARED_M) continue;
      const pq = sub(q, p);
      const f = Math.max(0, Math.min(1, dot(sub(centre, p), pq) / dot(pq, pq)));
      const [on, other] = [lerp(p, q, f), lerp(o0, o1, f)];
      return [(other[0] - on[0]) / 2, (other[1] - on[1]) / 2];
    }
  }
  return [0, 0];
}

// The wall stretch nearest `pt` within `tol`, whole from corner to corner (an opening on it does not
// cut it), a thick wall picked on either room's edge or on the middle line it is drawn on: {a, b, material, shared, cls, half, pair, areas, at}, `at`
// its middle to the millimetre; null without a wall there.
export function wallSegmentAt(floor, wifi, pt, tol) {
  let best = null;
  for (const s of wallSegments({ ...floor, openings: [] }, wifi, {})) {
    const d = Math.min(distToSegment(pt, s.a, s.b), s.pair ? distToSegment(pt, s.pair[0], s.pair[1]) : Infinity,
      s.pair ? distToSegment(pt, ...midLine(s)) : Infinity);
    if (d <= tol && (!best || d < best.d)) best = { s, d };
  }
  if (!best) return null;
  const { a, b, material, shared, cls, half, pair, areas } = best.s;
  return { a, b, material, shared, cls, half, areas, ...(pair ? { pair } : {}), at: [mm((a[0] + b[0]) / 2), mm((a[1] + b[1]) / 2)] };
}

const mm = (v) => Math.round(v * 1000) / 1000;

// Calls fn(material, k) for each closed segment the open segment p-q crosses, k = min(1/cos(theta), 2),
// theta the angle to the wall's normal, times HALF_WALL for a half-height wall. A crossing at a segment's start counts, at its end it does
// not: a corner is paid once.
function eachCrossing(segments, p, q, fn) {
  const d = sub(q, p);
  const dl = Math.hypot(...d);
  if (dl < EPS) return;
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
    fn(s.material, Math.min(1 / cos, OBLIQUE_CAP) * (s.half ? HALF_WALL : 1));
  }
}

// The closed segments p-q crosses, in segment order: [{material, k}] (the fit's Jacobian).
export function crossings(segments, p, q) {
  const out = [];
  eachCrossing(segments, p, q, (material, k) => out.push({ material, k }));
  return out;
}

// The loss in dB of the open segment p-q: the sum over its crossings of L(material, band) * k.
export function pathLoss(segments, p, q, band, losses) {
  let total = 0;
  eachCrossing(segments, p, q, (material, k) => { total += (losses?.[material]?.[band] ?? 0) * k; });
  return total;
}

// ---- prediction (SPEC-044 S1) ----

const CLIENT_M = 1.0;                  // m: a client's height above its floor
export const MOUNT_M = 1.0;                   // m: an access point's default height above its floor
export const FLOOR_HEIGHT_M = 2.7;
const MIN_D = 0.5;                     // m: closer than this the formula stops falling
const HANDOVER_DB = 6;

export const apKeyOf = (ap) => ap.device_id ?? ap.entity_id;

// The priors: transmit power per access point and band (its own, else the band's default), the
// distance exponent, every material's loss per band, and per-device offsets (none before a fit).
export function priorParams(table, aps) {
  const tx = {};
  for (const ap of aps ?? []) {
    const key = apKeyOf(ap);
    tx[key] = {};
    for (const band of BANDS) tx[key][band] = ap.tx?.[band] ?? table.bands[band].tx;
  }
  const loss = {};
  for (const [id, m] of Object.entries(table.materials)) loss[id] = { ...m.loss };
  return { tx, n: 2, loss, device: {} };
}

// Floors in HA's level order (a missing level last, then by id) with the height they stand on.
export function contextFor(doc, floorId, hass, table, params) {
  const level = (f) => hass?.floors?.[f.floor_id]?.level;
  const ordered = [...doc.floors].sort((a, b) => {
    const [la, lb] = [level(a), level(b)];
    const [na, nb] = [la === null || la === undefined, lb === null || lb === undefined];
    if (na !== nb) return na ? 1 : -1;
    if (!na && la !== lb) return la - lb;
    return a.floor_id < b.floor_id ? -1 : a.floor_id > b.floor_id ? 1 : 0;
  });
  let z = 0;
  const floors = ordered.map((f) => {
    const out = { floor_id: f.floor_id, z, slab: f.slab ?? table.defaults.slab };
    z += f.height ?? FLOOR_HEIGHT_M;
    return out;
  });
  const segmentsByFloor = {};
  const apPos = {};
  const all = [];
  for (const f of doc.floors) {
    segmentsByFloor[f.floor_id] = wallSegments(f, doc.wifi, hass);
    for (const ap of f.access_points ?? []) {
      all.push(ap);
      const key = apKeyOf(ap);
      const point = (f.points ?? []).find((p) => p.placed !== false && (p.device_id ?? p.entity_id) === key);
      if (point) apPos[key] = { floorId: f.floor_id, x: point.x, y: point.y, mount: ap.mount ?? MOUNT_M, bands: ap.bands };
    }
  }
  return { doc, floorId, params: params ?? priorParams(table, all), segmentsByFloor, apPos, floors };
}

// What does not depend on the cell: the access point's place, height, the slabs a ray from this
// floor pays to reach it. Slab i separates floor i-1 from floor i.
function prepare(ctx, apKey, band) {
  const pos = ctx.apPos[apKey];
  const { params, floors } = ctx;
  const here = floors.findIndex((f) => f.floor_id === ctx.floorId);
  const there = floors.findIndex((f) => f.floor_id === pos.floorId);
  let slabs = 0;
  for (let i = Math.min(here, there) + 1; i <= Math.max(here, there); i++) slabs += params.loss[floors[i].slab]?.[band] ?? 0;
  const bandInfo = BANDS.includes(band) ? materials.bands[band] : null;
  return {
    ap: [pos.x, pos.y],
    dz: floors[there].z + pos.mount - (floors[here].z + CLIENT_M),
    // everything constant per cell: T - L0 - slabs
    base: (params.tx[apKey]?.[band] ?? bandInfo.tx) - bandInfo.l0 - slabs,
    segs: ctx.segmentsByFloor[ctx.floorId] ?? [],
    n10: 10 * params.n,
    loss: params.loss,
    band,
  };
}

function level(pre, p) {
  const dx = p[0] - pre.ap[0];
  const dy = p[1] - pre.ap[1];
  const d = Math.max(Math.sqrt(dx * dx + dy * dy + pre.dz * pre.dz), MIN_D);
  // another floor's ray is charged the walls of the cell's own floor along its horizontal projection
  return pre.base - pre.n10 * Math.log10(d) - pathLoss(pre.segs, p, pre.ap, pre.band, pre.loss);
}

// The signal in dBm of one access point on one band at point p of the context's floor.
export function predict(ctx, apKey, band, p) {
  return level(prepare(ctx, apKey, band), p);
}

// What predict's value at p depends on besides the parameters: log10 of the clamped 3D distance, the
// walls crossed [{material, k}] and the slab materials between the floors (one entry per slab).
export function rayTerms(ctx, apKey, band, p) {
  const pos = ctx.apPos[apKey];
  const { floors } = ctx;
  const here = floors.findIndex((f) => f.floor_id === ctx.floorId);
  const there = floors.findIndex((f) => f.floor_id === pos.floorId);
  const slabs = [];
  for (let i = Math.min(here, there) + 1; i <= Math.max(here, there); i++) slabs.push(floors[i].slab);
  const dz = floors[there].z + pos.mount - (floors[here].z + CLIENT_M);
  const d = Math.max(Math.sqrt((p[0] - pos.x) ** 2 + (p[1] - pos.y) ** 2 + dz * dz), MIN_D);
  return { logd: Math.log10(d), crossings: crossings(ctx.segmentsByFloor[ctx.floorId] ?? [], p, [pos.x, pos.y]), slabs };
}

export const isHandover = (cell, margin = HANDOVER_DB) => cell.second !== null && cell.dbm - cell.second <= margin;

// The access points that serve the band and have a place, and the cells of the context's floor.
export function coverage(ctx, band, step) {
  const aps = Object.keys(ctx.apPos).filter((k) => !ctx.apPos[k].bands || ctx.apPos[k].bands.includes(band));
  if (!aps.length) return { cells: [], aps: [], hint: "no_access_points" };
  // Each access point's level, smoothed (SMOOTH_M), read at the cell's centre; then the strongest.
  const grid = levelGrid(ctx, band, Math.min(step, SMOOTH_M / 2));
  const cells = [];
  const c = [0, 0];
  (ctx.doc.floors.find((f) => f.floor_id === ctx.floorId)?.rooms ?? []).forEach((r, room) => {
    const poly = r.polygon;
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [px, py] of poly) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    for (let x = x0; x < x1; x += step) {
      for (let y = y0; y < y1; y += step) {
        c[0] = x + step / 2;
        c[1] = y + step / 2;
        if (!pointInPolygon(c, poly)) continue;
        let best = -Infinity, second = -Infinity, who = 0;
        for (let i = 0; i < aps.length; i++) {
          const v = sampleGrid(grid, grid.levels[i], c);
          if (v > best) { second = best; best = v; who = i; } else if (v > second) second = v;
        }
        cells.push({ x, y, room, dbm: best, ap: aps[who], second: second === -Infinity ? null : second });
      }
    }
  });
  return { cells, aps, hint: null };
}

// A grid's `values` at point p, interpolated between its four nodes (clamped to the grid).
export function sampleGrid(grid, values, p) {
  const { x0, y0, step, nx, ny } = grid;
  const fx = Math.max(0, Math.min(nx - 1.000001, (p[0] - x0) / step));
  const fy = Math.max(0, Math.min(ny - 1.000001, (p[1] - y0) / step));
  const [i, j] = [Math.floor(fx), Math.floor(fy)];
  const [u, v] = [fx - i, fy - j];
  const at = (a, b) => values[b * nx + a];
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}

// ---- ranges (Amendment 3) ----

// Waves bend round edges and through gaps, the straight rays do not: a ray model alone draws a sharp beam
// through a door and a stair-stepped shadow behind a corner. Every access point's level is smoothed with a
// Gaussian of SMOOTH_M (in dB) over the floor's grid, for the maps and the Ranges outlines alike;
// calibration compares readings with the unsmoothed point prediction (predict).
export const SMOOTH_M = 0.5;

// Each access point's level on its own, smoothed, on one grid over the floor's rooms with SMOOTH_M of
// margin (a node outside every room takes the level of the nearest one inside), so an outline runs on from
// room to room: {x0, y0, step, nx, ny, aps, levels}, node (i, j) at
// (x0 + i * step, y0 + j * step), levels[k][j * nx + i] the k-th access point's dBm there (coverage's
// order and model). Null without an access point on the band or a room.
export function levelGrid(ctx, band, step) {
  const aps = Object.keys(ctx.apPos).filter((k) => !ctx.apPos[k].bands || ctx.apPos[k].bands.includes(band));
  const rooms = ctx.doc.floors.find((f) => f.floor_id === ctx.floorId)?.rooms ?? [];
  if (!aps.length || !rooms.length) return null;
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const r of rooms) for (const [px, py] of r.polygon) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
  const margin = Math.max(1, Math.ceil(SMOOTH_M / step)) * step;
  [x0, y0] = [x0 - margin, y0 - margin];
  const nx = Math.ceil((x1 + margin - x0) / step) + 1;
  const ny = Math.ceil((y1 + margin - y0) / step) + 1;
  const owner = nearestInside(rooms, x0, y0, step, nx, ny);
  const c = [0, 0];
  const levels = aps.map((k) => {
    const pre = prepare(ctx, k, band);
    const v = new Float64Array(nx * ny);
    for (let n = 0; n < nx * ny; n++) {
      if (owner[n] !== n) continue;
      c[0] = x0 + (n % nx) * step;
      c[1] = y0 + Math.floor(n / nx) * step;
      v[n] = level(pre, c);
    }
    for (let n = 0; n < nx * ny; n++) if (owner[n] !== n) v[n] = v[owner[n]];
    return blur(v, nx, ny, step, SMOOTH_M);
  });
  return { x0, y0, step, nx, ny, aps, levels };
}

// Per grid node the node whose level it takes: its own inside a room, else the nearest one inside a room
// (by grid steps). Outside the rooms (beyond an outer wall, in a traced wall's gap, past the grid's edge)
// there is no level to draw: the rooms' own carry on, so an outline exists only where the level crosses
// inside the rooms, and the smoothing pulls in no value from outdoors.
function nearestInside(rooms, x0, y0, step, nx, ny) {
  const owner = new Int32Array(nx * ny).fill(-1);
  const queue = [];
  const c = [0, 0];
  for (let n = 0; n < nx * ny; n++) {
    c[0] = x0 + (n % nx) * step;
    c[1] = y0 + Math.floor(n / nx) * step;
    if (rooms.some((r) => pointInPolygon(c, r.polygon))) { owner[n] = n; queue.push(n); }
  }
  if (!queue.length) return owner.map((_, n) => n);
  for (let q = 0; q < queue.length; q++) {
    const n = queue[q];
    const [i, j] = [n % nx, Math.floor(n / nx)];
    for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
      if (a < 0 || b < 0 || a >= nx || b >= ny || owner[b * nx + a] >= 0) continue;
      owner[b * nx + a] = owner[n];
      queue.push(b * nx + a);
    }
  }
  return owner;
}

// A separable Gaussian of `sigma` metres over a grid's values, cut at 3 sigma and weighted again at the
// grid's edge (no value from beyond it).
function blur(values, nx, ny, step, sigma) {
  const r = Math.ceil((3 * sigma) / step);
  const kernel = Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp(-(((k - r) * step) ** 2) / (2 * sigma * sigma)));
  const pass = (src, n, m, index) => {
    const out = new Float64Array(src.length);
    for (let b = 0; b < m; b++) {
      for (let a = 0; a < n; a++) {
        let sum = 0, w = 0;
        for (let k = -r; k <= r; k++) {
          const t = a + k;
          if (t < 0 || t >= n) continue;
          sum += src[index(t, b)] * kernel[k + r];
          w += kernel[k + r];
        }
        out[index(a, b)] = sum / w;
      }
    }
    return out;
  };
  const rows = pass(values, nx, ny, (i, j) => j * nx + i);
  return pass(rows, ny, nx, (j, i) => j * nx + i);
}

// The lines where a grid's `values` (levelGrid's) cross `at`, by marching squares with linear
// interpolation (a saddle is read by its centre): [{points: [[x, y], ...], closed}].
export function contour(grid, values, at) {
  const { x0, y0, step, nx, ny } = grid;
  const v = (i, j) => values[j * nx + i];
  const up = (i, j) => v(i, j) >= at;
  // A crossing is named by its grid edge: "h" from (i, j) to (i + 1, j), "v" from (i, j) to (i, j + 1).
  const where = new Map();
  const point = (id, i, j, di, dj) => {
    if (!where.has(id)) {
      const [a, b] = [v(i, j), v(i + di, j + dj)];
      const f = (at - a) / (b - a);
      where.set(id, [x0 + (i + di * f) * step, y0 + (j + dj * f) * step]);
    }
    return id;
  };
  const links = new Map();
  const link = (p, q) => {
    (links.get(p) ?? links.set(p, []).get(p)).push(q);
    (links.get(q) ?? links.set(q, []).get(q)).push(p);
  };
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const [a, b, c, d] = [up(i, j), up(i + 1, j), up(i + 1, j + 1), up(i, j + 1)];    // corners clockwise from top left
      if (a === b && b === c && c === d) continue;
      const top = a !== b && point(`h${i},${j}`, i, j, 1, 0);
      const right = b !== c && point(`v${i + 1},${j}`, i + 1, j, 0, 1);
      const bottom = d !== c && point(`h${i},${j + 1}`, i, j + 1, 1, 0);
      const left = a !== d && point(`v${i},${j}`, i, j, 0, 1);
      const cut = [top, right, bottom, left].filter(Boolean);
      if (cut.length === 2) link(cut[0], cut[1]);
      else {
        const centre = (v(i, j) + v(i + 1, j) + v(i + 1, j + 1) + v(i, j + 1)) / 4 >= at;
        if (a !== centre) { link(left, top); link(right, bottom); }      // top left and bottom right cut off
        else { link(top, right); link(bottom, left); }
      }
    }
  }
  const lines = [];
  const used = new Set();
  const walk = (start) => {
    const ids = [start];
    used.add(start);
    for (let here = start; ;) {
      const next = (links.get(here) ?? []).find((n) => !used.has(n));
      if (next === undefined) break;
      used.add(next);
      ids.push(next);
      here = next;
    }
    const closed = ids.length > 2 && (links.get(ids[ids.length - 1]) ?? []).includes(start);
    lines.push({ points: ids.map((id) => where.get(id)), closed });
  };
  for (const [id, n] of links) if (n.length === 1 && !used.has(id)) walk(id);
  for (const id of links.keys()) if (!used.has(id)) walk(id);
  return lines;
}

export const MIN_OUTLINE_M = 1;        // m: a shorter piece of a Ranges outline is noise, not a range

// The Ranges outlines of `values` at `at`: contour's lines of MIN_OUTLINE_M or longer. Where the level runs
// off the grid the line stays open at its edge: there is no outline where the level does not cross.
export function rangeOutlines(grid, values, at) {
  const length = (l) => l.points.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - l.points[i - 1][0], p[1] - l.points[i - 1][1]) : 0), 0)
    + (l.closed ? Math.hypot(l.points[0][0] - l.points.at(-1)[0], l.points[0][1] - l.points.at(-1)[1]) : 0);
  return contour(grid, values, at).filter((l) => length(l) >= MIN_OUTLINE_M);
}

const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

// Everything a map's cells depend on that the context does not carry live (open doors and
// windows are hass state: the caller adds them).
export function cacheKey(doc, floorId, band, params, step) {
  return stable({ doc, floorId, band, params, step });
}

// ---- edits (SPEC-044 edit mode): each returns a new plan, or null when refused ----

const MAX_TX = 36;
const MIN_TX = -10;
const MAX_MOUNT = 5;
const HEIGHT_RANGE = [2, 10];
const AP_BANDS = ["2.4", "5"];         // a newly marked access point: what nearly every one serves
const empty = (v) => v === null || v === undefined || v === "";

// Material ids for a class (wall, window, door, slab), in the table's order.
export const materialsFor = (cls) => Object.keys(materials.materials).filter((id) => materials.materials[id].for.includes(cls));

// The default material of an opening's kind: a door's, a window's or fixed glass's; null for a doorway.
const openingClass = (o) => ({ door: "door", window: "window", fixed: "window" })[kindOf(o)] ?? null;
const wallDefault = (wifi, cls) => wifi?.defaults?.[cls] ?? materials.defaults[cls];

const withList = (floor, key, list) => {
  const { [key]: _, ...rest } = floor;
  return list.length ? { ...rest, [key]: list } : rest;
};

// The wall entry of the stretch through `at` after `change(seg, {material, half})` returns its new
// {material, half} (null: refused). The entry is kept while it says something: a material other than its
// class's default (interior: shared by two rooms, exterior: one room's alone or between an indoor and an
// outdoor room) or a half height; else removed. An outdoor room's own edge has no default: no wall (null)
// removes its entry, any material keeps one. Entries on either edge of a thick wall are replaced.
function editWall(doc, floorId, at, change) {
  return editFloor(doc, floorId, (floor) => {
    const seg = wallSegmentAt(floor, doc.wifi, at, SHARED_M);
    if (!seg) return null;
    const now = change(seg, { material: seg.material, half: !!seg.half });
    if (!now) return null;
    const walls = (floor.walls || []).filter((w) => !nearStretch(w.at, seg, SHARED_M));
    if (now.material !== null && (now.material !== wallDefault(doc.wifi, seg.cls) || now.half)) {
      walls.push({ at: [mm(at[0]), mm(at[1])], material: now.material, ...(now.half ? { height: "half" } : {}) });
    }
    return withList(floor, "walls", walls);
  });
}

// The wall stretch through `at` made of `material`, its height kept; null (no wall) only on an outdoor
// room's own edge, and drops a half height with it.
export function setWallMaterial(doc, floorId, at, material) {
  if (material !== null && !materialsFor("wall").includes(material)) return null;
  return editWall(doc, floorId, at, (seg, was) => (material === null && seg.cls !== "outdoor" ? null
    : { material, half: material !== null && was.half }));
}

// The wall stretch through `at` half height or full (Amendment 3), its material kept; refused where there
// is no wall (an outdoor room's open edge).
export function setWallHeight(doc, floorId, at, half) {
  return editWall(doc, floorId, at, (seg, was) => (was.material === null ? null : { material: was.material, half: !!half }));
}

// The plan's default for interior or exterior walls; the table's own default removes it.
export function setWifiDefault(doc, which, material) {
  if (!["interior", "exterior"].includes(which) || !materialsFor("wall").includes(material)) return null;
  const defaults = { ...doc.wifi?.defaults };
  if (material === materials.defaults[which]) delete defaults[which];
  else defaults[which] = material;
  const { defaults: _, ...wifi } = doc.wifi || {};
  if (Object.keys(defaults).length) wifi.defaults = defaults;
  const { wifi: __, ...rest } = doc;
  return Object.keys(wifi).length ? { ...rest, wifi } : rest;
}

// Opening `index` of `material`, which must fit its kind; its default (openingDefaults) or an empty value
// removes it (any kind: a doorway that was a window sheds it so).
export function setOpeningMaterial(doc, floorId, index, material) {
  return editFloor(doc, floorId, (floor) => {
    const list = floor.openings || [];
    const o = list[index];
    if (!o) return null;
    const cls = openingClass(o);
    const { material: _, ...next } = o;
    if (!empty(material)) {
      if (!cls || !materialsFor(cls).includes(material)) return null;
      if (material !== openingDefaults(doc.wifi, o).material) next.material = material;
    }
    return { ...floor, openings: list.map((x, i) => (i === index ? next : x)) };
  });
}

// The point `key` (a device or entity id of the floor) as an access point with `patch` applied:
// `bands` (known ones, non-empty), `tx` per band (an empty value removes one; kept only for its bands)
// and `mount`; null unmarks it. A newly marked one serves 2.4 and 5 GHz.
export function setAccessPoint(doc, floorId, key, patch) {
  return editFloor(doc, floorId, (floor) => {
    const list = floor.access_points || [];
    const index = list.findIndex((ap) => apKeyOf(ap) === key);
    if (patch === null) return index < 0 ? null : withList(floor, "access_points", list.filter((_, i) => i !== index));
    let ap = list[index];
    if (!ap) {
      const point = (floor.points || []).find((p) => (p.device_id ?? p.entity_id) === key);
      if (!point) return null;
      ap = { [point.device_id === key ? "device_id" : "entity_id"]: key, bands: AP_BANDS };
    }
    const bands = patch.bands ? BANDS.filter((b) => patch.bands.includes(b)) : ap.bands;
    if (!bands.length) return null;
    const tx = { ...ap.tx };
    for (const [band, v] of Object.entries(patch.tx || {})) {
      if (empty(v)) { delete tx[band]; continue; }
      if (!bands.includes(band) || !(Number.isFinite(v) && v >= MIN_TX && v <= MAX_TX)) return null;
      tx[band] = v;
    }
    for (const band of Object.keys(tx)) if (!bands.includes(band)) delete tx[band];
    let mount = ap.mount;
    if ("mount" in patch) {
      if (empty(patch.mount)) mount = undefined;
      else if (Number.isFinite(patch.mount) && patch.mount >= 0 && patch.mount <= MAX_MOUNT) mount = patch.mount;
      else return null;
    }
    const { tx: _t, mount: _m, bands: _b, ...id } = ap;
    const next = { ...id, bands };
    if (Object.keys(tx).length) next.tx = tx;
    if (mount !== undefined) next.mount = mount;
    return { ...floor, access_points: index < 0 ? [...list, next] : list.map((x, i) => (i === index ? next : x)) };
  });
}

// The floor's `height` (metres, 2 to 10) and `slab` (the floor under it); an empty value or the
// default (2.7 m, the table's slab) removes the key.
export function setFloorWifi(doc, floorId, patch) {
  return editFloor(doc, floorId, (floor) => {
    const next = { ...floor };
    if ("height" in patch) {
      const v = patch.height;
      if (empty(v) || v === FLOOR_HEIGHT_M) delete next.height;
      else if (Number.isFinite(v) && v >= HEIGHT_RANGE[0] && v <= HEIGHT_RANGE[1]) next.height = v;
      else return null;
    }
    if ("slab" in patch) {
      const v = patch.slab;
      if (empty(v) || v === materials.defaults.slab) delete next.slab;
      else if (materialsFor("slab").includes(v)) next.slab = v;
      else return null;
    }
    return next;
  });
}

// Room `areaId` (a room of some floor) outdoors or not (Amendment 1); an empty list removes the key.
export function setOutdoor(doc, areaId, on) {
  if (!(doc.floors || []).some((f) => (f.rooms || []).some((r) => r.area_id === areaId))) return null;
  const was = doc.wifi?.outdoor ?? [];
  const list = on ? (was.includes(areaId) ? was : [...was, areaId]) : was.filter((id) => id !== areaId);
  const { outdoor: _, ...wifi } = doc.wifi || {};
  if (list.length) wifi.outdoor = list;
  const { wifi: __, ...rest } = doc;
  return Object.keys(wifi).length ? { ...rest, wifi } : rest;
}

// ---- manual readings (SPEC-044 edit mode: Add reading) ----

const DBM_RANGE = [-110, 0];
const MAX_SAMPLES = 2000;

// A reading from a phone's Wi-Fi scanner at (x, y) of the floor: a sample with `source: "manual"`, its time
// `now` in UTC to the second. `band` one some access point of the plan serves; `ap` an access point serving
// it, or empty for unknown; `dbm` -110 to 0. Null when refused, as the other editors.
export function addReading(doc, floorId, { x, y, band, dbm, ap }, now = new Date()) {
  if (!(doc.floors || []).some((f) => f.floor_id === floorId)) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!Number.isFinite(dbm) || dbm < DBM_RANGE[0] || dbm > DBM_RANGE[1]) return null;
  const aps = (doc.floors || []).flatMap((f) => f.access_points || []);
  if (!BANDS.includes(band) || !aps.some((a) => (a.bands ?? BANDS).includes(band))) return null;
  if (!empty(ap) && !aps.some((a) => apKeyOf(a) === ap && (a.bands ?? BANDS).includes(band))) return null;
  const samples = doc.wifi?.samples || [];
  if (samples.length >= MAX_SAMPLES) return null;
  const t = `${now.toISOString().slice(0, 19)}Z`;
  const sample = { floor_id: floorId, x: mm(x), y: mm(y), t, band, dbm, ...(empty(ap) ? {} : { ap }), source: "manual" };
  return { ...doc, wifi: { ...doc.wifi, samples: [...samples, sample] } };
}

// ---- the survey's next spots (SPEC-044 S3) ----

const FAR_M = 2;                       // m: a cell nearer a reading of its access point is covered (high confidence)
const SAMPLED_M = 1;                   // m: a handover cell with a reading this near has been sampled
const APART_M = 2;                     // m: two suggested spots are at least this far apart

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const byXY = (a, b) => a.x - b.x || a.y - b.y;

// Where to stand next: `cells` one floor's and band's (coverage(), x and y their centres), `observations`
// that floor's and band's, `rooms` the floor's. First the handover cells without a reading within 1 m; then
// the rooms without any reading, at their middle (or the room's cell nearest it that keeps the spots apart);
// then the cells farthest from a reading of their serving access point (a reading without one counts for the
// access point serving its spot), beyond 2 m. Every spot at least 2 m from the others; at most n, ties by x,
// then y.
// `far: false` leaves out the far cells, `apartM` spaces the spots (a phone survey: SPEC-045).
export function nextSpots(cells, observations, rooms, n = 3, { far: withFar = true, apartM = APART_M } = {}) {
  const nearest = (o) => {
    let best = null;
    for (const c of cells) if (!best || dist(c, o) < dist(best, o)) best = c;
    return best?.ap ?? null;
  };
  const obs = (observations ?? []).map((o) => ({ x: o.x, y: o.y, ap: o.ap ?? nearest(o) }));
  const out = [];
  const free = (c) => !out.some((s) => dist(s, c) < apartM);
  const take = (c, why) => {
    if (out.length >= n || !free(c)) return false;
    out.push({ x: c.x, y: c.y, why });
    return true;
  };
  const open = cells.filter((c) => isHandover(c) && !obs.some((o) => dist(o, c) < SAMPLED_M)).sort(byXY);
  for (const c of open) take(c, "handover");
  (rooms ?? []).forEach((room, i) => {
    if (obs.some((o) => pointInPolygon([o.x, o.y], room.polygon))) return;
    const { x, y } = widestRow(room.polygon);
    const middle = { x, y };
    if (take(middle, "room")) return;
    const own = cells.filter((c) => c.room === i).sort((a, b) => dist(a, middle) - dist(b, middle) || byXY(a, b));
    for (const c of own) if (take(c, "room")) return;
  });
  if (!withFar) return out;
  const far = cells.map((c) => ({ c, d: Math.min(Infinity, ...obs.filter((o) => o.ap === c.ap).map((o) => dist(o, c))) }))
    .filter((e) => e.d > FAR_M)
    .sort((a, b) => b.d - a.d || byXY(a.c, b.c));
  for (const { c } of far) take(c, "far");
  return out;
}
