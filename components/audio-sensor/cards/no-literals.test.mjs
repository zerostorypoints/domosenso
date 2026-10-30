// Card sources carry no human-language text: every visible word lives in translations/*.json.
// The same check as Ramka's cards/no-literals.test.mjs, over this component's cards: cards/*.js and
// cards/lib/**/*.js (the flavours sit one level down); tests and testing/ are excluded, they hold
// localized expected text by design. It checks that
//   (a) no Polish or German letter appears in them, and
//   (b) every translation key the code uses exists in translations/en.json.
// The scan is a plain regex over the source text, comments included: a string-aware parser would
// have to tell regex literals from strings, and a card header comment is English anyway.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const en = JSON.parse(readFileSync(join(root, "../translations/en.json"), "utf8"));

const LOCAL_LETTERS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻäöüßÄÖÜ]/;

const sources = [
  ...readdirSync(root).filter((f) => f.endsWith(".js")),
  ...readdirSync(join(root, "lib"), { recursive: true }).filter((f) => f.endsWith(".js") && !f.includes(".test."))
    .map((f) => `lib/${f}`),
];

const resolve = (key) => key.split(".").reduce((node, part) =>
  node !== null && typeof node === "object" && part in node ? node[part] : undefined, en);

function scan(text) {
  const found = [];
  text.split("\n").forEach((line, i) => {
    const hit = line.match(LOCAL_LETTERS);
    if (hit) found.push(`line ${i + 1}: "${hit[0]}" in: ${line.trim().slice(0, 80)}`);
  });
  const keys = new Set();
  for (const m of text.matchAll(/(?<![\w.$])t\(\s*[\w.$]+\s*,\s*(["'`])((?:(?!\1).)*)\1/g)) keys.add(m[2]);
  for (const m of text.matchAll(/(["'`])(card\.[\w.${}]*)\1/g)) keys.add(m[2]);
  for (const key of keys) {
    const cut = key.indexOf("${");
    if (cut === -1) {
      if (typeof resolve(key) !== "string") found.push(`key not in en.json: ${key}`);
    } else {
      const prefix = key.slice(0, cut).replace(/\.$/, "");
      const node = prefix ? resolve(prefix) : undefined;
      if (node === null || typeof node !== "object") found.push(`key prefix not a group in en.json: ${key}`);
    }
  }
  return found;
}

test("the scanner flags a planted Polish or German literal and a missing key", () => {
  assert.equal(scan('const label = "Zamknięte";').length, 1);
  assert.equal(scan("const label = 'Geöffnet';").length, 1);
  assert.equal(scan("const label = `Straße ${x}`;").length, 1);
  assert.equal(scan('const x = t(this._hass, "card.nope.missing");').length, 1);
  assert.equal(scan("const x = t(hass, `card.nope.${state}`);").length, 1);
  assert.equal(scan('{ label: "card.nope.gauge" }').length, 1);
});

test("the scanner accepts plain text and keys that exist", () => {
  assert.deepEqual(scan('const x = t(this._hass, "card.ambient_wave.name"); // Name'), []);
  assert.deepEqual(scan("const x = t(hass, `card.ambient_wave.error.${key}`);"), []);
  assert.deepEqual(scan("const x = t(hass, key);"), []);
});

test("card sources are found", () => {
  assert.ok(sources.includes("ambient-wave-card.js"), sources.join(", "));
  assert.ok(sources.includes("lib/i18n.js"));
  assert.ok(sources.includes("lib/flavours/still.js"));
  assert.ok(!sources.some((f) => f.includes(".test.")));
});

for (const file of sources) {
  test(`${file}: no Polish or German text, every translation key exists`, () => {
    assert.deepEqual(scan(readFileSync(join(root, file), "utf8")), []);
  });
}
