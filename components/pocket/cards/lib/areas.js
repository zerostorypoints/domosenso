// The home's areas as the pocket shows them: the card config's rooms, which the shell makes from
// Home Assistant's areas (lib/home-model.js, SPEC-038): every HA area in floor order, each with its
// type (inside, outside or not assigned) and its main sensors. Plain ES module: no DOM.
//
//   areasOf(config) -> [area]          config.rooms
//   comfortOf(thresholds, area)        the area's comfort range ids: thresholds.rooms.<area id>
//   climateReadings(area)              the climate readings the area can show, in order
//   climateValue(hass, area, reading)  a climate reading as a number, or null
//   typed(hass, config, type) -> {areas, measured, unset, min, max, entity}
//       the areas of one type (Home's and Climate's Inside and Outside, SPEC-038 §3.9): all of
//       them, those with a main temperature (measured: [{area, value}], a value null when the
//       sensor reads nothing), those without (unset), the range of the values, and the one sensor
//       when there is exactly one (for its trend)
//   isJudged(area)                     whether an area's comfort is judged (not an outside one)

import { numberOf } from "./level.js";

const CLIMATE = ["temperature", "humidity"];

export function areasOf(config) {
  return Array.isArray(config?.rooms) ? config.rooms : [];
}

export function comfortOf(thresholds, area) {
  return thresholds?.rooms?.[area?.id];
}

export function climateReadings(area) {
  return CLIMATE.filter((reading) => area?.climate?.[reading]);
}

export function climateValue(hass, area, reading) {
  const entity = area?.climate?.[reading];
  return entity ? numberOf(hass, entity) : null;
}

// The outside is weather: never something to act on (DESIGN.md §6).
export const isJudged = (area) => area?.type !== "outside";

export function typed(hass, config, type) {
  const areas = areasOf(config).filter((area) => area.type === type);
  const measured = [];
  const unset = [];
  for (const area of areas) {
    if (area.climate?.temperature) measured.push({ area, value: numberOf(hass, area.climate.temperature) });
    else unset.push(area);
  }
  const values = measured.map((m) => m.value).filter((v) => v != null);
  return { areas, measured, unset, min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    entity: measured.length === 1 ? measured[0].area.climate.temperature : null };
}
