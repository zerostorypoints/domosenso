// An area's sensors grouped by the catalog's device categories, found the way the floor plan finds
// what stands in a room (no mechanism of the pocket's own): Home Assistant's registries give every
// sensor and binary_sensor whose area is the area (the entity's own area_id, else its device's), and
// each one's device is put in a category by the floor plan's rules (lib/categories.js and
// categories.json are copies of components/floorplan/cards/lib/: the same file, held equal by a
// test and by tools/category_index.py). Plain ES module: no DOM.
//
//   haAreaOf(config, area) -> area_id | null   the HA area a pocket area reads: a room's `area` (its
//       id when the home names none), the Outside's `outside.area`
//   areaSensors(hass, areaId, entryDomains?) -> [{category, name, colour, entities: [id]}]
//       the categories in the catalog's order, each with its entities by name; hidden, disabled,
//       diagnostic and configuration entities left out, and those of a disabled device; the same
//       array again while nothing it reads from the registries changed (registryIndex below)
//   registryIndex(hass) -> {byDevice, hubs, byArea, ...} | null   the registries indexed once per
//       hass.entities and hass.devices object (the Power page reads its meters through it too)
//   sensorValue(hass, id, t) -> text            the state as Home Assistant words it
//   isNumeric(hass, id) -> boolean              a sensor with a number (it has a trend to show)
//   shownEntity(reg) -> boolean                 a registry entry the pages list (the rules above)
//   entityArea(hass, reg) -> area_id | null | undefined   the entity's area, else its device's;
//       undefined for a disabled device's (the Power and Plants pages find theirs the same way)
//   loadEntryDomains(hass) -> Promise<{entry id: domain}>   config_entries/get, asked once per page
//       load: a device's integrations, as the floor plan reads them; {} when the call fails
//
// The scan form (SPEC-010) and which entities count for it are the floor plan's own functions:
// lib/shared.js is a verbatim copy of components/floorplan/cards/lib/shared.js (written and checked
// by tools/category_index.py, like categories.js and categories.json).

import { CATEGORIES, FALLBACK, categoryById, categoryName, colourOf, rolesOf } from "./categories.js";
import { scanForm, usable } from "./shared.js";

const DOMAINS = ["sensor", "binary_sensor"];
const GONE = new Set(["unavailable", "unknown"]);

export function haAreaOf(config, area) {
  if (!area) return null;
  return (area.outside ? config?.outside?.area : area.area ?? area.id) || null;
}

// A registry entry a page lists: not hidden, not disabled, not diagnostic or configuration.
export const shownEntity = (reg) => reg && !reg.hidden && !reg.hidden_by && !reg.disabled_by && !reg.entity_category;
const shown = shownEntity;

// The HA area an entity stands in, as the floor plan reads it: its own area_id, else its
// device's; null for neither. A disabled device's entities stand nowhere (undefined).
export function entityArea(hass, reg) {
  const device = reg?.device_id ? hass?.devices?.[reg.device_id] : null;
  if (device?.disabled_by) return undefined;
  return reg?.area_id || device?.area_id || null;
}

// The registries indexed once per pair of hass.entities and hass.devices (Home Assistant replaces
// either object when it changes, never edits it in place): each device's entities, the devices
// other devices connect through, and the listed sensors of every area. Per hass update the pages
// then look up what they need instead of scanning every entity and device again.
const indexes = new WeakMap();   // hass.entities -> {devices, byDevice, hubs, byArea, areas}

export function registryIndex(hass) {
  const entities = hass?.entities;
  if (!entities) return null;
  const hit = indexes.get(entities);
  if (hit && hit.devices === hass.devices) return hit;
  const byDevice = new Map();
  const byArea = new Map();
  for (const reg of Object.values(entities)) {
    if (reg.device_id) {
      if (!byDevice.has(reg.device_id)) byDevice.set(reg.device_id, []);
      byDevice.get(reg.device_id).push(reg);
    }
    const id = reg.entity_id;
    if (!id || !DOMAINS.includes(id.split(".")[0]) || !shown(reg)) continue;
    const areaId = entityArea(hass, reg);
    if (!areaId) continue;
    if (!byArea.has(areaId)) byArea.set(areaId, []);
    byArea.get(areaId).push(reg);
  }
  const hubs = new Set();
  for (const d of Object.values(hass.devices || {})) {
    if (d.via_device_id && !d.disabled_by && d.entry_type !== "service") hubs.add(d.via_device_id);
  }
  const index = { devices: hass.devices, byDevice, hubs, byArea, areas: new Map() };
  indexes.set(entities, index);
  return index;
}

// A device's category from all of its usable entities (wherever they stand), once per call.
function deviceCategory(hass, index, deviceId, entryDomains, cache) {
  if (cache.has(deviceId)) return cache.get(deviceId);
  const device = hass.devices?.[deviceId];
  const own = (index.byDevice.get(deviceId) ?? [])
    .filter((reg) => usable(hass, reg.entity_id, reg)).map((reg) => reg.entity_id);
  const id = own.length ? rolesOf(scanForm(hass, own, device, index.hubs.has(deviceId), entryDomains))[0].id : FALLBACK.id;
  cache.set(deviceId, id);
  return id;
}

function nameOf(hass, id) {
  const reg = hass.entities?.[id];
  return hass.states?.[id]?.attributes?.friendly_name || reg?.name || reg?.original_name || id;
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// The groups are kept per area until the registries, the config entries' domains, the language or
// the area's entities with a state change: a hass update with none of these changed returns the
// same array without grouping again (a sensor renamed alone keeps its place until then).
const NO_DOMAINS = Object.freeze({});   // one object, so a call without domains finds its cache

export function areaSensors(hass, areaId, entryDomains = NO_DOMAINS) {
  if (!areaId || !hass?.entities) return [];
  const index = registryIndex(hass);
  const lang = hass.locale?.language || hass.language;
  const regs = (index.byArea.get(areaId) ?? []).filter((reg) => hass.states?.[reg.entity_id]);
  const ids = regs.map((reg) => reg.entity_id);
  const hit = index.areas.get(areaId);
  if (hit && hit.entryDomains === entryDomains && hit.lang === lang && sameList(hit.ids, ids)) return hit.groups;
  const cache = new Map();
  const groups = new Map();
  for (const reg of regs) {
    const id = reg.entity_id;
    const device = reg.device_id ? hass.devices?.[reg.device_id] : null;
    const category = device ? deviceCategory(hass, index, reg.device_id, entryDomains, cache)
      : rolesOf(scanForm(hass, [id], null, false, entryDomains))[0].id;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(id);
  }
  const result = CATEGORIES.filter((c) => groups.has(c.id)).map((c) => ({
    category: c.id, name: categoryName(c, lang), colour: colourOf(categoryById(c.id)),
    entities: groups.get(c.id).sort((a, b) => nameOf(hass, a).localeCompare(nameOf(hass, b)) || (a < b ? -1 : 1)),
  }));
  index.areas.set(areaId, { entryDomains, lang, ids, groups: result });
  return result;
}

export function sensorValue(hass, id, t) {
  const state = hass?.states?.[id];
  if (!state || GONE.has(state.state)) return t("card.pocket.format.none");
  if (typeof hass.formatEntityState === "function") return hass.formatEntityState(state);
  if (id.startsWith("binary_sensor.")) return t(`card.pocket.sensors.state.${state.state === "on" ? "on" : "off"}`);
  const unit = state.attributes?.unit_of_measurement;
  return unit ? t("card.pocket.trend.value", { value: state.state, unit }) : state.state;
}

export function isNumeric(hass, id) {
  if (!id.startsWith("sensor.")) return false;
  const state = hass?.states?.[id];
  if (!state) return false;
  if (state.attributes?.state_class) return true;
  return state.state !== "" && Number.isFinite(Number(state.state));
}

let entries = null;
export function loadEntryDomains(hass) {
  if (entries) return entries;
  if (typeof hass?.callWS !== "function") return Promise.resolve({});
  entries = hass.callWS({ type: "config_entries/get" }).then(
    (list) => Object.fromEntries((Array.isArray(list) ? list : []).map((e) => [e.entry_id, e.domain])),
    () => {
      entries = null;     // asked again by the next page
      return {};
    });
  return entries;
}

export function clearEntryDomains() {
  entries = null;
}
