import { test } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { shadowText } from "./testing/dom-env.mjs";
import "./rooms-card.js";

const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

function makeCard({ lang = "pl", states, rooms }) {
  const card = document.createElement("rooms-card");
  card.setConfig({ rooms });
  card.hass = { locale: { language: lang }, states };
  return card;
}

const sensor = (state) => ({ state, attributes: {} });
const rooms = [
  { name: "Kitchen", temperature: "sensor.k_t", humidity: "sensor.k_h" },
  { name: "Hall", temperature: "sensor.h_t" },
];
const states = { "sensor.k_t": sensor("21.46"), "sensor.k_h": sensor("48.4"), "sensor.h_t": sensor("unavailable") };

test("temperature and humidity are formatted as before", () => {
  const card = makeCard({ states, rooms });
  const [kitchen, hall] = card.shadowRoot.querySelectorAll(".room");
  assert.equal(kitchen.querySelector(".name").textContent, "Kitchen");
  assert.equal(kitchen.querySelector(".temp").textContent, "21.5 °C");
  assert.equal(kitchen.querySelector(".hum").textContent, "48 %");
  assert.equal(hall.querySelector(".hum").textContent, "");
});

test("a reading that is not available shows the common no-value dash in every language", () => {
  for (const lang of ["en", "de", "pl"]) {
    const card = makeCard({ lang, states, rooms });
    assert.equal(card.shadowRoot.querySelectorAll(".temp")[1].textContent, "–", lang);
  }
});

test("in English no Polish letter reaches the page", () => {
  assert.doesNotMatch(shadowText(makeCard({ lang: "en", states, rooms })), POLISH);
});

test("a card without rooms is a config error", () => {
  const card = document.createElement("rooms-card");
  assert.throws(() => card.setConfig({ rooms: [] }), /rooms is required/);
});

test("the settings page's rooms replace the configured ones, in their order and colours", () => {
  const card = document.createElement("rooms-card");
  card.setConfig({ rooms, entity: "sensor.ramka_climate_rooms" });
  const live = { "sensor.ramka_climate_rooms": { state: "2", attributes: { rooms: [
    { label: "Hall", main: "sensor.h_co2", extra: "" }, { label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" }, { label: "x", main: "" }] } },
    "sensor.h_co2": { state: "612", attributes: { unit_of_measurement: "ppm" } } };
  card.hass = { locale: { language: "en" }, states: { ...states, ...live } };
  const tiles = [...card.shadowRoot.querySelectorAll(".room")];
  assert.deepEqual(tiles.map((el) => [el.querySelector(".name").textContent, el.querySelector(".temp").textContent, el.querySelector(".hum").textContent]),
                   [["Hall", "612.0 ppm", ""], ["Kitchen", "21.5 °C", "48 %"]]);
  // Without rooms in the entity (before the seed) the configured ones show.
  card.hass = { locale: { language: "en" }, states };
  assert.equal(card.shadowRoot.querySelectorAll(".room").length, 2);
  assert.equal(card.shadowRoot.querySelector(".name").textContent, "Kitchen");
});
