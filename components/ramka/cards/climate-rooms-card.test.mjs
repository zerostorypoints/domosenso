import { test } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import "./climate-rooms-card.js";

const ENTITY = "sensor.ramka_climate_rooms";
const sensor = (name, unit) => ({ state: "21", attributes: { friendly_name: name, ...(unit ? { unit_of_measurement: unit } : {}) } });
const STATES = {
  "sensor.k_t": sensor("Kitchen temperature", "°C"),
  "sensor.k_h": sensor("Kitchen humidity", "%"),
  "sensor.b_t": sensor("Bedroom temperature", "°C"),
  "sensor.b_co2": sensor("Bedroom CO2", "ppm"),
  "sensor.weather_text": sensor("Weather text"),
  "binary_sensor.door": sensor("Door", "%"),
};

const SLOTS = "input_number.ramka_climate_slots";

function makeCard({ rooms, lang = "en", extra = {}, slots } = {}) {
  const calls = [];
  const card = document.createElement("climate-rooms-card");
  card.setConfig({ entity: ENTITY, script: "script.ramka_climate_rooms_set", ...(slots !== undefined ? { slots: SLOTS } : {}) });
  const states = { ...STATES, ...(rooms ? { [ENTITY]: { state: String(rooms.length), attributes: { rooms } } } : {}),
                   ...(slots !== undefined ? { [SLOTS]: { state: String(slots), attributes: {} } } : {}) };
  const hass = { locale: { language: lang }, states, callService: (...args) => calls.push(args), ...extra };
  card.hass = hass;
  return { card, calls, hass };
}

const rows = (card) => [...card.shadowRoot.querySelectorAll(".row")];
const titles = (card) => [...card.shadowRoot.querySelectorAll(".room")].map((el) => el.textContent);
const selects = (card) => [...card.shadowRoot.querySelectorAll("select")];
const inputs = (card) => [...card.shadowRoot.querySelectorAll("input")];
const change = (el, value) => {
  el.value = value;
  el.dispatchEvent(new window.Event("change"));
};

test("ten rooms, each a name and two dropdowns; the rooms fill the first rows", () => {
  const { card } = makeCard({ rooms: [{ label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" }] });
  assert.equal(card.shadowRoot.querySelectorAll(".row").length, 10);
  assert.deepEqual(selects(card).map((s) => s.value), ["sensor.k_t", "sensor.k_h", ...Array(18).fill("")]);
  assert.deepEqual(inputs(card).map((i) => i.value), ["Kitchen", ...Array(9).fill("")]);
  assert.equal(card.shadowRoot.querySelector(".room").textContent, "Room 1");
});

test("the dropdowns list the sensors with a unit, by name, after the empty choice", () => {
  const { card } = makeCard({ rooms: [] });
  const options = [...selects(card)[0].options].map((o) => [o.value, o.textContent]);
  assert.deepEqual(options, [["", "—"], ["sensor.b_co2", "Bedroom CO2 (ppm)"], ["sensor.b_t", "Bedroom temperature (°C)"],
                             ["sensor.k_h", "Kitchen humidity (%)"], ["sensor.k_t", "Kitchen temperature (°C)"]]);
});

test("a change saves every row in order, an empty one in between as a spacer, none at the end", () => {
  const { card, calls } = makeCard({ rooms: [{ label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" }] });
  change(selects(card)[4], "sensor.b_co2");
  change(inputs(card)[2], " Bedroom ");
  assert.deepEqual(calls.at(-1), ["script", "ramka_climate_rooms_set", { rooms: [
    { label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" },
    { spacer: true },
    { label: "Bedroom", main: "sensor.b_co2", extra: "" },
  ] }]);
  change(selects(card)[0], "");
  assert.deepEqual(calls.at(-1)[2].rooms.map((r) => r.main ?? "spacer"), ["spacer", "spacer", "sensor.b_co2"]);
  change(selects(card)[4], "");
  assert.deepEqual(calls.at(-1)[2].rooms, []);
});

test("the number of places sets the rows: 1 to 20, ten while the helper has no number", () => {
  assert.equal(rows(makeCard({ rooms: [], slots: 3 }).card).length, 3);
  assert.equal(rows(makeCard({ rooms: [], slots: 20 }).card).length, 20);
  assert.equal(rows(makeCard({ rooms: [], slots: 25 }).card).length, 20);
  assert.equal(rows(makeCard({ rooms: [], slots: "unavailable" }).card).length, 10);
  // The number changes: the rows follow, the rooms stay.
  const { card, hass } = makeCard({ rooms: [{ label: "Kitchen", main: "sensor.k_t", extra: "" }], slots: 2 });
  card.hass = { ...hass, states: { ...hass.states, [SLOTS]: { state: "5.0", attributes: {} } } };
  assert.equal(rows(card).length, 5);
  assert.equal(selects(card)[0].value, "sensor.k_t");
});

test("a spacer keeps its row, empty; the rooms are numbered and coloured skipping it", () => {
  const { card } = makeCard({ rooms: [{ spacer: true }, { label: "Kitchen", main: "sensor.k_t", extra: "" }, { label: "x", main: "" },
                                      { label: "Bed", main: "sensor.b_t", extra: "" }], slots: 4 });
  assert.deepEqual(selects(card).filter((_, i) => i % 2 === 0).map((s) => s.value), ["", "sensor.k_t", "", "sensor.b_t"]);
  assert.deepEqual(titles(card), ["Empty place", "Room 1", "Empty place", "Room 2"]);
  const swatches = [...card.shadowRoot.querySelectorAll(".swatch")];
  assert.deepEqual(swatches.map((s) => s.classList.contains("spacer")), [true, false, true, false]);
  assert.equal(swatches[1].style.background, makeCard({ rooms: [{ label: "K", main: "sensor.k_t" }] }).card.shadowRoot.querySelector(".swatch").style.background);
  assert.notEqual(swatches[1].style.background, swatches[3].style.background);
  assert.equal(swatches[0].style.background, "");
});

test("up and down move a row, save the order and keep the focus on the button", () => {
  const rooms = [{ label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" }, { spacer: true }, { label: "Bed", main: "sensor.b_t", extra: "" }];
  const { card, calls } = makeCard({ rooms, slots: 3 });
  document.body.append(card);  // focus is tracked in a connected tree only
  const buttons = (which) => [...card.shadowRoot.querySelectorAll(`button.${which}`)];
  assert.deepEqual(buttons("up").map((b) => b.disabled), [true, false, false]);
  assert.deepEqual(buttons("down").map((b) => b.disabled), [false, false, true]);
  assert.equal(buttons("up")[0].getAttribute("aria-label"), "Move up");
  buttons("down")[0].click();
  assert.deepEqual(calls.at(-1)[2].rooms, [{ spacer: true }, rooms[0], rooms[2]]);
  // Drawn in the new order at once, before the saved list comes back.
  assert.deepEqual(titles(card), ["Empty place", "Room 1", "Room 2"]);
  assert.ok(card.shadowRoot.activeElement === buttons("down")[1]);
  buttons("up")[2].click();
  assert.deepEqual(calls.at(-1)[2].rooms.map((r) => r.label ?? "-"), ["-", "Bed", "Kitchen"]);
  buttons("up")[1].click();
  assert.deepEqual(calls.at(-1)[2].rooms.map((r) => r.label ?? "-"), ["Bed", "-", "Kitchen"]);
  // At the top the up button is off: the focus goes to its twin.
  assert.ok(card.shadowRoot.activeElement === buttons("down")[0]);
  card.remove();
});

// The rows laid out 100 px apart, as a browser would; happy-dom has no layout.
function layOut(card) {
  rows(card).forEach((row, i) => { row.getBoundingClientRect = () => ({ top: i * 100, height: 100, bottom: i * 100 + 100 }); });
}
const pointer = (el, type, clientY, extra = {}) =>
  el.dispatchEvent(new window.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, button: 0, clientY, ...extra }));

test("a row dragged by its handle, by touch or mouse, drops where the pointer is and saves the order", () => {
  const rooms = [{ label: "A", main: "sensor.k_t", extra: "" }, { label: "B", main: "sensor.b_t", extra: "" },
                 { label: "C", main: "sensor.k_h", extra: "" }];
  const { card, calls } = makeCard({ rooms, slots: 4 });
  layOut(card);
  let handle = card.shadowRoot.querySelectorAll(".handle")[0];
  pointer(handle, "pointerdown", 50, { pointerType: "touch" });
  assert.ok(rows(card)[0].classList.contains("dragging"));
  pointer(handle, "pointermove", 260, { pointerType: "touch" });
  assert.ok(rows(card)[3].classList.contains("drop-above"));
  pointer(handle, "pointerup", 260, { pointerType: "touch" });
  assert.deepEqual(calls.at(-1)[2].rooms.map((r) => r.label), ["B", "C", "A"]);
  assert.ok(!card.shadowRoot.querySelector(".dragging, .drop-above, .drop-below"));
  // To the end (below the last row's middle), with the mouse: after the empty row, no trailing spacer.
  layOut(card);
  handle = card.shadowRoot.querySelectorAll(".handle")[0];
  pointer(handle, "pointerdown", 50, { pointerType: "mouse" });
  pointer(handle, "pointermove", 390, { pointerType: "mouse" });
  assert.ok(rows(card)[3].classList.contains("drop-below"));
  pointer(handle, "pointerup", 390, { pointerType: "mouse" });
  assert.deepEqual(calls.at(-1)[2].rooms.map((r) => r.label ?? "-"), ["C", "A", "-", "B"]);
  // Upwards, before the first row.
  layOut(card);
  handle = card.shadowRoot.querySelectorAll(".handle")[3];
  pointer(handle, "pointerdown", 350);
  pointer(handle, "pointermove", 10);
  pointer(handle, "pointerup", 10);
  assert.deepEqual(calls.at(-1)[2].rooms.map((r) => r.label ?? "-"), ["B", "C", "A"]);
});

test("a cancelled drag, a drop in place or another button move nothing", () => {
  const rooms = [{ label: "A", main: "sensor.k_t", extra: "" }, { label: "B", main: "sensor.b_t", extra: "" }];
  const { card, calls, hass } = makeCard({ rooms, slots: 2 });
  layOut(card);
  const handle = card.shadowRoot.querySelectorAll(".handle")[0];
  pointer(handle, "pointerdown", 50);
  pointer(handle, "pointermove", 180);
  // An update under the finger does not draw the rows away.
  card.hass = { ...hass, states: { ...hass.states, "sensor.new": { state: "1", attributes: { unit_of_measurement: "°C" } } } };
  assert.ok(rows(card)[0].classList.contains("dragging"));
  pointer(handle, "pointercancel", 180);
  pointer(handle, "pointerdown", 50);
  pointer(handle, "pointermove", 40);
  pointer(handle, "pointerup", 40);
  pointer(handle, "pointerdown", 50, { button: 2 });
  pointer(handle, "pointerup", 180, { button: 2 });
  assert.equal(calls.length, 0);
  assert.ok(!card.shadowRoot.querySelector(".dragging"));
  // The handle takes the touch, so the page does not scroll under the finger.
  assert.match(card.shadowRoot.querySelector("style").textContent, /\.handle \{[^}]*touch-action: none/);
});

test("rooms beyond the number of places are kept, counted, and removed only on request", () => {
  const rooms = [{ label: "A", main: "sensor.k_t", extra: "" }, { label: "B", main: "sensor.b_t", extra: "" },
                 { spacer: true }, { label: "C", main: "sensor.k_h", extra: "" }, { label: "D", main: "sensor.b_co2", extra: "" }];
  const { card, calls } = makeCard({ rooms, slots: 2 });
  assert.equal(rows(card).length, 2);
  const note = card.shadowRoot.querySelector(".beyond");
  assert.equal(note.querySelector("span").textContent,
               "Rooms beyond the number of places, not on the Ramka: 2. Raise the number to show them again.");
  change(inputs(card)[0], "Hall");
  assert.deepEqual(calls.at(-1)[2].rooms.map((r) => r.label ?? "-"), ["Hall", "B", "-", "C", "D"]);
  card.shadowRoot.querySelectorAll("button.down")[0].click();
  assert.deepEqual(calls.at(-1)[2].rooms.map((r) => r.label ?? "-"), ["B", "Hall", "-", "C", "D"]);
  card.shadowRoot.querySelector("button.remove-beyond").click();
  assert.deepEqual(calls.at(-1)[2].rooms.map((r) => r.label), ["B", "Hall"]);
  assert.equal(card.shadowRoot.querySelector(".beyond"), null);
  // Enough places: no note.
  assert.equal(makeCard({ rooms, slots: 5 }).card.shadowRoot.querySelector(".beyond"), null);
  assert.equal(makeCard({ rooms: rooms.slice(0, 3), slots: 2 }).card.shadowRoot.querySelector(".beyond"), null);
});

test("an empty name becomes the main sensor's area, else its name", () => {
  const extra = { entities: { "sensor.b_t": { device_id: "d1" } }, devices: { d1: { area_id: "bed" } }, areas: { bed: { name: "Sleeping room" } } };
  const { card, calls } = makeCard({ rooms: [], extra });
  change(selects(card)[0], "sensor.b_t");
  change(selects(card)[2], "sensor.k_t");
  assert.deepEqual(calls.at(-1)[2].rooms.map((r) => r.label), ["Sleeping room", "Kitchen temperature"]);
});

test("a sensor that is gone stays chosen, marked", () => {
  const { card } = makeCard({ rooms: [{ label: "Attic", main: "sensor.gone", extra: "" }] });
  const select = selects(card)[0];
  assert.equal(select.value, "sensor.gone");
  assert.equal(select.selectedOptions[0].textContent, "sensor.gone (not found)");
});

test("labels per language; a sensor name is text, not markup", () => {
  const { card } = makeCard({ rooms: [{ label: "K", main: "sensor.k_t" }], lang: "pl", extra: {} });
  assert.deepEqual(titles(card).slice(0, 2), ["Pokój 1", "Puste miejsce"]);
  assert.equal(card.shadowRoot.querySelector("button.down").getAttribute("aria-label"), "W dół");
  const odd = document.createElement("climate-rooms-card");
  odd.setConfig({ entity: ENTITY, script: "script.x" });
  odd.hass = { locale: { language: "de" }, states: { "sensor.x": sensor("<b>x</b>", "°C") }, callService() {} };
  assert.equal(odd.shadowRoot.querySelectorAll("b").length, 0);
  assert.equal(odd.shadowRoot.querySelector(".room").textContent, "Leerer Platz");
});

test("entity and script are required", () => {
  assert.throws(() => document.createElement("climate-rooms-card").setConfig({ script: "script.x" }), /entity is required/);
  assert.throws(() => document.createElement("climate-rooms-card").setConfig({ entity: ENTITY }), /script is required/);
});
