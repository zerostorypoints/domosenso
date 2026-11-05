// Today's energy from Home Assistant's Energy dashboard, for the Power page's "Today" square.
// Plain ES module: no DOM.
//
//   energySources(prefs) -> {source: "grid" | "devices", stats: [statistic id]} | null
//       what the Energy dashboard's preferences (websocket energy/get_prefs) count: the grid's
//       imports (energy_sources of type grid, each flow_from's stat_energy_from) when the home has a
//       grid source; else the individual devices (device_consumption's stat_consumption) that are
//       not included in another one's (included_in_stat); null when the prefs name neither
//   energyToday(hass, now?) -> Promise<{kwh, source, stats} | null>
//       the sum of today's change (from local midnight) of those statistics in kWh
//       (recorder/statistics_during_period, period day, types change, units energy kWh); null when
//       the home has no energy prefs, or a call fails
//   todayNow(hass, onReady?, now?) -> {kwh, source, stats} | null   for a page's update(): what was
//       fetched, asked again at most every REFRESH_MS; onReady runs once when an answer lands

export const REFRESH_MS = 5 * 60 * 1000;

export function energySources(prefs) {
  const sources = Array.isArray(prefs?.energy_sources) ? prefs.energy_sources : [];
  const grid = sources.filter((s) => s?.type === "grid")
    .flatMap((s) => [...(Array.isArray(s.flow_from) ? s.flow_from.map((f) => f?.stat_energy_from) : []),
      s.stat_energy_from])
    .filter((id) => typeof id === "string" && id);
  if (grid.length) return { source: "grid", stats: [...new Set(grid)] };
  const devices = (Array.isArray(prefs?.device_consumption) ? prefs.device_consumption : [])
    .filter((d) => d && !d.included_in_stat).map((d) => d.stat_consumption)
    .filter((id) => typeof id === "string" && id);
  return devices.length ? { source: "devices", stats: [...new Set(devices)] } : null;
}

function midnight(now) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export async function energyToday(hass, now = Date.now()) {
  if (typeof hass?.callWS !== "function") return null;
  try {
    const found = energySources(await hass.callWS({ type: "energy/get_prefs" }));
    if (!found) return null;
    const stats = await hass.callWS({
      type: "recorder/statistics_during_period", period: "day", types: ["change"],
      statistic_ids: found.stats, units: { energy: "kWh" },
      start_time: new Date(midnight(now)).toISOString(), end_time: new Date(now).toISOString(),
    });
    let kwh = 0;
    for (const id of found.stats) {
      for (const row of Array.isArray(stats?.[id]) ? stats[id] : []) {
        if (typeof row?.change === "number" && Number.isFinite(row.change)) kwh += row.change;
      }
    }
    return { kwh, ...found };
  } catch {
    return null;              // no prefs yet (energy/get_prefs answers not_found) or a lost call
  }
}

let cache = null;             // {at, done, value, promise, waiting}

export function todayNow(hass, onReady, now = Date.now()) {
  if (typeof hass?.callWS !== "function") return cache?.value ?? null;
  if (!cache || now - cache.at >= REFRESH_MS) {
    const entry = { at: now, done: false, value: cache?.value ?? null, waiting: new Set() };
    entry.promise = energyToday(hass, now).then((value) => {
      entry.value = value;
      entry.done = true;
      for (const fn of entry.waiting) fn();
      return value;
    });
    cache = entry;
  }
  if (!cache.done && onReady) cache.waiting.add(onReady);
  return cache.value;
}

// Tests start from an empty cache.
export function clearEnergyCache() {
  cache = null;
}
