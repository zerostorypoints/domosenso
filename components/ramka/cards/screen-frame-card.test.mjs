import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { conditionMet } from "./screen-frame-card.js";

afterEach(() => { delete window.loadCardHelpers; });

const flush = () => new Promise((resolve) => setImmediate(resolve));

// Cards made by the stand-in helpers: a div that remembers its config and the hass it got.
async function makeCard(config) {
  const made = [];
  window.loadCardHelpers = async () => ({
    createCardElement: (c) => {
      const el = document.createElement("div");
      el.config = c;
      made.push(el);
      return el;
    },
  });
  const card = document.createElement("screen-frame-card");
  card.setConfig({ width: 1100, height: 720, sections: [], ...config });
  await flush();
  return { card, made };
}

const SECTIONS = [
  { type: "grid", column_span: 3, cards: [{ type: "custom:clock-weather-card", grid_options: { columns: "full", rows: 3 } }] },
  { type: "grid", column_span: 3, cards: [
    { type: "custom:line-style-card", grid_options: { columns: 18, rows: 4 } },
    { type: "statistics-graph", grid_options: { columns: 18, rows: "auto" } },
  ] },
];

test("width, height and sections are required", () => {
  const card = () => document.createElement("screen-frame-card");
  assert.throws(() => card().setConfig({ height: 720, sections: [] }), /width must be a positive number/);
  assert.throws(() => card().setConfig({ width: 1100, height: 0, sections: [] }), /height must be a positive number/);
  assert.throws(() => card().setConfig({ width: 1100, height: 720 }), /sections is required/);
});

test("every card of every section is made from its config, in order, one grid per section", async () => {
  const { card, made } = await makeCard({ sections: SECTIONS });
  assert.deepEqual(made.map((el) => el.config), SECTIONS.flatMap((s) => s.cards));
  const grids = card.shadowRoot.querySelectorAll(".section");
  assert.equal(grids.length, 2);
  assert.equal(grids[1].children.length, 2);
});

test("a section of three columns is a 36-column grid; grid_options give each card its span and rows", async () => {
  const { card, made } = await makeCard({ sections: SECTIONS });
  const grid = card.shadowRoot.querySelector(".section");
  assert.match(grid.style.gridTemplateColumns, /repeat\(36,/);
  assert.equal(made[0].style.gridColumn, "span 36");
  assert.equal(made[0].style.height, `${3 * 56 + 2 * 8}px`);
  assert.equal(made[1].style.gridColumn, "span 18");
  assert.equal(made[1].style.height, `${4 * 56 + 3 * 8}px`);
  assert.equal(made[2].style.height, "", "rows auto: the card's own height");
});

test("the screen is a box of the configured size; hass reaches every card", async () => {
  const { card, made } = await makeCard({ sections: SECTIONS, background: "#000000" });
  const screen = card.shadowRoot.querySelector(".screen");
  assert.equal(screen.style.width, "1100px");
  assert.equal(screen.style.height, "720px");
  const hass = { states: {} };
  card.hass = hass;
  assert.ok(made.every((el) => el.hass === hass));
});

test("a narrower card scales the screen down to its width, never up", async () => {
  const { card } = await makeCard({ sections: [] });
  Object.defineProperty(card, "clientWidth", { configurable: true, get: () => 550 });
  card._fit();
  const outer = card.shadowRoot.querySelector(".outer");
  assert.equal(outer.firstElementChild.style.transform, "scale(0.5)");
  assert.equal(outer.style.width, "550px");
  assert.equal(outer.style.height, "360px");
  Object.defineProperty(card, "clientWidth", { configurable: true, get: () => 2000 });
  card._fit();
  assert.equal(outer.firstElementChild.style.transform, "scale(1)");
});

test("the link navigates inside Home Assistant to the settings page", async () => {
  const { card } = await makeCard({ link: { label: "Settings for this screen", path: "/ramka-settings/climate" } });
  const link = card.shadowRoot.querySelector("a.link");
  assert.equal(link.textContent, "Settings for this screen");
  let changed = 0;
  const listener = () => changed++;
  window.addEventListener("location-changed", listener);
  link.click();
  window.removeEventListener("location-changed", listener);
  assert.equal(window.location.pathname, "/ramka-settings/climate");
  assert.equal(changed, 1);
});

test("a card with its own height keeps it: grid rows size only the cards without one (the calendar)", async () => {
  const agenda = { type: "custom:agenda-card", height: "calc(720px - 16px)", grid_options: { columns: "full", rows: 1 } };
  const { made } = await makeCard({ sections: [{ type: "grid", column_span: 3, cards: [agenda] }] });
  assert.equal(made[0].style.gridRow, "span 1");
  assert.equal(made[0].style.height, "", "no inline 56 px over the card's own height");
});

test("sections sit in three view columns, each spanning its column_span (the controls side by side)", async () => {
  const one = (name) => ({ type: "grid", cards: [{ type: "heading", heading: name }] });
  const { card } = await makeCard({ sections: [one("music"), one("awnings"), one("lights"), SECTIONS[0]] });
  const screen = card.shadowRoot.querySelector(".screen");
  assert.match(card.shadowRoot.querySelector("style").textContent, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  const grids = [...screen.querySelectorAll(".section")];
  assert.deepEqual(grids.map((g) => g.style.gridColumn), ["span 1", "span 1", "span 1", "span 3"]);
  assert.match(grids[0].style.gridTemplateColumns, /repeat\(12,/);
});

test("a card's own visibility is applied and follows the states", async () => {
  const playerOn = [{ condition: "state", entity: "media_player.x", state_not: "off" }, { condition: "state", entity: "media_player.x", state_not: "unavailable" }];
  const off = [{ condition: "state", entity: "media_player.x", state: "off" }];
  const { card, made } = await makeCard({ sections: [{ type: "grid", cards: [
    { type: "media-control", visibility: playerOn }, { type: "button", visibility: off }, { type: "heading" },
  ] }] });
  card.hass = { states: { "media_player.x": { state: "playing" } } };
  assert.deepEqual(made.map((el) => el.style.display), ["", "none", ""]);
  card.hass = { states: { "media_player.x": { state: "off" } } };
  assert.deepEqual(made.map((el) => el.style.display), ["none", "", ""]);
  card.hass = { states: {} };
  assert.deepEqual(made.map((el) => el.style.display), ["none", "none", ""], "a missing entity is unavailable");
});

test("conditions: state lists, state_not, numeric_state, and / or / not", () => {
  const hass = { states: { "a.x": { state: "on" }, "a.n": { state: "12" } } };
  assert.equal(conditionMet({ condition: "state", entity: "a.x", state: ["off", "on"] }, hass), true);
  assert.equal(conditionMet({ condition: "state", entity: "a.x", state_not: ["on"] }, hass), false);
  assert.equal(conditionMet({ condition: "state", entity: "a.missing", state: "unavailable" }, hass), true);
  assert.equal(conditionMet({ condition: "numeric_state", entity: "a.n", above: 10, below: 20 }, hass), true);
  assert.equal(conditionMet({ condition: "numeric_state", entity: "a.n", below: 10 }, hass), false);
  const on = { condition: "state", entity: "a.x", state: "on" };
  const no = { condition: "state", entity: "a.x", state: "off" };
  assert.equal(conditionMet({ condition: "or", conditions: [no, on] }, hass), true);
  assert.equal(conditionMet({ condition: "and", conditions: [no, on] }, hass), false);
  assert.equal(conditionMet({ condition: "not", conditions: [no] }, hass), true);
  assert.equal(conditionMet({ condition: "screen", media_query: "(min-width: 0px)" }, hass), true, "unknown: met");
});
