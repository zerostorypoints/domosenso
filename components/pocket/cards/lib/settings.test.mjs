import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, KEY, loadSettings, readSettings, saveSettings, withDefaults } from "./settings.js";

// A hass whose callWS keeps the frontend user data in memory and records every call.
function hassWith(store = {}) {
  const calls = [];
  return {
    calls,
    store,
    callWS: async (msg) => {
      calls.push(msg);
      if (msg.type === "frontend/get_user_data") return { value: store[msg.key] ?? null };
      if (msg.type === "frontend/set_user_data") { store[msg.key] = msg.value; return null; }
      throw new Error(`unexpected ${msg.type}`);
    },
  };
}

test("the defaults: Home, Areas, Climate, Media, Settings on the bar", () => {
  assert.equal(KEY, "domosenso-pocket");
  assert.deepEqual([...DEFAULTS.bar], ["home", "areas", "climate", "media", "settings"]);
});

test("nothing stored: the defaults; the read asks for the pocket's key", async () => {
  const hass = hassWith();
  assert.deepEqual(await loadSettings(hass), { bar: ["home", "areas", "climate", "media", "settings"] });
  assert.deepEqual(hass.calls, [{ type: "frontend/get_user_data", key: "domosenso-pocket" }]);
});

test("a stored bar wins; other stored fields are kept", async () => {
  const hass = hassWith({ "domosenso-pocket": { bar: ["home", "power"], theme: "dark" } });
  assert.deepEqual(await loadSettings(hass), { bar: ["home", "power"], theme: "dark" });
});

test("a failing call, no callWS, or a value of the wrong shape: the defaults", async () => {
  const failing = { callWS: () => Promise.reject(new Error("unknown command")) };
  assert.deepEqual((await loadSettings(failing)).bar, [...DEFAULTS.bar]);
  assert.deepEqual((await loadSettings({})).bar, [...DEFAULTS.bar]);
  assert.deepEqual((await loadSettings(undefined)).bar, [...DEFAULTS.bar]);
  assert.deepEqual((await loadSettings(hassWith({ "domosenso-pocket": "x" }))).bar, [...DEFAULTS.bar]);
  assert.deepEqual(withDefaults({ bar: "home" }).bar, [...DEFAULTS.bar]);
  assert.deepEqual(withDefaults({ bar: [1] }).bar, [...DEFAULTS.bar]);
});

test("the defaults are not shared: a change to a loaded value leaves them", async () => {
  const settings = await loadSettings(hassWith());
  settings.bar.push("plants");
  assert.deepEqual([...DEFAULTS.bar], ["home", "areas", "climate", "media", "settings"]);
});

test("save merges the patch into what is stored and returns the merged settings", async () => {
  const hass = hassWith({ "domosenso-pocket": { theme: "dark" } });
  const saved = await saveSettings(hass, { bar: ["home", "plants", "settings"] });
  assert.deepEqual(saved, { bar: ["home", "plants", "settings"], theme: "dark" });
  assert.deepEqual(hass.store["domosenso-pocket"], { theme: "dark", bar: ["home", "plants", "settings"] });
  assert.deepEqual(hass.calls.at(-1),
    { type: "frontend/set_user_data", key: "domosenso-pocket", value: { theme: "dark", bar: ["home", "plants", "settings"] } });
});

test("save without a connection or with a failing write rejects", async () => {
  await assert.rejects(saveSettings({}, { bar: [] }));
  const hass = { callWS: (msg) => msg.type === "frontend/set_user_data" ? Promise.reject(new Error("no")) : Promise.resolve({ value: null }) };
  await assert.rejects(saveSettings(hass, { bar: [] }));
});

test("save whose read fails rejects and writes nothing: the other stored fields stay", async () => {
  const calls = [];
  const hass = { callWS: (msg) => {
    calls.push(msg.type);
    return msg.type === "frontend/get_user_data" ? Promise.reject(new Error("lost")) : Promise.resolve(null);
  } };
  await assert.rejects(saveSettings(hass, { bar: ["home"] }));
  assert.deepEqual(calls, ["frontend/get_user_data"]);
});

test("save with nothing stored yet ({value: null}) starts from the patch, defaults merged", async () => {
  const hass = hassWith();
  const saved = await saveSettings(hass, { theme: "dark" });
  assert.deepEqual(hass.store["domosenso-pocket"], { theme: "dark" });
  assert.deepEqual(saved, { bar: [...DEFAULTS.bar], theme: "dark" });
});

test("readSettings rejects on a failed call; nothing stored or no callWS: the defaults", async () => {
  await assert.rejects(readSettings({ callWS: () => Promise.reject(new Error("no")) }));
  assert.deepEqual((await readSettings(hassWith())).bar, [...DEFAULTS.bar]);
  assert.deepEqual((await readSettings({})).bar, [...DEFAULTS.bar]);
});
