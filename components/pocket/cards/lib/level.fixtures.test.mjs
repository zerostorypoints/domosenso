// The shared assessment fixtures (tests/fixtures/assessment.json, decision D1 of
// docs/2026-11-05-shared-home-decisions.md): every case through level(). The same file is run by the
// Python reference (tests/test_assessment_fixtures.py), so the two cannot drift apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { level } from "./level.js";

const fixtures = JSON.parse(readFileSync(new URL("../../../../tests/fixtures/assessment.json", import.meta.url), "utf8"));
// JSON cannot hold a non-finite number; the fixtures write it as the string "NaN".
const numberOf = (v) => (v === "NaN" ? Number.NaN : v);

test("the fixtures have a version and cases", () => {
  assert.equal(fixtures.version, 1);
  assert.ok(fixtures.cases.length >= 20);
});

for (const c of fixtures.cases) {
  test(`fixture: ${c.name}`, () => {
    assert.deepEqual(level(numberOf(c.value), c.kind, c.limits), c.expected);
  });
}

// Decision D5: whether a control acts (operable) and whether the state is a value to show (GONE).
import { GONE, operable } from "./page-kit.js";

const operability = JSON.parse(readFileSync(new URL("../../../../tests/fixtures/operability.json", import.meta.url), "utf8"));
for (const c of operability.cases) {
  test(`operability fixture: ${c.name}`, () => {
    const state = c.state == null ? undefined : { entity_id: `${c.domain}.x`, state: c.state };
    assert.equal(operable(state), c.expected.operable);
    assert.equal(!state || GONE.has(state.state) ? "none" : "value", c.expected.shown);
  });
}
