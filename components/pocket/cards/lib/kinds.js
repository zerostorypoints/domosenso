// The kinds of main sensor an area can have (SPEC-038 §3.3), declared once in kinds.json (also read by
// `domosenso areas`): the one table the area settings sheet,
// Settings → Areas, the area model (lib/home-model.js) and the `set-up-areas` skill read. A new kind
// is a new row here and gets its picker, its row and its question without other code. Plain ES
// module: no DOM.
//
// A kind:
//   id        the key in the home store and in a room's defaults (`climate`, `air`, ...)
//   pick      "device": a device is chosen, its readings found by device class; "entity": one sensor
//   readings  [{id, classes, required?}]   for a device kind: the readings, each by its HA device
//             classes; `required`: a device is a candidate only with that reading (climate's
//             temperature); without a required one, any reading makes it a candidate (air)
//   classes   for an entity kind: the device classes a candidate has
//   ha        true: the choice is Home Assistant's own area field (climate: temperature_entity_id,
//             humidity_entity_id, the area's Related sensors), written there, not in the home store
//   fields    for `ha`: the HA area field of each reading
//
//   KINDS, kindOf(id)
//   candidatesOf(hass, kind, areaId) -> [{id, name, device?, readings: {reading: entity}}]
//       what can be the area's main sensor of that kind (SPEC-038 §3.3): sensors whose area is the
//       area (their own, else their device's), not hidden, disabled, diagnostic or configuration, of
//       the kind's device classes; a device kind groups them by device (a sensor with no device is a
//       candidate of its own, id "entity:<entity id>"). In the order the registry gives them.
//   unclassifiedOf(hass, deviceId) -> [entity id]   a device's measurement sensors with no
//       device class: what an unclassified reading (an air score, an index) is picked from (§3.4)

export const KINDS = Object.freeze(table.kinds.map((kind) => Object.freeze(kind)));

export const kindOf = (id) => KINDS.find((kind) => kind.id === id) ?? null;

import table from "./kinds.json" with { type: "json" };

const shown = (reg) => reg && !reg.hidden && !reg.hidden_by && !reg.disabled_by && !reg.entity_category;

function areaOf(hass, reg) {
  const device = reg?.device_id ? hass?.devices?.[reg.device_id] : null;
  if (device?.disabled_by) return null;
  return reg?.area_id || device?.area_id || null;
}

const classOf = (hass, id) => hass?.states?.[id]?.attributes?.device_class ?? null;

// The area's shown sensors, in registry order, once per hass.entities object and area.
const sensorCache = new WeakMap();
function sensorsIn(hass, areaId) {
  const entities = hass?.entities;
  if (!entities || !areaId) return [];
  let byArea = sensorCache.get(entities);
  if (!byArea || byArea.devices !== hass.devices) {
    byArea = { devices: hass.devices, map: new Map() };
    for (const reg of Object.values(entities)) {
      if (!reg?.entity_id?.startsWith("sensor.") || !shown(reg)) continue;
      const area = areaOf(hass, reg);
      if (!area) continue;
      if (!byArea.map.has(area)) byArea.map.set(area, []);
      byArea.map.get(area).push(reg);
    }
    sensorCache.set(entities, byArea);
  }
  return byArea.map.get(areaId) ?? [];
}

function deviceName(hass, deviceId) {
  const device = hass?.devices?.[deviceId];
  return device?.name_by_user || device?.name || deviceId;
}

function entityName(hass, id) {
  const reg = hass?.entities?.[id];
  return hass?.states?.[id]?.attributes?.friendly_name || reg?.name || reg?.original_name || id;
}

export function candidatesOf(hass, kind, areaId) {
  const sensors = sensorsIn(hass, areaId);
  if (kind.pick === "entity") {
    return sensors.filter((reg) => kind.classes.includes(classOf(hass, reg.entity_id)))
      .map((reg) => ({ id: reg.entity_id, name: entityName(hass, reg.entity_id), device: reg.device_id ?? null,
        readings: { [kind.id]: reg.entity_id } }));
  }
  const groups = new Map();
  for (const reg of sensors) {
    const cls = classOf(hass, reg.entity_id);
    const reading = kind.readings.find((r) => r.classes.includes(cls));
    if (!reading) continue;
    const key = reg.device_id ?? `entity:${reg.entity_id}`;
    if (!groups.has(key)) {
      groups.set(key, { id: key, device: reg.device_id ?? null,
        name: reg.device_id ? deviceName(hass, reg.device_id) : entityName(hass, reg.entity_id), readings: {} });
    }
    const group = groups.get(key);
    // The first sensor of a reading's class on the device stands for it (the registry's order).
    group.readings[reading.id] ??= reg.entity_id;
  }
  const required = kind.readings.filter((r) => r.required).map((r) => r.id);
  return [...groups.values()].filter((group) => required.every((id) => group.readings[id]));
}

// A device's measurement sensors without a device class, shown ones only.
export function unclassifiedOf(hass, deviceId) {
  if (!deviceId || !hass?.entities) return [];
  return Object.values(hass.entities)
    .filter((reg) => reg.device_id === deviceId && reg.entity_id?.startsWith("sensor.") && shown(reg)
      && !classOf(hass, reg.entity_id) && hass.states?.[reg.entity_id]?.attributes?.state_class === "measurement")
    .map((reg) => reg.entity_id);
}

export { deviceName, entityName };
