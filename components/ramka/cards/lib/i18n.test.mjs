import { test } from "node:test";
import assert from "node:assert/strict";
import { language, createT, plural, formatDate, weekdayShort } from "./i18n.js";

const hassFor = (lang) => ({ locale: { language: lang } });

test("language maps locale tags to en/de/pl", () => {
  assert.equal(language(hassFor("de-CH")), "de");
  assert.equal(language(hassFor("pl-PL")), "pl");
  assert.equal(language(hassFor("en-GB")), "en");
  assert.equal(language(hassFor("fr")), "en");
  assert.equal(language({}), "en");
  assert.equal(language(undefined), "en");
});

test("language falls back to hass.language, then en", () => {
  assert.equal(language({ language: "pl" }), "pl");
  assert.equal(language({ locale: {}, language: "de" }), "de");
  assert.equal(language({ locale: {} }), "en");
});

const dicts = {
  en: { card: { status: { on: "On", hello: "Hello {name}", enOnly: "English only" } } },
  pl: { card: { status: { on: "Włączone", hello: "Cześć {name}" } } },
  de: { card: { status: { on: "Ein" } } },
};

test("t returns pl text when present", () => {
  const t = createT(dicts);
  assert.equal(t(hassFor("pl"), "card.status.on"), "Włączone");
  assert.equal(t(hassFor("de-CH"), "card.status.on"), "Ein");
});

test("t falls back to en when the key is missing in the language", () => {
  const t = createT(dicts);
  assert.equal(t(hassFor("pl"), "card.status.enOnly"), "English only");
  assert.equal(t(hassFor("de"), "card.status.hello", { name: "Alex" }), "Hello Alex");
});

test("t falls back to en when the language dict is absent", () => {
  const t = createT({ en: dicts.en });
  assert.equal(t(hassFor("pl"), "card.status.on"), "On");
});

test("t interpolates {name}, repeated and missing vars", () => {
  const t = createT(dicts);
  assert.equal(t(hassFor("pl"), "card.status.hello", { name: "Alex" }), "Cześć Alex");
  assert.equal(t(hassFor("pl"), "card.status.hello"), "Cześć {name}");
  const t2 = createT({ en: { x: "{a}-{a}-{b}" } });
  assert.equal(t2(hassFor("en"), "x", { a: 1, b: 2 }), "1-1-2");
});

test("t returns the key only when en lacks it too", () => {
  const t = createT(dicts);
  assert.equal(t(hassFor("pl"), "card.nope"), "card.nope");
  assert.equal(t(hassFor("pl"), "card.status"), "card.status");
});

test("plural in pl", () => {
  const forms = { one: "{count} minuta", few: "{count} minuty", many: "{count} minut", other: "{count} minuty" };
  const hass = hassFor("pl-PL");
  assert.equal(plural(hass, 1, forms), "1 minuta");
  assert.equal(plural(hass, 2, forms), "2 minuty");
  assert.equal(plural(hass, 5, forms), "5 minut");
  assert.equal(plural(hass, 22, forms), "22 minuty");
});

test("plural in de and fallback to other", () => {
  const forms = { one: "{count} Minute", other: "{count} Minuten" };
  const hass = hassFor("de-CH");
  assert.equal(plural(hass, 1, forms), "1 Minute");
  assert.equal(plural(hass, 2, forms), "2 Minuten");
  assert.equal(plural(hassFor("pl"), 5, { one: "{count} a", other: "{count} b" }), "5 b");
});

test("formatDate uses the per-language locale", () => {
  const d = new Date(2026, 9, 25, 12);
  assert.equal(formatDate(hassFor("pl"), d, { weekday: "long" }), "niedziela");
  assert.equal(formatDate(hassFor("de-CH"), d, { weekday: "long" }), "Sonntag");
  assert.equal(formatDate(hassFor("en-GB"), d, { weekday: "long" }), "Sunday");
});

test("formatDate returns an em dash for invalid or non-Date input", () => {
  const hass = hassFor("pl");
  assert.equal(formatDate(hass, new Date("unavailable"), { weekday: "long" }), "—");
  assert.equal(formatDate(hass, undefined, { weekday: "long" }), "—");
  assert.equal(formatDate(hass, null, { weekday: "long" }), "—");
  assert.equal(formatDate(hass, "2026-10-25", { weekday: "long" }), "—");
  assert.equal(formatDate(hass, 1792929600000, { weekday: "long" }), "—");
});

test("t leaves the placeholder when a var is null or undefined", () => {
  const t = createT({ en: { x: "Hi {name}, {other}" } });
  assert.equal(t(hassFor("en"), "x", { name: undefined, other: null }), "Hi {name}, {other}");
  assert.equal(t(hassFor("en"), "x", { name: 0, other: "" }), "Hi 0, ");
});

test("plural returns an empty string when neither the category nor other exists", () => {
  assert.equal(plural(hassFor("de"), 2, { one: "{count} Minute" }), "");
  assert.equal(plural(hassFor("en"), 2, {}), "");
});

test("language edge cases", () => {
  assert.equal(language(hassFor("zh-Hant")), "en");
  assert.equal(language(hassFor("")), "en");
  assert.equal(language({ locale: { language: "" }, language: "pl" }), "pl");
});

test("plural edge counts in pl", () => {
  const hass = hassFor("pl");
  const forms = { one: "{count} minuta", few: "{count} minuty", many: "{count} minut", other: "{count} minuty" };
  assert.equal(plural(hass, 0, forms), "0 minut");
  assert.equal(plural(hass, 0, { one: "a", other: "{count} x" }), "0 x");
  assert.equal(plural(hass, 1.5, forms), "1.5 minuty");
  assert.equal(plural(hass, 1.5, { many: "m", other: "{count} o" }), "1.5 o");
});

test("weekdayShort uses the card.common.weekday_short override, index 0 = Sunday", () => {
  const t = createT({ pl: { card: { common: { weekday_short: { 0: "nd", 6: "sb" } } } }, en: {} });
  assert.equal(weekdayShort(hassFor("pl"), new Date(2026, 9, 25), t), "nd");
  assert.equal(weekdayShort(hassFor("pl"), new Date(2026, 9, 24), t), "sb");
});

test("weekdayShort falls back to Intl when the key is missing, and to an em dash for an invalid date", () => {
  const t = createT({ en: {} });
  assert.equal(weekdayShort(hassFor("en"), new Date(2026, 9, 25), t), "Sun");
  assert.equal(weekdayShort(hassFor("pl"), new Date(2026, 9, 25), t), "niedz.");
  assert.equal(weekdayShort(hassFor("en"), new Date("nope"), t), "—");
});
