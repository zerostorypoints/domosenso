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
  assert.deepEqual(list.map((s) => s.page), ["areas", "climate", "media"], "no power sensor, no plant, no floorplan component");
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
  const winter = pick(sectionsOf(ctxOf({ cfg: cold, hass: hassOf({ ...baseStates(), "sensor.out_t": st(2) }) })), "climate");
  assert.equal(winter.head, "All in range", "a cold Outside is weather, as for the attention pills");
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
  const ctx = ctxOf({ hass: hassOf({ ...baseStates(), "sensor.living_room_co2": st(1300) }) });
  const el = home.render(ctx);
  document.body.append(el);
  const host = el.querySelector(".sections");
  assert.equal(host.previousElementSibling.className, "chips");
  const tiles = [...host.querySelectorAll(".sect")];
  assert.deepEqual(tiles.map((t) => t.dataset.page), ["areas", "climate", "media"]);
  const climate = tiles[1];
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
