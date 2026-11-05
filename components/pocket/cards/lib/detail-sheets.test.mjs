import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import { checks, air, lights, checksSpec, airSpec, lightsSpec, DETAIL_STYLE } from "./detail-sheets.js";
import { clearHistoryCache } from "./trend.js";
import { config, st, baseStates, hassOf, ctxOf, text, texts } from "../testing/demo-home.mjs";

const frame = () => new Promise((resolve) => setTimeout(resolve, 30));   // past the next animation frame

const withOutside = { ...config,
  outside: { temperature: "sensor.outside_temperature" },
  thresholds: { ...config.thresholds, outside: { temp_low: "input_number.out_temp_low", temp_high: "input_number.out_temp_high" } } };
const states = (extra = {}) => ({ ...baseStates(), "sensor.outside_temperature": st(5),
  "input_number.out_temp_low": st(20), "input_number.out_temp_high": st(24), ...extra });

function mount(kind, ctx, spec) {
  const el = kind.render(ctx, spec);
  document.body.append(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  clearHistoryCache();
});

test("specs: titles from the translations", () => {
  const ctx = ctxOf();
  assert.deepEqual(checksSpec(ctx), { kind: "checks", title: "What was checked" });
  assert.deepEqual(checksSpec(ctx, { readings: ["temperature"], inside: true }),
    { kind: "checks", title: "Temperature inside", readings: ["temperature"], inside: true });
  assert.deepEqual(airSpec(ctx, config.rooms[0]), { kind: "air", area: "living_room", title: "Air", subtitle: "Living room" });
  assert.deepEqual(lightsSpec(ctx), { kind: "lights", title: "Lights" });
});

test("checks: every reading per area, the Outside first when it is the problem, cold in blue", () => {
  const ctx = ctxOf({ cfg: withOutside, hass: hassOf(states()) });
  const el = mount(checks, ctx, checksSpec(ctx));
  assert.equal(text(el.querySelector(".dtitle b")), "What was checked");
  assert.deepEqual(texts(el, ".gname"), ["Outside", "Living room", "Bedroom"]);
  const first = el.querySelector(".drow");
  assert.equal(text(first.querySelector(".r")), "Temperature");
  assert.equal(text(first.querySelector(".lt")), "Too cold");
  assert.equal(text(first.querySelector(".num")), "5.0°");
  assert.equal(first.querySelector(".num").className, "num lv-cold");
  assert.equal(first.querySelector(".dot").className, "dot lv-cold");
  assert.deepEqual(texts(el, ".grp:nth-child(2) .drow .r"), ["Temperature", "Humidity", "Air score", "CO₂"]);
  assert.deepEqual(texts(el, ".grp:nth-child(2) .drow .lt"), ["In range", "In range", "Good", "Good"]);
  assert.ok(el.querySelector(".empty").hidden);
});

test("checks: a row opens its reading's trend sheet", () => {
  const ctx = ctxOf({ cfg: withOutside, hass: hassOf(states()) });
  const el = mount(checks, ctx, checksSpec(ctx));
  el.querySelectorAll(".drow")[1].click();
  assert.deepEqual(ctx.sheets.map((s) => [s.kind, s.entity, s.subtitle]),
    [["trend", "sensor.living_room_temperature", "Living room"]]);
});

test("checks filtered to the rooms' temperatures (Home's inside chip)", () => {
  const ctx = ctxOf({ cfg: withOutside, hass: hassOf(states({ "sensor.bedroom_temperature": st(23) })) });
  const el = mount(checks, ctx, checksSpec(ctx, { readings: ["temperature"], inside: true }));
  assert.deepEqual(texts(el, ".gname"), ["Bedroom", "Living room"]);
  assert.deepEqual(texts(el, ".drow .lt"), ["Too warm", "In range"]);
  assert.equal(el.querySelector(".drow .num").className, "num lv-warm");
});

test("checks: no limits and no reading say so; nothing at all says so", () => {
  const cfg = { ...config, thresholds: { rooms: {}, air: {} } };
  const ctx = ctxOf({ cfg, hass: hassOf(states({ "sensor.bedroom_humidity": st("unavailable") })) });
  const el = mount(checks, ctx, checksSpec(ctx));
  const bedroom = [...el.querySelectorAll(".grp")].find((g) => text(g.querySelector(".gname")) === "Bedroom");
  assert.deepEqual(texts(bedroom, ".lt"), ["No limits set", "No reading"]);
  assert.equal(bedroom.querySelectorAll(".num")[1].className, "num muted");
  const none = ctxOf({ cfg: { ...config, rooms: [{ id: "hall", name: "Hall" }] } });
  const empty = mount(checks, none, checksSpec(none));
  assert.equal(empty.querySelector(".empty").hidden, false);
  assert.equal(text(empty.querySelector(".empty")), "Nothing to check");
});

test("checks: update patches in place, and reorders only when a level moves a row", () => {
  const ctx = ctxOf({ cfg: withOutside, hass: hassOf(states()) });
  const el = mount(checks, ctx, checksSpec(ctx));
  const row = el.querySelectorAll(".drow")[1];
  ctx.hass = hassOf(states({ "sensor.living_room_temperature": st(21.9) }));
  checks.update(el, ctx);
  assert.equal(el.querySelectorAll(".drow")[1], row, "patched");
  assert.equal(text(row.querySelector(".num")), "21.9°");
  ctx.hass = hassOf(states({ "sensor.living_room_co2": st(1300) }));
  checks.update(el, ctx);
  assert.deepEqual(texts(el, ".gname"), ["Living room", "Outside", "Bedroom"], "poor too: the home's order");
  assert.equal(text(el.querySelector(".drow .r")), "CO₂", "the poor CO₂ moves up");
});

test("arrows from the last hour's history, each row its own, fetched once", async () => {
  const hass = hassOf(states());
  hass.ws = [];
  const series = { "sensor.living_room_temperature": [21.0, 21.7], "sensor.living_room_co2": [900, 768] };
  hass.callWS = (msg) => {
    hass.ws.push(...msg.entity_ids);
    const start = Date.parse(msg.start_time);
    return Promise.resolve(Object.fromEntries(msg.entity_ids.map((id) => [id,
      (series[id] ?? [44, 44]).map((v, i) => ({ s: String(v), lu: (start + i * 1800e3) / 1000 }))])));
  };
  const ctx = ctxOf({ hass });
  const el = mount(air, ctx, airSpec(ctx, config.rooms[0]));
  await frame();
  assert.deepEqual(texts(el, ".drow .r"), ["Air score", "CO₂"]);
  const arrows = [...el.querySelectorAll(".drow .arrow")];
  assert.equal(arrows[1].textContent, "↓");
  assert.equal(arrows[1].getAttribute("aria-label"), "Falling");
  const asked = hass.ws.length;
  air.update(el, ctx);
  air.update(el, ctx);
  assert.equal(hass.ws.length, asked);
});

test("air: every air reading of the area with value, level and its trend", () => {
  const ctx = ctxOf({ hass: hassOf(states({ "sensor.living_room_co2": st(1300) })) });
  const el = mount(air, ctx, airSpec(ctx, config.rooms[0]));
  assert.equal(text(el.querySelector(".dtitle b")), "Air");
  assert.equal(text(el.querySelector(".dtitle span")), "Living room");
  assert.deepEqual(texts(el, ".drow .r"), ["Air score", "CO₂"], "the home's order");
  assert.deepEqual(texts(el, ".drow .lt"), ["Good", "CO₂ high"]);
  assert.equal(el.querySelectorAll(".drow .num")[1].className, "num lv-poor");
  assert.equal(el.querySelector(".gname"), null, "one area: no area heading");
  el.querySelectorAll(".drow")[1].click();
  assert.equal(ctx.sheets[0].entity, "sensor.living_room_co2");
});

test("lights: every lamp per room as tiles, on or off: the sheet is where a light is turned on", () => {
  const ctx = ctxOf({ hass: hassOf({ ...baseStates(), "light.living_room_ceiling": st("off") }) });
  const el = mount(lights, ctx, lightsSpec(ctx));
  assert.deepEqual(texts(el, ".gname"), ["Living room", "Office"], "nothing on, every lamp listed");
  const tiles = [...el.querySelectorAll("pocket-light-tile")];
  assert.ok(tiles.some((t) => t.config.entities[0] === "light.living_room_ceiling"));
  assert.equal(el.querySelector(".empty").hidden, true);
  ctx.hass = hassOf({ ...baseStates(), "light.office": st("on") });
  lights.update(el, ctx);
  assert.equal(el.querySelector("pocket-light-tile"), tiles[0], "the same tiles as states change");
  const none = ctxOf({ cfg: { ...config, rooms: config.rooms.map(({ lights: _, ...room }) => room) } });
  const empty = mount(lights, none, lightsSpec(none));
  assert.equal(text(empty.querySelector(".empty")), "No lights in this home.");
});

test("pl and de: every word from the translations", () => {
  for (const lang of ["pl", "de"]) {
    const ctx = ctxOf({ lang, cfg: withOutside, hass: hassOf(states()) });
    const el = mount(checks, ctx, checksSpec(ctx));
    assert.doesNotMatch(text(el), /card\.pocket|What was|Too cold|In range/, lang);
  }
});

test("sizes: rows at least 44 px tall, text at least 11.5 px, level colours from the theme", () => {
  assert.match(DETAIL_STYLE, /\.drow \{[^}]*min-height: 52px/);
  for (const m of DETAIL_STYLE.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 11.5, m[0]);
  for (const [tone, token] of [["good", "ok"], ["fair", "warn"], ["poor", "bad"], ["cold", "cold"], ["warm", "warm"]]) {
    assert.match(DETAIL_STYLE, new RegExp(`\\.num\\.lv-${tone} \\{ color: var\\(--${token}\\)`), tone);
  }
});

test("checks: every reading's trend fetched at once, the answers drawn in one or two redraws", async () => {
  const hass = hassOf(states());
  hass.ws = [];
  hass.calls = 0;
  hass.callWS = (msg) => {
    hass.calls += 1;
    hass.ws.push(...msg.entity_ids);
    const start = Date.parse(msg.start_time);
    return Promise.resolve(Object.fromEntries(msg.entity_ids.map((id) => [id,
      [20, 21].map((v, i) => ({ s: String(v), lu: (start + i * 1800e3) / 1000 }))])));
  };
  const ctx = ctxOf({ cfg: withOutside, hass });
  const el = mount(checks, ctx, checksSpec(ctx));
  const rows = el.querySelectorAll(".drow").length;
  await frame();
  assert.equal(hass.ws.length, rows, "every reading asked");
  assert.equal(hass.calls, 1, "in one history call");
  assert.ok(el._detail.redraws >= 1 && el._detail.redraws <= 2, `redraws: ${el._detail.redraws} for ${rows} answers`);
  assert.ok([...el.querySelectorAll(".drow .arrow")].every((a) => !a.hidden));
});

test("a row's trend opens stacked on the sheet", () => {
  const ctx = ctxOf({ cfg: withOutside, hass: hassOf(states()) });
  const calls = [];
  ctx.openSheet = (spec, options) => { calls.push([spec.kind, options]); return true; };
  const el = mount(checks, ctx, checksSpec(ctx));
  el.querySelector(".drow").click();
  assert.deepEqual(calls, [["trend", { stack: true }]]);
});
