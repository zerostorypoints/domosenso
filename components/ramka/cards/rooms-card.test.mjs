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

test("a spacer is an empty tile in its place; the rooms' colours skip it; trailing spacers go", () => {
  const card = document.createElement("rooms-card");
  card.setConfig({ rooms, entity: "sensor.ramka_climate_rooms" });
  const list = [{ spacer: true }, { label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" }, { label: "y", main: "" },
                { label: "Hall", main: "sensor.h_t", extra: "" }, { spacer: true }, { spacer: true }];
  card.hass = { locale: { language: "en" }, states: { ...states, "sensor.ramka_climate_rooms": { state: "2", attributes: { rooms: list } } } };
  const tiles = [...card.shadowRoot.querySelectorAll(".room")];
  assert.equal(tiles.length, 4);
  assert.deepEqual(tiles.map((el) => el.classList.contains("spacer")), [true, false, true, false]);
  assert.deepEqual(tiles.map((el) => el.textContent), ["", "Kitchen21.5 °C48 %", "", "Hall–"]);
  assert.match(card.shadowRoot.querySelector("style").textContent, /\.room\.spacer \{ visibility: hidden; \}/);
  // Colour n is the n-th room: the same as without the spacers.
  const plain = document.createElement("rooms-card");
  plain.setConfig({ rooms, entity: "sensor.ramka_climate_rooms" });
  plain.hass = { locale: { language: "en" }, states: { ...states, "sensor.ramka_climate_rooms": { state: "2", attributes: { rooms: [list[1], list[3]] } } } };
  const plainTiles = [...plain.shadowRoot.querySelectorAll(".room .temp")];
  assert.deepEqual([tiles[1], tiles[3]].map((el) => el.querySelector(".temp").style.color), plainTiles.map((el) => el.style.color));
  assert.notEqual(plainTiles[0].style.color, plainTiles[1].style.color);
  // A spacer that becomes a room again draws it.
  card.hass = { locale: { language: "en" }, states: { ...states, "sensor.ramka_climate_rooms": { state: "2", attributes: {
    rooms: [list[3], list[1], list[3], list[1]] } } } };
  assert.ok(![...card.shadowRoot.querySelectorAll(".room")].some((el) => el.classList.contains("spacer")));
  assert.equal(card.shadowRoot.querySelectorAll(".room")[0].querySelector(".name").textContent, "Hall");
});

test("only the first `slots` places show, the number of places as a number or an entity", () => {
  const list = [{ label: "Kitchen", main: "sensor.k_t", extra: "" }, { spacer: true }, { label: "Hall", main: "sensor.h_t", extra: "" }];
  const live = { "sensor.ramka_climate_rooms": { state: "2", attributes: { rooms: list } } };
  const make = (slots, extra = {}) => {
    const card = document.createElement("rooms-card");
    card.setConfig({ rooms, entity: "sensor.ramka_climate_rooms", slots });
    card.hass = { locale: { language: "en" }, states: { ...states, ...live, ...extra } };
    return [...card.shadowRoot.querySelectorAll(".room .name")].map((el) => el.textContent);
  };
  assert.deepEqual(make(1), ["Kitchen"]);
  assert.deepEqual(make(2), ["Kitchen"]);  // the spacer at the end goes
  assert.deepEqual(make(3), ["Kitchen", "", "Hall"]);
  assert.deepEqual(make("input_number.ramka_climate_slots", { "input_number.ramka_climate_slots": sensor("1.0") }), ["Kitchen"]);
  // An entity without a number: every place.
  assert.deepEqual(make("input_number.ramka_climate_slots"), ["Kitchen", "", "Hall"]);
});
