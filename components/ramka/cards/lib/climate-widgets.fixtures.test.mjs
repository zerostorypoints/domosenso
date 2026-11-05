// The shared assessment cases (tests/fixtures/assessment.json, decision D1 of
// docs/2026-11-05-shared-home-decisions.md) through the Ramka's own evaluation, so the wall and
// Pocket reach the same level on the same reading: band() for a comfort range, level() for a
// reading that is worse as it rises. The air score (falling) is the air-card's ordered levels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { band, level } from "./climate-widgets.js";

const fixtures = JSON.parse(readFileSync(new URL("../../../../tests/fixtures/assessment.json", import.meta.url), "utf8"));
const numberOf = (v) => (v === "NaN" ? Number.NaN : v);

// The Ramka's words in the shared shape: low / within / high, good / fair / poor.
function ramka(value, kind, limits) {
  if (limits == null || typeof limits !== "object") return null;
  if (kind === "range") {
    const b = band(value, limits.low, limits.high);
    return b == null ? null : b === "within" ? { level: "good" } : { level: "poor", side: b };
  }
  if (kind === "rising") {
    const l = level(value, limits.fair, limits.poor);
    return l == null ? null : { level: l };
  }
  return undefined;   // not the Ramka's evaluation
}

for (const c of fixtures.cases) {
  const got = ramka(numberOf(c.value), c.kind, c.limits);
  if (got === undefined) continue;
  test(`shared case through the Ramka: ${c.name}`, () => assert.deepEqual(got, c.expected));
}
