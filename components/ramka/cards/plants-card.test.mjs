import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { shadowText } from "./testing/dom-env.mjs";
import "./plants-card.js";

const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

afterEach(() => mock.timers.reset());

// Default bands: moisture 15-60 %, conductivity 350-2000 µS/cm, brightness from 500 lx.
const HEALTHY = { friendly_name: "Fern", moisture: 40, conductivity: 800, max_brightness: 2000 };

function makeCard({ lang = "pl", plants, config = {} }) {
  const card = document.createElement("plants-card");
  card.setConfig({ plants: plants.map((_, i) => ({ entity: `plant.p${i}` })), ...config });
  const states = Object.fromEntries(plants.map((attrs, i) => [`plant.p${i}`, { state: "ok", attributes: attrs }]));
  card.hass = { locale: { language: lang }, states, callWS: async () => ({}) };
  return card;
}

const action = (card, i = 0) => card.shadowRoot.querySelectorAll(".action")[i].textContent;
const gaugeLabels = (card) => [...card.shadowRoot.querySelectorAll(".plant:first-of-type .gl")].map((e) => e.textContent);

test("a plant that needs nothing shows no text", () => {
  for (const lang of ["en", "de", "pl"]) assert.equal(action(makeCard({ lang, plants: [HEALTHY] })), "", lang);
});

test("a dry plant shows the water action per language", () => {
  const dry = { ...HEALTHY, moisture: 5 };
  for (const [lang, text] of [["en", "Water"], ["de", "Giessen"], ["pl", "Podlej"]]) {
    assert.equal(action(makeCard({ lang, plants: [dry] })), text, lang);
  }
});

test("the other actions per language, today's Polish verbatim", () => {
  const cases = [
    [{ moisture: 80 }, "Nie podlewaj"],
    [{ max_brightness: 100 }, "Więcej światła"],
    [{ conductivity: 100 }, "Nawieź"],
    [{ conductivity: 3000 }, "Przepłucz ziemię"],
    [{ problem: "temperature low" }, "Za zimno"],
    [{ problem: "temperature high" }, "Za ciepło"],
    [{ moisture: undefined }, "brak odczytu"],
  ];
  for (const [change, text] of cases) assert.equal(action(makeCard({ lang: "pl", plants: [{ ...HEALTHY, ...change }] })), text);
  const en = ["Don't water", "More light", "Fertilise", "Flush the soil", "Too cold", "Too warm", "no reading"];
  const de = ["Nicht giessen", "Mehr Licht", "Düngen", "Erde durchspülen", "Zu kalt", "Zu warm", "kein Messwert"];
  cases.forEach(([change], i) => {
    assert.equal(action(makeCard({ lang: "en", plants: [{ ...HEALTHY, ...change }] })), en[i]);
    assert.equal(action(makeCard({ lang: "de", plants: [{ ...HEALTHY, ...change }] })), de[i]);
  });
});

test("several actions are joined with a middle dot", () => {
  const card = makeCard({ lang: "en", plants: [{ ...HEALTHY, moisture: 5, conductivity: 100 }] });
  assert.equal(action(card), "Water · Fertilise");
});

test("gauge labels per language", () => {
  for (const [lang, labels] of [["en", ["Sun", "Fertiliser", "Water"]], ["de", ["Sonne", "Dünger", "Wasser"]], ["pl", ["Słońce", "Nawóz", "Woda"]]]) {
    assert.deepEqual(gaugeLabels(makeCard({ lang, plants: [HEALTHY] })), labels, lang);
  }
});

test("the title counts the plants to water", () => {
  const plants = [{ ...HEALTHY, moisture: 5 }, { ...HEALTHY, moisture: 3 }, HEALTHY];
  for (const [lang, text] of [["en", "Plants · to water: 2"], ["de", "Plants · zu giessen: 2"], ["pl", "Plants · do podlania: 2"]]) {
    assert.equal(makeCard({ lang, plants, config: { title: "Plants" } }).shadowRoot.querySelector(".title").textContent, text, lang);
  }
  assert.equal(makeCard({ plants: [HEALTHY], config: { title: "Plants" } }).shadowRoot.querySelector(".title").textContent, "Plants");
});

test("plants that need water come first", () => {
  const card = makeCard({ lang: "en", plants: [HEALTHY, { ...HEALTHY, friendly_name: "Cactus", moisture: 5 }] });
  assert.equal(card.shadowRoot.querySelector(".name").textContent, "Cactus");
});

test("in English no Polish letter reaches the page", () => {
  const plants = [{ ...HEALTHY, moisture: 5, conductivity: 100, max_brightness: 100, problem: "temperature low" }, { ...HEALTHY, moisture: undefined }];
  assert.doesNotMatch(shadowText(makeCard({ lang: "en", plants, config: { title: "Plants" } })), POLISH);
});
