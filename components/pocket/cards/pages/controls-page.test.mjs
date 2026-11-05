// The Controls page and its Status view (pages/controls-page.js, lib/controls.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as page from "./controls-page.js";
import { groupedByArea, timerLeft } from "../lib/controls.js";
import { config, st, baseStates, hassOf, ctxOf, text, texts } from "../testing/demo-home.mjs";

function controlsHass(extra = {}) {
  const hass = hassOf({ ...baseStates(),
    "media_player.living_room_speaker": st("playing", { friendly_name: "Living room speaker", media_title: "Song",
      supported_features: 16 | 32 | 1 | 16384 | 4 | 128 | 256, volume_level: 0.3 }),
    "cover.terrace_awning": st("closed", { friendly_name: "Terrace awning", device_class: "awning", supported_features: 1 | 2 | 8 }),
    "cover.bedroom_blind": st("open", { friendly_name: "Bedroom blind", current_position: 40, supported_features: 1 | 2 | 4 | 8 }),
    "timer.kitchen": st("active", { friendly_name: "Kitchen timer", finishes_at: new Date(Date.now() + 125000).toISOString(), duration: "0:05:00" }),
    "binary_sensor.front_door": st("on", { friendly_name: "Front door", device_class: "door" }),
    "binary_sensor.motion": st("off", { device_class: "motion" }),
    ...extra });
  hass.entities = {
    "cover.terrace_awning": { entity_id: "cover.terrace_awning", area_id: "living_room" },
    "cover.bedroom_blind": { entity_id: "cover.bedroom_blind", area_id: "bedroom" },
  };
  return hass;
}

const mount = (ctx) => {
  const el = page.render(ctx);
  document.body.append(el);
  return el;
};

test("Controls: music, covers by area, timers, lights — each a section when the home has it", () => {
  const ctx = ctxOf({ hass: controlsHass() });
  const el = mount(ctx);
  assert.deepEqual(texts(el, ".views button"), ["Controls", "Status"]);
  assert.deepEqual([...el.querySelectorAll(".controls-pane > section")].filter((s) => !s.hidden).map((s) => s.className),
    ["music", "covers", "timers", "lights"]);
  assert.equal(text(el.querySelector(".music .t1")), "Song");
  assert.deepEqual(texts(el, ".covers h4"), ["Living room", "Bedroom"]);
  assert.equal(text(el.querySelector('[data-entity="cover.bedroom_blind"] small')), "Open 40 %");
  el.querySelector('[data-entity="cover.terrace_awning"] [data-act="open"]').click();
  assert.deepEqual(ctx.raw.calls.at(-1), ["cover", "open_cover", { entity_id: "cover.terrace_awning" }]);
  el.querySelector('.covers [data-all="close"]').click();
  assert.deepEqual(ctx.raw.calls.at(-1)[1], "close_cover");
  assert.match(text(el.querySelector('[data-entity="timer.kitchen"] small')), /Running · 2:0[45]/);
  el.querySelector('[data-entity="timer.kitchen"] [data-act="toggle"]').click();
  assert.deepEqual(ctx.raw.calls.at(-1), ["timer", "pause", { entity_id: "timer.kitchen" }]);
  el.querySelector('.music [data-act="next"]').click();
  assert.deepEqual(ctx.raw.calls.at(-1), ["media_player", "media_next_track", { entity_id: "media_player.living_room_speaker" }]);
  assert.ok(el.querySelectorAll(".lights pocket-light-tile").length > 0);
  el.remove();
});

test("Status: covers, doors and windows, lights per room, read-only; a tile of something to act on goes to Controls", () => {
  const ctx = ctxOf({ hass: controlsHass(), routeId: "status" });
  const el = mount(ctx);
  assert.equal(el.querySelector(".controls-pane").hidden, true);
  assert.deepEqual(texts(el, ".status-pane h3"), ["Covers", "Doors and windows", "Lights"]);
  const door = el.querySelector('.st[data-entity="binary_sensor.front_door"]');
  assert.equal(text(door.querySelector(".v")), "Open");
  assert.ok(door.classList.contains("active"));
  door.click();
  assert.equal(ctx.sheets.at(-1).kind, "trend");
  el.querySelector('.st[data-entity="cover.bedroom_blind"]').click();
  assert.deepEqual(ctx.routes.at(-1), "#/controls");
  el.remove();
});

test("an empty home: one line instead of empty sections", () => {
  const cfg = { ...config, rooms: config.rooms.map(({ lights: _l, media: _m, ...room }) => room) };
  const el = mount(ctxOf({ cfg }));
  assert.equal(el.querySelector(".none").hidden, false);
  el.remove();
});

test("time left: an active timer's end, a paused one's remaining, an idle one's duration", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(timerLeft(st("active", { finishes_at: "2026-11-05T12:01:05Z" }), now), 65);
  assert.equal(timerLeft(st("paused", { remaining: "0:02:00" }), now), 120);
  assert.equal(timerLeft(st("idle", { duration: "1:00:00" }), now), 3600);
  assert.deepEqual(groupedByArea(controlsHass(), config, null, ["cover.bedroom_blind", "cover.terrace_awning"]).map((g) => g.name),
    ["Living room", "Bedroom"]);
});
