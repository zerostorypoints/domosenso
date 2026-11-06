import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import { quickOf, itemOf, candidatesOf, nameOf, DOMAINS } from "./quick.js";
import { renderQuickSettings } from "./quick-settings.js";
import { withDefaults } from "./settings.js";
import { config, baseStates, st, hassOf, ctxOf, text } from "../testing/demo-home.mjs";
import * as home from "../pages/home-page.js";

const cfg = { ...config, rooms: config.rooms.map((r) => ({ type: "inside", ...r })) };
const states = () => ({ ...baseStates(), "scene.evening": st("2026-11-06T20:00:00"), "script.goodnight": st("off"),
  "switch.fountain": st("on"), "button.doorbell": st("unknown"), "sensor.ignored": st(1) });
const hass = () => ({ ...hassOf(states()), entities: { "script.hidden": { entity_id: "script.hidden", hidden: true } } });

beforeEach(() => { document.body.innerHTML = ""; });

test("the table declares each domain's control once", () => {
  assert.deepEqual(Object.keys(DOMAINS), ["light", "switch", "fan", "input_boolean", "scene", "script", "button"]);
  assert.equal(DOMAINS.scene.service, "turn_on");
  assert.equal(DOMAINS.button.service, "press");
});

test("the list: the person's own, else the home's default, else each area's lights and All off", () => {
  const h = hass();
  assert.deepEqual(quickOf({}, cfg, h), { ids: ["area:living_room", "area:office", "all_off"], source: "default" });
  assert.deepEqual(quickOf({}, { ...cfg, quick: ["scene.evening", "all_off"] }, h), { ids: ["scene.evening", "all_off"], source: "inputs" });
  assert.deepEqual(quickOf({ quick: ["switch.fountain", "scene.gone", "area:bedroom"] }, cfg, h),
    { ids: ["switch.fountain"], source: "person" }, "a removed entity and an area without lights are left out");
  assert.deepEqual(quickOf({ quick: [] }, cfg, h), { ids: [], source: "person" }, "an empty list is a choice");
});

test("items resolve to their control; candidates by group, without the list's, hidden ones left out", () => {
  const h = hass();
  assert.deepEqual(itemOf("area:living_room", cfg, h).entities, ["light.living_room"]);
  assert.equal(itemOf("switch.fountain", cfg, h).control, "toggle");
  assert.deepEqual([itemOf("button.doorbell", cfg, h).control, itemOf("button.doorbell", cfg, h).service], ["run", "press"]);
  assert.equal(itemOf("sensor.ignored", cfg, h), null);
  const groups = candidatesOf(cfg, { ...h, states: { ...h.states, "script.hidden": st("off") } }, ["area:living_room", "scene.evening"]);
  const by = Object.fromEntries(groups.map((g) => [g.group, g.ids]));
  assert.deepEqual(groups.map((g) => g.group), ["areas", "lights", "scenes", "scripts", "switches", "buttons"]);
  assert.deepEqual(by.areas, ["area:office"]);
  assert.deepEqual(by.lights.slice(0, 2), ["all_off", "light.living_room"], "All off first, then every light");
  assert.ok(!by.scenes.includes("scene.evening"), "already in the list");
  assert.deepEqual([by.scripts, by.switches, by.buttons], [["script.goodnight"], ["switch.fountain"], ["button.doorbell"]],
    "the hidden script is not offered");
  assert.equal(nameOf("area:office", cfg, h, (k) => k), "Office");
});

test("a person's list is kept in their settings; anything else is dropped", () => {
  assert.deepEqual(withDefaults({ quick: ["all_off"] }).quick, ["all_off"]);
  assert.equal(withDefaults({ quick: "all_off" }).quick, undefined);
});

test("Home: a tile per item in order; a scene runs, a switch toggles, both through the optimistic store", () => {
  const ctx = ctxOf({ hass: hass(), cfg });
  ctx.settings = { quick: ["scene.evening", "switch.fountain", "area:office", "all_off"] };
  const el = home.render(ctx);
  document.body.append(el);
  const tiles = [...el.querySelectorAll(".quick > *")];
  assert.deepEqual(tiles.map((t) => t.dataset.id ?? t.tagName.toLowerCase()), ["scene.evening", "switch.fountain", "pocket-light-tile", "all_off"]);
  assert.equal(text(tiles[1].querySelector(".t2")), "On");
  tiles[0].click();
  tiles[1].click();
  assert.deepEqual(ctx.raw.calls.slice(-2), [["scene", "turn_on", { entity_id: "scene.evening" }], ["switch", "toggle", { entity_id: "switch.fountain" }]]);
  el.querySelector(".quick-edit").click();
  assert.deepEqual(ctx.routes, ["#/settings/quick"]);
  ctx.settings = { quick: [] };
  home.update(el, ctx);
  assert.equal(el.querySelector(".quick-sec").hidden, true, "an empty list: no Quick section");
});

test("Settings → Quick actions: rows with up, down, remove; Add; Use the home's default", () => {
  const ctx = ctxOf({ hass: hass(), cfg });
  let settings = { quick: ["scene.evening", "all_off"] };
  const saves = [];
  const el = renderQuickSettings(ctx, { settings: () => settings, save: (patch) => { saves.push(patch); settings = { ...settings, ...patch }; } });
  document.body.append(el);
  const rows = [...el.querySelectorAll(".row.qa")];
  assert.deepEqual(rows.map((r) => text(r.querySelector(".name"))), ["scene.evening", "All lights off"]);
  assert.ok(rows[0].querySelector(".up").disabled && rows[1].querySelector(".down").disabled);
  rows[0].querySelector(".down").click();
  rows[1].querySelector(".remove").click();
  assert.deepEqual(saves, [{ quick: ["all_off", "scene.evening"] }, { quick: ["scene.evening"] }]);
  assert.equal(text(el.querySelector(".source")), "Your own list · 2");
  assert.match(text(el.querySelector(".about")), /^What Home shows under Quick/);
  assert.equal(el.querySelector(".reset").hidden, false);
  el.querySelector(".reset").click();
  assert.deepEqual(saves.at(-1), { quick: undefined });
  el.querySelector(".add").click();
  assert.deepEqual(ctx.routes, ["#/settings/quick/add"]);
});

test("the Add page: what is not in the list yet, by group; a tap adds it at the end and goes back", () => {
  const ctx = ctxOf({ hass: hass(), cfg });
  const backs = [];
  ctx.back = (up) => backs.push(up);
  let settings = { quick: ["all_off"] };
  const saves = [];
  const el = renderQuickSettings(ctx, { add: true, settings: () => settings, save: (patch) => { saves.push(patch); } });
  document.body.append(el);
  assert.deepEqual([...el.querySelectorAll(".gh")].map(text), ["Areas' lights", "Lights", "Scenes", "Scripts", "Switches", "Buttons"]);
  el.querySelector('button.row[data-id="script.goodnight"]').click();
  assert.deepEqual(saves, [{ quick: ["all_off", "script.goodnight"] }]);
  assert.deepEqual(backs, ["#/settings/quick"]);
});
