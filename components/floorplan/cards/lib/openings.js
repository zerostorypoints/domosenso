// Doors, windows and doorways in the rooms' walls (SPEC-028 Amendment 9): their defaults, their
// live state from a linked sensor, where they sit on a wall, and the edits of the card's tool.
// Pure functions of the plan and hass; the card draws and the sound model reads what they return.

import { snapToEdge, pointInPolygon } from "./geometry.js";
import { editFloor } from "./plan.js";
import { gridOnWall } from "./view.js";

export const KINDS = ["door", "window", "opening", "fixed"];
export const STYLES = ["hinged", "sliding"];
export const MATERIALS = ["hollow", "solid", "sealed", "glass"];
export const SHARED_M = 0.05;      // m: a wall point this close to another room's wall is on both rooms' wall

// A door sensor, a window or opening sensor, a garage door; a door, window, garage or gate cover.
const SENSOR_CLASSES = new Set(["door", "window", "opening", "garage_door"]);
const COVER_CLASSES = new Set(["door", "window", "garage", "gate"]);

export const kindOf = (o) => o.kind ?? "door";
export const outside = (o) => o.rooms.includes(null);
export const widthOf = (o) => o.width ?? (kindOf(o) === "door" || kindOf(o) === "opening" ? 0.8 : 1.0);
// Fixed glazing is glass that never opens: a window you cannot open, a glass wall.
export const materialOf = (o) => {
  const kind = kindOf(o);
  if (kind === "opening") return null;
  if (kind === "fixed") return "glass";
  return o.material ?? (kind === "window" ? "glass" : "hollow");
};
export const styleOf = (o) => (kindOf(o) === "door" && o.sliding ? "sliding" : "hinged");
// The room a door swings (or slides) into: `opens`, else the first room; null is the outside.
export const opensInto = (o) => {
  const inside = o.rooms.find((x) => x !== null);
  if (o.opens === "outside" && outside(o)) return null;
  return o.opens && o.rooms.includes(o.opens) ? o.opens : inside;
};
const fallbackOpen = (o) => (o.state ? o.state === "open" : !outside(o));

// Whether it is open now, and whether that is known from its sensor (`linked`: it has one; `known`:
// the sensor answered). A doorway is always open.
export function openingState(o, hass) {
  if (kindOf(o) === "opening") return { open: true, linked: false, known: true };
  if (kindOf(o) === "fixed") return { open: false, linked: false, known: true };
  if (!o.entity) return { open: fallbackOpen(o), linked: false, known: true };
  const st = hass?.states?.[o.entity];
  const s = st?.state;
  if (o.entity.startsWith("binary_sensor.") && (s === "on" || s === "off")) return { open: s === "on", linked: true, known: true };
  if (o.entity.startsWith("cover.")) {
    const pos = Number(st?.attributes?.current_position);
    if (s === "open" || s === "opening" || (Number.isFinite(pos) && pos > 0)) return { open: true, linked: true, known: true };
    if (s === "closed" || s === "closing") return { open: false, linked: true, known: true };
  }
  return { open: fallbackOpen(o), linked: true, known: false };
}

// The opening on its wall: the wall of its first room nearest `at`, the gap's two ends along it,
// the wall's direction, the normal to the side a door opens into, and its hinge and free ends.
// Left and right are seen from that side, facing the door (DIN 107): a sliding door slides
// towards its "hinge" end. `wall` is the whole edge it sits on.
export function openingShape(floor, o) {
  const first = o.rooms.find((x) => x !== null);
  const room = floor.rooms.find((r) => r.area_id === first);
  if (!room) return null;
  const hit = snapToEdge(room.polygon, o.at, Infinity);
  if (!hit) return null;
  const a = room.polygon[hit.edge];
  const b = room.polygon[(hit.edge + 1) % room.polygon.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!len) return null;
  const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  let normal = [-dir[1], dir[0]];
  const c = hit.pt;
  if (!pointInPolygon([c[0] + normal[0] * 0.05, c[1] + normal[1] * 0.05], room.polygon)) normal = [-normal[0], -normal[1]];
  if (opensInto(o) !== first) normal = [-normal[0], -normal[1]];
  const half = Math.min(widthOf(o), len) / 2;
  const ends = [[c[0] - dir[0] * half, c[1] - dir[1] * half], [c[0] + dir[0] * half, c[1] + dir[1] * half]];
  // Facing the door from the side it opens into is facing -normal; left of that, y pointing down.
  const left = [-normal[1], normal[0]];
  const leftEnd = dir[0] * left[0] + dir[1] * left[1] > 0 ? 1 : 0;
  const hingeEnd = o.hinge === "right" ? 1 - leftEnd : leftEnd;
  return { centre: c, dir, normal, width: half * 2, ends, hinge: ends[hingeEnd], free: ends[1 - hingeEnd], wall: [a, b] };
}

// The free wall either side of an opening: from each of its ends to the nearest corner or junction
// on its wall (a corner of any room standing on it). `before` is towards ends[0], `after` ends[1].
export function wallSpan(floor, shape) {
  const [a] = shape.wall;
  const along = (pt) => (pt[0] - a[0]) * shape.dir[0] + (pt[1] - a[1]) * shape.dir[1];
  const across = (pt) => Math.abs((pt[0] - a[0]) * shape.dir[1] - (pt[1] - a[1]) * shape.dir[0]);
  const len = along(shape.wall[1]);
  const stops = [0, len];
  for (const room of floor.rooms) for (const pt of room.polygon) {
    const t = along(pt);
    if (across(pt) <= SHARED_M && t > 0 && t < len) stops.push(t);
  }
  const t0 = along(shape.ends[0]);
  const t1 = along(shape.ends[1]);
  const eps = 1e-6;
  const lo = Math.max(...stops.filter((t) => t <= t0 + eps));
  const hi = Math.min(...stops.filter((t) => t >= t1 - eps));
  const at = (t) => [a[0] + shape.dir[0] * t, a[1] + shape.dir[1] * t];
  return { before: { from: at(lo), to: shape.ends[0], length: t0 - lo },
    after: { from: shape.ends[1], to: at(hi), length: hi - t1 } };
}

// The rooms on a wall point: the room whose wall it is, and a room sharing that wall there (else
// the outside, null). Null when no wall is within `tol`.
export function wallAt(floor, pt, tol) {
  let best = null;
  for (const room of floor.rooms) {
    const hit = snapToEdge(room.polygon, pt, tol);
    const d = hit && Math.hypot(hit.pt[0] - pt[0], hit.pt[1] - pt[1]);
    if (hit && (!best || d < best.d)) best = { room, hit, d };
  }
  if (!best) return null;
  const at = gridOnWall(best.room.polygon, best.hit.edge, best.hit.pt).map((v) => Math.round(v * 1000) / 1000);
  const other = floor.rooms.find((r) => r !== best.room && snapToEdge(r.polygon, at, SHARED_M));
  return { at, rooms: [best.room.area_id, other ? other.area_id : null] };
}

const withOpenings = (floor, list) => {
  const { openings, ...rest } = floor;
  return list.length ? { ...rest, openings: list } : rest;
};

// A door on the wall nearest `pt` (within `tol`); null when there is no wall there.
export function addOpening(doc, floorId, pt, tol, kind = "door") {
  return editFloor(doc, floorId, (floor) => {
    const wall = wallAt(floor, pt, tol);
    if (!wall) return null;
    return withOpenings(floor, [...(floor.openings || []), { kind, rooms: wall.rooms, at: wall.at }]);
  });
}

// Opening `index` slid to the wall nearest `pt`: its rooms follow the wall it lands on.
export function moveOpening(doc, floorId, index, pt, tol) {
  return editFloor(doc, floorId, (floor) => {
    const list = floor.openings || [];
    const wall = list[index] && wallAt(floor, pt, tol);
    if (!wall) return null;
    return withOpenings(floor, list.map((o, i) => (i === index ? { ...o, rooms: wall.rooms, at: wall.at } : o)));
  });
}

// Opening `index` with `patch` applied: an empty value removes a key, and a doorway sheds what it
// cannot have (a material, a sensor, being closed). A sensor already on another opening moves here.
export function setOpening(doc, floorId, index, patch) {
  return editFloor(doc, floorId, (floor) => {
    const list = floor.openings || [];
    if (!list[index]) return null;
    const next = { ...list[index], ...patch };
    for (const [k, v] of Object.entries(next)) if (v === "" || v === null || v === undefined) delete next[k];
    if (next.rooms === undefined) next.rooms = list[index].rooms;
    if (next.sliding === false) delete next.sliding;
    const kind = kindOf(next);
    if (kind !== "door") for (const k of ["sliding", "hinge", "opens"]) delete next[k];
    if (kind === "opening" || kind === "fixed") {
      delete next.material;
      delete next.entity;
      if (kind === "fixed" || next.state === "closed") delete next.state;
    }
    if (next.opens !== undefined && (next.opens === next.rooms.find((x) => x !== null)
      || !(next.rooms.includes(next.opens) || (next.opens === "outside" && next.rooms.includes(null))))) delete next.opens;
    if (next.hinge === "left") delete next.hinge;
    if (next.width !== undefined && !(next.width > 0)) return null;
    return withOpenings(floor, list.map((o, i) => {
      if (i === index) return next;
      if (next.entity && o.entity === next.entity) {
        const { entity, ...rest } = o;
        return rest;
      }
      return o;
    }));
  });
}

// The door's hinge (a sliding door's direction) to the other end.
export function swapHinge(doc, floorId, index) {
  const o = editFloorOpening(doc, floorId, index);
  return o ? setOpening(doc, floorId, index, { hinge: o.hinge === "right" ? "left" : "right" }) : null;
}

// The door to open into the room on the other side of its wall (or the outside).
export function swapSide(doc, floorId, index) {
  const o = editFloorOpening(doc, floorId, index);
  if (!o) return null;
  const other = o.rooms.find((x) => x !== opensInto(o));
  return setOpening(doc, floorId, index, { opens: other === null ? "outside" : other });
}

// The opening across the whole free wall it stands on: between the corners or junctions either side.
export function fillWall(doc, floorId, index) {
  return editFloor(doc, floorId, (floor) => {
    const list = floor.openings || [];
    const o = list[index];
    const shape = o && openingShape(floor, o);
    if (!shape) return null;
    const span = wallSpan(floor, shape);
    const r = (v) => Math.round(v * 1000) / 1000;
    const width = r(Math.hypot(span.after.to[0] - span.before.from[0], span.after.to[1] - span.before.from[1]));
    if (!(width > 0)) return null;
    const at = [r((span.before.from[0] + span.after.to[0]) / 2), r((span.before.from[1] + span.after.to[1]) / 2)];
    return withOpenings(floor, list.map((x, i) => (i === index ? { ...x, at, width } : x)));
  });
}

const editFloorOpening = (doc, floorId, index) =>
  doc.floors.find((f) => f.floor_id === floorId)?.openings?.[index] ?? null;

export function removeOpening(doc, floorId, index) {
  return editFloor(doc, floorId, (floor) => {
    const list = floor.openings || [];
    if (!list[index]) return null;
    return withOpenings(floor, list.filter((_, i) => i !== index));
  });
}

const areaOf = (hass, id) => {
  const e = hass?.entities?.[id];
  return e?.area_id ?? hass?.devices?.[e?.device_id]?.area_id ?? null;
};

// The sensors an opening may be linked to: door, window, opening and garage-door binary sensors and
// door, window, garage and gate covers, those in the opening's rooms first, then by name.
export function openingSensors(hass, o) {
  const rooms = new Set(o.rooms.filter(Boolean));
  const name = (id) => hass.states?.[id]?.attributes?.friendly_name || id;
  return Object.keys(hass?.states || {}).filter((id) => {
    const dc = hass.states[id].attributes?.device_class;
    return (id.startsWith("binary_sensor.") && SENSOR_CLASSES.has(dc)) || (id.startsWith("cover.") && COVER_CLASSES.has(dc));
  }).map((id) => ({ id, name: name(id), near: rooms.has(areaOf(hass, id)) }))
    .sort((a, b) => (b.near - a.near) || a.name.localeCompare(b.name));
}

// Where a linked sensor's dot stands: on its opening. A map from entity id to the opening's centre.
export function linkedSpots(floor) {
  const spots = new Map();
  for (const o of floor.openings || []) {
    if (!o.entity) continue;
    const shape = openingShape(floor, o);
    if (shape) spots.set(o.entity, shape.centre);
  }
  return spots;
}
