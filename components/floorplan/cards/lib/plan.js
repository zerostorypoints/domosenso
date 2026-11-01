// The plan model of the floor plan card: pure functions over the plan document and Home Assistant's
// frontend registries. No DOM. Every edit returns a new document, or null when it is refused, so the
// card can ignore a refused gesture without checking state. Shapes mirror tools/domosenso_cli/floorplan_doc.py.

import { pointInPolygon, centroid, splitPolygon, joinPolygons } from "./geometry.js";

export const POINT_CLASSES = ["temperature", "humidity", "illuminance", "moisture", "carbon_dioxide", "pm25"];
export const SCHEMA_VERSION = 1;
const CARD_TYPE = "custom:floorplan-card";
const SAME = 1e-9;   // joinPolygons compares corners with this absolute tolerance

// A millimetre, as floorplan_doc.py compares: finer values are drag noise, and a saved plan with
// them would read as changed on every `floorplan push`. The + 0 turns -0 into 0.
const mm = (v) => Math.round(v * 1000) / 1000 + 0;
const mmPt = ([x, y]) => [mm(x), mm(y)];

export function supported(doc) {
  return !!doc && typeof doc === "object" && doc.schema === SCHEMA_VERSION && Array.isArray(doc.floors);
}

export function emptyPlan(floorIds) {
  return { schema: SCHEMA_VERSION, floors: floorIds.map((floor_id) => ({ floor_id, rooms: [], points: [] })) };
}

const keyOf = (point) => point.device_id ?? point.entity_id;
const floorIndex = (doc, floorId) => doc.floors.findIndex((f) => f.floor_id === floorId);
const sameXY = (p, q) => Math.abs(p[0] - q[0]) <= SAME && Math.abs(p[1] - q[1]) <= SAME;

// A new doc with the floor replaced by fn(floor); fn returns null to refuse.
function editFloor(doc, floorId, fn) {
  const i = floorIndex(doc, floorId);
  if (i < 0) return null;
  const floor = fn(doc.floors[i]);
  if (!floor) return null;
  return { ...doc, floors: doc.floors.map((f, j) => (j === i ? floor : f)) };
}

function editRoom(doc, floorId, areaId, fn) {
  return editFloor(doc, floorId, (floor) => {
    const k = floor.rooms.findIndex((r) => r.area_id === areaId);
    if (k < 0) return null;
    const polygon = fn(floor.rooms[k].polygon);
    if (!polygon) return null;
    return { ...floor, rooms: floor.rooms.map((r, j) => (j === k ? { ...r, polygon } : r)) };
  });
}

// ---- candidates: what can be put on the plan --------------------------------------------------

function isPointEntity(hass, entityId) {
  if (entityId.startsWith("plant.")) return true;
  const cls = hass.states?.[entityId]?.attributes?.device_class;
  return POINT_CLASSES.includes(cls);
}

export function candidates(hass) {
  const ids = new Set([...Object.keys(hass.entities || {}), ...Object.keys(hass.states || {})]);
  const byKey = new Map();
  for (const id of [...ids].sort()) {
    if (!isPointEntity(hass, id)) continue;
    const reg = hass.entities?.[id] || {};
    const device = reg.device_id ? hass.devices?.[reg.device_id] : null;
    const area = reg.area_id ?? device?.area_id ?? null;     // the entity's own area wins
    const key = reg.device_id || id;
    let c = byKey.get(key);
    if (!c) {
      c = { key, kind: reg.device_id ? "device" : "entity", area_id: null, entities: [] };
      byKey.set(key, c);
    }
    c.entities.push(id);
    if (c.area_id === null) c.area_id = area;
  }
  return [...byKey.values()];
}

export function autoPlace(doc, hass, floorId) {
  const floor = doc.floors[floorIndex(doc, floorId)];
  if (!floor) return doc;
  const placed = new Set(doc.floors.flatMap((f) => f.points.map(keyOf)));
  const added = [];
  for (const c of candidates(hass)) {
    if (placed.has(c.key)) continue;
    const room = floor.rooms.find((r) => r.area_id === c.area_id);
    if (!room) continue;
    const [x, y] = mmPt(centroid(room.polygon));
    added.push(c.kind === "device"
      ? { device_id: c.key, x, y, placed: false }
      : { entity_id: c.key, x, y, placed: false });
  }
  if (!added.length) return doc;
  return editFloor(doc, floorId, (f) => ({ ...f, points: [...f.points, ...added] }));
}

export function tray(doc, hass) {
  const placed = new Set(doc.floors.flatMap((f) => f.points.map(keyOf)));
  return candidates(hass).filter((c) => !placed.has(c.key));
}

export function roomOf(doc, floorId, pt) {
  const floor = doc.floors[floorIndex(doc, floorId)];
  return floor?.rooms.find((r) => pointInPolygon(pt, r.polygon))?.area_id ?? null;
}

export function roomLabel(room, hass) {
  const name = hass.areas?.[room.area_id]?.name;
  return name ? { text: name, missing: false } : { text: room.area_id, missing: true };
}

// ---- edits -----------------------------------------------------------------------------------

// A tray candidate dropped on the plan: placed, since the user chose the spot.
export function addPoint(doc, floorId, candidate, pt) {
  const [x, y] = mmPt(pt);
  if (doc.floors.some((f) => f.points.some((p) => keyOf(p) === candidate.key))) return null;
  const point = candidate.kind === "device"
    ? { device_id: candidate.key, x, y, placed: true }
    : { entity_id: candidate.key, x, y, placed: true };
  return editFloor(doc, floorId, (floor) => ({ ...floor, points: [...floor.points, point] }));
}

export function movePoint(doc, floorId, key, pt) {
  const [x, y] = mmPt(pt);
  return editFloor(doc, floorId, (floor) => {
    if (!floor.points.some((p) => keyOf(p) === key)) return null;
    return { ...floor, points: floor.points.map((p) => (keyOf(p) === key ? { ...p, x, y, placed: true } : p)) };
  });
}

// A corner shared with another room moves with it: joinPolygons only joins rooms whose corners are identical.
export function moveCorner(doc, floorId, areaId, index, to) {
  const pt = mmPt(to);
  return editFloor(doc, floorId, (floor) => {
    const room = floor.rooms.find((r) => r.area_id === areaId);
    const from = room?.polygon[index];
    if (!from) return null;
    const move = (p) => (sameXY(p, from) ? [pt[0], pt[1]] : p);
    return {
      ...floor,
      rooms: floor.rooms.map((r) => (r.area_id === areaId
        ? { ...r, polygon: r.polygon.map((p, i) => (i === index ? [pt[0], pt[1]] : p)) }
        : { ...r, polygon: r.polygon.map(move) })),
    };
  });
}

// Inserts a corner between corner `edge` and the next one.
export function insertCorner(doc, floorId, areaId, edge, pt) {
  return editRoom(doc, floorId, areaId, (poly) => {
    if (!(edge >= 0 && edge < poly.length)) return null;
    return [...poly.slice(0, edge + 1), mmPt(pt), ...poly.slice(edge + 1)];
  });
}

export function removeCorner(doc, floorId, areaId, index) {
  return editRoom(doc, floorId, areaId, (poly) => {
    if (poly.length <= 3 || !(index >= 0 && index < poly.length)) return null;
    return poly.filter((_, i) => i !== index);
  });
}

// The first half keeps the area, the second becomes newAreaId (which must not have a room on this floor).
export function splitRoom(doc, floorId, areaId, a, b, newAreaId) {
  return editFloor(doc, floorId, (floor) => {
    const k = floor.rooms.findIndex((r) => r.area_id === areaId);
    if (k < 0 || !newAreaId || floor.rooms.some((r) => r.area_id === newAreaId)) return null;
    // The chord's ends are snapped onto the walls, so they are rounded after the split; both halves
    // get the same rounded corner, which keeps them joinable.
    const halves = splitPolygon(floor.rooms[k].polygon, a, b)?.map((half) => half.map(mmPt));
    if (!halves) return null;
    const rooms = floor.rooms.map((r, j) => (j === k ? { ...r, polygon: halves[0] } : r));
    rooms.splice(k + 1, 0, { area_id: newAreaId, polygon: halves[1] });
    return { ...floor, rooms };
  });
}

export function joinRooms(doc, floorId, keepAreaId, dropAreaId) {
  return editFloor(doc, floorId, (floor) => {
    const keep = floor.rooms.find((r) => r.area_id === keepAreaId);
    const drop = floor.rooms.find((r) => r.area_id === dropAreaId);
    if (!keep || !drop || keep === drop) return null;
    const polygon = joinPolygons(keep.polygon, drop.polygon);
    if (!polygon) return null;
    return { ...floor, rooms: floor.rooms.filter((r) => r !== drop).map((r) => (r === keep ? { ...r, polygon } : r)) };
  });
}

export function linkRoom(doc, floorId, areaId, newAreaId) {
  return editFloor(doc, floorId, (floor) => {
    if (!newAreaId || floor.rooms.some((r) => r.area_id === newAreaId)) return null;
    if (!floor.rooms.some((r) => r.area_id === areaId)) return null;
    return { ...floor, rooms: floor.rooms.map((r) => (r.area_id === areaId ? { ...r, area_id: newAreaId } : r)) };
  });
}

// The dashboard config with the card's plan replaced; every other key stays (floorplan_doc.dashboard_config).
export function withPlan(config, doc) {
  if (!Array.isArray(config.views)) return config;
  const swap = (card) => (card?.type === CARD_TYPE ? { ...card, plan: doc } : card);
  return {
    ...config,
    views: config.views.map((view) => (Array.isArray(view?.cards) ? { ...view, cards: view.cards.map(swap) } : view)),
  };
}

// The plan of the dashboard's floor plan card, or null (floorplan_doc.extract).
export function extract(config) {
  for (const view of config?.views || []) {
    for (const card of view?.cards || []) {
      if (card?.type === CARD_TYPE) return card.plan && typeof card.plan === "object" ? card.plan : null;
    }
  }
  return null;
}
