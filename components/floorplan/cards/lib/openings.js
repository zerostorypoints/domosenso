// Doors, windows and doorways in the rooms' walls (SPEC-028 Amendment 9): their defaults, their
// live state from a linked sensor, where they sit on a wall, and the edits of the card's tool.
// Pure functions of the plan and hass; the card draws and the sound model reads what they return.

import { snapToEdge, pointInPolygon } from "./geometry.js";
import { editFloor } from "./plan.js";
import { gridOnWall } from "./view.js";

export const KINDS = ["door", "window", "opening"];
export const MATERIALS = ["hollow", "solid", "sealed", "glass"];
export const SHARED_M = 0.05;      // m: a wall point this close to another room's wall is on both rooms' wall

// A door sensor, a window or opening sensor, a garage door; a door, window, garage or gate cover.
const SENSOR_CLASSES = new Set(["door", "window", "opening", "garage_door"]);
const COVER_CLASSES = new Set(["door", "window", "garage", "gate"]);

export const kindOf = (o) => o.kind ?? "door";
export const outside = (o) => o.rooms.includes(null);
export const widthOf = (o) => o.width ?? (kindOf(o) === "window" ? 1.0 : 0.8);
export const materialOf = (o) => (kindOf(o) === "opening" ? null : o.material ?? (kindOf(o) === "window" ? "glass" : "hollow"));
const fallbackOpen = (o) => (o.state ? o.state === "open" : !outside(o));

// Whether it is open now, and whether that is known from its sensor (`linked`: it has one; `known`:
// the sensor answered). A doorway is always open.
export function openingState(o, hass) {
  if (kindOf(o) === "opening") return { open: true, linked: false, known: true };
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
// the wall's direction and the normal into the first room (a door swings into it).
export function openingShape(floor, o) {
  const room = floor.rooms.find((r) => r.area_id === o.rooms.find((x) => x !== null));
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
  const half = Math.min(widthOf(o), len) / 2;
  return { centre: c, dir, normal, width: half * 2,
    ends: [[c[0] - dir[0] * half, c[1] - dir[1] * half], [c[0] + dir[0] * half, c[1] + dir[1] * half]] };
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
    if (kindOf(next) === "opening") {
      delete next.material;
      delete next.entity;
      if (next.state === "closed") delete next.state;
    }
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
