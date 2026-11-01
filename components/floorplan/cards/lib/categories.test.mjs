import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { categoryOf, CATEGORIES, PLACEABLE, categoryName } from "./categories.js";

const cases = JSON.parse(readFileSync(new URL("../../../../tests/fixtures/category-cases.json", import.meta.url), "utf8")).cases;

test("every shared case gets the category the Python engine gives it", () => {
  const wrong = cases
    .map((c) => ({ c, got: categoryOf(c.device) }))
    .filter(({ c, got }) => got.id !== c.category || got.marker !== c.marker)
    .map(({ c, got }) => `${c.name}: ${got.id} ${got.marker}, expected ${c.category} ${c.marker}`);
  assert.deepEqual(wrong, []);
});

test("categories come by order, one fallback, names in the three languages", () => {
  const orders = CATEGORIES.map((c) => c.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  assert.equal(CATEGORIES.filter((c) => c.fallback).length, 1);
  assert.ok(!PLACEABLE.some((c) => c.id === "mobile"));
  for (const c of CATEGORIES) for (const lang of ["en", "de", "pl"]) assert.ok(categoryName(c, lang));
  assert.equal(categoryName(CATEGORIES[0], "en-GB"), CATEGORIES[0].names.en);
});
