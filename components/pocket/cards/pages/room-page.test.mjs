import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as room from "./room-page.js";
import { pages } from "./index.js";
import { config, st, baseStates, hassOf, ctxOf, text, texts, pointer } from "../testing/demo-home.mjs";

function mount(ctx = ctxOf({ routeId: "living_room" })) {
  const el = room.render(ctx);
  document.body.appendChild(el);
  return el;
}

const swipe = (el, [x0, y0], [x1, y1], target = el) => {
  pointer(target, "pointerdown", x0, y0);
  pointer(target, "pointermove", (x0 + x1) / 2, (y0 + y1) / 2);
  pointer(target, "pointermove", x1, y1);
  pointer(target, "pointerup", x1, y1);
};

beforeEach(() => { document.body.innerHTML = ""; });

test("the shell's room entry is this page", () => {
  assert.equal(pages.room, room);
});

test("header: the room's name, back to Rooms, position dots", () => {
  const ctx = ctxOf({ routeId: "bedroom" });
  const el = mount(ctx);
  assert.equal(text(el.querySelector(".top .name")), "Bedroom");
  const dots = el.querySelectorAll(".dots i");
  assert.equal(dots.length, 4);
  assert.ok(dots[1].classList.contains("a"));
  assert.equal(el.querySelector(".dots").getAttribute("aria-label"), "Room 2 of 4");
  el.querySelector(".top .back").click();
  assert.deepEqual(ctx.routes, ["#/rooms"]);
});

test("a swipe left goes to the next room, right to the previous", () => {
  const ctx = ctxOf({ routeId: "bedroom" });
  const el = mount(ctx);
  swipe(el, [300, 200], [200, 210]);
  swipe(el, [100, 200], [200, 195]);
  assert.deepEqual(ctx.routes, ["#/room/office", "#/room/living_room"]);
  assert.deepEqual(ctx.options, [{ replace: true }, { replace: true }], "swipes replace the history entry");
});

test("a vertical swipe, a short swipe or a diagonal one does nothing", () => {
  const ctx = ctxOf({ routeId: "bedroom" });
  const el = mount(ctx);
  swipe(el, [200, 300], [205, 150]);
  swipe(el, [200, 200], [160, 200]);
  swipe(el, [300, 200], [220, 270]);
  assert.deepEqual(ctx.routes, []);
});

test("first and last room: no wrap, the page stays", () => {
  const first = ctxOf({ routeId: "living_room" });
  swipe(mount(first), [100, 200], [250, 200]);
  const last = ctxOf({ routeId: "hall" });
  swipe(mount(last), [300, 200], [150, 200]);
  assert.deepEqual(first.routes, []);
  assert.deepEqual(last.routes, []);
});

test("a drag on a light tile is the tile's: no room change", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const tile = el.querySelector("pocket-light-tile");
  swipe(el, [300, 200], [150, 200], tile);
  assert.deepEqual(ctx.routes, []);
  const scenes = el.querySelector(".scenes");
  swipe(el, [300, 200], [150, 200], scenes.querySelector("button"));
  assert.deepEqual(ctx.routes, []);
});

test("the page leaves vertical scroll to the browser", () => {
  const el = mount();
  assert.match(el.querySelector("style").textContent, /\.room\s*\{[^}]*touch-action:\s*pan-y/);
});

test("climate and air squares: values in their level colour and a level text", () => {
  const el = mount();
  const climate = el.querySelector(".sq.climate");
  const air = el.querySelector(".sq.air");
  assert.equal(text(climate.querySelector(".big")), "21.7°");
  assert.ok(climate.querySelector(".big").classList.contains("lv-good"));
  assert.equal(text(climate.querySelector(".lab")), "44 % · In range");
  assert.equal(text(air.querySelector(".big")), "81");
  assert.ok(air.querySelector(".big").classList.contains("lv-good"));
  assert.equal(text(air.querySelector(".lab")), "CO₂ 768 · Good");
});

test("fair and poor: the worst reading's text, each value its own colour", () => {
  const states = { ...baseStates(), "sensor.living_room_temperature": st(19.2),
    "sensor.living_room_air_quality_score": st(70), "sensor.living_room_co2": st(1300) };
  const el = mount(ctxOf({ hass: hassOf(states), routeId: "living_room" }));
  const climate = el.querySelector(".sq.climate");
  const air = el.querySelector(".sq.air");
  assert.ok(climate.querySelector(".big").classList.contains("lv-poor"));
  assert.ok(climate.querySelector(".lab .v").classList.contains("lv-good"));
  assert.equal(text(climate.querySelector(".lab")), "44 % · Too cold");
  assert.ok(air.querySelector(".big").classList.contains("lv-fair"));
  assert.ok(air.querySelector(".lab .v").classList.contains("lv-poor"));
  assert.equal(text(air.querySelector(".lab")), "CO₂ 1300 · CO₂ high");
});

test("level colours are the theme's tokens", () => {
  const css = mount().querySelector("style").textContent;
  assert.match(css, /\.lv-good\s*\{\s*color:\s*var\(--ok\)/);
  assert.match(css, /\.lv-fair\s*\{\s*color:\s*var\(--warn\)/);
  assert.match(css, /\.lv-poor\s*\{\s*color:\s*var\(--bad\)/);
});

test("no thresholds: values without a level, no level text", () => {
  const el = mount(ctxOf({ routeId: "living_room", cfg: { ...config, thresholds: undefined } }));
  const climate = el.querySelector(".sq.climate");
  assert.equal(climate.querySelector(".big").className, "big");
  assert.equal(text(climate.querySelector(".lab")), "44 %");
});

test("a room without climate or air has no squares", () => {
  const el = mount(ctxOf({ routeId: "office" }));
  assert.equal(el.querySelector(".sq.climate"), null);
  assert.equal(el.querySelector(".sq.air"), null);
});

test("lights: the group as one tile, N lights opens a tile per member", () => {
  const el = mount();
  const group = el.querySelector(".group pocket-light-tile");
  assert.deepEqual(group.config, { name: "All", entities: ["light.living_room"] });
  const more = el.querySelector(".members-toggle");
  assert.equal(text(more), "2 lights ›");
  assert.equal(more.getAttribute("aria-expanded"), "false");
  assert.ok(el.querySelector(".members").hidden);
  more.click();
  assert.equal(more.getAttribute("aria-expanded"), "true");
  assert.ok(!el.querySelector(".members").hidden);
  const tiles = [...el.querySelectorAll(".members pocket-light-tile")];
  // The room's name is dropped from a member's name.
  assert.deepEqual(tiles.map((t) => t.config), [
    { name: "Ceiling", entities: ["light.living_room_ceiling"] },
    { name: "Reading lamp", entities: ["light.living_room_lamp"] }]);
});

test("a single light without members: one tile, no N lights", () => {
  const el = mount(ctxOf({ routeId: "office" }));
  assert.equal(el.querySelectorAll("pocket-light-tile").length, 1);
  assert.ok(el.querySelector(".members-toggle").hidden);
});

test("scenes: a sideways row of buttons calling scene.turn_on", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const buttons = [...el.querySelectorAll(".scenes button")];
  assert.deepEqual(buttons.map(text), ["Relax", "Bright"]);
  buttons[1].click();
  assert.deepEqual(ctx.hass.calls, [["scene", "turn_on", { entity_id: "scene.living_room_bright" }]]);
});

test("a failed scene or play/pause fires pocket-error", async () => {
  const ctx = ctxOf({ routeId: "living_room" });
  ctx.hass.callService = () => Promise.reject(new Error("no"));
  const el = mount(ctx);
  const errors = [];
  el.addEventListener("pocket-error", (e) => errors.push(e.detail.key));
  el.querySelector(".scenes button").click();
  el.querySelector(".media .play").click();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(errors, ["card.pocket.error.scene", "card.pocket.error.media"]);
});

test("media row: art, title, artist, play/pause", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const row = el.querySelector(".media");
  assert.ok(!row.hidden);
  assert.equal(row.querySelector(".art img").getAttribute("src"), "/api/media_player_proxy/x");
  assert.equal(text(row.querySelector(".t1")), "Devil Like Me");
  assert.equal(text(row.querySelector(".t2")), "Rainbow Kitten Surprise");
  const play = row.querySelector(".play");
  assert.equal(play.getAttribute("aria-label"), "Pause");
  play.click();
  assert.deepEqual(ctx.hass.calls, [["media_player", "media_play_pause", { entity_id: "media_player.living_room_speaker" }]]);
});

test("section titles", () => {
  assert.deepEqual(texts(mount(), ".sec:not([hidden])"), ["Lights", "Music"]);
});

test("a room with nothing: its name and nothing to show here", () => {
  const el = mount(ctxOf({ routeId: "hall" }));
  assert.equal(text(el.querySelector(".top .name")), "Hall");
  assert.equal(text(el.querySelector(".empty")), "Nothing to show here");
  assert.equal(el.querySelectorAll(".sq, pocket-light-tile, .scenes button").length, 0);
  assert.ok(el.querySelector(".media").hidden);
  const pl = mount(ctxOf({ routeId: "hall", lang: "pl" }));
  assert.equal(text(pl.querySelector(".empty")), "Nic tu nie ma do pokazania");
});

test("a room with content has no empty text", () => {
  assert.equal(mount().querySelector(".empty"), null);
});

test("offline: scenes and play disabled, tiles offline, nothing sent", () => {
  const ctx = ctxOf({ routeId: "living_room", offline: true });
  const el = mount(ctx);
  el.querySelector(".scenes button").click();
  el.querySelector(".media .play").click();
  assert.ok(el.querySelector(".scenes button").disabled);
  assert.ok(el.querySelector(".media .play").disabled);
  assert.ok([...el.querySelectorAll("pocket-light-tile")].every((tile) => tile.offline));
  assert.deepEqual(ctx.hass.calls, []);
});

test("update patches in place and keeps the open member list", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  el.querySelector(".members-toggle").click();
  const tile = el.querySelector(".members pocket-light-tile");
  const big = el.querySelector(".sq.climate .big");
  const states = { ...baseStates(), "sensor.living_room_temperature": st(24.6) };
  room.update(el, { ...ctx, hass: hassOf(states) });
  assert.equal(el.querySelector(".sq.climate .big"), big);
  assert.equal(text(big), "24.6°");
  assert.ok(big.classList.contains("lv-poor"));
  assert.equal(el.querySelector(".members pocket-light-tile"), tile);
  assert.ok(!el.querySelector(".members").hidden);
});

test("the group's members change: the member tiles follow", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const states = baseStates();
  states["light.living_room"] = st("on", { brightness: 171, entity_id: ["light.living_room_ceiling"] });
  room.update(el, { ...ctx, hass: hassOf(states) });
  assert.equal(text(el.querySelector(".members-toggle")), "1 light ›");
  assert.equal(el.querySelectorAll(".members pocket-light-tile").length, 1);
});

test("the language follows ctx on update", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  room.update(el, ctxOf({ routeId: "living_room", lang: "de" }));
  assert.equal(text(el.querySelector(".sq.climate .lab")), "44 % · Im Bereich");
  assert.equal(text(el.querySelector(".members-toggle")), "2 Lampen ›");
});

test("an unavailable reading in a square: a muted dash without a level", () => {
  const states = { ...baseStates(), "sensor.living_room_humidity": st("unavailable"),
    "sensor.living_room_air_quality_score": st("unavailable") };
  const el = mount(ctxOf({ hass: hassOf(states), routeId: "living_room" }));
  const hum = el.querySelector(".sq.climate .lab .v");
  assert.equal(text(hum), "—");
  assert.equal(hum.className, "v muted");
  const score = el.querySelector(".sq.air .big");
  assert.equal(text(score), "—");
  assert.equal(score.className, "big muted");
  assert.match(el.querySelector("style").textContent, /\.sq \.muted\s*\{\s*opacity/);
});
