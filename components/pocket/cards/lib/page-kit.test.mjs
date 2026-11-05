// The facts about a room's lights (lib/page-kit.js): a room names one light or group, or several
// (P3: the home inputs' `lights` may be a list, as the Ramka lists them).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lampsOf, lightsOf } from "./page-kit.js";

const st = (state, attributes = {}) => ({ state, attributes });

test("lights: one entity or several, empty without", () => {
  assert.deepEqual(lightsOf({ lights: "light.living_room" }), ["light.living_room"]);
  assert.deepEqual(lightsOf({ lights: ["light.ceiling", "light.reading_lamp"] }), ["light.ceiling", "light.reading_lamp"]);
  assert.deepEqual(lightsOf({}), []);
});

test("lamps: a group's available members; several lights are each a lamp", () => {
  const hass = { states: {
    "light.living_room": st("on", { entity_id: ["light.a", "light.b", "light.gone"] }),
    "light.a": st("on"), "light.b": st("off"), "light.gone": st("unavailable"),
    "light.ceiling": st("on"), "light.reading_lamp": st("off"),
  } };
  assert.deepEqual(lampsOf(hass, { lights: "light.living_room" }), ["light.a", "light.b"]);
  assert.deepEqual(lampsOf(hass, { lights: ["light.ceiling", "light.reading_lamp"] }), ["light.ceiling", "light.reading_lamp"]);
});
