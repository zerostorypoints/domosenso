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

function roomLevels(hass, room, thresholds) {
  const found = [];
  const comfort = thresholds?.rooms?.[room.id];
  for (const { reading, low, high } of COMFORT) {
    const entity = room.climate?.[reading];
    if (!entity || !comfort) continue;
    const limits = { low: numberOf(hass, comfort[low]), high: numberOf(hass, comfort[high]) };
    found.push({ reading, result: level(numberOf(hass, entity), "range", limits) });
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
    for (const { reading, result } of roomLevels(hass, room, config.thresholds)) {
      if (!result || !(result.level in RANK)) continue;
      const item = { room: room.id, reading, level: result.level };
      if (result.side) item.side = result.side;
      item.target = `#/room/${room.id}`;
      items.push(item);
    }
  }
  // Array.prototype.sort is stable: within a level the home's order stays.
  return items.sort((a, b) => RANK[a.level] - RANK[b.level]);
}
