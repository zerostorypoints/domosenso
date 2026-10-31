import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import "./line-style-card.js";

afterEach(() => { mock.timers.reset(); delete window.__lineStyleHelpers; delete window.loadCardHelpers; });

// A stand-in for HA's chart: `data` is an accessor on its class, as with the real element.
class FakeChart extends HTMLElement {
  set data(v) { this._data = v; }
  get data() { return this._data; }
}
if (!customElements.get("ha-chart-base")) customElements.define("ha-chart-base", FakeChart);

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function makeCard(config) {
  // The card re-looks for the chart at 0.2 s, 1 s, 3 s and 10 s; none of them may keep node alive.
  mock.timers.enable({ apis: ["setTimeout"] });
  const inner = document.createElement("div");
  inner.attachShadow({ mode: "open" }).appendChild(document.createElement("ha-chart-base"));
  const made = [];
  window.loadCardHelpers = async () => ({ createCardElement: (c) => { made.push(c); return inner; } });
  const card = document.createElement("line-style-card");
  card.setConfig(config);
  await flush();
  return { card, inner, made, chart: inner.shadowRoot.querySelector("ha-chart-base") };
}

const series = (id) => ({ id, lineStyle: { width: 1.5 }, name: id });

test("the inner card is required", () => {
  assert.throws(() => document.createElement("line-style-card").setConfig({}), /card is required/);
});

test("the inner card is built from `card`, and grid_options pass on to it", async () => {
  const { made } = await makeCard({ card: { type: "statistics-graph" }, grid_options: { columns: 18, rows: 4 } });
  assert.deepEqual(made, [{ type: "statistics-graph", grid_options: { columns: 18, rows: 4 } }]);
});

test("a series whose id starts with a styled entity gets the style merged over HA's", async () => {
  const { card, chart } = await makeCard({
    card: { type: "statistics-graph" },
    line_styles: { "sensor.outside": { width: 3, type: [8, 5] } },
  });
  card.hass = { states: {} };
  card._hook();
  chart.data = [series("sensor.outside-mean"), series("sensor.living-mean")];
  assert.deepEqual(chart.data[0].lineStyle, { width: 3, type: [8, 5] });
  assert.deepEqual(chart.data[1].lineStyle, { width: 1.5 });
});

test("an entity is not matched by a longer entity id that merely starts the same", async () => {
  const { card, chart } = await makeCard({ card: { type: "x" }, line_styles: { "sensor.out": { width: 3 } } });
  card.hass = { states: {} };
  card._hook();
  chart.data = [series("sensor.outside-mean"), series("sensor.out-mean"), series("sensor.out")];
  assert.deepEqual(chart.data.map((s) => s.lineStyle.width), [1.5, 3, 3]);
});

test("data that is not a series list passes through untouched", async () => {
  const { card, chart } = await makeCard({ card: { type: "x" }, line_styles: { "sensor.a": { width: 3 } } });
  card.hass = { states: {} };
  card._hook();
  chart.data = undefined;
  assert.equal(chart.data, undefined);
});

test("size hints fall back when the inner card gives none", async () => {
  const { card } = await makeCard({ card: { type: "x" } });
  assert.equal(card.getCardSize(), 4);
  assert.deepEqual(card.getGridOptions(), { columns: 12, rows: 4 });
});

test("with rooms, the inner card charts the rooms' readings, then `after`; without, its own entities", async () => {
  const own = [{ entity: "sensor.a" }];
  const { card, made } = await makeCard({
    card: { type: "statistics-graph", entities: own },
    rooms: { entity: "sensor.rooms", key: "extra", after: [{ entity: "sensor.out", name: "Outside" }] },
  });
  card.hass = { states: {} };
  await flush();
  assert.equal(made.length, 1);
  assert.deepEqual(made[0].entities, own);
  const rooms = [{ label: "K", main: "sensor.k_t", extra: "sensor.k_h" }, { label: "H", main: "sensor.h_t", extra: "" }];
  card.hass = { states: { "sensor.rooms": { attributes: { rooms } } } };
  await flush();
  assert.deepEqual(made.at(-1).entities, [{ entity: "sensor.k_h", name: "K" }, { entity: "sensor.out", name: "Outside" }]);
  // An Air quality widget stays off the charts: its PM2.5 is no humidity.
  const withAir = [...rooms, { type: "air", label: "A", main: "sensor.co2", extra: "sensor.pm25" }];
  card.hass = { states: { "sensor.rooms": { attributes: { rooms: withAir } } } };
  await flush();
  assert.deepEqual(made.at(-1).entities, [{ entity: "sensor.k_h", name: "K" }, { entity: "sensor.out", name: "Outside" }]);
  card.hass = { states: { "sensor.rooms": { attributes: { rooms: [withAir[2]] } } } };
  await flush();
  assert.deepEqual(made.at(-1).entities, own);
  card.hass = { states: { "sensor.rooms": { attributes: { rooms } } } };
  await flush();
  // The same rooms again build nothing new.
  const count = made.length;
  card.hass = { states: { "sensor.rooms": { attributes: { rooms } } } };
  await flush();
  assert.equal(made.length, count);
});

test("with rooms, spacers are skipped, only the first `slots` places count, and each line has its room's colour", async () => {
  const { card, made, chart } = await makeCard({
    card: { type: "statistics-graph", entities: [{ entity: "sensor.a" }] },
    line_styles: { "sensor.out": { width: 3 } },
    rooms: { entity: "sensor.rooms", slots: "input_number.slots", key: "extra", after: [{ entity: "sensor.out", name: "Outside" }] },
  });
  const rooms = [{ spacer: true }, { label: "K", main: "sensor.k_t", extra: "sensor.k_h" }, { label: "H", main: "sensor.h_t", extra: "" },
                 { label: "B", main: "sensor.b_t", extra: "sensor.b_h" }, { label: "Z", main: "sensor.z_t", extra: "sensor.z_h" }];
  card.hass = { states: { "sensor.rooms": { attributes: { rooms } }, "input_number.slots": { state: "4.0" } } };
  await flush();
  // Z is beyond the four places; H has no humidity, so B is the second line but the third room.
  assert.deepEqual(made.at(-1).entities, [{ entity: "sensor.k_h", name: "K" }, { entity: "sensor.b_h", name: "B" },
                                          { entity: "sensor.out", name: "Outside" }]);
  card._hook();
  chart.data = [series("sensor.k_h-mean"), series("sensor.b_h-mean"), series("sensor.out-mean"), series("sensor.x-mean")];
  // Series colours 1, 3 and 4: the theme's slots 4, 6 and 9 (blue, amber and red left out), here
  // HA's fallbacks for them.
  const [first, third, fourth] = ["#6cc5b0", "#ff8ab7", "#01ab63"];
  assert.deepEqual(chart.data.map((s) => s.color), [first, third, fourth, undefined]);
  assert.deepEqual(chart.data.map((s) => s.lineStyle.color), [first, third, fourth, undefined]);
  assert.equal(chart.data[0].itemStyle.color, first);
  // The line style and the colour together.
  assert.deepEqual(chart.data[2].lineStyle, { width: 3, color: fourth });
  // The theme's series colour wins over the fallback.
  document.body.append(card);  // computed styles need a connected element
  card.style.setProperty("--graph-color-6", "#123456");
  chart.data = [series("sensor.b_h-mean")];
  assert.equal(chart.data[0].color, "#123456");
  card.remove();
  // Only spacers within the places: the card's own entities.
  card.hass = { states: { "sensor.rooms": { attributes: { rooms } }, "input_number.slots": { state: "1" } } };
  await flush();
  assert.deepEqual(made.at(-1).entities, [{ entity: "sensor.a" }]);
});
