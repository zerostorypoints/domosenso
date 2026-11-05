// The Media page: the chosen player, its transport, volume and picker, and the Sound tab.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as page from "./media-page.js";
import { pages } from "./index.js";
import * as playerSheet from "../lib/player-sheet.js";
import * as sourceSheet from "../lib/source-sheet.js";
import { chosenPlayer, clock, playersOf, progressOf } from "../lib/media.js";
import { ELEMENT, meterConfig } from "../lib/sound-panel.js";
import { config as demo, baseStates, st, hassOf, ctxOf, text, texts, pointer } from "../testing/demo-home.mjs";

const ALL = 1 | 4 | 8 | 16 | 32 | 16384;     // pause, volume set, mute, previous, next, play
const SPEAKER = "media_player.living_room_speaker";
const BEDROOM = "media_player.bedroom_speaker";

const config = {
  ...demo,
  rooms: demo.rooms.map((room) => (room.id === "bedroom" ? { ...room, media: BEDROOM } : room)),
};
const SOUND = { level: "sensor.music_level", offset: "sensor.music_spl_offset",
  averages: { leq_1_min: "sensor.room_leq_1_min", leq_15_min: "sensor.room_leq_15_min", leq_1_h: "sensor.room_leq_1_h" } };

const speaker = (state = "playing", attributes = {}) => st(state, {
  friendly_name: "Living room speaker", media_title: "Devil Like Me", media_artist: "Rainbow Kitten Surprise",
  media_album_name: "How to: Friend, Love, Freefall", entity_picture: "/api/media_player_proxy/x",
  media_duration: 188, media_position: 100, media_position_updated_at: "2026-11-05T20:00:00.000Z",
  volume_level: 0.25, is_volume_muted: false, supported_features: ALL, app_name: "Spotify", source: "Naim", ...attributes });

const states = (changes = {}) => ({
  ...baseStates(),
  [SPEAKER]: speaker(),
  [BEDROOM]: st("idle", { friendly_name: "Bedroom speaker", supported_features: ALL, volume_level: 0.1 }),
  "sensor.music_level": st("61.4", { unit_of_measurement: "dB" }),
  "sensor.music_spl_offset": st("95", { calibrated: true }),
  "sensor.room_leq_1_min": st("58.24"), "sensor.room_leq_15_min": st("55.6"), "sensor.room_leq_1_h": st("unavailable"),
  ...changes,
});

function ctxWith({ changes, settings = {}, cfg = config, routeId, offline, save } = {}) {
  const ctx = ctxOf({ hass: hassOf(states(changes)), cfg, routeId, offline });
  ctx.saved = [];
  ctx.settings = settings;
  ctx.saveSettings = save ?? ((patch) => { ctx.saved.push(patch); return Promise.resolve(); });
  return ctx;
}

function mount(ctx = ctxWith({ routeId: "living_room" })) {
  const el = page.render(ctx);
  el._media.now = () => Date.parse("2026-11-05T20:00:41.000Z");
  ctx.redraw = () => page.update(el, ctx);
  document.body.appendChild(el);
  page.update(el, ctx);
  return el;
}

const shown = (el, sel) => !el.querySelector(sel).hidden;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const strip = (el) => {
  const vol = el.querySelector(".vol");
  vol.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 44, right: 200, bottom: 44, x: 0, y: 0 });
  return vol;
};

beforeEach(() => {
  document.body.innerHTML = "";
});

test("the shell's media page is this page", () => {
  assert.equal(pages.media, page);
});

test("artwork, title, artist, album, progress, source line of the route's player", () => {
  const el = mount();
  assert.equal(text(el.querySelector(".top b")), "Media");
  assert.equal(text(el.querySelector(".pick")), "Living room speaker", "several players: the player's own name");
  assert.equal(el.querySelector(".art img").getAttribute("src"), "/api/media_player_proxy/x");
  assert.equal(text(el.querySelector(".title")), "Devil Like Me");
  assert.equal(text(el.querySelector(".artist")), "Rainbow Kitten Surprise");
  assert.equal(text(el.querySelector(".album")), "How to: Friend, Love, Freefall");
  assert.deepEqual(texts(el, ".prog .times span"), ["2:21", "3:08"], "position + 41 s since its update");
  assert.equal(text(el.querySelector(".src .line")), "Spotify · Naim");
  assert.ok(el.querySelector(".seg").hidden, "no Sound tab without the config");
  assert.ok(!shown(el, ".level"));
});

test("progress: ticks only while playing, stays within the duration, absent without one", () => {
  const at = Date.parse("2026-11-05T20:00:00.000Z");
  assert.deepEqual(progressOf(speaker(), at + 10_000), { position: 110, duration: 188 });
  assert.deepEqual(progressOf(speaker("paused"), at + 10_000), { position: 100, duration: 188 });
  assert.deepEqual(progressOf(speaker(), at + 999_000), { position: 188, duration: 188 });
  assert.equal(progressOf(speaker("playing", { media_duration: undefined })), null);
  assert.equal(clock(65), "1:05");
  assert.equal(clock(3725), "1:02:05");
  const el = mount(ctxWith({ routeId: "living_room", changes: { [SPEAKER]: speaker("playing", { media_duration: null }) } }));
  assert.ok(el.querySelector(".prog").hidden);
});

test("transport: play-pause, previous and next call the player; play-pause shows at once", () => {
  const ctx = ctxWith({ routeId: "living_room" });
  const el = mount(ctx);
  assert.ok(shown(el, ".previous") && shown(el, ".next") && shown(el, ".play"));
  const play = el.querySelector(".play");
  assert.equal(play.getAttribute("aria-label"), "Pause");
  play.click();
  assert.equal(play.getAttribute("aria-label"), "Play", "optimistic: paused before Home Assistant reports it");
  el.querySelector(".next").click();
  el.querySelector(".previous").click();
  assert.deepEqual(ctx.raw.calls, [
    ["media_player", "media_play_pause", { entity_id: SPEAKER }],
    ["media_player", "media_next_track", { entity_id: SPEAKER }],
    ["media_player", "media_previous_track", { entity_id: SPEAKER }],
  ]);
});

test("controls the player does not support are hidden (supported_features)", () => {
  const el = mount(ctxWith({ routeId: "living_room", changes: { [SPEAKER]: speaker("playing", { supported_features: 1 }) } }));
  assert.ok(shown(el, ".play"));
  assert.ok(!shown(el, ".previous") && !shown(el, ".next"));
  assert.ok(el.querySelector(".volume").hidden, "no volume, no mute");
  const bare = mount(ctxWith({ routeId: "living_room", changes: { [SPEAKER]: speaker("playing", { supported_features: 4 }) } }));
  assert.ok(!shown(bare, ".play"), "neither play nor pause");
  assert.ok(shown(bare, ".vol") && !shown(bare, ".mute"));
  const none = mount(ctxWith({ routeId: "living_room", changes: { [SPEAKER]: speaker("playing", { supported_features: undefined }) } }));
  assert.ok(shown(none, ".play"), "a player reporting no features keeps play-pause");
});

test("volume: a drag along its strip previews, sends volume_set once on release, shows it at once", () => {
  const ctx = ctxWith({ routeId: "living_room" });
  const el = mount(ctx);
  const vol = strip(el);
  assert.equal(text(vol.querySelector("span")), "Volume 25 %");
  pointer(vol, "pointerdown", 50, 20);
  pointer(vol, "pointermove", 70, 21);
  assert.equal(text(vol.querySelector("span")), "Volume 35 %", "the preview while dragging");
  pointer(vol, "pointermove", 80, 22);
  assert.deepEqual(ctx.raw.calls, []);
  pointer(vol, "pointerup", 80, 22);
  assert.deepEqual(ctx.raw.calls, [["media_player", "volume_set", { entity_id: SPEAKER, volume_level: 0.4 }]]);
  assert.equal(text(vol.querySelector("span")), "Volume 40 %", "optimistic until Home Assistant reports it");
  assert.equal(vol.getAttribute("aria-valuenow"), "40");
});

test("volume: a vertical move is the page's scroll; a tap sets that point; arrow keys step", () => {
  const ctx = ctxWith({ routeId: "living_room" });
  const el = mount(ctx);
  const vol = strip(el);
  pointer(vol, "pointerdown", 50, 20);
  pointer(vol, "pointermove", 52, 60);
  pointer(vol, "pointerup", 52, 60);
  assert.deepEqual(ctx.raw.calls, []);
  pointer(vol, "pointerdown", 150, 20);
  pointer(vol, "pointerup", 150, 20);
  assert.deepEqual(ctx.raw.calls.at(-1), ["media_player", "volume_set", { entity_id: SPEAKER, volume_level: 0.75 }]);
  vol.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  assert.deepEqual(ctx.raw.calls.at(-1), ["media_player", "volume_set", { entity_id: SPEAKER, volume_level: 0.7 }]);
});

test("mute: toggles the player's mute and shows it at once", () => {
  const ctx = ctxWith({ routeId: "living_room" });
  const el = mount(ctx);
  const mute = el.querySelector(".mute");
  assert.equal(mute.getAttribute("aria-label"), "Mute");
  mute.click();
  assert.deepEqual(ctx.raw.calls, [["media_player", "volume_mute", { entity_id: SPEAKER, is_volume_muted: true }]]);
  assert.equal(mute.getAttribute("aria-pressed"), "true");
  assert.equal(mute.getAttribute("aria-label"), "Unmute");
});

test("offline or an unavailable player: controls disabled, a dash, no call", () => {
  const ctx = ctxWith({ routeId: "living_room", offline: true });
  const el = mount(ctx);
  assert.ok(el.querySelector(".play").disabled);
  el.querySelector(".play").click();
  pointer(strip(el), "pointerdown", 50, 20);
  pointer(el.querySelector(".vol"), "pointerup", 50, 20);
  assert.deepEqual(ctx.raw.calls, []);
  const gone = mount(ctxWith({ routeId: "living_room", changes: { [SPEAKER]: st("unavailable", {}) } }));
  assert.equal(text(gone.querySelector(".title")), "—");
  assert.ok(gone.querySelector(".player").classList.contains("muted"));
});

test("which player: the route's area, else the person's last choice, else one playing, else the first", () => {
  const hass = { states: states() };
  assert.deepEqual(playersOf(config).map((p) => p.id), [SPEAKER, BEDROOM]);
  assert.equal(chosenPlayer({ config, hass, routeId: "bedroom", settings: { mediaPlayer: SPEAKER } }).id, BEDROOM);
  assert.equal(chosenPlayer({ config, hass, settings: { mediaPlayer: BEDROOM } }).id, BEDROOM);
  assert.equal(chosenPlayer({ config, hass, settings: { mediaPlayer: "media_player.gone" } }).id, SPEAKER);
  const idle = { states: states({ [SPEAKER]: speaker("paused"), [BEDROOM]: st("playing", {}) }) };
  assert.equal(chosenPlayer({ config, hass: idle }).id, BEDROOM);
  assert.equal(chosenPlayer({ config: { rooms: [] } }), undefined);
  const el = mount(ctxWith({ settings: { mediaPlayer: BEDROOM } }));
  assert.equal(text(el.querySelector(".pick")), "Bedroom speaker");
});

test("picker: the sheet of every area's player; a pick shows at once, is saved, closes the sheet", async () => {
  const ctx = ctxWith({ routeId: "living_room" });
  const el = mount(ctx);
  assert.equal(el.querySelector(".pick").getAttribute("aria-label"), "Player: Living room speaker");
  el.querySelector(".pick").click();
  const [spec] = ctx.sheets;
  assert.equal(spec.kind, "players");
  assert.equal(spec.current, SPEAKER);
  const sheet = playerSheet.render(ctx, spec);
  assert.equal(text(sheet.querySelector("h3")), "Player");
  assert.deepEqual(texts(sheet, ".row .t1"), ["Living room speaker", "Bedroom speaker"]);
  assert.deepEqual(texts(sheet, ".row .t2"), ["Living room · Devil Like Me", "Bedroom · Idle"], "not playing: what it is doing");
  assert.deepEqual([...sheet.querySelectorAll(".row")].map((r) => r.getAttribute("aria-pressed")), ["true", "false"]);
  sheet.querySelector(`[data-player="${BEDROOM}"]`).click();
  await settle();
  assert.deepEqual(ctx.saved, [{ mediaPlayer: BEDROOM }]);
  assert.equal(ctx.closed, 1);
  assert.equal(text(el.querySelector(".pick")), "Bedroom speaker", "the pick wins over the route");
  el.querySelector(".play").click();
  assert.deepEqual(ctx.raw.calls, [["media_player", "media_play_pause", { entity_id: BEDROOM }]]);
});

test("one player: no picker sheet; no player at all: a line says so", () => {
  const one = { ...demo };
  const ctx = ctxWith({ cfg: one });
  const el = mount(ctx);
  assert.ok(el.querySelector(".pick").classList.contains("single"));
  el.querySelector(".pick").click();
  assert.deepEqual(ctx.sheets, []);
  const none = mount(ctxWith({ cfg: { ...demo, rooms: demo.rooms.map(({ media, ...room }) => room) } }));
  assert.ok(none.querySelector(".player").hidden && none.querySelector(".pick").hidden);
  assert.equal(text(none.querySelector(".none")), "No media player in this home.");
});

test("the artwork opens Home Assistant's more-info of the player", () => {
  const el = mount();
  let detail;
  el.addEventListener("hass-more-info", (e) => { detail = e.detail; });
  el.querySelector(".art").click();
  assert.deepEqual(detail, { entityId: SPEAKER });
});

test("Sound tab: only with the config; the averages without the meter's element; the level on the source line", () => {
  const ctx = ctxWith({ routeId: "living_room", cfg: { ...config, sound: SOUND } });
  const el = mount(ctx);
  assert.ok(!el.querySelector(".seg").hidden);
  assert.deepEqual(texts(el, ".seg button"), ["Media", "Sound"]);
  assert.ok(el.querySelector(".sound").hidden, "Media first");
  assert.equal(text(el.querySelector(".level")), "61 dB now");
  el.querySelector(".level").click();
  assert.deepEqual(ctx.sheets.at(-1), { kind: "trend", entity: "sensor.music_level", title: "Sound level", digits: 1 });
  el.querySelector('.seg [data-tab="sound"]').click();
  assert.ok(!el.querySelector(".sound").hidden && el.querySelector(".player").hidden);
  assert.ok(el.querySelector(".sound .meter").hidden, "audio-sensor's card is not defined yet");
  assert.deepEqual(texts(el, ".sound .avg small"), ["Leq 1 min", "Leq 15 min", "Leq 1 h"]);
  assert.deepEqual(texts(el, ".sound .avg b"), ["58.2 dB", "55.6 dB", "—"]);
  el.querySelector('[data-average="leq_15_min"]').click();
  assert.deepEqual(ctx.sheets.at(-1), { kind: "trend", entity: "sensor.room_leq_15_min", title: "Leq 15 min", digits: 1 });
});

test("Sound tab: audio-sensor's room-meter-card on the music aliases, its marker the 1 min Leq", async () => {
  await import("../../../audio-sensor/cards/room-meter-card.js");
  assert.ok(customElements.get(ELEMENT));
  const ctx = ctxWith({ routeId: "living_room", cfg: { ...config, sound: SOUND } });
  const el = mount(ctx);
  await settle();
  el.querySelector('.seg [data-tab="sound"]').click();
  const card = el.querySelector(`.sound .meter ${ELEMENT}`);
  assert.ok(card, "the consumed element is on the page");
  assert.ok(!el.querySelector(".sound .meter").hidden);
  assert.equal(card._config.level, "sensor.music_level");
  assert.equal(card._config.offset, "sensor.music_spl_offset");
  assert.equal(card._config.leq, "sensor.room_leq_1_min");
  assert.match(card.shadowRoot.textContent, /61\.4/);
  assert.deepEqual(meterConfig({ level: "sensor.x" }), { type: "custom:room-meter-card", level: "sensor.x", seconds: 60 });
  const css = el.querySelector("style").textContent;
  assert.match(css, /\.media \.cb\.play \{ width: 64px; height: 64px;/);
  assert.match(css, /\.media \.vol \{[^}]*height: 44px;/);
});

test("volume: a failed call goes back to the reported volume with the toast", async () => {
  const ctx = ctxWith({ routeId: "living_room" });
  ctx.raw.callService = () => Promise.reject(new Error("no"));
  const el = mount(ctx);
  const errors = [];
  el.addEventListener("pocket-error", (e) => errors.push(e.detail.key));
  const vol = strip(el);
  pointer(vol, "pointerdown", 120, 20);
  pointer(vol, "pointerup", 120, 20);
  assert.equal(text(vol.querySelector("span")), "Volume 60 %");
  await settle();
  assert.equal(text(vol.querySelector("span")), "Volume 25 %");
  assert.deepEqual(errors, ["card.pocket.error.media"]);
});

test("progress ticker: survives a trip away from the page, as the shell keeps the page element", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const ctx = ctxWith({ routeId: "living_room" });
  const el = mount(ctx);
  let now = Date.parse("2026-11-05T20:00:41.000Z");
  el._media.now = () => now;
  page.update(el, ctx);
  assert.ok(el._media.timer, "ticking while it plays");
  now += 2000;
  t.mock.timers.tick(1000);
  assert.equal(text(el.querySelector(".pos")), "2:23");
  el.remove();                       // another HA panel
  t.mock.timers.tick(1000);
  assert.equal(el._media.timer, null, "stopped while disconnected");
  document.body.appendChild(el);     // back: the shell's connectedCallback updates the page
  page.update(el, ctx);
  assert.ok(el._media.timer);
  now += 10_000;
  t.mock.timers.tick(1000);
  assert.equal(text(el.querySelector(".pos")), "2:33", "time advances again");
});

test("progress ticker: only while playing and on the Media tab", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const paused = mount(ctxWith({ routeId: "living_room", changes: { [SPEAKER]: speaker("paused") } }));
  assert.equal(paused._media.timer, null);
  const ctx = ctxWith({ routeId: "living_room", cfg: { ...config, sound: SOUND } });
  const el = mount(ctx);
  assert.ok(el._media.timer);
  el.querySelector('.seg [data-tab="sound"]').click();
  assert.equal(el._media.timer, null, "no ticks behind the Sound tab");
  el.querySelector('.seg [data-tab="media"]').click();
  assert.ok(el._media.timer);
  ctx.hass = hassOf(states({ [SPEAKER]: speaker("paused") }));
  page.update(el, ctx);
  assert.equal(el._media.timer, null, "paused: stopped");
});

test("artwork that fails to load: the music icon instead; a new picture is tried again", () => {
  const ctx = ctxWith({ routeId: "living_room" });
  const el = mount(ctx);
  const img = el.querySelector(".art img");
  const icon = el.querySelector(".art ha-icon");
  assert.ok(!img.hidden && icon.hidden);
  img.dispatchEvent(new Event("error"));
  assert.ok(img.hidden && !icon.hidden);
  page.update(el, ctx);
  assert.ok(img.hidden, "the broken picture stays hidden on the next update");
  ctx.hass = hassOf(states({ [SPEAKER]: speaker("playing", { entity_picture: "/api/media_player_proxy/y" }) }));
  page.update(el, ctx);
  assert.ok(!img.hidden && icon.hidden);
});

test("power: shown when the player can turn off (or on, while off); a tap turns it off or on at once", () => {
  const ctx = ctxWith({ routeId: "living_room", changes: { [SPEAKER]: speaker("playing", { supported_features: 1 | 256 }) } });
  const el = mount(ctx);
  const power = el.querySelector(".power");
  assert.equal(power.hidden, false);
  assert.equal(power.getAttribute("aria-pressed"), "true");
  assert.equal(power.getAttribute("aria-label"), "Turn off");
  power.click();
  assert.deepEqual(ctx.raw.calls.at(-1), ["media_player", "turn_off", { entity_id: SPEAKER }]);
  assert.equal(power.getAttribute("aria-pressed"), "false", "optimistic: off before Home Assistant reports it");

  const off = ctxWith({ routeId: "living_room", changes: { [SPEAKER]: speaker("off", { supported_features: 128 | 256 }) } });
  const offEl = mount(off);
  assert.equal(offEl.querySelector(".power").getAttribute("aria-label"), "Turn on");
  offEl.querySelector(".power").click();
  assert.deepEqual(off.raw.calls.at(-1), ["media_player", "turn_on", { entity_id: SPEAKER }]);

  const cannot = mount(ctxWith({ routeId: "living_room", changes: { [SPEAKER]: speaker("playing", { supported_features: 1 }) } }));
  assert.equal(cannot.querySelector(".power").hidden, true, "no turn_off: no power button");
  const offOnly = mount(ctxWith({ routeId: "living_room", changes: { [SPEAKER]: speaker("off", { supported_features: 256 }) } }));
  assert.equal(offOnly.querySelector(".power").hidden, true, "off and no turn_on: nothing to press");
});

test("players HA places in an area are offered after the home's own, unavailable and hidden ones left out", () => {
  const SONOS = "media_player.office_speaker";
  const hass = hassOf(states({
    [SONOS]: st("idle", { friendly_name: "Office speaker", supported_features: ALL }),
    "media_player.old_box": st("unavailable", { friendly_name: "Old box" }),
    "media_player.hidden_one": st("idle", { friendly_name: "Hidden" }),
    "media_player.elsewhere": st("idle", { friendly_name: "Garage" }),
  }));
  hass.devices = { d_sonos: { id: "d_sonos", area_id: "office" } };
  hass.entities = {
    [SONOS]: { entity_id: SONOS, device_id: "d_sonos" },
    "media_player.old_box": { entity_id: "media_player.old_box", area_id: "office" },
    "media_player.hidden_one": { entity_id: "media_player.hidden_one", area_id: "office", hidden: true },
    "media_player.elsewhere": { entity_id: "media_player.elsewhere", area_id: "garage" },
    [SPEAKER]: { entity_id: SPEAKER, area_id: "living_room" },
  };
  const ids = playersOf(config, hass).map((p) => p.id);
  assert.deepEqual(ids, [SPEAKER, BEDROOM, SONOS], "the named ones first, once each; the office's by its device's area");
  assert.equal(playersOf(config, hass).find((p) => p.id === SONOS).room.id, "office");
  assert.deepEqual(playersOf(config).map((p) => p.id), [SPEAKER, BEDROOM], "without hass: the named ones");
});

test("input: a button with the current source when the player can select one of several; a pick selects it at once", async () => {
  const sources = { supported_features: ALL | 2048, source: "Radio 357", source_list: ["Radio 357", "Radio Nowy Świat"] };
  const ctx = ctxWith({ routeId: "living_room", changes: { [SPEAKER]: speaker("playing", sources) } });
  const el = mount(ctx);
  const input = el.querySelector(".input");
  assert.equal(input.hidden, false);
  assert.equal(text(input.querySelector(".v")), "Radio 357");
  assert.ok(!text(el.querySelector(".src .line")).includes("Radio 357"), "the source is not said twice");
  input.click();
  const spec = ctx.sheets.at(-1);
  assert.equal(spec.kind, "sources");
  assert.equal(spec.player, SPEAKER);
  const sheet = sourceSheet.render(ctx, spec);
  assert.deepEqual(texts(sheet, ".row span"), ["Radio 357", "Radio Nowy Świat"]);
  assert.deepEqual([...sheet.querySelectorAll(".row")].map((r) => r.getAttribute("aria-pressed")), ["true", "false"]);
  sheet.querySelectorAll(".row")[1].click();
  assert.deepEqual(ctx.raw.calls.at(-1), ["media_player", "select_source", { entity_id: SPEAKER, source: "Radio Nowy Świat" }]);
  assert.equal(text(input.querySelector(".v")), "Radio Nowy Świat", "optimistic: the new input before HA reports it");

  for (const attrs of [{ supported_features: ALL, source_list: ["A", "B"] }, { supported_features: ALL | 2048, source_list: ["A"] },
    { supported_features: ALL | 2048 }]) {
    const other = mount(ctxWith({ routeId: "living_room", changes: { [SPEAKER]: speaker("playing", attrs) } }));
    assert.equal(other.querySelector(".input").hidden, true, JSON.stringify(attrs));
  }
});
