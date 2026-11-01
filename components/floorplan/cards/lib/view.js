// What the floor plan card draws and where the pointer is on the plan: pure helpers over the plan
// document, the svg's viewBox and Home Assistant's states. No DOM, so `node --test` covers them
// through the card without a layout engine.

import { snapToEdge } from "./geometry.js";
import { candidates, POINT_CLASSES } from "./plan.js";

const PAD = 0.5;                       // m around the plan when it is fitted
const EMPTY = { x: 0, y: 0, w: 10, h: 8 };
export const SNAP_CORNER = 0.05;       // m: a dropped corner this close to another room's corner or wall joins it
export const GRID_M = 0.05;            // m: corners land on this grid unless they joined another room

// The view that shows the whole floor; zooming out stops there (view.max.w).
export function fitView(floor) {
  const pts = [...(floor?.rooms || []).flatMap((r) => r.polygon), ...(floor?.points || []).map((p) => [p.x, p.y])];
  let box = EMPTY;
  if (pts.length) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x = Math.min(...xs) - PAD;
    const y = Math.min(...ys) - PAD;
    box = { x, y, w: Math.max(1, Math.max(...xs) + PAD - x), h: Math.max(1, Math.max(...ys) + PAD - y) };
  }
  return { ...box, max: { w: box.w } };
}

// The viewBox drawn into a client rectangle with preserveAspectRatio "xMidYMid meet": pixels per
// metre and the letterbox offsets.
export function frame(view, rect) {
  const s = rect?.width > 0 && rect?.height > 0 ? Math.min(rect.width / view.w, rect.height / view.h) : 0;
  return { s, ox: (rect?.width - view.w * s) / 2 || 0, oy: (rect?.height - view.h * s) / 2 || 0 };
}

export function toPlan(view, rect, clientX, clientY) {
  const { s, ox, oy } = frame(view, rect);
  if (!s) return [view.x + view.w / 2, view.y + view.h / 2];
  return [view.x + (clientX - rect.left - ox) / s, view.y + (clientY - rect.top - oy) / s];
}

const same = (p, q) => Math.abs(p[0] - q[0]) <= 1e-9 && Math.abs(p[1] - q[1]) <= 1e-9;

// Where a corner of `areaId` dropped at `pt` ends: on another room's nearest corner, else on its
// nearest wall, within `tol`; rooms that share the corner already moved with it and are skipped.
export function snapCorner(floor, areaId, pt, tol = SNAP_CORNER) {
  const others = floor.rooms.filter((r) => r.area_id !== areaId && !r.polygon.some((p) => same(p, pt)));
  let best = null;
  for (const room of others) {
    for (const p of room.polygon) {
      const d = Math.hypot(p[0] - pt[0], p[1] - pt[1]);
      if (d <= tol && (!best || d < best.d)) best = { pt: p, d };
    }
  }
  if (best) return [best.pt[0], best.pt[1]];
  for (const room of others) {
    const hit = snapToEdge(room.polygon, pt, tol);
    if (!hit) continue;
    const d = Math.hypot(hit.pt[0] - pt[0], hit.pt[1] - pt[1]);
    if (!best || d < best.d) best = { pt: hit.pt, d };
  }
  return best ? best.pt : snapGrid(pt);
}

// The wall point nearest to `pt` within `tol` on any room of the floor (a split's pick), moved to the
// grid along that wall; null when no wall is that close.
export function nearestWall(floor, pt, tol) {
  let best = null;
  for (const room of floor.rooms) {
    const hit = snapToEdge(room.polygon, pt, tol);
    const d = hit && Math.hypot(hit.pt[0] - pt[0], hit.pt[1] - pt[1]);
    if (hit && (!best || d < best.d)) best = { pt: gridOnWall(room.polygon, hit.edge, hit.pt), d };
  }
  return best?.pt ?? null;
}

// Rounded twice: 1.25 / 0.05 * 0.05 is 1.2500000000000002, and the plan keeps millimetres.
const onGrid = (v) => Math.round(Math.round(v / GRID_M) * GRID_M * 1000) / 1000 + 0;
export const snapGrid = ([x, y]) => [onGrid(x), onGrid(y)];

// A point on wall `edge` of `polygon` moved to the grid along that wall, so it stays on it: only a
// level or plumb wall has grid points along it. A point that would leave the wall's inside (or
// land on its end corner) stays where it is.
export function gridOnWall(polygon, edge, pt) {
  const a = polygon[edge];
  const b = polygon[(edge + 1) % polygon.length];
  const level = Math.abs(a[1] - b[1]) <= 1e-9;
  if (!level && Math.abs(a[0] - b[0]) > 1e-9) return pt;
  const q = level ? [onGrid(pt[0]), a[1]] : [a[0], onGrid(pt[1])];
  const i = level ? 0 : 1;
  const t = (q[i] - a[i]) / (b[i] - a[i]);
  return t > 1e-9 && t < 1 - 1e-9 ? q : pt;
}

const order = (hass, id) => {
  if (id.startsWith("plant.")) return -1;
  const i = POINT_CLASSES.indexOf(hass.states?.[id]?.attributes?.device_class);
  return i < 0 ? POINT_CLASSES.length : i;
};

// Every point key (device id or entity id) to the entities its marker shows, sorted plant first, then
// by POINT_CLASSES. Built once per hass: candidates() walks every entity and state.
export function entityMap(hass) {
  const map = new Map();
  for (const c of candidates(hass)) {
    map.set(c.key, [...c.entities].sort((a, b) => order(hass, a) - order(hass, b) || a.localeCompare(b)));
  }
  return map;
}

export function pointEntities(point, map) {
  return map.get(point.device_id ?? point.entity_id) ?? (point.entity_id ? [point.entity_id] : []);
}

export function valueText(hass, entityId) {
  const st = hass.states?.[entityId];
  if (!st || st.state === "unavailable" || st.state === "unknown") return "—";
  if (entityId.startsWith("plant.")) return st.attributes?.friendly_name || entityId;
  if (typeof hass.formatEntityState === "function") return hass.formatEntityState(st);
  const unit = st.attributes?.unit_of_measurement;
  return unit ? `${st.state} ${unit}` : st.state;
}
