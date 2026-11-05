// The trend sheet's chart as Home Assistant's own card (lib/ha-chart.js).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import { haChartConfig, haCharts } from "./ha-chart.js";
import * as trend from "./trend-sheet.js";
import { st, baseStates, hassOf, ctxOf } from "../testing/demo-home.mjs";

const SENSOR = "sensor.living_room_temperature";
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  delete window.loadCardHelpers;
});

test("24 h, and any range without statistics or of a timeline: history-graph over its hours", () => {
  const withStats = st("21.9", { state_class: "measurement" });
  assert.deepEqual(haChartConfig({ entity: SENSOR }, "24h", withStats),
    { type: "history-graph", entities: [{ entity: SENSOR }], hours_to_show: 24 });
  assert.deepEqual(haChartConfig({ entity: SENSOR }, "7d", st("21.9")),
    { type: "history-graph", entities: [{ entity: SENSOR }], hours_to_show: 168 }, "no state_class: no statistics");
  assert.equal(haChartConfig({ entity: "binary_sensor.door", timeline: true }, "7d", st("on", { state_class: "x" })).type,
    "history-graph");
});

test("7 d and 30 d of a sensor with statistics: statistics-graph, mean with min and max, as the Ramka's", () => {
  const state = st("21.9", { state_class: "measurement" });
  assert.deepEqual(haChartConfig({ entity: SENSOR }, "7d", state), { type: "statistics-graph", entities: [SENSOR],
    days_to_show: 7, period: "hour", stat_types: ["mean", "min", "max"], chart_type: "line", hide_legend: true });
  assert.equal(haChartConfig({ entity: SENSOR }, "30d", state).period, "day");
  assert.equal(haChartConfig({ entity: SENSOR }, "30d", state).days_to_show, 30);
});

test("in a dashboard the sheet shows Home Assistant's card per range, hands it hass, and hides its own line", async () => {
  const made = [];
  window.loadCardHelpers = async () => ({
    createCardElement(config) {
      const card = document.createElement("div");
      card.config = config;
      made.push(card);
      return card;
    },
  });
  assert.equal(haCharts(), true);
  const hass = hassOf({ ...baseStates(), [SENSOR]: st("21.9", { state_class: "measurement", unit_of_measurement: "°C" }) });
  hass.callWS = async () => ({ [SENSOR]: [] });
  const ctx = ctxOf({ hass });
  const el = trend.render(ctx, { kind: "trend", entity: SENSOR, title: "Temperature", reading: "temperature" });
  document.body.append(el);
  await settle();
  assert.equal(el.querySelector(".chart").hidden, true, "Pocket's own line is the fallback only");
  assert.equal(el.querySelector(".axis").hidden, true);
  assert.equal(made.length, 1);
  assert.equal(made[0].config.type, "history-graph");
  assert.equal(made[0].hass, hass);
  el.querySelector('[data-range="7d"]').click();
  await settle();
  assert.equal(made.length, 2);
  assert.equal(made[1].config.type, "statistics-graph");
  const boxes = [...el.querySelectorAll(".ha-chart > div")];
  assert.deepEqual(boxes.map((b) => b.hidden), [true, false], "the 24 h card kept, hidden");
  el.querySelector('[data-range="24h"]').click();
  await settle();
  assert.equal(made.length, 2, "a range shown before is not made again");
  const next = { ...hass };
  trend.update(el, ctxOf({ hass: next }));
  assert.equal(made[0].hass, next);
});
