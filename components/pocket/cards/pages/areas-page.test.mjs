import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as rooms from "./areas-page.js";
import { pages } from "./index.js";
import { config, st, baseStates, hassOf, ctxOf, text, texts } from "../testing/demo-home.mjs";

function mount(ctx = ctxOf()) {
  const el = rooms.render(ctx);
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { document.body.innerHTML = ""; });

test("the shell's areas entry is this page", () => {
  assert.equal(pages.areas, rooms);
});

test("title and the number of areas", () => {
  const el = mount();
  assert.equal(text(el.querySelector(".top b")), "Areas");
  assert.equal(text(el.querySelector(".top .count")), "4 areas");
  assert.equal(text(mount(ctxOf({ lang: "pl" })).querySelector(".top .count")), "4 obszary");
});

test("one square per room, in the home's order; a tap opens the room", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const squares = [...el.querySelectorAll(".grid .sq")];
  assert.deepEqual(squares.map((sq) => text(sq.querySelector(".name"))), ["Living room", "Bedroom", "Office", "Hall"]);
  squares[2].click();
  assert.deepEqual(ctx.routes, ["#/area/office"]);
});

test("key value: temperature, else lights on, else nothing; secondaries", () => {
  const el = mount();
  const [living, bedroom, office, hall] = [...el.querySelectorAll(".grid .sq")];
  assert.equal(text(living.querySelector(".big")), "21.7°");
  // The group's members count, not the group: one of two is on.
  assert.equal(text(living.querySelector(".lab")), "44 % · 1 on · ♪", "a short line: the air is in the dot");
  assert.equal(text(bedroom.querySelector(".big")), "21.9°");
  assert.equal(text(bedroom.querySelector(".lab")), "44 %");
  assert.equal(text(office.querySelector(".big")), "All off");
  assert.equal(text(office.querySelector(".lab")), "");
  assert.ok(hall.querySelector(".big").hidden);
  assert.equal(text(hall.querySelector(".lab")), "");
});

test("a dot on the room with attention, coloured by its worst level", () => {
  const states = { ...baseStates(), "sensor.bedroom_temperature": st(23), "sensor.living_room_air_quality_score": st(70) };
  const el = mount(ctxOf({ hass: hassOf(states) }));
  const dots = [...el.querySelectorAll(".grid .sq")].map((sq) => sq.querySelector(".dot:not([hidden])"));
  assert.ok(dots[0].classList.contains("fair"));
  assert.ok(dots[1].classList.contains("warm"), "above the range: warm");
  assert.equal(dots[1].getAttribute("aria-label"), "Needs attention");
  assert.equal(dots[2], null);
  assert.equal(dots[3], null);
});

test("an unavailable temperature shows a dash", () => {
  const states = { ...baseStates(), "sensor.bedroom_temperature": st("unavailable") };
  const el = mount(ctxOf({ hass: hassOf(states) }));
  assert.equal(text(el.querySelectorAll(".grid .sq")[1].querySelector(".big")), "—");
});

test("update patches in place: same squares, new values and dots", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const first = el.querySelector(".grid .sq");
  const states = { ...baseStates(), "sensor.living_room_temperature": st(25.2), "light.office": st("on", { brightness: 255 }) };
  rooms.update(el, { ...ctx, hass: hassOf(states) });
  assert.equal(el.querySelector(".grid .sq"), first);
  assert.equal(text(first.querySelector(".big")), "25.2°");
  assert.ok(first.querySelector(".dot.warm:not([hidden])"));
  assert.ok(first.querySelector(".big").classList.contains("lv-warm"));
  assert.equal(text(el.querySelectorAll(".grid .sq")[2].querySelector(".big")), "1 on");
});

test("the language follows ctx on update", () => {
  const el = mount();
  rooms.update(el, ctxOf({ lang: "de" }));
  assert.equal(text(el.querySelector(".top b")), "Bereiche");
  assert.equal(texts(el, ".grid .sq .lab")[0], "44 % · 1 an · ♪");
});

test("a home without rooms: an empty grid, no error", () => {
  const el = mount(ctxOf({ cfg: { ...config, rooms: [] } }));
  assert.equal(el.querySelectorAll(".grid .sq").length, 0);
  assert.equal(text(el.querySelector(".top .count")), "0 areas");
});

test("an unavailable humidity: a muted dash on the line", () => {
  const states = { ...baseStates(), "sensor.living_room_humidity": st("unavailable") };
  const el = mount(ctxOf({ hass: hassOf(states) }));
  const lab = el.querySelector(".grid .sq .lab");
  assert.equal(text(lab), "— · 1 on · ♪");
  assert.deepEqual([...lab.querySelectorAll(".muted")].map(text), ["—"]);
});

test("the big temperature in its level's colour: below the range cold, in it good", () => {
  const states = { ...baseStates(), "sensor.bedroom_temperature": st(16) };
  const el = mount(ctxOf({ hass: hassOf(states) }));
  const [living, bedroom] = el.querySelectorAll(".grid .sq");
  assert.equal(living.querySelector(".big").className, "big lv-good");
  assert.equal(bedroom.querySelector(".big").className, "big lv-cold");
  assert.ok(bedroom.querySelector(".dot.cold:not([hidden])"));
  const css = el.querySelector("style").textContent;
  assert.match(css, /\.lv-cold \{ color: var\(--cold\)/);
  assert.match(css, /\.dot\.cold \{ background: var\(--cold\)/);
});

test("one square size: equal columns and rows, a fixed aspect; the big value shrinks to fit", () => {
  const css = mount().querySelector("style").textContent;
  assert.match(css, /\.grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[^}]*grid-auto-rows: 1fr/);
  assert.match(css, /\.rooms \.sq \{[^}]*aspect-ratio: 1 \/ \.82;[^}]*align-self: stretch/);
  assert.match(css, /\.rooms \.sq \{[^}]*container-type: inline-size/);
  assert.match(css, /\.rooms \.big \{[^}]*flex-wrap: wrap[^}]*font-size: clamp\(16px, 15cqi, 24px\)/);
  assert.doesNotMatch(css, /ellipsis|nowrap|overflow: hidden/);
});

test("the trend arrow of the temperature, from the last hour, one redraw for all answers", async () => {
  const { clearHistoryCache } = await import("../lib/trend.js");
  clearHistoryCache();
  const hass = hassOf();
  hass.ws = [];
  const series = { "sensor.living_room_temperature": [21, 21.7], "sensor.bedroom_temperature": [22.5, 21.9] };
  hass.callWS = (msg) => {
    hass.ws.push(...msg.entity_ids);
    const start = Date.parse(msg.start_time);
    return Promise.resolve(Object.fromEntries(msg.entity_ids.map((id) => [id,
      (series[id] ?? []).map((v, i) => ({ s: String(v), lu: (start + i * 1800e3) / 1000 }))])));
  };
  const el = mount(ctxOf({ hass }));
  await new Promise((r) => setTimeout(r, 30));
  const [living, bedroom] = el.querySelectorAll(".grid .sq .arrow");
  assert.equal(living.textContent, "↑");
  assert.equal(bedroom.textContent, "↓");
  assert.deepEqual(hass.ws.sort(), ["sensor.bedroom_temperature", "sensor.living_room_temperature"]);
  clearHistoryCache();
});

test("every square line fits SHORT_LINE_CHARS in every language: the widest humidity, lamps on and the note", async () => {
  const { SHORT_LINE_CHARS } = await import("./area-page.js");
  for (const lang of ["en", "pl", "de"]) {
    const ctx = ctxOf({ lang });
    const line = [ctx.t("card.pocket.format.percent", { value: "100" }),
      ctx.t("card.pocket.areas.lights_on", { count: 99 }), ctx.t("card.pocket.home.playing")].join(" · ");
    assert.ok(line.length <= SHORT_LINE_CHARS, `${lang}: ${line}`);
  }
});

const withOutside = (extra = {}) => ({ ...config, outside: { temperature: "sensor.outside_temperature",
  humidity: "sensor.outside_humidity" }, ...extra });

test("the Outside comes after the rooms, with its temperature and humidity; a tap opens it", () => {
  const states = { ...baseStates(), "sensor.outside_temperature": st(4.5), "sensor.outside_humidity": st(81) };
  const ctx = ctxOf({ cfg: withOutside(), hass: hassOf(states) });
  const el = mount(ctx);
  const squares = [...el.querySelectorAll(".grid .sq")];
  assert.deepEqual(squares.map((sq) => text(sq.querySelector(".name"))),
    ["Living room", "Bedroom", "Office", "Hall", "Outside"]);
  assert.equal(text(el.querySelector(".top .count")), "5 areas");
  const outside = squares[4];
  assert.equal(text(outside.querySelector(".big")), "4.5°");
  assert.equal(text(outside.querySelector(".lab")), "81 %");
  outside.click();
  assert.deepEqual(ctx.routes, ["#/area/outside"]);
  rooms.update(el, ctxOf({ cfg: withOutside(), lang: "pl", hass: hassOf(states) }));
  assert.equal(text(outside.querySelector(".name")), "Na zewnątrz");
});

test("a home with only a weather entity: the Outside reads it", () => {
  const states = { ...baseStates(), "weather.home": st("cloudy", { temperature: 7, humidity: 90 }) };
  const el = mount(ctxOf({ cfg: { ...config, weather: "weather.home" }, hass: hassOf(states) }));
  const outside = [...el.querySelectorAll(".grid .sq")].at(-1);
  assert.equal(text(outside.querySelector(".name")), "Outside");
  assert.equal(text(outside.querySelector(".big")), "7.0°");
  assert.equal(text(outside.querySelector(".lab")), "90 %");
});

test("no outside and no weather: no Outside", () => {
  assert.equal(mount().querySelectorAll(".grid .sq").length, 4);
});

test("squares have a definite width, so Safari takes their height from the aspect ratio", () => {
  const style = rooms.render(ctxOf({ hass: hassOf(baseStates()), cfg: config })).querySelector("style").textContent;
  const rule = style.match(/\.rooms \.sq \{[^}]*\}/)[0];
  assert.match(rule, /width: 100%/);
  assert.match(rule, /aspect-ratio/);
});
