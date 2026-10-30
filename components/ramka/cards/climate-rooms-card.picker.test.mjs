// The climate card with Home Assistant's entity picker loaded; its own file, since a custom element
// defined here would stay defined for the dropdown tests (climate-rooms-card.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";

// A stand-in for HA's picker: plain properties, `value-changed` as the real one fires it.
class FakePicker extends HTMLElement {}
customElements.define("ha-entity-picker", FakePicker);
await import("./climate-rooms-card.js");

const ENTITY = "sensor.ramka_climate_rooms";
const states = {
  "sensor.k_t": { state: "21", attributes: { friendly_name: "Kitchen temperature", unit_of_measurement: "°C" } },
  "sensor.text": { state: "x", attributes: { friendly_name: "Text" } },
  [ENTITY]: { state: "1", attributes: { rooms: [{ label: "Kitchen", main: "sensor.k_t", extra: "" }] } },
};

function makeCard() {
  const calls = [];
  const card = document.createElement("climate-rooms-card");
  card.setConfig({ entity: ENTITY, script: "script.ramka_climate_rooms_set" });
  card.hass = { locale: { language: "en" }, states, callService: (...args) => calls.push(args) };
  return { card, calls };
}

test("each reading is HA's entity picker, of sensors with a unit, holding the room's sensor", () => {
  const { card } = makeCard();
  const pickers = [...card.shadowRoot.querySelectorAll("ha-entity-picker")];
  assert.equal(pickers.length, 10);
  assert.equal(card.shadowRoot.querySelectorAll("select").length, 0);
  assert.deepEqual(pickers.slice(0, 2).map((p) => p.value), ["sensor.k_t", ""]);
  assert.deepEqual(pickers[0].includeDomains, ["sensor"]);
  assert.equal(pickers[0].entityFilter(states["sensor.k_t"]), true);
  assert.equal(pickers[0].entityFilter(states["sensor.text"]), false);
  assert.equal(pickers[0].hass.states, states);
});

test("a pick saves the rooms", () => {
  const { card, calls } = makeCard();
  const pickers = card.shadowRoot.querySelectorAll("ha-entity-picker");
  pickers[2].dispatchEvent(new window.CustomEvent("value-changed", { detail: { value: "sensor.k_t" } }));
  assert.deepEqual(calls.at(-1), ["script", "ramka_climate_rooms_set", { rooms: [
    { label: "Kitchen", main: "sensor.k_t", extra: "" }, { label: "Kitchen temperature", main: "sensor.k_t", extra: "" }] }]);
  pickers[0].dispatchEvent(new window.CustomEvent("value-changed", { detail: { value: "" } }));
  assert.deepEqual(calls.at(-1)[2].rooms.map((r) => r.label), ["Kitchen temperature"]);
});
