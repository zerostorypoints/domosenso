// The sensor's measurements in its trend sheet (lib/measurements.js, lib/trend-sheet.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import { measurementsOf, specFor } from "./measurements.js";
import { trendSpec, render } from "./trend-sheet.js";
import { areasOf } from "./areas.js";
import { config, st, baseStates, hassOf, ctxOf, text } from "../testing/demo-home.mjs";

const LR = areasOf(config).find((a) => a.id === "living_room");

// The living room's air monitor: score and CO₂ (the home's inputs), its own temperature (a
// device_class the room has a comfort range for), PM2.5 (no air levels in the demo home), a
// battery (diagnostic), a status text and a sensor gone unavailable.
function airHass() {
  const hass = hassOf({
    ...baseStates(),
    "sensor.living_room_air_quality_score": st(81, { friendly_name: "Air Monitor Indoor air quality score", state_class: "measurement" }),
    "sensor.living_room_co2": st(768, { friendly_name: "Air Monitor Carbon dioxide", device_class: "carbon_dioxide", unit_of_measurement: "ppm" }),
    "sensor.air_monitor_temperature": st(21.4, { friendly_name: "Air Monitor Temperature", device_class: "temperature" }),
    "sensor.air_monitor_pm25": st(3.5, { friendly_name: "Air Monitor PM2.5", device_class: "pm25", unit_of_measurement: "µg/m³" }),
    "sensor.air_monitor_battery": st(90, { friendly_name: "Air Monitor Battery" }),
    "sensor.air_monitor_status": st("ok", { friendly_name: "Air Monitor Status" }),
    "sensor.air_monitor_nox": st("unavailable", { friendly_name: "Air Monitor NOx" }),
  });
  hass.devices = { d_air: { id: "d_air", name: "Air Monitor", area_id: "living_room" } };
  const reg = (id, extra = {}) => [id, { entity_id: id, device_id: "d_air", ...extra }];
  hass.entities = Object.fromEntries([
    reg("sensor.living_room_air_quality_score"), reg("sensor.living_room_co2"), reg("sensor.air_monitor_temperature"),
    reg("sensor.air_monitor_pm25"), reg("sensor.air_monitor_battery", { entity_category: "diagnostic" }),
    reg("sensor.air_monitor_status"), reg("sensor.air_monitor_nox"),
    ["sensor.bedroom_temperature", { entity_id: "sensor.bedroom_temperature" }],
  ]);
  return hass;
}

test("a device's numeric, listed sensors: the home's readings first in the Ramka's order, then by name", () => {
  const ctx = ctxOf({ hass: airHass() });
  const list = measurementsOf(ctx, trendSpec(ctx, LR, "co2"));
  assert.deepEqual(list.map((m) => m.entity), ["sensor.air_monitor_temperature", "sensor.living_room_air_quality_score",
    "sensor.living_room_co2", "sensor.air_monitor_pm25"]);
  assert.deepEqual(list.map((m) => m.label), ["Temperature", "Air score", "CO₂", "PM2.5"]);
  assert.equal(list[2].spec.reading, "co2", "the entry point keeps its own spec");
});

test("a sibling's spec: the area's levels for a reading, the sensor's own for anything else", () => {
  const ctx = ctxOf({ hass: airHass() });
  const base = trendSpec(ctx, LR, "co2");
  const temp = specFor(ctx, base, "sensor.air_monitor_temperature");
  assert.equal(temp.reading, "temperature");
  assert.deepEqual(temp.band, { low: "input_number.lr_temp_low", high: "input_number.lr_temp_high" }, "the room's comfort range");
  assert.equal(temp.subtitle, "Living room");
  const score = specFor(ctx, base, "sensor.living_room_air_quality_score");
  assert.equal(score.level.kind, "falling");
  const pm = specFor(ctx, base, "sensor.air_monitor_pm25");
  assert.equal(pm.reading, undefined, "no air levels for PM2.5 in this home: a plain sensor");
  assert.equal(pm.title, "PM2.5", "named without its device");
  assert.equal(pm.digits, 1);
});

test("no device, or nothing else measured: no list", () => {
  const ctx = ctxOf({ hass: airHass() });
  assert.deepEqual(measurementsOf(ctx, trendSpec(ctx, areasOf(config).find((a) => a.id === "bedroom"), "temperature")), []);
  assert.deepEqual(measurementsOf(ctxOf(), trendSpec(ctxOf(), LR, "co2")), [], "without registries");
});

test("the sheet's title is a drop-down of the measurements; a pick shows it in the same sheet, on the same period", () => {
  const hass = airHass();
  hass.callWS = () => new Promise(() => {});
  const ctx = ctxOf({ hass });
  const el = render(ctx, trendSpec(ctx, LR, "co2"));
  document.body.append(el);
  const select = el.querySelector(".pick select");
  assert.equal(el.querySelector(".pick").hidden, false);
  assert.equal(el.querySelector(".title").hidden, true);
  assert.equal(select.value, "sensor.living_room_co2");
  assert.deepEqual([...select.options].map((o) => text(o)), ["Temperature", "Air score", "CO₂", "PM2.5"]);
  assert.equal(select.getAttribute("aria-label"), "Measurement");
  el.querySelector('[data-range="7d"]').click();
  select.value = "sensor.air_monitor_temperature";
  select.dispatchEvent(new Event("change"));
  assert.equal(el._trend.spec.entity, "sensor.air_monitor_temperature");
  assert.equal(el.querySelector(".pick select").value, "sensor.air_monitor_temperature");
  assert.equal(el.querySelector('[data-range="7d"]').getAttribute("aria-pressed"), "true", "the period kept");
  assert.match(text(el.querySelector(".big")), /21[.,]4/);
  el.remove();
});

test("a sensor alone on its device keeps a plain title", () => {
  const el = render(ctxOf(), trendSpec(ctxOf(), LR, "temperature"));
  assert.equal(el.querySelector(".pick").hidden, true);
  assert.equal(el.querySelector(".title").hidden, false);
});
