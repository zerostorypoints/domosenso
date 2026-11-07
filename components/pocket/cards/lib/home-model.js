// The home's areas as Pocket shows them (SPEC-038): Home Assistant's area registry, each area with
// its type and its main sensors, resolved from four sources in this order (§3.5): what was set in
// Pocket (the home store, lib/home-store.js; for climate Home Assistant's own area fields, which
// Pocket writes), Home Assistant's area setting (climate: the area's Related sensors), the home
// inputs' defaults (the card config's rooms and outside), and the only candidate (lib/kinds.js), which
// an administrator's Pocket records once. Plain ES module: no DOM.
//
//   homeModel(hass, config, store, extra?) -> {rooms, thresholds, pending}
//     rooms: [room] in floor order (floor level, then Home Assistant's order; areas on no floor last):
//       {id, area, name, floor, icon, type: "inside"|"outside"|"none", typeSource,
//        checked: boolean, checkedSource (whether the area is in the checks: on unless set off),
//        climate?: {temperature, humidity?}, air?: {score?, co2?, pm2_5?, voc?, nox?},
//        indicators: {<entity kind>: entity id},
//        main: {<kind>: {source, choice, name, readings, candidates}},
//        lights?, media?, scenes?, covers?, contacts?, locks?}
//       the shape the pages always read (room.climate, room.air, room.lights...), so a page is
//       unchanged by where a value came from. source: "pocket" | "home-assistant" | "inputs" |
//       "auto" | null; choice: a device id, "entity:<id>", an entity id (entity kinds) or null.
//     thresholds: the card config's thresholds with `rooms` keyed by HA area id (the inputs key them
//       by room id)
//     pending: [{area, kind, choice, readings}] the one-time automatic choices not recorded yet
//   extra: {areaFields: {<area id>: {temperature_entity_id, humidity_entity_id}}} the area registry's
//     fields when hass.areas does not carry them (an older frontend)
//   SOURCES: the sources' keys, in the order of precedence
//
// Lights, scenes: a room's defaults when the inputs name them, else what Home Assistant places in
// the area (a light group stands for its members). Media, covers, contacts, locks: the defaults; the
// pages find the rest by area themselves (lib/media.js, lib/controls.js).

import { KINDS, candidatesOf, deviceName, entityName } from "./kinds.js";
import { EMPTY, TYPES } from "./home-store.js";

// The id an inputs' `outside` without an area takes when Home Assistant has no areas (the room id
// `outside` is reserved for it in the home inputs).
const OUTSIDE_ID = "outside";

export const SOURCES = Object.freeze(["pocket", "home-assistant", "inputs", "auto", "default"]);

const shown = (reg) => reg && !reg.hidden && !reg.hidden_by && !reg.disabled_by && !reg.entity_category;

function areaOfEntity(hass, reg) {
  const device = reg?.device_id ? hass?.devices?.[reg.device_id] : null;
  if (device?.disabled_by) return null;
  return reg?.area_id || device?.area_id || null;
}

// HA's areas in floor order. Without any (a frontend that does not give hass.areas, a Home Assistant
// with no areas yet, a test), the home inputs' rooms stand in for them, by their room id and name, as
// Pocket showed them before, and an `outside` with sensors but no area is an Outside area of its own
// (SPEC-038 §3.13, a built-in rule).
export function orderedAreas(hass, config) {
  if (!hass?.areas || !Object.keys(hass.areas).length) {
    const rooms = (Array.isArray(config?.rooms) ? config.rooms : []).filter((room) => room?.id)
      .map((room) => ({ area_id: room.id, name: typeof room.name === "string" ? room.name : room.name?.en ?? room.id,
        floor_id: null, fallback: room }));
    const outside = config?.outside;
    if (outside && !outside.area && (outside.temperature || outside.humidity)
      && !rooms.some((r) => r.area_id === OUTSIDE_ID)) {
      const climate = {};
      if (outside.temperature) climate.temperature = outside.temperature;
      if (outside.humidity) climate.humidity = outside.humidity;
      rooms.push({ area_id: OUTSIDE_ID, name: "Outside", floor_id: null,
        fallback: { id: OUTSIDE_ID, type: "outside", climate, fromOutside: true } });
    }
    return rooms;
  }
  const areas = Object.values(hass.areas);
  const floors = hass?.floors ?? {};
  const levelOf = (area) => {
    const floor = area.floor_id ? floors[area.floor_id] : null;
    if (!floor) return Infinity;
    return typeof floor.level === "number" ? floor.level : Number.MAX_SAFE_INTEGER;
  };
  // Array.prototype.sort is stable: within a floor, Home Assistant's order stays.
  return areas.map((area, i) => ({ area, i, level: levelOf(area) }))
    .sort((a, b) => a.level - b.level || a.i - b.i).map(({ area }) => area);
}

// The home inputs' defaults per HA area: a room's (its `area`, else its id), and `outside` for its area.
function defaultsByArea(config) {
  const out = new Map();
  for (const room of Array.isArray(config?.rooms) ? config.rooms : []) {
    const area = room?.area ?? room?.id;
    if (area) out.set(area, { ...room });
  }
  const outside = config?.outside;
  if (outside?.area) {
    const room = out.get(outside.area) ?? { id: outside.area, area: outside.area };
    room.type ??= "outside";
    if (!room.climate && outside.temperature) {
      room.climate = { temperature: outside.temperature };
      if (outside.humidity) room.climate.humidity = outside.humidity;
    }
    room.fromOutside = true;
    out.set(outside.area, room);
  }
  return out;
}

function deviceOfEntity(hass, id) {
  return hass?.entities?.[id]?.device_id ?? null;
}

// The entities of `domain` HA places in the area, shown ones, in registry order.
function inArea(hass, domain, areaId) {
  return Object.values(hass?.entities ?? {})
    .filter((reg) => reg.entity_id?.startsWith(`${domain}.`) && shown(reg) && areaOfEntity(hass, reg) === areaId)
    .map((reg) => reg.entity_id);
}

// A light group stands for its members: a member of another light of the list is dropped.
function withoutMembers(hass, lights) {
  const members = new Set();
  for (const id of lights) {
    const list = hass?.states?.[id]?.attributes?.entity_id;
    if (Array.isArray(list)) for (const member of list) if (member !== id) members.add(member);
  }
  return lights.filter((id) => !members.has(id));
}

function climateOf(hass, areaId, haArea, extra, defaults, stored, picked, candidates) {
  const fields = { ...(extra?.areaFields?.[areaId] ?? {}), ...pick(haArea, ["temperature_entity_id", "humidity_entity_id"]) };
  const named = (temperature, humidity) => {
    const readings = {};
    if (temperature) readings.temperature = temperature;
    if (humidity) readings.humidity = humidity;
    const device = deviceOfEntity(hass, temperature ?? humidity);
    return { readings, choice: device ?? (temperature ? `entity:${temperature}` : null),
      name: device ? deviceName(hass, device) : entityName(hass, temperature ?? humidity) };
  };
  if (stored === "none") return { source: "pocket", choice: null, readings: {}, candidates };
  if (fields.temperature_entity_id || fields.humidity_entity_id) {
    return { source: "home-assistant", ...named(fields.temperature_entity_id, fields.humidity_entity_id), candidates };
  }
  if (defaults?.climate?.temperature || defaults?.climate?.humidity) {
    return { source: "inputs", ...named(defaults.climate.temperature, defaults.climate.humidity), candidates };
  }
  if (picked) return { source: "pocket", choice: null, readings: {}, candidates };
  if (candidates.length === 1) {
    const only = candidates[0];
    return { source: "auto", choice: only.id, name: only.name, readings: only.readings, candidates, pending: true };
  }
  return { source: null, choice: null, readings: {}, candidates };
}

function deviceKindOf(hass, kind, areaId, defaults, storedArea, picked, candidates, auto) {
  const stored = storedArea?.[kind.id];
  const overrides = storedArea?.[`${kind.id}_readings`] ?? {};
  const fromCandidate = (candidate, source) => {
    const readings = { ...candidate.readings };
    // The defaults' readings of the same device: what HA does not classify (§3.4).
    for (const [reading, entity] of Object.entries(defaults?.[kind.id] ?? {})) {
      if (!readings[reading] && deviceOfEntity(hass, entity) && deviceOfEntity(hass, entity) === candidate.device) readings[reading] = entity;
    }
    for (const [reading, entity] of Object.entries(overrides)) if (entity) readings[reading] = entity;
    return { source, choice: candidate.id, name: candidate.name, readings, candidates };
  };
  // A value recorded by the one-time pick, not changed since, is still "found automatically".
  const source = auto ? "auto" : "pocket";
  if (stored === "none") return { source: "pocket", choice: null, readings: {}, candidates };
  if (typeof stored === "string" && stored) {
    const candidate = candidates.find((c) => c.id === stored);
    if (candidate) return fromCandidate(candidate, source);
    // Chosen once, no longer in the area: kept as the choice, with no readings.
    return { source, choice: stored, name: deviceName(hass, stored), readings: {}, candidates, missing: true };
  }
  const given = defaults?.[kind.id];
  if (given && Object.values(given).some(Boolean)) {
    const first = Object.values(given).find(Boolean);
    const device = deviceOfEntity(hass, first);
    return { source: "inputs", choice: device ?? `entity:${first}`,
      name: device ? deviceName(hass, device) : entityName(hass, first), readings: { ...given, ...overrides }, candidates };
  }
  if (picked) return { source: "pocket", choice: null, readings: {}, candidates };
  if (candidates.length === 1) {
    return { ...fromCandidate(candidates[0], "auto"), pending: true };
  }
  return { source: null, choice: null, readings: {}, candidates };
}

function entityKindOf(hass, kind, defaults, storedArea, picked, candidates, auto) {
  const stored = storedArea?.[kind.id];
  const one = (id, source) => ({ source, choice: id, name: entityName(hass, id), readings: { [kind.id]: id }, candidates });
  if (stored === "none") return { source: "pocket", choice: null, readings: {}, candidates };
  if (typeof stored === "string" && stored) return one(stored, auto ? "auto" : "pocket");
  if (typeof defaults?.[kind.id] === "string") return one(defaults[kind.id], "inputs");
  if (picked) return { source: "pocket", choice: null, readings: {}, candidates };
  if (candidates.length === 1) return { ...one(candidates[0].id, "auto"), pending: true };
  return { source: null, choice: null, readings: {}, candidates };
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) if (obj?.[key] !== undefined && obj[key] !== null) out[key] = obj[key];
  return out;
}

export function homeModel(hass, config, store = EMPTY, extra = {}) {
  const defaults = defaultsByArea(config);
  const rooms = [];
  const pending = [];
  for (const haArea of orderedAreas(hass, config)) {
    const id = haArea.area_id;
    const given = haArea.fallback ?? defaults.get(id);
    const storedArea = store?.areas?.[id] ?? {};
    const picked = new Set(store?.picked?.[id] ?? []);
    const auto = new Set(store?.auto?.[id] ?? []);
    const room = { id, area: id, name: haArea.name || given?.name || id, floor: haArea.floor_id ?? null,
      icon: haArea.icon ?? null, indicators: {}, main: {} };
    // Every area is Inside until someone says otherwise; Not assigned ("none") hides it from Pocket's
    // views (SPEC-038 §3.2), Settings → Areas still lists it.
    if (storedArea.type) { room.type = storedArea.type; room.typeSource = "pocket"; }
    else if (TYPES.includes(given?.type)) { room.type = given.type; room.typeSource = "inputs"; }
    else { room.type = "inside"; room.typeSource = "default"; }
    // Every area is in the checks unless the home leaves it out (SPEC-038 §3.2); its type never does.
    if (typeof storedArea.checked === "boolean") { room.checked = storedArea.checked; room.checkedSource = "pocket"; }
    else if (typeof given?.checked === "boolean") { room.checked = given.checked; room.checkedSource = "inputs"; }
    else { room.checked = true; room.checkedSource = "default"; }

    for (const kind of KINDS) {
      const candidates = candidatesOf(hass, kind, id);
      let main;
      if (kind.id === "climate") main = climateOf(hass, id, haArea, extra, given, storedArea.climate, picked.has("climate"), candidates);
      else if (kind.pick === "device") main = deviceKindOf(hass, kind, id, given, storedArea, picked.has(kind.id), candidates, auto.has(kind.id));
      else main = entityKindOf(hass, kind, given, storedArea, picked.has(kind.id), candidates, auto.has(kind.id));
      room.main[kind.id] = main;
      if (main.pending) pending.push({ area: id, kind: kind.id, choice: main.choice, readings: main.readings });
      const readings = Object.fromEntries(Object.entries(main.readings ?? {}).filter(([, entity]) => entity));
      if (kind.id === "climate" || kind.id === "air") {
        if (Object.keys(readings).length) room[kind.id] = readings;
      } else if (readings[kind.id]) {
        room.indicators[kind.id] = readings[kind.id];
      }
    }

    const lights = given?.lights ?? withoutMembers(hass, inArea(hass, "light", id));
    if ([lights].flat().length) room.lights = lights;
    const scenes = given?.scenes ?? inArea(hass, "scene", id);
    if (scenes.length) room.scenes = scenes;
    for (const field of ["media", "covers", "contacts", "locks"]) if (given?.[field] !== undefined) room[field] = given[field];
    rooms.push(room);
  }

  // Comfort ranges: the inputs key them by room id; the areas are keyed by HA area id.
  const thresholds = { ...(config?.thresholds ?? {}) };
  const byRoom = config?.thresholds?.rooms ?? {};
  const rekeyed = {};
  const fallback = !hass?.areas || !Object.keys(hass.areas).length;
  for (const [areaId, room] of defaults) {
    const ids = byRoom[room.id] ?? (room.fromOutside ? config?.thresholds?.outside : undefined);
    if (ids) rekeyed[fallback ? room.id : areaId] = ids;
  }
  if (fallback && config?.outside && !config.outside.area && config?.thresholds?.outside) rekeyed[OUTSIDE_ID] = config.thresholds.outside;
  thresholds.rooms = rekeyed;
  return { rooms, thresholds, pending };
}

// The words for a source (translation keys under card.pocket.areas.source).
export const sourceKey = (source) => (source ? `card.pocket.areas.source.${source.replace("-", "_")}` : "card.pocket.areas.source.none");
