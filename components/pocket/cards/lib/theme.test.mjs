import { test } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import { BASE, MODES, TOKENS, applyTheme, themeOf, tokensOf } from "./theme.js";

const light = { themes: { darkMode: false } };
const dark = { themes: { darkMode: true } };

test("the modes: System follows the phone, Light and Dark force their variant", () => {
  assert.deepEqual(MODES, ["system", "light", "dark"]);
  assert.equal(themeOf("system", false), "light");
  assert.equal(themeOf("system", true), "dark");
  assert.equal(themeOf("light", true), "light");
  assert.equal(themeOf("dark", false), "dark");
  assert.equal(themeOf(undefined, true), "dark");
});

test("both variants have the same tokens, the comfort sides among them", () => {
  assert.deepEqual(Object.keys(TOKENS.light).sort(), Object.keys(TOKENS.dark).sort());
  for (const name of ["--cold", "--warm", "--ok", "--warn", "--bad", "--lamp", ...Object.keys(BASE)]) {
    assert.ok(TOKENS.light[name] && TOKENS.dark[name], name);
  }
});

test("the base tokens are HA's variables, with the pocket's value behind, when HA shows the same variant", () => {
  const tokens = tokensOf("dark", dark);
  assert.equal(tokens["--bg"], "var(--primary-background-color, #0f1115)");
  assert.equal(tokens["--card"], "var(--card-background-color, #191c22)");
  assert.equal(tokens["--fg"], "var(--primary-text-color, #eef0f3)");
  assert.equal(tokens["--mut"], "var(--secondary-text-color, #9aa1ab)");
  assert.equal(tokens["--line"], "var(--divider-color, #262a31)");
  assert.equal(tokens["--acc"], "var(--primary-color, #5b9bff)");
  assert.equal(tokens["--chip"], "var(--secondary-background-color, #22262d)");
  assert.equal(tokensOf("light", light)["--chip"], "var(--secondary-background-color, #eef1f5)");
  assert.equal(tokensOf("light", dark)["--chip"], "#eef1f5");
  // Levels and the lamp stay the pocket's own.
  assert.equal(tokens["--ok"], TOKENS.dark["--ok"]);
  assert.equal(tokens["--lamp"], TOKENS.dark["--lamp"]);
  assert.equal(tokensOf("light", light)["--bg"], "var(--primary-background-color, #f6f7f9)");
  assert.equal(tokensOf("light", undefined)["--bg"], "var(--primary-background-color, #f6f7f9)");
});

test("a variant forced against HA's theme takes the pocket's own values", () => {
  assert.deepEqual(tokensOf("light", dark), TOKENS.light);
  assert.deepEqual(tokensOf("dark", light), TOKENS.dark);
});

test("applyTheme sets the tokens and data-theme, and rewrites them only on a change", () => {
  const el = document.createElement("div");
  applyTheme(el, light, { mode: "system", systemDark: false });
  assert.equal(el.dataset.theme, "light");
  assert.equal(el.style.getPropertyValue("--acc"), "var(--primary-color, #2f7cf6)");
  el.style.setProperty("--acc", "x");
  applyTheme(el, light, { mode: "light" });
  assert.equal(el.style.getPropertyValue("--acc"), "x");
  applyTheme(el, light, { mode: "dark" });
  assert.equal(el.dataset.theme, "dark");
  assert.equal(el.style.getPropertyValue("--acc"), "#5b9bff");
  applyTheme(el, dark, { mode: "dark" });
  assert.equal(el.style.getPropertyValue("--acc"), "var(--primary-color, #5b9bff)");
});
