import { test } from "node:test";
import assert from "node:assert/strict";
import { createOptimistic } from "./optimistic.js";

const st = (state, attributes = {}) => ({ state, attributes });
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function hassOf(states, answer = () => Promise.resolve()) {
  const calls = [];
  return { calls, states, callService: (...args) => { calls.push(args); return answer(); } };
}

function storeOf(options) {
  const reports = [];
  const store = createOptimistic({ report: (el, key) => reports.push([el, key]), ...options });
  let redraws = 0;
  store.onChange = () => { redraws += 1; };
  return { store, reports, redraws: () => redraws };
}

const send = (store, hass, expect, extra = {}) => store.send("el", hass,
  { domain: "light", service: "turn_off", data: { entity_id: Object.keys(expect) }, errorKey: "card.pocket.error.light", expect, ...extra });

test("nothing sent: the view is Home Assistant's own object", () => {
  const { store } = storeOf();
  const hass = hassOf({ "light.a": st("on") });
  assert.equal(store.view(hass), hass);
});

test("a send calls the service on the real hass, shows the expected state at once and redraws", () => {
  const { store, redraws } = storeOf();
  const hass = hassOf({ "light.a": st("on", { brightness: 200 }), "sensor.t": st("21") });
  send(store, hass, { "light.a": { state: "off" } });
  assert.deepEqual(hass.calls, [["light", "turn_off", { entity_id: ["light.a"] }]]);
  assert.equal(redraws(), 1);
  const view = store.view(hass);
  assert.equal(view.states["light.a"].state, "off");
  assert.equal(view.states["sensor.t"], hass.states["sensor.t"], "other states untouched");
  assert.equal(view.callService, hass.callService);
  assert.equal(store.view(view), view, "a view of the view is the same view");
  assert.ok(store.pending("light.a"));
});

test("the report confirms; an update from the view never confirms by itself", () => {
  const { store } = storeOf();
  const hass = hassOf({ "light.a": st("on") });
  send(store, hass, { "light.a": { state: "off" } });
  assert.equal(store.update(store.view(hass)), false, "the view's own state is not a report");
  assert.ok(store.pending("light.a"));
  assert.equal(store.update(hassOf({ "light.a": st("off") })), true);
  assert.ok(!store.pending("light.a"));
});

test("brightness matches within the 0-255 rounding", () => {
  const { store } = storeOf();
  const hass = hassOf({ "light.a": st("on", { brightness: 255 }) });
  send(store, hass, { "light.a": { state: "on", attributes: { brightness: 128 } } }, { service: "turn_on" });
  assert.equal(store.view(hass).states["light.a"].attributes.brightness, 128);
  store.update(hassOf({ "light.a": st("on", { brightness: 200 }) }));    // on its way
  assert.ok(store.pending("light.a"));
  store.update(hassOf({ "light.a": st("on", { brightness: 130 }) }));
  assert.ok(!store.pending("light.a"));
});

test("a third state is followed at once; the state before the call keeps waiting", () => {
  const { store } = storeOf();
  const hass = hassOf({ "media_player.p": st("playing"), "light.a": st("on") });
  store.send("el", hass, { domain: "media_player", service: "media_play_pause", data: {}, errorKey: "card.pocket.error.media",
    expect: { "media_player.p": { state: "paused" }, "light.a": { state: "off" } } });
  store.update(hassOf({ "media_player.p": st("idle"), "light.a": st("on", { brightness: 3 }) }));
  assert.ok(!store.pending("media_player.p"), "idle on pause: Home Assistant has spoken");
  assert.ok(store.pending("light.a"), "still on: a group switching member by member");
});

test("a light group expects its available members to follow", () => {
  const { store } = storeOf();
  const hass = hassOf({
    "light.g": st("on", { entity_id: ["light.m1", "light.m2", "light.m3"] }),
    "light.m1": st("on"), "light.m2": st("off"), "light.m3": st("unavailable") });
  send(store, hass, { "light.g": { state: "off" } });
  assert.ok(store.pending("light.m1"));
  assert.ok(!store.pending("light.m2"), "already off");
  assert.ok(!store.pending("light.m3"), "unavailable: it cannot follow");
  assert.equal(store.view(hass).states["light.m1"].state, "off");
});

test("a state that is already the expected one is not held", () => {
  const { store } = storeOf();
  const hass = hassOf({ "light.a": st("off") });
  send(store, hass, { "light.a": { state: "off" } });
  assert.ok(!store.pending("light.a"));
  assert.equal(store.view(hass), hass);
});

test("changed: true waits for any new state (a scene's time of running)", () => {
  const { store } = storeOf();
  const hass = hassOf({ "scene.s": st("2026-11-01T20:00:00") });
  store.send("el", hass, { domain: "scene", service: "turn_on", data: {}, errorKey: "card.pocket.error.scene",
    expect: { "scene.s": { changed: true } } });
  assert.ok(store.pending("scene.s"));
  assert.equal(store.view(hass).states["scene.s"], hass.states["scene.s"], "its state is not invented");
  store.update({ ...hass });
  assert.ok(store.pending("scene.s"), "the same state object: not yet");
  store.update(hassOf({ "scene.s": st("2026-11-05T20:00:00") }));
  assert.ok(!store.pending("scene.s"));
});

test("a failed call rolls back and reports once, with the element and the key", async () => {
  const { store, reports, redraws } = storeOf({ timeoutMs: 20 });
  const hass = hassOf({ "light.a": st("on") }, () => Promise.reject(new Error("no")));
  send(store, hass, { "light.a": { state: "off" } });
  await tick();
  assert.ok(!store.pending("light.a"));
  assert.equal(store.view(hass), hass);
  assert.equal(redraws(), 2);
  await tick(30);
  assert.deepEqual(reports, [["el", "card.pocket.error.light"]], "no second report from the wait");
});

test("a call that throws at once is a failure too", async () => {
  const { store, reports } = storeOf();
  const hass = hassOf({ "light.a": st("on") });
  hass.callService = () => { throw new Error("sync"); };
  send(store, hass, { "light.a": { state: "off" } });
  await tick();
  assert.deepEqual(reports, [["el", "card.pocket.error.light"]]);
});

test("no report within timeoutMs: rolled back with the toast; a confirmed call reports nothing", async () => {
  const { store, reports } = storeOf({ timeoutMs: 20 });
  const hass = hassOf({ "light.a": st("on"), "light.b": st("on") });
  send(store, hass, { "light.a": { state: "off" } });
  send(store, hass, { "light.b": { state: "off" } });
  store.update(hassOf({ "light.a": st("off"), "light.b": st("on") }));
  await tick(40);
  assert.ok(!store.pending("light.b"));
  assert.deepEqual(reports, [["el", "card.pocket.error.light"]], "only light.b's call");
});

test("a later send for the same entity takes it over: the earlier one no longer reports", async () => {
  const { store, reports } = storeOf({ timeoutMs: 20 });
  const hass = hassOf({ "light.a": st("off") });
  send(store, hass, { "light.a": { state: "on" } }, { service: "turn_on" });
  store.timeoutMs = 60;
  send(store, hass, { "light.a": { state: "on", attributes: { brightness: 50 } } }, { service: "turn_on" });
  await tick(35);
  assert.ok(store.pending("light.a"), "the second call still waits");
  assert.deepEqual(reports, []);
});
