import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import { trendSpec, render, update, chartOf, timelineOf, onShare, TREND_STYLE } from "./trend-sheet.js";
import { areasOf } from "./areas.js";
import { config, st, baseStates, hassOf, ctxOf, text } from "../testing/demo-home.mjs";

const HOUR = 3600 * 1000;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// The demo home's hass with a websocket: canned history and statistics, every message recorded.
// answers[type] is an answer, a function of the message, or an Error (the call rejects); a
// deferred answer (a Promise) lets a test look at the loading state.
function wsHass(answers, states = baseStates()) {
  const hass = hassOf(states);
  hass.ws = [];
  hass.callWS = (msg) => {
    hass.ws.push(msg);
    const answer = answers[msg.type];
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve(typeof answer === "function" ? answer(msg) : answer);
  };
  return hass;
}

const history = (id, values) => (msg) => {
  const start = Date.parse(msg.start_time);
  const end = Date.parse(msg.end_time);
  const step = (end - start) / values.length;
  return { [id]: values.map((v, i) => ({ s: String(v), lu: (start + i * step) / 1000 })) };
};
const statistics = (id, means) => (msg) => {
  const start = Date.parse(msg.start_time);
  const step = msg.period === "day" ? 24 * HOUR : HOUR;
  return { [id]: means.map((mean, i) => ({ start: start + i * step, mean })) };
};

const room = (id) => areasOf(config).find((area) => area.id === id);

function mount(ctx, spec) {
  const el = render(ctx, spec);
  document.body.append(el);
  return el;
}

beforeEach(() => { document.body.innerHTML = ""; });

test("trendSpec: a room's temperature, its comfort range as band and level", () => {
  const ctx = ctxOf();
  assert.deepEqual(trendSpec(ctx, room("living_room"), "temperature"), {
    kind: "trend", entity: "sensor.living_room_temperature", reading: "temperature",
    title: "Temperature", subtitle: "Living room",
    level: { kind: "range", low: "input_number.lr_temp_low", high: "input_number.lr_temp_high" },
    band: { low: "input_number.lr_temp_low", high: "input_number.lr_temp_high" },
  });
});

test("trendSpec: air readings band below fair (rising) or above it (the score, falling)", () => {
  const ctx = ctxOf();
  const co2 = trendSpec(ctx, room("living_room"), "co2");
  assert.deepEqual(co2.band, { high: "input_number.co2_fair" });
  assert.deepEqual(co2.level, { kind: "rising", fair: "input_number.co2_fair", poor: "input_number.co2_poor" });
  const score = trendSpec(ctx, room("living_room"), "score");
  assert.deepEqual(score.band, { low: "input_number.score_fair" });
  assert.equal(score.level.kind, "falling");
  assert.equal(score.title, "Air score");
});

test("trendSpec: no entity gives null; a reading without limits has no band", () => {
  const ctx = ctxOf();
  assert.equal(trendSpec(ctx, room("office"), "temperature"), null);
  assert.equal(trendSpec(ctx, undefined, "temperature"), null);
  const cfg = { ...config, outside: { temperature: "sensor.outside_temperature" }, weather: "weather.home",
    thresholds: { ...config.thresholds, outside: { temp_low: "input_number.out_low", temp_high: "input_number.out_high" } } };
  const out = areasOf(cfg, ctxOf().t).find((a) => a.outside);
  const spec = trendSpec(ctxOf({ cfg }), out, "temperature");
  assert.equal(spec.subtitle, "Outside");
  assert.deepEqual(spec.band, { low: "input_number.out_low", high: "input_number.out_high" });
  assert.equal(trendSpec(ctxOf({ cfg }), out, "humidity"), null, "the weather's attribute has no history");
  const bare = { ...config, thresholds: {} };
  assert.equal(trendSpec(ctxOf({ cfg: bare }), room("living_room"), "temperature").band, undefined);
});

test("24 h: loading first, then the line from history over the shaded comfort band", async () => {
  const hass = wsHass({ "history/history_during_period": history("sensor.living_room_temperature", [21, 21.5, 22.4, 21.1]) });
  const ctx = ctxOf({ hass });
  const el = mount(ctx, trendSpec(ctx, room("living_room"), "temperature"));
  assert.equal(text(el.querySelector(".state")), "Loading…");
  assert.equal(el.querySelector("svg").hidden, true);
  await tick();
  assert.equal(hass.ws.length, 1);
  assert.equal(hass.ws[0].type, "history/history_during_period");
  assert.deepEqual(hass.ws[0].entity_ids, ["sensor.living_room_temperature"]);
  assert.equal(el.querySelector(".state").hidden, true);
  assert.equal(el.querySelector("svg").hidden, false);
  const path = el.querySelector(".line").getAttribute("d");
  assert.match(path, /^M0 [\d.]+( L[\d.]+ [\d.]+){4}$/, "four points and the last value held to now");
  assert.equal(el.querySelector(".band").hidden, false);
  assert.equal(text(el.querySelector(".title")), "Temperature");
  assert.equal(text(el.querySelector(".where")), "Living room");
  assert.equal(text(el.querySelector(".big")), "21.7°");
  assert.ok(el.querySelector(".big").classList.contains("lv-good"));
  assert.equal(text(el.querySelector(".note")), "Range 20.0°–24.0° · 24 h: 21.0°–22.4°");
  assert.notEqual(text(el.querySelector(".from")), "");
});

test("7 d hourly and 30 d daily statistics; a switch back shows what was fetched", async () => {
  const id = "sensor.living_room_temperature";
  const hass = wsHass({
    "history/history_during_period": history(id, [21, 22]),
    "recorder/statistics_during_period": statistics(id, [20.5, 21, 23]),
  });
  const ctx = ctxOf({ hass });
  const el = mount(ctx, trendSpec(ctx, room("living_room"), "temperature"));
  await tick();
  const button = (range) => el.querySelector(`.seg button[data-range="${range}"]`);
  assert.deepEqual([...el.querySelectorAll(".seg button")].map(text), ["24 h", "7 d", "30 d"]);
  assert.equal(button("24h").getAttribute("aria-pressed"), "true");
  button("7d").click();
  assert.equal(button("7d").getAttribute("aria-pressed"), "true");
  assert.equal(button("24h").getAttribute("aria-pressed"), "false");
  await tick();
  button("30d").click();
  await tick();
  assert.deepEqual(hass.ws.map((m) => [m.type, m.period, m.types]), [
    ["history/history_during_period", undefined, undefined],
    ["recorder/statistics_during_period", "hour", ["mean"]],
    ["recorder/statistics_during_period", "day", ["mean"]],
  ]);
  assert.match(text(el.querySelector(".note")), /30 d: 20\.5°–23\.0°/);
  button("24h").click();
  await tick();
  assert.equal(hass.ws.length, 3, "24 h is not fetched again");
  assert.match(text(el.querySelector(".note")), /24 h: 21\.0°–22\.0°/);
});

test("a sensor without statistics: 7 d from its history", async () => {
  const id = "sensor.living_room_temperature";
  const hass = wsHass({ "history/history_during_period": history(id, [21, 22]), "recorder/statistics_during_period": {} });
  const ctx = ctxOf({ hass });
  const el = mount(ctx, trendSpec(ctx, room("living_room"), "temperature"));
  el.querySelector('.seg button[data-range="7d"]').click();
  await tick();
  assert.deepEqual(hass.ws.map((m) => m.type).slice(1),
    ["recorder/statistics_during_period", "history/history_during_period"]);
  assert.equal(el.querySelector("svg").hidden, false);
});

test("no numbers in the period: the empty text; a failed call: the error text", async () => {
  const id = "sensor.living_room_temperature";
  const empty = wsHass({ "history/history_during_period": history(id, ["unavailable"]) });
  let ctx = ctxOf({ hass: empty });
  let el = mount(ctx, trendSpec(ctx, room("living_room"), "temperature"));
  await tick();
  assert.equal(text(el.querySelector(".state")), "No data for this period");
  assert.equal(el.querySelector("svg").hidden, true);
  const failing = wsHass({ "history/history_during_period": new Error("down") });
  ctx = ctxOf({ hass: failing });
  el = mount(ctx, trendSpec(ctx, room("living_room"), "temperature"));
  await tick();
  assert.equal(text(el.querySelector(".state")), "Could not load the history");
});

test("translated in pl and de, numbers in the language's format", async () => {
  const id = "sensor.living_room_temperature";
  for (const [lang, loading, range, note] of [
    ["pl", "Wczytywanie…", "7 dni", "Zakres 20,0°–24,0° · 24 h: 21,0°–22,0°"],
    ["de", "Wird geladen…", "7 T", "Bereich 20.0°–24.0° · 24 h: 21.0°–22.0°"],
  ]) {
    const hass = wsHass({ "history/history_during_period": history(id, [21, 22]) });
    const ctx = ctxOf({ hass, lang });
    const el = mount(ctx, trendSpec(ctx, room("living_room"), "temperature"));
    assert.equal(text(el.querySelector(".state")), loading, lang);
    assert.equal(text(el.querySelector('.seg button[data-range="7d"]')), range, lang);
    await tick();
    assert.equal(text(el.querySelector(".note")), note, lang);
  }
});

test("level colours: below the range cold, above it warm, an air reading fair --warn; a unit from the entity", () => {
  const states = baseStates();
  states["sensor.living_room_temperature"] = st(18.5);
  states["sensor.living_room_co2"] = st(900, { unit_of_measurement: "ppm" });
  const hass = wsHass({ "history/history_during_period": {}, "recorder/statistics_during_period": {} }, states);
  const ctx = ctxOf({ hass });
  const temp = mount(ctx, trendSpec(ctx, room("living_room"), "temperature"));
  assert.ok(temp.querySelector(".big").classList.contains("lv-cold"));
  ctx.hass = wsHass({}, { ...states, "sensor.living_room_temperature": st(25) });
  update(temp, ctx);
  assert.ok(temp.querySelector(".big").classList.contains("lv-warm"));
  const co2 = mount(ctx, trendSpec(ctx, room("living_room"), "co2"));
  assert.equal(text(co2.querySelector(".big")), "900 ppm");
  assert.ok(co2.querySelector(".big").classList.contains("lv-fair"));
  assert.equal(text(co2.querySelector(".note")), "Up to 800 ppm");
});

test("update patches in place: the same elements, the new value", async () => {
  const id = "sensor.living_room_temperature";
  const hass = wsHass({ "history/history_during_period": history(id, [21, 22]) });
  const ctx = ctxOf({ hass });
  const el = mount(ctx, trendSpec(ctx, room("living_room"), "temperature"));
  await tick();
  const big = el.querySelector(".big");
  const line = el.querySelector(".line");
  const states = { ...baseStates(), [id]: st(23.4) };
  ctx.hass = { ...hass, states };
  update(el, ctx);
  assert.equal(el.querySelector(".big"), big);
  assert.equal(el.querySelector(".line"), line);
  assert.equal(text(big), "23.4°");
  assert.equal(hass.ws.length, 1, "an update fetches nothing");
});

test("chartOf: time across, value up, the band's edges in range, a gap breaks the line", () => {
  const chart = chartOf([{ t: 0, v: 10 }, { t: 50, v: null }, { t: 60, v: 20 }, { t: 100, v: 20 }],
    { low: 12, high: 18 }, 0, 100);
  assert.equal(chart.path, "M0 139.7 M192 10.3 L320 10.3");
  assert.ok(chart.band.y > 10.3 && chart.band.y + chart.band.height < 139.7);
  const flat = chartOf([{ t: 0, v: 5 }], {}, 0, 100);
  assert.equal(flat.path, "M0 75 L320 75", "a flat line in the middle, held to the end");
  assert.equal(flat.band, null);
});

test("sizes: switch buttons at least 44 px, text at least 11.5 px", () => {
  assert.match(TREND_STYLE, /\.seg button \{[^}]*min-height: 44px/);
  for (const m of TREND_STYLE.matchAll(/font-size: ([\d.]+)px/g)) assert.ok(Number(m[1]) >= 11.5, m[0]);
});

test("a range whose fetch failed is fetched again when the person switches back to it", async () => {
  const id = "sensor.living_room_temperature";
  let down = true;
  const hass = wsHass({
    "history/history_during_period": (msg) => (down ? Promise.reject(new Error("down")) : history(id, [21, 22])(msg)),
    "recorder/statistics_during_period": statistics(id, [21, 22]),
  });
  const ctx = ctxOf({ hass });
  const el = mount(ctx, trendSpec(ctx, room("living_room"), "temperature"));
  await tick();
  assert.equal(text(el.querySelector(".state")), "Could not load the history");
  el.querySelector('[data-range="7d"]').click();
  await tick();
  down = false;
  el.querySelector('[data-range="24h"]').click();
  await tick();
  await tick();
  assert.equal(el.querySelector("svg").hidden, false, "the retry drew the line");
  assert.equal(hass.ws.filter((m) => m.type === "history/history_during_period").length, 2);
  assert.equal(el._trend.request, undefined, "no request counter");
});

test("timeline: an on/off entity's states over 24 h and 7 d from history, no statistics", async () => {
  const states = { ...baseStates(), "binary_sensor.door": st("on", { device_class: "door" }) };
  const hass = wsHass({ "history/history_during_period": history("binary_sensor.door", ["off", "on", "unavailable", "on"]) }, states);
  const ctx = ctxOf({ hass });
  const el = mount(ctx, { kind: "trend", entity: "binary_sensor.door", title: "Door", subtitle: "Hall", timeline: true });
  assert.deepEqual([...el.querySelectorAll(".seg button")].map((b) => b.dataset.range), ["24h", "7d"]);
  await tick();
  update(el, ctx);
  assert.equal(text(el.querySelector(".big")), "On");
  const rects = [...el.querySelectorAll(".timeline rect")];
  assert.deepEqual(rects.map((r) => [r.getAttribute("data-state"), r.getAttribute("class")]),
    [["off", "tl-other"], ["on", "tl-on"], ["on", "tl-on"]], "unavailable is a gap");
  assert.equal(text(el.querySelector(".note")), "On 50 % of 24 h");
  assert.equal(el.querySelector(".line").getAttribute("d"), null, "no line");
  el.querySelector('.seg button[data-range="7d"]').click();
  await tick();
  assert.deepEqual(hass.ws.map((m) => m.type), ["history/history_during_period", "history/history_during_period"]);
  assert.equal(Date.parse(hass.ws[1].end_time) - Date.parse(hass.ws[1].start_time), 7 * 24 * HOUR);
});

test("timeline: segments and the share of on time", () => {
  const points = [{ t: 0, s: "off" }, { t: 25, s: "on" }, { t: 75, s: "unknown" }];
  assert.deepEqual(timelineOf(points, 0, 100), [{ x: 0, width: 80, state: "off", on: false }, { x: 80, width: 160, state: "on", on: true }]);
  assert.equal(onShare(points, 0, 100), 0.5);
  assert.equal(onShare([{ t: 0, s: "idle" }], 0, 100), null);
  assert.equal(onShare([{ t: -50, s: "on" }], 0, 100), 1, "a state from before the period counts from its start");
});
