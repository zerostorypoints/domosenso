import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as plants from "./plants-page.js";
import { pages } from "./index.js";
import { ctxOf, hassOf, baseStates, plantsHass, st, text, texts } from "../testing/demo-home.mjs";

beforeEach(() => { document.body.innerHTML = ""; });

function mount(ctx) {
  const el = plants.render(ctx);
  document.body.appendChild(el);
  return el;
}
const card = (el, id) => el.querySelector(`[data-plant="${id}"]`);

test("the shell's plants entry is this page", () => {
  assert.equal(pages.plants, plants);
});

test("a home with many plants: by area, worst first, how many need something", () => {
  const el = mount(ctxOf({ hass: plantsHass() }));
  assert.equal(text(el.querySelector(".top b")), "Plants");
  assert.equal(text(el.querySelector(".sum")), "5 plants need something");
  assert.deepEqual(texts(el, ".area .sec"), ["Bedroom", "Living room", "Office", "Kitchen", "No area"]);
  assert.deepEqual([...el.querySelectorAll(".plant")].map((c) => c.dataset.plant), ["plant.fern", "plant.cactus",
    "plant.palm", "plant.yucca", "plant.ivy", "plant.orchid", "plant.herbs", "plant.bonsai", "plant.new_pot"]);
  assert.ok(el.querySelector(".empty").hidden);
});

test("why a plant needs attention, in plain words and its tone", () => {
  const el = mount(ctxOf({ hass: plantsHass() }));
  const why = (id) => card(el, id).querySelector(".why");
  assert.equal(text(why("plant.fern")), "Thirsty");
  assert.ok(why("plant.fern").classList.contains("lv-poor"));
  assert.ok(card(el, "plant.fern").classList.contains("need"));
  assert.equal(text(why("plant.cactus")), "Too wet · Cold · Needs fertiliser");
  assert.equal(text(why("plant.palm")), "Needs light");
  assert.equal(text(why("plant.orchid")), "Needs light · Warm");
  assert.equal(text(why("plant.ivy")), "Low battery");
  assert.equal(text(why("plant.herbs")), "Fine");
  assert.ok(why("plant.herbs").classList.contains("lv-good"));
  assert.ok(!card(el, "plant.herbs").classList.contains("need"));
  assert.equal(text(why("plant.new_pot")), "No reading");
});

test("readings: equal cells with label and value in their tone; a sensor's reading opens its trend", () => {
  const ctx = ctxOf({ hass: plantsHass() });
  const el = mount(ctx);
  const fern = card(el, "plant.fern");
  assert.deepEqual(texts(fern, ".rd .l"), ["Moisture", "Fertiliser", "Light", "Temperature", "Battery"]);
  assert.deepEqual(texts(fern, ".rd .v"), ["9 %", "500 µS/cm", "300 lx", "21.0°", "80 %"]);
  assert.ok(fern.querySelector('[data-reading="moisture"] .v').classList.contains("lv-poor"));
  fern.querySelector('[data-reading="moisture"]').click();
  assert.deepEqual(ctx.sheets.at(-1), { kind: "trend", entity: "sensor.fern_moisture", title: "Moisture", subtitle: "Fern", digits: 0 });
  const cactus = card(el, "plant.cactus");
  assert.equal(cactus.querySelector('[data-reading="moisture"]').tagName, "DIV", "an attribute only: no trend to open");
  assert.ok(cactus.querySelector('[data-reading="temperature"] .v').classList.contains("lv-cold"));
});

test("a home without plants: the empty state, no summary", () => {
  const el = mount(ctxOf({ hass: hassOf(baseStates()) }));
  assert.ok(!el.querySelector(".empty").hidden);
  assert.match(text(el.querySelector(".empty")), /No plants in Home Assistant yet/);
  assert.ok(el.querySelector(".sum").hidden);
});

test("all fine: the summary says so", () => {
  const states = { ...baseStates(), "plant.a": st("ok", { friendly_name: "A", moisture: 30 }) };
  const el = mount(ctxOf({ hass: hassOf(states) }));
  assert.equal(text(el.querySelector(".sum")), "All plants are fine");
});

test("update() patches in place: a watered plant moves up only when the order changes", () => {
  const ctx = ctxOf({ hass: plantsHass() });
  const el = mount(ctx);
  const fern = card(el, "plant.fern");
  ctx.hass = plantsHass({ "sensor.fern_moisture": st(10, { unit_of_measurement: "%" }) });
  plants.update(el, ctx);
  assert.equal(card(el, "plant.fern"), fern, "the same card");
  assert.equal(text(fern.querySelector('[data-reading="moisture"] .v')), "10 %");
  const watered = plantsHass({ "sensor.fern_moisture": st(45, { unit_of_measurement: "%" }) });
  watered.states["plant.fern"].attributes.problem = "none";
  ctx.hass = watered;
  plants.update(el, ctx);
  assert.equal(text(card(el, "plant.fern").querySelector(".why")), "Fine");
  assert.equal(el.querySelector(".plant").dataset.plant, "plant.cactus", "the worst first again");
});

test("words in Polish and German", () => {
  for (const [lang, title, thirsty] of [["pl", "Rośliny", "Chce pić"], ["de", "Pflanzen", "Durstig"]]) {
    const el = mount(ctxOf({ hass: plantsHass(), lang }));
    assert.equal(text(el.querySelector(".top b")), title);
    assert.equal(text(card(el, "plant.fern").querySelector(".why")), thirsty);
  }
});
