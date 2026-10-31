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
  "sensor.k_t": { state: "21", attributes: { friendly_name: "Kitchen temperature", unit_of_measurement: "°C", device_class: "temperature" } },
  "sensor.k_h": { state: "48", attributes: { friendly_name: "Kitchen humidity", unit_of_measurement: "%", device_class: "humidity" } },
  "sensor.text": { state: "x", attributes: { friendly_name: "Text" } },
  [ENTITY]: { state: "2", attributes: { rooms: [{ label: "Kitchen", main: "sensor.k_t", extra: "" },
                                                { type: "custom", label: "Any", main: "sensor.k_h", extra: "" }] } },
};

function makeCard() {
  const calls = [];
  const card = document.createElement("climate-rooms-card");
  card.setConfig({ entity: ENTITY, script: "script.ramka_climate_rooms_set" });
  card.hass = { locale: { language: "en" }, states, callService: (...args) => calls.push(args) };
  return { card, calls };
}

test("each reading is HA's entity picker, of the type's sensors with a unit, holding the widget's sensor", () => {
  const { card } = makeCard();
  const pickers = [...card.shadowRoot.querySelectorAll("ha-entity-picker")];
  assert.equal(pickers.length, 4);  // two widgets with a type, two readings each; the eight Empty rows none
  assert.equal(card.shadowRoot.querySelectorAll("select:not(.type)").length, 0);
  assert.deepEqual(pickers.map((p) => p.value), ["sensor.k_t", "", "sensor.k_h", ""]);
  assert.deepEqual(pickers[0].includeDomains, ["sensor"]);
  // Temperature (an entry from before the types, its main a temperature): temperatures and humidities.
  assert.deepEqual([pickers[0].includeDeviceClasses, pickers[1].includeDeviceClasses], [["temperature"], ["humidity"]]);
  assert.equal(pickers[0].entityFilter(states["sensor.k_t"]), true);
  assert.equal(pickers[0].entityFilter(states["sensor.k_h"]), false);
  assert.equal(pickers[1].entityFilter(states["sensor.k_h"]), true);
  assert.equal(pickers[0].entityFilter(states["sensor.text"]), false);
  // Custom: any sensor with a unit.
  assert.equal(pickers[2].includeDeviceClasses, undefined);
  assert.equal(pickers[2].entityFilter(states["sensor.k_t"]), true);
  assert.equal(pickers[2].entityFilter(states["sensor.text"]), false);
  assert.equal(pickers[0].hass.states, states);
});

test("a pick saves the rooms", () => {
  const { card, calls } = makeCard();
  const pickers = card.shadowRoot.querySelectorAll("ha-entity-picker");
  pickers[1].dispatchEvent(new window.CustomEvent("value-changed", { detail: { value: "sensor.k_h" } }));
  assert.deepEqual(calls.at(-1), ["script", "ramka_climate_rooms_set", { rooms: [
    { type: "temperature", label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" }, { type: "custom", label: "Any", main: "sensor.k_h", extra: "" }] }]);
  pickers[0].dispatchEvent(new window.CustomEvent("value-changed", { detail: { value: "" } }));
  assert.deepEqual(calls.at(-1)[2].rooms[0], { type: "temperature", label: "Kitchen", main: "", extra: "sensor.k_h" });
});
