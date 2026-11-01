// The plan model of the floor plan card: pure functions over the plan document and Home Assistant's
// frontend registries. No DOM. Every edit returns a new document, or null when it is refused, so the
// card can ignore a refused gesture without checking state. Shapes mirror tools/domosenso_cli/floorplan_doc.py.

import { pointInPolygon, centroid, splitPolygon, joinPolygons } from "./geometry.js";
import { language } from "./i18n.js";

export const POINT_CLASSES = ["temperature", "humidity", "illuminance", "moisture", "carbon_dioxide", "pm25"];
// Integrations whose entities are computed from other entities: they carry a point device_class
// but are not a sensor in a room, and listed they made the tray too long to use.
export const DERIVED_PLATFORMS = ["template", "statistics", "min_max", "derivative", "integration",
  "utility_meter", "filter", "trend", "threshold", "compensation", "group"];
export const SCHEMA_VERSION = 1;
const SPREAD_M = 0.3;   // m: the radius sensors put down together are spread on, so none hides another
const BELOW_M = 0.6;    // m: auto-placed sensors sit this far under the centroid, clear of the labels
const TALL_M = 2;       // m: ... in a room at least this tall; a lower one has no room for it
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
  // Without a registry entry the platform is unknown: such an entity stays a candidate.
  if (DERIVED_PLATFORMS.includes(hass.entities?.[entityId]?.platform)) return false;
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

// n points round `pt` on a circle of SPREAD_M, the first to the right; one point is `pt` itself.
function spread([x, y], n) {
  if (n === 1) return [mmPt([x, y])];
  return Array.from({ length: n }, (_, i) => mmPt([x + SPREAD_M * Math.cos((2 * Math.PI * i) / n),
    y + SPREAD_M * Math.sin((2 * Math.PI * i) / n)]));
}

const pointOf = (c, [x, y], placed) => (c.kind === "device"
  ? { device_id: c.key, x, y, placed }
  : { entity_id: c.key, x, y, placed });
const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

// The room's name and floor area are drawn at its centroid; sensors put there would cover them.
function underLabels(polygon) {
  const [x, y] = centroid(polygon);
  const ys = polygon.map((p) => p[1]);
  return Math.max(...ys) - Math.min(...ys) >= TALL_M ? [x, y + BELOW_M] : [x, y];
}

export function autoPlace(doc, hass, floorId) {
  const floor = doc.floors[floorIndex(doc, floorId)];
  if (!floor) return doc;
  const placed = new Set(doc.floors.flatMap((f) => f.points.map(keyOf)));
  const perRoom = new Map();
  for (const c of candidates(hass)) {
    if (placed.has(c.key)) continue;
    const room = floor.rooms.find((r) => r.area_id === c.area_id);
    if (!room) continue;
    if (!perRoom.has(room)) perRoom.set(room, []);
    perRoom.get(room).push(c);
  }
  const added = [];
  for (const [room, cs] of perRoom) {
    const sorted = [...cs].sort(byKey);
    const at = spread(underLabels(room.polygon), sorted.length);
    sorted.forEach((c, i) => added.push(pointOf(c, at[i], false)));
  }
  if (!added.length) return doc;
  return editFloor(doc, floorId, (f) => ({ ...f, points: [...f.points, ...added] }));
}

export function tray(doc, hass) {
  const placed = new Set(doc.floors.flatMap((f) => f.points.map(keyOf)));
  return candidates(hass).filter((c) => !placed.has(c.key));
}

export function candidateName(hass, c) {
  if (c.kind === "device") {
    const dev = hass.devices?.[c.key];
    return dev?.name_by_user || dev?.name || c.key;
  }
  return hass.states?.[c.key]?.attributes?.friendly_name || c.key;
}

// Which room a candidate belongs in, for grouping the tray: its area, else for a plant the room the
// plants component gives it (domosenso_room, or per language domosenso_rooms), else null.
export function roomHint(hass, candidate) {
  if (candidate.area_id) {
    return { key: candidate.area_id, name: hass.areas?.[candidate.area_id]?.name || candidate.area_id };
  }
  for (const id of candidate.entities) {
    if (!id.startsWith("plant.")) continue;
    const attrs = hass.states?.[id]?.attributes || {};
    const text = attrs.domosenso_rooms?.[language(hass)] || attrs.domosenso_room;
    if (text) return { key: `label:${text}`, name: String(text) };
  }
  return null;
}

// The tray as groups by room hint, by name; the group without a room ("none", name null) last.
export function trayGroups(doc, hass) {
  const groups = new Map();
  for (const c of tray(doc, hass)) {
    const hint = roomHint(hass, c) ?? { key: "none", name: null };
    if (!groups.has(hint.key)) groups.set(hint.key, { ...hint, items: [] });
    groups.get(hint.key).items.push(c);
  }
  const names = (a, b) => a.localeCompare(b, language(hass));
  // A plant's room label naming an area of the tray ("living room" for Living room) joins that area.
  const areas = [...groups.values()].filter((g) => g.name !== null && !g.key.startsWith("label:"));
  for (const [key, g] of groups) {
    const area = key.startsWith("label:")
      && areas.find((a) => a.name.localeCompare(g.name, language(hass), { sensitivity: "base" }) === 0);
    if (!area) continue;
    area.items.push(...g.items);
    groups.delete(key);
  }
  for (const g of groups.values()) {
    g.items.sort((a, b) => names(candidateName(hass, a), candidateName(hass, b)) || byKey(a, b));
  }
  return [...groups.values()].sort((a, b) => (a.name === null) - (b.name === null)
    || (a.name !== null && names(a.name, b.name)));
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
  const point = pointOf(candidate, [x, y], true);
  return editFloor(doc, floorId, (floor) => ({ ...floor, points: [...floor.points, point] }));
}

// A tray group dropped on the plan: rough positions round the drop point, fine-tuned one by one.
export function addPoints(doc, floorId, cands, pt) {
  const onPlan = new Set(doc.floors.flatMap((f) => f.points.map(keyOf)));
  if (!cands.length || cands.some((c) => onPlan.has(c.key))) return null;
  const sorted = [...cands].sort(byKey);
  const at = spread(pt, sorted.length);
  const points = sorted.map((c, i) => pointOf(c, at[i], false));
  return editFloor(doc, floorId, (floor) => ({ ...floor, points: [...floor.points, ...points] }));
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
