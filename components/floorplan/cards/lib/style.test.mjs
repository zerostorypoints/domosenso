import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STYLE } from "./style.js";

// Every class the card gives an svg element by name has a rule: a rule lost in an edit (0.3.1's
// open-space walls) leaves the element drawn without a stroke, which no other test sees.
test("every class the card draws has a rule in the stylesheet", () => {
  const card = readFileSync(new URL("../floorplan-card.js", import.meta.url), "utf8");
  const drawn = [...new Set([...card.matchAll(/class: "([a-z-]+)"/g)].map((m) => m[1]))];
  assert.ok(drawn.includes("open-wall") && drawn.includes("open-wall-mask"), drawn.join());
  const missing = drawn.filter((name) => !new RegExp(`\\.${name}(?![a-z-])`).test(STYLE));
  assert.deepEqual(missing, []);
});

// A halo on svg text is a stroke in the plan's metres (vector-effect does not reach text): its width is an
// attribute scaled by the card (3 px), never a CSS width, which would be read as metres and override it.
test("no text halo has a CSS stroke width", () => {
  for (const name of ["range-name", "sample-label"]) {
    const rule = STYLE.match(new RegExp(`\\.${name} \\{[^}]*\\}`))[0];
    assert.ok(!/stroke-width/.test(rule), rule);
  }
});
