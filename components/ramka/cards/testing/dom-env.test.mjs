// The guard in dom-env.mjs is installed: a failing assert on a happy-dom node must never print the
// node in full (it grows to gigabytes). Checked without failing on a node, which is the hazard itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import assertLoose from "node:assert";
import { inspect } from "node:util";
import "./dom-env.mjs";

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
});
