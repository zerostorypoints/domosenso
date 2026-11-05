// The Safety page (pages/safety-page.js) and its part of Home's attention row.
import { test } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as page from "./safety-page.js";
import * as home from "./home-page.js";
import { config, st, baseStates, hassOf, ctxOf, text, texts } from "../testing/demo-home.mjs";
import { ARM_MS } from "../lib/confirm.js";

function safetyHass(extra = {}) {
  return hassOf({ ...baseStates(),
    "binary_sensor.kitchen_smoke": st("off", { friendly_name: "Kitchen smoke", device_class: "smoke" }),
    "binary_sensor.hall_co": st("unavailable", { friendly_name: "Hall CO", device_class: "carbon_monoxide" }),
    "binary_sensor.front_door": st("on", { friendly_name: "Front door", device_class: "door" }),
    "lock.front_door": st("locked", { friendly_name: "Front door lock" }),
    "lock.garden_gate": st("unlocked", { friendly_name: "Garden gate" }),
    "cover.bedroom_blind": st("open", { friendly_name: "Bedroom blind", supported_features: 3 }),
    "siren.hall": st("off", { friendly_name: "Hall siren", supported_features: 1 | 2 | 16 }),
    "person.alex": st("home", { friendly_name: "Alex" }),
    "person.sam": st("not_home", { friendly_name: "Sam" }),
    ...extra });
}
const mount = (ctx) => { const el = page.render(ctx); document.body.append(el); return el; };
const row = (el, id) => el.querySelector(`.row[data-entity="${id}"]`);

test("the answer, then a section per kind the home has, each row its state", () => {
  const ctx = ctxOf({ hass: safetyHass() });
  const el = mount(ctx);
  assert.equal(text(el.querySelector(".top b")), "Safety");
  assert.equal(text(el.querySelector(".answer span")), "Front door open · Garden gate unlocked · Bedroom blind open");
  assert.ok(el.querySelector(".answer").classList.contains("issues"));
  assert.deepEqual(texts(el, ".sec:not([hidden]) h3"), ["Alarms", "Doors and windows", "Locks", "Covers", "Siren", "Who is home"]);
  assert.equal(text(row(el, "binary_sensor.kitchen_smoke").querySelector(".v")), "Clear");
  assert.equal(text(row(el, "binary_sensor.hall_co").querySelector(".v")), "Not reporting", "a silent detector says so");
  assert.ok(row(el, "binary_sensor.hall_co").classList.contains("silent"));
  assert.equal(text(row(el, "person.sam").querySelector(".v")), "Away");
  el.remove();
});

test("unlock takes a second tap; lock acts at once", async () => {
  const ctx = ctxOf({ hass: safetyHass() });
  const el = mount(ctx);
  const unlock = row(el, "lock.front_door").querySelector(".act");
  assert.equal(text(unlock), "Unlock");
  unlock.click();
  assert.equal(text(unlock), "Tap again to unlock");
  assert.equal(ctx.raw.calls.filter((c) => c[0] === "lock").length, 0, "nothing sent at the first tap");
  unlock.click();
  assert.deepEqual(ctx.raw.calls.at(-1), ["lock", "unlock", { entity_id: "lock.front_door" }]);
  const lock = row(el, "lock.garden_gate").querySelector(".act");
  assert.equal(text(lock), "Lock");
  lock.click();
  assert.deepEqual(ctx.raw.calls.at(-1), ["lock", "lock", { entity_id: "lock.garden_gate" }]);
  el.remove();
});

test("an armed button goes back after a while without the second tap", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ctx = ctxOf({ hass: safetyHass() });
  const el = mount(ctx);
  const unlock = row(el, "lock.front_door").querySelector(".act");
  unlock.click();
  t.mock.timers.tick(ARM_MS + 1);
  assert.equal(text(unlock), "Unlock");
  assert.equal(unlock.hasAttribute("data-armed"), false);
  el.remove();
});

test("the siren: Test sounds it briefly after a second tap; Stop at once", () => {
  const ctx = ctxOf({ hass: safetyHass() });
  const el = mount(ctx);
  const test_ = row(el, "siren.hall").querySelector(".act");
  test_.click();
  test_.click();
  assert.deepEqual(ctx.raw.calls.at(-1), ["siren", "turn_on", { entity_id: "siren.hall", duration: 2 }]);
  el.remove();
  const on = ctxOf({ hass: safetyHass({ "siren.hall": st("on", { friendly_name: "Hall siren", supported_features: 3 }) }) });
  const el2 = mount(on);
  assert.match(text(el2.querySelector(".answer span")), /Hall siren is sounding/);
  const stop = row(el2, "siren.hall").querySelector(".act");
  assert.equal(text(stop), "Stop");
  stop.click();
  assert.deepEqual(on.raw.calls.at(-1), ["siren", "turn_off", { entity_id: "siren.hall" }]);
  el2.remove();
});

test("Close all closes the open covers after a second tap", () => {
  const ctx = ctxOf({ hass: safetyHass() });
  const el = mount(ctx);
  const all = el.querySelector('[data-act="close-all"]');
  assert.equal(all.hidden, false);
  all.click();
  assert.equal(text(all), "Tap again to close all");
  all.click();
  assert.deepEqual(ctx.raw.calls.at(-1), ["cover", "close_cover", { entity_id: "cover.bedroom_blind" }]);
  el.remove();
});

test("a quiet home: All quiet; a home without any of it: one line", () => {
  const quiet = mount(ctxOf({ hass: safetyHass({ "binary_sensor.front_door": st("off", { device_class: "door" }),
    "lock.garden_gate": st("locked"), "cover.bedroom_blind": st("closed", { supported_features: 3 }) }) }));
  assert.equal(text(quiet.querySelector(".answer span")), "All quiet");
  quiet.remove();
  const empty = mount(ctxOf({ hass: hassOf(baseStates()) }));
  assert.equal(empty.querySelector(".none").hidden, false);
  assert.match(text(empty.querySelector(".none")), /Nothing to watch here yet/);
  empty.remove();
});

test("Home: each safety issue is a red pill, first, that opens Safety", () => {
  const ctx = ctxOf({ hass: safetyHass() });
  const el = home.render(ctx);
  document.body.append(el);
  const pills = [...el.querySelectorAll(".pill")];
  assert.equal(text(pills[0]), "Front door open");
  assert.ok(pills[0].querySelector(".dot").classList.contains("poor"));
  pills[0].click();
  assert.deepEqual(ctx.routes.at(-1), "#/safety");
  el.remove();
});
