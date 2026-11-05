// Which way a reading has moved over the last hour, for the arrows next to a widget's value.
// Plain ES module: no DOM.
//
//   trendOf(points, kind, now?) -> "rising" | "falling" | "steady" | null
//       points [{t, v}] as lib/history.js gives them (a step series: a value holds until the next);
//       the value an hour ago (the last point at or before now - 1 h, else the first one in the
//       hour) against the last value. A move of at least the kind's step is rising or falling,
//       less is steady; fewer than two numbers in the hour give null.
//   recentHistory(hass, entityId, now?) -> Promise<points | null>
//       the last hour of an entity, fetched at most once every REFRESH_MS per entity and shared by
//       every widget that asks (null when the fetch failed: tried again after REFRESH_MS)
//   peekHistory(entityId) -> points | null   what recentHistory last fetched, without fetching
//   trendArrow(direction) -> the arrow glyph of a direction, "" for none
//
// Steps per kind (a reading's name in the card config); power and anything else are a share of
// the hour's mean value, as their scale differs from one meter to the next.

import { historyPoints } from "./history.js";

const HOUR = 3600 * 1000;
export const REFRESH_MS = 5 * 60 * 1000;
const EPSILON = 1e-9;          // 21.7 - 21.4 is 0.29999...: still a step of 0.3

const STEPS = { temperature: 0.3, humidity: 2, co2: 50, pm2_5: 3, voc: 20, nox: 10, score: 3 };
const SHARES = { power: 0.1 };
const DEFAULT_SHARE = 0.05;

const ARROWS = { rising: "↑", falling: "↓", steady: "→" };

export function trendOf(points, kind, now = Date.now()) {
  if (!Array.isArray(points)) return null;
  const from = now - HOUR;
  const known = points.filter((p) => p && typeof p.v === "number" && Number.isFinite(p.v) && p.t <= now)
    .sort((a, b) => a.t - b.t);
  const before = known.filter((p) => p.t <= from).pop();
  const inside = known.filter((p) => p.t > from);
  const hour = before ? [before, ...inside] : inside;
  if (hour.length < 2) return null;
  const first = hour[0].v;
  const last = hour[hour.length - 1].v;
  const mean = hour.reduce((sum, p) => sum + p.v, 0) / hour.length;
  const step = STEPS[kind] ?? Math.abs(mean) * (SHARES[kind] ?? DEFAULT_SHARE);
  const delta = last - first;
  if (step === 0) return delta > 0 ? "rising" : delta < 0 ? "falling" : "steady";
  if (delta >= step - EPSILON) return "rising";
  if (-delta >= step - EPSILON) return "falling";
  return "steady";
}

export function trendArrow(direction) {
  return ARROWS[direction] ?? "";
}

const cache = new Map();       // entity id -> {at, promise, points}

export function recentHistory(hass, entityId, now = Date.now()) {
  if (!entityId || typeof hass?.callWS !== "function") return Promise.resolve(null);
  const hit = cache.get(entityId);
  if (hit && now - hit.at < REFRESH_MS) return hit.promise;
  const entry = { at: now, points: hit?.points ?? null };
  entry.promise = historyPoints(hass, entityId, now - HOUR, now).then(
    (points) => { entry.points = points; return points; },
    () => { entry.points = null; return null; });
  cache.set(entityId, entry);
  return entry.promise;
}

export function peekHistory(entityId) {
  return cache.get(entityId)?.points ?? null;
}

// Tests start from an empty cache.
export function clearHistoryCache() {
  cache.clear();
}
