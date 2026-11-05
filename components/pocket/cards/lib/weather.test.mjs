import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import {
  watchForecast, daysOf, splitDays, dayKey, iconOf, clearForecasts, forecastSpec, forecastSheet, NEXT_DAYS, RETRY_S,
} from "./weather.js";
import { createT } from "./i18n.js";
import en from "../../translations/en.json" with { type: "json" };
import pl from "../../translations/pl.json" with { type: "json" };

const translate = createT({ en, pl });
const tick = () => new Promise((r) => setTimeout(r, 0));

// A day at noon, `offset` days from today.
function dayAt(offset, extra = {}) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return { datetime: date.toISOString(), condition: "cloudy", temperature: 6.4, templow: 1.2, ...extra };
}

// A connection whose subscribeMessage records each subscription; push(days) answers the last one.
function connectionOf({ refuse = false } = {}) {
  const subs = [];
  return {
    subs,
    push(forecast, i = subs.length - 1) { subs[i].callback({ type: "daily", forecast }); },
    subscribeMessage(callback, message) {
      const sub = { callback, message, ended: false };
      subs.push(sub);
      if (refuse) return Promise.reject(new Error("not supported"));
      return Promise.resolve(() => { sub.ended = true; });
    },
  };
}

const hassOf = ({ connection = connectionOf(), states = {} } = {}) => ({
  connection, states: { "weather.home": { state: "rainy", attributes: { temperature: 5 } }, ...states } });

const ctxOf = (hass, lang = "en") => ({
  hass, lang, config: { weather: "weather.home", rooms: [] },
  t: (key, vars) => translate({ locale: { language: lang } }, key, vars),
});

const text = (node) => node.textContent.replace(/\s+/g, " ").trim();
const shadow = (widget) => widget.shadowRoot;

beforeEach(() => {
  clearForecasts();
  document.body.innerHTML = "";
});

test("icons as the Ramka maps Home Assistant's conditions; an unknown one is cloudy", () => {
  assert.equal(iconOf("partlycloudy"), "mdi:weather-partly-cloudy");
  assert.equal(iconOf("clear-night"), "mdi:weather-night");
  assert.equal(iconOf("exceptional"), "mdi:alert-circle-outline");
  assert.equal(iconOf("volcano"), "mdi:weather-cloudy");
  assert.equal(iconOf(undefined), "mdi:weather-cloudy");
});

test("splitDays: today when the first day is today, then at most NEXT_DAYS days", () => {
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => dayAt(i));
  const { today, next } = splitDays(days);
  assert.equal(today, days[0]);
  assert.equal(next.length, NEXT_DAYS);
  assert.equal(next[0], days[1]);
  const late = splitDays(days.slice(1));
  assert.equal(late.today, null, "a forecast from tomorrow has no today");
  assert.equal(late.next[0], days[1]);
  assert.equal(splitDays(days, new Date(), Infinity).next.length, 6);
  assert.deepEqual(splitDays(undefined), { today: null, next: [] });
});

test("one daily subscription per entity, shared; the last stop ends it", async () => {
  const hass = hassOf();
  const heard = [];
  const stopA = watchForecast(hass, "weather.home", () => heard.push("a"));
  const stopB = watchForecast(hass, "weather.home", () => heard.push("b"));
  const { subs } = hass.connection;
  assert.equal(subs.length, 1);
  assert.deepEqual(subs[0].message, { type: "weather/subscribe_forecast", forecast_type: "daily", entity_id: "weather.home" });
  hass.connection.push([dayAt(0)]);
  assert.deepEqual(heard, ["a", "b"]);
  assert.equal(daysOf(hass, "weather.home").length, 1);
  stopA();
  await tick();
  assert.equal(subs[0].ended, false);
  stopB();
  await tick();
  assert.equal(subs[0].ended, true);
});

test("a refused subscription falls back to the entity's forecast attribute", async () => {
  const days = [dayAt(0), dayAt(1)];
  const hass = hassOf({ connection: connectionOf({ refuse: true }),
    states: { "weather.home": { state: "sunny", attributes: { forecast: days } } } });
  let heard = 0;
  const stop = watchForecast(hass, "weather.home", () => { heard += 1; });
  await tick();
  assert.equal(heard, 1, "the failure is heard, so the widget draws the attribute");
  assert.deepEqual(daysOf(hass, "weather.home"), days);
  stop();
  assert.deepEqual(daysOf({ states: {} }, "weather.home"), [], "neither: no days");
  assert.deepEqual(daysOf({ connection: {}, states: { "weather.home": { state: "sunny", attributes: { forecast: days } } } },
    "weather.home"), days, "a hass without subscribeMessage reads the attribute");
});

test("the row: the current condition, today's high / low and chance of rain", () => {
  const hass = hassOf();
  const widget = document.createElement("pocket-forecast");
  widget.setAttribute("mode", "row");
  document.body.append(widget);
  widget.ctx = ctxOf(hass);
  hass.connection.push([dayAt(0, { precipitation_probability: 40 }), dayAt(1)]);
  const root = shadow(widget);
  assert.equal(root.querySelector("ha-icon").getAttribute("icon"), "mdi:weather-rainy");
  assert.equal(text(root.querySelector(".cond")), "Rain");
  assert.equal(text(root.querySelector(".hl")), "6° / 1°");
  assert.equal(text(root.querySelector(".rain")), "40 %");
  assert.equal(root.querySelector(".rain").getAttribute("aria-label"), "40 % chance of rain");
});

test("the strip: today and the next days in columns; no chance of rain when the day has none", () => {
  const hass = hassOf();
  const widget = document.createElement("pocket-forecast");
  widget.setAttribute("mode", "strip");
  document.body.append(widget);
  widget.ctx = ctxOf(hass, "pl");
  hass.connection.push([0, 1, 2, 3, 4, 5, 6].map((i) => dayAt(i, i === 2 ? { condition: "snowy", precipitation_probability: 80 } : {})));
  const days = [...shadow(widget).querySelectorAll(".day")];
  assert.equal(days.length, 1 + NEXT_DAYS);
  assert.equal(text(days[0].querySelector(".dn")), "Dziś");
  assert.equal(days[2].querySelector("ha-icon").getAttribute("icon"), "mdi:weather-snowy");
  assert.equal(days[2].querySelector("ha-icon").getAttribute("aria-label"), "Śnieg");
  assert.equal(text(days[0].querySelector(".hi")), "6°");
  assert.equal(text(days[0].querySelector(".lo")), "1°");
  assert.equal(days[0].querySelector(".rain").hidden, true);
  assert.equal(days[2].querySelector(".rain").hidden, false);
});

test("the widget subscribes while connected and unsubscribes when it leaves the page", async () => {
  const hass = hassOf();
  const widget = document.createElement("pocket-forecast");
  widget.setAttribute("mode", "strip");
  widget.ctx = ctxOf(hass);
  assert.equal(hass.connection.subs.length, 0, "not connected: no subscription");
  document.body.append(widget);
  assert.equal(hass.connection.subs.length, 1);
  widget.ctx = ctxOf(hass);
  assert.equal(hass.connection.subs.length, 1, "an update keeps the subscription");
  widget.remove();
  await tick();
  assert.equal(hass.connection.subs[0].ended, true);
  document.body.append(widget);
  assert.equal(hass.connection.subs.length, 2, "back on the page: subscribed again");
});

test("a new connection (a reconnect with a new hass) subscribes anew and ends the old one", async () => {
  const first = hassOf();
  const widget = document.createElement("pocket-forecast");
  document.body.append(widget);
  widget.ctx = ctxOf(first);
  const second = hassOf();
  widget.ctx = ctxOf(second);
  await tick();
  assert.equal(first.connection.subs[0].ended, true);
  assert.equal(second.connection.subs.length, 1);
});

test("the strip without days says so", () => {
  const widget = document.createElement("pocket-forecast");
  widget.setAttribute("mode", "strip");
  document.body.append(widget);
  widget.ctx = ctxOf(hassOf());
  assert.equal(text(shadow(widget).querySelector(".empty")), "No forecast yet");
});

test("the forecast sheet: the current row and every day of the forecast", () => {
  const hass = hassOf();
  const ctx = ctxOf(hass);
  const spec = forecastSpec(ctx);
  assert.deepEqual(spec, { kind: "forecast", title: "Weather" });
  const content = forecastSheet.render(ctx, spec);
  document.body.append(content);
  forecastSheet.update(content, ctx);
  hass.connection.push([0, 1, 2, 3, 4, 5, 6].map((i) => dayAt(i)));
  assert.equal(text(content.querySelector(".dtitle b")), "Weather");
  const list = content.querySelector('pocket-forecast[mode="list"]');
  assert.equal(shadow(list).querySelectorAll(".day").length, 7);
  assert.equal(text(shadow(list).querySelector(".day .hl")), "6° / 1°");
  assert.equal(hass.connection.subs.length, 1, "both widgets share one subscription");
});

test("a refused subscription is asked for again after 10, 30, 60, then 300 s; the last stop ends the retries", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const flush = () => new Promise((r) => setImmediate(r));
  assert.deepEqual(RETRY_S, [10, 30, 60, 300]);
  const connection = connectionOf({ refuse: true });
  const stop = watchForecast(hassOf({ connection }), "weather.home", () => {});
  const asked = () => connection.subs.length;
  await flush();
  assert.equal(asked(), 1);
  for (const [wait, count] of [[10, 2], [30, 3], [60, 4], [300, 5], [300, 6]]) {
    t.mock.timers.tick(wait * 1000 - 1);
    await flush();
    assert.equal(asked(), count - 1, `not before ${wait} s`);
    t.mock.timers.tick(1);
    await flush();
    assert.equal(asked(), count, `again after ${wait} s`);
  }
  stop();
  t.mock.timers.tick(3600 * 1000);
  await flush();
  assert.equal(asked(), 6, "no retry after the last stop");
});

test("an accepted retry delivers days and stops retrying", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const flush = () => new Promise((r) => setImmediate(r));
  let refuse = true;
  const subs = [];
  const connection = { subscribeMessage(callback) {
    subs.push(callback);
    return refuse ? Promise.reject(new Error("not yet")) : Promise.resolve(() => {});
  } };
  const hass = hassOf({ connection });
  const stop = watchForecast(hass, "weather.home", () => {});
  await flush();
  refuse = false;
  t.mock.timers.tick(10 * 1000);
  await flush();
  assert.equal(subs.length, 2);
  subs[1]({ forecast: [dayAt(0)] });
  t.mock.timers.tick(3600 * 1000);
  await flush();
  assert.equal(subs.length, 2, "accepted: no more retries");
  assert.equal(daysOf(hass, "weather.home").length, 1);
  stop();
});

test("today is Home Assistant's date: west of UTC late in the evening, a UTC-midnight first day is today", () => {
  const zone = "America/New_York";
  // 20:00 in New York on 5 November is already 6 November in UTC (and in Europe).
  const now = new Date("2026-11-06T01:00:00Z");
  const days = ["2026-11-05T00:00:00+00:00", "2026-11-06T00:00:00+00:00", "2026-11-07T00:00:00+00:00"]
    .map((datetime) => ({ datetime, condition: "sunny", temperature: 10 }));
  const { today, next } = splitDays(days, now, NEXT_DAYS, zone);
  assert.equal(today, days[0]);
  assert.deepEqual(next, days.slice(1));
  assert.deepEqual(dayKey(days[0], zone), { date: "2026-11-05", zone: "UTC" });
  // Days at local noon or midnight of HA's zone are that zone's dates.
  const local = ["2026-11-05T00:00:00-05:00", "2026-11-06T12:00:00-05:00"].map((datetime) => ({ datetime }));
  assert.equal(splitDays(local, now, NEXT_DAYS, zone).today, local[0]);
  assert.deepEqual(dayKey(local[0], zone), { date: "2026-11-05", zone });
  // In Warsaw the same moment is 6 November: the 5th is gone, the 6th is today.
  assert.equal(splitDays(days, now, NEXT_DAYS, "Europe/Warsaw").today, days[1]);
});

test("the strip names today and the weekdays in Home Assistant's time zone", () => {
  const hass = hassOf();
  hass.config = { time_zone: "Pacific/Kiritimati" };   // UTC+14: its today differs from most browsers'
  const widget = document.createElement("pocket-forecast");
  widget.setAttribute("mode", "strip");
  document.body.append(widget);
  widget.ctx = ctxOf(hass);
  const todayThere = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Kiritimati" }).format(new Date());
  const noonThere = new Date(`${todayThere}T12:00:00+14:00`);
  hass.connection.push([0, 1].map((i) => ({ datetime: new Date(noonThere.getTime() + i * 86400000).toISOString(),
    condition: "sunny", temperature: 20 })));
  assert.equal(text(shadow(widget).querySelector(".day .dn")), "Today");
  const tomorrow = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Pacific/Kiritimati" })
    .format(new Date(noonThere.getTime() + 86400000));
  assert.equal(text(shadow(widget).querySelectorAll(".day .dn")[1]), tomorrow);
});
