import { test } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { shadowText } from "./testing/dom-env.mjs";
import "./rooms-card.js";

const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

function makeCard({ lang = "pl", states, rooms }) {
  const card = document.createElement("rooms-card");
  card.setConfig({ rooms });
  card.hass = { locale: { language: lang }, states };
  return card;
}

const sensor = (state) => ({ state, attributes: {} });
const rooms = [
  { name: "Kitchen", temperature: "sensor.k_t", humidity: "sensor.k_h" },
  { name: "Hall", temperature: "sensor.h_t" },
];
const states = { "sensor.k_t": sensor("21.46"), "sensor.k_h": sensor("48.4"), "sensor.h_t": sensor("unavailable") };

test("temperature and humidity are formatted as before", () => {
  const card = makeCard({ states, rooms });
  const [kitchen, hall] = card.shadowRoot.querySelectorAll(".room");
  assert.equal(kitchen.querySelector(".name").textContent, "Kitchen");
  assert.equal(kitchen.querySelector(".temp").textContent, "21.5 °C");
  assert.equal(kitchen.querySelector(".hum").textContent, "48 %");
  assert.equal(hall.querySelector(".hum").textContent, "");
});

test("a reading that is not available shows the common no-value dash in every language", () => {
  for (const lang of ["en", "de", "pl"]) {
    const card = makeCard({ lang, states, rooms });
    assert.equal(card.shadowRoot.querySelectorAll(".temp")[1].textContent, "–", lang);
  }
});

test("in English no Polish letter reaches the page", () => {
  assert.doesNotMatch(shadowText(makeCard({ lang: "en", states, rooms })), POLISH);
});

test("a card without rooms is a config error", () => {
  const card = document.createElement("rooms-card");
  assert.throws(() => card.setConfig({ rooms: [] }), /rooms is required/);
});

test("the settings page's rooms replace the configured ones, in their order and colours", () => {
  const card = document.createElement("rooms-card");
  card.setConfig({ rooms, entity: "sensor.ramka_climate_rooms" });
  const live = { "sensor.ramka_climate_rooms": { state: "2", attributes: { rooms: [
    { label: "Hall", main: "sensor.h_co2", extra: "" }, { label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" }, { label: "x", main: "" }] } },
    "sensor.h_co2": { state: "612", attributes: { unit_of_measurement: "ppm" } } };
  card.hass = { locale: { language: "en" }, states: { ...states, ...live } };
  const tiles = [...card.shadowRoot.querySelectorAll(".room")];
  assert.deepEqual(tiles.map((el) => [el.querySelector(".name").textContent, el.querySelector(".temp").textContent, el.querySelector(".hum").textContent]),
                   [["Hall", "612.0 ppm", ""], ["Kitchen", "21.5 °C", "48 %"]]);
  // Without rooms in the entity (before the seed) the configured ones show.
  card.hass = { locale: { language: "en" }, states };
  assert.equal(card.shadowRoot.querySelectorAll(".room").length, 2);
  assert.equal(card.shadowRoot.querySelector(".name").textContent, "Kitchen");
});

test("a spacer is an empty tile in its place; the rooms' colours skip it; trailing spacers go", () => {
  const card = document.createElement("rooms-card");
  card.setConfig({ rooms, entity: "sensor.ramka_climate_rooms" });
  const list = [{ spacer: true }, { label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" }, { label: "y", main: "" },
                { label: "Hall", main: "sensor.h_t", extra: "" }, { spacer: true }, { spacer: true }];
  card.hass = { locale: { language: "en" }, states: { ...states, "sensor.ramka_climate_rooms": { state: "2", attributes: { rooms: list } } } };
  const tiles = [...card.shadowRoot.querySelectorAll(".room")];
  assert.equal(tiles.length, 4);
  assert.deepEqual(tiles.map((el) => el.classList.contains("spacer")), [true, false, true, false]);
  assert.deepEqual(tiles.map((el) => el.textContent), ["", "Kitchen21.5 °C48 %", "", "Hall–"]);
  assert.match(card.shadowRoot.querySelector("style").textContent, /\.room\.spacer \{ visibility: hidden; \}/);
  // Colour n is the n-th room: the same as without the spacers.
  const plain = document.createElement("rooms-card");
  plain.setConfig({ rooms, entity: "sensor.ramka_climate_rooms" });
  plain.hass = { locale: { language: "en" }, states: { ...states, "sensor.ramka_climate_rooms": { state: "2", attributes: { rooms: [list[1], list[3]] } } } };
  const plainTiles = [...plain.shadowRoot.querySelectorAll(".room .temp")];
  assert.deepEqual([tiles[1], tiles[3]].map((el) => el.querySelector(".temp").style.color), plainTiles.map((el) => el.style.color));
  assert.notEqual(plainTiles[0].style.color, plainTiles[1].style.color);
  // A spacer that becomes a room again draws it.
  card.hass = { locale: { language: "en" }, states: { ...states, "sensor.ramka_climate_rooms": { state: "2", attributes: {
    rooms: [list[3], list[1], list[3], list[1]] } } } };
  assert.ok(![...card.shadowRoot.querySelectorAll(".room")].some((el) => el.classList.contains("spacer")));
  assert.equal(card.shadowRoot.querySelectorAll(".room")[0].querySelector(".name").textContent, "Hall");
});

test("only the first `slots` places show, the number of places as a number or an entity", () => {
  const list = [{ label: "Kitchen", main: "sensor.k_t", extra: "" }, { spacer: true }, { label: "Hall", main: "sensor.h_t", extra: "" }];
  const live = { "sensor.ramka_climate_rooms": { state: "2", attributes: { rooms: list } } };
  const make = (slots, extra = {}) => {
    const card = document.createElement("rooms-card");
    card.setConfig({ rooms, entity: "sensor.ramka_climate_rooms", slots });
    card.hass = { locale: { language: "en" }, states: { ...states, ...live, ...extra } };
    return [...card.shadowRoot.querySelectorAll(".room .name")].map((el) => el.textContent);
  };
  assert.deepEqual(make(1), ["Kitchen"]);
  assert.deepEqual(make(2), ["Kitchen"]);  // the spacer at the end goes
  assert.deepEqual(make(3), ["Kitchen", "", "Hall"]);
  assert.deepEqual(make("input_number.ramka_climate_slots", { "input_number.ramka_climate_slots": sensor("1.0") }), ["Kitchen"]);
  // An entity without a number: every place.
  assert.deepEqual(make("input_number.ramka_climate_slots"), ["Kitchen", "", "Hall"]);
});

// ---- Widget types and threshold-based colours ----------------------------------------------------

const ROOMS = "sensor.ramka_climate_rooms";
const THRESHOLDS = "input_boolean.ramka_climate_thresholds";
const AIR_LIMITS = { co2: ["input_number.ramka_air_co2_raised", "input_number.ramka_air_co2_high"],
                     pm2_5: ["input_number.ramka_air_pm2_5_raised", "input_number.ramka_air_pm2_5_high"] };
const NEUTRAL = "var(--primary-text-color)";
const BLUE = "var(--ramka-threshold-low, #5b8def)";
const AMBER = "var(--air-raised, #f5c542)";
const RED = "var(--air-high, #ff6b5c)";

function widgetCard(list, { on = true, extra = {}, config = {} } = {}) {
  const card = document.createElement("rooms-card");
  card.setConfig({ rooms, entity: ROOMS, thresholds: THRESHOLDS, air_limits: AIR_LIMITS, ...config });
  card.hass = { locale: { language: "en" }, states: { [ROOMS]: { state: String(list.length), attributes: { rooms: list } },
                                                      [THRESHOLDS]: sensor(on ? "on" : "off"), ...extra } };
  return card;
}
// Per tile: [main value colour, second value colour].
const colours = (card) => [...card.shadowRoot.querySelectorAll(".room")].map((el) =>
  [el.querySelector(".temp").style.color, el.querySelector(".hum").style.color]);
const temperature = (extra = {}) => ({ type: "temperature", label: "T", main: "sensor.t", extra: "sensor.h", ...extra });

test("thresholds on: a Temperature widget's values blue below, neutral within, red above their ranges", () => {
  const at = (t, h, widget = temperature()) =>
    colours(widgetCard([widget], { extra: { "sensor.t": sensor(String(t)), "sensor.h": sensor(String(h)) } }))[0];
  // The defaults: 20-24 °C, 40-60 %.
  assert.deepEqual(at(19.9, 39), [BLUE, BLUE]);
  assert.deepEqual(at(20, 40), [NEUTRAL, NEUTRAL]);
  assert.deepEqual(at(24, 60), [NEUTRAL, NEUTRAL]);
  assert.deepEqual(at(24.1, 61), [RED, RED]);
  // The widget's own ranges.
  const own = temperature({ temp_low: 18, temp_high: 21, hum_low: 30, hum_high: 45 });
  assert.deepEqual(at(19, 50, own), [NEUTRAL, RED]);
  assert.deepEqual(at(22, 29, own), [RED, BLUE]);
  // A missing value is not coloured.
  assert.deepEqual(colours(widgetCard([temperature()], { extra: { "sensor.t": sensor("unavailable") } }))[0], ["", ""]);
});

test("thresholds on: an Air quality widget's CO2 and PM2.5 neutral while good, amber raised, red high, from the Air page's limits", () => {
  const air = { type: "air", label: "A", main: "sensor.co2", extra: "sensor.pm" };
  const at = (co2, pm, limits = {}) => colours(widgetCard([air], { extra: { "sensor.co2": sensor(String(co2)), "sensor.pm": sensor(String(pm)), ...limits } }))[0];
  // The helpers without a number: the package's defaults, 800/1200 ppm and 15/35 µg/m³.
  assert.deepEqual(at(799, 14), [NEUTRAL, NEUTRAL]);
  assert.deepEqual(at(800, 15), [AMBER, AMBER]);
  assert.deepEqual(at(1200, 35), [RED, RED]);
  // The helpers' numbers, the Air page's own.
  const limits = { [AIR_LIMITS.co2[0]]: sensor("600.0"), [AIR_LIMITS.co2[1]]: sensor("900.0"),
                   [AIR_LIMITS.pm2_5[0]]: sensor("10"), [AIR_LIMITS.pm2_5[1]]: sensor("20") };
  assert.deepEqual(at(700, 25, limits), [AMBER, RED]);
  assert.deepEqual(at(500, 5, limits), [NEUTRAL, NEUTRAL]);
  // A home without the Air page's readings: neutral.
  const card = widgetCard([air], { config: { air_limits: undefined }, extra: { "sensor.co2": sensor("2000"), "sensor.pm": sensor("99") } });
  assert.deepEqual(colours(card)[0], [NEUTRAL, NEUTRAL]);
});

test("thresholds on: a Custom widget neutral, or the colour of its settings", () => {
  const custom = (extra) => ({ type: "custom", label: "C", main: "sensor.t", extra: "sensor.h", ...extra });
  const card = widgetCard([custom(), custom({ color: 9 })], { extra: { "sensor.t": sensor("5"), "sensor.h": sensor("5") } });
  // Slot 9: the theme's green, here HA's fallback for it.
  assert.deepEqual(colours(card), [[NEUTRAL, ""], ["#01ab63", ""]]);
});

test("thresholds off: each widget's main value in its series colour, as before; the blue, amber and red are no series colour", () => {
  const list = [temperature(), { type: "air", label: "A", main: "sensor.co2", extra: "" }, { type: "empty", spacer: true },
                { type: "custom", label: "C", main: "sensor.t", extra: "", color: 9 }];
  const extra = { "sensor.t": sensor("30"), "sensor.h": sensor("90"), "sensor.co2": sensor("2000") };
  const off = colours(widgetCard(list, { on: false, extra }));
  // Series colours 1, 2, 3: the theme's slots 4, 5, 6 (HA's fallbacks), the empty tile skipped.
  assert.deepEqual(off, [["#6cc5b0", ""], ["#a463f2", ""], ["", ""], ["#ff8ab7", ""]]);
  for (const [main] of off) assert.ok(!["#4269d0", "#f4bd4a", "#ff725c", "#97bbf5"].includes(main));
  // Without a thresholds helper: off.
  const card = document.createElement("rooms-card");
  card.setConfig({ rooms, entity: ROOMS });
  card.hass = { locale: { language: "en" }, states: { [ROOMS]: { state: "1", attributes: { rooms: [list[0]] } }, ...extra } };
  assert.deepEqual(colours(card), [["#6cc5b0", ""]]);
});

test("an entry from before the types: Temperature with a temperature sensor, else Custom; the layout is unchanged", () => {
  const list = [{ label: "K", main: "sensor.t", extra: "sensor.h" }, { spacer: true }, { label: "P", main: "sensor.p", extra: "" },
                { type: "temperature", label: "No sensor yet", main: "", extra: "" }];
  const extra = { "sensor.t": { state: "30", attributes: { device_class: "temperature" } }, "sensor.h": sensor("50"), "sensor.p": sensor("300") };
  const card = widgetCard(list, { extra });
  const tiles = [...card.shadowRoot.querySelectorAll(".room")];
  // A typed widget without a sensor is an empty tile; at the end it goes, as a spacer did.
  assert.deepEqual(tiles.map((el) => el.classList.contains("spacer")), [false, true, false]);
  assert.deepEqual(colours(card), [[RED, NEUTRAL], ["", ""], [NEUTRAL, ""]]);
});
