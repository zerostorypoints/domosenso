import { test } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { albumDate, sortAlbums } from "./photo-albums-card.js";

const ENTITY = "sensor.ramka_photo_albums";
const SCRIPT = ["script", "ramka_photo_albums_set"];

function makeCard({ available = [], chosen = [], all, lang = "en" } = {}) {
  const calls = [];
  const card = document.createElement("photo-albums-card");
  card.setConfig({ entity: ENTITY, script: "script.ramka_photo_albums_set" });
  const attributes = { available, chosen, ...(all === undefined ? {} : { all }) };
  card.hass = { locale: { language: lang }, states: { [ENTITY]: { state: String(chosen.length), attributes } },
                callService: (...args) => calls.push(args) };
  document.body.append(card);
  return { card, calls };
}

const text = (card, sel) => card.shadowRoot.querySelector(sel).textContent;
const open = (card) => {
  card.shadowRoot.querySelector("button.choose").click();
  return card.shadowRoot.querySelector("dialog.album-picker");
};
const rows = (dialog) => [...dialog.querySelectorAll("ul label")].map((l) => [l.querySelector("span").textContent, l.querySelector("input").checked]);
const box = (dialog, name) => [...dialog.querySelectorAll("ul input")].find((b) => b.dataset.name === name);
const tick = (input) => {
  input.checked = !input.checked;
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
};
const choose = (dialog, name, value) => {
  const select = dialog.querySelector(`select[name=${name}]`);
  select.value = value;
  select.dispatchEvent(new window.Event("change"));
};
const filter = (dialog, value) => {
  const search = dialog.querySelector("input[name=filter]");
  search.value = value;
  search.dispatchEvent(new window.Event("input"));
};
const save = (dialog) => dialog.querySelector("button.save").click();

test("an album's date: a day, a span's first day, a year first, a year anywhere, none", () => {
  assert.equal(albumDate("01.02.2024 Paris"), Date.UTC(2024, 1, 1));
  assert.equal(albumDate("14.08-16.08.2023 trip"), Date.UTC(2023, 7, 14));
  assert.equal(albumDate("2025-05-04 x"), Date.UTC(2025, 4, 4));
  assert.equal(albumDate("2019 Lisbon"), Date.UTC(2019, 0, 1));
  assert.equal(albumDate("Summer 2021"), Date.UTC(2021, 0, 1));
  assert.equal(albumDate("Family"), null);
  assert.equal(albumDate("40.13.2024 nonsense"), null);
});

test("sorting: by date either way (undated last), by name either way", () => {
  const names = ["Family", "01.02.2024 Paris", "05.07.2023 pool", "2025 Oslo"];
  assert.deepEqual(sortAlbums(names, "newest"), ["2025 Oslo", "01.02.2024 Paris", "05.07.2023 pool", "Family"]);
  assert.deepEqual(sortAlbums(names, "oldest"), ["05.07.2023 pool", "01.02.2024 Paris", "2025 Oslo", "Family"]);
  assert.deepEqual(sortAlbums(["b", "a10", "a9"], "az"), ["a9", "a10", "b"]);
  assert.deepEqual(sortAlbums(["b", "a10", "a9"], "za"), ["b", "a10", "a9"]);
});

test("the card sums the choice up: all, some with the newest names, chosen ones gone", () => {
  assert.equal(text(makeCard({ available: ["a", "b"] }).card, ".summary"), "All albums (2)");
  const { card } = makeCard({ available: ["2021 a", "2022 b", "2023 c", "2024 d", "x"], chosen: ["2021 a", "2022 b", "2023 c", "2024 d", "gone"] });
  assert.equal(text(card, ".summary"), "4 of 5 albums");
  assert.equal(text(card, ".names"), "2024 d, 2023 c, 2022 b and 1 more");
  assert.match(text(card, ".warn"), /1$/);
  assert.equal(text(makeCard().card, ".summary"), "No albums in the photo folder yet.");
});

test("ticking changes the draft only; Save writes it once, Cancel drops it", () => {
  const { card, calls } = makeCard({ available: ["a", "b", "c"], chosen: ["b"], all: false });
  let dialog = open(card);
  tick(box(dialog, "a"));
  tick(box(dialog, "b"));
  assert.equal(calls.length, 0);
  assert.equal(text(card, ".count"), "1 of 3 selected");
  dialog.querySelector("button.cancel").click();
  assert.equal(card.shadowRoot.querySelector("dialog"), null);
  dialog = open(card);
  assert.equal(box(dialog, "a").checked, false);
  tick(box(dialog, "c"));
  save(dialog);
  assert.deepEqual(calls, [[...SCRIPT, { chosen: ["b", "c"], all_albums: false }]]);
});

test("a tick leaves the rows and their scroll alone; an update waits while the picker is open", () => {
  const { card } = makeCard({ available: ["a", "b", "c"], chosen: ["a"], all: false });
  const dialog = open(card);
  const first = dialog.querySelector("ul li");
  tick(box(dialog, "b"));
  assert.equal(dialog.querySelector("ul li"), first);
  card.hass = { ...card._hass, states: { [ENTITY]: { attributes: { available: ["a", "b", "c", "d"], chosen: [], all: true } } } };
  assert.equal(card.shadowRoot.querySelector("dialog"), dialog);
  assert.equal(box(dialog, "b").checked, true);
  dialog.querySelector("button.cancel").click();
  assert.equal(text(card, ".summary"), "All albums (4)");
});

test("under All albums every box is ticked; unticking a few keeps the rest as a choice", () => {
  const { card, calls } = makeCard({ available: ["a", "b", "c", "d"], chosen: ["c"], all: true });
  const dialog = open(card);
  assert.deepEqual(rows(dialog).map(([, on]) => on), [true, true, true, true]);
  tick(box(dialog, "b"));
  assert.equal(dialog.querySelector("input[name=all]").checked, false);
  save(dialog);
  assert.deepEqual(calls, [[...SCRIPT, { chosen: ["a", "c", "d"], all_albums: false }]]);
});

test("All albums on keeps the earlier ticks for later; off brings them back", () => {
  const { card, calls } = makeCard({ available: ["a", "b"], chosen: ["a"], all: false });
  const dialog = open(card);
  tick(dialog.querySelector("input[name=all]"));
  assert.deepEqual(rows(dialog).map(([, on]) => on), [true, true]);
  tick(dialog.querySelector("input[name=all]"));
  assert.deepEqual(rows(dialog).map(([, on]) => on), [true, false]);
  tick(dialog.querySelector("input[name=all]"));
  save(dialog);
  assert.deepEqual(calls, [[...SCRIPT, { chosen: ["a"], all_albums: true }]]);
});

test("nothing ticked does not save", () => {
  const { card, calls } = makeCard({ available: ["a"], chosen: ["a"], all: false });
  const dialog = open(card);
  tick(box(dialog, "a"));
  assert.equal(dialog.querySelector("button.save").disabled, true);
  assert.ok(text(card, ".hint").length > 0);
  save(dialog);
  assert.equal(calls.length, 0);
});

test("filter, show and sort; select all and deselect all of what is shown", () => {
  const available = ["01.02.2024 Paris", "02.09.2022 Rome", "05.07.2023 Rome beach", "Family"];
  const { card, calls } = makeCard({ available, chosen: ["Family"], all: false });
  const dialog = open(card);
  assert.deepEqual(rows(dialog).map(([n]) => n), ["01.02.2024 Paris", "05.07.2023 Rome beach", "02.09.2022 Rome", "Family"]);
  choose(dialog, "sort", "oldest");
  assert.equal(rows(dialog)[0][0], "02.09.2022 Rome");
  filter(dialog, "rome");
  assert.equal(rows(dialog).length, 2);
  dialog.querySelector("button.select-all").click();
  filter(dialog, "");
  choose(dialog, "show", "chosen");
  assert.deepEqual(rows(dialog).map(([n]) => n), ["02.09.2022 Rome", "05.07.2023 Rome beach", "Family"]);
  choose(dialog, "show", "unchosen");
  assert.deepEqual(rows(dialog).map(([n]) => n), ["01.02.2024 Paris"]);
  choose(dialog, "show", "all");
  filter(dialog, "zzz");
  assert.equal(text(card, "ul li.empty"), "No album matches.");
  filter(dialog, "rome");
  dialog.querySelector("button.deselect-all").click();
  save(dialog);
  assert.deepEqual(calls, [[...SCRIPT, { chosen: ["Family"], all_albums: false }]]);
});

test("a chosen album no longer in the folder stays listed, marked, until unticked", () => {
  const { card, calls } = makeCard({ available: ["a"], chosen: ["gone", "a"], all: false });
  const dialog = open(card);
  assert.deepEqual(rows(dialog), [["a", true], ["gone (not found)", true]]);
  tick(box(dialog, "gone"));
  save(dialog);
  assert.deepEqual(calls, [[...SCRIPT, { chosen: ["a"], all_albums: false }]]);
});

test("labels per language; an album name is text, not markup", () => {
  const { card } = makeCard({ available: ["<b>x</b>"], lang: "pl" });
  assert.equal(text(card, "button.choose"), "Wybierz albumy");
  const dialog = open(card);
  assert.equal(dialog.querySelector("label.all span span").textContent, "Wszystkie albumy");
  assert.equal(dialog.querySelector("button.select-all").textContent, "Zaznacz wszystkie");
  assert.equal(card.shadowRoot.querySelectorAll("b").length, 0);
  assert.equal(text(makeCard({ available: ["a"], chosen: ["a"], all: false, lang: "de" }).card, ".summary"), "1 von 1 Alben");
});
