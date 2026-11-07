// Home's Sections (lib/sections.js) and their tiles on the Home page.
import { test } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import { sectionsOf } from "./sections.js";
import * as home from "../pages/home-page.js";
import { config, st, baseStates, hassOf, ctxOf, powerHass, plantsHass, text } from "../testing/demo-home.mjs";

const pick = (list, page) => list.find((s) => s.page === page);

test("a tile per page this home has, in the bar's order; none for what it lacks", () => {
  const list = sectionsOf(ctxOf());
  assert.deepEqual(list.map((s) => s.page), ["areas", "controls", "climate", "media", "scenes"], "no power sensor, no plant, no floorplan component, no system entities");
  assert.deepEqual(sectionsOf(ctxOf({ cfg: { ...config, floorplan: true } })).map((s) => s.page).at(-1), "floorplan");
  assert.equal(pick(list, "areas").route, "#/areas");
  assert.equal(pick(list, "areas").head, "4 areas");
  assert.match(pick(list, "areas").status, /light/);
});

test("Climate: all in range, or how many need a look, where, and the worst tone", () => {
  const fine = pick(sectionsOf(ctxOf()), "climate");
  assert.equal(fine.head, "All in range");
  assert.equal(fine.tone, null);
  const ctx = ctxOf({ hass: hassOf({ ...baseStates(), "sensor.living_room_co2": st(1300), "sensor.bedroom_temperature": st(22.5) }) });
  const bad = pick(sectionsOf(ctx), "climate");
  assert.equal(bad.head, "2 need a look");
  assert.equal(bad.status, "Living room, Bedroom");
  assert.equal(bad.tone, "poor");
  const cold = { ...config, outside: { temperature: "sensor.out_t" },
    thresholds: { ...config.thresholds, outside: { temp_low: "input_number.lr_temp_low", temp_high: "input_number.lr_temp_high" } } };
  const winterStates = hassOf({ ...baseStates(), "sensor.out_t": st(2) });
  const winter = pick(sectionsOf(ctxOf({ cfg: cold, hass: winterStates })), "climate");
  assert.equal(winter.head, "1 needs a look", "a cold outside area is checked like any other");
  const off = { ...cold, outside: { ...cold.outside, checked: false } };
  assert.equal(pick(sectionsOf(ctxOf({ cfg: off, hass: winterStates })), "climate").head, "All in range",
    "switched out of the checks by the home: not counted");
});

test("Media: what plays and on which player; nothing playing otherwise", () => {
  const on = pick(sectionsOf(ctxOf()), "media");
  assert.equal(on.head, "Devil Like Me");
  const ctx = ctxOf({ hass: hassOf({ ...baseStates(), "media_player.living_room_speaker": st("idle") }) });
  assert.equal(pick(sectionsOf(ctx), "media").head, "Nothing playing");
});

test("Power: power now; a meter that reads nothing makes it worth a look", () => {
  const power = pick(sectionsOf(ctxOf({ hass: powerHass() })), "power");
  assert.ok(power.head && power.head !== "—");
  assert.equal(power.tone, "fair", "the demo's garage meter is unavailable");
  assert.match(power.status, /not reading/);
});

test("Plants: how many need care and the worst; poor for a thirsty plant", () => {
  const plants = pick(sectionsOf(ctxOf({ hass: plantsHass() })), "plants");
  assert.match(plants.head, /need/);
  assert.match(plants.status, /Thirsty/);
  assert.equal(plants.tone, "poor");
});

test("on Home: under the readings, each tile opens its page, a tone colours its dot and border", () => {
  const ctx = ctxOf({ hass: hassOf({ ...baseStates(), "sensor.living_room_co2": st(1300) }), routeId: "systems" });
  const el = home.render(ctx);
  document.body.append(el);
  const host = el.querySelector(".sections");
  assert.equal(host.previousElementSibling.className, "chips");
  assert.equal(el.querySelector(".chips").hidden, true, "Systems shows the tiles, Overview the widgets");
  assert.equal(el.querySelector(".quick-sec").hidden, true);
  const tiles = [...host.querySelectorAll(".sect")];
  assert.deepEqual(tiles.map((t) => t.dataset.page), ["areas", "controls", "climate", "media", "scenes"]);
  const climate = tiles[2];
  assert.equal(text(climate.querySelector(".n")), "Climate");
  assert.equal(climate.className, "sect poor");
  assert.equal(climate.querySelector(".dot").hidden, false);
  assert.equal(tiles[0].querySelector(".dot").hidden, true);
  climate.click();
  assert.deepEqual(ctx.routes, ["#/climate"]);
  ctx.hass = hassOf(baseStates());
  home.update(el, ctx);
  assert.equal(climate.className, "sect", "back in range: no tone, the same tile");
  assert.equal(host.querySelector(".sect[data-page=climate]"), climate);
  el.remove();
});

test("every Overview widget opens a sheet: power the meters behind it, plants every plant", async () => {
  const { plants } = await import("./detail-sheets.js");
  const ctx = ctxOf({ hass: plantsHass() });
  const pctx = ctxOf({ hass: powerHass() });
  const el = home.render(pctx);
  el.querySelector('.chip[data-chip="power"]').click();
  assert.equal(pctx.sheets.at(-1).kind, "power");
  assert.deepEqual(pctx.routes, [], "no page change");
  const plantsHome = home.render(ctx);
  plantsHome.querySelector('.chip[data-chip="plants"]').click();
  assert.equal(ctx.sheets.at(-1).kind, "plants");
  const sheet = plants.render(ctx, ctx.sheets.at(-1));
  const rows = [...sheet.querySelectorAll(".drow")];
  assert.ok(rows.length > 0);
  assert.match(text(rows[0]), /Thirsty/, "the worst first, with what it needs");
  rows[0].click();
  assert.equal(ctx.sheets.at(-1).kind, "trend", "a row opens its moisture's trend");
});
