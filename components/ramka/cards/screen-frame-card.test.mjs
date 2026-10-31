import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import "./screen-frame-card.js";

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
