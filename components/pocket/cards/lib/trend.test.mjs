import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { trendOf, trendArrow, trendNow, recentHistory, peekHistory, clearHistoryCache, REFRESH_MS } from "./trend.js";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const MIN = 60 * 1000;
// Points minutes before NOW: [[minutes ago, value], ...].
const pts = (...pairs) => pairs.map(([ago, v]) => ({ t: NOW - ago * MIN, v }));

beforeEach(() => clearHistoryCache());

test("each kind's step: at least it is rising or falling, less is steady", () => {
  const cases = [["temperature", 0.3], ["humidity", 2], ["co2", 50], ["pm2_5", 3], ["voc", 20], ["nox", 10], ["score", 3]];
  for (const [kind, step] of cases) {
    const base = 20;
    assert.equal(trendOf(pts([60, base], [5, base + step]), kind, NOW), "rising", kind);
    assert.equal(trendOf(pts([60, base], [5, base - step]), kind, NOW), "falling", kind);
    assert.equal(trendOf(pts([60, base], [5, base + step * 0.9]), kind, NOW), "steady", kind);
  }
});

test("a step of 0.3 in floating point (21.4 -> 21.7) still counts", () => {
  assert.equal(trendOf(pts([50, 21.4], [10, 21.7]), "temperature", NOW), "rising");
});

test("power: 10 % of the hour's mean; anything else 5 %", () => {
  assert.equal(trendOf(pts([60, 100], [5, 112]), "power", NOW), "rising");      // mean 106, step 10.6
  assert.equal(trendOf(pts([60, 100], [5, 108]), "power", NOW), "steady");
  assert.equal(trendOf(pts([60, 100], [5, 106]), "energy", NOW), "rising");     // mean 103, step 5.15
  assert.equal(trendOf(pts([60, 100], [5, 104]), "energy", NOW), "steady");
});

test("the value an hour ago is the one held then: an older point, not the first inside the hour", () => {
  // 21.0 since 90 min ago, 21.5 from 30 min: risen by 0.5 over the hour.
  assert.equal(trendOf(pts([90, 21.0], [120, 20.0], [30, 21.5]), "temperature", NOW), "rising");
  // Nothing changed within the hour: only the held value, one number, no direction.
  assert.equal(trendOf(pts([180, 20], [90, 21]), "temperature", NOW), null);
});

test("gaps are skipped; fewer than two numbers give null", () => {
  assert.equal(trendOf(pts([50, null], [10, 21]), "temperature", NOW), null);
  assert.equal(trendOf([], "temperature", NOW), null);
  assert.equal(trendOf(null, "temperature", NOW), null);
  assert.equal(trendOf(pts([50, 21], [30, null], [10, 20]), "temperature", NOW), "falling");
});

test("trendArrow: a glyph per direction, nothing for none", () => {
  assert.equal(trendArrow("rising"), "↑");
  assert.equal(trendArrow("falling"), "↓");
  assert.equal(trendArrow("steady"), "→");
  assert.equal(trendArrow(null), "");
});

function fakeHass(answer = () => ({ "sensor.t": [{ s: "21", lu: (NOW - 50 * MIN) / 1000 }] })) {
  const calls = [];
  return { calls, callWS: (msg) => { calls.push(msg); return Promise.resolve(answer(msg)); } };
}

test("recentHistory: the last hour, one fetch per entity shared by every caller within 5 minutes", async () => {
  const hass = fakeHass();
  const [a, b] = await Promise.all([recentHistory(hass, "sensor.t", NOW), recentHistory(hass, "sensor.t", NOW + MIN)]);
  assert.equal(hass.calls.length, 1);
  assert.equal(a, b);
  assert.deepEqual(a, [{ t: NOW - 50 * MIN, v: 21 }]);
  assert.equal(hass.calls[0].start_time, new Date(NOW - 60 * MIN).toISOString());
  assert.deepEqual(peekHistory("sensor.t"), a);
  await recentHistory(hass, "sensor.t", NOW + REFRESH_MS);
  assert.equal(hass.calls.length, 2, "refreshed after 5 minutes");
  await recentHistory(hass, "sensor.other", NOW + REFRESH_MS);
  assert.equal(hass.calls.length, 3, "another entity has its own entry");
});

test("recentHistory: a failed fetch gives null and is not retried before 5 minutes", async () => {
  const calls = [];
  const hass = { callWS: (msg) => { calls.push(msg); return Promise.reject(new Error("down")); } };
  assert.equal(await recentHistory(hass, "sensor.t", NOW), null);
  assert.equal(await recentHistory(hass, "sensor.t", NOW + MIN), null);
  assert.equal(calls.length, 1);
  assert.equal(peekHistory("sensor.t"), null);
});

test("recentHistory: no entity or no websocket gives null without a call", async () => {
  assert.equal(await recentHistory({}, "sensor.t", NOW), null);
  assert.equal(await recentHistory(fakeHass(), undefined, NOW), null);
});

test("trendNow: the cached direction; one fetch, each waiting widget told once when it lands", async () => {
  const hass = fakeHass(() => ({ "sensor.t": [{ s: "21", lu: (NOW - 50 * MIN) / 1000 }, { s: "21.6", lu: (NOW - 5 * MIN) / 1000 }] }));
  const heard = [];
  const a = () => heard.push("a");
  const b = () => heard.push("b");
  assert.equal(trendNow(hass, "sensor.t", "temperature", a, NOW), null, "nothing yet");
  trendNow(hass, "sensor.t", "temperature", a, NOW);
  trendNow(hass, "sensor.t", "temperature", b, NOW);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(heard.sort(), ["a", "b"]);
  assert.equal(hass.calls.length, 1);
  assert.equal(trendNow(hass, "sensor.t", "temperature", a, NOW + MIN), "rising");
  assert.equal(hass.calls.length, 1, "within REFRESH_MS: no fetch");
  trendNow(hass, "sensor.t", "temperature", a, NOW + REFRESH_MS);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(hass.calls.length, 2, "stale: fetched again");
  assert.equal(trendNow(hass, undefined, "temperature", a, NOW), null);
  assert.equal(trendNow({}, "sensor.none", "temperature", a, NOW), null, "no websocket: no direction");
});

test("the entities asked in one task share one history call; each gets its own points", async () => {
  const hass = fakeHass((msg) => Object.fromEntries(msg.entity_ids.map((id, i) =>
    [id, [{ s: String(i), lu: (NOW - 50 * MIN) / 1000 }]])));
  const ids = ["sensor.a", "sensor.b", "sensor.c", "sensor.d"];
  const answers = await Promise.all(ids.map((id) => recentHistory(hass, id, NOW)));
  assert.equal(hass.calls.length, 1, "one call for four entities");
  assert.deepEqual(hass.calls[0].entity_ids, ids);
  assert.deepEqual(answers.map((points) => points[0].v), [0, 1, 2, 3]);
  await recentHistory(hass, "sensor.e", NOW + MIN);
  assert.equal(hass.calls.length, 2, "a later task its own call");
});

test("a failed batch gives null to every entity in it", async () => {
  const calls = [];
  const hass = { callWS: (msg) => { calls.push(msg); return Promise.reject(new Error("down")); } };
  const answers = await Promise.all(["sensor.a", "sensor.b"].map((id) => recentHistory(hass, id, NOW)));
  assert.deepEqual(answers, [null, null]);
  assert.equal(calls.length, 1);
});
