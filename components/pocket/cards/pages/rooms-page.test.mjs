import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as rooms from "./rooms-page.js";
import { pages } from "./index.js";
import { config, st, baseStates, hassOf, ctxOf, text, texts } from "../testing/demo-home.mjs";

function mount(ctx = ctxOf()) {
  const el = rooms.render(ctx);
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { document.body.innerHTML = ""; });

test("the shell's rooms entry is this page", () => {
  assert.equal(pages.rooms, rooms);
});

test("title and the number of rooms", () => {
  const el = mount();
  assert.equal(text(el.querySelector(".top b")), "Rooms");
  assert.equal(text(el.querySelector(".top .count")), "4 rooms");
  assert.equal(text(mount(ctxOf({ lang: "pl" })).querySelector(".top .count")), "4 pomieszczenia");
});

test("one square per room, in the home's order; a tap opens the room", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const squares = [...el.querySelectorAll(".grid .sq")];
  assert.deepEqual(squares.map((sq) => text(sq.querySelector(".name"))), ["Living room", "Bedroom", "Office", "Hall"]);
  squares[2].click();
  assert.deepEqual(ctx.routes, ["#/room/office"]);
});

test("key value: temperature, else lights on, else nothing; secondaries", () => {
  const el = mount();
  const [living, bedroom, office, hall] = [...el.querySelectorAll(".grid .sq")];
  assert.equal(text(living.querySelector(".big")), "21.7°");
  // The group's members count, not the group: one of two is on.
  assert.equal(text(living.querySelector(".lab")), "44 % · Air 81 · 1 on · ♪");
  assert.equal(text(bedroom.querySelector(".big")), "21.9°");
  assert.equal(text(bedroom.querySelector(".lab")), "44 %");
  assert.equal(text(office.querySelector(".big")), "All off");
  assert.equal(text(office.querySelector(".lab")), "");
  assert.ok(hall.querySelector(".big").hidden);
  assert.equal(text(hall.querySelector(".lab")), "");
});

test("a dot on the room with attention, coloured by its worst level", () => {
  const states = { ...baseStates(), "sensor.bedroom_temperature": st(23), "sensor.living_room_air_quality_score": st(70) };
  const el = mount(ctxOf({ hass: hassOf(states) }));
  const dots = [...el.querySelectorAll(".grid .sq")].map((sq) => sq.querySelector(".dot:not([hidden])"));
  assert.ok(dots[0].classList.contains("fair"));
  assert.ok(dots[1].classList.contains("poor"));
  assert.equal(dots[1].getAttribute("aria-label"), "Needs attention");
  assert.equal(dots[2], null);
  assert.equal(dots[3], null);
});

test("an unavailable temperature shows a dash", () => {
  const states = { ...baseStates(), "sensor.bedroom_temperature": st("unavailable") };
  const el = mount(ctxOf({ hass: hassOf(states) }));
  assert.equal(text(el.querySelectorAll(".grid .sq")[1].querySelector(".big")), "—");
});

test("update patches in place: same squares, new values and dots", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const first = el.querySelector(".grid .sq");
  const states = { ...baseStates(), "sensor.living_room_temperature": st(25.2), "light.office": st("on", { brightness: 255 }) };
  rooms.update(el, { ...ctx, hass: hassOf(states) });
  assert.equal(el.querySelector(".grid .sq"), first);
  assert.equal(text(first.querySelector(".big")), "25.2°");
  assert.ok(first.querySelector(".dot.poor:not([hidden])"));
  assert.equal(text(el.querySelectorAll(".grid .sq")[2].querySelector(".big")), "1 on");
});

test("the language follows ctx on update", () => {
  const el = mount();
  rooms.update(el, ctxOf({ lang: "de" }));
  assert.equal(text(el.querySelector(".top b")), "Räume");
  assert.match(texts(el, ".grid .sq .lab")[0], /Luft 81/);
});

test("a home without rooms: an empty grid, no error", () => {
  const el = mount(ctxOf({ cfg: { ...config, rooms: [] } }));
  assert.equal(el.querySelectorAll(".grid .sq").length, 0);
  assert.equal(text(el.querySelector(".top .count")), "0 rooms");
});

test("an unavailable humidity or air score: a muted dash on the line", () => {
  const states = { ...baseStates(), "sensor.living_room_humidity": st("unavailable"),
    "sensor.living_room_air_quality_score": st("unknown") };
  const el = mount(ctxOf({ hass: hassOf(states) }));
  const lab = el.querySelector(".grid .sq .lab");
  assert.equal(text(lab), "— · Air — · 1 on · ♪");
  assert.deepEqual([...lab.querySelectorAll(".muted")].map(text), ["—", "Air —"]);
});
