// Widgets never cut information (plan iteration 2): no card style ellipsizes or clamps text; a
// long text wraps instead. This scans the card sources (cards/*.js, lib/*.js, pages/*.js) as
// no-literals.test.mjs does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const sources = [".", "lib", "pages"].flatMap((dir) =>
  readdirSync(join(here, dir)).filter((f) => f.endsWith(".js")).map((f) => join(dir, f)));
const CUT = /text-overflow\s*:\s*ellipsis|line-clamp/;

test("the scanner flags an ellipsis and a line clamp", () => {
  assert.match(".a { text-overflow: ellipsis; }", CUT);
  assert.match(".a { -webkit-line-clamp: 2; }", CUT);
});

test("no card style ellipsizes or clamps text", () => {
  assert.ok(sources.length > 10);
  const found = [];
  for (const file of sources) {
    readFileSync(join(here, file), "utf8").split("\n").forEach((line, i) => {
      if (CUT.test(line)) found.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(found, []);
});

test("grids of widgets have equal rows: every widget grid sets grid-auto-rows: 1fr", () => {
  const grids = [["pages/area-page.js", ".room .squares"], ["pages/area-page.js", ".room .members"],
    ["pages/areas-page.js", ".rooms .grid"], ["pages/home-page.js", ".home .quick"],
    ["pages/climate-page.js", ".climate .squares"], ["lib/detail-sheets.js", ".detail .tiles"],
    ["pages/power-page.js", ".power .squares"]];
  for (const [file, sel] of grids) {
    const css = readFileSync(join(here, file), "utf8");
    const rule = css.match(new RegExp(`${sel.replace(/\./g, "\\.")} \\{([^}]*)\\}`))?.[1] ?? "";
    assert.match(rule, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, `${file} ${sel}`);
    assert.match(rule, /grid-auto-rows: 1fr/, `${file} ${sel}`);
  }
});

test("a plant's readings are equal cells: three columns, equal rows", () => {
  const css = readFileSync(join(here, "pages/plants-page.js"), "utf8");
  const rule = css.match(/\.plants \.grid \{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(rule, /grid-auto-rows: 1fr/);
});
