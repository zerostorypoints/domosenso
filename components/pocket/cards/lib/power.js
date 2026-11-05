// The Power page's meters, found the way an area's All sensors are (lib/sensors.js: Home
// Assistant's registries, the entity's area else its device's; no input names them): every sensor
// whose device class is one of CLASSES, grouped by HA area and then by device. Plain ES module: no
// DOM.
//
//   powerSensors(hass, config) -> [{area, areaId, devices: [{device, name, entities: [id]}]}]
//       area: the pocket area (lib/areas.js) whose HA area it is, else null (the page then names it
//       by hass.areas); areaId: the HA area, null for the entities in no area (last). The pocket's
//       areas first in their order, then the other HA areas by name, then no area. Devices by name,
//       an entity without a device in a group of its own (device null); entities by CLASSES order,
//       then by name. The same array again while nothing it reads changed (a hass update with
//       the same registries, config, areas and meters groups nothing).
//   classOf(hass, id) -> device class | undefined   the state's, else the registry's
//   watts(hass, id) -> number | null    a power sensor's value in W (W, kW, MW), null when not a number
//   powerNow(hass, groups) -> {watts, entities: [id]} | null   the home's power now: the sum of the
//       power sensors that measure separate loads (COUNTED below); null with no power sensor reading
//   entityName(hass, id, deviceName) -> text   the friendly name without the device's name in front
//
// COUNTED, the rule of the "Now" sum, kept simple and stated so a home can tell why a meter is not
// in it: only device class `power` in W / kW / MW; one sensor per device, its highest reading (a
// meter with a total and its channels or phases would otherwise count twice); a device connected
// through another device (via_device_id) that has a counted power sensor itself is left out (that
// one measures it already); an entity without a device counts on its own. Two meters in series that
// Home Assistant does not link (a mains meter and a plug behind it) are both counted: the registry
// cannot tell, and the page says the sum is of the meters it lists.

import { areasOf } from "./areas.js";
import { entityArea, haAreaOf, registryIndex, shownEntity } from "./sensors.js";

export const CLASSES = ["power", "apparent_power", "power_factor", "energy", "current", "voltage"];
const GONE = new Set(["unavailable", "unknown"]);
const FACTORS = { w: 1, kw: 1000, mw: 1e6 };

export function classOf(hass, id) {
  const reg = hass?.entities?.[id];
  return hass?.states?.[id]?.attributes?.device_class ?? reg?.device_class ?? reg?.original_device_class;
}

const nameOf = (hass, id) => {
  const reg = hass?.entities?.[id];
  return hass?.states?.[id]?.attributes?.friendly_name || reg?.name || reg?.original_name || id;
};
const deviceName = (device) => device?.name_by_user || device?.name || null;

export function entityName(hass, id, device) {
  const name = nameOf(hass, id);
  if (!device) return name;
  const prefix = `${device} `;
  const short = name.toLowerCase().startsWith(prefix.toLowerCase()) ? name.slice(prefix.length).trim() : name;
  return short || name;
}

const byName = (a, b) => (a ?? "").localeCompare(b ?? "");

// The listed sensors with an area (or none), once per registry index (lib/sensors.js); and the
// last grouping, kept while the registries, the config, hass.areas and the meters with a state and
// a class of CLASSES are the same, so a hass update does not group again.
const candidates = new WeakMap();   // registry index -> {regs, last}

export function powerSensors(hass, config) {
  const index = registryIndex(hass);
  if (!index) return [];
  let known = candidates.get(index);
  if (!known) {
    known = { regs: Object.values(hass.entities).filter((reg) => reg.entity_id?.startsWith("sensor.")
      && shownEntity(reg) && entityArea(hass, reg) !== undefined), last: null };
    candidates.set(index, known);
  }
  const regs = known.regs.filter((reg) => hass.states?.[reg.entity_id] && CLASSES.includes(classOf(hass, reg.entity_id)));
  const ids = regs.map((reg) => reg.entity_id);
  const last = known.last;
  if (last && last.config === config && last.areas === hass.areas && last.ids.length === ids.length
    && last.ids.every((id, i) => id === ids[i])) return last.groups;
  const groups = groupMeters(hass, config, regs);
  known.last = { config, areas: hass.areas, ids, groups };
  return groups;
}

function groupMeters(hass, config, regs) {
  const areas = new Map();          // HA area id (or "") -> Map(device id or "" -> [entity ids])
  for (const reg of regs) {
    const id = reg.entity_id;
    const key = entityArea(hass, reg) ?? "";
    if (!areas.has(key)) areas.set(key, new Map());
    const devices = areas.get(key);
    const device = reg.device_id && hass.devices?.[reg.device_id] ? reg.device_id : "";
    if (!devices.has(device)) devices.set(device, []);
    devices.get(device).push(id);
  }
  const pocket = areasOf(config);
  const pocketOf = (areaId) => pocket.find((area) => haAreaOf(config, area) === areaId) ?? null;
  const order = pocket.map((area) => haAreaOf(config, area));
  const rank = (key) => {
    if (key === "") return [2, ""];
    const i = order.indexOf(key);
    return i >= 0 ? [0, i] : [1, hass.areas?.[key]?.name ?? key];
  };
  const keys = [...areas.keys()].sort((a, b) => {
    const [ra, va] = rank(a);
    const [rb, vb] = rank(b);
    return ra - rb || (typeof va === "number" ? va - vb : byName(va, vb));
  });
  return keys.map((key) => {
    const devices = [...areas.get(key).entries()].map(([device, entities]) => {
      const name = device ? deviceName(hass.devices[device]) : null;
      const sorted = entities.sort((a, b) => CLASSES.indexOf(classOf(hass, a)) - CLASSES.indexOf(classOf(hass, b))
        || byName(entityName(hass, a, name), entityName(hass, b, name)) || (a < b ? -1 : 1));
      return { device: device || null, name, entities: sorted };
    }).sort((a, b) => (a.device ? 0 : 1) - (b.device ? 0 : 1) || byName(a.name, b.name)
      || byName(a.entities[0], b.entities[0]));
    return { area: key ? pocketOf(key) : null, areaId: key || null, devices };
  });
}

export function watts(hass, id) {
  const state = hass?.states?.[id];
  if (!state || GONE.has(state.state) || String(state.state).trim() === "") return null;
  const value = Number(state.state);
  const factor = FACTORS[String(state.attributes?.unit_of_measurement ?? "W").toLowerCase()];
  return Number.isFinite(value) && factor ? value * factor : null;
}

export function powerNow(hass, groups) {
  // The highest power reading of each device (an entity without a device stands for itself).
  const best = new Map();           // device id or entity id -> {id, watts, device}
  for (const group of groups ?? []) {
    for (const { device, entities } of group.devices) {
      for (const id of entities) {
        if (classOf(hass, id) !== "power") continue;
        const value = watts(hass, id);
        if (value == null) continue;
        const key = device ?? id;
        if (!best.has(key) || value > best.get(key).watts) best.set(key, { id, watts: value, device });
      }
    }
  }
  const counted = [...best.values()].filter(({ device }) => {
    const parent = device ? hass.devices?.[device]?.via_device_id : null;
    return !(parent && best.has(parent));
  });
  if (!counted.length) return null;
  return { watts: counted.reduce((sum, c) => sum + c.watts, 0), entities: counted.map((c) => c.id) };
}
