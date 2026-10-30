import { test } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import "./photo-albums-card.js";

const ENTITY = "sensor.ramka_photo_albums";

function makeCard({ available = [], chosen = [], all, lang = "en" } = {}) {
  const calls = [];
  const card = document.createElement("photo-albums-card");
  card.setConfig({ entity: ENTITY, script: "script.ramka_photo_albums_set" });
  const attributes = { available, chosen, ...(all === undefined ? {} : { all }) };
  card.hass = { locale: { language: lang }, states: { [ENTITY]: { state: String(chosen.length), attributes } },
                callService: (...args) => calls.push(args) };
  return { card, calls };
}

const rows = (card) => [...card.shadowRoot.querySelectorAll("li label")].map((l) => [l.querySelector("span").textContent, l.querySelector("input").checked]);
const disabled = (card) => [...card.shadowRoot.querySelectorAll("li label input")].map((box) => box.disabled);
const tick = (card, index) => {
  const box = card.shadowRoot.querySelectorAll("li label input")[index];
  box.checked = !box.checked;
  box.dispatchEvent(new window.Event("change"));
};

test("none chosen: All albums ticked, every album unticked and greyed out", () => {
  const { card } = makeCard({ available: ["2024 Kreta", "2025 Tallin"] });
  assert.deepEqual(rows(card), [["All albums", true], ["2024 Kreta", false], ["2025 Tallin", false]]);
  assert.deepEqual(disabled(card), [false, true, true]);
});

test("ticking an album adds it, unticking the last one is all again", () => {
  const { card, calls } = makeCard({ available: ["a", "b", "c"], chosen: ["b"] });
  assert.deepEqual(rows(card).map(([, on]) => on), [false, false, true, false]);
  assert.deepEqual(disabled(card), [false, false, false, false]);
  tick(card, 1);
  tick(card, 2);
  assert.deepEqual(calls, [["script", "ramka_photo_albums_set", { chosen: ["b", "a"], all: false }],
                           ["script", "ramka_photo_albums_set", { chosen: [], all: true }]]);
});

test("ticking All albums keeps the ticks and greys them out; unticking it brings them back", () => {
  const { card, calls } = makeCard({ available: ["a", "b"], chosen: ["a", "b"] });
  tick(card, 0);
  assert.deepEqual(calls, [["script", "ramka_photo_albums_set", { chosen: ["a", "b"], all: true }]]);
  const on = makeCard({ available: ["a", "b"], chosen: ["a"], all: true });
  assert.deepEqual(rows(on.card).map(([, ticked]) => ticked), [true, true, false]);
  assert.deepEqual(disabled(on.card), [false, true, true]);
  tick(on.card, 0);
  assert.deepEqual(on.calls, [["script", "ramka_photo_albums_set", { chosen: ["a"], all: false }]]);
});

test("a chosen album no longer in the folder stays listed, marked", () => {
  const { card } = makeCard({ available: ["a"], chosen: ["gone"] });
  assert.deepEqual(rows(card), [["All albums", false], ["a", false], ["gone (not found)", true]]);
});

test("the filter hides albums by name, not All albums", () => {
  const { card } = makeCard({ available: ["2024 Kreta", "2025 Tallin", "Kreta again"] });
  const search = card.shadowRoot.querySelector("input[type=search]");
  search.value = "kreta";
  search.dispatchEvent(new window.Event("input"));
  const shown = [...card.shadowRoot.querySelectorAll("li")].filter((li) => !li.hidden).map((li) => li.textContent);
  assert.deepEqual(shown, ["All albums", "2024 Kreta", "Kreta again"]);
});

test("labels per language; an album name is text, not markup", () => {
  const { card } = makeCard({ available: ["<b>x</b>"], lang: "pl" });
  assert.equal(rows(card)[0][0], "Wszystkie albumy");
  assert.equal(card.shadowRoot.querySelectorAll("b").length, 0);
  assert.equal(makeCard({ lang: "de" }).card.shadowRoot.querySelector("li.empty").textContent.length > 0, true);
});
