// The maps of the plants, climate and light layers (SPEC-028 Amendment 7): which maps a layer has,
// each map's 24-hour figure, a point's reading entities, the heat drawn inside each room and the
// lamps. Pure: no DOM, so `node --test` covers it directly.

import { pointInPolygon } from "./geometry.js";

// Per layer its maps, the first the default, each with the figure "24 h" shows: a plant suffers
// from its coldest hour and its driest soil and needs its brightest (light is zero every night); a
// room is judged by its mean, its air by its worst CO2. Lamps have no 24-hour figure.
export const MAPS = {
  plants: [["illuminance", "max"], ["temperature", "min"], ["moisture", "min"]],
  climate: [["temperature", "mean"], ["humidity", "mean"], ["carbon_dioxide", "max"]],
  light: [["illuminance", "max"], ["lamps", null]],
};

// Fixed, so two days compare. Ramps run low to high.
export const SCALES = {
  temperature: { lo: 17, hi: 24, unit: "°C", digits: 1, ramp: ["#2c7bb6", "#abd9e9", "#ffffbf", "#fdae61", "#d7191c"] },
  humidity: { lo: 30, hi: 60, unit: "%", digits: 0, ramp: ["#8c510a", "#d8b365", "#f6e8c3", "#5ab4ac", "#01665e"] },
  moisture: { lo: 10, hi: 50, unit: "%", digits: 0, ramp: ["#8c510a", "#d8b365", "#f6e8c3", "#5ab4ac", "#01665e"] },
  carbon_dioxide: { lo: 400, hi: 1400, unit: "ppm", digits: 0, ramp: ["#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027"] },
  illuminance: { lo: 0, hi: 20000, unit: "lx", digits: 0, log: true, ramp: ["#1b1f3a", "#3b3f75", "#a07a2a", "#f2c14e", "#fff3b0"] },
};

// What a label lists, in this order before the shown map's reading moves to the front.
const PLANT_READINGS = ["temperature", "illuminance", "moisture"];
const ROOM_READINGS = ["temperature", "humidity", "carbon_dioxide", "illuminance"];
// A plant entity names its sensors by these keys (the plant integration's `sensors` attribute).
const PLANT_KEYS = { temperature: "temperature", brightness: "illuminance", moisture: "moisture" };

export const STEP_M = 0.15;      // the heat grid's cell

export const mapsOf = (layer) => MAPS[layer] ?? null;

// The figure a layer's rule gives a reading on its labels: the map's own, else the mean.
export function ruleOf(layer, cls) {
  return MAPS[layer]?.find(([c]) => c === cls)?.[1] ?? "mean";
}

// A point's reading entities by device class: its own sensors, a plant's named sensors.
export function readingIds(hass, entityIds) {
  const out = {};
  for (const id of entityIds) {
    const st = hass.states?.[id];
    if (id.startsWith("plant.")) {
      for (const [key, cls] of Object.entries(PLANT_KEYS)) {
        const sensor = st?.attributes?.sensors?.[key];
        if (sensor && !out[cls]) out[cls] = sensor;
      }
      continue;
    }
    const cls = st?.attributes?.device_class;
    if (SCALES[cls] && !out[cls]) out[cls] = id;
  }
  return out;
}

// The readings a label lists: a plant's three, any other point's room readings; the light layer
// light only. The shown map's reading first.
export function labelClasses(layer, isPlant, shown) {
  const list = layer === "light" ? ["illuminance"] : isPlant ? PLANT_READINGS : ROOM_READINGS;
  return [...list].sort((a, b) => (b === shown) - (a === shown));
}

// One figure from hourly statistics rows ({mean, min, max}): the lowest min, the highest max or the
// mean of the means; undefined without rows.
export function figure(rows, rule) {
  const vals = (rows || []).map((r) => r?.[rule]).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!vals.length) return undefined;
  if (rule === "min") return Math.min(...vals);
  if (rule === "max") return Math.max(...vals);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// A state's number, or undefined.
export function nowValue(hass, id) {
  const v = Number.parseFloat(hass.states?.[id]?.state);
  return Number.isFinite(v) ? v : undefined;
}

export function formatValue(cls, v) {
  const s = SCALES[cls];
  return `${v.toFixed(s.digits)} ${s.unit}`;
}

const hex = (c) => [16, 8, 0].map((s) => (parseInt(c.slice(1), 16) >> s) & 255);

// A value's colour on its scale's ramp, clamped to the ends.
export function colourAt(cls, v) {
  const s = SCALES[cls];
  let t = s.log ? Math.log1p(Math.max(0, v)) / Math.log1p(s.hi) : (v - s.lo) / (s.hi - s.lo);
  t = Math.max(0, Math.min(1, t)) * (s.ramp.length - 1);
  const i = Math.min(s.ramp.length - 2, Math.floor(t));
  const [a, b] = [hex(s.ramp[i]), hex(s.ramp[i + 1])];
  const f = t - i;
  return `rgb(${a.map((x, k) => Math.round(x * (1 - f) + b[k] * f)).join(",")})`;
}

// The heat inside each room from that room's own samples ([{at: [x, y], value}]), by inverse
// distance squared on a STEP_M grid: walls stop it, no room borrows another's readings.
// Returns {cells: [{x, y, value}], empty: [room index]} (a room without a sample is hatched).
export function heat(rooms, samples, step = STEP_M) {
  const cells = [];
  const empty = [];
  rooms.forEach((poly, i) => {
    const own = samples.filter((s) => pointInPolygon(s.at, poly));
    if (!own.length) {
      empty.push(i);
      return;
    }
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    for (let x = Math.min(...xs); x < Math.max(...xs); x += step) {
      for (let y = Math.min(...ys); y < Math.max(...ys); y += step) {
        const c = [x + step / 2, y + step / 2];
        if (!pointInPolygon(c, poly)) continue;
        let num = 0;
        let den = 0;
        for (const s of own) {
          const w = 1 / ((s.at[0] - c[0]) ** 2 + (s.at[1] - c[1]) ** 2 + 0.05);
          num += s.value * w;
          den += w;
        }
        cells.push({ x, y, value: num / den });
      }
    }
  });
  return { cells, empty };
}

// Each device's lamp: its first `light` entity that is not a group (a group's state lists its
// members in `entity_id`). Built with the registry, not per drawing.
export function lampIndex(hass) {
  const out = new Map();
  for (const id of Object.keys(hass.entities || {}).sort()) {
    const did = hass.entities[id].device_id;
    if (!id.startsWith("light.") || !did || out.has(did)) continue;
    if (Array.isArray(hass.states?.[id]?.attributes?.entity_id)) continue;
    out.set(did, id);
  }
  return out;
}

// The lamp of the first of `deviceIds` that has one: {on, brightness 0-100}, or null.
export function lampOf(hass, index, deviceIds) {
  for (const did of deviceIds) {
    const st = index.has(did) && hass.states?.[index.get(did)];
    if (!st) continue;
    const on = st.state === "on";
    return { on, brightness: on ? Math.round(((st.attributes?.brightness ?? 255) / 255) * 100) : 0 };
  }
  return null;
}
