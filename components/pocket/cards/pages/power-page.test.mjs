import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as power from "./power-page.js";
import { pages } from "./index.js";
import { ctxOf, hassOf, baseStates, powerHass, st, text, texts } from "../testing/demo-home.mjs";
import { clearHistoryCache } from "../lib/trend.js";
import { clearEnergyCache } from "../lib/energy.js";

beforeEach(() => {
  document.body.innerHTML = "";
  clearHistoryCache();
  clearEnergyCache();
});

function mount(ctx) {
  const el = power.render(ctx);
  document.body.appendChild(el);
  return el;
}
const tick = () => new Promise((r) => setTimeout(r, 10));

test("the shell's power entry is this page", () => {
  assert.equal(pages.power, power);
});

test("every meter by area then device, its value; the area names from the pocket, HA, or none", () => {
  const el = mount(ctxOf({ hass: powerHass() }));
  assert.equal(text(el.querySelector(".top b")), "Power");
  assert.deepEqual(texts(el, ".area .sec"), ["Living room", "Bedroom", "Office", "Utility room", "No area"]);
  const office = el.querySelector('.area[data-area="office"]');
  assert.deepEqual(texts(office, ".dev"), ["Desk meter", "Lamp plug"]);
  assert.deepEqual(texts(office, ".row .nm"), ["Channel 1", "Channel 2", "Total", "Power"]);
  const tv = el.querySelector('[data-entity="sensor.tv_plug_power"]');
  assert.equal(text(tv.querySelector(".num")), "64.5 W");
  assert.equal(text(el.querySelector('[data-entity="sensor.garage_power"] .num')), "—");
  assert.ok(el.querySelector(".empty").hidden);
});

test("Now: the sum of the meters it counts, in kW above 1 000 W, and how many; Today hidden without energy prefs", () => {
  const el = mount(ctxOf({ hass: powerHass() }));
  const now = el.querySelector('[data-square="now"]');
  assert.ok(!now.hidden);
  assert.equal(text(now.querySelector(".head")), "Now");
  assert.equal(text(now.querySelector(".num")), "2.28 kW");
  assert.equal(text(now.querySelector(".lab")), "4 meters");
  assert.ok(el.querySelector('[data-square="today"]').hidden);
  assert.equal(power.wattsText({ lang: "en", t: ctxOf().t }, 812), "812 W");
  assert.equal(power.wattsText({ lang: "en", t: ctxOf().t }, 12500), "12.5 kW");
});

test("a row opens its trend sheet: the meter's name and its area", () => {
  const ctx = ctxOf({ hass: powerHass() });
  const el = mount(ctx);
  el.querySelector('[data-entity="sensor.tv_plug_power"]').click();
  assert.deepEqual(ctx.sheets.at(-1), { kind: "trend", entity: "sensor.tv_plug_power", title: "Power", subtitle: "Living room", digits: 1 });
  el.querySelector('[data-entity="sensor.mains_voltage"]').click();
  assert.equal(ctx.sheets.at(-1).subtitle, "Utility room");
});

test("Now opens the meters sheet", () => {
  const ctx = ctxOf({ hass: powerHass() });
  const el = mount(ctx);
  el.querySelector('[data-square="now"]').click();
  assert.deepEqual(ctx.sheets.at(-1), { kind: "power", title: "Now" });
});

test("the meters sheet lists what Now adds up, each opening its trend on top", () => {
  const ctx = ctxOf({ hass: powerHass() });
  const sheet = power.powerSheet.render(ctx, power.powerSpec(ctx));
  document.body.appendChild(sheet);
  assert.equal(text(sheet.querySelector(".dtitle span")), "2.28 kW");
  assert.deepEqual(texts(sheet, ".drow .r"), ["TV plug", "Heater power", "Desk meter", "Mains meter"]);
  assert.match(text(sheet.querySelector(".rule")), /one per device/);
  const opened = [];
  ctx.openSheet = (spec, options) => { opened.push([spec.entity, options]); return true; };
  sheet.querySelector('[data-entity="sensor.desk_meter_total"]').click();
  assert.deepEqual(opened, [["sensor.desk_meter_total", { stack: true }]]);
});

test("trend arrows from the last hour, none for energy counters", async () => {
  const ctx = ctxOf({ hass: powerHass() });
  const asked = [];
  ctx.raw.callWS = (msg) => {
    if (msg.type !== "history/history_during_period") return Promise.reject(new Error("no"));
    const id = msg.entity_ids[0];
    asked.push(id);
    const start = Date.parse(msg.start_time) / 1000;
    return Promise.resolve({ [id]: [{ s: "10", lu: start }, { s: "100", lu: start + 1800 }] });
  };
  const el = mount(ctx);
  await tick();
  power.update(el, ctx);
  assert.ok(!asked.includes("sensor.tv_plug_energy"));
  const arrow = el.querySelector('[data-entity="sensor.tv_plug_power"] .arrow');
  assert.ok(!arrow.hidden);
  assert.equal(arrow.textContent, "↑");
  assert.ok(el.querySelector('[data-entity="sensor.tv_plug_energy"] .arrow').hidden);
});

test("Today from the Energy dashboard's prefs: today's kWh, from the grid, opening the import's trend", async () => {
  const hass = powerHass({ "sensor.grid_import": st(1234.5, { unit_of_measurement: "kWh", state_class: "total_increasing" }) });
  hass.callWS = async (msg) => {
    if (msg.type === "energy/get_prefs") return { energy_sources: [{ type: "grid", flow_from: [{ stat_energy_from: "sensor.grid_import" }] }] };
    if (msg.type === "recorder/statistics_during_period") return { "sensor.grid_import": [{ change: 6.4 }] };
    throw new Error("unknown");
  };
  const ctx = ctxOf({ hass });
  const el = mount(ctx);
  await tick();
  power.update(el, ctx);
  const today = el.querySelector('[data-square="today"]');
  assert.ok(!today.hidden);
  assert.equal(text(today.querySelector(".num")), "6.40 kWh");
  assert.equal(text(today.querySelector(".lab")), "From the grid");
  today.click();
  assert.equal(ctx.sheets.at(-1).entity, "sensor.grid_import");
  assert.equal(ctx.sheets.at(-1).title, "Today");
});

test("no meters: the empty line, no squares", () => {
  const el = mount(ctxOf({ hass: hassOf(baseStates()) }));
  assert.ok(!el.querySelector(".empty").hidden);
  assert.match(text(el.querySelector(".empty")), /No power, energy, current or voltage sensors/);
  assert.ok(el.querySelector('[data-square="now"]').hidden);
  assert.equal(el.querySelectorAll(".row").length, 0);
});

test("update() patches values in place; the list is rebuilt only when the meters change", () => {
  const ctx = ctxOf({ hass: powerHass() });
  const el = mount(ctx);
  const row = el.querySelector('[data-entity="sensor.tv_plug_power"]');
  ctx.hass = powerHass({ "sensor.tv_plug_power": st(70, { device_class: "power", unit_of_measurement: "W", friendly_name: "TV plug Power" }) });
  power.update(el, ctx);
  assert.equal(el.querySelector('[data-entity="sensor.tv_plug_power"]'), row, "the same row");
  assert.equal(text(row.querySelector(".num")), "70 W");
  const hass = powerHass();
  delete hass.entities["sensor.heater_power"];
  ctx.hass = hass;
  power.update(el, ctx);
  assert.equal(el.querySelector('[data-entity="sensor.heater_power"]'), null);
});

test("words in Polish and German", () => {
  for (const [lang, title, none] of [["pl", "Prąd", "Bez obszaru"], ["de", "Strom", "Kein Bereich"]]) {
    const el = mount(ctxOf({ hass: powerHass(), lang }));
    assert.equal(text(el.querySelector(".top b")), title);
    assert.ok(texts(el, ".area .sec").includes(none));
  }
});
