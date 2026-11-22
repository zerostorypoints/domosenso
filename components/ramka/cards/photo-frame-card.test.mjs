import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import "./photo-frame-card.js";

const cards = [];
const realFetch = globalThis.fetch;

afterEach(() => {
  for (const card of cards.splice(0)) {
    clearInterval(card._indexTimer);
    card._layer && card._layer.remove();
  }
  delete window.__photoFrameOwner;
  globalThis.fetch = realFetch;
});

const INDEX = { photos: [
  { path: "holiday/a.jpg", event: "Holiday", date: "2026-10-20T12:00:00", camera: "X100V", lens: "23mm", iso: "ISO 400" },
  { path: "holiday/b.jpg", event: "Holiday", date: "not a date" },
  { path: "holiday/c.jpg", date: "2026-03-01T09:00:00" },
] };

function makeCard({ lang = "en", path = "holiday/a.jpg", index = INDEX, config = {}, offline = false } = {}) {
  globalThis.fetch = async () => {
    if (offline) throw new Error("offline");
    return { ok: true, json: async () => index };
  };
  const card = document.createElement("photo-frame-card");
  cards.push(card);
  card.setConfig({ entity: "image.frame", path_entity: "input_text.photo_path", ...config });
  card.hass = {
    locale: { language: lang }, hassUrl: (p) => `http://ha.local${p}`,
    states: {
      "image.frame": { state: "2026-10-20T10:00:00", attributes: { entity_picture: "/api/image_proxy/image.frame?token=1" } },
      "input_text.photo_path": { state: path, attributes: {} },
    },
  };
  return card;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const caption = (card) => card._layer.querySelector(".caption");

test("the caption date follows the language: 20 October 2026 / 20. Oktober 2026 / 20 października 2026", async () => {
  const expected = { en: "20 October 2026", de: "20. Oktober 2026", pl: "20 października 2026" };
  for (const [lang, date] of Object.entries(expected)) {
    const card = makeCard({ lang });
    await flush();
    assert.equal(caption(card).querySelector(".c1").textContent, `Holiday · ${date}`, lang);
    assert.equal(caption(card).querySelector(".c2").textContent, "X100V · 23mm · ISO 400", lang);
    assert.equal(caption(card).style.display, "block", lang);
    cards.pop(); clearInterval(card._indexTimer); card._layer.remove(); delete window.__photoFrameOwner;
  }
});

test("every month reads in its language's own name in the caption", async () => {
  const pl = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  const photos = pl.map((_, m) => ({ path: `m/${m}.jpg`, date: `2026-${String(m + 1).padStart(2, "0")}-15T12:00:00` }));
  for (let m = 0; m < 12; m++) {
    const card = makeCard({ lang: "pl", path: `m/${m}.jpg`, index: { photos } });
    await flush();
    assert.equal(caption(card).querySelector(".c1").textContent, `15 ${pl[m]} 2026`, String(m));
    cards.pop(); clearInterval(card._indexTimer); card._layer.remove(); delete window.__photoFrameOwner;
  }
});

test("a photo with no date or no event shows only what it has", async () => {
  let card = makeCard({ path: "holiday/b.jpg" });
  await flush();
  assert.equal(caption(card).querySelector(".c1").textContent, "Holiday");
  cards.pop(); clearInterval(card._indexTimer); card._layer.remove(); delete window.__photoFrameOwner;
  card = makeCard({ path: "holiday/c.jpg", lang: "de" });
  await flush();
  assert.equal(caption(card).querySelector(".c1").textContent, "1. März 2026");
});

test("a photo the index does not know has no caption, in any language", async () => {
  for (const lang of ["en", "de", "pl"]) {
    const card = makeCard({ lang, path: "unknown/x.jpg" });
    await flush();
    assert.equal(caption(card).style.display, "none", lang);
    assert.equal(caption(card).querySelector(".c1").textContent, "", lang);
    cards.pop(); clearInterval(card._indexTimer); card._layer.remove(); delete window.__photoFrameOwner;
  }
});

test("an index that cannot be loaded leaves the photo on screen without a caption", async () => {
  const card = makeCard({ offline: true });
  await flush();
  assert.equal(caption(card).style.display, "none");
  assert.equal(card._layer.style.display, "block");
});

test("the layer is shown only while every show_when condition holds", () => {
  const hidden = makeCard({ config: { show_when: [{ entity: "media_player.hifi", state: "playing" }] } });
  assert.equal(hidden._layer.style.display, "none", "an absent entity is 'unavailable', not playing");
  cards.pop(); clearInterval(hidden._indexTimer); hidden._layer.remove(); delete window.__photoFrameOwner;
  const shown = makeCard({ config: { show_when: [{ entity: "media_player.hifi", state_not: "playing" }] } });
  assert.equal(shown._layer.style.display, "block");
});

test("the entity is required; the card hides itself from the grid", () => {
  assert.throws(() => document.createElement("photo-frame-card").setConfig({}), /entity is required/);
  const card = makeCard();
  card.connectedCallback();
  assert.equal(card.hidden, true);
});

test("contained (the preview's frame): the layer fills the card's box, not the page, and takes no page ownership", () => {
  const card = makeCard({ config: { contained: true } });
  card.connectedCallback();
  assert.equal(card.hidden, false, "it stays in the grid");
  assert.equal(card._layer.parentNode, card, "the layer is the card's own child");
  assert.equal(card._layer.style.position, "absolute");
  assert.equal(card._layer.style.display, "block", "no show_when: always shown");
  assert.equal(window.__photoFrameOwner, undefined);
  const page = makeCard();
  assert.equal(page._layer.parentNode, document.body, "the Ramka's own card still takes the page");
  assert.equal(page._layer.style.position, "fixed");
});

const TREE = { photos: [
  { path: "2025/Lisbon/Day 1/a.jpg", event: "Day 1", folder: "2025/Lisbon/Day 1", date: "2025-07-08T12:00:00" },
  { path: "Garden/b.jpg", event: "Garden", folder: "Garden", date: "2025-07-08T12:00:00" },
] };

function treeCard(path, levels) {
  const config = levels === undefined ? {} : { caption_levels_entity: "input_select.levels" };
  const card = makeCard({ path, index: TREE, config });
  if (levels !== undefined) {
    card.hass = { ...card._hass, states: { ...card._hass.states, "input_select.levels": { state: levels, attributes: {} } } };
  }
  return card;
}

test("caption levels name the photo's folders from its own folder up (SPEC-056)", async () => {
  const cases = { 1: "Day 1", 2: "Lisbon › Day 1", 3: "2025 › Lisbon › Day 1", all: "2025 › Lisbon › Day 1" };
  for (const [levels, folders] of Object.entries(cases)) {
    const card = treeCard("2025/Lisbon/Day 1/a.jpg", levels);
    await card._loadIndex();
    assert.equal(caption(card).querySelector(".c1").textContent, `${folders} · 8 July 2025`, levels);
  }
  for (const levels of ["1", "3", "all"]) {
    const card = treeCard("Garden/b.jpg", levels);
    await card._loadIndex();
    assert.equal(caption(card).querySelector(".c1").textContent, "Garden · 8 July 2025", levels);
  }
});

test("without caption_levels_entity the caption is the event, as before", async () => {
  const card = treeCard("2025/Lisbon/Day 1/a.jpg");
  await card._loadIndex();
  assert.equal(caption(card).querySelector(".c1").textContent, "Day 1 · 8 July 2025");
});

test("a change of the levels redraws the caption of the photo on screen", async () => {
  const card = treeCard("2025/Lisbon/Day 1/a.jpg", "1");
  await card._loadIndex();
  card.hass = { ...card._hass, states: { ...card._hass.states, "input_select.levels": { state: "2", attributes: {} } } };
  assert.equal(caption(card).querySelector(".c1").textContent, "Lisbon › Day 1 · 8 July 2025");
});

test("a caption longer than the screen ends in an ellipsis (SPEC-056 amendment 1)", async () => {
  const card = treeCard("2025/Lisbon/Day 1/a.jpg", "all");
  await card._loadIndex();
  for (const line of [".c1", ".c2"]) {
    const style = caption(card).querySelector(line).style;
    assert.equal(style.textOverflow, "ellipsis", line);
    assert.equal(style.whiteSpace, "nowrap", line);
    assert.equal(style.overflow, "hidden", line);
  }
});
