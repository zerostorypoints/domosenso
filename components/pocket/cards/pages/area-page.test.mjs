import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as room from "./area-page.js";
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
  assert.equal(pages.area, room);
});

test("header: the room's name, back to Areas, position dots", () => {
  const ctx = ctxOf({ routeId: "bedroom" });
  const el = mount(ctx);
  assert.equal(text(el.querySelector(".top .name")), "Bedroom");
  const dots = el.querySelectorAll(".dots i");
  assert.equal(dots.length, 4);
  assert.ok(dots[1].classList.contains("a"));
  assert.equal(el.querySelector(".dots").getAttribute("aria-label"), "Area 2 of 4");
  el.querySelector(".top .back").click();
  assert.deepEqual(ctx.routes, ["#/areas"]);
});

test("a swipe left goes to the next room, right to the previous", () => {
  const ctx = ctxOf({ routeId: "bedroom" });
  const el = mount(ctx);
  swipe(el, [300, 200], [200, 210]);
  swipe(el, [100, 200], [200, 195]);
  assert.deepEqual(ctx.routes, ["#/area/office", "#/area/living_room"]);
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

test("a swipe on a light tile's body changes the area and no light; its strip and the scene row keep theirs", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const tile = el.querySelector("pocket-light-tile");
  tile.shadowRoot.querySelector(".bar").getBoundingClientRect = () => ({ left: 0, width: 200 });
  swipe(el, [300, 200], [150, 200], tile.shadowRoot.querySelector(".t1"));
  assert.deepEqual(ctx.routes, ["#/area/bedroom"], "the body's sideways move is the page's");
  assert.deepEqual(ctx.raw.calls, [], "no light changed");
  swipe(el, [180, 200], [60, 200], tile.shadowRoot.querySelector(".bar"));
  assert.deepEqual(ctx.routes, ["#/area/bedroom"], "the strip's drag is the tile's");
  assert.deepEqual(ctx.raw.calls, [["light", "turn_on", { entity_id: "light.living_room", brightness_pct: 30 }]]);
  swipe(el, [300, 200], [150, 200], el.querySelector(".scenes button"));
  assert.deepEqual(ctx.routes, ["#/area/bedroom"], "the scene row scrolls");
});

test("swipes work in both directions on every area, the Outside included, with no wrap", () => {
  const cfg = outsideConfig();
  const ids = ["living_room", "bedroom", "office", "hall", "outside"];
  ids.forEach((id, i) => {
    const ctx = ctxOf({ cfg, routeId: id });
    const el = mount(ctx);
    swipe(el, [300, 200], [150, 230]);      // a thumb's arc: 150 wide, 30 tall
    swipe(el, [100, 200], [250, 180]);
    const want = [ids[i + 1], ids[i - 1]].filter(Boolean).map((next) => `#/area/${next}`);
    assert.deepEqual(ctx.routes, want, id);
  });
});

test("the page fills the screen above the bar: a swipe below short content is the page's", () => {
  const css = mount().querySelector("style").textContent;
  assert.match(css, /\.room \{[^}]*min-height: calc\(100vh - var\(--header-height, 56px\) - var\(--bar, 64px\) - 28px\)/);
  assert.match(css, /\.room \{[^}]*min-height: calc\(100dvh - var\(--header-height, 56px\)[^}]*var\(--safe, 0px\) - 28px\)/);
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

test("the group tile takes on/off from the group's state: off with a brightness is off", () => {
  const states = { ...baseStates(), "light.living_room": st("off", { brightness: 107,
    entity_id: ["light.living_room_ceiling", "light.living_room_lamp"] }) };
  const el = mount(ctxOf({ hass: hassOf(states), routeId: "living_room" }));
  const button = el.querySelector(".group pocket-light-tile").shadowRoot.querySelector(".tile");
  assert.ok(!button.classList.contains("on"), "unlit");
  assert.equal(button.querySelector(".t2").textContent, "Off");
  assert.equal(button.querySelector(".bar i").style.width, "0%");
});

test("climate and air squares fit side by side: a minmax(0, 1fr) grid, children min-width 0", () => {
  const css = mount().querySelector("style").textContent;
  assert.match(css, /\.squares\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.squares > \*\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.squares > :only-child\s*\{[^}]*grid-column:\s*1 \/ -1/);
  assert.match(css, /\.sq \.value\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.lab\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.big\s*\{[^}]*text-overflow:\s*ellipsis/);
});

test("every button of the room page is at least 44 x 44", () => {
  const css = mount().querySelector("style").textContent;
  for (const sel of [".back", ".members-toggle", ".scn"]) {
    const rule = css.match(new RegExp(`\\.room \\${sel}\\s*\\{([^}]*)\\}`))[1];
    assert.match(rule, /min-width:\s*44px/, sel);
    assert.match(rule, /min-height:\s*44px/, sel);
  }
  assert.match(css, /\.play\s*\{[^}]*width:\s*44px;\s*height:\s*44px/);
});

const outsideConfig = () => ({ ...config,
  outside: { temperature: "sensor.outside_temperature", humidity: "sensor.outside_humidity" },
  thresholds: { ...config.thresholds, outside: {
    temp_low: "input_number.out_temp_low", temp_high: "input_number.out_temp_high",
    humidity_low: "input_number.out_humidity_low", humidity_high: "input_number.out_humidity_high" } } });
const outsideStates = (temp, humidity) => ({ ...baseStates(),
  "sensor.outside_temperature": st(temp), "sensor.outside_humidity": st(humidity),
  "input_number.out_temp_low": st(20), "input_number.out_temp_high": st(24),
  "input_number.out_humidity_low": st(40), "input_number.out_humidity_high": st(60) });

test("the Outside: its name, last in the dots, only its Climate square, levels from thresholds.outside", () => {
  const ctx = ctxOf({ cfg: outsideConfig(), routeId: "outside", hass: hassOf(outsideStates(4.5, 50)) });
  const el = mount(ctx);
  assert.equal(text(el.querySelector(".top .name")), "Outside");
  const dots = el.querySelectorAll(".dots i");
  assert.equal(dots.length, 5);
  assert.ok(dots[4].classList.contains("a"));
  assert.equal(el.querySelector(".dots").getAttribute("aria-label"), "Area 5 of 5");
  assert.equal(el.querySelectorAll(".sq").length, 1);
  assert.ok(el.querySelector(".sq.climate"));
  assert.equal(el.querySelector("pocket-light-tile"), null);
  assert.equal(el.querySelector(".scn"), null);
  assert.ok(el.querySelector(".media").hidden);
  assert.equal(el.querySelector(".empty"), null);
  const big = el.querySelector(".sq.climate .big");
  assert.equal(text(big), "4.5°");
  assert.ok(big.classList.contains("lv-poor"), "below the outside range: cold");
  assert.match(text(el.querySelector(".sq.climate .lab")), /50 %.*Too cold/);
});

test("the Outside's readings in range are good; the Outside is the last swipe stop", () => {
  const ctx = ctxOf({ cfg: outsideConfig(), routeId: "outside", hass: hassOf(outsideStates(22, 50)) });
  const el = mount(ctx);
  assert.ok(el.querySelector(".sq.climate .big").classList.contains("lv-good"));
  swipe(el, [300, 200], [200, 210]);
  swipe(el, [100, 200], [200, 195]);
  assert.deepEqual(ctx.routes, ["#/area/hall"]);
  const hallCtx = ctxOf({ cfg: outsideConfig(), routeId: "hall" });
  const hallEl = room.render(hallCtx);
  swipe(hallEl, [300, 200], [200, 210]);
  assert.deepEqual(hallCtx.routes, ["#/area/outside"]);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("snappy: play/pause and the group tile show their new state at once, before Home Assistant reports it", () => {
  const ctx = ctxOf({ routeId: "living_room" });
  const el = mount(ctx);
  ctx.redraw = () => room.update(el, ctx);
  const play = el.querySelector(".media .play");
  play.click();
  assert.equal(play.getAttribute("aria-label"), "Play", "paused at once");
  const tile = el.querySelector(".group pocket-light-tile");
  tile.click();
  assert.ok(!tile.shadowRoot.querySelector(".tile").classList.contains("on"), "the lights show off at once");
  el.querySelector(".members-toggle").click();
  const members = [...el.querySelectorAll(".members pocket-light-tile")];
  assert.ok(members.every((m) => !m.shadowRoot.querySelector(".tile").classList.contains("on")), "its members follow");
  // Home Assistant reports the new states: they stay, now as reported.
  const states = { ...ctx.raw.states,
    "media_player.living_room_speaker": st("paused", ctx.raw.states["media_player.living_room_speaker"].attributes),
    "light.living_room": st("off", { entity_id: ["light.living_room_ceiling", "light.living_room_lamp"] }),
    "light.living_room_ceiling": st("off") };
  ctx.hass = { ...ctx.raw, states };
  room.update(el, ctx);
  assert.ok(!ctx.optimistic.pending("media_player.living_room_speaker"));
  assert.ok(!ctx.optimistic.pending("light.living_room"));
  assert.equal(play.getAttribute("aria-label"), "Play");
});

test("snappy: a pressed scene is marked until it runs; silence rolls back with the toast", async () => {
  const ctx = ctxOf({ routeId: "living_room", timeoutMs: 30 });
  const el = mount(ctx);
  ctx.redraw = () => room.update(el, ctx);
  const errors = [];
  el.addEventListener("pocket-error", (e) => errors.push(e.detail.key));
  const [relax, bright] = el.querySelectorAll(".scenes button");
  relax.click();
  bright.click();
  assert.ok(relax.classList.contains("sent") && bright.classList.contains("sent"));
  assert.equal(relax.getAttribute("aria-busy"), "true");
  ctx.hass = { ...ctx.raw, states: { ...ctx.raw.states, "scene.living_room_relax": st("2026-11-05T20:00:00") } };
  room.update(el, ctx);
  assert.ok(!relax.classList.contains("sent"), "Home Assistant reported that it ran");
  el.querySelector(".media .play").click();
  await wait(50);
  assert.ok(!bright.classList.contains("sent"));
  assert.equal(el.querySelector(".media .play").getAttribute("aria-label"), "Pause", "no report: back as it was");
  assert.deepEqual(errors, ["card.pocket.error.scene", "card.pocket.error.media"]);
});
