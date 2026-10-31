import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SERIES_SLOTS, seriesSlot, readWidget, storedWidget, band, level } from "./climate-widgets.js";

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
  // Per-type values: a Temperature widget's ranges, a Custom widget's series colour; nothing else.
  assert.deepEqual(readWidget({ type: "temperature", label: "", main: "", temp_low: 18, hum_high: "x", color: 9 }, states),
                   { type: "temperature", label: "", main: "", extra: "", temp_low: 18 });
  assert.deepEqual(readWidget({ type: "custom", main: "sensor.c", color: 9 }, states).color, 9);
  assert.equal(readWidget({ type: "custom", main: "sensor.c", color: 1 }, states).color, undefined);
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
  assert.deepEqual([799, 800, 1199, 1200, null].map((v) => level(v, 800, 1200)), ["good", "raised", "raised", "high", null]);
});
