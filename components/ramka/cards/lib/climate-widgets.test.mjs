import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SERIES_SLOTS, seriesSlot, readWidget, storedWidget, band, level, COLOUR_IDS, colourCss, selectedColour, colourOfSlot,
  colourKey, NEUTRAL, AIR_COLOURS } from "./climate-widgets.js";

test("the series leave out the theme's blue, amber, red, orange and light blue, in every mode", () => {
  const theme = readFileSync(new URL("../../themes/ramka.yaml", import.meta.url), "utf8");
  // The theme's own colours for the threshold slots (dark and light), as a reminder of what they are.
  for (const [slot, hues] of [[1, ["#5b8def", "#3b6fd6"]], [2, ["#f5c542", "#d9a400"]], [3, ["#ff7a5c", "#e65a3c"]],
                              [7, ["#ffa94d", "#e68a1f"]], [8, ["#8fd3ff", "#4aa3e0"]]]) {
    for (const hue of hues) assert.match(theme, new RegExp(`graph-color-${slot}: "${hue}"`));
    assert.ok(!SERIES_SLOTS.includes(slot), `slot ${slot}`);
  }
  assert.deepEqual(SERIES_SLOTS, [4, 5, 6, 9, 11, 10]);
  for (const slot of SERIES_SLOTS) assert.match(theme, new RegExp(`graph-color-${slot}:`));
  // The n-th widget, round again after the sixth.
  assert.deepEqual([1, 2, 6, 7].map(seriesSlot), [4, 5, 10, 4]);
});

test("an entry reads as a widget; one from before the types gets one from its main sensor", () => {
  const states = { "sensor.t": { attributes: { device_class: "temperature" } }, "sensor.c": { attributes: { device_class: "carbon_dioxide" } } };
  assert.deepEqual(readWidget({ label: "K", main: "sensor.t", extra: "sensor.h" }, states), { type: "temperature", label: "K", main: "sensor.t", extra: "sensor.h" });
  assert.deepEqual(readWidget({ label: "C", main: "sensor.c" }, states), { type: "custom", label: "C", main: "sensor.c", extra: "" });
  for (const empty of [{ spacer: true }, { label: "x", main: "" }, { type: "empty" }, null, "junk", { type: "temperature", spacer: true }]) {
    assert.deepEqual(readWidget(empty, states), { type: "empty" });
  }
  // Per-type values: a Temperature widget's ranges, a Custom widget's colour id; nothing else.
  assert.deepEqual(readWidget({ type: "temperature", label: "", main: "", temp_low: 18, hum_high: "x", color: 9 }, states),
                   { type: "temperature", label: "", main: "", extra: "", temp_low: 18 });
  assert.equal(readWidget({ type: "custom", main: "sensor.c", color: "light blue" }, states).color, "light blue");
  assert.equal(readWidget({ type: "custom", main: "sensor.c", color: "violet" }, states).color, undefined);
  // A theme slot number from the build before the named colours reads as its colour: no choice is lost.
  assert.deepEqual([4, 5, 6, 9, 11, 10].map((color) => readWidget({ type: "custom", main: "sensor.c", color }, states).color),
                   ["teal", "purple", "pink", "green", "magenta", "grey"]);
  assert.equal(readWidget({ type: "custom", main: "sensor.c", color: 12 }, states).color, undefined);
});

test("a widget as stored: Empty as a spacer, an empty name from its sensor", () => {
  assert.deepEqual(storedWidget({ type: "empty" }, () => "x"), { type: "empty", spacer: true });
  assert.deepEqual(storedWidget({ type: "air", label: " ", main: "sensor.c", extra: "" }, (id) => `name of ${id}`),
                   { type: "air", label: "name of sensor.c", main: "sensor.c", extra: "" });
  assert.deepEqual(storedWidget({ type: "temperature", label: "", main: "", extra: "", hum_low: 35 }, () => "x"),
                   { type: "temperature", label: "", main: "", extra: "", hum_low: 35 });
});

test("bands and levels", () => {
  assert.deepEqual([19, 20, 24, 25, NaN, null].map((v) => band(v, 20, 24)), ["low", "within", "within", "high", null, null]);
  assert.deepEqual([799, 800, 1199, 1200, null].map((v) => level(v, 800, 1200)), ["good", "fair", "fair", "poor", null]);
});

test("the named colours: every theme slot once, the theme's dark colour the fallback, a name in en, de and pl", () => {
  const theme = readFileSync(new URL("../../themes/ramka.yaml", import.meta.url), "utf8");
  const dark = theme.slice(theme.indexOf("ramka-dark:"), theme.indexOf("ramka-light:"));
  assert.equal(COLOUR_IDS.length, 11);
  for (const id of COLOUR_IDS) {
    const [, slot, hue] = colourCss(id).match(/^var\(--graph-color-(\d+), (#[0-9a-f]{6})\)$/);
    assert.match(dark, new RegExp(`graph-color-${slot}: "${hue}"`), id);
    assert.equal(colourOfSlot(Number(slot)), id);
    for (const lang of ["en", "de", "pl"]) {
      const json = JSON.parse(readFileSync(new URL(`../../translations/${lang}.json`, import.meta.url), "utf8"));
      const [, , key] = colourKey(id).split(".");
      assert.equal(typeof json.card.colours[key], "string", `${lang} ${id}`);
    }
  }
  assert.equal(colourCss("violet"), null);
  // A select's state, else the default; the defaults are the package's.
  assert.equal(selectedColour({ "input_select.c": { state: "red" } }, "input_select.c", "green"), colourCss("red"));
  assert.equal(selectedColour({ "input_select.c": { state: "unknown" } }, "input_select.c", "green"), colourCss("green"));
  assert.equal(selectedColour({}, undefined, "amber"), colourCss("amber"));
  assert.equal(NEUTRAL, "green");
  assert.deepEqual(AIR_COLOURS, { good: "green", fair: "amber", poor: "red" });
});
