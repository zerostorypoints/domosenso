import { test } from "node:test";
import assert from "node:assert/strict";
import { historyPoints, historyPointsOf, statisticsPoints, seriesOf, RANGES } from "./history.js";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const HOUR = 3600 * 1000;

// A hass whose callWS answers by message type and records every message.
function fakeHass(answers) {
  const calls = [];
  return { calls, callWS: (msg) => {
    calls.push(msg);
    const answer = answers[msg.type];
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(typeof answer === "function" ? answer(msg) : answer);
  } };
}

test("history: the websocket message names the entity, the span, minimal and without attributes", async () => {
  const hass = fakeHass({ "history/history_during_period": {} });
  await historyPoints(hass, "sensor.t", NOW - HOUR, NOW);
  assert.deepEqual(hass.calls, [{ type: "history/history_during_period", start_time: "2026-11-05T11:00:00.000Z",
    end_time: "2026-11-05T12:00:00.000Z", entity_ids: ["sensor.t"], minimal_response: true, no_attributes: true }]);
});

test("history: compressed states (s, lu in seconds) become points; a non-number is a gap", async () => {
  const s = (iso) => Date.parse(iso) / 1000;
  const hass = fakeHass({ "history/history_during_period": { "sensor.t": [
    { s: "21.5", lu: s("2026-11-05T11:00:00Z") },
    { s: "unavailable", lu: s("2026-11-05T11:20:00Z") },
    { s: "22", lu: s("2026-11-05T11:40:00Z") },
  ] } });
  assert.deepEqual(await historyPoints(hass, "sensor.t", NOW - HOUR, NOW), [
    { t: Date.parse("2026-11-05T11:00:00Z"), v: 21.5 },
    { t: Date.parse("2026-11-05T11:20:00Z"), v: null },
    { t: Date.parse("2026-11-05T11:40:00Z"), v: 22 },
  ]);
});

test("history: the REST shape (state, last_changed) is read too, and an entity missing from the answer is empty", async () => {
  const hass = fakeHass({ "history/history_during_period": { "sensor.t": [{ state: "3", last_changed: "2026-11-05T11:30:00Z" }] } });
  assert.deepEqual(await historyPoints(hass, "sensor.t", NOW - HOUR, NOW), [{ t: Date.parse("2026-11-05T11:30:00Z"), v: 3 }]);
  assert.deepEqual(await historyPoints(hass, "sensor.other", NOW - HOUR, NOW), []);
});

test("statistics: means with their start in ms; the message asks for one period and the mean", async () => {
  const hass = fakeHass({ "recorder/statistics_during_period": { "sensor.t": [
    { start: NOW - 2 * HOUR, mean: 21.2 }, { start: NOW - HOUR, mean: null }] } });
  assert.deepEqual(await statisticsPoints(hass, "sensor.t", NOW - 7 * 24 * HOUR, NOW, "hour"),
    [{ t: NOW - 2 * HOUR, v: 21.2 }, { t: NOW - HOUR, v: null }]);
  const [msg] = hass.calls;
  assert.equal(msg.type, "recorder/statistics_during_period");
  assert.deepEqual(msg.statistic_ids, ["sensor.t"]);
  assert.equal(msg.period, "hour");
  assert.deepEqual(msg.types, ["mean"]);
});

test("series: 24 h from history, 7 d hourly and 30 d daily statistics", async () => {
  const hass = fakeHass({
    "history/history_during_period": { "sensor.t": [{ s: "1", lu: (NOW - HOUR) / 1000 }] },
    "recorder/statistics_during_period": { "sensor.t": [{ start: NOW - HOUR, mean: 2 }] },
  });
  assert.deepEqual(await seriesOf(hass, "sensor.t", "24h", NOW), [{ t: NOW - HOUR, v: 1 }]);
  assert.deepEqual(await seriesOf(hass, "sensor.t", "7d", NOW), [{ t: NOW - HOUR, v: 2 }]);
  assert.deepEqual(await seriesOf(hass, "sensor.t", "30d", NOW), [{ t: NOW - HOUR, v: 2 }]);
  assert.deepEqual(hass.calls.map((c) => [c.type, c.period, c.start_time]), [
    ["history/history_during_period", undefined, new Date(NOW - RANGES["24h"].span).toISOString()],
    ["recorder/statistics_during_period", "hour", new Date(NOW - RANGES["7d"].span).toISOString()],
    ["recorder/statistics_during_period", "day", new Date(NOW - RANGES["30d"].span).toISOString()],
  ]);
});

test("series: a sensor without statistics falls back to its history over the same span", async () => {
  const hass = fakeHass({
    "history/history_during_period": { "sensor.t": [{ s: "5", lu: (NOW - 3 * 24 * HOUR) / 1000 }] },
    "recorder/statistics_during_period": {},
  });
  assert.deepEqual(await seriesOf(hass, "sensor.t", "7d", NOW), [{ t: NOW - 3 * 24 * HOUR, v: 5 }]);
  assert.equal(hass.calls[1].type, "history/history_during_period");
  assert.equal(hass.calls[1].start_time, new Date(NOW - RANGES["7d"].span).toISOString());
});

test("series: a failed call rejects, an unknown range throws", async () => {
  const hass = fakeHass({ "history/history_during_period": new Error("boom") });
  await assert.rejects(seriesOf(hass, "sensor.t", "24h", NOW), /boom/);
  await assert.rejects(seriesOf(hass, "sensor.t", "1y", NOW), /unknown range/);
});

test("historyPointsOf: several entities in one call, each its points; one with no rows gets []", async () => {
  const hass = fakeHass({ "history/history_during_period": {
    "sensor.a": [{ s: "1", lu: (NOW - HOUR) / 1000 }, { s: "x", lu: (NOW - 1000) / 1000 }],
    "sensor.b": [{ s: "2", lu: (NOW - 2000) / 1000 }] } });
  const points = await historyPointsOf(hass, ["sensor.a", "sensor.b", "sensor.c"], NOW - HOUR, NOW);
  assert.equal(hass.calls.length, 1);
  assert.deepEqual(hass.calls[0].entity_ids, ["sensor.a", "sensor.b", "sensor.c"]);
  assert.deepEqual(points, { "sensor.a": [{ t: NOW - HOUR, v: 1 }, { t: NOW - 1000, v: null }],
    "sensor.b": [{ t: NOW - 2000, v: 2 }], "sensor.c": [] });
});
