// Wi-Fi coverage (SPEC-044): the walls of a floor as material segments and the loss a ray pays
// crossing them. Pure functions of the plan and hass; no DOM.

import materials from "./materials.json" with { type: "json" };
import { facingWalls, editFloor } from "./plan.js";
import { pointInPolygon, widestRow } from "./geometry.js";
import { openingShape, openingState, kindOf, outside, SHARED_M } from "./openings.js";

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
// has it. {a, b, shared, rooms}: `rooms` the indices of the rooms that have it, its owner first.
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
        out.push({ a: at(t0), b: at(t1), shared: by.length > 0, rooms: [i, ...by] });
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

// Whether an opening joins an indoor room to an outdoor one (Amendment 1: a balcony's door).
const toOutdoor = (wifi, o) => {
  const outdoor = wifi?.outdoor ?? [];
  const sides = o.rooms.filter((r) => r !== null);
  return sides.some((r) => outdoor.includes(r)) && sides.some((r) => !outdoor.includes(r));
};

// What an opening is without its own `material` and `state`: glazing on a window, fixed glass and a door
// to an outdoor room, wood on any other door, none on a doorway; closed to the outside or to an outdoor
// room, else open (a doorway always).
export function openingDefaults(wifi, o) {
  const kind = kindOf(o);
  const boundary = toOutdoor(wifi, o);
  if (kind === "opening") return { material: null, state: "open" };
  const material = kind === "door" && !boundary ? materials.defaults.door : materials.defaults.window;
  return { material, state: outside(o) || boundary ? "closed" : "open" };
}

// A floor's walls as segments {a, b, material, open, kind}: every room edge once (shared edges
// merged), edges inside an open space dropped, every opening cut out of its wall as a segment of
// its own. A wall is `cls` interior when two rooms share it, exterior when one room has it alone or it
// parts an indoor from an outdoor room. `wifi` is the plan's `wifi` (its defaults and outdoor rooms),
// possibly undefined.
export function wallSegments(floor, wifi, hass) {
  const defaults = { ...materials.defaults };
  for (const k of ["interior", "exterior"]) if (wifi?.defaults?.[k]) defaults[k] = wifi.defaults[k];
  const outdoor = new Set(wifi?.outdoor ?? []);
  const rooms = floor.rooms || [];
  const isOut = (i) => outdoor.has(rooms[i].area_id);
  const facing = facingWalls(floor);
  const walls = floor.walls || [];
  let segs = stretches(floor).filter((s) => {
    const mid = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
    return !facing.some(([p, q]) => distToSegment(mid, p, q) <= SHARED_M);
  }).map((s) => {
    const set = walls.find((w) => distToSegment(w.at, s.a, s.b) <= SHARED_M);
    const cls = s.shared && (s.rooms.every(isOut) || !s.rooms.some(isOut)) ? "interior" : "exterior";
    return { a: s.a, b: s.b, material: set?.material ?? defaults[cls], open: false, kind: "wall", shared: s.shared, cls };
  });

  for (const o of floor.openings || []) {
    const shape = openingShape(floor, o);
    if (!shape) continue;
    const kind = kindOf(o);
    const material = kind === "opening" ? "opening" : o.material ?? openingDefaults(wifi, o).material;
    const state = openingState(o, hass);
    // A sensor's answer or the opening's own state decides; else a door or window to an outdoor room is
    // closed (the drawing keeps openings.js's default: this is the prediction's assumption).
    const open = (kind === "door" || kind === "window") && !o.state && !(state.linked && state.known) && toOutdoor(wifi, o)
      ? false : state.open;
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

// The wall stretch nearest `pt` within `tol`, whole from corner to corner (an opening on it does not
// cut it): {a, b, material, shared, cls, at}, `at` its middle to the millimetre; null without a wall there.
export function wallSegmentAt(floor, wifi, pt, tol) {
  let best = null;
  for (const s of wallSegments({ ...floor, openings: [] }, wifi, {})) {
    const d = distToSegment(pt, s.a, s.b);
    if (d <= tol && (!best || d < best.d)) best = { s, d };
  }
  if (!best) return null;
  const { a, b, material, shared, cls } = best.s;
  return { a, b, material, shared, cls, at: [mm((a[0] + b[0]) / 2), mm((a[1] + b[1]) / 2)] };
}

const mm = (v) => Math.round(v * 1000) / 1000;

// Calls fn(material, k) for each closed segment the open segment p-q crosses, k = min(1/cos(theta), 2),
// theta the angle to the wall's normal. A crossing at a segment's start counts, at its end it does
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
    fn(s.material, Math.min(1 / cos, OBLIQUE_CAP));
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

// The wall stretch through `at` made of `material`; the default for its class (interior: shared by two
// rooms, exterior: one room's alone or between an indoor and an outdoor room) removes its entry instead.
export function setWallMaterial(doc, floorId, at, material) {
  if (!materialsFor("wall").includes(material)) return null;
  return editFloor(doc, floorId, (floor) => {
    const seg = wallSegmentAt(floor, doc.wifi, at, SHARED_M);
    if (!seg) return null;
    const walls = (floor.walls || []).filter((w) => distToSegment(w.at, seg.a, seg.b) > SHARED_M);
    if (material !== wallDefault(doc.wifi, seg.cls)) walls.push({ at: [mm(at[0]), mm(at[1])], material });
    return withList(floor, "walls", walls);
  });
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
export function nextSpots(cells, observations, rooms, n = 3) {
  const nearest = (o) => {
    let best = null;
    for (const c of cells) if (!best || dist(c, o) < dist(best, o)) best = c;
    return best?.ap ?? null;
  };
  const obs = (observations ?? []).map((o) => ({ x: o.x, y: o.y, ap: o.ap ?? nearest(o) }));
  const out = [];
  const free = (c) => !out.some((s) => dist(s, c) < APART_M);
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
  const far = cells.map((c) => ({ c, d: Math.min(Infinity, ...obs.filter((o) => o.ap === c.ap).map((o) => dist(o, c))) }))
    .filter((e) => e.d > FAR_M)
    .sort((a, b) => b.d - a.d || byXY(a.c, b.c));
  for (const { c } of far) take(c, "far");
  return out;
}
