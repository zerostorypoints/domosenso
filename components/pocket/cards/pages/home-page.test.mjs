import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as home from "./home-page.js";
import { pages } from "./index.js";
import { createT } from "../lib/i18n.js";
import { createOptimistic } from "../lib/optimistic.js";
import en from "../../translations/en.json" with { type: "json" };
import de from "../../translations/de.json" with { type: "json" };
import pl from "../../translations/pl.json" with { type: "json" };

const translate = createT({ en, de, pl });

// The demo home's rooms (examples/demo-home/home.inputs.yaml), as the dashboard template passes them.
const config = {
  lang: "en",
  rooms: [
    { id: "living_room", name: "Living room", lights: "light.living_room", scenes: ["scene.all_lights_off"],
      climate: { temperature: "sensor.living_room_temperature", humidity: "sensor.living_room_humidity" },
      air: { score: "sensor.living_room_air_quality_score", co2: "sensor.living_room_co2" },
      media: "media_player.living_room_speaker" },
    { id: "bedroom", name: "Bedroom",
      climate: { temperature: "sensor.bedroom_temperature", humidity: "sensor.bedroom_humidity" } },
    { id: "office", name: "Office", lights: "light.office" },
  ],
  outside: { temperature: "sensor.outside_temperature", humidity: "sensor.outside_humidity" },
  weather: "weather.forecast_home",
  thresholds: {
    rooms: {
      living_room: { temp_low: "input_number.climate_air_living_room_temp_low", temp_high: "input_number.climate_air_living_room_temp_high",
                     humidity_low: "input_number.climate_air_living_room_humidity_low", humidity_high: "input_number.climate_air_living_room_humidity_high" },
      bedroom: { temp_low: "input_number.climate_air_bedroom_temp_low", temp_high: "input_number.climate_air_bedroom_temp_high",
                 humidity_low: "input_number.climate_air_bedroom_humidity_low", humidity_high: "input_number.climate_air_bedroom_humidity_high" },
    },
    air: {
      score: { fair: "input_number.climate_air_score_fair", poor: "input_number.climate_air_score_poor" },
      co2: { fair: "input_number.climate_air_co2_fair", poor: "input_number.climate_air_co2_poor" },
    },
  },
};

const st = (state, attributes = {}) => ({ state: String(state), attributes });
const baseStates = () => ({
  "input_number.climate_air_living_room_temp_low": st(20), "input_number.climate_air_living_room_temp_high": st(24),
  "input_number.climate_air_living_room_humidity_low": st(35), "input_number.climate_air_living_room_humidity_high": st(60),
  "input_number.climate_air_bedroom_temp_low": st(18), "input_number.climate_air_bedroom_temp_high": st(22),
  "input_number.climate_air_bedroom_humidity_low": st(35), "input_number.climate_air_bedroom_humidity_high": st(60),
  "input_number.climate_air_score_fair": st(80), "input_number.climate_air_score_poor": st(60),
  "input_number.climate_air_co2_fair": st(800), "input_number.climate_air_co2_poor": st(1200),
  "sensor.living_room_temperature": st(21.7), "sensor.living_room_humidity": st(45),
  "sensor.living_room_air_quality_score": st(81), "sensor.living_room_co2": st(768),
  "sensor.bedroom_temperature": st(21.9), "sensor.bedroom_humidity": st(44),
  "sensor.outside_temperature": st(5.5),
  "light.living_room": st("on", { brightness: 171 }), "light.office": st("off"),
  "media_player.living_room_speaker": st("playing", {
    media_title: "Devil Like Me", media_artist: "Rainbow Kitten Surprise", entity_picture: "/api/media_player_proxy/x" }),
});

function hassOf(states = baseStates()) {
  const calls = [];
  return { calls, states, locale: { language: "en" }, connected: true,
    callService: (d, s, data) => { calls.push([d, s, data]); return Promise.resolve(); } };
}

// As the shell's: ctx.hass is the optimistic store's view of the raw hass; ctx.redraw (set by a
// test) runs on each send or rollback.
function ctxOf({ hass = hassOf(), lang = "en", cfg = config, offline = false, timeoutMs } = {}) {
  const routes = [];
  const optimistic = createOptimistic(timeoutMs ? { timeoutMs } : {});
  const sheets = [];
  const ctx = { routes, sheets, raw: hass, optimistic, config: cfg, lang, offline, routeId: undefined,
    openSheet: (spec) => sheets.push(spec),
    get hass() { return optimistic.view(ctx.raw); },
    set hass(value) { ctx.raw = value; optimistic.update(value); },
    t: (key, vars) => translate({ locale: { language: lang } }, key, vars),
    navigate: (route) => routes.push(route) };
  optimistic.onChange = () => ctx.redraw?.();
  return ctx;
}

function mount(ctx = ctxOf()) {
  const el = home.render(ctx);
  document.body.appendChild(el);
  return el;
}

const text = (el) => el.textContent.replace(/\s+/g, " ").trim();
const texts = (el, sel) => [...el.querySelectorAll(sel)].map(text);

beforeEach(() => { document.body.innerHTML = ""; });

test("the shell's home entry is this page", () => {
  assert.equal(pages.home, home);
});

test("title and today's date", () => {
  const el = mount();
  assert.equal(text(el.querySelector(".top b")), "Home");
  assert.ok(text(el.querySelector(".top .date")).length > 0);
});

test("nothing to report: one all-good pill", () => {
  const el = mount();
  assert.deepEqual(texts(el, ".att .pill"), ["All good"]);
  assert.ok(el.querySelector(".att .pill .dot.good"));
});

test("attention pills: translated reading, level and side, poor first; a tap opens the checks sheet", () => {
  const states = { ...baseStates(), "sensor.living_room_co2": st(1250), "sensor.bedroom_temperature": st(23),
    "sensor.living_room_air_quality_score": st(70) };
  const ctx = ctxOf({ hass: hassOf(states) });
  const el = mount(ctx);
  assert.deepEqual(texts(el, ".att .pill"), ["Living room: CO₂ high", "Bedroom: Too warm", "Living room: Air fair"]);
  assert.ok(el.querySelector(".att .pill .dot.poor"));
  assert.ok(el.querySelector(".att .pill .dot.fair"));
  el.querySelectorAll(".att .pill")[1].click();
  assert.deepEqual(ctx.routes, []);
  assert.deepEqual(ctx.sheets, [{ kind: "checks", title: "What was checked" }]);
});

test("All good is a button: it opens the checks sheet", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const pill = el.querySelector(".att .pill");
  assert.equal(pill.tagName, "BUTTON");
  pill.click();
  assert.deepEqual(ctx.sheets, [{ kind: "checks", title: "What was checked" }]);
});

test("pills in Polish and German come from the translations", () => {
  const states = { ...baseStates(), "sensor.living_room_co2": st(1250), "sensor.bedroom_humidity": st(20) };
  for (const lang of ["pl", "de"]) {
    const el = mount(ctxOf({ hass: hassOf(states), lang }));
    const pills = texts(el, ".att .pill");
    assert.equal(pills.length, 2);
    for (const pill of pills) assert.doesNotMatch(pill, /card\.pocket|high|Too/, `${lang}: ${pill}`);
  }
});

test("metric chips: inside range, outside, air score, lights on", () => {
  const el = mount();
  assert.deepEqual(texts(el, ".chips .chip:not([hidden])"),
    ["21.7–21.9° Inside", "5.5° Outside", "81 Air", "1 Lights on"]);
});

test("a chip whose reading is unavailable shows a dash; a chip without its entity is left out", () => {
  const states = { ...baseStates(), "sensor.outside_temperature": st("unavailable") };
  const el = mount(ctxOf({ hass: hassOf(states), cfg: { ...config, outside: undefined } }));
  assert.deepEqual(texts(el, ".chips .chip:not([hidden])").map((s) => s.split(" ")[1]), ["Inside", "Air", "Lights"]);
  const el2 = mount(ctxOf({ hass: hassOf(states) }));
  assert.ok(texts(el2, ".chips .chip:not([hidden])").includes("— Outside"));
});

test("now playing: art, title, artist; play/pause in place, elsewhere to Media", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const card = el.querySelector(".now");
  assert.ok(!card.hidden);
  assert.equal(card.querySelector(".art img").getAttribute("src"), "/api/media_player_proxy/x");
  assert.equal(text(card.querySelector(".t1")), "Devil Like Me");
  assert.equal(text(card.querySelector(".t2")), "Rainbow Kitten Surprise");
  const play = card.querySelector("button.play");
  assert.equal(play.getAttribute("aria-label"), "Pause");
  play.click();
  assert.deepEqual(ctx.hass.calls, [["media_player", "media_play_pause", { entity_id: "media_player.living_room_speaker" }]]);
  assert.deepEqual(ctx.routes, []);
  card.querySelector("button.open").click();
  assert.deepEqual(ctx.routes, ["#/media"]);
  assert.equal(card.querySelector("[role]"), null, "no interactive role around the play button");
});

test("an unavailable player: a dash, muted, play disabled", () => {
  const states = { ...baseStates(), "media_player.living_room_speaker": st("unavailable", { media_title: "Old" }) };
  const el = mount(ctxOf({ hass: hassOf(states) }));
  const card = el.querySelector(".now");
  assert.ok(!card.hidden);
  assert.ok(card.classList.contains("muted"));
  assert.equal(text(card.querySelector(".t1")), "—");
  assert.ok(card.querySelector("button.play").disabled);
});

test("a failed play/pause or All off fires pocket-error", async () => {
  const ctx = ctxOf();
  ctx.hass.callService = () => Promise.reject(new Error("no"));
  const el = mount(ctx);
  const errors = [];
  el.addEventListener("pocket-error", (e) => errors.push(e.detail.key));
  el.querySelector(".now button.play").click();
  el.querySelector(".quick .all-off").click();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(errors, ["card.pocket.error.media", "card.pocket.error.light"]);
});

test("pills are buttons inside list items", () => {
  const states = { ...baseStates(), "sensor.living_room_co2": st(1250) };
  const el = mount(ctxOf({ hass: hassOf(states) }));
  const items = [...el.querySelectorAll('.att > [role="listitem"]')];
  assert.equal(items.length, 1);
  assert.equal(items[0].firstElementChild.tagName, "BUTTON");
  assert.equal(items[0].firstElementChild.getAttribute("role"), null);
});

test("a missing media entity: no now-playing card", () => {
  const states = baseStates();
  delete states["media_player.living_room_speaker"];
  const el = mount(ctxOf({ hass: hassOf(states) }));
  assert.ok(el.querySelector(".now").hidden);
});

test("quick tiles: one light tile per room with lights, and All off", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const tiles = [...el.querySelectorAll(".quick pocket-light-tile")];
  assert.deepEqual(tiles.map((tile) => tile.config.name), ["Living room", "Office"]);
  assert.deepEqual(tiles.map((tile) => tile.config.entities), [["light.living_room"], ["light.office"]]);
  const off = el.querySelector(".quick .all-off");
  assert.match(text(off), /All off/);
  assert.match(text(off), /1 on now/);
  off.click();
  assert.deepEqual(ctx.hass.calls, [["light", "turn_off", { entity_id: ["light.living_room", "light.office"] }]]);
});

test("rooms strip: one card per room, a tap opens it; All opens Rooms", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const cards = [...el.querySelectorAll(".strip .rc")];
  assert.deepEqual(cards.map((c) => text(c.querySelector(".t1"))), ["Living room", "Bedroom", "Office"]);
  assert.match(text(cards[0].querySelector(".t2")), /21\.7°/);
  cards[2].click();
  el.querySelector(".sec .all").click();
  assert.deepEqual(ctx.routes, ["#/area/office", "#/areas"]);
});

test("offline: controls are disabled and send nothing", () => {
  const ctx = ctxOf({ offline: true });
  const el = mount(ctx);
  el.querySelector(".now button.play").click();
  el.querySelector(".quick .all-off").click();
  assert.ok(el.querySelector(".now button.play").disabled);
  assert.ok([...el.querySelectorAll(".quick pocket-light-tile")].every((tile) => tile.offline));
  assert.deepEqual(ctx.hass.calls, []);
});

test("update patches in place: same elements, new values", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  const chip = el.querySelector(".chips .chip");
  const tile = el.querySelector(".quick pocket-light-tile");
  const states = { ...baseStates(), "sensor.living_room_co2": st(1300), "light.office": st("on", { brightness: 255 }) };
  const media = states["media_player.living_room_speaker"];
  states["media_player.living_room_speaker"] = { ...media, state: "paused" };
  home.update(el, { ...ctx, hass: hassOf(states) });
  assert.equal(el.querySelector(".chips .chip"), chip);
  assert.equal(el.querySelector(".quick pocket-light-tile"), tile);
  assert.deepEqual(texts(el, ".att .pill"), ["Living room: CO₂ high"]);
  assert.match(texts(el, ".chips .chip").join("|"), /2 Lights on/);
  assert.equal(el.querySelector(".now button.play").getAttribute("aria-label"), "Play");
});

test("the language follows ctx on update", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  home.update(el, ctxOf({ lang: "pl" }));
  assert.equal(text(el.querySelector(".top b")), "Dom");
  assert.ok(!texts(el, ".chips .chip").join(" ").includes("Inside"));
});

test("lights on: one definition with Rooms, a group counts its members, each lamp once", async () => {
  const demo = await import("../testing/demo-home.mjs");
  const rooms = await import("./areas-page.js");
  const states = { ...demo.baseStates(),
    "light.living_room_lamp": demo.st("on", { brightness: 255, friendly_name: "Reading lamp" }) };
  // The office names a lamp of the living-room group as well: it is still one lamp on.
  const cfg = { ...demo.config, rooms: demo.config.rooms.map((r) =>
    r.id === "office" ? { ...r, lights: ["light.office", "light.living_room_lamp"] } : r) };
  const ctx = demo.ctxOf({ hass: demo.hassOf(states), cfg });
  const el = mount(ctx);
  const chip = text(el.querySelector('.chip[data-chip="lights_on"] .v'));
  assert.equal(chip, "2");
  assert.match(text(el.querySelector(".quick .all-off")), /2 on now/);
  const strip = [...el.querySelectorAll(".strip .rc .t2")].map(text);
  const tab = [...rooms.render(ctx).querySelectorAll(".grid .sq .lab")].map(text);
  assert.match(strip[0], /2 on/);
  assert.match(tab[0], /2 on/);
  assert.match(strip[2], /1 on/);
});

test("rooms strip: an unavailable reading is a muted dash", () => {
  const states = { ...baseStates(), "sensor.bedroom_humidity": st("unavailable"), "sensor.bedroom_temperature": st("unknown") };
  const el = mount(ctxOf({ hass: hassOf(states) }));
  const bedroom = el.querySelectorAll(".strip .rc .t2")[1];
  assert.equal(text(bedroom), "— · —");
  assert.equal(bedroom.querySelectorAll(".muted").length, 2);
});

test("a group that is on with every member unavailable is one lamp on: chip, All off and Rooms agree", async () => {
  const demo = await import("../testing/demo-home.mjs");
  const rooms = await import("./areas-page.js");
  const members = ["light.g_a", "light.g_b", "light.g_c", "light.g_d"];
  const states = { ...demo.baseStates(),
    "light.living_room": demo.st("on", { brightness: 240, entity_id: members }),
    ...Object.fromEntries(members.map((id) => [id, demo.st("unavailable")])) };
  const ctx = demo.ctxOf({ hass: demo.hassOf(states) });
  const el = mount(ctx);
  assert.equal(text(el.querySelector('.chip[data-chip="lights_on"] .v')), "1");
  assert.match(text(el.querySelector(".quick .all-off")), /1 on now/);
  const tab = [...rooms.render(ctx).querySelectorAll(".grid .sq .lab")].map(text);
  assert.match(tab[0], /1 on/);
});

test("a group with some members available counts those members only", async () => {
  const demo = await import("../testing/demo-home.mjs");
  const { lightsOn, lightsOnIn } = await import("../lib/page-kit.js");
  const members = ["light.g_a", "light.g_b", "light.g_c"];
  const states = { "light.g": demo.st("on", { entity_id: members }),
    "light.g_a": demo.st("on"), "light.g_b": demo.st("off"), "light.g_c": demo.st("unavailable") };
  const hass = demo.hassOf(states);
  const room = { id: "r", name: "R", lights: "light.g" };
  assert.equal(lightsOn(hass, room), 1);
  states["light.g_b"] = demo.st("on");
  assert.equal(lightsOnIn(hass, [room]), 2);
  states["light.g_a"] = demo.st("unknown");
  states["light.g_b"] = demo.st("unknown");
  assert.equal(lightsOn(hass, room), 1, "none available: the group itself, which is on");
  states["light.g"] = demo.st("off");
  assert.equal(lightsOn(hass, room), 0);
});

test("every link and button of Home is at least 44 x 44", () => {
  const css = mount().querySelector("style").textContent;
  const rule = (sel) => css.match(new RegExp(`${sel.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`))[1];
  for (const sel of [".home .sec .all", ".home .pill"]) {
    assert.match(rule(sel), /min-width:\s*44px/, sel);
    assert.match(rule(sel), /min-height:\s*44px/, sel);
  }
  assert.match(rule(".home .play"), /width:\s*44px;\s*height:\s*44px/);
  assert.match(rule(".home .all-off, .home .rc"), /min-height:\s*64px/);
});

test("snappy: All off shows every light off at once (the tiles and the chip), confirmed by Home Assistant", () => {
  const ctx = ctxOf();
  const el = mount(ctx);
  ctx.redraw = () => home.update(el, ctx);
  const tiles = [...el.querySelectorAll(".quick pocket-light-tile")];
  assert.ok(tiles[0].shadowRoot.querySelector(".tile").classList.contains("on"));
  el.querySelector(".quick .all-off").click();
  assert.ok(tiles.every((tile) => !tile.shadowRoot.querySelector(".tile").classList.contains("on")), "off at once");
  assert.equal(text(el.querySelector('[data-chip="lights_on"] .v')), "0");
  assert.match(text(el.querySelector(".quick .all-off")), /None on/);
  const states = Object.fromEntries(Object.entries(ctx.raw.states).map(([id, s]) =>
    [id, id.startsWith("light.") ? { ...s, state: "off" } : s]));
  ctx.hass = { ...ctx.raw, states };
  home.update(el, ctx);
  assert.ok(!ctx.optimistic.pending("light.living_room"));
  assert.equal(text(el.querySelector('[data-chip="lights_on"] .v')), "0");
});

test("snappy: play/pause flips at once; a failed call flips it back with the toast", async () => {
  const ctx = ctxOf();
  ctx.raw.callService = () => Promise.reject(new Error("no"));
  const el = mount(ctx);
  ctx.redraw = () => home.update(el, ctx);
  const errors = [];
  el.addEventListener("pocket-error", (e) => errors.push(e.detail.key));
  const play = el.querySelector(".now button.play");
  play.click();
  assert.equal(play.getAttribute("aria-label"), "Play");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(play.getAttribute("aria-label"), "Pause");
  assert.deepEqual(errors, ["card.pocket.error.media"]);
});

test("every chip opens its sheet: inside the temperature checks, outside and air their trend, lights on the lights", () => {
  const ctx = ctxOf();
  const el = home.render(ctx);
  document.body.appendChild(el);
  const chip = (name) => el.querySelector(`.chip[data-chip="${name}"]`);
  for (const name of ["inside", "outside", "air", "lights_on"]) {
    assert.equal(chip(name).tagName, "BUTTON", name);
    chip(name).click();
  }
  assert.deepEqual(ctx.sheets.map((s) => [s.kind, s.entity, s.subtitle]), [
    ["checks", undefined, undefined],
    ["trend", "sensor.outside_temperature", "Outside"],
    ["trend", "sensor.living_room_air_quality_score", "Living room"],
    ["lights", undefined, undefined],
  ]);
  assert.deepEqual(ctx.sheets[0], { kind: "checks", title: "Temperature inside", readings: ["temperature"], inside: true });
  const css = el.querySelector("style").textContent;
  assert.match(css, /button\.chip \{[^}]*min-height: 44px/);
});

const withOutsideRange = { ...config, thresholds: { ...config.thresholds, outside: {
  temp_low: "input_number.out_temp_low", temp_high: "input_number.out_temp_high" } } };
const outsideRangeStates = (temp) => ({ ...baseStates(), "sensor.outside_temperature": st(temp),
  "input_number.out_temp_low": st(20), "input_number.out_temp_high": st(24) });

test("side colours: outside below its range is cold blue, above it warm; inside the worst room; air its level", () => {
  const cold = mount(ctxOf({ hass: hassOf(outsideRangeStates(5)), cfg: withOutsideRange }));
  assert.equal(cold.querySelector('[data-chip="outside"] .v').className, "v lv-cold");
  const warm = mount(ctxOf({ hass: hassOf(outsideRangeStates(30)), cfg: withOutsideRange }));
  assert.equal(warm.querySelector('[data-chip="outside"] .v').className, "v lv-warm");
  const states = { ...baseStates(), "sensor.bedroom_temperature": st(23), "sensor.living_room_air_quality_score": st(70) };
  const el = mount(ctxOf({ hass: hassOf(states) }));
  assert.equal(el.querySelector('[data-chip="inside"] .v').className, "v lv-warm", "the bedroom is above its range");
  assert.equal(el.querySelector('[data-chip="air"] .v').className, "v lv-fair");
  assert.equal(el.querySelector('[data-chip="outside"] .v').className, "v", "no outside range: no level");
  const css = el.querySelector("style").textContent;
  assert.match(css, /\.v\.lv-cold\s*\{\s*color:\s*var\(--cold\)/);
  assert.match(css, /\.v\.lv-warm\s*\{\s*color:\s*var\(--warm\)/);
});

test("trend arrows on the outside and air chips from the last hour; none on inside and lights", async () => {
  const { clearHistoryCache } = await import("../lib/trend.js");
  clearHistoryCache();
  const hass = hassOf();
  hass.ws = [];
  const series = { "sensor.outside_temperature": [7, 6, 5.5], "sensor.living_room_air_quality_score": [81, 81, 81] };
  hass.callWS = (msg) => {
    hass.ws.push(msg.entity_ids[0]);
    const id = msg.entity_ids[0];
    const start = Date.parse(msg.start_time);
    const step = (Date.parse(msg.end_time) - start) / 3;
    return Promise.resolve({ [id]: (series[id] ?? []).map((v, i) => ({ s: String(v), lu: (start + i * step) / 1000 })) });
  };
  const ctx = ctxOf({ hass });
  const el = mount(ctx);
  await new Promise((r) => setTimeout(r, 0));
  const arrow = (name) => el.querySelector(`[data-chip="${name}"] .arrow`);
  assert.equal(arrow("outside").textContent, "↓");
  assert.equal(arrow("outside").getAttribute("aria-label"), "Falling");
  assert.equal(arrow("air").textContent, "→");
  assert.ok(arrow("inside").hidden && arrow("lights_on").hidden);
  assert.deepEqual(hass.ws.sort(), ["sensor.living_room_air_quality_score", "sensor.outside_temperature"]);
  home.update(el, ctx);
  home.update(el, ctx);
  assert.equal(hass.ws.length, 2, "updates fetch nothing");
  clearHistoryCache();
});
