// A reading's past values from Home Assistant, as points [{t, v}] (t in ms since the epoch, v a
// number or null for a gap: unavailable, unknown, not numeric). Plain ES module: no DOM.
//
//   historyPoints(hass, entityId, start, end)            the recorder's states (websocket
//       history/history_during_period, minimal_response, no_attributes): every change, the state
//       at `start` first
//   statisticsPoints(hass, entityId, start, end, period) the long-term statistics' means
//       (recorder/statistics_during_period, period "hour" or "day"); [] when the sensor has none
//   seriesOf(hass, entityId, range, now?)                the points of one range of the trend sheet:
//       "24h" history, "7d" hourly statistics, "30d" daily statistics; a sensor without statistics
//       (no state_class) falls back to its history over the same span
//
// Every function returns a Promise; a failed call rejects with Home Assistant's error.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export const RANGES = {
  "24h": { span: DAY, source: "history" },
  "7d": { span: 7 * DAY, source: "statistics", period: "hour" },
  "30d": { span: 30 * DAY, source: "statistics", period: "day" },
};

const numeric = (state) => {
  if (typeof state === "number") return Number.isFinite(state) ? state : null;
  if (typeof state !== "string" || state.trim() === "") return null;
  const n = Number(state);
  return Number.isFinite(n) ? n : null;
};

// A time Home Assistant gives: seconds (the compressed websocket states: lu, lc), milliseconds
// (statistics since 2023.3) or an ISO string (older answers, the REST shape).
function millis(value, unit) {
  if (typeof value === "number") return unit === "s" ? value * 1000 : value;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

export async function historyPoints(hass, entityId, start, end) {
  const result = await hass.callWS({
    type: "history/history_during_period",
    start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(),
    entity_ids: [entityId],
    minimal_response: true,
    no_attributes: true,
  });
  const rows = Array.isArray(result?.[entityId]) ? result[entityId] : [];
  return rows.map((row) => ({
    t: row.lu != null ? millis(row.lu, "s") : row.lc != null ? millis(row.lc, "s")
      : millis(row.last_updated ?? row.last_changed),
    v: numeric(row.s ?? row.state),
  })).filter((p) => p.t != null).sort((a, b) => a.t - b.t);
}

export async function statisticsPoints(hass, entityId, start, end, period) {
  const result = await hass.callWS({
    type: "recorder/statistics_during_period",
    start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(),
    statistic_ids: [entityId],
    period,
    types: ["mean"],
  });
  const rows = Array.isArray(result?.[entityId]) ? result[entityId] : [];
  return rows.map((row) => ({ t: millis(row.start), v: numeric(row.mean) }))
    .filter((p) => p.t != null).sort((a, b) => a.t - b.t);
}

export async function seriesOf(hass, entityId, range, now = Date.now()) {
  const spec = RANGES[range];
  if (!spec) throw new Error(`unknown range: ${range}`);
  const start = now - spec.span;
  if (spec.source === "statistics") {
    const points = await statisticsPoints(hass, entityId, start, now, spec.period);
    if (points.some((p) => p.v != null)) return points;
  }
  return historyPoints(hass, entityId, start, now);
}
