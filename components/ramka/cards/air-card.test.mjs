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
