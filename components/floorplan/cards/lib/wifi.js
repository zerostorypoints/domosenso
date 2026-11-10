// Wi-Fi coverage (SPEC-044): the walls of a floor as material segments and the loss a ray pays
// crossing them. Pure functions of the plan and hass; no DOM.

import materials from "./materials.json" with { type: "json" };
import { facingWalls } from "./plan.js";
import { pointInPolygon } from "./geometry.js";
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
  const defaults = { ...materials.defaults };
  for (const k of ["interior", "exterior"]) if (wifi?.defaults?.[k]) defaults[k] = wifi.defaults[k];
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

// ---- prediction (SPEC-044 S1) ----

const CLIENT_M = 1.0;                  // m: a client's height above its floor
const MOUNT_M = 1.0;                   // m: an access point's default height above its floor
const FLOOR_HEIGHT_M = 2.7;
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

export const isHandover = (cell, margin = HANDOVER_DB) => cell.second !== null && cell.dbm - cell.second <= margin;

// The access points that serve the band and have a place, and the cells of the context's floor.
export function coverage(ctx, band, step) {
  const aps = Object.keys(ctx.apPos).filter((k) => !ctx.apPos[k].bands || ctx.apPos[k].bands.includes(band));
  if (!aps.length) return { cells: [], aps: [], hint: "no_access_points" };
  const pre = aps.map((k) => prepare(ctx, k, band));
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
        for (let i = 0; i < pre.length; i++) {
          const v = level(pre[i], c);
          if (v > best) { second = best; best = v; who = i; } else if (v > second) second = v;
        }
        cells.push({ x, y, room, dbm: best, ap: aps[who], second: second === -Infinity ? null : second });
      }
    }
  });
  return { cells, aps, hint: null };
}

const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

// Everything a map's cells depend on that the context does not carry live (open doors and
// windows are hass state: the caller adds them).
export function cacheKey(doc, floorId, band, params, step) {
  return stable({ doc, floorId, band, params, step });
}
