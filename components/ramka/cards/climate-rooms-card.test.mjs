import { test } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import "./climate-rooms-card.js";

const ENTITY = "sensor.ramka_climate_rooms";
const sensor = (name, unit) => ({ state: "21", attributes: { friendly_name: name, ...(unit ? { unit_of_measurement: unit } : {}) } });
const STATES = {
  "sensor.k_t": sensor("Kitchen temperature", "°C"),
  "sensor.k_h": sensor("Kitchen humidity", "%"),
  "sensor.b_t": sensor("Bedroom temperature", "°C"),
  "sensor.b_co2": sensor("Bedroom CO2", "ppm"),
  "sensor.weather_text": sensor("Weather text"),
  "binary_sensor.door": sensor("Door", "%"),
};

function makeCard({ rooms, lang = "en", extra = {} } = {}) {
  const calls = [];
  const card = document.createElement("climate-rooms-card");
  card.setConfig({ entity: ENTITY, script: "script.ramka_climate_rooms_set" });
  const states = { ...STATES, ...(rooms ? { [ENTITY]: { state: String(rooms.length), attributes: { rooms } } } : {}) };
  card.hass = { locale: { language: lang }, states, callService: (...args) => calls.push(args), ...extra };
  return { card, calls };
}

const selects = (card) => [...card.shadowRoot.querySelectorAll("select")];
const inputs = (card) => [...card.shadowRoot.querySelectorAll("input")];
const change = (el, value) => {
  el.value = value;
  el.dispatchEvent(new window.Event("change"));
};

test("ten rooms, each a name and two dropdowns; the rooms fill the first rows", () => {
  const { card } = makeCard({ rooms: [{ label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" }] });
  assert.equal(card.shadowRoot.querySelectorAll(".row").length, 10);
  assert.deepEqual(selects(card).map((s) => s.value), ["sensor.k_t", "sensor.k_h", ...Array(18).fill("")]);
  assert.deepEqual(inputs(card).map((i) => i.value), ["Kitchen", ...Array(9).fill("")]);
  assert.equal(card.shadowRoot.querySelector(".room").textContent, "Room 1");
});

test("the dropdowns list the sensors with a unit, by name, after the empty choice", () => {
  const { card } = makeCard({ rooms: [] });
  const options = [...selects(card)[0].options].map((o) => [o.value, o.textContent]);
  assert.deepEqual(options, [["", "—"], ["sensor.b_co2", "Bedroom CO2 (ppm)"], ["sensor.b_t", "Bedroom temperature (°C)"],
                             ["sensor.k_h", "Kitchen humidity (%)"], ["sensor.k_t", "Kitchen temperature (°C)"]]);
});

test("a change saves every room that has a main reading, in order", () => {
  const { card, calls } = makeCard({ rooms: [{ label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" }] });
  change(selects(card)[4], "sensor.b_co2");
  change(inputs(card)[2], " Bedroom ");
  assert.deepEqual(calls.at(-1), ["script", "ramka_climate_rooms_set", { rooms: [
    { label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" },
    { label: "Bedroom", main: "sensor.b_co2", extra: "" },
  ] }]);
  change(selects(card)[0], "");
  assert.deepEqual(calls.at(-1)[2].rooms.map((r) => r.main), ["sensor.b_co2"]);
});

test("an empty name becomes the main sensor's area, else its name", () => {
  const extra = { entities: { "sensor.b_t": { device_id: "d1" } }, devices: { d1: { area_id: "bed" } }, areas: { bed: { name: "Sleeping room" } } };
  const { card, calls } = makeCard({ rooms: [], extra });
  change(selects(card)[0], "sensor.b_t");
  change(selects(card)[2], "sensor.k_t");
  assert.deepEqual(calls.at(-1)[2].rooms.map((r) => r.label), ["Sleeping room", "Kitchen temperature"]);
});

test("a sensor that is gone stays chosen, marked", () => {
  const { card } = makeCard({ rooms: [{ label: "Attic", main: "sensor.gone", extra: "" }] });
  const select = selects(card)[0];
  assert.equal(select.value, "sensor.gone");
  assert.equal(select.selectedOptions[0].textContent, "sensor.gone (not found)");
});

test("labels per language; a sensor name is text, not markup", () => {
  const { card } = makeCard({ rooms: [], lang: "pl", extra: {} });
  assert.equal(card.shadowRoot.querySelector(".room").textContent, "Pokój 1");
  const odd = document.createElement("climate-rooms-card");
  odd.setConfig({ entity: ENTITY, script: "script.x" });
  odd.hass = { locale: { language: "de" }, states: { "sensor.x": sensor("<b>x</b>", "°C") }, callService() {} };
  assert.equal(odd.shadowRoot.querySelectorAll("b").length, 0);
  assert.equal(odd.shadowRoot.querySelector(".room").textContent, "Raum 1");
});

test("entity and script are required", () => {
  assert.throws(() => document.createElement("climate-rooms-card").setConfig({ script: "script.x" }), /entity is required/);
  assert.throws(() => document.createElement("climate-rooms-card").setConfig({ entity: ENTITY }), /script is required/);
});
