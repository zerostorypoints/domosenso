import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shadowText } from "./testing/dom-env.mjs";

await import("./room-meter-card.js");
const load = (lang) => JSON.parse(readFileSync(new URL(`../translations/${lang}.json`, import.meta.url), "utf8"));
const LANGS = { en: load("en"), de: load("de"), pl: load("pl") };

const at = (dict, key) => key.split(".").reduce((node, part) => node?.[part], dict);
const state = (value, attributes = {}) => ({ state: String(value), attributes, last_updated: "2026-01-15T10:00:00Z" });
const hassOf = (states, language = "en") => ({ language, locale: { language }, states, callService: () => {} });

const make = (config) => {
  const card = document.createElement("room-meter-card");
  card.setConfig(config);
  return card;
};

const CONFIG = {
  level: "sensor.demo_level",
  peak: "sensor.demo_peak",
  offset: "sensor.demo_offset",
  live_switch: "switch.demo_live_tracking",
  live_level: "sensor.demo_fast_level",
  live_peak: "sensor.demo_fast_peak",
};

test("room meter: registers once and offers itself in the picker from translations", () => {
  assert.ok(customElements.get("room-meter-card"));
  const entries = window.customCards.filter((c) => c.type === "room-meter-card");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, LANGS.en.card.room_meter.name);
});

for (const [lang, dict] of Object.entries(LANGS)) {
  test(`room meter: zone, chips and live button come from i18n in ${lang}`, () => {
    const card = make(CONFIG);
    card.hass = hassOf({
      "sensor.demo_level": state(60),
      "sensor.demo_peak": state(70),
      "sensor.demo_offset": state(100, { calibrated: false }),
      "switch.demo_live_tracking": state("off"),
    }, lang);
    const text = shadowText(card);
    assert.ok(text.includes(at(dict, "card.room_meter.zone.conversation")), text);
    assert.ok(text.includes(at(dict, "card.room_meter.chip.peak")), text);
    assert.ok(text.includes(at(dict, "card.room_meter.chip.headroom")), text);
    assert.ok(text.includes(at(dict, "card.room_meter.offset_estimated")), text);
    const button = card.shadowRoot.querySelector(".live-button");
    assert.equal(button.textContent, at(dict, "card.room_meter.live.off"));
    assert.equal(button.title, at(dict, "card.room_meter.live.to_fast"));
  });

  test(`room meter: no reading says so in ${lang}`, () => {
    const card = make(CONFIG);
    card.hass = hassOf({ "sensor.demo_level": state("unavailable") }, lang);
    assert.ok(shadowText(card).includes(at(dict, "card.room_meter.no_reading")));
  });
}

test("room meter: live tracking reads the fast sensors on the dB SPL scale", () => {
  const card = make(CONFIG);
  card.hass = hassOf({
    "sensor.demo_level": state(50),
    "sensor.demo_offset": state(100, { calibrated: true }),
    "switch.demo_live_tracking": state("on"),
    "sensor.demo_fast_level": state(-40),
    "sensor.demo_fast_peak": state(-30),
  });
  const text = shadowText(card);
  assert.ok(text.includes("60.0"), text);
  assert.equal(card.shadowRoot.querySelector(".live-button").textContent, LANGS.en.card.room_meter.live.fast);
  assert.ok(!text.includes(LANGS.en.card.room_meter.offset_estimated));
});
