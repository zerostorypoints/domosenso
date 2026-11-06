import { test } from "node:test";
import assert from "node:assert/strict";
import { localize, nameIn } from "./names.js";

test("a name per language: the chosen one, else English, else the first given", () => {
  const name = { en: "Office", de: "Büro" };
  assert.equal(nameIn(name, "de"), "Büro");
  assert.equal(nameIn(name, "pl"), "Office");
  assert.equal(nameIn({ de: "Büro" }, "pl"), "Büro");
  assert.equal(nameIn("Kitchen", "pl"), "Kitchen");
  assert.equal(nameIn(undefined, "pl"), undefined);
});

test("localize resolves every name in the config, leaves other objects alone, copies", () => {
  const config = { lang: "en", rooms: [{ id: "office", name: { en: "Office", de: "Büro" },
    climate: { temperature: "sensor.t" }, covers: [{ entity: "cover.a", name: { en: "Blind", de: "Rollladen" } }, "cover.b"] }] };
  const local = localize(config, "de");
  assert.equal(local.rooms[0].name, "Büro");
  assert.equal(local.rooms[0].covers[0].name, "Rollladen");
  assert.equal(local.rooms[0].covers[1], "cover.b");
  assert.deepEqual(local.rooms[0].climate, { temperature: "sensor.t" });
  assert.deepEqual(config.rooms[0].name, { en: "Office", de: "Büro" }, "the config itself is not changed");
});
