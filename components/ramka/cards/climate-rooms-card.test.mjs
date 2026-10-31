import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./testing/dom-env.mjs";
import { shadowText } from "./testing/dom-env.mjs";
import "./climate-rooms-card.js";

const ENTITY = "sensor.ramka_climate_rooms";
const sensor = (name, unit, device_class) => ({ state: "21", attributes: { friendly_name: name, ...(unit ? { unit_of_measurement: unit } : {}),
                                                                           ...(device_class ? { device_class } : {}) } });
const STATES = {
  "sensor.k_t": sensor("Kitchen temperature", "°C", "temperature"),
  "sensor.k_h": sensor("Kitchen humidity", "%", "humidity"),
  "sensor.b_t": sensor("Bedroom temperature", "°C", "temperature"),
  "sensor.b_co2": sensor("Bedroom CO2", "ppm", "carbon_dioxide"),
  "sensor.weather_text": sensor("Weather text"),
  "binary_sensor.door": sensor("Door", "%"),
};

const SLOTS = "input_number.ramka_climate_slots";
const AIR_LIMITS = { co2: ["input_number.ramka_air_co2_raised", "input_number.ramka_air_co2_high"],
                     pm2_5: ["input_number.ramka_air_pm2_5_raised", "input_number.ramka_air_pm2_5_high"] };

function makeCard({ rooms, lang = "en", extra = {}, slots, states = {}, config = {} } = {}) {
  const calls = [];
  const card = document.createElement("climate-rooms-card");
  card.setConfig({ entity: ENTITY, script: "script.ramka_climate_rooms_set", ...(slots !== undefined ? { slots: SLOTS } : {}), ...config });
  const all = { ...STATES, ...states, ...(rooms ? { [ENTITY]: { state: String(rooms.length), attributes: { rooms } } } : {}),
                ...(slots !== undefined ? { [SLOTS]: { state: String(slots), attributes: {} } } : {}) };
  const hass = { locale: { language: lang }, states: all, callService: (...args) => calls.push(args), ...extra };
  card.hass = hass;
  return { card, calls, hass };
}

const KT = { type: "temperature", label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" };
const rows = (card) => [...card.shadowRoot.querySelectorAll(".row")];
const types = (card) => [...card.shadowRoot.querySelectorAll("select.type")];
// The reading dropdowns (not the type dropdowns), in order: main, second, per row with readings.
const readings = (card) => [...card.shadowRoot.querySelectorAll(".row select:not(.type)")];
const inputs = (card) => [...card.shadowRoot.querySelectorAll(".row input")];
const saved = (calls) => calls.filter((c) => c[0] === "script").at(-1)[2].rooms;
const change = (el, value) => {
  el.value = value;
  el.dispatchEvent(new window.Event("change"));
};
const optionIds = (select) => [...select.options].map((o) => o.value);

// ---- Rows and types ------------------------------------------------------------------------------

test("every one of the rows is an editable widget row with a type; a new row starts Empty", () => {
  const { card, calls } = makeCard({ rooms: [KT] });
  assert.equal(rows(card).length, 10);
  assert.deepEqual(types(card).map((s) => s.value), ["temperature", ...Array(9).fill("empty")]);
  // An Empty row has no readings and no settings; a typed one has both.
  assert.equal(readings(card).length, 2);
  assert.equal(rows(card)[0].querySelectorAll("button.settings").length, 1);
  assert.equal(rows(card)[1].querySelectorAll("button.settings, input, select:not(.type)").length, 0);
  // Row 7 of 10 (with one widget) is no dead spacer: it takes a type, and then its readings.
  change(types(card)[6], "temperature");
  assert.deepEqual(saved(calls), [KT, ...Array(5).fill({ type: "empty", spacer: true }), { type: "temperature", label: "", main: "", extra: "" }]);
  assert.equal(types(card)[6].value, "temperature");
  assert.equal(rows(card)[6].querySelectorAll("select:not(.type)").length, 2);
  change(rows(card)[6].querySelector("select:not(.type)"), "sensor.b_t");
  assert.deepEqual(saved(calls).at(-1), { type: "temperature", label: "Bedroom temperature", main: "sensor.b_t", extra: "" });
});

test("the type dropdown sits in the row's header: Temperature, Air quality, Custom, Empty, per language", () => {
  const { card } = makeCard({ rooms: [KT] });
  const select = types(card)[0];
  assert.ok(select.closest(".head"));
  assert.deepEqual([...select.options].map((o) => [o.value, o.textContent]),
                   [["temperature", "Temperature"], ["air", "Air quality"], ["custom", "Custom"], ["empty", "Empty"]]);
  assert.equal(select.getAttribute("aria-label"), "Type of widget 1");
  const pl = makeCard({ rooms: [KT], lang: "pl" }).card;
  assert.deepEqual([...types(pl)[0].options].map((o) => o.textContent), ["Temperatura", "Jakość powietrza", "Własny", "Pusty"]);
  const de = makeCard({ rooms: [KT], lang: "de" }).card;
  assert.deepEqual([...types(de)[0].options].map((o) => o.textContent), ["Temperatur", "Luftqualität", "Eigenes", "Leer"]);
});

test("no row shows a raw translation key (the picker once showed card.climate_rooms.spacer)", () => {
  for (const lang of ["en", "de", "pl"]) {
    const { card } = makeCard({ rooms: [KT, { type: "air", label: "B", main: "sensor.b_co2", extra: "" }, { type: "custom", label: "C", main: "sensor.k_t", extra: "" }], lang });
    assert.doesNotMatch(shadowText(card), /card\./, lang);
    for (const select of types(card)) assert.doesNotMatch([...select.options].map((o) => o.textContent).join(" "), /card\./, lang);
  }
});

test("the translations are imported with the card's own ?v=, so the 31-day cache cannot serve old ones", () => {
  for (const file of ["./climate-rooms-card.js", "./rooms-card.js"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /^import .* from "\.\.\/translations\//m, file);
    assert.match(source, /new URL\(import\.meta\.url\)\.search/, file);
    assert.match(source, /load\("\.\.\/translations\/en\.json", true\)/, file);
  }
});

// ---- Pickers -------------------------------------------------------------------------------------

test("each type's pickers offer its device classes; Custom any sensor with a unit", () => {
  const states = { "sensor.b_pm": sensor("Bedroom PM2.5", "µg/m³", "pm25") };
  const { card } = makeCard({ rooms: [KT, { type: "air", label: "B", main: "sensor.b_co2", extra: "" },
                                      { type: "custom", label: "C", main: "sensor.k_t", extra: "" }], states });
  const [tMain, tExtra, aMain, aExtra, cMain] = readings(card);
  assert.deepEqual(optionIds(tMain), ["", "sensor.b_t", "sensor.k_t"]);
  assert.deepEqual(optionIds(tExtra), ["", "sensor.k_h"]);
  assert.deepEqual(optionIds(aMain), ["", "sensor.b_co2"]);
  assert.deepEqual(optionIds(aExtra), ["", "sensor.b_pm"]);
  assert.deepEqual(optionIds(cMain), ["", "sensor.b_co2", "sensor.b_pm", "sensor.b_t", "sensor.k_h", "sensor.k_t"]);
  // The labels follow the type.
  const labels = [...rows(card)[1].querySelectorAll("label > span")].map((s) => s.textContent);
  assert.deepEqual(labels, ["Name", "CO₂", "PM2.5"]);
  assert.deepEqual([...rows(card)[0].querySelectorAll("label > span")].map((s) => s.textContent), ["Name", "Temperature", "Humidity"]);
});

test("a device class no sensor of the home has falls back to every sensor with a unit", () => {
  const { card } = makeCard({ rooms: [{ type: "air", label: "B", main: "sensor.b_co2", extra: "" }] });
  const [main, extra] = readings(card);
  assert.deepEqual(optionIds(main), ["", "sensor.b_co2"]);
  assert.deepEqual(optionIds(extra), ["", "sensor.b_co2", "sensor.b_t", "sensor.k_h", "sensor.k_t"]);
});

test("the custom dropdowns list the sensors with a unit, by name, after the empty choice", () => {
  const { card } = makeCard({ rooms: [{ type: "custom", label: "", main: "", extra: "" }] });
  const options = [...readings(card)[0].options].map((o) => [o.value, o.textContent]);
  assert.deepEqual(options, [["", "—"], ["sensor.b_co2", "Bedroom CO2 (ppm)"], ["sensor.b_t", "Bedroom temperature (°C)"],
                             ["sensor.k_h", "Kitchen humidity (%)"], ["sensor.k_t", "Kitchen temperature (°C)"]]);
});

test("a new type keeps the name and the readings that fit it", () => {
  const { card, calls } = makeCard({ rooms: [KT], states: { "sensor.b_pm": sensor("Bedroom PM2.5", "µg/m³", "pm25") } });
  change(types(card)[0], "custom");
  assert.deepEqual(saved(calls), [{ ...KT, type: "custom" }]);
  change(types(card)[0], "air");
  assert.deepEqual(saved(calls), [{ type: "air", label: "Kitchen", main: "", extra: "" }]);
  change(types(card)[0], "empty");
  assert.deepEqual(saved(calls), []);
  assert.equal(readings(card).length, 0);
});

// ---- Entries from before the types ---------------------------------------------------------------

test("an entry without a type reads as Temperature with a temperature sensor, else Custom; a spacer as Empty", () => {
  const old = [{ label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" }, { spacer: true },
               { label: "Bed", main: "sensor.b_co2", extra: "" }, { label: "Gone", main: "sensor.gone", extra: "" }, { label: "x", main: "" }];
  const { card, calls } = makeCard({ rooms: old, slots: 5 });
  assert.deepEqual(types(card).map((s) => s.value), ["temperature", "empty", "custom", "custom", "empty"]);
  // No room is lost: the next save stores every one with its type.
  change(inputs(card)[0], "Kitchen");
  assert.deepEqual(saved(calls), [{ type: "temperature", label: "Kitchen", main: "sensor.k_t", extra: "sensor.k_h" }, { type: "empty", spacer: true },
                                  { type: "custom", label: "Bed", main: "sensor.b_co2", extra: "" },
                                  { type: "custom", label: "Gone", main: "sensor.gone", extra: "" }]);
});

// ---- Saving, slots, order ------------------------------------------------------------------------

test("a change saves every row in order, an Empty one in between kept, none at the end", () => {
  const { card, calls } = makeCard({ rooms: [KT, { spacer: true }, { type: "custom", label: "Bed", main: "sensor.b_co2", extra: "" }], slots: 4 });
  change(inputs(card)[1], " Bedroom ");
  assert.deepEqual(saved(calls), [KT, { type: "empty", spacer: true }, { type: "custom", label: "Bedroom", main: "sensor.b_co2", extra: "" }]);
  change(types(card)[2], "empty");
  assert.deepEqual(saved(calls), [KT]);
  change(readings(card)[0], "");
  assert.deepEqual(saved(calls), [{ type: "temperature", label: "Kitchen", main: "", extra: "sensor.k_h" }]);
});

test("the number of widgets sets the rows: 1 to 20, ten while the helper has no number", () => {
  assert.equal(rows(makeCard({ rooms: [], slots: 3 }).card).length, 3);
  assert.equal(rows(makeCard({ rooms: [], slots: 20 }).card).length, 20);
  assert.equal(rows(makeCard({ rooms: [], slots: 25 }).card).length, 20);
  assert.equal(rows(makeCard({ rooms: [], slots: "unavailable" }).card).length, 10);
  // The number changes: the rows follow, the widgets stay.
  const { card, hass } = makeCard({ rooms: [KT], slots: 2 });
  card.hass = { ...hass, states: { ...hass.states, [SLOTS]: { state: "5.0", attributes: {} } } };
  assert.equal(rows(card).length, 5);
  assert.equal(readings(card)[0].value, "sensor.k_t");
});

test("the widgets with a reading are coloured in series order, skipping the empty ones, never blue, amber or red", () => {
  const { card } = makeCard({ rooms: [{ spacer: true }, KT, { type: "custom", label: "x", main: "" },
                                      { type: "custom", label: "Bed", main: "sensor.b_t", extra: "" }], slots: 4 });
  const swatches = [...card.shadowRoot.querySelectorAll(".swatch")];
  assert.deepEqual(swatches.map((s) => s.classList.contains("spacer")), [true, false, true, false]);
  // HA's fallbacks for the theme's slots 4 and 5 (teal, purple); its blue, amber and red are not among the series.
  assert.deepEqual([swatches[1], swatches[3]].map((s) => s.style.background), ["#6cc5b0", "#a463f2"]);
  assert.equal(swatches[0].style.background, "");
});

test("up and down move a row, save the order and keep the focus on the button", () => {
  const bed = { type: "temperature", label: "Bed", main: "sensor.b_t", extra: "" };
  const { card, calls } = makeCard({ rooms: [KT, { spacer: true }, bed], slots: 3 });
  document.body.append(card);  // focus is tracked in a connected tree only
  const buttons = (which) => [...card.shadowRoot.querySelectorAll(`button.${which}`)];
  assert.deepEqual(buttons("up").map((b) => b.disabled), [true, false, false]);
  assert.deepEqual(buttons("down").map((b) => b.disabled), [false, false, true]);
  assert.equal(buttons("up")[0].getAttribute("aria-label"), "Move up");
  buttons("down")[0].click();
  assert.deepEqual(saved(calls), [{ type: "empty", spacer: true }, KT, bed]);
  // Drawn in the new order at once, before the saved list comes back.
  assert.deepEqual(types(card).map((s) => s.value), ["empty", "temperature", "temperature"]);
  assert.ok(card.shadowRoot.activeElement === buttons("down")[1]);
  buttons("up")[2].click();
  assert.deepEqual(saved(calls).map((r) => r.label ?? "-"), ["-", "Bed", "Kitchen"]);
  buttons("up")[1].click();
  assert.deepEqual(saved(calls).map((r) => r.label ?? "-"), ["Bed", "-", "Kitchen"]);
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
  const rooms = [{ type: "custom", label: "A", main: "sensor.k_t", extra: "" }, { type: "custom", label: "B", main: "sensor.b_t", extra: "" },
                 { type: "custom", label: "C", main: "sensor.k_h", extra: "" }];
  const { card, calls } = makeCard({ rooms, slots: 4 });
  layOut(card);
  let handle = card.shadowRoot.querySelectorAll(".handle")[0];
  pointer(handle, "pointerdown", 50, { pointerType: "touch" });
  assert.ok(rows(card)[0].classList.contains("dragging"));
  pointer(handle, "pointermove", 260, { pointerType: "touch" });
  assert.ok(rows(card)[3].classList.contains("drop-above"));
  pointer(handle, "pointerup", 260, { pointerType: "touch" });
  assert.deepEqual(saved(calls).map((r) => r.label), ["B", "C", "A"]);
  assert.ok(!card.shadowRoot.querySelector(".dragging, .drop-above, .drop-below"));
  // To the end (below the last row's middle), with the mouse: after the empty row, none trailing.
  layOut(card);
  handle = card.shadowRoot.querySelectorAll(".handle")[0];
  pointer(handle, "pointerdown", 50, { pointerType: "mouse" });
  pointer(handle, "pointermove", 390, { pointerType: "mouse" });
  assert.ok(rows(card)[3].classList.contains("drop-below"));
  pointer(handle, "pointerup", 390, { pointerType: "mouse" });
  assert.deepEqual(saved(calls).map((r) => r.label ?? "-"), ["C", "A", "-", "B"]);
  // Upwards, before the first row.
  layOut(card);
  handle = card.shadowRoot.querySelectorAll(".handle")[3];
  pointer(handle, "pointerdown", 350);
  pointer(handle, "pointermove", 10);
  pointer(handle, "pointerup", 10);
  assert.deepEqual(saved(calls).map((r) => r.label ?? "-"), ["B", "C", "A"]);
});

test("a cancelled drag, a drop in place or another button move nothing", () => {
  const rooms = [{ type: "custom", label: "A", main: "sensor.k_t", extra: "" }, { type: "custom", label: "B", main: "sensor.b_t", extra: "" }];
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

test("widgets beyond the number are kept, counted, and removed only on request", () => {
  const c = (label, main) => ({ type: "custom", label, main, extra: "" });
  const rooms = [c("A", "sensor.k_t"), c("B", "sensor.b_t"), { spacer: true }, c("C", "sensor.k_h"), c("D", "sensor.b_co2")];
  const { card, calls } = makeCard({ rooms, slots: 2 });
  assert.equal(rows(card).length, 2);
  const note = card.shadowRoot.querySelector(".beyond");
  assert.equal(note.querySelector("span").textContent,
               "Widgets beyond the number of widgets, not on the Ramka: 2. Raise the number to show them again.");
  change(inputs(card)[0], "Hall");
  assert.deepEqual(saved(calls).map((r) => r.label ?? "-"), ["Hall", "B", "-", "C", "D"]);
  card.shadowRoot.querySelectorAll("button.down")[0].click();
  assert.deepEqual(saved(calls).map((r) => r.label ?? "-"), ["B", "Hall", "-", "C", "D"]);
  card.shadowRoot.querySelector("button.remove-beyond").click();
  assert.deepEqual(saved(calls).map((r) => r.label), ["B", "Hall"]);
  assert.equal(card.shadowRoot.querySelector(".beyond"), null);
  // Enough widgets: no note.
  assert.equal(makeCard({ rooms, slots: 5 }).card.shadowRoot.querySelector(".beyond"), null);
  assert.equal(makeCard({ rooms: rooms.slice(0, 3), slots: 2 }).card.shadowRoot.querySelector(".beyond"), null);
});

test("an empty name becomes the main sensor's area, else its name", () => {
  const extra = { entities: { "sensor.b_t": { device_id: "d1" } }, devices: { d1: { area_id: "bed" } }, areas: { bed: { name: "Sleeping room" } } };
  const { card, calls } = makeCard({ rooms: [{ type: "temperature", label: "", main: "", extra: "" }, { type: "custom", label: "", main: "", extra: "" }], extra });
  change(readings(card)[0], "sensor.b_t");
  change(readings(card)[2], "sensor.k_t");
  assert.deepEqual(saved(calls).map((r) => r.label), ["Sleeping room", "Kitchen temperature"]);
});

test("a sensor that is gone stays chosen, marked; one of another class stays, by its name", () => {
  const { card } = makeCard({ rooms: [{ type: "temperature", label: "Attic", main: "sensor.gone", extra: "sensor.b_co2" }] });
  const [main, extra] = readings(card);
  assert.equal(main.value, "sensor.gone");
  assert.equal(main.selectedOptions[0].textContent, "sensor.gone (not found)");
  assert.equal(extra.value, "sensor.b_co2");
  assert.equal(extra.selectedOptions[0].textContent, "Bedroom CO2");
});

test("labels per language; a sensor name is text, not markup", () => {
  const { card } = makeCard({ rooms: [KT], lang: "pl" });
  assert.equal(card.shadowRoot.querySelector("button.down").getAttribute("aria-label"), "W dół");
  assert.equal(card.shadowRoot.querySelector("button.settings").textContent, "Ustawienia");
  const odd = document.createElement("climate-rooms-card");
  odd.setConfig({ entity: ENTITY, script: "script.x" });
  odd.hass = { locale: { language: "de" }, states: { "sensor.x": sensor("<b>x</b>", "°C"),
                                                     [ENTITY]: { state: "1", attributes: { rooms: [{ type: "custom", label: "", main: "sensor.x", extra: "" }] } } },
               callService() {} };
  assert.equal(odd.shadowRoot.querySelectorAll("b").length, 0);
  assert.equal(odd.shadowRoot.querySelector("button.settings").textContent, "Einstellungen");
});

test("entity and script are required", () => {
  assert.throws(() => document.createElement("climate-rooms-card").setConfig({ script: "script.x" }), /entity is required/);
  assert.throws(() => document.createElement("climate-rooms-card").setConfig({ entity: ENTITY }), /script is required/);
});

// ---- The settings dialog -------------------------------------------------------------------------

// The dialog opens modal in a connected tree only.
const openDialog = (card, row = 0) => {
  if (!card.isConnected) document.body.append(card);
  rows(card)[row].querySelector("button.settings").click();
  return card.shadowRoot.querySelector("dialog.widget-settings");
};
const numbers = (dialog) => Object.fromEntries([...dialog.querySelectorAll("input[type=number]")].map((i) => [i.name, i]));
const submit = (dialog) => dialog.querySelector("button.save").click();

test("a Temperature widget's dialog: four comfort numbers, 20-24 °C and 40-60 % by default, stored in the widget", () => {
  const { card, calls } = makeCard({ rooms: [KT] });
  document.body.append(card);
  const dialog = openDialog(card);
  assert.ok(dialog.open);
  assert.equal(dialog.getAttribute("aria-labelledby"), dialog.querySelector("h2").id);
  assert.equal(dialog.querySelector("h2").textContent, "Settings: Kitchen");
  const n = numbers(dialog);
  assert.deepEqual(Object.fromEntries(Object.entries(n).map(([k, i]) => [k, i.value])),
                   { temp_low: "20", temp_high: "24", hum_low: "40", hum_high: "60" });
  n.temp_low.value = "19.5";
  n.hum_high.value = "55";
  submit(dialog);
  assert.deepEqual(saved(calls), [{ ...KT, temp_low: 19.5, temp_high: 24, hum_low: 40, hum_high: 55 }]);
  assert.equal(card.shadowRoot.querySelector("dialog"), null);
  // Opened again, it shows the widget's own numbers.
  card.hass = { ...card._hass, states: { ...card._hass.states, [ENTITY]: { state: "1", attributes: { rooms: saved(calls) } } } };
  assert.equal(numbers(openDialog(card)).temp_low.value, "19.5");
  card.remove();
});

test("an unusable range is refused with a message; the dialog stays open", () => {
  const { card, calls } = makeCard({ rooms: [KT] });
  const dialog = openDialog(card);
  numbers(dialog).temp_low.value = "25";
  submit(dialog);
  assert.equal(calls.length, 0);
  assert.ok(dialog.isConnected && dialog.open);
  assert.equal(dialog.querySelector(".error").textContent, "Each range needs a number and a higher one.");
  numbers(dialog).temp_low.value = "";
  submit(dialog);
  assert.equal(calls.length, 0);
});

test("Escape, the backdrop and Cancel close the dialog without saving; updates wait while it is open", () => {
  for (const how of ["escape", "cancel-event", "backdrop", "button"]) {
    const { card, calls, hass } = makeCard({ rooms: [KT] });
    const dialog = openDialog(card);
    numbers(dialog).temp_low.value = "18";
    // An update while it is open does not draw the rows (and the dialog) away.
    card.hass = { ...hass, states: { ...hass.states, [ENTITY]: { state: "1", attributes: { rooms: [{ ...KT, label: "Cooking" }] } } } };
    assert.ok(dialog.isConnected, how);
    if (how === "escape") dialog.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    if (how === "cancel-event") dialog.dispatchEvent(new window.Event("cancel", { cancelable: true }));
    if (how === "backdrop") dialog.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    if (how === "button") dialog.querySelector("button.cancel").click();
    assert.equal(card.shadowRoot.querySelector("dialog"), null, how);
    assert.equal(calls.length, 0, how);
    // The update that came in meanwhile is drawn now.
    assert.equal(inputs(card)[0].value, "Cooking", how);
  }
  // A click inside the form is no backdrop click.
  const { card } = makeCard({ rooms: [KT] });
  const dialog = openDialog(card);
  dialog.querySelector("h2").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.ok(dialog.isConnected);
});

test("an Air quality widget's dialog edits the Air page's own limits; a reading the home lacks is not set up", () => {
  const limit = (state) => ({ state, attributes: { min: 1, max: 5000, step: 1 } });
  const states = { [AIR_LIMITS.co2[0]]: limit("800.0"), [AIR_LIMITS.co2[1]]: limit("1200.0") };
  const air = { type: "air", label: "Bed", main: "sensor.b_co2", extra: "" };
  const { card, calls } = makeCard({ rooms: [air], states, config: { air_limits: AIR_LIMITS } });
  const dialog = openDialog(card);
  const n = numbers(dialog);
  assert.deepEqual(Object.keys(n), AIR_LIMITS.co2);
  assert.deepEqual([n[AIR_LIMITS.co2[0]].value, n[AIR_LIMITS.co2[1]].value], ["800", "1200"]);
  assert.equal(n[AIR_LIMITS.co2[0]].getAttribute("max"), "5000");
  // PM2.5: named in the config, but its helpers are not there.
  assert.equal(dialog.querySelector(".not-set-up").textContent, "PM2.5 (µg/m³): not set up, the Air page has no such reading.");
  n[AIR_LIMITS.co2[1]].value = "1000";
  submit(dialog);
  // Only the changed helper is written, with the helper's service; nothing in the widget.
  assert.deepEqual(calls, [["input_number", "set_value", { entity_id: AIR_LIMITS.co2[1], value: 1000 }]]);
  // Without air_limits in the config: neither is set up.
  const bare = openDialog(makeCard({ rooms: [air], states }).card);
  assert.equal(bare.querySelectorAll(".not-set-up").length, 2);
  assert.equal(bare.querySelectorAll("input[type=number]").length, 0);
});

test("a Custom widget's dialog picks its colour from the series palette, or neutral", () => {
  const custom = { type: "custom", label: "Power", main: "sensor.k_t", extra: "" };
  const { card, calls } = makeCard({ rooms: [custom] });
  const dialog = openDialog(card);
  const radios = [...dialog.querySelectorAll("input[type=radio]")];
  // Neutral and the six series colours (the theme's slots without blue, amber and red).
  assert.deepEqual(radios.map((r) => r.value), ["0", "4", "5", "6", "9", "11", "10"]);
  assert.ok(radios[0].checked);
  radios[3].checked = true;
  submit(dialog);
  assert.deepEqual(saved(calls), [{ ...custom, color: 6 }]);
  // Back to neutral: no colour stored.
  card.hass = { ...card._hass, states: { ...card._hass.states, [ENTITY]: { state: "1", attributes: { rooms: [{ ...custom, color: 6 }] } } } };
  const again = openDialog(card);
  const [neutral] = again.querySelectorAll("input[type=radio]");
  assert.ok(again.querySelector("input[value='6']").checked);
  neutral.checked = true;
  submit(again);
  assert.deepEqual(saved(calls), [custom]);
});
