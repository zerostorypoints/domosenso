// What needs attention in the home: every reading whose level (lib/level.js) is fair or poor,
// against the thresholds the card config names (climate-air's input_number helpers, read at run
// time). Plain ES module: no DOM. The words are the page's: an item names only the room, the
// reading, the level and the side, and the page translates them.
//
//   attention(hass, config) -> [{room, reading, level, side?, target}]
//
// Readings per room, in this order: temperature and humidity against the room's comfort range
// (range: poor with a side), then the air readings against the home's air limits (the score
// falling, the others rising). Ordered poor before fair, then in the home's order (rooms as in
// config.rooms, readings as above). A reading or a limit without a number gives no item.

import { level, numberOf } from "./level.js";
import { climateReadings, climateValue, comfortOf, isJudged } from "./areas.js";

const COMFORT = [
  { reading: "temperature", low: "temp_low", high: "temp_high" },
  { reading: "humidity", low: "humidity_low", high: "humidity_high" },
];
const AIR = [
  { reading: "score", kind: "falling" },
  { reading: "co2", kind: "rising" },
  { reading: "pm2_5", kind: "rising" },
  { reading: "voc", kind: "rising" },
  { reading: "nox", kind: "rising" },
];
const RANK = { poor: 0, fair: 1 };

// The level of every reading of one room that has an entity and limits: [{reading, result}],
// result as level() gives it (null when a value or limit has no number). The area page uses it
// too, for any area (lib/areas.js comfortOf: its comfort range, keyed by HA area).
export function roomLevels(hass, room, thresholds) {
  const found = [];
  const comfort = comfortOf(thresholds, room);
  const readings = climateReadings(room);
  for (const { reading, low, high } of COMFORT) {
    if (!readings.includes(reading) || !comfort) continue;
    const limits = { low: numberOf(hass, comfort[low]), high: numberOf(hass, comfort[high]) };
    found.push({ reading, result: level(climateValue(hass, room, reading), "range", limits) });
  }
  for (const { reading, kind } of AIR) {
    const entity = room.air?.[reading];
    const limits = thresholds?.air?.[reading];
    if (!entity || !limits) continue;
    found.push({ reading, result: level(numberOf(hass, entity), kind, {
      fair: numberOf(hass, limits.fair), poor: numberOf(hass, limits.poor) }) });
  }
  return found;
}

export function attention(hass, config) {
  if (!hass?.states || !Array.isArray(config?.rooms)) return [];
  const items = [];
  for (const room of config.rooms) {
    // An outside area is weather: coloured on its page, never a problem.
    if (!isJudged(room)) continue;
    for (const { reading, result } of roomLevels(hass, room, config.thresholds)) {
      if (!result || !(result.level in RANK)) continue;
      const item = { room: room.id, reading, level: result.level };
      if (result.side) item.side = result.side;
      item.target = `#/area/${room.id}`;
      items.push(item);
    }
  }
  // Array.prototype.sort is stable: within a level the home's order stays.
  return items.sort((a, b) => RANK[a.level] - RANK[b.level]);
}
