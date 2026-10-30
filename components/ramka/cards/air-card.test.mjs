import { test } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { shadowText } from "./testing/dom-env.mjs";
import "./air-card.js";

const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

const sensor = (state) => ({ state, attributes: {} });

function makeCard({ lang = "pl", states, config }) {
  const card = document.createElement("air-card");
  card.setConfig(config);
  card.hass = { locale: { language: lang }, states };
  return card;
}

const labels = (card) => [...card.shadowRoot.querySelectorAll(".label")].map((e) => e.textContent);

// Without labels in the config the card names its three levels itself.
const bare = {
  score: { name: "Score", entity: "sensor.score", higher_is_better: true, levels: [[80], [60], [0]] },
  tiles: [{ name: "CO₂", entity: "sensor.co2", unit: "ppm", levels: [[800], [1200], [null]] }],
};

test("default level names per language: good, raised, high", () => {
  const cases = {
    en: ["Good", "Raised", "High"], de: ["Gut", "Erhöht", "Hoch"], pl: ["Dobry", "Podwyższony", "Wysoki"],
  };
  for (const [lang, [good, raised, high]] of Object.entries(cases)) {
    for (const [co2, expected] of [["500", good], ["1000", raised], ["1500", high]]) {
      const card = makeCard({ lang, states: { "sensor.score": sensor("90"), "sensor.co2": sensor(co2) }, config: bare });
      assert.deepEqual(labels(card), [good, expected], `${lang} ${co2}`);
    }
    const poor = makeCard({ lang, states: { "sensor.score": sensor("40"), "sensor.co2": sensor("500") }, config: bare });
    assert.equal(labels(poor)[0], high, `${lang}: score 40`);
  }
});

test("a label in the config is shown as it is, in every language", () => {
  const config = {
    tiles: [{ name: "CO₂", entity: "sensor.co2", levels: [[800, "fine"], [1200, "soon"], [null, "now"]] }],
  };
  for (const lang of ["en", "de", "pl"]) {
    assert.deepEqual(labels(makeCard({ lang, states: { "sensor.co2": sensor("1000") }, config })), ["soon"], lang);
  }
});

test("value, unit and the colour of the level", () => {
  const card = makeCard({ lang: "en", states: { "sensor.score": sensor("90"), "sensor.co2": sensor("1500") }, config: bare });
  const tile = card.shadowRoot.querySelector('[data-i="0"]');
  assert.equal(tile.querySelector(".value").textContent, "1500ppm");
  assert.equal(tile.querySelector(".label").style.color, "var(--high)");
});

test("a tile whose entity is unavailable is left out", () => {
  const card = makeCard({ lang: "en", states: { "sensor.score": sensor("90"), "sensor.co2": sensor("unavailable") }, config: bare });
  assert.equal(card.shadowRoot.querySelectorAll(".tile").length, 1);
});

test("in English no Polish letter reaches the page", () => {
  const card = makeCard({ lang: "en", states: { "sensor.score": sensor("70"), "sensor.co2": sensor("900") }, config: bare });
  assert.doesNotMatch(shadowText(card), POLISH);
});

// SPEC-021 amendment 1: the settings dashboard's Air page drives the card live.
const live = {
  score: { name: "Score", entity: "sensor.score", higher_is_better: true, show: "input_boolean.air_score",
           levels: [[{ entity: "input_number.score_fair", default: 80 }], [{ entity: "input_number.score_poor", default: 60 }], [0]] },
  tiles: [
    { name: "CO₂", entity: "sensor.co2", show: "input_boolean.air_co2",
      levels: [[{ entity: "input_number.co2_raised", default: 800 }], [{ entity: "input_number.co2_high", default: 1200 }], [null]] },
    { name: "VOC", entity: "sensor.voc", show: "input_boolean.air_voc", levels: [[150], [250], [null]] },
  ],
};
const names = (card) => [...card.shadowRoot.querySelectorAll(".name")].map((e) => e.textContent);
const colour = (card, i) => card.shadowRoot.querySelector(`[data-i="${i}"] .label`).style.color;

test("show: off leaves a tile out, the others share its room, and on brings it back", () => {
  const states = { "sensor.score": sensor("90"), "sensor.co2": sensor("900"), "sensor.voc": sensor("100"),
                   "input_boolean.air_score": sensor("on"), "input_boolean.air_co2": sensor("on"), "input_boolean.air_voc": sensor("off") };
  const card = makeCard({ lang: "en", states, config: live });
  assert.deepEqual(names(card), ["Score", "CO₂"]);
  card.hass = { locale: { language: "en" }, states: { ...states, "input_boolean.air_voc": sensor("on"), "input_boolean.air_score": sensor("off") } };
  assert.deepEqual(names(card), ["CO₂", "VOC"]);
  assert.equal(card.shadowRoot.querySelectorAll(".score").length, 0);
  // A switch that is not there (unavailable) shows the tile, as without show:.
  card.hass = { locale: { language: "en" }, states: { "sensor.score": sensor("90"), "sensor.co2": sensor("900"), "sensor.voc": sensor("100") } };
  assert.deepEqual(names(card), ["Score", "CO₂", "VOC"]);
});

test("an entity limit moves the colour, read on every update", () => {
  const states = { "sensor.co2": sensor("900"), "sensor.score": sensor("75") };
  const card = makeCard({ lang: "en", states, config: live });
  assert.equal(colour(card, 0), "var(--raised)");          // 900 ≥ the default 800
  assert.equal(colour(card, "score"), "var(--raised)");    // 75 < the default 80: fair
  card.hass = { locale: { language: "en" }, states: { ...states, "input_number.co2_raised": sensor("1000.0"), "input_number.score_fair": sensor("70") } };
  assert.equal(colour(card, 0), "var(--good)");
  assert.equal(colour(card, "score"), "var(--good)");
});

test("an unusable limit keeps the literal default", () => {
  for (const state of ["unavailable", "unknown", "", "high"]) {
    const card = makeCard({ lang: "en", states: { "sensor.co2": sensor("900"), "input_number.co2_raised": sensor(state) }, config: live });
    assert.equal(colour(card, 0), "var(--raised)", state);
  }
});

test("without show: and with literal levels the card is as before", () => {
  const states = { "sensor.score": sensor("90"), "sensor.co2": sensor("1000") };
  const card = makeCard({ lang: "en", states, config: bare });
  assert.deepEqual(names(card), ["Score", "CO₂"]);
  assert.deepEqual(labels(card), ["Good", "Raised"]);
});
