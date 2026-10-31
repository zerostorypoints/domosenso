import { test } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { descriptionFor } from "./info-select-row.js";

// Home Assistant's card helpers, stubbed: the row they make records its config and hass.
const made = [];
window.loadCardHelpers = async () => ({
  createRowElement(config) {
    const row = document.createElement("div");
    row.className = "ha-row";
    row.config = config;
    made.push(row);
    return row;
  },
});

const ENTITY = "input_select.ramka_music_template";
const DESCRIPTIONS = { custom: "Your own.\nBest use: anything.", calm: "Slow <b>and</b> ambient." };

function hassWith(state, lang = "en") {
  return { locale: { language: lang }, states: { [ENTITY]: { state } } };
}

async function makeRow(state = "custom", config = {}) {
  const row = document.createElement("ramka-info-select-row");
  row.setConfig({ entity: ENTITY, name: "Response profile", descriptions: DESCRIPTIONS, ...config });
  row.hass = hassWith(state);
  document.body.appendChild(row);
  await new Promise((resolve) => setTimeout(resolve, 0));  // loadCardHelpers
  return row;
}

const button = (row) => row.shadowRoot.querySelector("button");
const tip = (row) => row.shadowRoot.querySelector(".tip");
const click = (el) => el.dispatchEvent(new window.Event("click"));
const pointer = (el, type, pointerType) => {
  const ev = new window.Event(type);
  ev.pointerType = pointerType;
  el.dispatchEvent(ev);
};

test("the description of the current option; none for an unknown option, entity or state", () => {
  const config = { entity: ENTITY, descriptions: DESCRIPTIONS };
  assert.equal(descriptionFor(config, hassWith("calm")), DESCRIPTIONS.calm);
  assert.equal(descriptionFor(config, hassWith("lively")), "");
  assert.equal(descriptionFor(config, hassWith("unavailable")), "");
  assert.equal(descriptionFor(config, { states: {} }), "");
  assert.equal(descriptionFor(config, undefined), "");
  assert.equal(descriptionFor({ entity: ENTITY }, hassWith("calm")), "");
});

test("it renders Home Assistant's row for the entity, with the name and hass passed through", async () => {
  const row = await makeRow();
  const inner = row.shadowRoot.querySelector(".ha-row");
  assert.ok(inner);
  assert.deepEqual(inner.config, { entity: ENTITY, name: "Response profile" });
  assert.equal(inner.hass.states[ENTITY].state, "custom");
  row.hass = hassWith("calm");
  assert.equal(inner.hass.states[ENTITY].state, "calm");
});

test("a tap toggles the tooltip; it shows the selected option's text as text, line breaks kept", async () => {
  const row = await makeRow("calm");
  assert.equal(tip(row).hidden, true);
  click(button(row));
  assert.equal(tip(row).hidden, false);
  assert.equal(button(row).getAttribute("aria-expanded"), "true");
  assert.equal(tip(row).textContent, "Slow <b>and</b> ambient.");
  assert.equal(tip(row).querySelector("b"), null);
  row.hass = hassWith("custom");
  assert.equal(tip(row).textContent, DESCRIPTIONS.custom);
  click(button(row));
  assert.equal(tip(row).hidden, true);
});

test("hover with a mouse shows it, leaving hides it; a touch is not a hover", async () => {
  const row = await makeRow("calm");
  pointer(button(row), "pointerenter", "touch");
  assert.equal(tip(row).hidden, true);
  pointer(button(row), "pointerenter", "mouse");
  assert.equal(tip(row).hidden, false);
  pointer(button(row), "pointerleave", "mouse");
  assert.equal(tip(row).hidden, true);
});

test("a tap outside or Escape closes it", async () => {
  const row = await makeRow("calm");
  click(button(row));
  document.body.dispatchEvent(new window.Event("pointerdown", { bubbles: true, composed: true }));
  assert.equal(tip(row).hidden, true);
  click(button(row));
  const key = new window.Event("keydown");
  key.key = "Escape";
  document.dispatchEvent(key);
  assert.equal(tip(row).hidden, true);
});

test("without a description for the current option the icon is hidden and nothing opens", async () => {
  const row = await makeRow("lively");
  assert.equal(button(row).hidden, true);
  click(button(row));
  assert.equal(tip(row).hidden, true);
  // Open, then the option changes to one without a text: it closes and the icon goes.
  row.hass = hassWith("calm");
  assert.equal(button(row).hidden, false);
  click(button(row));
  row.hass = hassWith("lively");
  assert.equal(button(row).hidden, true);
  assert.equal(tip(row).hidden, true);
});

test("the button's label is translated", async () => {
  const row = await makeRow("calm");
  for (const [lang, label] of [["en", "About this choice"], ["de", "Zu dieser Auswahl"], ["pl", "O tym wyborze"]]) {
    row.hass = { ...hassWith("calm"), locale: { language: lang } };
    assert.equal(button(row).getAttribute("aria-label"), label, lang);
  }
});

test("an entity is required", () => {
  const row = document.createElement("ramka-info-select-row");
  assert.throws(() => row.setConfig({}), /entity is required/);
});
