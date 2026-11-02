import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./testing/dom-env.mjs";
import { colourOptions } from "./colour-select-row.js";
import { placeList } from "./lib/colour-list.js";
import { COLOUR_IDS } from "./lib/colours.js";

const ENTITY = "input_select.ramka_air_color_fair";
const OPTIONS = ["amber", ...COLOUR_IDS.filter((id) => id !== "amber")];

function hassWith(state, { lang = "en", options = OPTIONS, calls = [] } = {}) {
  return { locale: { language: lang }, callService: (...args) => calls.push(args),
           states: { [ENTITY]: { entity_id: ENTITY, state, attributes: { options, friendly_name: "Ramka fair colour" } } } };
}

function makeRow(state = "amber", config = {}, opts = {}) {
  const row = document.createElement("ramka-colour-select-row");
  row.setConfig({ entity: ENTITY, name: "Fair colour", ...config });
  const calls = [];
  row.hass = hassWith(state, { ...opts, calls });
  document.body.appendChild(row);
  return { row, calls };
}

const $ = (row, sel) => row.shadowRoot.querySelector(sel);
const choices = (row) => [...row.shadowRoot.querySelectorAll(".colour-option")];
const key = (el, k) => {
  const ev = new window.Event("keydown", { bubbles: true, cancelable: true, composed: true });
  ev.key = k;
  el.dispatchEvent(ev);
  return ev;
};

test("the options are the entity's, in its order, named in the page's language, each with its colour", () => {
  const de = colourOptions(hassWith("amber").states[ENTITY], hassWith("amber"), "de");
  assert.deepEqual(de.map((o) => o.value), OPTIONS);
  assert.deepEqual(de.slice(0, 3).map((o) => o.text), ["Bernstein", "Grün", "Türkis"]);
  assert.equal(de[0].colour, "var(--graph-color-2, #f5c542)");
  // Without `lang`, the user's language; an option that is no named colour shows as itself, no colour.
  const pl = colourOptions({ attributes: { options: ["red", "chartreuse"] } }, { locale: { language: "pl" } });
  assert.deepEqual(pl, [{ value: "red", text: "Czerwony", colour: "var(--graph-color-3, #ff7a5c)" },
                        { value: "chartreuse", text: "chartreuse", colour: null }]);
  assert.deepEqual(colourOptions(undefined, {}), []);
});

test("the row: the name, the value with its dot, a dot before every choice", () => {
  const { row } = makeRow("red", { lang: "de" });
  assert.equal($(row, ".name").textContent, "Fair colour");
  assert.equal($(row, ".colour-value .text").textContent, "Rot");
  assert.equal($(row, ".colour-value .swatch").style.background, "var(--graph-color-3, #ff7a5c)");
  assert.equal(choices(row).length, OPTIONS.length);
  for (const item of choices(row)) {
    assert.equal(item.querySelector(".swatch").className, "swatch");
    assert.ok(item.querySelector(".swatch").style.background.startsWith("var(--graph-color-"));
  }
  assert.deepEqual(choices(row).filter((o) => o.getAttribute("aria-selected") === "true").map((o) => o.dataset.value), ["red"]);
  // The climate picker's swatch: the same class, size and shape.
  assert.match($(row, "style").textContent, /\.swatch \{ width: 14px; height: 14px; border-radius: 50%;/);
  // Without a name: the entity's.
  assert.equal($(makeRow("red", { name: undefined }).row, ".name").textContent, "Ramka fair colour");
  row.remove();
});

test("a tap opens the list as an overlay, a tap on a choice selects it with input_select.select_option", () => {
  const { row, calls } = makeRow("amber");
  const list = $(row, ".colour-options");
  assert.equal(list.hidden, true);
  $(row, ".colour-value").click();
  assert.equal(list.hidden, false);
  assert.equal($(row, ".colour-value").getAttribute("aria-expanded"), "true");
  choices(row).find((o) => o.dataset.value === "teal").click();
  assert.equal(list.hidden, true);
  assert.deepEqual(calls, [["input_select", "select_option", { entity_id: ENTITY, option: "teal" }]]);
  // The row then follows the entity's state.
  row.hass = hassWith("teal");
  assert.equal($(row, ".colour-value .text").textContent, "Teal");
  // Picking the chosen one again calls nothing.
  $(row, ".colour-value").click();
  choices(row).find((o) => o.dataset.value === "teal").click();
  assert.equal(calls.length, 1);
  row.remove();
});

test("keyboard: an arrow opens the list on the chosen one, arrows and Home / End move, Enter picks, Escape closes", () => {
  const { row, calls } = makeRow("amber");
  const button = $(row, ".colour-value");
  assert.equal(button.getAttribute("aria-haspopup"), "listbox");
  assert.equal($(row, ".colour-options").getAttribute("role"), "listbox");
  assert.ok(choices(row).every((o) => o.getAttribute("role") === "option"));
  key(button, "ArrowDown");
  assert.equal($(row, ".colour-options").hidden, false);
  assert.equal(row.shadowRoot.activeElement, choices(row)[0]);
  key(choices(row)[0], "ArrowDown");
  assert.equal(row.shadowRoot.activeElement, choices(row)[1]);
  key(choices(row)[1], "End");
  assert.equal(row.shadowRoot.activeElement, choices(row).at(-1));
  key(choices(row).at(-1), "ArrowUp");
  key(choices(row).at(-2), "Enter");
  assert.deepEqual(calls.at(-1), ["input_select", "select_option", { entity_id: ENTITY, option: OPTIONS.at(-2) }]);
  assert.equal(row.shadowRoot.activeElement, button);
  key(button, "ArrowUp");
  const esc = key(choices(row)[0], "Escape");
  assert.equal(esc.defaultPrevented, true);
  assert.equal($(row, ".colour-options").hidden, true);
  assert.equal(calls.length, 1);
  row.remove();
});

test("a tap elsewhere or a scroll of the page closes the list; a scroll of the list itself does not", () => {
  const { row } = makeRow("amber");
  const list = $(row, ".colour-options");
  $(row, ".colour-value").click();
  list.dispatchEvent(new window.Event("scroll", { bubbles: true, composed: true }));
  assert.equal(list.hidden, false);
  window.dispatchEvent(new window.Event("scroll"));
  assert.equal(list.hidden, true);
  $(row, ".colour-value").click();
  document.body.dispatchEvent(new window.Event("pointerdown", { bubbles: true, composed: true }));
  assert.equal(list.hidden, true);
  row.remove();
});

test("unavailable, it cannot be opened", () => {
  const { row } = makeRow("unavailable");
  assert.equal($(row, ".colour-value").disabled, true);
  $(row, ".colour-value").click();
  assert.equal($(row, ".colour-options").hidden, true);
  row.remove();
});

test("the list floats: fixed, above the cards, out of the layout; below the button, above it without room", () => {
  const { row } = makeRow("amber");
  const css = $(row, "style").textContent;
  const rule = css.slice(css.indexOf(".colour-options {"), css.indexOf("}", css.indexOf(".colour-options {")));
  assert.match(rule, /position: fixed/);
  assert.match(rule, /z-index: \d{4,}/);
  assert.match(rule, /overflow-y: auto/);
  assert.equal($(row, ".colour-options").getAttribute("popover"), "manual");
  const viewport = { width: 400, height: 800 };
  const below = placeList({ left: 100, right: 300, top: 100, bottom: 140 }, { width: 150, height: 300 }, viewport);
  assert.deepEqual(below, { left: 100, top: 144, minWidth: 200, maxHeight: 648, side: "below" });
  const above = placeList({ left: 100, right: 300, top: 700, bottom: 740 }, { width: 150, height: 300 }, viewport);
  assert.equal(above.side, "above");
  assert.equal(above.top, 700 - 4 - 300);
  // Taller than either side: on the roomier one, scrolling; kept inside the viewport's width.
  const tall = placeList({ left: 350, right: 390, top: 300, bottom: 340 }, { width: 200, height: 2000 }, viewport);
  assert.deepEqual([tall.side, tall.maxHeight, tall.left], ["below", 448, 192]);
  row.remove();
});

test("the row needs an entity; the shared modules are imported with the row's own ?v=", () => {
  const row = document.createElement("ramka-colour-select-row");
  assert.throws(() => row.setConfig({}), /entity is required/);
  const source = readFileSync(new URL("./colour-select-row.js", import.meta.url), "utf8");
  assert.match(source, /load\("\.\/lib\/colour-list\.js"\)/);
  assert.match(source, /href \+ version/);
});
