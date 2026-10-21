import { test } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { shadowText } from "./testing/dom-env.mjs";
import "./status-card.js";

const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|\b(włączone|wyłączone|otwarte|zamknięte|gra|pauza)\b/i;

function makeCard({ lang = "pl", states, items }) {
  const card = document.createElement("status-card");
  card.setConfig({ items });
  card.hass = { locale: { language: lang }, states };
  return card;
}

const stateText = (card, i = 0) => card.shadowRoot.querySelectorAll(".state")[i].textContent;
const cover = (state) => ({ "cover.awning": { state, attributes: {} } });
const awning = { name: "Awning", entity: "cover.awning" };

test("a cover in `open` reads Open / Offen / Otwarte", () => {
  for (const [lang, text] of [["en", "Open"], ["de", "Offen"], ["pl", "Otwarte"]]) {
    assert.equal(stateText(makeCard({ lang, states: cover("open"), items: [awning] })), text, lang);
  }
});

test("every default state label is translated, today's Polish verbatim", () => {
  const pl = {
    on: "Włączone", off: "Wyłączone", open: "Otwarte", closed: "Zamknięte", opening: "Otwiera się",
    closing: "Zamyka się", locked: "Zamknięty", unlocked: "Otwarty", unlocking: "Otwiera się",
    locking: "Zamyka się", jammed: "Zacięty", unavailable: "—", unknown: "—", playing: "Gra",
    paused: "Pauza", idle: "Bezczynny", standby: "Czuwanie", home: "W domu", not_home: "Poza domem",
  };
  for (const [state, text] of Object.entries(pl)) {
    assert.equal(stateText(makeCard({ lang: "pl", states: cover(state), items: [awning] })), text, state);
    const en = stateText(makeCard({ lang: "en", states: cover(state), items: [awning] }));
    assert.notEqual(en, "", state);
    assert.doesNotMatch(en, POLISH, state);
  }
});

test("a per-item `states` map wins over the default, in every language", () => {
  for (const lang of ["en", "de", "pl"]) {
    const item = { ...awning, states: { open: "Out" } };
    assert.equal(stateText(makeCard({ lang, states: cover("open"), items: [item] })), "Out", lang);
    assert.equal(stateText(makeCard({ lang, states: cover("closed"), items: [item] })) === "Out", false, lang);
  }
});

test("`states` keyed by true/false still maps on/off", () => {
  const item = { name: "Pump", entity: "switch.pump", states: { true: "Running", false: "Stopped" } };
  const on = makeCard({ lang: "en", states: { "switch.pump": { state: "on", attributes: {} } }, items: [item] });
  const off = makeCard({ lang: "en", states: { "switch.pump": { state: "off", attributes: {} } }, items: [item] });
  assert.equal(stateText(on), "Running");
  assert.equal(stateText(off), "Stopped");
});

test("an unknown state shows itself; a missing entity shows the unavailable dash", () => {
  assert.equal(stateText(makeCard({ lang: "en", states: cover("heat"), items: [awning] })), "heat");
  assert.equal(stateText(makeCard({ lang: "en", states: {}, items: [awning] })), "—");
});

test("a numeric item shows value and unit, no translation involved", () => {
  const states = { "sensor.power": { state: "123.4", attributes: { unit_of_measurement: "W" } } };
  const card = makeCard({ lang: "de", states, items: [{ name: "Power", entity: "sensor.power", decimals: 0 }] });
  assert.equal(stateText(card), "123 W");
});

test("a light: percent when on, no text when off (a missing label is the state, an `off` label still shows)", () => {
  const light = { name: "Lamp", entity: "light.lamp", kind: "light" };
  const on = makeCard({ lang: "en", states: { "light.lamp": { state: "on", attributes: { brightness: 128 } } }, items: [light] });
  assert.equal(stateText(on), "50 %");
  const off = makeCard({ lang: "pl", states: { "light.lamp": { state: "off", attributes: {} } }, items: [light] });
  assert.equal(stateText(off), "");
  const unavailable = makeCard({ lang: "pl", states: { "light.lamp": { state: "unavailable", attributes: {} } }, items: [light] });
  assert.equal(stateText(unavailable), "—");
  const labelled = makeCard({ lang: "en", states: { "light.lamp": { state: "off", attributes: {} } }, items: [{ ...light, states: { off: "Dark" } }] });
  assert.equal(stateText(labelled), "Dark");
});

test("in English no Polish word reaches the page", () => {
  const states = {
    "cover.a": { state: "opening", attributes: {} }, "lock.b": { state: "unlocked", attributes: {} },
    "media_player.c": { state: "playing", attributes: {} }, "person.d": { state: "not_home", attributes: {} },
  };
  const items = ["cover.a", "lock.b", "media_player.c", "person.d"].map((entity) => ({ name: entity, entity }));
  assert.doesNotMatch(shadowText(makeCard({ lang: "en", states, items })), POLISH);
});

test("a missing language falls back to English", () => {
  assert.equal(stateText(makeCard({ lang: "fr", states: cover("closed"), items: [awning] })), "Closed");
});

test("the active class follows the default active states", () => {
  const card = makeCard({ lang: "en", states: cover("open"), items: [awning] });
  assert.ok(card.shadowRoot.querySelector(".item").classList.contains("active"));
});
