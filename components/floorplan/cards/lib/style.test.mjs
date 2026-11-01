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
