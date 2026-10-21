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

function makeCard({ lang = "pl", states, config = {}, hassExtra = {} } = {}) {
  mock.timers.reset();
  mock.timers.enable({ apis: ["Date"], now: new Date(SAT_24) });
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
