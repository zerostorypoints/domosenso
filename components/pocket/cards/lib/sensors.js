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
//       diagnostic and configuration entities left out, and those of a disabled device
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

// A device's category from all of its usable entities (wherever they stand), once per call.
function deviceCategory(hass, deviceId, entryDomains, cache) {
  if (cache.has(deviceId)) return cache.get(deviceId);
  const device = hass.devices?.[deviceId];
  const own = Object.values(hass.entities || {})
    .filter((reg) => reg.device_id === deviceId && usable(hass, reg.entity_id, reg)).map((reg) => reg.entity_id);
  const hub = Object.values(hass.devices || {}).some((d) => d.via_device_id === deviceId && !d.disabled_by
    && d.entry_type !== "service");
  const id = own.length ? rolesOf(scanForm(hass, own, device, hub, entryDomains))[0].id : FALLBACK.id;
  cache.set(deviceId, id);
  return id;
}

function nameOf(hass, id) {
  const reg = hass.entities?.[id];
  return hass.states?.[id]?.attributes?.friendly_name || reg?.name || reg?.original_name || id;
}

export function areaSensors(hass, areaId, entryDomains = {}) {
  if (!areaId || !hass?.entities) return [];
  const cache = new Map();
  const groups = new Map();
  for (const reg of Object.values(hass.entities)) {
    const id = reg.entity_id;
    if (!id || !DOMAINS.includes(id.split(".")[0]) || !shown(reg) || !hass.states?.[id]) continue;
    if (entityArea(hass, reg) !== areaId) continue;
    const device = reg.device_id ? hass.devices?.[reg.device_id] : null;
    const category = device ? deviceCategory(hass, reg.device_id, entryDomains, cache)
      : rolesOf(scanForm(hass, [id], null, false, entryDomains))[0].id;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(id);
  }
  const lang = hass.locale?.language || hass.language;
  return CATEGORIES.filter((c) => groups.has(c.id)).map((c) => ({
    category: c.id, name: categoryName(c, lang), colour: colourOf(categoryById(c.id)),
    entities: groups.get(c.id).sort((a, b) => nameOf(hass, a).localeCompare(nameOf(hass, b)) || (a < b ? -1 : 1)),
  }));
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
