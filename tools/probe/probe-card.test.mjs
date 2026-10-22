import { test } from "node:test";
import assert from "node:assert/strict";
import "../../components/ramka/cards/testing/dom-env.mjs";
import { measure, loadStrings, NAME } from "./probe-card.js";

const TABLET_AGENT = "Mozilla/5.0 (Linux; Android 16; 9469X Build/X; wv) AppleWebKit/537.36 (KHTML, like Gecko) "
  + "Version/4.0 Chrome/141.0.0.0 Safari/537.36 Home Assistant/2026.8.4";

function fakeWindow(overrides = {}) {
  return {
    innerWidth: 1100, innerHeight: 720, devicePixelRatio: 2,
    screen: { width: 1100, height: 720, orientation: { type: "landscape-primary" } },
    navigator: { userAgent: TABLET_AGENT },
    CSS: { supports: (prop, value) => prop === "height" && value === "100dvh" },
    ...overrides,
  };
}

test("measures the tested tablet", () => {
  assert.deepEqual(measure(fakeWindow(), { jsonModules: true, admin: false }), {
    viewport: [1100, 720], dpr: 2, screen: [1100, 720], orientation: "landscape",
    chromium: 141, webview: true, dvh: true, json_modules: true, admin: false,
  });
});

test("an old desktop browser without dvh, orientation or Chromium", () => {
  const m = measure(fakeWindow({
    innerWidth: 800, innerHeight: 1280, screen: { width: 800, height: 1280 },
    navigator: { userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:100.0) Gecko/20100101 Firefox/100.0" },
    CSS: { supports: () => false },
  }), { jsonModules: false, admin: true });
  assert.equal(m.orientation, "portrait");
  assert.equal(m.chromium, null);
  assert.equal(m.webview, false);
  assert.equal(m.dvh, false);
  assert.equal(m.json_modules, false);
  assert.equal(m.admin, true);
});

test("JSON modules: a failed import reports false instead of breaking the card", async () => {
  assert.deepEqual(await loadStrings(async () => { throw new SyntaxError("Unexpected token"); }),
    { strings: null, jsonModules: false });
  const ok = await loadStrings(async () => ({ default: { en: { title: "x" } } }));
  assert.equal(ok.jsonModules, true);
});

test("the card reports through logbook.log and shows the numbers in the user's language", async () => {
  const calls = [];
  const card = document.createElement("domosenso-probe-card");
  card.setConfig({});
  card.hass = { locale: { language: "pl" }, user: { is_admin: false },
                callService: async (...args) => { calls.push(args); } };
  for (let i = 0; i < 50 && !card.shadowRoot; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls.length, 1);
  const [domain, service, data] = calls[0];
  assert.equal(`${domain}.${service}`, "logbook.log");
  assert.equal(data.name, NAME);
  const report = JSON.parse(data.message);
  assert.equal(report.admin, false);
  assert.ok("viewport" in report && "json_modules" in report);
  assert.equal(card.shadowRoot.querySelector("h1").textContent, "Pomiar Domosenso");
  // A second hass update does not report again.
  card.hass = { ...card.hass };
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.length, 1);
});

test("a failed report is shown, not swallowed", async () => {
  const card = document.createElement("domosenso-probe-card");
  card.hass = { locale: { language: "en" }, user: { is_admin: true },
                callService: async () => { throw new Error("Unauthorized"); } };
  for (let i = 0; i < 50 && !card.shadowRoot; i++) await new Promise((r) => setTimeout(r, 10));
  assert.match(card.shadowRoot.querySelector(".status").textContent, /report failed: Unauthorized/);
});
