// What the pocket checks, reading by reading, for the detail sheets behind Home's "All good" and
// its attention pills (lib/detail-sheets.js): every reading of every area (lib/areas.js: Home
// Assistant's areas), its value and its level (lib/attention.js roomLevels: the comfort range of the
// area, the home's air limits). Plain ES module: no DOM.
//
//   checksOf(hass, config, {readings?, inside?}) -> [{area, rows: [row]}]
//       row = {reading, entity, value, result}   entity: the sensor the trend sheet reads (none for
//       the Outside's weather attribute), value: a number or null, result: level() or null (no
//       limits, or no number)
//       readings: only these readings (Home's inside chip: ["temperature"]). An area of type outside
//       is never in it: it is weather, never judged (DESIGN.md §6), so "All good" and the list behind
//       it always agree; `inside` is kept for callers and changes nothing
//   Problems first: rows poor, fair, good, then without a level (the home's order within each);
//   areas by their worst row, in the home's order within the same.
//   readingsOf(area) -> the readings an area has, in order (climate, then air)
//   entityOf(area, reading), valueOf(hass, area, reading)

import { numberOf } from "./level.js";
import { areasOf, climateReadings, climateValue, isJudged } from "./areas.js";
import { roomLevels } from "./attention.js";

export const AIR_READINGS = ["score", "co2", "pm2_5", "voc", "nox"];
const RANK = { poor: 0, fair: 1, good: 2 };
const NONE = 3;

export const rankOf = (result) => (result ? RANK[result.level] ?? NONE : NONE);

export function readingsOf(area) {
  return [...climateReadings(area), ...AIR_READINGS.filter((reading) => area?.air?.[reading])];
}

export function entityOf(area, reading) {
  return AIR_READINGS.includes(reading) ? area?.air?.[reading] : area?.climate?.[reading];
}

export function valueOf(hass, area, reading) {
  return AIR_READINGS.includes(reading) ? numberOf(hass, area?.air?.[reading]) : climateValue(hass, area, reading);
}

// The rows of one area, in the home's order (unsorted).
export function areaRows(hass, area, thresholds, readings) {
  const results = Object.fromEntries(roomLevels(hass, area, thresholds).map(({ reading, result }) => [reading, result]));
  return readingsOf(area).filter((reading) => !readings || readings.includes(reading)).map((reading) => ({
    reading, entity: entityOf(area, reading), value: valueOf(hass, area, reading), result: results[reading] ?? null,
  }));
}

export function checksOf(hass, config, { readings, inside = false } = {}) {
  void inside;
  const areas = areasOf(config).filter(isJudged);
  const groups = areas.map((area) => {
    const rows = areaRows(hass, area, config?.thresholds, readings);
    // Array.prototype.sort is stable: within a level the home's order stays.
    rows.sort((a, b) => rankOf(a.result) - rankOf(b.result));
    return { area, rows, worst: rows.length ? rankOf(rows[0].result) : NONE };
  }).filter((group) => group.rows.length > 0);
  groups.sort((a, b) => a.worst - b.worst);
  return groups.map(({ area, rows }) => ({ area, rows }));
}
