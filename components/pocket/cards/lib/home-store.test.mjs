import { test } from "node:test";
import assert from "node:assert/strict";
import { saveArea, markPicked, normalize, watchHome, EMPTY, KEY } from "./home-store.js";

// A Home Assistant whose system data answers after a delay, as over a websocket.
function slowHass() {
  let value = null;
  const calls = [];
  const later = (result) => new Promise((resolve) => setTimeout(() => resolve(result), 5));
  return { calls, get value() { return value; }, callWS: (msg) => {
    calls.push(msg.type);
    if (msg.type === "frontend/get_system_data") return later({ value });
    value = msg.value;
    return later(null);
  } };
}

test("writes started together run one after another: none is lost", async () => {
  const hass = slowHass();
  await Promise.all([
    markPicked(hass, "kitchen", "climate"),
    markPicked(hass, "hall", "air", "dev1"),
    saveArea(hass, "kitchen", { type: "outside" }),
    saveArea(hass, "kitchen", { checked: false }),
  ]);
  assert.deepEqual(hass.value.picked, { kitchen: ["climate"], hall: ["air"] });
  assert.deepEqual(hass.value.areas, { hall: { air: "dev1" }, kitchen: { type: "outside", checked: false } });
});

test("a failed write rejects and the next one still runs", async () => {
  const hass = slowHass();
  const failing = { callWS: () => Promise.reject(new Error("refused")) };
  await assert.rejects(saveArea(failing, "x", { type: "inside" }));
  await saveArea(hass, "x", { type: "inside" });
  assert.deepEqual(hass.value.areas.x, { type: "inside" });
});

test("normalize keeps what it knows; watchHome gives the value and EMPTY without a connection", async () => {
  assert.deepEqual(normalize({ areas: { a: { type: "none", checked: "no" } }, picked: { a: ["air", 3] } }),
    { areas: { a: { type: "none" } }, picked: { a: ["air"] }, auto: {} });
  const seen = [];
  watchHome({}, (v) => seen.push(v));
  assert.deepEqual(seen, [EMPTY]);
  const messages = [];
  const stop = watchHome({ connection: { subscribeMessage: (cb, msg) => { messages.push(msg); cb({ value: { areas: { b: { type: "outside" } } } }); return Promise.resolve(() => {}); } } },
    (v) => seen.push(v));
  assert.deepEqual(messages, [{ type: "frontend/subscribe_system_data", key: KEY }]);
  assert.deepEqual(seen[1].areas, { b: { type: "outside" } });
  stop();
});
