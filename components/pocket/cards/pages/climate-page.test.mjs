import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as climate from "./climate-page.js";
import { pages } from "./index.js";
import { config as demo, baseStates, st, hassOf, ctxOf, text, texts } from "../testing/demo-home.mjs";
import { clearForecasts } from "../lib/weather.js";
import { clearHistoryCache } from "../lib/trend.js";

// The demo home with an outside sensor, its comfort range and a weather entity.
const config = {
  ...demo,
  outside: { temperature: "sensor.outside_temperature" },
  weather: "weather.home",
  thresholds: { ...demo.thresholds,
    outside: { temp_low: "input_number.out_temp_low", temp_high: "input_number.out_temp_high" } },
};
const states = (changes = {}) => ({
  ...baseStates(),
  "input_number.out_temp_low": st(10), "input_number.out_temp_high": st(25),
  "sensor.outside_temperature": st(5.5),
  "weather.home": st("cloudy", { temperature: 5.5, humidity: 82 }),
  ...changes,
});

function ctxWith({ changes, settings = {}, save, cfg = config, lang } = {}) {
  const ctx = ctxOf({ hass: hassOf(states(changes)), cfg, lang });
  ctx.saved = [];
  ctx.settings = { climateView: "temperature", ...settings };
  ctx.saveSettings = save ?? ((patch) => { ctx.saved.push(patch); return Promise.resolve(); });
  return ctx;
}

function mount(ctx = ctxWith()) {
  const el = climate.render(ctx);
  document.body.appendChild(el);
  return el;
}

const rowNames = (el) => texts(el, ".rows .row .an");
const pressed = (el) => [...el.querySelectorAll(".seg button")].filter((b) => b.getAttribute("aria-pressed") === "true")
  .map((b) => b.dataset.view);

beforeEach(() => {
  document.body.innerHTML = "";
  clearForecasts();
  clearHistoryCache();
});

test("the shell's climate entry is this page", () => {
  assert.equal(pages.climate, climate);
});

test("title, no advice while every limit holds, the switch on the person's view", () => {
  const el = mount();
  assert.equal(text(el.querySelector(".top b")), "Climate & air");
  assert.equal(el.querySelectorAll(".advice .tip").length, 0);
  assert.deepEqual(texts(el, ".seg button"), ["Temp", "Humidity", "Air"]);
  assert.deepEqual(pressed(el), ["temperature"]);
});

test("advice: a poor CO2 says open a window, with the reading, and opens its trend", () => {
  const ctx = ctxWith({ changes: { "sensor.living_room_co2": st(1300, { unit_of_measurement: "ppm" }) } });
  const el = mount(ctx);
  const tips = el.querySelectorAll(".advice .tip");
  assert.equal(tips.length, 1);
  assert.equal(text(tips[0].querySelector(".t1")), "Living room: Open a window");
  assert.equal(text(tips[0].querySelector(".t2")), "CO₂ 1300 ppm");
  assert.equal(tips[0].querySelector("ha-icon").getAttribute("icon"), "mdi:window-open-variant");
  tips[0].click();
  assert.equal(ctx.sheets.at(-1).kind, "trend");
  assert.equal(ctx.sheets.at(-1).entity, "sensor.living_room_co2");
});

test("advice: too warm and too dry, each side in its colour; it goes when the reading is back", () => {
  const ctx = ctxWith({ changes: { "sensor.bedroom_temperature": st(23.5), "sensor.living_room_humidity": st(30) } });
  const el = mount(ctx);
  assert.deepEqual(texts(el, ".advice .tip .t1"), ["Living room: Too dry", "Bedroom: Too warm"]);
  assert.deepEqual([...el.querySelectorAll(".advice .tip")].map((t) => t.className), ["tip cold", "tip warm"]);
  ctx.hass = hassOf(states());
  climate.update(el, ctx);
  assert.equal(el.querySelectorAll(".advice .tip").length, 0);
});

test("advice in Polish and German", () => {
  const changes = { "sensor.living_room_co2": st(1300), "sensor.bedroom_temperature": st(16) };
  assert.deepEqual(texts(mount(ctxWith({ changes, lang: "pl" })), ".advice .t1"), ["Living room: Otwórz okno", "Bedroom: Za zimno"]);
  assert.deepEqual(texts(mount(ctxWith({ changes, lang: "de" })), ".advice .t1"), ["Living room: Fenster öffnen", "Bedroom: Zu kalt"]);
});

test("squares: inside the range in the worst room's colour, outside cold blue below its range, air its level", () => {
  const el = mount(ctxWith({ changes: { "sensor.bedroom_temperature": st(23) } }));
  const sq = (name) => el.querySelector(`[data-square="${name}"]`);
  assert.equal(text(sq("inside").querySelector(".num")), "21.7–23.0°");
  assert.equal(sq("inside").querySelector(".big").className, "big lv-warm");
  assert.equal(text(sq("inside").querySelector(".lab")), "1 out of range");
  assert.equal(text(sq("outside").querySelector(".num")), "5.5°");
  assert.equal(sq("outside").querySelector(".big").className, "big lv-cold");
  assert.equal(text(sq("outside").querySelector(".lab")), "82 % · Too cold");
  assert.equal(text(sq("air").querySelector(".num")), "81");
  assert.equal(sq("air").querySelector(".big").className, "big lv-good");
  assert.equal(text(sq("air").querySelector(".lab")), "Air good");
});

test("squares open their sheets: inside the checks, outside and air their trend", () => {
  const ctx = ctxWith();
  const el = mount(ctx);
  for (const name of ["inside", "outside", "air"]) el.querySelector(`[data-square="${name}"]`).click();
  assert.deepEqual(ctx.sheets.map((s) => [s.kind, s.entity]),
    [["checks", undefined], ["trend", "sensor.outside_temperature"], ["trend", "sensor.living_room_air_quality_score"]]);
});

test("a home without outside, weather or air: those squares and the weather are hidden", () => {
  const cfg = { ...demo, rooms: demo.rooms.map(({ air, ...room }) => room) };
  const el = mount(ctxWith({ cfg }));
  assert.equal(el.querySelector('[data-square="outside"]').hidden, true);
  assert.equal(el.querySelector('[data-square="air"]').hidden, true);
  assert.equal(el.querySelector('[data-square="inside"]').hidden, false);
  assert.equal(el.querySelector(".weather").hidden, true);
});

test("the temperature view: every area with a temperature, the Outside last, on its comfort band", () => {
  const el = mount();
  assert.deepEqual(rowNames(el), ["Living room", "Bedroom", "Outside"]);
  const [living, , outside] = el.querySelectorAll(".rows .row");
  assert.equal(text(living.querySelector(".num")), "21.7°");
  const zone = living.querySelector(".bar .z");
  assert.equal(zone.className, "z good");
  assert.equal(zone.style.getPropertyValue("left"), "25%");
  assert.equal(zone.style.getPropertyValue("width"), "50%");
  assert.equal(living.querySelector(".bar .at").style.getPropertyValue("left"), "46.2%");
  assert.equal(outside.querySelector(".num").className, "num lv-cold");
  assert.equal(outside.querySelector(".bar .at").style.getPropertyValue("left"), "10%", "below the shaded range");
});

test("the switch: humidity and air show their rows at once and are saved for the person", async () => {
  const ctx = ctxWith();
  const el = mount(ctx);
  el.querySelector('[data-view="humidity"]').click();
  assert.deepEqual(pressed(el), ["humidity"]);
  assert.deepEqual(rowNames(el), ["Living room", "Bedroom", "Outside"]);
  assert.equal(text(el.querySelector(".rows .row .num")), "44 %");
  el.querySelector('[data-view="air"]').click();
  assert.deepEqual(rowNames(el), ["Living room", "Living room"]);
  assert.deepEqual(texts(el, ".rows .row .rd"), ["Air score", "CO₂"]);
  const co2 = el.querySelectorAll(".rows .row")[1];
  assert.deepEqual([...co2.querySelectorAll(".bar .z")].map((z) => z.className), ["z good", "z fair", "z poor"]);
  assert.deepEqual([...co2.querySelectorAll(".bar .mk")].map((m) => [m.className, m.style.getPropertyValue("left")]),
    [["mk fair", "33.3%"], ["mk poor", "66.7%"]]);
  assert.deepEqual(ctx.saved, [{ climateView: "humidity" }, { climateView: "air" }]);
  el.querySelector('[data-view="air"]').click();
  assert.equal(ctx.saved.length, 2, "the view shown already is not saved again");
});

test("the person's stored view is the one shown; a failed save keeps the view and says so", async () => {
  assert.deepEqual(pressed(mount(ctxWith({ settings: { climateView: "air" } }))), ["air"]);
  const ctx = ctxWith({ save: () => Promise.reject(new Error("lost")) });
  const el = mount(ctx);
  const errors = [];
  el.addEventListener("pocket-error", (e) => errors.push(e.detail.key));
  el.querySelector('[data-view="humidity"]').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(pressed(el), ["humidity"]);
  assert.deepEqual(errors, ["card.pocket.settings.error"]);
});

test("a row opens its trend; the Outside's weather humidity has no entity and opens nothing", () => {
  const ctx = ctxWith({ settings: { climateView: "humidity" } });
  const el = mount(ctx);
  const rows = el.querySelectorAll(".rows .row");
  assert.equal(rows[0].tagName, "BUTTON");
  rows[0].click();
  assert.equal(ctx.sheets.at(-1).entity, "sensor.living_room_humidity");
  assert.equal(rows[2].tagName, "DIV");
  assert.equal(text(rows[2].querySelector(".num")), "82 %");
});

test("the weather strip: shown with a weather entity, opening the forecast sheet", () => {
  const ctx = ctxWith();
  const el = mount(ctx);
  assert.equal(el.querySelector(".weather").hidden, false);
  assert.equal(text(el.querySelector(".wx-title")), "Weather");
  el.querySelector(".wx").click();
  assert.deepEqual(ctx.sheets.at(-1), { kind: "forecast", title: "Weather" });
});

test("update() patches in place: the same rows and squares after a new value", () => {
  const ctx = ctxWith();
  const el = mount(ctx);
  const row = el.querySelector(".rows .row");
  ctx.hass = hassOf(states({ "sensor.living_room_temperature": st(22.4) }));
  climate.update(el, ctx);
  assert.equal(el.querySelector(".rows .row"), row);
  assert.equal(text(row.querySelector(".num")), "22.4°");
});

test("targets of 44 px and text of at least 11.5 px", () => {
  const css = mount().querySelector("style").textContent;
  const rule = (sel) => css.match(new RegExp(`${sel.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`))[1];
  assert.match(rule(".climate .seg button"), /min-width: 44px; min-height: 44px/);
  assert.match(rule(".climate .wx"), /min-height: 44px/);
  assert.match(rule(".climate .tip"), /min-height: 56px/);
  assert.match(rule(".climate .row"), /min-height: 56px/);
  const sizes = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
  assert.ok(sizes.every((size) => size >= 11.5), sizes.join(" "));
});
