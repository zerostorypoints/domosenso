process.env.TZ = "Europe/Zurich";

import { test, mock, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { shadowText } from "./testing/dom-env.mjs";
import "./clock-weather-card.js";

const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|\b(wiatr|częściowe|zachmurzenie|pochmurno|słonecznie|niedziela|października)\b/i;
const SAT_24 = "2026-10-24T08:00:00Z"; // 10:00 in Zurich

afterEach(() => mock.timers.reset());

const weather = (state = "partlycloudy", attributes = {}) => ({
  state, attributes: { temperature: 12.4, wind_speed: 8.2, wind_speed_unit: "km/h", ...attributes },
});

function makeCard({ lang = "pl", states, config = {}, hassExtra = {}, apis = ["Date"] } = {}) {
  mock.timers.reset();
  mock.timers.enable({ apis, now: new Date(SAT_24) });
  const card = document.createElement("clock-weather-card");
  card.setConfig({ weather: "weather.forecast_home", ...config });
  card.hass = {
    locale: { language: lang },
    states: { "weather.forecast_home": weather(), ...states },
    ...hassExtra,
  };
  return card;
}
const q = (card, sel) => card.shadowRoot.querySelector(sel);

test("partlycloudy reads Częściowe zachmurzenie in pl and Partly cloudy in en", () => {
  assert.equal(q(makeCard({ lang: "pl" }), ".cond").textContent, "Częściowe zachmurzenie");
  assert.equal(q(makeCard({ lang: "en" }), ".cond").textContent, "Partly cloudy");
  assert.equal(q(makeCard({ lang: "de" }), ".cond").textContent, "Teilweise bewölkt");
});

test("hass.formatEntityState is preferred when HA provides it", () => {
  const card = makeCard({ lang: "pl", hassExtra: { formatEntityState: (s) => `HA:${s.state}` } });
  assert.equal(q(card, ".cond").textContent, "HA:partlycloudy");
});

test("an unknown condition shows its raw state", () => {
  const card = makeCard({ lang: "en", states: { "weather.forecast_home": weather("tornado") } });
  assert.equal(q(card, ".cond").textContent, "tornado");
});

const dict = (lang) => JSON.parse(readFileSync(new URL(`../translations/${lang}.json`, import.meta.url), "utf8"));

test("every known condition shows its value from en.json, de.json and pl.json", () => {
  for (const lang of ["en", "de", "pl"]) {
    const conditions = dict(lang).card.clock.condition;
    assert.equal(Object.keys(conditions).length, 15, lang);
    for (const [state, text] of Object.entries(conditions)) {
      const card = makeCard({ lang, states: { "weather.forecast_home": weather(state) } });
      assert.equal(q(card, ".cond").textContent, text, `${lang} ${state}`);
    }
  }
  assert.deepEqual(Object.keys(dict("de").card.clock.condition), Object.keys(dict("en").card.clock.condition));
  assert.deepEqual(Object.keys(dict("pl").card.clock.condition), Object.keys(dict("en").card.clock.condition));
});

test("time and date follow the language, time is 24 h local", () => {
  const pl = makeCard({ lang: "pl" });
  assert.equal(q(pl, ".time").textContent, "10:00");
  assert.equal(q(pl, ".date").textContent, "sobota, 24 października");
  assert.equal(q(makeCard({ lang: "en" }), ".date").textContent, "Saturday 24 October");
  assert.match(q(makeCard({ lang: "de" }), ".date").textContent, /^Samstag, 24\. Oktober$/);
});

test("temperature, wind and pressure line", () => {
  const card = makeCard({
    lang: "en",
    config: { pressure: "sensor.air_pressure", temperature: "sensor.outside" },
    states: {
      "sensor.air_pressure": { state: "978.4", attributes: { unit_of_measurement: "hPa" } },
      "sensor.outside": { state: "9.6", attributes: {} },
    },
  });
  assert.equal(q(card, ".temp").textContent, "10 °C");
  assert.equal(q(card, ".cond2").textContent, "wind 8 km/h · 978 hPa");
  assert.equal(q(makeCard({ lang: "pl" }), ".cond2").textContent, "wiatr 8 km/h");
  assert.equal(q(makeCard({ lang: "de" }), ".cond2").textContent, "Wind 8 km/h");
});

test("forecast days use localised short weekday names", async () => {
  let handler;
  const connection = { subscribeMessage: (cb) => { handler = cb; return Promise.resolve(() => {}); } };
  const card = makeCard({ lang: "en", config: { forecast: 2 }, hassExtra: { connection } });
  handler({ forecast: [
    { datetime: "2026-10-25T12:00:00+01:00", condition: "rainy", temperature: 11.6, templow: 6.2 },
    { datetime: "2026-10-26T12:00:00+01:00", condition: "sunny", temperature: 14 },
    { datetime: "2026-10-27T12:00:00+01:00", condition: "sunny", temperature: 15 },
  ] });
  const names = [...card.shadowRoot.querySelectorAll(".dname")].map((e) => e.textContent);
  assert.deepEqual(names, ["Sun", "Mon"]);
  for (const [lang, expected] of [["pl", ["nd", "pn"]], ["de", ["So", "Mo"]]]) {
    const other = makeCard({ lang, config: { forecast: 2 }, hassExtra: { connection } });
    handler({ forecast: [
      { datetime: "2026-10-25T12:00:00+01:00", condition: "rainy", temperature: 11.6 },
      { datetime: "2026-10-26T12:00:00+01:00", condition: "sunny", temperature: 14 },
    ] });
    assert.deepEqual([...other.shadowRoot.querySelectorAll(".dname")].map((e) => e.textContent), expected, lang);
  }
  assert.equal(card.shadowRoot.querySelectorAll(".forecast .day").length, 2);
  assert.equal(card.shadowRoot.querySelector(".hi").textContent, "12°");
  assert.equal(card.shadowRoot.querySelector(".lo").textContent, "6°");
});

test("in English no Polish word reaches the page", () => {
  const card = makeCard({ lang: "en" });
  const text = shadowText(card);
  assert.doesNotMatch(text, POLISH);
  assert.match(text, /Partly cloudy/);
});

// A websocket connection as the frontend hands it to cards: subscriptions that can be ended, and
// the "ready" event it fires after reconnecting to a restarted Home Assistant.
function fakeConnection({ reject = 0 } = {}) {
  const conn = {
    subs: [], listeners: new Set(),
    subscribeMessage(cb) {
      const sub = { cb, active: true };
      conn.subs.push(sub);
      if (conn.subs.length <= reject) { sub.active = false; return Promise.reject(new Error("not found")); }
      return Promise.resolve(() => { sub.active = false; });
    },
    addEventListener(event, fn) { if (event === "ready") conn.listeners.add(fn); },
    removeEventListener(event, fn) { if (event === "ready") conn.listeners.delete(fn); },
    reconnect() { for (const fn of conn.listeners) fn(conn); },
    active() { return conn.subs.filter((s) => s.active); },
  };
  return conn;
}
const flush = () => new Promise((r) => setImmediate(r));
const DAYS = [
  { datetime: "2026-10-25T12:00:00+01:00", condition: "rainy", temperature: 11.6 },
  { datetime: "2026-10-26T12:00:00+01:00", condition: "sunny", temperature: 14 },
];
const TIMERS = ["Date", "setTimeout", "setInterval"];
const days = (card) => card.shadowRoot.querySelectorAll(".forecast .day").length;

test("a reconnect after an HA restart ends the subscription and subscribes again (#53)", async () => {
  const connection = fakeConnection();
  const card = makeCard({ lang: "en", config: { forecast: 2 }, hassExtra: { connection }, apis: TIMERS });
  connection.subs[0].cb({ forecast: DAYS });
  connection.reconnect();
  await flush();
  assert.equal(connection.subs.length, 2);
  assert.deepEqual(connection.active(), [connection.subs[1]]);
  connection.subs[1].cb({ forecast: DAYS.slice(0, 1) });
  assert.equal(days(card), 1);
});

test("an empty first forecast is retried until days arrive, then retrying stops (#53)", async () => {
  const connection = fakeConnection();
  const card = makeCard({ lang: "en", config: { forecast: 2 }, hassExtra: { connection }, apis: TIMERS });
  connection.subs[0].cb({ forecast: [] });
  assert.equal(days(card), 0);
  mock.timers.tick(10_000);
  await flush();
  assert.equal(connection.subs.length, 2);
  assert.deepEqual(connection.active(), [connection.subs[1]]);
  connection.subs[1].cb({ forecast: DAYS });
  assert.equal(days(card), 2);
  mock.timers.tick(3_600_000);
  assert.equal(connection.subs.length, 2);
});

test("no answer or a refused subscription is retried after 10, 30, 60 s, then every 5 min (#53)", async () => {
  const connection = fakeConnection({ reject: 1 });
  makeCard({ lang: "en", config: { forecast: 2 }, hassExtra: { connection }, apis: TIMERS });
  await flush();
  const after = (ms) => { mock.timers.tick(ms); return connection.subs.length; };
  assert.equal(after(9_999), 1);
  assert.equal(after(1), 2);
  assert.equal(after(30_000), 3);
  assert.equal(after(60_000), 4);
  assert.equal(after(300_000), 5);
  assert.equal(after(300_000), 6);
});

test("a card taken off the page leaves no subscription, listener or retry behind (#53)", async () => {
  const connection = fakeConnection();
  const card = makeCard({ lang: "en", config: { forecast: 2 }, hassExtra: { connection }, apis: TIMERS });
  document.body.appendChild(card);
  card.remove();
  await flush();
  assert.equal(connection.active().length, 0);
  assert.equal(connection.listeners.size, 0);
  mock.timers.tick(3_600_000);
  connection.reconnect();
  assert.equal(connection.subs.length, 1);
});

test("the weather entity appearing after a restart subscribes again at once, no timer needed (#53)", async () => {
  const connection = fakeConnection({ reject: 1 });
  const card = makeCard({ lang: "en", config: { forecast: 2 }, hassExtra: { connection }, apis: TIMERS,
                          states: { "weather.forecast_home": undefined } });
  await flush();
  card.hass = { ...card._hass, states: { "weather.forecast_home": weather() } };
  assert.equal(connection.subs.length, 2);
  connection.subs[1].cb({ forecast: DAYS });
  assert.equal(days(card), 2);
  card.hass = { ...card._hass };
  mock.timers.tick(3_600_000);
  assert.equal(connection.subs.length, 2);
});

// SPEC-056: the weather component's judged wind level on the wind part of the line.
const level = (state, attributes = {}) => ({
  "sensor.weather_wind_level": { state, attributes: { speed: 31.7, gust: null, direction: "SW", ...attributes } },
});

test("from breezy the wind part reads the level, speed and direction, per language", () => {
  const line = (lang, state, attributes) => q(makeCard({ lang, states: level(state, attributes) }), ".cond2").textContent;
  assert.equal(line("en", "breezy"), "Breezy, 32 km/h SW");
  assert.equal(line("en", "strong", { speed: 45 }), "Strong wind, 45 km/h SW");
  assert.equal(line("en", "gale", { speed: 64.4, direction: "NW" }), "Gale, 64 km/h NW");
  assert.equal(line("de", "breezy", { direction: "NE" }), "Frischer Wind, 32 km/h NO");
  assert.equal(line("de", "gale"), "Sturm, 32 km/h SW");
  assert.equal(line("pl", "breezy"), "Wietrznie, 32 km/h SW");
  assert.equal(line("pl", "strong"), "Silny wiatr, 32 km/h SW");
});

test("a known gust follows the speed; an unknown direction is left out", () => {
  const line = (lang, attributes) => q(makeCard({ lang, states: level("breezy", attributes) }), ".cond2").textContent;
  assert.equal(line("en", { gust: 48.6 }), "Breezy, 32 km/h SW, gusts 49");
  assert.equal(line("de", { gust: 48.6 }), "Frischer Wind, 32 km/h SW, Böen 49");
  assert.equal(line("pl", { gust: 48.6 }), "Wietrznie, 32 km/h SW, porywy 49");
  assert.equal(line("en", { direction: null }), "Breezy, 32 km/h");
});

test("calm, an unavailable level, a level without speed or no sensor keep today's text", () => {
  for (const states of [level("calm"), level("unavailable"), level("breezy", { speed: null }), {}]) {
    for (const [lang, text] of [["en", "wind 8 km/h"], ["de", "Wind 8 km/h"], ["pl", "wiatr 8 km/h"]]) {
      assert.equal(q(makeCard({ lang, states }), ".cond2").textContent, text, `${lang} ${JSON.stringify(states)}`);
    }
  }
});

test("the judged wind keeps the pressure after it", () => {
  const card = makeCard({
    lang: "en", config: { pressure: "sensor.air_pressure" },
    states: { ...level("strong", { speed: 45 }), "sensor.air_pressure": { state: "978.4", attributes: { unit_of_measurement: "hPa" } } },
  });
  assert.equal(q(card, ".cond2").textContent, "Strong wind, 45 km/h SW · 978 hPa");
});

test("every wind level and direction has its word in en, de and pl", () => {
  for (const lang of ["de", "pl"]) {
    assert.deepEqual(Object.keys(dict(lang).card.clock.wind_level), Object.keys(dict("en").card.clock.wind_level), lang);
    assert.deepEqual(Object.keys(dict(lang).card.clock.direction), Object.keys(dict("en").card.clock.direction), lang);
  }
  assert.deepEqual(Object.keys(dict("en").card.clock.wind_level), ["calm", "breezy", "strong", "gale"]);
});

// SPEC-056 amendment 1: the Climate page's warning line (option `warnings`, the banner's select).
const BANNER = "input_select.ramka_weather_banner";
const STORM = { type: "thunderstorm", level: "orange", severity: 3, event: "Thunderstorm", headline: "Thunderstorms",
  onset: "2026-10-24T08:00:00Z", expires: "2026-10-24T20:00:00Z" };
const FOG = { type: "fog", level: "yellow", severity: 2, event: "Fog", headline: "Fog", onset: null, expires: null };
const warned = ({ on = "on", banner = "icon", warnings, wind = level("strong", { speed: 45 }) } = {}) => ({
  ...wind,
  "binary_sensor.weather_warning": { state: on, attributes: {} },
  [BANNER]: { state: banner, attributes: {} },
  ...(warnings ? { "sensor.weather_warnings": { state: String(warnings.length), attributes: { warnings } } } : {}),
});
const lines = (card) => [q(card, ".cond").textContent, q(card, ".cond2").textContent, q(card, ".cond").style.color];

const spans = (card) => [...q(card, ".cond2").querySelectorAll("span")].map((el) => [el.textContent, el.style.color]);
const GALE = { type: "wind", level: "yellow", severity: 2, event: "Gale force wind", headline: "Gale force wind",
  onset: "2026-10-24T06:00:00Z", expires: "2026-10-24T20:00:00Z" };
const HEAT = { type: "heat", level: "red", severity: 4, event: "Heat wave", headline: "Heat wave", onset: null, expires: null };

test("an official warning: what and until when in its colour, no level word; the condition leads the line below", () => {
  const card = makeCard({ lang: "en", config: { warnings: BANNER }, states: warned({ warnings: [STORM, FOG] }) });
  assert.deepEqual(lines(card), ["Thunderstorm · until 22:00 · +1", "Partly cloudy · Strong wind, 45 km/h SW", "#ffa94d"]);
  assert.equal(q(card, ".cond").classList.contains("warn"), true);
  // A thunderstorm is about the condition: that value takes the colour, the wind does not.
  assert.deepEqual(spans(card), [["Partly cloudy", "#ffa94d"], ["Strong wind, 45 km/h SW", ""]]);
  assert.equal(card.shadowRoot.querySelectorAll(".wx ha-icon").length, 1, "no icon of its own");
});

test("a wind warning colours the wind; a heat warning the temperature", () => {
  const windy = makeCard({ lang: "en", config: { warnings: BANNER }, states: warned({ warnings: [GALE] }) });
  assert.equal(q(windy, ".cond").textContent, "Gale force wind · until 22:00");
  assert.deepEqual(spans(windy), [["Partly cloudy", ""], ["Strong wind, 45 km/h SW", "#f5c542"]]);
  assert.equal(q(windy, ".temp").style.color, "");
  const hot = makeCard({ lang: "en", config: { warnings: BANNER }, states: warned({ warnings: [HEAT] }) });
  assert.equal(q(hot, ".temp").style.color, "#ff7a5c");
});

test("the wind level alone: the condition stays, the wind value takes the level's colour", () => {
  const card = makeCard({ lang: "en", config: { warnings: BANNER, pressure: "sensor.air_pressure" },
    states: { ...warned({ wind: level("gale", { speed: 64, gust: 80 }) }), "sensor.air_pressure": { state: "978.4", attributes: { unit_of_measurement: "hPa" } } } });
  assert.deepEqual(lines(card), ["Partly cloudy", "Gale, 64 km/h SW, gusts 80 · 978 hPa", ""]);
  assert.deepEqual(spans(card), [["Gale, 64 km/h SW, gusts 80", "#ff7a5c"], ["978 hPa", ""]]);
});

test("no warning line with the banner off (the default), the warning off, or without the option", () => {
  const today = ["Partly cloudy", "Strong wind, 45 km/h SW", ""];
  for (const [config, states] of [
    [{ warnings: BANNER }, warned({ banner: "off", warnings: [STORM] })],
    [{ warnings: BANNER }, warned({ banner: "unknown", warnings: [STORM] })],
    [{ warnings: BANNER }, warned({ on: "off", warnings: [STORM] })],
    [{}, warned({ warnings: [STORM] })],
  ]) {
    const card = makeCard({ lang: "en", config, states });
    assert.deepEqual(lines(card), today, JSON.stringify(config));
    assert.equal(q(card, ".cond").classList.contains("warn"), false);
  }
});

test("the line goes back to the condition when the warning ends", () => {
  const card = makeCard({ lang: "de", config: { warnings: BANNER }, states: warned({ warnings: [FOG] }) });
  assert.equal(q(card, ".cond").textContent, "Fog");
  card.hass = { locale: { language: "de" }, states: { "weather.forecast_home": weather(), ...warned({ on: "off" }) } };
  assert.deepEqual(lines(card), ["Teilweise bewölkt", "Starker Wind, 45 km/h SW", ""]);
  assert.deepEqual(spans(card), [["Starker Wind, 45 km/h SW", ""]]);
});

test("the warning line is one line with an ellipsis, as the condition's", () => {
  const css = card => card.shadowRoot.querySelector("style").textContent;
  assert.match(css(makeCard({ lang: "en" })), /\.cond, \.cond2 \{[^}]*white-space: nowrap; overflow: hidden; text-overflow: ellipsis;/);
});
