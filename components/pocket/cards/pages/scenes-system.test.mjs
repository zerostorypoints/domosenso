// The Scenes page and its picker (pages/scenes-page.js, lib/scene-sheet.js, lib/scenes.js) and the
// System page (pages/system-page.js, lib/system.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as scenesPage from "./scenes-page.js";
import * as systemPage from "./system-page.js";
import * as sceneSheet from "../lib/scene-sheet.js";
import { allScenes, chosenScenes } from "../lib/scenes.js";
import { systemOf, BACKUP_FAIR } from "../lib/system.js";
import { sectionsOf } from "../lib/sections.js";
import { config, st, baseStates, hassOf, ctxOf, text, texts } from "../testing/demo-home.mjs";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function scenesHass() {
  const hass = hassOf({ ...baseStates(),
    "scene.kitchen_cook": st("2026-11-01T10:00:00", { friendly_name: "Kitchen Cook" }),
    "scene.office_focus": st("unknown", { friendly_name: "Office Focus" }),
    "scene.hidden_one": st("unknown", { friendly_name: "Hidden" }),
    "scene.loose": st("unknown", { friendly_name: "Party" }) });
  hass.areas = { kitchen: { area_id: "kitchen", name: "Kitchen" } };
  hass.entities = {
    "scene.kitchen_cook": { entity_id: "scene.kitchen_cook", area_id: "kitchen" },
    "scene.office_focus": { entity_id: "scene.office_focus", area_id: "office" },
    "scene.hidden_one": { entity_id: "scene.hidden_one", area_id: "office", hidden: true },
  };
  return hass;
}

function withSettings(ctx, settings = {}) {
  ctx.settings = settings;
  ctx.saves = [];
  ctx.saveSettings = (patch) => {
    ctx.saves.push(patch);
    ctx.settings = { ...ctx.settings, ...patch };
    return Promise.resolve(ctx.settings);
  };
  return ctx;
}

test("every listed scene by area: the pocket's areas in order, then HA's other areas, then none", () => {
  const groups = allScenes(scenesHass(), config);
  assert.deepEqual(groups.map((g) => [g.name, g.scenes]), [
    ["Living room", ["scene.living_room_bright", "scene.living_room_relax"]],
    ["Office", ["scene.office_focus"]],
    ["Kitchen", ["scene.kitchen_cook"]],
    ["", ["scene.loose"]],
  ]);
});

test("until a person chooses, the scenes the home inputs name; then theirs", () => {
  assert.deepEqual(chosenScenes({}, config), ["scene.living_room_relax", "scene.living_room_bright"]);
  assert.deepEqual(chosenScenes({ scenes: [] }, config), []);
});

test("the page: chosen scenes by area, named without the area; a tap activates one at once", () => {
  const ctx = withSettings(ctxOf({ hass: scenesHass() }), { scenes: ["scene.kitchen_cook", "scene.living_room_relax"] });
  const el = scenesPage.render(ctx);
  assert.deepEqual(texts(el, "h3"), ["Living room", "Kitchen"]);
  assert.deepEqual(texts(el, ".scene span"), ["Relax", "Cook"]);
  el.querySelector('[data-scene="scene.kitchen_cook"]').click();
  assert.deepEqual(ctx.raw.calls.at(-1), ["scene", "turn_on", { entity_id: "scene.kitchen_cook" }]);
  assert.ok(el.querySelector('[data-scene="scene.kitchen_cook"]').classList.contains("done"));
  const none = scenesPage.render(withSettings(ctxOf({ hass: scenesHass() }), { scenes: [] }));
  assert.equal(none.querySelector(".empty").hidden, false);
  none.querySelector(".choose").click();
});

test("the picker: every scene with a switch; a switch shows at once and saves the person's choice", async () => {
  const ctx = withSettings(ctxOf({ hass: scenesHass() }));
  const sheet = sceneSheet.render(ctx);
  const rows = [...sheet.querySelectorAll(".row")];
  assert.deepEqual(rows.map((r) => r.dataset.scene), ["scene.living_room_bright", "scene.living_room_relax",
    "scene.office_focus", "scene.kitchen_cook", "scene.loose"]);
  assert.deepEqual(rows.map((r) => r.getAttribute("aria-checked")), ["true", "true", "false", "false", "false"]);
  rows[3].click();
  assert.equal(rows[3].getAttribute("aria-checked"), "true");
  await tick();
  assert.deepEqual(ctx.saves, [{ scenes: ["scene.living_room_relax", "scene.living_room_bright", "scene.kitchen_cook"] }]);
  rows[1].click();
  await tick();
  assert.deepEqual(ctx.saves.at(-1), { scenes: ["scene.living_room_bright", "scene.kitchen_cook"] });
});

function systemHass({ last = "2026-11-03T04:19:33+00:00", attempted = "2026-11-03T04:16:32+00:00" } = {}) {
  const hass = hassOf({ ...baseStates(),
    "update.router": st("on", { friendly_name: "Router update", installed_version: "1.0", latest_version: "1.1" }),
    "update.card": st("off", { friendly_name: "Card update" }),
    "sensor.backup_last_successful_automatic_backup": st(last),
    "sensor.backup_last_attempted_automatic_backup": st(attempted),
    "sensor.backup_backup_manager_state": st("idle"),
    "sensor.amp_power": st("unavailable"), "sensor.amp_volume": st("unavailable"),
    "sensor.lamp_power": st(5) });
  hass.devices = { d_amp: { id: "d_amp", name: "Amplifier", area_id: "living_room" }, d_lamp: { id: "d_lamp", name: "Lamp" } };
  hass.areas = { living_room: { name: "Living room" } };
  hass.entities = {
    "sensor.amp_power": { entity_id: "sensor.amp_power", device_id: "d_amp" },
    "sensor.amp_volume": { entity_id: "sensor.amp_volume", device_id: "d_amp" },
    "sensor.lamp_power": { entity_id: "sensor.lamp_power", device_id: "d_lamp" },
  };
  return hass;
}

test("system: updates waiting, the backup's age and failure, devices that read nothing", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  const sys = systemOf(systemHass(), now);
  assert.deepEqual(sys.updates, ["update.router"]);
  assert.equal(sys.backup.failed, false);
  assert.equal(sys.tone, null, "an update and a silent device are news, not a problem");
  assert.deepEqual(sys.silent.map((d) => [d.name, d.area]), [["Amplifier", "Living room"]]);
  assert.equal(systemOf(systemHass(), now + BACKUP_FAIR).tone, "fair");
  assert.equal(systemOf(systemHass({ attempted: "2026-11-04T04:16:32+00:00" }), now).tone, "poor", "the last attempt failed");
});

test("the System page and its tile", () => {
  const ctx = ctxOf({ hass: systemHass() });
  const el = systemPage.render(ctx);
  assert.deepEqual(texts(el, ".updates .row .n"), ["Router update"]);
  assert.equal(text(el.querySelector(".updates .row small")), "1.0 → 1.1");
  assert.deepEqual(texts(el, ".silent .row .n"), ["Amplifier"]);
  assert.equal(el.querySelector(".admin").hidden, true, "not an administrator");
  const tile = sectionsOf(ctx).find((s) => s.page === "system");
  assert.equal(tile.route, "#/system");
  assert.equal(tile.head, "1 update");
  assert.match(tile.status, /^Backup /);
});
