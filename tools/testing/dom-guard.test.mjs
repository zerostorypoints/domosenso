// The guard of tools/testing/dom-guard.mjs, as a component's dom-env.mjs installs it: a failing
// assert on a happy-dom node must never print the node in full (it grows to gigabytes). Checked
// without failing on a node, which is the hazard itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import assertLoose from "node:assert";
import { inspect } from "node:util";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import "../../components/floorplan/cards/testing/dom-env.mjs";

test("asserts compare happy-dom nodes by identity and name them briefly", () => {
  for (const name of ["equal", "strictEqual", "notStrictEqual", "deepStrictEqual"]) {
    assert.equal(assert[name].name, "guarded", `node:assert/strict ${name}`);
    assert.equal(assertLoose[name].name, "guarded", `node:assert ${name}`);
  }
  const div = document.createElement("div");
  assert.equal(inspect(div), "<div>");
  assert.throws(() => assert.equal(div, null), (e) => e.message.length < 500);
  assert.throws(() => assert.deepStrictEqual([div], [document.createElement("div")]), (e) => e.message.length < 500);
  assert.deepStrictEqual({ a: [div] }, { a: [div] });
  // Without a message a failing assert is still an AssertionError, not a complaint about the message.
  assert.throws(() => assert.equal(1, 2), { name: "AssertionError" });
  assert.throws(() => assert.deepStrictEqual([1], [2]), { name: "AssertionError" });
});

test("every component's dom-env.mjs installs the guard", () => {
  const root = new URL("../../components/", import.meta.url);
  const envs = readdirSync(root).map((id) => new URL(`${id}/cards/testing/dom-env.mjs`, root)).filter((u) => existsSync(u));
  assert.ok(envs.length >= 3);
  for (const env of envs) assert.match(readFileSync(env, "utf8"), /guardAsserts\(window\)/, env.pathname);
});
