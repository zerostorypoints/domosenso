// The plan model of the floor plan card: pure functions over the plan document and Home Assistant's
// frontend registries. No DOM. Every edit returns a new document, or null when it is refused, so the
// card can ignore a refused gesture without checking state. Shapes mirror tools/domosenso_cli/floorplan_doc.py.

import { pointInPolygon, centroid, interiorPoint, splitPolygon, joinPolygons } from "./geometry.js";
import { language } from "./i18n.js";
import { categoryOf, categoryById, CATEGORIES } from "./categories.js";

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
// Every device or entity a point stands for: its own, and the devices joined to it as the same
// hardware (`also`, Amendment 5 stage 2).
export const keysOf = (point) => [keyOf(point), ...(point.also || [])];
const onPlan = (doc) => new Set(doc.floors.flatMap((f) => f.points.flatMap(keysOf)));
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

// Config entry id -> integration domain (`config_entries/get`, which needs no admin): a device's
// integrations are the domains of its config entries, as SPEC-010's scan reads them. One Home
// Assistant per page, so the card sets it once for all its instances; until then the platforms of a
// device's entities stand in.
let entryDomains = {};
export function setEntryDomains(map) {
  entryDomains = map || {};
}

// An entity that may count for a device's category: not computed from others (Amendment 3), not a
// diagnostic or configuration entity, not a group (an entity_id list, e.g. a Hue room or zone).
function usable(hass, id, reg) {
  if (id.startsWith("plant.")) return true;
  if (DERIVED_PLATFORMS.includes(reg.platform) || reg.entity_category || reg.hidden) return false;
  if (id.startsWith("group.")) return false;
  return !Array.isArray(hass.states?.[id]?.attributes?.entity_id);
}

// SPEC-010's scan form of a device or of an entity without one (categories.js).
function scanForm(hass, ids, device, isHub) {
  const platforms = ids.map((id) => (id.startsWith("plant.") ? "plant" : hass.entities?.[id]?.platform)).filter(Boolean);
  const fromEntries = (device?.config_entries || []).map((e) => entryDomains[e]).filter(Boolean);
  return {
    integrations: [...new Set([...fromEntries, ...platforms])],
    manufacturer: device?.manufacturer ?? null, model: device?.model ?? null, model_id: device?.model_id ?? null,
    entity_domains: [...new Set(ids.map((id) => id.split(".")[0]))],
    device_classes: [...new Set(ids.map((id) => hass.states?.[id]?.attributes?.device_class).filter(Boolean))],
    entity_names: ids.map((id) => hass.entities?.[id]?.original_name).filter(Boolean),
    is_hub: isHub,
  };
}

// What can be put on the plan (SPEC-028 Amendment 5): every enabled hardware device with a usable
// entity whose category is placeable, and an entity without a device when it is a plant or a point
// class. `entities` are the readings a marker shows (point classes and plants); a device whose
// entities a plant names as its `sensors` joins that plant instead of being a point of its own.
export function candidates(hass) {
  const devices = hass.devices || {};
  const plantSensors = new Set(Object.keys(hass.states || {}).filter((id) => id.startsWith("plant."))
    .flatMap((id) => Object.values(hass.states[id].attributes?.sensors || {})));
  const children = new Map();
  for (const d of Object.values(devices)) {
    if (d.via_device_id && !d.disabled_by && d.entry_type !== "service") {
      children.set(d.via_device_id, (children.get(d.via_device_id) || 0) + 1);
    }
  }
  const byDevice = new Map();
  const loose = [];
  const ids = new Set([...Object.keys(hass.entities || {}), ...Object.keys(hass.states || {})]);
  for (const id of [...ids].sort()) {
    const reg = hass.entities?.[id] || {};
    if (!usable(hass, id, reg)) continue;
    if (reg.device_id) {
      if (!byDevice.has(reg.device_id)) byDevice.set(reg.device_id, []);
      byDevice.get(reg.device_id).push(id);
    } else if (isPointEntity(hass, id)) loose.push(id);
  }
  const out = [];
  for (const [key, own] of byDevice) {
    const device = devices[key];
    if (!device || device.disabled_by || device.entry_type === "service") continue;
    if (own.some((id) => plantSensors.has(id))) continue;
    const cat = categoryOf(scanForm(hass, own, device, (children.get(key) || 0) > 0));
    if (!categoryById(cat.id)?.placeable) continue;
    // The entity's own area wins over its device's.
    const area = own.map((id) => hass.entities?.[id]?.area_id).find(Boolean) ?? device.area_id ?? null;
    out.push({ key, kind: "device", area_id: area, entities: own.filter((id) => isPointEntity(hass, id)),
      category: cat.id, marker: cat.marker });
  }
  for (const id of loose) {
    const cat = categoryOf(scanForm(hass, [id], null, false));
    if (!categoryById(cat.id)?.placeable) continue;
    out.push({ key: id, kind: "entity", area_id: hass.entities?.[id]?.area_id ?? plantArea(hass, id), entities: [id],
      category: cat.id, marker: cat.marker });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// The category a point shows: its override, else what its device or entity is (a point whose
// device is gone keeps the fallback).
// `byKey`: candidates by key, when the caller has them (a draw asks for every point).
export function pointCategory(hass, point, byKey = null) {
  const override = point.category && categoryById(point.category);
  const key = keyOf(point);
  const c = byKey ? byKey.get(key) : candidates(hass).find((x) => x.key === key);
  if (override) return { id: override.id, marker: c && c.category === override.id ? c.marker : override.marker };
  if (c) return { id: c.category, marker: c.marker };
  const fallback = CATEGORIES.find((x) => x.fallback);
  return { id: fallback.id, marker: fallback.marker };
}

// A comparable form of a room name: no case, no spaces, no diacritics ("Hobby Raum" = "Hobbyraum").
const roomKey = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toLowerCase();

// The area a plant without one stands in: the HA area named like its room in any language the plants
// component gives (domosenso_room, domosenso_rooms), so the room is entered once, as the HA area.
function plantArea(hass, entityId) {
  if (!entityId.startsWith("plant.")) return null;
  const attrs = hass.states?.[entityId]?.attributes || {};
  const names = new Set([attrs.domosenso_room, ...Object.values(attrs.domosenso_rooms || {})]
    .filter(Boolean).map(roomKey));
  if (!names.size) return null;
  return Object.values(hass.areas || {}).find((a) => names.has(roomKey(a.name)))?.area_id ?? null;
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
// In an L-shaped or other concave room the shifted point, or the centroid itself, can lie outside:
// then the centroid, else a point surely inside.
function underLabels(polygon) {
  const [x, y] = centroid(polygon);
  const ys = polygon.map((p) => p[1]);
  const below = [x, y + BELOW_M];
  if (Math.max(...ys) - Math.min(...ys) >= TALL_M && pointInPolygon(below, polygon)) return below;
  return pointInPolygon([x, y], polygon) ? [x, y] : interiorPoint(polygon);
}

export function autoPlace(doc, hass, floorId) {
  const floor = doc.floors[floorIndex(doc, floorId)];
  if (!floor) return doc;
  const placed = onPlan(doc);
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
    const centre = underLabels(room.polygon);
    const at = spread(centre, sorted.length).map((p) => (pointInPolygon(p, room.polygon) ? p : mmPt(centre)));
    sorted.forEach((c, i) => added.push(pointOf(c, at[i], false)));
  }
  if (!added.length) return doc;
  return editFloor(doc, floorId, (f) => ({ ...f, points: [...f.points, ...added] }));
}

export function tray(doc, hass) {
  const placed = onPlan(doc);
  return candidates(hass).filter((c) => !placed.has(c.key));
}

export function candidateName(hass, c) {
  if (c.kind === "device") {
    const dev = hass.devices?.[c.key];
    return dev?.name_by_user || dev?.name || c.key;
  }
  return hass.states?.[c.key]?.attributes?.friendly_name || c.key;
}

// A point's name, as the tray named it before it was placed.
export function pointName(hass, point) {
  return candidateName(hass, point.device_id ? { kind: "device", key: point.device_id } : { kind: "entity", key: point.entity_id });
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
  // Inside a room, by category (their order), then by name.
  const rank = (c) => categoryById(c.category)?.order ?? Infinity;
  for (const g of groups.values()) {
    g.items.sort((a, b) => rank(a) - rank(b) || names(candidateName(hass, a), candidateName(hass, b)) || byKey(a, b));
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
  if (onPlan(doc).has(candidate.key)) return null;
  const point = pointOf(candidate, [x, y], true);
  return editFloor(doc, floorId, (floor) => ({ ...floor, points: [...floor.points, point] }));
}

// A tray group dropped on the plan: rough positions round the drop point, fine-tuned one by one.
export function addPoints(doc, floorId, cands, pt) {
  const placed = onPlan(doc);
  if (!cands.length || cands.some((c) => placed.has(c.key))) return null;
  const sorted = [...cands].sort(byKey);
  const at = spread(pt, sorted.length);
  const points = sorted.map((c, i) => pointOf(c, at[i], false));
  return editFloor(doc, floorId, (floor) => ({ ...floor, points: [...floor.points, ...points] }));
}

// Join a device to a point as the same hardware (an amplifier its own integration, Cast and DLNA
// each list). Only a device, onto a device point, and only one not on the plan yet.
export function joinPoint(doc, floorId, key, candidate) {
  if (candidate.kind !== "device" || onPlan(doc).has(candidate.key)) return null;
  return editFloor(doc, floorId, (floor) => {
    const k = floor.points.findIndex((p) => keyOf(p) === key);
    if (k < 0 || !floor.points[k].device_id) return null;
    const point = { ...floor.points[k], also: [...(floor.points[k].also || []), candidate.key] };
    return { ...floor, points: floor.points.map((p, j) => (j === k ? point : p)) };
  });
}

// Take a joined device off a point again: it goes back to the tray.
export function separatePoint(doc, floorId, key, deviceId) {
  return editFloor(doc, floorId, (floor) => {
    const k = floor.points.findIndex((p) => keyOf(p) === key);
    if (k < 0 || !(floor.points[k].also || []).includes(deviceId)) return null;
    const { also, ...rest } = floor.points[k];
    const left = also.filter((id) => id !== deviceId);
    const point = left.length ? { ...rest, also: left } : rest;
    return { ...floor, points: floor.points.map((p, j) => (j === k ? point : p)) };
  });
}

// The registry's links between points on the plan: a device and the one it reaches Home Assistant
// through (via_device_id: a bulb and its bridge, a sensor and its hub), each point once per pair.
export function registryLinks(hass, points) {
  const pointOfKey = new Map(points.flatMap((p) => keysOf(p).map((k) => [k, keyOf(p)])));
  const seen = new Set();
  const links = [];
  for (const [key, from] of pointOfKey) {
    const to = pointOfKey.get(hass.devices?.[key]?.via_device_id);
    const pair = `${from}\n${to}`;
    if (!to || to === from || seen.has(pair)) continue;
    seen.add(pair);
    links.push({ from, to, kind: "via" });
  }
  return links;
}

// Override a point's category, or drop the override when `id` is what the point is anyway (`own`).
export function setPointCategory(doc, floorId, key, id, own) {
  return editFloor(doc, floorId, (floor) => {
    const k = floor.points.findIndex((p) => keyOf(p) === key);
    if (k < 0 || !categoryById(id)?.placeable) return null;
    const { category, ...rest } = floor.points[k];
    const point = id === own ? rest : { ...rest, category: id };
    return { ...floor, points: floor.points.map((p, j) => (j === k ? point : p)) };
  });
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
