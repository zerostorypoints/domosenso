import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import "./pocket-app.js";
import { pages } from "./pages/index.js";

const config = (lang = "en") => ({
  type: "custom:pocket-app",
  lang,
  rooms: [{ id: "kitchen", name: "Kitchen" }],
  thresholds: { rooms: {}, air: {} },
});
const hassOf = (extra = {}) => ({ locale: { language: "en" }, states: {}, connected: true, themes: { darkMode: false }, ...extra });

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

async function goTo(hash) {
  window.location.hash = hash;
  await tick();
}

function mount({ lang = "en", hass = hassOf() } = {}) {
  const card = document.createElement("pocket-app");
  card.setConfig(config(lang));
  document.body.appendChild(card);
  card.hass = hass;
  return card;
}

const $ = (card, sel) => card.shadowRoot.querySelector(sel);
const $$ = (card, sel) => [...card.shadowRoot.querySelectorAll(sel)];
const labels = (card) => $$(card, "nav .tab .label").map((el) => el.textContent);
const active = (card) => $$(card, "nav .tab").filter((el) => el.classList.contains("active")).map((el) => el.dataset.page);

beforeEach(async () => {
  document.body.innerHTML = "";
  await goTo("#/");
});

test("the bar has four translated labels", () => {
  assert.deepEqual(labels(mount({ lang: "en" })), ["Home", "Rooms", "Media", "Settings"]);
  assert.deepEqual(labels(mount({ lang: "pl" })), ["Dom", "Pomieszczenia", "Media", "Ustawienia"]);
  assert.deepEqual(labels(mount({ lang: "de" })), ["Zuhause", "Räume", "Medien", "Einstellungen"]);
});

test("the config's language wins over Home Assistant's", () => {
  const card = mount({ lang: "pl", hass: hassOf({ locale: { language: "en" } }) });
  assert.equal(labels(card)[0], "Dom");
});

test("each tab is a button of at least 44 px, the bar 64 px over the safe area", () => {
  const card = mount();
  const tabs = $$(card, "nav .tab");
  assert.equal(tabs.length, 4);
  for (const tab of tabs) assert.equal(tab.tagName, "BUTTON");
  const css = $(card, "style").textContent;
  assert.match(css, /--bar:\s*64px/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /min-width:\s*44px/);
});

test("the active item follows location.hash", async () => {
  const card = mount();
  assert.deepEqual(active(card), ["home"]);
  await goTo("#/settings");
  assert.deepEqual(active(card), ["settings"]);
  await goTo("#/room/kitchen");
  assert.deepEqual(active(card), ["rooms"]);
  assert.equal($(card, "nav .tab.active").getAttribute("aria-current"), "page");
});

test("a card opened on a route shows that route", async () => {
  await goTo("#/media");
  assert.deepEqual(active(mount()), ["media"]);
});

test("navigate updates the hash and the page without re-creating the shell", async () => {
  const card = mount();
  const nav = $(card, "nav");
  const page = $(card, "main").firstElementChild;
  card._ctx().navigate("#/rooms");
  assert.equal(window.location.hash, "#/rooms");
  assert.deepEqual(active(card), ["rooms"]);
  assert.equal($(card, "nav"), nav);
  assert.notEqual($(card, "main").firstElementChild, page);
  await tick();
  assert.deepEqual(active(card), ["rooms"]);
});

test("a tap on a tab navigates", () => {
  const card = mount();
  $$(card, "nav .tab")[3].click();
  assert.equal(window.location.hash, "#/settings");
  assert.deepEqual(active(card), ["settings"]);
});

test("back (hashchange) returns to the page before", async () => {
  const card = mount();
  card._ctx().navigate("#/rooms");
  await tick();
  await goTo("#/");
  assert.deepEqual(active(card), ["home"]);
});

test("a hass update updates the page, it does not re-render it", () => {
  const card = mount();
  const page = $(card, "main").firstElementChild;
  card.hass = hassOf({ states: { "light.x": { state: "on", attributes: {} } } });
  assert.equal($(card, "main").firstElementChild, page);
});

test("the page gets the contract's ctx", async () => {
  const card = mount({ lang: "pl" });
  await goTo("#/room/kitchen");
  const ctx = card._ctx();
  assert.equal(ctx.lang, "pl");
  assert.equal(ctx.routeId, "kitchen");
  assert.equal(ctx.offline, false);
  assert.equal(ctx.config.rooms[0].id, "kitchen");
  assert.equal(typeof ctx.hass, "object");
  assert.equal(ctx.t("card.pocket.nav.home"), "Dom");
  assert.equal(typeof ctx.navigate, "function");
  await goTo("#/rooms");
  assert.equal(card._ctx().routeId, undefined);
});

test("every page is a placeholder module following the contract", () => {
  assert.deepEqual(Object.keys(pages).sort(), ["home", "media", "room", "rooms", "settings"]);
  for (const [id, page] of Object.entries(pages)) {
    assert.equal(typeof page.render, "function", id);
    assert.equal(typeof page.update, "function", id);
  }
  const card = mount();
  assert.match($(card, "main").textContent, /Coming next/);
});

test("offline: a banner and ctx.offline; back online it goes", () => {
  const card = mount();
  assert.equal($(card, ".offline").hidden, true);
  card.hass = hassOf({ connected: false });
  assert.equal($(card, ".offline").hidden, false);
  assert.match($(card, ".offline").textContent, /\S/);
  assert.equal(card._ctx().offline, true);
  card.hass = hassOf();
  assert.equal($(card, ".offline").hidden, true);
  assert.equal(card._ctx().offline, false);
});

test("light tokens by default, dark with hass.themes.darkMode", () => {
  const card = mount();
  const app = $(card, ".app");
  assert.equal(app.style.getPropertyValue("--bg"), "#f6f7f9");
  assert.equal(app.style.getPropertyValue("--acc"), "#2f7cf6");
  card.hass = hassOf({ themes: { darkMode: true } });
  assert.equal(app.style.getPropertyValue("--bg"), "#0f1115");
  assert.equal(app.style.getPropertyValue("--acc"), "#5b9bff");
  assert.equal(app.dataset.theme, "dark");
});

test("a removed card stops listening to hashchange", async () => {
  const card = mount();
  card.remove();
  await goTo("#/settings");
  assert.deepEqual(active(card), ["home"]);
});
