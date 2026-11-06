// What the Climate page (pages/climate-page.js) shows besides the readings themselves: the advice
// when a limit is crossed, and where a value sits on its band. Plain ES module: no DOM.
//
//   adviceOf(hass, config) -> [{area, advice, reading}]
//       only what is measured now, never a forecast: for each room (the Outside is not advised)
//       a poor CO2 or VOC gives one "open_window" (reading: the first of them); a poor score,
//       PM2.5 or NOx gives "air_poor" with its reading (the score not when the room already has
//       "open_window": the score follows CO2 and VOC); a temperature or humidity outside its
//       comfort range gives too_cold / too_warm / too_dry / too_humid. Air before comfort, the
//       home's order within each.
//   bandOf(value, limits) -> {zones: [{from, to, level}], marks: [{at, level}], at} | null
//       positions in percent of a bar: limits {kind: "range", low, high} shade the comfort range
//       (good), {kind: "rising" | "falling", fair, poor} colour good, fair and poor and mark fair
//       and poor. The bar spans the limits with room on each side (half the range, or the step
//       between fair and poor) and always the value; at is null without a value. Limits that are
//       not numbers, or a range without width, give null.
//   readingBand(hass, config, area, reading) -> bandOf(...) for an area's reading, its limits
//       read from climate-air's helpers (lib/areas.js comfortOf, thresholds.air)
//   homeAir(hass, config) -> {room, entity, value, result} | null
//       the home's air score, one definition for Home's Air chip and the Climate page's Air
//       square: the room with the lowest score (the worst air), the first room with a score while
//       none has a number; null when no room has a score sensor. result: its level, or null
//   VIEWS   the Climate page's switch: temperature, humidity, air (lib/settings.js climateView)

import { numberOf } from "./level.js";
import { comfortOf, isJudged } from "./areas.js";
import { roomLevels } from "./attention.js";
import { valueOf } from "./checks.js";

export const VIEWS = ["temperature", "humidity", "air"];

const WINDOW = ["co2", "voc"];
const OTHER_AIR = ["score", "pm2_5", "nox"];
const SIDES = { temperature: { low: "too_cold", high: "too_warm" }, humidity: { low: "too_dry", high: "too_humid" } };
const COMFORT = { temperature: ["temp_low", "temp_high"], humidity: ["humidity_low", "humidity_high"] };
const AIR_KIND = { score: "falling", co2: "rising", pm2_5: "rising", voc: "rising", nox: "rising" };

const isNumber = (x) => typeof x === "number" && Number.isFinite(x);

export function homeAir(hass, config) {
  const rooms = (Array.isArray(config?.rooms) ? config.rooms : []).filter((room) => room.air?.score && isJudged(room));
  if (!rooms.length) return null;
  let room = rooms[0];
  let value = numberOf(hass, room.air.score);
  for (const other of rooms.slice(1)) {
    const v = numberOf(hass, other.air.score);
    if (v != null && (value == null || v < value)) [room, value] = [other, v];
  }
  const result = roomLevels(hass, room, config.thresholds).find((found) => found.reading === "score")?.result ?? null;
  return { room, entity: room.air.score, value, result };
}

export function adviceOf(hass, config) {
  if (!hass?.states || !Array.isArray(config?.rooms)) return [];
  const air = [];
  const comfort = [];
  for (const area of config.rooms) {
    // An area the home left out of the checks gives no advice.
    if (!isJudged(area)) continue;
    const poor = new Map(roomLevels(hass, area, config.thresholds)
      .filter(({ result }) => result?.level === "poor").map(({ reading, result }) => [reading, result]));
    const window = WINDOW.find((reading) => poor.has(reading));
    if (window) air.push({ area, advice: "open_window", reading: window });
    for (const reading of OTHER_AIR) {
      if (!poor.has(reading) || (window && reading === "score")) continue;
      air.push({ area, advice: "air_poor", reading });
    }
    for (const reading of Object.keys(SIDES)) {
      const side = poor.get(reading)?.side;
      if (side) comfort.push({ area, advice: SIDES[reading][side], reading });
    }
  }
  return [...air, ...comfort];
}

const round = (x) => Math.round(x * 10) / 10;

export function bandOf(value, limits) {
  if (!limits) return null;
  const known = isNumber(value) ? value : null;
  let lo;
  let hi;
  let zones;
  let marks = [];
  if (limits.kind === "range") {
    const { low, high } = limits;
    if (!isNumber(low) || !isNumber(high) || high <= low) return null;
    const pad = (high - low) / 2;
    [lo, hi] = [low - pad, high + pad];
    zones = (pos) => [{ from: pos(low), to: pos(high), level: "good" }];
  } else if (limits.kind === "rising" || limits.kind === "falling") {
    const { fair, poor } = limits;
    if (!isNumber(fair) || !isNumber(poor) || fair === poor) return null;
    const step = Math.abs(poor - fair);
    const [a, b] = fair < poor ? [fair, poor] : [poor, fair];
    [lo, hi] = [Math.max(0, a - step), b + step];
    if (limits.kind === "rising") {
      zones = (pos) => [{ from: 0, to: pos(fair), level: "good" }, { from: pos(fair), to: pos(poor), level: "fair" },
        { from: pos(poor), to: 100, level: "poor" }];
    } else {
      zones = (pos) => [{ from: 0, to: pos(poor), level: "poor" }, { from: pos(poor), to: pos(fair), level: "fair" },
        { from: pos(fair), to: 100, level: "good" }];
    }
    marks = (pos) => [{ at: pos(fair), level: "fair" }, { at: pos(poor), level: "poor" }];
  } else {
    return null;
  }
  if (known != null) [lo, hi] = [Math.min(lo, known), Math.max(hi, known)];
  const pos = (x) => round(((x - lo) / (hi - lo)) * 100);
  return { zones: zones(pos), marks: typeof marks === "function" ? marks(pos) : marks, at: known == null ? null : pos(known) };
}

export function readingBand(hass, config, area, reading) {
  const kind = AIR_KIND[reading];
  if (kind) {
    const limits = config?.thresholds?.air?.[reading];
    if (!limits) return null;
    return bandOf(valueOf(hass, area, reading),
      { kind, fair: numberOf(hass, limits.fair), poor: numberOf(hass, limits.poor) });
  }
  const comfort = comfortOf(config?.thresholds, area);
  const [low, high] = COMFORT[reading] ?? [];
  if (!comfort || !low) return null;
  return bandOf(valueOf(hass, area, reading),
    { kind: "range", low: numberOf(hass, comfort[low]), high: numberOf(hass, comfort[high]) });
}
