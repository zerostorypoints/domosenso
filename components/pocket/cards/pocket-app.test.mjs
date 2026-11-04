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

test("every page follows the contract; Home is built, a page not built yet says so", async () => {
  assert.deepEqual(Object.keys(pages).sort(), ["home", "media", "room", "rooms", "settings"]);
  for (const [id, page] of Object.entries(pages)) {
    assert.equal(typeof page.render, "function", id);
    assert.equal(typeof page.update, "function", id);
  }
  const card = mount();
  assert.ok($(card, "main .home"));
  await goTo("#/media");
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

test("the bar is sticky at the bottom of the card, after the page, not fixed over it", () => {
  const card = mount();
  const nav = $(card, "nav");
  const style = getComputedStyle(nav);
  assert.equal(style.position, "sticky");
  assert.equal(style.bottom, "0px");
  // In the flow after <main>, so it takes its own height and covers no page content.
  assert.equal(nav.parentElement, $(card, ".app"));
  assert.equal(nav.previousElementSibling, $(card, "main"));
  const css = $(card, "style").textContent;
  assert.doesNotMatch(css, /position:\s*fixed/);
  assert.match(css, /nav \{[^}]*height:\s*calc\(var\(--bar\) \+ var\(--safe\)\)/);
  assert.match(css, /nav \{[^}]*padding-bottom:\s*var\(--safe\)/);
});

test("an unknown room goes to Rooms, replacing the entry; pages never see its id", async () => {
  const card = mount();
  const before = window.history.length;
  await goTo("#/room/nowhere");
  assert.equal(window.location.hash, "#/rooms");
  assert.deepEqual(active(card), ["rooms"]);
  assert.equal(card._ctx().routeId, undefined);
  card._ctx().navigate("#/room/nowhere");
  assert.equal(window.location.hash, "#/rooms");
  assert.equal(card._ctx().routeId, undefined);
  assert.ok(window.history.length <= before + 1, "at most the one entry of the hash set by the test");
  card._ctx().navigate("#/room/kitchen");
  assert.equal(card._ctx().routeId, "kitchen");
});

test("a card opened on an unknown room shows Rooms", async () => {
  await goTo("#/room/nowhere");
  const card = mount();
  assert.equal(window.location.hash, "#/rooms");
  assert.deepEqual(active(card), ["rooms"]);
});

test("the bar's labels follow a change of language without a change of route", () => {
  const card = mount({ lang: null, hass: hassOf({ locale: { language: "en" } }) });
  assert.equal(labels(card)[1], "Rooms");
  card.hass = hassOf({ locale: { language: "pl" } });
  assert.equal(labels(card)[1], "Pomieszczenia");
  card.setConfig({ ...config("de") });
  assert.equal(labels(card)[1], "Räume");
});

test("the offline banner's text colour is a token of both themes", () => {
  const card = mount({ hass: hassOf({ connected: false }) });
  assert.match($(card, "style").textContent, /\.offline \{[^}]*color:\s*var\(--on-warn\)/);
  assert.equal($(card, ".app").style.getPropertyValue("--on-warn"), "#1c1f24");
  card.hass = hassOf({ connected: false, themes: { darkMode: true } });
  assert.equal($(card, ".app").style.getPropertyValue("--on-warn"), "#0f1115");
});

test("a failed action shows a translated toast above the bar for a short time; the tile stays as it was", async () => {
  const card = document.createElement("pocket-app");
  card.setConfig({ ...config("pl"), rooms: [{ id: "kitchen", name: "Kitchen", lights: "light.k" }] });
  document.body.appendChild(card);
  card.toastMs = 30;
  card.hass = hassOf({ states: { "light.k": { state: "off", attributes: {} } },
    callService: () => Promise.reject(new Error("no")) });
  const toast = $(card, ".toast");
  assert.ok(!toast.classList.contains("show"));
  assert.equal(toast.getAttribute("role"), "alert");
  const tile = $(card, "pocket-light-tile");
  tile.click();
  await tick();
  assert.ok(toast.classList.contains("show"));
  assert.equal(toast.textContent, "Światło nie odpowiedziało. Spróbuj ponownie.");
  assert.ok(!tile.shadowRoot.querySelector(".tile").classList.contains("on"));
  const css = $(card, "style").textContent;
  assert.match(css, /\.toast \{[^}]*font-size: 16px/);
  assert.equal(toast.parentElement, $(card, "nav"), "above the bar, on it");
  assert.match(css, /\.toast \{[^}]*bottom: calc\(100% \+ 8px\)/);
  assert.match(css, /\.toast:not\(\.show\) \{[^}]*opacity: 0/);
  assert.doesNotMatch(css, /\.toast\[hidden\]/, "never display:none, so screen readers announce it");
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!toast.classList.contains("show"));
});

test("the shell is at least a viewport tall under the header, with a vh fallback; the bar has a plain background first", () => {
  const css = $(mount(), "style").textContent;
  assert.match(css, /min-height: 100vh;[^}]*min-height: calc\(100dvh - var\(--header-height, 56px\) - env\(safe-area-inset-top, 0px\)\)/);
  assert.match(css, /background: var\(--card\);\s*background: color-mix/);
});

test("navigate with replace swaps the history entry: Back returns past it", async () => {
  const card = mount();
  card._ctx().navigate("#/rooms");
  card._ctx().navigate("#/room/kitchen", { replace: true });
  assert.equal(window.location.hash, "#/room/kitchen");
  assert.equal(card._ctx().routeId, "kitchen");
  assert.deepEqual(active(card), ["rooms"]);
  const length = window.history.length;
  card._ctx().navigate("#/rooms", { replace: true });
  assert.equal(window.history.length, length, "no entry added");
});
