// The Plants page's plants: every plant.* entity (Home Assistant's plant integration, as the plants
// component sets it up), its readings, what it needs, and the area it stands in. Plain ES module:
// no DOM.
//
//   plantsOf(hass, config) -> [{area, areaId, label, plants: [plant]}]   grouped by area, the group
//       whose worst plant is worst first, then the pocket's order, then by name; plants worst first,
//       then by name. area: the pocket area (lib/areas.js) of the HA area, else null; areaId: the HA
//       area, else null; label: the plants component's room (attribute domosenso_room) when no HA
//       area is known, else null; a plant with neither is in the group of no area (all null), last.
//   plant = {id, name, readings: [{reading, entity, value, unit, tone}], reasons: [reason], rank}
//       readings in READINGS order, only those with a value or a sensor; entity: the sensor to open
//       the trend of (null when the value is the plant's attribute only); tone good / fair / poor /
//       cold / warm against the plant's band, null without one; reasons in REASONS order; rank 0
//       thirsty, 1 too wet, 2 something else, 3 fine, 4 no reading at all.
//
// Where things come from, so no input names them (the plants component's provided entities):
//   - a reading's sensor: the plant's attribute `sensors` (the plant integration's map), else
//     sensor.<plant>_<moisture|conductivity|illuminance|temperature|battery>; its value from that
//     sensor, else the plant's attribute (moisture, conductivity, brightness, temperature, battery);
//   - the bands: the plant's attribute domosenso_bands (the plants component writes it), over
//     DEFAULT_BANDS (the component's plant_defaults); a battery below LOW_BATTERY % is low;
//   - light is judged on the day's brightest reading (sensor.<plant>_illuminance_max_24h, else the
//     attribute max_brightness), never on the reading now (dark at night is no problem);
//   - the plant integration's own `problem` attribute ("moisture low, brightness low") adds its
//     reasons too, so a home without the bands still hears them;
//   - the area: the plant's registry entry (its area, else its device's, lib/sensors.js entityArea),
//     else its readings' sensors' (a Mi Flora's device), else the room the plants component names
//     matched by name to a pocket room or an HA area.

import { areasOf } from "./areas.js";
import { entityArea, haAreaOf } from "./sensors.js";

export const READINGS = ["moisture", "conductivity", "illuminance", "temperature", "battery"];
const ATTRIBUTE = { moisture: "moisture", conductivity: "conductivity", illuminance: "brightness",
  temperature: "temperature", battery: "battery" };
export const REASONS = ["thirsty", "too_wet", "needs_light", "too_much_light", "cold", "warm",
  "needs_fertiliser", "too_much_fertiliser", "low_battery"];
// The reasons only soil readings give; a hydroculture plant never has them (SPEC-048).
const SOIL_REASONS = new Set(["thirsty", "too_wet", "needs_fertiliser", "too_much_fertiliser"]);
export const DEFAULT_BANDS = Object.freeze({ min_moisture: 15, max_moisture: 60, min_conductivity: 350,
  max_conductivity: 2000, min_brightness: 500 });
export const LOW_BATTERY = 15;

// The plant integration's problem words, and the reason each one is.
const PROBLEMS = [
  [/moisture low/, "thirsty"], [/moisture high/, "too_wet"],
  [/(brightness|illuminance) low/, "needs_light"], [/(brightness|illuminance) high/, "too_much_light"],
  [/temperature low/, "cold"], [/temperature high/, "warm"],
  [/conductivity low/, "needs_fertiliser"], [/conductivity high/, "too_much_fertiliser"],
  [/battery low/, "low_battery"],
];
// Below or above a band: the reason and the tone of the reading (comfort's cold / warm for
// temperature, a dry pot poor, the rest fair).
const SIDES = {
  moisture: { low: ["thirsty", "poor"], high: ["too_wet", "fair"] },
  conductivity: { low: ["needs_fertiliser", "fair"], high: ["too_much_fertiliser", "fair"] },
  temperature: { low: ["cold", "cold"], high: ["warm", "warm"] },
};
const BAND_KEYS = { moisture: "moisture", conductivity: "conductivity", temperature: "temperature", illuminance: "brightness" };
const GONE = new Set(["unavailable", "unknown"]);

function numeric(hass, id) {
  const state = hass?.states?.[id]?.state;
  if (state == null || GONE.has(state) || String(state).trim() === "") return null;
  const n = Number(state);
  return Number.isFinite(n) ? n : null;
}

const attrNumber = (value) => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};

const objectId = (id) => id.split(".").slice(1).join(".");

export function sensorOf(hass, id, reading) {
  const named = hass?.states?.[id]?.attributes?.sensors?.[ATTRIBUTE[reading]];
  if (typeof named === "string" && hass.states[named]) return named;
  const own = `sensor.${objectId(id)}_${reading}`;
  return hass?.states?.[own] ? own : null;
}

function readPlant(hass, id) {
  const attributes = hass.states[id].attributes ?? {};
  const bands = { ...DEFAULT_BANDS, ...(attributes.domosenso_bands ?? {}) };
  // SPEC-048: in hydroculture the sensor reads only the pebbles above the reservoir, so moisture
  // and fertiliser are left out (not shown as missing) and the plant is judged on light and warmth.
  const hydro = attributes.domosenso_medium === "hydroculture";
  const reasons = new Set();
  const dailyPeak = numeric(hass, `sensor.${objectId(id)}_illuminance_max_24h`);
  const peak = dailyPeak ?? attrNumber(attributes.max_brightness);
  if (peak != null) {
    if (bands.min_brightness != null && peak < bands.min_brightness) reasons.add("needs_light");
    else if (bands.max_brightness != null && peak > bands.max_brightness) reasons.add("too_much_light");
  }
  const readings = [];
  for (const reading of READINGS) {
    if (hydro && (reading === "moisture" || reading === "conductivity")) continue;
    const entity = sensorOf(hass, id, reading);
    const value = entity ? numeric(hass, entity) ?? attrNumber(attributes[ATTRIBUTE[reading]])
      : attrNumber(attributes[ATTRIBUTE[reading]]);
    if (value == null && !entity) continue;
    const unit = (entity && hass.states[entity]?.attributes?.unit_of_measurement) || null;
    let tone = null;
    const key = BAND_KEYS[reading];
    if (value != null && reading === "illuminance") {
      if (peak != null) tone = reasons.has("needs_light") || reasons.has("too_much_light") ? "fair" : "good";
    } else if (value != null && reading === "battery") {
      tone = value < LOW_BATTERY ? "fair" : "good";
      if (value < LOW_BATTERY) reasons.add("low_battery");
    } else if (value != null && SIDES[reading]) {
      const low = bands[`min_${key}`];
      const high = bands[`max_${key}`];
      const side = low != null && value < low ? "low" : high != null && value > high ? "high" : null;
      if (side) {
        const [reason, sideTone] = SIDES[reading][side];
        reasons.add(reason);
        tone = sideTone;
      } else if (low != null || high != null) {
        tone = "good";
      }
    }
    readings.push({ reading, entity, value, unit, tone });
  }
  const problem = String(attributes.problem ?? "").toLowerCase();
  for (const [pattern, reason] of PROBLEMS) {
    if (dailyPeak != null && (reason === "needs_light" || reason === "too_much_light")) continue;
    if (hydro && SOIL_REASONS.has(reason)) continue;
    if (pattern.test(problem)) reasons.add(reason);
  }
  const ordered = REASONS.filter((reason) => reasons.has(reason));
  const moisture = readings.find((r) => r.reading === "moisture")?.value;
  let rank = ordered.length ? 2 : 3;
  if (ordered.includes("thirsty")) rank = 0;
  else if (ordered.includes("too_wet")) rank = 1;
  else if (!ordered.length && moisture == null && !readings.some((r) => r.value != null)) rank = 4;
  return { id, name: attributes.friendly_name || objectId(id).replace(/_/g, " "), readings, reasons: ordered, rank, hydro };
}

// The HA area a plant stands in (see the header), or null.
function plantArea(hass, id, readings) {
  const own = hass.entities?.[id];
  const area = own ? entityArea(hass, own) : null;
  if (area) return area;
  for (const { entity } of readings) {
    const reg = entity ? hass.entities?.[entity] : null;
    const found = reg ? entityArea(hass, reg) : null;
    if (found) return found;
  }
  return null;
}

// The plants component's room as a label: a string, or one per language ({en: ..., de: ...}).
function roomLabel(attributes, lang) {
  const many = attributes.domosenso_rooms;
  if (many && typeof many === "object" && typeof many[lang] === "string") return many[lang];
  return typeof attributes.domosenso_room === "string" && attributes.domosenso_room ? attributes.domosenso_room : null;
}

export function plantsOf(hass, config) {
  if (!hass?.states) return [];
  const lang = config?.lang || hass.locale?.language || hass.language || "en";
  const pocket = areasOf(config);
  const order = pocket.map((area) => haAreaOf(config, area));
  const byName = (name) => {
    const lower = String(name).toLowerCase();
    const room = pocket.find((area) => !area.outside && String(area.name).toLowerCase() === lower);
    if (room) return haAreaOf(config, room);
    return Object.values(hass.areas ?? {}).find((a) => String(a.name).toLowerCase() === lower)?.area_id ?? null;
  };
  const groups = new Map();
  for (const id of Object.keys(hass.states)) {
    if (!id.startsWith("plant.")) continue;
    const reg = hass.entities?.[id];
    if (reg && (reg.hidden || reg.hidden_by || reg.disabled_by)) continue;
    const plant = readPlant(hass, id);
    const label = roomLabel(hass.states[id].attributes ?? {}, lang);
    const areaId = plantArea(hass, id, plant.readings) ?? (label ? byName(label) : null);
    const key = areaId ? `a:${areaId}` : label ? `l:${label}` : "";
    if (!groups.has(key)) {
      groups.set(key, { area: areaId ? pocket.find((a) => haAreaOf(config, a) === areaId) ?? null : null,
        areaId: areaId ?? null, label: areaId ? null : label, plants: [] });
    }
    groups.get(key).plants.push(plant);
  }
  const named = (g) => (g.area ? g.area.name : g.areaId ? hass.areas?.[g.areaId]?.name ?? g.areaId : g.label ?? "");
  const place = (g) => {
    if (!g.areaId && !g.label) return 1e9;
    const i = order.indexOf(g.areaId);
    return i >= 0 ? i : 1e6;
  };
  const list = [...groups.values()];
  for (const g of list) {
    g.plants.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
  }
  return list.sort((a, b) => {
    const none = (g) => (!g.areaId && !g.label ? 1 : 0);
    return none(a) - none(b) || a.plants[0].rank - b.plants[0].rank || place(a) - place(b)
      || named(a).localeCompare(named(b));
  });
}

// How many plants need something.
export const needing = (groups) => groups.reduce((n, g) => n + g.plants.filter((p) => p.rank <= 2).length, 0);
