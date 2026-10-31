import { test } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { descriptionFor, placeTip } from "./info-select-row.js";

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

test("a scroll closes it, pinned or hovered", async () => {
  const row = await makeRow("calm");
  click(button(row));
  assert.equal(tip(row).hidden, false);
  window.dispatchEvent(new window.Event("scroll"));
  assert.equal(tip(row).hidden, true);
  assert.equal(button(row).getAttribute("aria-expanded"), "false");
  pointer(button(row), "pointerenter", "mouse");
  assert.equal(tip(row).hidden, false);
  document.body.dispatchEvent(new window.Event("scroll"));  // a scroller inside the page (captured)
  assert.equal(tip(row).hidden, true);
});

test("it floats: fixed, above the cards, out of the row's layout, theme colours, at most 360 px wide", async () => {
  const row = await makeRow("calm");
  const css = row.shadowRoot.querySelector("style").textContent;
  const rule = css.slice(css.indexOf(".tip {"), css.indexOf("}", css.indexOf(".tip {")));
  assert.match(rule, /position: fixed/);
  assert.match(rule, /z-index: \d{4,}/);
  assert.match(rule, /max-width: min\(360px/);
  assert.match(rule, /var\(--primary-text-color\)/);
  assert.match(rule, /var\(--divider-color\)/);
  assert.doesNotMatch(css, /accordion|max-height/);
  // In the top layer where the browser has popovers; positioned when shown.
  assert.equal(tip(row).getAttribute("popover"), "manual");
  click(button(row));
  assert.match(tip(row).style.left, /^\d+px$/);
  assert.match(tip(row).style.top, /^\d+px$/);
  assert.ok(["below", "above"].includes(tip(row).dataset.side));
});

test("placement: below the button, above when there is no room, clamped to the viewport", () => {
  const viewport = { width: 1100, height: 720 };
  const at = (left, top) => ({ left, top, right: left + 40, bottom: top + 40 });
  const size = { width: 300, height: 120 };
  // Room below: under the button, centred on it.
  assert.deepEqual(placeTip(at(500, 100), size, viewport), { left: 370, top: 146, side: "below" });
  // Near the bottom: above it.
  assert.deepEqual(placeTip(at(500, 650), size, viewport), { left: 370, top: 524, side: "above" });
  // At the right edge and the left edge: kept 8 px inside.
  assert.equal(placeTip(at(1060, 100), size, viewport).left, 1100 - 8 - 300);
  assert.equal(placeTip(at(0, 100), size, viewport).left, 8);
  // Taller than the room either way: on the roomier side, still inside the viewport.
  const tall = placeTip(at(500, 300), { width: 300, height: 700 }, viewport);
  assert.deepEqual(tall, { left: 370, top: 12, side: "below" });
  // A phone: wider than the screen is impossible (max-width), a 359 px tooltip on 375 px stays in.
  const phone = placeTip(at(320, 200), { width: 359, height: 80 }, { width: 375, height: 812 });
  assert.equal(phone.left, 8);
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
