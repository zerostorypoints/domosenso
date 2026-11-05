import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { energySources, energyToday, todayNow, clearEnergyCache, REFRESH_MS } from "./energy.js";

beforeEach(() => clearEnergyCache());

const PREFS = {
  energy_sources: [
    { type: "grid", flow_from: [{ stat_energy_from: "sensor.grid_import_t1" }, { stat_energy_from: "sensor.grid_import_t2" }],
      flow_to: [{ stat_energy_to: "sensor.grid_export" }] },
    { type: "solar", stat_energy_from: "sensor.solar" },
  ],
  device_consumption: [{ stat_consumption: "sensor.tv_energy" }],
};

test("the grid's imports when the home has a grid; else the devices not inside another's; else null", () => {
  assert.deepEqual(energySources(PREFS), { source: "grid", stats: ["sensor.grid_import_t1", "sensor.grid_import_t2"] });
  assert.deepEqual(energySources({ energy_sources: [{ type: "grid", stat_energy_from: "sensor.grid" }] }),
    { source: "grid", stats: ["sensor.grid"] }, "a grid source with its statistic on itself");
  assert.deepEqual(energySources({ energy_sources: [], device_consumption: [
    { stat_consumption: "sensor.kitchen" }, { stat_consumption: "sensor.kettle", included_in_stat: "sensor.kitchen" }] }),
  { source: "devices", stats: ["sensor.kitchen"] });
  assert.equal(energySources({ energy_sources: [], device_consumption: [] }), null);
  assert.equal(energySources(null), null);
});

function hassWith(prefs, stats, calls = []) {
  return { callWS: async (msg) => {
    calls.push(msg);
    if (msg.type === "energy/get_prefs") {
      if (!prefs) throw { code: "not_found", message: "No prefs" };
      return prefs;
    }
    if (msg.type === "recorder/statistics_during_period") return stats;
    throw new Error("unknown");
  } };
}

test("today: the sum of today's change in kWh, from local midnight", async () => {
  const calls = [];
  const now = new Date(2026, 10, 5, 14, 30).getTime();
  const stats = { "sensor.grid_import_t1": [{ start: 0, change: 3.25 }], "sensor.grid_import_t2": [{ start: 0, change: 1.5 }, { change: null }] };
  const today = await energyToday(hassWith(PREFS, stats, calls), now);
  assert.deepEqual(today, { kwh: 4.75, source: "grid", stats: ["sensor.grid_import_t1", "sensor.grid_import_t2"] });
  const ask = calls[1];
  assert.equal(ask.period, "day");
  assert.deepEqual(ask.types, ["change"]);
  assert.deepEqual(ask.units, { energy: "kWh" });
  assert.equal(Date.parse(ask.start_time), new Date(2026, 10, 5).getTime());
  assert.equal(Date.parse(ask.end_time), now);
});

test("today: no prefs, a failed call or no connection give null", async () => {
  assert.equal(await energyToday(hassWith(null, {})), null);
  assert.equal(await energyToday({ callWS: () => Promise.reject(new Error("lost")) }), null);
  assert.equal(await energyToday({}), null);
});

test("todayNow: asks once per REFRESH_MS and tells the page when the answer lands", async () => {
  const calls = [];
  const hass = hassWith(PREFS, { "sensor.grid_import_t1": [{ change: 2 }] }, calls);
  let ready = 0;
  const now = Date.now();
  assert.equal(todayNow(hass, () => { ready += 1; }, now), null);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(ready, 1);
  assert.equal(todayNow(hass, null, now + 1000).kwh, 2);
  assert.equal(calls.length, 2, "nothing asked again inside REFRESH_MS");
  todayNow(hass, null, now + REFRESH_MS);
  assert.equal(calls.length, 3);
});
