import { test } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import "./photo-albums-card.js";

const ENTITY = "sensor.ramka_photo_albums";

function makeCard({ available = [], chosen = [], lang = "en" } = {}) {
  const calls = [];
  const card = document.createElement("photo-albums-card");
  card.setConfig({ entity: ENTITY, script: "script.ramka_photo_albums_set" });
  card.hass = { locale: { language: lang }, states: { [ENTITY]: { state: String(chosen.length), attributes: { available, chosen } } },
                callService: (...args) => calls.push(args) };
  return { card, calls };
}

const rows = (card) => [...card.shadowRoot.querySelectorAll("li label")].map((l) => [l.querySelector("span").textContent, l.querySelector("input").checked]);
const tick = (card, index) => {
  const box = card.shadowRoot.querySelectorAll("li label input")[index];
  box.checked = !box.checked;
  box.dispatchEvent(new window.Event("change"));
};

test("none chosen: All albums ticked, every album unticked", () => {
  const { card } = makeCard({ available: ["2024 Kreta", "2025 Tallin"] });
  assert.deepEqual(rows(card), [["All albums", true], ["2024 Kreta", false], ["2025 Tallin", false]]);
});

test("ticking an album adds it, unticking the last one is all again", () => {
  const { card, calls } = makeCard({ available: ["a", "b", "c"], chosen: ["b"] });
  assert.deepEqual(rows(card).map(([, on]) => on), [false, false, true, false]);
  tick(card, 1);
  tick(card, 2);
  assert.deepEqual(calls, [["script", "ramka_photo_albums_set", { chosen: ["b", "a"] }],
                           ["script", "ramka_photo_albums_set", { chosen: [] }]]);
});

test("ticking All albums clears the choice", () => {
  const { card, calls } = makeCard({ available: ["a", "b"], chosen: ["a", "b"] });
  tick(card, 0);
  assert.deepEqual(calls, [["script", "ramka_photo_albums_set", { chosen: [] }]]);
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
