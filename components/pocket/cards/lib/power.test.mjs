import { test } from "node:test";
import assert from "node:assert/strict";
import { powerSensors, powerNow, watts, classOf, entityName, CLASSES } from "./power.js";
import { config, powerHass, st } from "../testing/demo-home.mjs";

const shape = (groups) => groups.map((g) => [g.areaId, g.area?.id ?? null, g.devices.map((d) => [d.name, d.entities])]);

test("meters by area (the pocket's areas first, then HA's others, then none) and by device", () => {
  assert.deepEqual(shape(powerSensors(powerHass(), config)), [
    ["living_room", "living_room", [["TV plug",
      ["sensor.tv_plug_power", "sensor.tv_plug_energy", "sensor.tv_plug_current", "sensor.tv_plug_voltage"]]]],
    ["bedroom", "bedroom", [[null, ["sensor.heater_power"]]]],
    ["office", "office", [
      ["Desk meter", ["sensor.desk_meter_channel_1", "sensor.desk_meter_channel_2", "sensor.desk_meter_total"]],
      ["Lamp plug", ["sensor.lamp_plug_power"]]]],
    ["utility", null, [["Mains meter", ["sensor.mains_power", "sensor.mains_voltage"]]]],
    [null, null, [[null, ["sensor.garage_power"]]]],
  ]);
});

test("left out: other device classes, diagnostic entities, a disabled device's, states that are missing", () => {
  const ids = powerSensors(powerHass(), config).flatMap((g) => g.devices.flatMap((d) => d.entities));
  for (const id of ["sensor.tv_plug_signal", "sensor.tv_plug_power_diag", "sensor.old_plug_power",
    "sensor.living_room_temperature"]) assert.ok(!ids.includes(id), id);
  const hass = powerHass();
  delete hass.states["sensor.heater_power"];
  assert.ok(!powerSensors(hass, config).some((g) => g.areaId === "bedroom"));
  assert.deepEqual(powerSensors({ states: {} }, config), []);
});

test("apparent power and power factor count as meters too; the registry's class when the state has none", () => {
  const hass = powerHass({
    "sensor.mains_apparent": st(900, { device_class: "apparent_power", unit_of_measurement: "VA" }),
    "sensor.mains_pf": st(0.9, {}),
  });
  hass.entities["sensor.mains_apparent"] = { entity_id: "sensor.mains_apparent", device_id: "d_mains" };
  hass.entities["sensor.mains_pf"] = { entity_id: "sensor.mains_pf", device_id: "d_mains", original_device_class: "power_factor" };
  assert.equal(classOf(hass, "sensor.mains_pf"), "power_factor");
  const mains = powerSensors(hass, config).find((g) => g.areaId === "utility").devices[0].entities;
  assert.deepEqual(mains, ["sensor.mains_power", "sensor.mains_apparent", "sensor.mains_pf", "sensor.mains_voltage"]);
  assert.deepEqual(CLASSES, ["power", "apparent_power", "power_factor", "energy", "current", "voltage"]);
});

test("Now: one power reading per device (its highest), a device behind a measured one left out", () => {
  const hass = powerHass();
  const now = powerNow(hass, powerSensors(hass, config));
  assert.equal(now.watts, 64.5 + 1200 + 200 + 812);
  assert.deepEqual(now.entities.sort(),
    ["sensor.desk_meter_total", "sensor.heater_power", "sensor.mains_power", "sensor.tv_plug_power"]);
});

test("Now: the plug counts when the meter it hangs on has no power reading; none at all: null", () => {
  const hass = powerHass({ "sensor.desk_meter_total": st("unavailable"), "sensor.desk_meter_channel_1": st("unknown"),
    "sensor.desk_meter_channel_2": st("") });
  const now = powerNow(hass, powerSensors(hass, config));
  assert.ok(now.entities.includes("sensor.lamp_plug_power"));
  assert.equal(powerNow(hass, []), null);
  assert.equal(powerNow({ states: {} }, [{ devices: [{ device: null, entities: ["sensor.x"] }] }]), null);
});

test("watts: W, kW, MW; anything else or no number is null", () => {
  const hass = { states: {
    a: st(5, { unit_of_measurement: "W" }), b: st(1.5, { unit_of_measurement: "kW" }), c: st(2, { unit_of_measurement: "MW" }),
    d: st(3, { unit_of_measurement: "VA" }), e: st("unavailable", { unit_of_measurement: "W" }), f: st(7) } };
  assert.deepEqual(["a", "b", "c", "d", "e", "f", "g"].map((id) => watts(hass, id)), [5, 1500, 2e6, null, null, 7, null]);
});

test("a meter's name without its device's in front", () => {
  const hass = powerHass();
  assert.equal(entityName(hass, "sensor.tv_plug_power", "TV plug"), "Power");
  assert.equal(entityName(hass, "sensor.heater_power", null), "Heater power");
  assert.equal(entityName(hass, "sensor.heater_power", "Heater power"), "Heater power", "never empty");
});
